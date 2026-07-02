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
import { useGameSimulationStore, getShiftForHour } from '../stores/gameSimulationStore';
import { useProductionStore, DAILY_TARGET_BAGS } from '../stores/productionStore';
import { useQCLabStore } from '../stores/qcLabStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useUIStore } from '../stores/uiStore';
import type { MachineData } from '../types';

// Tracks the receiving dock's docked state across ticks so a false->true
// transition (a grain truck arriving) triggers exactly one silo delivery.
let _lastReceivingDocked = false;

// One grain truck tops up ~15 t (silo capacity is 50 t)
const GRAIN_DELIVERY_KG = 15000;

// Shift-change phase timer. startShiftHandover() sets phase 'leaving' (workers
// walk to the exit at z=-50, ~3 u/s, worst case ~27 s) but nothing ever
// completed the change — shiftChangeActive stayed true forever and the
// handover button disabled itself permanently. This timer advances
// leaving -> entering -> completeShiftHandover().
let _shiftPhaseElapsed = 0;
const SHIFT_LEAVING_DURATION_S = 30;
const SHIFT_ENTERING_DURATION_S = 10;

// Machine status type (matches MachineData.status)
type MachineStatus = 'running' | 'idle' | 'warning' | 'critical';

// QC grade -> quality score mapping (mirrors deprecated productionStore.tickMetrics)
const QC_GRADE_SCORES: Record<string, number> = { A: 100, B: 85, C: 70, FAIL: 0 };

// Daily-target milestone tracking (percent thresholds, fired once each per day,
// reset on day rollover). Bitmask index matches _MILESTONE_THRESHOLDS.
const _MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const;
let _milestonesReachedMask = 0;

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
const _changedData: Array<{
  newStatus: MachineStatus;
  newWear: number;
  newEfficiency: number;
  newTemp: number;
}> = [];

// ============================================================
// WEAR CONFIGURATION (static, never changes)
// ============================================================

const WEAR_CONFIG: Record<
  string,
  { wearRatePerSecond: number; warningThreshold: number; breakdownThreshold: number }
