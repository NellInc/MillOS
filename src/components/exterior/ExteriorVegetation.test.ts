import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  generatedBenchSource,
  MAIN_EXTERIOR_BENCHES,
  LANDSCAPE_GROVE_TREES,
  MAIN_EXTERIOR_TREES,
  PARKLAND_TREES,
  FRONT_PARKLAND_TREES,
  treeSiteClear,
  treeJitterFromPosition,
  SHARED_TREE_TRUNK,
  TREE_BRANCH_GEOMETRY,
  TREE_FOLIAGE_VARIANTS,
} from './ExteriorVegetation';
import {
  generateHeightmap,
  generateSplatMap,
  MILLOS_RIVER_CONFIG,
  MILLOS_TERRAIN_REGIONS,
  sampleTerrainGroundHeight,
} from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS, SPLAT_BOUNDS } from '../terrain/terrainTypes';
import { getLandmarkBounds, SITE_LAYOUT } from '../../constants/siteLayout';

describe('generated park bench instancing', () => {
  it('connects the retained trunk to every crown variant with a bounded branch mesh', () => {
    SHARED_TREE_TRUNK.computeBoundingBox();
    TREE_BRANCH_GEOMETRY.computeBoundingBox();
    const branches = TREE_BRANCH_GEOMETRY.boundingBox!;
    expect(branches.intersectsBox(SHARED_TREE_TRUNK.boundingBox!)).toBe(true);
    expect(branches.max.y).toBeGreaterThan(5.5);
    for (const crown of TREE_FOLIAGE_VARIANTS) {
      crown.computeBoundingBox();
      expect(branches.intersectsBox(crown.boundingBox!)).toBe(true);
    }
    expect(TREE_BRANCH_GEOMETRY.index!.count / 3).toBeLessThan(200);
  });
  it('keeps the northern bench on the dry approach beside the river path', () => {
    const resolution = 512;
    const map = generateHeightmap(resolution);
    const sample = (x: number, z: number) => {
      const px = Math.round(
        ((x - TERRAIN_BOUNDS.minX) / (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX)) * resolution - 0.5
      );
      const py =
        resolution -
        1 -
        Math.round(
          ((z - TERRAIN_BOUNDS.minZ) / (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ)) * resolution -
            0.5
        );
      return map.image.data![(py * resolution + px) * 4];
    };
    // Both earlier placements sat over the actual displaced canyon.
    expect(sample(0, -140)).toBeLessThan(255);
    expect(sample(3, -123)).toBeLessThan(255);
    const [x, , z] = MAIN_EXTERIOR_BENCHES[2].position;
    for (const dx of [-1, 1])
      for (const dz of [-0.4, 0.4]) expect(sample(x + dx, z + dz)).toBe(255);
    map.dispose();
  });
  it('retains the normalized hierarchy transform and shares geometry/material', () => {
    const scene = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.scale.setScalar(1.8);
    pivot.position.set(0, 0.5, 0);
    pivot.rotation.y = -Math.PI / 2;
    scene.add(pivot);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.5, 1),
      new THREE.MeshStandardMaterial()
    );
    pivot.add(mesh);
    const source = generatedBenchSource(scene);
    expect(source).toBe(mesh);
    expect(source.geometry).toBe(mesh.geometry);
    expect(source.material).toBe(mesh.material);
    const placement = new THREE.Matrix4().makeTranslation(10, 0, 20).multiply(source.matrixWorld);
    const bounds = new THREE.Box3()
      .setFromBufferAttribute(source.geometry.attributes.position as THREE.BufferAttribute)
      .applyMatrix4(placement);
    expect(bounds.getCenter(new THREE.Vector3()).toArray()).toEqual([10, 0.5, 20]);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1.8);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('rejects incompatible generated assemblies so the primitive fallback remains available', () => {
    const scene = new THREE.Group();
    expect(() => generatedBenchSource(scene)).toThrow('one shared mesh and material');
    const mesh = new THREE.Mesh();
    scene.add(mesh, new THREE.Mesh());
    expect(() => generatedBenchSource(scene)).toThrow('one shared mesh and material');
  });
});

