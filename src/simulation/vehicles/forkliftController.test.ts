import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { createRoundedForkliftRoute, type ForkliftWaypointAction } from '../forkliftRoute';
import { sampleArcLengthPath } from './vehicleKinematics';
import {
  FORKLIFT_MAXIMUM_STEERING_RADIANS,
  createForkliftRoutePlan,
  createInitialForkliftMotion,
  distanceAheadOnClosedPath,
  sampleForkliftLoadPose,
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
    for (let index = 0; index < 600; index += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 3.5,
        stopReason: 'none',
        loaded: true,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.speed).toBeCloseTo(1.8);
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

    // The closed route's seam is the pickup: no one-frame heading snap across it.
    const beforeSeam = sampleArcLengthPath(plan.path, plan.path.totalLength - 0.01);
    const afterSeam = sampleArcLengthPath(plan.path, 0.01);
    const seamStep = Math.abs(
      Math.atan2(
        beforeSeam.tangentX * afterSeam.tangentZ - beforeSeam.tangentZ * afterSeam.tangentX,
        beforeSeam.tangentX * afterSeam.tangentX + beforeSeam.tangentZ * afterSeam.tangentZ
      )
    );
    expect((seamStep * 180) / Math.PI).toBeLessThan(5);
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
