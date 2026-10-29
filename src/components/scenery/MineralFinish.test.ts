import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createMineralFinish } from './MineralFinish';

it('keeps stone ownership and colour/data roles separate without altering the shared base', () => {
  const base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
  const maps = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
  const finish = createMineralFinish(base, maps);
  expect(finish).not.toBe(base);
  expect(finish.vertexColors).toBe(true);
  expect(base.map).toBeNull();
  expect(base.roughness).toBe(0.97);
  expect(finish.map).toBe(maps[0]);
  expect(finish.normalMap).toBe(maps[1]);
  expect(finish.roughnessMap).toBe(maps[2]);
  expect(maps.map((map) => map.colorSpace)).toEqual([
    THREE.SRGBColorSpace,
    THREE.NoColorSpace,
    THREE.NoColorSpace,
  ]);
  expect(
    maps.every((map) => map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping)
  ).toBe(true);
  expect(finish.normalScale.toArray()).toEqual([0.12, 0.12]);
  let disposed = 0;
  maps.forEach((map) => map.addEventListener('dispose', () => disposed++));
  finish.dispose();
  expect(disposed).toBe(0);
  base.dispose();
  maps.forEach((map) => map.dispose());
});
