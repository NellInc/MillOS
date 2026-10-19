/**
 * Product-flow visuals on the plant clock.
 *
 * Belts, sacks, rollers, grain in the spouts and the hum that goes with them
 * are plant motion (see pace.ts): they stop with the shift clock, run four
 * times as fast at 4x, and follow the machines they connect. Before this they
 * ran on wall time times the line setpoint, so they kept moving under P and
 * kept streaming product past a broken packer.
 *
 * Machine state is read from the one source CompactMachines already animates
 * from: `getMachineOperationalState(status, materialFlow buffer)`.
 * Working if every belt, sack and grain particle is still while the clock is
 * held and moves at `plantTimeScale(gameSpeed)` times its authored rate.
 */

import type { MachineBuffer } from '../stores/materialFlowStore';
import { getMachineOperationalState, type MachineOperationalState } from './machineMotion';
import { plantTimeScale } from './pace';

/** Largest frame step a flow visual integrates; a hidden tab resumes as one frame. */
export const MAX_FLOW_FRAME_SECONDS = 0.1;

export function clampFrameDelta(delta: number): number {
  return Number.isFinite(delta) && delta > 0 ? Math.min(delta, MAX_FLOW_FRAME_SECONDS) : 0;
}

/**
 * The rate every line visual runs at, as a multiple of its authored speed:
 * the line setpoint times plant time per real second, and 0 under any clock
 * hold or safety hold.
 */
export function lineMotionRate(
  productionSpeed: number,
  gameSpeed: number,
  safetyHold: boolean
): number {
  if (safetyHold || !Number.isFinite(productionSpeed) || productionSpeed <= 0) return 0;
  return productionSpeed * plantTimeScale(gameSpeed);
}

/**
 * Exponential approach over PLANT seconds, so an ease that is half-way when the
 * clock is held stays half-way rather than drifting to its target while paused.
 */
export function easeToward(
  current: number,
  target: number,
  plantSeconds: number,
  timeConstantSeconds: number
): number {
  if (!(plantSeconds > 0)) return current;
  const next =
    target + (current - target) * Math.exp(-plantSeconds / Math.max(1e-3, timeConstantSeconds));
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** The operational state of one machine, or null while the roster lacks it. */
export function machineFlowState(
  machineId: string,
  machines: ReadonlyArray<{ id: string; status: string }>,
  buffers: ReadonlyMap<string, MachineBuffer>
): MachineOperationalState | null {
  const machine = machines.find((candidate) => candidate.id === machineId);
  return machine ? getMachineOperationalState(machine.status, buffers.get(machineId)) : null;
}

/**
 * Product leaves a machine only while it is operating. An unknown state (the
 * roster has not loaded) keeps the authored flow rather than inventing a stop.
 */
export function isMachineDischarging(state: MachineOperationalState | null): boolean {
  return state === null || state === 'operating';
}

/** A machine that is broken or switched off takes no more product. */
export function isMachineAccepting(state: MachineOperationalState | null): boolean {
  return state !== 'faulted' && state !== 'stopped';
}

export function isSpoutRouteFlowing(
  from: MachineOperationalState | null,
  to: MachineOperationalState | null
): boolean {
  return isMachineDischarging(from) && isMachineAccepting(to);
}
