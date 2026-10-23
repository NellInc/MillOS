import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  advanceLongitudinalMotion,
  createArcLengthPath,
  integrateTrailerYaw,
  normalizeVehicleAngle,
  resolveAckermannSteering,
  sampleArcLengthPath,
  shortestVehicleAngle,
  type ArcLengthPath,
  type LongitudinalMotionState,
  type VehiclePathPoint,
} from '../../simulation/vehicles/vehicleKinematics';
import type { TruckAnimState, TruckPhase, TruckServicePhase } from './useTruckPhysics';

interface PosePoint extends VehiclePathPoint {
  readonly rotation: number;
}

export interface TruckControllerState {
  readonly dock: 'shipping' | 'receiving';
  readonly active: boolean;
  readonly phase: TruckPhase;
  readonly phaseDistance: number;
  readonly phaseElapsed: number;
  readonly servicePhase: TruckServicePhase;
  readonly serviceElapsed: number;
  readonly motion: LongitudinalMotionState;
  readonly x: number;
  readonly z: number;
  readonly tractorYaw: number;
  readonly trailerYaw: number;
  readonly steeringAngle: number;
  readonly wheelTravel: number;
}

export interface TruckControllerInput {
  readonly deltaSeconds: number;
  readonly arrivalReady: boolean;
  readonly safetyHold: boolean;
  readonly serviceComplete: boolean;
  readonly speedMultiplier: number;
}

export interface TruckControllerResult {
  readonly state: TruckControllerState;
  readonly pose: TruckAnimState;
  readonly phaseChanged: boolean;
  readonly servicePhaseChanged: boolean;
  readonly dockedThisStep: boolean;
  readonly departedThisStep: boolean;
}

const TRUCK_WHEELBASE = 3.8;
const TRUCK_TRACK_WIDTH = 2.05;
const TRAILER_AXLE_DISTANCE = 8.2;
const MAXIMUM_STEERING = 0.55;
const MAXIMUM_ARTICULATION = 0.7;
const FIXED_STEP_LIMIT = 1 / 20;

export const TRUCK_LIMITS = {
  maximumForwardSpeed: 18,
  maximumReverseSpeed: 1.5,
  maximumAcceleration: 1.4,
  maximumDeceleration: 2.4,
  maximumJerk: 1.6,
} as const;

/**
 * Yard turns are authored as true circular arcs joined tangent to straights,
 * so every phase starts on the heading the last one ended with and no point
 * is tighter than its stated radius.
 *
 * TURN_RADIUS: a 3.8 m wheelbase at 0.55 rad of lock turns no tighter than
 * 6.2 m, and an 8.2 m trailer on a circle of radius R settles at an
 * articulation of asin(8.2 / R). 14 m keeps that at 0.62 rad, inside the
 * 0.7 rad coupling limit, so the trailer is never dragged along its stop.
 * Working if the slowest arc still clears the staging block and the yard props
 * on both sides (see the footprint tests in truckController.test.ts).
 */
const TURN_RADIUS = 14;
/** Comfortable lateral acceleration for a laden articulated truck, m/s^2. */
const LATERAL_ACCELERATION_LIMIT = 2;
/** Service braking the speed profile plans with; the hard limit is 2.4 m/s^2. */
const PLANNED_DECELERATION = 1;
/** Braking into a stop mark (the end of positioning, the dock bumper), m/s^2. */
const STOPPING_DECELERATION = 0.5;
const PATH_SAMPLE_SPACING = 0.5;

type PathSegment =
  | { readonly kind: 'line'; readonly length: number }
  /** `turn` is the signed heading change; positive turns towards +x when heading +z. */
  | { readonly kind: 'arc'; readonly radius: number; readonly turn: number };

interface ComposedPath {
  readonly path: ArcLengthPath;
  readonly end: PosePoint;
}