> = {
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
): {
  changed: boolean;
  newStatus: MachineStatus;
  newWear: number;
  newEfficiency: number;
  newTemp: number;
  breakdown: boolean;
} {
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

  // Temperature changes (this IS truth, affects machine health).
  // Keep 0.1C resolution and DON'T floor the per-tick step at 0.1: the old
  // `Math.round(... Math.max(0.1, delta))` forced a minimum +0.1 then rounded
  // it back off, so as the proportional delta shrank near the target the
  // temperature froze a full degree below 75C and never converged. Rounding to
  // one decimal (matching Machines.tsx) lets it settle within 0.1C of target.
  let newTemp = baseTemp;
  if (isRunning) {
    const tempTarget = 75;
    const tempDelta = (tempTarget - baseTemp) * 0.02 * deltaSeconds;
    newTemp = Math.round(Math.min(85, baseTemp + tempDelta) * 10) / 10;
  } else {
    const tempTarget = 25;
    const tempDelta = (baseTemp - tempTarget) * 0.01 * deltaSeconds;
    newTemp = Math.round(Math.max(25, baseTemp - tempDelta) * 10) / 10;
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

    // Close out the production day: celebrate the result, then reset the
    // daily counter and milestone tracking so the target loop restarts fresh.
    const dayEndStore = useProductionStore.getState();
    const dayBags = dayEndStore.dailyBagsProduced;
    gameStore.triggerCelebration('shift_complete', {
      value: dayBags,
      message:
        dayBags >= DAILY_TARGET_BAGS
          ? `Day complete: ${Math.round(dayBags).toLocaleString()} bags - target met!`
          : `Day complete: ${Math.round(dayBags).toLocaleString()} of ${DAILY_TARGET_BAGS.toLocaleString()} bags`,
    });
    dayEndStore.resetDailyBagsProduced();
    _milestonesReachedMask = 0;
  }

  // 2. Update machine TRUTH (not cosmetics)
  const prodStore = useProductionStore.getState();
  const machines = prodStore.machines;

  let anyMachineChanged = false;
  let runningCount = 0;
  let totalRunningDelta = 0;
  let efficiencySum = 0;

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
    efficiencySum += machine.metrics.efficiency ?? 100;

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

  // Quality: latest QC Lab test grade (A=100, B=85, C=70, FAIL=0 - mirrors the
  // deprecated productionStore.tickMetrics mapping). Before any test exists,
  // derive an estimate from average machine health so the KPI isn't frozen at
  // its 99.5 initial value: pristine machines read 99.5, worn ones drag it down.
  const qcHistory = useQCLabStore.getState().qcLab.testHistory;
  const latestTest = qcHistory[qcHistory.length - 1];
  if (latestTest) {
    _metricsUpdate.quality = QC_GRADE_SCORES[latestTest.grade] ?? 99.5;
  } else {
    const avgMachineEfficiency = efficiencySum / totalMachines; // 0-100
    _metricsUpdate.quality =
      Math.round(Math.max(0, Math.min(99.5, 99.5 * (avgMachineEfficiency / 100))) * 10) / 10;
  }

  // Update tracking
  _metricTrackingUpdate.totalRunningSeconds =
    prodStore._metricTracking.totalRunningSeconds + totalRunningDelta;
  _metricTrackingUpdate.totalElapsedSeconds =
    prodStore._metricTracking.totalElapsedSeconds + deltaSeconds;

  // Uptime: percentage of time machines have been running
  _metricsUpdate.uptime =
    _metricTrackingUpdate.totalElapsedSeconds > 0
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

  // 3b. Daily-target milestones: celebrate 25/50/75/100% once each per day
  // (mask resets on day rollover above). 100% counts as target met.
  if (DAILY_TARGET_BAGS > 0) {
    const dailyProgressPct = (prodStore.dailyBagsProduced / DAILY_TARGET_BAGS) * 100;
    for (let t = 0; t < _MILESTONE_THRESHOLDS.length; t++) {
      const threshold = _MILESTONE_THRESHOLDS[t];
      const bit = 1 << t;
      if (dailyProgressPct >= threshold && (_milestonesReachedMask & bit) === 0) {
        _milestonesReachedMask |= bit;
        gameStore.triggerCelebration(threshold === 100 ? 'target_met' : 'milestone', {
          value: Math.round(prodStore.dailyBagsProduced),
          message:
            threshold === 100
              ? `Daily target reached: ${DAILY_TARGET_BAGS.toLocaleString()} bags!`
              : `Daily target ${threshold}% complete`,
        });
      }
    }
  }

  // 4. Update game time only if changed
  const timeChanged =
    Math.abs(newGameTime - gameStore.gameTime) > 0.0001 || newGameDay !== gameStore.gameDay;
  if (timeChanged) {
    useGameSimulationStore.setState({
      gameTime: newGameTime,
      gameDay: newGameDay,
    });

    // Keep the shift in lock-step with the clock. This unified tick replaced the
    // store's tickGameTime (which reconciled the shift inline); without this the
    // clock advanced but currentShift stayed frozen at its load-time value, so
    // the HUD showed e.g. "Afternoon" at 23:59. getShiftForHour derives from the
    // final time, so a single high-speed tick spanning multiple boundaries still
    // lands on the correct shift. setShift silently updates shiftData too.
    const expectedShift = getShiftForHour(newGameTime);
    if (expectedShift !== gameStore.currentShift) {
      gameStore.setShift(expectedShift);
    }
  }

  // 4b. Advance the material-flow simulation (grain -> mills -> sifters -> packers).
  // This tick was orphaned when ConveyorSystem was modularized (a5d0c21) — the
  // whole flow network silently froze. It belongs here, on the simulation tick,
  // not in a render-loop useFrame.
  const flowStore = useMaterialFlowStore.getState();
  // Couple machine status to flow FIRST so a stopped/broken machine stops
  // processing material this same tick (action -> consequence).
  flowStore.syncMachineProcessing(
    anyMachineChanged ? useProductionStore.getState().machines : machines
  );
  flowStore.tickMaterialFlow(deltaSeconds, productionSpeed);

  // 4c. Grain deliveries: when a receiving truck docks, it refills the
  // emptiest silo — without this the silos drain dry in under an hour of
  // simulation and the flow network starves permanently.
  const receivingDocked = useTruckScheduleStore.getState().truckSchedule.receiving.truckDocked;
  if (receivingDocked && !_lastReceivingDocked) {
    flowStore.receiveGrainDelivery(GRAIN_DELIVERY_KG);
    // The same truck also carries a spare-parts resupply, closing the
    // maintenance loop: consume parts to repair, trucks bring them back.
    useBreakdownStore.getState().restockDelivery();
  }
  _lastReceivingDocked = receivingDocked;

  // 4d. Shift-change completion (see _shiftPhaseElapsed above)
  const simStore = useGameSimulationStore.getState();
  if (simStore.shiftChangeActive) {
    _shiftPhaseElapsed += deltaSeconds;
    if (simStore.shiftChangePhase === 'leaving' && _shiftPhaseElapsed >= SHIFT_LEAVING_DURATION_S) {
      // Old crew is out — new crew walks back in (normal worker behavior resumes)
      useGameSimulationStore.setState({ shiftChangePhase: 'entering' });
      _shiftPhaseElapsed = 0;
    } else if (
      simStore.shiftChangePhase === 'entering' &&
      _shiftPhaseElapsed >= SHIFT_ENTERING_DURATION_S
    ) {
      // completeShiftHandover (not the plain completeShiftChange): also
      // archives shift notes/production, resets incidents and clock-ins,
      // and rolls the supervisor handoff for the incoming shift.
      simStore.completeShiftHandover();
      _shiftPhaseElapsed = 0;
    }
  } else {
    _shiftPhaseElapsed = 0;
  }

  // 5. Handle breakdowns (async, outside main path)
  if (_breakdowns.length > 0) {
    // Copy breakdowns before async (since we reuse the array)
    const breakdownsCopy = _breakdowns.map((b) => ({ ...b }));
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
