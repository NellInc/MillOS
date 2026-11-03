/**
 * Crewed forklift shifts: each forklift has an operator who boards at its crew
 * point, drives a spell, asks to get off when the spell ends, and walks to their
 * bench for a break while the forklift waits for them at the crew point.
 *
 * Everyone else in CommunityLife is `position = f(hour)`. An operator cannot
 * be: the forklift is never at the crew point at a fixed clock time. So each
 * operator keeps an ordinary authored routine (communityLife.ts, the driving
 * spell is stops[0]) and their personal hour HOLDS at the two ends of the spell
 * until the forklift is parked at the crew point, the same escape hatch
 * briefings use. Pure: no React, no stores.
 *
 * A player who takes a crewed forklift displaces its operator, who steps off on
 * the driver's side and waits there. When the player steps down the forklift
 * returns to that spot at walking pace, the operator gets back in, and the
 * spell goes on. That self-return, and the walk to the crew point when nobody
 * is aboard, are the only movements an unmanned forklift makes: it never works
 * a pickup or dropoff without its operator.
 */
import {
  COMMUNITY_SEAT_RAMP,
  routineDuration,
  WALK_HOURS_PER_METRE,
  type CommunityPerson,
} from './communityLife';
import type { ForkliftCrewSite } from '../constants/forkliftCrewLayout';
import {
  distanceAheadOnClosedPath,
  forkliftRouteHeading,
  type ForkliftRoutePlan,
} from './vehicles/forkliftController';
import { sampleArcLengthPath, shortestVehicleAngle } from './vehicles/vehicleKinematics';

/**
 * off       on foot, following the routine (walking to or from the bench, or on it)
 * waiting   at the stand when the spell is due, for the forklift to be parked there
 * boarding  climbing in (the forklift stays put)
 * aboard    in the seat; the forklift works its route
 * wants-off the spell has ended; the forklift heads for the crew point
 * alighting climbing out at the crew point (the forklift stays put)
 * displaced a player took the forklift; waiting beside where it was taken
 */
export type ForkliftCrewPhase =
  | 'off'
  | 'waiting'
  | 'boarding'
  | 'aboard'
  | 'wants-off'
  | 'alighting'
  | 'displaced';

/** Where a displaced operator waits, and the route distance the forklift returns to. */
export interface ForkliftCrewHandover {
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly routeDistance: number;
}

export interface ForkliftCrewState {
  readonly phase: ForkliftCrewPhase;
  /** Game hours into a boarding or alighting climb (boarding includes any walk to the cab). */
  readonly timer: number;
  /** Set while displaced, and through the climb back in that follows. */
  readonly handover: ForkliftCrewHandover | null;
  /**
   * Boarding after a handover: the forklift came back and stopped a little way
   * along from where the operator waited, so they walk to its side first.
   */
  readonly walk?: { readonly fromX: number; readonly fromZ: number; readonly hours: number };
}

/** Where the forklift is parked for its operator, if it is. */
export type ForkliftParkedAt = 'crew' | 'handover' | null;

export interface ForkliftCrewInputs {
  readonly parkedAt: ForkliftParkedAt;
  readonly playerDriving: boolean;
  /**
   * Where an operator steps down to, or walks to: beside the cab now, on the
   * driver's side if that is clear. Read on the frame of displacement, and
   * again when the forklift is returned to a displaced operator.
   */
  readonly handover: () => ForkliftCrewHandover | null;
}

export const FORKLIFT_CREW_BOARD_HOURS = COMMUNITY_SEAT_RAMP.down + COMMUNITY_SEAT_RAMP.standing;
export const FORKLIFT_CREW_ALIGHT_HOURS = COMMUNITY_SEAT_RAMP.up + COMMUNITY_SEAT_RAMP.standing;
/** Kept short of a stop boundary so a held hour still samples inside it. */
const BOUNDARY_EPSILON = 1e-6;

/** Game hours into the operator's routine, 0 at the start of the driving spell. */
export function operatorRoutineElapsed(person: CommunityPerson, hour: number): number {
  const period = routineDuration(person);
  const h = Number.isFinite(hour) ? hour : 0;
  return (((h + person.phase) % period) + period) % period;
}

/** The driving spell's length (stops[0]). */
export const operatorSpellHours = (person: CommunityPerson): number => person.stops[0]?.hours ?? 0;

const isOperatorSpell = (person: CommunityPerson, hour: number): boolean =>
  operatorRoutineElapsed(person, hour) < operatorSpellHours(person);

/**
 * Whether the operator's body is in the cab: seated phases, the second half of
 * climbing in and the first half of climbing out. One rule for both owners of
 * the body (CommunityLife places it on foot, the forklift carries it seated).
 */
