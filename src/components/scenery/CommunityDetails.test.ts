// @vitest-environment node
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
// @ts-expect-error Decoder dependency has no published TypeScript declarations.
import draco from 'draco3dgltf';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_GEOMETRY,
  addCommunityTimber,
  addPubTableLantern,
  PUB_TABLE_LANTERN,
  PUB_TABLE_LIGHTS,
  PUB_TABLE_GLASS_GEOMETRY,
  addCommunityCup,
  addCommunityWateringCan,
  communityDetailsFlags,
} from './CommunityDetails';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
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
  it('gives the actual allotment can an open vessel, curved spout and attached rose inside the old plot', () => {
    const b = new PlotGeometry();
    addCommunityWateringCan(b);
    const g = b.finish();
    expect(heightAt(g, 0, 0)).toBeCloseTo(0.05, 6); // inside floor, not a capped mouth
    expect(heightAt(g, 0.136, 0)).toBeGreaterThan(0.35); // rolled lip
    expect(g.boundingBox!.min.y).toBeCloseTo(0.02, 6);
    expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-0.325001);
    expect(g.boundingBox!.max.x).toBeLessThan(0.445);
    expect(g.boundingBox!.max.z).toBeLessThanOrEqual(0.190001);
    expect(g.boundingBox!.max.y).toBeLessThan(0.445);
    expect(g.getAttribute('position').count / 3).toBeLessThan(800);
    expect(heightAt(g, 0.25, 0)).toBeGreaterThan(0.2); // curved connected spout
    expect(heightAt(g, 0.402, 0)).toBeGreaterThan(0.38); // rose on its end
    g.dispose();
  });
  it('eases real timber edges inside the old board envelope with deterministic lit colour', () => {
    const a = new PlotGeometry(),
      b = new PlotGeometry();
    for (const builder of [a, b])
      addCommunityTimber(builder, [1.8, 0.08, 0.15], [0, 0.42, 0], true);
    const one = a.finish(),
      two = b.finish();
    expect(one.getAttribute('position').array).toEqual(two.getAttribute('position').array);
    expect(one.getAttribute('color').array).toEqual(two.getAttribute('color').array);
    expect(one.boundingBox!.min.toArray()).toEqual([
      expect.closeTo(-0.9, 5),
      expect.closeTo(0.38, 5),
      expect.closeTo(-0.075, 5),
    ]);
    expect(one.boundingBox!.max.y).toBeCloseTo(0.46, 6);
    expect(heightAt(one, 0, 0)).toBeCloseTo(0.46, 6);
    // A side-edge ray stays inside the eased footprint; the old box top was .46.
    expect(heightAt(one, 0.899, 0)).toBeCloseTo(0.456414, 5);
    expect(new Set(Array.from(one.getAttribute('color').array)).size).toBeGreaterThan(6);
    one.dispose();
    two.dispose();
  });

  it('retains the actual occupied mill and pub seat heights after the timber finish', () => {
    for (const [geometry, anchors] of [
      [COMMUNITY_GEOMETRY.mill, [A.millRestNorth, A.millRestSouth]],
      [COMMUNITY_GEOMETRY.village, [A.pubSeatNorth, A.pubSeatSouth]],
    ] as const)
      for (const anchor of anchors)
        expect(heightAt(geometry, anchor.position[0], anchor.position[2])).toBeCloseTo(
          anchor.seatHeight!,
          6
        );
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
    expect(getBakeryBoardDetail(true, false)).toBe('Needs mill flour');
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

it('shows garden soil moisture from actual rain/storm, never opening hours alone', () => {
  for (const hour of [0, 8, 12, 20, 23]) {
    for (const weather of ['clear', 'cloudy'] as const)
      expect(communityDetailsFlags(hour, weather) & 4).toBe(0);
    for (const weather of ['rain', 'storm'] as const)
      expect(communityDetailsFlags(hour, weather) & 4).toBe(4);
    expect(communityDetailsFlags(hour, 'clear') & 3).toBe(communityDetailsFlags(hour, 'rain') & 3);
  }
  const source = readFileSync('src/components/scenery/CommunityDetails.tsx', 'utf8');
  expect(source).toContain('communityDetailsFlags(s.gameTime, s.weather)');
  expect(source).toContain('name="allotment-weather-moist-bed"');
});

it('seats hollow table cups with a recessed drink, rather than a solid cylinder top', () => {
  const b = new PlotGeometry();
  addCommunityCup(b, 0, 0, '#e0d5b9');
  const g = b.finish();
  expect(g.boundingBox!.min.y).toBeCloseTo(0.825, 6);
  expect(heightAt(g, 0, 0)).toBeCloseTo(0.903, 6);
  expect(heightAt(g, 0.05, 0)).toBeGreaterThan(0.93);
  expect(g.boundingBox!.max.x).toBeLessThan(0.1);
  g.dispose();
});
it('gives actual bread a toasted crown and varied flour while preserving all five seated bases', () => {
  const bread = COMMUNITY_GEOMETRY.bread;
  const colours = bread.getAttribute('color');
  expect(new Set(Array.from(colours.array).map((x) => x.toFixed(5))).size).toBeGreaterThan(100);
  const anchor = A.bakeryCounter;
  const at = (x: number, z: number) =>
    new THREE.Vector3(x, 0, z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), anchor.rotation)
      .add(new THREE.Vector3(...anchor.position));
  for (const [x, z] of [
    [-0.27, -0.12],
    [0.27, -0.12],
    [-0.36, 0.13],
    [0, 0.13],
    [0.36, 0.13],
  ]) {
    const p = at(x, z);
    expect(heightAt(bread, p.x, p.z)).toBeGreaterThan(0.92);
  }
});

it('seats all delivery bottles directly on the crate floor at .42m', () => {
  const anchor = A.shopDelivery;
  const mesh = new THREE.Mesh(
    COMMUNITY_GEOMETRY.delivery,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    anchor.rotation
  );
  for (const x of [-0.17, 0, 0.17]) {
    const origin = new THREE.Vector3(x, 0.44, 0)
      .applyQuaternion(rotation)
      .add(new THREE.Vector3(...anchor.position));
    const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.03).intersectObject(
      mesh
    )[0];
    expect(hit.point.y).toBeCloseTo(0.42, 6);
  }
  mesh.material.dispose();
});

