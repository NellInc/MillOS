/**
 * A forklift driven from its seat by a first-person player, and its way back to
 * the lane it was taken from.
 *
 * The autopilot (`stepForkliftMotion`) is a function of route distance: its
 * x and z are always path samples. A driven forklift is free in the plane, so it
 * keeps its own pose and integrates a rear-steered bicycle model with the
 * autopilot's own limits (speed, jerk, steering rate, yaw rate). When the
 * player leaves, `stepLaneReturn` brings it back to the route: pure pursuit,
 * round the dock platforms if it was left on an apron, backing off when
 * blocked (straight out of a dock spur), and handing back to the autopilot
 * once it is on its lane (`laneRejoinDistance`), or only in position after a
 * while, or as a last resort beside it; failing all of that, it is towed.
 */
import { forkliftInDockLane } from '../../constants/dockLoading';
import {
  FORKLIFT_MAXIMUM_STEERING_RADIANS,
  FORKLIFT_MAXIMUM_STEERING_RATE,
  FORKLIFT_MAXIMUM_YAW_RATE,
  FORKLIFT_REAR_TRACK_METRES,
  FORKLIFT_WHEELBASE_METRES,
  LOADED_LIMITS,
  UNLOADED_LIMITS,
  forkliftRouteHeading,
  type ForkliftRoutePlan,
} from './forkliftController';
import {
  advanceLongitudinalMotion,
  normalizeVehicleAngle,
  resolveAckermannSteering,
  sampleArcLengthPath,
  shortestVehicleAngle,
} from './vehicleKinematics';
import {
  FORKLIFT_PEDESTRIAN_LOOKAHEAD,
  FORKLIFT_PEDESTRIAN_SLOW_SPEED,
  FORKLIFT_PEDESTRIAN_STOP,
  nearestPedestrianAhead,
  type PedestrianPoint,
} from './forkliftWork';

/** Driver controls, each in -1..1. Steer +1 turns right; lift +1 raises the forks. */
export interface ManualDriveInput {
  readonly throttle: number;
  readonly steer: number;
  readonly lift: number;
}

export interface ManualForkliftState {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly acceleration: number;
  readonly steeringAngle: number;
  readonly innerSteeringAngle: number;
  readonly outerSteeringAngle: number;
  readonly wheelTravel: number;
  readonly forkHeight: number;
  /** True when the last step stopped against an obstruction. */
  readonly blocked: boolean;
}

/**
 * Footprint test: true when a circle of `radius` about (x, z) meets something
 * the vehicle cannot pass through.
 */
export type ManualFootprintBlocked = (x: number, z: number, radius: number) => boolean;

/** Seated eye, in the forklift's own frame (+z is forward, toward the mast). */
export const FORKLIFT_SEAT_EYE: readonly [number, number, number] = [0, 1.78, -0.42];
/** Highest the driver may raise the forks: the autopilot's pallet clearance lift. */
export const MANUAL_FORK_MAXIMUM_METRES = 0.72;
/** Fork travel rate under the lift lever, m/s. */
const MANUAL_FORK_RATE = 0.35;
/** How close to the player's eye a forklift's origin must be to board it. */
export const FORKLIFT_BOARDING_REACH_METRES = 2.6;

/**
 * Three circles along the body (counterweight, cab, front axle) and one over
 * the pallet when loaded. The body is 1.2 m wide and reaches 1.26 m either
 * side of the origin; the pallet's leading edge is at 1.54 m.
 */
const BODY_CIRCLES: readonly (readonly [number, number])[] = [
  [-0.7, 0.6],
  [0, 0.6],
  [0.7, 0.6],
];
const PALLET_CIRCLE: readonly [number, number] = [1.15, 0.42];

export function forkliftFootprintBlocked(
  x: number,
  z: number,
  heading: number,
  loaded: boolean,
  blocked: ManualFootprintBlocked
): boolean {
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  for (const [along, radius] of BODY_CIRCLES) {
    if (blocked(x + forwardX * along, z + forwardZ * along, radius)) return true;
  }
  if (loaded) {
    const [along, radius] = PALLET_CIRCLE;
    if (blocked(x + forwardX * along, z + forwardZ * along, radius)) return true;
  }
  return false;
}

