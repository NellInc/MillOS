import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  COTTAGE_GARDENS,
  LANDSCAPE_HEDGES,
  landscapeCrownTransforms,
  meadowTransforms,
  meadowSiteClear,
  MEADOW_STONE_GEOMETRY,
  landscapeGrassSpec,
} from './LandscapeDressing';
import { clutterPlacements } from '../scenery/InstancedFoliage';
import { HEDGE_CROWN_GEOMETRY } from './HedgeFoliage';
import {
  sampleTerrainGroundHeight,
  sampleValleyGroundHeight,
  sampleValleyRelief,
  VALLEY_HOLLOWS,
  MILLOS_RIVER_CONFIG,
} from '../terrain/splatMapGenerator';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../../constants/siteLayout';
import {
  CANAL_OUTLET,
  canalEastBankSections,
  createCanalOutletSurface,
  createOutletStoneGeometry,
} from './canalOutletGeometry';

function distanceToSegment(x: number, z: number, row: (typeof LANDSCAPE_HEDGES)[number]) {
  const dx = row.end[0] - row.start[0],
    dz = row.end[1] - row.start[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - row.start[0]) * dx + (z - row.start[1]) * dz) / (dx * dx + dz * dz))
  );
  return Math.hypot(x - row.start[0] - t * dx, z - row.start[1] - t * dz) - row.width / 2;
}

describe('authored landscape cohesion', () => {
  it.each([64, 128])(
    'grounds scrub and buries stone feet on the real %i grid, clear of routes',
    (segments) => {
      const shrubs = meadowTransforms(segments);
      const stones = meadowTransforms(segments, true);
      expect(shrubs.length).toBeGreaterThan(120);
      expect(shrubs.length + landscapeCrownTransforms(segments).length).toBeLessThan(1500);
      expect(stones.length).toBeGreaterThan(25);
      expect(
        (stones.length * MEADOW_STONE_GEOMETRY.getAttribute('position').count) / 3
      ).toBeLessThan(3000);
      for (const item of [...shrubs, ...stones]) {
        expect(
          [...item.position, ...item.scale, item.angle, item.tint].every(Number.isFinite)
        ).toBe(true);
        expect(
          meadowSiteClear(
            item.position[0],
            item.position[2],
            Math.max(item.scale[0], item.scale[2])
          )
        ).toBe(true);
      }
      for (const item of shrubs) {
        const foot = item.position[1] - item.scale[1] / 2;
        const radius = Math.hypot(item.scale[0], item.scale[2]) / 2;
        for (let j = 0; j < 8; j++) {
          const a = (j * Math.PI) / 4;
          expect(foot).toBeLessThanOrEqual(
            SITE_LAYOUT.datum.terrain +
              sampleTerrainGroundHeight(
                item.position[0] + Math.cos(a) * radius,
                item.position[2] + Math.sin(a) * radius,
                segments
              ) +
              1e-6
          );
        }
      }
      for (const item of stones)
        expect(item.position[1]).toBeLessThan(
          SITE_LAYOUT.datum.terrain +
            sampleTerrainGroundHeight(item.position[0], item.position[2], segments)
        );
      expect(meadowTransforms(segments)).toEqual(shrubs);
    }
  );
  it.each([64, 128])(
    'grounds every crown on the real %i grid with a bounded instance budget',
    (segments) => {
      const crowns = landscapeCrownTransforms(segments);
      expect(crowns.length).toBeLessThan(1500);
      expect(
        (crowns.length * HEDGE_CROWN_GEOMETRY.getAttribute('position').count) / 3
      ).toBeLessThan(150000);
      for (const c of crowns) {
        expect(c.position[1] - c.scale[1] / 2).toBeCloseTo(
          SITE_LAYOUT.datum.terrain +
            sampleTerrainGroundHeight(c.position[0], c.position[2], segments),
          6
        );
        expect([...c.position, ...c.scale, c.angle, c.tint].every(Number.isFinite)).toBe(true);
      }
    }
  );
  it('keeps cottage approaches and both crop-field gates open', () => {
    for (const [x, z] of COTTAGE_GARDENS) {
      for (let offset = 4; offset <= 12; offset += 0.5) {
        const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [
          x - Math.sign(x) * offset,
          0,
          z,
        ]);
        expect(
          Math.min(...LANDSCAPE_HEDGES.map((row) => distanceToSegment(wx, wz, row)))
        ).toBeGreaterThan(1.5);
      }
    }
    for (const z of [144, 181])
      expect(
        Math.min(...LANDSCAPE_HEDGES.map((row) => distanceToSegment(75, z, row)))
      ).toBeGreaterThan(3);
  });
  it.each([64, 128])('keeps shallow hollows dry on the %i grid', (segments) => {
    for (const [x, z] of VALLEY_HOLLOWS) {
      expect(sampleValleyRelief(x, z)).toBeLessThan(-0.4);
      expect(sampleValleyGroundHeight(x, z, segments)).toBeLessThan(-0.25);
      expect(sampleValleyGroundHeight(x, z, segments) + SITE_LAYOUT.datum.terrain).toBeGreaterThan(
        MILLOS_RIVER_CONFIG.waterLevel + 0.5
      );
    }
  });
});

