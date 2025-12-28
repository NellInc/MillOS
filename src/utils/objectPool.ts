/**
 * Object Pool System
 *
 * Reuses objects instead of creating/destroying them, reducing garbage collection.
 * Especially useful for particles, projectiles, and other frequently spawned objects.
 *
 * Benefits:
 * - Eliminates GC pauses from frequent allocations
 * - Pre-allocated memory for consistent performance
 * - Automatic expansion when pool is exhausted
 *
 * Usage:
 *   const particlePool = new ObjectPool(
 *     () => new THREE.Mesh(geo, mat),
 *     (mesh) => { mesh.visible = false; mesh.position.set(0,0,0); },
 *     100 // initial size
 *   );
 *
 *   const particle = particlePool.acquire();
 *   // ... use particle
 *   particlePool.release(particle);
 */

/**
 * Generic object pool implementation
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  private autoExpand: boolean;

  constructor(
    /** Factory function to create new objects */
    factory: () => T,
    /** Reset function to return object to initial state */
    reset: (obj: T) => void,
    /** Initial pool size */
    initialSize: number = 50,
    /** Maximum pool size (0 = unlimited) */
    maxSize: number = 500,
    /** Whether to auto-expand when exhausted */
    autoExpand: boolean = true
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
    this.autoExpand = autoExpand;

    // Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      const obj = this.factory();
      this.reset(obj);
      this.available.push(obj);
    }
  }

  /**
   * Get an object from the pool
   * Returns null if pool is exhausted and can't expand
   */
  acquire(): T | null {
    let obj: T;

    if (this.available.length > 0) {
      obj = this.available.pop()!;
    } else if (this.autoExpand && (this.maxSize === 0 || this.totalSize() < this.maxSize)) {
      // Expand pool
      obj = this.factory();
    } else {
      return null;
    }

    this.inUse.add(obj);
    return obj;
  }

  /**
   * Return an object to the pool
   */
  release(obj: T): void {
    if (!this.inUse.has(obj)) {
      return;
    }

    this.inUse.delete(obj);
    this.reset(obj);
    this.available.push(obj);
  }

  /**
   * Release all objects back to pool
   */
  releaseAll(): void {
    this.inUse.forEach((obj) => {
      this.reset(obj);
      this.available.push(obj);
    });
    this.inUse.clear();
  }

  /**
   * Get pool statistics
   */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.totalSize(),
    };
  }

  /**
   * Get total pool size
   */
  totalSize(): number {
    return this.available.length + this.inUse.size;
  }

  /**
   * Dispose of all objects (call cleanup function if objects have dispose method)
   */
  dispose(cleanup?: (obj: T) => void): void {
    const allObjects = [...this.available, ...this.inUse];
    if (cleanup) {
      allObjects.forEach(cleanup);
    }
    this.available = [];
    this.inUse.clear();
  }

  /**
   * Pre-warm the pool by creating objects up to target size
   */
  prewarm(targetSize: number): void {
    const currentSize = this.totalSize();
    const toCreate = Math.min(targetSize - currentSize, this.maxSize - currentSize);

    for (let i = 0; i < toCreate; i++) {
      const obj = this.factory();
      this.reset(obj);
      this.available.push(obj);
    }
  }
}

/**
 * Typed pool specifically for Three.js Object3D instances
 */
import * as THREE from 'three';

export class Object3DPool extends ObjectPool<THREE.Object3D> {
  constructor(factory: () => THREE.Object3D, initialSize: number = 50, maxSize: number = 500) {
    super(
      factory,
      (obj) => {
        // Standard reset for Three.js objects
        obj.visible = false;
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
        if (obj.parent) {
          obj.parent.remove(obj);
        }
      },
      initialSize,
      maxSize
    );
  }

  /**
   * Dispose with proper Three.js cleanup
   */
  disposeThreeJS(): void {
    this.dispose((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Don't dispose shared geometries/materials
        // obj.geometry?.dispose();
        // obj.material?.dispose();
      }
    });
  }
}

/**
 * Pool for particle-like objects (simplified reset)
 */
export class ParticlePool extends ObjectPool<{
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  active: boolean;
}> {
  constructor(initialSize: number = 200, maxSize: number = 1000) {
    super(
      () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(0xffffff),
        active: false,
      }),
      (p) => {
        p.position.set(0, 0, 0);
        p.velocity.set(0, 0, 0);
        p.life = 0;
        p.maxLife = 1;
        p.size = 1;
        p.color.setHex(0xffffff);
        p.active = false;
      },
      initialSize,
      maxSize
    );
  }
}

/**
 * Global particle pool instance (shared across components)
 */
export const globalParticlePool = new ParticlePool(500, 2000);

/**
 * Pool manager for multiple named pools
 */
class PoolManager {
  private pools: Map<string, ObjectPool<unknown>> = new Map();

  /**
   * Register a new pool
   */
  register<T>(
    name: string,
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 50,
    maxSize: number = 500
  ): ObjectPool<T> {
    if (this.pools.has(name)) {
      return this.pools.get(name) as ObjectPool<T>;
    }

    const pool = new ObjectPool(factory, reset, initialSize, maxSize);
    this.pools.set(name, pool as ObjectPool<unknown>);
    return pool;
  }

  /**
   * Get a pool by name
   */
  get<T>(name: string): ObjectPool<T> | null {
    return (this.pools.get(name) as ObjectPool<T>) || null;
  }

  /**
   * Get stats for all pools
   */
  getAllStats(): Record<string, { available: number; inUse: number; total: number }> {
    const stats: Record<string, { available: number; inUse: number; total: number }> = {};
    this.pools.forEach((pool, name) => {
      stats[name] = pool.getStats();
    });
    return stats;
  }

  /**
   * Release all objects in all pools
   */
  releaseAll(): void {
    this.pools.forEach((pool) => pool.releaseAll());
  }

  /**
   * Dispose all pools
   */
  disposeAll(): void {
    this.pools.forEach((pool) => pool.dispose());
    this.pools.clear();
  }
}

export const poolManager = new PoolManager();
