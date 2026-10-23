/**
 * The machine placard atlas: cell layout, painters and builder.
 *
 * Moved verbatim out of `machineDecals.ts`, whose placard material built the
 * atlas at module evaluation of the scene chunk (~0.17 s of main-thread work in
 * the startup profile). This module is free of React, DOM access and scene
 * geometry so the startup bake worker can build the atlas first. See
 * `machineDecals.ts` for the placard design notes and ATLAS ORIENTATION.
 */
import * as THREE from 'three';
import { createColorDataTexture, getTexture } from '../../utils/textureGenerator';

// ===========================================================================
// ATLAS
// ===========================================================================

/** Cell edge in pixels. */
export const CELL_PX = 128;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 6;
export const ATLAS_W = CELL_PX * ATLAS_COLS;
export const ATLAS_H = CELL_PX * ATLAS_ROWS;

/**
 * Transparent gutter inside each cell, in pixels.
 *
 * Without it the mip chain averages neighbouring cells together and a placard
 * picks up a halo of whatever is next to it in the atlas. Six pixels at 128 is
 * 4.7% of the cell - invisible on the quad, enough to keep the first three mip
 * levels clean.
 */
export const CELL_PAD_PX = 6;

/** 2x2 supersampling. Analytic edges alias badly at 128 px otherwise. */
const SUBSAMPLES = 2;

/** Index into the atlas. Row 0 is the BOTTOM row (see ATLAS ORIENTATION). */
export const DECAL_CELL = {
  hazardChevron: 0,
  cautionTriangle: 1,
  lockoutRoundel: 2,
  flowArrow: 3,
  namePlate: 4,
  motorLoadDial: 5,
  greasePoint: 6,
  electricalWarning: 7,
  mill101: 8,
  mill102: 9,
  mill103: 10,
  mill104: 11,
  siloAlpha: 12,
  siloBeta: 13,
  siloGamma: 14,
  siloDelta: 15,
  siloEpsilon: 16,
  sifterA: 17,
  sifterB: 18,
  sifterC: 19,
  packLine1: 20,
  packLine2: 21,
  packLine3: 22,
} as const;

export type DecalCell = (typeof DECAL_CELL)[keyof typeof DECAL_CELL];

type Rgba = readonly [number, number, number, number];
/** Paints one cell. `u`,`v` are 0-1 inside the padded area; v = 0 is the bottom. */
type CellPainter = (u: number, v: number) => Rgba;

export const MACHINE_ID_CELLS: Readonly<Record<string, DecalCell>> = {
  'rm-101': DECAL_CELL.mill101,
  'rm-102': DECAL_CELL.mill102,
  'rm-103': DECAL_CELL.mill103,
  'rm-104': DECAL_CELL.mill104,
  'silo-0': DECAL_CELL.siloAlpha,
  'silo-1': DECAL_CELL.siloBeta,
  'silo-2': DECAL_CELL.siloGamma,
  'silo-3': DECAL_CELL.siloDelta,
  'silo-4': DECAL_CELL.siloEpsilon,
  'sifter-a': DECAL_CELL.sifterA,
  'sifter-b': DECAL_CELL.sifterB,
  'sifter-c': DECAL_CELL.sifterC,
  'packer-0': DECAL_CELL.packLine1,
  'packer-1': DECAL_CELL.packLine2,
  'packer-2': DECAL_CELL.packLine3,
};

const CLEAR: Rgba = [0, 0, 0, 0];

