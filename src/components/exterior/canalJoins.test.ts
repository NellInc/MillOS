import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CANAL_OUTLET_STONES } from '../FactoryExterior';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  CANAL_OUTLET,
  canalClosedEndSpec,
  canalEastBankSections,
  canalHeads,
  createCanalOutletSurface,
} from './canalOutletGeometry';

// 2026-11-07, Nell: "Canal end near river, end is fucked", "Z-fighting here
// also", "The other end of the canal isn't flush either." The canal ran 1 m past
// the outlet to an open end whose water hung over the grass, a 1 m bank stub
// shared a plane with the outlet wall's end, and the closed head stood 0.5 m
// proud of the banks. These pin the assembled ring of stone and water in world
// space, at a millimetre.
const MM = 1e-3;
const canal = SITE_LAYOUT.exteriorFeatures.canal;
const [cx, , cz] = canal.position;
const heads = canalHeads(canal.length, cz);
const box = (min: [number, number, number], max: [number, number, number]) =>
  new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
const centred = (position: readonly number[], size: readonly number[]) =>
  new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(...(position as [number, number, number])),
    new THREE.Vector3(...(size as [number, number, number]))
  );

// The main canal's own stone, as the Canal component places it.
const westBank = box(
  [cx - canal.width / 2 - 0.5, -0.45, cz + heads.north],
  [cx - canal.width / 2 + 0.5, 1.05, cz + heads.south]
);
const eastBanks = canalEastBankSections(canal.length, cz).map(([start, end]) =>
  box([cx + canal.width / 2 - 0.5, -0.45, cz + start], [cx + canal.width / 2 + 0.5, 1.05, cz + end])
);
const closed = canalClosedEndSpec(canal.width, canal.length);
const closedHead = centred([cx, closed.position[1], cz + closed.position[2]], closed.size);
const stones = CANAL_OUTLET_STONES.map(({ position, size, coping }) => ({
  bounds: centred(position, size),
  coping: coping === true,
}));
const walls = stones.filter((s) => !s.coping && s.bounds.max.y > CANAL_OUTLET.wallTop - MM);
const copings = stones.filter((s) => s.coping).map((s) => s.bounds);
const southWall = walls.find((w) => w.bounds.min.z > CANAL_OUTLET.south - MM)!.bounds;
const northWall = walls.find(
  (w) => Math.abs(w.bounds.max.z - (CANAL_OUTLET.south - CANAL_OUTLET.width)) < MM
)!.bounds;
const water = {
  minX: cx - (canal.width - 1) / 2,
  maxX: cx + (canal.width - 1) / 2,
  minZ: cz + heads.north,
  maxZ: cz + heads.south,
};

describe('main canal ring of walls and water', () => {
  it('closes both heads at the banks height, with no stone volume shared', () => {
    const ring = [westBank, ...eastBanks, closedHead, southWall, northWall];
    for (const piece of [westBank, ...eastBanks, closedHead]) {
      expect(piece.max.y).toBeCloseTo(CANAL_OUTLET.wallTop, 6);
      expect(piece.max.x - piece.min.x).toBeCloseTo(piece === closedHead ? canal.width + 1 : 1, 6);
    }
    for (let a = 0; a < ring.length; a++)
      for (let b = a + 1; b < ring.length; b++) {
        const overlap = ring[a].clone().intersect(ring[b]);
        if (overlap.isEmpty()) continue;
        const size = overlap.getSize(new THREE.Vector3());
        expect(size.x * size.y * size.z, `pieces ${a} and ${b}`).toBeLessThan(1e-9);
      }
  });

  it('meets every corner within a millimetre', () => {
    // Closed head: outer face flush with the bank ends; spans both outer faces.
    expect(Math.abs(closedHead.max.z - (cz + canal.length / 2))).toBeLessThan(MM);
    expect(Math.abs(closedHead.min.z - westBank.max.z)).toBeLessThan(MM);
    expect(Math.abs(closedHead.min.x - westBank.min.x)).toBeLessThan(MM);
    expect(Math.abs(closedHead.max.x - eastBanks[0].max.x)).toBeLessThan(MM);
    expect(Math.abs(closedHead.min.z - eastBanks[0].max.z)).toBeLessThan(MM);
    // North head is the outlet's north wall, carried to the west bank's outer face.
    expect(Math.abs(northWall.min.x - westBank.min.x)).toBeLessThan(MM);
    expect(Math.abs(northWall.max.z - westBank.min.z)).toBeLessThan(MM);
    // East bank butts the outlet's south wall, which spans the bank's thickness.
    expect(eastBanks).toHaveLength(1);
    expect(Math.abs(eastBanks[0].min.z - southWall.max.z)).toBeLessThan(MM);
    expect(Math.abs(southWall.min.x - eastBanks[0].min.x)).toBeLessThan(MM);
  });

  it('keeps the water inside the wall faces and meets the outlet water at one edge', () => {
    expect(Math.abs(water.minX - westBank.max.x)).toBeLessThan(MM);
    expect(Math.abs(water.maxX - eastBanks[0].min.x)).toBeLessThan(MM);
    expect(Math.abs(water.minZ - northWall.max.z)).toBeLessThan(MM);
    expect(Math.abs(water.maxZ - closedHead.min.z)).toBeLessThan(MM);
    // Outlet water starts at the canal's east water edge, at the same level.
    const surface = createCanalOutletSurface();
    surface.computeBoundingBox();
    // Shape XY maps to world X, -Z under the -PI/2 X rotation.
    expect(Math.abs(surface.boundingBox!.min.x - water.maxX)).toBeLessThan(MM);
    expect(CANAL_OUTLET.upperLevel).toBeCloseTo(0.15, 6);
    surface.dispose();
    // Nothing beyond the heads: a point 5 cm past either one is stone, not water.
    for (const z of [water.minZ - 0.05, water.maxZ + 0.05]) {
      const p = new THREE.Vector3(cx, 0.15, z);
      expect(northWall.containsPoint(p) || closedHead.containsPoint(p)).toBe(true);
    }
  });

  it('butts every outlet coping onto its neighbour within a millimetre', () => {
    // Each north-running coping ends on a cross coping's face, flush outside.
    const runners = copings.filter((c) => c.max.z - c.min.z > c.max.x - c.min.x);
    const cross = copings.filter((c) => c.max.x - c.min.x > c.max.z - c.min.z);
    expect(runners).toHaveLength(2);
    for (const runner of runners) {
      const host = cross.find(
        (c) => Math.abs(c.min.z - runner.max.z) < MM && c.min.x <= runner.min.x + MM
      );
      expect(host, 'cross coping under the runner end').toBeDefined();
      expect(
        Math.min(Math.abs(host!.max.x - runner.max.x), Math.abs(host!.min.x - runner.min.x))
      ).toBeLessThan(MM);
    }
    for (const c of copings) expect(c.min.y).toBeCloseTo(CANAL_OUTLET.wallTop, 6);
  });
});
