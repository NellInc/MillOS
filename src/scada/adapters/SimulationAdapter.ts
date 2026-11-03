/**
 * Simulation Protocol Adapter for MillOS SCADA
 *
 * Generates realistic SCADA values using a physics-based simulation model.
 * Values are influenced by:
 * - Machine operational status (running/idle/warning/critical)
 * - Machine load percentage
 * - Inter-tag correlations (e.g., vibration correlates with speed)
 * - Time-based drift and noise
 * - Injected faults for testing
 */

import {
  IProtocolAdapter,
  TagDefinition,
  TagValue,
  Quality,
  ConnectionStatus,
  AdapterStatistics,
  FaultType,
  FaultInjection,
} from '../types';
import { deterministicVariance, idToSeed } from '../../systems/CentralTickSystem';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { plantSecondsForRealSeconds } from '../../simulation/pace';
import { safeJSONStorage } from '../../stores/storage';

/**
 * Setpoints written to the simulated plant, kept across a reload. Every shipped
 * write reaches writeTag through SCADAService.writeSetpoint with an operator or
 * agent actor; a live adapter's setpoints belong to the PLC and are not kept.
 * The millos- prefix puts it in Reset Simulation's sweep, and suspendPersistence
 * stops it like every other saved store. Working if a setpoint written before a
 * reload is the setpoint after it.
 */
export const SCADA_SETPOINT_STORAGE_KEY = 'millos-scada-setpoints';
const SCADA_SETPOINT_STORAGE_VERSION = 1;

