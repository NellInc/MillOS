/**
 * GPUResourceManager - Centralized GPU resource lifecycle management
 *
 * Prevents WebGL context loss by:
 * 1. Tracking all GPU resources (geometries, textures, materials, render targets)
 * 2. Enforcing memory budgets with warnings
 * 3. Providing bulk disposal and recreation on context loss
 * 4. Monitoring memory pressure and auto-disposing unused resources
 *
 * Usage:
 *   import { gpuResourceManager } from '@/utils/GPUResourceManager';
 *   gpuResourceManager.register('geometry', geometry, 'myComponent');
 *   // On cleanup:
 *   gpuResourceManager.disposeByOwner('myComponent');
 */

import * as THREE from 'three';

// Estimated memory sizes in bytes (approximations)
const MEMORY_ESTIMATES = {
  geometry: (g: THREE.BufferGeometry) => {
    let bytes = 0;
    for (const attr of Object.values(g.attributes)) {
      if (attr instanceof THREE.BufferAttribute) {
        bytes += attr.array.byteLength;
      }
    }
    if (g.index) bytes += g.index.array.byteLength;
    return bytes;
  },
  texture: (t: THREE.Texture) => {
    const image = t.image as { width?: number; height?: number } | null;
    if (!image) return 0;
    const width = image.width || 1024;
    const height = image.height || 1024;
    // 4 bytes per pixel (RGBA), plus mipmaps (~1.33x)
    return width * height * 4 * 1.33;
  },
  material: () => 1024, // Materials are small, ~1KB metadata
  renderTarget: (rt: THREE.WebGLRenderTarget) => {
    return rt.width * rt.height * 4 * (rt.depthBuffer ? 2 : 1);
  },
};

type ResourceType = 'geometry' | 'texture' | 'material' | 'renderTarget';

interface TrackedResource {
  type: ResourceType;
  resource: THREE.BufferGeometry | THREE.Texture | THREE.Material | THREE.WebGLRenderTarget;
  owner: string;
  estimatedBytes: number;
  createdAt: number;
  lastUsed: number;
  priority: 'critical' | 'normal' | 'low'; // critical = never auto-dispose
}

interface MemoryBudget {
  geometries: number;
  textures: number;
  materials: number;
  renderTargets: number;
  total: number;
}

// Default budget: 512MB total, distributed across resource types
const DEFAULT_BUDGET: MemoryBudget = {
  geometries: 64 * 1024 * 1024, // 64MB
  textures: 300 * 1024 * 1024, // 300MB (textures are biggest)
  materials: 8 * 1024 * 1024, // 8MB
  renderTargets: 64 * 1024 * 1024, // 64MB
  total: 512 * 1024 * 1024, // 512MB total
};

type ContextLostCallback = () => void;
type ContextRestoredCallback = () => void;
type MemoryWarningCallback = (usage: MemoryUsage) => void;

interface MemoryUsage {
  geometries: { count: number; bytes: number; budgetPercent: number };
  textures: { count: number; bytes: number; budgetPercent: number };
  materials: { count: number; bytes: number; budgetPercent: number };
  renderTargets: { count: number; bytes: number; budgetPercent: number };
  total: { count: number; bytes: number; budgetPercent: number };
}

class GPUResourceManager {
  private resources: Map<string, TrackedResource> = new Map();
  private resourceIdCounter = 0;
  private budget: MemoryBudget = { ...DEFAULT_BUDGET };
  private contextLostCallbacks: Set<ContextLostCallback> = new Set();
  private contextRestoredCallbacks: Set<ContextRestoredCallback> = new Set();
  private memoryWarningCallbacks: Set<MemoryWarningCallback> = new Set();
  private isContextLost = false;
  private pendingRecreation: Map<string, () => TrackedResource['resource']> = new Map();
  private lastWarningTime = 0;
  private warningThrottleMs = 5000; // Don't warn more than once per 5s

