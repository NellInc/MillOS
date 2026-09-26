import { GeneratedBoundary } from '../models/GeneratedModel';
import { GeneratedGeometrySurface } from '../models/GeneratedGeometrySurface';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import { SITE_LAYOUT, PROCESS_GALLERY_POST_X } from '../../constants/siteLayout';
import { FIXTURE_GRID_X, FIXTURE_GRID_Z } from '../environment/InteriorLightRig';
import { isPostProcessingActive, useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { hash } from '../../utils/textureGenerator';
import { generateMachineORM } from '../../textures/brushedMetal';
import { generateConcrete } from '../../textures/concrete';
import {
  generateMachinePanelNormal,
  generateProceduralNormal,
} from '../../textures/normalGenerator';
import {
  applyWorldSurface,
  type WorldSurfaceOverrides,
  type WorldSurfaceProfileName,
} from '../../utils/worldSurface';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
/**
 * The dock safety bollard, and nothing else in this file.
 *
 * Drawn at [0.24, 1.3, 0.24] through a four-instance `InstancedMesh`: a 0.48 m
 * post standing 1.3 m out of the slab, flanking both dock approaches. It is
 * read at the range a truck or a forklift passes it - roughly 3 to 10 m - not
 * from across the site.
 *
 * It was `CylinderGeometry(1, 1, 1, 16)`, a flat-topped tube. A tube is the one
 * thing a bollard is not, and no segment count fixes that. Three features carry
 * at that range, and all three are in this profile:
 *
 *   - A GROUT COLLAR: a short vertical wall at the envelope's max radius with a
 *     chamfered top. It plants a hard horizontal line where the post meets the
 *     floor instead of letting the tube run into it.
 *   - A LONG PLAIN SHAFT, 0.392 m across and 0.73 m of it unbroken - thinner
 *     than the collar, and the step is the point. So is the length: the plain
 *     run has to dominate. Previewed with two bands spread down the shaft as
 *     well, and that reads as a fire hydrant; one band does not.
 *   - ONE BAND standing 30 mm PROUD at 70% of the height, then a seat lip under
 *     a shallow pressed dome cap. The shared safety-yellow material carries no
 *     map, so a painted stripe would be invisible - a proud band survives on the
 *     SILHOUETTE, which is the only channel this part has. A near-hemispherical
 *     cap merges with the shaft into a bullet nose, so the cap is deliberately
 *     shallow and the seat lip is what keeps it reading as a separate part.
 *
 * The profile is designed in metres and divided down, because the instance
 * scale is 5.4:1 anisotropic - a cap drawn hemispherical in unit space renders
 * as a vertical spike.
 *
 * ENVELOPE IDENTICAL to the cylinder it replaces: radius 1.0 at the collar rim,
 * y in [-0.5, 0.5]. Every instance matrix and neighbour relationship is
 * untouched, and the shaft narrowing to 0.392 m mates with nothing - the nearest
 * portal jamb is 2.2 m away.
 *
 * 20 segments is a multiple of 4, so a vertex lands on each of +/-X and +/-Z and
 * the post measures its nominal radius in plan; it also holds the flat-of-facet
 * error on the shaft to 2.4 mm. One shared module-level geometry behind one
 * `InstancedMesh`, so 357 vertices (up from 100) is a one-off scene cost at any
 * instance count. The mesh carries no pointer handlers and no custom raycast, so
 * no picking proxy is needed - compare `raycastSiloShell` in
 * `machines/CompactMachines.tsx`, where densifying a picked mesh cost 6.6 ms.
 */
function createPortalBollardGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.5), // underside centre - keeps the mesh watertight
    new THREE.Vector2(1.0, -0.5), // collar rim - envelope max radius
    new THREE.Vector2(1.0, -0.45769), // collar wall, vertical
    new THREE.Vector2(0.92667, -0.43831), // collar chamfer
    new THREE.Vector2(0.81667, -0.41154), // cove into the shaft
    new THREE.Vector2(0.81667, 0.15069), // 0.73 m of unbroken shaft
    new THREE.Vector2(0.88542, 0.15969), // band lead-in
    new THREE.Vector2(0.94167, 0.16769), // band, 30 mm proud
    new THREE.Vector2(0.94167, 0.23692),
    new THREE.Vector2(0.88542, 0.24492), // band run-out
    new THREE.Vector2(0.81667, 0.25392),
    new THREE.Vector2(0.81667, 0.42), // neck
    new THREE.Vector2(0.85833, 0.43308), // seat lip - the cap overhangs the tube
    new THREE.Vector2(0.793, 0.45869), // pressed dome
    new THREE.Vector2(0.60693, 0.4804),
    new THREE.Vector2(0.32847, 0.49491),
    new THREE.Vector2(0.0, 0.5), // apex - envelope max y
  ];
  return new THREE.LatheGeometry(profile, 20);
}

const PORTAL_BOLLARD = createPortalBollardGeometry();

/**
 * The interior slab gets its own geometry rather than sharing `UNIT_PLANE` with
 * the signage: it is the only surface in the file that needs its own UV budget,
 * and the signs must not inherit anything set on it.
 */
const FLOOR_PLANE = new THREE.PlaneGeometry(1, 1);

// ===========================================================================
// TEXTURE BANDING
// ===========================================================================

/**
 * Clone a shared procedural texture and give it its own tiling.
 *
 * `repeat` and `offset` are NOT part of three's `getTextureCacheKey`
 * (`WebGLTextures.js`), so a clone that differs only in tiling resolves to the
 * same `__webglTexture`: free in VRAM, one extra JS object.
 *
 * NEVER mutate the shared instance. `sharedMaterials.ts` hands the same texture
 * objects to the machine, village, outdoor and worker domains; changing
 * `repeat` there re-tiles the whole site.
 *
 * `anisotropy` IS in the cache key, so raising it does pay for a second upload.
 * That is worth it on the surfaces the camera sees at a grazing angle (the
 * slab, the long facades) and is left alone everywhere else.
 */
function band(
  source: THREE.Texture,
  repeatX: number,
  repeatY: number,
  options: { readonly anisotropy?: number; readonly colorSpace?: THREE.ColorSpace } = {}
): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = options.colorSpace ?? source.colorSpace ?? THREE.NoColorSpace;
  if (options.anisotropy !== undefined) texture.anisotropy = options.anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Panel-line relief for the cladding, tiled per surface class.
 *
 * `generateMachinePanelNormal` specifies its bevel in PIXELS, so the bevel
 * survives the mip chain; the older `generatePanelNormal(256, 8, 0.02)` the
 * shell used produced a bevel 0.64 px wide, which mipmapped to nothing. The
 * grid is periodic, so every band tiles seamlessly.
 */
const CLADDING_PANEL_NORMAL = generateMachinePanelNormal(512, 4, 7);

/** Brushed ORM: R = AO, G = roughness, B = metalness (the glTF packing). */
const STRUCTURAL_ORM = generateMachineORM(512, 'vertical', 96);
const DECK_ORM = generateMachineORM(512, 'horizontal', 128);

/** Aggregate relief for the slab. Tiled to the expansion-joint pitch. */
const FLOOR_AGGREGATE_NORMAL = generateProceduralNormal(512, 1, 26);

// ===========================================================================
// INTERIOR SLAB SURFACE
// ===========================================================================

const FLOOR_WIDTH = SITE_LAYOUT.factory.floor.width;
const FLOOR_DEPTH = SITE_LAYOUT.factory.floor.depth;

/** Expansion-joint pitch in metres. Also the detail-map tile pitch. */
export const FLOOR_JOINT_PITCH = 10;
const FLOOR_JOINT_TILES_X = FLOOR_WIDTH / FLOOR_JOINT_PITCH;
const FLOOR_JOINT_TILES_Z = FLOOR_DEPTH / FLOOR_JOINT_PITCH;

/**
 * Macro map resolution.
 *
 * 1024 over 80 x 100 m is 12.8 x 10.2 texel/m. That is deliberately a MACRO budget:
 * the aggregate, the pores and the saw-cut grain come from the tiled detail
 * maps, and this layer only has to carry things that vary over metres - pour
 * blotch, traffic polish, staining, expansion joints. Painted lane edges are
 * drawn a quarter of a metre wide here because anything narrower is one texel
 * and would crawl; the crisp painted lanes stay as their own quads.
 */
const FLOOR_MACRO_SIZE = 1024;

/** Resolution of the low-frequency noise fields the macro map samples. */
const FLOOR_FIELD_SIZE = 128;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** 1 inside a band of half-width `halfWidth`, feathering to 0 outside it. */
function bandMask(value: number, centre: number, halfWidth: number, feather: number): number {
  return 1 - smoothstep(halfWidth - feather, halfWidth + feather, Math.abs(value - centre));
}

/**
 * `Math.sqrt`, not `Math.hypot`. V8's `hypot` is variadic and overflow-safe and
 * costs several times a plain square root - which shows up when this runs a
 * million times at load, and never matters at these magnitudes.
 */
function radialMask(dx: number, dz: number, radius: number, feather: number): number {
  const outer = radius + feather;
  if (dx > outer || dx < -outer || dz > outer || dz < -outer) return 0;
  return 1 - smoothstep(radius - feather, outer, Math.sqrt(dx * dx + dz * dz));
}

/**
 * Low-frequency field, evaluated on a coarse grid and read back bilinearly.
 *
 * The macro fields vary over tens of metres, so evaluating fbm at every one of
 * the 1024^2 texels would be sixty-four times the work for no extra detail.
 */
function buildField(size: number, sample: (u: number, v: number) => number): Float32Array {
  const field = new Float32Array(size * size);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      field[j * size + i] = sample((i + 0.5) / size, (j + 0.5) / size);
    }
  }
  return field;
}

