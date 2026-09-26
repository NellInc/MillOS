export interface VehiclePathPoint {
  readonly x: number;
  readonly z: number;
}

export interface ArcLengthPathSample extends VehiclePathPoint {
  readonly distance: number;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly curvature: number;
}

export interface ArcLengthPath {
  readonly samples: readonly ArcLengthPathSample[];
  readonly totalLength: number;
  readonly closed: boolean;
}

export interface LongitudinalMotionState {
  readonly speed: number;
  readonly acceleration: number;
}

export interface LongitudinalMotionLimits {
  readonly maximumForwardSpeed: number;
  readonly maximumReverseSpeed: number;
  readonly maximumAcceleration: number;
  readonly maximumDeceleration: number;
  readonly maximumJerk: number;
}

export interface AckermannSteeringAngles {
  readonly centre: number;
  readonly inner: number;
  readonly outer: number;
}

const EPSILON = 1e-6;

export const normalizeVehicleAngle = (angle: number): number =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

export const shortestVehicleAngle = (from: number, to: number): number =>
  normalizeVehicleAngle(to - from);

const finitePoint = (point: VehiclePathPoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.z);

const pointDistance = (a: VehiclePathPoint, b: VehiclePathPoint): number =>
  Math.hypot(b.x - a.x, b.z - a.z);

const normalizeDistance = (path: ArcLengthPath, distance: number): number => {
  if (!Number.isFinite(distance) || path.totalLength <= EPSILON) return 0;
  if (!path.closed) return Math.max(0, Math.min(path.totalLength, distance));
  return ((distance % path.totalLength) + path.totalLength) % path.totalLength;
};

/**
 * Converts an authored, already-clear route into a distance-addressable path.
 * Consecutive duplicates are removed because a zero-length segment has no
 * tangent and can destabilise steering at an operational stop.
 */
export function createArcLengthPath(
  points: readonly VehiclePathPoint[],
  closed: boolean = false
): ArcLengthPath {
  const clean: VehiclePathPoint[] = [];
  for (const point of points) {
    if (!finitePoint(point)) throw new Error('Vehicle path contains a non-finite point');
    const prior = clean.at(-1);
    if (!prior || pointDistance(prior, point) > EPSILON) clean.push({ x: point.x, z: point.z });
  }

  if (clean.length < 2) throw new Error('Vehicle path requires at least two distinct points');
  if (closed && pointDistance(clean[0], clean.at(-1) ?? clean[0]) > EPSILON) {
    clean.push({ ...clean[0] });
  }

  const distances = [0];
  for (let index = 1; index < clean.length; index += 1) {
    distances.push(distances[index - 1] + pointDistance(clean[index - 1], clean[index]));
  }
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength <= EPSILON) throw new Error('Vehicle path has no measurable length');

  // On a closed path the first sample and the closing duplicate are the same
  // vertex, so both take wrapped neighbours. One-sided ends made the heading
  // snap by the full corner angle at the seam.
  const lastIndex = clean.length - 1;
  const samples = clean.map<ArcLengthPathSample>((point, index) => {
    const atSeam = closed && (index === 0 || index === lastIndex);
    const previous = atSeam ? clean[lastIndex - 1] : clean[Math.max(0, index - 1)];
    const next = atSeam ? clean[1] : clean[Math.min(lastIndex, index + 1)];
    const tangentLength = Math.hypot(next.x - previous.x, next.z - previous.z);
    const tangentX = tangentLength > EPSILON ? (next.x - previous.x) / tangentLength : 0;
    const tangentZ = tangentLength > EPSILON ? (next.z - previous.z) / tangentLength : 1;

    const incomingHeading = Math.atan2(point.x - previous.x, point.z - previous.z);
    const outgoingHeading = Math.atan2(next.x - point.x, next.z - point.z);
    const localLength = Math.max(
      EPSILON,
      0.5 * (pointDistance(previous, point) + pointDistance(point, next))
    );
    const curvature =
      !atSeam && (index === 0 || index === lastIndex)
        ? 0
        : shortestVehicleAngle(incomingHeading, outgoingHeading) / localLength;

    return {
      x: point.x,
      z: point.z,
      distance: distances[index],
      tangentX,
      tangentZ,
      curvature,
    };
  });

  return { samples, totalLength, closed };
}

export function sampleArcLengthPath(
  path: ArcLengthPath,
  requestedDistance: number
): ArcLengthPathSample {
  const distance = normalizeDistance(path, requestedDistance);
  const samples = path.samples;
  if (distance <= 0) return { ...samples[0], distance };
  if (distance >= path.totalLength) return { ...samples.at(-1)!, distance };

  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (samples[middle].distance <= distance) low = middle;
    else high = middle;
  }

  const start = samples[low];
  const end = samples[high];
  const span = Math.max(EPSILON, end.distance - start.distance);
  const t = (distance - start.distance) / span;
  const tangentX = start.tangentX + (end.tangentX - start.tangentX) * t;
  const tangentZ = start.tangentZ + (end.tangentZ - start.tangentZ) * t;
  const tangentLength = Math.hypot(tangentX, tangentZ);

  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    distance,
    tangentX: tangentLength > EPSILON ? tangentX / tangentLength : start.tangentX,
    tangentZ: tangentLength > EPSILON ? tangentZ / tangentLength : start.tangentZ,
    curvature: start.curvature + (end.curvature - start.curvature) * t,
  };
}