const composePath = (start: PosePoint, segments: readonly PathSegment[]): ComposedPath => {
  const points: VehiclePathPoint[] = [{ x: start.x, z: start.z }];
  let { x, z, rotation: heading } = start;
  for (const segment of segments) {
    const length =
      segment.kind === 'line' ? segment.length : Math.abs(segment.turn) * segment.radius;
    const steps = Math.max(1, Math.ceil(length / PATH_SAMPLE_SPACING));
    const curvature =
      segment.kind === 'arc' ? Math.sign(segment.turn) / Math.max(1e-6, segment.radius) : 0;
    const startX = x;
    const startZ = z;
    const startHeading = heading;
    for (let step = 1; step <= steps; step += 1) {
      const s = (length * step) / steps;
      if (curvature === 0) {
        x = startX + Math.sin(startHeading) * s;
        z = startZ + Math.cos(startHeading) * s;
      } else {
        heading = startHeading + curvature * s;
        x = startX + (Math.cos(startHeading) - Math.cos(heading)) / curvature;
        z = startZ + (Math.sin(heading) - Math.sin(startHeading)) / curvature;
      }
      points.push({ x, z });
    }
  }
  const path = createArcLengthPath(points);
  // createArcLengthPath gives the end samples one-sided chord tangents, half a
  // chord's turn off the true heading. Joined phases then disagree by a full
  // chord's turn at every boundary (0.02-0.04 rad in one step), so the ends
  // carry the exact analytic headings instead.
  const exactTangent = (
    sample: (typeof path.samples)[number],
    sampleHeading: number
  ): (typeof path.samples)[number] => ({
    ...sample,
    tangentX: Math.sin(sampleHeading),
    tangentZ: Math.cos(sampleHeading),
  });
  const last = path.samples.length - 1;
  return {
    path: {
      ...path,
      samples: path.samples.map((sample, index) =>
        index === 0
          ? exactTangent(sample, start.rotation)
          : index === last
            ? exactTangent(sample, heading)
            : sample
      ),
    },
    end: { x, z, rotation: normalizeVehicleAngle(heading) },
  };
};

const linePath = (start: VehiclePathPoint, end: VehiclePathPoint): ArcLengthPath =>
  createArcLengthPath([start, end]);

const SHIPPING_DOCK = SITE_LAYOUT.docks.shipping.bayCentre;
/**
 * The docked truck stops with its rearmost part on the dock bumpers, not at
 * the bay centre: parked at bayCentre (z 61) the trailer's rear sill sat
 * 0.85-1.2 m inside the centre bumper. The bumper face is TruckBay's dock
 * group (z 50) plus the bumper's 0.2 m offset and 0.3 m half-depth; the rear
 * overhang is the further of the two renderers' rearmost parts (the compact
 * trailer's rear bar, 11.76 m behind the tractor origin; the detailed one's
 * underride guard ends at 11.68 m). The receiving dock is the same group
 * turned half a revolution, so one number serves both.
 * Working if a docked trailer's rear sits on, not in, the bumper face.
 */
export const DOCK_BUMPER_FACE_Z = 50.5;
export const TRAILER_REAR_OVERHANG = 11.76;
/** The compact tractor's front plate, ahead of its origin (OptimizedTruckBay, z 4.99 + 0.06). */
export const TRACTOR_FRONT_OVERHANG = 5.05;
const DOCK_POSE: PosePoint = {
  x: SHIPPING_DOCK[0],
  z: DOCK_BUMPER_FACE_Z + TRAILER_REAR_OVERHANG + 0.02,
  rotation: 0,
};
/** The yard road the trucks use in both directions. */
const ROAD_X = 20;
/**
 * Where the arriving truck leaves the road and begins its U-turn. Low enough
 * to keep the reverse short, high enough that the swept outside of the turn
 * stays north of the staging block.
 */
const TURN_IN_Z = 86;
/**
 * The U-turn ends 2R west of the road, past the bay's centreline, and a
 * reverse curve of the same radius brings the truck back onto it. Ending the
 * U-turn on the centreline would need a 10 m radius, whose settled
 * articulation (0.96 rad) is past the coupling limit.
 */
