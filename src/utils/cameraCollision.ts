import { createMachineObstacles, type FactoryObstacle } from '../constants/factoryObstacles';
import { SITE_LAYOUT, type SitePortal, type Vec3Tuple } from '../constants/siteLayout';

export interface CameraCollisionResult {
  readonly position: Vec3Tuple;
  readonly collidedWith: string | null;
}

const CAMERA_MIN_HEIGHT = 1.5;
const FACTORY_WALL_HEIGHT = SITE_LAYOUT.factory.bounds.maxY;
const DEFAULT_CLEARANCE = 0.65;
const MACHINE_OBSTACLES = createMachineObstacles(0);

const isInsideExpandedObstacle = (
  point: Vec3Tuple,
  obstacle: FactoryObstacle,
  clearance: number
): boolean =>
  point[0] > obstacle.minX - clearance &&
  point[0] < obstacle.maxX + clearance &&
  point[1] > obstacle.minY - clearance &&
  point[1] < obstacle.maxY + clearance &&
  point[2] > obstacle.minZ - clearance &&
  point[2] < obstacle.maxZ + clearance;

const getSegmentEntry = (
  start: Vec3Tuple,
  end: Vec3Tuple,
  obstacle: FactoryObstacle,
  clearance: number
): number | null => {
  const minimums = [
    obstacle.minX - clearance,
    obstacle.minY - clearance,
    obstacle.minZ - clearance,
  ];
  const maximums = [
    obstacle.maxX + clearance,
    obstacle.maxY + clearance,
    obstacle.maxZ + clearance,
  ];
  let entry = 0;
  let exit = 1;

  for (let axis = 0; axis < 3; axis++) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-8) {
      if (start[axis] < minimums[axis] || start[axis] > maximums[axis]) return null;
      continue;
    }

    const inverseDelta = 1 / delta;
    let near = (minimums[axis] - start[axis]) * inverseDelta;
    let far = (maximums[axis] - start[axis]) * inverseDelta;
    if (near > far) [near, far] = [far, near];
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return null;
  }

  return entry >= 0 && entry <= 1 ? entry : null;
};

const pushOutsideObstacle = (
  point: Vec3Tuple,
  obstacle: FactoryObstacle,
  clearance: number
): Vec3Tuple => {
  const faces = [
    {
      distance: Math.abs(point[0] - (obstacle.minX - clearance)),
      axis: 0,
      value: obstacle.minX - clearance,
    },
    {
      distance: Math.abs(point[0] - (obstacle.maxX + clearance)),
      axis: 0,
      value: obstacle.maxX + clearance,
    },
    {
      distance: Math.abs(point[1] - (obstacle.minY - clearance)),
      axis: 1,
      value: obstacle.minY - clearance,
    },
    {
      distance: Math.abs(point[1] - (obstacle.maxY + clearance)),
      axis: 1,
      value: obstacle.maxY + clearance,
    },
    {
      distance: Math.abs(point[2] - (obstacle.minZ - clearance)),
      axis: 2,
      value: obstacle.minZ - clearance,
    },
    {
      distance: Math.abs(point[2] - (obstacle.maxZ + clearance)),
      axis: 2,
      value: obstacle.maxZ + clearance,
    },
  ] as const;
  const nearest = faces.reduce((best, face) => (face.distance < best.distance ? face : best));
  const result: [number, number, number] = [...point];
  result[nearest.axis] = nearest.value;
  return result;
};

const crossingValue = (
  start: Vec3Tuple,
  end: Vec3Tuple,
  axis: 0 | 2,
  boundary: number,
  otherAxis: 0 | 2
): { other: number; y: number } | null => {
  const startSide = start[axis] - boundary;
  const endSide = end[axis] - boundary;
  if (startSide === 0 || startSide * endSide >= 0) return null;
  const t = (boundary - start[axis]) / (end[axis] - start[axis]);
  return {
    other: start[otherAxis] + (end[otherAxis] - start[otherAxis]) * t,
    y: start[1] + (end[1] - start[1]) * t,
  };
};

const portalContainsCamera = (
  portal: SitePortal,
  otherCoordinate: number,
  y: number,
  clearance: number
): boolean => {
  const lateralCentre = Math.abs(portal.normal[0]) > 0.5 ? portal.centre[2] : portal.centre[0];
  return (
    Math.abs(otherCoordinate - lateralCentre) <= Math.max(0, portal.halfWidth - clearance) &&
    y >= clearance &&
    y <= portal.height - clearance
  );
};

const resolveWallCrossing = (
  previous: Vec3Tuple,
  candidate: Vec3Tuple,
  axis: 0 | 2,
  boundary: number,
  span: readonly [number, number],
  portal: SitePortal,
  clearance: number
): Vec3Tuple | null => {
  const otherAxis = axis === 0 ? 2 : 0;
  const crossing = crossingValue(previous, candidate, axis, boundary, otherAxis);
  if (
    !crossing ||
    crossing.other < span[0] ||
    crossing.other > span[1] ||
    crossing.y > FACTORY_WALL_HEIGHT ||
    portalContainsCamera(portal, crossing.other, crossing.y, clearance)
  ) {
    return null;
  }

  const result: [number, number, number] = [...candidate];
  const previousWasLower = previous[axis] < boundary;
  result[axis] = boundary + (previousWasLower ? -clearance : clearance);
  return result;
};

