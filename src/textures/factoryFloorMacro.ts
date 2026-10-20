/**
 * The factory slab's macro albedo and packed AO/roughness maps.
 *
 * Moved verbatim out of `OptimizedFactoryInfrastructure.tsx`, which built the
 * 1024^2 pair at module evaluation of the scene chunk (~0.36 s of main-thread
 * work in the startup profile). This module is free of React and DOM access so
 * the startup bake worker can build the maps first; `getFloorMacroMaps` puts
 * both behind `getTexture` keys, so the scene finds them already cached.
 */
import * as THREE from 'three';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { getTexture, hash } from '../utils/textureGenerator';

export const FLOOR_WIDTH = SITE_LAYOUT.factory.floor.width;
export const FLOOR_DEPTH = SITE_LAYOUT.factory.floor.depth;

/** Expansion-joint pitch in metres. Also the detail-map tile pitch. */
export const FLOOR_JOINT_PITCH = 10;
export const FLOOR_JOINT_TILES_X = FLOOR_WIDTH / FLOOR_JOINT_PITCH;
export const FLOOR_JOINT_TILES_Z = FLOOR_DEPTH / FLOOR_JOINT_PITCH;

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
export const FLOOR_MACRO_SIZE = 1024;

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

export interface FloorMacroMaps {
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
 * The scene's one pair of floor macro maps, through the texture cache: the
 * startup bake builds them off the main thread and seeds both keys, and the
 * scene chunk's call is then two cache hits. Built together on a miss, as
 * before, and each texture is exactly what `buildFloorMacroMaps` returns.
 */
export function getFloorMacroMaps(size: number = FLOOR_MACRO_SIZE): FloorMacroMaps {
  let built: FloorMacroMaps | null = null;
  const build = () => (built ??= buildFloorMacroMaps(size));
  const albedo = getTexture(`factory-floor-macro-albedo-v1-${size}`, () => build().albedo);
  const surface = getTexture(`factory-floor-macro-surface-v1-${size}`, () => build().surface);
  return { albedo, surface };
}
