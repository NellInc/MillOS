import type { ForkliftWaypointAction } from '../forkliftRoute';
import { FORKLIFT_PALLET_CLEARANCE } from '../../constants/dockLoading';
import {
  advanceLongitudinalMotion,
  createArcLengthPath,
  findNearestPathDistance,
  normalizeVehicleAngle,
  resolveAckermannSteering,
  sampleArcLengthPath,
  shortestVehicleAngle,
  type ArcLengthPath,
  type LongitudinalMotionLimits,
} from './vehicleKinematics';

export type ForkliftStopReason =
  | 'none'
  | 'simulation-paused'
  | 'emergency-stop'
  | 'route-blocked'
  | 'vehicle-queue'
  | 'vehicle-yield'
  | 'crossing-reservation'
  | 'logistics-interlock'
  | 'load-operation';

/** Fleet priority can release a peer wait, never a safety or physical barrier hold.
 * A static obstruction on the route is 'route-blocked' (a near miss); another
 * vehicle on it is 'vehicle-queue', routine traffic that is never one.
 * Working if hard holds and static obstacles survive every peer ordering, and
 * queuing behind a peer never reads as an obstruction.
 */
export function resolveForkliftStopReason({
  id,
  emergencyStopped,
  crossingClear,
  logisticsInterlock,
  pathClear,
  obstaclePathClear,
  nearby,
}: {
  id: string;
  emergencyStopped: boolean;
  crossingClear: boolean;
  logisticsInterlock: boolean;
  pathClear: boolean;
  obstaclePathClear: boolean;
  nearby: readonly { id: string; isStopped?: boolean; kind?: 'forklift' | 'truck' }[];
}): ForkliftStopReason {
  if (emergencyStopped) return 'emergency-stop';
  if (!crossingClear) return 'crossing-reservation';
  if (logisticsInterlock) return 'logistics-interlock';
  if (!obstaclePathClear) return 'route-blocked';
  const canReleasePeerWait =
    nearby.length > 0 &&
    nearby.every((peer) => peer.kind !== 'truck' && peer.isStopped && id < peer.id);
  if (!pathClear && !canReleasePeerWait) return 'vehicle-queue';
  if (nearby.some((peer) => !peer.isStopped || id > peer.id)) return 'vehicle-yield';
  return 'none';
}

export type ForkliftLoadPhase =
  | 'idle'
  | 'aligning'
  | 'lowering'
  | 'inserting'
  | 'engaging'
  | 'lifting'
  | 'tilting'
  | 'retracting'
  | 'carrying'
  | 'levelling'
  | 'placing'
  | 'disengaging'
  | 'withdrawing'
  | 'resetting';

export interface ForkliftRouteMarker {
  readonly distance: number;
  readonly action: ForkliftWaypointAction;
}

/** A standing turn: from `start` to `end` of route distance the body faces `heading`. */
export interface ForkliftPivotSpan {
  readonly start: number;
  readonly end: number;
  readonly heading: number;
}

export interface ForkliftRoutePlan {
  readonly path: ArcLengthPath;
  readonly markers: readonly ForkliftRouteMarker[];
  readonly pivots?: readonly ForkliftPivotSpan[];
}

export interface ForkliftMotionState {
  readonly routeDistance: number;
  readonly speed: number;
  readonly acceleration: number;
  readonly heading: number;
  readonly steeringAngle: number;
  readonly innerSteeringAngle: number;
  readonly outerSteeringAngle: number;
  readonly wheelTravel: number;
  readonly x: number;
  readonly z: number;
  readonly stopReason: ForkliftStopReason;
}

export interface ForkliftMotionRequest {
  readonly targetSpeed: number;
  readonly stopReason: ForkliftStopReason;
  readonly loaded: boolean;
  readonly deltaSeconds: number;
  readonly maximumTravelDistance?: number;
  /**
   * Keep the body's heading this step. Set while the vehicle waits at a pickup
   * or dropoff it has not worked yet: the movement authority lets it creep
   * onto the action vertex, where the route heading is the departure one, and
   * it otherwise pivoted away from the trailer or bay before it worked.
   */
  readonly holdHeading?: boolean;
}

