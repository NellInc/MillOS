import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';
import { drivenLogisticsRoute } from '../logisticsRuntime';
import {
  FORKLIFT_MAXIMUM_YAW_RATE,
  forkliftRouteHeading,
  LOADED_LIMITS,
  UNLOADED_LIMITS,
  type ForkliftRoutePlan,
} from './forkliftController';
import {
  createLaneReturnState,
  createManualForkliftState,
  forkliftFootprintBlocked,
  LANE_RETURN_BLOCKED_SECONDS,
  LANE_RETURN_PARKED_RETRY_SECONDS,
  LANE_RETURN_PIVOT_AFTER_SECONDS,
  LANE_RETURN_TOW_AFTER_PARKS,
  laneRejoinDistance,
  MANUAL_FORK_MAXIMUM_METRES,
  stepLaneReturn,
  stepManualForklift,
  type LaneReturnState,
  type ManualFootprintBlocked,
  type ManualForkliftState,
} from './forkliftManualDrive';
import {
  createManualWorldBlocked,
  dockPlatformDetour,
  manualForkliftInTruckPath,
  manualStaticBlocked,
} from './forkliftManualWorld';
import { positionRegistry } from '../../utils/positionRegistry';
import {
  createTruckController,
  getTruckControllerPose,
  stepTruckController,
  truckWorldFrame,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import {
  normalizeVehicleAngle,
  sampleArcLengthPath,
  shortestVehicleAngle,
} from './vehicleKinematics';

const OPEN: ManualFootprintBlocked = () => false;
const SEGMENTS = 128;
/** The whole-route sweeps step thousands of returns; seconds alone, minutes on a loaded machine. */
const SWEEP = { timeout: 120_000 };
const drive = (
  start: ManualForkliftState,
  input: { throttle: number; steer: number; lift: number },
  seconds: number,
  options: { loaded?: boolean; blocked?: ManualFootprintBlocked } = {},
  onStep?: (before: ManualForkliftState, after: ManualForkliftState) => void
): ManualForkliftState => {
  let state = start;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const next = stepManualForklift(state, input, {
      loaded: options.loaded ?? false,
      deltaSeconds: 1 / 60,
      blocked: options.blocked ?? OPEN,
    });
    onStep?.(state, next);
    state = next;
  }
  return state;
};