/** A circle this small still obstructed has its centre inside something. */
const CENTRE_PROBE_METRES = 0.02;
const circleDepth = (
  x: number,
  z: number,
  radius: number,
  blocked: ManualFootprintBlocked
): number => {
  if (!blocked(x, z, radius)) return 0;
  if (blocked(x, z, CENTRE_PROBE_METRES)) return Infinity;
  // The largest radius still clear, by bisection.
  let clear = CENTRE_PROBE_METRES;
  let hit = radius;
  // 0.6 m to well under a millimetre: a step that goes in by more reads deeper.
  for (let i = 0; i < 10; i += 1) {
    const mid = (clear + hit) / 2;
    if (blocked(x, z, mid)) hit = mid;
    else clear = mid;
  }
  return radius - clear;
};

/** Whether a step to `next` depth goes further in than `start`: never into every centre inside. */
const deeperInside = (next: number, start: number): boolean => next === Infinity || next > start;

/**
 * How far the footprint is inside obstructions: the sum, over its circles, of
 * how much each would have to shrink to be clear. A circle whose centre is
 * inside counts its full radius, and a footprint with every centre inside
 * reads Infinity (nothing to measure a way out by). A forklift that is already
 * inside something (a truck that came onto it, a restored pose) may move while
 * this does not grow, so it can always back out the way it went in; one that
 * is clear may not move into anything.
 */
const forkliftFootprintDepth = (
  x: number,
  z: number,
  heading: number,
  loaded: boolean,
  blocked: ManualFootprintBlocked
): number => {
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  let depth = 0;
  let inside = 0;
  let circles = 0;
  const add = (along: number, radius: number) => {
    const d = circleDepth(x + forwardX * along, z + forwardZ * along, radius, blocked);
    circles += 1;
    if (d === Infinity) {
      inside += 1;
      depth += radius;
    } else depth += d;
  };
  for (const [along, radius] of BODY_CIRCLES) add(along, radius);
  if (loaded) add(PALLET_CIRCLE[0], PALLET_CIRCLE[1]);
  return inside === circles ? Infinity : depth;
};

const SUBSTEP_SECONDS = 1 / 60;
const MAXIMUM_REQUEST_SECONDS = 0.25;
const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

export const createManualForkliftState = (
  pose: Pick<ManualForkliftState, 'x' | 'z' | 'heading'> &
    Partial<Omit<ManualForkliftState, 'x' | 'z' | 'heading'>>
): ManualForkliftState => ({
  speed: 0,
  acceleration: 0,
  steeringAngle: 0,
  innerSteeringAngle: 0,
  outerSteeringAngle: 0,
  wheelTravel: 0,
  forkHeight: 0,
  blocked: false,
  ...pose,
});

const stepOnce = (
  state: ManualForkliftState,
  input: ManualDriveInput,
  loaded: boolean,
  dt: number,
  blocked: ManualFootprintBlocked,
  forwardCap: number,
  reverseCap: number,
  startDepth: number
): ManualForkliftState => {
  const limits = loaded ? LOADED_LIMITS : UNLOADED_LIMITS;
  const throttle = clampUnit(input.throttle);
  const forwardLimit = Math.min(limits.maximumForwardSpeed, forwardCap);
  const reverseLimit = Math.min(limits.maximumReverseSpeed, reverseCap);
  const target = throttle >= 0 ? throttle * forwardLimit : throttle * reverseLimit;
  const longitudinal = advanceLongitudinalMotion(state, target, dt, limits);

  // Steering: the wheel is rate-limited exactly as the autopilot's is.
  const steerTarget = -clampUnit(input.steer) * FORKLIFT_MAXIMUM_STEERING_RADIANS;
  const maximumSteeringChange = FORKLIFT_MAXIMUM_STEERING_RATE * dt;
  const steeringAngle =
    state.steeringAngle +
    Math.max(
      -maximumSteeringChange,
      Math.min(maximumSteeringChange, steerTarget - state.steeringAngle)
    );
  const curvature = Math.tan(steeringAngle) / FORKLIFT_WHEELBASE_METRES;
  const wheels = resolveAckermannSteering(
    curvature,
    FORKLIFT_WHEELBASE_METRES,
    FORKLIFT_REAR_TRACK_METRES,
    FORKLIFT_MAXIMUM_STEERING_RADIANS
  );

  const speed = longitudinal.speed;
  const maximumYaw = FORKLIFT_MAXIMUM_YAW_RATE * dt;
  const yaw = Math.max(-maximumYaw, Math.min(maximumYaw, speed * curvature * dt));
  const heading = normalizeVehicleAngle(state.heading + yaw);
  const midHeading = state.heading + yaw / 2;
  const x = state.x + Math.sin(midHeading) * speed * dt;
  const z = state.z + Math.cos(midHeading) * speed * dt;
  const forkHeight = Math.max(
    0,
    Math.min(
      MANUAL_FORK_MAXIMUM_METRES,
      state.forkHeight + clampUnit(input.lift) * MANUAL_FORK_RATE * dt
    )
  );

  const moved = Math.abs(speed) > 1e-6;
  if (
    moved &&
    (startDepth === 0
      ? forkliftFootprintBlocked(x, z, heading, loaded, blocked)
      : deeperInside(forkliftFootprintDepth(x, z, heading, loaded, blocked), startDepth))
  ) {
    // Stopped dead against it, wheels still turned; reversing away stays possible.
    return {
      ...state,
      speed: 0,
      acceleration: 0,
      steeringAngle,
      innerSteeringAngle: wheels.inner,
      outerSteeringAngle: wheels.outer,
      forkHeight,
      blocked: true,
    };
  }
  return {
    x,
    z,
    heading,
    speed,
    acceleration: longitudinal.acceleration,
    steeringAngle,
    innerSteeringAngle: wheels.inner,
    outerSteeringAngle: wheels.outer,
    wheelTravel: state.wheelTravel + Math.abs(speed * dt),
    forkHeight,
    blocked: false,
  };
};

