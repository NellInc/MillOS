import { describe, expect, it } from 'vitest';
import {
  CARGO_BUILD_SECONDS,
  CARGO_DECK_DWELL_SECONDS,
  CARGO_STORE_EMPTY_STACK,
  CARGO_STORE_SECONDS,
  CARGO_TRAILER_SLIDE_SECONDS,
  cargoStationTakesBack,
  CARGO_PALLET_BAGS,
  cargoBagsShown,
  cargoReadyForPickup,
  cargoRoomForDropoff,
  cargoStationAllows,
  cargoStationWorkable,
  cargoStationTravel,
  createCargoStation,
  FORKLIFT_LOAD_KIND,
  FORKLIFT_STATION_KIND,
  placeCargo,
  stepCargoStation,
  takeCargo,
  type CargoStation,
  type CargoStationInputs,
} from '../forkliftCargoStations';
import { canPerformForkliftLogisticsAction } from '../forkliftRoute';
import { FORKLIFT_MAXIMUM_YAW_RATE } from '../vehicles/forkliftController';

const run = (station: CargoStation, inputs: CargoStationInputs, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) stepCargoStation(station, inputs, dt);
  return station;
};
const idle: CargoStationInputs = { stockToShip: false, transferReady: false };

describe('forklift cargo stations', () => {
  it('gives each forklift a source and a destination, and a load that suits them', () => {
    expect(FORKLIFT_STATION_KIND['forklift-1']).toEqual({ pickup: 'build', dropoff: 'trailer-in' });
    expect(FORKLIFT_STATION_KIND['forklift-2']).toEqual({
      pickup: 'trailer-out',
      dropoff: 'store',
    });
    // Grain arrives in bulk: the receiving forklift never carries flour inward.
    expect(FORKLIFT_LOAD_KIND['forklift-1']).toBe('flour');
    expect(FORKLIFT_LOAD_KIND['forklift-2']).toBe('supplies');
  });

  it('builds a pallet at the collection point only from released stock to ship', () => {
    const station = createCargoStation('build', 'flour');
    run(station, idle, 60);
    expect(station.present).toBe(false);
    expect(cargoReadyForPickup(station)).toBe(false);
    run(station, { stockToShip: true, transferReady: false }, CARGO_BUILD_SECONDS / 2);
    expect(cargoBagsShown(station)).toBeGreaterThan(0);
    expect(cargoBagsShown(station)).toBeLessThan(CARGO_PALLET_BAGS);
    expect(cargoReadyForPickup(station)).toBe(false);
    // Stock runs out half-way: the bags already built stay, and nothing more comes.
    const bags = cargoBagsShown(station);
    run(station, idle, 30);
    expect(cargoBagsShown(station)).toBe(bags);
    run(station, { stockToShip: true, transferReady: false }, CARGO_BUILD_SECONDS);
    expect(cargoBagsShown(station)).toBe(CARGO_PALLET_BAGS);
    expect(cargoReadyForPickup(station)).toBe(true);
    takeCargo(station);
    expect(station.present).toBe(false);
    expect(cargoReadyForPickup(station)).toBe(false);
  });

  it('puts one pallet out of each docked receiving trailer, and only while it is docked', () => {
    const station = createCargoStation('trailer-out', 'supplies');
    run(station, idle, 30);
    expect(station.present).toBe(false);
    const docked = { stockToShip: false, transferReady: true };
    stepCargoStation(station, docked, 0.1);
    // The forklift may set off as soon as it is being put out.
    expect(cargoStationAllows('pickup', station)).toBe(true);
    expect(cargoStationWorkable('pickup', station)).toBe(false);
    // It comes out of the trailer first: not yet where the forks reach.
    expect(station.present).toBe(true);
    expect(cargoStationTravel(station)).toBeGreaterThan(3);
    expect(cargoReadyForPickup(station)).toBe(false);
    run(station, docked, 4);
    expect(cargoStationTravel(station)).toBe(0);
    expect(cargoReadyForPickup(station)).toBe(true);
    takeCargo(station);
    run(station, docked, 30);
    expect(station.present).toBe(false);
    // The truck leaves; the next one brings the next pallet.
    run(station, idle, 1);
    run(station, docked, 4);
    expect(cargoReadyForPickup(station)).toBe(true);
    // A pallet nobody took leaves with its truck rather than stand at a shut door.
    run(station, idle, 0.1);
    expect(station.present).toBe(false);
  });

  it('takes a placed pallet into the shipping trailer, and makes room for the next', () => {
    const station = createCargoStation('trailer-in', 'flour');
    const docked = { stockToShip: true, transferReady: true };
    expect(cargoRoomForDropoff(station)).toBe(true);
    placeCargo(station);
    expect(cargoStationTravel(station)).toBe(0);
    expect(cargoRoomForDropoff(station)).toBe(false);
    run(station, docked, 0.3);
    expect(cargoStationTravel(station)).toBe(0);
    run(station, docked, 1.5);
    expect(cargoStationTravel(station)).toBeGreaterThan(0);
    expect(cargoRoomForDropoff(station)).toBe(true);
    run(station, docked, 1.5);
    expect(station.present).toBe(false);
  });

  /**
   * The placed pallet is inside the trailer before its forklift can leave the
   * dock lane: backing out 1.6 m and the standing half turn alone take longer
   * (the truck keeps its doors open while the forklift is in the lane).
   */
  it('has the pallet inside before the forklift can leave the lane and the doors close', () => {
    const halfTurnSeconds = Math.PI / FORKLIFT_MAXIMUM_YAW_RATE;
    expect(CARGO_DECK_DWELL_SECONDS + CARGO_TRAILER_SLIDE_SECONDS).toBeLessThan(
      halfTurnSeconds + 1
    );
  });

  it('keeps delivered supplies at the store for the packing line to draw', () => {
    const station = createCargoStation('store', 'supplies');
    placeCargo(station);
    run(station, idle, 30);
    expect(station.present).toBe(true);
    // A third drawn down: the wrapped sacks shrink from the top, visibly.
    expect(station.progress).toBeGreaterThan(0.3);
    expect(station.progress).toBeLessThan(0.4);
    expect(cargoRoomForDropoff(station)).toBe(true);
    run(station, idle, 70);
    // The bare pallet has gone onto the stack beside the store.
    expect(station.present).toBe(false);
    expect(station.empties).toBe(1);
    for (let trip = 0; trip < 10; trip += 1) {
      placeCargo(station);
      run(station, idle, CARGO_STORE_SECONDS + 1);
    }
    expect(station.empties).toBe(CARGO_STORE_EMPTY_STACK);
  });

  it('takes a pallet put back by an operator only onto an empty collection point', () => {
    const station = createCargoStation('build', 'flour');
    expect(cargoStationTakesBack(station)).toBe(true);
    placeCargo(station);
    // Put back whole: it stands ready to be picked again.
    expect(cargoReadyForPickup(station)).toBe(true);
    expect(cargoStationTakesBack(station)).toBe(false);
  });

  /**
   * Every trip has a purpose: over a long run of plant states, a pick is only
   * ever permitted with the plant wanting it AND its load standing at the
   * source, and a drop only with room at the destination. Each trip is
   * walked through as the forklift does it: wait for permission, pick, wait,
   * drop.
   */
  it('never lets a forklift pick or drop without a load at its source and room at its destination', () => {
    for (const forkliftId of ['forklift-1', 'forklift-2'] as const) {
      const kinds = FORKLIFT_STATION_KIND[forkliftId];
      const source = createCargoStation(kinds.pickup, FORKLIFT_LOAD_KIND[forkliftId]);
      const destination = createCargoStation(kinds.dropoff, FORKLIFT_LOAD_KIND[forkliftId]);
      let loaded = false;
      let trips = 0;
      let seed = forkliftId === 'forklift-1' ? 7 : 11;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      let docked = false;
      let released = 0;
      let status: 'away' | 'loading' | 'ready' = 'away';
      for (let step = 0; step < 40000; step += 1) {
        if (step % 300 === 0) {
          docked = random() > 0.5;
          released = random() > 0.3 ? 2000 : 0;
          status = docked ? (random() > 0.2 ? 'loading' : 'ready') : 'away';
        }
        const inputs = {
          stockToShip: released > 0 && status !== 'ready',
          transferReady: docked,
        };
        stepCargoStation(source, inputs, 0.1);
        stepCargoStation(destination, inputs, 0.1);
        const action = loaded ? 'dropoff' : 'pickup';
        const station = loaded ? destination : source;
        const plantWants = canPerformForkliftLogisticsAction({
          forkliftId,
          action,
          shippingDocked: docked,
          receivingDocked: docked,
          releasedFinishedKg: released,
          dispatchLoadStatus: status,
        });
        if (!plantWants || !cargoStationAllows(action, station)) continue;
        // Set off for it; the forks go in only once the load is in reach.
        if (!cargoStationWorkable(action, station)) continue;
        if (action === 'pickup') {
          expect(cargoReadyForPickup(source)).toBe(true);
          if (forkliftId === 'forklift-1') expect(released).toBeGreaterThan(0);
          else expect(docked).toBe(true);
          takeCargo(source);
          loaded = true;
        } else {
          expect(cargoRoomForDropoff(destination)).toBe(true);
          if (forkliftId === 'forklift-1') {
            expect(docked).toBe(true);
            expect(status).toBe('loading');
          }
          placeCargo(destination);
          loaded = false;
          trips += 1;
        }
      }
      expect(trips).toBeGreaterThan(5);
    }
  });
});
