import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { FORKLIFT_PALLET_CLEARANCE } from '../../constants/dockLoading';
import { drivenLogisticsRoute } from '../logisticsRuntime';
import { protectedEgressApproaches } from '../layoutPlanning';
import {
  FORKLIFT_HOLD_CLEARANCE_METRES,
  createInitialForkliftMotion,
  distanceAheadOnClosedPath,
  forkliftActionHoldDistance,
  forkliftActionPermitted,
  nextForkliftActionCommitment,
  forkliftRouteHeading,
  resolveForkliftActionStop,
  sampleForkliftLoadPose,
  stepForkliftMotion,
  type ForkliftMotionState,
} from './forkliftController';
import { FORKLIFT_PALLET_REACH_METRES } from '../../components/models/ForkliftModel';

/**
 * Waiting for its truck, the forklift stood in the dock doorway, inside the
 * dock's protected pedestrian approach (`protectedEgressApproaches`). It now
 * waits short of the approach, facing along its lane, and drives in to the
 * dock only once the truck is ready.
 * Working if the held vehicle and its load are wholly outside every protected
 * approach, it keeps its heading while held, and it still works at the dock.
 */
const corridors = protectedEgressApproaches();
const circleMeetsBounds = (
  x: number,
  z: number,
  r: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number }
) =>
  Math.hypot(x - Math.max(b.minX, Math.min(x, b.maxX)), z - Math.max(b.minZ, Math.min(z, b.maxZ))) <
  r;

const DOCK_ACTION = { shipping: 'dropoff', receiving: 'pickup' } as const;

describe('forklift waits for its truck outside the dock pedestrian approach', () => {
  it('covers the vehicle body and the carried pallet', () => {
    const reach = Math.max(...Object.values(FORKLIFT_PALLET_REACH_METRES));
    expect(FORKLIFT_HOLD_CLEARANCE_METRES).toBeGreaterThanOrEqual(reach + 0.4 + 0.05);
  });

  for (const dock of ['shipping', 'receiving'] as const) {
    it(`${dock}: holds short of the approach, then drives in once the truck is ready`, () => {
      const points = SITE_LAYOUT.routes.forklifts[dock].points;
      const { plan } = drivenLogisticsRoute(dock, points);
      const markerIndex = plan.markers.findIndex(({ action }) => action.type === DOCK_ACTION[dock]);
      const marker = plan.markers[markerIndex];
      const markerSample = plan.path.samples.find(
        (s) => Math.abs(s.distance - marker.distance) < 1e-6
      )!;
      // The dock stand itself is inside the approach: that is why it may not wait there.
      expect(
        corridors.some((c) =>
          circleMeetsBounds(markerSample.x, markerSample.z, FORKLIFT_HOLD_CLEARANCE_METRES, c)
        )
      ).toBe(true);
      const hold = forkliftActionHoldDistance(
        plan,
        marker.distance,
        corridors,
        FORKLIFT_HOLD_CLEARANCE_METRES
      );
      const holdLeg = distanceAheadOnClosedPath(plan.path, hold, marker.distance);
      expect(holdLeg).toBeGreaterThan(0);

      const drive = (state: ForkliftMotionState, permitted: boolean, seconds: number) => {
        let s = state;
        for (let i = 0; i < seconds * 60; i++) {
          const toMarker = distanceAheadOnClosedPath(plan.path, s.routeDistance, marker.distance);
          const stop = resolveForkliftActionStop({
            distanceToMarker: toMarker,
            holdLeg,
            permitted,
          });
          if (permitted && toMarker <= 0.06) break;
          s = stepForkliftMotion(s, plan, {
            targetSpeed: Math.min(1.2, Math.sqrt(Math.max(0, 3 * (stop.stopDistance - 0.03)))),
            stopReason: stop.interlocked ? 'logistics-interlock' : 'none',
            loaded: dock === 'shipping',
            deltaSeconds: 1 / 60,
            maximumTravelDistance: stop.stopDistance,
            holdHeading: stop.interlocked,
          });
        }
        return s;
      };

      // Start a lap before the marker, on the approach lane.
      let state = createInitialForkliftMotion(plan, points[0]);
      state = drive(state, false, 120);
      const heldAt = { x: state.x, z: state.z, heading: state.heading };
      for (const c of corridors)
        expect(circleMeetsBounds(state.x, state.z, FORKLIFT_HOLD_CLEARANCE_METRES, c), c.id).toBe(
          false
        );
      expect(
        distanceAheadOnClosedPath(plan.path, state.routeDistance, marker.distance)
      ).toBeCloseTo(holdLeg, 1);
      // Square to its lane, and it stays put and square for another minute.
      expect(
        Math.abs(Math.sin(state.heading - forkliftRouteHeading(plan, state.routeDistance)))
      ).toBeLessThan(0.01);
      state = drive(state, false, 60);
      expect(Math.hypot(state.x - heldAt.x, state.z - heldAt.z)).toBeLessThan(0.07);
      expect(Math.abs(state.heading - heldAt.heading)).toBeLessThan(1e-9);

      // Truck ready: it drives in and arrives facing the trailer.
      state = drive(state, true, 120);
      expect(
        distanceAheadOnClosedPath(plan.path, state.routeDistance, marker.distance)
      ).toBeLessThanOrEqual(0.06);
      const outward = dock === 'shipping' ? 1 : -1;
      expect(Math.cos(state.heading) * outward).toBeGreaterThan(0.999);
    });
  }

  // Seen in the running app: the forklift left its hold point for the dock,
  // the shipping load completed while it drove in with one more pallet, and it
  // stood at the dock door, in the pedestrian approach, until the next truck.
  for (const latch of [false, true])
    it(`${latch ? 'finishes' : 'without the commitment, stops'} when the permission lapses on the way in`, () => {
      const { plan } = drivenLogisticsRoute(
        'shipping',
        SITE_LAYOUT.routes.forklifts.shipping.points
      );
      const marker = plan.markers.find(({ action }) => action.type === 'dropoff')!;
      const hold = forkliftActionHoldDistance(
        plan,
        marker.distance,
        corridors,
        FORKLIFT_HOLD_CLEARANCE_METRES
      );
      const holdLeg = distanceAheadOnClosedPath(plan.path, hold, marker.distance);
      let state = createInitialForkliftMotion(
        plan,
        SITE_LAYOUT.routes.forklifts.shipping.points[0]
      );
      state = { ...state, routeDistance: hold };
      let committed = false;
      let reached = false;
      for (let i = 0; i < 60 * 60; i++) {
        const toMarker = distanceAheadOnClosedPath(plan.path, state.routeDistance, marker.distance);
        // Permitted until it is a metre inside; the truck stays docked.
        const ownPermission = toMarker > holdLeg - 1;
        committed = latch
          ? nextForkliftActionCommitment({
              committed,
              permitted: ownPermission,
              distanceToMarker: toMarker,
              holdLeg,
            })
          : false;
        const permitted = forkliftActionPermitted({
          permitted: ownPermission,
          committed,
          truckAtDock: true,
        });
        if (permitted && toMarker <= 0.06) {
          reached = true;
          break;
        }
        const stop = resolveForkliftActionStop({ distanceToMarker: toMarker, holdLeg, permitted });
        state = stepForkliftMotion(state, plan, {
          targetSpeed: Math.min(1.2, Math.sqrt(Math.max(0, 3 * (stop.stopDistance - 0.03)))),
          stopReason: stop.interlocked ? 'logistics-interlock' : 'none',
          loaded: true,
          deltaSeconds: 1 / 60,
          maximumTravelDistance: stop.stopDistance,
          holdHeading: stop.interlocked,
        });
      }
      expect(reached).toBe(latch);
    });

  it('drops the commitment once the truck has gone', () => {
    expect(forkliftActionPermitted({ permitted: false, committed: true, truckAtDock: false })).toBe(
      false
    );
    expect(
      nextForkliftActionCommitment({
        committed: true,
        permitted: false,
        distanceToMarker: 9,
        holdLeg: 7,
      })
    ).toBe(false);
  });

  it('waits at the marker as before when the marker is outside every approach', () => {
    expect(
      resolveForkliftActionStop({ distanceToMarker: 5, holdLeg: 0, permitted: false })
    ).toEqual({ stopDistance: 5, interlocked: false });
    expect(
      resolveForkliftActionStop({ distanceToMarker: 0.05, holdLeg: 0, permitted: false })
    ).toEqual({ stopDistance: 0.05, interlocked: true });
    // Already inside the approach (e.g. the truck left as it drove in): finish at the marker.
    expect(
      resolveForkliftActionStop({ distanceToMarker: 2, holdLeg: 6, permitted: false })
    ).toEqual({
      stopDistance: 2,
      interlocked: false,
    });
  });
});

