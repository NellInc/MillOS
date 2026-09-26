/**
 * Roof Tile Texture Generators
 *
 * Procedural textures for European village roof styles:
 * - Clay/Terracotta tiles (overlapping curved tiles)
 * - Slate tiles (flat layered stone tiles)
 * - Thatch (straw bundle texture)
 */

import * as THREE from 'three';
import {
  getTexture,
  fbmNoise,
  fbmNoiseSigned,
  hash,
  createColorDataTexture,
  createLinearDataTexture,
} from '../utils/textureGenerator';

// ========================================
// CLAY/TERRACOTTA ROOF TILES
// ========================================

export interface ClayTileOptions {
  tileWidth?: number;
  tileHeight?: number;
  baseColor?: string;
  variation?: number;
}

const DEFAULT_CLAY_OPTIONS: Required<ClayTileOptions> = {
  tileWidth: 40,
  tileHeight: 56,
  // '#b8450a' decodes to linear (0.478, 0.061, 0.003) - the blue channel is
  // essentially zero, which reads as a neon orange under correct decode.
  // '#b8551f' gives (0.478, 0.093, 0.014): terracotta with real chroma.
  baseColor: '#b8551f',
  variation: 0.22,
};

const parseHex = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

/**
 * Slate lamination frequency, in radians per PIXEL. Keep the period above
 * ~6 px or the mipmap chain erases the banding entirely.
 */
const SLATE_LAYER_FREQ_BASE = 0.55;
const SLATE_LAYER_FREQ_VAR = 0.35;

/**
 * Thatch straw strand width in pixels. The original 2 px averaged to a flat
 * constant at the FIRST mip level (measured std-dev retention 0.02 of L0 at
 * L2). 6 px retains 0.96 at L1 and 0.48 at L2.
 */
const THATCH_STRAND_PX = 6;

/**
 * Snap an authored tile size so a whole number of tiles spans the texture.
 * A partial last row or column would wrap straight into tile 0 as a line of
 * stubby half-tiles at every repeat. Rows are kept EVEN so the running bond
 * alternates across the vertical wrap too. Gap and edge widths stay in pixels.
 */
const snapTileGrid = (
  size: number,
  tileWidth: number,
  tileHeight: number
): { cellW: number; cellH: number } => ({
  cellW: size / Math.max(1, Math.round(size / tileWidth)),
  cellH: size / (2 * Math.max(1, Math.round(size / (2 * tileHeight)))),
});

/**
 * Generates clay/terracotta roof tile texture.
 * Classic Mediterranean barrel/pantile pattern with pronounced 3D effect.
 */
