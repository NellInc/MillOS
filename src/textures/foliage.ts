/**
 * Foliage Texture Generators
 *
 * Alpha-cut leaf / needle / grass-blade atlases for card-based vegetation.
 * These are the first cut-out textures in the project: every canopy before
 * this was a solid polyhedron, which is the single loudest "prototype" signal
 * in an exterior frame.
 *
 * Three things here are load-bearing and easy to get silently wrong:
 *
 * 1. COLOUR BLEED. Transparent texels must still carry the colour of the
 *    nearest opaque texel. If they are left at 0 the GPU's mip reduction
 *    averages black into every leaf edge and the canopy grows a dark fringe
 *    as the camera pulls back.
 * 2. ALPHA DILATION. Mip reduction also averages alpha, so a thin leaflet
 *    falls below `alphaTest` a couple of mips down and the canopy dissolves.
 *    A sub-threshold halo is written around every cut edge: it stays below the
 *    test at mip 0 (so the silhouette is unchanged up close) but lifts the
 *    averages that the mip chain sees.
 * 3. COLOUR SPACE. Albedo goes through `createColorDataTexture` (sRGB);
 *    normal / roughness through `createLinearDataTexture`.
 */

import * as THREE from 'three';
import {
  getTexture,
  hash,
  fbmNoiseSigned,
  createColorDataTexture,
  createLinearDataTexture,
} from '../utils/textureGenerator';

export type FoliageKind = 'broadleaf' | 'needle';

/** One rasterised leaf blob, shared by the albedo and the height pass so the
 *  normal map lines up with the cut-out exactly. */
interface Leaflet {
  /** Centre in cell-normalised space [0,1]. */
  cx: number;
  cy: number;
  /** Semi-axes in cell-normalised space. */
  rx: number;
  ry: number;
  cos: number;
  sin: number;
  r: number;
  g: number;
  b: number;
  /** Relief amplitude for the height pass. */
  amp: number;
}

const PALETTES: Record<FoliageKind, { dark: number[]; light: number[]; autumn: number[] }> = {
  broadleaf: {
    dark: [0.247, 0.42, 0.165], // #3f6b2a
    light: [0.467, 0.659, 0.247], // #77a83f
    autumn: [0.63, 0.55, 0.19],
  },
  needle: {
    dark: [0.129, 0.302, 0.176], // #214d2d
    light: [0.267, 0.475, 0.263], // #447943
    autumn: [0.35, 0.4, 0.22],
  },
};

/** Deterministic 0..1 stream. `hash` is the project's shared sin-based hash. */
const rnd = (seed: number, i: number): number => hash(seed * 1.618 + i * 0.7321, seed * 0.3141 + i);

/**
 * Build the leaflets for one atlas cell. Called by both the albedo and the
 * normal generator with the same seed, so the relief matches the cut-out.
 */
const buildLeaflets = (kind: FoliageKind, cell: number, count: number): Leaflet[] => {
  const palette = PALETTES[kind];
  const out: Leaflet[] = [];
  const seed = 13.7 + cell * 41.3;

  for (let i = 0; i < count; i++) {
    // Distribute over a disc, biased outward so the silhouette stays ragged.
    const ang = rnd(seed, i * 7) * Math.PI * 2;
    const rad = Math.pow(rnd(seed, i * 7 + 1), 0.62) * 0.44;
    const cx = 0.5 + Math.cos(ang) * rad;
    const cy = 0.5 + Math.sin(ang) * rad;

    let rx: number;
    let ry: number;
    let rot: number;
    if (kind === 'needle') {
      // Long thin needles fanning away from the cluster centre.
      rx = 0.085 + rnd(seed, i * 7 + 2) * 0.075;
      ry = 0.008 + rnd(seed, i * 7 + 3) * 0.007;
      rot = ang + (rnd(seed, i * 7 + 4) - 0.5) * 0.7;
    } else {
      // At 192 px per atlas cell these leaflets span 7-13 px, retaining a
      // readable blade while avoiding metre-wide leaves on the park crowns.
      rx = 0.018 + rnd(seed, i * 7 + 2) * 0.017;
      ry = rx * (0.42 + rnd(seed, i * 7 + 3) * 0.34);
      rot = rnd(seed, i * 7 + 4) * Math.PI;
    }

    // Colour: dark->light ramp, with a minority of yellowed leaves.
    const t = rnd(seed, i * 7 + 5);
    const autumn = rnd(seed, i * 7 + 6) > 0.88;
    const target = autumn ? palette.autumn : palette.light;
    let r = palette.dark[0] + (target[0] - palette.dark[0]) * t;
    let g = palette.dark[1] + (target[1] - palette.dark[1]) * t;
    let b = palette.dark[2] + (target[2] - palette.dark[2]) * t;

    // Fake self-occlusion: leaflets near the cluster centre sit under the
    // canopy shell and read darker. This is what stops a card cage from
    // looking like flat wallpaper once it is lit.
    const occl = 1 - 0.38 * (1 - Math.min(1, rad / 0.44));
    r *= occl;
    g *= occl;
    b *= occl;

    out.push({
      cx,
      cy,
      rx,
      ry,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      r,
      g,
      b,
      // Smaller leaves carry proportionally shallower veins. Otherwise the
      // unchanged height would triple their gradient when their width shrinks.
      amp: (0.55 + rnd(seed, i * 7 + 4) * 0.45) * (kind === 'broadleaf' ? (rx / 0.08) * 0.125 : 1),
    });
  }
  return out;
};

