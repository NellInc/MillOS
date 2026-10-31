import { createRequire } from 'node:module';
import { act } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WasteBinFallback } from './WasteBinFallback';
import { createWasteBinFallbackBodyGeometry } from './wasteBinFallbackGeometry';

const runtimeThree = createRequire(import.meta.url)('three') as typeof import('three');
extend({
  Group: runtimeThree.Group,
  Mesh: runtimeThree.Mesh,
  MeshStandardMaterial: runtimeThree.MeshStandardMaterial,
  TorusGeometry: runtimeThree.TorusGeometry,
});

const shoot = (mesh: THREE.Mesh, origin: number[], direction: number[]) => {
  mesh.updateMatrixWorld(true);
  return new THREE.Raycaster(
    new THREE.Vector3().fromArray(origin),
    new THREE.Vector3().fromArray(direction)
  ).intersectObject(mesh)[0];
};

describe('hollow waste-bin fallback', () => {
  it('keeps the outside envelope, bottom, finite indexed attributes and one bounded body mesh', () => {
    const geometry = createWasteBinFallbackBodyGeometry();
    try {
      const bounds = geometry.boundingBox!;
      expect(bounds.min.x).toBeCloseTo(-0.25, 6);
      expect(bounds.max.x).toBeCloseTo(0.25, 6);
      expect(bounds.min.y).toBeCloseTo(-0.4, 6);
      expect(bounds.max.y).toBeCloseTo(0.4, 6);
      expect(geometry.index!.count / 3).toBe(64);
      for (const attr of Object.values(geometry.attributes)) {
        expect(attr.count).toBe(98);
        for (let i = 0; i < attr.count; i += 1)
          for (let k = 0; k < attr.itemSize; k += 1)
            expect(Number.isFinite(attr.getComponent(i, k))).toBe(true);
      }
      for (let i = 0; i < geometry.index!.count; i += 1)
        expect(geometry.index!.getX(i)).toBeLessThan(98);
    } finally {
      geometry.dispose();
    }
  });

  it('has a real aperture, inward-facing wall and raised floor, not a dark cover or ground hole', () => {
    const geometry = createWasteBinFallbackBodyGeometry();
    const material = new THREE.MeshStandardMaterial({ side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.4;
    try {
      for (const x of [-0.12, 0, 0.12])
        for (const z of [-0.12, 0, 0.12]) {
          const hit = shoot(mesh, [x, 2, z], [0, -1, 0]);
          expect(hit).toBeDefined();
          expect(hit.point.y).toBeCloseTo(0.04, 6);
          expect(hit.face!.normal.y).toBeGreaterThan(0.99);
        }
      expect(shoot(mesh, [0, 0.4, 0], [1, 0, 0]).face!.normal.x).toBeLessThan(-0.8);
      expect(shoot(mesh, [1, 0.4, 0], [-1, 0, 0]).face!.normal.x).toBeGreaterThan(0.8);
      expect(shoot(mesh, [0, -1, 0], [0, 1, 0]).point.y).toBeCloseTo(0, 6);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });

  it('owns only two meshes and releases per-mount resources once across repeated fallback mounts', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const canvas = document.createElement('canvas');
    const renderer = {
      render: vi.fn(),
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      domElement: canvas,
    } as unknown as THREE.WebGLRenderer;
    const root = createRoot(canvas);
    await root.configure({
      gl: renderer,
      frameloop: 'never',
      size: { width: 1, height: 1, top: 0, left: 0 },
    });
    let oldGeometry: THREE.BufferGeometry | undefined;
    try {
      for (let pass = 0; pass < 2; pass += 1) {
        let store: ReturnType<typeof root.render>;
        await act(async () => {
          store = root.render(<WasteBinFallback />);
        });
        const meshes = store!.getState().scene.children[0].children as THREE.Mesh[];
        expect(meshes).toHaveLength(2);
        if (oldGeometry) expect(meshes[0].geometry).not.toBe(oldGeometry);
        oldGeometry = meshes[0].geometry;
        expect(meshes[0].position.toArray()).toEqual([0, 0.4, 0]);
        expect(meshes[1].position.toArray()).toEqual([0, 0.82, 0]);
        expect(meshes[1].rotation.x).toBe(Math.PI / 2);
        const materials = meshes.map((m) => m.material as THREE.MeshStandardMaterial);
        expect(materials.map((m) => m.color.getHexString())).toEqual(['374151', '1f2937']);
        expect(materials.map((m) => m.roughness)).toEqual([0.6, 0.5]);
        expect(materials.map((m) => m.metalness)).toEqual([0.3, 0.4]);
        for (const m of materials) expect(m.map).toBeNull();
        const disposals = [
          ...meshes.map((m) => vi.spyOn(m.geometry, 'dispose')),
          ...materials.map((m) => vi.spyOn(m, 'dispose')),
        ];
        await act(async () => {
          root.render(null);
        });
        for (const d of disposals) expect(d).toHaveBeenCalledOnce();
      }
      expect(renderer.render).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