export function findNearestPathDistance(path: ArcLengthPath, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  let bestDistanceSquared = Infinity;
  let bestPathDistance = 0;

  for (let index = 1; index < path.samples.length; index += 1) {
    const start = path.samples[index - 1];
    const end = path.samples[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const projection =
      lengthSquared > EPSILON
        ? Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared))
        : 0;
    const projectedX = start.x + dx * projection;
    const projectedZ = start.z + dz * projection;
    const distanceSquared = (x - projectedX) ** 2 + (z - projectedZ) ** 2;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestPathDistance = start.distance + (end.distance - start.distance) * projection;
    }
  }

  return bestPathDistance;
}

export function advanceLongitudinalMotion(
  state: LongitudinalMotionState,
  requestedTargetSpeed: number,
  deltaSeconds: number,
  limits: LongitudinalMotionLimits
): LongitudinalMotionState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state;
  const targetSpeed = Math.max(
    -Math.abs(limits.maximumReverseSpeed),
    Math.min(
      Math.abs(limits.maximumForwardSpeed),
      Number.isFinite(requestedTargetSpeed) ? requestedTargetSpeed : 0
    )
  );
  const speedError = targetSpeed - state.speed;
  const maximumAccelerationChange = Math.abs(limits.maximumJerk) * deltaSeconds;
  if (Math.abs(speedError) <= EPSILON) {
    const acceleration =
      Math.abs(state.acceleration) <= maximumAccelerationChange
        ? 0
        : state.acceleration - Math.sign(state.acceleration) * maximumAccelerationChange;
    return { speed: targetSpeed, acceleration };
  }
  const desiredAcceleration =
    speedError > 0 ? Math.abs(limits.maximumAcceleration) : -Math.abs(limits.maximumDeceleration);
  const accelerationChange = Math.max(
    -maximumAccelerationChange,
    Math.min(maximumAccelerationChange, desiredAcceleration - state.acceleration)
  );
  const acceleration = state.acceleration + accelerationChange;
  const candidateSpeed = state.speed + acceleration * deltaSeconds;
  const crossesTarget =
    (speedError > 0 && candidateSpeed > targetSpeed) ||
    (speedError < 0 && candidateSpeed < targetSpeed);

  if (crossesTarget) {
    const settledAcceleration =
      Math.abs(state.acceleration) <= maximumAccelerationChange
        ? 0
        : state.acceleration - Math.sign(state.acceleration) * maximumAccelerationChange;
    return { speed: targetSpeed, acceleration: settledAcceleration };
  }

  return {
    speed: candidateSpeed,
    acceleration,
  };
}

export function resolveAckermannSteering(
  curvature: number,
  wheelbase: number,
  trackWidth: number,
  maximumAngle: number
): AckermannSteeringAngles {
  if (
    !Number.isFinite(curvature) ||
    !Number.isFinite(wheelbase) ||
    !Number.isFinite(trackWidth) ||
    !Number.isFinite(maximumAngle) ||
    Math.abs(curvature) <= EPSILON ||
    wheelbase <= EPSILON ||
    trackWidth < 0 ||
    maximumAngle <= 0
  ) {
    return { centre: 0, inner: 0, outer: 0 };
  }

  const turnSign = Math.sign(curvature);
  const radius = 1 / Math.abs(curvature);
  const halfTrack = trackWidth * 0.5;
  const innerRadius = Math.max(EPSILON, radius - halfTrack);
  const outerRadius = radius + halfTrack;
  const inner = Math.min(maximumAngle, Math.atan(wheelbase / innerRadius)) * turnSign;
  const outer = Math.min(maximumAngle, Math.atan(wheelbase / outerRadius)) * turnSign;
  const centre = Math.min(maximumAngle, Math.atan(wheelbase / radius)) * turnSign;
  return { centre, inner, outer };
}

export function integrateTrailerYaw(
  trailerYaw: number,
  tractorYaw: number,
  signedSpeed: number,
  trailerAxleDistance: number,
  maximumArticulation: number,
  deltaSeconds: number
): number {
  if (
    !Number.isFinite(trailerYaw) ||
    !Number.isFinite(tractorYaw) ||
    !Number.isFinite(signedSpeed) ||
    !Number.isFinite(deltaSeconds) ||
    trailerAxleDistance <= EPSILON ||
    deltaSeconds <= 0
  ) {
    return Number.isFinite(trailerYaw) ? trailerYaw : 0;
  }

  const articulation = shortestVehicleAngle(trailerYaw, tractorYaw);
  const yawRate = (signedSpeed / trailerAxleDistance) * Math.sin(articulation);
  let nextYaw = normalizeVehicleAngle(trailerYaw + yawRate * deltaSeconds);
  const nextArticulation = shortestVehicleAngle(nextYaw, tractorYaw);
  const limit = Math.abs(maximumArticulation);
  if (limit > 0 && Math.abs(nextArticulation) > limit) {
    nextYaw = normalizeVehicleAngle(tractorYaw - Math.sign(nextArticulation) * limit);
  }
  return nextYaw;
}

export function calculateSignedTravel(
  previous: VehiclePathPoint,
  next: VehiclePathPoint,
  heading: number
): number {
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const distance = Math.hypot(dx, dz);
  return distance * Math.sign(dx * forwardX + dz * forwardZ || 1);
}