function sampleField(field: Float32Array, size: number, u: number, v: number): number {
  const x = clamp01(u) * size - 0.5;
  const y = clamp01(v) * size - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const cx0 = Math.min(size - 1, Math.max(0, x0));
  const cy0 = Math.min(size - 1, Math.max(0, y0));
  const cx1 = Math.min(size - 1, cx0 + 1);
  const cy1 = Math.min(size - 1, cy0 + 1);
  const n00 = field[cy0 * size + cx0];
  const n10 = field[cy0 * size + cx1];
  const n01 = field[cy1 * size + cx0];
  const n11 = field[cy1 * size + cx1];
  return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

/** Value noise on the coarse grid, without pulling the tiling fbm helpers in. */
function fieldNoise(u: number, v: number, scale: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = scale;
  let total = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    const x = u * frequency + seed;
    const y = v * frequency + seed * 1.7;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = x - ix;
    const ty = y - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const n00 = hash(ix, iy);
    const n10 = hash(ix + 1, iy);
    const n01 = hash(ix, iy + 1);
    const n11 = hash(ix + 1, iy + 1);
    value += (mix(n00, n10, sx) * (1 - sy) + mix(n01, n11, sx) * sy) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

/** Pedestrian lanes: narrow, lightly polished, matching `FloorWayfinding`. */
const WALKWAY_LANES = [
  { axis: 'x' as const, centre: -(FLOOR_WIDTH / 2 - 3), halfWidth: 1.5, from: -43, to: 43 },
  { axis: 'x' as const, centre: FLOOR_WIDTH / 2 - 3, halfWidth: 1.5, from: -43, to: 43 },
  { axis: 'z' as const, centre: -39, halfWidth: 1.75, from: -36, to: 36 },
  { axis: 'z' as const, centre: 39, halfWidth: 1.75, from: -36, to: 36 },
];

/** Forklift routes: wide, hard-polished, on the painted aisle centre lines. */
const FORKLIFT_ROUTES = [
  { axis: 'x' as const, centre: -31, halfWidth: 3.1, from: -44, to: 44 },
  { axis: 'x' as const, centre: 31, halfWidth: 3.1, from: -44, to: 44 },
  { axis: 'z' as const, centre: -43, halfWidth: 2.6, from: -32, to: 32 },
  { axis: 'z' as const, centre: 43, halfWidth: 2.6, from: -32, to: 32 },
];

/** Dock aprons take the heaviest traffic in the building. */
const DOCK_APRONS = [
  { halfWidth: 15, minZ: 30, maxZ: 50 },
  { halfWidth: 9, minZ: -50, maxZ: -30 },
];

const OIL_SOURCES = SITE_LAYOUT.machines.rollerMills.map(({ position }) => ({
  x: position[0],
  z: position[2],
}));
const DUST_SOURCES = [
  ...SITE_LAYOUT.machines.packers.map(({ position }) => ({ x: position[0], z: position[2] })),
  ...SITE_LAYOUT.machines.silos.map(({ position }) => ({ x: position[0], z: position[2] })),
];

export interface FloorMacroSample {
  /** Base albedo level in sRGB, before the per-channel concrete tint. */
  readonly tone: number;
  readonly roughness: number;
  readonly ao: number;
}

/**
 * The slab, as a pure function of world position.
 *
 * Split out from the texture writer so the layout can be asserted without
 * allocating a megapixel: a lane has to come out smoother than the field
 * beside it, a joint darker than the pour around it, and the wall line more
 * occluded than the middle of the floor.
 */
function floorMacroInto(
  out: { tone: number; roughness: number; ao: number },
  worldX: number,
  worldZ: number,
  pour: number,
  grain: number,
  wear: number
): void {
  // Maintained power-trowelled concrete, authored sRGB. Broad pour variation
  // survives at aisle distance; the finer aggregate should not read as mud.
  // Working if the slab catches broad daylight while staying rougher than the
  // traffic routes, with joints and local process staining still visible.
  let tone = 0.615 + (pour - 0.5) * 0.09;
  let roughness = 0.78 + (grain - 0.5) * 0.08;
  let ao = 1;

  // General ground-in dirt. Mid-frequency, so it breaks the pour blotch up
  // without competing with the traffic layout below it.
  const soiling = clamp01((wear - 0.35) * 1.3);
  tone -= 0.04 * soiling;
  roughness = mix(roughness, 0.9, soiling * 0.5);

  // --- traffic ---------------------------------------------------------
  let walk = 0;
  for (const lane of WALKWAY_LANES) {
    const along = lane.axis === 'x' ? worldZ : worldX;
    if (along < lane.from || along > lane.to) continue;
    const across = lane.axis === 'x' ? worldX : worldZ;
    walk = Math.max(walk, bandMask(across, lane.centre, lane.halfWidth, 0.7));
  }

  let drive = 0;
  let tyre = 0;
  for (const route of FORKLIFT_ROUTES) {
    const along = route.axis === 'x' ? worldZ : worldX;
    if (along < route.from || along > route.to) continue;
    const across = route.axis === 'x' ? worldX : worldZ;
    drive = Math.max(drive, bandMask(across, route.centre, route.halfWidth, 1.1));
    // Twin tyre tracks, scuffed darker than the polish around them.
    tyre = Math.max(
      tyre,
      Math.max(
        bandMask(across, route.centre - 0.95, 0.34, 0.28),
        bandMask(across, route.centre + 0.95, 0.34, 0.28)
      )
    );
  }
  for (const apron of DOCK_APRONS) {
    if (worldZ < apron.minZ || worldZ > apron.maxZ) continue;
    drive = Math.max(drive, bandMask(worldX, 0, apron.halfWidth, 2.4));
  }

  const polish = clamp01(walk * 0.7 + drive);
  tone += 0.075 * polish - 0.075 * tyre * (0.4 + wear * 0.6);
  roughness = mix(roughness, 0.3, polish);
  roughness = mix(roughness, 0.4, tyre * 0.6);

  // --- process staining ------------------------------------------------
  let oil = 0;
  for (const source of OIL_SOURCES) {
    oil = Math.max(oil, radialMask(worldX - source.x, worldZ - source.z, 3.2, 2.4));
  }
  oil *= 0.35 + wear * 0.65;
  tone -= 0.14 * oil;
  roughness = mix(roughness, 0.26, oil);
  ao = mix(ao, 0.78, oil);

  let dust = 0;
  for (const source of DUST_SOURCES) {
    dust = Math.max(dust, radialMask(worldX - source.x, worldZ - source.z, 4.6, 3.8));
  }
  dust *= 0.4 + grain * 0.6;
  tone += 0.11 * dust;
  roughness = mix(roughness, 0.97, dust);

  // --- grime at the wall line ------------------------------------------
  const edge = Math.min(FLOOR_WIDTH / 2 - Math.abs(worldX), FLOOR_DEPTH / 2 - Math.abs(worldZ));
  const grime = 1 - smoothstep(0.4, 4.5, edge);
  tone -= 0.1 * grime;
  ao = mix(ao, 0.68, grime);

  // --- expansion joints -------------------------------------------------
  // Drawn ~0.2 m wide: at ~10 texel/m anything narrower is a single texel and
  // crawls under motion. Mipmaps fade them out with distance, which is what a
  // real saw cut does.
  const jointX = Math.abs(worldX - Math.round(worldX / FLOOR_JOINT_PITCH) * FLOOR_JOINT_PITCH);
  const jointZ = Math.abs(worldZ - Math.round(worldZ / FLOOR_JOINT_PITCH) * FLOOR_JOINT_PITCH);
  const joint = Math.max(1 - smoothstep(0.035, 0.09, jointX), 1 - smoothstep(0.035, 0.09, jointZ));
  tone -= 0.065 * joint;
  roughness = mix(roughness, 0.96, joint);
  ao = mix(ao, 0.82, joint);

  out.tone = clamp01(tone);
  out.roughness = clamp01(roughness);
  out.ao = clamp01(ao);
}

export function sampleFloorMacro(
  worldX: number,
  worldZ: number,
  pour: number = 0.5,
  grain: number = 0.5,
  wear: number = 0.5
): FloorMacroSample {
  const out = { tone: 0, roughness: 0, ao: 0 };
  floorMacroInto(out, worldX, worldZ, pour, grain, wear);
  return out;
}

interface FloorMacroMaps {
  readonly albedo: THREE.DataTexture;
  readonly surface: THREE.DataTexture;
}

/**
 * Build the slab's macro albedo and its packed AO/roughness map.
 *
 * UV orientation: `FLOOR_PLANE` is rotated -90 degrees about X, so u runs
 * -40 -> +40 in world X and v runs +50 -> -50 in world Z. `DataTexture` does
 * not flip Y, so row 0 is v = 0.
 */
export function buildFloorMacroMaps(size: number = FLOOR_MACRO_SIZE): FloorMacroMaps {
  const albedoData = new Uint8Array(size * size * 4);
  const surfaceData = new Uint8Array(size * size * 4);

  // One reusable result object. A million per-pixel literals is a million
  // short-lived allocations for no benefit.
  const sample = { tone: 0, roughness: 0, ao: 0 };
  const pourField = buildField(FLOOR_FIELD_SIZE, (u, v) => fieldNoise(u, v, 3.1, 11));
  const grainField = buildField(FLOOR_FIELD_SIZE, (u, v) => fieldNoise(u, v, 7.4, 29));
  const wearField = buildField(FLOOR_FIELD_SIZE, (u, v) => fieldNoise(u, v, 12.6, 53));

  for (let row = 0; row < size; row += 1) {
    const v = (row + 0.5) / size;
    const worldZ = FLOOR_DEPTH / 2 - v * FLOOR_DEPTH;
    for (let column = 0; column < size; column += 1) {
      const u = (column + 0.5) / size;
      const worldX = -FLOOR_WIDTH / 2 + u * FLOOR_WIDTH;
      const offset = (row * size + column) * 4;

      floorMacroInto(
        sample,
        worldX,
        worldZ,
        sampleField(pourField, FLOOR_FIELD_SIZE, u, v),
        sampleField(grainField, FLOOR_FIELD_SIZE, u, v),
        sampleField(wearField, FLOOR_FIELD_SIZE, u, v)
      );

      // Per-texel speckle keeps the macro layer from banding where the fields
      // are almost flat. One hash, no octaves.
      const speckle = (hash(column, row) - 0.5) * 0.022;
      const tone = clamp01(sample.tone + speckle);

      // Concrete is very slightly warm and slightly blue-deficient.
      albedoData[offset] = Math.round(clamp01(tone * 1.035) * 255);
      albedoData[offset + 1] = Math.round(tone * 255);
      albedoData[offset + 2] = Math.round(clamp01(tone * 0.945) * 255);
      albedoData[offset + 3] = 255;

      // glTF ORM packing: R = AO, G = roughness, B = metalness. three reads
      // `aoMap.r`, `roughnessMap.g` and `metalnessMap.b`, so this one texture
      // can serve both slots without a channel mismatch.
      surfaceData[offset] = Math.round(sample.ao * 255);
      surfaceData[offset + 1] = Math.round(sample.roughness * 255);
      surfaceData[offset + 2] = 0;
      surfaceData[offset + 3] = 255;
    }
  }

  const albedo = new THREE.DataTexture(albedoData, size, size, THREE.RGBAFormat);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.ClampToEdgeWrapping;
  albedo.wrapT = THREE.ClampToEdgeWrapping;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.anisotropy = 8;
  albedo.needsUpdate = true;

  const surface = new THREE.DataTexture(surfaceData, size, size, THREE.RGBAFormat);
  surface.colorSpace = THREE.NoColorSpace;
  surface.wrapS = THREE.ClampToEdgeWrapping;
  surface.wrapT = THREE.ClampToEdgeWrapping;
  surface.magFilter = THREE.LinearFilter;
  surface.minFilter = THREE.LinearMipmapLinearFilter;
  surface.generateMipmaps = true;
  surface.anisotropy = 8;
  surface.needsUpdate = true;

  return { albedo, surface };
}

/**
 * Generated once at module load. Measured at 307 ms in Chrome/M1 Max for the
 * 1024^2 pair, behind the loading screen. Halve it by dropping
 * `FLOOR_MACRO_SIZE` to 768 (9.6 x 7.7 texel/m, still enough for the joints).
 */
const FLOOR_MACRO = buildFloorMacroMaps();

// ===========================================================================
// SLAB DETAIL BLEND
// ===========================================================================

/**
 * Tiled concrete grain, blended under the macro layer.
 *
 * The macro layer owns the saw cuts. A second joint in this tile used a 4%
 * border, which became a 40 cm dark band at the 10 m repeat and overwhelmed
 * the eight-centimetre relief. Disable its joints and repeated wear corridor;
 * the detail sampler contributes concrete grain alone.
 */
const FLOOR_DETAIL_ALBEDO = band(generateConcrete(512, 512, false, false), 1, 1, { anisotropy: 8 });

/**
 * Mean linear luminance of the detail tile.
 *
 * The blend is a RATIO about this pivot, so the detail modulates the macro
 * layer without shifting its average level - change the generator and the slab
 * keeps the brightness it was graded to. Measured from the texture rather than
 * hard-coded, because `src/textures` belongs to another domain and its base
 * values move.
 */
function estimateLinearLuminance(texture: THREE.Texture): number {
  const image = texture.image as { data?: Uint8Array } | undefined;
  const data = image?.data;
  if (!data || data.length < 4) return 0.26;
  const toLinear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  let sum = 0;
  let count = 0;
  // Every seventh texel: 37k samples over a 512 tile, exact to well under a
  // percent and free compared with generating the tile in the first place.
  for (let offset = 0; offset + 2 < data.length; offset += 28) {
    sum +=
      0.2126 * toLinear(data[offset]) +
      0.7152 * toLinear(data[offset + 1]) +
      0.0722 * toLinear(data[offset + 2]);
    count += 1;
  }
  return count > 0 ? Math.max(0.02, sum / count) : 0.26;
}

const FLOOR_DETAIL_UNIFORMS = {
  uFloorDetail: { value: FLOOR_DETAIL_ALBEDO },
  uFloorDetailRepeat: {
    value: new THREE.Vector2(FLOOR_JOINT_TILES_X, FLOOR_JOINT_TILES_Z),
  },
  uFloorDetailPivot: { value: estimateLinearLuminance(FLOOR_DETAIL_ALBEDO) },
  uFloorDetailStrength: { value: 0.8 },
  /** Eight-centimetre joint, kept subordinate to the machinery and its shadows. */
  uFloorJointHalf: { value: 0.004 },
  /** Tangent-space tilt of the groove wall. */
  uFloorJointRelief: { value: 0.12 },
};

/**
 * Bump when the injected GLSL changes.
 *
 * NEVER put `Date.now()`, `Math.random()` or anything else non-deterministic in
 * a cache key: three uses it to decide whether a program needs rebuilding, and
 * a key that changes recompiles the shader every frame.
 */
const FLOOR_PROGRAM_CACHE_KEY = 'millos-floor-detail-v2';

/**
 * Blend the tiled grain into the macro slab.
 *
 * three gives every texture its own UV transform, so `map` (macro, 1:1),
 * `roughnessMap`/`aoMap` (macro, 1:1) and `normalMap` (tiled) already coexist
 * without any shader work. The one thing per-map transforms cannot do is a
 * SECOND albedo at a different scale, and that is the whole gap between a slab
 * that holds up from the overview camera and one that holds up during close
 * inspection. One extra texture fetch on one mesh.
 */
function applyFloorDetailBlend(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FLOOR_DETAIL_UNIFORMS);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uFloorDetail;
uniform vec2 uFloorDetailRepeat;
uniform float uFloorDetailPivot;
uniform float uFloorDetailStrength;
uniform float uFloorJointHalf;
uniform float uFloorJointRelief;`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 millosGrain = texture2D( uFloorDetail, vMapUv * uFloorDetailRepeat ).rgb;
  float millosLum = dot( millosGrain, vec3( 0.2126, 0.7152, 0.0722 ) );
  float millosRatio = 1.0 + ( millosLum / uFloorDetailPivot - 1.0 ) * uFloorDetailStrength;
  diffuseColor.rgb *= clamp( millosRatio, 0.35, 1.8 );
}`
      )
      // EXPANSION-JOINT RELIEF.
      //
      // The joints are drawn in the macro albedo, roughness and AO, which makes
      // them a painted line rather than a cut. The saw cut needs a normal, and
      // there is no free normal slot - `normalMap` carries the tiled aggregate.
      //
      // Perturbing `normal` AFTER the chunk (rather than replacing the chunk to
      // get at `mapN`) keeps this independent of three's internal normal code.
      // It is only valid because the slab is one axis-aligned horizontal plane:
      // u runs along world +X and v along world -Z, so the tangent frame is a
      // constant and can be taken straight from `viewMatrix`.
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 millosTileUv = fract( vMapUv * uFloorDetailRepeat );
  vec2 millosEdge = 0.5 - abs( millosTileUv - 0.5 );
  vec2 millosSide = sign( millosTileUv - 0.5 );
  vec2 millosGroove = 1.0 - smoothstep( vec2( 0.0 ), vec2( uFloorJointHalf ), millosEdge );
  vec2 millosTilt = millosSide * millosGroove * uFloorJointRelief;
  vec3 millosTangent = normalize( ( viewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
  vec3 millosBitangent = normalize( ( viewMatrix * vec4( 0.0, 0.0, -1.0, 0.0 ) ).xyz );
  normal = normalize( normal + millosTangent * millosTilt.x + millosBitangent * millosTilt.y );
}`
      );
  };
  material.customProgramCacheKey = () => FLOOR_PROGRAM_CACHE_KEY;
}

// ===========================================================================
// MATERIALS
// ===========================================================================

/**
 * SURFACE TUNING NOTE (re-authored against the rebalanced lighting).
 *
 * The shell was authored when fill and key were within 2% of each other and
 * there was no `scene.environment`. Two consequences drove every value below.
 *
 * 1. METALNESS. Painted cladding, coated roof deck, painted structural steel
 *    and painted handrail are all DIELECTRICS. They were carrying 0.07 / 0.09 /
 *    0.15 / 0.30 - the physically invalid band where the BRDF has neither a
 *    full diffuse albedo nor a real specular, which reads chalky. They are now
 *    0. The only genuine metals left in the shell are the galvanised gallery
 *    deck and the extruded fixture housings, and with the IBL present those two
 *    now have something to reflect.
 *
 * 2. THE FAKE FILL. `wall`, `wallUpper` and `roof` each carried an
 *    `emissive: '#253238'-ish` at intensity 0.08-0.09. That is 0.003 linear -
 *    it was never doing the job it was added for, and it tinted every shadowed
 *    face teal. Removed outright; the interior is lit by the four zone lights,
 *    the ambient/hemisphere terms and the IBL instead.
 *
 * Sunlit exterior faces are almost exactly as bright as before (key 1.84 ->
 * 3.10 against fill 1.46 -> 0.44 very nearly cancels at cos ~ 0.9), so the
 * facade colours move only slightly. Interior faces lost roughly half their
 * fill, so the surfaces the interior camera sees - slab, lower wall, deck -
 * are lifted to compensate.
 */
const MATERIALS = {
  floor: new THREE.MeshStandardMaterial({
    name: 'factory-slab',
    color: '#ffffff',
    map: FLOOR_MACRO.albedo,
    roughnessMap: FLOOR_MACRO.surface,
    aoMap: FLOOR_MACRO.surface,
    aoMapIntensity: 0.9,
    normalMap: band(FLOOR_AGGREGATE_NORMAL, FLOOR_JOINT_TILES_X, FLOOR_JOINT_TILES_Z, {
      anisotropy: 8,
    }),
    normalScale: new THREE.Vector2(0.24, 0.24),
    roughness: 1,
    metalness: 0,
  }),
  wall: new THREE.MeshStandardMaterial({
    name: 'factory-wall-plinth',
    color: '#8e9998',
    normalMap: band(CLADDING_PANEL_NORMAL, 26, 4, { anisotropy: 4 }),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.68,
    metalness: 0,
  }),
  wallCladding: new THREE.MeshStandardMaterial({
    name: 'factory-wall-cladding',
    color: '#768486',
    normalMap: band(CLADDING_PANEL_NORMAL, 24, 3, { anisotropy: 4 }),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.6,
    metalness: 0,
  }),
  wallParapet: new THREE.MeshStandardMaterial({
    name: 'factory-parapet',
    color: '#43575d',
    normalMap: band(CLADDING_PANEL_NORMAL, 60, 3, { anisotropy: 4 }),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.58,
    metalness: 0,
  }),
  /** Painted structural steel: a dielectric, despite the name. */
  steel: new THREE.MeshStandardMaterial({
    name: 'factory-structure',
    color: '#344a52',
    roughnessMap: band(STRUCTURAL_ORM, 1, 10),
    aoMap: band(STRUCTURAL_ORM, 1, 10),
    aoMapIntensity: 0.6,
    normalMap: band(CLADDING_PANEL_NORMAL, 1, 10),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 1,
    metalness: 0,
  }),
  /**
   * Slender members (trusses, eave trim, standing seams). No panel relief: a
   * grid tiled onto a 0.18 m deep member is sub-pixel noise, not detail.
   *
   * AUDITED AND LEFT FLAT ON PURPOSE - re-checked 2026-08-17, because this is
   * the branch's largest untextured entry by a wide margin (3,488 m summed
   * world size over 87 instances, next entry 976 m) and a work list ordered by
   * that number puts it first. Three reasons it stays:
   *
   * 1. THE METRIC REWARDS LENGTH, NOT AREA. `worldRadius` is the geometry
   *    radius times the largest scale axis, which is what three itself uses for
   *    culling - so a 120 x 0.18 x 0.22 m batten scores as though it were 104 m
   *    across. Seventy-eight of these 87 instances are the roof standing seams,
   *    which are narrow standing seams. Their summed EXTENT is enormous;
   *    their surface is not.
   * 2. THEY ARE ALREADY THE DETAIL. The seams exist so the roof deck stops
   *    reading as a painted rectangle, and the comment on `roofDetails` records
   *    their dimensions and the matched overview sampling check.
   *    Texturing them is texturing the texture.
   * 3. NO SINGLE TILING CAN BE CORRECT. `InstancedBoxes` draws every instance
   *    from one shared `UNIT_BOX`, so a `band()` repeat stretches with each
   *    instance's scale - and this set spans 118 x 0.3 x 0.3 trusses, 120 x
   *    0.18 x 0.22 eave trim, 5 x 1 x 3 roof units and the battens. That is
   *    over 300:1 of aspect variation against one UV layout. It is the same
   *    constraint `ChamferStrip` below documents for geometry.
   *
   * The same three apply to `accent` (facade sills and headers, 0.55 m bands),
   * `galleryRail` (0.14 m tube, 43 m runs sharing a set with 1.45 m stanchions)
   * and `fixtureHousing`. `glass`, `skylight`, `fixtureGlow` and the walkway
   * paint are flat by construction - glazing, an unlit lens and a transparent
   * marking have nothing for a surface map to do.
   */
  steelTrim: new THREE.MeshStandardMaterial({
    name: 'factory-trim',
    color: '#3d555f',
    roughness: 0.5,
    metalness: 0,
  }),
  roof: new THREE.MeshStandardMaterial({
    name: 'factory-roof-deck',
    color: '#505452',
    normalMap: band(CLADDING_PANEL_NORMAL, 30, 50, { anisotropy: 4 }),
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.52,
    metalness: 0,
  }),
  roofTrim: new THREE.MeshStandardMaterial({
    name: 'factory-roof-trim',
    color: '#505452',
    roughness: 0.52,
    metalness: 0,
  }),
  accent: new THREE.MeshStandardMaterial({
    name: 'factory-accent',
    color: '#487d7d',
    roughness: 0.45,
    metalness: 0,
  }),
  /**
   * Roof glazing. Transparent on purpose as well as for looks: `SunShadowRig`
   * skips transparent materials when it patches shadow casters, and the flag is
   * set here so the skylights never become opaque occluders.
   */
  skylight: new THREE.MeshStandardMaterial({
    name: 'factory-skylight',
    color: '#a9d8e4',
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
  glass: new THREE.MeshStandardMaterial({
    name: 'factory-glazing',
    color: '#c6e2e8',
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  }),
  /** Floor paint receives the same daylight and night ambient as the slab. */
  safetyPaint: new THREE.MeshStandardMaterial({
    name: 'factory-floor-paint',
    color: '#f4c84a',
    roughness: 0.8,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
  }),
  /** The same yellow on real geometry (bollards, handrail), so it shades. */
  safetyLit: new THREE.MeshStandardMaterial({
    name: 'factory-safety-yellow',
    color: '#e8b93c',
    roughness: 0.55,
    metalness: 0,
  }),
  zoneStorage: new THREE.MeshBasicMaterial({
    color: '#2f7db7',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
  zoneMilling: new THREE.MeshBasicMaterial({
    color: '#df8c37',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
  zoneSifting: new THREE.MeshBasicMaterial({
    color: '#8e6cc2',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
  zonePacking: new THREE.MeshBasicMaterial({
    color: '#3fa66f',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
  danger: new THREE.MeshStandardMaterial({
    name: 'factory-emergency-station',
    color: '#c4453a',
    roughness: 0.5,
    metalness: 0,
  }),
  /** Painted walkway lane. Lit, so it darkens with the slab under it. */
  walkway: new THREE.MeshStandardMaterial({
    name: 'factory-walkway-paint',
    color: '#89a89e',
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
    polygonOffsetUnits: POLYGON_OFFSET.standard.units,
  }),
  plinth: new THREE.MeshStandardMaterial({
    name: 'factory-machine-plinth',
    color: '#dfe2df',
    map: band(PROCEDURAL_TEXTURES.concreteColor, 6, 2, {
      anisotropy: 4,
      colorSpace: THREE.SRGBColorSpace,
    }),
    roughnessMap: band(PROCEDURAL_TEXTURES.concreteRoughness, 6, 2),
    roughness: 1,
    metalness: 0,
  }),
  /** Galvanised open grating - a real metal, and now it has an IBL to catch. */
  gallery: new THREE.MeshStandardMaterial({
    name: 'factory-gallery-deck',
    color: '#949a9d',
    roughnessMap: band(DECK_ORM, 20, 6, { anisotropy: 4 }),
    aoMap: band(DECK_ORM, 20, 6, { anisotropy: 4 }),
    aoMapIntensity: 0.7,
    normalMap: band(CLADDING_PANEL_NORMAL, 20, 6, { anisotropy: 4 }),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 1,
    metalness: 0.85,
  }),
  galleryRail: new THREE.MeshStandardMaterial({
    name: 'factory-gallery-rail',
    color: '#e6bd4e',
    roughness: 0.45,
    metalness: 0,
  }),
  /** Extruded anodised aluminium housing. The shell's other real metal. */
  fixtureHousing: new THREE.MeshStandardMaterial({
    name: 'factory-fixture-housing',
    color: '#48545a',
    roughness: 0.32,
    metalness: 0.7,
  }),
  fixtureGlow: new THREE.MeshBasicMaterial({
    name: 'factory-fixture-lens',
    color: '#ffe8b0',
    toneMapped: false,
  }),
} as const;

applyFloorDetailBlend(MATERIALS.floor);

// ===========================================================================
// SURFACE FINISH
// ===========================================================================
//
// WHAT THIS OVERTURNS, AND ON WHAT GROUNDS. The comment on `steelTrim` above
// audited this branch on 2026-08-17 and left it flat DELIBERATELY, giving three
// reasons: the work-list metric rewards length rather than area, the seams are
// already the detail, and - the decisive one - no single UV tiling can serve an
// instanced set spanning over 300:1 of aspect variation from one shared
// `UNIT_BOX`.
//
// All three still stand, and none of them is an argument against THIS. A
// world-space analytic field is sampled in metres, not in UV, so it does not
// stretch with an instance's scale: the 118 m truss and the 0.14 m rail tube cut
// from the same unit box each receive detail at its own correct density. That is
// exactly the constraint the earlier audit could not get past, so the closure is
// reopened on new grounds rather than re-litigated on the old ones. No `map:` is
// added to any material here; the reasons those slots are empty are unchanged.
//
// COST. Every material below is consumed by `InstancedBoxes`, and
// `StaticMeshBatch` excludes `InstancedMesh` outright
// (`inspectStaticBatchObject`: `exclude('instanced')`), so attaching a shader
// costs no batching and no draw call - the same reasoning `FarmArea.tsx` records
// for the crop's wind shader.
//
// DATUMS. `machineSurfaces` had to learn this the hard way: a grime gradient
// measured from world zero saturates to nothing on anything standing on an
// elevated floor, and a term that evaluates to nothing still reports as a
// finished surface in every gate. The sifter gallery deck sits at y 8.62 with a
// 0.46 m slab, so its walking surface is 8.85 and its rails stand on that.
const GALLERY_DECK_TOP = 8.85;

/**
 * Which finish each shell material takes, and why it is not the default.
 *
 * Deliberately an explicit table rather than `resolveSurfaceProfile`: these are
 * named, art-directed materials whose identity is known here, and a reader
 * should be able to see that the yellow handrail is treated as SIGNAGE - meant
 * to stay legible - rather than have to re-derive it from a saturation
 * threshold.
 *
 * Absent on purpose, all of them flat BY CONSTRUCTION rather than unfinished:
 *   floor          already owns an `onBeforeCompile` (the joint relief)
 *   glass, skylight, walkway, zone* transparent - and a marking or a pane has
 *                  nothing for a weathering term to do
 *   safetyPaint    painted decal, deliberately flat; lit by the slab lighting
 *   fixtureGlow    unlit `MeshBasicMaterial`: no roughness or
 *                  metalness to modulate, and `<normal_fragment_maps>` is not
 *                  in `meshbasic_frag` at all, so the injection would be half a
 *                  shader. `canApplyWorldSurface` refuses them.
 */
const SHELL_SURFACES: readonly [
  THREE.MeshStandardMaterial,
  WorldSurfaceProfileName,
  WorldSurfaceOverrides?,
][] = [
  [MATERIALS.wall, 'painted'],
  [MATERIALS.wallCladding, 'painted'],
  // The parapet caps the roof at ~15 m. Its grime term is inert up there, which
  // is correct and is why dust, edge and the macro drift are datum-free.
  [MATERIALS.wallParapet, 'painted'],
  [MATERIALS.steel, 'painted'],
  [MATERIALS.steelTrim, 'painted'],
  [MATERIALS.roof, 'painted'],
  [MATERIALS.roofTrim, 'painted'],
  [MATERIALS.accent, 'painted'],
  [MATERIALS.plinth, 'masonry'],
  // Hi-viz on real geometry. `signage` is the lightest profile in the set: a
  // safety yellow weathered into the background has been broken, not finished.
  [MATERIALS.safetyLit, 'signage'],
  [MATERIALS.danger, 'signage'],
  [MATERIALS.gallery, 'metal', { datum: GALLERY_DECK_TOP }],
  [MATERIALS.galleryRail, 'signage', { datum: GALLERY_DECK_TOP }],
  // Anodised aluminium housings, mounted at ceiling height. Grime inert by
  // position; the edge term is what makes an extrusion read.
  [MATERIALS.fixtureHousing, 'metal'],
];

SHELL_SURFACES.forEach(([material, profile, overrides]) => {
  applyWorldSurface(material, profile, overrides);
});

export const FACTORY_ENVELOPE_SPEC = {
  baseHeight: 0.6,
  dockWindowSill: 14.25,
  sideWindowSill: 0.85,
  windowHead: SITE_LAYOUT.factory.bounds.maxY - 1.8,
  topBandBottom: SITE_LAYOUT.factory.bounds.maxY - 1.55,
  topBandTop: SITE_LAYOUT.factory.bounds.maxY,
  frontBayCentres: Array.from(
    { length: FLOOR_WIDTH / 20 },
    (_, i) => -FLOOR_WIDTH / 2 + 10 + i * 20
  ),
  sideBayCentres: [-40, -20, 0, 20, 40],
} as const;

const FACTORY_SIDE_COLUMN_Z = [-30, -10, 10, 30] as const;

interface BoxInstance {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

function InstancedBoxes({
  instances,
  material,
  castShadow = false,
  receiveShadow = false,
  renderOrder,
}: {
  readonly instances: readonly BoxInstance[];
  readonly material: THREE.Material;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly renderOrder?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    instances.forEach((instance, index) => {
      object.position.set(...instance.position);
      object.scale.set(...instance.scale);
      const rotation = instance.rotation ?? ([0, 0, 0] as const);
      object.rotation.set(rotation[0], rotation[1], rotation[2]);
      object.updateMatrix();
      ref.current?.setMatrixAt(index, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [instances]);

  const generatedAsset =
    material instanceof THREE.MeshStandardMaterial &&
    !material.transparent &&
    material.emissive.getHex() === 0
      ? [
          MATERIALS.floor,
          MATERIALS.wall,
          MATERIALS.wallCladding,
          MATERIALS.wallParapet,
          MATERIALS.plinth,
        ].includes(material)
        ? 'factoryConcreteUnit'
        : 'factorySteelUnit'
      : undefined;
  return (
    <instancedMesh
      ref={ref}
      args={[UNIT_BOX, material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      renderOrder={renderOrder}
    >
      {generatedAsset && (
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={generatedAsset}
            original={UNIT_BOX}
            meshRef={ref}
            fitEnvelope
          />
        </GeneratedBoundary>
      )}
    </instancedMesh>
  );
}

/**
 * A 45-degree chamfer strip.
 *
 * A unit box scaled 45 x 8 cannot carry a chamfer - the bevel would scale with
 * the box and come out 45 m wide on one axis. A separate strip rotated into the
 * corner produces the real thing: a narrow face at 45 degrees that catches its
 * own specular line and stops a camera-facing edge reading as a paper fold.
 * These are appended to instanced meshes that already exist, so the draw-call
 * count does not move.
 */
function chamferStrip(
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number]
): BoxInstance {
  return { position, scale, rotation };
}

// --- roof deck geometry ----------------------------------------------------
//
// The two roof halves are 60.15 x 100.4 slabs pitched 0.05 rad about Z, so
// anything mounted on the deck has to be placed in the PANEL's frame and
// transformed out, not written as a world constant. `local` below is the
// offset from a half's centre measured along the tilted deck.

const ROOF_PITCH = 0.05;
/** X of each half's centre. */
const ROOF_HALF_CENTRE = FLOOR_WIDTH / 4;
/** Roof deck height follows the shared shell and navigation envelope. */
const ROOF_DECK_TOP = SITE_LAYOUT.factory.bounds.maxY + 0.63;
/** Half length of a full-width batten, in deck-local units. */
const ROOF_BATTEN_REACH = ROOF_HALF_CENTRE - 0.75;
const ROOF_BATTEN_HEIGHT = 0.12;
/** How far the batten stands proud of the deck. */
const ROOF_BATTEN_PROUD = 0.085;
const ROOF_BATTEN_PITCH = 4.4;
const ROOF_BATTEN_WIDTH = 0.18;

const SKYLIGHT_Z = [-26, 0, 26] as const;
const SKYLIGHT_SIZE = { x: 9, z: 11 } as const;
/** Deck-local X of a skylight centre, for the half at `ROOF_HALF_CENTRE * side`. */
const skylightLocalX = (side: -1 | 1): number => -5 * side;
/** Clearance a batten keeps from a skylight kerb. */
const SKYLIGHT_BATTEN_CLEARANCE = SKYLIGHT_SIZE.x / 2 + 0.7;
const SKYLIGHT_KERB_HEIGHT = 0.9;

/** Slope of one roof half, as a rotation about Z. */
const roofSlope = (side: -1 | 1): number => -ROOF_PITCH * side;

/** Transform a deck-local X offset into world (x, y) on that half's top face. */
function deckPoint(side: -1 | 1, local: number): { x: number; y: number } {
  const slope = roofSlope(side);
  return {
    x: ROOF_HALF_CENTRE * side + local * Math.cos(slope),
    y: ROOF_DECK_TOP + local * Math.sin(slope),
  };
}

export function buildFactoryRoofBatten(
  side: -1 | 1,
  localFrom: number,
  localTo: number,
  z: number
): BoxInstance {
  const centre = deckPoint(side, (localFrom + localTo) / 2);
  return {
    position: [centre.x, centre.y + ROOF_BATTEN_PROUD - ROOF_BATTEN_HEIGHT / 2, z],
    scale: [localTo - localFrom, ROOF_BATTEN_HEIGHT, ROOF_BATTEN_WIDTH],
    rotation: [0, 0, roofSlope(side)],
  };
}

/** The actual opaque deck and upstands, also used by aperture ray tests. */
export function buildFactoryRoofEnvelope(): { panels: BoxInstance[]; kerbs: BoxInstance[] } {
  const panels: BoxInstance[] = [];
  const kerbs: BoxInstance[] = [];
  for (const side of [-1, 1] as const) {
    const x = skylightLocalX(side);
    const left = x - SKYLIGHT_SIZE.x / 2;
    const right = x + SKYLIGHT_SIZE.x / 2;
    const panel = (x0: number, x1: number, z0: number, z1: number) => {
      const seat = deckPoint(side, (x0 + x1) / 2);
      panels.push({
        position: [seat.x, seat.y - 0.18, (z0 + z1) / 2],
        scale: [x1 - x0, 0.36, z1 - z0],
        rotation: [0, 0, roofSlope(side)],
      });
    };
    // Two continuous side strips and four bridges leave six genuine apertures.
    panel(-ROOF_HALF_CENTRE - 0.075, left, -50.2, 50.2);
    panel(right, ROOF_HALF_CENTRE + 0.075, -50.2, 50.2);
    let from = -50.2;
    for (const z of SKYLIGHT_Z) {
      panel(left, right, from, z - SKYLIGHT_SIZE.z / 2);
      from = z + SKYLIGHT_SIZE.z / 2;
      const seat = deckPoint(side, x);
      // An upstand is a hollow frame, never a solid box underneath the pane.
      for (const edge of [-1, 1]) {
        const edgeSeat = deckPoint(side, x + edge * (SKYLIGHT_SIZE.x / 2 + 0.175));
        kerbs.push({
          position: [edgeSeat.x, edgeSeat.y, z],
          scale: [0.35, SKYLIGHT_KERB_HEIGHT, SKYLIGHT_SIZE.z + 0.7],
          rotation: [0, 0, roofSlope(side)],
        });
        kerbs.push({
          position: [seat.x, seat.y, z + edge * (SKYLIGHT_SIZE.z / 2 + 0.175)],
          scale: [SKYLIGHT_SIZE.x, SKYLIGHT_KERB_HEIGHT, 0.35],
          rotation: [0, 0, roofSlope(side)],
        });
      }
    }
    panel(left, right, from, 50.2);
  }
  return { panels, kerbs };
}

/**
 * Exposed pitched steelwork, seated on the existing side-wall columns. The
 * open webs leave the six roof lights useful; purlins stay beside their wells.
 * All members join the two existing steel-trim instance batches, with no new
 * material, light or per-frame work. The lowest chord stays above the lamps.
 */
export function buildFactoryRoofStructure(): {
  frames: BoxInstance[];
  purlins: BoxInstance[];
  glazingBars: BoxInstance[];
} {
  const frames: BoxInstance[] = [];
  const purlins: BoxInstance[] = [];
  const glazingBars: BoxInstance[] = [];
  const halfSpan = FLOOR_WIDTH / 2 - 0.45;
  const lowerY = SITE_LAYOUT.factory.bounds.maxY - 2.9;
  const chordHeight = 0.6;
  const flange = 0.07;
  // Use the deck's own pitch and datum. A fixed horizontal top chord would
  // either float below the ridge or break through the eaves.
  const underside = (x: number) => {
    const side = x < 0 ? -1 : 1;
    const local = (x - ROOF_HALF_CENTRE * side) / Math.cos(ROOF_PITCH);
    return deckPoint(side, local).y - 0.36;
  };
  const upperY = (x: number) => underside(x) - chordHeight / 2 - 0.06;
  const member = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    height: number,
    width: number
  ): BoxInstance => ({
    position: [(x0 + x1) / 2, (y0 + y1) / 2, z],
    scale: [Math.hypot(x1 - x0, y1 - y0), height, width],
    rotation: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
  });
  const chord = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    frames.push(member(x0, y0, x1, y1, z, chordHeight - 2 * flange, 0.12));
    for (const sign of [-1, 1]) {
      const offset = (sign * (chordHeight - flange)) / 2;
      const dx = -Math.sin(angle) * offset;
      const dy = Math.cos(angle) * offset;
      frames.push(member(x0 + dx, y0 + dy, x1 + dx, y1 + dy, z, flange, 0.46));
    }
  };
  for (const z of FACTORY_SIDE_COLUMN_Z) {
    chord(-halfSpan, lowerY, halfSpan, lowerY, z);
    chord(-halfSpan, upperY(-halfSpan), 0, upperY(0), z);
    chord(0, upperY(0), halfSpan, upperY(halfSpan), z);
    const nodes = Array.from({ length: 13 }, (_, i) => -halfSpan + (2 * halfSpan * i) / 12);
    nodes.forEach((x, i) => {
      frames.push(member(x, lowerY, x, upperY(x), z, 0.18, 0.18));
      if (i === nodes.length - 1) return;
      const next = nodes[i + 1];
      frames.push(
        i % 2 === 0
          ? member(x, lowerY, next, upperY(next), z, 0.2, 0.2)
          : member(x, upperY(x), next, lowerY, z, 0.2, 0.2)
      );
    });
    for (const x of [-halfSpan, halfSpan]) {
      frames.push({ position: [x, lowerY - 0.35, z], scale: [0.75, 0.1, 0.75] });
    }
  }
  for (const x of [-35, -25, -5, 5, 25, 35]) {
    purlins.push({
      position: [x, underside(x) - 0.17, 0],
      scale: [0.22, 0.3, 99.1],
      rotation: [0, 0, roofSlope(x < 0 ? -1 : 1)],
    });
  }
  for (const side of [-1, 1] as const) {
    const x = skylightLocalX(side);
    for (const z of SKYLIGHT_Z) {
      for (const sign of [-1, 1]) {
        const longitudinal = deckPoint(side, x + (sign * SKYLIGHT_SIZE.x) / 6);
        const transverse = deckPoint(side, x);
        // The upper faces meet the existing pane's underside. Two divisions
        // per axis make nine lights, leaving the centre of each well open.
        glazingBars.push(
          {
            position: [longitudinal.x, longitudinal.y + 0.38, z],
            scale: [0.1, 0.14, SKYLIGHT_SIZE.z],
            rotation: [0, 0, roofSlope(side)],
          },
          {
            position: [transverse.x, transverse.y + 0.38, z + (sign * SKYLIGHT_SIZE.z) / 6],
            scale: [SKYLIGHT_SIZE.x, 0.14, 0.1],
            rotation: [0, 0, roofSlope(side)],
          }
        );
      }
    }
  }
  return { frames, purlins, glazingBars };
}

/** The rendered panes are also the authoritative light-path test targets. */
export function buildFactoryRoofGlazing(): BoxInstance[] {
  return ([-1, 1] as const).flatMap((side) => {
    const seat = deckPoint(side, skylightLocalX(side));
    return SKYLIGHT_Z.map((z) => ({
      position: [seat.x, seat.y + SKYLIGHT_KERB_HEIGHT / 2 + 0.05, z] as const,
      scale: [SKYLIGHT_SIZE.x, 0.1, SKYLIGHT_SIZE.z] as const,
      rotation: [0, 0, roofSlope(side)] as const,
    }));
  });
}

/** Full-height glazing is split around the site's existing operational portals. */
export function buildFactoryGlazing(): BoxInstance[] {
  const panes: BoxInstance[] = [];
  const { sideWindowSill: sill, windowHead: head, dockWindowSill } = FACTORY_ENVELOPE_SPEC;
  for (const portal of Object.values(SITE_LAYOUT.portals)) {
    const front = portal.normal[2] !== 0;
    const centres = front
      ? FACTORY_ENVELOPE_SPEC.frontBayCentres
      : FACTORY_ENVELOPE_SPEC.sideBayCentres;
    const opening = front ? portal.centre[0] : portal.centre[2];
    const openingLeft = opening - portal.halfWidth;
    const openingRight = opening + portal.halfWidth;
    const openingTop = front ? dockWindowSill : portal.height + 0.25;
    const add = (left: number, right: number, bottom: number, top: number) => {
      if (right - left < 0.25 || top - bottom < 0.25) return;
      const along = (left + right) / 2;
      const y = (bottom + top) / 2;
      panes.push(
        front
          ? {
              position: [along, y, portal.centre[2] + portal.normal[2] * 0.31],
              scale: [right - left, top - bottom, 0.08],
            }
          : {
              position: [portal.centre[0] + portal.normal[0] * 0.31, y, along],
              scale: [0.08, top - bottom, right - left],
            }
      );
    };
    for (const centre of centres) {
      // Two broad lights per structural bay keep the process floors legible.
      for (let i = 0; i < 2; i++) {
        let left = centre - 9.55 + i * 9.7;
        let right = left + 9.4;
        // Keep the surrounding mullion clear of the operational aperture too.
        if (Math.abs(right - openingLeft) < 0.2) right = openingLeft - 0.2;
        if (Math.abs(left - openingRight) < 0.2) left = openingRight + 0.2;
        const crosses = right > openingLeft && left < openingRight;
        const bottom = crosses ? openingTop : sill;
        add(left, right, bottom, SITE_LAYOUT.datum.mezzanine - 0.3);
        add(left, right, Math.max(bottom, SITE_LAYOUT.datum.mezzanine), head);
        if (crosses) {
          add(left, Math.min(right, openingLeft - 0.2), sill, openingTop);
          add(Math.max(left, openingRight + 0.2), right, sill, openingTop);
        }
      }
    }
  }
  return panes;
}

function FactoryShell() {
  const lowerWallSegments = useMemo<readonly BoxInstance[]>(() => {
    const result: BoxInstance[] = [];
    const height = FACTORY_ENVELOPE_SPEC.baseHeight;
    for (const portal of Object.values(SITE_LAYOUT.portals)) {
      const front = portal.normal[2] !== 0;
      const extent = (front ? FLOOR_WIDTH : FLOOR_DEPTH) / 2;
      const centre = front ? portal.centre[0] : portal.centre[2];
      for (const [from, to] of [
        [-extent, centre - portal.halfWidth],
        [centre + portal.halfWidth, extent],
      ]) {
        const along = (from + to) / 2;
        result.push(
          front
            ? { position: [along, height / 2, portal.centre[2]], scale: [to - from, height, 0.55] }
            : { position: [portal.centre[0], height / 2, along], scale: [0.55, height, to - from] }
        );
      }
    }
    return result;
  }, []);
  const parapetSegments = useMemo<readonly BoxInstance[]>(() => {
    const height = FACTORY_ENVELOPE_SPEC.topBandTop - FACTORY_ENVELOPE_SPEC.topBandBottom;
    const y = FACTORY_ENVELOPE_SPEC.topBandBottom + height / 2;
    return [
      { position: [0, y, 50], scale: [FLOOR_WIDTH, height, 0.55] },
      { position: [0, y, -50], scale: [FLOOR_WIDTH, height, 0.55] },
      { position: [-FLOOR_WIDTH / 2, y, 0], scale: [0.55, height, 100] },
      { position: [FLOOR_WIDTH / 2, y, 0], scale: [0.55, height, 100] },
    ];
  }, []);

  const columns = useMemo<readonly BoxInstance[]>(() => {
    const result: BoxInstance[] = [];
    const height = SITE_LAYOUT.factory.bounds.maxY;
    for (let x = -FLOOR_WIDTH / 2; x <= FLOOR_WIDTH / 2; x += 20) {
      result.push({ position: [x, height / 2, -49.55], scale: [0.42, height, 0.42] });
      result.push({ position: [x, height / 2, 49.55], scale: [0.42, height, 0.42] });
      result.push({ position: [x, 0.06, -49.55], scale: [1.05, 0.12, 1.05] });
      result.push({ position: [x, 0.06, 49.55], scale: [1.05, 0.12, 1.05] });
    }
    for (const z of FACTORY_SIDE_COLUMN_Z) {
      result.push({
        position: [-FLOOR_WIDTH / 2 + 0.45, height / 2, z],
        scale: [0.42, height, 0.42],
      });
      result.push({
        position: [FLOOR_WIDTH / 2 - 0.45, height / 2, z],
        scale: [0.42, height, 0.42],
      });
      result.push({ position: [-FLOOR_WIDTH / 2 + 0.45, 0.06, z], scale: [1.05, 0.12, 1.05] });
      result.push({ position: [FLOOR_WIDTH / 2 - 0.45, 0.06, z], scale: [1.05, 0.12, 1.05] });
    }
    // Chamfer the four vertical building corners. These are the shell's most
    // camera-facing hard edges from every exterior angle.
    for (const x of [-FLOOR_WIDTH / 2 + 0.15, FLOOR_WIDTH / 2 - 0.15]) {
      for (const z of [-49.85, 49.85]) {
        result.push(
          chamferStrip(
            [x, height / 2, z],
            [1.45, height, 0.16],
            [0, (Math.PI / 4) * Math.sign(x * z), 0]
          )
        );
      }
    }
    return result;
  }, []);

  const roofStructure = useMemo(buildFactoryRoofStructure, []);
  const roofTrusses = useMemo(
    () => [...roofStructure.frames, ...roofStructure.purlins],
    [roofStructure]
  );

  const roofEnvelope = useMemo(buildFactoryRoofEnvelope, []);
  const roofPanels = roofEnvelope.panels;

  const roofDetails = useMemo<readonly BoxInstance[]>(() => {
    const height = SITE_LAYOUT.factory.bounds.maxY;
    const result: BoxInstance[] = [
      { position: [0, height - 0.15, -49.4], scale: [FLOOR_WIDTH, 0.18, 0.22] },
      { position: [0, height - 0.15, 49.4], scale: [FLOOR_WIDTH, 0.18, 0.22] },
      { position: [0, height - 0.05, 0], scale: [FLOOR_WIDTH, 0.18, 0.26] },
      { position: [-FLOOR_WIDTH * 0.3, height + 0.45, -18], scale: [5, 1, 3] },
      { position: [0, height + 0.45, -18], scale: [5, 1, 3] },
      { position: [FLOOR_WIDTH * 0.3, height + 0.45, -18], scale: [5, 1, 3] },
    ];

    // Standing seams. A coated-steel deck is not a smooth plane: the battens
    // run down the slope (X here, since the deck tilts about Z) and repeat
    // across it. From the overview camera the roof is one of the largest
    // surfaces in frame, and this is what stops it reading as a painted
    // rectangle.
    //
    // The old 0.45 m ribs were authored for a 74 m-high camera. At the current
    // 32 m overview they read as heavy battens. These lower seams retain real
    // close-view relief and the deck's coating, without enlarging their
    // contrast to compensate for sub-pixel sampling. They stop at skylights.
    // Working if close views show slender ribs and the skylight wells stay clear.
    for (const side of [-1, 1] as const) {
      const skylightX = skylightLocalX(side);
      for (let z = -47.2; z <= 47.2; z += ROOF_BATTEN_PITCH) {
        const crossesSkylight = SKYLIGHT_Z.some(
          (centreZ) => Math.abs(z - centreZ) < SKYLIGHT_SIZE.z / 2 + 0.6
        );
        if (crossesSkylight) {
          result.push(
            buildFactoryRoofBatten(
              side,
              -ROOF_BATTEN_REACH,
              skylightX - SKYLIGHT_BATTEN_CLEARANCE,
              z
            ),
            buildFactoryRoofBatten(
              side,
              skylightX + SKYLIGHT_BATTEN_CLEARANCE,
              ROOF_BATTEN_REACH,
              z
            )
          );
        } else {
          result.push(buildFactoryRoofBatten(side, -ROOF_BATTEN_REACH, ROOF_BATTEN_REACH, z));
        }
      }
      // Upstand kerbs. A roof light sits on a raised frame; without one the
      // glazing is a blue rectangle lying flat on the deck, and from inside
      // there is nothing to read as a light well.
    }

    result.push(...roofEnvelope.kerbs, ...roofStructure.glazingBars);

    // Chamfer the parapet cope. This is the roofline silhouette against the
    // sky from every exterior camera.
    result.push(
      chamferStrip([0, height - 0.04, 49.78], [FLOOR_WIDTH, 0.42, 0.42], [Math.PI / 4, 0, 0]),
      chamferStrip([0, height - 0.04, -49.78], [FLOOR_WIDTH, 0.42, 0.42], [Math.PI / 4, 0, 0]),
      chamferStrip(
        [-FLOOR_WIDTH / 2 + 0.22, height - 0.04, 0],
        [0.42, 0.42, 100],
        [0, 0, Math.PI / 4]
      ),
      chamferStrip(
        [FLOOR_WIDTH / 2 - 0.22, height - 0.04, 0],
        [0.42, 0.42, 100],
        [0, 0, Math.PI / 4]
      )
    );

    return result;
  }, [roofEnvelope, roofStructure]);

  const roofSkylights = useMemo(buildFactoryRoofGlazing, []);

  const windows = useMemo(buildFactoryGlazing, []);
  const facadeAccents = useMemo<readonly BoxInstance[]>(() => {
    const frames: BoxInstance[] = [];
    for (const pane of windows) {
      const [x, y, z] = pane.position;
      const [width, height, depth] = pane.scale;
      const front = width > depth;
      for (const edge of [-1, 1]) {
        frames.push(
          front
            ? {
                position: [x + edge * (width / 2 + 0.07), y, z],
                scale: [0.14, height + 0.28, 0.16],
              }
            : {
                position: [x, y, z + edge * (depth / 2 + 0.07)],
                scale: [0.16, height + 0.28, 0.14],
              }
        );
        frames.push(
          front
            ? { position: [x, y + edge * (height / 2 + 0.07), z], scale: [width, 0.14, 0.16] }
            : { position: [x, y + edge * (height / 2 + 0.07), z], scale: [0.16, 0.14, depth] }
        );
      }
    }
    return frames;
  }, [windows]);

  return (
    // SHADOW FLAGS ARE SET HERE, AT SOURCE.
    //
    // Every opaque envelope mesh casts. The roof was the only thing that did,
    // so at the default 10:00 sun - 60 degrees, roof shadow displaced 19 units
    // down-sun - a 19 x 100 m band of interior floor was lit straight through a
    // solid wall. The glazing and the skylights deliberately do NOT cast, which
    // is what turns the clerestory bays into real bands of sunlight on the slab
    // instead of a uniformly shadowed interior.
    <group name="persistent-factory-wall-envelope">
      <InstancedBoxes
        instances={lowerWallSegments}
        material={MATERIALS.wall}
        castShadow
        receiveShadow
      />
      <InstancedBoxes
        instances={parapetSegments}
        material={MATERIALS.wallParapet}
        castShadow
        receiveShadow
      />
      <InstancedBoxes instances={columns} material={MATERIALS.steel} castShadow receiveShadow />
      <InstancedBoxes
        instances={roofTrusses}
        material={MATERIALS.steelTrim}
        castShadow
        receiveShadow
      />
      <InstancedBoxes instances={roofPanels} material={MATERIALS.roof} castShadow receiveShadow />
      <InstancedBoxes
        instances={roofDetails}
        material={MATERIALS.roofTrim}
        castShadow
        receiveShadow
      />
      <InstancedBoxes instances={roofSkylights} material={MATERIALS.skylight} />
      <InstancedBoxes
        instances={facadeAccents}
        material={MATERIALS.steelTrim}
        castShadow
        receiveShadow
      />
      <InstancedBoxes
        instances={windows}
        material={MATERIALS.glass}
        renderOrder={RENDER_ORDER.default}
      />
      <FactoryIdentitySign />
    </group>
  );
}

function FactoryIdentitySign() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#14242a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = '600 148px Inter, Arial, sans-serif';
      context.textBaseline = 'middle';
      const wordWidth = context.measureText('MillOS').width;
      const start = (canvas.width - wordWidth) / 2;
      context.fillStyle = '#edf4f1';
      context.fillText('Mill', start, canvas.height / 2);
      context.fillStyle = '#3ab0a5';
      context.fillText('OS', start + context.measureText('Mill').width, canvas.height / 2);
    }
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.needsUpdate = true;
    return canvasTexture;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
      }),
    [texture]
  );

  useEffect(
    () => () => {
      material.dispose();
      texture.dispose();
    },
    [material, texture]
  );

  return (
    <mesh
      geometry={UNIT_PLANE}
      material={material}
      position={[-FLOOR_WIDTH / 2 + 10, SITE_LAYOUT.factory.bounds.maxY - 1, 50.34]}
      scale={[12, 2.5, 1]}
      renderOrder={RENDER_ORDER.default + 1}
    />
  );
}

/**
 * Peak the fixture lens is driven to once the composer is mounted.
 *
 * `BLOOM.luminanceThreshold` is 1.0 - bloom only fires on true super-white -
 * and `#ffe8b0` peaks at exactly 1.0 linear, so the fixtures could never bloom.
 * 2.6 clears the threshold with margin and still rolls off politely under the
 * Neutral curve.
 */
const FIXTURE_LENS_HDR_SCALE = 2.6;
const FIXTURE_LENS_COLOR = '#ffe8b0';

/**
 * OLD CONTRACT: the `low` tier mounts no composer.
 *
 * `toneMapped: false` means the material's colour is written to the display
 * buffer verbatim, so on `low` a value of 2.6 clamps to a flat white blob with
 * no shape at all. The boost is therefore gated on exactly the predicate that
 * mounts the composer, and BOTH branches are written every time so a mid-session
 * quality change (or `adaptiveQuality` downgrading the preset) cannot strand the
 * material on the wrong value.
 */
function useFixtureLensExposure(): void {
  const composerActive = useGraphicsStore((state) => isPostProcessingActive(state.graphics));

  useEffect(() => {
    const lens = MATERIALS.fixtureGlow;
    lens.color.set(FIXTURE_LENS_COLOR);
    if (composerActive) lens.color.multiplyScalar(FIXTURE_LENS_HDR_SCALE);
  }, [composerActive]);
}

function CeilingLighting() {
  useFixtureLensExposure();

  const housings = useMemo<readonly BoxInstance[]>(
    () =>
      FIXTURE_GRID_X.flatMap((x) =>
        FIXTURE_GRID_Z.map((z) => ({
          position: [x, SITE_LAYOUT.factory.bounds.maxY - 3.8, z] as const,
          scale: [6.2, 0.18, 0.78] as const,
        }))
      ),
    []
  );
  const emitters = useMemo<readonly BoxInstance[]>(
    () =>
      housings.map(({ position }) => ({
        position: [position[0], position[1] - 0.11, position[2]] as const,
        scale: [5.55, 0.045, 0.48] as const,
      })),
    [housings]
  );

  return (
    <group name="factory-ceiling-fixtures">
      <InstancedBoxes instances={housings} material={MATERIALS.fixtureHousing} castShadow />
      <InstancedBoxes
        instances={emitters}
        material={MATERIALS.fixtureGlow}
        renderOrder={RENDER_ORDER.default + 1}
      />
    </group>
  );
}

/**
 * Zone signs hang 1.1 m inside a side wall. RAW STORAGE takes the east wall,
 * the silo-yard side; on the west wall it would share a plane with MILLING
 * only 3 m away and the two 7.2 m signs would overlap.
 */
const ZONE_SIGN_DATA: ReadonlyArray<{
  readonly label: string;
  readonly z: number;
  readonly accent: string;
  readonly side?: 'east' | 'west';
}> = [
  {
    label: '01  RAW STORAGE',
    z: SITE_LAYOUT.factory.zones.silos,
    accent: '#4f9ac8',
    side: 'east',
  },
  { label: '02  MILLING', z: SITE_LAYOUT.factory.zones.milling, accent: '#d79a4b' },
  { label: '03  SIFTING', z: SITE_LAYOUT.factory.zones.sifting, accent: '#9b82ca' },
  { label: '04  PACKING', z: SITE_LAYOUT.factory.zones.packing, accent: '#55ad7b' },
];

function ZoneWayfindingSigns() {
  const resources = useMemo(
    () =>
      ZONE_SIGN_DATA.map((sign) => {
        const canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 192;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#162529';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = sign.accent;
          context.fillRect(0, 0, 22, canvas.height);
          context.fillStyle = '#eef4f1';
          context.font = '700 55px Inter, Arial, sans-serif';
          context.textBaseline = 'middle';
          context.fillText(sign.label, 58, canvas.height / 2);
          context.fillStyle = sign.accent;
          context.fillRect(58, 143, 620, 7);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Painted wall signs, not lightboxes: lit, like `FactoryIdentitySign`.
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.6,
          metalness: 0,
        });
        return { ...sign, texture, material };
      }),
    []
  );

  useEffect(
    () => () => {
      resources.forEach(({ material, texture }) => {
        material.dispose();
        texture.dispose();
      });
    },
    [resources]
  );

  return (
    <group name="factory-zone-wayfinding">
      {resources.map(({ label, z, side, material }) => (
        <mesh
          key={label}
          geometry={UNIT_PLANE}
          material={material}
          position={[side === 'east' ? FLOOR_WIDTH / 2 - 1.1 : -FLOOR_WIDTH / 2 + 1.1, 6.2, z]}
          rotation={[0, side === 'east' ? -Math.PI / 2 : Math.PI / 2, 0]}
          scale={[7.2, 1.8, 1]}
          renderOrder={RENDER_ORDER.default + 1}
        />
      ))}
    </group>
  );
}