describe('forklift load cycle at a raised work surface', () => {
  const surface = 0.43;
  it('sets a pallet down on the surface and keeps the tines above it until it has backed off', () => {
    let prior = sampleForkliftLoadPose('dropoff', 0, 0.72, surface);
    expect(prior.forkHeight).toBeCloseTo(surface + FORKLIFT_PALLET_CLEARANCE, 6);
    for (let step = 1; step <= 600; step++) {
      const pose = sampleForkliftLoadPose('dropoff', step / 600, 0.72, surface);
      expect(Math.abs(pose.forkHeight - prior.forkHeight)).toBeLessThan(0.01);
      expect(pose.forkHeight).toBeGreaterThanOrEqual(surface - 1e-9);
      if (!pose.cargoEngaged) expect(pose.forkHeight).toBeCloseTo(surface, 6);
      prior = pose;
    }
  });

  it('picks a pallet off the surface without lowering into it', () => {
    let prior = sampleForkliftLoadPose('pickup', 0, 0.72, surface);
    expect(prior.forkHeight).toBeCloseTo(surface, 6);
    for (let step = 1; step <= 800; step++) {
      const pose = sampleForkliftLoadPose('pickup', step / 800, 0.72, surface);
      expect(Math.abs(pose.forkHeight - prior.forkHeight)).toBeLessThan(0.01);
      expect(pose.forkHeight).toBeGreaterThanOrEqual(surface - 1e-9);
      if (pose.phase === 'carrying')
        expect(pose.forkHeight).toBeGreaterThanOrEqual(surface + FORKLIFT_PALLET_CLEARANCE - 1e-9);
      prior = pose;
    }
  });

  it('is unchanged on the floor', () => {
    for (const action of ['pickup', 'dropoff'] as const)
      for (let step = 0; step <= 20; step++)
        expect(sampleForkliftLoadPose(action, step / 20, 0.72, 0)).toEqual(
          sampleForkliftLoadPose(action, step / 20, 0.72)
        );
  });
});