export interface ForkliftLoadPose {
  readonly phase: ForkliftLoadPhase;
  readonly forkHeight: number;
  readonly mastTilt: number;
  readonly cargoEngaged: boolean;
  /**
   * How present the pallet is, 0..1, for every render tier to draw from. At a
   * pickup it fades in on the floor while the forklift aligns and lowers, so
   * the forks go into something; at a dropoff it stays on the floor while the
   * forks withdraw and fades as the mast resets. It is 1 whenever the cargo
   * is engaged. It replaced per-model fades that hid a set-down pallet in one
   * frame and ran on the line setpoint rather than plant time.
   */
  readonly cargoPresence: number;
  readonly operationComplete: boolean;
}

export const FORKLIFT_WHEELBASE_METRES = 1.55;
export const FORKLIFT_REAR_TRACK_METRES = 1.05;
export const FORKLIFT_MAXIMUM_STEERING_RADIANS = 0.56;
export const FORKLIFT_MAXIMUM_STEERING_RATE = 1.4;
const FORKLIFT_MAXIMUM_SUBSTEP_SECONDS = 1 / 60;
const FORKLIFT_MAXIMUM_REQUEST_SECONDS = 0.25;

const UNLOADED_LIMITS: LongitudinalMotionLimits = {
  maximumForwardSpeed: 3.5,
  maximumReverseSpeed: 1.2,
  maximumAcceleration: 1.2,
  maximumDeceleration: 1.8,
  maximumJerk: 2.4,
};

const LOADED_LIMITS: LongitudinalMotionLimits = {
  maximumForwardSpeed: 1.8,
  maximumReverseSpeed: 0.8,
  maximumAcceleration: 0.8,
  maximumDeceleration: 1.5,
  maximumJerk: 1.8,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smootherstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Half-width of the heading blend around each route vertex, in metres.
 *
 * Arc-length samples take central-difference tangents and the sampler lerps
 * them across a whole segment, so an unrounded action corner (pickup and
 * dropoff are never rounded) turned the heading across the entire 2-8 m leg
 * beside it: up to ~58 degrees of crab on a straight. Inserting a point this
 * far either side of every vertex confines the tangent and curvature blend to
 * the corner itself; every straight leg then points along travel.
 */
const FORKLIFT_CORNER_BLEND_METRES = 0.4;

/**
 * Pickup and dropoff are never rounded, and the vehicle stops at each, so a
 * turn there is made standing: the forklift arrives on its incoming heading,
 * works, then pivots onto the outgoing one before it moves. Blending the
 * tangent across the vertex instead turned the body up to 90 degrees sideways
 * over the last 0.4 m while it travelled straight, at the 180-degree pickup
 * cusp on the shipping route. A pivot vertex is followed by a split point this
 * far along the outgoing leg, which carries the outgoing tangent.
 */
const FORKLIFT_PIVOT_SPLIT_METRES = 0.01;
/** Action vertices that turn less than this keep the ordinary blend. */
const FORKLIFT_PIVOT_MINIMUM_TURN = 0.5;
/**
 * The body's yaw rate limit, rad/s: the displayed heading follows the path
 * tangent no faster than this, and a pivot in place runs at it (180 degrees
 * in 2.6 s). The curvature speed limit keeps a moving vehicle inside it.
 */
export const FORKLIFT_MAXIMUM_YAW_RATE = 1.2;
/** Heading error at rest beyond which the vehicle pivots before it moves. */
const FORKLIFT_PIVOT_TOLERANCE = 0.05;
/** Lateral acceleration the curvature speed limit allows, m/s^2. */
const FORKLIFT_LATERAL_ACCELERATION = 1.05;
/** Braking rate the curvature look-ahead plans with, m/s^2 (below either load's limit). */
const FORKLIFT_PLANNED_DECELERATION = 1;

type RoutePoint = { x: number; z: number };

const densifyClosedRoute = (
  points: readonly { readonly x: number; readonly z: number }[],
  pivots: ReadonlySet<number> = new Set()
): { dense: RoutePoint[]; pivotPairs: [RoutePoint, RoutePoint][] } => {
  const ring = points.map(({ x, z }) => ({ x, z }));
  // A closing point that repeats the first would be a zero-length segment.
  const last = ring[ring.length - 1];
  if (ring.length > 1 && Math.hypot(last.x - ring[0].x, last.z - ring[0].z) <= 1e-6) ring.pop();

  const dense: RoutePoint[] = [];
  const pivotPairs: [RoutePoint, RoutePoint][] = [];
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length];
    dense.push(point);
    const dx = next.x - point.x;
    const dz = next.z - point.z;
    const length = Math.hypot(dx, dz);
    if (pivots.has(index) && length > FORKLIFT_CORNER_BLEND_METRES + 0.01) {
      const split = {
        x: point.x + (dx / length) * FORKLIFT_PIVOT_SPLIT_METRES,
        z: point.z + (dz / length) * FORKLIFT_PIVOT_SPLIT_METRES,
      };
      dense.push(split);
      pivotPairs.push([point, split]);
    }
    // Only where the two inserted points cannot meet or cross.
    if (length <= FORKLIFT_CORNER_BLEND_METRES * 2 + 0.01) return;
    const t = FORKLIFT_CORNER_BLEND_METRES / length;
    dense.push({ x: point.x + dx * t, z: point.z + dz * t });
    dense.push({ x: next.x - dx * t, z: next.z - dz * t });
  });
  return { dense, pivotPairs };
};