  /**
   * Register a GPU resource for tracking
   * @returns Resource ID for later reference
   */
  register(
    type: ResourceType,
    resource: TrackedResource['resource'],
    owner: string,
    options: {
      priority?: TrackedResource['priority'];
      recreator?: () => TrackedResource['resource'];
    } = {}
  ): string {
    const id = `${type}_${owner}_${this.resourceIdCounter++}`;
    const estimatedBytes = this.estimateMemory(type, resource);

    this.resources.set(id, {
      type,
      resource,
      owner,
      estimatedBytes,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      priority: options.priority || 'normal',
    });

    if (options.recreator) {
      this.pendingRecreation.set(id, options.recreator);
    }

    this.checkMemoryBudget();
    return id;
  }

  /**
   * Mark a resource as recently used (prevents auto-disposal)
   */
  touch(id: string): void {
    const resource = this.resources.get(id);
    if (resource) {
      resource.lastUsed = Date.now();
    }
  }

  /**
   * Dispose a single resource by ID
   */
  dispose(id: string): void {
    const tracked = this.resources.get(id);
    if (!tracked) return;

    this.disposeResource(tracked.resource);
    this.resources.delete(id);
    this.pendingRecreation.delete(id);
  }

  /**
   * Dispose all resources owned by a specific component
   */
  disposeByOwner(owner: string): void {
    const toDispose: string[] = [];
    this.resources.forEach((tracked, id) => {
      if (tracked.owner === owner) {
        toDispose.push(id);
      }
    });
    toDispose.forEach((id) => this.dispose(id));
  }

  /**
   * Dispose all resources of a specific type
   */
  disposeByType(type: ResourceType): void {
    const toDispose: string[] = [];
    this.resources.forEach((tracked, id) => {
      if (tracked.type === type) {
        toDispose.push(id);
      }
    });
    toDispose.forEach((id) => this.dispose(id));
  }

  /**
   * Dispose ALL resources (use on app unmount or context loss)
   */
  disposeAll(): void {
    this.resources.forEach((tracked) => {
      this.disposeResource(tracked.resource);
    });
    this.resources.clear();
  }