describe('landscape groves', () => {
  it('frames the village on dry grass while leaving its square and the world edge clear', () => {
    const resolution = 512;
    const height = generateHeightmap(resolution);
    const splat = generateSplatMap(MILLOS_TERRAIN_REGIONS, resolution, SPLAT_BOUNDS);
    const sample = (
      map: THREE.DataTexture,
      bounds: typeof TERRAIN_BOUNDS,
      x: number,
      z: number,
      flip = false
    ) => {
      const px = Math.round(((x - bounds.minX) / (bounds.maxX - bounds.minX)) * resolution - 0.5);
      let py = Math.round(((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * resolution - 0.5);
      if (flip) py = resolution - 1 - py;
      return map.image.data![(py * resolution + px) * 4];
    };
    const invalidGround: Array<{ position: number[]; height: number; grass: number }> = [];
    const village = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
    for (const tree of LANDSCAPE_GROVE_TREES) {
      expect(MAIN_EXTERIOR_TREES).toContain(tree);
      const [x, , z] = tree.position;
      const { jitter } = treeJitterFromPosition(tree.position);
      const crownRadius = 3.1 * (tree.scale ?? 1) * jitter;
      expect(Math.hypot(x, z) + crownRadius).toBeLessThan(SITE_LAYOUT.world.radius);
      // Village square bounds: the groves remain outside even at mature crown width.
      expect(
        x < village.minX - crownRadius ||
          x > village.maxX + crownRadius ||
          z < village.minZ - crownRadius ||
          z > village.maxZ + crownRadius
      ).toBe(true);
      for (const dx of [-1, 0, 1]) {
        for (const dz of [-1, 0, 1]) {
          const h = sample(height, TERRAIN_BOUNDS, x + dx, z + dz, true);
          const g = sample(splat, SPLAT_BOUNDS, x + dx, z + dz);
          if (h !== 255 || g <= 240) invalidGround.push({ position: [x, z], height: h, grass: g });
        }
      }
    }
    expect(invalidGround).toEqual([]);
    expect(new Set(LANDSCAPE_GROVE_TREES.map((tree) => tree.position.join(','))).size).toBe(
      LANDSCAPE_GROVE_TREES.length
    );
    height.dispose();
    splat.dispose();
  });
});

describe('tree sites', () => {
  // Reported 2026-09-26: a grove across the canal kept five trunks in its
  // water, one oak grew through the Nissen hut and three river trees stood in
  // the channel. The live-scene audit found all of them; this pins the rule.
  const trees = [...MAIN_EXTERIOR_TREES, ...PARKLAND_TREES, ...FRONT_PARKLAND_TREES];

  it('keeps every trunk out of the canals, lake and ponds, and every crown off the huts', () => {
    const blocked = trees
      .filter(({ position: [x, , z], scale = 1 }) => !treeSiteClear(x, z, 3.1 * scale))
      .map(({ position: [x, , z] }) => `${x}, ${z}`);
    expect(blocked).toEqual([]);
  });

  it('rejects the reported sites, so the rule is not vacuous', () => {
    expect(treeSiteClear(-145, 20, 3)).toBe(false); // canal water
    expect(treeSiteClear(-151.2, 20, 3)).toBe(false); // canal wall
    expect(treeSiteClear(-75, -97, 3)).toBe(false); // Nissen hut
    expect(treeSiteClear(120, 120, 3)).toBe(false); // lake
    expect(treeSiteClear(-125, 105, 3)).toBe(false); // pond
    expect(treeSiteClear(-70, -60, 3)).toBe(true);
    // The old x 40 river tree stood 3.6 m down in the channel.
    expect(sampleTerrainGroundHeight(40, -170, 128)).toBeLessThan(
      MILLOS_RIVER_CONFIG.waterLevel + 1
    );
  });

  it('stands every trunk on the bank, above the river water line', () => {
    // A bank tree may stand on the canyon's dry shoulder; not in the channel.
    const waterLine = MILLOS_RIVER_CONFIG.waterLevel + 1;
    const wet = trees
      .filter(({ position: [x, , z] }) =>
        [64, 128].some((segments) => sampleTerrainGroundHeight(x, z, segments) < waterLine)
      )
      .map(({ position: [x, , z] }) => `${x}, ${z}`);
    expect(wet).toEqual([]);
  });
});