/**
 * Integrate a driven forklift at no more than 60 Hz per step, so a dropped
 * frame cannot push it through an obstacle or past the jerk limit.
 * Working if it never ends a step with its footprint inside an obstruction it
 * started clear of, can always drive out of one it started in, and reaches no
 * speed the autopilot's limits forbid.
 */
export function stepManualForklift(
  state: ManualForkliftState,
  input: ManualDriveInput,
  options: {
    readonly loaded: boolean;
    readonly deltaSeconds: number;
    readonly blocked: ManualFootprintBlocked;
    /** Optional cap below the load limits, m/s (lane return drives slowly). */
    readonly maximumSpeed?: number;
    /** Optional caps on driving forward and on reversing alone (giving way to people). */
    readonly maximumForwardSpeed?: number;
    readonly maximumReverseSpeed?: number;
  }
): ManualForkliftState {
  let remaining = Math.min(
    MAXIMUM_REQUEST_SECONDS,
    Math.max(0, Number.isFinite(options.deltaSeconds) ? options.deltaSeconds : 0)
  );
  if (remaining <= 0) return state;
  const maximumSpeed = options.maximumSpeed ?? Infinity;
  const forwardCap = Math.min(maximumSpeed, options.maximumForwardSpeed ?? Infinity);
  const reverseCap = Math.min(maximumSpeed, options.maximumReverseSpeed ?? Infinity);
  // Usually clear, and then the cheap early-out test serves every substep.
  const depthOf = (pose: ManualForkliftState): number =>
    forkliftFootprintBlocked(pose.x, pose.z, pose.heading, options.loaded, options.blocked)
      ? forkliftFootprintDepth(pose.x, pose.z, pose.heading, options.loaded, options.blocked)
      : 0;
  let depth = depthOf(state);
  let current = state;
  let blocked = false;
  while (remaining > 1e-9) {
    const dt = Math.min(SUBSTEP_SECONDS, remaining);
    current = stepOnce(
      current,
      input,
      options.loaded,
      dt,
      options.blocked,
      forwardCap,
      reverseCap,
      depth
    );
    // Getting out, measured afresh each substep until it is clear.
    if (depth > 0) depth = depthOf(current);
    blocked ||= current.blocked;
    remaining -= dt;
  }
  return blocked === current.blocked ? current : { ...current, blocked };
}

// The give-way probe: where it starts and the way it looks, set per call, and
// the point it samples, rewritten for each sample. No allocation per frame.
const giveWayProbe = { x: 0, z: 0, dirX: 0, dirZ: 1 };
const giveWayPoint = { x: 0, z: 0 };
const sampleGiveWayProbe = (distance: number): { readonly x: number; readonly z: number } => {
  giveWayPoint.x = giveWayProbe.x + giveWayProbe.dirX * distance;
  giveWayPoint.z = giveWayProbe.z + giveWayProbe.dirZ * distance;
  return giveWayPoint;
};

/**
 * How far ahead of a driven forklift the nearest person on foot stands in its
 * corridor, or Infinity: straight ahead along its heading (`direction` 1), or
 * behind it while it reverses (-1). The autopilot's look-ahead
 * (nearestPedestrianAhead) on the line the driver is taking rather than the
 * route, measured from the vehicle's origin as the autopilot measures it.
 */
