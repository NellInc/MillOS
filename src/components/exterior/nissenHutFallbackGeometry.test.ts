import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNissenHutFallbackGeometries } from './nissenHutFallbackGeometry';

function originalExtrusion(length: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-2.5, 0);
  shape.absarc(0, 0, 2.5, Math.PI, 0, true);
  shape.lineTo(-2.5, 0);
  return new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: length,
    bevelEnabled: false,
  }).translate(0, 0, -length / 2);
}

describe.each([10, 14])('Nissen fallback length %s', (length) => {
  it('retains every existing shell/cap attribute and shared boundary exactly', () => {
    const original = originalExtrusion(length);
    const { shell, caps } = createNissenHutFallbackGeometries(length);
    for (const [geometry, index] of [
      [shell, 1],
      [caps, 0],
    ] as const) {
      const group = original.groups.find((g) => g.materialIndex === index)!;
      for (const [name, attribute] of Object.entries(original.attributes)) {
        expect(Array.from(geometry.attributes[name].array)).toEqual(
          Array.from(
            attribute.array.slice(
              group.start * attribute.itemSize,
              (group.start + group.count) * attribute.itemSize
            )
          )
        );
      }
      expect(geometry.boundingBox!.min.toArray()).toEqual([-2.5, 0, -length / 2]);
      expect(geometry.boundingBox!.max.toArray()).toEqual([2.5, 2.5, length / 2]);
      expect(geometry.groups).toHaveLength(0);
    }
    expect(shell.attributes.position.count / 3).toBe(50);
    expect(caps.attributes.position.count / 3).toBe(46);
    original.dispose();
    shell.dispose();
    caps.dispose();
  });

  it('reproduces the old duplicate end hits and reduces each end to one surface', () => {
    // DoubleSide here is only the ray-query instrument, matching the old code;
    // the production fallback uses correctly wound FrontSide materials.
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const oldGeometry = originalExtrusion(length);
    const circles = [-1, 1].map((side) =>
      new THREE.CircleGeometry(2.5, 16, 0, Math.PI)
        .rotateY(side < 0 ? Math.PI : 0)
        .translate(0, 0, (side * length) / 2)
    );
    const { shell, caps } = createNissenHutFallbackGeometries(length);
    const oldMeshes = [oldGeometry, ...circles].map((g) => new THREE.Mesh(g, material));
    const newMeshes = [shell, caps].map((g) => new THREE.Mesh(g, material));
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0.31, 1.27, side * (length / 2 + 1)),
        new THREE.Vector3(0, 0, -side)
      );
      const endHits = (meshes: THREE.Mesh[]) =>
        ray.intersectObjects(meshes, false).filter((hit) => Math.abs(hit.distance - 1) < 1e-6);
      expect(endHits(oldMeshes)).toHaveLength(2);
      expect(endHits(newMeshes)).toHaveLength(1);
    }
    material.dispose();
    oldGeometry.dispose();
    circles.forEach((g) => g.dispose());
    shell.dispose();
    caps.dispose();
  });

  it('is watertight with outward cap and shell winding after welding coincident vertices', () => {
    const geometries = createNissenHutFallbackGeometries(length);
    const edges = new Map<string, number>();
    const key = (v: THREE.Vector3) =>
      v
        .toArray()
        .map((value) => Math.round(value * 1e6))
        .join(',');
    for (const [name, geometry] of Object.entries(geometries)) {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k));
        const n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
        // Existing Shape closure includes a roundoff-area triangle at the base.
        if (n.lengthSq() < 1e-18) continue;
        n.normalize();
        const stored = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i);
        expect(n.dot(stored)).toBeGreaterThan(0.99999);
        const center = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
        if (name === 'caps') expect(n.z * Math.sign(center.z)).toBeGreaterThan(0.99999);
        else if (center.y < 1e-6) expect(n.y).toBeCloseTo(-1);
        else expect(n.dot(new THREE.Vector3(center.x, center.y, 0))).toBeGreaterThan(0);
        for (let j = 0; j < 3; j++) {
          const edge = [key(v[j]), key(v[(j + 1) % 3])].sort().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  });
});

it.each([0, -1, NaN, Infinity, -Infinity])(
  'rejects invalid fallback length %s before creating geometry',
  (length) => {
    expect(() => createNissenHutFallbackGeometries(length)).toThrow('finite and positive');
  }
);