const U_TURN_END_X = ROAD_X - 2 * TURN_RADIUS;
const S_BEND_TURN = Math.acos(1 - (DOCK_POSE.x - U_TURN_END_X) / (2 * TURN_RADIUS));
/** Forward run on the centreline before stopping, which lets the trailer trail into line. */
const POSITIONING_RUN = 4;
const BACKING_END_Z = 64;
/**
 * The departure S-bend: two 45-degree arcs of the turn radius joined by a
 * long diagonal, starting at PULLOUT_Z. It has to thread two yard props, both
 * checked by the footprint test: the weigh-scale booth west of the lane at
 * z 100.5-103.5 (any start past z 86 sweeps it) and the card-reader post
 * 2 m west of the road at z 99-103 in both yards. The trailer runs inside a
 * left turn, so the bend must still be on its diagonal, well west of the
 * post, as it passes; a start before z 82 put the tractor or the trailer
 * through the post. The old 60-degree bend from z 80 swept it on every exit.
 */
const PULLOUT_Z = 84;
const EXIT_TURN = Math.PI / 4;

const SLOWING = composePath({ x: ROAD_X, z: 118, rotation: Math.PI }, [
  { kind: 'line', length: 118 - TURN_IN_Z },
]);
const TURNING_IN = composePath(SLOWING.end, [{ kind: 'arc', radius: TURN_RADIUS, turn: Math.PI }]);
const STRAIGHTENING = composePath(TURNING_IN.end, [
  { kind: 'arc', radius: TURN_RADIUS, turn: S_BEND_TURN },
  { kind: 'arc', radius: TURN_RADIUS, turn: -S_BEND_TURN },
]);
const POSITIONING_END: PosePoint = {
  x: DOCK_POSE.x,
  z: STRAIGHTENING.end.z + POSITIONING_RUN,
  rotation: 0,
};
const BACKING_END: PosePoint = { x: DOCK_POSE.x, z: BACKING_END_Z, rotation: 0 };
const PULLOUT_END: PosePoint = { x: DOCK_POSE.x, z: PULLOUT_Z, rotation: 0 };
const EXIT_STRAIGHT =
  (ROAD_X - DOCK_POSE.x - 2 * TURN_RADIUS * (1 - Math.cos(EXIT_TURN))) / Math.sin(EXIT_TURN);
const TURNING_OUT = composePath(PULLOUT_END, [
  { kind: 'arc', radius: TURN_RADIUS, turn: EXIT_TURN },
  { kind: 'line', length: EXIT_STRAIGHT },
  { kind: 'arc', radius: TURN_RADIUS, turn: -EXIT_TURN },
]);
const ACCELERATING_END: PosePoint = { x: ROAD_X, z: 165, rotation: 0 };

const POSES = {
  tunnelIncoming: { x: ROAD_X, z: 238, rotation: Math.PI },
  highway: { x: ROAD_X, z: 118, rotation: Math.PI },
  positioningEnd: POSITIONING_END,
  dock: DOCK_POSE,
  tunnelOutgoing: { x: ROAD_X, z: 238, rotation: 0 },
} as const satisfies Record<string, PosePoint>;

const PHASE_PATHS: Partial<Record<TruckPhase, ArcLengthPath>> = {
  entering: linePath(POSES.tunnelIncoming, POSES.highway),
  slowing: SLOWING.path,
  turning_in: TURNING_IN.path,
  straightening: STRAIGHTENING.path,
  positioning: linePath(STRAIGHTENING.end, POSITIONING_END),
  backing: linePath(POSITIONING_END, BACKING_END),
  final_adjustment: linePath(BACKING_END, DOCK_POSE),
  pulling_out: linePath(DOCK_POSE, PULLOUT_END),
  turning_out: TURNING_OUT.path,
  accelerating: linePath(TURNING_OUT.end, ACCELERATING_END),
  leaving: linePath(ACCELERATING_END, POSES.tunnelOutgoing),
};

const MOVING_PHASE_TARGET_SPEED: Partial<Record<TruckPhase, number>> = {
  entering: 17,
  slowing: 5,
  turning_in: 5.2,
  straightening: 3.2,
  positioning: 0.8,
  backing: -1.35,
  final_adjustment: -0.45,
  pulling_out: 4.2,
  turning_out: 5.2,
  accelerating: 16,
  leaving: 18,
};

const NEXT_PHASE: Record<TruckPhase, TruckPhase> = {
  entering: 'slowing',
  slowing: 'turning_in',
  turning_in: 'straightening',
  straightening: 'positioning',
  positioning: 'stopping_to_back',
  stopping_to_back: 'backing',
  backing: 'final_adjustment',
  final_adjustment: 'docked',
  docked: 'preparing_to_leave',
  preparing_to_leave: 'pulling_out',
  pulling_out: 'turning_out',
  turning_out: 'accelerating',
  accelerating: 'leaving',
  leaving: 'entering',
};

