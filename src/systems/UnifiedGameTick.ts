/**
 * UnifiedGameTick - Zero-allocation game state updates
 *
 * ARCHITECTURE (per GPT 5.2 recommendations):
 * 1. REUSE OBJECTS - Module-level ctx/arrays, mutated not recreated
 * 2. STORE TRUTH ONLY - No cosmetic variance in store
 * 3. VISUAL SMOOTHING - Done at display time, not in store
 * 4. MINIMAL WRITES - Only write when truth actually changes
 *
 * The store holds TRUTH. Display adds COSMETICS.
 */

import { useEffect } from 'react';
import { centralTick, TICK_PRIORITY } from './CentralTickSystem';
import type { TickContext } from './CentralTickSystem';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import type { MachineData } from '../types';

// Machine status type (matches MachineData.status)
type MachineStatus = 'running' | 'idle' | 'warning' | 'critical';

// ============================================================
// REUSABLE MODULE-LEVEL OBJECTS (never recreated)
// ============================================================

// Reusable breakdowns array - cleared with .length = 0, never reallocated
const _breakdowns: Array<{ id: string; name: string; type: string }> = [];

// Reusable metrics object - mutated in place
const _metricsUpdate = {
  efficiency: 0,
  uptime: 100,
  quality: 99.5,
  throughput: 0,
};

// Reusable metric tracking object
const _metricTrackingUpdate = {
  totalRunningSeconds: 0,
  totalElapsedSeconds: 0,
  lastRecalcTime: 0,
};

// Reusable arrays for machine change tracking (cleared each tick, never reallocated)
const _changedIndices: number[] = [];
const _changedData: Array<{ newStatus: MachineStatus; newWear: number; newEfficiency: number; newTemp: number }> = [];

// ============================================================
// WEAR CONFIGURATION (static, never changes)
// ============================================================

const WEAR_CONFIG: Record<string, { wearRatePerSecond: number; warningThreshold: number; breakdownThreshold: number }> = {
  SILO: { wearRatePerSecond: 0.0001, warningThreshold: 70, breakdownThreshold: 95 },
  ROLLER_MILL: { wearRatePerSecond: 0.0005, warningThreshold: 60, breakdownThreshold: 90 },
  PLANSIFTER: { wearRatePerSecond: 0.0003, warningThreshold: 65, breakdownThreshold: 92 },
  PACKER: { wearRatePerSecond: 0.0004, warningThreshold: 55, breakdownThreshold: 88 },
};

function getWearConfig(machineType: string) {
  return WEAR_CONFIG[machineType] || WEAR_CONFIG.ROLLER_MILL;
}

function calculateEfficiency(wear: number, machineType: string): number {
  const config = getWearConfig(machineType);
  if (wear >= config.breakdownThreshold) return 0;
  if (wear < config.warningThreshold * 0.5) return 100;
  const degradationRange = config.breakdownThreshold - config.warningThreshold * 0.5;
  const wearInRange = wear - config.warningThreshold * 0.5;
  const degradation = Math.min(1, wearInRange / degradationRange);
  return Math.round((1 - degradation * 0.4) * 100);
}

// ============================================================
// MACHINE UPDATE - TRUTH ONLY (no cosmetic variance)
// ============================================================

/**
 * Check if a machine's TRUTH has changed (not cosmetic values)
 * Truth = status, wear, efficiency
 * Cosmetics = RPM variance, load variance, temp fluctuation
 */