function readStoredSetpoints(): Record<string, number> {
  try {
    const stored = safeJSONStorage.getItem(SCADA_SETPOINT_STORAGE_KEY);
    if (!stored || typeof (stored as { then?: unknown }).then === 'function') return {};
    const setpoints = (stored as { state?: { setpoints?: unknown } }).state?.setpoints;
    if (!setpoints || typeof setpoints !== 'object') return {};
    const result: Record<string, number> = {};
    for (const [tagId, value] of Object.entries(setpoints as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) result[tagId] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function storeSetpoint(tagId: string, value: number): void {
  try {
    const setpoints = { ...readStoredSetpoints(), [tagId]: value };
    void safeJSONStorage.setItem(SCADA_SETPOINT_STORAGE_KEY, {
      state: { setpoints },
      version: SCADA_SETPOINT_STORAGE_VERSION,
    });
  } catch {
    // Unsaved: the setpoint still holds for this session.
  }
}

/** PLANT seconds for a setpoint-following reading to close ~63% of the gap. */
const SETPOINT_TIME_CONSTANT_S = 4;
/** Real seconds between samples. */
const SAMPLE_INTERVAL_S = 1;

/** Machine state from Zustand store */
interface MachineState {
  id: string;
  status: 'running' | 'idle' | 'warning' | 'critical';
  load: number; // 0-100
  rpm?: number; // For mills
}

/** Active fault being simulated */
interface ActiveFault {
  tagId: string;
  faultType: FaultType;
  startTime: number;
  duration: number; // PLANT milliseconds; 0 = permanent
  severity: number;
  /** Plant milliseconds the fault has run: it holds with the clock, like the readings. */
  elapsedPlantMs: number;
}

export class SimulationAdapter implements IProtocolAdapter {
  private tags: Map<string, TagDefinition> = new Map();
  private values: Map<string, TagValue> = new Map();
  private subscribers: Map<string, Set<(values: TagValue[]) => void>> = new Map();
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private connectTime = 0;
  private machineStates: Map<string, MachineState> = new Map();
  private activeFaults: Map<string, ActiveFault> = new Map();
  private operationalValues: Map<string, number> = new Map();
  /** Where each setpoint-following reading has got to on its way to the setpoint. */
  private trackedBase: Map<string, number> = new Map();
  private sampleIndex = 0;

  // Statistics
  private stats = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
    lastReadLatency: 0,
  };

  constructor(tagDefinitions: TagDefinition[]) {
    // Own the mutable simulation definition. A setpoint write must not mutate
    // the caller's tag catalogue or leak into another adapter instance.
    tagDefinitions.forEach((tag) =>
      this.tags.set(tag.id, {
        ...tag,
        simulation: tag.simulation ? { ...tag.simulation } : undefined,
      })
    );

    // Initialize default machine states to 'running'
    // This prevents LOLO alarms during startup before store syncs
    // Crucial: Iterate ALL tags to catch every machineId referenced
    tagDefinitions.forEach((tag) => {
      if (tag.machineId && !this.machineStates.has(tag.machineId)) {
        this.machineStates.set(tag.machineId, {
          id: tag.machineId,
          status: 'running',
          load: 65, // Default to 65% load for comfortable headroom from alarms
          rpm: this.getDefaultRpmForMachine(tag.machineId),
        });
      }
    });
  }

  private getDefaultRpmForMachine(machineId: string): number {
    if (machineId.includes('packer')) return 60; // Packers ~60 bags/min
    if (machineId.includes('sifter')) return 220; // Sifters ~200-240 RPM
    if (machineId.includes('mill')) return 1200; // Mills ~1200 RPM
    return 100; // Generic default
  }

  // =========================================================================
  // Lifecycle Methods
  // =========================================================================

  async connect(): Promise<void> {
    if (this.connected) return;

    this.sampleIndex = 0;
    this.restoreStoredSetpoints();

    // Initialize all tag values with base values
    this.tags.forEach((tag, id) => {
      const baseValue = tag.simulation?.baseValue ?? this.getDefaultValue(tag);
      this.values.set(id, {
        tagId: id,
        value: baseValue,
        quality: 'GOOD',
        timestamp: Date.now(),
      });
    });

    this.connected = true;
    this.connectTime = Date.now();
    this.tick(); // Force immediate update to apply machine states and populate subscribers
    // The readings are plant readings: each sample advances them by the plant
    // time its real second carried, so P holds them and 4x runs them 4x.
    this.simulationInterval = setInterval(
      () =>
        this.tick(
          plantSecondsForRealSeconds(SAMPLE_INTERVAL_S, useGameSimulationStore.getState().gameSpeed)
        ),
      SAMPLE_INTERVAL_S * 1000
    );
  }

  /**
   * Reapply the setpoints saved before a reload to this adapter's own copy of
   * the tags. A reading that follows a restored setpoint starts at it: the
   * drive was already running there. A value the tag cannot hold is skipped.
   */
  private restoreStoredSetpoints(): void {
    const restored = new Map<string, number>();
    for (const [tagId, value] of Object.entries(readStoredSetpoints())) {
      const tag = this.tags.get(tagId);
      if (!tag?.simulation || tag.accessMode === 'READ') continue;
      if (value < tag.engLow || value > tag.engHigh) continue;
      tag.simulation.baseValue = value;
      restored.set(tagId, value);
    }
    if (restored.size === 0) return;
    this.tags.forEach((tag, id) => {
      const setpointTagId = tag.simulation?.setpointTagId;
      const target = setpointTagId ? restored.get(setpointTagId) : undefined;
      if (target !== undefined) this.trackedBase.set(id, target);
    });
  }

  async disconnect(): Promise<void> {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    this.connected = false;
    this.values.clear();
    this.activeFaults.clear();
    // Clear subscribers to prevent memory leaks across reconnects
    this.subscribers.clear();
    // Clear machine states so next connect starts fresh
    this.machineStates.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  async readTag(tagId: string): Promise<TagValue> {
    const start = performance.now();
    this.stats.readCount++;

    const value = this.values.get(tagId);
    if (!value) {
      this.stats.errorCount++;
      throw new Error(`Tag not found: ${tagId}`);
    }

    this.stats.lastReadLatency = performance.now() - start;
    return { ...value };
  }

  async readTags(tagIds: string[]): Promise<TagValue[]> {
    return Promise.all(tagIds.map((id) => this.readTag(id)));
  }

  async readAllTags(): Promise<TagValue[]> {
    this.stats.readCount += this.values.size;
    return Array.from(this.values.values()).map((v) => ({ ...v }));
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  async writeTag(tagId: string, value: number | boolean | string): Promise<boolean> {
    this.stats.writeCount++;

    const tag = this.tags.get(tagId);
    if (!tag) {
      this.stats.errorCount++;
      return false;
    }

    if (tag.accessMode === 'READ') {
      return false;
    }

    // For setpoints, update the base value in simulation
    if (tag.simulation) {
      tag.simulation.baseValue = value as number;
      if (typeof value === 'number' && Number.isFinite(value)) storeSetpoint(tagId, value);
    }

    const tagValue: TagValue = {
      tagId,
      value,
      quality: 'GOOD',
      timestamp: Date.now(),
    };
    this.values.set(tagId, tagValue);
    this.notifySubscribers([tagValue]);

    return true;
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  subscribe(tagIds: string[], callback: (values: TagValue[]) => void): () => void {
    tagIds.forEach((id) => {
      if (!this.subscribers.has(id)) {
        this.subscribers.set(id, new Set());
      }
      this.subscribers.get(id)!.add(callback);
    });

    const currentValues = tagIds
      .map((id) => this.values.get(id))
      .filter((value): value is TagValue => value !== undefined)
      .map((value) => ({ ...value }));

    if (currentValues.length > 0) {
      callback(currentValues);
    }

    // Return unsubscribe function
    return () => {
      tagIds.forEach((id) => {
        this.subscribers.get(id)?.delete(callback);
      });
    };
  }

  // =========================================================================
  // Diagnostics
  // =========================================================================

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      lastConnectTime: this.connectTime,
      reconnectAttempts: 0,
    };
  }

  getStatistics(): AdapterStatistics {
    const uptime = this.connected ? (Date.now() - this.connectTime) / 1000 : 0;
    return {
      readsPerSecond: uptime > 0 ? this.stats.readCount / uptime : 0,
      writesPerSecond: uptime > 0 ? this.stats.writeCount / uptime : 0,
      avgReadLatency: this.stats.lastReadLatency,
      errorCount: this.stats.errorCount,
      uptime,
    };
  }

  // =========================================================================
  // Machine State Integration
  // =========================================================================

  /**
   * Update machine states from Zustand store.
   * Call this whenever machine data changes to keep simulation in sync.
   */
  updateMachineStates(
    machines: Array<{
      id: string;
      status: 'running' | 'idle' | 'warning' | 'critical';
      metrics: { load: number; rpm: number };
    }>
  ): void {
    machines.forEach((m) => {
      this.machineStates.set(m.id, {
        id: m.id,
        status: m.status,
        load: m.metrics.load,
        rpm: m.metrics.rpm,
      });
    });
  }

  /**
   * Publish conserved plant values from the material and maintenance stores.
   * These stay inside the simulation adapter, so live protocol modes can never
   * be overwritten by local game state.
   */
  updateOperationalValues(values: Readonly<Record<string, number>>): void {
    Object.entries(values).forEach(([tagId, value]) => {
      if (this.tags.has(tagId) && Number.isFinite(value)) {
        this.operationalValues.set(tagId, value);
      }
    });
    // The adapter's 1 Hz sampler publishes the latest snapshot. Running a
    // complete tag tick for every material-flow update would move simulation
    // work onto the render-critical path and oversample historian data.
  }

  /**
   * Get current overall plant load (average of all running machines)
   */
  getPlantLoad(): number {
    let total = 0;
    let count = 0;
    this.machineStates.forEach((state) => {
      if (state.status === 'running') {
        total += state.load;
        count++;
      }
    });
    return count > 0 ? total / count : 0;
  }

  // =========================================================================
  // Fault Injection (for testing)
  // =========================================================================

  /**
   * Inject a fault into a tag for testing alarm and anomaly detection
   */
  injectFault(fault: FaultInjection): void {
    this.activeFaults.set(fault.tagId, {
      tagId: fault.tagId,
      faultType: fault.faultType,
      startTime: Date.now(),
      duration: fault.duration ?? 0,
      severity: fault.severity ?? 1.0,
      elapsedPlantMs: 0,
    });

    if (this.connected) {
      this.tick();
    }
  }

  /**
   * Clear an active fault
   */
  clearFault(tagId: string): void {
    this.activeFaults.delete(tagId);

    if (this.connected) {
      this.tick();
    }
  }

  /**
   * Clear all active faults
   */
  clearAllFaults(): void {
    this.activeFaults.clear();

    if (this.connected) {
      this.tick();
    }
  }

  /**
   * Get list of active faults
   */
  getActiveFaults(): ActiveFault[] {
    return Array.from(this.activeFaults.values());
  }

  // =========================================================================
  // Simulation Engine
  // =========================================================================

  /**
   * One sample. `plantSeconds` is the plant time since the previous sample: 0
   * for an immediate refresh (connect, a fault change) and under a held clock,
   * when noise, setpoint lag and cool-down all hold.
   */
  private tick(plantSeconds = 0): void {
    const now = Date.now();
    if (plantSeconds > 0) this.sampleIndex += 1;
    const setpointLag = 1 - Math.exp(-plantSeconds / SETPOINT_TIME_CONSTANT_S);
    const coolingEase = 1 - Math.pow(0.99, plantSeconds);
    const changedTags: TagValue[] = [];

    // Expire faults on plant time: a held clock holds an injected fault with
    // the reading it distorts, and 4x runs it out four times as fast.
    this.activeFaults.forEach((fault, tagId) => {
      fault.elapsedPlantMs += plantSeconds * 1000;
      if (fault.duration > 0 && fault.elapsedPlantMs >= fault.duration) {
        this.activeFaults.delete(tagId);
      }
    });

    // Update each tag
    this.tags.forEach((tag, id) => {
      const sim = tag.simulation;
      if (!sim) return;

      const current = this.values.get(id);
      if (!current) return;

      let newValue = current.value as number;
      let quality: Quality = 'GOOD';

      // Get machine state
      const machineState = this.machineStates.get(tag.machineId);
      // Default to 'running' if state is unknown to prevent startup alarms
      // This covers the gap between SimulationAdapter init and the first store sync.
      // 'warning' is degraded but still producing, as everywhere else in the game.
      const isRunning = machineState
        ? machineState.status === 'running' || machineState.status === 'warning'
        : true;

      // Check for active fault
      const activeFault = this.activeFaults.get(id);

      // Handle faults first
      if (activeFault) {
        const faultResult = this.applyFault(activeFault, tag, newValue, plantSeconds);
        // A transmitter saturates at its range limits.
        newValue = Math.max(tag.engLow, Math.min(tag.engHigh, faultResult.value));
        quality = faultResult.quality;
      }
      // Exact conserved telemetry takes precedence over synthetic drift and
      // noise. Injected faults above still exercise the complete alarm path.
      else if (this.operationalValues.has(id)) {
        newValue = Math.max(tag.engLow, Math.min(tag.engHigh, this.operationalValues.get(id)!));
      }
      // Status-dependent tags
      else if (sim.statusDependent && !isRunning) {
        // Machine not running - return idle values
        if (tag.group === 'SPEED' || tag.group === 'FLOW') {
          newValue = 0;
        } else if (tag.group === 'TEMPERATURE') {
          // Temperature drops slowly when machine stops
          const ambientTemp = 24;
          newValue = newValue + (ambientTemp - newValue) * coolingEase;
        }
        // A tripped machine's transmitters are healthy; only the process is stopped.
        quality = 'UNCERTAIN';
      }
      // Normal operation
      else {
        // FIXED: Start from base value each tick to prevent accumulation
        const baseValue = this.followSetpoint(id, sim.baseValue, sim.setpointTagId, setpointLag);
        newValue = baseValue;

        // 1. Apply load factor FIRST (scales the base value)
        if (sim.loadFactor && machineState) {
          // Clamp load to 0-100 range to prevent invalid calculations
          const clampedLoad = Math.max(0, Math.min(100, machineState.load));
          // Load multiplier: 0.7 at 0% load, 1.0 at 50% load, 1.3 at 100% load
          const loadMultiplier = 0.7 + (clampedLoad / 100) * 0.6;
          newValue = baseValue * loadMultiplier;
        }

        // 2. Apply noise (additive, not compounding)
        if (sim.noiseAmplitude > 0) {
          newValue += deterministicVariance(idToSeed(id), this.sampleIndex, sim.noiseAmplitude);
        }

        // 3. Apply drift (accumulates in baseValue over long periods - disabled for now)
        // Drift should modify sim.baseValue directly if needed, not compound per-tick

        // 4. Apply correlations
        if (sim.correlatedWith && sim.correlatedWith.length > 0) {
          newValue = this.applyCorrelations(newValue, tag, sim.correlatedWith);
        }

        // 5. Clamp to engineering range
        newValue = Math.max(tag.engLow, Math.min(tag.engHigh, newValue));

        // Working if nominal samples are never BAD: sensor failure comes only
        // from injectFault('sensor_fail'), never from a spontaneous roll.
      }

      // Handle integer types
      if (tag.dataType === 'INT16' || tag.dataType === 'INT32') {
        newValue = Math.round(newValue);
      }

      // Update value
      const newTagValue: TagValue = {
        tagId: id,
        value: newValue,
        quality,
        timestamp: now,
      };

      this.values.set(id, newTagValue);
      changedTags.push(newTagValue);
    });

    // Notify subscribers
    this.notifySubscribers(changedTags);
  }

  /**
   * A drive does not jump to a new speed: the reading closes the gap to its
   * setpoint with a first-order lag (time constant SETPOINT_TIME_CONSTANT_S in
   * plant seconds). It advances only on running samples, so a stopped machine
   * still reads zero and resumes from where it was. Noise is applied on top by
   * the caller, so it never accumulates in the tracked value.
   */
  private followSetpoint(
    tagId: string,
    ownBase: number,
    setpointTagId: string | undefined,
    lag: number
  ): number {
    const target = setpointTagId ? this.tags.get(setpointTagId)?.simulation?.baseValue : undefined;
    if (target === undefined || !Number.isFinite(target)) return ownBase;
    const current = this.trackedBase.get(tagId) ?? ownBase;
    const next = current + (target - current) * lag;
    this.trackedBase.set(tagId, next);
    return next;
  }

  private applyFault(
    fault: ActiveFault,
    tag: TagDefinition,
    currentValue: number,
    plantSeconds: number
  ): { value: number; quality: Quality } {
    switch (fault.faultType) {
      case 'sensor_fail':
        return { value: tag.engLow, quality: 'BAD' };

      case 'spike':
        // Spike to 90% of max
        return {
          value: tag.engLow + (tag.engHigh - tag.engLow) * 0.9 * fault.severity,
          quality: 'GOOD',
        };

      case 'drift': {
        // Accelerated drift: 0.1% of span per plant second, so it holds while
        // paused (an immediate refresh passes 0) and keeps pace with 4x.
        const driftAmount = (tag.engHigh - tag.engLow) * 0.001 * fault.severity * plantSeconds;
        return {
          value: Math.min(tag.engHigh, currentValue + driftAmount),
          quality: 'GOOD',
        };
      }

      case 'stuck':
        // Value doesn't change (return current value exactly)
        return { value: currentValue, quality: 'UNCERTAIN' };

      case 'noise': {
        // Increased noise
        const noiseAmount = (tag.engHigh - tag.engLow) * 0.05 * fault.severity;
        return {
          value:
            currentValue +
            deterministicVariance(idToSeed(`${fault.tagId}:fault`), this.sampleIndex, noiseAmount),
          quality: 'GOOD',
        };
      }

      case 'communication':
        return { value: currentValue, quality: 'STALE' };

      default:
        return { value: currentValue, quality: 'GOOD' };
    }
  }

  private applyCorrelations(value: number, tag: TagDefinition, correlatedTags: string[]): number {
    let adjustedValue = value;
    const correlationStrength = 0.1;

    correlatedTags.forEach((correlatedTagId) => {
      const correlatedValue = this.values.get(correlatedTagId);
      const correlatedDef = this.tags.get(correlatedTagId);

      if (correlatedValue && correlatedDef) {
        // Guard against a degenerate/misconfigured engineering range; dividing
        // by a zero (or negative) span would yield NaN/Infinity that propagates
        // into the tag value and the 3D bridge.
        const range = correlatedDef.engHigh - correlatedDef.engLow;
        if (range <= 0) return;

        // Normalize correlated value to 0-1 range
        const normalizedCorrelated =
          ((correlatedValue.value as number) - correlatedDef.engLow) / range;

        // Apply correlation: when correlated tag is high, this tag increases
        const correlationEffect =
          correlationStrength * (normalizedCorrelated - 0.5) * (tag.engHigh - tag.engLow);

        adjustedValue += correlationEffect;
      }
    });

    return adjustedValue;
  }

  private notifySubscribers(changedTags: TagValue[]): void {
    // Group changes by subscriber callback
    const subscriberUpdates = new Map<(values: TagValue[]) => void, TagValue[]>();

    changedTags.forEach((tag) => {
      const callbacks = this.subscribers.get(tag.tagId);
      if (callbacks) {
        callbacks.forEach((cb) => {
          if (!subscriberUpdates.has(cb)) {
            subscriberUpdates.set(cb, []);
          }
          subscriberUpdates.get(cb)!.push(tag);
        });
      }
    });

    // Fire callbacks
    subscriberUpdates.forEach((values, callback) => {
      try {
        callback(values);
      } catch {
        // Subscriber callback error - silently ignored in production
      }
    });
  }

  private getDefaultValue(tag: TagDefinition): number {
    // Return midpoint of engineering range
    return (tag.engLow + tag.engHigh) / 2;
  }
}