function PortalFrames() {
  const frames = useMemo<readonly BoxInstance[]>(
    () => [
      // Shipping portal.
      { position: [-15.35, 7, 49.36], scale: [0.7, 14, 0.9] },
      { position: [15.35, 7, 49.36], scale: [0.7, 14, 0.9] },
      { position: [0, 14.35, 49.36], scale: [31.4, 0.7, 0.9] },
      // Receiving portal.
      { position: [-9.35, 7, -49.36], scale: [0.7, 14, 0.9] },
      { position: [9.35, 7, -49.36], scale: [0.7, 14, 0.9] },
      { position: [0, 14.35, -49.36], scale: [19.4, 0.7, 0.9] },
      // Service portal frames, derived from the portals so they follow the
      // wall openings: 0.64 m inboard of the wall line, like the dock frames.
      ...[SITE_LAYOUT.portals.westService, SITE_LAYOUT.portals.eastService].flatMap(
        (portal): BoxInstance[] => {
          const x = portal.centre[0] - portal.normal[0] * 0.64;
          const z = portal.centre[2];
          const jambOffset = portal.halfWidth + 0.35;
          return [
            { position: [x, portal.height / 2, z - jambOffset], scale: [0.9, portal.height, 0.7] },
            { position: [x, portal.height / 2, z + jambOffset], scale: [0.9, portal.height, 0.7] },
            {
              position: [x, portal.height + 0.35, z],
              scale: [0.9, 0.7, 2 * portal.halfWidth + 1.4],
            },
          ];
        }
      ),
      // Chamfer the two dock jambs. These are the shell's most-approached
      // edges - every truck and every forklift passes within a metre.
      chamferStrip([-15.05, 7, 49.0], [0.34, 14, 0.34], [0, Math.PI / 4, 0]),
      chamferStrip([15.05, 7, 49.0], [0.34, 14, 0.34], [0, Math.PI / 4, 0]),
      chamferStrip([-9.05, 7, -49.0], [0.34, 14, 0.34], [0, Math.PI / 4, 0]),
      chamferStrip([9.05, 7, -49.0], [0.34, 14, 0.34], [0, Math.PI / 4, 0]),
    ],
    []
  );
  const bollards = useMemo(
    () =>
      [
        [-18, 0.65, 47.5],
        [18, 0.65, 47.5],
        [-12, 0.65, -47.5],
        [12, 0.65, -47.5],
      ] as const,
    []
  );
  const bollardRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!bollardRef.current) return;
    const object = new THREE.Object3D();
    bollards.forEach((position, index) => {
      object.position.set(position[0], position[1], position[2]);
      object.scale.set(0.24, 1.3, 0.24);
      object.updateMatrix();
      bollardRef.current?.setMatrixAt(index, object.matrix);
    });
    bollardRef.current.instanceMatrix.needsUpdate = true;
    bollardRef.current.computeBoundingSphere();
  }, [bollards]);

  return (
    <>
      <InstancedBoxes instances={frames} material={MATERIALS.steel} castShadow receiveShadow />
      <instancedMesh
        ref={bollardRef}
        args={[PORTAL_BOLLARD, MATERIALS.safetyLit, bollards.length]}
        castShadow
        receiveShadow
      />
    </>
  );
}

