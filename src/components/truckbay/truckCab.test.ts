import { describe, expect, it } from 'vitest';
import {
  CAB_DETAILS,
  TRAILER_CORNER_POSTS,
  TRAILER_LAMP_BEZELS,
  TRAILER_MUDFLAPS,
  TRAILER_MUDFLAP_HANGERS,
  TRAILER_REAR_LAMPS,
  TRAILER_TOP_RAILS,
  TRUCK_CAB_BEVELS,
  TRUCK_CAB_SHELL,
  TRUCK_CORNER_DEFLECTORS,
  TRUCK_RIM_PROFILE,
  TRUCK_TYRE_PROFILE,
  TRUCK_TYRE_WIDTH,
  TRUCK_WHEEL_RADIUS,
  type DetailInstance,
} from './OptimizedTruckBay';

const lo = (d: DetailInstance, axis: 0 | 1 | 2) => d.position[axis] - d.scale[axis] / 2;
const hi = (d: DetailInstance, axis: 0 | 1 | 2) => d.position[axis] + d.scale[axis] / 2;

/**
 * final-med-12 logistics-close (1540,250)-(2560,1290): the trailer read as a
 * stack of untreated boxes - cube tail lamps standing on the doors, a pure
 * black box for a mud flap, a box body with nothing on its edges - and the
 * cab (1340,460)-(1560,820) as a box with no hood or grille bevel.
 * Trailer skin: x +/-1.275, y 0.325-4.575, z -11.35 to -0.15.
 */
describe('trailer body', () => {
  it('frames all four vertical edges with corner posts standing proud of the skin', () => {
    expect(TRAILER_CORNER_POSTS).toHaveLength(4);
    for (const side of [-1, 1])
      for (const end of [-11.35, -0.15]) {
        const post = TRAILER_CORNER_POSTS.find(
          (p) => Math.sign(p.position[0]) === side && Math.abs(p.position[2] - end) < 0.1
        );
        expect(post, `post at x ${side}, z ${end}`).toBeDefined();
        expect(Math.abs(hi(post!, 0) * side)).toBeGreaterThan(1.275);
        expect(lo(post!, 1)).toBeLessThanOrEqual(0.33);
        expect(hi(post!, 1)).toBeGreaterThanOrEqual(4.57);
      }
  });

  it('runs a top rail along both roof edges, post to post', () => {
    expect(TRAILER_TOP_RAILS).toHaveLength(2);
    for (const rail of TRAILER_TOP_RAILS) {
      expect(Math.abs(rail.position[0]) + rail.scale[0] / 2).toBeGreaterThan(1.275);
      expect(hi(rail, 1)).toBeGreaterThanOrEqual(4.575);
      expect(lo(rail, 2)).toBeLessThanOrEqual(-11.3);
      expect(hi(rail, 2)).toBeGreaterThanOrEqual(-0.2);
    }
  });

  it('recesses every rear lamp lens inside a four-sided housing', () => {
    expect(TRAILER_LAMP_BEZELS).toHaveLength(TRAILER_REAR_LAMPS.length * 4);
    TRAILER_REAR_LAMPS.forEach((lamp, index) => {
      const frame = TRAILER_LAMP_BEZELS.slice(index * 4, index * 4 + 4);
      // The housing face stands at least 2 cm proud of the lens face (rear is -z).
      for (const part of frame) expect(lo(lamp, 2) - lo(part, 2)).toBeGreaterThanOrEqual(0.02);
      // ... and closes all four sides of the lens.
      expect(Math.min(...frame.map((p) => lo(p, 0)))).toBeLessThanOrEqual(lo(lamp, 0));
      expect(Math.max(...frame.map((p) => hi(p, 0)))).toBeGreaterThanOrEqual(hi(lamp, 0));
      expect(Math.min(...frame.map((p) => lo(p, 1)))).toBeLessThanOrEqual(lo(lamp, 1));
      expect(Math.max(...frame.map((p) => hi(p, 1)))).toBeGreaterThanOrEqual(hi(lamp, 1));
      // No part of the frame covers the lens itself.
      for (const part of frame) {
        const overlapX = Math.min(hi(part, 0), hi(lamp, 0)) - Math.max(lo(part, 0), lo(lamp, 0));
        const overlapY = Math.min(hi(part, 1), hi(lamp, 1)) - Math.max(lo(part, 1), lo(lamp, 1));
        expect(overlapX <= 1e-9 || overlapY <= 1e-9).toBe(true);
      }
    });
  });

  it('hangs every mud flap from a metal bar across its top edge', () => {
    expect(TRAILER_MUDFLAP_HANGERS).toHaveLength(TRAILER_MUDFLAPS.length);
    TRAILER_MUDFLAPS.forEach((flap, index) => {
      const bar = TRAILER_MUDFLAP_HANGERS[index];
      expect(lo(bar, 0)).toBeLessThanOrEqual(lo(flap, 0));
      expect(hi(bar, 0)).toBeGreaterThanOrEqual(hi(flap, 0));
      // Seated on the flap's top edge, and thicker than the flap so it reads.
      expect(lo(bar, 1)).toBeLessThanOrEqual(hi(flap, 1));
      expect(hi(bar, 1)).toBeGreaterThan(hi(flap, 1));
      expect(bar.scale[2]).toBeGreaterThan(flap.scale[2]);
    });
  });
});

describe('tractor cab front', () => {
  it('slopes a hood lip between the grille and the windscreen, across the cab', () => {
    const hood = TRUCK_CAB_BEVELS.find((bevel) => bevel.part === 'hood');
    expect(hood).toBeDefined();
    expect(hood!.scale[0]).toBeGreaterThanOrEqual(0.85 * TRUCK_CAB_SHELL.scale[0]);
    // Between the grille plate top (1.51) and the windscreen base (1.925).
    expect(hood!.position[1]).toBeGreaterThan(1.51);
    expect(hood!.position[1]).toBeLessThan(1.925);
    // Tilted back from the vertical cab face, not a flat slab.
    expect(hood!.rotationX).toBeLessThan(-0.25);
    expect(hood!.rotationX).toBeGreaterThan(-1.2);
  });

  it('bevels the grille surround and the roof fairing nose', () => {
    expect(TRUCK_CAB_BEVELS.some((bevel) => bevel.part === 'grille-surround')).toBe(true);
    const nose = TRUCK_CAB_BEVELS.find((bevel) => bevel.part === 'fairing-nose');
    expect(nose).toBeDefined();
    expect(nose!.rotationX).toBeLessThan(-0.25);
    for (const bevel of TRUCK_CAB_BEVELS)
      expect(Math.abs(bevel.position[0]) + bevel.scale[0] / 2).toBeLessThanOrEqual(1.36);
  });
});

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