function updateMachineTruth(
  machine: MachineData,
  deltaSeconds: number
): { changed: boolean; newStatus: MachineStatus; newWear: number; newEfficiency: number; newTemp: number; breakdown: boolean } {
  const isRunning = machine.status === 'running' || machine.status === 'warning';
  const isBrokenDown = machine.status === 'critical';

  // Broken machines don't change
  if (isBrokenDown) {
    return {
      changed: false,
      newStatus: machine.status,
      newWear: machine.metrics.wear ?? 0,
      newEfficiency: machine.metrics.efficiency ?? 100,
      newTemp: machine.metrics.temperature,
      breakdown: false,
    };
  }

  const baseWear = machine.metrics.wear ?? 0;
  const baseTemp = machine.metrics.temperature;
  const baseLoad = machine.metrics.load;
  const wearConfig = getWearConfig(machine.type);

  // Temperature changes (this IS truth, affects machine health)
  let newTemp = baseTemp;
  if (isRunning) {
    const tempTarget = 75;
    const tempDelta = (tempTarget - baseTemp) * 0.02 * deltaSeconds;
    newTemp = Math.round(Math.min(85, baseTemp + Math.max(0.1, tempDelta)));
  } else {
    const tempTarget = 25;
    const tempDelta = (baseTemp - tempTarget) * 0.01 * deltaSeconds;
    newTemp = Math.round(Math.max(25, baseTemp - Math.max(0.1, tempDelta)));
  }

  // Wear accumulation (this IS truth)
  let newWear = baseWear;
  if (isRunning) {
    const loadFactor = 0.5 + baseLoad / 100;
    const wearIncrement = wearConfig.wearRatePerSecond * deltaSeconds * loadFactor;
    newWear = Math.min(100, baseWear + wearIncrement);
  }

  // Efficiency based on wear (derived truth)
  const newEfficiency = calculateEfficiency(newWear, machine.type);

  // Status based on wear (truth)
  let newStatus = machine.status;
  let breakdown = false;
  if (newWear >= wearConfig.breakdownThreshold) {
    newStatus = 'critical';
    breakdown = true;
  } else if (newWear >= wearConfig.warningThreshold && machine.status === 'running') {
    newStatus = 'warning';
  }

  // Check if truth actually changed (not cosmetics)
  const wearChanged = Math.abs(newWear - baseWear) > 0.001; // Threshold to avoid float noise
  const tempChanged = newTemp !== baseTemp;
  const efficiencyChanged = newEfficiency !== (machine.metrics.efficiency ?? 100);
  const statusChanged = newStatus !== machine.status;

  return {
    changed: wearChanged || tempChanged || efficiencyChanged || statusChanged,
    newStatus,
    newWear: Math.round(newWear * 100) / 100,
    newEfficiency,
    newTemp,
    breakdown,
  };
}

// ============================================================
// UNIFIED TICK - ZERO ALLOCATION PATH
// ============================================================

