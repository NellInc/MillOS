import {
  SITE_LAYOUT,
  boundsOverlapXZ,
  getServiceAssetBounds,
  routeIntersectsBoundsXZ,
  type SiteBounds,
  type Vec3Tuple,
  type VehicleRouteAnchor,
} from '../constants/siteLayout';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../constants/factoryObstacles';
import { STAGING_LAYOUT } from '../components/truckbay/palletStagingLayout';
import { DOCK_DECK_FORK_HEIGHT } from '../constants/dockLoading';
import {
  createRoundedForkliftRoute,
  FORKLIFT_CORNER_SETBACK,
  FORKLIFT_CORNER_SAMPLES,
  type ForkliftWaypointAction,
} from './forkliftRoute';
import type { SpoutMachine } from '../components/flow/spoutRoutes';
import type { ConveyorSegment, MachineBuffer } from '../stores/materialFlowStore';
import type { Obstacle } from '../utils/positionRegistry';
import { canonicalProcessMachines } from './materialTransport';
import { translate } from '../i18n';
import { layoutPlanningMessages } from './layoutPlanning.messages';

export type Dock = 'shipping' | 'receiving';
export type PlanningBounds = Pick<SiteBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
export const PLANNING_DOCKS: readonly Dock[] = ['shipping', 'receiving'];
export const PLANNING_VIEW = { minX: -52, maxX: 78, minZ: -98, maxZ: 98 };

export interface LogisticsProposal {
  routes: Record<Dock, Vec3Tuple[]>;
  staging: Record<Dock, Vec3Tuple>;
}
export interface PlanningAssumptions {
  tripsPerHour: Record<Dock, number>;
  weights: { travel: number; handling: number; crossing: number };
  crossingDelaySeconds: number;
}
export const DEFAULT_PLANNING_ASSUMPTIONS: PlanningAssumptions = {
  tripsPerHour: { shipping: 8, receiving: 4 },
  weights: { travel: 1, handling: 1, crossing: 2 },
  crossingDelaySeconds: 4,
};
export interface LayoutSnapshot {
  layoutRevision?: number;
  capturedAt: string;
  simulationTime: number;
  machines: SpoutMachine[];
  segments: ConveyorSegment[];
  buffers: MachineBuffer[];
  obstacles: Obstacle[];
  packerKgPerSecond: number;
}
export interface LayoutScore {
  feasible: boolean;
  violations: string[];
  weightedCost: number;
  travelMetresPerHour: number;
  handlingMetresPerHour: number;
  crossingsPerHour: number;
  routes: Record<Dock, { length: number; cycleSeconds: number; crossings: number }>;
}

export function currentLogisticsLayout(): LogisticsProposal {
  return {
    routes: {
      shipping: SITE_LAYOUT.routes.forklifts.shipping.points.map((point) => [...point]),
      receiving: SITE_LAYOUT.routes.forklifts.receiving.points.map((point) => [...point]),
    },
    staging: {
      shipping: [...STAGING_LAYOUT.shippingOrigin],
      receiving: [...STAGING_LAYOUT.receivingOrigin],
    },
  };
}

export function planningObstacles(
  machines: readonly SpoutMachine[] = canonicalProcessMachines()
): Obstacle[] {
  return [
    ...createMachineObstacles(1, machines),
    ...createConveyorObstacles(),
    ...DOCK_PLATFORM_OBSTACLES,
    ...Object.values(SITE_LAYOUT.serviceYard).map((asset) => ({
      id: asset.id,
      ...getServiceAssetBounds(asset),
    })),
  ];
}

export function capturedPlanningObstacles(
  machines: readonly SpoutMachine[],
  registered: readonly Obstacle[]
): Obstacle[] {
  const ids = [...canonicalProcessMachines(), ...machines].map((m) => m.id);
  return [
    ...planningObstacles(machines),
    ...registered.filter((o) => !ids.some((id) => o.id === id || o.id.startsWith(`${id}-`))),
  ];
}