/** Ring indices of action vertices that turn enough to be made standing. */
const pivotVertices = (
  points: readonly { readonly x: number; readonly z: number }[],
  actions: readonly ForkliftWaypointAction[]
): Set<number> => {
  const ring = points.length;
  const closing =
    ring > 1 &&
    Math.hypot(points[ring - 1].x - points[0].x, points[ring - 1].z - points[0].z) <= 1e-6;
  const count = closing ? ring - 1 : ring;
  const pivots = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    if (actions[index]?.type === 'none') continue;
    const previous = points[(index - 1 + count) % count];
    const point = points[index];
    const next = points[(index + 1) % count];
    const incoming = Math.atan2(point.x - previous.x, point.z - previous.z);
    const outgoing = Math.atan2(next.x - point.x, next.z - point.z);
    if (Math.abs(shortestVehicleAngle(incoming, outgoing)) >= FORKLIFT_PIVOT_MINIMUM_TURN)
      pivots.add(index);
  }
  return pivots;
};

export function createForkliftRoutePlan(
  points: readonly (readonly [number, number, number])[],
  actions: readonly ForkliftWaypointAction[]
): ForkliftRoutePlan {
  if (points.length !== actions.length) {
    throw new Error(`Forklift route has ${points.length} points but ${actions.length} actions`);
  }
  const planar = points.map(([x, , z]) => ({ x, z }));
  const { dense, pivotPairs } = densifyClosedRoute(planar, pivotVertices(planar, actions));
  const built = createArcLengthPath(dense, true);
  // Each pivot vertex keeps its arrival tangent and its split point the
  // departure tangent, with no curvature at either: the turn between them is
  // a standing pivot, not a curve to steer or slow for.
  const same = (a: RoutePoint, b: RoutePoint) => Math.hypot(a.x - b.x, a.z - b.z) <= 1e-6;
  const lastIndex = built.samples.length - 1;
  const pivots: ForkliftPivotSpan[] = [];
  const path: ArcLengthPath = {
    ...built,
    samples: built.samples.map((sample, index) => {
      for (const [vertex, split] of pivotPairs) {
        if (same(sample, vertex)) {
          const previous = built.samples[index === 0 ? lastIndex - 1 : index - 1];
          const length = Math.hypot(sample.x - previous.x, sample.z - previous.z);
          return {
            ...sample,
            tangentX: (sample.x - previous.x) / length,
            tangentZ: (sample.z - previous.z) / length,
            curvature: 0,
          };
        }
        if (same(sample, split)) {
          const length = Math.hypot(split.x - vertex.x, split.z - vertex.z);
          // The span runs back to the vertex sample just before this one.
          pivots.push({
            start: built.samples[index - 1].distance,
            end: sample.distance,
            heading: Math.atan2(split.x - vertex.x, split.z - vertex.z),
          });
          return {
            ...sample,
            tangentX: (split.x - vertex.x) / length,
            tangentZ: (split.z - vertex.z) / length,
            curvature: 0,
          };
        }
      }
      return sample;
    }),
  };
  const markers = points
    .map((point, index) => ({
      distance: findNearestPathDistance(path, point[0], point[2]),
      action: actions[index],
    }))
    .filter(({ action }) => action.type !== 'none')
    .sort((a, b) => a.distance - b.distance);
  return { path, markers, pivots };
}