export function manualPedestrianAhead(
  state: Pick<ManualForkliftState, 'x' | 'z' | 'heading'>,
  direction: 1 | -1,
  people: readonly PedestrianPoint[],
  count: number
): number {
  giveWayProbe.x = state.x;
  giveWayProbe.z = state.z;
  giveWayProbe.dirX = Math.sin(state.heading) * direction;
  giveWayProbe.dirZ = Math.cos(state.heading) * direction;
  return nearestPedestrianAhead(sampleGiveWayProbe, people, count);
}

/**
 * The fastest a forklift may go toward someone on foot `distance` metres
 * ahead: the autopilot's give-way, which slows within the look-ahead and
 * stops within the stop distance.
 */
export const pedestrianGiveWaySpeed = (distance: number): number =>
  distance <= FORKLIFT_PEDESTRIAN_STOP
    ? 0
    : distance <= FORKLIFT_PEDESTRIAN_LOOKAHEAD
      ? FORKLIFT_PEDESTRIAN_SLOW_SPEED
      : Infinity;

/** Above the slow speed by more than the speed controller's settling error. */
const CLOSING_SPEED_MARGIN = 1e-3;

/**
 * A near miss: someone on foot is within the stop distance on the line the
 * forklift is travelling, and it is still going faster than the slow speed it
 * should have given way at. A driver who slowed for them never closes at speed.
 */
export const pedestrianClosingAtSpeed = (distance: number, speed: number): boolean =>
  distance <= FORKLIFT_PEDESTRIAN_STOP &&
  Math.abs(speed) > FORKLIFT_PEDESTRIAN_SLOW_SPEED + CLOSING_SPEED_MARGIN;

/** Lateral distance and heading error at which the autopilot can take the vehicle back. */
const LANE_REJOIN_LATERAL_METRES = 0.3;
const LANE_REJOIN_HEADING_RADIANS = 0.35;
/** Lane return drives at walking pace. */
const LANE_RETURN_SPEED = 0.9;
const LANE_RETURN_LOOKAHEAD_METRES = 2.5;
/** Route-search step and the metres one radian of heading error weighs against distance. */
const LANE_SEARCH_STEP_METRES = 0.25;
const LANE_HEADING_WEIGHT_METRES = 2;

/** Coarse lane samples (distance, x, z, heading) per route plan, built once. */
const LANE_SAMPLE_STRIDE = 4;
/** Relative slack on the squared-distance prune, far above floating-point rounding. */
const PRUNE_MARGIN = 1 + 1e-9;
const laneSearchSamples = new WeakMap<ForkliftRoutePlan, Float64Array>();
const coarseLaneSamples = (plan: ForkliftRoutePlan): Float64Array => {
  const cached = laneSearchSamples.get(plan);
  if (cached) return cached;
  const count = Math.ceil(plan.path.totalLength / LANE_SEARCH_STEP_METRES);
  const samples = new Float64Array(count * LANE_SAMPLE_STRIDE);
  for (let index = 0; index < count; index += 1) {
    const distance = index * LANE_SEARCH_STEP_METRES;
    const sample = sampleArcLengthPath(plan.path, distance);
    const offset = index * LANE_SAMPLE_STRIDE;
    samples[offset] = distance;
    samples[offset + 1] = sample.x;
    samples[offset + 2] = sample.z;
    samples[offset + 3] = forkliftRouteHeading(plan, distance);
  }
  laneSearchSamples.set(plan, samples);
  return samples;
};

export interface LaneRejoinTarget {
  distance: number;
  lateral: number;
  headingError: number;
}

/**
 * The route distance to rejoin at: the closest point whose direction of travel
 * agrees with the vehicle's. Plain nearest-point fails on these routes, whose
 * out and back legs run side by side and meet head-on at a dock cusp: the
 * nearest point was often the leg going the other way, and the vehicle circled.
 * `out` is reused when given.
 */