function SafetyFurniture() {
  const rails = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [-28, 0.55, SITE_LAYOUT.factory.zones.packing], scale: [0.18, 1.1, 9] },
      { position: [24, 0.55, SITE_LAYOUT.factory.zones.packing], scale: [0.18, 1.1, 9] },
      { position: [-30, 0.55, SITE_LAYOUT.factory.zones.milling + 1], scale: [0.18, 1.1, 11] },
      { position: [23, 0.55, SITE_LAYOUT.factory.zones.milling + 1], scale: [0.18, 1.1, 11] },
    ],
    []
  );
  const stations = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [-FLOOR_WIDTH / 2 + 3.2, 1.25, 12], scale: [0.45, 2.5, 1.4] },
      { position: [FLOOR_WIDTH / 2 - 3.2, 1.25, 12], scale: [0.45, 2.5, 1.4] },
      { position: [-FLOOR_WIDTH / 2 + 3.2, 1.25, -35], scale: [0.45, 2.5, 1.4] },
      { position: [FLOOR_WIDTH / 2 - 3.2, 1.25, -35], scale: [0.45, 2.5, 1.4] },
    ],
    []
  );

  return (
    <>
      <InstancedBoxes instances={rails} material={MATERIALS.safetyLit} castShadow receiveShadow />
      <InstancedBoxes instances={stations} material={MATERIALS.danger} castShadow receiveShadow />
    </>
  );
}