const SERVICE_ORDER: readonly TruckServicePhase[] = [
  'parking-brake',
  'chocking',
  'dock-locking',
  'leveler-deploying',
  'door-opening',
  'transfer',
  'door-closing',
  'leveler-stowing',
  'dock-unlocking',
  'unchocking',
  'departure-ready',
];

const SERVICE_DURATION: Record<TruckServicePhase, number> = {
  approach: 0,
  'parking-brake': 0.8,
  chocking: 0.9,
  'dock-locking': 0.8,
  'leveler-deploying': 1.2,
  'door-opening': 1.5,
  transfer: 4,
  'door-closing': 1.5,
  'leveler-stowing': 1.2,
  'dock-unlocking': 0.8,
  unchocking: 0.9,
  'departure-ready': 0.6,
};

const isReversePhase = (phase: TruckPhase): boolean => (MOVING_PHASE_TARGET_SPEED[phase] ?? 0) < 0;

interface SpeedProfile {
  readonly distances: readonly number[];
  /** Highest speed magnitude allowed at each path sample. */
  readonly speeds: readonly number[];
}

/**
 * A speed plan for each moving phase: no faster than the phase target, than
 * the lateral-acceleration limit on that sample's curvature, or than a speed
 * from which planned braking can still meet every later limit, including the
 * next phase's when it continues in the same direction. This is what slows a
 * truck off the road before the U-turn instead of carrying road speed into it.
 * Phases that end at a stop keep their own stopping-distance rule below.
 */
const SPEED_PROFILES: Partial<Record<TruckPhase, SpeedProfile>> = {};
const speedProfileFor = (phase: TruckPhase): SpeedProfile | undefined => {
  const cached = SPEED_PROFILES[phase];
  if (cached) return cached;
  const path = PHASE_PATHS[phase];
  const target = MOVING_PHASE_TARGET_SPEED[phase];
  if (!path || target === undefined) return undefined;
  const next = NEXT_PHASE[phase];
  const continues =
    phase !== 'leaving' &&
    PHASE_PATHS[next] !== undefined &&
    isReversePhase(next) === isReversePhase(phase);
  const terminal = continues ? (speedProfileFor(next)?.speeds[0] ?? Infinity) : Infinity;
  const distances = path.samples.map((sample) => sample.distance);
  const speeds = path.samples.map((sample) =>
    Math.min(
      Math.abs(target),
      Math.abs(sample.curvature) > 1e-6
        ? Math.sqrt(LATERAL_ACCELERATION_LIMIT / Math.abs(sample.curvature))
        : Infinity
    )
  );
  speeds[speeds.length - 1] = Math.min(speeds[speeds.length - 1], terminal);
  for (let index = speeds.length - 2; index >= 0; index -= 1) {
    const run = distances[index + 1] - distances[index];
    speeds[index] = Math.min(
      speeds[index],
      Math.sqrt(speeds[index + 1] ** 2 + 2 * PLANNED_DECELERATION * run)
    );
  }
  const profile = { distances, speeds };
  SPEED_PROFILES[phase] = profile;
  return profile;
};

const profiledSpeedLimit = (phase: TruckPhase, distance: number): number => {
  const profile = speedProfileFor(phase);
  if (!profile) return Infinity;
  const { distances, speeds } = profile;
  if (distance <= distances[0]) return speeds[0];
  const last = distances.length - 1;
  if (distance >= distances[last]) return speeds[last];
  let low = 0;
  let high = last;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (distances[middle] <= distance) low = middle;
    else high = middle;
  }
  // Rising limits are interpolated; a falling one follows the planned braking
  // curve into the lower sample. A straight line between two far-apart samples
  // (a 45 m back-in has only two) would start braking at its first metre.
  if (speeds[high] >= speeds[low]) {
    const t = (distance - distances[low]) / Math.max(1e-9, distances[high] - distances[low]);
    return speeds[low] + (speeds[high] - speeds[low]) * t;
  }
  const braking =
    Math.sqrt(speeds[high] ** 2 + 2 * PLANNED_DECELERATION * (distances[high] - distance)) -
    jerkLag(PLANNED_DECELERATION);
  return Math.min(speeds[low], Math.max(speeds[high], braking));
};

