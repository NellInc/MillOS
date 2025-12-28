/**
 * Roof Tile Texture Generators
 *
 * Procedural textures for European village roof styles:
 * - Clay/Terracotta tiles (overlapping curved tiles)
 * - Slate tiles (flat layered stone tiles)
 * - Thatch (straw bundle texture)
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

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
  baseColor: '#b8450a',
  variation: 0.22,
};

const parseHex = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
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
  const cacheKey = `clay-tiles-v4-${size}-${opts.tileWidth}-${opts.tileHeight}-${opts.baseColor}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / opts.tileHeight);
        const xOffset = (tileRow % 2) * (opts.tileWidth / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % opts.tileWidth;
        const tileY = y % opts.tileHeight;

        const tileCol = Math.floor(adjustedX / opts.tileWidth);
        const tileId = hash(tileCol, tileRow);

        const colorVar = (tileId - 0.5) * opts.variation * 2;

        const centerX = opts.tileWidth / 2;
        const normalizedX = (tileX - centerX) / centerX;
        const curveIntensity = normalizedX * normalizedX;
        const curveShade = curveIntensity * 0.3;

        const crownHighlight =
          Math.abs(normalizedX) < 0.25 ? (0.25 - Math.abs(normalizedX)) * 0.2 : 0;

        const overlapZone = opts.tileHeight * 0.28;
        let overlapShadow = 0;
        if (tileY < overlapZone) {
          overlapShadow = (1 - tileY / overlapZone) * 0.25;
        }

        const lipZone = opts.tileHeight * 0.12;
        const lipHighlight = tileY > opts.tileHeight - lipZone ? 0.1 : 0;

        const gapWidth = 3;
        const inGapX = tileX < gapWidth || tileX > opts.tileWidth - gapWidth;
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

    return createDataTexture(data, size, size);
  });
};

export const generateClayTilesNormal = (
  size: number = 512,
  tileWidth: number = 40,
  tileHeight: number = 56
): THREE.DataTexture => {
  return getTexture(`clay-tiles-normal-v4-${size}-${tileWidth}-${tileHeight}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / tileHeight);
        const xOffset = (tileRow % 2) * (tileWidth / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % tileWidth;
        const tileY = y % tileHeight;

        const centerX = tileWidth / 2;
        const normalizedX = (tileX - centerX) / centerX;

        let nx = 0.5 + normalizedX * 0.4;

        let ny = 0.5;
        const overlapZone = tileHeight * 0.22;
        if (tileY < overlapZone) {
          ny = 0.25 + (tileY / overlapZone) * 0.25;
        } else if (tileY > tileHeight - tileHeight * 0.1) {
          ny = 0.65;
        }

        const gapWidth = 4;
        if (tileX < gapWidth) {
          nx = 0.2;
        } else if (tileX > tileWidth - gapWidth) {
          nx = 0.8;
        }
        if (tileY < gapWidth) {
          ny = 0.2;
        }

        const surfaceNoise = fbmNoise((x / size) * 120, (y / size) * 120, 2) * 0.05;

        data[i] = Math.floor(Math.max(0, Math.min(1, nx + surfaceNoise)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, ny + surfaceNoise)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
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
  baseColor: '#3a4555',
  variation: 0.18,
};

export const generateSlate = (
  size: number = 512,
  options: SlateOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_SLATE_OPTIONS, ...options };
  const cacheKey = `slate-v4-${size}-${opts.tileWidth}-${opts.tileHeight}-${opts.baseColor}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / opts.tileHeight);
        const xOffset = (tileRow % 2) * (opts.tileWidth / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % opts.tileWidth;
        const tileY = y % opts.tileHeight;

        const tileCol = Math.floor(adjustedX / opts.tileWidth);
        const tileId = hash(tileCol, tileRow);

        const colorVar = (tileId - 0.5) * opts.variation * 2;

        const layerFreq = 2.5 + hash(tileCol, tileRow * 3) * 1.5;
        const layers = Math.sin(tileY * layerFreq) * 0.07;

        const edgeWidth = 4;
        const leftEdge = tileX < edgeWidth;
        const rightEdge = tileX > opts.tileWidth - edgeWidth;
        const topEdge = tileY < edgeWidth;
        const bottomEdge = tileY > opts.tileHeight - edgeWidth * 1.5;

        let edgeEffect = 0;
        if (leftEdge) edgeEffect = -0.18 * (1 - tileX / edgeWidth);
        if (rightEdge) edgeEffect = -0.12 * (1 - (opts.tileWidth - tileX) / edgeWidth);
        if (topEdge) edgeEffect = Math.min(edgeEffect, -0.22 * (1 - tileY / edgeWidth));
        if (bottomEdge) edgeEffect = Math.max(edgeEffect, 0.08);

        const overlapZone = opts.tileHeight * 0.25;
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

    return createDataTexture(data, size, size);
  });
};

export const generateSlateNormal = (
  size: number = 512,
  tileWidth: number = 44,
  tileHeight: number = 32
): THREE.DataTexture => {
  return getTexture(`slate-normal-v4-${size}-${tileWidth}-${tileHeight}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const tileRow = Math.floor(y / tileHeight);
        const xOffset = (tileRow % 2) * (tileWidth / 2);
        const adjustedX = (x + xOffset) % size;

        const tileX = adjustedX % tileWidth;
        const tileY = y % tileHeight;
        const tileCol = Math.floor(adjustedX / tileWidth);

        let nx = 0.5;
        let ny = 0.5;

        const edgeWidth = 5;
        if (tileX < edgeWidth) {
          nx = 0.25 + (tileX / edgeWidth) * 0.25;
        } else if (tileX > tileWidth - edgeWidth) {
          nx = 0.75 - ((tileWidth - tileX) / edgeWidth) * 0.25;
        }

        if (tileY < edgeWidth) {
          ny = 0.2 + (tileY / edgeWidth) * 0.3;
        } else if (tileY > tileHeight - edgeWidth) {
          ny = 0.65;
        }

        const layerFreq = 2.5 + hash(tileCol, tileRow * 3) * 1.5;
        const layerNormal = Math.cos(tileY * layerFreq) * 0.1;
        ny += layerNormal;

        const surfaceNormalX = fbmNoise((x / size) * 100, (y / size) * 50, 2) * 0.07;
        const surfaceNormalY = fbmNoise((x / size) * 50, (y / size) * 100, 2) * 0.05;

        data[i] = Math.floor(Math.max(0, Math.min(1, nx + surfaceNormalX)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, ny + surfaceNormalY)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
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
  baseColor: '#c9a065', // Golden straw color
  bundleWidth: 40,
  density: 0.8,
};

export const generateThatch = (
  size: number = 512,
  options: ThatchOptions = {}
): THREE.DataTexture => {
  const opts = { ...DEFAULT_THATCH_OPTIONS, ...options };
  const cacheKey = `thatch-v9-${size}-${opts.baseColor}`;

  return getTexture(cacheKey, () => {
    const data = new Uint8Array(size * size * 4);
    const baseColor = parseHex(opts.baseColor);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Vertical straw strands - each 2px wide with unique color
        const strandId = Math.floor(x / 2);
        const strandColor = (hash(strandId, 0) - 0.5) * 0.18;

        // Variation along strand using only hash (no continuous noise = no tiling seams)
        const segmentId = Math.floor(y / 4);
        const alongStrand = (hash(strandId, segmentId) - 0.5) * 0.06;

        // Fine pixel grain
        const grain = (hash(x, y) - 0.5) * 0.06;

        // Some strands darker (aged) or lighter (fresh)
        const strandType = hash(strandId * 7, 0);
        const ageVar = strandType > 0.9 ? -0.07 : (strandType < 0.1 ? 0.05 : 0);

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

    return createDataTexture(data, size, size);
  });
};

export const generateThatchNormal = (
  size: number = 512,
  bundleWidth: number = 40
): THREE.DataTexture => {
  return getTexture(`thatch-normal-v9-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Vertical strand normals - each strand slightly rounded
        const strandId = Math.floor(x / 2);
        const posInStrand = (x % 2) / 2;
        const strandNormalX = (posInStrand - 0.5) * 0.15;

        // Fine grain only (no fbmNoise = no tiling seams)
        const grainX = (hash(x * 2, y) - 0.5) * 0.04;
        const grainY = (hash(x, y * 2) - 0.5) * 0.04;

        const finalNx = 0.5 + strandNormalX + grainX;
        const finalNy = 0.5 + grainY;

        data[i] = Math.floor(Math.max(0, Math.min(1, finalNx)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, finalNy)) * 255);
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
