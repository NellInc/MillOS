import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { selectWaterReflectionObjects } from './WaterSceneReflection';
import { CANAL_WEIR_IMPACT } from './canalOutletGeometry';
describe('bounded actual-water reflection content', () => {
  it('selects actual visible near-bank objects without changing ownership, layers or transforms', () => {
    const scene = new THREE.Scene(),
      geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshStandardMaterial();
    geometry.computeBoundingSphere();
    const near = new THREE.Mesh(geometry, material);
    near.position.set(CANAL_WEIR_IMPACT.position[0], 0, CANAL_WEIR_IMPACT.position[1]);
    near.layers.enable(3);
    scene.add(near);
    const hidden = new THREE.Group();
    hidden.visible = false;
    const child = near.clone();
    hidden.add(child);
    scene.add(hidden);
    const far = near.clone();
    far.position.x += 500;
    scene.add(far);
    scene.updateMatrixWorld(true);
    const selected = selectWaterReflectionObjects(scene);
    expect(selected.selected).toEqual([near]);
    expect(near.geometry).toBe(geometry);
    expect(near.material).toBe(material);
    expect(near.layers.mask).toBe(9);
    expect(near.parent).toBe(scene);
    geometry.dispose();
    material.dispose();
  });
  it('caps draws and skips recursive shader/transparent water without disposal', () => {
    const scene = new THREE.Scene(),
      geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshStandardMaterial();
    geometry.computeBoundingSphere();
    for (let i = 0; i < 120; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(CANAL_WEIR_IMPACT.position[0] + i * 0.01, 1, CANAL_WEIR_IMPACT.position[1]);
      scene.add(mesh);
    }
    const shader = new THREE.ShaderMaterial(),
      water = new THREE.Mesh(geometry, shader);
    water.position.copy(scene.children[0].position);
    scene.add(water);
    scene.updateMatrixWorld(true);
    const selected = selectWaterReflectionObjects(scene);
    expect(selected.selected).toHaveLength(96);
    expect(selected.selected).not.toContain(water);
    expect(selected.triangles).toBeLessThanOrEqual(180000);
    geometry.dispose();
    material.dispose();
    shader.dispose();
  });
});

it('excludes physically transmissive materials and meshes outside the actual camera layers', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.BoxGeometry();
  geometry.computeBoundingSphere();
  const glass = new THREE.MeshPhysicalMaterial({ transmission: 1 }),
    solid = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(geometry, glass),
    b = new THREE.Mesh(geometry, solid);
  a.position.set(CANAL_WEIR_IMPACT.position[0], 1, CANAL_WEIR_IMPACT.position[1]);
  b.position.copy(a.position);
  b.layers.set(3);
  scene.add(a, b);
  scene.updateMatrixWorld(true);
  expect(selectWaterReflectionObjects(scene, new THREE.Layers()).selected).toEqual([]);
  geometry.dispose();
  glass.dispose();
  solid.dispose();
});
