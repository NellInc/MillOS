/**
 * STEP-FREE EGRESS (D-058): every service egress zone has a step-free route
 * from the hall floor to its exit and a refuge point beside the exit, and the
 * egress verification drill verifies a zone only once that route is clear.
 *
 * The hall floor is level and every route here stays on it, so what can block
 * a route is a stopped vehicle: the drill halts every forklift where it is
 * (egressDrillSequencer.ts). Every exit on record is level: the west and east
 * service doors, and since 2026-11-07 the front and back zones' personnel
 * doors beside the docks (PERSONNEL_DOORS), whose decks stand a metre up. A
 * zone whose own route has a forklift standing on it is verified on its agreed
 * alternative; with the alternative blocked as well, it stays unverified and
 * says why. Personnel hold their safe positions throughout: the zone results
 * certify egress verification, not an evacuation.
 *
 * Pure apart from `readStoppedVehicles`, which reads the forklifts' last
 * published positions (forkliftCrewStore). Allocates nothing per call beyond
 * the result object.
 */
import { FORKLIFT_CREW_SITES } from '../constants/forkliftCrewLayout';
import { forkliftCrewLive } from '../stores/forkliftCrewStore';
import { PERSONNEL_DOORS } from '../constants/accessibilityLayout';

type XZ = readonly [number, number];

export type EgressZoneId = 'front' | 'back' | 'west' | 'east';

export interface StepFreeEgress {
  readonly zoneId: EgressZoneId;
  /** Hall floor, through the exit, to the zone's marker outside it, all level. */
  readonly route: readonly XZ[];
  /** Where someone waits for help, out of the vehicle path. */
  readonly refuge: XZ;
  /** The level exit whose step-free route is this zone's agreed alternative. */
  readonly alternative: EgressZoneId;
}

const door = (id: 'front' | 'back') => PERSONNEL_DOORS.find((d) => d.id === id)!;
/**
 * From the dock end of the hall along the open floor north of the forklift
 * lane, then down the east walkway to the personnel door and out to the
 * zone's marker.
 */
const personnelDoorEgress = (
  zoneId: 'front' | 'back',
  alternative: EgressZoneId
): StepFreeEgress => {
  const { x, outward, marker, refuge } = door(zoneId);
  return {
    zoneId,
    route: [[20, 42 * outward], [x, 42 * outward], marker],
    refuge,
    alternative,
  };
};

/**
 * The routes keep to open floor (accessibleEgress.test.ts holds them clear of
 * machines, belts, dock platforms and hall dressing). The service doors'
 * routes run straight out through the side walls (SITE_LAYOUT.portals); the
 * front and back routes through the personnel doors beside the docks.
 */
export const STEP_FREE_EGRESS: readonly StepFreeEgress[] = Object.freeze([
  personnelDoorEgress('front', 'west'),
  personnelDoorEgress('back', 'east'),
  {
    zoneId: 'west',
    route: [
      [-24, -20],
      [-40, -20],
      [-42, -20],
    ],
    refuge: [-42, -16.5],
    alternative: 'east',
  },
  {
    zoneId: 'east',
    route: [
      [24, -20],
      [40, -20],
      [42, -20],
    ],
    refuge: [42, -16.5],
    alternative: 'west',
  },
]);

/** A stopped forklift's plan footprint, as a circle (centre and radius). */
export interface VehicleFootprint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** The fleet tag painted on it (FLT01), for the drill's record. */
  readonly id?: string;
}

/** Half a wheelchair's width plus a margin: how close a vehicle may stand to a route. */
export const STEP_FREE_CLEARANCE = 0.55;
/** A forklift with its forks, as a circle round its centre. */
export const FORKLIFT_FOOTPRINT_RADIUS = 1.6;

