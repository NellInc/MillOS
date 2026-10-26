import { sampleAmbientSequence } from './ambientWorld';

/** Stable timing identity; bounded rates preserve the species' authored character. */
export function creatureCadence(seed: number): number {
  return 0.88 + sampleAmbientSequence(seed, 17) * 0.24;
}

/** Heading-aware travel, with no target overshoot or backwards sliding on a turn. */
export function creatureTravelDistance(
  distanceToTarget: number,
  headingError: number,
  delta: number,
  speed: number
): number {
  return Math.min(
    Math.max(0, distanceToTarget),
    Math.max(0, speed * delta) * Math.max(0, Math.cos(headingError))
  );
}

/** Consume only the travel this driver applied, never an external teleport/reset. */
export function advanceCreatureStride(
  phase: number,
  distance: number,
  radiansPerMetre: number
): number {
  return (phase + Math.max(0, distance) * radiansPerMetre) % (Math.PI * 2);
}

/** Model metres per cycle. The farm driver divides world travel by instance scale. */
export const QUADRUPED_WALK = {
  cow: { cycle: 0.55, lift: 0.065, speed: 0.5 },
  pig: { cycle: 0.18, lift: 0.022, speed: 0.34 },
} as const;

export interface HoofStep {
  forward: number;
  lift: number;
}

/**
 * Four distinct footfalls: left hind, left fore, right hind, right fore.
 * During stance the hoof travels backwards by exactly the consumed model
 * distance. The short return arc has matching endpoint velocities and no
 * vertical cusp. Starts, turns and the owner's amplitude easing are not a
 * promise of world-space foot locking.
 */
export function sampleHoofStep(
  species: keyof typeof QUADRUPED_WALK,
  leg: number,
  phase: number,
  out: HoofStep
): HoofStep {
  const spec = QUADRUPED_WALK[species];
  const offset = leg < 2 ? leg * 0.5 : 0.25 + (leg - 2) * 0.5;
  const p = ((((Number.isFinite(phase) ? phase : 0) / (Math.PI * 2) + offset) % 1) + 1) % 1;
  const stance = 0.68;
  const half = (spec.cycle * stance) / 2;
  out.forward = half - spec.cycle * p;
  out.lift = 0;
  if (p > stance) {
    const u = (p - stance) / (1 - stance);
    const ease = u * u * (3 - 2 * u);
    out.forward = -half + half * 2 * ease - spec.cycle * (1 - stance) * u * (1 - u) * (1 - 2 * u);
    out.lift = spec.lift * Math.sin(u * Math.PI) ** 2;
  }
  return out;
}

/** Match the authored 15 Hz blend while remaining stable across dropped frames. */
export function creaturePoseBlend(authoredBlend: number, elapsed: number): number {
  return 1 - Math.pow(1 - authoredBlend, Math.max(0, elapsed) * 15);
}

/** Keep the entire .5m-radius generated ripple inside its measured 1.28m pool. */
export function fountainRippleScale(phase: number, poolRadius: number, ringRadius: number): number {
  return 1 + Math.max(0, Math.min(1, phase)) * (poolRadius / ringRadius - 1);
}

/** Individual forage bouts with quiet, head-up rests; never changes navigation. */
export function creatureForageWeight(time: number, seed: number): number {
  const period = 30 + sampleAmbientSequence(seed, 31) * 18;
  const phase = ((Math.max(0, time) / period + sampleAmbientSequence(seed, 32)) % 1) * period;
  const feedingEnd = period * 0.7;
  const ramp = Math.max(0, Math.min(1, phase / 2, (feedingEnd - phase) / 2));
  return ramp * ramp * (3 - 2 * ramp);
}

/** A brief look left or right, separated by long still intervals. */
export function creaturePerchLook(time: number, seed: number): number {
  const period = 15 + sampleAmbientSequence(seed, 41) * 9;
  const phase = (Math.max(0, time) + sampleAmbientSequence(seed, 42) * period) % period;
  return phase < 4
    ? Math.sin((phase / 4) * Math.PI) ** 2 * (sampleAmbientSequence(seed, 43) < 0.5 ? -0.4 : 0.4)
    : 0;
}

export interface HorseRestPose {
  breath: number;
  leftEar: number;
  rightEar: number;
  tail: number;
}

export const createHorseRestPose = (): HorseRestPose => ({
  breath: 0,
  leftEar: 0,
  rightEar: 0,
  tail: 0,
});

