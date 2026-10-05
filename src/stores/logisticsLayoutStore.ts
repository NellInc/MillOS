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
  scoreLogisticsLayout,
  type Dock,
  type LogisticsProposal,
} from '../simulation/layoutPlanning';
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
  for (const layout of [saved.layout, saved.previous]) {
    if (layout === null && layout === saved.previous) continue;
    if (
      !layout ||
      !scoreLogisticsLayout(
        layout,
        DEFAULT_PLANNING_ASSUMPTIONS,
        capturedPlanningObstacles(machines, [])
      ).feasible
    )
      throw new Error('Saved logistics layout has invalid clearance');
  }
  return structuredClone({
    layout: saved.layout,
    previous: saved.previous,
    revision: saved.revision,
  });
}

export function logisticsControlHold(): string | null {
  if (isPhysicalSessionRestoring()) return 'Wait for the saved shift to finish restoring.';
  const game = useGameSimulationStore.getState();
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return 'Resolve the site safety hold first.';
  if (isWorkplaceReplayActive() || isWorkplaceReplayRestoring())
    return 'Finish the replay experiment before changing logistics.';
  const service = peekSCADAService();
  if (service ? service.getState().mode !== 'simulation' : useProductionStore.getState().scadaLive)
    return 'Logistics changes require local simulation control, never live or hybrid SCADA.';
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
    if (
      !reason &&
      (useProductionStore.getState().productionSpeed !== 0 ||
        useGameSimulationStore.getState().gameSpeed !== 0)
    )
      reason = 'Pause the mill before applying or undoing a layout.';
    const machines = useProductionStore.getState().machines;
    if (
      !reason &&
      (!machines.length || state.revision !== revision || spoutMachineKey(machines) !== machineKey)
    )
      reason = 'The live layout changed. Capture current again.';
    if (
      !reason &&
      !scoreLogisticsLayout(
        proposal,
        DEFAULT_PLANNING_ASSUMPTIONS,
        capturedPlanningObstacles(machines, positionRegistry.getAllObstacles())
      ).feasible
    )
      reason =
        'The proposal fails the live clearance check. Capture current again and resolve its conflicts.';
    if (!reason && !logisticsFleetReady())
      reason = 'Wait for both forklifts to finish loading into the scene.';
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
        : { changed: false, reason: 'There is no applied layout to undo.' };
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
