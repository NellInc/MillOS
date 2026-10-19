import { create } from 'zustand';
import { useProductionStore } from './productionStore';
import { useGameSimulationStore, selectSafetyHoldActive } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { peekSCADAService } from '../scada/SCADAService';
import { spoutMachineKey, type SpoutMachine } from '../components/flow/spoutRoutes';
import { positionRegistry } from '../utils/positionRegistry';
import { isPhysicalSessionRestoring } from '../utils/physicalSession';
import {
  isWorkplaceReplayActive,
  isWorkplaceReplayRestoring,
} from '../simulation/workplaceReplayRuntime';
import {
  capturedPlanningObstacles,
  currentLogisticsLayout,
  DEFAULT_PLANNING_ASSUMPTIONS,
  isEditableRoutePoint,
  scoreLogisticsLayout,
  type Dock,
  type LogisticsProposal,
} from '../simulation/layoutPlanning';
import { SITE_LAYOUT, type Vec3Tuple } from '../constants/siteLayout';
import { translate } from '../i18n';
import { logisticsLayoutStoreMessages } from './logisticsLayoutStore.messages';
import { logisticsRuntimeMessages } from '../simulation/logisticsRuntime.messages';
import {
  logisticsFleetReady,
  prepareLogisticsFleet,
  restoreLogisticsFleet,
} from '../simulation/logisticsRuntime';

export interface LogisticsObservation {
  activeSeconds: number;
  materialSeconds: number;
  packedKg: number;
  shippedKg: number;
  vehicleMetres: number;
  completedUnloads: number;
  conditions: string[];
}
const emptyObservation = (): LogisticsObservation => ({
  activeSeconds: 0,
  materialSeconds: 0,
  packedKg: 0,
  shippedKg: 0,
  vehicleMetres: 0,
  completedUnloads: 0,
  conditions: [],
});
export interface SavedLogisticsLayout {
  layout: LogisticsProposal;
  previous: LogisticsProposal | null;
  revision: number;
}
export const defaultSavedLogisticsLayout = (): SavedLogisticsLayout => ({
  layout: currentLogisticsLayout(),
  previous: null,
  revision: 0,
});

/**
 * The default shipping route until 2026-10-20, whose east end doubled back
 * from (25, 42) to (22.5, 43) and spun the forklift. Its fixed poses differ
 * from today's, so a save holding it would fail the fixed-pose check and halt
 * the restore. Working if such a save restores onto the current route.
 */
const LEGACY_SHIPPING_ROUTE: readonly Vec3Tuple[] = [
  [-16, 0, 42],
  [12, 0, 42],
  [25, 0, 42],
  [22.5, 0, 43],
  [22.5, 0, 48],
  [26, 0, 48],
  [26, 0, 42],
  [-16, 0, 42],
];

const samePoint = (a: unknown, b: Vec3Tuple): boolean =>
  Array.isArray(a) && a.length === 3 && a.every((value, axis) => value === b[axis]);

/**
 * Moves a layout drawn on the legacy shipping route onto the current one. A
 * corner the player moved is kept when the result still passes `feasible`,
 * and returned to the default otherwise; any other layout is left untouched.
 */
function migrateLegacyShippingRoute(
  layout: LogisticsProposal | null,
  feasible: (layout: LogisticsProposal) => boolean
): LogisticsProposal | null {
  const route = layout?.routes?.shipping;
  if (!layout || !Array.isArray(route) || route.length !== LEGACY_SHIPPING_ROUTE.length)
    return layout;
  const editable = (index: number) => isEditableRoutePoint('shipping', index);
  if (
    !LEGACY_SHIPPING_ROUTE.every(
      (point, index) => editable(index) || samePoint(route[index], point)
    )
  )
    return layout;
  const current = SITE_LAYOUT.routes.forklifts.shipping.points;
  const withRoute = (keepEdits: boolean): LogisticsProposal => ({
    ...layout,
    routes: {
      ...layout.routes,
      shipping: current.map((point, index) =>
        keepEdits && editable(index) && !samePoint(route[index], LEGACY_SHIPPING_ROUTE[index])
          ? [...(route[index] as Vec3Tuple)]
          : [...point]
      ),
    },
  });
  const kept = withRoute(true);
  return feasible(kept) ? kept : withRoute(false);
}

export function validateSavedLogisticsLayout(
  raw: unknown,
  machines: readonly SpoutMachine[]
): SavedLogisticsLayout {
  if (raw === undefined) return defaultSavedLogisticsLayout(); // Version-1 saves predate planning.
  if (!raw || typeof raw !== 'object') throw new Error('Invalid saved logistics layout');
  const saved = raw as SavedLogisticsLayout;
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 0)
    throw new Error('Invalid layout revision');
  if (!saved.layout) throw new Error('Missing saved logistics layout');
  const feasible = (layout: LogisticsProposal) =>
    scoreLogisticsLayout(
      layout,
      DEFAULT_PLANNING_ASSUMPTIONS,
      capturedPlanningObstacles(machines, [])
    ).feasible;
  const layout = migrateLegacyShippingRoute(saved.layout, feasible);
  const previous = migrateLegacyShippingRoute(saved.previous, feasible);
  for (const candidate of [layout, previous]) {
    if (candidate === null && candidate === previous) continue;
    if (!candidate || !feasible(candidate))
      throw new Error('Saved logistics layout has invalid clearance');
  }
  return structuredClone({
    layout: layout as LogisticsProposal,
    previous,
    revision: saved.revision,
  });
}