export function isOperatorInCab(state: ForkliftCrewState): boolean {
  switch (state.phase) {
    case 'aboard':
    case 'wants-off':
      return true;
    case 'boarding':
      return state.timer >= (state.walk?.hours ?? 0) + FORKLIFT_CREW_BOARD_HOURS / 2;
    case 'alighting':
      return state.timer < FORKLIFT_CREW_ALIGHT_HOURS / 2;
    default:
      return false;
  }
}

/**
 * A fresh crew, or one from a save that has none: in the cab if the hour falls
 * in the driving spell, otherwise on foot.
 */
export function initialForkliftCrewState(person: CommunityPerson, hour: number): ForkliftCrewState {
  return { phase: isOperatorSpell(person, hour) ? 'aboard' : 'off', timer: 0, handover: null };
}

/**
 * A player has taken the seat. The operator steps down beside the cab; with no
 * safe spot there (the forklift refuses boarding then, so this is a race) they
 * go to the stand and the forklift comes back to the crew point. Never seated
 * under the player.
 */
const displaced = (inputs: ForkliftCrewInputs): ForkliftCrewState => {
  const handover = inputs.handover();
  return handover
    ? { phase: 'displaced', timer: 0, handover }
    : { phase: 'waiting', timer: 0, handover: null };
};

/**
 * One step of the operator: their new personal hour and crew state. `delta` is
 * the game hours the people clock advanced this frame; `held` (a safety stop,
 * or a hidden tab) freezes both.
 * Working if the hour never passes either end of the spell with the forklift
 * anywhere but parked at its crew point (or the operator's handover spot).
 */
export function advanceForkliftCrew(
  person: CommunityPerson,
  state: ForkliftCrewState,
  hour: number,
  delta: number,
  inputs: ForkliftCrewInputs,
  held: boolean
): { state: ForkliftCrewState; hour: number } {
  const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  if (held || !Number.isFinite(hour)) return { state, hour };
  const period = routineDuration(person);
  const spell = operatorSpellHours(person);
  const elapsed = operatorRoutineElapsed(person, hour);

  switch (state.phase) {
    case 'off': {
      // On foot: the routine runs until it reaches the spell, then the operator
      // waits at the stand. Starting inside the spell (a save, a reframe) waits too.
      if (elapsed < spell) return { state: { phase: 'waiting', timer: 0, handover: null }, hour };
      const toSpell = period - elapsed;
      if (step < toSpell) return { state, hour: hour + step };
      return { state: { phase: 'waiting', timer: 0, handover: null }, hour: hour + toSpell };
    }
    case 'waiting':
      return {
        state:
          inputs.parkedAt === 'crew' && !inputs.playerDriving
            ? { phase: 'boarding', timer: 0, handover: null }
            : state,
        hour,
      };
    case 'boarding': {
      if (inputs.playerDriving)
        return {
          state: state.handover
            ? { phase: 'displaced', timer: 0, handover: state.handover }
            : { phase: 'waiting', timer: 0, handover: null },
          hour,
        };
      const timer = state.timer + step;
      return {
        state:
          timer >= (state.walk?.hours ?? 0) + FORKLIFT_CREW_BOARD_HOURS
            ? { phase: 'aboard', timer: 0, handover: null }
            : { ...state, timer },
        hour,
      };
    }
    case 'aboard': {
      if (inputs.playerDriving) return { state: displaced(inputs), hour };
      // Into the spell, up to (never past) its end.
      const toEnd = spell - BOUNDARY_EPSILON - elapsed;
      if (elapsed >= spell || step >= toEnd)
        return {
          state: { phase: 'wants-off', timer: 0, handover: null },
          hour: hour + Math.max(0, Math.min(step, toEnd)),
        };
      return { state, hour: hour + step };
    }
    case 'wants-off':
      if (inputs.playerDriving) return { state: displaced(inputs), hour };
      return {
        state:
          inputs.parkedAt === 'crew' ? { phase: 'alighting', timer: 0, handover: null } : state,
        hour,
      };
    case 'alighting': {
      const timer = state.timer + step;
      if (timer < FORKLIFT_CREW_ALIGHT_HOURS) return { state: { ...state, timer }, hour };
      // Out of the cab: release the hour just past the spell, onto the walk.
      const toEnd = Math.max(0, spell - elapsed);
      return {
        state: { phase: 'off', timer: 0, handover: null },
        hour: hour + toEnd + BOUNDARY_EPSILON,
      };
    }
    case 'displaced': {
      if (inputs.parkedAt !== 'handover' || inputs.playerDriving) return { state, hour };
      // The forklift may have stopped a few metres along from where the
      // operator waited (it coasts, and the player may have moved it): they
      // walk to its side now rather than make it lap the route back to them.
      const side = inputs.handover() ?? state.handover;
      const from = state.handover;
      const metres = side && from ? Math.hypot(side.x - from.x, side.z - from.z) : 0;
      return {
        state: {
          phase: 'boarding',
          timer: 0,
          handover: side,
          ...(from && metres > 0.05
            ? { walk: { fromX: from.x, fromZ: from.z, hours: metres * WALK_HOURS_PER_METRE } }
            : {}),
        },
        hour,
      };
    }
  }
}

