/**
 * Containment (bund) pad concrete, authored in METRES for one specific slab.
 *
 * WHY THIS IS NOT THE SHARED CONCRETE TILE. The utility tank farm pad is a
 * single 22 x 42 m box with one UV island across its top face. A tiled map
 * there either repeats a 3-4 m tile ten times (rule 7: a lattice the eye locks
 * onto) or stretches one tile across 42 m (mush). And the things that make a
 * bund slab read as a bund slab are LAYOUT, not grain: saw-cut joints at the
 * pour pitch, drip and seep staining exactly under the vessel saddles, and a
 * damp line where water stands against the bund wall. A tiling generator cannot
 * put a stain under a saddle. So this map is generated once, at repeat 1, from
 * the same vessel table the scene places the tanks from.
 *
 * TEXEL DENSITY. 512 x 1024 over 22 x 42 m is ~4.2 cm per texel, comparable to
 * the shared 512 px concrete at its usual 4-6 m tiling. Every noise period below
 * is chosen so its finest octave stays above ~4.5 texels (CLAUDE.md procedural
 * texture rule 5): the grain's finest octave is 0.2 m, about 4.7 texels.
 *
 * UV CONVENTION (pinned by the test). three's BoxGeometry +Y face puts uv (0,0)
 * at (-W/2, +D/2) and uv (1,1) at (+W/2, -D/2); DataTexture is not flipped, so
 * texel row 0 is v = 0, which is z = +D/2. `containmentPadTexel` is the one
 * place that mapping lives.
 */
import * as THREE from 'three';
import {
  createColorDataTexture,
  createLinearDataTexture,
  getTexture,
} from '../utils/textureGenerator';

/**
 * Integer-mix lattice hash, as in `terrain/terrainTextures.ts`. The shared
 * `hash()` is `fract(sin(...))`; at half a million texels and ~10 noise octaves
 * per texel the transcendental cost 2.8 s of load time on this map alone, and
 * this mix is about five times cheaper with the same uniformity.
 */
const intHash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const valueNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = intHash(ix, iy);
  const b = intHash(ix + 1, iy);
  const c = intHash(ix, iy + 1);
  const d = intHash(ix + 1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
};

/** Signed fBm centred on zero, range about [-0.5, 0.5]. */
const fbmNoiseSigned = (x: number, y: number, octaves: number): number => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    // Non-integer lacunarity keeps successive lattices from aligning.
    frequency *= 2.03;
  }
  return value / total - 0.5;
};

/** One saddle footprint, in pad-local metres. Radii are the stain's half-extents. */
export interface ContainmentSaddle {
  readonly x: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
}

/**
 * A rain drip line: water shed off a horizontal vessel's flank falls in a
 * band parallel to its axis, at `z`, between `x0` and `x1`.
 */
export interface ContainmentDripLine {
  readonly x0: number;
  readonly x1: number;
  readonly z: number;
}

export interface ContainmentPadLayout {
  readonly widthMetres: number;
  readonly depthMetres: number;
  readonly saddles: readonly ContainmentSaddle[];
  readonly dripLines?: readonly ContainmentDripLine[];
  /** Saw-cut joint pitch along x and z, metres. */
  readonly jointPitch: readonly [number, number];
}

/** A horizontal vessel on two saddles, axis along pad-local x. */
export interface ContainmentVessel {
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly radius: number;
}

/**
 * Derive the stain layout from the vessels the scene places. The saddles sit at
 * +/- length/3 (as `StorageTank` builds them) and span the tank's width, so the
 * stain is elongated across the axis; the drip lines fall just outside each
 * flank, where rain leaves the shell.
 */
export function containmentLayoutForVessels(
  widthMetres: number,
  depthMetres: number,
  vessels: readonly ContainmentVessel[]
): ContainmentPadLayout {
  return {
    widthMetres,
    depthMetres,
    jointPitch: [widthMetres / 4, depthMetres / 7],
    saddles: vessels.flatMap((vessel) =>
      [-1, 1].map((side) => ({
        x: vessel.x + (side * vessel.length) / 3,
        z: vessel.z,
        radiusX: 0.9,
        radiusZ: vessel.radius * 0.8,
      }))
    ),
    dripLines: vessels.flatMap((vessel) =>
      [-1, 1].map((side) => ({
        x0: vessel.x - vessel.length / 2 - vessel.radius * 0.6,
        x1: vessel.x + vessel.length / 2 + vessel.radius * 0.6,
        z: vessel.z + side * vessel.radius * 1.02,
      }))
    ),
  };
}

