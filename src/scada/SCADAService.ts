/**
 * SCADA Service for MillOS
 *
 * Main orchestration layer that coordinates:
 * - Protocol adapters (simulation, REST, MQTT, etc.)
 * - Alarm management
 * - History storage
 * - Tag subscriptions
 *
 * This is the primary API for UI components to interact with SCADA data.
 */

import {
  IProtocolAdapter,
  TagDefinition,
  TagValue,
  TagHistoryPoint,
  Alarm,
  AlarmSuppression,
  SCADAConfig,
  SCADAMode,
  FaultInjection,
  ConnectionStatus,
  AdapterStatistics,
  ConnectionConfig,
} from './types';
import { MILL_TAGS, getTagsByMachine, getTagsByGroup } from './tagDatabase';
import { SimulationAdapter } from './adapters/SimulationAdapter';
import { RESTAdapter } from './adapters/RESTAdapter';
import { MQTTAdapter } from './adapters/MQTTAdapter';
import { WebSocketAdapter } from './adapters/WebSocketAdapter';
import { AlarmManager } from './AlarmManager';
import { HistoryStore } from './HistoryStore';

/** Callback for real-time value updates */
type ValueUpdateCallback = (values: TagValue[]) => void;

/** Callback for alarm updates */
type AlarmUpdateCallback = (alarms: Alarm[]) => void;

/** Service state */
interface ServiceState {
  mode: SCADAMode;
  connected: boolean;
  lastUpdate: number;
  tagCount: number;
  activeAlarmCount: number;
}

export class SCADAService {
  private adapter: IProtocolAdapter | null = null;
  private alarmManager: AlarmManager;
  private historyStore: HistoryStore;
  private config: SCADAConfig;
  private tagRegistry: Map<string, TagDefinition>;

  // In-memory cache of current values
  private currentValues: Map<string, TagValue> = new Map();

  // Subscribers
  private valueListeners: Set<ValueUpdateCallback> = new Set();
  private alarmListeners: Set<AlarmUpdateCallback> = new Set();

  // Sample rate throttling for history
  private lastHistorySample = 0;
  private historySampleInterval: number;

  // Unsubscribe function from adapter
  private adapterUnsubscribe: (() => void) | null = null;
  private alarmUnsubscribe: (() => void) | null = null;

  constructor(config?: Partial<SCADAConfig>) {
    this.config = {
      mode: config?.mode ?? 'simulation',
      connection: config?.connection ?? lastConnectionConfig ?? { type: 'simulation' },
      historyRetention: config?.historyRetention ?? 24 * 60 * 60 * 1000,
      historySampleRate: config?.historySampleRate ?? 1000,
      alarmsEnabled: config?.alarmsEnabled ?? true,
    };
    lastConnectionConfig = this.config.connection;

    this.historySampleInterval = this.config.historySampleRate!;
    this.tagRegistry = new Map(MILL_TAGS.map((t) => [t.id, t]));
    this.alarmManager = new AlarmManager(MILL_TAGS);
    this.historyStore = new HistoryStore({
      retentionMs: this.config.historyRetention,
    });
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Start the SCADA service
   */
  async start(): Promise<void> {
    // Initialize history store
    await this.historyStore.init();

    // Create and connect adapter based on mode
    await this.createAdapter();

    if (this.adapter) {
      await this.adapter.connect();

      // Guard against double subscription - clean up existing subscriptions first
      if (this.adapterUnsubscribe) {
        this.adapterUnsubscribe();
        this.adapterUnsubscribe = null;
      }
      if (this.alarmUnsubscribe) {
        this.alarmUnsubscribe();
        this.alarmUnsubscribe = null;
      }

      // Subscribe to all tags
      const allTagIds = Array.from(this.tagRegistry.keys());
      this.adapterUnsubscribe = this.adapter.subscribe(allTagIds, this.handleTagUpdates.bind(this));

      // Backfill the cache for adapters that do not replay current values on subscribe.
      if (this.currentValues.size === 0) {
        const initialValues = await this.adapter.readAllTags();
        if (initialValues.length > 0) {
          this.handleTagUpdates(initialValues);
        }
      }

      // Subscribe to alarm updates
      if (this.config.alarmsEnabled) {
        this.alarmUnsubscribe = this.alarmManager.subscribe(this.handleAlarmUpdates.bind(this));
      }
    }
  }

  /**
   * Stop the SCADA service
   */
  async stop(): Promise<void> {
    if (this.adapterUnsubscribe) {
      this.adapterUnsubscribe();
      this.adapterUnsubscribe = null;
    }

    if (this.alarmUnsubscribe) {
      this.alarmUnsubscribe();
      this.alarmUnsubscribe = null;
    }

    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }

    // Reset alarm state so future starts don't reuse stale alarms/suppressions
    this.alarmManager.reset();

    await this.historyStore.close();
    this.currentValues.clear();
  }