/**
 * Tileable fbm lookup table.
 *
 * These generators run SYNCHRONOUSLY at module import, so their cost lands
 * straight on time-to-first-frame. Evaluating `fbmNoiseSigned` per texel means
 * eight `Math.sin` calls each; over a 512x512 atlas that alone was measured at
 * ~90 ms. A 64x64 tile is 4096 evaluations total and, repeated once across a
 * 256 px atlas cell, still lands features at roughly 12-16 px - comfortably
 * above the ~4-6 px floor below which detail aliases and averages flat one mip
 * down.
 */
const GRAIN_LUT_SIZE = 64;

const buildGrainLut = (frequency: number, octaves: number, offset: number): Float32Array => {
  const lut = new Float32Array(GRAIN_LUT_SIZE * GRAIN_LUT_SIZE);
  for (let y = 0; y < GRAIN_LUT_SIZE; y++) {
    for (let x = 0; x < GRAIN_LUT_SIZE; x++) {
      lut[y * GRAIN_LUT_SIZE + x] = fbmNoiseSigned(
        offset + (x / GRAIN_LUT_SIZE) * frequency,
        offset + (y / GRAIN_LUT_SIZE) * frequency,
        octaves
      );
    }
  }
  return lut;
};

/** Nearest sample with wrap. `u`/`v` are in tile repeats, not texels. */
const sampleGrain = (lut: Float32Array, u: number, v: number): number => {
  const x = ((Math.floor(u * GRAIN_LUT_SIZE) % GRAIN_LUT_SIZE) + GRAIN_LUT_SIZE) % GRAIN_LUT_SIZE;
  const y = ((Math.floor(v * GRAIN_LUT_SIZE) % GRAIN_LUT_SIZE) + GRAIN_LUT_SIZE) % GRAIN_LUT_SIZE;
  return lut[y * GRAIN_LUT_SIZE + x];
};

let _leafGrainLut: Float32Array | null = null;
const leafGrainLut = (): Float32Array => (_leafGrainLut ??= buildGrainLut(9, 2, 3.1));

let _waxLut: Float32Array | null = null;
const waxLut = (): Float32Array => (_waxLut ??= buildGrainLut(6, 3, 11.7));

let _microLut: Float32Array | null = null;
const microLut = (): Float32Array => (_microLut ??= buildGrainLut(14, 2, 27.3));

/** Inside-ness of an ellipse at (px,py) in cell-normalised space; <=1 is inside. */
const ellipseDist = (leaf: Leaflet, px: number, py: number): number => {
  const dx = px - leaf.cx;
  const dy = py - leaf.cy;
  const u = (dx * leaf.cos + dy * leaf.sin) / leaf.rx;
  const v = (-dx * leaf.sin + dy * leaf.cos) / leaf.ry;
  return Math.sqrt(u * u + v * v);
};

/**
 * Push opaque colour outward into transparent texels so mip reduction never
 * averages an unwritten (black) texel into a leaf edge.
 */
const bleedColor = (data: Uint8Array, size: number, passes: number): Uint8Array => {
  const filled = new Uint8Array(size * size);
  for (let p = 0; p < size * size; p++) filled[p] = data[p * 4 + 3] > 0 ? 1 : 0;

  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = y * size + x;
        if (filled[p]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const q = ny * size + nx;
          if (!filled[q]) continue;
          r += data[q * 4];
          g += data[q * 4 + 1];
          b += data[q * 4 + 2];
          n++;
        }
        if (n === 0) continue;
        data[p * 4] = Math.round(r / n);
        data[p * 4 + 1] = Math.round(g / n);
        data[p * 4 + 2] = Math.round(b / n);
        next[p] = 1;
      }
    }
    filled.set(next);
  }
  return filled;
};

