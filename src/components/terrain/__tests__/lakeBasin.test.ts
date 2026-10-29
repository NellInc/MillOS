import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cutLakeBasinFromTerrain, LAKE_BASIN, sampleLakeBasinHeight } from '../lakeBasin';
import { createDisplacedGeometry } from '../TerrainGround';
import {
  getRiverHeightfield,
  MILLOS_RIVER_CONFIG,
  sampleTerrainGroundHeight,
  sampleTerrainGridHeight,
} from '../splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrainTypes';
import { SITE_LAYOUT } from '../../../constants/siteLayout';
import {
  createOrganicLakeBedGeometry,
  createOrganicLakeBankGeometry,
} from '../../exterior/organicLakeGeometry';

describe('actual lake basin and original terrain assembly', () => {
  it.each([64, 128])(
    'grounds the submerged bank strip as well as the basin at tier%i',
    (segments) => {
      const bank = createOrganicLakeBankGeometry(19, 14, 21.2, 16.2);
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(bank, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(120, 0.08, 120);
      mesh.updateMatrixWorld();
      const x = 138.618493,
        z = 120;
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 3, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(sampleTerrainGroundHeight(x, z, segments) + SITE_LAYOUT.datum.terrain).toBeCloseTo(
        hit.point.y,
        5
      );
      bank.dispose();
      material.dispose();
    }
  );
  it.each([64, 128])(
    'cuts only the lake footprint on the %i grid and samples the actual bed',
    (segments) => {
      const field = getRiverHeightfield();
      const ground = createDisplacedGeometry(
        1200,
        1200,
        segments,
        field.data,
        field.resolution,
        MILLOS_RIVER_CONFIG.depth,
        TERRAIN_BOUNDS
      );
      const oldPosition = ground.getAttribute('position').array.slice(),
        oldNormal = ground.getAttribute('normal').array.slice();
      const oldTriangles = ground.index!.count / 3;
      cutLakeBasinFromTerrain(ground);
      expect(ground.getAttribute('position').array.slice(0, oldPosition.length)).toEqual(
        oldPosition
      );
      expect(ground.getAttribute('normal').array.slice(0, oldNormal.length)).toEqual(oldNormal);
      expect(ground.index!.count / 3).toBeLessThan(oldTriangles + 2500);
      const bed = createOrganicLakeBedGeometry(
        LAKE_BASIN.radiusX,
        LAKE_BASIN.radiusZ,
        LAKE_BASIN.depth
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ground, material),
        bedMesh = new THREE.Mesh(bed, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = SITE_LAYOUT.datum.terrain;
      mesh.updateMatrixWorld();
      bedMesh.rotation.x = -Math.PI / 2;
      bedMesh.position.set(LAKE_BASIN.x, LAKE_BASIN.waterLevel, LAKE_BASIN.z);
      bedMesh.updateMatrixWorld();
      const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
      let checked = 0;
      for (let x = -17; x <= 17; x += 3.4)
        for (let z = -12; z <= 12; z += 2.4) {
          const wx = LAKE_BASIN.x + x,
            wz = LAKE_BASIN.z + z;
          const height = sampleLakeBasinHeight(wx, wz);
          if (height === undefined) continue;
          ray.ray.origin.set(wx, 4, wz);
          expect(ray.intersectObject(mesh)).toHaveLength(0);
          const hit = ray.intersectObject(bedMesh)[0];
          expect(hit).toBeDefined();
          expect(height).toBeCloseTo(hit.point.y, 5);
          expect(
            sampleTerrainGroundHeight(wx, wz, segments) + SITE_LAYOUT.datum.terrain
          ).toBeCloseTo(hit.point.y, 5);
          checked++;
        }
      expect(checked).toBeGreaterThan(70);
      for (const [x, z] of [
        [95, 120],
        [145, 120],
        [120, 100],
        [120, 140],
        [34, -118],
        [0, 0],
      ]) {
        expect(sampleLakeBasinHeight(x, z)).toBeUndefined();
        expect(sampleTerrainGroundHeight(x, z, segments)).toBe(
          sampleTerrainGridHeight(x, z, segments)
        );
      }
      const area = (g: THREE.BufferGeometry) => {
        const p = g.getAttribute('position'),
          index = g.index!;
        let sum = 0;
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i),
            b = index.getX(i + 1),
            c = index.getX(i + 2);
          sum +=
            Math.abs(
              (p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) -
                (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a))
            ) / 2;
        }
        return sum;
      };
      expect(Math.abs(area(ground) + area(bed) - 1200 * 1200)).toBeLessThan(0.1);
      ground.dispose();
      bed.dispose();
      material.dispose();
    }
  );
});
