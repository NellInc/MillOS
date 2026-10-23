import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { UTILITY_ASSET_DEFINITIONS } from '../../constants/utilityAssets';
import { TANK_FARM_PAD_SIZE } from '../../textures/tankFarmPad';
import { vesselSeamOffset } from '../FactoryExterior';
import { VESSEL_SADDLE } from './utilityVesselDetails';
import { YARD_GRATING_STEEL, YARD_KERB_CONCRETE } from './ServiceYardDressing';
import {
  TANK_FARM_MANIFOLD,
  TANK_FARM_PAD_TOP,
  YARD_DRAINS,
  YARD_INTAKE,
  manifoldDropX,
  YARD_DRAIN,
  slotDrainBounds,
  slotDrainKerbs,
  slotDrainPlates,
  tankUndersideY,
  yardIntakeBounds,
  type ManifoldTank,
} from './serviceYardDressingLayout';

const tanks: ManifoldTank[] = UTILITY_ASSET_DEFINITIONS.filter(
  (asset) => asset.compound === 'tank_farm'
).map((asset) => ({
  z: asset.relativePosition[2],
  radius: asset.radius ?? 2.5,
  length: asset.length ?? 8,
  seamOffset: vesselSeamOffset(asset.radius ?? 2.5, asset.length ?? 8),
}));

const project = (
  name: 'tankFarm' | 'yard',
  point: readonly [number, number, number]
): { x: number; y: number } => {
  const view = SITE_LAYOUT.cameras[name] as {
    position: readonly number[];
    target: readonly number[];
    fov?: number;
  };
  const camera = new THREE.PerspectiveCamera(view.fov ?? 45, 16 / 9, 0.5, 300);
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.lookAt(view.target[0], view.target[1], view.target[2]);
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(...point).project(camera);
  return { x: ((v.x + 1) / 2) * 2560, y: ((1 - v.y) / 2) * 1440 };
};

/** Farm-local to world: the farm group is turned a quarter about y. */
const farmToWorld = (x: number, y: number, z: number): [number, number, number] => {
  const [cx, , cz] = SITE_LAYOUT.serviceYard.utilityTankFarm.position;
  const r = SITE_LAYOUT.serviceYard.utilityTankFarm.rotation;
  return [cx + x * Math.cos(r) + z * Math.sin(r), y, cz - x * Math.sin(r) + z * Math.cos(r)];
};

/**
 * final4-med-12 rubric, backlog 4: tank-farm's middle band (y 600-870 of
 * 1125, so 768-1114 of the 1440 capture) is an empty bund floor.
 */
describe('tank-farm manifold', () => {
  const m = TANK_FARM_MANIFOLD;
  const wall = TANK_FARM_PAD_SIZE.width / 2 - 0.14;

  it('runs the header across the bund floor, in front of every head and inside the walls', () => {
    expect(tanks).toHaveLength(3);
    for (const tank of tanks)
      expect(m.header.x - m.header.radius).toBeGreaterThan(tank.length / 2 + tank.radius + 0.5);
    expect(m.header.x + m.header.radius).toBeLessThan(wall - 0.5);
    expect(Math.max(Math.abs(m.header.z0), Math.abs(m.header.z1))).toBeLessThan(
      TANK_FARM_PAD_SIZE.depth / 2 - 0.5
    );
    for (const tank of tanks) {
      expect(tank.z).toBeGreaterThan(m.header.z0);
      expect(tank.z).toBeLessThan(m.header.z1);
    }
  });

  it('drops from each barrel clear of its saddles, to a valve and tray below the tank', () => {
    for (const tank of tanks) {
      const x = manifoldDropX(tank);
      expect(x).toBeLessThan(tank.seamOffset);
      expect(Math.abs(x - tank.length / 3)).toBeGreaterThan(
        VESSEL_SADDLE.wearPlate.width / 2 + 0.2
      );
      const underside = tankUndersideY(tank, TANK_FARM_PAD_TOP);
      expect(m.valve.x).toBeGreaterThan(x);
      expect(m.valve.x).toBeLessThan(m.header.x);
      // The valve's handwheel stays under the tank's underside.
      expect(m.header.y + m.valve.stem + m.valve.wheel).toBeLessThan(underside);
    }
    for (const z of m.standZs)
      for (const tank of tanks) expect(Math.abs(z - tank.z)).toBeGreaterThan(0.5);
    // The west service gap (local x -11) is untouched: everything is east of it.
    expect(Math.min(...tanks.map(manifoldDropX))).toBeGreaterThan(0);
  });

  it('sits in the tank-farm frame middle band', () => {
    for (const z of [m.header.z0 + 2, 0, m.header.z1 - 2]) {
      const p = project('tankFarm', farmToWorld(m.header.x, m.header.y, z));
      expect(p.y, `header at z ${z}`).toBeGreaterThan(768);
      expect(p.y).toBeLessThan(1114);
    }
  });
});

