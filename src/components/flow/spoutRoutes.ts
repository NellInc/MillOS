/**
 * Spouting route topology.
 *
 * WHY THIS MODULE EXISTS: the pipe curves used to be built inside
 * `SpoutingSystem`'s `useMemo` and thrown away as soon as `TubeGeometry` had
 * consumed them. `GrainFlow` therefore had no idea where the pipes were and
 * dropped its particles down a hardcoded slab of empty air beside them. Both
 * consumers now read the same curves from here:
 *
 *   - `SpoutingSystem` extrudes them into tube geometry (and owns disposal of
 *     that geometry - this module never creates or holds GPU resources).
 *   - `GrainFlow` samples `curve.getPointAt(t)` to keep product inside the bore.
 *
 * The result is cached on the same machine key `SpoutingSystem` already used,
 * so a machine STATUS change (which ticks constantly) does not rebuild curves
 * or thrash `mergeGeometries`.
 */

import * as THREE from 'three';
import {
  SIFTER_LAYOUT,
  MILL_PROCESS_PORTS,
  PACKER_HOPPER_LAYOUT,
  PROCESS_GALLERY_POST_X,
} from '../../constants/siteLayout';
import { MachineData, MachineType } from '../../types';

/** Outer radius of a spouting run, in world units. */
export const SPOUT_PIPE_RADIUS = 0.17;

export type PipeRouteFamily = 'intake' | 'pneumatic' | 'finished';

/** Service lanes fit below the gallery and behind its sifter housings. */
export const SPOUT_SERVICE_LAYOUT = {
  intakeRise: 0.9,
  intakeSetback: 3.8,
  intakeLanePitch: 0.5,
  riserOffsetX: 0.85,
  rearSetback: 7,
  rearLanePitch: 0.42,
  topRise: 0.8,
  topLanePitch: 0.28,
  finishedRise: 0.7,
  bendSetback: 0.65,
} as const;

/** Riser banks sit alongside actual columns, clear of their 360 mm shafts. */
export function getSpoutRiserX(machineX: number): number {
  const post = PROCESS_GALLERY_POST_X.reduce((nearest, value) =>
    Math.abs(value - machineX) < Math.abs(nearest - machineX) ? value : nearest
  );
  return post + (machineX < post ? -1 : 1) * SPOUT_SERVICE_LAYOUT.riserOffsetX;
}

export interface SpoutRoute {
  readonly fromMachineId: string;
  readonly toMachineId: string;
  readonly family: PipeRouteFamily;
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  /** Conservative bore bounds shared with moving-grain culling. */
  readonly bounds: THREE.Box3;
  /** Arc length in world units (cached; `getLength()` re-integrates). */
  readonly length: number;
}

/**
 * Stable identity for a machine layout: ids, positions and sizes only.
 * Deliberately excludes `status` - status changes every simulation tick and
 * would rebuild every curve and merged geometry with it.
 */
export type SpoutMachine = Pick<MachineData, 'id' | 'type' | 'position' | 'size'>;

export const spoutMachineKey = (machines: readonly SpoutMachine[]): string =>
  machines
    .filter((m) =>
      [
        MachineType.SILO,
        MachineType.ROLLER_MILL,
        MachineType.PLANSIFTER,
        MachineType.PACKER,
      ].includes(m.type)
    )
    .map((m) => `${m.id}:${m.type}:${m.position.join(',')}:${m.size.join(',')}`)
    .join('|');

/** Straight service runs with compact, bounded tangent bends. */
function serviceCurve(points: THREE.Vector3[]): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const clean = points.filter(
    (point, index) => index === 0 || point.distanceTo(points[index - 1]) > 1e-6
  );
  let cursor = clean[0];
  for (let index = 1; index < clean.length - 1; index++) {
    const before = clean[index - 1],
      corner = clean[index],
      after = clean[index + 1];
    const incoming = corner.clone().sub(before).normalize();
    const outgoing = after.clone().sub(corner).normalize();
    if (incoming.dot(outgoing) > 0.99999) continue;
    const setback = Math.min(
      SPOUT_SERVICE_LAYOUT.bendSetback,
      corner.distanceTo(before) * 0.4,
      corner.distanceTo(after) * 0.4
    );
    const entry = corner.clone().addScaledVector(incoming, -setback);
    const exit = corner.clone().addScaledVector(outgoing, setback);
    if (cursor.distanceTo(entry) > 1e-6) path.add(new THREE.LineCurve3(cursor, entry));
    path.add(new THREE.QuadraticBezierCurve3(entry, corner, exit));
    cursor = exit;
  }
  const end = clean[clean.length - 1];
  if (cursor.distanceTo(end) > 1e-6) path.add(new THREE.LineCurve3(cursor, end));
  path.arcLengthDivisions = 800;
  return path;
}