export function createInitialForkliftMotion(
  plan: ForkliftRoutePlan,
  position: readonly [number, number, number]
): ForkliftMotionState {
  const routeDistance = findNearestPathDistance(plan.path, position[0], position[2]);
  const sample = sampleArcLengthPath(plan.path, routeDistance);
  return {
    routeDistance,
    speed: 0,
    acceleration: 0,
    heading: Math.atan2(sample.tangentX, sample.tangentZ),
    steeringAngle: 0,
    innerSteeringAngle: 0,
    outerSteeringAngle: 0,
    wheelTravel: 0,
    x: sample.x,
    z: sample.z,
    stopReason: 'none',
  };
}

export function distanceAheadOnClosedPath(
  path: ArcLengthPath,
  fromDistance: number,
  toDistance: number
): number {
  const direct = toDistance - fromDistance;
  return direct >= 0 ? direct : path.totalLength + direct;
}

/**
 * Radius about the forklift origin that covers the vehicle and its load: the
 * pallet's leading edge (1.14 m reach plus half its 0.8 m depth) and the
 * 1.26 m body ends, with 5 cm to spare.
 */
export const FORKLIFT_HOLD_CLEARANCE_METRES = 1.6;

interface PlanarBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const circleMeetsBounds = (x: number, z: number, radius: number, bounds: PlanarBounds) =>
  Math.hypot(
    x - Math.max(bounds.minX, Math.min(x, bounds.maxX)),
    z - Math.max(bounds.minZ, Math.min(z, bounds.maxZ))
  ) < radius;

/**
 * Where a forklift waits for a pickup or dropoff it may not work yet: the last
 * route distance before the marker at which a circle of `clearance` about the
 * origin is clear of every one of `corridors` (the protected pedestrian
 * approaches). A marker whose own circle is clear of them all is its own hold.
 * Working if a forklift waiting for its truck never stands in a dock doorway.
 */
export function forkliftActionHoldDistance(
  plan: ForkliftRoutePlan,
  markerDistance: number,
  corridors: readonly PlanarBounds[],
  clearance: number
): number {
  const total = plan.path.totalLength;
  const blocked = (distance: number) => {
    const sample = sampleArcLengthPath(plan.path, ((distance % total) + total) % total);
    return corridors.some((bounds) => circleMeetsBounds(sample.x, sample.z, clearance, bounds));
  };
  if (!blocked(markerDistance)) return markerDistance;
  const step = 0.05;
  // Never back past the previous action marker: that leg is not this one's approach.
  const previous = plan.markers
    .map(({ distance }) => distance)
    .filter((distance) => Math.abs(distance - markerDistance) > 1e-6)
    .reduce(
      (furthest, distance) =>
        Math.min(furthest, distanceAheadOnClosedPath(plan.path, distance, markerDistance)),
      total
    );
  for (let back = step; back < previous; back += step) {
    if (!blocked(markerDistance - back)) return (((markerDistance - back) % total) + total) % total;
  }
  return markerDistance;
}

/**
 * How far a forklift heading for an action marker may travel, and whether it
 * is held under the logistics interlock. Not permitted, it stops at the hold
 * point `holdLeg` short of the marker; one already past the hold point (the
 * truck left while it drove in) finishes at the marker and waits there.
 */
