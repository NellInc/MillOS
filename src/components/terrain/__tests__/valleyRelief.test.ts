import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDisplacedGeometry } from '../TerrainGround';
import {
  getRiverHeightfield,
  MILLOS_RIVER_CONFIG,
  sampleTerrainGroundHeight,
  sampleValleyGroundHeight,
  sampleValleyRelief,
  VALLEY_HILLS,
  VILLAGE_TERRACE,
} from '../splatMapGenerator';
import { getTerrainGridSegments, TERRAIN_BOUNDS } from '../terrainTypes';
import {
  SITE_LAYOUT,
  getLandmarkBounds,
  getServiceAssetBounds,
} from '../../../constants/siteLayout';
import {
  LANDSCAPE_GROVE_TREES,
  MAIN_EXTERIOR_TREES,
  groundedTreePosition,
} from '../../exterior/ExteriorVegetation';
import { CASTLE_ROCK_SINK } from '../../scenery/FairytaleCastle';

describe('valley meadow relief', () => {
  it('raises unoccupied groves while preserving every occupied site pad', () => {
    for (const [x, z] of VALLEY_HILLS) expect(sampleValleyRelief(x, z)).toBeGreaterThan(2);
    const pads = [
      SITE_LAYOUT.factory.bounds,
      ...Object.values(SITE_LAYOUT.serviceYard).map((asset) => getServiceAssetBounds(asset)),
      getLandmarkBounds(SITE_LAYOUT.landmarks.farm),
      ...Object.values(SITE_LAYOUT.docks).map((dock) => dock.apron),
    ];
    const violations: string[] = [];
    for (const segments of [64, 128])
      for (const pad of pads) {
        for (let x = pad.minX; x <= pad.maxX; x += 2)
          for (let z = pad.minZ; z <= pad.maxZ; z += 2) {
            if (sampleValleyGroundHeight(x, z, segments) > 0.001)
              violations.push(`${segments}: ${x}, ${z}`);
          }
      }
    expect(violations).toEqual([]);
  });

  it.each([64, 128])('keeps the complete northern truck road level at %i segments', (segments) => {
    // Level from the yard to the tunnel portal at z = -220 and past it.
    for (let x = -28; x <= -12; x += 2)
      for (let z = -230; z <= -180; z += 2)
        expect(sampleValleyGroundHeight(x, z, segments), `${x}, ${z}`).toBe(0);
    // The v0.30 village stands at grade, so it needs no terrace.
    expect(SITE_LAYOUT.landmarks.village.position[1]).toBe(0);
    expect(VILLAGE_TERRACE.height).toBe(0);
  });

  it.each([
    ['village', 64],
    ['village', 128],
    ['castle', 64],
    ['castle', 128],
  ] as const)(
    'keeps the %s attached to the actual canyon mesh at %i segments',
    (landmark, segments) => {
      const heightfield = getRiverHeightfield();
      const geometry = createDisplacedGeometry(
        1200,
        1200,
        segments,
        heightfield.data,
        heightfield.resolution,
        MILLOS_RIVER_CONFIG.depth,
        TERRAIN_BOUNDS
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = SITE_LAYOUT.datum.terrain;
      mesh.updateMatrixWorld(true);
      const pad = getLandmarkBounds(SITE_LAYOUT.landmarks[landmark]);
      const heights: Array<{ x: number; z: number; height: number }> = [];
      for (let xi = 0; xi <= Math.ceil((pad.maxX - pad.minX) / 8); xi++)
        for (let zi = 0; zi <= Math.ceil((pad.maxZ - pad.minZ) / 8); zi++) {
          // Off-grid inset: a pad edge can fall exactly on a grid line (the
          // village's x = -225 is 12 cells of 18.75 m), where a ray hits both
          // triangles of a shared edge, or slips between them.
          const x = Math.min(pad.minX + 0.637 + xi * 8, pad.maxX - 0.637);
          const z = Math.min(pad.minZ + 0.711 + zi * 8, pad.maxZ - 0.711);
          // The castle stands at 45 degrees, so the corners of its axis-aligned
          // box are empty air: the keep's footprint is the inscribed circle.
          const castle = SITE_LAYOUT.landmarks.castle;
          if (
            landmark === 'castle' &&
            Math.hypot(x - castle.position[0], z - castle.position[2]) >
              (Math.min(...castle.footprint) * castle.scale) / 2
          )
            continue;
          const hits = new THREE.Raycaster(
            new THREE.Vector3(x, 40, z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObject(mesh);
          expect(hits).toHaveLength(1);
          heights.push({ x, z, height: hits[0].point.y });
        }
      const groundDatum =
        SITE_LAYOUT.datum.terrain + (landmark === 'village' ? VILLAGE_TERRACE.height : 0);
      // The castle's rock is seated CASTLE_ROCK_SINK into the ground, so the
      // ground may fall that far below the datum without opening a gap.
      const tolerance =
        landmark === 'castle' ? CASTLE_ROCK_SINK * SITE_LAYOUT.landmarks.castle.scale : 0.03;
      expect(
        heights.filter(
          ({ height }) => height > groundDatum + 0.03 || groundDatum - height >= tolerance
        )
      ).toEqual([]);
      expect(Math.abs(pad.minY - heights[0].height)).toBeLessThan(0.03);
      if (landmark === 'castle') expect(pad.minY).toBeCloseTo(heights[0].height, 4);
      geometry.dispose();
      material.dispose();
    }
  );

  it.each(['low', 'medium', 'high', 'ultra'])(
    'seats real tree feet on the %s terrain triangles',
    (quality) => {
      const segments = getTerrainGridSegments(quality);
      // The mesh TerrainGround actually builds: canyon heightfield included,
      // so a tree on a river bank is seated on the bank, not above it.
      const heightfield = getRiverHeightfield();
      const geometry = createDisplacedGeometry(
        1200,
        1200,
        segments,
        heightfield.data,
        heightfield.resolution,
        MILLOS_RIVER_CONFIG.depth,
        TERRAIN_BOUNDS
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.updateMatrixWorld(true);
      expect(geometry.attributes.position.count).toBeLessThan(17_000);
      const trees = LANDSCAPE_GROVE_TREES.filter(
        ({ position: [x, , z] }) => sampleValleyGroundHeight(x, z, segments) > 0.1
      );
      expect(trees.length).toBeGreaterThan(30);
      // The river trees stand where the canyon's bank shoulders out, which the
      // meadow relief alone reports as flat.
      trees.push(
        ...MAIN_EXTERIOR_TREES.filter(
          ({ position: [x, , z] }) => Math.abs(sampleTerrainGroundHeight(x, z, segments)) > 0.01
        )
      );
      for (const tree of trees) {
        const [x, y, z] = groundedTreePosition(tree.position, quality);
        const hits = new THREE.Raycaster(
          new THREE.Vector3(x, 40, z),
          new THREE.Vector3(0, -1, 0)
        ).intersectObject(mesh);
        expect(hits).toHaveLength(1);
        expect(hits[0].point.y).toBeCloseTo(y, 4);
      }
      geometry.dispose();
      material.dispose();
    }
  );
});
