import { describe, expect, it } from 'vitest';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { forkliftInDockLane } from '../../constants/dockLoading';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  COMMUNITY_ROSTER,
  MILL_ROUTINE_HOURS,
  routineDuration,
  sampleCommunityPerson,
} from '../communityLife';
import {
  advanceForkliftCrew,
  FORKLIFT_CREW_ALIGHT_HOURS,
  FORKLIFT_CREW_BOARD_HOURS,
  forkliftCrewDuty,
  initialForkliftCrewState,
  operatorRoutineElapsed,
  operatorSpellHours,
  sampleOperatorBoardingWalk,
  dockSpurTwinDistance,
  nearestSpurTurnAhead,
  unmannedSpurTurn,
  type ForkliftCrewHandover,
  type ForkliftCrewInputs,
  type ForkliftCrewState,
} from '../forkliftCrew';
import { drivenLogisticsRoute } from '../logisticsRuntime';
import { planningObstacles, protectedEgressApproaches } from '../layoutPlanning';
import {
  distanceAheadOnClosedPath,
  FORKLIFT_HOLD_CLEARANCE_METRES,
  forkliftActionHoldDistance,
  forkliftRouteHeading,
} from '../vehicles/forkliftController';
import {
  findLaneRejoinTarget,
  forkliftFootprintBlocked,
  type ManualFootprintBlocked,
} from '../vehicles/forkliftManualDrive';
import { manualStaticBlocked } from '../vehicles/forkliftManualWorld';
import { sampleArcLengthPath, shortestVehicleAngle } from '../vehicles/vehicleKinematics';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';

type P = readonly [number, number];
const toSegment = (p: P, a: P, b: P) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t =
    length > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
};
/** Closest approach of two segments (they do not cross in these layouts; checked below). */
const segmentGap = (a: P, b: P, c: P, d: P) => {
  const cross = (o: P, p: P, q: P) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const intersects =
    Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) &&
    Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b));
  if (intersects) return 0;
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
};
const segmentsOf = (stops: readonly { position: readonly number[] }[]) =>
  stops.map((s, i) => {
    const n = stops[(i + 1) % stops.length];
    return [
      [s.position[0], s.position[2]],
      [n.position[0], n.position[2]],
    ] as [P, P];
  });
const operator = (operatorId: string) => COMMUNITY_ROSTER.find((p) => p.id === operatorId)!;
const planFor = (dock: 'shipping' | 'receiving') =>
  drivenLogisticsRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points).plan;

