/** Close-laid tumbled setts for village streets, courtyards and farm paving. */
import * as THREE from 'three';
import {
  getTexture,
  hash,
  createColorDataTexture,
  createLinearDataTexture,
} from '../utils/textureGenerator';

export interface CobblestoneOptions {
  stoneSize?: number; // Average stone size in pixels
  variation?: number;
  mortarColor?: string;
}
const DEFAULT_OPTIONS: Required<CobblestoneOptions> = {
  stoneSize: 24,
  variation: 0.5,
  mortarColor: '#595b55',
};
const STONE_COLORS = [
  [0.45, 0.44, 0.41],
  [0.49, 0.49, 0.46],
  [0.4, 0.42, 0.41],
  [0.43, 0.45, 0.45],
  [0.47, 0.45, 0.42],
] as const;
const wrap = (i: number, count: number) => ((i % count) + count) % count;
const smooth = (t: number) => t * t * (3 - 2 * t);
const byte = (value: number) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);

/** Periodic mineral grain, with a feature period of at least eight pixels on
 * the live colour map. Working if opposite tile samples agree without edge
 * blending that would ghost the laid joint network.
 */
function grain(u: number, v: number, count: number): number {
  const x = u * count,
    y = v * count;
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const sx = smooth(x - ix),
    sy = smooth(y - iy);
  const a = hash(wrap(ix, count), wrap(iy, count));
  const b = hash(wrap(ix + 1, count), wrap(iy, count));
  const c = hash(wrap(ix, count), wrap(iy + 1, count));
  const d = hash(wrap(ix + 1, count), wrap(iy + 1, count));
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy);
}

type SettSample = {
  stone: number;
  rise: number;
  slopeX: number;
  slopeY: number;
  tone: number;
  palette: number;
};

/** One boundary model drives all three maps. Even courses join the stagger at
 * the wrap; neighbouring stones use the same seeded joint, not independent
 * ellipses. Working if the colour mask, bevel normals and matte wear register
 * across resolutions, with narrow joints and no per-pixel allocation.
 */
function createSettSampler(size: number, stoneSize: number, variation: number) {
  let count = Math.max(2, Math.round(size / stoneSize));
  count += count % 2;
  const rowJoints = new Float64Array(count),
    joints = new Float64Array(count * count);
  const tones = new Float64Array(count * count),
    palettes = new Uint8Array(count * count);
  for (let row = 0; row < count; row++) {
    rowJoints[row] = (hash(19, row + 37) - 0.5) * variation * 0.16;
    for (let col = 0; col < count; col++) {
      const i = row * count + col;
      joints[i] = (hash(col + 13, row + 71) - 0.5) * variation * 0.3;
      tones[i] = (hash(col + 101, row + 53) - 0.5) * 0.04;
      palettes[i] = Math.floor(hash(col + 50, row + 50) * STONE_COLORS.length);
    }
  }
  const joint = (row: number, col: number) => joints[wrap(row, count) * count + wrap(col, count)];
  return (u: number, v: number, out: SettSample) => {
    const y = v * count;
    let row = Math.floor(y);
    if (y < row + rowJoints[wrap(row, count)]) row--;
    else if (y > row + 1 + rowJoints[wrap(row + 1, count)]) row++;
    const bottom = row + rowJoints[wrap(row, count)];
    const top = row + 1 + rowJoints[wrap(row + 1, count)];
    const x = u * count + (wrap(row, count) % 2) * 0.5;
    let col = Math.floor(x);
    if (x < col + joint(row, col)) col--;
    else if (x > col + 1 + joint(row, col + 1)) col++;
    const left = col + joint(row, col),
      right = col + 1 + joint(row, col + 1);
    const dx = x - (left + right) * 0.5,
      dy = y - (bottom + top) * 0.5;
    const halfX = (right - left) * 0.5 - 0.027,
      halfY = (top - bottom) * 0.5 - 0.027;
    const radius = 0.1 + variation * 0.05;
    const qx = Math.abs(dx) - halfX + radius,
      qy = Math.abs(dy) - halfY + radius;
    const ox = Math.max(0, qx),
      oy = Math.max(0, qy),
      length = Math.hypot(ox, oy);
    const distance = Math.min(Math.max(qx, qy), 0) + length - radius;
    const nx = length > 0 ? (Math.sign(dx) * ox) / length : qx > qy ? Math.sign(dx) : 0;
    const ny = length > 0 ? (Math.sign(dy) * oy) / length : qy >= qx ? Math.sign(dy) : 0;
    const t = THREE.MathUtils.clamp(-distance / 0.12, 0, 1);
    const rise = smooth(t),
      derivative = t > 0 && t < 1 ? (6 * t * (1 - t)) / 0.12 : 0;
    const radial = (dx / halfX) ** 2 + (dy / halfY) ** 2;
    const crown = Math.max(0, 1 - radial);
    const crownX = radial < 1 ? (-2 * dx) / (halfX * halfX) : 0;
    const crownY = radial < 1 ? (-2 * dy) / (halfY * halfY) : 0;
    out.stone = smooth(THREE.MathUtils.clamp((0.014 - distance) / 0.028, 0, 1));
    out.rise = rise;
    // Height is in cell widths: a .022-cell bevel is about3.4mm in the farm.
    out.slopeX = -(0.022 + 0.005 * crown) * derivative * nx + 0.005 * rise * crownX;
    out.slopeY = -(0.022 + 0.005 * crown) * derivative * ny + 0.005 * rise * crownY;
    const i = wrap(row, count) * count + wrap(col, count);
    out.tone = tones[i];
    out.palette = palettes[i];
  };
}
const sample = (): SettSample => ({ stone: 0, rise: 0, slopeX: 0, slopeY: 0, tone: 0, palette: 0 });

