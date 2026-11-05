import { useEffect, useRef } from 'react';
import {
  machineBaseTemperature,
  storeOwnedLoad,
  tripHasCooledOff,
  unitHasFeed,
} from '../../simulation/machineLoad';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MachineData } from '../../types';
import { getWearConfig, useProductionStore, wearHoldsWarning } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { incidentHoldsMachineWarning } from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { centralTick } from '../../systems/CentralTickSystem';
import { plantSecondsForRealSeconds } from '../../simulation/pace';
import {
  isWorkplaceReplayActive,
  registerReplayParticipant,
} from '../../simulation/workplaceReplayRuntime';

/**
 * Running vibration velocity (mm/s) at ~80% load, matched to the SCADA
 * simulation baselines in tagDatabase.ts. A plansifter's SCADA tag is stroke
 * amplitude; SCADABridge maps its healthy band to ~1.0-1.6 mm/s equivalent.
 */
const RUNNING_VIBRATION_MM_S: Record<string, number> = {
  SILO: 1.2,
  ROLLER_MILL: 1.6,
  PLANSIFTER: 1.3,
  PACKER: 1.3,
  CONTROL_ROOM: 0.3,
};

/**
 * The easing below was authored as one step per two plant seconds (one update
 * every two real seconds at standard pace). An update now walks the plant time
 * that actually passed in steps of at most that size, so a trip takes the same
 * game minutes at every pace (and at every frame rate).
 */
const STANDARD_STEP_PLANT_SECONDS = 2;
/** Bounds the work of one update after a very long frame gap. */
const MAX_STEPS_PER_UPDATE = 64;
/** A longer frame (hidden tab, hitch) counts as one central tick (0.5 s), as the game clock does. */
const MAX_FRAME_REAL_SECONDS = 0.5;
const easeFor = (perStep: number, plantSeconds: number) =>
  1 - Math.pow(1 - perStep, plantSeconds / STANDARD_STEP_PLANT_SECONDS);

export function updateOfflineMachineMetrics(plantSeconds = STANDARD_STEP_PLANT_SECONDS) {
  const span = Number.isFinite(plantSeconds) && plantSeconds > 0 ? plantSeconds : 0;
  const steps = Math.min(
    MAX_STEPS_PER_UPDATE,
    Math.max(1, Math.ceil(span / STANDARD_STEP_PLANT_SECONDS - 1e-9))
  );
  const stepSpan = span / steps;
  const temperatureEase = easeFor(0.05, stepSpan);
  const vibrationEase = easeFor(0.1, stepSpan);
  const loadEase = easeFor(0.1, stepSpan);
  const {
    machines: storeMachines,
    batchUpdateMachineMetrics,
    updateMachineStatus,
    productionSpeed,
  } = useProductionStore.getState();
  const metricUpdates: {
    machineId: string;
    metrics: Partial<MachineData['metrics']>;
  }[] = [];
  // 'warning' is a running state, so a trip lifted while a facility stop,
  // drill or interlocked crisis holds would start the unit mid-stop.
  const stopHolds = useGameSimulationStore.getState().emergencyActive;
  const flow = useMaterialFlowStore.getState();

  for (const machine of storeMachines) {
    const fed = unitHasFeed(machine, flow);
    const isRunning =
      productionSpeed > 0 && (machine.status === 'running' || machine.status === 'warning');
    const isIdle = machine.status === 'idle';
    const isCritical = machine.status === 'critical';
    const baseTemperature = machineBaseTemperature(machine.type);
    // Only a metric-only trip cools off. A wear breakdown or an open repair is
    // cleared by maintenance, and keeps its hot, rough signature until then.
    const metricOnlyTrip =
      isCritical &&
      (machine.metrics.wear ?? 0) < getWearConfig(machine.type).breakdownThreshold &&
      !useBreakdownStore.getState().getBreakdownForMachine(machine.id);

    // mm/s velocity, the same unit the SCADA VT001 tags feed the store, so
    // toggling SCADA does not jump the reading (or the status derived from it).
    const runningVibration =
      (RUNNING_VIBRATION_MM_S[machine.type] ?? 1.3) * (machine.status === 'warning' ? 1.5 : 1);
    let newLoad = machine.metrics.load;
    let newTemperature = machine.metrics.temperature;
    let newVibration = machine.metrics.vibration;
    for (let step = 0; step < steps; step++) {
      newLoad = storeOwnedLoad(
        { status: machine.status, metrics: { load: newLoad } },
        productionSpeed,
        loadEase,
        fed
      );

      let targetTemperature = baseTemperature;
      if (isRunning) targetTemperature += (newLoad / 100) * 20;
      // A tripped unit is stopped, so it cools as an idle one does; heating it
      // toward base + 40 C kept it from ever cooling off.
      else if (isIdle || metricOnlyTrip) targetTemperature = 20;
      else if (isCritical) targetTemperature += 40;
      newTemperature = THREE.MathUtils.clamp(
        newTemperature + (targetTemperature - newTemperature) * temperatureEase,
        15,
        90
      );

      let targetVibration = 0.2;
      if (isRunning) targetVibration = runningVibration * (0.6 + newLoad / 200);
      else if (isCritical && !metricOnlyTrip) targetVibration = 7;
      newVibration = THREE.MathUtils.clamp(
        newVibration + (targetVibration - newVibration) * vibrationEase,
        0,
        10
      );
    }

    metricUpdates.push({
      machineId: machine.id,
      metrics: {
        temperature: Math.round(newTemperature * 10) / 10,
        vibration: Math.round(newVibration * 100) / 100,
        load: Math.round(newLoad * 10) / 10,
      },
    });

    // A warning lifts once the unit has cooled to near its own running
    // temperature. A flat 55 C sat below a roller mill's 58 C at nominal load,
    // so a mill restarted hot could never leave warning; 3 C above the running
    // temperature (65 C at most, under the 70 C trip) keeps the hysteresis.
    const recoveryTemperature = Math.max(55, baseTemperature + (newLoad / 100) * 20 + 3);
    if (machine.status === 'running' && (newTemperature > 70 || newVibration > 5)) {
      updateMachineStatus(machine.id, 'warning');
    } else if (machine.status === 'warning') {
      if (newTemperature > 80 || newVibration > 8) {
        updateMachineStatus(machine.id, 'critical');
      } else if (
        newTemperature < recoveryTemperature &&
        newVibration < 3.5 &&
        !wearHoldsWarning(machine) &&
        !incidentHoldsMachineWarning(machine.id)
      ) {
        updateMachineStatus(machine.id, 'running');
      }
    } else if (
      metricOnlyTrip &&
      !stopHolds &&
      // Lifting a wear breakdown or an open repair here would restart a unit
      // with its work order still open (metricOnlyTrip).
      tripHasCooledOff(machine.type, newTemperature, newVibration)
    ) {
      updateMachineStatus(machine.id, 'warning');
    }
  }

  if (metricUpdates.length > 0) batchUpdateMachineMetrics(metricUpdates);
}

