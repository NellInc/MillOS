import { describe, expect, it } from 'vitest';
import {
  createForkliftRoutePlan,
  createInitialForkliftMotion,
  forkliftRouteHeading,
  stepForkliftMotion,
} from './forkliftController';
import { shortestVehicleAngle } from './vehicleKinematics';

// A square loop whose pickup corner turns 90 degrees, so the forklift works it
// standing and then pivots onto the outgoing leg before it moves.
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

// An e-stop or drill halts the fleet; a forklift standing at a pivot kept
// turning in place under it, and one held facing its trailer swung away from it
// before it had worked. Working if the body neither moves nor yaws while it is
// stopped for an emergency, and finishes the pivot once the stop clears.
describe('forklift standing pivot under an emergency stop', () => {
  it('holds its heading while emergency-stopped and pivots once released', () => {
    const plan = createForkliftRoutePlan(points, actions);
    const start = createInitialForkliftMotion(plan, [0, 0, 0]);
    const departure = forkliftRouteHeading(plan, start.routeDistance);
    // Standing at the pickup on its arrival heading, a quarter turn to make.
    expect(Math.abs(shortestVehicleAngle(start.heading, departure))).toBeGreaterThan(1.5);

    let state = start;
    for (let frame = 0; frame < 180; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'emergency-stop',
        loaded: true,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.heading).toBeCloseTo(start.heading, 6);
    expect(state.wheelTravel).toBe(start.wheelTravel);

    for (let frame = 0; frame < 240; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: true,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.wheelTravel).toBeGreaterThan(start.wheelTravel);
    expect(
      Math.abs(shortestVehicleAngle(state.heading, forkliftRouteHeading(plan, state.routeDistance)))
    ).toBeLessThan(0.06);
  });

  it('still follows the lane while it brakes to a stop under the emergency stop', () => {
    const plan = createForkliftRoutePlan(points, actions);
    let state = createInitialForkliftMotion(plan, [0, 0, 0]);
    // Pivot, then drive up to cruise on the first leg.
    for (let frame = 0; frame < 360; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'none',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.speed).toBeGreaterThan(1);
    for (let frame = 0; frame < 240; frame += 1) {
      state = stepForkliftMotion(state, plan, {
        targetSpeed: 2,
        stopReason: 'emergency-stop',
        loaded: false,
        deltaSeconds: 1 / 60,
      });
    }
    expect(state.speed).toBe(0);
    expect(
      Math.abs(shortestVehicleAngle(state.heading, forkliftRouteHeading(plan, state.routeDistance)))
    ).toBeLessThan(0.06);
  });
});
