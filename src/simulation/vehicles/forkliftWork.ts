/**
 * How a crewed forklift works a pick or a drop, and who it gives way to.
 * Pure: no React, no stores.
 *
 * A pick or a drop used to happen with the vehicle standing still on the
 * marker: the pallet faded in or out on the forks, and the forklift then
 * pivoted on the spot with the forks still under the load. Now it reads as a
 * driver works one:
 *
 *   approach      slows, forks to the working height, stops FORKLIFT_INSERT_METRES short
 *   insert        creeps the last metre in, the tines entering the pallet's pockets
 *   lift / place  forks up with the load, or down to set it on the floor or deck
 *   reverse out   backs FORKLIFT_REVERSE_METRES straight out along the line it came in on
 *   turn          only then turns standing onto its way out, forks low
 *
 * The body moves along the line of the forks (the arrival heading) by
 * `forkliftWorkAlong`, metres relative to the marker: negative is short of it.
 * Working if `forkliftWork.test.ts` finds the tines never sweep through a set
 * load and the vehicle never jumps at either end of a pick or a drop.
 */
import type { ForkliftRoutePlan } from './forkliftController';
import { sampleArcLengthPath, shortestVehicleAngle } from './vehicleKinematics';

/** The last metres before a pick or a drop, crept with the forks set. */
export const FORKLIFT_INSERT_METRES = 1;
/** How far it backs straight out after a pick or a drop before turning. */
export const FORKLIFT_REVERSE_METRES = 1.6;
/**
 * How far short of a floor station it waits for the load to be ready: its
 * tines clear of a pallet being built there (tines reach 1.26 m ahead of the
 * origin, a pallet's near edge stands 0.74 m ahead of the marker).
 */
export const FORKLIFT_STATION_WAIT_METRES = 3.5;
/** Creep speed for the insert and reverse, and the approach cap near a station. */
export const FORKLIFT_WORK_SPEED = 0.8;
export const FORKLIFT_APPROACH_SPEED = 1.5;
/** Metres before a station's work point within which the approach cap applies. */
export const FORKLIFT_APPROACH_METRES = 5;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Fractions of the insert and of the reverse done at `progress` (0..1) through
 * a pick or a drop, on the load pose's own phases (sampleForkliftLoadPose):
 * pickup  aligning lowering inserting | engaging lifting tilting | retracting carrying
 * dropoff aligning levelling | placing disengaging | withdrawing resetting
 */
export function forkliftWorkOffset(
  action: 'pickup' | 'dropoff',
  progress: number,
  out: { insert: number; reverse: number } = { insert: 0, reverse: 0 }
): { insert: number; reverse: number } {
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  if (action === 'pickup') {
    out.insert = smoothstep(0, 3 / 8, t);
    out.reverse = smoothstep(6 / 8, 1, t);
  } else {
    out.insert = smoothstep(0, 2 / 6, t);
    out.reverse = smoothstep(4 / 6, 1, t);
  }
  return out;
}

/** The body's place along the forks' line, metres from the marker (negative: short of it). */
export const forkliftWorkAlong = (offset: { insert: number; reverse: number }): number =>
  -FORKLIFT_INSERT_METRES * (1 - offset.insert) - FORKLIFT_REVERSE_METRES * offset.reverse;