/**
 * Isolated, deterministic metric simulation. Keeping this in a small module
 * lets the default renderer lazy-load the high-detail machine authoring code.
 */
export function MachineSimulationController() {
  const lastUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const replayTicksRef = useRef(0);
  const plantSecondsRef = useRef(0);

  useEffect(() => {
    const unregister = registerReplayParticipant('machine-metrics', {
      capture: () => ({ frameCount: frameCountRef.current, replayTicks: replayTicksRef.current }),
      restore: (saved) => {
        frameCountRef.current = saved.frameCount;
        replayTicksRef.current = saved.replayTicks;
        lastUpdateRef.current = 0;
        plantSecondsRef.current = 0;
      },
    });
    centralTick.register(
      'machine-metrics-replay',
      (ctx) => {
        if (
          !isWorkplaceReplayActive() ||
          ctx.gameSpeed === 0 ||
          useGameSimulationStore.getState().gameSpeed === 0
        )
          return;
        replayTicksRef.current += 1;
        if (replayTicksRef.current % 4 === 0) {
          updateOfflineMachineMetrics(
            plantSecondsForRealSeconds(ctx.deltaSeconds * 4, ctx.gameSpeed)
          );
        }
      },
      1
    );
    return () => {
      unregister();
      centralTick.unregister('machine-metrics-replay');
    };
  }, []);

  useFrame((state, delta) => {
    const gameSpeed = useGameSimulationStore.getState().gameSpeed;
    if (isWorkplaceReplayActive() || useProductionStore.getState().scadaLive || gameSpeed === 0)
      return;
    plantSecondsRef.current += plantSecondsForRealSeconds(
      Math.min(delta, MAX_FRAME_REAL_SECONDS),
      gameSpeed
    );
    frameCountRef.current += 1;
    if (frameCountRef.current % 30 !== 0) return;
    const now = state.clock.elapsedTime;
    if (now - lastUpdateRef.current < 2 || useProductionStore.getState().machines.length === 0)
      return;
    lastUpdateRef.current = now;
    const plantSeconds = plantSecondsRef.current;
    plantSecondsRef.current = 0;
    updateOfflineMachineMetrics(plantSeconds);
  });

  return null;
}