function FloorWayfinding() {
  const walkways = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [-FLOOR_WIDTH / 2 + 3, FLOOR_LAYERS.wornPrimary, 0], scale: [3, 0.012, 86] },
      { position: [FLOOR_WIDTH / 2 - 3, FLOOR_LAYERS.wornPrimary, 0], scale: [3, 0.012, 86] },
      { position: [0, FLOOR_LAYERS.wornPrimary, 39], scale: [72, 0.012, 3.5] },
      { position: [0, FLOOR_LAYERS.wornPrimary, -39], scale: [72, 0.012, 3.5] },
    ],
    []
  );
  const plinths = useMemo<readonly BoxInstance[]>(
    () => [
      {
        position: [
          SITE_LAYOUT.bulkStorage.siloPad.position[0],
          0.08,
          SITE_LAYOUT.factory.zones.silos,
        ],
        scale: SITE_LAYOUT.bulkStorage.siloPad.size,
      },
      { position: [-3, 0.08, SITE_LAYOUT.factory.zones.milling], scale: [53, 0.16, 7] },
      { position: [0, 0.08, SITE_LAYOUT.factory.zones.packing], scale: [26, 0.16, 9] },
    ],
    []
  );

  return (
    <>
      <InstancedBoxes
        instances={walkways}
        material={MATERIALS.walkway}
        renderOrder={RENDER_ORDER.floorEffects}
        receiveShadow
      />
      <InstancedBoxes instances={plinths} material={MATERIALS.plinth} castShadow receiveShadow />
    </>
  );
}