/**
 * The speed a jerk-limited truck lags behind a braking curve of `deceleration`:
 * the time it takes to build that deceleration, a / j, at half of it on average.
 * Commanding the curve this far low makes the truck actually ride on it.
 */
const jerkLag = (deceleration: number): number =>
  (deceleration * deceleration) / (2 * TRUCK_LIMITS.maximumJerk);
/** The last centimetres to a stop mark are crept, so a lagged stop can never fall short of it. */
const STOP_CREEP_SPEED = 0.05;

const phaseStartPose = (phase: TruckPhase): PosePoint => {
  const path = PHASE_PATHS[phase];
  if (path) {
    const sample = sampleArcLengthPath(path, 0);
    const reverse = (MOVING_PHASE_TARGET_SPEED[phase] ?? 0) < 0;
    return {
      x: sample.x,
      z: sample.z,
      rotation: normalizeVehicleAngle(
        Math.atan2(sample.tangentX, sample.tangentZ) + (reverse ? Math.PI : 0)
      ),
    };
  }
  if (phase === 'stopping_to_back') return POSES.positioningEnd;
  return POSES.dock;
};

export function createTruckController(
  dock: 'shipping' | 'receiving',
  active: boolean = true,
  phase: TruckPhase = 'entering'
): TruckControllerState {
  const pose = phaseStartPose(phase);
  return {
    dock,
    active,
    phase,
    phaseDistance: 0,
    phaseElapsed: 0,
    servicePhase: phase === 'docked' ? 'parking-brake' : 'approach',
    serviceElapsed: 0,
    motion: { speed: 0, acceleration: 0 },
    x: pose.x,
    z: pose.z,
    tractorYaw: pose.rotation,
    trailerYaw: pose.rotation,
    steeringAngle: 0,
    wheelTravel: 0,
  };
}

const limitArticulation = (trailerYaw: number, tractorYaw: number): number => {
  const articulation = shortestVehicleAngle(tractorYaw, trailerYaw);
  return Math.abs(articulation) > MAXIMUM_ARTICULATION
    ? normalizeVehicleAngle(tractorYaw + Math.sign(articulation) * MAXIMUM_ARTICULATION)
    : trailerYaw;
};

const MAXIMUM_STEERING_RATE = 0.52;

const relaxSteering = (steeringAngle: number, deltaSeconds: number): number => {
  const step = MAXIMUM_STEERING_RATE * deltaSeconds;
  return Math.abs(steeringAngle) <= step ? 0 : steeringAngle - Math.sign(steeringAngle) * step;
};

const transitionPhase = (state: TruckControllerState, phase: TruckPhase): TruckControllerState => {
  const pose = phaseStartPose(phase);
  return {
    ...state,
    phase,
    phaseDistance: 0,
    phaseElapsed: 0,
    servicePhase:
      phase === 'docked'
        ? 'parking-brake'
        : phase === 'pulling_out'
          ? 'approach'
          : state.servicePhase,
    serviceElapsed: 0,
    x: pose.x,
    z: pose.z,
    tractorYaw: pose.rotation,
    // The trailer is a physical body: a phase boundary never moves it. Phases
    // join tangent, so the coupling limit can only bind here by rounding, and
    // then the trailer is held at the limit rather than snapped straight.
    trailerYaw: limitArticulation(state.trailerYaw, pose.rotation),
  };
};

const stepService = (
  state: TruckControllerState,
  deltaSeconds: number,
  serviceComplete: boolean
): TruckControllerState => {
  let serviceElapsed = state.serviceElapsed + deltaSeconds;
  const duration = SERVICE_DURATION[state.servicePhase];
  const canAdvance =
    state.servicePhase !== 'transfer' || (serviceElapsed >= duration && serviceComplete);
  if (serviceElapsed < duration || !canAdvance) return { ...state, serviceElapsed };

  const index = SERVICE_ORDER.indexOf(state.servicePhase);
  if (index < 0 || index >= SERVICE_ORDER.length - 1) {
    return transitionPhase({ ...state, serviceElapsed: 0 }, 'preparing_to_leave');
  }
  serviceElapsed -= duration;
  return {
    ...state,
    servicePhase: SERVICE_ORDER[index + 1],
    serviceElapsed,
  };
};

