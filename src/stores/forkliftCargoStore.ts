/**
 * The live cargo stations (forkliftCargoStations.ts), one per forklift action,
 * and where each one's load stands. Plain mutable records like the crew store:
 * the forklift steps and reads them every frame, and ForkliftCargoLoads draws
 * them, with no render. Module state, so a forklift that remounts finds its
 * stations as it left them.
 */
import {
  createCargoStation,
  FORKLIFT_LOAD_KIND,
  FORKLIFT_STATION_KIND,
  type CargoStation,
} from '../simulation/forkliftCargoStations';

export type ForkliftCargoAction = 'pickup' | 'dropoff';

export interface CargoStationPose {
  /** The load's centre at the forks' engagement point. */
  x: number;
  z: number;
  /** The pallet origin height: 0.06 on the floor, plus the dock deck height there. */
  y: number;
  /** The forks' line: the forklift's heading as it works the station. */
  heading: number;
}

export interface CargoStationLive {
  readonly key: string;
  readonly forkliftId: string;
  readonly action: ForkliftCargoAction;
  readonly station: CargoStation;
  /** Written by the forklift from its route; null until it has one. */
  pose: CargoStationPose | null;
}

const live = new Map<string, CargoStationLive>();

export function forkliftCargoStation(
  forkliftId: string,
  action: ForkliftCargoAction
): CargoStationLive | null {
  const key = `${forkliftId}:${action}`;
  let entry = live.get(key);
  if (!entry) {
    const kind = FORKLIFT_STATION_KIND[forkliftId]?.[action];
    const load = FORKLIFT_LOAD_KIND[forkliftId];
    if (!kind || !load) return null;
    entry = { key, forkliftId, action, station: createCargoStation(kind, load), pose: null };
    live.set(key, entry);
  }
  return entry;
}

/** Every station any forklift has, for drawing and replay. */
export function forkliftCargoStations(): IterableIterator<CargoStationLive> {
  return live.values();
}

/** Back to an empty plant (tests, a fresh session). */
export function resetForkliftCargoStations(): void {
  live.clear();
}
