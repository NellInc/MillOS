import React from 'react';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DOCK_BOARD,
  SpillKit,
  LOADED_PALLET_HEIGHT,
  PALLET_HEIGHT,
  STRETCH_FILM_GEOMETRY,
  STRETCH_FILM_MATERIAL,
} from './LoadingProps';

/**
 * logistics-close (med-06, med-12) read the wrapped loads as sacks inside a
 * ghosted glass box: one closed, 42%-opaque shell over the whole load, with a
 * flat lid across the top course and a hard outline down every corner.
 */
describe('stretch film on a flour load', () => {
  const positions = STRETCH_FILM_GEOMETRY.getAttribute('position');
  const ys = Array.from({ length: positions.count }, (_, i) => positions.getY(i));

  it('has no lid: every face of the film is a side wall', () => {
    const geometry = STRETCH_FILM_GEOMETRY.index
      ? STRETCH_FILM_GEOMETRY.toNonIndexed()
      : STRETCH_FILM_GEOMETRY;
    const p = geometry.getAttribute('position');
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const normal = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      normal.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      expect(Math.abs(normal.y), `face ${i / 3}`).toBeLessThan(0.2);
    }
  });

  /**
   * Round 4 cut it to two bands with the middle courses bare, and shipping
   * med-12 then read the loads as unwrapped. It is one sleeve from the pallet
   * deck to over the top course, denser where the wrap doubles.
   */
  it('wraps the whole load from its pallet to over its top course, one sleeve', () => {
    expect(Math.min(...ys)).toBeLessThanOrEqual(PALLET_HEIGHT);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(LOADED_PALLET_HEIGHT - 0.02);
    const alpha = STRETCH_FILM_GEOMETRY.getAttribute('color');
    expect(alpha?.itemSize).toBe(4);
    // Every height up the load has film on it.
    for (let y = PALLET_HEIGHT; y <= LOADED_PALLET_HEIGHT; y += 0.05) {
      let covered = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const v = [0, 1, 2].map((k) => ys[i + k]);
        if (Math.min(...v) <= y && Math.max(...v) >= y) covered += 1;
      }
      expect(covered, `film at y ${y.toFixed(2)}`).toBeGreaterThan(8);
    }
    // Denser at the bands than up the middle, and never thin enough to vanish.
    const middle = (PALLET_HEIGHT + LOADED_PALLET_HEIGHT) / 2;
    const alphaAt = (y: number) => {
      let best = { d: Infinity, a: 0 };
      for (let i = 0; i < positions.count; i += 1) {
        const d = Math.abs(ys[i] - y);
        if (d < best.d) best = { d, a: alpha.getW(i) };
      }
      return best.a;
    };
    expect(alphaAt(middle)).toBeGreaterThanOrEqual(0.2);
    expect(alphaAt(PALLET_HEIGHT)).toBeGreaterThan(alphaAt(middle));
    expect(alphaAt(LOADED_PALLET_HEIGHT)).toBeGreaterThan(alphaAt(middle));
    expect(alphaAt(LOADED_PALLET_HEIGHT)).toBeLessThanOrEqual(0.42);
  });

  it('is a thin glossy sheen, not a milky shell, with no doubled edge', () => {
    expect(STRETCH_FILM_MATERIAL.vertexColors).toBe(true);
    expect(STRETCH_FILM_MATERIAL.opacity).toBe(1);
    expect(STRETCH_FILM_MATERIAL.roughness).toBeLessThanOrEqual(0.25);
    expect(STRETCH_FILM_MATERIAL.depthWrite).toBe(false);
    expect(STRETCH_FILM_MATERIAL.side).toBe(THREE.FrontSide);
  });
});

/**
 * The blank grey panel leaning on the pallet stack in logistics-close (med-06)
 * is the spare dock board: a plain 1.5 x 1.0 m aluminium slab with nothing on
 * the face the camera sees.
 */
describe('spare dock board', () => {
  it('carries traction cleats across its deck and painted curbs along both edges', () => {
    const { width, length, thickness, cleats, curb } = DOCK_BOARD;
    expect(cleats.length).toBeGreaterThanOrEqual(6);
    for (const z of cleats) {
      expect(z).toBeGreaterThan(0.1);
      expect(z).toBeLessThan(length - 0.05);
    }
    // Cleat pitch stays above ~6 px at the 14 m logistics-close distance (124 px/m).
    for (let i = 1; i < cleats.length; i += 1)
      expect(cleats[i] - cleats[i - 1]).toBeGreaterThanOrEqual(0.08);
    // Curbs stand on the deck's two long edges, inside its width.
    expect(curb.x + curb.width / 2).toBeLessThanOrEqual(width / 2);
    expect(curb.x - curb.width / 2).toBeGreaterThan(width / 2 - 0.12);
    expect(curb.height).toBeGreaterThan(thickness);
  });
});

