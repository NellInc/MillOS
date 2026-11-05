import { describe, expect, it } from 'vitest';
import { currentLogisticsLayout } from './layoutPlanning';
import { drivenLogisticsRoute, reconcileLogisticsMotion } from './logisticsRuntime';
import { createInitialForkliftMotion } from './vehicles/forkliftController';
import { sampleArcLengthPath } from './vehicles/vehicleKinematics';

/*
 * The LayoutPlanner's main controls move the staging areas; the route corners
 * sit behind a disclosure. A staging-only apply rebuilds each forklift's route
 * from the same points, so there is nothing to reconcile. A forklift a player
 * drove, and left standing off its lane, still refused every such apply as
 * "occupies a changed or ambiguous route corner".
 */
describe('a staging-only apply with a forklift off its lane', () => {
  for (const dock of ['shipping', 'receiving'] as const) {
    it(`keeps the ${dock} forklift's pose and progress when its route is unchanged`, () => {
      const points = currentLogisticsLayout().routes[dock];
      const old = drivenLogisticsRoute(dock, points).plan;
      const rebuilt = drivenLogisticsRoute(
        dock,
        points.map((point) => [...point])
      ).plan;
      const onLane = sampleArcLengthPath(old.path, 12);
      const motion = {
        ...createInitialForkliftMotion(old, points[0]),
        routeDistance: 12,
        // Two metres beside the lane, where a driver left it.
        x: onLane.x + 2,
        z: onLane.z + 2,
        wheelTravel: 91,
      };
      expect(reconcileLogisticsMotion(old, rebuilt, motion, 1)).toEqual(motion);
    });
  }

  it('still refuses a changed route the forklift cannot be placed on', () => {
    const points = currentLogisticsLayout().routes.shipping;
    const old = drivenLogisticsRoute('shipping', points).plan;
    const moved = points.map((point, index) =>
      index === 2 ? ([point[0] + 3, point[1], point[2]] as typeof point) : [...point]
    ) as typeof points;
    const next = drivenLogisticsRoute('shipping', moved).plan;
    const onLane = sampleArcLengthPath(old.path, 12);
    const motion = {
      ...createInitialForkliftMotion(old, points[0]),
      routeDistance: 12,
      x: onLane.x + 2,
      z: onLane.z + 2,
    };
    expect(reconcileLogisticsMotion(old, next, motion, 1)).toBeNull();
  });
});