describe('stepManualForklift', () => {
  it('drives along its heading within the autopilot speed limits', () => {
    const start = createManualForkliftState({ x: 0, z: 0, heading: 0 });
    let fastest = 0;
    const end = drive(start, { throttle: 1, steer: 0, lift: 0 }, 8, {}, (_, after) => {
      fastest = Math.max(fastest, after.speed);
    });
    expect(end.z).toBeGreaterThan(10);
    expect(Math.abs(end.x)).toBeLessThan(1e-9);
    expect(end.heading).toBe(0);
    expect(fastest).toBeLessThanOrEqual(UNLOADED_LIMITS.maximumForwardSpeed + 1e-9);

    let fastestLoaded = 0;
    drive(start, { throttle: 1, steer: 0, lift: 0 }, 8, { loaded: true }, (_, after) => {
      fastestLoaded = Math.max(fastestLoaded, after.speed);
    });
    expect(fastestLoaded).toBeLessThanOrEqual(LOADED_LIMITS.maximumForwardSpeed + 1e-9);
  });

  it('reverses under S, slower than it drives forward', () => {
    const end = drive(
      createManualForkliftState({ x: 0, z: 0, heading: 0 }),
      { throttle: -1, steer: 0, lift: 0 },
      6
    );
    expect(end.z).toBeLessThan(-2);
    expect(end.speed).toBeGreaterThanOrEqual(-UNLOADED_LIMITS.maximumReverseSpeed - 1e-9);
  });

  it('turns to the driver’s right under steer +1, never faster than the yaw limit', () => {
    // Facing +z, the driver's right is -x (the camera's right vector).
    let fastestYaw = 0;
    const end = drive(
      createManualForkliftState({ x: 0, z: 0, heading: 0 }),
      { throttle: 1, steer: 1, lift: 0 },
      1.5,
      {},
      (before, after) => {
        fastestYaw = Math.max(
          fastestYaw,
          Math.abs(shortestVehicleAngle(before.heading, after.heading)) * 60
        );
      }
    );
    expect(end.heading).toBeLessThan(0);
    expect(end.x).toBeLessThan(0);
    expect(fastestYaw).toBeLessThanOrEqual(FORKLIFT_MAXIMUM_YAW_RATE + 1e-6);
  });

  it('does not turn standing still', () => {
    const end = drive(
      createManualForkliftState({ x: 0, z: 0, heading: 1 }),
      { throttle: 0, steer: 1, lift: 0 },
      2
    );
    expect(end.heading).toBe(1);
    expect(end.steeringAngle).not.toBe(0);
  });

  it('stops against an obstruction and can back away from it', () => {
    const wall: ManualFootprintBlocked = (_x, z, radius) => z + radius > 6;
    let everInside = false;
    const stopped = drive(
      createManualForkliftState({ x: 0, z: 0, heading: 0 }),
      { throttle: 1, steer: 0, lift: 0 },
      10,
      { blocked: wall },
      (_, after) => {
        everInside ||= forkliftFootprintBlocked(after.x, after.z, after.heading, false, wall);
      }
    );
    expect(everInside).toBe(false);
    expect(stopped.speed).toBe(0);
    expect(stopped.blocked).toBe(true);
    expect(stopped.z).toBeGreaterThan(4);

    const backed = drive(stopped, { throttle: -1, steer: 0, lift: 0 }, 2, { blocked: wall });
    expect(backed.z).toBeLessThan(stopped.z - 0.5);
  });

  it('drives out of an obstruction it starts inside, but never deeper into it', () => {
    // Its nose is in a wall (a truck that came onto it, a restored pose).
    const wall: ManualFootprintBlocked = (_x, z, radius) => z + radius > 6;
    const inside = createManualForkliftState({ x: 0, z: 5.6, heading: 0 });
    expect(forkliftFootprintBlocked(inside.x, inside.z, inside.heading, false, wall)).toBe(true);
    const deeper = drive(inside, { throttle: 1, steer: 0, lift: 0 }, 2, { blocked: wall });
    // No further than the depth search can resolve.
    expect(deeper.z - inside.z).toBeLessThan(0.002);
    const out = drive(inside, { throttle: -1, steer: 0, lift: 0 }, 3, { blocked: wall });
    expect(forkliftFootprintBlocked(out.x, out.z, out.heading, false, wall)).toBe(false);
  });

  it('raises and lowers the forks within the pallet clearance lift', () => {
    const raised = drive(
      createManualForkliftState({ x: 0, z: 0, heading: 0 }),
      { throttle: 0, steer: 0, lift: 1 },
      5
    );
    expect(raised.forkHeight).toBe(MANUAL_FORK_MAXIMUM_METRES);
    const lowered = drive(raised, { throttle: 0, steer: 0, lift: -1 }, 5);
    expect(lowered.forkHeight).toBe(0);
  });

  it('ignores a non-finite frame and non-finite input', () => {
    const start = createManualForkliftState({ x: 1, z: 2, heading: 0.5 });
    expect(
      stepManualForklift(
        start,
        { throttle: 1, steer: 0, lift: 0 },
        { loaded: false, deltaSeconds: NaN, blocked: OPEN }
      )
    ).toBe(start);
    const next = stepManualForklift(
      start,
      { throttle: NaN, steer: Infinity, lift: NaN },
      { loaded: false, deltaSeconds: 0.1, blocked: OPEN }
    );
    expect(
      Number.isFinite(next.x) && Number.isFinite(next.z) && Number.isFinite(next.heading)
    ).toBe(true);
  });
});

