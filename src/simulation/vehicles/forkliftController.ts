import type { ForkliftWaypointAction } from '../forkliftRoute';
import {
  advanceLongitudinalMotion,
  createArcLengthPath,
  findNearestPathDistance,
  resolveAckermannSteering,
  sampleArcLengthPath,
  type ArcLengthPath,
  type LongitudinalMotionLimits,
} from './vehicleKinematics';

export type ForkliftStopReason =
  | 'none'
  | 'simulation-paused'
  | 'emergency-stop'
  | 'route-blocked'
  | 'vehicle-yield'
  | 'crossing-reservation'
  | 'logistics-interlock'
  | 'load-operation';

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

export interface ForkliftRoutePlan {
  readonly path: ArcLengthPath;
  readonly markers: readonly ForkliftRouteMarker[];
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
}

export interface ForkliftLoadPose {
  readonly phase: ForkliftLoadPhase;
  readonly forkHeight: number;
  readonly mastTilt: number;
  readonly cargoEngaged: boolean;
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

const densifyClosedRoute = (
  points: readonly { readonly x: number; readonly z: number }[]
): { x: number; z: number }[] => {
  const ring = points.map(({ x, z }) => ({ x, z }));
  // A closing point that repeats the first would be a zero-length segment.
  const last = ring[ring.length - 1];
  if (ring.length > 1 && Math.hypot(last.x - ring[0].x, last.z - ring[0].z) <= 1e-6) ring.pop();

  const dense: { x: number; z: number }[] = [];
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length];
    dense.push(point);
    const dx = next.x - point.x;
    const dz = next.z - point.z;
    const length = Math.hypot(dx, dz);
    // Only where the two inserted points cannot meet or cross.
    if (length <= FORKLIFT_CORNER_BLEND_METRES * 2 + 0.01) return;
    const t = FORKLIFT_CORNER_BLEND_METRES / length;
    dense.push({ x: point.x + dx * t, z: point.z + dz * t });
    dense.push({ x: next.x - dx * t, z: next.z - dz * t });
  });
  return dense;
};

export function createForkliftRoutePlan(
  points: readonly (readonly [number, number, number])[],
  actions: readonly ForkliftWaypointAction[]
): ForkliftRoutePlan {
  if (points.length !== actions.length) {
    throw new Error(`Forklift route has ${points.length} points but ${actions.length} actions`);
  }
  const path = createArcLengthPath(densifyClosedRoute(points.map(([x, , z]) => ({ x, z }))), true);
  const markers = points
    .map((point, index) => ({
      distance: findNearestPathDistance(path, point[0], point[2]),
      action: actions[index],
    }))
    .filter(({ action }) => action.type !== 'none')
    .sort((a, b) => a.distance - b.distance);
  return { path, markers };
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

const stepForkliftMotionOnce = (
  state: ForkliftMotionState,
  plan: ForkliftRoutePlan,
  request: ForkliftMotionRequest
): ForkliftMotionState => {
  const limits = request.loaded ? LOADED_LIMITS : UNLOADED_LIMITS;
  const lookAheadBeforeStep = sampleArcLengthPath(
    plan.path,
    state.routeDistance + Math.max(0.8, state.speed * 0.7)
  );
  const curvatureSpeedLimit =
    Math.abs(lookAheadBeforeStep.curvature) > 1e-5
      ? Math.sqrt(1.05 / Math.abs(lookAheadBeforeStep.curvature))
      : limits.maximumForwardSpeed;
  const requestedSpeed =
    request.stopReason === 'none'
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

  return {
    routeDistance,
    speed: reachedTravelLimit ? 0 : longitudinal.speed,
    acceleration: reachedTravelLimit ? 0 : longitudinal.acceleration,
    heading: Math.atan2(sample.tangentX, sample.tangentZ),
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
 */
export function sampleForkliftLoadPose(
  action: 'pickup' | 'dropoff',
  progress: number,
  maximumHeight: number
): ForkliftLoadPose {
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
  const scaled = Math.min(segments.length - Number.EPSILON, t * segments.length);
  const segmentIndex = Math.floor(scaled);
  const segmentProgress = smootherstep(scaled - segmentIndex);
  const phase = segments[segmentIndex];

  if (action === 'pickup') {
    const carryHeight = Math.min(0.32, maximumHeight);
    const forkHeight =
      phase === 'lifting'
        ? maximumHeight * segmentProgress
        : phase === 'retracting'
          ? maximumHeight + (carryHeight - maximumHeight) * segmentProgress
          : phase === 'carrying'
            ? carryHeight
            : phase === 'tilting'
              ? maximumHeight
              : 0;
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
      operationComplete: t >= 1,
    };
  }

  const initialHeight = Math.min(0.32, maximumHeight);
  const forkHeight =
    phase === 'placing'
      ? initialHeight * (1 - segmentProgress)
      : ['disengaging', 'withdrawing', 'resetting'].includes(phase)
        ? 0
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
    operationComplete: t >= 1,
  };
}
