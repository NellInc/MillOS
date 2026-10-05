import type { Vec3Tuple } from '../constants/siteLayout';
import {
  createRoundedForkliftRoute,
  FORKLIFT_CORNER_SETBACK,
  FORKLIFT_CORNER_SAMPLES,
} from './forkliftRoute';
import { planningRouteActions, type Dock, type LogisticsProposal } from './layoutPlanning';
import {
  createForkliftRoutePlan,
  type ForkliftMotionState,
  type ForkliftRoutePlan,
} from './vehicles/forkliftController';
import { sampleArcLengthPath } from './vehicles/vehicleKinematics';

export function drivenLogisticsRoute(dock: Dock, points: readonly Vec3Tuple[]) {
  const rounded = createRoundedForkliftRoute(
    points,
    planningRouteActions(dock),
    FORKLIFT_CORNER_SETBACK,
    FORKLIFT_CORNER_SAMPLES
  );
  return { ...rounded, plan: createForkliftRoutePlan(rounded.path, rounded.actions) };
}

/** Match the same directed action leg, never the nearest overlapping return lane.
 * Working if apply retains pose and next action, or refuses a changed/ambiguous corner.
 */
export function reconcileLogisticsMotion(
  oldPlan: ForkliftRoutePlan,
  nextPlan: ForkliftRoutePlan,
  motion: ForkliftMotionState,
  nextAction: number
): ForkliftMotionState | null {
  if (oldPlan.markers.length !== nextPlan.markers.length || !nextPlan.markers[nextAction])
    return null;
  if (oldPlan.markers.some((m, i) => m.action.type !== nextPlan.markers[i].action.type))
    return null;
  const count = nextPlan.markers.length;
  const start = nextPlan.markers[(nextAction + count - 1) % count].distance;
  const end = nextPlan.markers[nextAction].distance;
  const total = nextPlan.path.totalLength;
  const legLength = (((end - start) % total) + total) % total;
  const oldTangent = sampleArcLengthPath(oldPlan.path, motion.routeDistance);
  const matches: number[] = [];
  const samples = nextPlan.path.samples;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    if (length2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((motion.x - a.x) * dx + (motion.z - a.z) * dz) / length2));
    const distance = a.distance + t * (b.distance - a.distance);
    const offset = (((distance - start) % total) + total) % total;
    if (offset > legLength + 1e-6 && total - offset > 1e-6) continue;
    if (Math.hypot(a.x + dx * t - motion.x, a.z + dz * t - motion.z) > 0.01) continue;
    const tangent = sampleArcLengthPath(nextPlan.path, distance);
    if (tangent.tangentX * oldTangent.tangentX + tangent.tangentZ * oldTangent.tangentZ < 0.995)
      continue;
    const normalized = distance % total;
    if (
      !matches.some(
        (v) => Math.min(Math.abs(v - normalized), total - Math.abs(v - normalized)) < 0.02
      )
    )
      matches.push(normalized);
  }
  if (matches.length !== 1) return null;
  return { ...motion, routeDistance: matches[0] };
}

interface LogisticsVehicleOwner {
  prepare: (points: readonly Vec3Tuple[]) => (() => void) | string;
  restore: (points: readonly Vec3Tuple[]) => void;
}
const owners = new Map<Dock, LogisticsVehicleOwner>();
export function registerLogisticsVehicle(dock: Dock, owner: LogisticsVehicleOwner) {
  owners.set(dock, owner);
  return () => {
    if (owners.get(dock) === owner) owners.delete(dock);
  };
}
export const logisticsFleetReady = () => owners.has('shipping') && owners.has('receiving');
export function prepareLogisticsFleet(layout: LogisticsProposal): (() => void) | string {
  const commits: Array<() => void> = [];
  for (const dock of ['shipping', 'receiving'] as const) {
    const owner = owners.get(dock);
    if (!owner) return 'Wait for both forklifts to finish loading into the scene.';
    const prepared = owner.prepare(layout.routes[dock]);
    if (typeof prepared === 'string') return prepared;
    commits.push(prepared);
  }
  return () => commits.forEach((commit) => commit());
}
// Restore geometry before existing replay/save owners restore their motion.
export function restoreLogisticsFleet(layout: LogisticsProposal) {
  owners.forEach((owner, dock) => owner.restore(layout.routes[dock]));
}
