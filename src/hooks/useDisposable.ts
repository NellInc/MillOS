import { useState, useEffect } from 'react';

/**
 * Custom hook for managing disposable Three.js resources
 * Automatically disposes resources when dependencies change or component unmounts
 *
 * @param factory - Function that creates the disposable resource
 * @param deps - Dependency array (like useEffect)
 * @returns The created resource
 *
 * @example
 * const texture = useDisposable(() => {
 *   const canvas = document.createElement('canvas');
 *   // ... create texture
 *   return new THREE.CanvasTexture(canvas);
 * }, []);
 */
export function useDisposable<T extends { dispose: () => void }>(
  factory: () => T,
  deps: React.DependencyList
): T | null {
  // Hold the resource in state so creation triggers a re-render and the
  // consumer receives the resource instead of the initial null.
  const [resource, setResource] = useState<T | null>(null);

  useEffect(() => {
    // Create the resource
    const created = factory();
    setResource(created);

    // Cleanup: dispose the resource
    return () => {
      created.dispose();
      setResource(null);
    };
  }, deps);

  return resource;
}

/**
 * Custom hook for managing multiple disposable Three.js resources
 * Automatically disposes all resources when dependencies change or component unmounts
 *
 * @param factory - Function that creates an array of disposable resources
 * @param deps - Dependency array (like useEffect)
 * @returns Array of created resources
 *
 * @example
 * const [geometry, material] = useDisposableArray(() => {
 *   const geom = new THREE.BoxGeometry(1, 1, 1);
 *   const mat = new THREE.MeshStandardMaterial({ color: 'red' });
 *   return [geom, mat];
 * }, []);
 */
export function useDisposableArray<T extends { dispose: () => void }>(
  factory: () => T[],
  deps: React.DependencyList
): T[] {
  // Hold the resources in state so creation triggers a re-render and the
  // consumer receives the resources instead of the initial empty array.
  const [resources, setResources] = useState<T[]>([]);

  useEffect(() => {
    // Create the resources
    const created = factory();
    setResources(created);

    // Cleanup: dispose all resources
    return () => {
      created.forEach((resource) => {
        if (resource) {
          resource.dispose();
        }
      });
      setResources([]);
    };
  }, deps);

  return resources;
}