it('seats two bounded lanterns on the retained pub tables with clear face rays and separate mugs', () => {
  const b = new PlotGeometry();
  addPubTableLantern(b);
  const g = b.finish();
  expect(g.boundingBox!.min.y).toBeCloseTo(0.825, 6);
  expect(g.boundingBox!.max.y).toBeLessThan(1.15);
  expect(g.getAttribute('position').count / 3).toBe(208);
  const source = new THREE.Vector3(...PUB_TABLE_LANTERN.source);
  const towardFace = new THREE.Vector3(0, 1.08, 0).sub(source);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, material);
  expect(
    new THREE.Raycaster(
      source,
      towardFace.clone().normalize(),
      0,
      towardFace.length()
    ).intersectObject(mesh)
  ).toHaveLength(0);
  expect(g.boundingBox!.max.x).toBeLessThan(0.12 - 0.05);
  expect(g.boundingBox!.min.z).toBeGreaterThan(1.1 - 0.275);
  expect(g.boundingBox!.max.z).toBeLessThan(1.1 + 0.275);
  expect(PUB_TABLE_LIGHTS).toHaveLength(2);
  PUB_TABLE_LIGHTS.forEach((lamp, i) => {
    const anchor = [A.pubSeatNorth, A.pubSeatSouth][i];
    const local = new THREE.Vector3(...lamp.position)
      .sub(new THREE.Vector3(...anchor.position))
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -anchor.rotation);
    local.toArray().forEach((v, axis) => expect(v).toBeCloseTo(PUB_TABLE_LANTERN.source[axis], 8));
    expect(towardFace.length()).toBeLessThan(PUB_TABLE_LANTERN.distance / 2);
  });
  for (const attribute of Object.values(PUB_TABLE_GLASS_GEOMETRY.attributes))
    expect([...attribute.array].every(Number.isFinite)).toBe(true);
  expect(PUB_TABLE_GLASS_GEOMETRY.getAttribute('position').count / 3).toBe(160);
  const code = readFileSync('src/components/scenery/CommunityDetails.tsx', 'utf8');
  const lighting = code.slice(
    code.indexOf('function PubTableLanternLighting'),
    code.indexOf('function buildVillageDetails')
  );
  expect(lighting).toContain("s.graphics.quality !== 'low'");
  expect(lighting).toContain('!s.graphics.perfDebug.disablePunctualLights');
  expect(lighting).toContain('!s.graphics.perfDebug.disableLightingPolish');
  expect(lighting).toContain('material={EXTERIOR_LAMP_LENS_MATERIAL}');
  expect(lighting).not.toContain('useFrame');
  expect(lighting).not.toContain('castShadow');
  g.dispose();
  material.dispose();
});
