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
