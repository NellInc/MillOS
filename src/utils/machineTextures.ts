/**
 * Machine Textures Utility
 *
 * Provides PBR texture maps for machine materials with quality-based resolution.
 * Supports both KTX2 compressed textures and JPG fallbacks.
 *
 * Texture Structure:
 * public/textures/compressed/ - KTX2 compressed (preferred, ~75% smaller)
 * public/textures/machines/
 *   256/  - Standard resolution - for high quality (JPG fallback)
 *   512/  - Higher resolution - for ultra quality (JPG fallback)
 *
 * Naming convention: {model}_roughness.ktx2/jpg, {model}_normal.ktx2/jpg, {model}_ao.ktx2/jpg
 *
 * Supported models: silo, roller_mill, packer, plansifter, worker, conveyor, pallet, grass, concrete, brick, water
 *
 * Source: ambientCG.com (CC0 Public Domain)
 */

import {
  TextureLoader,
  Texture,
  RepeatWrapping,
  LinearFilter,
  NearestFilter,
  MeshStandardMaterial,
} from 'three';
import { useGraphicsStore, GraphicsQuality } from '../stores/graphicsStore';
import { isCompressionAvailable, loadCompressedTexture } from './textureCompression';

// Texture base paths - use BASE_URL for correct path at any deployment location
const TEXTURE_BASE_PATH = `${import.meta.env.BASE_URL}textures/machines`;
const COMPRESSED_PATH = `${import.meta.env.BASE_URL}textures/compressed`;

// Resolution by quality level
const RESOLUTION_BY_QUALITY: Record<GraphicsQuality, string> = {
  low: '256', // Not used (textures disabled on low)
  medium: '256', // Not used (textures disabled on medium)
  high: '256', // 256px for high
  ultra: '512', // 512px for ultra (1024 available but overkill)
};

export type ModelType =
  | 'silo'
  | 'roller_mill'
  | 'packer'
  | 'plansifter'
  | 'worker'
  | 'conveyor'
  | 'pallet'
  // Environment textures
  | 'grass'
  | 'concrete' // Also used for factory floor
  | 'brick'
  | 'water';

export interface MachineTextures {
  roughness: Texture | null;
  normal: Texture | null;
  ao: Texture | null;
  color?: Texture | null; // Some models have color maps
}

// Cache for loaded textures to prevent reloading
const textureCache = new Map<string, Texture | null>();

// Track pending KTX2 loads to avoid duplicate requests
const pendingKtx2Loads = new Map<string, Promise<Texture | null>>();

/**
 * Safely load a texture with KTX2 priority
 * Tries KTX2 from compressed folder first, falls back to JPG
 */
function safeLoadTexture(jpgPath: string): Texture | null {
  // Check cache first
  if (textureCache.has(jpgPath)) {
    return textureCache.get(jpgPath) ?? null;
  }

  // Extract texture name for KTX2 lookup
  // e.g., "/textures/machines/256/brick_color.jpg" -> "brick_color"
  const pathParts = jpgPath.split('/');
  const filename = pathParts[pathParts.length - 1];
  const textureName = filename.replace('.jpg', '');
  const ktx2Path = `${COMPRESSED_PATH}/${textureName}.ktx2`;

  // If KTX2 compression is available, try to load KTX2 async
  if (isCompressionAvailable()) {
    // Start async KTX2 load if not already pending
    if (!pendingKtx2Loads.has(ktx2Path)) {
      const loadPromise = loadCompressedTexture(ktx2Path, jpgPath, `machine-${textureName}`)
        .then((tex) => {
          textureCache.set(jpgPath, tex);
          pendingKtx2Loads.delete(ktx2Path);
          return tex;
        })
        .catch(() => {
          pendingKtx2Loads.delete(ktx2Path);
          // Fall back to JPG via standard loader
          return loadJpgTexture(jpgPath);
        });
      pendingKtx2Loads.set(ktx2Path, loadPromise);
    }

    // Return placeholder or cached texture while async load completes
    // The texture will update in place when the async load finishes
    const cached = textureCache.get(jpgPath);
    if (cached) return cached;

    // Start JPG load as immediate fallback (will be replaced by KTX2 when ready)
    return loadJpgTexture(jpgPath);
  }

  // No KTX2 support - load JPG directly
  return loadJpgTexture(jpgPath);
}

