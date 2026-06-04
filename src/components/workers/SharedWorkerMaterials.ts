import * as THREE from 'three';
import { getModelTextures, type MachineTextures } from '../../utils/machineTextures';
import { useGraphicsStore } from '../../stores/graphicsStore';

/**
 * Shared materials for worker body parts to reduce memory overhead
 * and enable easy texture addition. Materials are cached by color value
 * to maintain worker-to-worker variation while avoiding duplicate instances.
 *
 * Textures are automatically applied on high/ultra quality settings.
 */

// =============================================================================
// TEXTURE MANAGEMENT
// =============================================================================

let workerTextures: MachineTextures | null = null;
let texturesInitialized = false;
let lastQuality: string | null = null;

/**
 * Initialize worker textures based on current quality settings.
 * Called lazily when materials are first requested.
 */
function initializeTextures(): void {
  const { quality, enableMachineTextures } = useGraphicsStore.getState().graphics;

  // Skip if already initialized for this quality level
  if (texturesInitialized && lastQuality === quality) {
    return;
  }

  // Only load textures on high/ultra with textures enabled
  if (enableMachineTextures && (quality === 'high' || quality === 'ultra')) {
    const resolution = quality === 'ultra' ? '512' : '256';
    workerTextures = getModelTextures('worker', resolution as '256' | '512');
  } else {
    workerTextures = null;
  }

  texturesInitialized = true;
  lastQuality = quality;
}

/**
 * Apply worker textures to a material if available.
 */
function applyWorkerTextures(material: THREE.MeshStandardMaterial): void {
  initializeTextures();

  if (!workerTextures) return;

  if (workerTextures.roughness) {
    material.roughnessMap = workerTextures.roughness;
  }
  if (workerTextures.normal) {
    material.normalMap = workerTextures.normal;
    material.normalScale.set(0.3, 0.3); // Subtle for workers
  }
  if (workerTextures.ao) {
    material.aoMap = workerTextures.ao;
    material.aoMapIntensity = 0.4;
  }

  material.needsUpdate = true;
}

// =============================================================================
// STATIC SHARED MATERIALS (identical across all workers)
// =============================================================================

export const SHARED_WORKER_MATERIALS = {
  // Face features
  eyeWhite: new THREE.MeshStandardMaterial({ color: '#fefefe', roughness: 0.2 }),
  iris: new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.3 }),
  pupil: new THREE.MeshStandardMaterial({ color: '#0a0a0a' }),
  lips: new THREE.MeshStandardMaterial({ color: '#a0524a', roughness: 0.7 }),

  // Generic colors
  black: new THREE.MeshStandardMaterial({ color: '#0a0a0a' }),
  darkGray: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 }),
  mediumGray: new THREE.MeshStandardMaterial({ color: '#333333' }),
  white: new THREE.MeshStandardMaterial({ color: '#ffffff' }),
  offWhite: new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 0.7 }),

  // Metallic
  chrome: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 0.8,
    roughness: 0.2,
  }),
  chromeShiny: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 0.9,
    roughness: 0.3,
  }),

  // Safety equipment
  vestOrange: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 }),
  safetyGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#22c55e',
    emissiveIntensity: 0.5,
  }),
  safetyGreenBright: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#22c55e',
    emissiveIntensity: 2,
  }),

  // Equipment
  screenBlue: new THREE.MeshStandardMaterial({
    color: '#1e40af',
    emissive: '#1e40af',
    emissiveIntensity: 0.3,
  }),
  clipboardBrown: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.7 }),
  lensBlue: new THREE.MeshStandardMaterial({
    color: '#a0d8ef',
    transparent: true,
    opacity: 0.4,
  }),
  handleRed: new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.8 }),
};

// =============================================================================
// CACHED DYNAMIC MATERIALS (vary per-worker but shared across same values)
// =============================================================================

// Cache maps for dynamic colors
const skinMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const skinSoftMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const hairMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const uniformMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const pantsMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const hatMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

// Track which materials have had textures applied
const texturedMaterials = new WeakSet<THREE.MeshStandardMaterial>();

/**
 * Get or create a skin material for the given skin tone.
 * Cached to share materials between workers with the same skin tone.
 * Textures are automatically applied on high/ultra quality.
 */
export const getSkinMaterial = (skinTone: string): THREE.MeshStandardMaterial => {
  if (!skinMaterialCache.has(skinTone)) {
    const material = new THREE.MeshStandardMaterial({
      color: skinTone,
      roughness: 0.6,
    });
    skinMaterialCache.set(skinTone, material);
  }

  const material = skinMaterialCache.get(skinTone)!;

  // Apply textures if not already done
  if (!texturedMaterials.has(material)) {
    applyWorkerTextures(material);
    texturedMaterials.add(material);
  }

  return material;
};

