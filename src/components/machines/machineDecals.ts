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
 * WHY EVERY PLACARD FACES +Z
 * ---------------------------------------------------------------------------
 * All four machine classes present their instrument face to +Z with no
 * rotation, so a `PlaneGeometry` - whose front face is +Z - can be placed by
 * translation alone. That removes the one decal failure mode that cannot be
 * caught without looking at the scene: a quad facing into the object it is
 * stuck to. The silo body is a CYLINDER and is deliberately given only two
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
import { MachineData } from '../../types';
import { POLYGON_OFFSET, SURFACE_LAYERS } from '../../constants/renderLayers';
import { createColorDataTexture } from '../../utils/textureGenerator';

// ===========================================================================
// ATLAS
// ===========================================================================

/** Cell edge in pixels. */
const CELL_PX = 128;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;
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
  inspectionSticker: 5,
  greasePoint: 6,
  electricalWarning: 7,
} as const;

export type DecalCell = (typeof DECAL_CELL)[keyof typeof DECAL_CELL];

type Rgba = readonly [number, number, number, number];
/** Paints one cell. `u`,`v` are 0-1 inside the padded area; v = 0 is the bottom. */
type CellPainter = (u: number, v: number) => Rgba;

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
const INSPECT_GREEN = opaque('#2e8b57');
const INSPECT_DARK = opaque('#14532d');
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

  // 5 - inspectionSticker.
  (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy);
    if (r > 0.47) return CLEAR;
    if (r > 0.4) return SIGN_WHITE;
    if (r < 0.1) return SIGN_WHITE;
    if (r > 0.2 && r < 0.38) {
      const angle = Math.atan2(dy, dx);
      const sector = angle / (Math.PI / 2);
      if (Math.abs(sector - Math.round(sector)) < 0.1) return INSPECT_DARK;
    }
    return INSPECT_GREEN;
  },

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

/** The placard atlas, built once on first use. 512 x 256, ~0.5 MB. */
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
export const MACHINE_DECAL_CACHE_KEY = 'machineDecal_v1';

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
 * e.g. the sifter placards at z+2.945 are the z+2.930 service-panel face plus
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
varying vec2 vDecalUv;`
    )
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
vDecalUv = aDecalUvRect.xy + uv * aDecalUvRect.zw;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec2 vDecalUv;`
    )
    .replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  diffuseColor *= texture2D( map, vDecalUv );
#endif`
    );
};

// ===========================================================================
// PLACEMENT
// ===========================================================================

export interface MachineDecalPlacement {
  /** World position of the quad centre. */
  readonly position: readonly [number, number, number];
  /** World width and height of the quad, in metres. */
  readonly size: readonly [number, number];
  readonly cell: DecalCell;
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
 *   sifter body front z+2.825 (x +/-3.25, y+0.145..3.495), service panel front
 *          z+2.93 (x +/-1.225, y+1.05..2.87), HMI screen x +/-0.41 y+1.95..2.45
 *   packer body front z+1.725, panel front z+1.81 (x +/-1.325, y+2.225..3.875),
 *          base front z+2.125 (x +/-2.25, y 0..0.56)
 *   silo   hatch front z+2.3325 (x +/-0.475, y+6.525..7.775); ladder rails sit
 *          at x +/-0.34 so the hatch placard is kept inside +/-0.17
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
    cell: DecalCell
  ) => {
    const [x, y, z] = machine.position;
    placements.push({
      position: [x + dx, y + dy, z + dz],
      size: [width, height],
      cell,
    });
  };

  subsets.silos.forEach((machine) => {
    // Nameplate on the drum, below the ladder foot (y+3.5). Half-width 0.30 m
    // gives a 20 mm sagitta against a 2.25 m radius.
    push(
      machine,
      0,
      3.0,
      SILO_SKIN_RADIUS + SURFACE_LAYERS.machineDecal,
      0.6,
      0.24,
      DECAL_CELL.namePlate
    );
    // Caution placard on the FLAT hatch cover, between the ladder rails.
    push(machine, 0, 7.15, 2.3425, 0.34, 0.34, DECAL_CELL.cautionTriangle);
  });

  subsets.mills.forEach((machine) => {
    push(machine, -1.15, 3.85, 1.995, 0.9, 0.3, DECAL_CELL.namePlate);
    push(machine, 0, 0.3, 2.215, 2.8, 0.3, DECAL_CELL.hazardChevron);
    // Clear of the recess (ends at x +/-1.825) and inside the body (+/-2.40).
    push(machine, 2.08, 3.4, 1.915, 0.42, 0.42, DECAL_CELL.electricalWarning);
  });

  subsets.sifters.forEach((machine) => {
    push(machine, -0.78, 2.62, 2.945, 0.82, 0.26, DECAL_CELL.namePlate);
    push(machine, 0.82, 1.45, 2.945, 0.36, 0.36, DECAL_CELL.cautionTriangle);
    // On the body below the service panel (which starts at y+1.05) and above
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
    THREE.InstancedBufferAttribute | undefined;
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
}

/** Exported for the invariant test. */
export const DECAL_ATLAS_SIZE = {
  width: ATLAS_W,
  height: ATLAS_H,
  cells: PAINTERS.length,
  padPx: CELL_PAD_PX,
} as const;