describe('lane return on the authored routes', () => {
  for (const dock of ['shipping', 'receiving'] as const) {
    const { plan } = drivenLogisticsRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points);

    it(`${dock}: the whole lane is drivable by the manual footprint, loaded or not`, () => {
      // If the lane itself were blocked, lane return could never finish.
      for (let distance = 0; distance < plan.path.totalLength; distance += 0.5) {
        const sample = sampleArcLengthPath(plan.path, distance);
        const ground = sampleWalkingGroundHeight(sample.x, sample.z, SEGMENTS);
        const heading = Math.atan2(sample.tangentX, sample.tangentZ);
        const blocked: ManualFootprintBlocked = (x, z, r) =>
          manualStaticBlocked(x, z, r, ground, SEGMENTS);
        for (const loaded of [false, true])
          expect(
            forkliftFootprintBlocked(sample.x, sample.z, heading, loaded, blocked),
            `${dock} lane blocked ${loaded ? 'loaded' : 'unloaded'} at ${distance.toFixed(1)} m (${sample.x.toFixed(2)}, ${sample.z.toFixed(2)})`
          ).toBe(false);
      }
    });

    it(
      `${dock}: lane return comes back from beside every metre of it, corners and dock spur included`,
      SWEEP,
      () => {
        // Three sample points once missed both dock-spur corners, where pursuit
        // orbited for good: the corners are tighter than the turning circle. In
        // the real world, too: the spur is a 4 m channel between dock platforms,
        // and nose to its closed end it once backed and bumped forever. The real
        // world is used there (it is slow); the open world everywhere else.
        const failures: string[] = [];
        let slowest = 0;
        for (let distance = 0; distance < plan.path.totalLength; distance += 1) {
          const sample = sampleArcLengthPath(plan.path, distance);
          const bodyHeading = forkliftRouteHeading(plan, distance);
          for (const offset of [1.2, -1.2])
            for (const turn of [0, Math.PI]) {
              let vehicle = createManualForkliftState({
                x: sample.x + Math.cos(bodyHeading) * offset,
                z: sample.z - Math.sin(bodyHeading) * offset,
                heading: normalizeVehicleAngle(bodyHeading + turn),
              });
              let laneReturn: LaneReturnState = createLaneReturnState();
              let rejoin: number | null = null;
              let seconds = 0;
              const nearSpur = Math.abs(sample.z) > 38 && Math.abs(sample.x) < 6;
              for (; seconds < 60 && rejoin === null; seconds += 1 / 30) {
                const step = stepLaneReturn(plan, vehicle, laneReturn, {
                  loaded: false,
                  deltaSeconds: 1 / 30,
                  blocked: nearSpur
                    ? (x, z, r) =>
                        manualStaticBlocked(
                          x,
                          z,
                          r,
                          sampleWalkingGroundHeight(vehicle.x, vehicle.z, SEGMENTS),
                          SEGMENTS
                        )
                    : OPEN,
                  halted: false,
                  detour: dockPlatformDetour,
                });
                ({ vehicle, laneReturn } = step);
                rejoin = step.rejoinDistance;
              }
              slowest = Math.max(slowest, seconds);
              // On the lane, or within the last-resort hand-back, which the
              // rejoin blend eases across.
              const handedBack =
                rejoin !== null &&
                Math.hypot(
                  vehicle.x - sampleArcLengthPath(plan.path, rejoin).x,
                  vehicle.z - sampleArcLengthPath(plan.path, rejoin).z
                ) <= 1.51;
              if (!handedBack)
                failures.push(`${distance} m, offset ${offset}, turn ${turn.toFixed(2)}`);
            }
        }
        expect(failures, dock).toEqual([]);
        expect(slowest, dock).toBeLessThan(50);
      }
    );
  }

  it('reports no rejoin while off the lane or facing against it', () => {
    const { plan } = drivenLogisticsRoute('shipping', SITE_LAYOUT.routes.forklifts.shipping.points);
    const sample = sampleArcLengthPath(plan.path, plan.path.totalLength * 0.3);
    const heading = Math.atan2(sample.tangentX, sample.tangentZ);
    expect(laneRejoinDistance(plan, { x: sample.x, z: sample.z, heading })).not.toBeNull();
    expect(laneRejoinDistance(plan, { x: sample.x + 2, z: sample.z + 2, heading })).toBeNull();
    // Reversed, it is either off-lane or on the leg running the other way
    // (shipping's out and back legs share a line), never on the original leg.
    const reversed = normalizeVehicleAngle(heading + Math.PI);
    const rejoin = laneRejoinDistance(plan, { x: sample.x, z: sample.z, heading: reversed });
    if (rejoin !== null) {
      expect(
        Math.abs(shortestVehicleAngle(reversed, forkliftRouteHeading(plan, rejoin)))
      ).toBeLessThan(0.36);
    }
  });
});

