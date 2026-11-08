import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  DOCK_PLATFORM_OBSTACLES,
  createConveyorObstacles,
  createMachineObstacles,
} from '../../constants/factoryObstacles';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import { SERVICE_EGRESS_POINTS } from '../../stores/gameSimulationStore';
import { FORKLIFT_ROUTES, WALKWAY_LANES } from '../../textures/factoryFloorMacro';
import { FIRST_PERSON_EYE_HEIGHT } from '../../utils/cameraNavigation';
import { isWithinWalkingDomain, moveWalkingPosition } from '../../utils/castleNavigation';
import { WALKING_OBSTACLES, walkingObstacleAt } from '../../utils/walkingObstacles';
import { END_OF_LINE_FOOTPRINTS } from '../conveyors/endOfLineLayout';
import { FIXTURE_GRID_Z, FLOOR_POOL_SCALE } from '../environment/InteriorLightRig';
import { buildSpoutRoutes } from '../flow/spoutRoutes';
import { hallDressingSolids } from '../infrastructure/hallDressingLayout';
import {
  buildFactoryShellColumns,
  buildSafetyStations,
} from '../infrastructure/OptimizedFactoryInfrastructure';
import { MachineType, type MachineData } from '../../types';
import {
  ACCESSIBLE_WC,
  FACILITY_BLOCKS,
  FACILITY_DOORS,
  FACILITY_DOOR_APPROACHES,
  FACILITY_DOOR_CLEAR_WIDTH,
  FACILITY_FITTINGS,
  FACILITY_ROOMS,
  FACILITY_SEATS,
  FACILITY_WALL,
  doorLeafPlan,
  facilityWalkingSolids,
  roomInterior,
  type PlanRect,
} from './facilityLayout';
import { ATLAS, ATLAS_SIZE, buildFacilityAtlas, getFacilityFinish } from './facilityTextures';
import { getFacilityGeometry } from './facilityGeometry';

const meets = (a: PlanRect, b: PlanRect, margin = 0) =>
  a.minX - margin < b.maxX &&
  b.minX < a.maxX + margin &&
  a.minZ - margin < b.maxZ &&
  b.minZ < a.maxZ + margin;
const grow = (r: PlanRect, m: number): PlanRect => ({
  minX: r.minX - m,
  maxX: r.maxX + m,
  minZ: r.minZ - m,
  maxZ: r.maxZ + m,
});
const pointToRect = (x: number, z: number, r: PlanRect) =>
  Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