/** final4-med-12 rubric, backlog 4: the lower 40% of `yard` is bare apron. */
describe('yard intake and drains', () => {
  const garage = SITE_LAYOUT.serviceYard.maintenanceGarage;
  const garageReach = Math.max(...garage.footprint) / 2 + garage.clearance;
  const siloPadEast =
    SITE_LAYOUT.bulkStorage.siloPad.position[0] + SITE_LAYOUT.bulkStorage.siloPad.size[0] / 2;
  const rects = [yardIntakeBounds(), ...YARD_DRAINS.map(slotDrainBounds)];

  it('keeps off the silo pad, the garage clearance and the perimeter fence', () => {
    for (const r of rects) {
      expect(r.minX).toBeGreaterThan(siloPadEast + 1);
      expect(r.maxX).toBeLessThan(SITE_LAYOUT.perimeter.maxX - 1.5);
      expect(r.minZ).toBeGreaterThan(garage.position[2] + garageReach);
      expect(r.maxZ).toBeLessThan(SITE_LAYOUT.perimeter.maxZ - 10);
    }
    // The drains do not cross the grate.
    const g = yardIntakeBounds();
    for (const r of rects.slice(1))
      expect(r.minX < g.maxX && g.minX < r.maxX && r.minZ < g.maxZ && g.minZ < r.maxZ).toBe(false);
  });

  it('lies on no vehicle route', () => {
    const points = Object.values(SITE_LAYOUT.routes.forklifts).flatMap(
      (route) => (route as { points?: readonly (readonly number[])[] }).points ?? []
    );
    expect(points.length).toBeGreaterThan(8);
    for (const r of rects)
      for (const p of points)
        expect(
          p[0] > r.minX - 3 && p[0] < r.maxX + 3 && p[2] > r.minZ - 3 && p[2] < r.maxZ + 3
        ).toBe(false);
  });

  it('covers each drain in slotted plates, and fills the yard frame lower band', () => {
    for (const drain of YARD_DRAINS) expect(slotDrainPlates(drain).length).toBeGreaterThan(20);
    const p = project('yard', [YARD_INTAKE.grate.x, 0, YARD_INTAKE.grate.z]);
    expect(p.y).toBeGreaterThan(0.6 * 1440);
    expect(p.y).toBeLessThan(1440);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(2560);
  });
});

/**
 * judge-r5-1830 silos-ground / yard-ground: the silo-edge drain read as a stray
 * thin blue line and the grate bars as blue. Both were the galvanised finish at
 * metalness 0.6, mirroring the dusk sky on an upward-facing surface, and the
 * drain was 0.3 m of that and nothing else.
 */
describe('yard drain and grate finish', () => {
  it('paints grating and drain covers in neutral, low-metal steel that cannot mirror the sky', () => {
    expect(YARD_GRATING_STEEL.metalness).toBeLessThanOrEqual(0.3);
    expect(YARD_GRATING_STEEL.roughness).toBeGreaterThanOrEqual(0.6);
    const { r, g, b } = YARD_GRATING_STEEL.color;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.012);
  });

  it('edges each drain with concrete kerbs either side, so it reads as a channel', () => {
    for (const drain of YARD_DRAINS) {
      const kerbs = slotDrainKerbs(drain);
      expect(kerbs).toHaveLength(2);
      const along = Math.abs(drain.to[0] - drain.from[0]) > 0;
      for (const kerb of kerbs) {
        const across = along ? kerb.size[1] : kerb.size[0];
        expect(across).toBeGreaterThanOrEqual(0.1);
        // Flush with the channel's edge, either side.
        const offset = along ? Math.abs(kerb.z - drain.from[1]) : Math.abs(kerb.x - drain.from[0]);
        expect(offset).toBeCloseTo(YARD_DRAIN.width / 2 + across / 2, 6);
      }
      // The bounds every placement test above uses include the kerbs.
      const bounds = slotDrainBounds(drain);
      const half = YARD_DRAIN.width / 2 + YARD_DRAIN.kerb;
      if (along) expect(bounds.maxZ - bounds.minZ).toBeCloseTo(2 * half, 6);
      else expect(bounds.maxX - bounds.minX).toBeCloseTo(2 * half, 6);
      // Light concrete either side of a dark steel cover.
      const luma = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma(YARD_KERB_CONCRETE.color)).toBeGreaterThan(1.5 * luma(YARD_GRATING_STEEL.color));
      // Six pixels or more across at the yard camera, mid-run.
      const mx = (drain.from[0] + drain.to[0]) / 2;
      const mz = (drain.from[1] + drain.to[1]) / 2;
      const a = project('yard', along ? [mx, 0, mz - half] : [mx - half, 0, mz]);
      const b = project('yard', along ? [mx, 0, mz + half] : [mx + half, 0, mz]);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(6);
    }
  });
});
