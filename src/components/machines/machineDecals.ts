/**
 * Machine placards and hazard markings.
 *
 * A AAA industrial asset carries eight to fifteen readable surface events -
 * nameplates, hazard bands, lockout points, inspection stickers. The mill's
 * machines carried ZERO: the only text-like element anywhere on them was a flat
 * cyan quad standing in for an HMI screen. Nothing told the eye how big a
 * machine is, and without a size cue a 4.8 m roller mill reads as a toy block.
 *
 * ---------------------------------------------------------------------------
 * COST
 * ---------------------------------------------------------------------------
 * ONE extra draw call for the whole mill. Every placard on every machine is an
 * instance of a single `PlaneGeometry(1,1)` sharing one material and one atlas;
 * the cell each instance samples arrives as an `InstancedBufferAttribute` vec4
 * consumed by a small `onBeforeCompile` injection. Draw calls are the tight
 * constraint in this scene (1194 on the overview shot), so a per-decal mesh -
 * or a per-machine-class mesh - would have been the wrong shape.
 *
 * ---------------------------------------------------------------------------
 * PLACARD ORIENTATION
 * ---------------------------------------------------------------------------
 * All four machine classes present their instrument face to +Z with no
 * rotation, so a `PlaneGeometry` - whose front face is +Z - can be placed by
 * translation alone. The mill's side serial plate rotates to face -X and its
 * entire quad is ray-tested against the real inspection cover.
 * The silo body is a CYLINDER and is deliberately given only two
 * small placards; see `SILO_PLACARD_NOTE`.
 *
 * ---------------------------------------------------------------------------
 * ATLAS ORIENTATION
 * ---------------------------------------------------------------------------
 * `THREE.DataTexture` has `flipY = false`, and `PlaneGeometry` puts uv (0,0) at
 * the BOTTOM-left. So data row 0 is the bottom of the quad. The cell painters
 * below therefore treat v = 0 as DOWN, which is why the warning triangles point
 * towards v = 1.
 */

import * as THREE from 'three';
import { MachineData, MachineType } from '../../types';
import { getSiloAssemblyScale, SILO_ACCESS_LAYOUT } from '../../constants/siteLayout';
import { POLYGON_OFFSET, SURFACE_LAYERS } from '../../constants/renderLayers';
import { createColorDataTexture } from '../../utils/textureGenerator';
import { MILL_LOAD_DIAL } from './machineFinishGeometry';

// ===========================================================================
// ATLAS
// ===========================================================================

/** Cell edge in pixels. */
const CELL_PX = 128;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 3;
const ATLAS_W = CELL_PX * ATLAS_COLS;
const ATLAS_H = CELL_PX * ATLAS_ROWS;

/**
 * Transparent gutter inside each cell, in pixels.
 *
 * Without it the mip chain averages neighbouring cells together and a placard
 * picks up a halo of whatever is next to it in the atlas. Six pixels at 128 is
 * 4.7% of the cell - invisible on the quad, enough to keep the first three mip
 * levels clean.
 */
const CELL_PAD_PX = 6;

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
} as const;

export type DecalCell = (typeof DECAL_CELL)[keyof typeof DECAL_CELL];

type Rgba = readonly [number, number, number, number];
/** Paints one cell. `u`,`v` are 0-1 inside the padded area; v = 0 is the bottom. */
type CellPainter = (u: number, v: number) => Rgba;

