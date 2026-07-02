/**
 * Resource Persistence - LocalStorage state management for GPU resources
 *
 * Stores resource metadata for faster recovery after context loss or page reload.
 * Does NOT store actual GPU data (too large), only metadata for reconstruction.
 *
 * Stored data:
 * - Texture paths (for reload)
 * - Geometry parameters (for recreation)
 * - Quality settings
 * - Resource priorities
 *
 * Usage:
 *   // On resource creation
 *   persistResource('texture', 'wood-tex', { path: '/textures/wood.jpg' });
 *
 *   // On recovery
 *   const metadata = getPersistedResource('wood-tex');
 *   // Recreate from metadata...
 */

const STORAGE_KEY = 'millos-gpu-resources';
const SETTINGS_KEY = 'millos-gpu-settings';
const MAX_ENTRIES = 500; // Prevent localStorage bloat

export interface ResourceMetadata {
  type: 'geometry' | 'texture' | 'material' | 'renderTarget';
  id: string;
  owner: string;
  priority: 'critical' | 'normal' | 'low';
  createdAt: number;
  params: Record<string, unknown>;
}

export interface GPUSettings {
  memoryBudget: number;
  autoDisposeEnabled: boolean;
  compressionEnabled: boolean;
  lodDistanceMultiplier: number;
  lastQuality: string;
}

const DEFAULT_SETTINGS: GPUSettings = {
  memoryBudget: 512 * 1024 * 1024,
  autoDisposeEnabled: true,
  compressionEnabled: true,
  lodDistanceMultiplier: 1.0,
  lastQuality: 'medium',
};

/**
 * Get all persisted resources
 */
export function getPersistedResources(): Map<string, ResourceMetadata> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return new Map();

    const parsed = JSON.parse(data) as Record<string, ResourceMetadata>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

/**
 * Get a specific persisted resource
 */
export function getPersistedResource(id: string): ResourceMetadata | null {
  const resources = getPersistedResources();
  return resources.get(id) || null;
}

/**
 * Persist a resource's metadata
 */
export function persistResource(metadata: ResourceMetadata): void {
  try {
    const resources = getPersistedResources();

    // Enforce max entries (remove oldest first)
    if (resources.size >= MAX_ENTRIES) {
      const sortedEntries = Array.from(resources.entries()).sort(
        ([, a], [, b]) => a.createdAt - b.createdAt
      );

      // Remove oldest 10%
      const toRemove = Math.ceil(MAX_ENTRIES * 0.1);
      for (let i = 0; i < toRemove; i++) {
        resources.delete(sortedEntries[i][0]);
      }
    }

    resources.set(metadata.id, metadata);

    const obj = Object.fromEntries(resources);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

/**
 * Remove a persisted resource
 */
export function removePersistedResource(id: string): void {
  try {
    const resources = getPersistedResources();
    resources.delete(id);

    const obj = Object.fromEntries(resources);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

/**
 * Clear all persisted resources
 */
export function clearPersistedResources(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

/**
 * Persist texture metadata for later reload
 */
export function persistTexture(
  id: string,
  path: string,
  owner: string,
  options: {
    priority?: 'critical' | 'normal' | 'low';
    isCompressed?: boolean;
    resolution?: string;
  } = {}
): void {
  persistResource({
    type: 'texture',
    id,
    owner,
    priority: options.priority || 'normal',
    createdAt: Date.now(),
    params: {
      path,
      isCompressed: options.isCompressed || false,
      resolution: options.resolution,
    },
  });
}

/**
 * Persist geometry metadata for recreation
 */
export function persistGeometry(
  id: string,
  geometryType: string,
  owner: string,
  params: Record<string, unknown>,
  priority: 'critical' | 'normal' | 'low' = 'normal'
): void {
  persistResource({
    type: 'geometry',
    id,
    owner,
    priority,
    createdAt: Date.now(),
    params: {
      geometryType,
      ...params,
    },
  });
}

/**
 * Get GPU settings
 */
export function getGPUSettings(): GPUSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return { ...DEFAULT_SETTINGS };

    // Validate each field individually - corrupted/legacy localStorage data
    // must not overwrite sane defaults (mirrors audioManager.loadSettings)
    const parsed = JSON.parse(data) as Partial<GPUSettings>;
    const settings: GPUSettings = { ...DEFAULT_SETTINGS };
    if (Number.isFinite(parsed.memoryBudget) && (parsed.memoryBudget as number) > 0) {
      settings.memoryBudget = parsed.memoryBudget as number;
    }
    if (typeof parsed.autoDisposeEnabled === 'boolean') {
      settings.autoDisposeEnabled = parsed.autoDisposeEnabled;
    }
    if (typeof parsed.compressionEnabled === 'boolean') {
      settings.compressionEnabled = parsed.compressionEnabled;
    }
    if (
      Number.isFinite(parsed.lodDistanceMultiplier) &&
      (parsed.lodDistanceMultiplier as number) > 0
    ) {
      settings.lodDistanceMultiplier = parsed.lodDistanceMultiplier as number;
    }
    if (typeof parsed.lastQuality === 'string' && parsed.lastQuality.length > 0) {
      settings.lastQuality = parsed.lastQuality;
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save GPU settings
 */
export function saveGPUSettings(settings: Partial<GPUSettings>): void {
  try {
    const current = getGPUSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail - localStorage may be unavailable
  }
}

/**
 * Get resources that need recovery (critical + normal priority)
 */
export function getRecoverableResources(): ResourceMetadata[] {
  const resources = getPersistedResources();
  return Array.from(resources.values())
    .filter((r) => r.priority !== 'low')
    .sort((a, b) => {
      // Critical first, then by creation time
      if (a.priority === 'critical' && b.priority !== 'critical') return -1;
      if (b.priority === 'critical' && a.priority !== 'critical') return 1;
      return a.createdAt - b.createdAt;
    });
}

/**
 * Get storage usage statistics
 */
export function getStorageStats(): {
  resourceCount: number;
  estimatedSize: string;
  oldestResource: number | null;
} {
  const resources = getPersistedResources();
  let oldest: number | null = null;

  resources.forEach((r) => {
    if (oldest === null || r.createdAt < oldest) {
      oldest = r.createdAt;
    }
  });

  const dataSize = localStorage.getItem(STORAGE_KEY)?.length || 0;

  return {
    resourceCount: resources.size,
    estimatedSize: `${(dataSize / 1024).toFixed(1)} KB`,
    oldestResource: oldest,
  };
}

/**
 * Recreate a geometry from persisted metadata
 * Returns the parameters needed to reconstruct (actual creation is caller's responsibility)
 */
export function getGeometryRecreationParams(
  id: string
): { geometryType: string; params: Record<string, unknown> } | null {
  const metadata = getPersistedResource(id);
  if (!metadata || metadata.type !== 'geometry') return null;

  return {
    geometryType: metadata.params.geometryType as string,
    params: metadata.params,
  };
}

/**
 * Get texture path for reload
 */
export function getTextureReloadPath(id: string): string | null {
  const metadata = getPersistedResource(id);
  if (!metadata || metadata.type !== 'texture') return null;

  return metadata.params.path as string;
}

// Types already exported via interface declarations above
