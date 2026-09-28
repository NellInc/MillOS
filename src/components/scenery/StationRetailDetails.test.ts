import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RETAIL_GEOMETRY,
  RETAIL_PRODUCTS,
  RETAIL_LIGHT,
  createRetailBottleGeometry,
  createRetailPacketGeometry,
  createRetailAtlas,
  createShopFloorTexture,
} from './StationRetailDetails';

describe('authored convenience-store dressing', () => {
  it('uses shouldered, capped bottles rather than full-height cylinders', () => {
    const g = createRetailBottleGeometry();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(g.boundingBox!.max.y).toBeCloseTo(0.48, 5);
    const p = g.getAttribute('position');
    let body = 0,
      neck = 0;
    for (let i = 0; i < p.count; i++) {
      const radius = Math.hypot(p.getX(i), p.getZ(i));
      if (p.getY(i) > 0.03 && p.getY(i) < 0.32) body = Math.max(body, radius);
      if (p.getY(i) > 0.415) neck = Math.max(neck, radius);
    }
    expect(body).toBeGreaterThan(0.1);
    expect(neck).toBeLessThan(0.055);
    g.dispose();
  });
  it('stocks all shelves without changing their support or fridge clearances', () => {
    expect(RETAIL_PRODUCTS.bottles).toHaveLength(36);
    expect(RETAIL_PRODUCTS.packets).toHaveLength(60);
    for (const {
      position: [x, y, z],
    } of RETAIL_PRODUCTS.bottles) {
      expect([0.4, 1.3, 2.2]).toContain(y);
      expect(x - 0.106).toBeGreaterThan(-13.9);
      expect(x + 0.106).toBeLessThan(-10.1);
      expect(z + 0.106).toBeLessThan(-3.59);
      expect(z - 0.106).toBeGreaterThan(-4.3);
      expect(y + 0.48).toBeLessThan(2.9);
    }
    for (const {
      position: [x, y, z],
    } of RETAIL_PRODUCTS.packets) {
      expect([0.84, 1.64, 2.44, 3.24]).toContain(y);
      expect(x - 0.075).toBeGreaterThan(-15.1);
      expect(x + 0.075).toBeLessThan(-14.5);
      expect(Math.abs(z) + 0.121).toBeLessThan(2.75);
    }
  });
  it('forms a crimped pouch and a separate carton silhouette with grounded bases', () => {
    for (const carton of [false, true]) {
      const g = createRetailPacketGeometry('#a65a42', carton);
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y).toBeCloseTo(0, 4);
      expect(g.boundingBox!.max.y).toBeLessThan(0.31);
      const p = g.getAttribute('position');
      const mid: number[] = [],
        top: number[] = [];
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getY(i) - 0.15) < 0.01) mid.push(Math.abs(p.getX(i)));
        if (p.getY(i) > 0.296) top.push(Math.abs(p.getX(i)));
      }
      expect(Math.max(...mid)).toBeCloseTo(0.07, 3);
      if (!carton) expect(Math.max(...top)).toBeLessThan(0.02);
      g.dispose();
    }
  });
  it('keeps five shared merged batches finite and bounded to the existing shop', () => {
    let triangles = 0;
    for (const g of Object.values(RETAIL_GEOMETRY)) {
      for (const attr of Object.values(g.attributes))
        expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
      expect(g.boundingBox!.min.x).toBeGreaterThan(-15.81);
      expect(g.boundingBox!.max.x).toBeLessThan(-8.18);
      expect(g.boundingBox!.min.y).toBeGreaterThan(0.07);
      expect(g.boundingBox!.max.y).toBeLessThan(4.56);
      expect(g.boundingBox!.min.z).toBeGreaterThan(-4.81);
      expect(g.boundingBox!.max.z).toBeLessThan(4.81);
      triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
    }
    expect(triangles).toBeLessThan(70000);
  });
  it('keeps the side entrance open, seats the grill, and uses a bounded non-shadowing light', () => {
    const mesh = new THREE.Mesh(RETAIL_GEOMETRY.hardware, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-12, 0.15, 5.3),
      new THREE.Vector3(0, 0, -1),
      0,
      0.8
    );
    expect(ray.intersectObject(mesh)).toHaveLength(0);
    ray.set(new THREE.Vector3(-10, 0.7, -0.5), new THREE.Vector3(0, -1, 0));
    ray.far = 0.65;
    expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(0.68, 3);
    expect(RETAIL_LIGHT.distance).toBeLessThan(9);
    expect(RETAIL_LIGHT.intensity).toBeLessThan(50);
    const source = readFileSync('src/components/scenery/StationRetailDetails.tsx', 'utf8');
    expect(source).toContain('castShadow={false}');
    expect(source).not.toContain('useFrame');
    (mesh.material as THREE.Material).dispose();
  });
  it('uses authored sRGB print and finite tile repeats, with no canvas or network dependency', () => {
    const atlas = createRetailAtlas(),
      floor = createShopFloorTexture();
    expect(atlas.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(floor.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(atlas.image.width).toBe(512);
    expect(atlas.image.height).toBe(512);
    expect(new Set(atlas.image.data).size).toBeGreaterThan(30);
    expect(floor.repeat.x / floor.repeat.y).toBeCloseTo(7.5 / 9.5, 6);
    atlas.dispose();
    floor.dispose();
  });
});

describe('visible retail printing', () => {
  it('puts the complete bottle label outside the body, with its emblem facing the aisle', () => {
    const mesh = new THREE.Mesh(RETAIL_GEOMETRY.goods, new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-13.2, 0.599, -3.3),
      new THREE.Vector3(0, 0, -1)
    );
    const hit = ray.intersectObject(mesh)[0];
    expect(hit.point.z).toBeGreaterThan(-3.7961);
    expect(Math.floor(hit.uv!.x * 4)).toBe(1);
    const texture = createRetailAtlas();
    const index = (Math.floor(hit.uv!.y * 512) * 512 + Math.floor(hit.uv!.x * 512)) * 4;
    // Centre of the front-facing red emblem, not the cream stripe or bottle paint.
    expect(texture.image.data[index]).toBe(167);
    texture.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  it('keeps price cards in front of their physical shelf rails', () => {
    const goods = new THREE.Mesh(RETAIL_GEOMETRY.goods, new THREE.MeshBasicMaterial());
    goods.name = 'print';
    const hardware = new THREE.Mesh(RETAIL_GEOMETRY.hardware, new THREE.MeshBasicMaterial());
    hardware.name = 'rail';
    for (const [position, direction] of [
      [
        [-14, 0.795, 0],
        [-1, 0, 0],
      ],
      [
        [-13.2, 1.275, -3.3],
        [0, 0, -1],
      ],
    ] as const) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(...position),
        new THREE.Vector3(...direction)
      ).intersectObjects([goods, hardware])[0];
      expect(hit.object.name).toBe('print');
      expect(Math.floor(hit.uv!.x * 4) + Math.floor(hit.uv!.y * 4) * 4).toBe(13);
    }
    (goods.material as THREE.Material).dispose();
    (hardware.material as THREE.Material).dispose();
  });
});