  /**
   * Change operating mode (requires restart)
   */
  async setMode(mode: SCADAMode): Promise<void> {
    if (mode === this.config.mode) return;

    await this.stop();
    this.config.mode = mode;
    await this.start();
  }

  private async createAdapter(): Promise<void> {
    const connectionType = this.config.connection?.type ?? 'simulation';

    switch (this.config.mode) {
      case 'simulation':
        this.adapter = new SimulationAdapter(MILL_TAGS);
        break;

      case 'live':
        // Create adapter based on connection type
        this.adapter = this.createAdapterForConnection(this.config.connection);
        break;

      case 'hybrid':
        // Hybrid mode: use live adapter if configured, fall back to simulation
        if (connectionType !== 'simulation') {
          this.adapter = this.createAdapterForConnection(this.config.connection);
        } else {
          this.adapter = new SimulationAdapter(MILL_TAGS);
        }
        break;

      case 'disconnected':
        this.adapter = null;
        break;
    }
  }

  /**
   * Create an adapter based on connection configuration
   */
  private createAdapterForConnection(config: ConnectionConfig): IProtocolAdapter {
    switch (config.type) {
      case 'rest':
        if (!config.baseUrl) {
          return new SimulationAdapter(MILL_TAGS);
        }
        return new RESTAdapter(MILL_TAGS, config);

      case 'mqtt':
        if (!config.brokerUrl) {
          return new SimulationAdapter(MILL_TAGS);
        }
        return new MQTTAdapter(MILL_TAGS, config);

      case 'websocket':
        if (!config.proxyUrl && !config.baseUrl) {
          return new SimulationAdapter(MILL_TAGS);
        }
        return new WebSocketAdapter(MILL_TAGS, config);

      case 'opcua':
      case 'modbus': {
        // OPC-UA and Modbus require the backend proxy
        // Use REST adapter to connect to the proxy
        if (!config.proxyUrl && !config.baseUrl) {
          return new SimulationAdapter(MILL_TAGS);
        }
        const proxyConfig: ConnectionConfig = {
          ...config,
          type: 'rest',
          baseUrl: config.proxyUrl ?? config.baseUrl,
        };
        return new RESTAdapter(MILL_TAGS, proxyConfig);
      }

      case 'simulation':
      default:
        return new SimulationAdapter(MILL_TAGS);
    }
  }

  /**
   * Get current connection configuration
   */
  getConnectionConfig(): ConnectionConfig {
    return this.config.connection;
  }

  /**
   * Update connection configuration (requires restart)
   */
  async setConnectionConfig(config: ConnectionConfig): Promise<void> {
    const wasRunning = this.adapter?.isConnected() ?? false;

    if (wasRunning) {
      await this.stop();
    }

    this.config.connection = config;
    lastConnectionConfig = config;

    // Update mode based on connection type
    if (config.type === 'simulation') {
      this.config.mode = 'simulation';
    } else if (this.config.mode === 'simulation') {
      this.config.mode = 'live';
    }

    if (wasRunning) {
      await this.start();
    }
  }

