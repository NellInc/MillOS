// @vitest-environment node
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
// @ts-expect-error Decoder dependency has no published TypeScript declarations.
import draco from 'draco3dgltf';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMUNITY_GEOMETRY } from './CommunityDetails';
import { getBakeryBoardDetail, COMMUNITY_ANCHORS as A } from '../../constants/communityLayout';
import {
  BUS_SHELTER_SITE,
  BUS_SHELTER_SOLIDS,
  BUS_SHELTER_LIGHT,
  busShelterWalkingHeight,
} from '../../constants/publicRealmLayout';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';

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
  it('leaves the measured canal moorings to the public realm, without floating legacy cleats', () => {
    expect(COMMUNITY_GEOMETRY).not.toHaveProperty('mooring');
  });
  it('uses the delivered shelter floor, seat top and roof luminaire', async () => {
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
    // These rays inspect the retained delivered mesh, not a copied box table.
    for (const [id, origin, direction, axis, edge] of [
      ['bench', [0, 0.49, 0.6], [0, 0, -1], 'z', 'maxZ'],
      ['bench', [0, 0.972, -1.2], [0, 0, 1], 'z', 'minZ'],
      ['cabinet-1', [0, 1.4, 0], [1, 0, 0], 'x', 'minX'],
      ['post-1-1', [1.98, 1.49, 2], [0, 0, -1], 'z', 'maxZ'],
      ['roof', [0, 2.2, 0], [0, 1, 0], 'y', 'minY'],
    ] as const) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(...origin),
        new THREE.Vector3(...direction)
      ).intersectObject(group, true)[0];
      const solid = BUS_SHELTER_SOLIDS.find((b) => b.id === `bus-shelter-${id}`)!;
      expect(hit, id).toBeDefined();
      expect(Math.abs(hit.point[axis] - solid[edge]), id).toBeLessThan(
        id === 'roof' ? 0.06 : 0.015
      );
    }
    const lamp = BUS_SHELTER_SOLIDS.find((b) => b.id === 'bus-shelter-luminaire')!;
    for (const part of [BUS_SHELTER_LIGHT.housing, BUS_SHELTER_LIGHT.lens]) {
      expect(part.position[1] - part.size[1] / 2).toBeGreaterThanOrEqual(lamp.minY - 1e-8);
      expect(part.position[1] + part.size[1] / 2).toBeLessThanOrEqual(lamp.maxY + 1e-8);
    }
    const site = BUS_SHELTER_SITE;
    group.rotation.y = site.rotation;
    group.position.set(...site.position);
    group.updateMatrixWorld(true);
    for (const [x, z] of [
      [0.4, 0.55],
      [-2.19, 0],
      [2.19, 0],
      [0, -1.14],
      [0, 1.14],
      [2.18, 1.13],
    ]) {
      const origin = group.localToWorld(new THREE.Vector3(x, 0.35, z));
      const floor = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(
        group,
        true
      )[0];
      expect(floor).toBeDefined();
      for (const segments of [64, 128])
        expect(sampleWalkingGroundHeight(origin.x, origin.z, segments)).toBeCloseTo(
          floor.point.y,
          5
        );
    }
    for (const [x, z] of [
      [2.21, 0],
      [0, 1.16],
      [2.19, 1.14],
    ]) {
      const origin = group.localToWorld(new THREE.Vector3(x, 0.35, z));
      expect(
        new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(group, true)
      ).toHaveLength(0);
      expect(busShelterWalkingHeight(origin.x, origin.z)).toBeNull();
    }
    group.position.set(0, 0, 0);
    group.rotation.y = 0;
    group.updateMatrixWorld(true);
    const fixture = BUS_SHELTER_LIGHT;
    const top = fixture.housing.position[1] + fixture.housing.size[1] / 2;
    for (const x of [-fixture.housing.size[0] * 0.46, 0, fixture.housing.size[0] * 0.46]) {
      const roof = new THREE.Raycaster(
        new THREE.Vector3(x, 2.2, fixture.housing.position[2]),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(group, true)[0];
      expect(roof).toBeDefined();
      expect(top).toBeGreaterThan(roof.point.y);
      expect(top - roof.point.y).toBeLessThan(0.04);
    }
    const housingBottom = fixture.housing.position[1] - fixture.housing.size[1] / 2;
    expect(fixture.lens.position[1] + fixture.lens.size[1] / 2).toBeGreaterThan(housingBottom);
    expect(fixture.lens.position[1] - fixture.lens.size[1] / 2).toBeLessThan(housingBottom - 0.01);
    expect(fixture.downlight.position[1]).toBeLessThan(
      fixture.lens.position[1] - fixture.lens.size[1] / 2
    );

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
    expect(COMMUNITY_GEOMETRY.bread.boundingBox!.min.y).toBeCloseTo(0.825, 5);
    const local = COMMUNITY_GEOMETRY.bread
      .clone()
      .translate(-A.bakeryCounter.position[0], 0, -A.bakeryCounter.position[2])
      .rotateY(-A.bakeryCounter.rotation);
    local.computeBoundingBox();
    expect(local.boundingBox!.min.x).toBeGreaterThan(-0.525);
    expect(local.boundingBox!.max.x).toBeLessThan(0.525);
    expect(local.boundingBox!.min.z).toBeGreaterThan(-0.225);
    expect(local.boundingBox!.max.z).toBeLessThan(0.25);
    const dough = new THREE.Mesh(local, new THREE.MeshBasicMaterial());
    for (const [x, z] of [
      [-0.27, -0.12],
      [0.27, -0.12],
      [-0.36, 0.13],
      [0, 0.13],
      [0.36, 0.13],
    ]) {
      const base = new THREE.Raycaster(
        new THREE.Vector3(x, 0.8, z),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(dough)[0];
      expect(base?.point.y).toBeCloseTo(0.825, 5);
    }
    dough.material.dispose();
    local.dispose();
  });
  it('explains empty and stocked counters without overriding real opening hours', () => {
    expect(getBakeryBoardDetail(true, false)).toBe('Awaiting flour');
    expect(getBakeryBoardDetail(true, true)).toBe('Fresh bread');
    expect(getBakeryBoardDetail(false, false)).toBe('Opens 07:00');
    expect(getBakeryBoardDetail(false, true)).toBe('Opens 07:00');
  });
  it('keeps live visibility outside the static batch and ties stock to explicit event props', () => {
    const source = readFileSync('src/components/scenery/CommunityDetails.tsx', 'utf8');
    expect(source).toContain('visible={shopsOpen && bakeryStocked}');
    expect(source).toContain('bakeryStocked = false');
    expect(source).toContain('detail={getBakeryBoardDetail(shopsOpen, bakeryStocked)}');
    expect(source).toContain('visible={deliveryVisible}');
    expect(source).toContain('name="community-open-hours" userData={{ noStaticBatch: true }}');
    expect(source).not.toMatch(/<(?:pointLight|spotLight|directionalLight)/);
    expect(source).toContain('surface="painted"');
  });
});