/**
 * The walking surface and support centres retain the original gallery layout.
 * The 460 mm solid slab becomes a thin deck seated on visible rolled sections.
 * All pieces still share three instanced batches, including the low preset.
 * Working if flange edges read from the milling aisle, every stanchion meets
 * the deck, and the beams remain above the existing process routes.
 */
export function buildProcessGallery(): {
  deck: BoxInstance[];
  supports: BoxInstance[];
  rails: BoxInstance[];
} {
  const z = SITE_LAYOUT.factory.zones.sifting;
  const deckTop = SITE_LAYOUT.datum.mezzanine - 0.15;
  const deckBottom = deckTop - 0.16;
  const girderBottom = deckBottom - 0.7;
  const shaftTop = girderBottom - 0.08;
  const deck: BoxInstance[] = [];
  const apertureHalfSize = 0.55;
  for (const side of [-1, 1]) {
    deck.push({
      position: [0, deckTop - 0.08, z + (side * (5.5 + apertureHalfSize)) / 2],
      scale: [43, 0.16, 5.5 - apertureHalfSize],
    });
  }
  const openings = SITE_LAYOUT.machines.sifters.map((anchor) => anchor.position[0]);
  let left = -21.5;
  for (const right of [...openings.map((x) => x - apertureHalfSize), 21.5]) {
    deck.push({
      position: [(left + right) / 2, deckTop - 0.08, z],
      scale: [right - left, 0.16, apertureHalfSize * 2],
    });
    left = right + apertureHalfSize * 2;
  }
  const supports: BoxInstance[] = [];
  const rails: BoxInstance[] = [];

  for (const side of [-1, 1]) {
    const rowZ = z + side * 4.8;
    // Longitudinal I-girder: two flanges and a recessed web. The top flange
    // touches the deck; end overhangs stay within its existing footprint.
    for (const y of [girderBottom + 0.03, deckBottom - 0.03]) {
      supports.push({ position: [0, y, rowZ], scale: [43, 0.06, 0.5] });
    }
    supports.push({
      position: [0, (girderBottom + deckBottom) / 2, rowZ],
      scale: [43, 0.58, 0.055],
    });
    for (const x of PROCESS_GALLERY_POST_X) {
      // Same 360 mm shaft envelope and centres as the original plain posts.
      // Base and head plates give each connection a visible bearing surface.
      supports.push({ position: [x, 0.06, rowZ], scale: [0.62, 0.12, 0.62] });
      supports.push({
        position: [x, shaftTop + 0.04, rowZ],
        scale: [0.56, 0.08, 0.56],
      });
      for (const offset of [-0.1475, 0.1475]) {
        supports.push({
          position: [x + offset, (shaftTop + 0.12) / 2, rowZ],
          scale: [0.065, shaftTop - 0.12, 0.36],
        });
      }
      supports.push({
        position: [x, (shaftTop + 0.12) / 2, rowZ],
        scale: [0.23, shaftTop - 0.12, 0.06],
      });
    }
  }
  // Cross-joists seat flush with the deck, between the main girders. Their
  // shallower web keeps the underside open. The centre bay straddles the
  // existing finished-product riser instead of running a joist through it.
  for (const x of [-20, -15, -10, -5, -2.5, 2.5, 5, 10, 15, 20]) {
    for (const y of [deckBottom - 0.355, deckBottom - 0.025]) {
      supports.push({ position: [x, y, z], scale: [0.28, 0.05, 9.1] });
    }
    supports.push({ position: [x, deckBottom - 0.19, z], scale: [0.045, 0.28, 9.1] });
  }

  const railTop = deckTop + 1.2;
  for (const side of [-1, 1]) {
    const rowZ = z + side * 5.35;
    // Restrained toe board, mid rail and handrail, continuous around the ends.
    rails.push({ position: [0, deckTop + 0.12, rowZ], scale: [42.7, 0.24, 0.07] });
    for (const y of [deckTop + 0.57, railTop - 0.055]) {
      rails.push({ position: [0, y, rowZ], scale: [42.7, 0.11, 0.11] });
      rails.push({ position: [side * 21.35, y, z], scale: [0.11, 0.11, 10.7] });
    }
    rails.push({ position: [side * 21.35, deckTop + 0.12, z], scale: [0.07, 0.24, 10.7] });
    for (let bay = 0; bay <= 12; bay++) {
      rails.push({
        position: [-21.35 + (42.7 * bay) / 12, deckTop + 0.6, rowZ],
        scale: [0.11, 1.2, 0.11],
      });
    }
    for (const offset of [-1.78, 1.78]) {
      rails.push({
        position: [side * 21.35, deckTop + 0.6, z + offset],
        scale: [0.11, 1.2, 0.11],
      });
    }
  }
  return { deck, supports, rails };
}

