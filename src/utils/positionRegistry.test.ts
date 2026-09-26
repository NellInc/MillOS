import { afterEach, describe, expect, it } from 'vitest';
import { positionRegistry } from './positionRegistry';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { createConveyorObstacles } from '../constants/factoryObstacles';
import { createRoundedForkliftRoute } from '../simulation/forkliftRoute';
import { createForkliftRoutePlan } from '../simulation/vehicles/forkliftController';
import { sampleArcLengthPath } from '../simulation/vehicles/vehicleKinematics';

const TEST_ID = 'position-registry-test-truck';

afterEach(() => {
  positionRegistry.unregister(TEST_ID);
  positionRegistry.registerObstacles([]);
});

describe('positionRegistry', () => {
  it('updates a live entry in place for allocation-free frame publishing', () => {
    positionRegistry.register(TEST_ID, 1, 2, 0, 1, false, 0, 'truck');
    const original = positionRegistry.get(TEST_ID);

    positionRegistry.register(TEST_ID, 4, 8, 1, 0, true, 0, 'truck');

    expect(positionRegistry.get(TEST_ID)).toBe(original);
    expect(original).toMatchObject({ x: 4, z: 8, dirX: 1, dirZ: 0, isStopped: true });
  });

  it('removes entries cleanly', () => {
    positionRegistry.register(TEST_ID, 1, 2);
    positionRegistry.unregister(TEST_ID);
    expect(positionRegistry.get(TEST_ID)).toBeUndefined();
  });

  it('checks the receiving turn along its real route rather than into the conveyor beyond it', () => {
    const route = createRoundedForkliftRoute(
      SITE_LAYOUT.routes.forklifts.receiving.points,
      [
        { type: 'pickup', duration: 7 },
        { type: 'none', duration: 0 },
        { type: 'none', duration: 0 },
        { type: 'dropoff', duration: 6 },
        { type: 'none', duration: 0 },
        { type: 'none', duration: 0 },
      ],
      2,
      8
    );
    const plan = createForkliftRoutePlan(route.path, route.actions);
    const distance = plan.markers.find(({ action }) => action.type === 'dropoff')!.distance;
    const pose = sampleArcLengthPath(plan.path, distance);
    expect([pose.x, pose.z]).toEqual([-28, -22]);
    const args = [
      pose.x,
      pose.z,
      pose.tangentX,
      pose.tangentZ,
      5,
      2.5,
      'forklift-2',
      true,
      0,
    ] as const;
    const sampleAhead = (ahead: number) => sampleArcLengthPath(plan.path, distance + ahead);
    positionRegistry.registerObstacles(createConveyorObstacles());

    // This is the observed deadlock: extrapolating straight along the inbound
    // leg (+Z) hits the belt. The route's own corner-bisecting tangent no longer
    // happens to, so the straight ray is spelled out rather than read from it.
    expect(positionRegistry.isPathClear(pose.x, pose.z, 0, 1, 5, 2.5, 'forklift-2', true, 0)).toBe(
      false
    );
    expect(positionRegistry.isPathClear(...args, sampleAhead)).toBe(true);

    // A physical obstacle on the route still stops the vehicle.
    positionRegistry.registerObstacles([
      ...createConveyorObstacles(),
      { id: 'test-barrier', minX: -32, maxX: -31, minZ: -23, maxZ: -21 },
    ]);
    expect(positionRegistry.isPathClear(...args, sampleAhead)).toBe(false);

    // Peer vehicles also retain the same clearance and vertical separation.
    positionRegistry.registerObstacles(createConveyorObstacles());
    positionRegistry.register(TEST_ID, -31, -22, 0, 1, true, 0, 'truck');
    expect(positionRegistry.isPathClear(...args, sampleAhead)).toBe(false);
    positionRegistry.register(TEST_ID, -31, -22, 0, 1, true, 8, 'truck');
    expect(positionRegistry.isPathClear(...args, sampleAhead)).toBe(true);
  });
});
