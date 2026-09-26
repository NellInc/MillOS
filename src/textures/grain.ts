/**
 * Grain/Product Texture Generator
 *
 * For silos, flour sacks and product flow visualization.
 * A single kernel height field drives colour, normal and roughness so all
 * three maps stay registered pixel-for-pixel.
 */

import * as THREE from 'three';
import {
  getTexture,
  hash,
  fbmNoise,
  createColorDataTexture,
  createLinearDataTexture,
} from '../utils/textureGenerator';

export interface GrainColor {
  r: number;
  g: number;
  b: number;
}

// Default wheat color
const DEFAULT_GRAIN_COLOR: GrainColor = { r: 0.85, g: 0.75, b: 0.45 };

/** Cell edge in pixels. Kernel radius is 0.25 cells, so this must stay >= 8
 *  or the kernels fall under the ~4 px mip floor and average to flat colour. */
const CELL_SIZE = 8;

/**
 * Kernel height field, 0 (inter-kernel void) to 1 (kernel crown).
 *
 * Extracted so `generateGrainPattern`, `generateGrainNormal` and
 * `generateGrainRoughness` all read the SAME field: a normal map built from a
 * different field than the albedo it accompanies produces relief that does not
 * line up with the grains it is supposed to be lighting.
 */
export const buildGrainHeightField = (size: number, density: number): Float32Array => {
  const field = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cellX = Math.floor(x / CELL_SIZE);
      const cellY = Math.floor(y / CELL_SIZE);

      if (hash(cellX, cellY) >= density) continue;

      const localX = (x % CELL_SIZE) / CELL_SIZE;
      const localY = (y % CELL_SIZE) / CELL_SIZE;

      // Kernel center offset within cell
      const kernelX = 0.3 + hash(cellX + 1, cellY) * 0.4;
      const kernelY = 0.3 + hash(cellX, cellY + 1) * 0.4;

      const dx = localX - kernelX;
      const dy = (localY - kernelY) * 1.5; // Elongated, like a real kernel
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.25) {
        field[y * size + x] = 1 - dist / 0.25;
      }
    }
  }

  return field;
};

/** Wrapping 3x3 box blur. Kernels are only ~4 px across at 256, so raw central
 *  differences on the unfiltered field alias badly one mip down; one blur pass
 *  lifts the effective feature period above the mip floor. */
const blurField = (field: Float32Array, size: number): Float32Array => {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const sy = (y + oy + size) % size;
        for (let ox = -1; ox <= 1; ox++) {
          const sx = (x + ox + size) % size;
          sum += field[sy * size + sx];
        }
      }
      out[y * size + x] = sum / 9;
    }
  }
  return out;
};

/**
 * Generates grain particle texture for silos/product areas.
 *
 * `backgroundScale` sets how dark the inter-kernel void is relative to
 * `grainColor`. 0.3 reads as loose wheat in a bin; ~0.86 reads as woven sack
 * cloth with a faint granular speckle.
 *
 * NOTE: the cache key includes the colour. It previously did not, so the first
 * caller's palette was silently served to every later caller with a different
 * one.
 */
export const generateGrainPattern = (
  size: number = 256,
  density: number = 0.4,
  grainColor: GrainColor = DEFAULT_GRAIN_COLOR,
  backgroundScale: number = 0.3
): THREE.DataTexture => {
  const colorKey = `${grainColor.r}_${grainColor.g}_${grainColor.b}`;
  return getTexture(`grain-${size}-${density}-${colorKey}-${backgroundScale}`, () => {
    const data = new Uint8Array(size * size * 4);
    const height = buildGrainHeightField(size, density);

    const bgR = grainColor.r * backgroundScale;
    const bgG = grainColor.g * backgroundScale;
    const bgB = grainColor.b * backgroundScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        let r = bgR;
        let g = bgG;
        let b = bgB;

        const kernelIntensity = height[y * size + x];
        if (kernelIntensity > 0) {
          const cellX = Math.floor(x / CELL_SIZE);
          const cellY = Math.floor(y / CELL_SIZE);
          const colorVar = hash(cellX * 2, cellY * 2) * 0.2;

          r = grainColor.r * (0.8 + colorVar) * kernelIntensity + r * (1 - kernelIntensity);
          g = grainColor.g * (0.8 + colorVar) * kernelIntensity + g * (1 - kernelIntensity);
          b = grainColor.b * (0.8 + colorVar) * kernelIntensity + b * (1 - kernelIntensity);
        }

        // Add subtle noise
        const noise = fbmNoise(nx * 10, ny * 10, 2) * 0.1;
        r += noise;
        g += noise;
        b += noise;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    // sRGB: these are hand-authored albedo bytes, not linear radiance.
    return createColorDataTexture(data, size, size);
  });
};

/**
 * Tangent-space normal map for the same kernel field.
 * Signed central differences, X and Y independent, packed (n*0.5+0.5).
 */