export function findLaneRejoinTarget(
  plan: ForkliftRoutePlan,
  state: Pick<ManualForkliftState, 'x' | 'z' | 'heading'>,
  out: LaneRejoinTarget = { distance: 0, lateral: Infinity, headingError: Math.PI }
): LaneRejoinTarget {
  const samples = coarseLaneSamples(plan);
  // A sample's cost is at least its distance, so one farther than a cost some
  // sample reaches cannot win: skipped before the root and the angle, which
  // were nearly all of a lane-return step. The bound starts at the cost of the
  // sample nearest a reused `out`'s last answer (it moves little per step) and
  // tightens as the scan goes. Squared, with a margin far above rounding, so
  // the result is exactly the unpruned search's.
  let bound = Infinity;
  if (Number.isFinite(out.lateral) && Number.isFinite(out.distance)) {
    const last = Math.max(0, Math.round(out.distance / LANE_SEARCH_STEP_METRES));
    const index = Math.min(samples.length / LANE_SAMPLE_STRIDE - 1, last) * LANE_SAMPLE_STRIDE;
    bound =
      Math.hypot(state.x - samples[index + 1], state.z - samples[index + 2]) +
      LANE_HEADING_WEIGHT_METRES *
        Math.abs(shortestVehicleAngle(state.heading, samples[index + 3]));
  }
  let bestCost = Infinity;
  out.distance = 0;
  out.lateral = Infinity;
  out.headingError = Math.PI;
  for (let index = 0; index < samples.length; index += LANE_SAMPLE_STRIDE) {
    const dx = state.x - samples[index + 1];
    const dz = state.z - samples[index + 2];
    const limit = bestCost < bound ? bestCost : bound;
    if (dx * dx + dz * dz > limit * limit * PRUNE_MARGIN) continue;
    const lateral = Math.hypot(dx, dz);
    const headingError = Math.abs(shortestVehicleAngle(state.heading, samples[index + 3]));
    const cost = lateral + LANE_HEADING_WEIGHT_METRES * headingError;
    if (cost < bestCost) {
      bestCost = cost;
      out.distance = samples[index];
      out.lateral = lateral;
      out.headingError = headingError;
    }
  }
  // Refine around the coarse best to the true foot of the perpendicular.
  const coarse = out.distance;
  const length = plan.path.totalLength;
  for (let offset = -LANE_SEARCH_STEP_METRES; offset <= LANE_SEARCH_STEP_METRES; offset += 0.025) {
    const distance = (coarse + offset + length) % length;
    const sample = sampleArcLengthPath(plan.path, distance);
    const lateral = Math.hypot(state.x - sample.x, state.z - sample.z);
    if (lateral >= bestCost) continue;
    const headingError = Math.abs(
      shortestVehicleAngle(state.heading, forkliftRouteHeading(plan, distance))
    );
    const cost = lateral + LANE_HEADING_WEIGHT_METRES * headingError;
    if (cost < bestCost) {
      bestCost = cost;
      out.distance = distance;
      out.lateral = lateral;
      out.headingError = headingError;
    }
  }
  return out;
}

/**
 * The route distance at which the autopilot can resume, or null when the
 * vehicle is not yet on its lane, in position and in heading.
 */
export function laneRejoinDistance(
  plan: ForkliftRoutePlan,
  state: Pick<ManualForkliftState, 'x' | 'z' | 'heading'>,
  target = findLaneRejoinTarget(plan, state)
): number | null {
  const { distance, lateral, headingError } = target;
  return lateral <= LANE_REJOIN_LATERAL_METRES && headingError <= LANE_REJOIN_HEADING_RADIANS
    ? distance
    : null;
}

/**
 * Lane return after the driver steps down. 'returning' drives back by pure
 * pursuit, backing off and turning (a three-point turn) whenever the nose is
 * blocked, and hands back on the lane at any heading once lining up has taken
 * too long; 'parked' gave up after being blocked or not converging, and
 * retries on a timer. Anything it gives up on, the player can board and drive
 * nearer.
 */
export interface LaneReturnState {
  readonly mode: 'returning' | 'parked';
  /** Plant seconds parked, or since the last progress toward the lane. */
  readonly timer: number;
  /** Closest it has come to its rejoin point while returning, metres. */
  readonly bestLateral: number;
  /** Plant seconds without one unblocked step. */
  readonly blockedTimer: number;
  /** Metres still to reverse in the current back-off. */
  readonly reverseLeft: number;
  /** Times it has parked since the driver stepped down; carried across retries. */
  readonly parks: number;
  /** The current back-off is straight out of a dead end, not a turning one. */
  readonly straightBack: boolean;
  /** Plant seconds since this attempt began. */
  readonly elapsed: number;
}

/** Plant seconds without coming 0.25 m closer to the lane before it parks. */
const LANE_RETURN_GIVE_UP_SECONDS = 30;
const LANE_RETURN_PROGRESS_METRES = 0.25;
export const LANE_RETURN_BLOCKED_SECONDS = 3;
export const LANE_RETURN_PARKED_RETRY_SECONDS = 15;
const LANE_RETURN_REVERSE_METRES = 1.5;
/** Blocked this far straight ahead, it is facing a dead end and backs out first, this far. */
const LANE_DEAD_END_PROBE_METRES = 1.2;
const LANE_DEAD_END_REVERSE_METRES = 4;
/** Within about 60 degrees of a dock spur's axis, a forklift in it backs straight out. */
const LANE_SPUR_ALIGNED_COSINE = 0.5;
/**
 * Last resort instead of parking: within this of the lane and this far off its
 * heading, with clear ground between, it hands back to the autopilot there and
 * the rejoin blend eases it across. Some poses at the closed end of a dock
 * spur, nose to the door, defeat pursuit and every back-off.
 */
