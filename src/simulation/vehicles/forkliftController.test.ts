import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { createRoundedForkliftRoute, type ForkliftWaypointAction } from '../forkliftRoute';
import { drivenLogisticsRoute } from '../logisticsRuntime';
import { sampleArcLengthPath } from './vehicleKinematics';
import {
  FORKLIFT_MAXIMUM_STEERING_RADIANS,
  createForkliftRoutePlan,
  createInitialForkliftMotion,
  distanceAheadOnClosedPath,
  sampleForkliftLoadPose,
  resolveForkliftStopReason,
  stepForkliftMotion,
} from './forkliftController';

const points = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 0, 10],
  [0, 0, 10],
] as const;
const actions = [
  { type: 'pickup', duration: 4 },
  { type: 'none', duration: 0 },
  { type: 'dropoff', duration: 4 },
  { type: 'none', duration: 0 },
] as const;

describe('forklift controller', () => {
  it('builds a closed measured route with operational markers', () => {
    const plan = createForkliftRoutePlan(points, actions);
    expect(plan.path.totalLength).toBeCloseTo(40);
    expect(plan.markers).toHaveLength(2);
    expect(plan.markers[0].action.type).toBe('pickup');
    expect(plan.markers[1].action.type).toBe('dropoff');
  });

  it('moves by arc length and produces steering on a corner', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    let maximumSteering = 0;
    for (let index = 0; index < 600; index += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
      maximumSteering = Math.max(maximumSteering, Math.abs(state.steeringAngle));
    }
    expect(state.wheelTravel).toBeGreaterThan(10);
    expect(maximumSteering).toBeGreaterThan(0);
    expect(Number.isFinite(state.heading)).toBe(true);
  });

  it('decelerates under a safety hold without advancing indefinitely', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    for (let index = 0; index < 180; index += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    const holdStart = state.routeDistance;
    for (let index = 0; index < 180; index += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'route-blocked',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.speed).toBeCloseTo(0);
    expect(distanceAheadOnClosedPath(plan.path, holdStart, state.routeDistance)).toBeLessThan(3);
    expect(state.stopReason).toBe('route-blocked');
  });

  it('uses a lower loaded speed envelope', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    // This square's corners are unrounded, so the speed dips at each; the
    // envelope is the top speed reached on its 10 m legs.
    let fastest = 0;
    for (let index = 0; index < 600; index += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 3.5,
        stopReason: 'none',
        loaded: true,
        deltaSeconds: 1 / 60,
      });
      fastest = Math.max(fastest, state.speed);
    }
    expect(fastest).toBeCloseTo(1.8);
  });

  it('publishes explicit pickup phases and attaches cargo only after engagement', () => {
    expect(sampleForkliftLoadPose('pickup', 0.05, 1.2).phase).toBe('aligning');
    expect(sampleForkliftLoadPose('pickup', 0.4, 1.2).cargoEngaged).toBe(true);
    expect(sampleForkliftLoadPose('pickup', 0.7, 1.2).mastTilt).toBeLessThan(0);
    expect(sampleForkliftLoadPose('pickup', 1, 1.2).operationComplete).toBe(true);
  });

  it('starts a dropoff from the loaded-travel mast tilt', () => {
    expect(sampleForkliftLoadPose('dropoff', 0.01, 1.2).mastTilt).toBe(-0.055);
    expect(sampleForkliftLoadPose('dropoff', 0.99, 1.2).mastTilt).toBe(0);
  });

  it.each([
    ['shipping', SITE_LAYOUT.routes.forklifts.shipping.points, 4],
    ['receiving', SITE_LAYOUT.routes.forklifts.receiving.points, 3],
  ] as const)('points the %s forklift along travel on every straight leg', (_, route, dropoff) => {
    const routeActions: ForkliftWaypointAction[] = route.map((__, index) =>
      index === 0
        ? { type: 'pickup', duration: 7 }
        : index === dropoff
          ? { type: 'dropoff', duration: 6 }
          : { type: 'none', duration: 0 }
    );
    const rounded = createRoundedForkliftRoute(route, routeActions, 2, 8);
    const plan = createForkliftRoutePlan(rounded.path, rounded.actions);
    const headingOf = (x: number, z: number) => Math.atan2(x, z);

    // Walk the route by arc length (the shipping route runs both ways along
    // z = 42, so a nearest-point lookup would be ambiguous there).
    let worstLegDeviation = 0;
    let measuredLength = 0;
    const samples = plan.path.samples;
    samples.slice(1).forEach((end, index) => {
      const start = samples[index];
      const length = end.distance - start.distance;
      if (length <= 1) return;
      measuredLength += length;
      const legHeading = headingOf(end.x - start.x, end.z - start.z);
      for (let along = 0; along <= length; along += 0.1) {
        const sample = sampleArcLengthPath(plan.path, start.distance + along);
        const heading = headingOf(sample.tangentX, sample.tangentZ);
        const deviation = Math.abs(
          Math.atan2(Math.sin(heading - legHeading), Math.cos(heading - legHeading))
        );
        worstLegDeviation = Math.max(worstLegDeviation, deviation);
      }
    });
    // Straight legs are most of either route; the corner blends are the rest.
    expect(measuredLength / plan.path.totalLength).toBeGreaterThan(0.7);
    expect((worstLegDeviation * 180) / Math.PI).toBeLessThan(3);

    // The closed route's seam is the pickup, where the route turns back on
    // itself. That turn is a standing pivot: the path arrives on its incoming
    // leg and leaves on its outgoing one, and the plan marks the span between
    // them so the body turns in place (the driven-lap test bounds its rate).
    const beforeSeam = sampleArcLengthPath(plan.path, plan.path.totalLength - 0.01);
    const lastLeg = plan.path.samples.at(-2)!;
    expect(headingOf(beforeSeam.tangentX, beforeSeam.tangentZ)).toBeCloseTo(
      headingOf(route[0][0] - lastLeg.x, route[0][2] - lastLeg.z),
      6
    );
    expect(plan.pivots?.some(({ start }) => start === 0)).toBe(true);
  });

  it('places and disengages a carried pallet in distinct phases', () => {
    const placing = sampleForkliftLoadPose('dropoff', 0.4, 1.2);
    const disengaged = sampleForkliftLoadPose('dropoff', 0.65, 1.2);
    expect(placing.phase).toBe('placing');
    expect(placing.cargoEngaged).toBe(true);
    expect(disengaged.phase).toBe('disengaging');
    expect(disengaged.cargoEngaged).toBe(false);
  });

  it('preserves route progress across common and degraded rendering frequencies', () => {
    const plan = createForkliftRoutePlan(points, actions);
    const simulate = (framesPerSecond: number) => {
      let state = createInitialForkliftMotion(plan, [0, 0, 0]);
      for (let frame = 0; frame < framesPerSecond * 20; frame += 1) {
        state = stepForkliftMotion(state, plan, {
          targetSpeed: 2,
          stopReason: 'none',
          loaded: false,
          deltaSeconds: 1 / framesPerSecond,
        });
      }
      return state;
    };

    const results = [15, 30, 60, 120].map(simulate);
    const wheelTravel = results.map((state) => state.wheelTravel);
    expect(Math.max(...wheelTravel) - Math.min(...wheelTravel)).toBeLessThan(0.05);
    for (const state of results) {
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.z)).toBe(true);
      expect(Math.abs(state.steeringAngle)).toBeLessThanOrEqual(FORKLIFT_MAXIMUM_STEERING_RADIANS);
    }
  });

  it('stops for an emergency, holds position, and resumes without a jump', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    for (let frame = 0; frame < 180; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }

    const emergencyStart = state.wheelTravel;
    for (let frame = 0; frame < 180; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'emergency-stop',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    const stoppedAt = state.wheelTravel;
    expect(stoppedAt - emergencyStart).toBeLessThan(3);
    expect(state.speed).toBe(0);
    expect(state.stopReason).toBe('emergency-stop');

    for (let frame = 0; frame < 120; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.wheelTravel).toBeGreaterThan(stoppedAt);
    expect(state.stopReason).toBe('none');
  });

  it('honours a finite movement authority without overshoot', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    for (let frame = 0; frame < 180; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }

    const wheelTravel = state.wheelTravel;
    state = stepForkliftMotion(state, plan, {
      targetSpeed: 2,
      stopReason: 'none',
      loaded: false,
      deltaSeconds: 1 / 60,
      maximumTravelDistance: 0.01,
    });
    expect(state.wheelTravel - wheelTravel).toBeCloseTo(0.01);
    expect(state.speed).toBe(0);
  });

  it('substeps a dropped frame without violating a nearby movement authority', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    for (let frame = 0; frame < 180; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }

    const wheelTravel = state.wheelTravel;
    state = stepForkliftMotion(state, plan, {
      targetSpeed: 2,
      stopReason: 'none',
      loaded: false,
      deltaSeconds: 0.2,
      maximumTravelDistance: 0.08,
    });
    expect(state.wheelTravel - wheelTravel).toBeCloseTo(0.08);
    expect(state.speed).toBe(0);
  });
});

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Drives the default route for two full load cycles the way ForkliftSystem
 * does: travel up to the next action marker under its braking target and
 * movement authority, hold there for the action, then go on.
 */