export const generateClayTiles = (
  size: number = 512,
  options: ClayTileOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_CLAY_OPTIONS, ...options };
  const cacheKey = `clay-tiles-v5-${size}-${opts.tileWidth}-${opts.tileHeight}-${opts.baseColor}-${opts.variation}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);
    const { cellW, cellH } = snapTileGrid(size, opts.tileWidth, opts.tileHeight);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / cellH);
        const xOffset = (tileRow % 2) * (cellW / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % cellW;
        const tileY = y % cellH;

        const tileCol = Math.floor(adjustedX / cellW);
        const tileId = hash(tileCol, tileRow);

        const colorVar = (tileId - 0.5) * opts.variation * 2;

        const centerX = cellW / 2;
        const normalizedX = (tileX - centerX) / centerX;
        const curveIntensity = normalizedX * normalizedX;
        const curveShade = curveIntensity * 0.3;

        const crownHighlight =
          Math.abs(normalizedX) < 0.25 ? (0.25 - Math.abs(normalizedX)) * 0.2 : 0;

        const overlapZone = cellH * 0.28;
        let overlapShadow = 0;
        if (tileY < overlapZone) {
          overlapShadow = (1 - tileY / overlapZone) * 0.25;
        }

        const lipZone = cellH * 0.12;
        const lipHighlight = tileY > cellH - lipZone ? 0.1 : 0;

        const gapWidth = 3;
        const inGapX = tileX < gapWidth || tileX > cellW - gapWidth;
        const inGapY = tileY < gapWidth;
        const inGap = inGapX || inGapY;
        const gapDark = inGap ? -0.22 : 0;

        const nx = x / size;
        const ny = y / size;
        const grainNoise = fbmNoise(nx * 100, ny * 100, 3) * 0.07;

        const tileHue = hash(tileCol * 7, tileRow * 13);
        const orangeShift = tileHue > 0.6 ? 0.06 : 0;
        const brownShift = tileHue < 0.3 ? -0.05 : 0;

        const weathered = tileId > 0.82 ? -0.12 : 0;

        const lichenNoise = fbmNoise(nx * 12 + tileCol, ny * 12 + tileRow, 2);
        const hasLichen = lichenNoise > 0.72 && tileId > 0.65;

        const edgeWear = inGapX && fbmNoise(nx * 50, ny * 50, 2) > 0.6 ? -0.08 : 0;

        const shade =
          -curveShade +
          crownHighlight -
          overlapShadow +
          lipHighlight +
          gapDark +
          grainNoise +
          colorVar +
          orangeShift +
          brownShift +
          weathered +
          edgeWear;

        let r = baseColor.r + shade;
        let g = baseColor.g + shade * 0.75;
        let b = baseColor.b + shade * 0.55;

        if (hasLichen) {
          r = r * 0.7 + 0.12;
          g = g * 0.7 + 0.18;
          b = b * 0.7 + 0.1;
        }

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createColorDataTexture(data, size, size);
  });
};

export const generateClayTilesNormal = (
  size: number = 512,
  tileWidth: number = 40,
  tileHeight: number = 56
): THREE.DataTexture => {
  return getTexture(`clay-tiles-normal-v6-${size}-${tileWidth}-${tileHeight}`, () => {
    const data = new Uint8Array(size * size * 4);
    // Snapped from the same inputs as generateClayTiles, so colour and relief
    // stay registered.
    const { cellW, cellH } = snapTileGrid(size, tileWidth, tileHeight);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / cellH);
        const xOffset = (tileRow % 2) * (cellW / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % cellW;
        const tileY = y % cellH;

        const centerX = cellW / 2;
        const normalizedX = (tileX - centerX) / centerX;

        let nx = 0.5 + normalizedX * 0.4;

        let ny = 0.5;
        const overlapZone = cellH * 0.22;
        if (tileY < overlapZone) {
          ny = 0.25 + (tileY / overlapZone) * 0.25;
        } else if (tileY > cellH - cellH * 0.1) {
          ny = 0.65;
        }

        const gapWidth = 4;
        if (tileX < gapWidth) {
          nx = 0.2;
        } else if (tileX > cellW - gapWidth) {
          nx = 0.8;
        }
        if (tileY < gapWidth) {
          ny = 0.2;
        }

        // Signed and decorrelated per axis - the previous unsigned noise added
        // the same +0.025 to both channels, a constant diagonal tilt.
        const surfaceX = fbmNoiseSigned((x / size) * 120, (y / size) * 120, 3) * 0.09;
        const surfaceY = fbmNoiseSigned((x / size) * 120 + 61, (y / size) * 120 + 13, 3) * 0.09;

        data[i] = Math.floor(Math.max(0, Math.min(1, nx + surfaceX)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, ny + surfaceY)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};

// ========================================
// SLATE ROOF TILES
// ========================================

export interface SlateOptions {
  tileWidth?: number;
  tileHeight?: number;
  baseColor?: string;
  variation?: number;
}

const DEFAULT_SLATE_OPTIONS: Required<SlateOptions> = {
  tileWidth: 44,
  tileHeight: 32,
  // '#3a4555' decodes to ~0.048 linear mean - 4.8% reflectance, darker than
  // any real slate and effectively black in shadow. '#454f5f' gives ~0.075,
  // inside the measured 5-10% band for weathered slate.
  baseColor: '#454f5f',
  variation: 0.18,
};

export const generateSlate = (
  size: number = 512,
  options: SlateOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_SLATE_OPTIONS, ...options };
  const cacheKey = `slate-v6-${size}-${opts.tileWidth}-${opts.tileHeight}-${opts.baseColor}-${opts.variation}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);
    const { cellW, cellH } = snapTileGrid(size, opts.tileWidth, opts.tileHeight);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / cellH);
        const xOffset = (tileRow % 2) * (cellW / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % cellW;
        const tileY = y % cellH;

        const tileCol = Math.floor(adjustedX / cellW);
        const tileId = hash(tileCol, tileRow);

        const colorVar = (tileId - 0.5) * opts.variation * 2;

        // Layer frequency is in PIXELS. 2.5-4.0 rad/px gave a 1.6-2.5 px
        // period, below the mipmap floor - it aliased at native resolution and
        // averaged to nothing one mip down. 0.55-0.90 rad/px = 7-11 px bands,
        // which is what a slate lamination actually looks like.
        const layerFreq = SLATE_LAYER_FREQ_BASE + hash(tileCol, tileRow * 3) * SLATE_LAYER_FREQ_VAR;
        const layers = Math.sin(tileY * layerFreq) * 0.07;

        const edgeWidth = 4;
        const leftEdge = tileX < edgeWidth;
        const rightEdge = tileX > cellW - edgeWidth;
        const topEdge = tileY < edgeWidth;
        const bottomEdge = tileY > cellH - edgeWidth * 1.5;

        let edgeEffect = 0;
        if (leftEdge) edgeEffect = -0.18 * (1 - tileX / edgeWidth);
        if (rightEdge) edgeEffect = -0.12 * (1 - (cellW - tileX) / edgeWidth);
        if (topEdge) edgeEffect = Math.min(edgeEffect, -0.22 * (1 - tileY / edgeWidth));
        if (bottomEdge) edgeEffect = Math.max(edgeEffect, 0.08);

        const overlapZone = cellH * 0.25;
        const overlapShadow = tileY < overlapZone ? (1 - tileY / overlapZone) * 0.18 : 0;

        const nx = x / size;
        const ny = y / size;
        const stoneGrain = fbmNoise(nx * 80, ny * 40, 3) * 0.08;

        const veinNoise = fbmNoise(nx * 20 + tileId * 10, ny * 5, 2);
        const hasVein = veinNoise > 0.73;
        const veinBright = hasVein ? 0.1 : 0;

        const blueTint = hash(tileCol * 2, tileRow * 5) > 0.65 ? 0.04 : 0;
        const greenTint = hash(tileCol * 5, tileRow * 2) > 0.75 ? 0.025 : 0;
        const purpleTint = hash(tileCol * 3, tileRow * 7) > 0.82 ? 0.02 : 0;

        const weatherNoise = fbmNoise(nx * 8 + tileCol, ny * 8 + tileRow, 2);
        const isWeathered = weatherNoise > 0.68 && tileId > 0.55;

        const shade = colorVar + layers + edgeEffect - overlapShadow + stoneGrain + veinBright;

        let r = baseColor.r + shade + purpleTint;
        let g = baseColor.g + shade + greenTint;
        let b = baseColor.b + shade + blueTint;

        if (isWeathered) {
          r += 0.025;
          g += 0.045;
          b -= 0.025;
        }

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createColorDataTexture(data, size, size);
  });
};

