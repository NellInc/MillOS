/**
 * A truck a forklift is holding says which forklift, on the bell.
 *
 * Two holds have a forklift as their cause (TruckBay's tick):
 * - **path**: a forklift under manual control (driven, or returning to its
 *   lane) stands where the moving truck would sweep (manualForkliftInTruckPath);
 * - **lane**: the dock's own forklift stands in its lane, which keeps the
 *   docked truck's doors open (dockForkliftHoldsTruck).
 *
 * The lane hold is also how every ordinary load works, for the seconds the
 * forklift drives in and backs off, so it is named only when the forklift will
 * not leave by itself: someone is driving it, or the forklift-only stop holds
 * it. A plant-wide stop (E-stop, drill) holds the truck in its own right and has
 * its own notices, so neither hold is named while one is on.
 *
 * One notice per dock, under a stable id, so a re-raise replaces it and a
 * restored session keeps at most one. It goes when the truck drives again:
 * the path hold can let go for a step as the truck's stopping distance shrinks,
 * and clearing on that would raise the notice again a moment later.
 * Working if driving FLT01 into the shipping truck's path files one notice
 * naming FLT01, a nominal load files none, and the notice goes once the truck
 * moves on (truckForkliftHold.test.ts).
 */
import { DOCK_FORKLIFT_ID, dockForkliftHoldsTruck } from '../../constants/dockLoading';
import { FORKLIFT_FLEET_TAGS } from '../../stores/forkliftDriveStore';
import { useUIStore } from '../../stores/uiStore';
import { translate } from '../../i18n';
import { registerAlertCatalog } from '../../i18n/alertCopy';
import { positionRegistry } from '../../utils/positionRegistry';
import { truckForkliftHoldMessages } from './truckForkliftHold.messages';

type Dock = 'shipping' | 'receiving';
export type TruckForkliftHoldKind = 'path' | 'lane';

export interface TruckForkliftHold {
  readonly forkliftId: string;
  readonly kind: TruckForkliftHoldKind;
}

const TRUCK_FORKLIFT_HOLD_CATALOG = 'truckForkliftHold';
registerAlertCatalog(TRUCK_FORKLIFT_HOLD_CATALOG, truckForkliftHoldMessages);

/** A truck faster than this, m/s, is driving again: its hold is over. */
const MOVING_SPEED = 0.5;

export const truckForkliftHoldAlertId = (dock: Dock): string => `truck-forklift-hold-${dock}`;

/**
 * The manual forklift nearest the truck. manualForkliftInTruckPath answers
 * whether one is in the way, not which; there is one driven forklift at most
 * and rarely a second returning to its lane, so the nearest is the one.
 */
export function nearestManualForklift(x: number, z: number): string | null {
  let nearest: string | null = null;
  let nearestSq = Infinity;
  for (const other of positionRegistry.getAllEntities()) {
    if (!other.manual || other.kind === 'truck') continue;
    const distanceSq = (other.x - x) ** 2 + (other.z - z) ** 2;
    if (distanceSq < nearestSq) {
      nearest = other.id;
      nearestSq = distanceSq;
    }
  }
  return nearest;
}

/**
 * Which forklift holds a truck this frame, or null. Positional, as the tick
 * calls it every frame for each dock.
 * - `heldInPath`: a step this frame held for a manual forklift in its path.
 * - `transferWaiting`: docked in its transfer with everything else done (the
 *   load ready to go), so only the lane keeps the doors open.
 */
export function forkliftHoldingTruck(
  dock: Dock,
  truckX: number,
  truckZ: number,
  heldInPath: boolean,
  transferWaiting: boolean,
  safetyHoldActive: boolean,
  forkliftStopActive: boolean,
  dockForkliftStopReason: string | undefined
): TruckForkliftHold | null {
  if (safetyHoldActive) return null;
  if (heldInPath) {
    const forkliftId = nearestManualForklift(truckX, truckZ);
    return forkliftId ? { forkliftId, kind: 'path' } : null;
  }
  if (!transferWaiting) return null;
  const forkliftId = DOCK_FORKLIFT_ID[dock];
  const position = positionRegistry.get(forkliftId);
  if (!dockForkliftHoldsTruck(position, dockForkliftStopReason)) return null;
  // Working the load, it backs off by itself; only a driver or the stop keeps it there.
  return position?.manual || forkliftStopActive ? { forkliftId, kind: 'lane' } : null;
}

const named = new Map<Dock, string>();

/**
 * File, update or clear the dock's notice for this frame's hold. Writes the
 * alert store only when the holder or its reason changes, or the hold ends.
 */
export function syncTruckForkliftHoldNotice(
  dock: Dock,
  hold: TruckForkliftHold | null,
  truckSpeed: number,
  truckActive: boolean
): void {
  const id = truckForkliftHoldAlertId(dock);
  if (hold && truckActive) {
    const key = `${hold.forkliftId}:${hold.kind}`;
    if (named.get(dock) === key) return;
    named.set(dock, key);
    const tag = FORKLIFT_FLEET_TAGS[hold.forkliftId] ?? hold.forkliftId;
    const message =
      hold.kind === 'path'
        ? dock === 'shipping'
          ? 'pathShipping'
          : 'pathReceiving'
        : dock === 'shipping'
          ? 'laneShipping'
          : 'laneReceiving';
    useUIStore.getState().addAlert({
      id,
      type: 'warning',
      title: translate(truckForkliftHoldMessages, 'title', { tag }),
      message: translate(truckForkliftHoldMessages, message, { tag }),
      timestamp: new Date(),
      acknowledged: false,
      copy: { catalog: TRUCK_FORKLIFT_HOLD_CATALOG, title: 'title', message, params: { tag } },
    });
    return;
  }
  if (truckActive && Math.abs(truckSpeed) <= MOVING_SPEED) return;
  // Driving again, or gone. Also clears a notice a restored session brought back.
  named.delete(dock);
  const alerts = useUIStore.getState().alerts;
  for (let i = 0; i < alerts.length; i++) {
    if (alerts[i].id === id) {
      useUIStore.getState().removeAlert(id);
      return;
    }
  }
}

/** Forget what has been named (tests, and a plant reset). */
export const resetTruckForkliftHoldNotices = (): void => named.clear();
