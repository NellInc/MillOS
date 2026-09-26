/**
 * Terrain-owned procedural surface textures.
 *
 * WHY THESE LIVE HERE AND NOT IN `src/textures/`
 * ----------------------------------------------
 * `src/textures/*` is the shared library consumed by machines, walls, village
 * and farm. Everything in this file is specific to the unified terrain shader:
 * the packing layout, the height-field centring and the tileability guarantees
 * below only make sense for `TerrainMaterial`. Keeping them local means the
 * terrain can change its packing without re-tuning twenty other materials.
 * The albedo maps the terrain shares with the rest of the site (grass, tarmac)
 * are still consumed from `PROCEDURAL_TEXTURES` - only the terrain-specific
 * surface data is generated here.
 *
 * PACKING (`*Surface` textures, RGBA, linear / NoColorSpace)
 *   R = tangent-space normal X, biased to 0..1
 *   G = tangent-space normal Y, biased to 0..1
 *   B = roughness
 *   A = surface height, re-centred so the channel mean is 0.5
 *
 * Ambient occlusion is NOT stored: the shader derives it from the height
 * channel, which is exactly what a separate channel would have contained. One
 * RGBA tap therefore yields normal + roughness + AO + blend height, which keeps
 * the terrain inside a comfortable fragment sampler budget. The height channel
 * is mean-centred on 0.5 for two reasons: the shader's AO remap must be
 * non-linear or the average texel would be occluded, and the height blend
 * compares the four channels against each other, which is only meaningful when
 * they share a datum. See TerrainMaterial.tsx.
 *
 * Note the shader samples these by hand, so the "roughness must be written to
 * green / metalness to blue" rule for three's built-in `roughnessMap` and
 * `metalnessMap` slots does not apply here - nothing in this file is ever
 * assigned to one of those slots.
 *
 * TILEABILITY IS MANDATORY HERE
 * The shared generators use `fbmNoise`/`voronoi`, which are not periodic, so a
 * tile boundary carries a small albedo discontinuity. That is tolerable in an
 * albedo map and fatal in a height/normal map: a seam becomes a hard lighting
 * line repeated every 6.5 world units. Every generator below therefore uses the
 * periodic `tileFbm` / `tileVoronoi` helpers and wraps its central differences.
 */

import * as THREE from 'three';
import {
  getTexture,
  createColorDataTexture,
  createLinearDataTexture,
} from '../../utils/textureGenerator';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const wrapInt = (value: number, period: number): number => {
  const m = value % period;
  return m < 0 ? m + period : m;
};

/**
 * Integer hash.
 *
 * Deliberately NOT the shared `hash()` from textureGenerator: that one is
 * `fract(sin(...) * 43758)`, and these generators need ~30 lattice samples per
 * texel across four textures. Measured on this machine, the trigonometric hash
 * cost 1.6s of main-thread time at first terrain mount - a visible hitch during
 * scene load. This integer mix is deterministic, uniform, and ~5x faster.
 */
const intHash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Periodic hash: identical at `x` and `x + period`, so lattices tile exactly. */
const tileHash = (x: number, y: number, period: number): number =>
  intHash(wrapInt(x, period), wrapInt(y, period));

/** Value noise on a periodic lattice of `period` cells across the texture. */
const tileValueNoise = (x: number, y: number, period: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = tileHash(ix, iy, period);
  const n10 = tileHash(ix + 1, iy, period);
  const n01 = tileHash(ix, iy + 1, period);
  const n11 = tileHash(ix + 1, iy + 1, period);

  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
};

/**
 * Tiling fBm. `cells` is the octave-0 lattice size in cells across the whole
 * texture and must be an integer; each octave doubles it, so every octave stays
 * periodic over the texture and the result wraps exactly.
 */
const tileFbm = (u: number, v: number, cells: number, octaves: number): number => {
  let value = 0;
  let amplitude = 0.5;
  let freq = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    const period = cells * freq;
    value += tileValueNoise(u * period, v * period, period) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    freq *= 2;
  }
  return value / maxValue;
};

/** Tiling Worley/voronoi over `cells` cells across the texture. */
const tileVoronoi = (u: number, v: number, cells: number): { dist: number; edge: number } => {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  let minDist = 8;
  let secondDist = 8;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const cx = tileHash(ix + ox, iy + oy, cells);
      const cy = tileHash(ix + ox + 101, iy + oy + 57, cells);
      const dx = ox + cx - fx;
      const dy = oy + cy - fy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  return { dist: minDist, edge: secondDist - minDist };
};

interface SurfaceSample {
  /** Relief height, any range - the builder re-centres and normalises it. */
  height: number;
  /** Perceptual roughness, 0..1. */
  roughness: number;
}

