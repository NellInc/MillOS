/**
 * The places a forklift picks up and sets down, and the load standing at
 * each. Before this, a forklift's pallet faded in on its forks at a pickup
 * and faded out after a dropoff: nothing stood at the collection point, the
 * dock deck or the store, so a pick or a drop was a load appearing and
 * vanishing on a stationary vehicle. Now every load is a thing in one place
 * at a time: on the floor or the deck, then on the forks, then set down.
 *
 * Each forklift works two stations on its own lane:
 *
 *   FLT01 (shipping)  collection point at the end of the shipping conveyor,
 *                     where bags from the packing line are built onto a
 *                     pallet; then the shipping dock deck, from which the
 *                     placed pallet goes into the docked trailer.
 *   FLT02 (receiving) the receiving dock deck, where the docked trailer's
 *                     pallet of packaging supplies is put out; then the
 *                     packing-line store beside the end-of-line cell.
 *
 * A station only ever holds what the plant has made or delivered: the
 * collection pallet builds only while released finished flour exists and
 * the dispatch is not complete, and the receiving deck only holds a pallet
 * while that dock's trailer is docked with its doors open. Pure: no React,
 * no stores. ForkliftSystem steps it on plant time and draws it.
 * Working if `forkliftCargoStations.test.ts` finds every trip with a load at
 * its source and room at its destination.
 */

export type ForkliftLoadKind = 'flour' | 'supplies';
export type CargoStationKind = 'build' | 'trailer-in' | 'trailer-out' | 'store';

/** What each forklift carries: finished flour out, packaging supplies in. */
export const FORKLIFT_LOAD_KIND: Readonly<Record<string, ForkliftLoadKind>> = {
  'forklift-1': 'flour',
  'forklift-2': 'supplies',
};

/** Station roles by forklift and action. */
export const FORKLIFT_STATION_KIND: Readonly<
  Record<string, { pickup: CargoStationKind; dropoff: CargoStationKind }>
> = {
  'forklift-1': { pickup: 'build', dropoff: 'trailer-in' },
  'forklift-2': { pickup: 'trailer-out', dropoff: 'store' },
};

/** Bags on a finished pallet (PALLET_SACK_LAYOUT: six courses of two). */
export const CARGO_PALLET_BAGS = 12;
/** Plant seconds to build one pallet at the collection point (12 bags off the belt). */
export const CARGO_BUILD_SECONDS = 18;
/**
 * Plant seconds a placed pallet waits on the deck before it is taken into the
 * trailer, and to move it between the deck tail and the trailer's body. Short
 * enough that a placed pallet is inside before its forklift has backed out,
 * turned and left the dock lane (FORKLIFT_LANE_EXIT_SECONDS), and the truck
 * keeps its doors open while the forklift is in the lane (dockForkliftHoldsTruck).
 */
export const CARGO_DECK_DWELL_SECONDS = 0.5;
export const CARGO_TRAILER_SLIDE_SECONDS = 2.5;
/** Metres a pallet travels between the deck tail and inside the trailer. */
export const CARGO_TRAILER_DEPTH_METRES = 3.6;
/**
 * Plant seconds over which the packing line draws a delivered pallet of
 * supplies down to its bare pallet, which then goes onto the empty-pallet
 * stack beside the store (at most CARGO_STORE_EMPTY_STACK high).
 */
export const CARGO_STORE_SECONDS = 90;
export const CARGO_STORE_EMPTY_STACK = 6;

export interface CargoStation {
  readonly kind: CargoStationKind;
  readonly load: ForkliftLoadKind;
  /** A load is standing here (on the floor, the deck, or in transit to or from the trailer). */
  present: boolean;
  /**
   * build: 0..1 of the pallet built (bags = floor(progress * 12)).
   * trailer-in: 0 at the deck tail, 1 inside the trailer.
   * trailer-out: 1 inside the trailer, 0 put out at the deck tail.
   * store: 0..1 of the supplies the packing line has drawn from the pallet.
   */
  progress: number;
  /** Plant seconds since the load arrived here (deck dwell, store time). */
  dwell: number;
  /** trailer-out: this truck visit's pallet has been taken. */
  served: boolean;
  /** store: bare pallets on the stack beside it. */
  empties: number;
}

export interface CargoStationInputs {
  /** Released finished flour exists, and the current dispatch still wants more. */
  readonly stockToShip: boolean;
  /** This dock's trailer is docked with its doors open and its leveler down. */
  readonly transferReady: boolean;
}

export const createCargoStation = (
  kind: CargoStationKind,
  load: ForkliftLoadKind
): CargoStation => ({
  kind,
  load,
  present: false,
  progress: 0,
  dwell: 0,
  served: false,
  empties: 0,
});

const clamp01 = (value: number): number => (value <= 0 ? 0 : value >= 1 ? 1 : value);