export const generateGrainNormal = (
  size: number = 256,
  density: number = 0.4,
  amplitude: number = 1.2
): THREE.DataTexture => {
  return getTexture(`grain-normal-${size}-${density}-${amplitude}`, () => {
    const data = new Uint8Array(size * size * 4);
    const height = blurField(buildGrainHeightField(size, density), size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;
        const ym = (y - 1 + size) % size;
        const yp = (y + 1) % size;

        // Central differences -> signed slope. Unsigned noise here would tilt
        // every texel the same way and cancel the relief.
        const dhdx = (height[y * size + xp] - height[y * size + xm]) * amplitude;
        const dhdy = (height[yp * size + x] - height[ym * size + x]) * amplitude;

        const nxv = -dhdx;
        const nyv = -dhdy;
        const nzv = 1;
        const len = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv);

        // Round, not floor: truncation biases every channel half an LSB, which
        // is exactly the kind of constant tilt a signed normal map exists to
        // avoid.
        data[i] = Math.round(((nxv / len) * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round(((nyv / len) * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round(((nzv / len) * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }

    // Linear: normals are data, never colour.
    return createLinearDataTexture(data, size, size);
  });
};

/**
 * Roughness map for the same kernel field.
 *
 * Written to R, G AND B: three reads `roughnessMap.g` (and `metalnessMap.b`).
 * An R-only roughness map multiplies material roughness by zero.
 */
export const generateGrainRoughness = (
  size: number = 256,
  density: number = 0.4
): THREE.DataTexture => {
  return getTexture(`grain-roughness-${size}-${density}`, () => {
    const data = new Uint8Array(size * size * 4);
    const height = buildGrainHeightField(size, density);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const crown = height[y * size + x];
        // Voids are dusty and fully diffuse; kernel crowns keep a faint waxy sheen.
        const roughness = 0.94 - crown * 0.22;
        const byte = Math.floor(Math.max(0, Math.min(1, roughness)) * 255);
        data[i] = byte;
        data[i + 1] = byte;
        data[i + 2] = byte;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};

// === FLOUR SACK PRESET ==================================================
// One place for the sack parameters so the runtime consumer and the idle-time
// preloader request byte-identical cache keys. A mismatch here means the sack
// maps are generated on the main thread at conveyor mount instead.

const FLOUR_SACK_SIZE = 256;
/**
 * A complete cloth panel per authored UV face. Broad gathered creases carry
 * at belt distance; the eight-pixel weave and sewn hems resolve up close.
 * Loose-grain maps remain separate, so bin contents keep their kernel relief.
 */
const FLOUR_SACK_COLOR: GrainColor = { r: 0.9, g: 0.86, b: 0.76 };

export interface GrainMapSet {
  map: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
}

/** Albedo, normal and roughness share one field and the existing texture cache. */
export const getFlourSackMaps = (): GrainMapSet => {
  const size = FLOUR_SACK_SIZE;
  const profile = (u: number, v: number) => {
    const edge = Math.min(u, 1 - u);
    const creaseAt = 0.07 + 0.022 * Math.sin(v * Math.PI * 6);
    const crease = Math.exp(-(((edge - creaseAt) / 0.025) ** 2));
    const hem = Math.exp(-(((Math.min(v, 1 - v) - 0.065) / 0.014) ** 2));
    const weave = Math.cos(u * Math.PI * 64) * Math.cos(v * Math.PI * 64);
    const stitch = hem * Math.max(0, Math.cos(u * Math.PI * 64));
    return {
      crease,
      hem,
      weave,
      stitch,
      height: weave * 0.1 - crease * 0.8 + hem * 0.7 + stitch * 0.2,
    };
  };
  const make = (channel: 'map' | 'normal' | 'roughness') =>
    getTexture(`sack-cloth-v2-${channel}-${size}`, () => {
      const data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const { crease, hem, weave, stitch } = profile(u, v);
          const i = (y * size + x) * 4;
          if (channel === 'map') {
            const tone = 0.97 + weave * 0.012 - crease * 0.08 - hem * 0.025 - stitch * 0.06;
            data[i] = Math.round(FLOUR_SACK_COLOR.r * tone * 255);
            data[i + 1] = Math.round(FLOUR_SACK_COLOR.g * tone * 255);
            data[i + 2] = Math.round(FLOUR_SACK_COLOR.b * tone * 255);
          } else if (channel === 'normal') {
            const dx = profile(u + 1 / size, v).height - profile(u - 1 / size, v).height;
            const dy = profile(u, v + 1 / size).height - profile(u, v - 1 / size).height;
            const length = Math.hypot(dx, dy, 1);
            data[i] = Math.round((0.5 - (dx / length) * 0.5) * 255);
            data[i + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
            data[i + 2] = Math.round((0.5 + 0.5 / length) * 255);
          } else {
            const value = Math.round((0.91 + crease * 0.035 + hem * 0.025 + weave * 0.02) * 255);
            data[i] = data[i + 1] = data[i + 2] = value;
          }
          data[i + 3] = 255;
        }
      }
      return channel === 'map'
        ? createColorDataTexture(data, size, size)
        : createLinearDataTexture(data, size, size);
    });
  return { map: make('map'), normal: make('normal'), roughness: make('roughness') };
};

/** Single ink plate, with transparent cloth between letters. No fixed weight:
 * each bag's actual 25-30 kg value remains in its existing batch tooltip. */
export const getFlourSackPrint = (): THREE.DataTexture =>
  getTexture('sack-flour-print-v1', () => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    const paint = (x: number, y: number, width: number, height: number) => {
      for (let j = y; j < y + height; j++) {
        for (let i = x; i < x + width; i++) {
          const offset = (j * size + i) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 255;
          data[offset + 3] = 255;
        }
      }
    };
    const letters = [
      ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
      ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
      ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
      ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
      ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    ];
    letters.forEach((rows, letter) =>
      rows.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          if (pixel === '1') paint(20 + letter * 18 + x * 3, 75 - y * 3, 3, 3);
        });
      })
    );
    // Small printed wheat ear and two rules, broad enough to survive mipmaps.
    paint(62, 84, 3, 25);
    for (let row = 0; row < 3; row++) {
      paint(54, 87 + row * 7, 7, 4);
      paint(66, 90 + row * 7, 7, 4);
    }
    paint(22, 43, 84, 3);
    paint(22, 31, 84, 3);
    return createColorDataTexture(data, size, size);
  });