/**
 * Get skin material with softer roughness (for face/head details).
 * Textures are automatically applied on high/ultra quality.
 */
export const getSkinSoftMaterial = (skinTone: string): THREE.MeshStandardMaterial => {
  if (!skinSoftMaterialCache.has(skinTone)) {
    const material = new THREE.MeshStandardMaterial({
      color: skinTone,
      roughness: 0.55,
    });
    skinSoftMaterialCache.set(skinTone, material);
  }

  const material = skinSoftMaterialCache.get(skinTone)!;

  if (!texturedMaterials.has(material)) {
    applyWorkerTextures(material);
    texturedMaterials.add(material);
  }

  return material;
};

/**
 * Get or create a hair material for the given hair color.
 */
export const getHairMaterial = (hairColor: string): THREE.MeshStandardMaterial => {
  if (!hairMaterialCache.has(hairColor)) {
    hairMaterialCache.set(
      hairColor,
      new THREE.MeshStandardMaterial({
        color: hairColor,
        roughness: 0.9,
      })
    );
  }
  return hairMaterialCache.get(hairColor)!;
};

/**
 * Get or create a uniform/shirt material.
 * Textures are automatically applied on high/ultra quality.
 */
export const getUniformMaterial = (color: string): THREE.MeshStandardMaterial => {
  if (!uniformMaterialCache.has(color)) {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
    });
    uniformMaterialCache.set(color, material);
  }

  const material = uniformMaterialCache.get(color)!;

  if (!texturedMaterials.has(material)) {
    applyWorkerTextures(material);
    texturedMaterials.add(material);
  }

  return material;
};

/**
 * Get or create a pants material.
 * Textures are automatically applied on high/ultra quality.
 */
export const getPantsMaterial = (color: string): THREE.MeshStandardMaterial => {
  if (!pantsMaterialCache.has(color)) {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
    });
    pantsMaterialCache.set(color, material);
  }

  const material = pantsMaterialCache.get(color)!;

  if (!texturedMaterials.has(material)) {
    applyWorkerTextures(material);
    texturedMaterials.add(material);
  }

  return material;
};

/**
 * Get or create a hat material.
 */
export const getHatMaterial = (color: string): THREE.MeshStandardMaterial => {
  if (!hatMaterialCache.has(color)) {
    hatMaterialCache.set(
      color,
      new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
      })
    );
  }
  return hatMaterialCache.get(color)!;
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Force texture re-initialization (call when quality settings change).
 */
export const refreshWorkerTextures = (): void => {
  texturesInitialized = false;
  lastQuality = null;

  // Re-apply textures to all cached materials
  const allCaches = [
    skinMaterialCache,
    skinSoftMaterialCache,
    uniformMaterialCache,
    pantsMaterialCache,
  ];

  for (const cache of allCaches) {
    for (const material of cache.values()) {
      // Clear existing texture maps
      material.roughnessMap = null;
      material.normalMap = null;
      material.aoMap = null;
      // Evict from the textured tracking set so the getters re-run
      // applyWorkerTextures on next access (WeakSet has no clear()).
      texturedMaterials.delete(material);
      material.needsUpdate = true;
    }
  }
};

/**
 * Clear all material caches (useful for memory cleanup or hot reloading).
 */
export const clearMaterialCaches = (): void => {
  // Dispose all cached materials
  const caches = [
    skinMaterialCache,
    skinSoftMaterialCache,
    hairMaterialCache,
    uniformMaterialCache,
    pantsMaterialCache,
    hatMaterialCache,
  ];

  for (const cache of caches) {
    for (const material of cache.values()) {
      material.dispose();
    }
    cache.clear();
  }

  // Reset texture state
  texturesInitialized = false;
  lastQuality = null;
  workerTextures = null;
};

/**
 * Get cache statistics for debugging.
 */
export const getMaterialCacheStats = () => ({
  skin: skinMaterialCache.size,
  skinSoft: skinSoftMaterialCache.size,
  hair: hairMaterialCache.size,
  uniform: uniformMaterialCache.size,
  pants: pantsMaterialCache.size,
  hat: hatMaterialCache.size,
  staticMaterials: Object.keys(SHARED_WORKER_MATERIALS).length,
  texturesEnabled: workerTextures !== null,
  quality: lastQuality,
});