/** The heading a forklift arrives at a marker with: along the leg that ends there. */
export function markerArrivalHeading(plan: ForkliftRoutePlan, markerDistance: number): number {
  const total = plan.path.totalLength;
  const back = (((markerDistance - 0.5) % total) + total) % total;
  const a = sampleArcLengthPath(plan.path, back);
  const b = sampleArcLengthPath(plan.path, markerDistance);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Whether the route leaves a marker back along the line it arrived on (a dock
 * door, the collection point): then the point `reverse` metres along the
 * route past the marker is exactly where backing out leaves the body, and the
 * forklift carries on from there without any blend.
 */
export function isSpurMarker(
  plan: ForkliftRoutePlan,
  markerDistance: number,
  reverse = FORKLIFT_REVERSE_METRES
): boolean {
  const heading = markerArrivalHeading(plan, markerDistance);
  const marker = sampleArcLengthPath(plan.path, markerDistance);
  const after = sampleArcLengthPath(plan.path, (markerDistance + reverse) % plan.path.totalLength);
  const backX = marker.x - Math.sin(heading) * reverse;
  const backZ = marker.z - Math.cos(heading) * reverse;
  const ahead = sampleArcLengthPath(
    plan.path,
    (markerDistance + reverse + 0.5) % plan.path.totalLength
  );
  const leaving = Math.atan2(ahead.x - after.x, ahead.z - after.z);
  return (
    Math.hypot(after.x - backX, after.z - backZ) <= 0.15 &&
    Math.abs(shortestVehicleAngle(leaving, heading)) > Math.PI - 0.1
  );
}

export interface PedestrianPoint {
  x: number;
  z: number;
  /**
   * Extra metres of clearance this person gets: someone using a wheelchair or
   * a long cane (agreedAdjustments.ts) is wider, or less able to step aside.
   */
  extra?: number;
}

/** Extra clearance for anyone using a mobility aid (a wheelchair, a long cane). */
export const FORKLIFT_MOBILITY_EXTRA_CLEARANCE = 0.4;

/**
 * Who a forklift gives way to, from a person's published state (CommunityLife
 * root userData): -1 for nobody (seated on a seat, or hidden), otherwise the
 * extra clearance they get. Anyone using a mobility aid (`mobility`, set for a
 * wheelchair or a long cane) always counts, with more room, whatever their seat
 * flag says: a wheelchair user is seated while moving through the plant.
 */
export function forkliftGiveWayExtra(person: {
  readonly visible: boolean;
  readonly userData: { readonly seated?: unknown; readonly mobility?: unknown };
}): number {
  if (!person.visible) return -1;
  const aided = typeof person.userData.mobility === 'string' && person.userData.mobility !== '';
  if (aided) return FORKLIFT_MOBILITY_EXTRA_CLEARANCE;
  return person.userData.seated === true ? -1 : 0;
}

/** Half the corridor a forklift sweeps, plus a person and a margin, in metres. */
export const FORKLIFT_PEDESTRIAN_CORRIDOR = 1.1;
/** How far ahead along its route a forklift looks for people. */
export const FORKLIFT_PEDESTRIAN_LOOKAHEAD = 6;
/** Within this much route distance it stops for them; beyond it, it slows. */
export const FORKLIFT_PEDESTRIAN_STOP = 3.5;
export const FORKLIFT_PEDESTRIAN_SLOW_SPEED = 1;

/**
 * Route distance ahead to the nearest person in the forklift's corridor, or
 * Infinity. `ahead(d)` samples the route d metres on. Allocates nothing.
 */
export function nearestPedestrianAhead(
  ahead: (distance: number) => { readonly x: number; readonly z: number },
  people: readonly PedestrianPoint[],
  count: number,
  lookAhead = FORKLIFT_PEDESTRIAN_LOOKAHEAD,
  corridor = FORKLIFT_PEDESTRIAN_CORRIDOR
): number {
  if (count <= 0) return Infinity;
  for (let distance = 0.5; distance <= lookAhead + 1e-9; distance += 0.5) {
    const point = ahead(distance);
    for (let index = 0; index < count; index += 1) {
      const person = people[index];
      const dx = person.x - point.x;
      const dz = person.z - point.z;
      const reach = corridor + (person.extra ?? 0);
      if (dx * dx + dz * dz <= reach * reach) return distance;
    }
  }
  return Infinity;
}

/**
 * A driver lined up for a pick or a drop (D-060, mechanics 6.2): within this of
 * where the insert begins (a metre short of the marker, on the forks' line)
 * and this far off the line's heading. Close enough that the pick or drop the
 * autopilot runs from that pose eases the difference out over the creep in.
 */
export const MANUAL_WORK_REACH_METRES = 0.4;
export const MANUAL_WORK_HEADING_RADIANS = 0.2;
/**
 * How far the forks may stand from the work surface's height (the floor, or
 * the dock deck) and still go in. The driver's lever stops at the floor and at
 * the deck height, so either is a stop the driver holds the lever to.
 */
export const MANUAL_WORK_FORK_TOLERANCE = 0.06;

/** Whether a driven forklift at (x, z, heading) is lined up at a work start. */
export function manualWorkLinedUp(
  x: number,
  z: number,
  heading: number,
  start: { readonly x: number; readonly z: number; readonly heading: number }
): boolean {
  return (
    Math.hypot(x - start.x, z - start.z) <= MANUAL_WORK_REACH_METRES &&
    Math.abs(shortestVehicleAngle(heading, start.heading)) <= MANUAL_WORK_HEADING_RADIANS
  );
}

export type ManualWorkRefusal = 'forksRaised' | 'forksLow' | 'tooFast';

/**
 * Why a driver's pick or drop cannot start, or null. Moving faster than the
 * creep, the forks cannot go in safely, whoever is about. For a pick the tines
 * must be at the load's height: raised, they pass over it; at the deck, below
 * it, they meet its edge. For a drop the load must clear the surface it goes on.
 */
export function manualWorkRefusal(
  action: 'pickup' | 'dropoff',
  forkHeight: number,
  surface: number,
  speed: number
): ManualWorkRefusal | null {
  if (Math.abs(speed) > FORKLIFT_WORK_SPEED) return 'tooFast';
  if (action === 'pickup' && forkHeight > surface + MANUAL_WORK_FORK_TOLERANCE)
    return 'forksRaised';
  if (forkHeight < surface - MANUAL_WORK_FORK_TOLERANCE) return 'forksLow';
  return null;
}