describe('continuous canal-to-river overflow', () => {
  it('meets an actual bank opening without overlapping the main water plane', () => {
    const canal = SITE_LAYOUT.exteriorFeatures.canal;
    expect(CANAL_OUTLET.west).toBe(canal.position[0] + (canal.width - 1) / 2);
    const sections = canalEastBankSections(canal.length, canal.position[2]);
    expect(sections[0][1] + canal.position[2]).toBe(CANAL_OUTLET.south - CANAL_OUTLET.width);
    expect(sections[1][0] + canal.position[2]).toBe(CANAL_OUTLET.south);
    expect(sections.every(([a, b]) => b > a)).toBe(true);
    const g = createCanalOutletSurface();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CANAL_OUTLET.upperLevel;
    mesh.updateMatrixWorld(true);
    for (const [x, z] of [
      [-139.49, -110.23],
      [-129, -110.23],
      [-114, -111.23],
      [-114, -117.23],
      [-114, -125.99],
    ]) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(x, 5, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(0.15);
    }
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(-133, 5, -120),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(mesh)
    ).toHaveLength(0);
    g.dispose();
    mesh.material.dispose();
  });
  it.each([64, 128])('lands the entire weir mouth inside the %i river channel', (segments) => {
    for (let x = CANAL_OUTLET.east - CANAL_OUTLET.width; x <= CANAL_OUTLET.east; x += 0.5) {
      const floor =
        SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, CANAL_OUTLET.north, segments);
      expect(floor).toBeLessThan(CANAL_OUTLET.lowerLevel - 0.2);
      expect(CANAL_OUTLET.foundation).toBeLessThan(floor);
    }
  });
  it('keeps stone UV scale independent of wall length', () => {
    for (const dimensions of [
      [0.8, 5.55, 20],
      [29.5, 0.18, 0.92],
    ] as const) {
      const g = createOutletStoneGeometry(...dimensions);
      const p = g.getAttribute('position'),
        uv = g.getAttribute('uv');
      expect([...p.array, ...uv.array].every(Number.isFinite)).toBe(true);
      expect(Math.max(...uv.array)).toBeGreaterThan(1);
      g.dispose();
    }
  });
});

describe('clustered rough-grass margins', () => {
  it.each([64, 128])(
    'roots the bounded field on the actual %i grid and clears hardstands',
    (segments) => {
      const spec = landscapeGrassSpec(segments, 0.35);
      const tufts = clutterPlacements(spec);
      expect(tufts.length).toBeGreaterThan(600);
      expect(tufts.length).toBeLessThanOrEqual(1050);
      expect(clutterPlacements(landscapeGrassSpec(segments, 0))).toHaveLength(0);
      expect(clutterPlacements(spec)).toEqual(tufts);
      for (const t of tufts) {
        expect(meadowSiteClear(t.x, t.z, 0.6)).toBe(true);
        for (const [cx, cz] of COTTAGE_GARDENS) {
          const [gx, , gz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [
            cx - Math.sign(cx) * 8,
            0,
            cz,
          ]);
          expect(Math.abs(t.x - gx) > 3 || Math.abs(t.z - gz) > 2.2).toBe(true);
        }
        expect(t.y).toBeCloseTo(
          SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(t.x, t.z, segments) - 0.025,
          7
        );
        expect(
          Math.min(...spec.attractors!.map((a) => Math.hypot(t.x - a[0], t.z - a[1])))
        ).toBeLessThan(2.61);
      }
    }
  );
});
