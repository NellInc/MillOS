import { plantTimeScale } from '../../simulation/pace';
import { TRUCK_LIMITS } from './truckController';

/** The truck controller's fixed step, in plant seconds. */
export const TRUCK_CONTROLLER_STEP_SECONDS = 1 / 60;

// The per-frame budget is set by how far the truck can travel, not by a flat
// time. From its current speed under the controller's strongest longitudinal
// limit, the longest frame that keeps travel within the display bound is the
// root of |v|t + a t^2 / 2 = bound. At standard pace and the speed ceiling that
// is about 80 ms; at rest or docked it reaches one 0.5 s tick interval. A
// faster pace legitimately moves the truck faster, so the bound scales with it.
// Time beyond the budget is CARRIED, never dropped: a slow frame leaves the
// truck behind for a few frames instead of letting the clock outrun the yard.
// Working if a slow machine's docking and loading keep pace with the clock and
// material at every pace, and per-frame travel at 1x stays below the 1.5 m
// motion gate after a stall.
const MAXIMUM_TRUCK_DISPLAY_TRAVEL_METRES = 1.44;
const MINIMUM_TRUCK_CONTROLLER_DELTA_SECONDS = 0.08;
const MAXIMUM_TRUCK_CONTROLLER_DELTA_SECONDS = 0.5;
// Carried time is bounded so a hidden or frozen tab cannot bank minutes of
// motion. This is only reached below about 2 FPS.
export const MAXIMUM_TRUCK_CARRIED_SECONDS = 10;

export function truckControllerDeltaCap(speedMps: number, gameSpeed: number): number {
  const scale = Math.max(1, plantTimeScale(gameSpeed));
  const speed = Number.isFinite(speedMps)
    ? Math.min(TRUCK_LIMITS.maximumForwardSpeed, Math.abs(speedMps))
    : TRUCK_LIMITS.maximumForwardSpeed;
  const a = TRUCK_LIMITS.maximumDeceleration;
  const bound = MAXIMUM_TRUCK_DISPLAY_TRAVEL_METRES * scale;
  const seconds = (-speed + Math.sqrt(speed * speed + 2 * a * bound)) / a;
  return Math.min(
    MAXIMUM_TRUCK_CONTROLLER_DELTA_SECONDS * scale,
    Math.max(MINIMUM_TRUCK_CONTROLLER_DELTA_SECONDS, seconds)
  );
}

export interface TruckClockAdvance {
  /** Whole controller steps to run this frame. */
  readonly steps: number;
  /** Plant seconds still owed after those steps, including any carried debt. */
  readonly accumulator: number;
  /** Interpolation fraction for display, within [0, 1]. */
  readonly alpha: number;
}

/**
 * Convert one render frame into truck controller steps on plant time.
 * `accumulator` is the plant time owed from earlier frames.
 */
export function advanceTruckClock(
  accumulator: number,
  renderDeltaSeconds: number,
  gameSpeed: number,
  speedMps: number
): TruckClockAdvance {
  const owed =
    Math.max(0, Number.isFinite(accumulator) ? accumulator : 0) +
    Math.max(0, Number.isFinite(renderDeltaSeconds) ? renderDeltaSeconds : 0) *
      plantTimeScale(gameSpeed);
  const carried = Math.min(owed, MAXIMUM_TRUCK_CARRIED_SECONDS);
  const budget = Math.min(carried, truckControllerDeltaCap(speedMps, gameSpeed));
  const steps = Math.floor(budget / TRUCK_CONTROLLER_STEP_SECONDS + 1e-9);
  const remaining = Math.max(0, carried - steps * TRUCK_CONTROLLER_STEP_SECONDS);
  return {
    steps,
    accumulator: remaining,
    alpha: Math.min(1, remaining / TRUCK_CONTROLLER_STEP_SECONDS),
  };
}