const LANE_RECOVERY_LATERAL_METRES = 1.5;
const LANE_RECOVERY_HEADING_RADIANS = 0.6;
const LANE_RECOVERY_SAMPLES = 4;
/**
 * Attempts after which it is put back on its lane: it is towed on giving up
 * the third, having parked 15 s after each of the first two.
 */
export const LANE_RETURN_TOW_AFTER_PARKS = 3;
const detourAim = { x: 0, z: 0 };
// Per-step scratch: each is filled and consumed within one stepLaneReturn call.
const pursuitInput = { throttle: 0, steer: 0, lift: 0 };
const turningBackInput = { throttle: -1, steer: 0, lift: 0 };
const laneDriveOptions = {
  loaded: false,
  deltaSeconds: 0,
  blocked: (() => false) as ManualFootprintBlocked,
  maximumSpeed: LANE_RETURN_SPEED,
};

/**
 * The way round an obstruction pursuit cannot see past: sets `out` to the
 * point to aim at and returns the distance on from it to the lane, or null.
 */
export type LaneDetour = (
  x: number,
  z: number,
  heading: number,
  plan: ForkliftRoutePlan,
  /** Where pursuit would aim on the lane without a detour. */
  laneAim: { readonly x: number; readonly z: number },
  out: { x: number; z: number }
) => number | null;

/**
 * One lane-return step. `rejoinDistance` is set when the autopilot should
 * take it from that route distance; `towed` when it was put there rather than
 * driven (no rejoin blend: nothing is drawn sliding through what it could not pass).
 */
export interface LaneReturnStep {
  vehicle: ManualForkliftState;
  laneReturn: LaneReturnState;
  rejoinDistance: number | null;
  towed: boolean;
}

/**
 * After this long without lining up, it hands back on the lane at any heading:
 * the autopilot pivots standing from rest (stepForkliftMotion), as it does at a
 * pickup. The route's corners are about 1 m in radius and the forklift's
 * tightest turn 2.47 m (wheelbase 1.55 m at 0.56 rad), and a dock spur is
 * shorter than a turning circle: from an offset there it cannot line up at all,
 * and pursuit orbited the corner for good. Every start 1.2 m either side of
 * both lanes, facing either way, now returns inside 50 s (the sweep in
 * forkliftManualDrive.test.ts).
 */
export const LANE_RETURN_PIVOT_AFTER_SECONDS = 6;

export const createLaneReturnState = (parks = 0): LaneReturnState => ({
  mode: 'returning',
  timer: 0,
  bestLateral: Infinity,
  blockedTimer: 0,
  reverseLeft: 0,
  parks,
  straightBack: false,
  elapsed: 0,
});

const LANE_IDLE_INPUT: ManualDriveInput = { throttle: 0, steer: 0, lift: 0 };
const LANE_STRAIGHT_BACK_INPUT: ManualDriveInput = { throttle: -1, steer: 0, lift: 0 };
const laneTargetScratch: LaneRejoinTarget = { distance: 0, lateral: Infinity, headingError: 0 };

/**
 * One lane-return step. `rejoinDistance` is set when the vehicle is on its lane
 * and the autopilot should take it from that route distance. `halted` (an
 * e-stop or drill) brakes it where it is and runs no timer.
 */
