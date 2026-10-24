/**
 * Tyre tracks and oil stains on the truck yards are laid where the trucks
 * actually drive and stand, read from the real controller rather than placed
 * by eye. Every check here steps its own visit at the controller's 60 Hz,
 * independently of the 30 Hz trace the layout is built from.
 */
import { describe, expect, it } from 'vitest';
import {
  createTruckController,
  getTruckControllerPose,
  stepTruckController,
} from './truckController';
import type { TruckAnimState } from './useTruckPhysics';
import {
  DOCK_CHANNEL_SLAB,
  TRUCK_OIL_DRIP_POINTS,
  TRUCK_WHEEL_LINES,
  YARD_OIL_OPACITY,
  YARD_WEAR_PAVING,
  buildYardWearLayout,
  wheelLineContact,
} from './yardWear';

interface VisitStep {
  readonly pose: TruckAnimState;
  readonly speed: number;
}

const simulateVisit = (dock: 'shipping' | 'receiving'): VisitStep[] => {
  let state = createTruckController(dock);
  const steps: VisitStep[] = [];
  for (let frame = 0; frame < 60 * 240; frame += 1) {
    const result = stepTruckController(state, {
      deltaSeconds: 1 / 60,
      arrivalReady: false,
      safetyHold: false,
      serviceComplete: true,
      speedMultiplier: 1,
    });
    steps.push({ pose: result.pose, speed: result.state.motion.speed });
    state = result.state;
    if (result.departedThisStep) break;
  }
  return steps;
};

const shippingVisit = simulateVisit('shipping');
const receivingVisit = simulateVisit('receiving');
const shipping = buildYardWearLayout('shipping');
const receiving = buildYardWearLayout('receiving');

/** Every wheel-line contact point of a visit, bucketed on a 1 m grid. */
const contactGrid = (visit: readonly VisitStep[]) => {
  const grid = new Map<string, { x: number; z: number }[]>();
  for (const { pose } of visit) {
    for (const line of TRUCK_WHEEL_LINES) {
      const point = wheelLineContact(pose, line);
      const key = `${Math.floor(point.x)},${Math.floor(point.z)}`;
      const bucket = grid.get(key) ?? [];
      bucket.push(point);
      grid.set(key, bucket);
    }
  }
  return (x: number, z: number): number => {
    let nearest = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        for (const point of grid.get(`${Math.floor(x) + dx},${Math.floor(z) + dz}`) ?? []) {
          nearest = Math.min(nearest, Math.hypot(point.x - x, point.z - z));
        }
      }
    }
    return nearest;
  };
};

const allSamples = (layout: ReturnType<typeof buildYardWearLayout>) =>
  layout.tracks.flatMap((track) => track.samples);

describe('truck-yard tyre tracks', () => {
  it('lies on the wheel lines a 60 Hz visit actually drives', () => {
    const distanceToWheel = contactGrid(shippingVisit);
    const samples = allSamples(shipping);
    expect(samples.length).toBeGreaterThan(400);
    const worst = Math.max(...samples.map((sample) => distanceToWheel(sample.x, sample.z)));
    expect(worst).toBeLessThan(0.35);
  });

  it('covers the U-turn and the back-in lane, and wears the lane hardest', () => {
    const samples = allSamples(shipping);
    // The U-turn's apex: a 14 m arc about (6, 86) bottoms out at (6, 72).
    expect(samples.some((s) => Math.hypot(s.x - 6, s.z - 72) < 1.5)).toBe(true);
    // The back-in lane on the bay centreline, dual tyres either side.
    const lane = samples.filter(
      (s) => s.z > 68 && s.z < 100 && Math.abs(Math.abs(s.x) - 1.19) < 0.3
    );
    expect(lane.length).toBeGreaterThan(40);
    const laneWeight = lane.reduce((sum, s) => sum + s.weight, 0) / lane.length;
    const elsewhere = samples.filter((s) => s.z > 68 && Math.abs(s.x) > 4);
    const elsewhereWeight = elsewhere.reduce((sum, s) => sum + s.weight, 0) / elsewhere.length;
    expect(laneWeight).toBeGreaterThan(elsewhereWeight);
  });

  it('keeps every mark on the yard paving and off the dock channel slab', () => {
    for (const sample of allSamples(shipping)) {
      expect(sample.x).toBeGreaterThanOrEqual(YARD_WEAR_PAVING.minX);
      expect(sample.x).toBeLessThanOrEqual(YARD_WEAR_PAVING.maxX);
      expect(sample.z).toBeGreaterThanOrEqual(YARD_WEAR_PAVING.minZ);
      expect(sample.z).toBeLessThanOrEqual(YARD_WEAR_PAVING.maxZ);
      const onSlab =
        Math.abs(sample.x) <= DOCK_CHANNEL_SLAB.halfWidth + 0.4 &&
        sample.z <= DOCK_CHANNEL_SLAB.maxZ + 0.3;
      expect(onSlab).toBe(false);
      expect(sample.weight).toBeGreaterThan(0);
      expect(sample.weight).toBeLessThanOrEqual(1);
    }
  });
});