export const generateSlateNormal = (
  size: number = 512,
  tileWidth: number = 44,
  tileHeight: number = 32
): THREE.DataTexture => {
  return getTexture(`slate-normal-v6-${size}-${tileWidth}-${tileHeight}`, () => {
    const data = new Uint8Array(size * size * 4);
    // Snapped from the same inputs as generateSlate, so colour and relief
    // stay registered.
    const { cellW, cellH } = snapTileGrid(size, tileWidth, tileHeight);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / cellH);
        const xOffset = (tileRow % 2) * (cellW / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % cellW;
        const tileY = y % cellH;
        const tileCol = Math.floor(adjustedX / cellW);

        let nx = 0.5;
        let ny = 0.5;

        const edgeWidth = 5;
        if (tileX < edgeWidth) {
          nx = 0.25 + (tileX / edgeWidth) * 0.25;
        } else if (tileX > cellW - edgeWidth) {
          nx = 0.75 - ((cellW - tileX) / edgeWidth) * 0.25;
        }

        if (tileY < edgeWidth) {
          ny = 0.2 + (tileY / edgeWidth) * 0.3;
        } else if (tileY > cellH - edgeWidth) {
          ny = 0.65;
        }

        // Must use the SAME frequency as generateSlate so colour and relief
        // stay registered.
        const layerFreq = SLATE_LAYER_FREQ_BASE + hash(tileCol, tileRow * 3) * SLATE_LAYER_FREQ_VAR;
        const layerNormal = Math.cos(tileY * layerFreq) * 0.12;
        ny += layerNormal;

        const surfaceNormalX = fbmNoiseSigned((x / size) * 100, (y / size) * 50, 3) * 0.13;
        const surfaceNormalY = fbmNoiseSigned((x / size) * 50, (y / size) * 100, 3) * 0.1;

        data[i] = Math.floor(Math.max(0, Math.min(1, nx + surfaceNormalX)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, ny + surfaceNormalY)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};

// ========================================
// THATCH ROOF
// ========================================

export interface ThatchOptions {
  baseColor?: string;
  bundleWidth?: number;
  density?: number;
}

const DEFAULT_THATCH_OPTIONS: Required<ThatchOptions> = {
  // Pulled down from '#c9a065' (0.583 linear red) - straw reflectance is
  // ~0.30-0.40, and the sun is now 3.10 rather than 1.84, so the old value
  // blows out to white on a south-facing roof.
  baseColor: '#bb9560',
  bundleWidth: 40,
  density: 0.8,
};

const thatchStrandPixels = (bundleWidth: number, density: number): number => {
  const safeBundleWidth = Number.isFinite(bundleWidth) && bundleWidth > 0 ? bundleWidth : 40;
  const safeDensity = Number.isFinite(density) && density > 0 ? density : 0.8;
  return Math.max(4, Math.round(THATCH_STRAND_PX * (safeBundleWidth / 40) * (0.8 / safeDensity)));
};

export const generateThatch = (
  size: number = 512,
  options: ThatchOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_THATCH_OPTIONS, ...options };
  const strandPixels = thatchStrandPixels(opts.bundleWidth, opts.density);
  const cacheKey = `thatch-v12-${size}-${opts.baseColor}-${strandPixels}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Vertical straw strands scale with authored bundle width and density.
        // The four-pixel floor stays above the Nyquist trap that made the old
        // two-pixel pattern average flat one mip down.
        const strandId = Math.floor(x / strandPixels);
        const strandColor = (hash(strandId, 0) - 0.5) * 0.18;

        // Variation along strand using only hash (no continuous noise = no tiling seams)
        const segmentId = Math.floor(y / 4);
        const alongStrand = (hash(strandId, segmentId) - 0.5) * 0.06;

        // Fine pixel grain
        const grain = (hash(x, y) - 0.5) * 0.06;

        // Some strands darker (aged) or lighter (fresh)
        const strandType = hash(strandId * 7, 0);
        const ageVar = strandType > 0.9 ? -0.07 : strandType < 0.1 ? 0.05 : 0;

        const shade = strandColor + alongStrand + grain + ageVar;

        const r = baseColor.r + shade;
        const g = baseColor.g + shade * 0.92;
        const b = baseColor.b + shade * 0.65;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createColorDataTexture(data, size, size);
  });
};

export const generateThatchNormal = (
  size: number = 512,
  options: Pick<ThatchOptions, 'bundleWidth' | 'density'> = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_THATCH_OPTIONS, ...options };
  const strandPixels = thatchStrandPixels(opts.bundleWidth, opts.density);
  return getTexture(`thatch-normal-v12-${size}-${strandPixels}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Vertical strand normals, rounded across the same authored width as
        // the colour texture. The old
        // `(x % 2) / 2` took only two values, i.e. a 2 px square wave whose
        // mean is a constant tilt: the "roundness" was a mathematical no-op.
        const posInStrand = ((x % strandPixels) + 0.5) / strandPixels;
        const strandNormalX = Math.sin((posInStrand - 0.5) * Math.PI) * 0.28;

        // Strand ends taper, so nudge Y at the segment boundaries.
        const segmentId = Math.floor(y / 4);
        const strandNormalY = (hash(Math.floor(x / strandPixels), segmentId) - 0.5) * 0.12;

        // Fine grain only (no fbmNoise = no tiling seams)
        const grainX = (hash(x * 2, y) - 0.5) * 0.05;
        const grainY = (hash(x, y * 2) - 0.5) * 0.05;

        const finalNx = 0.5 + strandNormalX + grainX;
        const finalNy = 0.5 + strandNormalY + grainY;

        data[i] = Math.floor(Math.max(0, Math.min(1, finalNx)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, finalNy)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createLinearDataTexture(data, size, size);
  });
};