function ElevatedProcessGallery() {
  const { deck, supports, rails } = useMemo(buildProcessGallery, []);
  return (
    <group name="sifter-process-gallery">
      <InstancedBoxes instances={deck} material={MATERIALS.gallery} castShadow receiveShadow />
      <InstancedBoxes
        instances={supports}
        material={MATERIALS.steelTrim}
        castShadow
        receiveShadow
      />
      <InstancedBoxes instances={rails} material={MATERIALS.galleryRail} castShadow receiveShadow />
    </group>
  );
}

function ZoneOverlays() {
  const zoneBands = useMemo<readonly BoxInstance[]>(
    () => [
      {
        position: [
          SITE_LAYOUT.bulkStorage.siloPad.position[0],
          FLOOR_LAYERS.safetyMain,
          SITE_LAYOUT.factory.zones.silos,
        ],
        scale: [
          SITE_LAYOUT.bulkStorage.siloPad.size[0],
          0.012,
          SITE_LAYOUT.bulkStorage.siloPad.size[2],
        ],
      },
      {
        position: [0, FLOOR_LAYERS.safetyMain, SITE_LAYOUT.factory.zones.milling],
        scale: [54, 0.012, 11],
      },
      {
        position: [0, FLOOR_LAYERS.safetyMain, SITE_LAYOUT.factory.zones.sifting],
        scale: [54, 0.012, 10],
      },
      {
        position: [0, FLOOR_LAYERS.safetyMain, SITE_LAYOUT.factory.zones.packing],
        scale: [54, 0.012, 15],
      },
    ],
    []
  );
  const aisleLines = useMemo<readonly BoxInstance[]>(
    () => [
      { position: [-31, FLOOR_LAYERS.safetyCross, 0], scale: [0.16, 0.014, 88] },
      { position: [31, FLOOR_LAYERS.safetyCross, 0], scale: [0.16, 0.014, 88] },
      { position: [0, FLOOR_LAYERS.safetyCross, 43], scale: [58, 0.014, 0.16] },
      { position: [0, FLOOR_LAYERS.safetyCross, -43], scale: [58, 0.014, 0.16] },
    ],
    []
  );

  return (
    <group renderOrder={RENDER_ORDER.floorMarkings}>
      <InstancedBoxes instances={[zoneBands[0]]} material={MATERIALS.zoneStorage} />
      <InstancedBoxes instances={[zoneBands[1]]} material={MATERIALS.zoneMilling} />
      <InstancedBoxes instances={[zoneBands[2]]} material={MATERIALS.zoneSifting} />
      <InstancedBoxes instances={[zoneBands[3]]} material={MATERIALS.zonePacking} />
      <InstancedBoxes instances={aisleLines} material={MATERIALS.safetyPaint} />
    </group>
  );
}

interface OptimizedFactoryInfrastructureProps {
  readonly showZones: boolean;
}

/**
 * Default-quality factory shell. It preserves the real portals and factory
 * dimensions while replacing hundreds of small JSX geometries with shared,
 * instanced construction elements.
 */
export function OptimizedFactoryInfrastructure({ showZones }: OptimizedFactoryInfrastructureProps) {
  return (
    <group name="optimized-factory-infrastructure" dispose={null}>
      <mesh
        geometry={FLOOR_PLANE}
        material={MATERIALS.floor}
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FLOOR_WIDTH, FLOOR_DEPTH, 1]}
        receiveShadow
      />
      <FactoryShell />
      <CeilingLighting />
      <ZoneWayfindingSigns />
      <PortalFrames />
      <FloorWayfinding />
      <ElevatedProcessGallery />
      <SafetyFurniture />
      {showZones && <ZoneOverlays />}
    </group>
  );
}