  // =========================================================================
  // Real-time Updates
  // =========================================================================

  private handleTagUpdates(values: TagValue[]): void {
    const now = Date.now();

    values.forEach((value) => {
      // Update cache
      this.currentValues.set(value.tagId, value);

      // Evaluate alarms
      if (this.config.alarmsEnabled) {
        this.alarmManager.evaluate(value);
      }
    });

    // Sample to history at configured rate
    if (now - this.lastHistorySample >= this.historySampleInterval) {
      this.historyStore.writeTagValues(values);
      this.lastHistorySample = now;
    }

    // Notify value listeners
    this.valueListeners.forEach((cb) => {
      try {
        cb(values);
      } catch {
        // Listener error - silently ignored in production
      }
    });
  }

  private handleAlarmUpdates(alarms: Alarm[]): void {
    // Archive closed alarms to history
    alarms.forEach((alarm) => {
      if (alarm.state === 'NORMAL' || alarm.clearedAt) {
        this.historyStore.writeAlarm(alarm);
      }
    });

    // Notify alarm listeners
    this.alarmListeners.forEach((cb) => {
      try {
        cb(alarms);
      } catch {
        // Listener error - silently ignored in production
      }
    });
  }

  // =========================================================================
  // Tag API
  // =========================================================================

  /**
   * Get current value for a tag
   */
  getValue(tagId: string): TagValue | undefined {
    return this.currentValues.get(tagId);
  }

  /**
   * Get current values for multiple tags
   */
  getValues(tagIds: string[]): TagValue[] {
    return tagIds
      .map((id) => this.currentValues.get(id))
      .filter((v): v is TagValue => v !== undefined);
  }

  /**
   * Get all current values
   */
  getAllValues(): TagValue[] {
    return Array.from(this.currentValues.values());
  }

  /**
   * Get tag definition
   */
  getTagDefinition(tagId: string): TagDefinition | undefined {
    return this.tagRegistry.get(tagId);
  }

  /**
   * Get tags for a machine
   */
  getTagsForMachine(machineId: string): TagDefinition[] {
    return getTagsByMachine(machineId);
  }

  /**
   * Get tags by functional group
   */
  getTagsForGroup(group: TagDefinition['group']): TagDefinition[] {
    return getTagsByGroup(group);
  }

  /**
   * Get all tag definitions
   */
  getAllTags(): TagDefinition[] {
    return Array.from(this.tagRegistry.values());
  }

  /**
   * Write a setpoint value
   */
  async writeSetpoint(tagId: string, value: number): Promise<boolean> {
    const tag = this.tagRegistry.get(tagId);
    if (!tag) {
      return false;
    }

    if (tag.accessMode === 'READ') {
      return false;
    }

    if (!this.adapter) {
      return false;
    }

    const success = await this.adapter.writeTag(tagId, value);
    if (!success) {
      return false;
    }

    try {
      const updatedValue = await this.adapter.readTag(tagId);
      this.handleTagUpdates([updatedValue]);
    } catch {
      this.currentValues.set(tagId, {
        tagId,
        value,
        quality: 'GOOD',
        timestamp: Date.now(),
      });
    }

    return true;
  }

  // =========================================================================
  // History API
  // =========================================================================

  /**
   * Get historical data for a tag
   */
  async getHistory(
    tagId: string,
    startTime: number,
    endTime: number = Date.now()
  ): Promise<TagHistoryPoint[]> {
    return this.historyStore.getHistory(tagId, startTime, endTime);
  }

  /**
   * Get historical data for multiple tags
   */
  async getMultipleHistory(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now()
  ): Promise<Record<string, TagHistoryPoint[]>> {
    return this.historyStore.getMultipleTagHistory(tagIds, startTime, endTime);
  }

  /**
   * Export history to CSV
   */
  async exportToCSV(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now()
  ): Promise<string> {
    return this.historyStore.exportToCSV(tagIds, startTime, endTime);
  }