/**
 * What the forklift should do about its crew: work normally, or drive to a
 * station on its lane at walking pace and stand there.
 */
/** A place on the lane to stop and stand. */
export interface ForkliftCrewStation {
  kind: 'crew' | 'handover';
  routeDistance: number;
}

export interface ForkliftCrewDuty {
  /** May it work pickups and dropoffs (only with its operator seated)? */
  readonly works: boolean;
  /** Where on its lane to stop and stand, or null to run its route. */
  readonly station: { readonly kind: 'crew' | 'handover'; readonly routeDistance: number } | null;
  /** Unmanned: it moves at walking pace. */
  readonly walkingPace: boolean;
}

/**
 * aboard: runs its route. wants-off: still works, but stops at the crew point.
 * Everything else: unmanned, so no work, and at walking pace to its station:
 * the operator's handover spot while they wait there, otherwise the crew point.
 */
export function forkliftCrewDuty(
  state: ForkliftCrewState,
  crewRouteDistance: number,
  /** Reused per frame by the forklift; a fresh object each call without it. */
  out: { works: boolean; station: ForkliftCrewStation | null; walkingPace: boolean } = {
    works: false,
    station: null,
    walkingPace: false,
  },
  stationOut: ForkliftCrewStation = { kind: 'crew', routeDistance: 0 }
): ForkliftCrewDuty {
  const handover = state.handover && (state.phase === 'displaced' || state.phase === 'boarding');
  stationOut.kind = handover ? 'handover' : 'crew';
  stationOut.routeDistance = handover ? state.handover!.routeDistance : crewRouteDistance;
  out.works = state.phase === 'aboard' || state.phase === 'wants-off';
  out.station = state.phase === 'aboard' ? null : stationOut;
  out.walkingPace = !out.works;
  return out;
}

/** The operator's visible place when not seated: the stand, or the handover spot. */
export function operatorStandPose(
  site: Pick<ForkliftCrewSite, 'stand' | 'standRotation'>,
  state: ForkliftCrewState
): { x: number; z: number; rotation: number } {
  return state.handover
    ? { x: state.handover.x, z: state.handover.z, rotation: state.handover.rotation }
    : { x: site.stand[0], z: site.stand[2], rotation: site.standRotation };
}

/**
 * A seated operator's root in the forklift's frame (+z forward). WorkerModel
 * seats a body on a surface 0.46 m above its root, so the root sits that far
 * below the cab seat. The compact (low tier) seat top is 1.15 m, centred 0.4 m
 * behind the origin.
 *
 * The authored (medium and above) vehicle is smaller next to the 1.8 m bodies
 * than the compact one: its overhead guard is at 1.785 m (forkliftBeacon), and
 * a full-size seated body put the hard hat 0.3 m through it (seen in a capture,
 * 2026-10-31). So in that cab the operator sits at 0.88 scale, root 0.55 m: hips
 * on the cushion at about 0.96 m, head under the guard at about 1.75 m.
 */
const FORKLIFT_OPERATOR_SEAT = {
  // 6 cm into the 0.1 m cushion: at 0.69 the hard hat met the guard (2.03 m).
  compact: [0, 0.63, -0.4],
  authored: [0, 0.55, -0.4],
} as const satisfies Record<'compact' | 'authored', readonly [number, number, number]>;
export const FORKLIFT_OPERATOR_SCALE = { compact: 1, authored: 0.88 } as const;

/** The operator's world root for a forklift at (x, y, z) facing `heading`. */
export function operatorSeatPosition(
  vehicle: { readonly x: number; readonly y: number; readonly z: number; readonly heading: number },
  tier: 'compact' | 'authored',
  out: [number, number, number]
): [number, number, number] {
  const [sx, sy, sz] = FORKLIFT_OPERATOR_SEAT[tier];
  const sin = Math.sin(vehicle.heading);
  const cos = Math.cos(vehicle.heading);
  out[0] = vehicle.x + cos * sx + sin * sz;
  out[1] = vehicle.y + sy;
  out[2] = vehicle.z - sin * sx + cos * sz;
  return out;
}

/**
 * Where an operator walking back to their forklift is, while boarding after a
 * handover: along the walk until they reach its side, then at its side.
 * Returns whether they are still walking.
 */
