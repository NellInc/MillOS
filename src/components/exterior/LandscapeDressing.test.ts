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
  CANAL_WEIR_IMPACT,
  CANAL_WEIR_PROFILE,
  canalEastBankSections,
  canalClosedEndSpec,
  createCanalClosedEndGeometry,
  createCanalOutletSurface,
  createCanalWeirCurtain,
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
  it('authors one bounded, asymmetric mineral-coloured outcrop', () => {
    const g = MEADOW_STONE_GEOMETRY;
    const old = new THREE.DodecahedronGeometry(0.6, 0);
    expect(g.getAttribute('position').count).toBe(old.getAttribute('position').count);
    expect(Array.from(g.getAttribute('position').array)).not.toEqual(
      Array.from(old.getAttribute('position').array)
    );
    const colours = g.getAttribute('color');
    expect(colours.count).toBe(g.getAttribute('position').count);
    expect([...colours.array, ...g.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
    expect(Math.max(...colours.array) - Math.min(...colours.array)).toBeGreaterThan(0.05);
    expect(g.boundingSphere!.radius).toBeLessThan(0.61);
    old.dispose();
  });
  it.each([64, 128])(
    'buries stone centres beneath the surrounding slope on the %i grid',
    (segments) => {
      for (const item of meadowTransforms(segments, true)) {
        const radius =
          MEADOW_STONE_GEOMETRY.boundingSphere!.radius * Math.max(item.scale[0], item.scale[2]);
        for (let j = 0; j < 8; j++) {
          const a = (j * Math.PI) / 4;
          expect(item.position[1] + item.scale[1] * 0.16).toBeLessThanOrEqual(
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
    // Each bank stub ends INSIDE the 0.8 m outlet wall it meets, not flush with
    // its face: flush, the stub's end and the wall's face were coplanar
    // (10 m^2 at z -114 down the deep footing, 1.5 m^2 at z -106).
    const stubEnd = sections[0][1] + canal.position[2];
    const opening = CANAL_OUTLET.south - CANAL_OUTLET.width;
    expect(stubEnd).toBeLessThan(opening - 0.005);
    expect(stubEnd).toBeGreaterThan(opening - 0.8);
    const stubStart = sections[1][0] + canal.position[2];
    expect(stubStart).toBeGreaterThan(CANAL_OUTLET.south + 0.005);
    expect(stubStart).toBeLessThan(CANAL_OUTLET.south + 0.8);
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
  it('bakes a bounded lit damp waterline without moving the stone silhouette', () => {
    const origin = [CANAL_OUTLET.east, -1.725, CANAL_OUTLET.north + 4] as const;
    const g = createOutletStoneGeometry(0.8, 5.55, 20, origin);
    const p = g.getAttribute('position'),
      c = g.getAttribute('color');
    expect(c.count).toBe(p.count);
    expect([...c.array].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    expect(g.index!.count / 3).toBeLessThan(1600);
    const top: number[] = [],
      bottom: number[] = [];
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) + origin[1] > CANAL_OUTLET.upperLevel + 0.5) top.push(c.getX(i));
      if (p.getY(i) + origin[1] < CANAL_OUTLET.upperLevel - 0.4) bottom.push(c.getX(i));
    }
    expect(Math.min(...top)).toBe(1);
    expect(Math.max(...bottom)).toBeLessThan(0.7);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(5.55 / 2);
    expect(g.boundingBox!.max.z).toBe(10);
    const coping = createOutletStoneGeometry(20, 0.18, 0.92, [0, 1.14, 0], true);
    expect([...coping.getAttribute('color').array].every((v) => v === 1)).toBe(true);
    coping.computeBoundingBox();
    expect(coping.boundingBox!.max.x).toBeCloseTo(10);
    expect(coping.boundingBox!.max.y).toBeCloseTo(0.09);
    expect(coping.getAttribute('position').count / 3).toBeLessThanOrEqual(300);
    expect([...coping.getAttribute('normal').array].some((v) => v > 0.1 && v < 0.9)).toBe(true);
    const cp = coping.getAttribute('position'),
      cuv = coping.getAttribute('uv');
    let worstUvPerMetre = 0;
    for (let i = 0; i < cp.count; i += 3)
      for (let edge = 0; edge < 3; edge++) {
        const a = i + edge,
          b = i + ((edge + 1) % 3);
        const metres = Math.hypot(
          cp.getX(a) - cp.getX(b),
          cp.getY(a) - cp.getY(b),
          cp.getZ(a) - cp.getZ(b)
        );
        const texture = Math.hypot(cuv.getX(a) - cuv.getX(b), cuv.getY(a) - cuv.getY(b));
        if (metres > 1e-7) worstUvPerMetre = Math.max(worstUvPerMetre, texture / metres);
      }
    expect(worstUvPerMetre).toBeLessThanOrEqual(0.501);
    g.dispose();
    coping.dispose();
  });
  it('joins the apron edge to the actual landing with a bounded, smooth curved curtain', () => {
    const g = createCanalWeirCurtain();
    const p = g.getAttribute('position'),
      n = g.getAttribute('normal'),
      uv = g.getAttribute('uv');
    const h = CANAL_OUTLET.upperLevel - CANAL_OUTLET.lowerLevel;
    const transform = new THREE.Matrix4().makeRotationY(Math.PI);
    transform.setPosition(
      CANAL_WEIR_IMPACT.position[0],
      (CANAL_OUTLET.upperLevel + CANAL_OUTLET.lowerLevel) / 2,
      CANAL_OUTLET.north - CANAL_WEIR_PROFILE.flatOffset
    );
    const top = new THREE.Vector3().fromBufferAttribute(p, 12).applyMatrix4(transform);
    const bottom = new THREE.Vector3().fromBufferAttribute(p, p.count - 13).applyMatrix4(transform);
    expect(top.y).toBeCloseTo(CANAL_OUTLET.upperLevel, 6);
    expect(top.z).toBeCloseTo(CANAL_OUTLET.north, 6);
    expect(bottom.y).toBeCloseTo(CANAL_OUTLET.lowerLevel, 6);
    expect(bottom.z).toBeCloseTo(CANAL_WEIR_IMPACT.position[1], 6);
    expect(CANAL_OUTLET.north - bottom.z).toBeCloseTo(0.4296, 4);
    expect(n.getY(12)).toBeGreaterThan(0.98);
    expect(n.getZ(p.count - 13)).toBeGreaterThan(0.99);
    expect(uv.getY(12)).toBe(1);
    expect(uv.getY(p.count - 13)).toBeCloseTo(0);
    expect(g.index!.count / 3).toBe(960);
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeLessThanOrEqual(h / 2 + 1e-6);
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      if (uv.getY(i) < 0.999) expect(p.getZ(i)).toBeGreaterThan(-CANAL_WEIR_PROFILE.flatOffset);
    }
    expect([...p.array, ...n.array, ...uv.array].every(Number.isFinite)).toBe(true);
    g.dispose();
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

it.each([64, 128])(
  'keeps the receiving plume core below water on the actual %i terrain grid',
  (segments) => {
    expect(CANAL_WEIR_IMPACT.position).toEqual([
      CANAL_OUTLET.east - CANAL_OUTLET.width / 2,
      CANAL_OUTLET.north -
        (CANAL_WEIR_PROFILE.radius +
          (CANAL_OUTLET.upperLevel - CANAL_OUTLET.lowerLevel - CANAL_WEIR_PROFILE.radius) *
            CANAL_WEIR_PROFILE.fallSlope),
    ]);
    expect(CANAL_WEIR_IMPACT.halfWidth).toBe(CANAL_OUTLET.width / 2);
    expect(CANAL_WEIR_IMPACT.runMetres).toBe(5);
    const [x, z] = CANAL_WEIR_IMPACT.position;
    for (const across of [-0.7, 0, 0.7]) {
      for (const run of [0.15, 1, 3, 4.8]) {
        const ground =
          SITE_LAYOUT.datum.terrain +
          sampleTerrainGroundHeight(
            x + across * CANAL_WEIR_IMPACT.halfWidth + run * 0.18,
            z - run,
            segments
          );
        expect(ground).toBeLessThan(CANAL_OUTLET.lowerLevel - 0.2);
      }
    }
  }
);

it('closes the actual non-river canal head with solid stone, seated between the original banks', () => {
  const canal = SITE_LAYOUT.exteriorFeatures.canal;
  const end = canalClosedEndSpec(canal.width, canal.length);
  const geometry = createCanalClosedEndGeometry(canal.width);
  const cap = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  cap.position.fromArray(end.position);
  cap.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(cap);
  expect(canal.position[2] + end.position[2]).toBe(105);
  expect(bounds.min.y).toBeCloseTo(-0.45);
  expect(bounds.max.y).toBeCloseTo(1.05);
  for (const x of [-5.49, -3, 0, 3, 5.49]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 0.15, canal.length / 2 - 2),
      new THREE.Vector3(0, 0, 1),
      0,
      4
    );
    expect(ray.intersectObject(cap)[0]?.point.z).toBeCloseTo(canal.length / 2 - 0.5);
  }
  for (const side of [-1, 1]) {
    const bank = new THREE.Box3(
      new THREE.Vector3((side * canal.width) / 2 - 0.5, -0.45, -canal.length / 2),
      new THREE.Vector3((side * canal.width) / 2 + 0.5, 1.05, canal.length / 2)
    );
    const overlap = bounds.clone().intersect(bank).getSize(new THREE.Vector3());
    expect(overlap.x).toBeCloseTo(0);
    expect(overlap.y).toBeCloseTo(1.5);
    expect(overlap.z).toBeCloseTo(0.5);
  }
  expect(bounds.min.z).toBeGreaterThan(0);
  expect(CANAL_OUTLET.south).toBeLessThan(canal.position[2]);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const front = [...Array(position.count).keys()].filter((i) => normal.getZ(i) < -0.5);
  const u = front.map((i) => uv.getX(i) * 110);
  expect(Math.max(...u) - Math.min(...u)).toBeCloseTo((canal.width - 1) / 2);
  expect((geometry.index?.count ?? position.count) / 3).toBe(12);
  geometry.dispose();
  (cap.material as THREE.Material).dispose();
});