export function stepLaneReturn(
  plan: ForkliftRoutePlan,
  vehicle: ManualForkliftState,
  laneReturn: LaneReturnState,
  options: {
    readonly loaded: boolean;
    readonly deltaSeconds: number;
    readonly blocked: ManualFootprintBlocked;
    readonly halted: boolean;
    /** The way round anything pursuit cannot see past (dockPlatformDetour). */
    readonly detour?: LaneDetour;
  }
): LaneReturnStep {
  const dt = Number.isFinite(options.deltaSeconds) ? Math.max(0, options.deltaSeconds) : 0;
  // The timers count only what the motion ran: a request is clamped, and at
  // top pace and a low frame rate the clock ran ahead of the vehicle.
  const timed = Math.min(dt, MAXIMUM_REQUEST_SECONDS);
  const driveOptions = laneDriveOptions;
  driveOptions.loaded = options.loaded;
  driveOptions.deltaSeconds = dt;
  driveOptions.blocked = options.blocked;

  if (options.halted)
    return {
      vehicle: stepManualForklift(vehicle, LANE_IDLE_INPUT, driveOptions),
      laneReturn,
      rejoinDistance: null,
      towed: false,
    };

  if (laneReturn.mode === 'parked') {
    const timer = laneReturn.timer + timed;
    return {
      vehicle: stepManualForklift(vehicle, LANE_IDLE_INPUT, driveOptions),
      laneReturn:
        timer >= LANE_RETURN_PARKED_RETRY_SECONDS
          ? createLaneReturnState(laneReturn.parks)
          : { ...laneReturn, timer },
      rejoinDistance: null,
      towed: false,
    };
  }

  const target = findLaneRejoinTarget(plan, vehicle, laneTargetScratch);
  // On the lane in position and heading, or only in position once that is all
  // it can manage: the autopilot takes it.
  const rejoinDistance =
    laneRejoinDistance(plan, vehicle, target) ??
    (laneReturn.elapsed >= LANE_RETURN_PIVOT_AFTER_SECONDS &&
    target.lateral <= LANE_REJOIN_LATERAL_METRES
      ? target.distance
      : null);
  if (rejoinDistance !== null) return { vehicle, laneReturn, rejoinDistance, towed: false };

  const laneAim = sampleArcLengthPath(plan.path, target.distance + LANE_RETURN_LOOKAHEAD_METRES);
  const detourRest =
    options.detour?.(vehicle.x, vehicle.z, vehicle.heading, plan, laneAim, detourAim) ?? null;
  const pursuit =
    detourRest === null
      ? pursuitToward(vehicle, laneAim.x, laneAim.z)
      : pursuitToward(vehicle, detourAim.x, detourAim.z);
  // How far it still has to go: round a detour, the whole way round it.
  const remaining =
    detourRest === null
      ? target.lateral
      : Math.hypot(detourAim.x - vehicle.x, detourAim.z - vehicle.z) + detourRest;
  // Nose to a dead end (the closed end of a dock spur): back out first.
  const deadEnd =
    laneReturn.reverseLeft <= 0 &&
    forkliftFootprintBlocked(
      vehicle.x + Math.sin(vehicle.heading) * LANE_DEAD_END_PROBE_METRES,
      vehicle.z + Math.cos(vehicle.heading) * LANE_DEAD_END_PROBE_METRES,
      vehicle.heading,
      options.loaded,
      options.blocked
    );
  const backingOff = laneReturn.reverseLeft > 0 || deadEnd;
  // In a dock spur and roughly lined up with it (the spurs run along z), any
  // back-off is straight and long enough to leave it. Only a dead end once
  // chose straight, so a forklift that turned in the channel until blocked
  // backed off turning and wedged crosswise; and one left crosswise has to
  // turn out, as backing straight only bumped it between the platforms.
  const inSpur =
    forkliftInDockLane(vehicle.x, vehicle.z) &&
    Math.abs(Math.cos(vehicle.heading)) >= LANE_SPUR_ALIGNED_COSINE;
  const straightBack =
    backingOff && (laneReturn.reverseLeft > 0 ? laneReturn.straightBack : inSpur);
  // Out of a dock spur's dead end it backs straight: the spur is a 4 m
  // channel, too narrow for its 2.47 m turning circle, and with rear-wheel
  // steering any lock while reversing swings the tail into the channel side.
  // Anywhere else a back-off turns the wheel the other way, which swings the
  // nose the same way: a three-point turn, which clears a belt corner, and
  // makes each retry differ (a straight one repeated itself until towed).
  turningBackInput.steer = -pursuit.steer;
  const next = stepManualForklift(
    vehicle,
    !backingOff ? pursuit : straightBack ? LANE_STRAIGHT_BACK_INPUT : turningBackInput,
    driveOptions
  );
  const travelled = Math.abs(next.wheelTravel - vehicle.wheelTravel);
  const reverseLeft = backingOff
    ? next.blocked
      ? 0
      : Math.max(
          0,
          (deadEnd
            ? inSpur
              ? LANE_DEAD_END_REVERSE_METRES
              : LANE_RETURN_REVERSE_METRES
            : laneReturn.reverseLeft) - travelled
        )
    : next.blocked
      ? inSpur
        ? LANE_DEAD_END_REVERSE_METRES
        : LANE_RETURN_REVERSE_METRES
      : 0;
  const blockedTimer = next.blocked ? laneReturn.blockedTimer + timed : 0;
  // Progress, not elapsed time, decides when to give up: a forklift left far
  // out on the apron is slow to come back but never stalled.
  const progressed = remaining < laneReturn.bestLateral - LANE_RETURN_PROGRESS_METRES;
  const bestLateral = progressed ? remaining : laneReturn.bestLateral;
  const timer = progressed ? 0 : laneReturn.timer + timed;
  const parked =
    blockedTimer >= LANE_RETURN_BLOCKED_SECONDS || timer >= LANE_RETURN_GIVE_UP_SECONDS;
  if (parked && laneRecoveryClear(plan, next, target, options))
    return { vehicle: next, laneReturn, rejoinDistance: target.distance, towed: false };
  // Nothing it tries brings it back: it is put back on its lane, as a
  // supervisor would fetch it, rather than stand somewhere for good holding a
  // truck and its operator (a state with no way out is a bug).
  // Not onto another vehicle there: it parks again and tries next time.
  if (parked && laneReturn.parks + 1 >= LANE_RETURN_TOW_AFTER_PARKS) {
    const lane = sampleArcLengthPath(plan.path, target.distance);
    if (
      !forkliftFootprintBlocked(
        lane.x,
        lane.z,
        forkliftRouteHeading(plan, target.distance),
        options.loaded,
        options.blocked
      )
    )
      return { vehicle: next, laneReturn, rejoinDistance: target.distance, towed: true };
  }
  return {
    vehicle: next,
    laneReturn: parked
      ? {
          mode: 'parked',
          timer: 0,
          bestLateral: Infinity,
          blockedTimer: 0,
          reverseLeft: 0,
          straightBack: false,
          parks: laneReturn.parks + 1,
          elapsed: 0,
        }
      : {
          mode: 'returning',
          timer,
          bestLateral,
          blockedTimer,
          reverseLeft,
          // A back-off starting now (blocked this step) takes the spur's rule too.
          straightBack: reverseLeft > 0 && (backingOff ? straightBack : inSpur),
          parks: laneReturn.parks,
          elapsed: laneReturn.elapsed + timed,
        },
    rejoinDistance: null,
    towed: false,
  };
}