/**
 * Flood the still-unwritten texels of each atlas cell with that cell's mean
 * leaf colour.
 *
 * Local bleed only reaches a few pixels. Everything beyond that is still
 * (0,0,0), and GPU mip reduction averages RGB WITHOUT weighting by alpha - so
 * a canopy whose atlas is 90% black-but-transparent turns into a dark smudge
 * three mips down. Filling the background with the cell average makes the
 * limit colour of the mip chain the canopy's own colour.
 */
const fillCellBackground = (
  data: Uint8Array,
  size: number,
  filled: Uint8Array,
  cellsPerSide: number
): void => {
  const cell = Math.floor(size / cellsPerSide);
  for (let cy = 0; cy < cellsPerSide; cy++) {
    for (let cx = 0; cx < cellsPerSide; cx++) {
      const ox = cx * cell;
      const oy = cy * cell;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = oy; y < oy + cell; y++) {
        for (let x = ox; x < ox + cell; x++) {
          const p = y * size + x;
          if (data[p * 4 + 3] <= 200) continue;
          r += data[p * 4];
          g += data[p * 4 + 1];
          b += data[p * 4 + 2];
          n++;
        }
      }
      if (n === 0) continue;
      const mr = Math.round(r / n);
      const mg = Math.round(g / n);
      const mb = Math.round(b / n);
      for (let y = oy; y < oy + cell; y++) {
        for (let x = ox; x < ox + cell; x++) {
          const p = y * size + x;
          if (filled[p]) continue;
          data[p * 4] = mr;
          data[p * 4 + 1] = mg;
          data[p * 4 + 2] = mb;
        }
      }
    }
  }
};

/**
 * Write a sub-threshold alpha halo around every cut edge.
 *
 * The halo peaks at `mean3x3 * 0.6`, so an edge texel with four opaque
 * neighbours lands near 0.27 - below the 0.40 `alphaTest`, i.e. invisible at
 * mip 0 - while raising what the mip chain averages. Without it a 512px leaf
 * atlas has visibly thinned canopies by mip 3.
 */
const dilateAlpha = (data: Uint8Array, size: number, factor: number): void => {
  const src = new Uint8Array(size * size);
  for (let p = 0; p < size * size; p++) src[p] = data[p * 4 + 3];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      if (src[p] > 200) continue;
      let sum = 0;
      let n = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          sum += src[ny * size + nx];
          n++;
        }
      }
      if (n === 0) continue;
      const halo = Math.round((sum / n) * factor);
      if (halo > src[p]) data[p * 4 + 3] = halo;
    }
  }
};

/**
 * RGBA 2x2 atlas of four leaf clusters. Cell i is addressed by baked UVs on
 * the canopy cards, so one material covers four visually distinct cards.
 */
export const generateLeafAtlas = (
  size: number = 512,
  kind: FoliageKind = 'broadleaf'
): THREE.DataTexture => {
  return getTexture(`foliage-leaf-v2-${size}-${kind}`, () => {
    const data = new Uint8Array(size * size * 4);
    const cell = size >> 1;
    const count = kind === 'needle' ? 120 : 420;
    // Margin keeps bilinear taps from pulling a neighbouring cell across the
    // seam; the bleed pass fills it with the adjacent leaf colour.
    const margin = Math.max(3, Math.round(size * 0.012));

    const grainLut = leafGrainLut();

    for (let c = 0; c < 4; c++) {
      const ox = (c % 2) * cell;
      const oy = (c >> 1) * cell;
      const leaflets = buildLeaflets(kind, c, count);

      for (const leaf of leaflets) {
        const reach = Math.max(leaf.rx, leaf.ry) + 0.004;
        const x0 = Math.max(margin, Math.floor((leaf.cx - reach) * cell));
        const x1 = Math.min(cell - margin - 1, Math.ceil((leaf.cx + reach) * cell));
        const y0 = Math.max(margin, Math.floor((leaf.cy - reach) * cell));
        const y1 = Math.min(cell - margin - 1, Math.ceil((leaf.cy + reach) * cell));

        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) / cell;
            const py = (y + 0.5) / cell;
            const d = ellipseDist(leaf, px, py);
            if (d > 1) continue;
            const i = ((oy + y) * size + (ox + x)) * 4;
            // Slight darkening toward the leaflet rim gives each leaf a shape
            // of its own instead of a flat colour chip.
            const shade = 0.82 + 0.18 * (1 - d * d);
            const grain = sampleGrain(grainLut, px, py) * 0.06;
            data[i] = Math.round(Math.max(0, Math.min(1, leaf.r * shade + grain)) * 255);
            data[i + 1] = Math.round(Math.max(0, Math.min(1, leaf.g * shade + grain)) * 255);
            data[i + 2] = Math.round(Math.max(0, Math.min(1, leaf.b * shade + grain * 0.7)) * 255);
            data[i + 3] = 255;
          }
        }
      }
    }

    fillCellBackground(data, size, bleedColor(data, size, 4), 2);
    dilateAlpha(data, size, 0.6);

    const texture = createColorDataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    return texture;
  });
};

