import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_LAYOUT, getLandmarkBounds } from '../../constants/siteLayout';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { MOUNTAIN_RIDGE_GEOMETRIES } from '../environment/OptimizedSkySystem';
import * as THREE from 'three';
import {
  createRoadTunnelHillGeometry,
  ROAD_TUNNEL_BORE,
  ROAD_TUNNEL_EARTH_MATERIAL,
  ROAD_TUNNEL_ROAD_MATERIAL,
  ROAD_TUNNEL_TAIL,
  ROAD_TUNNEL_TREES,
  createVictorianTunnelPortalGeometry,
  createVictorianTunnelSideGeometry,
} from './Tunnel';

describe('Victorian tunnel portal', () => {
  it('keeps both masonry faces open to the same curved passage', () => {
    for (const geometry of [
      createVictorianTunnelPortalGeometry(),
      createVictorianTunnelPortalGeometry(11, 7, 1),
    ]) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      const hit = (x: number, y: number) =>
        new THREE.Raycaster(
          new THREE.Vector3(x, y, 3),
          new THREE.Vector3(0, 0, -1)
        ).intersectObject(mesh).length;
      expect(hit(0, 6.45)).toBe(0);
      expect(hit(3.9, 2)).toBe(0);
      expect(hit(0, 6.8)).toBeGreaterThan(0);
      expect(hit(4.1, 2)).toBeGreaterThan(0);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
      material.dispose();
    }
  });

  it('retains the front facade envelope and bounds the shared mesh cost', () => {
    const geometry = createVictorianTunnelPortalGeometry();
    expect(geometry.boundingBox?.min.toArray()).toEqual([-7, -1, expect.closeTo(-0.6)]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([7, 9, expect.closeTo(0.6)]);
    expect(geometry.getAttribute('position').count / 3).toBeLessThan(160);
    geometry.dispose();
  });
});