const serviceProgress = (state: TruckControllerState): number =>
  Math.max(
    0,
    Math.min(1, state.serviceElapsed / Math.max(0.001, SERVICE_DURATION[state.servicePhase]))
  );

/**
 * `safetyHold` is a real hold (e-stop, drill): the truck is brought to a stop
 * and held on its service brake. `frozen` is a paused clock, which freezes the
 * picture and is not a brake application.
 */
const poseFromState = (
  state: TruckControllerState,
  safetyHold: boolean,
  frozen: boolean = false
): TruckAnimState => {
  const serviceT = serviceProgress(state);
  const serviceIndex = SERVICE_ORDER.indexOf(state.servicePhase);
  const atOrAfter = (phase: TruckServicePhase): boolean =>
    serviceIndex >= SERVICE_ORDER.indexOf(phase);
  const before = (phase: TruckServicePhase): boolean => serviceIndex < SERVICE_ORDER.indexOf(phase);
  const doorOpenAmount =
    state.servicePhase === 'door-opening'
      ? serviceT
      : state.servicePhase === 'door-closing'
        ? 1 - serviceT
        : atOrAfter('transfer') && before('door-closing')
          ? 1
          : 0;
  const landingGearAmount =
    state.phase === 'docked' && atOrAfter('chocking') && before('unchocking') ? 1 : 0;
  const parkingBrake = state.phase === 'docked' || state.phase === 'preparing_to_leave';
  const chocksDeployed = state.phase === 'docked' && atOrAfter('chocking') && before('unchocking');
  const dockLocked =
    state.phase === 'docked' && atOrAfter('dock-locking') && before('dock-unlocking');
  const levelerDeployed =
    state.phase === 'docked' && atOrAfter('leveler-deploying') && before('leveler-stowing');
  const speed = state.motion.speed;
  // The trailer is a child of the tractor group, so its visual rotation is the
  // trailer's world yaw relative to the tractor's world yaw.
  const articulation = shortestVehicleAngle(state.tractorYaw, state.trailerYaw);
  const reverse = speed < -0.01;
  // Lit only while actually braking: decelerating, the held stop before
  // reversing, or a safety hold bringing the truck to rest. Never on the parking
  // brake (docked, engine off, or starting up to leave).
  const braking =
    !parkingBrake &&
    (safetyHold || state.motion.acceleration < -0.35 || state.phase === 'stopping_to_back');
  const turningLeft = state.steeringAngle < -0.08;
  const turningRight = state.steeringAngle > 0.08;
  const signalBlink = Math.floor(state.phaseElapsed * 4) % 2 === 0;

  const canonical: TruckAnimState = {
    phase: state.phase,
    x: state.x,
    z: state.z,
    rotation: state.tractorYaw,
    speed,
    steeringAngle: state.steeringAngle,
    brakeLights: braking,
    reverseLights: reverse && !safetyHold,
    leftSignal: !safetyHold && turningLeft && signalBlink,
    rightSignal: !safetyHold && turningRight && signalBlink,
    trailerAngle: articulation,
    cabRoll: Math.max(-0.06, Math.min(0.06, state.steeringAngle * 0.11)),
    cabPitch: Math.max(-0.055, Math.min(0.055, -state.motion.acceleration * 0.025)),
    throttle:
      safetyHold || frozen
        ? 0
        : Math.min(1, Math.abs(speed) / 18 + Math.max(0, state.motion.acceleration) * 0.08),
    doorsOpen: doorOpenAmount > 0.02,
    doorOpenAmount,
    landingGearAmount,
    servicePhase: state.servicePhase,
    active: state.active,
    parkingBrake,
    chocksDeployed,
    dockLocked,
    levelerDeployed,
    articulation,
  };

  if (state.dock === 'shipping') return canonical;
  // The receiving yard is the shipping yard turned half a revolution about the
  // site origin: a rotation, not a mirror. Steering, articulation, cab roll and
  // the indicator sides are all vehicle-relative, so they keep their sign.
  return {
    ...canonical,
    x: -canonical.x,
    z: -canonical.z,
    rotation: normalizeVehicleAngle(canonical.rotation + Math.PI),
  };
};