/** Existing owner time only: brief attention, long still dwells, no wall clock. */
export function sampleHorseRest(time: number, seed: number, out: HorseRestPose): HorseRestPose {
  out.breath = out.leftEar = out.rightEar = out.tail = 0;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const cadence = creatureCadence(identity);
  const pulse = (period: number, delay: number, duration: number) => {
    const phase = (time * cadence) % period;
    return phase > delay && phase < delay + duration
      ? Math.sin(((phase - delay) / duration) * Math.PI) ** 2
      : 0;
  };
  out.breath = Math.sin((time * cadence * Math.PI * 2) / 4.7);
  out.leftEar = pulse(12.5, 2.5 + sampleAmbientSequence(identity, 61) * 2, 0.9);
  out.rightEar = pulse(16.5, 6.5 + sampleAmbientSequence(identity, 62) * 2, 1.2);
  const tailPhase = (time * cadence) % 21;
  const tailDelay = 10 + sampleAmbientSequence(identity, 63) * 2;
  const tailProgress = (tailPhase - tailDelay) / 2.6;
  if (tailProgress > 0 && tailProgress < 1)
    out.tail = Math.sin(tailProgress * Math.PI) ** 2 * Math.sin(tailProgress * Math.PI * 2);
  return out;
}

export type SheepRestPose = Pick<HorseRestPose, 'breath' | 'leftEar' | 'rightEar'>;
export const createSheepRestPose = (): SheepRestPose => ({ breath: 0, leftEar: 0, rightEar: 0 });

/** Quiet flank breathing and separate ear attention, driven by admitted farm time. */
export function sampleSheepRest(time: number, seed: number, out: SheepRestPose): SheepRestPose {
  out.breath = out.leftEar = out.rightEar = 0;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const t = time * creatureCadence(identity);
  const onset = Math.min(1, t / 0.7);
  out.breath =
    Math.sin((t * Math.PI * 2) / 3.9 + sampleAmbientSequence(identity, 71) * Math.PI * 2) *
    onset *
    onset *
    (3 - 2 * onset);
  const left = ((t % 13) - 2 - sampleAmbientSequence(identity, 72) * 3) / 1.1;
  const right = ((t % 17) - 7 - sampleAmbientSequence(identity, 73) * 3) / 1.3;
  if (left > 0 && left < 1) out.leftEar = Math.sin(left * Math.PI) ** 2;
  if (right > 0 && right < 1) out.rightEar = Math.sin(right * Math.PI) ** 2;
  return out;
}

/** Short swims and long dabbling stops, always within 0.4 m of the authored anchor. */
export function duckSwimPose(time: number, seed: number) {
  const period = 44 + sampleAmbientSequence(seed, 51) * 18;
  const offset = sampleAmbientSequence(seed, 52) * period;
  const sample = (seconds: number) => {
    const phase = ((Math.max(0, seconds) + offset) % period) / period;
    const progress = Math.min(1, phase / 0.62);
    const angle = progress * progress * (3 - 2 * progress) * Math.PI * 2;
    return { x: Math.sin(angle) * 0.2, z: Math.cos(angle) * 0.2, angle, swimming: phase < 0.62 };
  };
  const start = sample(0);
  const current = sample(time);
  const progress = Math.min(1, ((Math.max(0, time) + offset) % period) / (period * 0.62));
  return {
    x: current.x - start.x,
    z: current.z - start.z,
    heading: Math.PI / 2 + current.angle,
    swimming: current.swimming,
    // Derivative of the retained circle, in metres per admitted duck-clock second.
    speed: current.swimming
      ? (0.2 * 6 * progress * (1 - progress) * Math.PI * 2) / (period * 0.62)
      : 0,
  };
}

export const createDuckWaterLife = () => ({
  look: 0,
  opacity: 0,
  scale: 0.5,
  stretch: 1,
  aft: 0.08,
});

/** Water contact follows admitted travel/bill motion, never an independent clock.
 * Working if stationary head-up birds leave no foam and each wrap is invisible.
 */
export function sampleDuckWaterLife(
  time: number,
  seed: number,
  swim: Pick<ReturnType<typeof duckSwimPose>, 'swimming' | 'speed'>,
  dabble: number,
  out: ReturnType<typeof createDuckWaterLife>
) {
  out.look = out.opacity = 0;
  out.scale = 0.5;
  out.stretch = 1;
  out.aft = 0.08;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const phase = (time * 0.48 + sampleAmbientSequence(identity, 84)) % 1;
  const travel = Number.isFinite(swim.speed) ? Math.max(0, Math.min(1, swim.speed / 0.06)) : 0;
  const bill = Number.isFinite(dabble) ? Math.max(0, Math.min(1, (dabble - 0.55) / 0.35)) : 0;
  const billContact = bill * bill * (3 - 2 * bill);
  const look = swim.swimming
    ? 0
    : creaturePerchLook(time, identity + 900) * 0.45 * (1 - billContact);
  out.look = look === 0 ? 0 : look;
  out.opacity = 0.17 * Math.max(travel, billContact * 0.8) * Math.sin(phase * Math.PI) ** 2;
  out.scale = 0.5 + phase * 1.15;
  out.stretch = 1 + travel * 0.25;
  // A swim leaves stern contact; a stopped feeding bird disturbs water at its bill.
  out.aft = 0.08 + travel * 0.18 - billContact * (1 - travel) * 0.3;
  return out;
}