const createRoute = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  family: PipeRouteFamily,
  lane: number
): Omit<SpoutRoute, 'fromMachineId' | 'toMachineId'> => {
  let points: THREE.Vector3[];
  if (family === 'intake') {
    const y = Math.max(start.y, end.y) + SPOUT_SERVICE_LAYOUT.intakeRise;
    const z =
      end.z - SPOUT_SERVICE_LAYOUT.intakeSetback + lane * SPOUT_SERVICE_LAYOUT.intakeLanePitch;
    points = [
      start,
      new THREE.Vector3(start.x, y, start.z),
      new THREE.Vector3(start.x, y, z),
      new THREE.Vector3(end.x, y, z),
      new THREE.Vector3(end.x, y, end.z),
      end,
    ];
  } else if (family === 'pneumatic') {
    const x = getSpoutRiserX(start.x);
    const z = end.z - SPOUT_SERVICE_LAYOUT.rearSetback + lane * SPOUT_SERVICE_LAYOUT.rearLanePitch;
    const y = end.y + SPOUT_SERVICE_LAYOUT.topRise + lane * SPOUT_SERVICE_LAYOUT.topLanePitch;
    points = [
      start,
      new THREE.Vector3(x, start.y, start.z),
      new THREE.Vector3(x, start.y, z),
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(end.x, y, z),
      new THREE.Vector3(end.x, y, end.z),
      end,
    ];
  } else {
    const y = Math.max(start.y, end.y) + SPOUT_SERVICE_LAYOUT.finishedRise;
    const x = getSpoutRiserX(start.x);
    const z = start.z - SPOUT_SERVICE_LAYOUT.rearSetback;
    points = [
      start,
      new THREE.Vector3(start.x, y, start.z),
      new THREE.Vector3(x, y, start.z),
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(end.x, y, z),
      new THREE.Vector3(end.x, y, end.z),
      end,
    ];
  }
  const curve = serviceCurve(points);
  const bounds = new THREE.Box3().setFromPoints(points).expandByScalar(SPOUT_PIPE_RADIUS);
  return { family, curve, bounds, length: curve.getLength() };
};

// Single-entry cache. Both consumers pass the same machine list on the same
// tick, so a one-slot cache serves them both without holding stale layouts.
/** Resolve the same service-rack geometry for a rendered or modeled connection. */
export function createMachineSpoutRoute(
  from: SpoutMachine,
  to: SpoutMachine,
  lane: number
): SpoutRoute | null {
  if (![...from.position, ...to.position].every(Number.isFinite)) return null;
  let route: Omit<SpoutRoute, 'fromMachineId' | 'toMachineId'>;
  if (from.type === MachineType.SILO && to.type === MachineType.ROLLER_MILL) {
    route = createRoute(
      new THREE.Vector3(from.position[0], from.position[1] + 3, from.position[2]),
      new THREE.Vector3(
        to.position[0],
        to.position[1] + MILL_PROCESS_PORTS.intake[1],
        to.position[2]
      ),
      'intake',
      lane
    );
  } else if (from.type === MachineType.ROLLER_MILL && to.type === MachineType.PLANSIFTER) {
    route = createRoute(
      new THREE.Vector3(
        from.position[0],
        from.position[1] + MILL_PROCESS_PORTS.pneumatic[1],
        from.position[2]
      ),
      new THREE.Vector3(
        to.position[0],
        to.position[1] + SIFTER_LAYOUT.inletCentreY + SIFTER_LAYOUT.inletHeight / 2,
        to.position[2]
      ),
      'pneumatic',
      lane
    );
  } else if (from.type === MachineType.PLANSIFTER && to.type === MachineType.PACKER) {
    route = createRoute(
      new THREE.Vector3(from.position[0], from.position[1] - 2, from.position[2]),
      new THREE.Vector3(
        to.position[0],
        to.position[1] + PACKER_HOPPER_LAYOUT.centreY + PACKER_HOPPER_LAYOUT.scale[1] / 2,
        to.position[2]
      ),
      'finished',
      lane
    );
  } else return null;
  return { ...route, fromMachineId: from.id, toMachineId: to.id };
}

let cachedKey: string | null = null;
let cachedRoutes: readonly SpoutRoute[] = [];

/**
 * Build (or return the cached) spouting routes for a machine layout.
 *
 * Pairing mirrors `ProductionFlowVisualization`: mill[i] is fed by
 * silo[i % silos], lifts to sifter[i % sifters]; packer[i] is fed by
 * sifter[i % sifters].
 */
export const buildSpoutRoutes = (machines: readonly SpoutMachine[]): readonly SpoutRoute[] => {
  const key = spoutMachineKey(machines);
  if (key === cachedKey) return cachedRoutes;

  const silos = machines.filter((m) => m.type === MachineType.SILO);
  const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
  const sifters = machines.filter((m) => m.type === MachineType.PLANSIFTER);
  const packers = machines.filter((m) => m.type === MachineType.PACKER);

  const routes: SpoutRoute[] = [];

  mills.forEach((mill, index) => {
    const silo = silos[index % silos.length];
    if (silo) {
      const route = createMachineSpoutRoute(silo, mill, index);
      if (route) routes.push(route);
    }
  });
  mills.forEach((mill, index) => {
    const sifter = sifters[index % sifters.length];
    if (sifter) {
      const route = createMachineSpoutRoute(mill, sifter, index);
      if (route) routes.push(route);
    }
  });
  packers.forEach((packer, index) => {
    const sifter = sifters[index % sifters.length];
    if (sifter) {
      const route = createMachineSpoutRoute(sifter, packer, index);
      if (route) routes.push(route);
    }
  });

  cachedKey = key;
  cachedRoutes = routes;
  return routes;
};