/**
 * Build a packed surface texture from a height/roughness field.
 *
 * The gradient is RMS-normalised to `targetSlope` rather than scaled by a hand
 * tuned bump constant, so the apparent relief is independent of `size` and of
 * the height field's absolute amplitude. That removes the usual "regenerate,
 * eyeball, retune" loop, which matters because this cannot be checked in a
 * browser from here.
 */
function buildSurfaceTexture(
  cacheKey: string,
  size: number,
  targetSlope: number,
  sample: (u: number, v: number) => SurfaceSample
): THREE.DataTexture {
  return getTexture(cacheKey, () => {
    const count = size * size;
    const heights = new Float32Array(count);
    const roughness = new Float32Array(count);

    let heightSum = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = sample((x + 0.5) / size, (y + 0.5) / size);
        const i = y * size + x;
        heights[i] = s.height;
        roughness[i] = s.roughness;
        heightSum += s.height;
      }
    }

    // Wrapped central differences. Wrapping is what keeps the normal map seam
    // free at the tile boundary; a clamped edge would leave a lit hairline.
    const gradX = new Float32Array(count);
    const gradY = new Float32Array(count);
    let sqSum = 0;
    for (let y = 0; y < size; y++) {
      const rowUp = ((y - 1 + size) % size) * size;
      const rowDown = ((y + 1) % size) * size;
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const left = (x - 1 + size) % size;
        const right = (x + 1) % size;
        const gx = (heights[row + right] - heights[row + left]) * 0.5;
        const gy = (heights[rowDown + x] - heights[rowUp + x]) * 0.5;
        gradX[row + x] = gx;
        gradY[row + x] = gy;
        sqSum += gx * gx + gy * gy;
      }
    }

    const rms = Math.sqrt(sqSum / Math.max(1, count));
    const slopeScale = targetSlope / Math.max(rms, 1e-6);
    // Re-centre the height channel on 0.5 so the shader can use it directly as
    // a signed second-scale detail term with no per-texture calibration.
    const heightShift = 0.5 - heightSum / Math.max(1, count);

    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      // OpenGL-convention tangent normal of a height field h(x, y):
      // n = normalize(-dh/dx, -dh/dy, 1). The terrain's tiling UV is world XZ,
      // so +U is world +X and +V is world +Z; the shader rebuilds the frame
      // from that assumption.
      const nx = -gradX[i] * slopeScale;
      const ny = -gradY[i] * slopeScale;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = i * 4;
      data[o] = Math.round(clamp01(nx * inv * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round(clamp01(ny * inv * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round(clamp01(roughness[i]) * 255);
      data[o + 3] = Math.round(clamp01(heights[i] + heightShift) * 255);
    }

    return createLinearDataTexture(data, size, size);
  });
}

/**
 * Grass relief: tussocks and irregular blade clusters.
 *
 * Feature periods at the default 256px: tussocks ~25.6px, clumps ~8px, blade
 * tufts ~11px - all above the ~4-6px floor below which detail aliases and
 * averages to a flat constant one mip down.
 */
export const generateGrassSurface = (size: number = 256): THREE.DataTexture =>
  // A 0.55 RMS slope made the 20-65 cm tuft field read as broken ground.
  // A same-page normal-only control isolated that coarse lighting pattern.
  // 0.12 keeps centimetre-scale leaf relief without terrain-sized ridges.
  // Working if the decoded slope stays near 0.12 at both generated resolutions.
  buildSurfaceTexture(`terrain-grass-surface-v4-${size}`, size, 0.12, (u, v) => {
    const tussock = tileFbm(u, v, 10, 3);
    const clump = tileFbm(u + 0.31, v + 0.17, 32, 2);
    // A two-dimensional tuft field preserves tileability without long comb rows.
    const tips = tileFbm(u + 0.23, v + 0.61, 22, 2);
    const thin = tileFbm(u + 0.71, v + 0.53, 6, 2);

    let height = 0.5 * tussock + 0.3 * clump + 0.2 * tips * (0.35 + 0.65 * tussock);
    // Worn/thin patches sit lower and pick up more soil.
    height -= Math.max(0, 0.42 - thin) * 0.5;

    // Blade tips catch light; cavities between tussocks stay matte.
    const roughness = 0.86 + (1 - clamp01(height)) * 0.09 + (tileFbm(u, v, 4, 2) - 0.5) * 0.03;

    return { height, roughness: clamp01(roughness) };
  });

/**
 * Asphalt relief: rounded aggregate proud of the binder, plus shrinkage cracks
 * and joint lines. Roughness carries a wide 0.66-0.95 spread because that
 * spread - not the albedo - is what makes asphalt read as asphalt.
 *
 * Feature periods at the default 256px: aggregate ~6.4px, binder grit ~4px,
 * crack cells ~36px.
 */
