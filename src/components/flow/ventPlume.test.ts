import { describe, expect, it } from 'vitest';
import { STEAM_PUFF } from './vapourSprite';
import {
  MILL_LOUVRE_FACE_X,
  MILL_LOUVRE_THICKNESS,
  MILL_VENT_OFFSET,
  seedVentPuff,
  type VentKind,
} from './ventPlume';

/**
 * A point sprite is drawn at ONE depth, its centre's. Wherever its square
 * reaches past the casing plane it is cut off along that plane, so a puff that
 * drifts close to the louvred face paints a hard-edged white block over the
 * slats: the "pixelated white smear" on R.M.101 and R.M.103 (milling, interior
 * and forklift, final-med-12). The baseline drew the same puffs as hard discs.
 */
const HALF_FOV = (50 * Math.PI) / 360;
/** World radius of a sizeAttenuated point: size * tan(fov / 2) across. */
const spriteRadius = (size: number, life: number) =>
  (size * Math.tan(HALF_FOV) * (1 + 1.6 * life)) / 2;
/** Life advances 1.5x faster than plant time for steam, 1x for the rest. */
const lifeRate = (kind: VentKind) => (kind === 'steam' ? 1.5 : 1);
/** Worst case of the per-step lateral random walk, |dv| <= 0.25 per unit time. */
const walk = (s: number) => 0.125 * s * s;

const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('roller-mill vent plume', () => {
  const faceOuterX = MILL_LOUVRE_FACE_X - MILL_LOUVRE_THICKNESS / 2;
  const kinds: Array<[VentKind, number]> = [
    ['steam', STEAM_PUFF.size],
    ['exhaust', 0.2],
  ];

  it.each(kinds)('keeps every %s puff a sprite radius clear of the louvred face', (kind, size) => {
    const sources = [() => 0, () => 0.999999, lcg(7), lcg(1234)];
    let closest = Infinity;
    for (const source of sources) {
      for (let n = 0; n < 400; n++) {
        for (const initial of [true, false]) {
          const { position, velocity } = seedVentPuff(kind, initial, source);
          for (let life = 0; life < 0.95; life += 0.05) {
            const s = life / lifeRate(kind);
            const centreX = MILL_VENT_OFFSET[0] + position[0] + velocity[0] * s + walk(s);
            const clearance = faceOuterX - centreX - spriteRadius(size, life);
            closest = Math.min(closest, clearance);
          }
        }
      }
    }
    expect(closest).toBeGreaterThan(0);
  });

  it('issues the steam as one plume from the louvres, not a scattered cloud', () => {
    const random = lcg(99);
    for (let n = 0; n < 500; n++) {
      const { position } = seedVentPuff('steam', false, random);
      // Born at the vent mouth across the slats, not anywhere in a 0.5 m box.
      expect(Math.abs(position[0])).toBeLessThanOrEqual(0.06);
      expect(Math.abs(position[2])).toBeLessThanOrEqual(0.2);
    }
  });
});
