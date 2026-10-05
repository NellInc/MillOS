import type { Vec3Tuple } from '../constants/siteLayout';

export type ForkliftWaypointActionType = 'pickup' | 'dropoff' | 'none';
export type ForkliftOperationPhase = 'traveling' | 'loading' | 'unloading' | 'waiting';

export interface ForkliftWaypointAction {
  readonly type: ForkliftWaypointActionType;
  readonly duration: number;
}

export interface RoundedForkliftRoute {
  readonly path: [number, number, number][];
  readonly actions: ForkliftWaypointAction[];
}

// The planner and the driven fleet must validate exactly the same sampled path.
export const FORKLIFT_CORNER_SETBACK = 2;
export const FORKLIFT_CORNER_SAMPLES = 8;

const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => Math.hypot(b[0] - a[0], b[2] - a[2]);

const normalized2d = (from: Vec3Tuple, to: Vec3Tuple): readonly [number, number] => {
  const length = distance2d(from, to);
  return length > 1e-6 ? [(to[0] - from[0]) / length, (to[2] - from[2]) / length] : [0, 0];
};

const quadraticPoint = (
  entry: Vec3Tuple,
  corner: Vec3Tuple,
  exit: Vec3Tuple,
  t: number
): [number, number, number] => {
  const inverse = 1 - t;
  return [
    inverse * inverse * entry[0] + 2 * inverse * t * corner[0] + t * t * exit[0],
    corner[1],
    inverse * inverse * entry[2] + 2 * inverse * t * corner[2] + t * t * exit[2],
  ];
};

/**
 * Rounds non-operational corners while preserving exact pickup and dropoff poses.
 * The output keeps path and action arrays aligned by construction.
 */
export function createRoundedForkliftRoute(
  path: readonly Vec3Tuple[],
  actions: readonly ForkliftWaypointAction[],
  cornerRadius: number = 2,
  samplesPerCorner: number = 4
): RoundedForkliftRoute {
  if (path.length !== actions.length) {
    throw new Error(`Forklift route has ${path.length} points but ${actions.length} actions`);
  }
  if (path.length < 3) {
    return { path: path.map((point) => [...point]), actions: [...actions] };
  }

  const roundedPath: [number, number, number][] = [];
  const roundedActions: ForkliftWaypointAction[] = [];
  const noAction: ForkliftWaypointAction = { type: 'none', duration: 0 };

  path.forEach((corner, index) => {
    const action = actions[index];
    const previous = path[(index - 1 + path.length) % path.length];
    const next = path[(index + 1) % path.length];
    const incoming = normalized2d(previous, corner);
    const outgoing = normalized2d(corner, next);
    const directionDot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    const isStraight = directionDot > 0.995;
    const canRound =
      action.type === 'none' &&
      !isStraight &&
      distance2d(previous, corner) > 0.5 &&
      distance2d(corner, next) > 0.5;

    if (!canRound) {
      roundedPath.push([...corner]);
      roundedActions.push(action);
      return;
    }

    const radius = Math.min(
      cornerRadius,
      distance2d(previous, corner) * 0.32,
      distance2d(corner, next) * 0.32
    );
    const entry: Vec3Tuple = [
      corner[0] - incoming[0] * radius,
      corner[1],
      corner[2] - incoming[1] * radius,
    ];
    const exit: Vec3Tuple = [
      corner[0] + outgoing[0] * radius,
      corner[1],
      corner[2] + outgoing[1] * radius,
    ];

    for (let sample = 0; sample <= samplesPerCorner; sample++) {
      roundedPath.push(quadraticPoint(entry, corner, exit, sample / samplesPerCorner));
      roundedActions.push(noAction);
    }
  });

  return { path: roundedPath, actions: roundedActions };
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function dampAngle(
  current: number,
  target: number,
  response: number,
  deltaSeconds: number
): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-response * deltaSeconds));
}

/**
 * Converts the shortest signed heading error into a bounded visual steering
 * angle. The route controller remains authoritative for vehicle pose; this
 * value only articulates the steer axle so the wheels agree with the turn.
 */
export function resolveForkliftSteeringAngle(
  currentHeading: number,
  targetHeading: number,
  maximumAngle: number = 0.48
): number {
  if (
    !Number.isFinite(currentHeading) ||
    !Number.isFinite(targetHeading) ||
    !Number.isFinite(maximumAngle) ||
    maximumAngle <= 0
  ) {
    return 0;
  }

  const headingError = Math.atan2(
    Math.sin(targetHeading - currentHeading),
    Math.cos(targetHeading - currentHeading)
  );
  return Math.max(-maximumAngle, Math.min(maximumAngle, headingError));
}

/**
 * Returns the restrained mast pitch for each operational state. Loaded travel
 * uses a small rearward safety tilt, while set-down uses a slight forward
 * presentation. The values stay intentionally subtle so the forks remain
 * credible beside authored racks and pallets.
 */
export function resolveForkliftMastTilt(
  operation: ForkliftOperationPhase,
  hasCargo: boolean
): number {
  if (operation === 'unloading') return 0.025;
  if (operation === 'loading') return 0;
  if (hasCargo && operation === 'traveling') return -0.055;
  if (hasCargo && operation === 'waiting') return -0.04;
  return 0;
}

export function smoothOperationHeight(progress: number, maximumHeight: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  const triangle = clamped < 0.5 ? clamped * 2 : (1 - clamped) * 2;
  const eased = triangle * triangle * (3 - 2 * triangle);
  return maximumHeight * eased;
}

export function isForkliftSimulationPaused(productionSpeed: number, gameSpeed: number): boolean {
  return (
    !Number.isFinite(productionSpeed) ||
    !Number.isFinite(gameSpeed) ||
    productionSpeed <= 0 ||
    gameSpeed <= 0
  );
}

export interface ForkliftLogisticsGate {
  forkliftId: string;
  action: 'pickup' | 'dropoff';
  shippingDocked: boolean;
  receivingDocked: boolean;
  releasedFinishedKg: number;
  dispatchLoadStatus: 'away' | 'loading' | 'held' | 'ready' | 'departed';
}

/**
 * Prevents visual cargo from appearing without a physical source or vanishing
 * into an empty bay. Other forklifts remain unconstrained by dock logistics.
 */
export function canPerformForkliftLogisticsAction(gate: ForkliftLogisticsGate): boolean {
  if (gate.forkliftId === 'forklift-1') {
    if (gate.action === 'pickup') {
      return gate.releasedFinishedKg > 0 && gate.dispatchLoadStatus !== 'ready';
    }
    return gate.shippingDocked && gate.dispatchLoadStatus === 'loading';
  }
  if (gate.forkliftId === 'forklift-2' && gate.action === 'pickup') {
    return gate.receivingDocked;
  }
  return true;
}