export function getTruckControllerPose(
  state: TruckControllerState,
  safetyHold: boolean = false,
  frozen: boolean = false
): TruckAnimState {
  return poseFromState(state, safetyHold, frozen);
}

const interpolateScalar = (from: number, to: number, alpha: number): number =>
  from + (to - from) * alpha;

const interpolateAngle = (from: number, to: number, alpha: number): number =>
  normalizeVehicleAngle(from + shortestVehicleAngle(from, to) * alpha);

/**
 * Produces a render-only pose between deterministic 60 Hz controller ticks.
 * Discrete phase and interlock authority comes from the current state while
 * position, articulation, wheel travel and service mechanisms move at the
 * display refresh rate. This removes repeated poses on 90/120/144 Hz displays
 * without making simulation outcomes depend on render cadence.
 */
export function interpolateTruckControllerState(
  previous: TruckControllerState,
  current: TruckControllerState,
  alpha: number
): TruckControllerState {
  const t = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0));
  if (previous.active !== current.active || previous.dock !== current.dock) return current;

  const samePhase = previous.phase === current.phase;
  const sameServicePhase = previous.servicePhase === current.servicePhase;
  return {
    ...current,
    phaseDistance: samePhase
      ? interpolateScalar(previous.phaseDistance, current.phaseDistance, t)
      : current.phaseDistance,
    phaseElapsed: samePhase
      ? interpolateScalar(previous.phaseElapsed, current.phaseElapsed, t)
      : current.phaseElapsed,
    serviceElapsed: sameServicePhase
      ? interpolateScalar(previous.serviceElapsed, current.serviceElapsed, t)
      : current.serviceElapsed,
    motion: {
      speed: interpolateScalar(previous.motion.speed, current.motion.speed, t),
      acceleration: interpolateScalar(previous.motion.acceleration, current.motion.acceleration, t),
    },
    x: interpolateScalar(previous.x, current.x, t),
    z: interpolateScalar(previous.z, current.z, t),
    tractorYaw: interpolateAngle(previous.tractorYaw, current.tractorYaw, t),
    trailerYaw: interpolateAngle(previous.trailerYaw, current.trailerYaw, t),
    steeringAngle: interpolateScalar(previous.steeringAngle, current.steeringAngle, t),
    wheelTravel: interpolateScalar(previous.wheelTravel, current.wheelTravel, t),
  };
}