const MILL_ID_CELLS: Readonly<Record<string, DecalCell>> = {
  'rm-101': DECAL_CELL.mill101,
  'rm-102': DECAL_CELL.mill102,
  'rm-103': DECAL_CELL.mill103,
  'rm-104': DECAL_CELL.mill104,
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

function millIdentityPlate(serial: string): CellPainter {
  const rows = letteringRows(serial);
  const rim = opaque('#bda573');
  const ink = opaque('#e2ce9e');
  const background = opaque('#1d3031');
  return (u, v) => {
    const edge = roundedRect(u, v, 0.06);
    if (edge > 0) return CLEAR;
    if (edge > -0.035) return rim;
    if ((u < 0.065 || u > 0.935) && (v < 0.16 || v > 0.84)) return PLATE_SCREW;
    const col = Math.floor(((u - 0.1) / 0.8) * rows[0].length);
    const row = Math.floor(((0.72 - v) / 0.44) * 7);
    return rows[row]?.[col] === '1' ? ink : background;
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
  millIdentityPlate('R.M.101'),
  millIdentityPlate('R.M.102'),
  millIdentityPlate('R.M.103'),
  millIdentityPlate('R.M.104'),
];

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

let atlasCache: THREE.DataTexture | null = null;

/** The placard atlas, built once on first use. 512 x 384, ~0.75 MB. */
export function getMachineDecalAtlas(): THREE.DataTexture {
  atlasCache ??= buildDecalAtlas();
  return atlasCache;
}

// ===========================================================================
// GEOMETRY, ATTRIBUTE AND MATERIAL
// ===========================================================================

export const MACHINE_DECAL_GEOMETRY = new THREE.PlaneGeometry(1, 1);

/**
 * Constant, per the CLAUDE.md ban on non-deterministic cache keys. Bump the
 * suffix by hand if the injected GLSL changes.
 */
export const MACHINE_DECAL_CACHE_KEY = 'machineDecal_v2';

/**
 * The placards are LIT, not `MeshBasicMaterial`. A basic material ignores the
 * scene entirely, so every placard would glow at full brightness inside a
 * shadowed machine recess and read as a sticker floating in front of the mill.
 *
 * `alphaTest` without `transparent` keeps them in the OPAQUE pass: no sort
 * order to get wrong, no blending, and they still write depth. The quads sit
 * `SURFACE_LAYERS.machineDecal` (15 mm) proud of a body face and
 * `SURFACE_LAYERS.machineRecessedPanel` (10 mm) proud of the silo hatch cover,
 * and `POLYGON_OFFSET.moderate` covers the rest.
 *
 * Only the silo nameplate below composes that standoff arithmetically
 * (`SILO_SKIN_RADIUS + SURFACE_LAYERS.machineDecal`). The remaining `push()`
 * calls carry ABSOLUTE face coordinates with the standoff already folded in -
 * e.g. the sifter placards at z+3.12 are the z+3.105 service-panel face plus
 * 15 mm - so they cannot be rewritten in terms of the constant without also
 * naming every face position. Registered as `machine-face-decals` in
 * `src/constants/depthRegistry.ts`.
 */
export const MACHINE_DECAL_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'machine-decal',
  map: getMachineDecalAtlas(),
  alphaTest: 0.35,
  roughness: 0.72,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.moderate.factor,
  polygonOffsetUnits: POLYGON_OFFSET.moderate.units,
});

MACHINE_DECAL_MATERIAL.customProgramCacheKey = () => MACHINE_DECAL_CACHE_KEY;
MACHINE_DECAL_MATERIAL.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec4 aDecalUvRect;
attribute float aDecalDialValue;
varying vec2 vDecalUv;
varying vec2 vDecalLocalUv;
varying float vDecalDialValue;`
    )
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
vDecalUv = aDecalUvRect.xy + uv * aDecalUvRect.zw;
vDecalLocalUv = uv;
vDecalDialValue = aDecalDialValue;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec2 vDecalUv;
varying vec2 vDecalLocalUv;
varying float vDecalDialValue;`
    )
    .replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  diffuseColor *= texture2D( map, vDecalUv );
