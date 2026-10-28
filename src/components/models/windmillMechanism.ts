import type { Vector3 } from 'three';
import type { WindmillLearningStage } from '../../stores/windmillLearningStore';

/** Illustrative tooth counts, sharing the exterior sail's signed angle. */
export const angularRatios = { crown: 1, upright: -3, stoneNut: 12, runner: 12, bed: 0 } as const;
export const gearContacts = {
  crown: { teeth: 48, pitchRadius: 0.066, phase: Math.PI / 48 },
  wallower: { teeth: 16, pitchRadius: 0.022, phase: 0 },
  spur: { teeth: 64, pitchRadius: 0.064, phase: Math.PI / 64 },
  stoneNut: { teeth: 16, pitchRadius: 0.016, phase: 0 },
} as const;

/** Raw GLB frame; callers transform the result once into component metres. */
export function sampleGrainPath(stage: WindmillLearningStage, t: number, out: Vector3): Vector3 {
  const u = Math.min(1, Math.max(0, t));
  if (stage === 'power') return out.set(0.02, -0.085, 0.031);
  if (stage === 'feed') {
    return out.set(0.02 + 0.012 * (1 - u), -0.085 - 0.088 * u, 0.031);
  }
  if (stage === 'grind') {
    const r = 0.008 + 0.059 * u;
    const a = u * Math.PI * 2 + Math.PI / 2;
    return out.set(0.02 + Math.cos(a) * r, -0.195, 0.031 + Math.sin(a) * r);
  }
  // The outer edge discharges through the casing into a front-side meal spout.
  if (u < 0.35) {
    const v = u / 0.35;
    return out.set(0.02 + 0.067 * v, -0.195 - 0.025 * v, 0.098);
  }
  const v = (u - 0.35) / 0.65;
  return out.set(0.087, -0.22 - 0.145 * v, 0.098);
}

/** Flow advances with the clockwise (negative) sail angle and wraps with it. */
export function grainPhase(angle: number, index: number): number {
  return ((((-angle / (Math.PI * 2)) * 3 + index / 24) % 1) + 1) % 1;
}