export function stepTruckController(
  prior: TruckControllerState,
  input: TruckControllerInput
): TruckControllerResult {
  const deltaSeconds = Math.max(0, Math.min(FIXED_STEP_LIMIT, input.deltaSeconds));
  if (!prior.active) {
    const state = input.arrivalReady ? createTruckController(prior.dock, true) : prior;
    return {
      state,
      pose: poseFromState(state, input.safetyHold),
      phaseChanged: state.phase !== prior.phase,
      servicePhaseChanged: false,
      dockedThisStep: false,
      departedThisStep: false,
    };
  }

  let state: TruckControllerState = {
    ...prior,
    phaseElapsed: prior.phaseElapsed + deltaSeconds,
  };
  const priorPhase = prior.phase;
  const priorServicePhase = prior.servicePhase;

  if (state.phase === 'docked') {
    state = {
      // A safety hold (e-stop, drill) freezes dock service mid-step as well as motion.
      ...stepService(state, input.safetyHold ? 0 : deltaSeconds, input.serviceComplete),
      motion: { speed: 0, acceleration: 0 },
      x: POSES.dock.x,
      z: POSES.dock.z,
      tractorYaw: POSES.dock.rotation,
      steeringAngle: 0,
    };
  } else if (state.phase === 'stopping_to_back' || state.phase === 'preparing_to_leave') {
    const motion = advanceLongitudinalMotion(state.motion, 0, deltaSeconds, TRUCK_LIMITS);
    // The wheels come back to centre at the steering rate, not in one step.
    state = { ...state, motion, steeringAngle: relaxSteering(state.steeringAngle, deltaSeconds) };
    const wait = state.phase === 'stopping_to_back' ? 1 : 2;
    if (!input.safetyHold && Math.abs(motion.speed) < 0.01 && state.phaseElapsed >= wait) {
      state = transitionPhase(state, NEXT_PHASE[state.phase]);
    }
  } else {
    const path = PHASE_PATHS[state.phase];
    if (!path) throw new Error(`Truck phase ${state.phase} has no movement path`);
    const signedTarget =
      (MOVING_PHASE_TARGET_SPEED[state.phase] ?? 0) * Math.max(0, input.speedMultiplier);
    const remaining = Math.max(0, path.totalLength - state.phaseDistance);
    const endsAtStop = state.phase === 'positioning' || state.phase === 'final_adjustment';
    // Planned at a gentle rate: the jerk limit cannot follow a 2.4 m/s^2
    // stopping curve, so the truck used to reach its stop mark still rolling
    // at 0.8 m/s and halt in one step (and touch the dock bumper at 0.44).
    const brakingSpeed = endsAtStop
      ? Math.max(
          STOP_CREEP_SPEED,
          Math.sqrt(2 * STOPPING_DECELERATION * Math.max(0, remaining - 0.03)) -
            jerkLag(STOPPING_DECELERATION)
        )
      : Infinity;
    const targetSpeed = input.safetyHold
      ? 0
      : Math.sign(signedTarget) *
        Math.min(
          Math.abs(signedTarget),
          brakingSpeed,
          profiledSpeedLimit(state.phase, state.phaseDistance)
        );
    const motion = advanceLongitudinalMotion(state.motion, targetSpeed, deltaSeconds, TRUCK_LIMITS);
    const travel = Math.min(remaining, Math.abs(motion.speed) * deltaSeconds);
    const phaseDistance = state.phaseDistance + travel;
    const sample = sampleArcLengthPath(path, phaseDistance);
    const reverse = signedTarget < 0;
    const tractorYaw = normalizeVehicleAngle(
      Math.atan2(sample.tangentX, sample.tangentZ) + (reverse ? Math.PI : 0)
    );
    const steering = resolveAckermannSteering(
      sample.curvature * (reverse ? -1 : 1),
      TRUCK_WHEELBASE,
      TRUCK_TRACK_WIDTH,
      MAXIMUM_STEERING
    );
    const maximumSteeringChange = MAXIMUM_STEERING_RATE * deltaSeconds;
    const steeringDelta = Math.max(
      -maximumSteeringChange,
      Math.min(maximumSteeringChange, steering.centre - state.steeringAngle)
    );
    const steeringAngle = state.steeringAngle + steeringDelta;
    // Reversing, a passive trailer is unstable: any articulation grows, and a
    // 45 m back-in would fold it onto the coupling stop. A driver backing in
    // steers the cab to keep the trailer on line, which this models as the
    // trailer trailing back into line at the rate it would going forward.
    const trailerYaw = integrateTrailerYaw(
      state.trailerYaw,
      tractorYaw,
      reverse ? Math.abs(motion.speed) : motion.speed,
      TRAILER_AXLE_DISTANCE,
      MAXIMUM_ARTICULATION,
      deltaSeconds
    );
    state = {
      ...state,
      phaseDistance,
      motion: travel >= remaining && endsAtStop ? { speed: 0, acceleration: 0 } : motion,
      x: sample.x,
      z: sample.z,
      tractorYaw,
      trailerYaw,
      steeringAngle,
      wheelTravel: state.wheelTravel + Math.sign(motion.speed || signedTarget || 1) * travel,
    };

    if (remaining <= 0.03 || travel >= remaining - 1e-8) {
      if (state.phase === 'leaving') {
        state = { ...state, active: false, motion: { speed: 0, acceleration: 0 } };
      } else if (!input.safetyHold) {
        state = transitionPhase(state, NEXT_PHASE[state.phase]);
      }
    }
  }

  const phaseChanged = state.phase !== priorPhase;
  const servicePhaseChanged = state.servicePhase !== priorServicePhase;
  return {
    state,
    pose: poseFromState(state, input.safetyHold),
    phaseChanged,
    servicePhaseChanged,
    dockedThisStep: phaseChanged && state.phase === 'docked',
    departedThisStep: prior.active && !state.active,
  };
}