describe('stepLaneReturn', () => {
  const { plan } = drivenLogisticsRoute('shipping', SITE_LAYOUT.routes.forklifts.shipping.points);
  const staticWorld =
    (state: ManualForkliftState): ManualFootprintBlocked =>
    (x, z, r) =>
      manualStaticBlocked(x, z, r, sampleWalkingGroundHeight(state.x, state.z, SEGMENTS), SEGMENTS);

  it('backs off and turns when its nose is against a belt, then rejoins (seen live)', () => {
    // Where a driver left FLT01 in the browser: nose into the shipping
    // conveyor's corner, which a forward-only return never cleared.
    let vehicle = createManualForkliftState({ x: -15.23, z: 39.81, heading: 2.03 });
    let laneReturn: LaneReturnState = createLaneReturnState();
    let rejoin: number | null = null;
    let parked = false;
    for (let t = 0; t < 60 && rejoin === null; t += 1 / 30) {
      const step = stepLaneReturn(plan, vehicle, laneReturn, {
        loaded: false,
        deltaSeconds: 1 / 30,
        blocked: staticWorld(vehicle),
        halted: false,
      });
      parked ||= step.laneReturn.mode === 'parked';
      expect(
        forkliftFootprintBlocked(
          step.vehicle.x,
          step.vehicle.z,
          step.vehicle.heading,
          false,
          staticWorld(step.vehicle)
        )
      ).toBe(false);
      ({ vehicle, laneReturn } = step);
      rejoin = step.rejoinDistance;
    }
    expect(parked).toBe(false);
    expect(rejoin).not.toBeNull();
  });

  it('comes back from 25 m out on the apron, facing away (seen live)', () => {
    const { plan: receiving } = drivenLogisticsRoute(
      'receiving',
      SITE_LAYOUT.routes.forklifts.receiving.points
    );
    let vehicle = createManualForkliftState({ x: -59.3, z: -23.4, heading: -1.04 });
    let laneReturn: LaneReturnState = createLaneReturnState();
    let rejoin: number | null = null;
    let seconds = 0;
    for (; seconds < 90 && rejoin === null; seconds += 1 / 30) {
      const step = stepLaneReturn(receiving, vehicle, laneReturn, {
        loaded: false,
        deltaSeconds: 1 / 30,
        blocked: staticWorld(vehicle),
        halted: false,
      });
      ({ vehicle, laneReturn } = step);
      rejoin = step.rejoinDistance;
      if (laneReturn.mode === 'parked') break;
    }
    expect(laneReturn.mode).toBe('returning');
    expect(rejoin).not.toBeNull();
    // About the straight-line distance at walking pace, plus the turn.
    expect(seconds).toBeLessThan(60);
  });

  it('lines up when it can, and hands back at any heading once lining up takes too long', () => {
    // Beside a straight stretch it merges facing along the lane, well inside the limit.
    const sample = sampleArcLengthPath(plan.path, 5);
    let vehicle = createManualForkliftState({
      x: sample.x,
      z: sample.z + 1.2,
      heading: Math.PI / 2,
    });
    let laneReturn: LaneReturnState = createLaneReturnState();
    let rejoin: number | null = null;
    while (rejoin === null && laneReturn.elapsed < 20) {
      ({
        vehicle,
        laneReturn,
        rejoinDistance: rejoin,
      } = stepLaneReturn(plan, vehicle, laneReturn, {
        loaded: false,
        deltaSeconds: 1 / 30,
        blocked: OPEN,
        halted: false,
      }));
    }
    expect(laneReturn.elapsed).toBeLessThan(LANE_RETURN_PIVOT_AFTER_SECONDS);
    expect(
      Math.abs(shortestVehicleAngle(vehicle.heading, forkliftRouteHeading(plan, rejoin!)))
    ).toBeLessThan(0.36);

    // On the lane but across it: not before the limit, then at once, for the
    // autopilot to pivot standing.
    const across = createManualForkliftState({ x: sample.x, z: sample.z, heading: 0 });
    const early = stepLaneReturn(plan, across, createLaneReturnState(), {
      loaded: false,
      deltaSeconds: 1 / 30,
      blocked: OPEN,
      halted: false,
    });
    expect(early.rejoinDistance).toBeNull();
    const late = stepLaneReturn(
      plan,
      across,
      { ...createLaneReturnState(), elapsed: LANE_RETURN_PIVOT_AFTER_SECONDS },
      { loaded: false, deltaSeconds: 1 / 30, blocked: OPEN, halted: false }
    );
    expect(late.rejoinDistance).not.toBeNull();
  });

  // Steps a lane return in the real world, with the detour the forklift uses,
  // until it hands back; never past `limit` plant seconds.
  const returnFrom = (
    route: ForkliftRoutePlan,
    start: ManualForkliftState,
    limit: number,
    blocked?: (state: ManualForkliftState) => ManualFootprintBlocked,
    loaded = false
  ) => {
    let vehicle = start;
    let laneReturn: LaneReturnState = createLaneReturnState();
    for (let seconds = 0; seconds < limit; seconds += 1 / 30) {
      const step = stepLaneReturn(route, vehicle, laneReturn, {
        loaded,
        deltaSeconds: 1 / 30,
        blocked: (blocked ?? staticWorld)(vehicle),
        halted: false,
        detour: dockPlatformDetour,
      });
      ({ vehicle, laneReturn } = step);
      if (step.rejoinDistance !== null) return { step, vehicle, seconds };
    }
    return null;
  };

  it(
    'comes back round the dock platforms from behind or beside either dock, unaided',
    SWEEP,
    () => {
      // The platforms wall the apron off from the hall; straight pursuit once
      // pushed into the dock bay for good and held the truck there. Beside a
      // block's end, a hand-off level with its face scraped the corner and
      // looped until towed; aiming past the end of the receiving block did too.
      for (const [dock, halfWidth] of [
        ['shipping', 18],
        ['receiving', 10],
      ] as const) {
        const sign = dock === 'shipping' ? 1 : -1;
        const { plan: route } = drivenLogisticsRoute(
          dock,
          SITE_LAYOUT.routes.forklifts[dock].points
        );
        const starts: [number, number, number][] = [
          // Behind it; x 12 goes round the east end of the shipping block.
          [-3, 66, 0],
          [0, 66, 0],
          [3, 66, 0],
          [12, 66, 0],
          // Beside each end, facing along it.
          [-(halfWidth + 6), 47, Math.PI / 2],
          [halfWidth + 6, 47, -Math.PI / 2],
          [-(halfWidth + 3), 50, Math.PI],
        ];
        for (const [x, u, heading] of starts) {
          const result = returnFrom(
            route,
            createManualForkliftState({
              x,
              z: u * sign,
              heading: heading + (sign < 0 ? Math.PI : 0),
            }),
            150
          );
          expect(result, `${dock} from (${x}, ${u})`).not.toBeNull();
          expect(result?.step.towed, `${dock} from (${x}, ${u})`).toBe(false);
        }
      }
    }
  );

  it('backs out of a dock spur with a pallet, lined up or left crosswise', () => {
    // Backing straight suits a forklift lined up with the 4 m channel; one
    // left crosswise only bumped between the platforms, and one that turned in
    // it until blocked wedged crosswise. Both were towed.
    for (const dock of ['shipping', 'receiving'] as const) {
      const sign = dock === 'shipping' ? 1 : -1;
      const { plan: route } = drivenLogisticsRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points);
      for (const [x, u, heading] of [
        [0, 45, Math.PI / 2],
        [0, 47, Math.PI / 2],
        [1, 45, 0],
        [-1, 45, 0],
      ] as const) {
        const result = returnFrom(
          route,
          createManualForkliftState({
            x,
            z: u * sign,
            heading: heading + (sign < 0 ? Math.PI : 0),
          }),
          90,
          undefined,
          true
        );
        expect(result, `${dock} from (${x}, ${u}, ${heading.toFixed(2)})`).not.toBeNull();
        expect(result?.step.towed, `${dock} from (${x}, ${u}, ${heading.toFixed(2)})`).toBe(false);
      }
    }
  });

  it('goes round the far end from a docked trailer rather than through it', () => {
    // A docked trailer splits the apron; the shorter way round lay through it.
    let truck = createTruckController('shipping', true, 'docked');
    truck = stepTruckController(truck, {
      deltaSeconds: 1 / 60,
      arrivalReady: false,
      safetyHold: false,
      serviceComplete: false,
      speedMultiplier: 1,
    }).state;
    const pose = getTruckControllerPose(truck);
    const trailerYaw = pose.rotation + pose.articulation;
    positionRegistry.register(
      'shipping-truck-cab',
      pose.x,
      pose.z,
      Math.sin(pose.rotation),
      Math.cos(pose.rotation),
      true,
      0,
      'truck'
    );
    positionRegistry.register(
      'shipping-truck-trailer',
      pose.x - Math.sin(trailerYaw) * 5.75,
      pose.z - Math.cos(trailerYaw) * 5.75,
      Math.sin(trailerYaw),
      Math.cos(trailerYaw),
      true,
      0,
      'truck'
    );
    try {
      const result = returnFrom(
        plan,
        // East of the trailer, facing west: the way it faces lies through it.
        createManualForkliftState({ x: 5, z: 58, heading: -Math.PI / 2 }),
        200,
        (state) =>
          createManualWorldBlocked('forklift-1', {
            originGround: sampleWalkingGroundHeight(state.x, state.z, SEGMENTS),
            segments: SEGMENTS,
          })
      );
      expect(result).not.toBeNull();
      expect(result?.step.towed).toBe(false);
    } finally {
      positionRegistry.unregister('shipping-truck-cab');
      positionRegistry.unregister('shipping-truck-trailer');
    }
  });

  it('is put back on its lane once nothing it tries brings it back, but not onto a vehicle', () => {
    // Boxed in where it stands; the lane itself is clear.
    const boxedIn: ManualFootprintBlocked = (_x, z) => z < 30;
    const start = createManualForkliftState({ x: 0, z: 0, heading: 0 });
    const run = (blocked: ManualFootprintBlocked) => {
      let vehicle = start;
      let laneReturn: LaneReturnState = createLaneReturnState();
      let parks = 0;
      for (let t = 0; t < 300; t += 1 / 30) {
        const before = laneReturn.mode;
        const step = stepLaneReturn(plan, vehicle, laneReturn, {
          loaded: false,
          deltaSeconds: 1 / 30,
          blocked,
          halted: false,
        });
        ({ vehicle, laneReturn } = step);
        if (before !== 'parked' && laneReturn.mode === 'parked') parks += 1;
        if (step.rejoinDistance !== null) return { step, parks };
      }
      return { step: null, parks };
    };
    const towed = run(boxedIn);
    expect(towed.step?.towed).toBe(true);
    expect(towed.parks).toBe(LANE_RETURN_TOW_AFTER_PARKS - 1);
    const lane = sampleArcLengthPath(plan.path, towed.step!.rejoinDistance!);
    expect(boxedIn(lane.x, lane.z, 0.6)).toBe(false);
    // Another forklift standing on that lane point: it waits rather than be
    // put on top of it, however many times it gives up.
    const occupied = run(
      (x, z, r) => boxedIn(x, z, r) || Math.hypot(x - lane.x, z - lane.z) < r + 0.75
    );
    expect(occupied.step).toBeNull();
    expect(occupied.parks).toBeGreaterThanOrEqual(LANE_RETURN_TOW_AFTER_PARKS);
  });

  it('parks when boxed in, retries on its timer, and holds still while halted', () => {
    const boxedIn: ManualFootprintBlocked = () => true;
    let vehicle = createManualForkliftState({ x: 0, z: 0, heading: 0 });
    let laneReturn: LaneReturnState = createLaneReturnState();
    let parkedAt: number | null = null;
    for (let t = 0; t < LANE_RETURN_BLOCKED_SECONDS + 10 && parkedAt === null; t += 1 / 30) {
      ({ vehicle, laneReturn } = stepLaneReturn(plan, vehicle, laneReturn, {
        loaded: false,
        deltaSeconds: 1 / 30,
        blocked: boxedIn,
        halted: false,
      }));
      if (laneReturn.mode === 'parked') parkedAt = t;
    }
    expect(parkedAt).not.toBeNull();
    expect(vehicle.x).toBe(0);
    expect(vehicle.z).toBe(0);
    const retried = stepLaneReturn(
      plan,
      vehicle,
      { ...laneReturn, timer: LANE_RETURN_PARKED_RETRY_SECONDS - 0.01 },
      { loaded: false, deltaSeconds: 0.02, blocked: boxedIn, halted: false }
    );
    expect(retried.laneReturn.mode).toBe('returning');

    const free = createManualForkliftState({ x: 0, z: 0, heading: 0 });
    const halted = stepLaneReturn(plan, free, createLaneReturnState(), {
      loaded: false,
      deltaSeconds: 1,
      blocked: OPEN,
      halted: true,
    });
    expect([halted.vehicle.x, halted.vehicle.z, halted.rejoinDistance]).toEqual([0, 0, null]);
  });
});

