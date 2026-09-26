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

const TRUCK_LIMITS = {
  maximumForwardSpeed: 18,
  maximumReverseSpeed: 1.5,
  maximumAcceleration: 1.4,
  maximumDeceleration: 2.4,
  maximumJerk: 1.6,
} as const;

const SHIPPING_DOCK = SITE_LAYOUT.docks.shipping.bayCentre;
const POSES = {
  tunnelIncoming: { x: 20, z: 238, rotation: Math.PI },
  highway: { x: 20, z: 118, rotation: Math.PI },
  approach: { x: 20, z: 94, rotation: Math.PI },
  turnEnd: { x: -8, z: 78, rotation: 0 },
  straightEnd: { x: 0, z: 84, rotation: 0 },
  positioningEnd: { x: 0, z: 86, rotation: 0 },
  backingEnd: { x: 0, z: 64, rotation: 0 },
  dock: { x: SHIPPING_DOCK[0], z: SHIPPING_DOCK[2], rotation: 0 },
  pullout: { x: 0, z: 80, rotation: 0 },
  exitRoad: { x: 20, z: 108, rotation: 0 },
  acceleratingEnd: { x: 20, z: 165, rotation: 0 },
  tunnelOutgoing: { x: 20, z: 238, rotation: 0 },
} as const satisfies Record<string, PosePoint>;

const cubicPoint = (
  start: VehiclePathPoint,
  controlA: VehiclePathPoint,
  controlB: VehiclePathPoint,
  end: VehiclePathPoint,
  t: number
): VehiclePathPoint => {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse * inverse * t * controlA.x +
      3 * inverse * t * t * controlB.x +
      t ** 3 * end.x,
    z:
      inverse ** 3 * start.z +
      3 * inverse * inverse * t * controlA.z +
      3 * inverse * t * t * controlB.z +
      t ** 3 * end.z,
  };
};

const linePath = (start: VehiclePathPoint, end: VehiclePathPoint): ArcLengthPath =>
  createArcLengthPath([start, end]);

const cubicPath = (
  start: VehiclePathPoint,
  controlA: VehiclePathPoint,
  controlB: VehiclePathPoint,
  end: VehiclePathPoint
): ArcLengthPath =>
  createArcLengthPath(
    Array.from({ length: 65 }, (_, index) => cubicPoint(start, controlA, controlB, end, index / 64))
  );

const PHASE_PATHS: Partial<Record<TruckPhase, ArcLengthPath>> = {
  entering: linePath(POSES.tunnelIncoming, POSES.highway),
  slowing: linePath(POSES.highway, POSES.approach),
  turning_in: cubicPath(POSES.approach, { x: 20, z: 80 }, { x: -8, z: 66 }, POSES.turnEnd),
  straightening: cubicPath(POSES.turnEnd, { x: -8, z: 83 }, { x: 0, z: 80 }, POSES.straightEnd),
  positioning: linePath(POSES.straightEnd, POSES.positioningEnd),
  backing: linePath(POSES.positioningEnd, POSES.backingEnd),
  final_adjustment: linePath(POSES.backingEnd, POSES.dock),
  pulling_out: linePath(POSES.dock, POSES.pullout),
  turning_out: cubicPath(POSES.pullout, { x: 0, z: 97 }, { x: 20, z: 94 }, POSES.exitRoad),
  accelerating: linePath(POSES.exitRoad, POSES.acceleratingEnd),
  leaving: linePath(POSES.acceleratingEnd, POSES.tunnelOutgoing),
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
    trailerYaw:
      Math.abs(shortestVehicleAngle(state.trailerYaw, pose.rotation)) > MAXIMUM_ARTICULATION
        ? pose.rotation
        : state.trailerYaw,
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

const poseFromState = (state: TruckControllerState, safetyHold: boolean): TruckAnimState => {
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
  const braking =
    safetyHold || state.motion.acceleration < -0.35 || state.phase === 'stopping_to_back';
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
    throttle: safetyHold
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
  safetyHold: boolean = false
): TruckAnimState {
  return poseFromState(state, safetyHold);
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
    state = { ...state, motion, steeringAngle: 0 };
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
    const brakingSpeed = endsAtStop
      ? Math.sqrt(Math.max(0, 2 * TRUCK_LIMITS.maximumDeceleration * Math.max(0, remaining - 0.03)))
      : Infinity;
    const targetSpeed = input.safetyHold
      ? 0
      : Math.sign(signedTarget) * Math.min(Math.abs(signedTarget), brakingSpeed);
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
    const maximumSteeringChange = 0.52 * deltaSeconds;
    const steeringDelta = Math.max(
      -maximumSteeringChange,
      Math.min(maximumSteeringChange, steering.centre - state.steeringAngle)
    );
    const steeringAngle = state.steeringAngle + steeringDelta;
    const trailerYaw = integrateTrailerYaw(
      state.trailerYaw,
      tractorYaw,
      motion.speed,
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
