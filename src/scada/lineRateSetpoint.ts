/**
 * The mills' roll-speed setpoints are the line rate (plan item 7.5, owner's
 * choice: the setpoint becomes the Settings slider's single rate).
 *
 * The production store's `productionSpeed` is the one owner. A setpoint's band
 * (engLow..engHigh, 0-2,000 RPM) maps linearly onto the slider's 0-200%, so
 * 1,000 RPM is a rate of 1.0 and every mill reads the same setpoint:
 * - an operator or agent write of any `RM*.ST001.SP` sets the rate through
 *   `setProductionSpeed`, the action the slider calls (SCADAService.writeSetpoint);
 * - any change of the rate (the slider, the boot rate, a replay restore, the
 *   planner's Run) writes all four setpoints as the plant, with no actor, so a
 *   slider drag logs no decisions (bindRollSpeedSetpoints).
 * The two cannot chase each other: a plant write carries no actor, and a rate
 * write is skipped when the tag already holds it.
 * Outside the band the write is refused, as SCADAService already refuses it.
 * The roll-speed readings follow, so they carry no operating alarm band (a
 * fixed band would only report the rate chosen); a lost signal still alarms.
 * Benchmarks are not bound: their SCADA keeps the readings it was captured with.
 * A setpoint saved before this (millos-scada-setpoints) is overwritten by the
 * rate when SCADA binds: the rate wins.
 */
import { useProductionStore } from '../stores/productionStore';
import { isBenchmarkRuntime } from '../runtime/runtimeMode';
import { getMachineEnergy } from '../utils/energyCalculations';
import { lineOverdrive, OVERDRIVE_WEAR_SLOPE, storeOwnedLoad } from '../simulation/machineLoad';
import { MachineType, type MachineData } from '../types';

export const ROLL_SPEED_SETPOINT_TAG_IDS = [
  'RM101.ST001.SP',
  'RM102.ST001.SP',
  'RM103.ST001.SP',
  'RM104.ST001.SP',
] as const;

/** RPM per unit of line rate: the setpoint band 0-2,000 RPM over the slider's 0-2. */
export const RPM_PER_LINE_RATE = 1000;
/** The slider's range (SettingsPanel). */
export const LINE_RATE_MIN = 0;
export const LINE_RATE_MAX = 2;

export const isRollSpeedSetpoint = (tagId: string): boolean =>
  (ROLL_SPEED_SETPOINT_TAG_IDS as readonly string[]).includes(tagId);

export const lineRateForRollSpeed = (rpm: number): number => rpm / RPM_PER_LINE_RATE;
export const rollSpeedForLineRate = (rate: number): number => rate * RPM_PER_LINE_RATE;

/** An operator's or agent's setpoint write: a roll speed inside the band sets the line rate. */
export function applyRollSpeedWrite(tagId: string, rpm: number): boolean {
  if (!isRollSpeedSetpoint(tagId) || !Number.isFinite(rpm)) return false;
  const rate = lineRateForRollSpeed(rpm);
  if (rate < LINE_RATE_MIN || rate > LINE_RATE_MAX) return false;
  useProductionStore.getState().setProductionSpeed(rate);
  return true;
}

interface SetpointService {
  writeSetpoint(tagId: string, value: number): Promise<boolean>;
  getValue?(tagId: string): { value: unknown } | undefined;
  getMode?(): string;
}

/** Keep the four setpoints at the line rate; returns the unsubscribe. Inert in benchmarks. */
export function bindRollSpeedSetpoints(service: SetpointService): () => void {
  if (isBenchmarkRuntime()) return () => undefined;
  const push = (rate: number) => {
    // A live or hybrid plant's setpoints belong to its PLC: never written from here.
    if (!Number.isFinite(rate) || (service.getMode && service.getMode() !== 'simulation')) return;
    const rpm = rollSpeedForLineRate(Math.min(LINE_RATE_MAX, Math.max(LINE_RATE_MIN, rate)));
    for (const tagId of ROLL_SPEED_SETPOINT_TAG_IDS) {
      const held = service.getValue?.(tagId)?.value;
      if (typeof held === 'number' && Math.abs(held - rpm) < 1e-6) continue;
      void service.writeSetpoint(tagId, rpm).catch(() => undefined);
    }
  };
  push(useProductionStore.getState().productionSpeed);
  let last = useProductionStore.getState().productionSpeed;
  return useProductionStore.subscribe((state) => {
    if (state.productionSpeed === last) return;
    last = state.productionSpeed;
    push(last);
  });
}

/** A running, fed roller mill at the load the store gives it at this rate. */
function workingMill(rate: number): MachineData {
  const base = {
    id: 'rm-101',
    name: 'R.M. 101',
    type: MachineType.ROLLER_MILL,
    status: 'running',
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    lastMaintenance: '',
    nextMaintenance: '',
    metrics: { rpm: 0, temperature: 42, vibration: 1, load: 0 },
  } as unknown as MachineData;
  // The settled load: one full step from standstill reaches the store's target.
  const load = storeOwnedLoad({ status: 'running', metrics: { load: 0 } }, rate, 1, true);
  return { ...base, metrics: { ...base.metrics, load } };
}

/**
 * Wear and energy per tonne at this rate, each as a multiple of the figure at
 * 100%. Throughput is proportional to the rate. Wear per working second is
 * the tick's (0.5 + load / 100) x lineOverdrive (UnifiedGameTick
 * advanceMachineWear); energy is getMachineEnergy, the function the bill uses.
 */
export function lineRatePerTonne(rate: number): { wear: number; energy: number } {
  const perTonne = (r: number) => {
    const mill = workingMill(r);
    const load = mill.metrics.load;
    return {
      wear: ((0.5 + load / 100) * lineOverdrive(r, OVERDRIVE_WEAR_SLOPE)) / r,
      energy: getMachineEnergy(mill, r) / r,
    };
  };
  if (!(rate > 0) || !Number.isFinite(rate)) return { wear: Number.NaN, energy: Number.NaN };
  const at = perTonne(rate);
  const rated = perTonne(1);
  return { wear: at.wear / rated.wear, energy: at.energy / rated.energy };
}