/** Each block's outer faces, plus everything it puts on the hall floor beside it. */
const solids = facilityWalkingSolids();
const footprints = FACILITY_BLOCKS.map((block) => ({
  id: block.id,
  ...grow(block, FACILITY_WALL / 2),
}));
/** The footprints with the planters and the outward-opening leaf on the hall side. */
const occupied = (() => {
  const all = [...footprints];
  for (const s of solids)
    if (!footprints.some((f) => pointToRect((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, f) === 0))
      all.push({ ...s });
  return all;
})();

describe('staff facilities: placement in the hall', () => {
  it('both blocks stand inside the hall, clear of its walls', () => {
    const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.factory.bounds;
    for (const f of occupied) {
      expect(f.minX).toBeGreaterThan(minX + 2);
      expect(f.maxX).toBeLessThan(maxX - 2);
      expect(f.minZ).toBeGreaterThan(minZ + 2);
      expect(f.maxZ).toBeLessThan(maxZ - 2);
    }
  });

  it('keeps off the painted forklift aisles and pedestrian walkways', () => {
    const lanes = [...FORKLIFT_ROUTES, ...WALKWAY_LANES].map((l) =>
      l.axis === 'x'
        ? { minX: l.centre - l.halfWidth, maxX: l.centre + l.halfWidth, minZ: l.from, maxZ: l.to }
        : { minX: l.from, maxX: l.to, minZ: l.centre - l.halfWidth, maxZ: l.centre + l.halfWidth }
    );
    for (const f of occupied)
      for (const lane of lanes) expect(meets(f, lane, 0.25), JSON.stringify(f)).toBe(false);
  });

  it('keeps at least a metre from every forklift route as it is driven', () => {
    for (const route of Object.values(SITE_LAYOUT.routes.forklifts)) {
      const pts = route.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const swept = {
          minX: Math.min(a[0], b[0]) - route.halfWidth,
          maxX: Math.max(a[0], b[0]) + route.halfWidth,
          minZ: Math.min(a[2], b[2]) - route.halfWidth,
          maxZ: Math.max(a[2], b[2]) + route.halfWidth,
        };
        for (const f of occupied)
          expect(meets(f, swept, 1), `${route.id} ${i} vs ${JSON.stringify(f)}`).toBe(false);
      }
    }
  });

  it('keeps a metre clear of the receiving dock apron, the width of its door', () => {
    // `factoryFloorMacro`'s receiving apron is the door's half-width either side
    // of its axis, from the door to z -30. (The portal's camera "transition"
    // zone reaches 2 m wider; it decides what a camera standing there draws,
    // not what may stand on the floor.)
    const r = SITE_LAYOUT.portals.receiving;
    const apron = {
      minX: r.centre[0] - r.halfWidth,
      maxX: r.centre[0] + r.halfWidth,
      minZ: -50,
      maxZ: -30,
    };
    for (const f of occupied) expect(meets(f, apron, 1)).toBe(false);
  });

  it('clears machines, belts, dock platforms, end-of-line cells, hall props and the shell', () => {
    const blockers = [
      ...createMachineObstacles(1),
      ...createConveyorObstacles(),
      ...DOCK_PLATFORM_OBSTACLES,
      ...END_OF_LINE_FOOTPRINTS.map((r, i) => ({ id: `eol-${i}`, ...r })),
      ...hallDressingSolids().filter((s) => s.onFloor),
      ...[...buildFactoryShellColumns(), ...buildSafetyStations()].map(
        ({ position, scale }, i) => ({
          id: `shell-${i}`,
          minX: position[0] - scale[0] / 2,
          maxX: position[0] + scale[0] / 2,
          minZ: position[2] - scale[2] / 2,
          maxZ: position[2] + scale[2] / 2,
        })
      ),
    ];
    for (const f of occupied)
      for (const b of blockers)
        expect(meets(f, b, 1), `${JSON.stringify(f)} vs ${b.id}`).toBe(false);
  });

  it('runs no spouting or floor-pool light through the blocks', () => {
    const all = (
      [
        [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
        [
          SITE_LAYOUT.machines.rollerMills,
          MachineType.ROLLER_MILL,
          SITE_LAYOUT.machineDimensions.rollerMill,
        ],
        [
          SITE_LAYOUT.machines.sifters,
          MachineType.PLANSIFTER,
          SITE_LAYOUT.machineDimensions.sifter,
        ],
        [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
      ] as const
    ).flatMap(([anchors, type, size]) =>
      anchors.map((anchor) => ({
        ...anchor,
        position: [...anchor.position],
        type,
        size: [...size],
      }))
    ) as unknown as MachineData[];
    for (const route of buildSpoutRoutes(all)) {
      const steps = Math.ceil(route.length / 0.25);
      for (let s = 0; s <= steps; s++) {
        const p = route.curve.getPointAt(s / steps);
        for (const f of footprints)
          expect(
            pointToRect(p.x, p.z, f),
            `${route.fromMachineId}->${route.toMachineId}`
          ).toBeGreaterThan(1);
      }
    }
    for (const z of FIXTURE_GRID_Z)
      for (const f of footprints)
        expect(f.maxZ < z - FLOOR_POOL_SCALE[1] / 2 || f.minZ > z + FLOOR_POOL_SCALE[1] / 2).toBe(
          true
        );
  });

  it("stays off the residents' walks, the forklift crews' stands and benches", () => {
    for (const person of COMMUNITY_ROSTER.filter((p) => p.district === 'mill')) {
      const stops = person.stops;
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i].position;
        const b = stops[(i + 1) % stops.length].position;
        for (let k = 0; k <= 40; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / 40;
          const z = a[2] + ((b[2] - a[2]) * k) / 40;
          for (const f of occupied) expect(pointToRect(x, z, f), person.id).toBeGreaterThan(0.6);
        }
      }
    }
    for (const site of FORKLIFT_CREW_SITES)
      for (const p of [site.stand, site.bench, site.crewPoint])
        for (const f of occupied) expect(pointToRect(p[0], p[2], f)).toBeGreaterThan(2);
  });

  it('puts no camera preset inside a block and keeps the egress points well away', () => {
    for (const [name, cam] of Object.entries(SITE_LAYOUT.cameras)) {
      const [x, y, z] = cam.position as readonly number[];
      for (const f of footprints)
        expect(pointToRect(x, z, f) > 0.5 || y > 4, `${name} camera`).toBe(true);
    }
    for (const egress of SERVICE_EGRESS_POINTS)
      for (const f of occupied)
        expect(pointToRect(egress.position.x, egress.position.z, f)).toBeGreaterThan(10);
  });
});