export function resolveForkliftActionStop({
  distanceToMarker,
  holdLeg,
  permitted,
}: {
  distanceToMarker: number;
  holdLeg: number;
  permitted: boolean;
}): { stopDistance: number; interlocked: boolean } {
  if (permitted) return { stopDistance: distanceToMarker, interlocked: false };
  const stopDistance =
    distanceToMarker >= holdLeg - 0.06 ? Math.max(0, distanceToMarker - holdLeg) : distanceToMarker;
  return { stopDistance, interlocked: stopDistance <= 0.06 };
}

/** The heading the body should hold at a route distance: the departure heading inside a pivot span. */
export const forkliftRouteHeading = (plan: ForkliftRoutePlan, distance: number): number => {
  const total = plan.path.totalLength;
  const wrapped = ((distance % total) + total) % total;
  const pivot = plan.pivots?.find(({ start, end }) => wrapped >= start && wrapped <= end);
  if (pivot) return pivot.heading;
  const sample = sampleArcLengthPath(plan.path, wrapped);
  return Math.atan2(sample.tangentX, sample.tangentZ);
};

/**
 * The fastest speed from which planned braking still meets every curvature
 * limit (lateral acceleration and the yaw rate) between here and a little
 * past the braking distance. A single look-ahead point skipped over short,
 * tight bends: it read curvature 0 a metre beyond a 0.1 m hairpin.
 */
const lookAheadCurvatureSpeedLimit = (
  path: ArcLengthPath,
  from: number,
  state: Pick<ForkliftMotionState, 'speed' | 'acceleration'>,
  limits: LongitudinalMotionLimits
): number => {
  const speed = Math.max(0, state.speed);
  // Braking cannot start at once: the jerk limit first has to wind the
  // current acceleration round to the planned deceleration, and the vehicle
  // covers this much ground meanwhile. Without it an unloaded forklift
  // accelerating out of a pivot met the next corner 0.9 m/s over its limit.
  const reversal =
    (speed * (Math.max(0, state.acceleration) + FORKLIFT_PLANNED_DECELERATION)) /
    Math.max(1e-6, limits.maximumJerk);
  const reach = Math.max(
    0.8,
    (speed * speed) / (2 * FORKLIFT_PLANNED_DECELERATION) + reversal + speed * 0.3
  );
  let limit = limits.maximumForwardSpeed;
  for (let ahead = 0; ahead <= reach + 1e-9; ahead += 0.1) {
    const curvature = Math.abs(sampleArcLengthPath(path, from + ahead).curvature);
    if (curvature <= 1e-5) continue;
    const bendLimit = Math.min(
      Math.sqrt(FORKLIFT_LATERAL_ACCELERATION / curvature),
      FORKLIFT_MAXIMUM_YAW_RATE / curvature
    );
    const brakingRun = Math.max(0, ahead - reversal);
    limit = Math.min(
      limit,
      Math.sqrt(bendLimit * bendLimit + 2 * FORKLIFT_PLANNED_DECELERATION * brakingRun)
    );
  }
  return limit;
};