/**
 * Matching tangent-space normal map. Built from a height field (per-leaflet
 * dome plus a central vein ridge) differenced with a Sobel kernel, so the
 * perturbation is signed and X/Y are decorrelated by construction - an
 * unsigned noise offset biases every texel the same way and cancels the
 * relief.
 */
export const generateLeafNormal = (
  size: number = 512,
  kind: FoliageKind = 'broadleaf'
): THREE.DataTexture => {
  return getTexture(`foliage-leaf-normal-v2-${size}-${kind}`, () => {
    const height = new Float32Array(size * size);
    const cell = size >> 1;
    const count = kind === 'needle' ? 120 : 420;
    const margin = Math.max(3, Math.round(size * 0.012));

    for (let c = 0; c < 4; c++) {
      const ox = (c % 2) * cell;
      const oy = (c >> 1) * cell;
      const leaflets = buildLeaflets(kind, c, count);

      for (const leaf of leaflets) {
        const reach = Math.max(leaf.rx, leaf.ry) + 0.004;
        const x0 = Math.max(margin, Math.floor((leaf.cx - reach) * cell));
        const x1 = Math.min(cell - margin - 1, Math.ceil((leaf.cx + reach) * cell));
        const y0 = Math.max(margin, Math.floor((leaf.cy - reach) * cell));
        const y1 = Math.min(cell - margin - 1, Math.ceil((leaf.cy + reach) * cell));

        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) / cell;
            const py = (y + 0.5) / cell;
            const d = ellipseDist(leaf, px, py);
            if (d > 1) continue;
            const dx = px - leaf.cx;
            const dy = py - leaf.cy;
            // Distance across the leaf, perpendicular to its long axis: the
            // vein runs down the middle and the blade falls away either side.
            const across = Math.abs((-dx * leaf.sin + dy * leaf.cos) / leaf.ry);
            const dome = (1 - d * d) * leaf.amp;
            const vein = Math.exp(-across * across * 9) * 0.35 * leaf.amp;
            height[(oy + y) * size + (ox + x)] = Math.max(
              height[(oy + y) * size + (ox + x)],
              dome + vein
            );
          }
        }
      }
    }

    const data = new Uint8Array(size * size * 4);
    // Strength is in height-units per texel; scaled by size so a 256 and a
    // 512 atlas produce the same apparent relief.
    const strength = size / 96;
    // Row offsets hoisted and indices clamped once per row instead of nine
    // Math.min/Math.max pairs per texel - this loop runs at import time and the
    // closure version measured ~300 ms on a 512 atlas.
    for (let y = 0; y < size; y++) {
      const rowUp = (y > 0 ? y - 1 : 0) * size;
      const rowMid = y * size;
      const rowDown = (y < size - 1 ? y + 1 : size - 1) * size;
      for (let x = 0; x < size; x++) {
        const xl = x > 0 ? x - 1 : 0;
        const xr = x < size - 1 ? x + 1 : size - 1;
        const tl = height[rowUp + xl];
        const tc = height[rowUp + x];
        const tr = height[rowUp + xr];
        const ml = height[rowMid + xl];
        const mr = height[rowMid + xr];
        const bl = height[rowDown + xl];
        const bc = height[rowDown + x];
        const br = height[rowDown + xr];

        const gx = tl + 2 * ml + bl - (tr + 2 * mr + br);
        const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
        let nx = gx * strength;
        let ny = gy * strength;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len;
        ny /= len;
        const i = (y * size + x) * 4;
        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
        data[i + 3] = 255;
      }
    }

    const texture = createLinearDataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    return texture;
  });
};

/**
 * Leaf roughness. Written to R, G and B: three samples `roughnessMap.g`, and
 * an R-only map multiplies roughness by zero.
 */