const hexRgb = (hex: string): readonly [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const opaque = (hex: string): Rgba => {
  const [r, g, b] = hexRgb(hex);
  return [r, g, b, 255];
};

const HAZARD_YELLOW = opaque('#f0c419');
const HAZARD_BLACK = opaque('#181c1e');
const SIGN_WHITE = opaque('#eef2f3');
const SIGN_RED = opaque('#c0392b');
const PLATE_DARK = opaque('#2b3235');
const PLATE_EDGE = opaque('#8d979b');
const PLATE_TEXT = opaque('#cfd6d8');
const PLATE_SCREW = opaque('#6f797d');
const ARROW_BACK = opaque('#1f2a2e');
const ARROW_WHITE = opaque('#e8eef0');

/** Signed distance to a rounded rectangle spanning 0-1, negative inside. */
function roundedRect(u: number, v: number, radius: number): number {
  const dx = Math.abs(u - 0.5) - (0.5 - radius);
  const dy = Math.abs(v - 0.5) - (0.5 - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * Distance from (u,v) to the nearest edge of the triangle A-B-C, positive
 * inside. The vertices below are wound counter-clockwise so every edge function
 * is positive on the interior.
 */
function triangleDepth(
  u: number,
  v: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  const edge = (px: number, py: number, qx: number, qy: number): number => {
    const ex = qx - px;
    const ey = qy - py;
    const length = Math.hypot(ex, ey) || 1;
    return (ex * (v - py) - ey * (u - px)) / length;
  };
  return Math.min(edge(ax, ay, bx, by), edge(bx, by, cx, cy), edge(cx, cy, ax, ay));
}

/** Even-odd ray cast. Polygon is a flat [x0,y0,x1,y1,...] list. */
function pointInPolygon(u: number, v: number, polygon: readonly number[]): boolean {
  let inside = false;
  const count = polygon.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = polygon[i * 2];
    const yi = polygon[i * 2 + 1];
    const xj = polygon[j * 2];
    const yj = polygon[j * 2 + 1];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Warning-triangle geometry shared by the caution and electrical cells. */
const TRI = { ax: 0.5, ay: 0.96, bx: 0.05, by: 0.06, cx: 0.95, cy: 0.06 } as const;

function warningTriangle(u: number, v: number, glyph: (u: number, v: number) => boolean): Rgba {
  const depth = triangleDepth(u, v, TRI.ax, TRI.ay, TRI.bx, TRI.by, TRI.cx, TRI.cy);
  if (depth <= 0) return CLEAR;
  if (depth < 0.035) return HAZARD_BLACK;
  return glyph(u, v) ? HAZARD_BLACK : HAZARD_YELLOW;
}

/** Lightning bolt, drawn as one closed zigzag polygon. */
const BOLT = [0.58, 0.7, 0.4, 0.42, 0.5, 0.42, 0.42, 0.16, 0.62, 0.48, 0.51, 0.48];

/** Compact engraved lettering shared by serial plates and the instrument scale. */
const MACHINE_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  '.': ['0', '0', '0', '0', '0', '1', '1'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['010', '110', '010', '010', '010', '010', '111'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
};
const letteringRows = (text: string): string[] =>
  Array.from({ length: 7 }, (_, row) =>
    [...text].map((letter) => MACHINE_GLYPHS[letter][row]).join('0')
  );

/** Where an identity plate's lettering sits in its cell (v = 0 is the bottom). */
interface IdentityText {
  readonly mainTop: number;
  readonly mainHeight: number;
  /** Fraction of the cell width the main line spans; omitted, it is sized by its length. */
  readonly mainWidth?: number;
  readonly headingTop: number;
  readonly headingHeight: number;
}

const IDENTITY_TEXT: IdentityText = {
  mainTop: 0.81,
  mainHeight: 0.62,
  headingTop: 0.86,
  headingHeight: 0.2,
};
const HEADED_IDENTITY_TEXT: IdentityText = {
  mainTop: 0.53,
  mainHeight: 0.4,
  headingTop: 0.86,
  headingHeight: 0.2,
};

/**
 * The roller mills' plates, read by `millNameplates.test.ts`: "R.M." as a
 * caption over a large machine number. At real size (x0.4) the old one-line
 * 'R.M.101' was 10 px tall from the milling camera; the number alone, on a
 * plate the size of the side access cover, is 25 px on R.M. 101 and 15 px on
 * R.M. 102. Drawn for a plate about 0.64 as wide as it is tall, which keeps
 * the digits' pixels within 1.5:1 of square.
 */
export const MILL_IDENTITY_TEXT = {
  mainTop: 0.68,
  mainHeight: 0.42,
  mainWidth: 0.86,
  headingTop: 0.9,
  headingHeight: 0.14,
  /** Glyph columns in a three-digit machine number, spacing included. */
  mainColumns: letteringRows('101')[0].length,
} as const;

/** Painted, non-emissive identities at the retained physical plate positions.
 * Working if all standard roster tags read distinctly without adding a draw.
 */
function machineIdentityPlate(
  identity: string,
  heading?: string,
  layout: IdentityText = heading ? HEADED_IDENTITY_TEXT : IDENTITY_TEXT
): CellPainter {
  const rows = letteringRows(identity);
  const headingRows = heading ? letteringRows(heading) : null;
  const rim = opaque('#bda573');
  const ink = opaque('#f3e7ce');
  const background = opaque('#1d3031');
  const letterAt = (
    text: readonly string[],
    u: number,
    v: number,
    top: number,
    height: number,
    span?: number
  ) => {
    const width = span ?? Math.min(0.8, text[0].length * 0.028);
    const col = Math.floor(((u - (1 - width) / 2) / width) * text[0].length);
    const row = Math.floor(((top - v) / height) * 7);
    return text[row]?.[col] === '1';
  };
  return (u, v) => {
    const edge = roundedRect(u, v, 0.06);
    if (edge > 0) return CLEAR;
    if (edge > -0.035) return rim;
    if ((u < 0.065 || u > 0.935) && (v < 0.16 || v > 0.84)) return PLATE_SCREW;
    const main = letterAt(rows, u, v, layout.mainTop, layout.mainHeight, layout.mainWidth);
    const caption =
      headingRows && letterAt(headingRows, u, v, layout.headingTop, layout.headingHeight);
    return main || caption ? ink : background;
  };
}

/** Printed scale only. The needle comes from telemetry in the shared shader. */
const DIAL_INK = opaque('#242923');
const DIAL_PAPER = opaque('#ded8be');
const DIAL_LABELS = [
  { rows: letteringRows('0'), x: 0.255, y: 0.24, w: 0.065 },
  { rows: letteringRows('50'), x: 0.5, y: 0.775, w: 0.12 },
  { rows: letteringRows('100'), x: 0.735, y: 0.24, w: 0.155 },
  { rows: letteringRows('LOAD%'), x: 0.5, y: 0.36, w: 0.39 },
] as const;

function motorLoadDial(u: number, v: number): Rgba {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const radius = Math.hypot(dx, dy);
  if (radius > 0.47) return CLEAR;
  if (radius > 0.445) return DIAL_INK;
  // Zero is lower left, fifty is top, one hundred is lower right.
  const fraction = (Math.PI * 1.25 - Math.atan2(dy, dx)) / (Math.PI * 1.5);
  const wrapped = fraction > 1 ? fraction - 4 / 3 : fraction;
  const tick = Math.round(wrapped * 20);
  if (tick >= 0 && tick <= 20) {
    const angle = Math.PI * 1.25 - (tick / 20) * Math.PI * 1.5;
    const across = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (across < 0.008 && along > (tick % 5 === 0 ? 0.315 : 0.355) && along < 0.405)
      return DIAL_INK;
  }
  for (const label of DIAL_LABELS) {
    const col = Math.floor(((u - label.x) / label.w + 0.5) * label.rows[0].length);
    const row = Math.floor(((label.y - v) / 0.075 + 0.5) * label.rows.length);
    if (label.rows[row]?.[col] === '1') return DIAL_INK;
  }
  return DIAL_PAPER;
}

const PAINTERS: readonly CellPainter[] = [
  // 0 - hazardChevron.
  // Tuned for a band roughly 10:1 wide: the 9x weighting on u cancels that
  // stretch so the stripes land near 45 degrees in world space.
  (u, v) => {
    const t = (u * 9 + v) * 3;
    return t - Math.floor(t) < 0.5 ? HAZARD_YELLOW : HAZARD_BLACK;
  },

  // 1 - cautionTriangle: exclamation mark.
  (u, v) =>
    warningTriangle(
      u,
      v,
      (gu, gv) =>
        (Math.abs(gu - 0.5) < 0.055 && gv > 0.32 && gv < 0.64) ||
        (gu - 0.5) * (gu - 0.5) + (gv - 0.24) * (gv - 0.24) < 0.0036
    ),

  // 2 - lockoutRoundel: prohibition sign.
  (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5);
    if (r > 0.47) return CLEAR;
    if (r > 0.37) return SIGN_RED;
    // Distance to the 45-degree bar through the centre.
    const bar = Math.abs((u - 0.5 + (v - 0.5)) * Math.SQRT1_2);
    return bar < 0.055 ? SIGN_RED : SIGN_WHITE;
  },

  // 3 - flowArrow.
  (u, v) => {
    if (roundedRect(u, v, 0.12) > 0) return CLEAR;
    const shaft = u > 0.16 && u < 0.6 && Math.abs(v - 0.5) < 0.09;
    const head = triangleDepth(u, v, 0.88, 0.5, 0.55, 0.22, 0.55, 0.78) > 0;
    return shaft || head ? ARROW_WHITE : ARROW_BACK;
  },

  // 4 - namePlate: engraved plate, three text bars, four screws.
  (u, v) => {
    const d = roundedRect(u, v, 0.08);
    if (d > 0) return CLEAR;
    if (d > -0.04) return PLATE_EDGE;
    for (const [cx, cy] of [
      [0.08, 0.08],
      [0.92, 0.08],
      [0.08, 0.92],
      [0.92, 0.92],
    ]) {
      if (Math.hypot(u - cx, v - cy) < 0.035) return PLATE_SCREW;
    }
    const bars: readonly (readonly [number, number, number])[] = [
      [0.72, 0.12, 0.72],
      [0.5, 0.12, 0.86],
      [0.28, 0.12, 0.58],
    ];
    for (const [cy, u0, u1] of bars) {
      if (Math.abs(v - cy) < 0.04 && u > u0 && u < u1) return PLATE_TEXT;
    }
    return PLATE_DARK;
  },

  // 5 replaces the unused inspection-sticker cell. No atlas growth.
  motorLoadDial,

  // 6 - greasePoint.
  (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5);
    if (r > 0.42) return CLEAR;
    if (r > 0.34) return SIGN_WHITE;
    if (r < 0.28 && (Math.abs(u - 0.5) < 0.05 || Math.abs(v - 0.5) < 0.05)) return SIGN_WHITE;
    return SIGN_RED;
  },

  // 7 - electricalWarning: lightning bolt.
  (u, v) => warningTriangle(u, v, (gu, gv) => pointInPolygon(gu, gv, BOLT)),
  machineIdentityPlate('101', 'R.M.', MILL_IDENTITY_TEXT),
  machineIdentityPlate('102', 'R.M.', MILL_IDENTITY_TEXT),
  machineIdentityPlate('103', 'R.M.', MILL_IDENTITY_TEXT),
  machineIdentityPlate('104', 'R.M.', MILL_IDENTITY_TEXT),
  machineIdentityPlate('ALPHA', 'SILO'),
  machineIdentityPlate('BETA', 'SILO'),
  machineIdentityPlate('GAMMA', 'SILO'),
  machineIdentityPlate('DELTA', 'SILO'),
  machineIdentityPlate('EPSILON', 'SILO'),
  machineIdentityPlate('A', 'SIFTER'),
  machineIdentityPlate('B', 'SIFTER'),
  machineIdentityPlate('C', 'SIFTER'),
  machineIdentityPlate('LINE 1', 'PACK'),
  machineIdentityPlate('LINE 2', 'PACK'),
  machineIdentityPlate('LINE 3', 'PACK'),
];

/** Painted cells in the atlas (`DECAL_ATLAS_SIZE.cells`). */
export const DECAL_ATLAS_CELL_COUNT = PAINTERS.length;

function buildDecalAtlas(): THREE.DataTexture {
  const data = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const inner = CELL_PX - CELL_PAD_PX * 2;
  const step = 1 / SUBSAMPLES;
  const weight = 1 / (SUBSAMPLES * SUBSAMPLES);

  for (let cell = 0; cell < PAINTERS.length; cell += 1) {
    const paint = PAINTERS[cell];
    const col = cell % ATLAS_COLS;
    const row = Math.floor(cell / ATLAS_COLS);
    const originX = col * CELL_PX;
    const originY = row * CELL_PX;

    for (let py = 0; py < CELL_PX; py += 1) {
      for (let px = 0; px < CELL_PX; px += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
          for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
            const u = (px + (sx + 0.5) * step - CELL_PAD_PX) / inner;
            const v = (py + (sy + 0.5) * step - CELL_PAD_PX) / inner;
            const sample = u < 0 || u > 1 || v < 0 || v > 1 ? CLEAR : paint(u, v);
            // Premultiply before averaging so a transparent texel cannot drag
            // the colour of its neighbours towards black.
            const alpha = sample[3] / 255;
            r += sample[0] * alpha * weight;
            g += sample[1] * alpha * weight;
            b += sample[2] * alpha * weight;
            a += sample[3] * weight;
          }
        }
        const alpha = a / 255;
        const i = ((originY + py) * ATLAS_W + originX + px) * 4;
        // Un-premultiply: three expects straight alpha.
        data[i] = alpha > 0.001 ? Math.min(255, Math.round(r / alpha)) : 0;
        data[i + 1] = alpha > 0.001 ? Math.min(255, Math.round(g / alpha)) : 0;
        data[i + 2] = alpha > 0.001 ? Math.min(255, Math.round(b / alpha)) : 0;
        data[i + 3] = Math.round(a);
      }
    }
  }

  // Albedo with an alpha mask: sRGB. The transfer function does not touch the
  // alpha channel, so an RGBA mask is safe through `createColorDataTexture`.
  const texture = createColorDataTexture(data, ATLAS_W, ATLAS_H);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * One shared placard atlas, built once on first use. 512 x 768, 1.5 MiB before
 * mips. Cached by `getTexture` so the startup bake worker can build it and
 * seed the key before the scene chunk's placard material asks for it.
 */
export function getMachineDecalAtlas(): THREE.DataTexture {
  return getTexture('machine-decal-atlas-v2', buildDecalAtlas);
}