/**
 * Load JPG texture (fallback when KTX2 not available)
 */
function loadJpgTexture(path: string): Texture | null {
  if (textureCache.has(path)) {
    return textureCache.get(path) ?? null;
  }

  try {
    const loader = new TextureLoader();
    const texture = loader.load(
      path,
      // On success
      (tex) => {
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.minFilter = LinearFilter;
        tex.magFilter = NearestFilter;
        tex.generateMipmaps = false; // Perf optimization
        textureCache.set(path, tex);
      },
      // On progress (unused)
      undefined,
      // On error - cache null to prevent retries
      () => {
        textureCache.set(path, null);
      }
    );
    textureCache.set(path, texture);
    return texture;
  } catch {
    textureCache.set(path, null);
    return null;
  }
}

/**
 * Get texture set for a model type at a specific resolution.
 * Returns null textures if textures disabled or not found.
 */
export function getModelTextures(
  modelType: ModelType,
  resolution: '256' | '512' = '256'
): MachineTextures {
  const enableTextures = useGraphicsStore.getState().graphics.enableMachineTextures;

  if (!enableTextures) {
    return { roughness: null, normal: null, ao: null };
  }

  const base = `${TEXTURE_BASE_PATH}/${resolution}/${modelType}`;

  return {
    roughness: safeLoadTexture(`${base}_roughness.jpg`),
    normal: safeLoadTexture(`${base}_normal.jpg`),
    ao: safeLoadTexture(`${base}_ao.jpg`),
    // Color maps exist for some models
    color: ['worker', 'conveyor', 'pallet', 'grass', 'concrete', 'brick', 'water'].includes(
      modelType
    )
      ? safeLoadTexture(`${base}_color.jpg`)
      : null,
  };
}

/**
 * React hook version for use in components.
 * Automatically selects resolution based on quality setting.
 * Only attempts to load textures on high/ultra quality.
 */
export function useModelTextures(modelType: ModelType): MachineTextures {
  const enableTextures = useGraphicsStore((state) => state.graphics.enableMachineTextures);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Early return for low/medium quality
  if (!enableTextures || quality === 'low' || quality === 'medium') {
    return { roughness: null, normal: null, ao: null };
  }

  const resolution = RESOLUTION_BY_QUALITY[quality];
  return getModelTextures(modelType, resolution as '256' | '512');
}

// Legacy alias for backward compatibility
export const getMachineTextures = getModelTextures;
export const useMachineTextures = useModelTextures;
export type MachineType = ModelType;

/**
 * Dispose all cached textures (call on app unmount if needed)
 */
export function disposeMachineTextures(): void {
  textureCache.forEach((texture) => {
    if (texture) {
      texture.dispose();
    }
  });
  textureCache.clear();
}

/**
 * Apply textures to a Three.js MeshStandardMaterial if textures are available.
 * Mutates the material in-place.
 */
export function applyTexturesToMaterial(
  material: MeshStandardMaterial,
  textures: MachineTextures
): void {
  if (textures.roughness) {
    material.roughnessMap = textures.roughness;
  }
  if (textures.normal) {
    material.normalMap = textures.normal;
    material.normalScale?.set(0.5, 0.5); // Subtle normal mapping
  }
  if (textures.ao) {
    material.aoMap = textures.ao;
    material.aoMapIntensity = 0.5;
  }

  // Need to update if any texture was applied
  if (textures.roughness || textures.normal || textures.ao) {
    material.needsUpdate = true;
  }
}