/** Reserve the complete existing capacity, even when the current queue is empty. */
export function stagingBounds(dock: Dock, origin: Vec3Tuple): PlanningBounds {
  return dock === 'shipping'
    ? {
        minX: origin[0] - 1,
        maxX: origin[0] + (STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX + 1,
        minZ: origin[2] - (STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ - 1,
        maxZ: origin[2] + 1,
      }
    : {
        minX: origin[0] - 1,
        maxX: origin[0] + STAGING_LAYOUT.pitchX + 1,
        minZ: origin[2] - 1,
        maxZ: origin[2] + 1,
      };
}

/** Dedicated 3 m pedestrian approaches at docks; full service-exit approaches.
 * Working if a fixed staging proposal cannot occupy these protected corridors.
 * Vehicle crossings remain transient conflicts, never an evacuation certificate.
 */
export function protectedEgressApproaches(): Array<PlanningBounds & { id: string }> {
  return Object.values(SITE_LAYOUT.portals).map((portal) => {
    const [x, , z] = portal.centre;
    const depth = portal.transitionDepth;
    const width = portal.id.endsWith('service') ? portal.halfWidth : 1.5;
    return portal.normal[0] !== 0
      ? { id: portal.id, minX: x - depth, maxX: x + depth, minZ: z - width, maxZ: z + width }
      : { id: portal.id, minX: x - width, maxX: x + width, minZ: z - depth, maxZ: z + depth };
  });
}

/**
 * Route vertices that are pickups and dropoffs, and which of them is worked
 * at the dock deck (the trailer's tail) rather than on the floor. Shipping
 * loads its trailer; receiving unloads its own.
 */
const ROUTE_ACTION_VERTICES: Record<
  Dock,
  { pickup: number; dropoff: number; atDock: 'pickup' | 'dropoff' }
> = {
  shipping: { pickup: 0, dropoff: 4, atDock: 'dropoff' },
  receiving: { pickup: 4, dropoff: 8, atDock: 'pickup' },
};

export function planningRouteActions(dock: Dock): ForkliftWaypointAction[] {
  const vertices = ROUTE_ACTION_VERTICES[dock];
  return SITE_LAYOUT.routes.forklifts[dock].points.map((_, index) => {
    const type =
      index === vertices.pickup ? 'pickup' : index === vertices.dropoff ? 'dropoff' : 'none';
    if (type === 'none') return { type, duration: 0 };
    return {
      type,
      duration: type === 'pickup' ? 7 : 6,
      ...(type === vertices.atDock ? { surfaceForkHeight: DOCK_DECK_FORK_HEIGHT } : {}),
    };
  });
}

/** Freeze operational poses and both approach legs. Edits only affect travel corners. */
export function isEditableRoutePoint(dock: Dock, index: number): boolean {
  const actions = planningRouteActions(dock);
  const points = SITE_LAYOUT.routes.forklifts[dock].points;
  // Shipping repeats its pickup at the closing vertex. Its predecessor
  // remains the incoming pickup approach despite the repeat's empty action.
  if (index === points.length - 2 && distance(points[0], points[points.length - 1]) < 1e-6)
    return false;
  // The first vertex is where the fleet starts its vehicle: it and the legs
  // either side stay fixed, so an apply can always find the vehicle's leg.
  if (index === 0 || index === 1) return false;
  return (
    [index, (index + 1) % actions.length, (index - 1 + actions.length) % actions.length].every(
      (i) => actions[i].type === 'none'
    ) && index !== actions.length - 1
  );
}

export function roundedPlanningRoute(dock: Dock, points: readonly Vec3Tuple[]): VehicleRouteAnchor {
  return {
    ...SITE_LAYOUT.routes.forklifts[dock],
    points: createRoundedForkliftRoute(
      points,
      planningRouteActions(dock),
      FORKLIFT_CORNER_SETBACK,
      FORKLIFT_CORNER_SAMPLES
    ).path,
  };
}

/** Geometry-only handling-capacity assumption, calibrated to the incumbent dock.
 * Working if scoring weights cannot award production and quality/stock caps still apply.
 */
const loadingRatios = new WeakMap<LogisticsProposal, number>();
export function logisticsLoadingRate(proposal: LogisticsProposal, canonicalRate = 400): number {
  const cached = loadingRatios.get(proposal);
  if (cached !== undefined) return canonicalRate * cached;
  const serviceSeconds = (layout: LogisticsProposal) => {
    const score = scoreLogisticsLayout(layout, DEFAULT_PLANNING_ASSUMPTIONS, []);
    const stage = stagingBounds('shipping', layout.staging.shipping);
    const stop = layout.routes.shipping[4];
    const handling =
      Math.abs((stage.minX + stage.maxX) / 2 - stop[0]) +
      Math.abs((stage.minZ + stage.maxZ) / 2 - stop[2]);
    return score.routes.shipping.cycleSeconds + (2 * handling) / 1.8;
  };
  const ratio = serviceSeconds(currentLogisticsLayout()) / serviceSeconds(proposal);
  const bounded = Number.isFinite(ratio) && ratio > 0 ? Math.max(0.25, Math.min(2, ratio)) : 0;
  loadingRatios.set(proposal, bounded);
  return canonicalRate * bounded;
}

const distance = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const inside = (inner: PlanningBounds, outer: PlanningBounds) =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minZ >= outer.minZ &&
  inner.maxZ <= outer.maxZ;
const samePoint = (a: Vec3Tuple, b: Vec3Tuple) => a.every((v, i) => v === b[i]);
const overlaps = (a: PlanningBounds, b: PlanningBounds) =>
  boundsOverlapXZ({ ...a, minY: 0, maxY: 3 }, { ...b, minY: 0, maxY: 3 });

/** Minimum analytic curvature radius of the controller's quadratic corners.
 * This preserves the incumbent turn envelope, rather than claiming a vehicle specification.
 */
export function minimumRoundedTurnRadius(dock: Dock, points: readonly Vec3Tuple[]): number {
  let minimum = Infinity;
  const actions = planningRouteActions(dock);
  points.forEach((corner, index) => {
    if (actions[index].type !== 'none') return;
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incomingLength = distance(previous, corner),
      outgoingLength = distance(corner, next);
    if (incomingLength < 1e-6 || outgoingLength < 1e-6) return; // Repeated closing vertex.
    const incoming = [
      (corner[0] - previous[0]) / incomingLength,
      (corner[2] - previous[2]) / incomingLength,
    ];
    const outgoing = [
      (next[0] - corner[0]) / outgoingLength,
      (next[2] - corner[2]) / outgoingLength,
    ];
    const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    if (dot > 0.995) return;
    if (incomingLength <= 0.5 || outgoingLength <= 0.5) {
      minimum = 0; // The controller leaves this bend sharp instead of rounding it.
      return;
    }
    const setback = Math.min(2, incomingLength * 0.32, outgoingLength * 0.32);
    const ax = incoming[0] * setback,
      az = incoming[1] * setback;
    const bx = outgoing[0] * setback,
      bz = outgoing[1] * setback;
    const dx = bx - ax,
      dz = bz - az;
    const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / (dx * dx + dz * dz)));
    const cross = Math.abs(ax * bz - az * bx);
    const radius = cross < 1e-9 ? 0 : (2 * Math.hypot(ax + t * dx, az + t * dz) ** 3) / cross;
    minimum = Math.min(minimum, radius);
  });
  return minimum;
}