const stepForkliftMotionOnce = (
  state: ForkliftMotionState,
  plan: ForkliftRoutePlan,
  request: ForkliftMotionRequest
): ForkliftMotionState => {
  const limits = request.loaded ? LOADED_LIMITS : UNLOADED_LIMITS;
  const curvatureSpeedLimit = lookAheadCurvatureSpeedLimit(
    plan.path,
    state.routeDistance,
    state,
    limits
  );
  // Starting from rest facing away from the path (after a standing turn at a
  // pickup or dropoff), pivot first and drive once lined up.
  const mustPivot =
    !request.holdHeading &&
    state.speed <= 0.01 &&
    Math.abs(shortestVehicleAngle(state.heading, forkliftRouteHeading(plan, state.routeDistance))) >
      FORKLIFT_PIVOT_TOLERANCE;
  const requestedSpeed =
    request.stopReason === 'none' && !mustPivot
      ? Math.min(Math.max(0, request.targetSpeed), curvatureSpeedLimit)
      : 0;
  const longitudinal = advanceLongitudinalMotion(
    state,
    requestedSpeed,
    request.deltaSeconds,
    limits
  );
  const unconstrainedTravel = Math.max(0, longitudinal.speed * request.deltaSeconds);
  const maximumTravel = Number.isFinite(request.maximumTravelDistance)
    ? Math.max(0, request.maximumTravelDistance ?? 0)
    : Infinity;
  const travelledDistance = Math.min(unconstrainedTravel, maximumTravel);
  const reachedTravelLimit = travelledDistance + 1e-8 < unconstrainedTravel;
  const routeDistance = (state.routeDistance + travelledDistance) % plan.path.totalLength;
  const sample = sampleArcLengthPath(plan.path, routeDistance);
  const lookAhead = sampleArcLengthPath(
    plan.path,
    routeDistance + Math.max(0.8, longitudinal.speed * 0.7)
  );
  const steering = resolveAckermannSteering(
    lookAhead.curvature,
    FORKLIFT_WHEELBASE_METRES,
    FORKLIFT_REAR_TRACK_METRES,
    FORKLIFT_MAXIMUM_STEERING_RADIANS
  );
  const maximumSteeringChange = FORKLIFT_MAXIMUM_STEERING_RATE * request.deltaSeconds;
  const approachSteering = (current: number, target: number): number =>
    Math.abs(target - current) <= maximumSteeringChange
      ? target
      : current + Math.sign(target - current) * maximumSteeringChange;

  // The body follows the route heading at a bounded yaw rate; standing in a
  // pivot span, that turns it in place towards the departure heading.
  const headingError = shortestVehicleAngle(
    state.heading,
    forkliftRouteHeading(plan, routeDistance)
  );
  const maximumYawChange = FORKLIFT_MAXIMUM_YAW_RATE * request.deltaSeconds;
  const heading = request.holdHeading
    ? state.heading
    : normalizeVehicleAngle(
        state.heading + Math.max(-maximumYawChange, Math.min(maximumYawChange, headingError))
      );

  return {
    routeDistance,
    speed: reachedTravelLimit ? 0 : longitudinal.speed,
    acceleration: reachedTravelLimit ? 0 : longitudinal.acceleration,
    heading,
    steeringAngle: approachSteering(state.steeringAngle, steering.centre),
    innerSteeringAngle: approachSteering(state.innerSteeringAngle, steering.inner),
    outerSteeringAngle: approachSteering(state.outerSteeringAngle, steering.outer),
    wheelTravel: state.wheelTravel + travelledDistance,
    x: sample.x,
    z: sample.z,
    stopReason: request.stopReason,
  };
};

/**
 * Integrate at no more than 60 Hz per kinematic step. A dropped render frame
 * can otherwise feed a 100 to 200 ms impulse into acceleration and steering,
 * producing the visible lurch that makes an autonomous forklift look keyed by
 * hand. Substeps retain render-rate motion while keeping jerk, braking and
 * movement-authority results bounded across common display cadences.
 */
export function stepForkliftMotion(
  state: ForkliftMotionState,
  plan: ForkliftRoutePlan,
  request: ForkliftMotionRequest
): ForkliftMotionState {
  let remainingTime = Math.min(
    FORKLIFT_MAXIMUM_REQUEST_SECONDS,
    Math.max(0, Number.isFinite(request.deltaSeconds) ? request.deltaSeconds : 0)
  );
  if (remainingTime <= 0) return state;

  let current = state;
  let remainingAuthority = Number.isFinite(request.maximumTravelDistance)
    ? Math.max(0, request.maximumTravelDistance ?? 0)
    : undefined;

  while (remainingTime > 1e-9) {
    const deltaSeconds = Math.min(FORKLIFT_MAXIMUM_SUBSTEP_SECONDS, remainingTime);
    const wheelTravelBefore = current.wheelTravel;
    current = stepForkliftMotionOnce(current, plan, {
      ...request,
      deltaSeconds,
      maximumTravelDistance: remainingAuthority,
    });
    if (remainingAuthority !== undefined) {
      remainingAuthority = Math.max(
        0,
        remainingAuthority - Math.max(0, current.wheelTravel - wheelTravelBefore)
      );
    }
    remainingTime -= deltaSeconds;
  }

  return current;
}