describe('truck-yard oil stains', () => {
  const standingPoses = shippingVisit.filter((step) => Math.abs(step.speed) < 0.01);
  const docked = shippingVisit.find((step) => step.pose.phase === 'docked')!.pose;

  it('drips under the docked tractor engine', () => {
    const engine = TRUCK_OIL_DRIP_POINTS[0];
    const engineX =
      docked.x + engine.x * Math.cos(docked.rotation) + engine.z * Math.sin(docked.rotation);
    const engineZ =
      docked.z - engine.x * Math.sin(docked.rotation) + engine.z * Math.cos(docked.rotation);
    expect(
      shipping.stains.some((stain) => Math.hypot(stain.x - engineX, stain.z - engineZ) < 0.3)
    ).toBe(true);
  });

  /**
   * In final7 med-12 the dock stand's oil did not read from logistics-close or
   * shipping: 0.5 m off the bay centre the apron measured L 130, the same as
   * clean apron 3.5 m further out, and on the centre it was lost in the blue
   * guide line. Scattered round drips turned at random cover 1.6 m of the
   * centreline at a combined opacity of 0.3 and nothing either side. A dock
   * bay's oil is a streak down the bay centre, laid by tractors that stop a
   * little short or long of each other, and the streak is what reads.
   */
  it('lays the dock stand oil as one streak down the bay centre', () => {
    /** Combined opacity that reads over the apron at the review cameras' grazing angle. */
    const MIN_STREAK_OIL = 0.3;
    const along = (stain: (typeof shipping.stains)[number]) =>
      (stain.x - docked.x) * Math.sin(docked.rotation) +
      (stain.z - docked.z) * Math.cos(docked.rotation);
    const across = (stain: (typeof shipping.stains)[number]) =>
      (stain.x - docked.x) * Math.cos(docked.rotation) -
      (stain.z - docked.z) * Math.sin(docked.rotation);
    // Every stain wider than a fresh drip lies along the bay.
    for (const stain of shipping.stains) {
      if (stain.stretch < 1.6) continue;
      const turn = Math.abs(Math.sin(stain.rotation - docked.rotation));
      expect(turn, `streak stain at along ${along(stain).toFixed(2)}`).toBeLessThan(0.15);
    }
    // The opacity the stains lay down together at a point (dock-local metres
    // along and across the bay), from the oil mask's profile: full inside 0.7
    // of a stain's radius, fading to nothing at it.
    const oilAt = (a: number, c: number) =>
      1 -
      shipping.stains.reduce((clear, stain) => {
        const d = stain.rotation - docked.rotation;
        const dAlong = a - along(stain);
        const dAcross = c - across(stain);
        // Into the stain's own frame: its long axis is its `rotation`.
        const u = dAlong * Math.cos(d) + dAcross * Math.sin(d);
        const v = -dAlong * Math.sin(d) + dAcross * Math.cos(d);
        const rho = Math.hypot(u / (stain.radius * stain.stretch), v / stain.radius);
        const profile = Math.min(1, Math.max(0, (1 - rho) / 0.3));
        return clear * (1 - YARD_OIL_OPACITY * stain.opacity * profile);
      }, 1);
    // Dark enough to read over the apron along an unbroken 3 m of the bay
    // centre, and as wide as a sump drips (0.8 m) at the streak's middle.
    let run = 0;
    let longest = 0;
    let middle = 0;
    for (let t = -1; t <= 6; t += 0.05) {
      run = oilAt(t, 0) >= MIN_STREAK_OIL ? run + 0.05 : 0;
      if (run > longest) {
        longest = run;
        middle = t - run / 2;
      }
    }
    expect(longest, 'streak length, m').toBeGreaterThanOrEqual(3);
    for (const c of [-0.4, 0.4])
      expect(oilAt(middle, c), `oil at ${c} m across`).toBeGreaterThanOrEqual(MIN_STREAK_OIL);
    // And no further forward than the tractor's nose (KEEP CLEAR starts past it).
    for (const stain of shipping.stains)
      expect(along(stain) + stain.radius * stain.stretch).toBeLessThanOrEqual(5.05);
  });

  it('only stains ground a truck stands on', () => {
    expect(shipping.stains.length).toBeGreaterThan(2);
    for (const stain of shipping.stains) {
      const under = standingPoses.some(({ pose }) => {
        const dx = stain.x - pose.x;
        const dz = stain.z - pose.z;
        // Into the tractor's frame: along (sin r, cos r), across (cos r, -sin r).
        const along = dx * Math.sin(pose.rotation) + dz * Math.cos(pose.rotation);
        const across = dx * Math.cos(pose.rotation) - dz * Math.sin(pose.rotation);
        return along > -1 && along < 5 && Math.abs(across) < 1.4;
      });
      expect(under, `stain at ${stain.x.toFixed(2)}, ${stain.z.toFixed(2)}`).toBe(true);
    }
  });
});

describe('receiving yard wear', () => {
  it('is the shipping yard turned half a revolution, as the controller turns the truck', () => {
    const shippingSamples = allSamples(shipping);
    const receivingSamples = allSamples(receiving);
    expect(receivingSamples).toHaveLength(shippingSamples.length);
    receivingSamples.forEach((sample, index) => {
      expect(sample.x).toBeCloseTo(-shippingSamples[index].x, 6);
      expect(sample.z).toBeCloseTo(-shippingSamples[index].z, 6);
    });
    const distanceToWheel = contactGrid(receivingVisit);
    const worst = Math.max(...receivingSamples.map((s) => distanceToWheel(s.x, s.z)));
    expect(worst).toBeLessThan(0.35);
    expect(receiving.stains).toHaveLength(shipping.stains.length);
  });

  it('matches the pose the controller reports for a docked receiving truck', () => {
    const docked = getTruckControllerPose(createTruckController('receiving', true, 'docked'));
    const engine = TRUCK_OIL_DRIP_POINTS[0];
    const engineX =
      docked.x + engine.x * Math.cos(docked.rotation) + engine.z * Math.sin(docked.rotation);
    const engineZ =
      docked.z - engine.x * Math.sin(docked.rotation) + engine.z * Math.cos(docked.rotation);
    expect(
      receiving.stains.some((stain) => Math.hypot(stain.x - engineX, stain.z - engineZ) < 0.3)
    ).toBe(true);
  });
});
