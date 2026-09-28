import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { restoreGeometryOrigin } from '../../components/models/GeneratedGeometrySurface';
import {
  getFlourPalletGeometry,
  getFlourSackGeometry,
  getFlourSackMaterial,
  PALLET_SACK_LAYOUT,
  PALLET_PRINT_ALPHA_TEST,
  FLOUR_STRIPE_MATERIAL,
  FLOUR_SACK_HEIGHT,
  FLOUR_INK_STANDOFF,
  FLOUR_SACK_PRINT_GEOMETRY,
} from '../flourSacks';
import { hasWorldSurface } from '../worldSurface';

describe('shared carried flour', () => {
  it('restores the actual normalized delivery asset to the current authored corners', async () => {
    const document = await new NodeIO().read('public/models/world/flour-sack-unit.glb');
    const node = document
      .getRoot()
      .listNodes()
      .find((candidate) => candidate.getMesh())!;
    const primitive = node.getMesh()!.listPrimitives()[0];
    const delivered = new THREE.BufferGeometry();
    for (const [semantic, attribute] of [
      ['POSITION', 'position'],
      ['NORMAL', 'normal'],
      ['TEXCOORD_0', 'uv'],
    ]) {
      const accessor = primitive.getAttribute(semantic)!;
      delivered.setAttribute(
        attribute,
        new THREE.BufferAttribute(new Float32Array(accessor.getArray()!), accessor.getElementSize())
      );
    }
    delivered.setIndex(Array.from(primitive.getIndices()!.getArray()!));
    // This fixture exercises geometry restoration, without decoding texture pixels.
    const atlas = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ normalMap: atlas });
    const mesh = new THREE.Mesh(delivered, material);
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    const authored = getFlourSackGeometry();
    const restored = restoreGeometryOrigin(mesh, authored).geometry;
    try {
      expect(restored.getAttribute('uv1').count).toBe(252);
      const p = authored.getAttribute('position'),
        n = authored.getAttribute('normal');
      const key = (point: THREE.Vector3) =>
        point
          .toArray()
          .map((value) => value.toFixed(5))
          .join(',');
      const expected = new Map(
        Array.from({ length: p.count }, (_, i) => [
          key(new THREE.Vector3().fromBufferAttribute(p, i)),
          new THREE.Vector3().fromBufferAttribute(n, i),
        ])
      );
      const actual = restored.getAttribute('position'),
        normals = restored.getAttribute('normal');
      for (let i = 0; i < actual.count; i++) {
        const target = expected.get(key(new THREE.Vector3().fromBufferAttribute(actual, i)));
        expect(target).toBeDefined();
        expect(
          new THREE.Vector3().fromBufferAttribute(normals, i).distanceTo(target!)
        ).toBeLessThan(1e-5);
      }
    } finally {
      restored.dispose();
      delivered.dispose();
      material.dispose();
      atlas.dispose();
    }
  });
  it('keeps the atlas topology while rounding a flat, low sack', () => {
    const geometry = getFlourSackGeometry();
    geometry.computeBoundingBox();
    expect(geometry.index!.count / 3).toBe(84);
    expect(geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeCloseTo(0.3, 6);
    expect(FLOUR_SACK_HEIGHT).toBe(0.3);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const corners = new Map<string, THREE.Vector3>();
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      expect(n.length()).toBeCloseTo(1, 6);
      const key = p
        .toArray()
        .map((v) => v.toFixed(5))
        .join(',');
      if (corners.has(key)) expect(n.distanceTo(corners.get(key)!)).toBeLessThan(1e-6);
      corners.set(key, n);
    }
  });
  it('retains thin printed strokes at the third mip', () => {
    const data = (FLOUR_STRIPE_MATERIAL.map as THREE.DataTexture).image.data as Uint8Array;
    let total = 0;
    let retained = 0;
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 8) {
        let alpha = 0;
        for (let dy = 0; dy < 8; dy++)
          for (let dx = 0; dx < 8; dx++) alpha += data[((y + dy) * 128 + x + dx) * 4 + 3];
        alpha /= 64 * 255;
        total += alpha;
        if (alpha >= PALLET_PRINT_ALPHA_TEST) retained += alpha;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(retained / total).toBeGreaterThan(0.85);
  });
  it('reuses three finite geometry batches within the existing pallet footprint', () => {
    const geometry = getFlourPalletGeometry();
    expect(getFlourPalletGeometry()).toBe(geometry);
    let triangles = 0;
    for (const part of Object.values(geometry)) {
      const bounds = part.boundingBox!;
      expect(bounds.min.x).toBeGreaterThanOrEqual(-0.451);
      expect(bounds.max.x).toBeLessThanOrEqual(0.451);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-0.401);
      expect(bounds.max.z).toBeLessThanOrEqual(0.401);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.061);
      expect(bounds.max.y).toBeLessThan(1.15);
      expect(part.groups).toHaveLength(0);
      const position = part.getAttribute('position');
      const normal = part.getAttribute('normal');
      for (let i = 0; i < position.count; i++) {
        expect([position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)).toBe(
          true
        );
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
      }
      triangles += (part.index?.count ?? position.count) / 3;
    }
    expect(triangles).toBeLessThan(3000);
    expect(geometry.sacks.boundingBox!.min.y).toBeCloseTo(geometry.pallet.boundingBox!.max.y, 6);
  });

  it('stacks six touching layers without overlapping adjacent sacks or changing belt geometry', () => {
    const source = getFlourSackGeometry();
    source.computeBoundingBox();
    const original = source.boundingBox!.clone();
    const bounds = PALLET_SACK_LAYOUT.map(({ position, scale, rotationY }) => {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
        new THREE.Vector3(...scale)
      );
      return original.clone().applyMatrix4(transform);
    });
    expect(bounds).toHaveLength(12);
    for (let layer = 0; layer < 6; layer++) {
      const axis = layer % 2 === 1 ? 'z' : 'x';
      expect(bounds[layer * 2].max[axis]).toBeLessThan(bounds[layer * 2 + 1].min[axis]);
      expect(bounds[layer * 2 + 1].min[axis] - bounds[layer * 2].max[axis]).toBeLessThan(0.02);
      if (layer % 2 === 1) {
        // Each cross-course bridges both sacks below instead of repeating a
        // full-height vertical seam through the load.
        expect(bounds[layer * 2].min.x).toBeLessThan(bounds[(layer - 1) * 2].max.x);
        expect(bounds[layer * 2].max.x).toBeGreaterThan(bounds[(layer - 1) * 2 + 1].min.x);
      }
      if (layer > 0) expect(bounds[layer * 2].min.y).toBeCloseTo(bounds[(layer - 1) * 2].max.y, 6);
    }
    getFlourPalletGeometry();
    source.computeBoundingBox();
    expect(source.boundingBox!.equals(original)).toBe(true);
  });

  it('supports each cross-bonded sack on real cloth on both sides of the seam below', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = PALLET_SACK_LAYOUT.map(({ position, scale, rotationY }) => {
      const mesh = new THREE.Mesh(getFlourSackGeometry(), material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.y = rotationY;
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    try {
      for (let index = 2; index < meshes.length; index++) {
        const layer = Math.floor(index / 2);
        const bag = PALLET_SACK_LAYOUT[index];
        const bottom = bag.position[1] - (FLOUR_SACK_HEIGHT * bag.scale[1]) / 2;
        const supporting = meshes.slice((layer - 1) * 2, layer * 2);
        for (const side of [-1, 1]) {
          const x = bag.position[0] + (bag.rotationY ? side * 0.17 : 0);
          const z = bag.position[2] + (bag.rotationY ? 0 : side * 0.17);
          const underneath = new THREE.Raycaster(
            new THREE.Vector3(x, bottom - 0.01, z),
            new THREE.Vector3(0, 1, 0)
          ).intersectObject(meshes[index])[0];
          const support = new THREE.Raycaster(
            new THREE.Vector3(x, bottom + 0.01, z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObjects(supporting)[0];
          expect(underneath).toBeDefined();
          expect(support).toBeDefined();
          expect(underneath.point.y).toBeCloseTo(bottom, 5);
          expect(support.point.y).toBeCloseTo(underneath.point.y, 5);
        }
      }
    } finally {
      material.dispose();
    }
  });

  it('keeps every top and side printed corner seated on its own real sack', () => {
    const geometry = getFlourPalletGeometry();
    const material = new THREE.MeshBasicMaterial();
    const sacks = new THREE.Mesh(geometry.sacks, material);
    const corners = geometry.ink.getAttribute('position');
    const normals = geometry.ink.getAttribute('normal');
    const printDirections = new Set<string>();
    try {
      for (let i = 0; i < corners.count; i++) {
        const corner = new THREE.Vector3().fromBufferAttribute(corners, i);
        const normal = new THREE.Vector3().fromBufferAttribute(normals, i).normalize();
        // Side ink was projected along a face axis. The smoothed fold normal
        // is a lighting vector and crosses that one-millimetre gap diagonally.
        const dominantAxis = normal
          .toArray()
          .map(Math.abs)
          .indexOf(Math.max(...normal.toArray().map(Math.abs)));
        const inward = new THREE.Vector3().setComponent(
          dominantAxis,
          -Math.sign(normal.getComponent(dominantAxis))
        );
        const hits = new THREE.Raycaster(corner, inward).intersectObject(sacks);
        expect(hits.length).toBeGreaterThan(0);
        const bag =
          PALLET_SACK_LAYOUT[
            Math.floor(i / FLOUR_SACK_PRINT_GEOMETRY.getAttribute('position').count)
          ];
        const localAxis = bag.rotationY && dominantAxis !== 1 ? 2 - dominantAxis : dominantAxis;
        expect(hits[0].distance).toBeCloseTo(FLOUR_INK_STANDOFF * bag.scale[localAxis], 5);
        printDirections.add(`${dominantAxis}:${Math.sign(normal.getComponent(dominantAxis))}`);
      }
      expect(printDirections.size).toBe(5);
    } finally {
      material.dispose();
    }
  });

  it('leaves two continuous fork-entry channels beneath the deck', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const timber = new THREE.Mesh(getFlourPalletGeometry().pallet, material);
    try {
      for (const side of [-1, 1]) {
        for (const x of [0.075, 0.17, 0.265]) {
          for (const y of [-0.025, 0, 0.015]) {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(side * x, y, -1),
              new THREE.Vector3(0, 0, 1)
            );
            expect(ray.intersectObject(timber)).toHaveLength(0);
          }
        }
        // The same channel has a real deck overhead and a runner beneath it.
        for (const direction of [-1, 1]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(side * 0.17, 0, 0),
            new THREE.Vector3(0, direction, 0)
          );
          const hit = ray.intersectObject(timber)[0];
          expect(hit).toBeDefined();
          expect(hit.point.y).toBeCloseTo(direction > 0 ? 0.025 : -0.035, 6);
        }
      }
    } finally {
      material.dispose();
    }
  });

  it('shares the textured, lit cloth treatment with the conveyor', () => {
    const material = getFlourSackMaterial();
    expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(material.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(material.metalness).toBe(0);
    expect(material.emissive.getHex()).toBe(0);
    expect(hasWorldSurface(material)).toBe(true);
  });
});
