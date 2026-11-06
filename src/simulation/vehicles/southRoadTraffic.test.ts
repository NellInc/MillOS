import { describe, expect, it } from 'vitest';
import {
  createTruckController,
  stepTruckController,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import { COMMUNITY_BUS_LAYOUT } from '../../components/scenery/CommunityTransit';
import {
  advanceCommunityBusClock,
  sampleCommunityBus,
  STANDARD_HOURS_PER_REAL_SECOND,
} from '../communityLife';
import {
  busHoldsTruckArrival,
  busHoldsTruckDeparture,
  truckHoldsBusApproach,
  truckHoldsBusDeparture,
  type BusRoadUse,
} from './southRoadTraffic';

interface Box {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly halfWidth: number;
  readonly halfLength: number;
}

/** Separating-axis test between two yawed plan boxes, each grown by `margin`. */
const boxesMeet = (a: Box, b: Box, margin: number): boolean => {
  const axes = (box: Box) => [
    [Math.sin(box.yaw), Math.cos(box.yaw)],
    [Math.cos(box.yaw), -Math.sin(box.yaw)],
  ];
  const radius = (box: Box, [ax, az]: number[]) =>
    (box.halfLength + margin) * Math.abs(Math.sin(box.yaw) * ax + Math.cos(box.yaw) * az) +
    (box.halfWidth + margin) * Math.abs(Math.cos(box.yaw) * ax - Math.sin(box.yaw) * az);
  return [...axes(a), ...axes(b)].every(
    (axis) =>
      Math.abs((b.x - a.x) * axis[0] + (b.z - a.z) * axis[1]) < radius(a, axis) + radius(b, axis)
  );
};

/** The tractor and trailer boxes of truckController.test.ts, in the world. */
const truckBoxes = (state: TruckControllerState): Box[] => {
  const tractor = state.tractorYaw;
  const trailer = state.trailerYaw;
  return [
    {
      x: state.x + Math.sin(tractor) * 2,
      z: state.z + Math.cos(tractor) * 2,
      yaw: tractor,
      halfWidth: 1.35,
      halfLength: 3,
    },
    {
      x: state.x - Math.sin(trailer) * 5.98,
      z: state.z - Math.cos(trailer) * 5.98,
      yaw: trailer,
      halfWidth: 1.3,
      halfLength: 5.78,
    },
  ];
};

/**
 * A service day on the south road, 06:00 to 22:00 at standard pace and 60 Hz,
 * with a shipping truck that comes again the moment the last one has gone:
 * busier than any schedule. Each frame does what TruckBay and CommunityLife
 * do, in either order, with the same rules; `giveWay` false drops them.
 */
function serviceDay(giveWay: boolean, truckFirst: boolean) {
  const dt = 1 / 60;
  let truck = createTruckController('shipping', false);
  let hour = 6;
  let bus = sampleCommunityBus(hour);
  let busUse: BusRoadUse = 'none';
  let meetings = 0;
  let truckVisits = 0;
  let busStops = 0;
  let wasAtStop = false;

  const moveTruck = () => {
    const holdForBus =
      giveWay &&
      truck.active &&
      truck.phase === 'preparing_to_leave' &&
      busHoldsTruckDeparture(busUse);
    const result = stepTruckController(truck, {
      deltaSeconds: dt,
      arrivalReady: !giveWay || !busHoldsTruckArrival(busUse),
      safetyHold: holdForBus,
      serviceComplete: true,
      speedMultiplier: 1,
    });
    truck = result.state;
    if (result.dockedThisStep) truckVisits += 1;
  };
  const moveBus = () => {
    const phase = truck.active ? truck.phase : undefined;
    hour = advanceCommunityBusClock(
      hour,
      dt * STANDARD_HOURS_PER_REAL_SECOND,
      giveWay && truckHoldsBusDeparture(phase),
      giveWay && truckHoldsBusApproach(phase)
    );
    bus = sampleCommunityBus(hour);
    busUse = bus.road;
    if (bus.doorsOpen && !wasAtStop) busStops += 1;
    wasAtStop = bus.doorsOpen;
  };

  const frames = (16 / STANDARD_HOURS_PER_REAL_SECOND) * 60;
  for (let frame = 0; frame < frames; frame += 1) {
    if (truckFirst) {
      moveTruck();
      moveBus();
    } else {
      moveBus();
      moveTruck();
    }
    if (!truck.active || !bus.visible) continue;
    const body: Box = {
      x: bus.x,
      z: bus.z,
      yaw: bus.rotation,
      halfWidth: COMMUNITY_BUS_LAYOUT.width / 2,
      halfLength: COMMUNITY_BUS_LAYOUT.length / 2,
    };
    if (truckBoxes(truck).some((box) => boxesMeet(body, box, 0.25))) meetings += 1;
  }
  return { meetings, truckVisits, busStops };
}

describe('the shared south road', () => {
  const free = serviceDay(false, true);

  it('meets the bus when the truck and bus do not give way, so the check sees it', () => {
    // Measured: 239 frames of the day, in the lanes and on the U-turn.
    expect(free.meetings).toBeGreaterThan(0);
  });

  it.each([true, false])(
    'never lets the truck and the bus come within 0.25 m (truck moves first: %s)',
    (truckFirst) => {
      const day = serviceDay(true, truckFirst);
      expect(day.meetings).toBe(0);
      // Giving way delays each a little and stops neither: the bus still calls
      // four times, and the dock sees as many trucks as with no bus at all
      // (15 a day, back to back).
      expect(day.busStops).toBe(4);
      expect(day.truckVisits).toBeGreaterThanOrEqual(free.truckVisits - 1);
    }
  );

  it('holds each vehicle only for the lane the other is using', () => {
    expect(busHoldsTruckArrival('southbound')).toBe(true);
    expect(busHoldsTruckArrival('turning')).toBe(true);
    // At the kerb the bus is out of the lane; going back out it is in the other one.
    expect(busHoldsTruckArrival('kerb')).toBe(false);
    expect(busHoldsTruckArrival('northbound')).toBe(false);
    expect(busHoldsTruckDeparture('turning')).toBe(true);
    expect(busHoldsTruckDeparture('northbound')).toBe(true);
    expect(busHoldsTruckDeparture('southbound')).toBe(false);
    expect(busHoldsTruckDeparture('kerb')).toBe(false);
    expect(truckHoldsBusApproach('entering')).toBe(true);
    expect(truckHoldsBusApproach('slowing')).toBe(false);
    expect(truckHoldsBusDeparture('docked')).toBe(false);
    expect(truckHoldsBusDeparture('backing')).toBe(false);
    expect(truckHoldsBusDeparture('preparing_to_leave')).toBe(true);
    expect(truckHoldsBusDeparture(undefined)).toBe(false);
  });
});
