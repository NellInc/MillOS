/**
 * useGPUResource - React hook for automatic GPU resource lifecycle management
 *
 * Automatically registers resources with GPUResourceManager and disposes on unmount.
 *
 * Usage:
 *   const geometry = useGPUGeometry(
 *     () => new THREE.BoxGeometry(1, 1, 1),
 *     [width, height, depth] // dependencies
 *   );
 *
 *   const texture = useGPUTexture('/path/to/texture.jpg');
 */

import { useEffect, useRef, useMemo, useId, useState } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { gpuResourceManager, ResourceType, TrackedResource } from '../utils/GPUResourceManager';

type ResourcePriority = TrackedResource['priority'];

/**
 * Generic hook for any GPU resource with auto-disposal
 */
export function useGPUResource<T extends { dispose?: () => void }>(
  type: ResourceType,
  factory: () => T,
  deps: React.DependencyList = [],
  options: {
    priority?: ResourcePriority;
    owner?: string;
  } = {}
): T {
  const componentId = useId();
  const owner = options.owner || componentId;
  const resourceIdRef = useRef<string | null>(null);

  const resource = useMemo(() => {
    // Dispose previous resource if recreating
    if (resourceIdRef.current) {
      gpuResourceManager.dispose(resourceIdRef.current);
    }

    const newResource = factory();

    resourceIdRef.current = gpuResourceManager.register(type, newResource as never, owner, {
      priority: options.priority,
      // Cast through unknown for type flexibility with generic factory functions
      recreator: factory as unknown as () => TrackedResource['resource'],
    });

    return newResource;
  }, deps);

  // Touch on each render to mark as "in use"
  useEffect(() => {
    if (resourceIdRef.current) {
      gpuResourceManager.touch(resourceIdRef.current);
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resourceIdRef.current) {
        gpuResourceManager.dispose(resourceIdRef.current);
        resourceIdRef.current = null;
      }
    };
  }, []);

  return resource;
}

/**
 * Hook for BufferGeometry with auto-disposal
 */
export function useGPUGeometry<T extends THREE.BufferGeometry>(
  factory: () => T,
  deps: React.DependencyList = [],
  priority: ResourcePriority = 'normal'
): T {
  return useGPUResource('geometry', factory, deps, { priority });
}

/**
 * Hook for Material with auto-disposal
 */
export function useGPUMaterial<T extends THREE.Material>(
  factory: () => T,
  deps: React.DependencyList = [],
  priority: ResourcePriority = 'normal'
): T {
  return useGPUResource('material', factory, deps, { priority });
}

/**
 * Hook for RenderTarget with auto-disposal
 */
export function useGPURenderTarget(
  width: number,
  height: number,
  options?: THREE.RenderTargetOptions,
  priority: ResourcePriority = 'normal'
): THREE.WebGLRenderTarget {
  return useGPUResource(
    'renderTarget',
    () => new THREE.WebGLRenderTarget(width, height, options),
    [width, height, JSON.stringify(options)],
    { priority }
  );
}

/**
 * Hook for drei's useTexture with auto-registration
 * Wraps @react-three/drei useTexture with GPUResourceManager tracking
 */
export function useGPUTexture(
  path: string | string[],
  priority: ResourcePriority = 'normal'
): THREE.Texture | THREE.Texture[] {
  const componentId = useId();
  const texture = useTexture(path);
  const resourceIdsRef = useRef<string[]>([]);

  useEffect(() => {
    // Clean up old registrations
    resourceIdsRef.current.forEach((id) => gpuResourceManager.dispose(id));
    resourceIdsRef.current = [];

    // Register new textures
    const textures = Array.isArray(texture) ? texture : [texture];
    textures.forEach((tex, index) => {
      const id = gpuResourceManager.register('texture', tex, `${componentId}_tex_${index}`, {
        priority,
        // drei handles texture recreation, so no recreator needed
      });
      resourceIdsRef.current.push(id);
    });

    return () => {
      resourceIdsRef.current.forEach((id) => gpuResourceManager.dispose(id));
      resourceIdsRef.current = [];
    };
  }, [texture, componentId, priority]);

  // Touch on render
  useEffect(() => {
    resourceIdsRef.current.forEach((id) => gpuResourceManager.touch(id));
  });

  return texture;
}

/**
 * Hook to register an existing resource (for resources created elsewhere)
 * Returns the resource ID for manual management
 */
export function useRegisterGPUResource(
  type: ResourceType,
  resource: TrackedResource['resource'] | null,
  owner?: string,
  priority: ResourcePriority = 'normal'
): string | null {
  const componentId = useId();
  const finalOwner = owner || componentId;
  const resourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Dispose previous if exists
    if (resourceIdRef.current) {
      gpuResourceManager.dispose(resourceIdRef.current);
      resourceIdRef.current = null;
    }

    // Register new resource
    if (resource) {
      resourceIdRef.current = gpuResourceManager.register(type, resource, finalOwner, {
        priority,
      });
    }

    return () => {
      if (resourceIdRef.current) {
        gpuResourceManager.dispose(resourceIdRef.current);
        resourceIdRef.current = null;
      }
    };
  }, [type, resource, finalOwner, priority]);

  // Touch on render
  useEffect(() => {
    if (resourceIdRef.current) {
      gpuResourceManager.touch(resourceIdRef.current);
    }
  });

  return resourceIdRef.current;
}

/**
 * Hook to dispose all resources by owner on unmount
 * Useful for components that create resources imperatively
 */
export function useGPUResourceCleanup(owner: string): void {
  useEffect(() => {
    return () => {
      gpuResourceManager.disposeByOwner(owner);
    };
  }, [owner]);
}

/**
 * Hook to get memory usage stats (for debugging/monitoring UI)
 */
export function useGPUMemoryStats(refreshIntervalMs: number = 1000) {
  const [stats, setStats] = useState(() => gpuResourceManager.getMemoryUsage());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(gpuResourceManager.getMemoryUsage());
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [refreshIntervalMs]);

  return stats;
}
