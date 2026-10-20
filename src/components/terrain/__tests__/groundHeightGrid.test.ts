/**
 * `sampleTerrainGroundHeight` grounds every prop, path, tree and collider at
 * startup by reading the four corners of its terrain cell, and each corner is
 * a `sampleValleyRelief` call (~20 shape distances: the profiled `jd` rect SDF
 * in the main chunk, ~2.8 s). Corners are now remembered per segment count.
 * The heights must not change by a bit: golden hashes over 6,152 points per
 * segment count were taken on 3d2af742, before the change.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

type Generator = typeof import('../splatMapGenerator');

const GOLDEN_3D2AF742: Record<number, string> = {
  64: '9e42edc70077718f',
  128: '06f9d1c83c0790ff',
  96: 'cc9dbbcc9578a949',
};

/** Seeded scatter, every 64-grid vertex column, off-grid rows, the edges, -0 and NaN. */
function goldenPoints(): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 4000; i++) points.push([rand() * 1300 - 650, rand() * 1300 - 650]);
  for (let x = -600; x <= 600; x += 18.75)
    for (let z = -600; z <= 600; z += 37.5) points.push([x, z]);
  points.push([-0, -0], [0, -0], [-0, 0], [600, 600], [-600, -600], [601, 0], [Number.NaN, 0]);
  return points;
}

const heights = (generator: Generator, points: Array<[number, number]>, segments: number) =>
  new Float64Array(points.map(([x, z]) => generator.sampleTerrainGroundHeight(x, z, segments)));

const hash = (values: Float64Array) =>
  createHash('sha256').update(new Uint8Array(values.buffer)).digest('hex').slice(0, 16);

const fresh = async (): Promise<Generator> => {
  vi.resetModules();
  return import('../splatMapGenerator');
};

afterEach(() => vi.restoreAllMocks());

describe('terrain ground height at startup', () => {
  it('returns the pre-change heights to the bit, cold and remembered', async () => {
    const points = goldenPoints();
    for (const segments of [64, 128, 96]) {
      const generator = await fresh();
      const cold = heights(generator, points, segments);
      const warm = heights(generator, points, segments);
      expect(hash(cold), `segments ${segments}`).toBe(GOLDEN_3D2AF742[segments]);
      expect(hash(warm), `segments ${segments} again`).toBe(GOLDEN_3D2AF742[segments]);
    }
  }, 120_000);

  it('evaluates each grid vertex relief at most once', async () => {
    const generator = await fresh();
    // The relief's only smoothstep calls; ~7 per evaluation.
    const smoothstep = vi.spyOn(THREE.MathUtils, 'smoothstep');
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 2000; i++)
      points.push([-40 + (i % 50) * 1.7, 30 + Math.floor(i / 50) * 1.3]);
    const first = heights(generator, points, 64);
    const firstCalls = smoothstep.mock.calls.length;
    // 2,000 samples over a ~85 x 52 m patch touch a few dozen 18.75 m cells.
    expect(firstCalls).toBeGreaterThan(0);
    expect(firstCalls).toBeLessThan(points.length);
    const second = heights(generator, points, 64);
    expect(smoothstep.mock.calls.length).toBe(firstCalls);
    expect(second).toEqual(first);
  });

  it('keeps off-grid and non-integer segment counts on the direct path', async () => {
    const generator = await fresh();
    const points = goldenPoints().slice(0, 300);
    // 1e6 segments is past the remembered range; 64.5 is not a grid at all.
    for (const segments of [64.5, 1e6]) {
      const smoothstep = vi.spyOn(THREE.MathUtils, 'smoothstep');
      const once = heights(generator, points, segments);
      const calls = smoothstep.mock.calls.length;
      const twice = heights(generator, points, segments);
      expect(smoothstep.mock.calls.length).toBe(calls * 2);
      expect(twice).toEqual(once);
      smoothstep.mockRestore();
    }
  });
});
