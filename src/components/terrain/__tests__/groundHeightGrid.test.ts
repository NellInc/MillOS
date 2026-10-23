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

/**
 * NaN is hashed as one canonical pattern. An arithmetic NaN carries the sign
 * bit on x64 (0xFFF8...) but not on arm64 (0x7FF8...), so the `[NaN, 0]` point
 * alone moved the raw hash between a Mac and the Linux CI runner while every
 * height matched to the bit.
 */
const hash = (values: Float64Array) => {
  const bits = new DataView(values.buffer);
  values.forEach((value, i) => {
    if (Number.isNaN(value)) bits.setBigUint64(i * 8, 0x7ff8000000000000n, true);
  });
  return createHash('sha256').update(new Uint8Array(values.buffer)).digest('hex').slice(0, 16);
};

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

  it('displaces the terrain meshes from the same remembered vertices, to the bit', async () => {
    // Golden position/normal hashes of `createDisplacedGeometry`, taken on 0b899e77.
    const GOLDEN_0B899E77: Record<string, string> = {
      '1200-64': '5a3834252c293f81 11a076aea86963c5',
      '1200-128': '3a94e604d770a017 0a59cd0b0020b624',
      // Not laid over TERRAIN_BOUNDS' grid: every vertex takes the direct path.
      '1000-50': '335afe065f30feb7 f7ff7dd5ec3f550c',
    };
    const generator = await fresh();
    const { createDisplacedGeometry } = await import('../TerrainGround');
    const { TERRAIN_BOUNDS } = await import('../terrainTypes');
    const field = generator.getRiverHeightfield(generator.MILLOS_RIVER_CONFIG);
    const build = (size: number, segments: number) =>
      createDisplacedGeometry(
        size,
        size,
        segments,
        field.data,
        field.resolution,
        generator.MILLOS_RIVER_CONFIG.depth,
        TERRAIN_BOUNDS
      );
    const digest = (array: ArrayLike<number>) =>
      createHash('sha256')
        .update(new Uint8Array(new Float32Array(array).buffer))
        .digest('hex')
        .slice(0, 16);
    for (const [size, segments] of [
      [1200, 64],
      [1200, 128],
      [1000, 50],
    ]) {
      const smoothstep = vi.spyOn(THREE.MathUtils, 'smoothstep');
      const first = build(size, segments);
      const firstCalls = smoothstep.mock.calls.length;
      const second = build(size, segments);
      const secondCalls = smoothstep.mock.calls.length - firstCalls;
      smoothstep.mockRestore();
      for (const geometry of [first, second])
        expect(
          `${digest(geometry.getAttribute('position').array)} ${digest(geometry.getAttribute('normal').array)}`,
          `${size}-${segments}`
        ).toBe(GOLDEN_0B899E77[`${size}-${segments}`]);
      // The proof the sharing rests on: every float32 vertex coordinate of the
      // 1200 m meshes IS the grid's double, sign of zero included.
      const p = new THREE.PlaneGeometry(size, size, segments, segments).getAttribute('position');
      const step = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
      let onGrid = 0;
      for (let i = 0; i < p.count; i++)
        if (
          Object.is(p.getX(i), TERRAIN_BOUNDS.minX + (i % (segments + 1)) * step) &&
          Object.is(-p.getY(i), TERRAIN_BOUNDS.minZ + Math.floor(i / (segments + 1)) * step)
        )
          onGrid++;
      if (size === 1200) {
        expect(onGrid).toBe(p.count);
        expect(secondCalls, `${size}-${segments} repeat`).toBe(0);
      } else {
        expect(onGrid).toBe(1);
        expect(secondCalls).toBeGreaterThan(firstCalls / 2);
      }
    }
  }, 120_000);

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
