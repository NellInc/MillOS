import { describe, expect, it } from 'vitest';
import {
  CAB_DETAILS,
  TRUCK_CAB_SHELL,
  TRUCK_CORNER_DEFLECTORS,
  TRUCK_RIM_PROFILE,
  TRUCK_TYRE_PROFILE,
  TRUCK_TYRE_WIDTH,
  TRUCK_WHEEL_RADIUS,
} from './OptimizedTruckBay';

const cab = {
  halfWidth: TRUCK_CAB_SHELL.scale[0] / 2,
  back: TRUCK_CAB_SHELL.position[2] - TRUCK_CAB_SHELL.scale[2] / 2,
  front: TRUCK_CAB_SHELL.position[2] + TRUCK_CAB_SHELL.scale[2] / 2,
};

describe('tractor cab', () => {
  it('hangs nothing off the cab sides beyond the cab itself', () => {
    // The drive-axle fenders stood 0.3 m outboard of the cab from behind its
    // back wall to under the trailer nose, held by nothing: a rail sticking
    // out behind the cab.
    for (const { position, scale } of CAB_DETAILS) {
      const outboard = Math.abs(position[0]) + scale[0] / 2 > cab.halfWidth;
      if (!outboard) continue;
      expect(position[2] - scale[2] / 2, `detail at ${position}`).toBeGreaterThanOrEqual(cab.back);
      expect(position[2] + scale[2] / 2, `detail at ${position}`).toBeLessThanOrEqual(cab.front);
    }
  });

  it('chamfers both front corners back to the cab sides', () => {
    expect(TRUCK_CORNER_DEFLECTORS).toHaveLength(2);
    for (const { x, z, yaw } of TRUCK_CORNER_DEFLECTORS) {
      expect(Math.sign(x) * yaw).toBeLessThan(0);
      expect(Math.abs(x)).toBeLessThan(cab.halfWidth);
      expect(z).toBeLessThan(cab.front);
      expect(z).toBeGreaterThan(cab.front - 0.6);
    }
  });
});

describe('truck wheels', () => {
  it('rolls on a tyre with rounded shoulders and an open centre for its rim', () => {
    const radii = TRUCK_TYRE_PROFILE.map(([r]) => r);
    expect(Math.max(...radii)).toBe(TRUCK_WHEEL_RADIUS);
    const bead = Math.min(...radii);
    expect(bead).toBeGreaterThan(0.3);
    // The full radius holds only across the tread, not out to the sidewalls.
    for (const [r, y] of TRUCK_TYRE_PROFILE)
      if (r === TRUCK_WHEEL_RADIUS) expect(Math.abs(y)).toBeLessThan(TRUCK_TYRE_WIDTH / 2 - 0.04);
    expect(Math.max(...TRUCK_TYRE_PROFILE.map(([, y]) => Math.abs(y)))).toBeCloseTo(
      TRUCK_TYRE_WIDTH / 2,
      6
    );
  });

  it('closes the centre with a dished rim whose lip covers the bead', () => {
    const lip = Math.max(...TRUCK_RIM_PROFILE.map(([r]) => r));
    const bead = Math.min(...TRUCK_TYRE_PROFILE.map(([r]) => r));
    expect(lip).toBeGreaterThan(bead);
    const face = Math.max(...TRUCK_RIM_PROFILE.map(([, y]) => Math.abs(y)));
    // The dish between boss and lip lies at least 3 cm inside the wheel face.
    const dish = TRUCK_RIM_PROFILE.filter(([r]) => r >= 0.125 && r <= 0.29);
    expect(dish.length).toBeGreaterThan(0);
    for (const [, y] of dish) expect(face - Math.abs(y)).toBeGreaterThanOrEqual(0.03);
    // The rim reaches the axis: no hole through the wheel.
    expect(TRUCK_RIM_PROFILE[0][0]).toBe(0);
    expect(TRUCK_RIM_PROFILE.at(-1)![0]).toBe(0);
  });
});