export const generateTarmacSurface = (size: number = 256): THREE.DataTexture =>
  buildSurfaceTexture(`terrain-tarmac-surface-v2-${size}`, size, 0.3, (u, v) => {
    const aggregate = tileVoronoi(u, v, 40);
    const stone = clamp01(1 - aggregate.dist * 1.9);
    const binder = tileFbm(u, v, 64, 2);
    const crack = tileVoronoi(u + 0.13, v + 0.61, 7);
    const crackDepth = crack.edge < 0.07 ? (0.07 - crack.edge) / 0.07 : 0;
    const polish = tileFbm(u + 0.44, v + 0.29, 5, 2);

    let height = 0.42 + stone * 0.42 + (binder - 0.5) * 0.16;
    height -= crackDepth * 0.45;

    let roughness = 0.9 + stone * 0.05;
    // Tyre-polished bands. Kept above 0.66 - a lower minimum on a plane this
    // large turns the single shadow-casting sun into a travelling hotspot.
    roughness -= Math.max(0, polish - 0.5) * 0.48;
    roughness -= crackDepth * 0.04;

    return { height, roughness: Math.max(0.66, Math.min(0.95, roughness)) };
  });

/**
 * Dirt / gravel verge relief: packed earth with embedded pebbles and rutting.
 * Feature periods at the default 256px: pebbles ~5.6px, ruts ~32px.
 */
export const generateDirtSurface = (size: number = 256): THREE.DataTexture =>
  buildSurfaceTexture(`terrain-dirt-surface-v2-${size}`, size, 0.45, (u, v) => {
    const pebble = tileVoronoi(u, v, 46);
    const stone = clamp01(1 - pebble.dist * 2.1);
    const earth = tileFbm(u, v, 8, 3);
    const rut = tileFbm(u + 0.23, v + 0.87, 5, 2);
    const grit = tileFbm(u + 0.66, v + 0.12, 40, 2);

    let height = 0.4 + stone * 0.38 + (earth - 0.5) * 0.3 + (grit - 0.5) * 0.1;
    height -= Math.max(0, rut - 0.58) * 0.6;

    // Damp ruts are smoother; dry gritty earth is very rough.
    const roughness = 0.94 - Math.max(0, rut - 0.58) * 0.22 + (grit - 0.5) * 0.04;

    return { height, roughness: Math.max(0.78, Math.min(0.99, roughness)) };
  });

/**
 * Dirt / gravel verge albedo. Warm packed earth with lighter aggregate and
 * damp patches. Authored in sRGB and tagged as such - `createColorDataTexture`
 * makes the GPU decode it, so this must NOT be pre-linearised.
 */
