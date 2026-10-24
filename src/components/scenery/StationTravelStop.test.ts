import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TRAVEL_STOP_GEOMETRY, TRAVEL_STOCK, TRAVEL_PUMP_FACES } from './StationTravelStop';
import { RETAIL_GEOMETRY, STATION_RETAIL_ART } from './StationRetailDetails';
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const meshes = Object.values(TRAVEL_STOP_GEOMETRY).map((g) => new THREE.Mesh(g, material));
const opaque = new THREE.Mesh(TRAVEL_STOP_GEOMETRY.opaque, material);
const prints = new THREE.Mesh(TRAVEL_STOP_GEOMETRY.prints, material);
const tileOf = (uv: THREE.Vector2) => Math.floor(uv.x * 4) + 4 * (3 - Math.floor(uv.y * 4));
const ray = (at: [number, number, number], direction: [number, number, number], far = 100) =>
  new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(...direction), 0, far);

describe('Dead Dino destination travel stop', () => {
  it('stocks eighteen varied packets on three real decks without blocking the central aisle', () => {
    expect(TRAVEL_STOCK).toHaveLength(18);
    expect(new Set(TRAVEL_STOCK.map((p) => p.tile)).size).toBe(4);
    for (const {
      at: [x, y, z],
    } of TRAVEL_STOCK) {
      expect([0.485, 0.885, 1.285]).toContain(y);
      const support = ray([x, y + 0.001, z], [0, -1, 0], 0.1).intersectObject(opaque)[0];
      expect(support.point.y).toBeCloseTo(y, 5);
      expect(x + 0.07).toBeLessThan(-13.08);
      expect(z - 0.121).toBeGreaterThan(0.45);
      expect(z + 0.121).toBeLessThan(1.65);
    }
  });
  it('seats conforming front labels on the real pouch surfaces and samples the correct raster product', () => {
    for (const item of TRAVEL_STOCK.filter((p) => p.at[0] > -13.35)) {
      const hit = ray([-12.8, item.at[1] + 0.15, item.at[2]], [-1, 0, 0], 0.5).intersectObject(
        prints
      )[0];
      expect(tileOf(hit.uv!)).toBe(item.tile);
      expect(hit.point.x).toBeCloseTo(item.at[0] + 0.0715, 5);
      expect(
        ray([-12.8, item.at[1] + 0.15, item.at[2]], [-1, 0, 0], 0.5).intersectObject(opaque)[0]
          .point.x
      ).toBeLessThan(hit.point.x);
    }
  });
  it('numbers all four outward pump faces in the correct atlas quarter', () => {
    expect(TRAVEL_PUMP_FACES.map((p) => p.number).sort()).toEqual([1, 2, 3, 4]);
    for (const { x, side, number } of TRAVEL_PUMP_FACES) {
      const hit = ray([x, 2.324, side * 1.5], [0, 0, -side], 1).intersectObject(prints)[0];
      expect(tileOf(hit.uv!)).toBe(14);
      const u = hit.uv!.x * 4 - 2,
        v = hit.uv!.y * 4;
      expect(Math.floor(u * 2) + 2 * (1 - Math.floor(v * 2))).toBe(number - 1);
      expect(Math.abs(hit.point.z)).toBeCloseTo(0.915, 5);
    }
    // Mast enters the retained source cap, whose GLB top1.8 + live y.1 =1.9m.
    const mast = ray([-3, 1.9, 1.1], [0, 0, -1], 0.3).intersectObjects(meshes);
    expect(mast.length).toBeGreaterThan(0);
  });
  it('keeps the whole doorway route, pump lanes and counter view unobstructed', () => {
    for (const x of [-12.6, -12, -11.4])
      for (const y of [0.15, 1.2, 2])
        expect(ray([x, y, 9.5], [0, 0, -1], 4.3).intersectObjects(meshes)).toHaveLength(0);
    for (const x of [-6, -3, 0, 3, 6])
      for (const side of [-1, 1])
        expect(ray([x, 1, side * 6], [0, 0, -side], 3.8).intersectObjects(meshes)).toHaveLength(0);
    expect(ray([-7, 1.235, -1], [-1, 0, 0], 2.5).intersectObjects(meshes)).toHaveLength(0);
  });
  it('places the bench and mascot on grounded supports and the welcome print outside the actual wall', () => {
    expect(TRAVEL_STOP_GEOMETRY.statue.boundingBox!.min.y).toBeCloseTo(0.28, 6);
    expect(
      ray([-9.65, 0.281, 7.65], [0, -1, 0], 0.1).intersectObject(opaque)[0].point.y
    ).toBeCloseTo(0.28, 5);
    const welcome = ray([-10.79, 1.56, 6], [0, 0, -1], 1.1).intersectObject(prints)[0];
    expect(welcome.point.z).toBeGreaterThan(5);
    expect(tileOf(welcome.uv!)).toBe(15);
    expect(TRAVEL_STOP_GEOMETRY.metal.boundingBox!.min.y).toBeCloseTo(-0.02, 5);
  });
  it('keeps four finite static batches within the existing station site and a 30000-triangle cap', () => {
    let triangles = 0;
    expect(Object.keys(TRAVEL_STOP_GEOMETRY)).toHaveLength(4);
    for (const g of Object.values(TRAVEL_STOP_GEOMETRY)) {
      for (const a of Object.values(g.attributes))
        expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
      const b = g.boundingBox!;
      expect(b.min.x).toBeGreaterThan(-15.4);
      expect(b.max.x).toBeLessThan(4.49);
      expect(b.min.y).toBeGreaterThan(-0.021);
      expect(b.max.y).toBeLessThan(4.23);
      expect(b.min.z).toBeGreaterThan(-5.5);
      expect(b.max.z).toBeLessThan(8.24);
      triangles += g.getAttribute('position').count / 3;
    }
    expect(triangles).toBeLessThan(30000);
  });
  it('ships an opaque sixteen-cell raster and preserves a neutral white surface sampling cell', async () => {
    const { data, info } = await sharp('public/textures/signage/station-retail-raster-v1.webp')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1024, 1024]);
    expect(data.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
    const index = (128 * info.width + 128) * 4;
    for (const c of [0, 1, 2]) expect(data[index + c]).toBeGreaterThanOrEqual(250);
    const uv = RETAIL_GEOMETRY.goods.getAttribute('uv');
    expect(Array.from(uv.array).every((v) => v > 0 && v < 1)).toBe(true);
  });
  it('preserves the live interface, fixtures and lights while sharing the local loading path', () => {
    const source = readFileSync('src/components/scenery/StationTravelStop.tsx', 'utf8');
    const retail = readFileSync('src/components/scenery/StationRetailDetails.tsx', 'utf8');
    const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    for (const term of [
      'useFrame',
      '<pointLight',
      '<spotLight',
      'AudioContext',
      'onClick=',
      'useGameStore',
    ])
      expect(source).not.toContain(term);
    expect(source).toContain('useTexture(STATION_RETAIL_ART)');
    expect(source).toContain('material.dispose()');
    expect(retail).toContain('useTexture(STATION_RETAIL_ART)');
    expect(retail).toContain('print.dispose()');
    expect(source + retail).not.toContain('texture.dispose()');
    expect(station).toContain('<StationTravelStop />');
    expect(station).toContain('width={7.8} height={0.42}');
    expect(STATION_RETAIL_ART).toContain('textures/signage/station-retail-raster-v1.webp');
  });
});