export const generateLeafRoughness = (size: number = 256): THREE.DataTexture => {
  return getTexture(`foliage-leaf-roughness-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const wax = waxLut();
    const micro = microLut();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;
        // Waxy patches on an otherwise matte leaf. Both periods stay well
        // above 4px at generated size so they survive one mip drop.
        const waxV = sampleGrain(wax, nx * 2, ny * 2);
        const microV = sampleGrain(micro, nx * 5, ny * 5) * 0.08;
        const value = Math.max(0.34, Math.min(0.96, 0.72 + waxV * 0.22 + microV));
        const v = Math.round(value * 255);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return createLinearDataTexture(data, size, size);
  });
};

/**
 * RGBA 2x2 atlas of grass tufts for ground clutter. Blades root at the bottom
 * edge of each cell (v=0) and taper upward, so a card can be planted flush
 * with the ground with no visible cut at the base.
 */
export const generateGrassBladeAtlas = (size: number = 256): THREE.DataTexture => {
  return getTexture(`foliage-grass-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const cell = size >> 1;
    const margin = 2;

    for (let c = 0; c < 4; c++) {
      const ox = (c % 2) * cell;
      const oy = (c >> 1) * cell;
      const seed = 71.3 + c * 29.1;
      const blades = 7 + Math.floor(rnd(seed, 0) * 4);

      for (let bi = 0; bi < blades; bi++) {
        const rootX = 0.12 + rnd(seed, bi * 5 + 1) * 0.76;
        const lean = (rnd(seed, bi * 5 + 2) - 0.5) * 0.62;
        const tall = 0.55 + rnd(seed, bi * 5 + 3) * 0.42;
        const width = 0.022 + rnd(seed, bi * 5 + 4) * 0.02;
        const dry = rnd(seed, bi * 5 + 5) > 0.78;
        const baseR = dry ? 0.42 : 0.16;
        const baseG = dry ? 0.36 : 0.31;
        const baseB = dry ? 0.16 : 0.11;
        const tipR = dry ? 0.62 : 0.4;
        const tipG = dry ? 0.55 : 0.58;
        const tipB = dry ? 0.26 : 0.2;

        const steps = cell;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          if (t > tall) break;
          const tn = t / tall;
          // Blade bends away from vertical as it rises, and narrows to a point.
          const bx = rootX + lean * tn * tn;
          const halfW = width * (1 - tn * 0.85);
          // DataTexture row 0 is v=0 (three does not flip DataTexture rows), so
          // t maps straight onto the row index and the blade roots on the
          // cell's v=0 edge - which is where the card's y=0 sits.
          const yPix = Math.round(t * (cell - 1));
          const x0 = Math.max(margin, Math.floor((bx - halfW) * cell));
          const x1 = Math.min(cell - margin - 1, Math.ceil((bx + halfW) * cell));
          for (let x = x0; x <= x1; x++) {
            const i = ((oy + yPix) * size + (ox + x)) * 4;
            const shade = 0.72 + 0.28 * tn;
            data[i] = Math.round(Math.min(1, (baseR + (tipR - baseR) * tn) * shade) * 255);
            data[i + 1] = Math.round(Math.min(1, (baseG + (tipG - baseG) * tn) * shade) * 255);
            data[i + 2] = Math.round(Math.min(1, (baseB + (tipB - baseB) * tn) * shade) * 255);
            data[i + 3] = 255;
          }
        }
      }
    }

    fillCellBackground(data, size, bleedColor(data, size, 3), 2);
    dilateAlpha(data, size, 0.6);

    const texture = createColorDataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    return texture;
  });
};

/**
 * Soft radial mulch/dirt decal used to ground trunks and wall bases. Alpha
 * fades to zero at the rim so the ring never shows an edge against the
 * terrain, and the RGB is a muted soil brown with noise breakup.
 */
export const generateMulchDecal = (size: number = 128): THREE.DataTexture => {
  return getTexture(`foliage-mulch-${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    const wobbleLut = waxLut();
    const grainLut = microLut();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = (x + 0.5) / size - 0.5;
        const ny = (y + 0.5) / size - 0.5;
        const d = Math.sqrt(nx * nx + ny * ny) * 2; // 0 centre, 1 at rim
        const wobble = sampleGrain(wobbleLut, nx + 0.5, ny + 0.5) * 0.22;
        const edge = Math.max(0, Math.min(1, 1 - (d + wobble)));
        const alpha = edge * edge * 0.82;
        const grain = sampleGrain(grainLut, nx * 4, ny * 4) * 0.09;
        data[i] = Math.round(Math.max(0, Math.min(1, 0.24 + grain)) * 255);
        data[i + 1] = Math.round(Math.max(0, Math.min(1, 0.18 + grain * 0.9)) * 255);
        data[i + 2] = Math.round(Math.max(0, Math.min(1, 0.12 + grain * 0.7)) * 255);
        data[i + 3] = Math.round(alpha * 255);
      }
    }
    const texture = createColorDataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  });
};