function actualSpillKit() {
  const root = new THREE.Group();
  const visit = (value: React.ReactNode, parent: THREE.Object3D) => {
    React.Children.forEach(value, (child) => {
      if (!React.isValidElement(child)) return;
      const p = child.props as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material;
        position?: [number, number, number];
        rotation?: [number, number, number];
        scale?: number;
        children?: React.ReactNode;
      };
      const object = p.geometry ? new THREE.Mesh(p.geometry, p.material) : new THREE.Group();
      if (p.position) object.position.fromArray(p.position);
      if (p.rotation) object.rotation.fromArray(p.rotation);
      if (typeof p.scale === 'number') object.scale.setScalar(p.scale);
      parent.add(object);
      visit(p.children, object);
    });
  };
  visit(SpillKit({ position: [0, 0, 0] }) as React.ReactNode, root);
  root.updateMatrixWorld(true);
  return root.children[0] as THREE.Group;
}

it('forms a seated closed spill kit with real lift and rear pull openings, preserving shared owners and wheels', () => {
  const first = actualSpillKit(),
    second = actualSpillKit();
  const meshes = first.children as THREE.Mesh[];
  expect(meshes).toHaveLength(4);
  expect(new Set(meshes.map((m) => m.material)).size).toBe(3);
  meshes.forEach((m, i) => {
    expect(m.geometry).toBe((second.children[i] as THREE.Mesh).geometry);
    expect(m.material).toBe((second.children[i] as THREE.Mesh).material);
  });
  const cast = (
    object: THREE.Object3D,
    origin: [number, number, number],
    direction: [number, number, number],
    far = 2
  ) =>
    new THREE.Raycaster(
      new THREE.Vector3(...origin),
      new THREE.Vector3(...direction),
      0,
      far
    ).intersectObject(object, true)[0];
  const body = meshes[0],
    lid = meshes[1];
  // The raised lift loop crosses the lid centre while its opening remains air.
  expect(cast(lid, [0, 1.1, 0], [0, -1, 0]).point.y).toBeCloseTo(0.975, 5);
  expect(cast(lid, [0, 0.95, -0.5], [0, 0, 1], 1)).toBeUndefined();
  // Pull loop has a through opening and finger clearance ahead of its grip.
  expect(cast(body, [0, 0.78, -0.5], [0, 0, 1], 0.22)).toBeUndefined();
  expect(cast(body, [0, 0.84, -0.5], [0, 0, 1], 0.22)).toBeDefined();
  // Loop feet penetrate both upright and recessed shoulder, with no gap.
  for (const x of [-0.125, 0.125]) {
    expect(cast(body, [x, 0.69, -0.345], [0, 1, 0]).point.y).toBeCloseTo(0.7, 5);
    expect(cast(body, [x, 0.715, -0.2], [0, 0, -1]).point.z).toBeCloseTo(-0.22, 5);
  }
  const rear = cast(body, [0, 0.78, -0.5], [0, 0, 1]);
  expect(rear.point.z).toBeGreaterThan(-0.26);
  const bounds = new THREE.Box3().setFromObject(first);
  expect(bounds.max.y).toBeCloseTo(0.975, 5);
  expect(bounds.min.y).toBe(new THREE.Box3().setFromObject(meshes[2]).min.y);
  expect(
    Math.max(
      Math.abs(bounds.min.x),
      Math.abs(bounds.max.x),
      Math.abs(bounds.min.z),
      Math.abs(bounds.max.z)
    )
  ).toBeLessThanOrEqual(0.4);
  for (const x of [-0.2, 0.2])
    expect(meshes.find((m) => m.position.x === x)!.position.toArray()).toEqual([x, 0.06, -0.3]);
  const triangles = meshes.reduce(
    (n, m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3,
    0
  );
  expect(triangles - 256).toBeLessThanOrEqual(500);
  expect(triangles).toBeGreaterThan(256);
  for (const m of meshes) {
    const positions = m.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(m.matrixWorld);
      // Replacement buffers obey the .4m radius. Existing wheel poses instead
      // obey the published square footprint and stay byte-for-byte unchanged.
      if (m === body || m === lid) expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(0.4);
    }
    for (const a of Object.values(m.geometry.attributes))
      expect([...a.array].every(Number.isFinite)).toBe(true);
    const normals = m.geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++)
      expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 4);
  }
  // Closed lid seats into the retained top rim, without an open container throat.
  expect(cast(body, [0.2, 1, 0], [0, -1, 0]).point.y).toBeCloseTo(0.92, 5);
  expect(cast(lid, [0.2, 0.9, 0], [0, 1, 0]).point.y).toBeLessThan(0.921);
});