const resolveWallSlab = (
  point: Vec3Tuple,
  previous: Vec3Tuple,
  axis: 0 | 2,
  boundary: number,
  span: readonly [number, number],
  portal: SitePortal,
  clearance: number
): Vec3Tuple | null => {
  const otherAxis = axis === 0 ? 2 : 0;
  if (
    Math.abs(point[axis] - boundary) >= clearance ||
    point[otherAxis] < span[0] ||
    point[otherAxis] > span[1] ||
    point[1] > FACTORY_WALL_HEIGHT ||
    portalContainsCamera(portal, point[otherAxis], point[1], clearance)
  ) {
    return null;
  }

  const result: [number, number, number] = [...point];
  const reference = Math.abs(previous[axis] - boundary) > 1e-5 ? previous[axis] : point[axis];
  result[axis] = boundary + (reference < boundary ? -clearance : clearance);
  return result;
};

/**
 * Resolves a camera step against the canonical factory shell and machine footprints.
 * It prevents tunnelling through obstacles by testing the whole previous-to-current segment.
 */
export function resolveCameraCollision(
  previous: Vec3Tuple,
  requested: Vec3Tuple,
  clearance: number = DEFAULT_CLEARANCE
): CameraCollisionResult {
  const maxRadius = SITE_LAYOUT.world.radius - clearance;
  const requestedRadius = Math.hypot(requested[0], requested[2]);
  let candidate: Vec3Tuple =
    requestedRadius > maxRadius
      ? [
          (requested[0] / requestedRadius) * maxRadius,
          requested[1],
          (requested[2] / requestedRadius) * maxRadius,
        ]
      : [...requested];
  candidate = [candidate[0], Math.max(CAMERA_MIN_HEIGHT, candidate[1]), candidate[2]];
  let collidedWith: string | null = requestedRadius > maxRadius ? 'world-boundary' : null;

  const factoryBounds = SITE_LAYOUT.factory.bounds;
  const walls = [
    {
      id: 'shipping-wall',
      axis: 2 as const,
      boundary: factoryBounds.maxZ,
      span: [factoryBounds.minX, factoryBounds.maxX] as const,
      portal: SITE_LAYOUT.portals.shipping,
    },
    {
      id: 'receiving-wall',
      axis: 2 as const,
      boundary: factoryBounds.minZ,
      span: [factoryBounds.minX, factoryBounds.maxX] as const,
      portal: SITE_LAYOUT.portals.receiving,
    },
    {
      id: 'east-wall',
      axis: 0 as const,
      boundary: factoryBounds.maxX,
      span: [factoryBounds.minZ, factoryBounds.maxZ] as const,
      portal: SITE_LAYOUT.portals.eastService,
    },
    {
      id: 'west-wall',
      axis: 0 as const,
      boundary: factoryBounds.minX,
      span: [factoryBounds.minZ, factoryBounds.maxZ] as const,
      portal: SITE_LAYOUT.portals.westService,
    },
  ];

  for (const wall of walls) {
    const crossingResolution = resolveWallCrossing(
      previous,
      candidate,
      wall.axis,
      wall.boundary,
      wall.span,
      wall.portal,
      clearance
    );
    const slabResolution =
      crossingResolution ??
      resolveWallSlab(
        candidate,
        previous,
        wall.axis,
        wall.boundary,
        wall.span,
        wall.portal,
        clearance
      );
    if (slabResolution) {
      candidate = slabResolution;
      collidedWith = wall.id;
    }
  }

  let earliestEntry = 1;
  let earliestObstacle: FactoryObstacle | null = null;
  for (const obstacle of MACHINE_OBSTACLES) {
    if (isInsideExpandedObstacle(previous, obstacle, clearance)) continue;
    const entry = getSegmentEntry(previous, candidate, obstacle, clearance);
    if (entry !== null && entry < earliestEntry) {
      earliestEntry = entry;
      earliestObstacle = obstacle;
    }
  }

  if (earliestObstacle) {
    const safeEntry = Math.max(0, earliestEntry - 0.002);
    candidate = [
      previous[0] + (candidate[0] - previous[0]) * safeEntry,
      previous[1] + (candidate[1] - previous[1]) * safeEntry,
      previous[2] + (candidate[2] - previous[2]) * safeEntry,
    ];
    collidedWith = earliestObstacle.id;
  }

  for (const obstacle of MACHINE_OBSTACLES) {
    if (isInsideExpandedObstacle(candidate, obstacle, clearance)) {
      candidate = pushOutsideObstacle(candidate, obstacle, clearance);
      collidedWith = obstacle.id;
    }
  }

  return { position: candidate, collidedWith };
}