  /**
   * Export history to JSON
   */
  async exportToJSON(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now(),
    includeAlarms = false
  ): Promise<object> {
    return this.historyStore.exportToJSON(tagIds, startTime, endTime, includeAlarms);
  }

  /**
   * Download export file
   */
  downloadExport(data: string | object, filename: string): void {
    this.historyStore.downloadExport(data, filename);
  }

  // =========================================================================
  // Alarm API
  // =========================================================================

  /**
   * Get all active alarms
   */
  getActiveAlarms(): Alarm[] {
    return this.alarmManager.getActiveAlarms();
  }

  /**
   * Get alarms for a specific machine
   */
  getAlarmsForMachine(machineId: string): Alarm[] {
    return this.alarmManager.getAlarmsForMachine(machineId);
  }

  /**
   * Acknowledge an alarm
   */
  acknowledgeAlarm(alarmId: string, operator: string): boolean {
    return this.alarmManager.acknowledge(alarmId, operator);
  }

  /**
   * Acknowledge all alarms
   */
  acknowledgeAllAlarms(operator: string): number {
    return this.alarmManager.acknowledgeAll(operator);
  }

  /**
   * Get alarm summary
   */
  getAlarmSummary(): {
    total: number;
    unacknowledged: number;
    critical: number;
    high: number;
    suppressed: number;
  } {
    return this.alarmManager.getSummary();
  }

  /**
   * Suppress alarms for a tag
   */
  suppressAlarms(tagId: string, operator: string, reason: string, durationMs?: number): void {
    this.alarmManager.suppress(tagId, operator, reason, durationMs);
  }

  /**
   * Remove alarm suppression
   */
  unsuppressAlarms(tagId: string): void {
    this.alarmManager.unsuppress(tagId);
  }

  /**
   * Get suppressed alarm entries
   */
  getSuppressedAlarms(): AlarmSuppression[] {
    return this.alarmManager.getSuppressedTags();
  }