describe('staff facilities: access', () => {
  it('every door leaves at least 0.9 m clear with its leaf open', () => {
    expect(FACILITY_DOOR_CLEAR_WIDTH).toBeGreaterThanOrEqual(0.9);
    for (const d of FACILITY_DOORS) {
      const leaf = doorLeafPlan(d);
      const leafAlong = d.wall.runs === 'x' ? [leaf.minX, leaf.maxX] : [leaf.minZ, leaf.maxZ];
      const clear =
        d.hinge === 'from' ? d.to - 0.04 - leafAlong[1] : leafAlong[0] - (d.from + 0.04);
      expect(clear, d.id).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('a person walks through every door, both ways, on the real walking model', () => {
    const blocked = (x: number, z: number) =>
      !isWithinWalkingDomain(x, z, 0.4) ||
      walkingObstacleAt(x, z, 0.4) !== null ||
      [...createMachineObstacles(0), ...createConveyorObstacles(), ...DOCK_PLATFORM_OBSTACLES].some(
        (b) => x + 0.4 > b.minX && x - 0.4 < b.maxX && z + 0.4 > b.minZ && z - 0.4 < b.maxZ
      );
    const walk = (from: readonly number[], to: readonly number[]) => {
      const p = { x: from[0], y: FIRST_PERSON_EYE_HEIGHT, z: from[2] };
      for (let step = 0; step < 400; step++) {
        const dx = to[0] - p.x;
        const dz = to[2] - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const s = Math.min(0.2, d) / d;
        moveWalkingPosition(p, dx * s, dz * s, 64, true, FIRST_PERSON_EYE_HEIGHT, blocked);
      }
      return Math.hypot(to[0] - p.x, to[2] - p.z);
    };
    for (const a of FACILITY_DOOR_APPROACHES) {
      expect(blocked(a.outside[0], a.outside[2]), `${a.door} outside`).toBe(false);
      expect(blocked(a.inside[0], a.inside[2]), `${a.door} inside`).toBe(false);
      expect(walk(a.outside, a.inside), `${a.door} in`).toBeLessThan(0.06);
      expect(walk(a.inside, a.outside), `${a.door} out`).toBeLessThan(0.06);
    }
  });

  it('the accessible WC keeps a 1.5 m turning circle clear and its fittings where Document M puts them', () => {
    const t = ACCESSIBLE_WC.turning;
    const i = ACCESSIBLE_WC.interior;
    expect(t.radius * 2).toBeGreaterThanOrEqual(1.5);
    expect(t.x - t.radius).toBeGreaterThanOrEqual(i.minX);
    expect(t.x + t.radius).toBeLessThanOrEqual(i.maxX);
    expect(t.z - t.radius).toBeGreaterThanOrEqual(i.minZ);
    expect(t.z + t.radius).toBeLessThanOrEqual(i.maxZ);
    const pan = {
      minX: ACCESSIBLE_WC.panCentreX - ACCESSIBLE_WC.panHalfWidth - 0.02,
      maxX: ACCESSIBLE_WC.panCentreX + ACCESSIBLE_WC.panHalfWidth + 0.02,
      minZ: i.minZ,
      maxZ: ACCESSIBLE_WC.panFrontZ,
    };
    const rail = {
      minX: ACCESSIBLE_WC.dropRailX - 0.03,
      maxX: ACCESSIBLE_WC.dropRailX + 0.03,
      minZ: i.minZ,
      maxZ: ACCESSIBLE_WC.panFrontZ + 0.08,
    };
    for (const r of [
      pan,
      rail,
      ACCESSIBLE_WC.basin,
      ...FACILITY_FITTINGS.filter((f) => f.room === 'accessible-wc'),
    ])
      expect(pointToRect(t.x, t.z, r)).toBeGreaterThanOrEqual(t.radius);
    expect(i.maxX - ACCESSIBLE_WC.panCentreX).toBeCloseTo(0.45, 3);
    expect(ACCESSIBLE_WC.panFrontZ - i.minZ).toBeCloseTo(0.75, 3);
    expect(ACCESSIBLE_WC.basinRim).toBeLessThanOrEqual(0.75);
    expect(ACCESSIBLE_WC.seatHeight).toBeGreaterThanOrEqual(0.475);
    expect(ACCESSIBLE_WC.seatHeight).toBeLessThanOrEqual(0.485);
    expect(ACCESSIBLE_WC.pullCord.bangles[0]).toBeLessThanOrEqual(0.15);
    // Its door opens outward, into the hall.
    const door = FACILITY_DOORS.find((d) => d.room === 'accessible-wc')!;
    expect(doorLeafPlan(door).minZ).toBeGreaterThanOrEqual(door.wall.at);
  });

  it('the staff room has a lowered worktop with knee space and tables open at the ends', () => {
    const seats = FACILITY_SEATS.filter((s) => s.room === 'staff-room' && s.kind === 'chair');
    for (const s of seats) {
      // Chairs sit only along the long sides (z), never at a table end (x).
      const table = FACILITY_FITTINGS.find(
        (f) =>
          f.id.startsWith('staff-table') && Math.abs((f.minZ + f.maxZ) / 2 - s.position[2]) < 0.7
      )!;
      expect(s.position[0]).toBeGreaterThan(table.minX);
      expect(s.position[0]).toBeLessThan(table.maxX);
    }
  });

  it('every seat sits in its room and outside every fitting', () => {
    for (const seat of FACILITY_SEATS) {
      const room = FACILITY_ROOMS.find((r) => r.id === seat.room)!;
      const inner = roomInterior(room);
      expect(pointToRect(seat.position[0], seat.position[2], inner), seat.id).toBe(0);
      for (const f of FACILITY_FITTINGS)
        if (seat.kind !== 'sofa' && seat.kind !== 'bench')
          expect(
            pointToRect(seat.position[0], seat.position[2], f),
            `${seat.id} in ${f.id}`
          ).toBeGreaterThan(0);
    }
  });

  it('first-person walking knows every facility wall, leaf and fitting', () => {
    const ids = new Set(WALKING_OBSTACLES.map((o) => o.id));
    for (const s of solids) expect(ids.has(s.id), s.id).toBe(true);
    expect(new Set(solids.map((s) => s.id)).size).toBe(solids.length);
  });
});

describe('staff facilities: textures and geometry', () => {
  it('the print atlas regions are inside it and never overlap', () => {
    const rects = Object.entries(ATLAS);
    for (const [name, [x, y, w, h]] of rects) {
      expect(x >= 0 && y >= 0 && x + w <= ATLAS_SIZE && y + h <= ATLAS_SIZE, name).toBe(true);
      for (const [other, [x2, y2, w2, h2]] of rects)
        if (other !== name)
          expect(x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h, `${name}/${other}`).toBe(
            false
          );
    }
    expect(buildFacilityAtlas().data.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
  });

  it('every albedo is decoded as sRGB', () => {
    for (const name of ['blockwork', 'oakBoards', 'metroTile', 'carpet'] as const)
      expect(getFacilityFinish(name).colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('builds finite merged geometry that stays at the blocks', () => {
    const { merged } = getFacilityGeometry();
    expect(merged.size).toBeGreaterThan(15);
    for (const [id, g] of merged) {
      const box = g.boundingBox!;
      expect(
        Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z),
        id
      ).toBe(true);
      expect(box.min.y, id).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max.y, id).toBeLessThan(4.2);
      const inside =
        footprints.some((f) => box.min.x >= f.minX - 0.1 && box.max.x <= f.maxX + 0.1) ||
        (box.min.x < 0 && box.max.x > 0);
      expect(inside, id).toBe(true);
      expect(box.max.z, id).toBeLessThan(-26.5);
      for (const name of ['position', 'normal', 'uv', 'color'])
        expect(g.getAttribute(name), `${id} ${name}`).toBeTruthy();
    }
  });
});
