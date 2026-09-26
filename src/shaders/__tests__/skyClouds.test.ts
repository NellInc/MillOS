import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CLOUD_NOISE_SIZE,
  CUMULUS_ATLAS_GLSL,
  SKY_CLOUD_GLSL,
  cloudCoverThreshold,
  sampleCloudNoise,
} from '../skyClouds';

describe('sky cloud noise', () => {
  it('tiles seamlessly on both axes', () => {
    // THE DEFECT THIS GUARDS. The dome projection walks off the edge of the
    // texture, so the sampler wraps. A field that does not tile puts a straight
    // line across the sky - the same class of artefact commit ff00221 removed
    // when it replaced the atan branch cut.
    for (let step = 0; step < 32; step += 1) {
      const t = step / 32;
      expect(sampleCloudNoise(0, t)).toBeCloseTo(sampleCloudNoise(1, t), 6);
      expect(sampleCloudNoise(t, 0)).toBeCloseTo(sampleCloudNoise(t, 1), 6);
      expect(sampleCloudNoise(-0.25, t)).toBeCloseTo(sampleCloudNoise(0.75, t), 6);
    }
  });

  it('is deterministic and spans the full unit range', () => {
    expect(sampleCloudNoise(0.31, 0.62)).toBe(sampleCloudNoise(0.31, 0.62));

    let minimum = Infinity;
    let maximum = -Infinity;
    for (let y = 0; y < CLOUD_NOISE_SIZE; y += 1) {
      for (let x = 0; x < CLOUD_NOISE_SIZE; x += 1) {
        const value = sampleCloudNoise(x / CLOUD_NOISE_SIZE, y / CLOUD_NOISE_SIZE);
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
      }
    }
    // Range matters: the coverage threshold slides across this distribution, so
    // a field clustered around 0.5 would make weather all-or-nothing.
    expect(minimum).toBeLessThan(0.02);
    expect(maximum).toBeGreaterThan(0.98);
  });

  it('turns cloud amount into coverage, so clear weather is sparse and opaque', () => {
    const clear = cloudCoverThreshold(0.2);
    const storm = cloudCoverThreshold(0.9);
    expect(storm).toBeLessThan(clear);

    const total = CLOUD_NOISE_SIZE * CLOUD_NOISE_SIZE;
    const coveredFraction = (threshold: number): number => {
      let covered = 0;
      for (let y = 0; y < CLOUD_NOISE_SIZE; y += 1) {
        for (let x = 0; x < CLOUD_NOISE_SIZE; x += 1) {
          if (sampleCloudNoise(x / CLOUD_NOISE_SIZE, y / CLOUD_NOISE_SIZE) > threshold) {
            covered += 1;
          }
        }
      }
      return covered / total;
    };

    // Clear weather must show real, separated clouds - not the 15% uniform
    // tint the six-term sin lattice produced - and a storm must close the sky.
    const clearCover = coveredFraction(clear);
    expect(clearCover).toBeGreaterThan(0.05);
    expect(clearCover).toBeLessThan(0.45);
    expect(coveredFraction(storm)).toBeGreaterThan(0.6);
  });

  it('keeps the branch-cut-free dome projection', () => {
    expect(SKY_CLOUD_GLSL).toContain('dir.xz / ( abs( dir.y ) + 0.12 ) * 0.65');
    expect(SKY_CLOUD_GLSL).not.toContain('atan(');
  });

  it('derives the shipping shader thresholds from the CPU coverage function', () => {
    expect(SKY_CLOUD_GLSL).toContain(
      `mix( ${cloudCoverThreshold(0).toFixed(2)}, ${cloudCoverThreshold(1).toFixed(2)}, clamp( cloudAmount`
    );
  });
});

describe('cumulus atlas contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('wraps both cell selection and atlas sampling at the azimuth seam', () => {
    const shader = CUMULUS_ATLAS_GLSL;
    const repeats = Number(shader.match(/longitude \* ([\d.]+)/)?.[1]);
    const modulus = Number(shader.match(/mod\( floor\( grid.x \), ([\d.]+)/)?.[1]);
    expect(repeats).toBeGreaterThan(0);
    expect(Number.isInteger(repeats)).toBe(true);
    expect(modulus).toBe(repeats);
    const wrap = (x: number) => ((x % repeats) + repeats) % repeats;
    for (const drift of [0, 0.13, 0.75, 1]) {
      const left = -0.5 * repeats + drift * repeats;
      const right = 0.5 * repeats + drift * repeats;
      expect(wrap(Math.floor(left))).toBe(wrap(Math.floor(right)));
      expect(left - Math.floor(left)).toBeCloseTo(right - Math.floor(right), 12);
    }
    expect(shader).toContain('uCloudAtlasReady < 0.5 || dir.y < -0.02 || dir.y > 0.90');
    expect(shader.indexOf('return vec4( 0.0 )')).toBeLessThan(shader.indexOf('atan('));
    expect(shader.match(/texture2D\(/g)).toHaveLength(1);
    expect(shader).not.toMatch(/\bfloat active\b/);
  });

  it('loads one shared colour-correct atlas and enables it only on success', async () => {
    vi.resetModules();
    let succeed: ((texture: THREE.Texture<HTMLImageElement>) => void) | undefined;
    const texture = new THREE.Texture<HTMLImageElement>();
    const load = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        succeed = onLoad;
        return texture;
      });
    const { getCumulusAtlas } = await import('../skyClouds');
    const atlas = getCumulusAtlas();
    expect(atlas.ready.value).toBe(0);
    expect(atlas.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(atlas.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(atlas.texture.generateMipmaps).toBe(true);
    expect(getCumulusAtlas()).toBe(atlas);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}textures/clouds-cumulus-v1.png`);
    succeed?.(texture);
    expect(atlas.ready.value).toBe(1);
  });

  it('retains the procedural fallback after a failed request without a retry loop', async () => {
    vi.resetModules();
    let fail: ((error: unknown) => void) | undefined;
    const load = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url, _ok, _progress, onError) => {
        fail = onError;
        return new THREE.Texture();
      });
    const { getCumulusAtlas } = await import('../skyClouds');
    const atlas = getCumulusAtlas();
    fail?.(new Error('Atlas unavailable'));
    expect(atlas.ready.value).toBe(0);
    expect(getCumulusAtlas()).toBe(atlas);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