/** Pad-local metres at the centre of a texel. */
export function containmentPadTexel(
  layout: ContainmentPadLayout,
  width: number,
  height: number,
  col: number,
  row: number
): { x: number; z: number } {
  return {
    x: ((col + 0.5) / width - 0.5) * layout.widthMetres,
    z: (0.5 - (row + 0.5) / height) * layout.depthMetres,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface PadSample {
  /** Signed tonal offset: grain + macro + per-bay pour tint. */
  readonly tone: number;
  /** 0-1 joint darkness. */
  readonly joint: number;
  /** 0-1 saddle drip / rust stain. */
  readonly stain: number;
  /** 0-1 oil soaked into the slab, the part of the stain that is smoother. */
  readonly oil: number;
  /** 0-1 damp line against the bund walls. */
  readonly damp: number;
}

/** Distance in texel-independent metres to the nearest joint line on one axis. */
const jointDistance = (value: number, origin: number, pitch: number): number => {
  const local = (value - origin) / pitch;
  return Math.abs(local - Math.round(local)) * pitch;
};

function samplePad(layout: ContainmentPadLayout, x: number, z: number): PadSample {
  const halfW = layout.widthMetres / 2;
  const halfD = layout.depthMetres / 2;

  // Grain: 0.8 m base period, three octaves, finest 0.2 m.
  const grain = fbmNoiseSigned(x / 0.8 + 31.7, z / 0.8 + 7.3, 3) * 0.1;
  // Macro pour/cure drift, two octaves at ~9 m - the term that reads at the
  // tank-farm camera, where the old flat pad measured luma std 4.7.
  const macro = fbmNoiseSigned(x / 9 + 3.1, z / 9 + 11.9, 2) * 0.16;
  // Each pour bay cures to its own shade, bounded by the joints.
  const bayX = Math.floor((x + halfW) / layout.jointPitch[0]);
  const bayZ = Math.floor((z + halfD) / layout.jointPitch[1]);
  const bay = (intHash(bayX + 17, bayZ + 5) - 0.5) * 0.05;

  // Saw-cut joints: ~8 cm wide, a soft shoulder either side. Not cut through
  // the outer metre, where the slab meets the bund wall.
  const dx = jointDistance(x, -halfW, layout.jointPitch[0]);
  const dz = jointDistance(z, -halfD, layout.jointPitch[1]);
  const jointLine = 1 - smoothstep(0.03, 0.09, Math.min(dx, dz));
  const inside = smoothstep(0.6, 1.0, Math.min(halfW - Math.abs(x), halfD - Math.abs(z)));
  const joint = jointLine * inside;

  // Saddle stains: an elliptical drip halo with a noise-broken edge, darker at
  // the foot, plus an oil core that soaks in (smoother as well as darker).
  let stain = 0;
  let oil = 0;
  for (const saddle of layout.saddles) {
    const ex = (x - saddle.x) / saddle.radiusX;
    const ez = (z - saddle.z) / saddle.radiusZ;
    const ellipse = Math.sqrt(ex * ex + ez * ez);
    // The edge noise is at most 0.275 inward, so beyond 1.6 the halo is zero.
    // Skipping the noise there is what keeps generation cost at load time sane.
    if (ellipse > 1.6) continue;
    const edge = fbmNoiseSigned(x / 0.9 + saddle.x, z / 0.9 + saddle.z, 2) * 0.55;
    const d = ellipse + edge;
    stain = Math.max(stain, 1 - smoothstep(0.35, 1.25, d));
    oil = Math.max(oil, 1 - smoothstep(0.1, 0.75, d));
  }

  // Drip lines: a ~0.8 m band of splash darkening, broken along its length so
  // it reads as weathering and not as a painted stripe. The ends fade out.
  let drip = 0;
  for (const line of layout.dripLines ?? []) {
    const across = Math.abs(z - line.z);
    if (across > 0.9 || x < line.x0 - 0.5 || x > line.x1 + 0.5) continue;
    const along =
      smoothstep(line.x0 - 0.5, line.x0 + 0.6, x) *
      (1 - smoothstep(line.x1 - 0.6, line.x1 + 0.5, x));
    const broken = 0.75 + fbmNoiseSigned(x / 1.8 + line.z, z / 1.8, 2) * 1.2;
    drip = Math.max(drip, (1 - smoothstep(0.12, 0.75, across)) * along * clamp01(broken));
  }
  stain = Math.max(stain, drip * 0.7);

  // Standing water dries last against the bund walls.
  const edgeDistance = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
  const damp =
    edgeDistance >= 0.9
      ? 0
      : (1 - smoothstep(0.15, 0.9, edgeDistance)) *
        (0.6 + fbmNoiseSigned(x / 1.6 + 5.5, z / 1.6 + 2.2, 2) * 0.8);

  return { tone: grain + macro + bay, joint, stain, oil, damp: clamp01(damp) };
}

/** Bump when the generator's output changes. */
const PAD_VERSION = 'v1';
const layoutKey = (layout: ContainmentPadLayout, w: number, h: number): string =>
  `containment-pad-${PAD_VERSION}-${w}x${h}-${JSON.stringify(layout)}`;

/**
 * sRGB albedo for the containment pad. Neutral-warm weathered concrete
 * (0.60 sRGB ~ 0.32 linear), deliberately not the old mint `#a9afb0`.
 */
export const generateContainmentPad = (
  layout: ContainmentPadLayout,
  width = 512,
  height = 1024
): THREE.DataTexture =>
  getTexture(`${layoutKey(layout, width, height)}-color`, () => {
    const data = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const { x, z } = containmentPadTexel(layout, width, height, col, row);
        const s = samplePad(layout, x, z);
        let r = 0.61 + s.tone;
        let g = 0.6 + s.tone;
        let b = 0.57 + s.tone * 0.95;

        const jointDark = 1 - s.joint * 0.3;
        r *= jointDark;
        g *= jointDark;
        b *= jointDark;

        // Rust-brown drip halo, then a near-black oil core.
        const stain = s.stain * 0.6;
        r = r * (1 - stain) + 0.4 * stain;
        g = g * (1 - stain) + 0.34 * stain;
        b = b * (1 - stain) + 0.28 * stain;
        const oil = s.oil * 0.45;
        r = r * (1 - oil) + 0.2 * oil;
        g = g * (1 - oil) + 0.19 * oil;
        b = b * (1 - oil) + 0.18 * oil;

        const damp = 1 - s.damp * 0.16;
        r *= damp;
        g *= damp;
        b *= damp * 1.01;

        const i = (row * width + col) * 4;
        data[i] = Math.round(clamp01(r) * 255);
        data[i + 1] = Math.round(clamp01(g) * 255);
        data[i + 2] = Math.round(clamp01(b) * 255);
        data[i + 3] = 255;
      }
    }
    const texture = createColorDataTexture(data, width, height);
    // One island at repeat 1: clamp so the mip chain cannot bleed the far edge in.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  });

/**
 * Linear roughness for the same layout. R, G and B all carry the value: three
 * reads `roughnessMap.g`, and a map written only to R multiplies roughness by 0.
 */
export const generateContainmentPadRoughness = (
  layout: ContainmentPadLayout,
  width = 256,
  height = 512
): THREE.DataTexture =>
  getTexture(`${layoutKey(layout, width, height)}-roughness`, () => {
    const data = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const { x, z } = containmentPadTexel(layout, width, height, col, row);
        const s = samplePad(layout, x, z);
        const roughness = clamp01(
          0.9 + s.tone * 0.25 + s.joint * 0.06 - s.oil * 0.32 - s.damp * 0.08
        );
        const value = Math.round(roughness * 255);
        const i = (row * width + col) * 4;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
    }
    const texture = createLinearDataTexture(data, width, height);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  });
