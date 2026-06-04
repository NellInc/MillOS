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
  duration: number; // 0 = permanent
  severity: number;
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

  // Statistics
  private stats = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
    lastReadLatency: 0,
  };

  constructor(tagDefinitions: TagDefinition[]) {
    tagDefinitions.forEach((tag) => this.tags.set(tag.id, tag));

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
    this.simulationInterval = setInterval(() => this.tick(), 1000);
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

  private tick(): void {
    const now = Date.now();
    const changedTags: TagValue[] = [];

    // Check for expired faults
    this.activeFaults.forEach((fault, tagId) => {
      if (fault.duration > 0 && now - fault.startTime >= fault.duration) {
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
      // This covers the gap between SimulationAdapter init and the first store sync
      const isRunning = machineState ? machineState.status === 'running' : true;

      // Check for active fault
      const activeFault = this.activeFaults.get(id);

      // Handle faults first
      if (activeFault) {
        const faultResult = this.applyFault(activeFault, tag, newValue);
        newValue = faultResult.value;
        quality = faultResult.quality;
      }
      // Status-dependent tags
      else if (sim.statusDependent && !isRunning) {
        // Machine not running - return idle values
        if (tag.group === 'SPEED' || tag.group === 'FLOW') {
          newValue = 0;
        } else if (tag.group === 'TEMPERATURE') {
          // Temperature drops slowly when machine stops
          const ambientTemp = 24;
          newValue = newValue + (ambientTemp - newValue) * 0.01;
        }
        quality = machineState?.status === 'critical' ? 'BAD' : 'UNCERTAIN';
      }
      // Normal operation
      else {
        // FIXED: Start from base value each tick to prevent accumulation
        const baseValue = sim.baseValue;
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
          newValue += (Math.random() - 0.5) * 2 * sim.noiseAmplitude;
        }

        // 3. Apply drift (accumulates in baseValue over long periods - disabled for now)
        // Drift should modify sim.baseValue directly if needed, not compound per-tick

        // 4. Apply correlations
        if (sim.correlatedWith && sim.correlatedWith.length > 0) {
          newValue = this.applyCorrelations(newValue, tag, sim.correlatedWith);
        }

        // 5. Clamp to engineering range
        newValue = Math.max(tag.engLow, Math.min(tag.engHigh, newValue));

        // 6. Random sensor failure (0.005% chance per tick)
        if (Math.random() < 0.00005) {
          quality = 'BAD';
          newValue = tag.engLow;
        }
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

  private applyFault(
    fault: ActiveFault,
    tag: TagDefinition,
    currentValue: number
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
        // Accelerated drift
        const driftAmount = (tag.engHigh - tag.engLow) * 0.001 * fault.severity;
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
          value: currentValue + (Math.random() - 0.5) * 2 * noiseAmount,
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
