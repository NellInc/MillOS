import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_EGRESS_POINTS, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useProductionStore } from '../../stores/productionStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { centralTick } from '../CentralTickSystem';
import { registerEgressDrillSequencer } from '../egressDrillSequencer';
import {
  FORKLIFT_FOOTPRINT_RADIUS,
  STEP_FREE_EGRESS,
  checkStepFreeEgress,
} from '../accessibleEgress';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { forkliftCrewLive } from '../../stores/forkliftCrewStore';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { hallDressingSolids } from '../../components/infrastructure/hallDressingLayout';
import { decisionCardText } from '../../utils/aiEngine';
import {
  PERSONNEL_DOOR,
  PERSONNEL_DOORS,
  REAR_CROSS_PATH,
  WHEELCHAIR,
} from '../../constants/accessibilityLayout';
import { readFileSync } from 'node:fs';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  protectedEgressApproaches,
  roundedPlanningRoute,
  stagingBounds,
} from '../../simulation/layoutPlanning';
import { STAGING_LAYOUT } from '../../components/truckbay/palletStagingLayout';

const forklift = (x: number, z: number) => ({ x, z, radius: FORKLIFT_FOOTPRINT_RADIUS });

describe('step-free egress routes', () => {
  it('gives every service egress zone a step-free route to its exit and a refuge', () => {
    expect(STEP_FREE_EGRESS.map((egress) => egress.zoneId).sort()).toEqual(
      SERVICE_EGRESS_POINTS.map((point) => point.id).sort()
    );
    for (const point of SERVICE_EGRESS_POINTS) {
      const egress = STEP_FREE_EGRESS.find((candidate) => candidate.zoneId === point.id)!;
      const end = egress.route.at(-1)!;
      // Every route reaches its zone's marker, through a level door.
      expect(end).toEqual([point.position.x, point.position.z]);
      expect(
        Math.hypot(egress.refuge[0] - end[0], egress.refuge[1] - end[1]),
        egress.zoneId
      ).toBeLessThan(25);
      expect(egress.alternative).not.toBe(egress.zoneId);
    }
  });

  it('takes the front and back zones out through the personnel doors, not the docks', () => {
    const halfWidth = PERSONNEL_DOOR.clearWidth / 2;
    for (const door of PERSONNEL_DOORS) {
      const egress = STEP_FREE_EGRESS.find((e) => e.zoneId === door.id)!;
      // One leg crosses the wall line, square to it and inside the clear opening
      // with a wheelchair's half-width to spare.
      const crossing = egress.route.findIndex(
        (p, i) =>
          i > 0 && Math.sign(p[1] - door.wallZ) !== Math.sign(egress.route[i - 1][1] - door.wallZ)
      );
      expect(crossing, door.id).toBeGreaterThan(0);
      const [a, b] = [egress.route[crossing - 1], egress.route[crossing]];
      expect(a[0]).toBe(b[0]);
      expect(Math.abs(a[0] - door.x) + WHEELCHAIR.halfWidth).toBeLessThanOrEqual(halfWidth);
      // Well clear of the dock opening, its platforms and the forklift channel.
      const portal =
        door.id === 'front' ? SITE_LAYOUT.portals.shipping : SITE_LAYOUT.portals.receiving;
      expect(door.x - PERSONNEL_DOOR.openingHalfWidth).toBeGreaterThan(portal.halfWidth + 3);
      for (const platform of DOCK_PLATFORM_OBSTACLES)
        expect(
          door.x - PERSONNEL_DOOR.openingHalfWidth - platform.maxX,
          platform.id
        ).toBeGreaterThan(10);
      // The refuge is outside the door, on its landing, beside the walk.
      expect(Math.sign(egress.refuge[1] - door.wallZ)).toBe(door.outward);
      expect(Math.abs(egress.refuge[1] - door.wallZ)).toBeLessThan(
        PERSONNEL_DOOR.landing.depth + 0.3
      );
      expect(Math.abs(egress.refuge[0] - door.x)).toBeLessThan(PERSONNEL_DOOR.landing.width / 2);
    }
  });

  it('joins the back door walk to the cross path behind the hall, the walk network', () => {
    // REAR_CROSS_PATH mirrors FactoryExterior's literal; hold the two together.
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    const { z, minX, maxX } = REAR_CROSS_PATH;
    expect(exterior).toContain(
      `<GravelPath start={[${minX}, 0, ${z}]} end={[${maxX}, 0, ${z}]} width={2} type="paved" />`
    );
    const back = PERSONNEL_DOORS.find((door) => door.id === 'back')!;
    expect(back.x).toBeGreaterThan(minX);
    expect(back.x).toBeLessThan(maxX);
    // The walk runs from the landing over the path to the assembly point.
    expect(back.wallZ - PERSONNEL_DOOR.landing.depth).toBeGreaterThan(
      z + REAR_CROSS_PATH.halfWidth
    );
    expect(back.assembly[1] + PERSONNEL_DOOR.assemblySize / 2).toBeLessThan(
      z - REAR_CROSS_PATH.halfWidth
    );
  });

  it('keeps forklift lanes, the yard staging and the trucks off the personnel door approaches', () => {
    const lanes = (['shipping', 'receiving'] as const).map((dock) =>
      roundedPlanningRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points)
    );
    const approaches = protectedEgressApproaches().filter((a) => a.id.endsWith('personnel-door'));
    expect(approaches.map((a) => a.id).sort()).toEqual([
      'back-personnel-door',
      'front-personnel-door',
    ]);
    for (const approach of approaches) {
      for (const lane of lanes)
        for (const point of lane.points)
          expect(point[0] + lane.halfWidth, `${lane.id} near ${approach.id}`).toBeLessThan(
            approach.minX - 10
          );
      for (const dock of ['shipping', 'receiving'] as const) {
        const stage = stagingBounds(dock, [
          ...(dock === 'shipping' ? STAGING_LAYOUT.shippingOrigin : STAGING_LAYOUT.receivingOrigin),
        ]);
        expect(stage.maxX < approach.minX || stage.minX > approach.maxX).toBe(true);
      }
    }
    // Stopped forklifts at their crew points block no front or back route.
    const parked = FORKLIFT_CREW_SITES.map((site) =>
      forklift(site.crewPoint[0], site.crewPoint[2])
    );
    expect(checkStepFreeEgress('front', parked).status).toBe('clear');
    expect(checkStepFreeEgress('back', parked).status).toBe('clear');
  });

  it('keeps every route on open floor, clear of machines, belts, dock platforms and dressing', () => {
    const obstacles = [
      ...createMachineObstacles(0.33),
      ...createConveyorObstacles(),
      ...DOCK_PLATFORM_OBSTACLES,
      ...hallDressingSolids().filter((solid) => solid.minY < 1.2),
    ];
    for (const egress of STEP_FREE_EGRESS)
      for (let i = 1; i < egress.route.length; i++) {
        const [ax, az] = egress.route[i - 1],
          [bx, bz] = egress.route[i];
        for (let t = 0; t <= 1; t += 0.01) {
          const x = ax + (bx - ax) * t,
            z = az + (bz - az) * t;
          for (const o of obstacles)
            expect(
              x > o.minX - 0.4 && x < o.maxX + 0.4 && z > o.minZ - 0.4 && z < o.maxZ + 0.4,
              `${egress.zoneId} meets ${o.id} at ${x},${z}`
            ).toBe(false);
        }
      }
  });

  it('uses the agreed alternative when a stopped forklift stands on the route, and holds when both are blocked', () => {
    expect(checkStepFreeEgress('west', [])).toEqual({ status: 'clear', zoneId: 'west' });
    expect(checkStepFreeEgress('west', [forklift(-30, -20)])).toEqual({
      status: 'alternative',
      zoneId: 'west',
      alternative: 'east',
    });
    expect(checkStepFreeEgress('west', [forklift(-30, -20), forklift(30, -20)])).toEqual({
      status: 'blocked',
      zoneId: 'west',
    });
    // A forklift on the refuge point blocks it too; one well clear does not.
    expect(checkStepFreeEgress('east', [forklift(42, -16.5)]).status).toBe('alternative');
    expect(checkStepFreeEgress('east', [forklift(30, -10)]).status).toBe('clear');
    expect(checkStepFreeEgress('nowhere', []).status).toBe('blocked');
  });

  it('verifies the front and back zones on their own doors, and on the alternative when blocked', () => {
    expect(checkStepFreeEgress('front', [])).toEqual({ status: 'clear', zoneId: 'front' });
    expect(checkStepFreeEgress('back', [])).toEqual({ status: 'clear', zoneId: 'back' });
    expect(checkStepFreeEgress('front', [forklift(37, 46)])).toEqual({
      status: 'alternative',
      zoneId: 'front',
      alternative: 'west',
    });
    expect(checkStepFreeEgress('back', [forklift(37, -46), forklift(30, -20)]).status).toBe(
      'blocked'
    );
  });
});