describe('blocky road tunnel hill', () => {
  it('roots every oak on the real hill top, above the road bore', () => {
    const geometry = createRoadTunnelHillGeometry();
    const hill = new THREE.Mesh(geometry, ROAD_TUNNEL_EARTH_MATERIAL);
    hill.updateMatrixWorld(true);
    expect(ROAD_TUNNEL_TREES).toHaveLength(13);
    for (const {
      position: [x, y, z],
    } of ROAD_TUNNEL_TREES) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 40, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(hill)[0];
      expect(hit.point.y - y).toBeCloseTo(0.015);
      expect(y).toBeGreaterThan(ROAD_TUNNEL_BORE.height + 2);
      expect(z).toBeLessThan(-10);
    }
    geometry.dispose();
  });

  it('uses metre-scaled grass without changing the shared terrain samplers', () => {
    const material = ROAD_TUNNEL_EARTH_MATERIAL;
    expect(material.map!.repeat.toArray()).toEqual([1 / 8, 1 / 8]);
    expect(material.roughnessMap!.repeat.toArray()).toEqual([1 / 8, 1 / 8]);
    expect(material.map!.source).toBe(PROCEDURAL_TEXTURES.grassColor.source);
    expect(material.map).not.toBe(PROCEDURAL_TEXTURES.grassColor);
    expect(PROCEDURAL_TEXTURES.grassColor.repeat.toArray()).toEqual([20, 20]);
    expect(material.emissive.getHex()).toBe(0);
  });

  it('tiles the tunnel road at the approach road texel scale, not the shared 25x25', () => {
    const material = ROAD_TUNNEL_ROAD_MATERIAL;
    // 2.5 m across and 120/28 m along, as TruckBay's ROAD_TARMAC_MAP over 10 x 120 m.
    expect(material.map!.repeat.x).toBeCloseTo(4);
    expect(material.map!.repeat.y).toBeCloseTo(110 / (120 / 28));
    expect(material.roughnessMap!.repeat.toArray()).toEqual(material.map!.repeat.toArray());
    expect(material.map!.source).toBe(PROCEDURAL_TEXTURES.tarmacColor.source);
    expect(material.map).not.toBe(PROCEDURAL_TEXTURES.tarmacColor);
    expect(PROCEDURAL_TEXTURES.tarmacColor.repeat.toArray()).toEqual([25, 25]);
  });

  it('mounts both tunnels from the site layout in the continuous exterior, not the truck yard', () => {
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain('Object.values(SITE_LAYOUT.roadTunnels)');
    expect(readFileSync('src/components/TruckBay.tsx', 'utf8')).not.toMatch(/<RoadTunnel\b/);
    expect(Object.keys(SITE_LAYOUT.roadTunnels)).toEqual(['south', 'north']);
  });

  it('leaves the village and its camera clear of the northern hill', () => {
    const north = SITE_LAYOUT.roadTunnels.north;
    expect(north.rotation).toBe(0);
    const geometry = createRoadTunnelHillGeometry();
    const hill = geometry.boundingBox!.clone().translate(new THREE.Vector3(...north.position));
    const village = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
    expect(
      Math.max(
        hill.min.x - village.maxX,
        village.minX - hill.max.x,
        hill.min.z - village.maxZ,
        village.minZ - hill.max.z
      )
    ).toBeGreaterThan(2);
    const { position, target } = SITE_LAYOUT.cameras.village;
    const camera = new THREE.Vector3(...position);
    const aim = new THREE.Vector3(...target);
    for (let i = 0; i <= 20; i++) {
      const point = camera.clone().lerp(aim, i / 20);
      const dx = Math.max(hill.min.x - point.x, point.x - hill.max.x, 0);
      const dz = Math.max(hill.min.z - point.z, point.z - hill.max.z, 0);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(2);
    }
    geometry.dispose();
  });

  it('builds a finite, bounded blocky envelope whose face is flush with the portal', () => {
    const geometry = createRoadTunnelHillGeometry(90);
    const box = geometry.boundingBox!;
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    expect(box.max.z).toBeCloseTo(0);
    expect(box.min.z).toBeCloseTo(-90 - ROAD_TUNNEL_TAIL.length);
    expect(box.max.y).toBeCloseTo(15);
    expect(box.max.x).toBeLessThan(22);
    expect(box.min.x).toBeGreaterThan(-22);
    // Two skirts, two cores and the top block (five boxes), plus the tail's
    // seven outline quads and eight-triangle rear cap: one draw.
    expect(geometry.index!.count / 3).toBe(60 + 14 + 8);
    // The skirts reach below grade, so the hill never floats.
    expect(box.min.y).toBeLessThan(-0.3);
    geometry.dispose();
  });

  it('runs the tail into the foothills instead of ending in open meadow', () => {
    const geometry = createRoadTunnelHillGeometry(90);
    const tunnelHill = new THREE.Mesh(geometry, ROAD_TUNNEL_EARTH_MATERIAL);
    const foothillMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const foothills = MOUNTAIN_RIDGE_GEOMETRIES.slice(1).map(
      (ridge) => new THREE.Mesh(ridge, foothillMaterial)
    );
    const down = new THREE.Vector3(0, -1, 0);
    const end = 90 + ROAD_TUNNEL_TAIL.length;
    for (const tunnel of Object.values(SITE_LAYOUT.roadTunnels)) {
      tunnelHill.position.set(...tunnel.position);
      tunnelHill.rotation.set(0, tunnel.rotation, 0);
      tunnelHill.updateMatrixWorld(true);
      const world = (x: number, z: number) =>
        new THREE.Vector3(x, 0, z).applyMatrix4(tunnelHill.matrixWorld).setY(200);
      const groundAt = (x: number, z: number) =>
        Math.max(
          ...foothills.map(
            (ridge) =>
              new THREE.Raycaster(world(x, z), down).intersectObject(ridge)[0]?.point.y ?? -Infinity
          )
        );
      const hillTopAt = (x: number, z: number) =>
        new THREE.Raycaster(world(x, z), down).intersectObject(tunnelHill)[0]?.point.y;
      // The outward-wound top is hit from above along the whole spur.
      for (let depth = 91; depth < end; depth += 4)
        expect(hillTopAt(0, -depth), `${tunnel.id} ${depth}`).toBeGreaterThan(0);
      // The last quarter of the tail, rear cap included, is inside the foothills.
      for (let depth = end - ROAD_TUNNEL_TAIL.length / 4; depth <= end; depth += 3)
        for (const x of [-12, 0, 12]) {
          const top = hillTopAt(x * (depth / end), -depth + 0.05);
          if (top === undefined) continue;
          expect(
            groundAt(x * (depth / end), -depth),
            `${tunnel.id} ${x}, ${depth}`
          ).toBeGreaterThan(top + 0.5);
        }
      // ...and it genuinely meets them: the front of the tail stands clear.
      expect(hillTopAt(0, -95)!).toBeGreaterThan(groundAt(0, -95) + 5);
    }
    geometry.dispose();
    foothillMaterial.dispose();
  });

  it('keeps the whole road bore clear of the hill along its length', () => {
    const geometry = createRoadTunnelHillGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    const { halfWidth, height } = ROAD_TUNNEL_BORE;
    for (const [x, y] of [
      [-halfWidth + 0.1, 0.1],
      [halfWidth - 0.1, 0.1],
      [-halfWidth + 0.1, height - 0.1],
      [halfWidth - 0.1, height - 0.1],
      [0, height - 0.1],
    ]) {
      // The bore stops at 90 m; the buried tail beyond it is solid by design.
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y, 20),
        new THREE.Vector3(0, 0, -1),
        0,
        20 + 90
      );
      expect(ray.intersectObject(mesh), `${x}, ${y}`).toHaveLength(0);
    }
    geometry.dispose();
    material.dispose();
  });
});

it('carries the Victorian vault to ground while keeping the road passage clear', () => {
  const geometry = createVictorianTunnelSideGeometry(15);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(4);
  ray.set(new THREE.Vector3(0, 1, 10), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  expect(geometry.boundingBox?.min.y).toBeCloseTo(-0.02);
  expect(geometry.boundingBox?.max.y).toBeCloseTo(2.5);
  expect(geometry.index!.count / 3).toBe(24);
  geometry.dispose();
  material.dispose();
});