export const generateDirtGravel = (size: number = 256): THREE.DataTexture =>
  getTexture(`terrain-dirt-gravel-v2-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = (x + 0.5) / size;
        const v = (y + 0.5) / size;

        const earth = tileFbm(u, v, 8, 3);
        const grit = tileFbm(u + 0.66, v + 0.12, 40, 2);
        const damp = tileFbm(u + 0.23, v + 0.87, 5, 2);
        const pebble = tileVoronoi(u, v, 46);
        const stone = clamp01(1 - pebble.dist * 2.1);

        // Warm packed earth base, sRGB.
        let r = 0.3 + (earth - 0.5) * 0.13 + (grit - 0.5) * 0.06;
        let g = 0.24 + (earth - 0.5) * 0.11 + (grit - 0.5) * 0.05;
        let b = 0.17 + (earth - 0.5) * 0.08 + (grit - 0.5) * 0.04;

        // Pebbles: desaturated grey aggregate sitting in the earth.
        if (stone > 0.15) {
          const stoneTone = 0.42 + tileHash(Math.floor(u * 46), Math.floor(v * 46), 46) * 0.16;
          const blend = (stone - 0.15) * 1.1;
          r = r * (1 - blend) + stoneTone * blend;
          g = g * (1 - blend) + stoneTone * 0.97 * blend;
          b = b * (1 - blend) + stoneTone * 0.92 * blend;
        }

        // Damp ruts read darker and slightly cooler.
        const wet = Math.max(0, damp - 0.58) * 1.6;
        r *= 1 - wet * 0.3;
        g *= 1 - wet * 0.27;
        b *= 1 - wet * 0.18;

        data[i] = Math.round(clamp01(r) * 255);
        data[i + 1] = Math.round(clamp01(g) * 255);
        data[i + 2] = Math.round(clamp01(b) * 255);
        data[i + 3] = 255;
      }
    }

    return createColorDataTexture(data, size, size);
  });

/**
 * Spread the grass tile-break channel (macro alpha) is standardised to.
 *
 * This is NOT a free parameter. The shader applies that channel as
 * `albedo *= 1 + (macro.a - 0.5) * 0.55 * grassWeight`, and the 0.55 was
 * calibrated against the grass SURFACE height channel, which this channel
 * replaced in order to delete a whole texture tap. `generateGrassSurface(256)`
 * measures a height-channel spread of 0.1137, so matching it here is what keeps
 * the grass breakup at exactly the amplitude it was tuned at. Standardising to
 * the 0.22 the three control channels use would have made grass modulation 1.9x
 * stronger - a visible regression on tiers that were not meant to change.
 */
const MACRO_BREAK_STDDEV = 0.1137;

/** Spread of the three low-frequency control channels (dry / soil / hue). */
const MACRO_CONTROL_STDDEV = 0.22;

/**
 * Macro variation control map. Sampled at very large world scales (175 and 38
 * units), so a small map is ample and the taps stay resident in cache.
 *
 * R = dryness / lushness, G = soiling, B = hue drift, A = grass tile break.
 * Linear data, never sRGB: these are control values, not colour.
 *
 * WHY 256 AND NOT 128
 * R/G/B are sampled at 3-5 lattice cells across the map and would be happy at
 * 128. Alpha is not: it carries the grass tile-break that used to cost a second
 * texture tap, and it has to resolve features of roughly the grass tile's own
 * size. At the 175-unit far scale a 21-cell lattice is an 8.3-world-unit
 * feature, which is 12 px at 256 and only 6 px at 128 - at the aliasing floor
 * this file warns about everywhere else. The map is 256 KB; the tap it removes
 * is paid on every grass fragment of the largest surface in the frame.
 */
export const generateTerrainMacro = (size: number = 256): THREE.DataTexture =>
  getTexture(`terrain-macro-v5-${size}`, () => {
    const count = size * size;
    const channels: Float32Array[] = [
      new Float32Array(count),
      new Float32Array(count),
      new Float32Array(count),
      new Float32Array(count),
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = (x + 0.5) / size;
        const v = (y + 0.5) / size;
        channels[0][i] = tileFbm(u, v, 3, 3); // dryness / lushness
        channels[1][i] = tileFbm(u + 0.41, v + 0.19, 5, 3); // soiling
        channels[2][i] = tileFbm(u + 0.77, v + 0.63, 4, 2); // hue drift
        // Grass tile break. Deliberately a much finer lattice than the three
        // control channels: at the 175-unit far scale these two octaves land on
        // 8.3 and 4.2 world units, i.e. straddling the 6.5-unit grass albedo
        // tile, which is what stops the eye locking onto that tile. The whole
        // pattern only repeats every 175 units - 27 grass tiles, against the
        // 7.3 the old second-scale surface tap managed.
        channels[3][i] = tileFbm(u + 0.29, v + 0.83, 21, 2);
      }
    }

    const data = new Uint8Array(count * 4);
    // Standardise each channel to mean 0.5 / a known spread. fBm is only
    // *approximately* zero-mean, and at these deliberately tiny lattices (3-5
    // cells across the whole map) the sample mean drifts far enough that the
    // shader's `mix(dark, bright, channel)` would tint the entire 1.44M square
    // unit ground. Measuring beats assuming.
    // Defeating the 6.5-unit grass tile is this map's whole job, and the
    // shader's mix range only delivers what the data's spread asks for: at a
    // 0.16 spread `dry` mostly lives in 0.34-0.66 and the +/-22% range would
    // realise as barely +/-7%. The per-texel clamp still bounds the result, so
    // a wider spread costs nothing but a fraction of a percent of clipped tail.
    const targets = [
      MACRO_CONTROL_STDDEV,
      MACRO_CONTROL_STDDEV,
      MACRO_CONTROL_STDDEV,
      MACRO_BREAK_STDDEV,
    ];
    for (let c = 0; c < 4; c++) {
      const values = channels[c];
      let sum = 0;
      for (let i = 0; i < count; i++) sum += values[i];
      const mean = sum / count;
      let variance = 0;
      for (let i = 0; i < count; i++) {
        const d = values[i] - mean;
        variance += d * d;
      }
      const stdDev = Math.sqrt(variance / count);
      const gain = targets[c] / Math.max(stdDev, 1e-6);
      for (let i = 0; i < count; i++) {
        data[i * 4 + c] = Math.round(clamp01(0.5 + (values[i] - mean) * gain) * 255);
      }
    }

    return createLinearDataTexture(data, size, size);
  });
