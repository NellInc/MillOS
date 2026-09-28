import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  generatedBenchSource,
  MAIN_EXTERIOR_BENCHES,
  LANDSCAPE_GROVE_TREES,
  VALLEY_WOODLAND_TREES,
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
import { createTreeMatrix, treeFormFromPosition } from '../scenery/treeForms';

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
  it('bends the woody leader within the existing crown without moving its endpoints', () => {
    const positions = TREE_BRANCH_GEOMETRY.getAttribute('position');
    // First fork, six unique vertices per ring; the seventh closes its seam.
    const ringCenter = (ring: number) => {
      const center = new THREE.Vector3();
      for (let i = 0; i < 6; i++) {
        center.add(new THREE.Vector3().fromBufferAttribute(positions, ring * 7 + i));
      }
      return center.divideScalar(6);
    };
    expect(ringCenter(0).distanceTo(new THREE.Vector3(0.14, 5.2, -0.08))).toBeLessThan(1e-6);
    expect(ringCenter(2).distanceTo(new THREE.Vector3(0, 2.6, 0))).toBeLessThan(1e-6);
    const straightCenter = ringCenter(0).add(ringCenter(2)).multiplyScalar(0.5);
    expect(ringCenter(1).distanceTo(straightCenter)).toBeGreaterThan(0.13);
    expect(ringCenter(1).distanceTo(straightCenter)).toBeLessThan(0.14);
    expect(TREE_BRANCH_GEOMETRY.index!.count / 3).toBe(180);
    TREE_BRANCH_GEOMETRY.computeBoundingBox();
    for (const crown of TREE_FOLIAGE_VARIANTS) {
      crown.computeBoundingBox();
      const branches = TREE_BRANCH_GEOMETRY.boundingBox!;
      const canopy = crown.boundingBox!;
      expect(branches.min.x).toBeGreaterThan(canopy.min.x);
      expect(branches.max.x).toBeLessThan(canopy.max.x);
      expect(branches.min.z).toBeGreaterThan(canopy.min.z);
      expect(branches.max.z).toBeLessThan(canopy.max.z);
      expect(branches.max.y).toBeLessThan(canopy.max.y);
    }
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

describe('natural tree forms', () => {
  it('varies crown aspect and height independently, stably across terrain quality', () => {
    const forms = MAIN_EXTERIOR_TREES.map(({ position }) => treeFormFromPosition(position));
    const aspects = forms.map(({ scale }) => Math.max(scale.x, scale.z) / scale.y);
    expect(Math.max(...aspects) / Math.min(...aspects)).toBeGreaterThan(1.7);
    for (const { position } of MAIN_EXTERIOR_TREES) {
      expect(treeFormFromPosition([position[0], 12, position[2]])).toEqual(
        treeFormFromPosition(position)
      );
      expect(createTreeMatrix(position, 1, 0).elements).toEqual(
        createTreeMatrix(position, 1, 0).elements
      );
    }
  });

  it('keeps transformed crowns within their previous envelope and tilted roots seated', () => {
    const point = new THREE.Vector3();
    const trunk = SHARED_TREE_TRUNK.getAttribute('position');
    const trees = [...MAIN_EXTERIOR_TREES, ...PARKLAND_TREES, ...FRONT_PARKLAND_TREES];
    for (const { position, scale = 1 } of trees) {
      const { variant, rotY, jitter } = treeJitterFromPosition(position);
      const matrix = createTreeMatrix(position, scale * jitter, rotY);
      const canopy = TREE_FOLIAGE_VARIANTS[variant].getAttribute('position');
      let oldRadius = 0;
      let radius = 0;
      for (let i = 0; i < canopy.count; i++) {
        point.fromBufferAttribute(canopy, i);
        oldRadius = Math.max(oldRadius, Math.hypot(point.x, point.z) * scale * jitter);
        point.applyMatrix4(matrix);
        radius = Math.max(radius, Math.hypot(point.x - position[0], point.z - position[2]));
      }
      expect(radius).toBeLessThanOrEqual(oldRadius);
      for (let i = 0; i < trunk.count; i++) {
        if (Math.abs(trunk.getY(i)) > 1e-6) continue;
        point.fromBufferAttribute(trunk, i).applyMatrix4(matrix);
        expect(point.y).toBeLessThanOrEqual(position[1] + 1e-7);
        expect(point.y).toBeGreaterThan(position[1] - 0.07);
      }
      // No shear: three's instance normal shortcut requires orthogonal axes.
      const axes = [0, 1, 2].map((axis) =>
        new THREE.Vector3().setFromMatrixColumn(matrix, axis).normalize()
      );
      expect(Math.abs(axes[0].dot(axes[1]))).toBeLessThan(1e-12);
      expect(Math.abs(axes[0].dot(axes[2]))).toBeLessThan(1e-12);
      expect(Math.abs(axes[1].dot(axes[2]))).toBeLessThan(1e-12);
    }
  });

  it('mixes young and mature woodland without adding geometry or instance batches', () => {
    const ages = VALLEY_WOODLAND_TREES.map(({ scale = 1 }) => scale);
    const young = ages.filter((scale) => scale < 1.05).length;
    const mature = ages.filter((scale) => scale > 1.3).length;
    expect(young / ages.length).toBeGreaterThan(0.15);
    expect(mature / ages.length).toBeGreaterThan(0.45);
    const heights = VALLEY_WOODLAND_TREES.map(({ position, scale = 1 }) => {
      const { variant, rotY, jitter } = treeJitterFromPosition(position);
      const matrix = createTreeMatrix(position, scale * jitter, rotY);
      const points = TREE_FOLIAGE_VARIANTS[variant].getAttribute('position');
      let height = 0;
      for (let i = 0; i < points.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(matrix);
        height = Math.max(height, point.y - position[1]);
      }
      return height;
    });
    expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(2.5);
    expect(TREE_FOLIAGE_VARIANTS).toHaveLength(3);
    expect(
      TREE_FOLIAGE_VARIANTS.every((geometry) => geometry.getAttribute('position').count === 96)
    ).toBe(true);
  });
});