export function sampleOperatorBoardingWalk(
  state: ForkliftCrewState,
  out: { x: number; z: number; rotation: number }
): boolean {
  const walk = state.walk;
  const target = state.handover;
  if (state.phase !== 'boarding' || !walk || !target || state.timer >= walk.hours) return false;
  const t = walk.hours > 0 ? state.timer / walk.hours : 1;
  out.x = walk.fromX + (target.x - walk.fromX) * t;
  out.z = walk.fromZ + (target.z - walk.fromZ) * t;
  out.rotation = Math.atan2(target.x - walk.fromX, target.z - walk.fromZ);
  return true;
}

/** Farther apart than this, a hold point and its twin on the leg back are not one spot. */
const SPUR_TWIN_TOLERANCE_METRES = 0.15;

/**
 * For a marker at the end of a spur (out and back along one line, a dock door),
 * the route distance on the leg back that stands where the hold point does,
 * facing the other way; null for any other marker. An unmanned forklift turns
 * there instead of going up the spur (unmannedSpurTurn).
 */
export function dockSpurTwinDistance(
  plan: ForkliftRoutePlan,
  markerDistance: number,
  holdLeg: number
): number | null {
  if (holdLeg <= 0) return null;
  const length = plan.path.totalLength;
  const hold = (((markerDistance - holdLeg) % length) + length) % length;
  const twin = (markerDistance + holdLeg) % length;
  const a = sampleArcLengthPath(plan.path, hold);
  const b = sampleArcLengthPath(plan.path, twin);
  const reversed =
    Math.abs(
      shortestVehicleAngle(forkliftRouteHeading(plan, hold), forkliftRouteHeading(plan, twin))
    ) >
    Math.PI - 0.1;
  return Math.hypot(a.x - b.x, a.z - b.z) <= SPUR_TWIN_TOLERANCE_METRES && reversed ? twin : null;
}

/**
 * An unmanned forklift (or one dropping its last task) never goes up a dock
 * spur: there is nothing for it there, and with no trailer docked the door is
 * shut, which its forks and any pallet went 0.6-0.9 m through. It stops at the
 * spur's hold point, where a crewed forklift waits for its truck (outside the
 * door's pedestrian approach), turns standing, and goes on from the twin
 * point on the leg back. Not when its station lies up the spur (a handover
 * where a player left it): it goes on to that. Null when there is no turn to make.
 * Working if no unmanned forklift passes a spur's hold point.
 */
export function unmannedSpurTurn({
  distanceToMarker,
  holdLeg,
  twinDistance,
  stationAhead,
}: {
  distanceToMarker: number;
  holdLeg: number;
  twinDistance: number | null;
  stationAhead: number | null;
}): { stopDistance: number; turnTo: number } | null {
  const stopDistance = spurTurnStop(distanceToMarker, holdLeg, twinDistance, stationAhead);
  return stopDistance < 0 ? null : { stopDistance, turnTo: twinDistance! };
}

/** unmannedSpurTurn's stop distance, or -1 for no turn; allocates nothing. */
function spurTurnStop(
  distanceToMarker: number,
  holdLeg: number,
  twinDistance: number | null,
  stationAhead: number | null
): number {
  if (twinDistance === null || holdLeg <= 0) return -1;
  // Already past the hold point (left there by a player, or restored): go on.
  if (distanceToMarker < holdLeg - 0.06) return -1;
  const stopDistance = Math.max(0, distanceToMarker - holdLeg);
  // Its station is up the spur, between the hold point and its twin.
  if (
    stationAhead !== null &&
    stationAhead > stopDistance + 0.06 &&
    stationAhead < distanceToMarker + holdLeg
  )
    return -1;
  return stopDistance;
}

/**
 * The nearest spur turn ahead over every marker, not only the next one to
 * work: an unloaded forklift bound for its pickup passes the dropoff spur
 * first, and went up it to the shut door. `holdLegs` and `twins` are per
 * marker (markerHoldLegs, dockSpurTwinDistance).
 */
export function nearestSpurTurnAhead(
  plan: ForkliftRoutePlan,
  routeDistance: number,
  holdLegs: readonly number[],
  twins: readonly (number | null)[],
  stationAhead: number | null,
  /** Reused per frame by the forklift; a fresh object each call without it. */
  out: { stopDistance: number; turnTo: number } = { stopDistance: 0, turnTo: 0 }
): { stopDistance: number; turnTo: number } | null {
  let found = false;
  for (let index = 0; index < plan.markers.length; index += 1) {
    const twinDistance = twins[index] ?? null;
    if (twinDistance === null) continue;
    const stopDistance = spurTurnStop(
      distanceAheadOnClosedPath(plan.path, routeDistance, plan.markers[index].distance),
      holdLegs[index] ?? 0,
      twinDistance,
      stationAhead
    );
    if (stopDistance >= 0 && (!found || stopDistance < out.stopDistance)) {
      found = true;
      out.stopDistance = stopDistance;
      out.turnTo = twinDistance;
    }
  }
  return found ? out : null;
}
