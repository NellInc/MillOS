/**
 * Texture Processing Web Worker
 *
 * Offloads texture processing to a separate thread to prevent main thread blocking.
 * Handles:
 * - Image decoding and resizing
 * - Format conversion
 * - Mipmap generation data preparation
 * - Texture atlas packing calculations
 *
 * Note: Actual GPU upload must happen on main thread, but preprocessing is done here.
 *
 * Usage (from main thread):
 *   const worker = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ type: 'decode', url: '/textures/wood.jpg' });
 *   worker.onmessage = (e) => { const { imageData, width, height } = e.data; };
 */

// Message types
export interface TextureWorkerMessage {
  type: 'decode' | 'resize' | 'generateMipmapData' | 'packAtlas';
  id: string;
  payload: unknown;
}

export interface DecodePayload {
  url: string;
  maxSize?: number;
}

export interface ResizePayload {
  imageData: ImageData;
  targetWidth: number;
  targetHeight: number;
}

export interface MipmapPayload {
  imageData: ImageData;
  levels: number;
}

export interface AtlasPayload {
  textures: Array<{ id: string; width: number; height: number }>;
  maxSize: number;
  padding: number;
}

// Response types
export interface TextureWorkerResponse {
  type: 'success' | 'error';
  id: string;
  result?: unknown;
  error?: string;
}

export interface DecodeResult {
  imageData: ImageData;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface ResizeResult {
  imageData: ImageData;
  width: number;
  height: number;
}

export interface MipmapResult {
  levels: Array<{ imageData: ImageData; width: number; height: number }>;
}

export interface AtlasResult {
  width: number;
  height: number;
  placements: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}

// Check if we're in a worker context
const isWorker = typeof self !== 'undefined' && typeof Window === 'undefined';

if (isWorker) {
  self.onmessage = async (e: MessageEvent<TextureWorkerMessage>) => {
    const { type, id, payload } = e.data;

    try {
      let result: unknown;

      switch (type) {
        case 'decode':
          result = await decodeTexture(payload as DecodePayload);
          break;
        case 'resize':
          result = resizeImage(payload as ResizePayload);
          break;
        case 'generateMipmapData':
          result = generateMipmapData(payload as MipmapPayload);
          break;
        case 'packAtlas':
          result = packAtlas(payload as AtlasPayload);
          break;
        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      self.postMessage({ type: 'success', id, result } as TextureWorkerResponse);
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : 'Unknown error',
      } as TextureWorkerResponse);
    }
  };
}

/**
 * Decode an image from URL and optionally resize
 */
async function decodeTexture(payload: DecodePayload): Promise<DecodeResult> {
  const { url, maxSize = 2048 } = payload;

  // Fetch the image
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  // Calculate target size (power of 2, capped at maxSize)
  let width = nearestPowerOfTwo(originalWidth);
  let height = nearestPowerOfTwo(originalHeight);

  if (width > maxSize) width = maxSize;
  if (height > maxSize) height = maxSize;

  // Create canvas for pixel data extraction
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Draw with high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);

  return {
    imageData,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}

/**
 * Resize an existing ImageData
 */
function resizeImage(payload: ResizePayload): ResizeResult {
  const { imageData, targetWidth, targetHeight } = payload;

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d')!;

  // Create temporary canvas with source data
  const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.putImageData(imageData, 0, 0);

  // Draw resized
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);

  return {
    imageData: ctx.getImageData(0, 0, targetWidth, targetHeight),
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Generate mipmap level data (not actual mipmaps, but downscaled versions)
 */
function generateMipmapData(payload: MipmapPayload): MipmapResult {
  const { imageData, levels } = payload;
  const results: MipmapResult['levels'] = [];

  let currentData = imageData;
  let currentWidth = imageData.width;
  let currentHeight = imageData.height;

  for (let i = 0; i < levels; i++) {
    const newWidth = Math.max(1, Math.floor(currentWidth / 2));
    const newHeight = Math.max(1, Math.floor(currentHeight / 2));

    const resized = resizeImage({
      imageData: currentData,
      targetWidth: newWidth,
      targetHeight: newHeight,
    });

    results.push({
      imageData: resized.imageData,
      width: newWidth,
      height: newHeight,
    });

    currentData = resized.imageData;
    currentWidth = newWidth;
    currentHeight = newHeight;

    if (currentWidth === 1 && currentHeight === 1) break;
  }

  return { levels: results };
}

/**
 * Calculate texture atlas packing using simple shelf algorithm
 */
function packAtlas(payload: AtlasPayload): AtlasResult {
  const { textures, maxSize, padding } = payload;

  // Sort by height (descending) for better packing
  const sorted = [...textures].sort((a, b) => b.height - a.height);

  const placements: AtlasResult['placements'] = [];
  let currentX = padding;
  let currentY = padding;
  let rowHeight = 0;
  let atlasWidth = 0;

  for (const tex of sorted) {
    const paddedWidth = tex.width + padding;
    const paddedHeight = tex.height + padding;

    // Check if we need to start a new row
    if (currentX + paddedWidth > maxSize) {
      currentX = padding;
      currentY += rowHeight + padding;
      rowHeight = 0;
    }

    // Check if we've exceeded max height
    if (currentY + paddedHeight > maxSize) {
      continue;
    }

    placements.push({
      id: tex.id,
      x: currentX,
      y: currentY,
      width: tex.width,
      height: tex.height,
    });

    currentX += paddedWidth;
    rowHeight = Math.max(rowHeight, paddedHeight);
    atlasWidth = Math.max(atlasWidth, currentX);
  }

  // Final height is current Y + last row height
  const atlasHeight = currentY + rowHeight + padding;

  return {
    width: nearestPowerOfTwo(atlasWidth),
    height: nearestPowerOfTwo(atlasHeight),
    placements,
  };
}

/**
 * Find nearest power of two
 */
function nearestPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

// Export for type checking (not used in worker)
export { decodeTexture, resizeImage, generateMipmapData, packAtlas };
