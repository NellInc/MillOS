import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import {
  createDeadDinoPlushGeometry,
  createSouvenirMugGeometry,
  createSouvenirFabricTextures,
  SHOP_KIT_GEOMETRY,
  PLUSH_STOCK,
  STATION_SOUVENIR_ART,
} from './StationSouvenirs';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function mesh(g: THREE.BufferGeometry) {
  return new THREE.Mesh(g, material);
}
async function sourceMeshes(file: string, position: [number, number, number]) {
  const d = await new NodeIO().read(`public/models/world/${file}.glb`);
  const result: THREE.Mesh[] = [];
  for (const node of d.getRoot().listNodes())
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(p.getAttribute('POSITION')!.getArray()!, 3)
      );
      if (p.getIndices()) g.setIndex(new THREE.BufferAttribute(p.getIndices()!.getArray()!, 1));
      const m = mesh(g);
      m.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      m.position.add(new THREE.Vector3(...position));
      m.updateMatrixWorld(true);
      result.push(m);
    }
  return result;
}
function down(x: number, z: number, objects: THREE.Mesh[], y = 3) {
  return new THREE.Raycaster(
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(0, -1, 0)
  ).intersectObjects(objects)[0];
}

describe('Dead Dino plush and stationary shop kit', () => {
  it('authors a rounded three-dimensional toy, with a grounded base and dark cheek embroidery on both sides', () => {
    const g = createDeadDinoPlushGeometry(),
      b = g.boundingBox!;
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.min.x).toBeLessThan(-0.36);
    expect(b.max.x).toBeGreaterThan(0.33);
    expect(b.max.y).toBeGreaterThan(0.36);
    expect(b.max.y).toBeLessThan(0.4);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.3);
    for (const side of [-1, 1]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(0.164, 0.161, side * 0.3),
        new THREE.Vector3(0, 0, -side)
      ).intersectObject(mesh(g))[0];
      expect(Math.abs(hit.point.z)).toBeGreaterThan(0.097);
      const colors = g.getAttribute('color'),
        ink = new THREE.Color('#0b342b');
      for (const i of [hit.face!.a, hit.face!.b, hit.face!.c]) {
        expect(colors.getX(i)).toBeCloseTo(ink.r, 6);
        expect(colors.getY(i)).toBeCloseTo(ink.g, 6);
        expect(colors.getZ(i)).toBeCloseTo(ink.b, 6);
      }
    }
    g.dispose();
  });
  it('seats three plushies on their trays, within the counter and magazine-rack footprints', () => {
    expect(PLUSH_STOCK).toHaveLength(3);
    const template = createDeadDinoPlushGeometry();
    for (const [i, { base, scale }] of PLUSH_STOCK.entries()) {
      const g = template
        .clone()
        .scale(scale, scale, scale)
        .translate(...base);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.min.y).toBeCloseTo(i === 0 ? 1.074 : 1.23, 6);
      const limits = i === 0 ? [-9.34, -8.6, -0.27, 0.19] : [-10.89, -10.11, 2.805, 3.195];
      expect(b.min.x).toBeGreaterThan(limits[0]);
      expect(b.max.x).toBeLessThan(limits[1]);
      expect(b.min.z).toBeGreaterThan(limits[2]);
      expect(b.max.z).toBeLessThan(limits[3]);
      g.dispose();
    }
    template.dispose();
  });
  it('places rubber support pads on the actual loaded GLBs, not nominal boxes', async () => {
    const counter = await sourceMeshes('station-counter', [-9, 0, -1]);
    const rack = await sourceMeshes('station-magazine-rack', [-10.5, 0, 3]);
    for (const x of [-9.25, -8.69])
      for (const z of [-0.205, 0.125]) expect(down(x, z, counter).point.y).toBeCloseTo(1.045, 6);
    for (const x of [-10.8, -10.2])
      for (const z of [2.87, 3.13]) expect(down(x, z, rack).point.y).toBeCloseTo(1.2, 6);
    for (const m of [...counter, ...rack]) m.geometry.dispose();
  });
  it('models an open ceramic mug and a genuinely open handle', () => {
    const g = createSouvenirMugGeometry(),
      m = mesh(g);
    expect(down(0, 0, [m], 1).point.y).toBeCloseTo(0.014, 6);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0.102, 0.074, 0.2),
      new THREE.Vector3(0, 0, -1)
    );
    expect(ray.intersectObject(m)).toHaveLength(0);
    ray.set(new THREE.Vector3(0.124, 0.074, 0.2), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(m)).not.toHaveLength(0);
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6);
    g.dispose();
  });
  it('declares cloth colour/data spaces and signed normals with nonzero roughness channels', () => {
    const maps = createSouvenirFabricTextures();
    expect(maps.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(maps.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(maps.roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
    const normal = maps.normalMap.image.data,
      rough = maps.roughnessMap.image.data;
    const x: number[] = [],
      y: number[] = [];
    for (let i = 0; i < rough.length; i += 4) {
      x.push(normal[i]);
      y.push(normal[i + 1]);
      if (rough[i] !== rough[i + 1] || rough[i] !== rough[i + 2] || rough[i] < 200)
        throw new Error('Invalid RGB roughness texel');
    }
    expect(Math.min(...x)).toBeLessThan(127);
    expect(Math.max(...x)).toBeGreaterThan(128);
    expect(Math.min(...y)).toBeLessThan(127);
    expect(Math.max(...y)).toBeGreaterThan(128);
    for (const t of Object.values(maps)) t.dispose();
  });
  it('keeps seven finite merged material batches inside the three shop seats', () => {
    expect(Object.keys(SHOP_KIT_GEOMETRY)).toHaveLength(7);
    let triangles = 0;
    for (const g of Object.values(SHOP_KIT_GEOMETRY)) {
      for (const a of Object.values(g.attributes))
        expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
      const b = g.boundingBox!;
      expect(b.min.x).toBeGreaterThan(-11.61);
      expect(b.max.x).toBeLessThan(-8.58);
      expect(b.min.y).toBeGreaterThanOrEqual(0.07999);
      expect(b.max.y).toBeLessThan(2.081);
      expect(b.min.z).toBeGreaterThan(-3.101);
      expect(b.max.z).toBeLessThan(3.215);
      triangles += g.getAttribute('position').count / 3;
    }
    expect(triangles).toBeLessThan(45000);
  });
  it('retains the door, checkout terminal, coffee recess and slush-tap working space', () => {
    const items = Object.values(SHOP_KIT_GEOMETRY).map(mesh);
    for (const [x, y, z, dir, far] of [
      [-12, 0.15, 5.3, [0, 0, -1], 2.8],
      [-8.1, 1.14, -0.45, [-1, 0, 0], 1.3],
      [-9, 0.6, -3.5, [-1, 0, 0], 0.7],
      [-10, 0.84, -1.5, [0, 0, -1], 0.6],
    ] as const) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(...dir),
        0,
        far
      );
      expect(ray.intersectObjects(items)).toHaveLength(0);
    }
  });
  it('seats the pastry tray and food on their own supported coffee worktop', () => {
    expect(down(-11.33, -2.79, [mesh(SHOP_KIT_GEOMETRY.metal)]).point.y).toBeCloseTo(1.035, 5);
    expect(down(-11.1, -2.8, [mesh(SHOP_KIT_GEOMETRY.timber)], 1.02).point.y).toBeCloseTo(1.015, 5);
    expect(SHOP_KIT_GEOMETRY.baked.boundingBox!.min.y).toBeCloseTo(1.035, 5);
    // The two biscuit layers are vertically separated, rather than intersecting at one height.
    const p = SHOP_KIT_GEOMETRY.baked.getAttribute('position');
    const bases = new Set(Array.from({ length: p.count }, (_, i) => p.getY(i).toFixed(4)));
    expect(bases.has('1.0350')).toBe(true);
    expect(bases.has('1.0460')).toBe(true);
  });
  it('puts actual curved cup and mug prints ahead of their surfaces, in the badge atlas tile', () => {
    const prints = mesh(SHOP_KIT_GEOMETRY.prints);
    prints.name = 'print';
    const paper = mesh(SHOP_KIT_GEOMETRY.paper),
      ceramic = mesh(SHOP_KIT_GEOMETRY.ceramic);
    for (const [x, y, z] of [
      [-10.82, 1.102, -2.5],
      [-10.75, 1.733, 3.3],
    ]) {
      const h = new THREE.Raycaster(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(0, 0, -1)
      ).intersectObjects([prints, paper, ceramic])[0];
      expect(h.object.name).toBe('print');
      expect(Math.floor(h.uv!.x * 2) + 2 * (1 - Math.floor(h.uv!.y * 2))).toBe(2);
    }
  });
  it('wires the local raster through the existing texture loader, with no light, audio, game action or update loop', () => {
    const source = readFileSync('src/components/scenery/StationSouvenirs.tsx', 'utf8');
    const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    expect(station).toContain('<StationSouvenirs />');
    expect(source).toContain('useTexture(STATION_SOUVENIR_ART)');
    expect(source).toContain('print.dispose()');
    expect(source).not.toContain('texture.dispose()');
    for (const token of [
      'useFrame',
      '<pointLight',
      '<spotLight',
      'AudioContext',
      'onClick=',
      'useGameStore',
    ])
      expect(source).not.toContain(token);
    expect(STATION_SOUVENIR_ART).toContain('textures/signage/dead-dino-shop-kit-v1.webp');
    const bytes = readFileSync('public/textures/signage/dead-dino-shop-kit-v1.webp');
    expect(bytes.length).toBeLessThan(350000);
    expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
  });
});