  /**
   * Get alarm history
   */
  async getAlarmHistory(
    startTime: number,
    endTime: number = Date.now(),
    limit = 100
  ): Promise<Alarm[]> {
    const history = await this.historyStore.getAlarmHistory(startTime, endTime, limit);
    return history.map((record) => {
      const tag = this.tagRegistry.get(record.tagId);

      return {
        id: record.alarmId ?? `${record.tagId}-${record.type}`,
        tagId: record.tagId,
        tagName: tag?.name ?? record.tagId,
        type: record.type,
        state: record.state ?? 'NORMAL',
        priority: record.priority,
        value: record.value,
        threshold: record.threshold,
        timestamp: record.raisedAt,
        acknowledgedAt: record.acknowledgedAt,
        acknowledgedBy: record.acknowledgedBy,
        clearedAt: record.clearedAt,
        machineId: tag?.machineId,
      };
    });
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  /**
   * Subscribe to real-time value updates
   */
  subscribeToValues(callback: ValueUpdateCallback): () => void {
    this.valueListeners.add(callback);

    // Immediately send current values
    const currentValues = this.getAllValues();
    if (currentValues.length > 0) {
      callback(currentValues);
    }

    return () => {
      this.valueListeners.delete(callback);
    };
  }

  /**
   * Subscribe to alarm updates
   */
  subscribeToAlarms(callback: AlarmUpdateCallback): () => void {
    this.alarmListeners.add(callback);

    // Immediately send current alarms
    callback(this.getActiveAlarms());

    return () => {
      this.alarmListeners.delete(callback);
    };
  }

  // =========================================================================
  // Simulation Controls
  // =========================================================================

  /**
   * Update machine states in simulation adapter
   */
  updateMachineStates(
    machines: Array<{
      id: string;
      status: 'running' | 'idle' | 'warning' | 'critical';
      metrics: { load: number; rpm: number };
    }>
  ): void {
    if (this.adapter instanceof SimulationAdapter) {
      this.adapter.updateMachineStates(machines);
    }
  }

  /**
   * Inject a fault for testing
   */
  injectFault(fault: FaultInjection): void {
    if (this.adapter instanceof SimulationAdapter) {
      this.adapter.injectFault(fault);
    }
  }

  /**
   * Clear a fault
   */
  clearFault(tagId: string): void {
    if (this.adapter instanceof SimulationAdapter) {
      this.adapter.clearFault(tagId);
    }
  }

  /**
   * Clear all faults
   */
  clearAllFaults(): void {
    if (this.adapter instanceof SimulationAdapter) {
      this.adapter.clearAllFaults();
    }
  }

  /**
   * Get active faults
   */
  getActiveFaults(): Array<{
    tagId: string;
    faultType: FaultInjection['faultType'];
    startTime: number;
    duration: number;
    severity: number;
  }> {
    if (this.adapter instanceof SimulationAdapter) {
      return this.adapter.getActiveFaults();
    }
    return [];
  }

  // =========================================================================
  // Status & Diagnostics
  // =========================================================================

  /**
   * Get service state
   */
  getState(): ServiceState {
    return {
      mode: this.config.mode,
      connected: this.adapter?.isConnected() ?? false,
      lastUpdate: Math.max(...Array.from(this.currentValues.values()).map((v) => v.timestamp), 0),
      tagCount: this.currentValues.size,
      activeAlarmCount: this.alarmManager.getActiveAlarms().length,
    };
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return (
      this.adapter?.getConnectionStatus() ?? {
        connected: false,
        reconnectAttempts: 0,
      }
    );
  }

  /**
   * Get adapter statistics
   */
  getStatistics(): AdapterStatistics {
    return (
      this.adapter?.getStatistics() ?? {
        readsPerSecond: 0,
        writesPerSecond: 0,
        avgReadLatency: 0,
        errorCount: 0,
        uptime: 0,
      }
    );
  }

  /**
   * Get history store statistics
   */
  async getHistoryStats(): Promise<{
    tagHistoryCount: number;
    alarmHistoryCount: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    return this.historyStore.getStats();
  }

  /**
   * Check if service has critical alarms
   */
  hasCriticalAlarms(): boolean {
    return this.alarmManager.hasCriticalAlarms();
  }
}

// =========================================================================
// Singleton Instance
// =========================================================================

let scadaServiceInstance: SCADAService | null = null;
let initializationPromise: Promise<SCADAService> | null = null;
let lastConnectionConfig: ConnectionConfig | undefined;

/**
 * Get the global SCADA service instance
 */
export function getSCADAService(): SCADAService {
  if (!scadaServiceInstance) {
    scadaServiceInstance = new SCADAService();
  }
  return scadaServiceInstance;
}

/**
 * Initialize and start the SCADA service
 * Returns existing instance if already initialized (true singleton)
 */
export async function initializeSCADA(config?: Partial<SCADAConfig>): Promise<SCADAService> {
  // If already initialized and running, return existing instance
  if (scadaServiceInstance) {
    const state = scadaServiceInstance.getState();
    if (state.connected) {
      return scadaServiceInstance;
    }
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start new initialization
  initializationPromise = (async () => {
    try {
      if (scadaServiceInstance) {
        await scadaServiceInstance.stop();
      }
      const mergedConfig: Partial<SCADAConfig> = {
        ...config,
        connection: config?.connection ?? lastConnectionConfig,
      };
      // Store in local variable to avoid race condition where shutdownSCADA
      // sets scadaServiceInstance = null while we're still initializing
      const service = new SCADAService(mergedConfig);
      scadaServiceInstance = service;
      await service.start();
      return service; // Return local variable, not module-level (may be nulled by shutdown)
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Shutdown the SCADA service
 */
export async function shutdownSCADA(): Promise<void> {
  if (scadaServiceInstance) {
    await scadaServiceInstance.stop();
    scadaServiceInstance = null;
  }
}