#endif
if (vDecalDialValue > -1.5) {
  // Match the padded atlas painter's local coordinates.
  vec2 p = (vDecalLocalUv - vec2(0.5)) * ${CELL_PX / (CELL_PX - 2 * CELL_PAD_PX)};
  float ink;
  if (vDecalDialValue >= 0.0) {
    float angle = 3.926990817 - vDecalDialValue * 4.712388980;
    vec2 direction = vec2(cos(angle), sin(angle));
    float along = clamp(dot(p, direction), -0.045, 0.335);
    float distanceToNeedle = min(length(p - direction * along) - 0.009, length(p) - 0.032);
    float aa = max(fwidth(distanceToNeedle), 0.001);
    ink = 1.0 - smoothstep(-aa, aa, distanceToNeedle);
  } else {
    // Unavailable telemetry is a dash, never a fabricated zero reading.
    vec2 d = abs(p) - vec2(0.09, 0.012);
    float distanceToDash = max(d.x, d.y);
    float aa = max(fwidth(distanceToDash), 0.001);
    ink = 1.0 - smoothstep(-aa, aa, distanceToDash);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.016, 0.011), ink);
}`
    );
};

// ===========================================================================
// PLACEMENT
// ===========================================================================

export interface MachineDecalPlacement {
  /** Owning casing, used to keep placards attached during operating motion. */
  readonly machineId: string;
  /** World position of the quad centre. */
  readonly position: readonly [number, number, number];
  /** World width and height of the quad, in metres. */
  readonly size: readonly [number, number];
  readonly cell: DecalCell;
  /** Zero for front placards; the mill's side serial plate faces -X. */
  readonly rotationY?: number;
}

export interface MachineDecalSubsets {
  readonly silos: readonly MachineData[];
  readonly mills: readonly MachineData[];
  readonly sifters: readonly MachineData[];
  readonly packers: readonly MachineData[];
}

/**
 * SILO_PLACARD_NOTE. The silo body is a cylinder of radius 2.25 m, so a flat
 * quad laid on the tangent plane floats at its edges by
 * `r - sqrt(r^2 - (w/2)^2)`. At the 0.6 m nameplate that is 20 mm, which reads
 * as a bolted-on plate; at anything approaching a metre it reads as a mistake.
 * Silos therefore get exactly two small placards, one of which sits on the FLAT
 * hatch cover. Nothing wide goes on the drum.
 */
const SILO_SKIN_RADIUS = 2.25;

/**
 * Every offset below is relative to `machine.position` and was read off the
 * instance layout in `CompactMachines.tsx`, so each placard is checked against
 * the real bounds of the face it lands on:
 *
 *   mill   body front z+1.90 (x +/-2.40, y+0.35..5.05), base front z+2.20
 *          (x +/-2.60, y 0..0.64), recess front z+1.98 (x +/-1.825, y+1.47..4.17)
 *   sifter body front z+2.825, service panel front z+3.105
 *          (x -1.315..2.215, y+0.935..3.185), HMI screen x +/-0.41 y+1.95..2.45
 *   packer body front z+1.725, panel front z+1.81 (x +/-1.325, y+2.225..3.875),
 *          base front z+2.125 (x +/-2.25, y 0..0.56)
 *   silo   shared SILO_ACCESS_LAYOUT keeps the lower hatch and placards beside
 *          the ladder, tangent to the discharge enclosure.
 */
export function planMachineDecals(subsets: MachineDecalSubsets): MachineDecalPlacement[] {
  const placements: MachineDecalPlacement[] = [];

  const push = (
    machine: MachineData,
    dx: number,
    dy: number,
    dz: number,
    width: number,
    height: number,
    cell: DecalCell,
    rotationY = 0
  ) => {
    const [x, y, z] = machine.position;
    const scale =
      machine.type === MachineType.SILO ? getSiloAssemblyScale(machine.size) : [1, 1, 1];
    placements.push({
      machineId: machine.id,
      position: [x + dx * scale[0], y + dy * scale[1], z + dz * scale[2]],
      size: [width * scale[0], height * scale[1]],
      cell,
      rotationY,
    });
  };

  subsets.silos.forEach((machine) => {
    const angle = SILO_ACCESS_LAYOUT.hatchAngle;
    const place = (radius: number, height: number, width: number, sizeY: number, cell: DecalCell) =>
      push(
        machine,
        Math.sin(angle) * radius,
        height,
        Math.cos(angle) * radius,
        width,
        sizeY,
        cell,
        angle
      );
    place(
      SILO_SKIN_RADIUS + SURFACE_LAYERS.machineDecal,
      SILO_ACCESS_LAYOUT.nameplateY,
      0.45,
      0.14,
      DECAL_CELL.namePlate
    );
    // The caution plate follows the ground-level cover, clear of the ladder.
    place(
      SILO_ACCESS_LAYOUT.hatchRadius +
        SILO_ACCESS_LAYOUT.hatchSize[2] / 2 +
        SURFACE_LAYERS.machineDecal,
      SILO_ACCESS_LAYOUT.hatchCentreY,
      0.17,
      0.17,
      DECAL_CELL.cautionTriangle
    );
  });

  subsets.mills.forEach((machine) => {
    // The flat lower service strip keeps both placards off the cast shoulder.
    const identity = MILL_ID_CELLS[machine.id];
    push(
      machine,
      0,
      1.08,
      2.056,
      identity === undefined ? 0.9 : 1.25,
      0.3,
      identity ?? DECAL_CELL.namePlate
    );
    push(machine, 0, 0.3, 2.215, 2.8, 0.3, DECAL_CELL.hazardChevron);
    push(machine, 1.4, 1.08, 2.056, 0.25, 0.25, DECAL_CELL.electricalWarning);
    // Clear of the vents and cover bolts, on the real flat side inspection lid.
    // Working if the ray test finds a 16 mm plate-to-cover gap across its face.
    if (identity !== undefined)
      push(machine, -2.481, 3.0, 0.84, 1.12, 0.43, identity, -Math.PI / 2);
    push(
      machine,
      ...MILL_LOAD_DIAL.position,
      MILL_LOAD_DIAL.diameter,
      MILL_LOAD_DIAL.diameter,
      DECAL_CELL.motorLoadDial,
      -Math.PI / 2
    );
  });

  subsets.sifters.forEach((machine) => {
    push(machine, -0.78, 2.85, 3.12, 0.82, 0.26, DECAL_CELL.namePlate);
    push(machine, 0.82, 1.45, 3.12, 0.36, 0.36, DECAL_CELL.cautionTriangle);
    // On the body below the service panel (which starts at y+0.935) and above
    // the platform deck (which tops out at y+0.05).
    push(machine, 0, 0.62, 2.84, 4.2, 0.3, DECAL_CELL.hazardChevron);
  });

  subsets.packers.forEach((machine) => {
    push(machine, -0.62, 3.52, 1.825, 0.78, 0.26, DECAL_CELL.namePlate);
    push(machine, 0.86, 2.62, 1.825, 0.34, 0.34, DECAL_CELL.lockoutRoundel);
    // The filled sack travels across the middle of this band, which is exactly
    // what happens on a real bagging line.
    push(machine, 0, 0.3, 2.14, 3.2, 0.28, DECAL_CELL.hazardChevron);
  });

  return placements;
}

/** uv rect of one atlas cell: (u0, v0, du, dv). */
function cellRect(cell: DecalCell): readonly [number, number, number, number] {
  const col = cell % ATLAS_COLS;
  const row = Math.floor(cell / ATLAS_COLS);
  return [col / ATLAS_COLS, row / ATLAS_ROWS, 1 / ATLAS_COLS, 1 / ATLAS_ROWS];
}

/**
 * Size the `aDecalUvRect` attribute to the placement list and fill it.
 *
 * The attribute is rebuilt whenever the count changes rather than resized in
 * place: an `InstancedBufferAttribute` shorter than the mesh's instance count
 * is a GL error, and the machine roster is only rebuilt on a status change.
 */
export function writeDecalUvRects(
  geometry: THREE.BufferGeometry,
  placements: readonly MachineDecalPlacement[]
): void {
  const existing = geometry.getAttribute('aDecalUvRect') as
    | THREE.InstancedBufferAttribute
    | undefined;
  const attribute =
    existing && existing.count === placements.length
      ? existing
      : new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 4), 4);

  placements.forEach((placement, index) => {
    const [u0, v0, du, dv] = cellRect(placement.cell);
    attribute.setXYZW(index, u0, v0, du, dv);
  });
  attribute.needsUpdate = true;
  if (attribute !== existing) geometry.setAttribute('aDecalUvRect', attribute);

  const values = geometry.getAttribute('aDecalDialValue');
  if (!values || values.count !== placements.length) {
    geometry.setAttribute(
      'aDecalDialValue',
      new THREE.InstancedBufferAttribute(new Float32Array(placements.length).fill(-2), 1)
    );
  }
}

/**
 * Read the current roster, not the scene's status-only snapshots. Invalid
 * telemetry is explicitly unavailable. Working if a load-only update moves
 * its own needle, keeps other placards unchanged and allocates no new attribute.
 */
export function writeDecalDialReadings(
  geometry: THREE.BufferGeometry,
  placements: readonly MachineDecalPlacement[],
  machines: readonly MachineData[]
): void {
  const attribute = geometry.getAttribute('aDecalDialValue') as THREE.InstancedBufferAttribute;
  let changed = false;
  placements.forEach((placement, index) => {
    let value = -2;
    if (placement.cell === DECAL_CELL.motorLoadDial) {
      const load = machines.find((machine) => machine.id === placement.machineId)?.metrics?.load;
      value =
        typeof load === 'number' && Number.isFinite(load) && load >= 0 && load <= 100
          ? Math.fround(load / 100)
          : -1;
    }
    if (attribute.getX(index) !== value) {
      attribute.setX(index, value);
      changed = true;
    }
  });
  if (changed) attribute.needsUpdate = true;
}

/** Exported for the invariant test. */
export const DECAL_ATLAS_SIZE = {
  width: ATLAS_W,
  height: ATLAS_H,
  cells: PAINTERS.length,
  padPx: CELL_PAD_PX,
} as const;
