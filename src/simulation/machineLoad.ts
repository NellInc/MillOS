import type { MachineData } from '../types';

/** Resting temperature (C) per machine type, the offline model's base. */
export const MACHINE_BASE_TEMPERATURE_C: Readonly<Record<string, number>> = {
  SILO: 20,
  ROLLER_MILL: 42,
  PLANSIFTER: 28,
  PACKER: 28,
  CONTROL_ROOM: 22,
};

export const machineBaseTemperature = (type: string): number =>
  MACHINE_BASE_TEMPERATURE_C[type] ?? 30;

/**
 * A metric-only trip lifts to 'warning' once within this many degrees of its
 * type's base temperature (and under 2 mm/s), below the warning -> running
 * recovery line (55 C at least), so the unit then runs back up to 'running'.
 */
const TRIP_COOL_OFF_MARGIN_C = 5;

/**
 * Whether a tripped unit has cooled off enough to lift to 'warning'. Judged
 * against the type's own base temperature: a flat 40 C sat below a roller
 * mill's 42 C base. Types whose base + margin is under 40 C keep the 40 C line.
 * The offline model and the SCADA bridge (store.ts) both judge with this.
 */
export function tripHasCooledOff(type: string, temperature: number, vibration: number): boolean {
  return (
    temperature < Math.max(40, machineBaseTemperature(type) + TRIP_COOL_OFF_MARGIN_C) &&
    vibration < 2
  );
}

/** Units whose work is converting material: their feed is what they processed. */
const FED_UNIT_TYPES: ReadonlySet<string> = new Set(['ROLLER_MILL', 'PLANSIFTER', 'PACKER']);

/**
 * Whether a unit has feed to work. Only a mill, sifter or packer is judged,
 * on the material model's record (`isMachineUnfed`): a silo's discharge and the
 * control room are not conversions, so they never read unfed. Until a full
 * feed window is on record (a fresh session, a reload) the store judges from
 * the hopper, as the 3D pose does (machineMotion); a store without the getter
 * counts the unit as fed.
 */
export function unitHasFeed(
  machine: { id: string; type: MachineData['type'] },
  flow: { isMachineUnfed?: (machineId: string) => boolean } | undefined
): boolean {
  if (!FED_UNIT_TYPES.has(machine.type)) return true;
  return !(flow?.isMachineUnfed?.(machine.id) ?? false);
}

/**
 * Store-owned machine load in simulation mode: 50 + line rate * 30 while
 * running with feed, 0 when idle, on a 0% line or running with no feed, held
 * for a breakdown, eased 10% per update and snapped once within 0.5. The
 * SCADA bridge (store.ts) and the offline machine model
 * (MachineSimulationController) both use this one formula.
 * A 0% line rate once meant "paused" (the hold kept load where it was); pause
 * is the game clock now, and a 0% line feeds the rolls nothing, so its load
 * falls with its vibration and feed instead of freezing at the last rate's.
 * A unit with no feed (its order packed and waiting on dispatch, or the silos
 * dry) works nothing either, so it draws the same idle level (0) an idle unit
 * does, and the energy model bills it toward standby.
 * Working if: SCADA's feed-derived load (itself driven by this load) is never
 * written back, so mills hold ~80% at nominal pace instead of climbing to 100%.
 */
export function storeOwnedLoad(
  machine: { status: MachineData['status']; metrics: Pick<MachineData['metrics'], 'load'> },
  productionSpeed: number,
  /** Fraction of the gap closed this update; 0.1 is one standard step. */
  easeFraction = 0.1,
  /** False for a running unit with nothing to work (see unitHasFeed). */
  fed = true
): number {
  const current = machine.metrics.load;
  const isRunning =
    productionSpeed > 0 && (machine.status === 'running' || machine.status === 'warning');
  let target = current;
  if (isRunning) target = fed ? 50 + productionSpeed * 30 : 0;
  else if (machine.status !== 'critical') target = 0;
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  if (!Number.isFinite(current)) return Number.isFinite(target) ? clamp(target) : 0;
  const ease = Number.isFinite(easeFraction) ? Math.max(0, Math.min(1, easeFraction)) : 0.1;
  const next = current + (target - current) * ease;
  // Snap within 0.5: the offline model stores load at 0.1 resolution, and 10%
  // of the last 0.5 rounds straight back to 0.5, which stuck an idle unit there.
  // A paused sample (ease 0) moves nothing, so it never snaps.
  return clamp(ease > 0 && Math.abs(target - next) < 0.5 ? target : next);
}
