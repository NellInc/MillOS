/**
 * The school bell's swing: a damped pendulum on its yoke, struck by a ring.
 *
 * Pure state, no React and no audio, so the ring/cooldown/decay contract is
 * testable and one owner (SchoolBell) can step it from `useFrame`.
 *
 * A ring is accepted at most once per `SCHOOL_BELL_COOLDOWN_S`. That is the
 * only guard against stacking, and it lives here rather than in a handler
 * because two input paths can fire for one physical click: in first person
 * the window mousedown activation and a stale-pointer R3F click can both
 * arrive, and spam-clicking in orbit view must not pile up swings or voices.
 */

/** Seconds after an accepted ring during which further rings are refused. */
export const SCHOOL_BELL_COOLDOWN_S = 1.4;
/** Natural angular frequency, rad/s: a ~0.5 m equivalent pendulum, period ~1.4 s. */
export const SCHOOL_BELL_OMEGA = 4.4;
/** Damping ratio: the swing dies away over a handful of periods. */
export const SCHOOL_BELL_DAMPING = 0.1;
/** Angular velocity a ring adds, rad/s (about 0.45 rad of swing from rest). */
export const SCHOOL_BELL_IMPULSE = 2.0;
/** Largest swing the belfry allows, rad (about 31 degrees). */
export const SCHOOL_BELL_MAX_ANGLE = 0.55;
/** The clapper hangs free inside the casting and lags the swing by this fraction. */
export const SCHOOL_BELL_CLAPPER_LAG = 0.55;
/** Below these the bell is at rest and the frame loop stops writing transforms. */
const REST_ANGLE = 1e-4;
const REST_VELOCITY = 1e-3;
/** Integration substep, s; frame deltas are split into steps no longer than this. */
const SUBSTEP = 1 / 120;
/** A frame longer than this (tab return, debugger) is treated as this long. */
const MAX_FRAME = 0.1;

export interface SchoolBellMotion {
  /** Swing about the yoke axis, rad; 0 hangs plumb. */
  angle: number;
  /** rad/s */
  velocity: number;
  /** Clock time (s) of the last accepted ring; -Infinity before the first. */
  lastRingAt: number;
  /** Accepted rings, for diagnostics and tests. */
  rings: number;
}

export const createSchoolBellMotion = (): SchoolBellMotion => ({
  angle: 0,
  velocity: 0,
  lastRingAt: Number.NEGATIVE_INFINITY,
  rings: 0,
});

/** True while a ring at `now` would be refused. */
export const isSchoolBellCoolingDown = (motion: SchoolBellMotion, now: number): boolean =>
  now - motion.lastRingAt < SCHOOL_BELL_COOLDOWN_S;

/**
 * Strike the bell at clock time `now` (seconds). Returns false, changing
 * nothing, inside the cooldown. The impulse follows the current swing so a
 * ring adds to the motion instead of reversing it, and the result is capped
 * at the energy of `SCHOOL_BELL_MAX_ANGLE`.
 */
export function ringSchoolBell(motion: SchoolBellMotion, now: number): boolean {
  if (!Number.isFinite(now) || isSchoolBellCoolingDown(motion, now)) return false;
  motion.lastRingAt = now;
  motion.rings += 1;
  const direction = motion.velocity < 0 ? -1 : 1;
  motion.velocity += direction * SCHOOL_BELL_IMPULSE;
  capEnergy(motion);
  return true;
}

/** Keep the swing's energy at or below that of a swing of MAX_ANGLE. */
function capEnergy(motion: SchoolBellMotion): void {
  const w2 = SCHOOL_BELL_OMEGA * SCHOOL_BELL_OMEGA;
  const max = w2 * (1 - Math.cos(SCHOOL_BELL_MAX_ANGLE));
  const potential = w2 * (1 - Math.cos(motion.angle));
  const kinetic = 0.5 * motion.velocity * motion.velocity;
  if (potential + kinetic <= max) return;
  const room = Math.max(0, max - potential);
  motion.velocity = Math.sign(motion.velocity) * Math.sqrt(2 * room);
  if (Math.abs(motion.angle) > SCHOOL_BELL_MAX_ANGLE) {
    motion.angle = Math.sign(motion.angle) * SCHOOL_BELL_MAX_ANGLE;
  }
}

/**
 * Advance the pendulum by `dt` seconds (semi-implicit Euler in fixed substeps).
 * Returns true while it is moving, false once it has come to rest.
 */
export function stepSchoolBell(motion: SchoolBellMotion, dt: number): boolean {
  if (!(dt > 0)) return !isAtRest(motion);
  if (isAtRest(motion)) {
    motion.angle = 0;
    motion.velocity = 0;
    return false;
  }
  let remaining = Math.min(dt, MAX_FRAME);
  const w2 = SCHOOL_BELL_OMEGA * SCHOOL_BELL_OMEGA;
  const c = 2 * SCHOOL_BELL_DAMPING * SCHOOL_BELL_OMEGA;
  while (remaining > 0) {
    const h = Math.min(SUBSTEP, remaining);
    remaining -= h;
    motion.velocity += (-w2 * Math.sin(motion.angle) - c * motion.velocity) * h;
    motion.angle += motion.velocity * h;
  }
  if (isAtRest(motion)) {
    motion.angle = 0;
    motion.velocity = 0;
    return false;
  }
  return true;
}

const isAtRest = (motion: SchoolBellMotion): boolean =>
  Math.abs(motion.angle) < REST_ANGLE && Math.abs(motion.velocity) < REST_VELOCITY;

/** The clapper's angle relative to the casting: it hangs back as the bell swings. */
export const schoolBellClapperAngle = (motion: SchoolBellMotion): number =>
  -motion.angle * SCHOOL_BELL_CLAPPER_LAG;