/** One plant-time step of a station. `dt` is plant seconds; mutates and returns it. */
export function stepCargoStation(
  station: CargoStation,
  inputs: CargoStationInputs,
  dt: number
): CargoStation {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  switch (station.kind) {
    case 'build':
      // Bags arrive only while there is released stock to ship. A complete
      // pallet waits for the forklift; a part-built one keeps its bags.
      if (inputs.stockToShip && station.progress < 1)
        station.progress = clamp01(station.progress + step / CARGO_BUILD_SECONDS);
      station.present = station.progress > 0;
      break;
    case 'trailer-in':
      if (!station.present) break;
      // With no trailer at the dock the load is already aboard and gone.
      if (!inputs.transferReady) {
        station.present = false;
        station.progress = 0;
        station.dwell = 0;
        break;
      }
      station.dwell += step;
      if (station.dwell >= CARGO_DECK_DWELL_SECONDS)
        station.progress = clamp01(station.progress + step / CARGO_TRAILER_SLIDE_SECONDS);
      if (station.progress >= 1) {
        station.present = false;
        station.progress = 0;
        station.dwell = 0;
      }
      break;
    case 'trailer-out':
      if (!inputs.transferReady) {
        // The truck has gone: a pallet never taken left in it, and the next
        // visit brings its own.
        station.present = false;
        station.progress = 1;
        station.served = false;
        break;
      }
      if (!station.served && !station.present) {
        station.present = true;
        station.progress = 1;
      }
      if (station.present)
        station.progress = clamp01(station.progress - step / CARGO_TRAILER_SLIDE_SECONDS);
      break;
    case 'store':
      if (!station.present) break;
      station.dwell += step;
      station.progress = clamp01(station.dwell / CARGO_STORE_SECONDS);
      if (station.progress >= 1) {
        // Drawn down to its bare pallet, which joins the stack beside the store.
        station.present = false;
        station.dwell = 0;
        station.progress = 0;
        station.empties = Math.min(CARGO_STORE_EMPTY_STACK, station.empties + 1);
      }
      break;
  }
  return station;
}

/** Whether a pickup here would find a whole load ready on its forks' line. */
export function cargoReadyForPickup(station: CargoStation): boolean {
  switch (station.kind) {
    case 'build':
      return station.present && station.progress >= 1;
    case 'trailer-out':
      return station.present && station.progress <= 0;
    default:
      return false;
  }
}

/** Whether a dropoff here has room: nothing still standing where the load goes. */
export function cargoRoomForDropoff(station: CargoStation): boolean {
  switch (station.kind) {
    case 'trailer-in':
      // The last pallet has gone past the deck tail into the trailer.
      return !station.present || station.progress >= 0.45;
    case 'store':
      return true;
    case 'build':
      // Only a pallet put back by an operator ending a spell, onto an empty spot.
      return !station.present;
    default:
      return false;
  }
}

/** The forks have engaged the load: it leaves the station. */
export function takeCargo(station: CargoStation): void {
  station.present = false;
  station.dwell = 0;
  if (station.kind === 'build') station.progress = 0;
  if (station.kind === 'trailer-out') {
    station.served = true;
    station.progress = 1;
  }
}

/** The forks have released the load: it stands at the station. */
export function placeCargo(station: CargoStation): void {
  station.present = true;
  station.dwell = 0;
  // A whole pallet put back where it was built (an operator ending a spell
  // with no trailer to load) stands there complete, ready to be picked again.
  station.progress = station.kind === 'build' ? 1 : 0;
}

/** Bags visible on a build station's pallet. */
export const cargoBagsShown = (station: CargoStation): number =>
  station.kind === 'build'
    ? Math.min(CARGO_PALLET_BAGS, Math.floor(clamp01(station.progress) * CARGO_PALLET_BAGS + 1e-9))
    : CARGO_PALLET_BAGS;

/**
 * How far along its fork line (the forklift's arrival heading) a station's
 * load stands from where the forks hold it: into the trailer for the dock
 * stations, 0 elsewhere.
 */
export function cargoStationTravel(station: CargoStation): number {
  if (station.kind === 'trailer-in' || station.kind === 'trailer-out')
    return clamp01(station.progress) * CARGO_TRAILER_DEPTH_METRES;
  return 0;
}

/**
 * Whether a station lets the forklift set off for it: a pick has its load
 * there (at a trailer, already being put out: the forklift drives in while it
 * comes to the tail, and its standing in the dock lane keeps the truck's
 * doors open, which a forklift waiting for the whole slide outside the lane
 * did not, and the receiving truck left), a drop has room. A forklift with no
 * station (none drawn) is not held by one.
 */
export function cargoStationAllows(
  action: 'pickup' | 'dropoff',
  station: CargoStation | null | undefined
): boolean {
  if (!station) return true;
  if (action === 'pickup')
    return station.kind === 'trailer-out' ? station.present : cargoReadyForPickup(station);
  return cargoRoomForDropoff(station);
}

/** Whether the forks may go in now: the whole load is where they reach, or there is room. */
export function cargoStationWorkable(
  action: 'pickup' | 'dropoff',
  station: CargoStation | null | undefined
): boolean {
  if (!station) return true;
  return action === 'pickup' ? cargoReadyForPickup(station) : cargoRoomForDropoff(station);
}

/**
 * Whether a forklift ending its driving spell may put its load back at this
 * pickup station (its trailer gone, no drop to make): only where it was built,
 * and only with nothing standing there.
 */
export function cargoStationTakesBack(station: CargoStation | null | undefined): boolean {
  return !!station && station.kind === 'build' && !station.present;
}
