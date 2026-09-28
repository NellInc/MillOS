// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  COMMUNITY_BUS_LAYOUT as L,
  COMMUNITY_TRANSIT_GEOMETRY as G,
  communityDoorPositions,
  COMMUNITY_BICYCLE_LAYOUT as B,
  COMMUNITY_BICYCLE_GEOMETRY as BG,
  communityBicyclePedals,
} from './CommunityTransit';

function ray(
  geometry: THREE.BufferGeometry,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number]
) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hits = new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction)
  ).intersectObject(mesh);
  mesh.material.dispose();
  return hits;
}

describe('authored village transit geometry', () => {
  it('has finite merged parts within the small transit triangle budget', () => {
    let triangles = 0;
    for (const geometry of Object.values(G)) {
      for (const name of ['position', 'normal', 'color']) {
        expect(geometry.getAttribute(name).count).toBe(geometry.getAttribute('position').count);
        expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      }
      expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
      triangles += geometry.getAttribute('position').count / 3;
    }
    expect(triangles).toBeLessThan(5500);
  });
  it('fits the eight-metre bus envelope with a three-metre roof', () => {
    const size = G.bus.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(L.width, 5);
    expect(size.z).toBeGreaterThanOrEqual(L.length);
    expect(size.z).toBeLessThan(L.length + 0.04); // Small front/rear lamp faces.
    expect(G.bus.boundingBox!.max.y).toBeCloseTo(L.height, 5);
  });
  it('leaves a physical nearside doorway through the shell and glazing', () => {
    for (const height of [0.85, 1.2, 1.8, 2.4]) {
      for (const z of [1.9, 2.4, 2.9]) {
        const hits = ray(G.bus, [-2, height, z], [1, 0, 0]);
        expect(hits.every((h) => h.point.x >= 0)).toBe(true);
        const panes = ray(G.windows, [-2, height, z], [1, 0, 0]);
        expect(panes.every((h) => h.point.x >= 0)).toBe(true);
      }
    }
  });
  it('the physical sliding leaves close at the seam and clear the opening when open', () => {
    expect(communityDoorPositions(0)).toEqual([2.1, 2.7]);
    const [rear, front] = communityDoorPositions(1);
    expect(rear + G.door.boundingBox!.max.z).toBeLessThan(1.8);
    expect(front + G.door.boundingBox!.min.z).toBeGreaterThan(3);
    expect(communityDoorPositions(-1)).toEqual(communityDoorPositions(0));
    expect(communityDoorPositions(Infinity)).toEqual(communityDoorPositions(0));
    expect(communityDoorPositions(5)).toEqual(communityDoorPositions(1));
  });
  it('puts the rotated doorway beside the designated east boarding kerb', () => {
    const position = new THREE.Vector3(...L.doorway)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
      .add(new THREE.Vector3(23, 0, 140));
    expect(position.x).toBeCloseTo(24.1, 5);
    expect(position.z).toBeCloseTo(137.6, 5);
  });
  it('grounds both wheel sizes and keeps cart sacks above its timber deck', () => {
    expect(G.busWheel.boundingBox!.min.y + L.wheelRadius).toBeCloseTo(0, 5);
    expect(G.cartWheel.boundingBox!.min.y + 0.27).toBeCloseTo(0, 5);
    expect(G.sacks.boundingBox!.min.y).toBeGreaterThan(0.46);
    expect(G.sacks.boundingBox!.max.x).toBeLessThan(0.4);
    expect(G.sacks.boundingBox!.min.x).toBeGreaterThan(-0.4);
  });
  it('raises the cart grips to the standing courier palms', () => {
    for (const x of [-0.32, 0.32])
      expect(ray(G.cart, [x, 2, -1.2], [0, -1, 0])[0]?.point.y).toBeCloseTo(1.085, 5);
  });
  it('reads mutable poses in the render loop without introducing drivers or lights', () => {
    const source = readFileSync('src/components/scenery/CommunityTransit.tsx', 'utf8');
    expect(source).toContain('root.current.position.set(pose.x, 0, pose.z)');
    expect(source).toContain('load.current.visible = pose.loaded');
    expect(source).toContain('THREE.MathUtils.damp');
    expect(source).toContain('42 MILL &amp; VILLAGE');
    expect(source).not.toMatch(/<(?:pointLight|spotLight|directionalLight|WorkerModel)/);
    expect(source.match(/noStaticBatch: true/g)).toHaveLength(3);
  });
});

describe('upright village bicycle', () => {
  it('uses four compact finite merged parts and grounded spoked wheels', () => {
    let triangles = 0;
    for (const geometry of Object.values(BG)) {
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      triangles += geometry.getAttribute('position').count / 3;
    }
    expect(triangles).toBeLessThan(2500);
    expect(BG.wheel.boundingBox!.min.y + B.wheelRadius).toBeCloseTo(0, 5);
    expect(BG.wheel.boundingBox!.max.y).toBeCloseTo(0.34, 5);
  });
  it('physically meets the separately posed rider saddle and grip anchors', () => {
    expect(B.saddle).toEqual([0, 0.86, -0.1]);
    expect(ray(BG.frame, [0, 2, -0.1], [0, -1, 0])[0]?.point.y).toBeCloseTo(0.86, 5);
    for (const grip of B.grips) {
      expect(ray(BG.frame, [grip[0], 2, grip[2]], [0, -1, 0])[0]?.point.y).toBeCloseTo(
        grip[1] + 0.02,
        5
      );
    }
  });
  it('keeps both pedals opposite on the same .15m crank, above the ground', () => {
    for (const phase of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, 4.5]) {
      const [right, left] = communityBicyclePedals(phase);
      expect(right[0]).toBe(0.16);
      expect(left[0]).toBe(-0.16);
      expect((right[1] + left[1]) / 2).toBeCloseTo(B.pedalAxle[1], 6);
      expect((right[2] + left[2]) / 2).toBeCloseTo(B.pedalAxle[2], 6);
      expect(Math.hypot(right[1] - 0.36, right[2] - 0.04)).toBeCloseTo(B.crankRadius, 6);
      expect(Math.min(right[1], left[1]) + BG.pedal.boundingBox!.min.y).toBeGreaterThan(0.19);
    }
    expect(communityBicyclePedals(Infinity)).toEqual(communityBicyclePedals(0));
    expect(communityBicyclePedals(NaN)).toEqual(communityBicyclePedals(0));
  });
  it('uses the same phase for pedal targets and the actual rotating crank instances', () => {
    const source = readFileSync('src/components/scenery/CommunityTransit.tsx', 'utf8');
    expect(source).toContain('const targets = communityBicyclePedals(phase)');
    expect(source).toContain('phase + index * Math.PI');
    expect(source).toContain('name="community-upright-bicycle"');
  });
});