const simulateDrivenLaps = (dock: 'shipping' | 'receiving') => {
  const authored = SITE_LAYOUT.routes.forklifts[dock].points;
  const { plan } = drivenLogisticsRoute(dock, authored);
  const cruise = dock === 'shipping' ? 3.5 : 3;
  let state = createInitialForkliftMotion(plan, authored[0]);
  let markerIndex = 0;
  let loaded = false;
  let actions = 0;
  let worstYawStep = 0;
  let worstCrab = 0;
  let peakLateral = 0;
  for (let frame = 0; frame < 60 * 600 && actions < 4; frame += 1) {
    const marker = plan.markers[markerIndex];
    const ahead = distanceAheadOnClosedPath(plan.path, state.routeDistance, marker.distance);
    const relevant = (marker.action.type === 'pickup') !== loaded;
    if (relevant && ahead <= 0.06) {
      // The load operation snaps the vehicle onto its marker and holds it
      // there, heading unchanged, as ForkliftSystem does.
      const at = sampleArcLengthPath(plan.path, marker.distance);
      state = { ...state, routeDistance: marker.distance, x: at.x, z: at.z, speed: 0 };
      loaded = marker.action.type === 'pickup';
      markerIndex = (markerIndex + 1) % plan.markers.length;
      actions += 1;
      continue;
    }
    const targetSpeed =
      relevant && ahead < 5 ? Math.min(cruise, Math.sqrt(Math.max(0, 3 * (ahead - 0.03)))) : cruise;
    const next = stepForkliftMotion(state, plan, {
      targetSpeed,
      stopReason: 'none',
      loaded,
      deltaSeconds: 1 / 60,
      maximumTravelDistance: relevant ? ahead : undefined,
    });
    const yawStep = Math.abs(wrapAngle(next.heading - state.heading));
    worstYawStep = Math.max(worstYawStep, yawStep);
    const travel = Math.hypot(next.x - state.x, next.z - state.z);
    if (travel > 1e-3) {
      peakLateral = Math.max(peakLateral, yawStep * 60 * next.speed);
      const travelHeading = Math.atan2(next.x - state.x, next.z - state.z);
      worstCrab = Math.max(worstCrab, Math.abs(wrapAngle(next.heading - travelHeading)));
    }
    state = next;
  }
  return { actions, worstYawStep, peakLateral, worstCrab };
};