export const generateCobblestone = (
  size = 512,
  options: CobblestoneOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return getTexture(
    `cobblestone-v3-${size}-${opts.stoneSize}-${opts.variation}-${opts.mortarColor}`,
    () => {
      const data = new Uint8Array(size * size * 4);
      const mortar = [1, 3, 5].map((i) => parseInt(opts.mortarColor.slice(i, i + 2), 16) / 255);
      const at = createSettSampler(size, opts.stoneSize, opts.variation),
        cell = sample();
      const divisor = Math.max(1, size - 1);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const u = x / divisor,
            v = y / divisor;
          at(u, v, cell);
          const detail = (grain(u, v, 32) - 0.5) * 0.032 + (grain(u, v, 4) - 0.5) * 0.018;
          const colour = STONE_COLORS[cell.palette];
          const i = (y * size + x) * 4;
          for (let c = 0; c < 3; c++) {
            const face = (colour[c] + cell.tone + detail) * (0.91 + cell.rise * 0.09);
            data[i + c] = byte(THREE.MathUtils.lerp(mortar[c] + detail * 0.45, face, cell.stone));
          }
          data[i + 3] = 255;
        }
      return createColorDataTexture(data, size, size);
    }
  );
};

export const generateCobblestoneNormal = (size = 512, stoneSize = 24): THREE.DataTexture =>
  getTexture(`cobblestone-normal-v3-${size}-${stoneSize}`, () => {
    const data = new Uint8Array(size * size * 4);
    const at = createSettSampler(size, stoneSize, DEFAULT_OPTIONS.variation),
      cell = sample();
    const divisor = Math.max(1, size - 1);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        at(x / divisor, y / divisor, cell);
        const length = Math.hypot(cell.slopeX, cell.slopeY, 1),
          i = (y * size + x) * 4;
        data[i] = byte(0.5 - cell.slopeX / (2 * length));
        data[i + 1] = byte(0.5 - cell.slopeY / (2 * length));
        data[i + 2] = byte(0.5 + 1 / (2 * length));
        data[i + 3] = 255;
      }
    return createLinearDataTexture(data, size, size);
  });

export const generateCobblestoneRoughness = (size = 256, stoneSize = 24): THREE.DataTexture =>
  getTexture(`cobblestone-roughness-v3-${size}-${stoneSize}`, () => {
    const data = new Uint8Array(size * size * 4);
    const at = createSettSampler(size, stoneSize, DEFAULT_OPTIONS.variation),
      cell = sample();
    const divisor = Math.max(1, size - 1);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / divisor,
          v = y / divisor;
        at(u, v, cell);
        const wornStone = 0.7 + (1 - cell.rise) * 0.12 + cell.tone * 0.8;
        const roughness =
          THREE.MathUtils.lerp(0.95, wornStone, cell.stone) + (grain(u, v, 32) - 0.5) * 0.016;
        const value = byte(roughness),
          i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
      }
    return createLinearDataTexture(data, size, size);
  });
