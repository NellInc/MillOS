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
  return {
    x: current.x - start.x,
    z: current.z - start.z,
    heading: Math.PI / 2 + current.angle,
    swimming: current.swimming,
  };
}
