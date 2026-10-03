// @vitest-environment node
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
// @ts-expect-error Decoder dependency has no published TypeScript declarations.
import draco from 'draco3dgltf';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMUNITY_GEOMETRY } from './CommunityDetails';
import { COMMUNITY_ANCHORS as A } from '../../constants/communityLayout';

function heightAt(geometry: THREE.BufferGeometry, x: number, z: number) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hit = new THREE.Raycaster(
    new THREE.Vector3(x, 4, z),
    new THREE.Vector3(0, -1, 0)
  ).intersectObject(mesh)[0];
  mesh.material.dispose();
  return hit?.point.y;
}

describe('authored community details', () => {
  it('contains finite, compact merged geometry, with normals and authored linear vertex colours', () => {
    for (const geometry of Object.values(COMMUNITY_GEOMETRY)) {
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(geometry.getAttribute('position').count).toBeLessThan(12000);
      for (const name of ['position', 'normal', 'color']) {
        const attribute = geometry.getAttribute(name);
        expect(attribute.count).toBe(geometry.getAttribute('position').count);
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
    }
  });
  it('uses the delivered shelter seat top rather than the lower primitive fallback', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco.createDecoderModule(),
    });
    const document = await io.read('public/models/world/bus-shelter.glb');
    const group = new THREE.Group();
    for (const node of document.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const geometry = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
        );
        const indices = primitive.getIndices();
        if (indices) geometry.setIndex(new THREE.BufferAttribute(indices.getArray()!, 1));
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
        );
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        group.add(mesh);
      }
    group.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 1, -0.55),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(group, true);
    expect(hits[0]?.point.y).toBeCloseTo(A.busSeat.seatHeight!, 5);
    group.children.forEach((object) => {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  });
  it('physically seats four mill residents at the promised .46m top', () => {
    for (const anchor of [A.millRestNorth, A.millRestSouth])
      for (const offset of [-0.45, 0.45])
        expect(
          heightAt(COMMUNITY_GEOMETRY.mill, anchor.position[0], anchor.position[2] + offset)
        ).toBeCloseTo(anchor.seatHeight!, 5);
  });
  it('physically seats pub patrons separately from their tables', () => {
    for (const anchor of [A.pubSeatNorth, A.pubSeatSouth]) {
      expect(
        heightAt(COMMUNITY_GEOMETRY.village, anchor.position[0], anchor.position[2])
      ).toBeCloseTo(anchor.seatHeight!, 5);
      expect(
        heightAt(COMMUNITY_GEOMETRY.village, anchor.position[0] + 1.1, anchor.position[2])
      ).toBeCloseTo(0.825, 5);
    }
  });
  it('has the bread above the physical display, not a floating storefront', () => {
    const [x, , z] = A.bakeryCounter.position;
    expect(heightAt(COMMUNITY_GEOMETRY.village, x, z)).toBeCloseTo(0.825, 5);
    expect(COMMUNITY_GEOMETRY.bread.boundingBox!.min.y).toBeGreaterThanOrEqual(0.825 - 1e-6);
  });
  it('keeps live visibility outside the static batch and ties stock to explicit event props', () => {
    const source = readFileSync('src/components/scenery/CommunityDetails.tsx', 'utf8');
    expect(source).toContain('visible={shopsOpen && bakeryStocked}');
    expect(source).toContain('bakeryStocked = false');
    expect(source).toContain('visible={deliveryVisible}');
    expect(source).toContain('name="community-open-hours" userData={{ noStaticBatch: true }}');
    expect(source).not.toMatch(/<(?:pointLight|spotLight|directionalLight)/);
    expect(source).toContain('surface="painted"');
  });
});