/**
 * A complete autonomous load cycle. The visible mast and cargo attachment are
 * driven by explicit phases, so no pallet appears halfway through an unrelated
 * triangular lift.
 *
 * `surfaceHeight` is the fork height at which the pallet rests on the work
 * surface (0 on the floor). At a raised surface (the dock deck) the forks
 * engage and release there instead of at the floor, arrive and leave loaded
 * that much plus `FORKLIFT_PALLET_CLEARANCE` above it, and stay at it after a
 * dropoff, so the tines never pass down through the surface.
 */
export function sampleForkliftLoadPose(
  action: 'pickup' | 'dropoff',
  progress: number,
  maximumHeight: number,
  surfaceHeight = 0
): ForkliftLoadPose {
  const surface = Math.max(0, surfaceHeight);
  const raised = surface > 0;
  const t = clamp01(progress);
  const segments =
    action === 'pickup'
      ? ([
          'aligning',
          'lowering',
          'inserting',
          'engaging',
          'lifting',
          'tilting',
          'retracting',
          'carrying',
        ] as const)
      : (['aligning', 'levelling', 'placing', 'disengaging', 'withdrawing', 'resetting'] as const);
  // `length - Number.EPSILON` rounds back to `length` (EPSILON is relative to
  // 1), so t = 1 used to index past the last phase and report none.
  const scaled = t * segments.length;
  const segmentIndex = Math.min(segments.length - 1, Math.floor(scaled));
  const segmentProgress = smootherstep(scaled - segmentIndex);
  const phase = segments[segmentIndex];

  if (action === 'pickup') {
    const carryHeight = raised
      ? Math.max(Math.min(0.32, maximumHeight), surface + FORKLIFT_PALLET_CLEARANCE)
      : Math.min(0.32, maximumHeight);
    const top = Math.max(maximumHeight, carryHeight);
    const forkHeight =
      phase === 'lifting'
        ? surface + (top - surface) * segmentProgress
        : phase === 'retracting'
          ? top + (carryHeight - top) * segmentProgress
          : phase === 'carrying'
            ? carryHeight
            : phase === 'tilting'
              ? top
              : surface;
    const mastTilt =
      phase === 'tilting'
        ? -0.055 * segmentProgress
        : ['retracting', 'carrying'].includes(phase)
          ? -0.055
          : 0;
    return {
      phase,
      forkHeight,
      mastTilt,
      cargoEngaged: segmentIndex >= 3,
      // Fades in across aligning and lowering, whole by inserting.
      cargoPresence: smootherstep((t * segments.length) / 2),
      operationComplete: t >= 1,
    };
  }

  const initialHeight = raised
    ? Math.max(Math.min(0.32, maximumHeight), surface + FORKLIFT_PALLET_CLEARANCE)
    : Math.min(0.32, maximumHeight);
  const forkHeight =
    phase === 'placing'
      ? initialHeight + (surface - initialHeight) * segmentProgress
      : ['disengaging', 'withdrawing', 'resetting'].includes(phase)
        ? surface
        : initialHeight;
  // Aligning holds the loaded-travel tilt, so the dropoff starts from the pose
  // the mast arrived in instead of popping level and back.
  const mastTilt =
    phase === 'aligning' ? -0.055 : phase === 'levelling' ? -0.055 * (1 - segmentProgress) : 0;
  return {
    phase,
    forkHeight,
    mastTilt,
    cargoEngaged: segmentIndex < 3,
    // On the floor through disengaging and withdrawing, fading while the mast resets.
    cargoPresence: 1 - smootherstep(t * segments.length - (segments.length - 1)),
    operationComplete: t >= 1,
  };
}