export function scoreLogisticsLayout(
  proposal: LogisticsProposal,
  assumptions: PlanningAssumptions,
  obstacles: readonly Obstacle[] = planningObstacles()
): LayoutScore {
  const violations: string[] = [];
  const routes = {} as LayoutScore['routes'];
  let travelMetresPerHour = 0,
    handlingMetresPerHour = 0,
    crossingsPerHour = 0;
  const values = [
    ...Object.values(assumptions.tripsPerHour),
    ...Object.values(assumptions.weights),
    assumptions.crossingDelaySeconds,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 10000))
    violations.push(translate(layoutPlanningMessages, 'assumptionsRange'));
  for (const dock of PLANNING_DOCKS) {
    const dockName = translate(layoutPlanningMessages, 'dock', { value: dock });
    const points = proposal.routes[dock];
    const baseline = SITE_LAYOUT.routes.forklifts[dock].points;
    const origin = proposal.staging[dock];
    const valid =
      points.length === baseline.length &&
      points.every(
        (point) => point.length === 3 && point.every(Number.isFinite) && point[1] === 0
      ) &&
      origin.every(Number.isFinite) &&
      origin[1] === 0;
    if (!valid) {
      violations.push(translate(layoutPlanningMessages, 'invalidCoordinates', { dock: dockName }));
      routes[dock] = { length: 0, cycleSeconds: 0, crossings: 0 };
      continue;
    }
    points.forEach((point, index) => {
      if (!isEditableRoutePoint(dock, index) && !samePoint(point, baseline[index]))
        violations.push(translate(layoutPlanningMessages, 'fixedPoses', { dock: dockName }));
      if (index > 0 && distance(points[index - 1], point) < 0.05)
        violations.push(translate(layoutPlanningMessages, 'shortLeg', { dock: dockName }));
    });
    if (minimumRoundedTurnRadius(dock, points) + 1e-6 < minimumRoundedTurnRadius(dock, baseline))
      violations.push(translate(layoutPlanningMessages, 'tighterCorners', { dock: dockName }));
    const route = roundedPlanningRoute(dock, points);
    const width = route.halfWidth + 0.1; // Conservative envelope plus curve-sampling margin.
    if (
      route.points.some(
        ([x, , z]) =>
          x - width < SITE_LAYOUT.factory.bounds.minX ||
          x + width > SITE_LAYOUT.factory.bounds.maxX ||
          z - width < -50 ||
          z + width > 50
      )
    )
      violations.push(translate(layoutPlanningMessages, 'leavesFloor', { dock: dockName }));
    for (const obstacle of obstacles) {
      if ((obstacle.minY ?? 0) > 3) continue;
      if (routeIntersectsBoundsXZ(route, obstacle, 0.1))
        violations.push(
          translate(layoutPlanningMessages, 'routeMeets', { dock: dockName, obstacle: obstacle.id })
        );
    }
    const stage = stagingBounds(dock, origin);
    if (!inside(stage, SITE_LAYOUT.docks[dock].apron))
      violations.push(translate(layoutPlanningMessages, 'stagingLeavesApron', { dock: dockName }));
    for (const obstacle of obstacles)
      if (overlaps(stage, obstacle))
        violations.push(
          translate(layoutPlanningMessages, 'stagingMeets', {
            dock: dockName,
            obstacle: obstacle.id,
          })
        );
    for (const egress of protectedEgressApproaches())
      if (overlaps(stage, egress))
        violations.push(
          translate(layoutPlanningMessages, 'stagingBlocksEgress', {
            dock: dockName,
            egress: egress.id,
          })
        );
    for (const other of PLANNING_DOCKS) {
      const otherPoints = proposal.routes[other];
      if (
        otherPoints.length === SITE_LAYOUT.routes.forklifts[other].points.length &&
        otherPoints.every((point) => point.every(Number.isFinite))
      ) {
        if (routeIntersectsBoundsXZ(roundedPlanningRoute(other, otherPoints), stage, 0.1))
          violations.push(
            translate(layoutPlanningMessages, 'stagingBlocksCorridor', {
              dock: dockName,
              other: translate(layoutPlanningMessages, 'dock', { value: other }),
            })
          );
      }
    }
    let length = 0;
    route.points.forEach((point, i) => {
      length += distance(point, route.points[(i + 1) % route.points.length]);
    });
    const hazards = Object.values(SITE_LAYOUT.routeHazards).filter(
      ({ type }) => type === 'intersection'
    );
    const crossings = hazards.filter(({ bounds }) => routeIntersectsBoundsXZ(route, bounds)).length;
    const trips = assumptions.tripsPerHour[dock];
    const actionIndex = ROUTE_ACTION_VERTICES[dock][ROUTE_ACTION_VERTICES[dock].atDock];
    const centre: Vec3Tuple = [(stage.minX + stage.maxX) / 2, 0, (stage.minZ + stage.maxZ) / 2];
    // Rectilinear handling distance, rather than a shortcut through a platform.
    const destination = points[actionIndex];
    const handling = Math.abs(centre[0] - destination[0]) + Math.abs(centre[2] - destination[2]);
    routes[dock] = {
      length,
      cycleSeconds: length / 1.8 + 13 + crossings * assumptions.crossingDelaySeconds,
      crossings,
    };
    travelMetresPerHour += length * trips;
    handlingMetresPerHour += handling * 2 * trips;
    crossingsPerHour += crossings * trips;
  }
  const uniqueViolations = [...new Set(violations)];
  return {
    feasible: uniqueViolations.length === 0,
    violations: uniqueViolations,
    travelMetresPerHour,
    handlingMetresPerHour,
    crossingsPerHour,
    routes,
    weightedCost: uniqueViolations.length
      ? Infinity
      : assumptions.weights.travel * travelMetresPerHour +
        assumptions.weights.handling * handlingMetresPerHour +
        assumptions.weights.crossing * crossingsPerHour * assumptions.crossingDelaySeconds * 1.8,
  };
}