/** Whether the last-resort hand-back is close, lined up, and clear all the way to the lane. */
function laneRecoveryClear(
  plan: ForkliftRoutePlan,
  vehicle: ManualForkliftState,
  target: LaneRejoinTarget,
  options: { readonly loaded: boolean; readonly blocked: ManualFootprintBlocked }
): boolean {
  if (
    target.lateral > LANE_RECOVERY_LATERAL_METRES ||
    target.headingError > LANE_RECOVERY_HEADING_RADIANS
  )
    return false;
  const lane = sampleArcLengthPath(plan.path, target.distance);
  const heading = forkliftRouteHeading(plan, target.distance);
  for (let i = 1; i <= LANE_RECOVERY_SAMPLES; i += 1) {
    const t = i / LANE_RECOVERY_SAMPLES;
    if (
      forkliftFootprintBlocked(
        vehicle.x + (lane.x - vehicle.x) * t,
        vehicle.z + (lane.z - vehicle.z) * t,
        heading,
        options.loaded,
        options.blocked
      )
    )
      return false;
  }
  return true;
}

/**
 * Forward pure pursuit toward one point. A vehicle facing away from it makes a
 * turning loop back, as a driver would in a hall aisle. Writes a scratch input.
 */
function pursuitToward(
  state: Pick<ManualForkliftState, 'x' | 'z' | 'heading'>,
  aimX: number,
  aimZ: number
): ManualDriveInput {
  const dx = aimX - state.x;
  const dz = aimZ - state.z;
  // Capped so a distant lane is approached by turning toward it at once:
  // uncapped, a target 25 m off gave a 17 m radius drift away from it.
  const lookahead = Math.min(LANE_RETURN_LOOKAHEAD_METRES + 0.5, Math.max(0.5, Math.hypot(dx, dz)));
  const alpha = shortestVehicleAngle(state.heading, Math.atan2(dx, dz));
  const curvature = (2 * Math.sin(alpha)) / lookahead;
  const steerAngle = Math.atan(curvature * FORKLIFT_WHEELBASE_METRES);
  pursuitInput.throttle = 1;
  // Positive curvature turns left (heading grows); steer +1 is right.
  pursuitInput.steer = clampUnit(-steerAngle / FORKLIFT_MAXIMUM_STEERING_RADIANS);
  pursuitInput.lift = 0;
  return pursuitInput;
}