describe('forklift driven laps on the default layout', () => {
  it.each(['shipping', 'receiving'] as const)(
    'turns the %s forklift at a bounded yaw rate and never drives sideways',
    (dock) => {
      const { actions, worstYawStep, peakLateral, worstCrab } = simulateDrivenLaps(dock);
      expect(actions).toBe(4);
      // Corners are taken at the 1.05 m/s^2 the speed limit is designed for
      // (2.9 when the look-ahead ignored the jerk it takes to start braking).
      expect(peakLateral).toBeLessThan(1.4);
      // Shipping spun 140 degrees in about 0.1 s at x 24.5 (28 rad/s peak).
      // The per-step check reads across +/-pi through wrapAngle.
      expect(worstYawStep).toBeLessThan(1.5 / 60);
      // And at the 180-degree pickup cusp the body turned 90 degrees sideways
      // while it travelled straight: it now stops and pivots instead.
      expect(worstCrab).toBeLessThan(0.3);
    }
  );
});

describe('forklift fleet-priority safety arbitration', () => {
  const stoppedHigherPeer = { id: 'forklift-2', isStopped: true };
  const peerWait = {
    id: 'forklift-1',
    emergencyStopped: false,
    crossingClear: true,
    logisticsInterlock: false,
    pathClear: false,
    obstaclePathClear: true,
    nearby: [stoppedHigherPeer],
  };

  it.each([
    [{ emergencyStopped: true }, 'emergency-stop'],
    [{ crossingClear: false }, 'crossing-reservation'],
    [{ logisticsInterlock: true }, 'logistics-interlock'],
    [{ obstaclePathClear: false }, 'route-blocked'],
  ] as const)('does not release a higher-priority hold: %o', (override, expected) => {
    expect(resolveForkliftStopReason({ ...peerWait, ...override })).toBe(expected);
  });

  it('preserves emergency priority when every other interlock is also active', () => {
    expect(
      resolveForkliftStopReason({
        ...peerWait,
        emergencyStopped: true,
        crossingClear: false,
        logisticsInterlock: true,
        obstaclePathClear: false,
      })
    ).toBe('emergency-stop');
  });

  it('releases only the lowest-id vehicle after all forklift peers have stopped', () => {
    expect(resolveForkliftStopReason(peerWait)).toBe('none');
    expect(
      resolveForkliftStopReason({
        ...peerWait,
        nearby: [{ ...stoppedHigherPeer, isStopped: false }],
      })
    ).toBe('vehicle-queue');
    expect(resolveForkliftStopReason({ ...peerWait, nearby: [] })).toBe('vehicle-queue');
    expect(
      resolveForkliftStopReason({ ...peerWait, nearby: [{ ...stoppedHigherPeer, kind: 'truck' }] })
    ).toBe('vehicle-queue');
  });

  it('compares all peer IDs independently of registry insertion order', () => {
    const peers = [
      { id: 'forklift-3', isStopped: true },
      { id: 'forklift-1', isStopped: true },
    ];
    for (const nearby of [peers, [...peers].reverse()]) {
      expect(resolveForkliftStopReason({ ...peerWait, id: 'forklift-2', nearby })).toBe(
        'vehicle-queue'
      );
    }
  });

  it('queues behind a vehicle without calling it an obstruction, but a barrier still blocks', () => {
    expect(resolveForkliftStopReason({ ...peerWait, nearby: [] })).toBe('vehicle-queue');
    expect(resolveForkliftStopReason({ ...peerWait, nearby: [], obstaclePathClear: false })).toBe(
      'route-blocked'
    );
  });

  it('retains yielding on a clear path and releases an unopposed clear route', () => {
    expect(
      resolveForkliftStopReason({
        ...peerWait,
        pathClear: true,
        nearby: [{ id: 'forklift-0', isStopped: true }],
      })
    ).toBe('vehicle-yield');
    expect(resolveForkliftStopReason({ ...peerWait, pathClear: true, nearby: [] })).toBe('none');
  });
});