describe('egress drill verifies a zone only with a clear step-free route', () => {
  let unregister: () => void;
  const clock = { t: 0 };
  const tick = (count: number) => {
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    for (let i = 0; i < count; i += 1) {
      clock.t += 0.5;
      centralTick.tick(clock.t, 12, STANDARD_GAME_SPEED);
    }
  };
  const accessCards = () =>
    useProductionStore
      .getState()
      .aiDecisions.filter((decision) => decision.id.startsWith('access-egress'));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00.000Z'));
    centralTick.reset();
    clock.t = 0;
    centralTick.tick(clock.t, 12, STANDARD_GAME_SPEED);
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.setState({ aiDecisions: [] });
    for (const site of FORKLIFT_CREW_SITES) forkliftCrewLive(site.forkliftId).vehicle = null;
    unregister = registerEgressDrillSequencer();
    useGameSimulationStore.getState().startEmergencyDrill();
  });
  afterEach(() => {
    unregister();
    useGameSimulationStore.getState().endEmergencyDrill();
    for (const site of FORKLIFT_CREW_SITES) forkliftCrewLive(site.forkliftId).vehicle = null;
    centralTick.reset();
    vi.useRealTimers();
  });

  it('verifies every zone in order with nothing in the way, explaining each check', () => {
    tick(8 * SERVICE_EGRESS_POINTS.length);
    const metrics = useGameSimulationStore.getState().drillMetrics;
    expect(metrics.verifiedZoneIds).toEqual(SERVICE_EGRESS_POINTS.map((point) => point.id));
    expect(accessCards()).toHaveLength(SERVICE_EGRESS_POINTS.length);
    const actions = accessCards().map((card) => decisionCardText(card, 'en').action);
    expect(actions.sort()).toEqual([
      'Back Service Egress: step-free route and refuge point clear',
      'East Service Egress: step-free route and refuge point clear',
      'Front Service Egress: step-free route and refuge point clear',
      'West Service Egress: step-free route and refuge point clear',
    ]);
    const front = accessCards().find((card) => /^Front/.test(decisionCardText(card, 'en').action))!;
    expect(decisionCardText(front, 'en').reasoning).toMatch(/level door beside the shipping dock/);
  });

  it('holds a zone whose step-free alternative is blocked, and verifies the rest', () => {
    const [first, second] = FORKLIFT_CREW_SITES;
    // One forklift stopped on the west door's route and one on the front
    // door's walkway: west goes by the east door, and the front zone, whose
    // alternative is the west door, has to wait.
    forkliftCrewLive(first.forkliftId).vehicle = { x: -30, y: 0, z: -20, heading: 0 };
    forkliftCrewLive(second.forkliftId).vehicle = { x: 37, y: 0, z: 46, heading: 0 };
    tick(8 * SERVICE_EGRESS_POINTS.length + 8);
    const metrics = useGameSimulationStore.getState().drillMetrics;
    expect(metrics.verifiedZoneIds.sort()).toEqual(['back', 'east', 'west']);
    expect(metrics.verificationComplete).toBe(false);
    const held = accessCards().filter((card) =>
      /Front Service Egress: verification waits/.test(decisionCardText(card, 'en').action)
    );
    expect(held).toHaveLength(1);
    expect(decisionCardText(held[0], 'en').reasoning).toMatch(/END DRILL remains available/);
  });
});