function distanceToSegment(x: number, z: number, a: XZ, b: XZ): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length)) : 0;
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** The first vehicle standing on a zone's route or its refuge, or null. */
export function blockingVehicle(
  egress: StepFreeEgress,
  vehicles: readonly VehicleFootprint[]
): VehicleFootprint | null {
  for (const vehicle of vehicles) {
    if (!Number.isFinite(vehicle.x) || !Number.isFinite(vehicle.z)) continue;
    const reach = vehicle.radius + STEP_FREE_CLEARANCE;
    if (Math.hypot(vehicle.x - egress.refuge[0], vehicle.z - egress.refuge[1]) < reach)
      return vehicle;
    for (let i = 1; i < egress.route.length; i++)
      if (distanceToSegment(vehicle.x, vehicle.z, egress.route[i - 1], egress.route[i]) < reach)
        return vehicle;
  }
  return null;
}

/** Every vehicle standing on a zone's route or its refuge. */
function vehiclesOn(
  egress: StepFreeEgress,
  vehicles: readonly VehicleFootprint[],
  into: string[]
): void {
  for (const vehicle of vehicles)
    if (vehicle.id && !into.includes(vehicle.id) && blockingVehicle(egress, [vehicle]))
      into.push(vehicle.id);
}

/**
 * The fleet tags of the stopped forklifts behind a result: those on the zone's
 * own route, and for a blocked zone those on its alternative's as well. Empty
 * for a clear zone. For the drill's record, once per check; not per frame.
 */
export function egressBlockers(
  result: StepFreeEgressResult,
  vehicles: readonly VehicleFootprint[]
): string[] {
  const tags: string[] = [];
  if (result.status === 'clear') return tags;
  const egress = stepFreeEgressFor(result.zoneId);
  if (!egress) return tags;
  vehiclesOn(egress, vehicles, tags);
  const alternative = stepFreeEgressFor(egress.alternative);
  if (result.status === 'blocked' && alternative) vehiclesOn(alternative, vehicles, tags);
  return tags;
}

export type StepFreeEgressResult =
  | { readonly status: 'clear'; readonly zoneId: EgressZoneId }
  | {
      readonly status: 'alternative';
      readonly zoneId: EgressZoneId;
      /** The level exit whose clear route verified the zone: its own had a stopped vehicle on it. */
      readonly alternative: EgressZoneId;
    }
  | { readonly status: 'blocked'; readonly zoneId: EgressZoneId };

export function stepFreeEgressFor(zoneId: string): StepFreeEgress | undefined {
  return STEP_FREE_EGRESS.find((egress) => egress.zoneId === zoneId);
}

/**
 * Whether a zone has a clear step-free way out. A zone with no step-free
 * route on record is not verifiable, the same as a blocked one.
 */
export function checkStepFreeEgress(
  zoneId: string,
  vehicles: readonly VehicleFootprint[]
): StepFreeEgressResult {
  const egress = stepFreeEgressFor(zoneId);
  if (!egress) return { status: 'blocked', zoneId: zoneId as EgressZoneId };
  if (!blockingVehicle(egress, vehicles)) return { status: 'clear', zoneId: egress.zoneId };
  const alternative = stepFreeEgressFor(egress.alternative);
  if (alternative && !blockingVehicle(alternative, vehicles))
    return { status: 'alternative', zoneId: egress.zoneId, alternative: alternative.zoneId };
  return { status: 'blocked', zoneId: egress.zoneId };
}

const vehicleScratch: VehicleFootprint[] = [];
/** Every forklift's last published position (null until its system has run). */
export function readStoppedVehicles(): readonly VehicleFootprint[] {
  vehicleScratch.length = 0;
  for (const site of FORKLIFT_CREW_SITES) {
    const vehicle = forkliftCrewLive(site.forkliftId).vehicle;
    if (vehicle)
      vehicleScratch.push({
        x: vehicle.x,
        z: vehicle.z,
        radius: FORKLIFT_FOOTPRINT_RADIUS,
        id: site.tag,
      });
  }
  return vehicleScratch;
}