  /**
   * Dispose low-priority unused resources to free memory
   */
  pruneUnused(maxAgeMs: number = 60000): number {
    const now = Date.now();
    let freedBytes = 0;
    const toDispose: string[] = [];

    this.resources.forEach((tracked, id) => {
      if (tracked.priority === 'critical') return;
      if (now - tracked.lastUsed > maxAgeMs) {
        toDispose.push(id);
        freedBytes += tracked.estimatedBytes;
      }
    });

    toDispose.forEach((id) => this.dispose(id));
    return freedBytes;
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryUsage(): MemoryUsage {
    const stats = {
      geometries: { count: 0, bytes: 0, budgetPercent: 0 },
      textures: { count: 0, bytes: 0, budgetPercent: 0 },
      materials: { count: 0, bytes: 0, budgetPercent: 0 },
      renderTargets: { count: 0, bytes: 0, budgetPercent: 0 },
      total: { count: 0, bytes: 0, budgetPercent: 0 },
    };

    // Explicit singular->plural mapping. Naive `${type}s` produced
    // 'geometrys' (stats key is 'geometries'), so geometry count/bytes
    // silently never accumulated and the geometry budget gauge sat at 0.
    const TYPE_TO_CATEGORY: Record<string, keyof Omit<MemoryUsage, 'total'>> = {
      geometry: 'geometries',
      texture: 'textures',
      material: 'materials',
      renderTarget: 'renderTargets',
    };

    this.resources.forEach((tracked) => {
      const category = TYPE_TO_CATEGORY[tracked.type];
      if (category && stats[category]) {
        stats[category].count++;
        stats[category].bytes += tracked.estimatedBytes;
      }
      stats.total.count++;
      stats.total.bytes += tracked.estimatedBytes;
    });

    // Calculate budget percentages
    stats.geometries.budgetPercent = (stats.geometries.bytes / this.budget.geometries) * 100;
    stats.textures.budgetPercent = (stats.textures.bytes / this.budget.textures) * 100;
    stats.materials.budgetPercent = (stats.materials.bytes / this.budget.materials) * 100;
    stats.renderTargets.budgetPercent =
      (stats.renderTargets.bytes / this.budget.renderTargets) * 100;
    stats.total.budgetPercent = (stats.total.bytes / this.budget.total) * 100;

    return stats;
  }

  /**
   * Set custom memory budget
   */
  setBudget(budget: Partial<MemoryBudget>): void {
    this.budget = { ...this.budget, ...budget };
  }

  /**
   * Register callback for context loss events
   */
  onContextLost(callback: ContextLostCallback): () => void {
    this.contextLostCallbacks.add(callback);
    return () => this.contextLostCallbacks.delete(callback);
  }

  /**
   * Register callback for context restoration events
   */
  onContextRestored(callback: ContextRestoredCallback): () => void {
    this.contextRestoredCallbacks.add(callback);
    return () => this.contextRestoredCallbacks.delete(callback);
  }

  /**
   * Register callback for memory warnings (>80% budget)
   */
  onMemoryWarning(callback: MemoryWarningCallback): () => void {
    this.memoryWarningCallbacks.add(callback);
    return () => this.memoryWarningCallbacks.delete(callback);
  }

  /**
   * Call when WebGL context is lost
   */
  handleContextLost(): void {
    this.isContextLost = true;
    this.contextLostCallbacks.forEach((cb) => cb());
  }

  /**
   * Call when WebGL context is restored
   */
  handleContextRestored(): void {
    this.isContextLost = false;

    // Recreate resources that have recreator functions
    this.pendingRecreation.forEach((recreator, id) => {
      const tracked = this.resources.get(id);
      if (tracked) {
        try {
          tracked.resource = recreator();
        } catch {
          // Silently fail - resource recreation errors handled elsewhere
        }
      }
    });

    this.contextRestoredCallbacks.forEach((cb) => cb());
  }

  /**
   * Check if context is currently lost
   */
  isContextAvailable(): boolean {
    return !this.isContextLost;
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Get current resource status (for debugging tools/UI)
   */
  debugLog(): MemoryUsage {
    return this.getMemoryUsage();
  }

  // Private methods

  private estimateMemory(type: ResourceType, resource: TrackedResource['resource']): number {
    switch (type) {
      case 'geometry':
        return MEMORY_ESTIMATES.geometry(resource as THREE.BufferGeometry);
      case 'texture':
        return MEMORY_ESTIMATES.texture(resource as THREE.Texture);
      case 'material':
        return MEMORY_ESTIMATES.material();
      case 'renderTarget':
        return MEMORY_ESTIMATES.renderTarget(resource as THREE.WebGLRenderTarget);
      default:
        return 0;
    }
  }

  private disposeResource(resource: TrackedResource['resource']): void {
    try {
      if ('dispose' in resource && typeof resource.dispose === 'function') {
        resource.dispose();
      }
    } catch {
      // Silently fail - disposal errors are non-critical
    }
  }

  private checkMemoryBudget(): void {
    const now = Date.now();
    if (now - this.lastWarningTime < this.warningThrottleMs) return;

    const usage = this.getMemoryUsage();

    // Warn at 80% of any category or total
    const shouldWarn =
      usage.total.budgetPercent > 80 ||
      usage.geometries.budgetPercent > 80 ||
      usage.textures.budgetPercent > 80 ||
      usage.renderTargets.budgetPercent > 80;

    if (shouldWarn) {
      this.lastWarningTime = now;
      this.memoryWarningCallbacks.forEach((cb) => cb(usage));

      // Auto-prune if over 90%
      if (usage.total.budgetPercent > 90) {
        this.pruneUnused(30000); // Prune resources unused for 30s
      }
    }
  }
}

// Singleton instance
export const gpuResourceManager = new GPUResourceManager();

// Export for testing
export { GPUResourceManager };
export type { MemoryUsage, MemoryBudget, ResourceType, TrackedResource };