export function logisticsControlHold(): string | null {
  if (isPhysicalSessionRestoring())
    return translate(logisticsLayoutStoreMessages, 'sessionRestoring');
  const game = useGameSimulationStore.getState();
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return translate(logisticsLayoutStoreMessages, 'safetyHold');
  if (isWorkplaceReplayActive() || isWorkplaceReplayRestoring())
    return translate(logisticsLayoutStoreMessages, 'replayActive');
  const service = peekSCADAService();
  if (service ? service.getState().mode !== 'simulation' : useProductionStore.getState().scadaLive)
    return translate(logisticsLayoutStoreMessages, 'localControlOnly');
  return null;
}

interface LogisticsLayoutState extends SavedLogisticsLayout {
  sessionId: string;
  observation: LogisticsObservation;
  before: LogisticsObservation | null;
  retainedAfter: LogisticsObservation | null;
  apply: (
    proposal: LogisticsProposal,
    revision: number,
    machineKey: string
  ) => { changed: boolean; reason: string | null };
  undoApplied: (
    revision: number,
    machineKey: string
  ) => { changed: boolean; reason: string | null };
  restoreSaved: (saved: SavedLogisticsLayout) => void;
  recordVehicle: (dock: Dock, metres: number, completedUnload?: boolean) => void;
  observe: (
    sessionId: string,
    activeSeconds: number,
    materialSeconds: number,
    packedKg: number,
    shippedKg: number,
    condition: string
  ) => void;
}

export const useLogisticsLayoutStore = create<LogisticsLayoutState>((set, get) => {
  let pendingMetres = 0,
    pendingUnloads = 0;
  const flush = () => {
    const observation = {
      ...get().observation,
      vehicleMetres: get().observation.vehicleMetres + pendingMetres,
      completedUnloads: get().observation.completedUnloads + pendingUnloads,
    };
    pendingMetres = pendingUnloads = 0;
    return observation;
  };
  const commit = (
    proposal: LogisticsProposal,
    revision: number,
    machineKey: string,
    undo: boolean
  ) => {
    const state = get();
    let reason = logisticsControlHold();
    if (!reason && useGameSimulationStore.getState().gameSpeed !== 0)
      reason = translate(logisticsLayoutStoreMessages, 'pauseFirst');
    const machines = useProductionStore.getState().machines;
    if (
      !reason &&
      (!machines.length || state.revision !== revision || spoutMachineKey(machines) !== machineKey)
    )
      reason = translate(logisticsLayoutStoreMessages, 'layoutChanged');
    if (
      !reason &&
      !scoreLogisticsLayout(
        proposal,
        DEFAULT_PLANNING_ASSUMPTIONS,
        capturedPlanningObstacles(machines, positionRegistry.getAllObstacles())
      ).feasible
    )
      reason = translate(logisticsLayoutStoreMessages, 'clearanceFailed');
    if (!reason && !logisticsFleetReady())
      reason = translate(logisticsRuntimeMessages, 'fleetNotReady');
    if (reason) return { changed: false, reason };
    const install = prepareLogisticsFleet(proposal);
    if (typeof install === 'string') return { changed: false, reason: install };
    // Both mounted controllers prepare without writes, then install synchronously
    // while paused. Working if no frame can see a new route with old progress.
    install();
    const observed = flush();
    const sameSession = state.sessionId === useMaterialFlowStore.getState().sessionId;
    set({
      layout: structuredClone(proposal),
      previous: undo ? null : structuredClone(state.layout),
      revision: state.revision + 1,
      sessionId: useMaterialFlowStore.getState().sessionId,
      before: undo ? state.before : sameSession ? observed : null,
      retainedAfter: undo ? observed : null,
      observation: emptyObservation(),
    });
    return { changed: true, reason: null };
  };
  return {
    ...defaultSavedLogisticsLayout(),
    sessionId: '',
    observation: emptyObservation(),
    before: null,
    retainedAfter: null,
    apply: (proposal, revision, machineKey) => commit(proposal, revision, machineKey, false),
    undoApplied: (revision, machineKey) => {
      const previous = get().previous;
      return previous
        ? commit(previous, revision, machineKey, true)
        : { changed: false, reason: translate(logisticsLayoutStoreMessages, 'nothingToUndo') };
    },
    restoreSaved: (saved) => {
      pendingMetres = pendingUnloads = 0;
      restoreLogisticsFleet(saved.layout);
      set({
        ...structuredClone(saved),
        sessionId: '',
        observation: emptyObservation(),
        before: null,
        retainedAfter: null,
      });
    },
    recordVehicle: (_dock, metres, completedUnload = false) => {
      const sessionId = useMaterialFlowStore.getState().sessionId;
      if (get().sessionId !== sessionId) {
        pendingMetres = pendingUnloads = 0;
        set({ sessionId, observation: emptyObservation(), before: null, retainedAfter: null });
      }
      if (Number.isFinite(metres) && metres > 0) pendingMetres += metres;
      if (completedUnload) pendingUnloads++;
    },
    observe: (sessionId, activeSeconds, materialSeconds, packedKg, shippedKg, condition) => {
      const state = get();
      if (state.sessionId !== sessionId) {
        pendingMetres = pendingUnloads = 0;
        set({ sessionId, observation: emptyObservation(), before: null, retainedAfter: null });
      }
      const observation = flush();
      const positive = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
      set({
        observation: {
          ...observation,
          activeSeconds: observation.activeSeconds + positive(activeSeconds),
          materialSeconds: observation.materialSeconds + positive(materialSeconds),
          packedKg: observation.packedKg + positive(packedKg),
          shippedKg: observation.shippedKg + positive(shippedKg),
          conditions: observation.conditions.includes(condition)
            ? observation.conditions
            : [...observation.conditions, condition].slice(-20),
        },
      });
    },
  };
});

export function captureSavedLogisticsLayout(): SavedLogisticsLayout {
  const { layout, previous, revision } = useLogisticsLayoutStore.getState();
  return structuredClone({ layout, previous, revision });
}