describe('forklift crew layout', () => {
  it('gives each forklift an operator with a four-hour mill routine whose first stop is the spell', () => {
    for (const site of FORKLIFT_CREW_SITES) {
      const person = operator(site.operatorId);
      expect(person.district).toBe('mill');
      expect(routineDuration(person)).toBeCloseTo(MILL_ROUTINE_HOURS, 9);
      expect(person.stops[0].position).toEqual(site.stand);
      expect(person.stops[0].task).toBe(`Driving ${site.tag}`);
      expect(operatorSpellHours(person)).toBeGreaterThan(2.5);
      expect(person.stops.find((s) => s.seated)?.position).toEqual(site.bench);
    }
  });

  it('parks on a straight stretch of its own lane, clear of actions, dock lanes and egress', () => {
    for (const site of FORKLIFT_CREW_SITES) {
      const plan = planFor(site.dock);
      const target = findLaneRejoinTarget(plan, {
        x: site.crewPoint[0],
        z: site.crewPoint[2],
        heading: site.crewHeading,
      });
      expect(target.lateral, site.dock).toBeLessThan(0.05);
      expect(target.headingError, site.dock).toBeLessThan(0.01);
      // Straight for 2 m either side: the lane heading does not turn there.
      for (const offset of [-2, -1, 1, 2])
        expect(
          Math.abs(
            shortestVehicleAngle(
              forkliftRouteHeading(plan, target.distance),
              forkliftRouteHeading(
                plan,
                (target.distance + offset + plan.path.totalLength) % plan.path.totalLength
              )
            )
          ),
          `${site.dock} lane turns ${offset} m from the crew point`
        ).toBeLessThan(0.01);
      for (const marker of plan.markers) {
        const apart = Math.min(
          distanceAheadOnClosedPath(plan.path, marker.distance, target.distance),
          distanceAheadOnClosedPath(plan.path, target.distance, marker.distance)
        );
        expect(apart, `${site.dock} crew point beside a ${marker.action.type}`).toBeGreaterThan(3);
      }
      expect(forkliftInDockLane(site.crewPoint[0], site.crewPoint[2])).toBe(false);
      const [x, , z] = site.crewPoint;
      for (const egress of protectedEgressApproaches()) {
        const gap = Math.hypot(
          x - Math.max(egress.minX, Math.min(x, egress.maxX)),
          z - Math.max(egress.minZ, Math.min(z, egress.maxZ))
        );
        expect(gap, `${site.dock} parked in ${egress.id}`).toBeGreaterThan(1.6);
      }
      // Only the shipping-dock zone, which only FLT01 reserves, may hold it.
      const zones = Object.values(SITE_LAYOUT.routeHazards).filter(
        ({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
      );
      expect(zones.map(({ id }) => id)).toEqual(site.dock === 'shipping' ? ['shipping-dock'] : []);
    }
  });

  it('stands beside the cab on the driver’s side', () => {
    for (const site of FORKLIFT_CREW_SITES) {
      const left = [Math.cos(site.crewHeading), -Math.sin(site.crewHeading)];
      const dx = site.stand[0] - site.crewPoint[0],
        dz = site.stand[2] - site.crewPoint[2];
      expect(dx * left[0] + dz * left[1]).toBeCloseTo(1.15, 6);
      // Facing the cab.
      expect(Math.atan2(-dx, -dz)).toBeCloseTo(site.standRotation, 6);
    }
  });

  it('walks a strip no other resident uses, held hour or not', () => {
    // A held hour puts an operator out of step with everyone, so distance alone
    // must keep them apart: not the timing sweep the other residents rely on.
    const operators = new Set(FORKLIFT_CREW_SITES.map((s) => s.operatorId));
    const others = COMMUNITY_ROSTER.filter((p) => p.district === 'mill' && !operators.has(p.id));
    for (const site of FORKLIFT_CREW_SITES) {
      const route = segmentsOf(operator(site.operatorId).stops);
      for (const other of others) {
        for (const [a, b] of route)
          for (const [c, d] of segmentsOf(other.stops))
            expect(segmentGap(a, b, c, d), `${site.operatorId} near ${other.id}`).toBeGreaterThan(
              0.6
            );
      }
      for (const otherSite of FORKLIFT_CREW_SITES.filter((s) => s !== site))
        for (const [a, b] of route)
          for (const [c, d] of segmentsOf(operator(otherSite.operatorId).stops))
            expect(segmentGap(a, b, c, d)).toBeGreaterThan(0.6);
    }
  });

  it('keeps the walk, the stand and the bench clear of solids and of the other forklift’s lane', () => {
    const solids = planningObstacles();
    for (const site of FORKLIFT_CREW_SITES) {
      // Every place the operator stands, sits or walks lies on these segments.
      const points: P[] = [];
      for (const [a, b] of segmentsOf(operator(site.operatorId).stops)) {
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
        for (let i = 0; i <= steps; i++)
          points.push([a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
      }
      for (const [x, z] of points) {
        for (const o of solids)
          expect(
            x > o.minX - 0.33 && x < o.maxX + 0.33 && z > o.minZ - 0.33 && z < o.maxZ + 0.33,
            `${site.operatorId} in ${o.id} at ${x},${z}`
          ).toBe(false);
        for (const otherSite of FORKLIFT_CREW_SITES.filter((s) => s !== site)) {
          const samples = planFor(otherSite.dock).path.samples;
          let gap = Infinity;
          for (let i = 1; i < samples.length; i++)
            gap = Math.min(
              gap,
              toSegment([x, z], [samples[i - 1].x, samples[i - 1].z], [samples[i].x, samples[i].z])
            );
          expect(gap, `${site.operatorId} near ${otherSite.dock} lane`).toBeGreaterThan(2.5);
        }
      }
    }
  });
});

describe('advanceForkliftCrew', () => {
  const site = FORKLIFT_CREW_SITES[0];
  const person = operator(site.operatorId);
  const spell = operatorSpellHours(person);
  const period = routineDuration(person);
  /** The absolute hour at which the routine is `elapsed` in. */
  const at = (elapsed: number) => elapsed - person.phase + period * 10;
  const handover: ForkliftCrewHandover = { x: 1, z: 2, rotation: 0, routeDistance: 7 };
  const inputs = (over: Partial<ForkliftCrewInputs> = {}): ForkliftCrewInputs => ({
    parkedAt: null,
    playerDriving: false,
    handover: () => handover,
    ...over,
  });
  const run = (
    state: ForkliftCrewState,
    hour: number,
    hours: number,
    input: ForkliftCrewInputs,
    dt = 0.002
  ) => {
    let s = state,
      h = hour;
    for (let t = 0; t < hours; t += dt)
      ({ state: s, hour: h } = advanceForkliftCrew(person, s, h, dt, input, false));
    return { state: s, hour: h };
  };

  it('starts in the cab during the spell and on foot outside it', () => {
    expect(initialForkliftCrewState(person, at(1)).phase).toBe('aboard');
    expect(initialForkliftCrewState(person, at(spell + 0.1)).phase).toBe('off');
  });

  it('holds the hour at the end of the spell until the forklift is parked at the crew point', () => {
    let { state, hour } = run(
      { phase: 'aboard', timer: 0, handover: null },
      at(spell - 0.05),
      0.2,
      inputs()
    );
    expect(state.phase).toBe('wants-off');
    expect(operatorRoutineElapsed(person, hour)).toBeLessThan(spell);
    expect(operatorRoutineElapsed(person, hour)).toBeGreaterThan(spell - 1e-4);
    ({ state, hour } = run(state, hour, 0.5, inputs({ parkedAt: 'handover' })));
    expect(state.phase).toBe('wants-off');
    ({ state, hour } = run(
      state,
      hour,
      FORKLIFT_CREW_ALIGHT_HOURS / 2,
      inputs({ parkedAt: 'crew' })
    ));
    expect(state.phase).toBe('alighting');
    expect(operatorRoutineElapsed(person, hour)).toBeLessThan(spell);
    ({ state, hour } = run(state, hour, FORKLIFT_CREW_ALIGHT_HOURS, inputs({ parkedAt: 'crew' })));
    expect(state.phase).toBe('off');
    expect(operatorRoutineElapsed(person, hour)).toBeGreaterThanOrEqual(spell);
    // On foot, the routine walks on to the bench whatever the forklift does.
    const before = hour;
    ({ state, hour } = run(state, hour, 0.1, inputs()));
    expect(hour - before).toBeCloseTo(0.1, 2);
    expect(sampleCommunityPerson(person, hour).activity).not.toBe('working');
  });

  it('waits at the stand when the spell is due, and climbs in only once the forklift is parked', () => {
    let { state, hour } = run(
      { phase: 'off', timer: 0, handover: null },
      at(period - 0.03),
      0.2,
      inputs()
    );
    expect(state.phase).toBe('waiting');
    expect(operatorRoutineElapsed(person, hour)).toBeCloseTo(0, 6);
    const held = hour;
    ({ state, hour } = run(state, hour, 0.3, inputs({ parkedAt: 'crew', playerDriving: true })));
    expect([state.phase, hour]).toEqual(['waiting', held]);
    ({ state, hour } = run(
      state,
      hour,
      FORKLIFT_CREW_BOARD_HOURS / 2,
      inputs({ parkedAt: 'crew' })
    ));
    expect(state.phase).toBe('boarding');
    ({ state, hour } = run(state, hour, FORKLIFT_CREW_BOARD_HOURS, inputs({ parkedAt: 'crew' })));
    expect(state.phase).toBe('aboard');
    // Held through the climb; the spell runs only from the moment they are in.
    expect(hour - held).toBeGreaterThanOrEqual(0);
    expect(hour - held).toBeLessThan(FORKLIFT_CREW_BOARD_HOURS);
  });

  it('steps aside for a player and gets back in where the forklift is returned', () => {
    let { state, hour } = run(
      { phase: 'aboard', timer: 0, handover: null },
      at(1),
      0.01,
      inputs({ playerDriving: true })
    );
    expect(state).toEqual({ phase: 'displaced', timer: 0, handover });
    const held = hour;
    expect(forkliftCrewDuty(state, 99)).toEqual({
      works: false,
      station: { kind: 'handover', routeDistance: 7 },
      walkingPace: true,
    });
    ({ state, hour } = run(state, hour, 0.5, inputs({ parkedAt: 'crew' })));
    expect([state.phase, hour]).toEqual(['displaced', held]);
    ({ state, hour } = run(
      state,
      hour,
      FORKLIFT_CREW_BOARD_HOURS * 2,
      inputs({ parkedAt: 'handover' })
    ));
    expect(state).toEqual({ phase: 'aboard', timer: 0, handover: null });
    expect(hour - held).toBeGreaterThanOrEqual(0);
    expect(hour - held).toBeLessThan(FORKLIFT_CREW_BOARD_HOURS * 2);
  });

  it('freezes in a safety stop, and gives the forklift its duty in every phase', () => {
    const state: ForkliftCrewState = { phase: 'aboard', timer: 0, handover: null };
    expect(advanceForkliftCrew(person, state, at(1), 0.5, inputs(), true)).toEqual({
      state,
      hour: at(1),
    });
    expect(forkliftCrewDuty(state, 5)).toEqual({ works: true, station: null, walkingPace: false });
    expect(forkliftCrewDuty({ ...state, phase: 'wants-off' }, 5)).toEqual({
      works: true,
      station: { kind: 'crew', routeDistance: 5 },
      walkingPace: false,
    });
    for (const phase of ['off', 'waiting', 'boarding', 'alighting'] as const)
      expect(forkliftCrewDuty({ phase, timer: 0, handover: null }, 5)).toEqual({
        works: false,
        station: { kind: 'crew', routeDistance: 5 },
        walkingPace: true,
      });
    // Displaced, or climbing back in where it was returned: it stands at the handover.
    const handover = { x: 1, z: 2, rotation: 0, routeDistance: 17 };
    for (const phase of ['displaced', 'boarding'] as const)
      expect(forkliftCrewDuty({ phase, timer: 0, handover }, 5)).toEqual({
        works: false,
        station: { kind: 'handover', routeDistance: 17 },
        walkingPace: true,
      });
  });

  it('never passes either end of the spell unparked, over many shifts with a slow forklift', () => {
    // A forklift that takes a while to reach the crew point each time.
    let state = initialForkliftCrewState(person, at(0.5)),
      hour = at(0.5),
      parkTimer = 0,
      crossings = 0;
    for (let i = 0; i < 40000; i++) {
      const wantsStation = state.phase !== 'aboard';
      parkTimer = wantsStation ? parkTimer + 0.002 : 0;
      const parkedAt = wantsStation && parkTimer > 0.15 ? 'crew' : null;
      const before = operatorRoutineElapsed(person, hour);
      ({ state, hour } = advanceForkliftCrew(
        person,
        state,
        hour,
        0.002,
        inputs({ parkedAt }),
        false
      ));
      const after = operatorRoutineElapsed(person, hour);
      if (before < spell && after >= spell) {
        crossings++;
        expect(parkedAt).toBe('crew');
      }
      if (before > after) expect(state.phase === 'waiting' || parkedAt === 'crew').toBe(true);
    }
    expect(crossings).toBeGreaterThan(5);
  });
});

describe('handover polish', () => {
  const site = FORKLIFT_CREW_SITES[0];
  const person = operator(site.operatorId);
  const period = routineDuration(person);
  const at = (elapsed: number) => elapsed - person.phase + period * 10;
  const waitedAt: ForkliftCrewHandover = { x: 0, z: 0, rotation: 0, routeDistance: 7 };
  const cabNow: ForkliftCrewHandover = { x: 4, z: 0, rotation: 0, routeDistance: 11 };

  it('walks to a forklift that stopped a few metres on, instead of making it lap back', () => {
    const displaced: ForkliftCrewState = { phase: 'displaced', timer: 0, handover: waitedAt };
    let { state, hour } = advanceForkliftCrew(
      person,
      displaced,
      at(1),
      0.001,
      { parkedAt: 'handover', playerDriving: false, handover: () => cabNow },
      false
    );
    expect(state.phase).toBe('boarding');
    expect(state.handover).toEqual(cabNow);
    expect(state.walk?.hours).toBeGreaterThan(0);
    const spot = { x: 0, z: 0, rotation: 0 };
    // Half-way along the walk they are half-way there, walking toward the cab.
    const half = { ...state, timer: state.walk!.hours / 2 };
    expect(sampleOperatorBoardingWalk(half, spot)).toBe(true);
    expect(spot.x).toBeCloseTo(2, 6);
    expect(spot.rotation).toBeCloseTo(Math.PI / 2, 6);
    // Boarding takes the walk plus the climb, and the hour is held throughout.
    const total = state.walk!.hours + FORKLIFT_CREW_BOARD_HOURS;
    const held = hour;
    for (let t = 0; t < total * 0.9; t += 0.0005)
      ({ state, hour } = advanceForkliftCrew(
        person,
        state,
        hour,
        0.0005,
        { parkedAt: 'handover', playerDriving: false, handover: () => cabNow },
        false
      ));
    expect([state.phase, hour]).toEqual(['boarding', held]);
  });

  it('never leaves the operator seated under a player when there is nowhere to step down', () => {
    const { state } = advanceForkliftCrew(
      person,
      { phase: 'aboard', timer: 0, handover: null },
      at(1),
      0.001,
      { parkedAt: null, playerDriving: true, handover: () => null },
      false
    );
    expect(state.phase).toBe('waiting');
  });

  it('turns an unmanned forklift at a spur hold point instead of going up to the door', () => {
    expect(
      unmannedSpurTurn({ distanceToMarker: 10, holdLeg: 6, twinDistance: 30, stationAhead: null })
    ).toEqual({ stopDistance: 4, turnTo: 30 });
    // Past the hold point already: it goes on.
    expect(
      unmannedSpurTurn({ distanceToMarker: 3, holdLeg: 6, twinDistance: 30, stationAhead: null })
    ).toBeNull();
    // Its station is up the spur: it goes on to it.
    expect(
      unmannedSpurTurn({ distanceToMarker: 10, holdLeg: 6, twinDistance: 30, stationAhead: 8 })
    ).toBeNull();
    // Its station is short of the hold point, or past the twin: it still turns.
    expect(
      unmannedSpurTurn({ distanceToMarker: 10, holdLeg: 6, twinDistance: 30, stationAhead: 2 })
    ).not.toBeNull();
    expect(
      unmannedSpurTurn({ distanceToMarker: 10, holdLeg: 6, twinDistance: 30, stationAhead: 20 })
    ).not.toBeNull();
    // Not a spur.
    expect(
      unmannedSpurTurn({ distanceToMarker: 10, holdLeg: 6, twinDistance: null, stationAhead: null })
    ).toBeNull();
  });

  // From the route distance alone, over every marker: the forklift once asked
  // only about the marker it would work next, and went up the other spur.
  it('finds the spur turn ahead from the route distance alone', () => {
    for (const dock of ['shipping', 'receiving'] as const) {
      const plan = planFor(dock);
      const corridors = protectedEgressApproaches();
      const holdLegs = plan.markers.map((marker) =>
        distanceAheadOnClosedPath(
          plan.path,
          forkliftActionHoldDistance(
            plan,
            marker.distance,
            corridors,
            FORKLIFT_HOLD_CLEARANCE_METRES
          ),
          marker.distance
        )
      );
      const twins = plan.markers.map((marker, index) =>
        dockSpurTwinDistance(plan, marker.distance, holdLegs[index])
      );
      const spur = twins.findIndex((twin) => twin !== null);
      // 3 m short of the spur's hold point: a turn there, whatever the next marker.
      const routeDistance =
        (plan.markers[spur].distance - holdLegs[spur] - 3 + plan.path.totalLength) %
        plan.path.totalLength;
      const turn = nearestSpurTurnAhead(plan, routeDistance, holdLegs, twins, null);
      expect(turn?.stopDistance, dock).toBeCloseTo(3, 6);
      expect(turn?.turnTo, dock).toBe(twins[spur]);
    }
  });

  it('finds each dock spur turn on the authored lanes, clear of the door and turnable standing', () => {
    for (const dock of ['shipping', 'receiving'] as const) {
      const plan = planFor(dock);
      const corridors = protectedEgressApproaches();
      let spurs = 0;
      for (const marker of plan.markers) {
        const holdDistance = forkliftActionHoldDistance(
          plan,
          marker.distance,
          corridors,
          FORKLIFT_HOLD_CLEARANCE_METRES
        );
        const holdLeg = distanceAheadOnClosedPath(plan.path, holdDistance, marker.distance);
        const twin = dockSpurTwinDistance(plan, marker.distance, holdLeg);
        if (twin === null) continue;
        spurs += 1;
        const hold = sampleArcLengthPath(plan.path, holdDistance);
        expect(forkliftInDockLane(hold.x, hold.z), dock).toBe(false);
        // A full standing turn there, loaded, touches nothing.
        const ground = sampleWalkingGroundHeight(hold.x, hold.z, 128);
        const blocked: ManualFootprintBlocked = (x, z, r) =>
          manualStaticBlocked(x, z, r, ground, 128);
        for (let heading = -Math.PI; heading < Math.PI; heading += Math.PI / 16)
          expect(
            forkliftFootprintBlocked(hold.x, hold.z, heading, true, blocked),
            `${dock} turn at ${heading.toFixed(2)}`
          ).toBe(false);
      }
      expect(spurs, dock).toBe(1);
    }
  });
});