/** Bounded deterministic neighborhood search, no server or stochastic promise. */
export function optimizeLogisticsLayout(
  initial: LogisticsProposal,
  assumptions: PlanningAssumptions,
  obstacles: readonly Obstacle[]
): { proposal: LogisticsProposal; evaluations: number; improved: boolean } {
  let best = structuredClone(initial);
  let score = scoreLogisticsLayout(best, assumptions, obstacles);
  let evaluations = 1;
  for (const dock of PLANNING_DOCKS) {
    const apron = SITE_LAYOUT.docks[dock].apron;
    for (let x = apron.minX + 1; x <= apron.maxX - 1; x += 2) {
      for (let z = apron.minZ + 1; z <= apron.maxZ - 1; z += 2) {
        const candidate = { ...best, staging: { ...best.staging, [dock]: [x, 0, z] as Vec3Tuple } };
        const candidateScore = scoreLogisticsLayout(candidate, assumptions, obstacles);
        evaluations++;
        if (candidateScore.feasible && candidateScore.weightedCost < score.weightedCost) {
          best = candidate;
          score = candidateScore;
        }
      }
    }
    for (let index = 0; index < best.routes[dock].length; index++) {
      if (!isEditableRoutePoint(dock, index)) continue;
      const point = best.routes[dock][index];
      for (const dx of [-2, 0, 2])
        for (const dz of [-2, 0, 2]) {
          const candidate = structuredClone(best);
          candidate.routes[dock][index] = [point[0] + dx, 0, point[2] + dz];
          const candidateScore = scoreLogisticsLayout(candidate, assumptions, obstacles);
          evaluations++;
          if (candidateScore.feasible && candidateScore.weightedCost < score.weightedCost) {
            best = candidate;
            score = candidateScore;
          }
        }
    }
  }
  return {
    proposal: best,
    evaluations,
    improved:
      score.weightedCost < scoreLogisticsLayout(initial, assumptions, obstacles).weightedCost,
  };
}

export function planningQueueSummary(buffers: readonly MachineBuffer[]) {
  return buffers
    .map((buffer) => ({
      id: buffer.machineId,
      inputKg: buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0),
      outputKg: buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0),
      utilization: Math.max(
        buffer.inputBuffer.reduce((sum, m) => sum + m.amount, 0) /
          Math.max(1, buffer.inputCapacity),
        buffer.outputBuffer.reduce((sum, m) => sum + m.amount, 0) /
          Math.max(1, buffer.outputCapacity)
      ),
    }))
    .sort((a, b) => b.utilization - a.utilization);
}