function unifiedGameTick(ctx: TickContext): void {
  const { deltaSeconds: rawDeltaSeconds, gameSpeed } = ctx;

  // Skip if paused
  if (gameSpeed === 0) return;

  // Cap delta to prevent large time jumps (e.g., from tab being hidden)
  // Must be >= tickInterval (0.5s) to avoid slowing down game time
  // Cap at 1.0s to handle minor frame drops while preventing runaway accumulation
  const deltaSeconds = Math.min(rawDeltaSeconds, 1.0);

  // Validate gameSpeed is reasonable (0-1000x is sane range)
  const safeGameSpeed = Math.max(0, Math.min(gameSpeed, 1000));

  // Clear reusable arrays (no allocation)
  _breakdowns.length = 0;

  // 1. Calculate new game time (pure math, no allocation)
  const gameStore = useGameSimulationStore.getState();
  const hoursElapsed = (deltaSeconds * safeGameSpeed) / 3600;
  const newGameTime = (((gameStore.gameTime + hoursElapsed) % 24) + 24) % 24;

  // Handle day rollover
  let newGameDay = gameStore.gameDay;
  if (newGameTime < gameStore.gameTime && hoursElapsed > 0) {
    newGameDay++;
  }

  // 2. Update machine TRUTH (not cosmetics)
  const prodStore = useProductionStore.getState();
  const machines = prodStore.machines;

  let anyMachineChanged = false;
  let runningCount = 0;
  let totalRunningDelta = 0;

  // Check each machine for truth changes
  // Use module-level reusable arrays (cleared here, never reallocated)
  _changedIndices.length = 0;
  _changedData.length = 0;

  for (let i = 0; i < machines.length; i++) {
    const machine = machines[i];
    const isRunning = machine.status === 'running' || machine.status === 'warning';

    if (isRunning) {
      runningCount++;
      totalRunningDelta += deltaSeconds;
    }

    const result = updateMachineTruth(machine, deltaSeconds);

    if (result.breakdown) {
      _breakdowns.push({ id: machine.id, name: machine.name, type: machine.type });
    }

    if (result.changed) {
      anyMachineChanged = true;
      _changedIndices.push(i);
      _changedData.push({
        newStatus: result.newStatus,
        newWear: result.newWear,
        newEfficiency: result.newEfficiency,
        newTemp: result.newTemp,
      });
    }
  }

  // 3. Count running packers for throughput calculation
  let runningPackerCount = 0;
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    if (m.type === 'PACKER' && (m.status === 'running' || m.status === 'warning')) {
      runningPackerCount++;
    }
  }

  // 4. Calculate metrics (always, not just when machines change)
  const totalMachines = machines.length || 1;
  const { productionSpeed } = prodStore;

  // Efficiency: percentage of machines running
  _metricsUpdate.efficiency = Math.round((runningCount / totalMachines) * 100 * 10) / 10;

  // Update tracking
  _metricTrackingUpdate.totalRunningSeconds =
    prodStore._metricTracking.totalRunningSeconds + totalRunningDelta;
  _metricTrackingUpdate.totalElapsedSeconds =
    prodStore._metricTracking.totalElapsedSeconds + deltaSeconds;

  // Uptime: percentage of time machines have been running
  _metricsUpdate.uptime = _metricTrackingUpdate.totalElapsedSeconds > 0
    ? Math.round(
      (_metricTrackingUpdate.totalRunningSeconds /
        (_metricTrackingUpdate.totalElapsedSeconds * totalMachines)) *
      100 *
      10
    ) / 10
    : 100;

  // Throughput: actual production rate in bags per game-hour
  // Based on App.tsx production formula: 12 bags/sec base × productionSpeed × gameSpeedFactor × packerScale
  // Converted to bags per game-hour for display
  const BAGS_PER_SECOND_BASE = 12;
  const gameSpeedFactor = safeGameSpeed / 60;
  const packerScale = runningPackerCount / 3; // 3 packers at full capacity

  // Production per real second
  const bagsPerRealSecond = BAGS_PER_SECOND_BASE * productionSpeed * gameSpeedFactor * packerScale;

  // Convert to bags per game-hour: realSeconds per gameHour = 3600 / safeGameSpeed
  // Guard against division by zero (paused state handled above, but be safe)
  const realSecondsPerGameHour = safeGameSpeed > 0 ? 3600 / safeGameSpeed : 0;
  const bagsPerGameHour = bagsPerRealSecond * realSecondsPerGameHour;

  _metricsUpdate.throughput = Math.round(bagsPerGameHour);

  // 5. Update store - machines only if changed, metrics always
  if (anyMachineChanged) {
    // Create new machines array only when needed
    const newMachines = [...machines];
    for (let j = 0; j < _changedIndices.length; j++) {
      const idx = _changedIndices[j];
      const data = _changedData[j];
      const oldMachine = machines[idx];

      newMachines[idx] = {
        ...oldMachine,
        status: data.newStatus,
        metrics: {
          ...oldMachine.metrics,
          wear: data.newWear,
          efficiency: data.newEfficiency,
          temperature: data.newTemp,
        },
      };
    }

    useProductionStore.setState({
      machines: newMachines,
      _metricTracking: { ..._metricTrackingUpdate },
      metrics: { ..._metricsUpdate },
    });
  } else {
    // Still update metrics and tracking even if machines didn't change
    useProductionStore.setState({
      _metricTracking: { ..._metricTrackingUpdate },
      metrics: { ..._metricsUpdate },
    });
  }

  // 4. Update game time only if changed
  const timeChanged = Math.abs(newGameTime - gameStore.gameTime) > 0.0001 || newGameDay !== gameStore.gameDay;
  if (timeChanged) {
    useGameSimulationStore.setState({
      gameTime: newGameTime,
      gameDay: newGameDay,
    });
  }

  // 5. Handle breakdowns (async, outside main path)
  if (_breakdowns.length > 0) {
    // Copy breakdowns before async (since we reuse the array)
    const breakdownsCopy = _breakdowns.map(b => ({ ...b }));
    import('../stores/uiStore').then(({ useUIStore }) => {
      breakdownsCopy.forEach(({ id, name, type }) => {
        useUIStore.getState().addAlert({
          id: `breakdown-${id}-${Date.now()}`,
          type: 'critical',
          title: 'Machine Breakdown',
          message: `${name} (${type}) has broken down due to excessive wear. Maintenance required.`,
          machineId: id,
          timestamp: new Date(),
          acknowledged: false,
        });
      });
    });
  }
}

// ============================================================
// HOOK TO REGISTER TICK
// ============================================================

export function useUnifiedGameTick(): void {
  useEffect(() => {
    centralTick.register('unified-game-tick', unifiedGameTick, TICK_PRIORITY.CRITICAL);
    return () => centralTick.unregister('unified-game-tick');
  }, []);
}

export { unifiedGameTick };
