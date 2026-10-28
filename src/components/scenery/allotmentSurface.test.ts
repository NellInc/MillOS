import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ALLOTMENT_MATERIAL,
  ALLOTMENT_TEXTURES,
  ALLOTMENT_TILES,
  finishAllotmentSurface,
  neutralAllotmentSurface,
} from './allotmentSurface';

it('keeps plant colour sRGB and height/roughness linear in two small shared textures', () => {
  const { map, detail } = ALLOTMENT_TEXTURES;
  expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(detail.colorSpace).toBe(THREE.NoColorSpace);
  for (const texture of [map, detail]) {
    expect(texture.image.width).toBe(256);
    expect(texture.image.height).toBe(256);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    const data = texture.image.data;
    expect(data.byteLength).toBe(256 * 256 * 4);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i + 3]).toBe(255);
      if (texture === detail) expect(data[i + 1]).toBe(data[i + 2]);
    }
  }
  expect(ALLOTMENT_MATERIAL.map).toBe(map);
  expect(ALLOTMENT_MATERIAL.bumpMap).toBe(detail);
  expect(ALLOTMENT_MATERIAL.roughnessMap).toBe(detail);
  expect(ALLOTMENT_MATERIAL.transparent).toBe(false);
  expect(ALLOTMENT_MATERIAL.emissive.getHex()).toBe(0);
});

it('reserves a large exact neutral quadrant and keeps every crop inside its guttered island', () => {
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 256 + x) * 4;
      expect([...ALLOTMENT_TEXTURES.map.image.data.slice(i, i + 4)]).toEqual([255, 255, 255, 255]);
    }
  for (const kind of ['crown', 'leaf', 'root'] as const) {
    const g = new THREE.PlaneGeometry(1, 1);
    finishAllotmentSurface(g, kind);
    const before = [...g.attributes.uv.array];
    neutralAllotmentSurface(g);
    expect([...g.attributes.uv.array]).toEqual(before);
    const [left, bottom, right, top] = ALLOTMENT_TILES[kind];
    for (let i = 0; i < g.attributes.uv.count; i++) {
      const x = g.attributes.uv.getX(i) * 256 - 0.5,
        y = g.attributes.uv.getY(i) * 256 - 0.5;
      expect(x).toBeGreaterThanOrEqual(left);
      expect(x).toBeLessThanOrEqual(right);
      expect(y).toBeGreaterThanOrEqual(bottom);
      expect(y).toBeLessThanOrEqual(top);
    }
    g.dispose();
  }
  const wood = new THREE.BoxGeometry(1, 1, 1);
  neutralAllotmentSurface(wood);
  expect(new Set(wood.attributes.uv.array)).toEqual(new Set([0.125]));
  wood.dispose();
});

it('gives the spherical crown a seamless albedo join and visible non-emissive surface marks', () => {
  const [left, bottom, right, top] = ALLOTMENT_TILES.crown;
  const data = ALLOTMENT_TEXTURES.map.image.data;
  const tones = new Set<number>();
  for (let y = bottom; y <= top; y++) {
    const at = (x: number) => (y * 256 + x) * 4;
    expect([...data.slice(at(left), at(left) + 4)]).toEqual([
      ...data.slice(at(right), at(right) + 4),
    ]);
    for (let x = left; x <= right; x++) tones.add(data[at(x)]);
  }
  expect(tones.size).toBeGreaterThan(25);
});