describe('driven forklift against a truck', () => {
  it('meets the whole trailer, tail included, not just its registered centre', () => {
    // Registered as TruckBay does: the trailer point 5.75 m behind the tractor.
    positionRegistry.register('test-truck-cab', 100, 0, 0, 1, true, 0, 'truck');
    positionRegistry.register('test-truck-trailer', 100, -5.75, 0, 1, true, 0, 'truck');
    try {
      const blocked = createManualWorldBlocked('forklift-1', { originGround: 0, segments: 64 });
      // Beside the tail (11.6 m behind the tractor) and beside the cab nose.
      expect(blocked(101.5, -11.4, 0.6)).toBe(true);
      expect(blocked(101.5, 2.2, 0.6)).toBe(true);
      // Well clear to the side.
      expect(blocked(104, -6, 0.6)).toBe(false);
    } finally {
      positionRegistry.unregister('test-truck-cab');
      positionRegistry.unregister('test-truck-trailer');
    }
  });
});

describe('a truck and a forklift under manual control', () => {
  const frame = { x: 0, z: 0, tractorYaw: 0, trailerYaw: 0 };
  const input = (hold: boolean) => ({
    deltaSeconds: 1 / 60,
    arrivalReady: true,
    safetyHold: hold,
    serviceComplete: true,
    speedMultiplier: 1,
  });
  // Whether a forklift standing at (x, z), facing +z, touches the truck's body:
  // its footprint circles against the tractor's and trailer's boxes (1.3 m
  // half-width; front plate 5.05 m ahead of the tractor origin, tail 11.76 m behind).
  const touches = (state: TruckControllerState, x: number, z: number) => {
    const world = truckWorldFrame(state, frame);
    const meets = (ox: number, oz: number, yaw: number, ahead: number, behind: number) =>
      forkliftFootprintBlocked(x, z, 0, false, (cx, cz, r) => {
        const dx = Math.sin(yaw);
        const dz = Math.cos(yaw);
        const along = (cx - ox) * dx + (cz - oz) * dz;
        const lateral = (cx - ox) * dz - (cz - oz) * dx;
        const outAlong = along - Math.max(-behind, Math.min(ahead, along));
        const outLateral = lateral - Math.max(-1.3, Math.min(1.3, lateral));
        return Math.hypot(outAlong, outLateral) < r;
      });
    const trailerX = world.x - Math.sin(world.trailerYaw) * 5.75;
    const trailerZ = world.z - Math.cos(world.trailerYaw) * 5.75;
    return (
      meets(world.x, world.z, world.tractorYaw, 5.05, 0.6) ||
      meets(trailerX, trailerZ, world.trailerYaw, 6.01, 6.01)
    );
  };

  for (const [start, end] of [
    ['entering', 'docked'],
    ['docked', 'leaving'],
  ] as const) {
    it(`never touches a manual forklift standing on its route, ${start} to ${end}`, SWEEP, () => {
      // A straight box along the heading once missed the yard's turns and the
      // trailer cutting inside them, and plain v^2/2a missed the jerk limit:
      // trucks drove into 203 of 942 such forklifts arriving.
      let free = createTruckController('shipping', true, start);
      const placements: [number, number][] = [];
      for (let i = 0; i < 60 * 600 && free.phase !== end; i += 1) {
        free = stepTruckController(free, input(false)).state;
        if (i % 90 !== 0) continue;
        const world = truckWorldFrame(free, frame);
        // Ahead of the cab, and beside the trailer where it cuts a corner.
        placements.push([
          world.x + Math.sin(world.tractorYaw) * 6.5,
          world.z + Math.cos(world.tractorYaw) * 6.5,
        ]);
        placements.push([
          world.x - Math.sin(world.trailerYaw) * 8 + Math.cos(world.trailerYaw) * 1.6,
          world.z - Math.cos(world.trailerYaw) * 8 - Math.sin(world.trailerYaw) * 1.6,
        ]);
      }
      const contacts: string[] = [];
      try {
        for (const [x, z] of placements) {
          positionRegistry.register('test-forklift', x, z, 0, 1, true, 0, 'forklift', true);
          if (touches(createTruckController('shipping', true, start), x, z)) continue;
          let truck = createTruckController('shipping', true, start);
          let stoppedFor = 0;
          for (let i = 0; i < 60 * 600 && truck.phase !== end && stoppedFor < 60; i += 1) {
            const hold = truck.phase !== 'docked' && manualForkliftInTruckPath(truck);
            truck = stepTruckController(truck, input(hold)).state;
            if (touches(truck, x, z)) {
              contacts.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) in ${truck.phase}`);
              break;
            }
            stoppedFor = hold && Math.abs(truck.motion.speed) < 1e-3 ? stoppedFor + 1 : 0;
          }
        }
      } finally {
        positionRegistry.unregister('test-forklift');
      }
      expect(placements.length).toBeGreaterThan(20);
      expect(contacts).toEqual([]);
    });
  }

  it('is not held by a manual forklift it would never touch', () => {
    // Each once held a truck for good: 2.3-3.8 m clear of anything it would
    // sweep, beside a turn or the straightening, or behind the dock bay that
    // a docking trailer's tail stops short of, or at the tail of a truck about
    // to pull away from the dock.
    const arriving: [number, number][] = [
      [24, 77.4],
      [22.7, 78],
      [-12, 77.3],
      [-5.7, 101.1],
      [-4.5, 108.4],
      [0, 47.9],
      [3.2, 56],
    ];
    const cases = [
      ...arriving.map(([x, z]) => ({ x, z, start: 'entering' as const, end: 'docked' as const })),
      { x: 0, z: 47.85, start: 'docked' as const, end: 'leaving' as const },
    ];
    try {
      for (const { x, z, start, end } of cases) {
        positionRegistry.register('test-forklift', x, z, 0, 1, true, 0, 'forklift', true);
        let truck = createTruckController('shipping', true, start);
        let heldFor = 0;
        for (let i = 0; i < 60 * 400 && truck.phase !== end; i += 1) {
          const hold = truck.phase !== 'docked' && manualForkliftInTruckPath(truck);
          if (hold) heldFor += 1 / 60;
          truck = stepTruckController(truck, input(hold)).state;
        }
        expect(truck.phase, `forklift at (${x}, ${z}), ${start}`).toBe(end);
        expect(heldFor, `forklift at (${x}, ${z}), ${start}`).toBeLessThan(5);
      }
    } finally {
      positionRegistry.unregister('test-forklift');
    }
  });

  it('is held for by a manual forklift, never an autopilot one', () => {
    // Backing in, with a forklift on the apron behind the trailer.
    let truck = createTruckController('shipping', true, 'entering');
    for (let i = 0; i < 60 * 600 && truck.phase !== 'backing'; i += 1)
      truck = stepTruckController(truck, input(false)).state;
    const world = truckWorldFrame(truck, frame);
    const behindX = world.x - Math.sin(world.trailerYaw) * 16;
    const behindZ = world.z - Math.cos(world.trailerYaw) * 16;
    try {
      positionRegistry.register('test-forklift', behindX, behindZ, 0, 1, true, 0, 'forklift', true);
      expect(manualForkliftInTruckPath(truck)).toBe(true);
      positionRegistry.register(
        'test-forklift',
        behindX,
        behindZ,
        0,
        1,
        true,
        0,
        'forklift',
        false
      );
      expect(manualForkliftInTruckPath(truck)).toBe(false);
    } finally {
      positionRegistry.unregister('test-forklift');
    }
  });
});
