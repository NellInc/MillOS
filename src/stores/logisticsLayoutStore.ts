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
/**
 * The planner's observed before/after comparison. It belongs to the material
 * session it was measured in, which a reload restores with the same id, so it
 * travels with the layout. Absent on records saved before it did.
 * Working if a reload mid-trial still shows the sealed "before" column.
 */
export interface SavedLogisticsComparison {
  sessionId: string;
  observation: LogisticsObservation;
  before: LogisticsObservation | null;
  retainedAfter: LogisticsObservation | null;
}
export interface SavedLogisticsLayout {
  layout: LogisticsProposal;
  previous: LogisticsProposal | null;
  revision: number;
  comparison?: SavedLogisticsComparison;
}

const isObservation = (raw: unknown): raw is LogisticsObservation => {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    (
      [
        'activeSeconds',
        'materialSeconds',
        'packedKg',
        'shippedKg',
        'vehicleMetres',
        'completedUnloads',
      ] as const
    ).every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= 0) &&
    Array.isArray(o.conditions) &&
    o.conditions.length <= 20 &&
    o.conditions.every((c) => typeof c === 'string')
  );
};

/** A malformed comparison is dropped rather than halting the whole restore. */
function validComparison(raw: unknown): SavedLogisticsComparison | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.sessionId !== 'string' || !isObservation(c.observation)) return undefined;
  if (c.before !== null && !isObservation(c.before)) return undefined;
  if (c.retainedAfter !== null && !isObservation(c.retainedAfter)) return undefined;
  return {
    sessionId: c.sessionId,
    observation: c.observation,
    before: c.before as LogisticsObservation | null,
    retainedAfter: c.retainedAfter as LogisticsObservation | null,
  };
}
export const defaultSavedLogisticsLayout = (): SavedLogisticsLayout => ({
  layout: currentLogisticsLayout(),
  previous: null,
  revision: 0,
});

/**
 * Earlier default routes. Their fixed poses differ from today's, so a save
 * holding one would fail the fixed-pose check and halt the restore. Each lists
 * the corners a player could move on it.
 * Working if such a save restores onto the current route.
 */
interface LegacyRoute {
  readonly points: readonly Vec3Tuple[];
  readonly editable: readonly number[];
}
const LEGACY_SHIPPING_ROUTES: readonly (readonly Vec3Tuple[])[] = [
  // Until 2026-10-20: the east end doubled back from (25, 42) to (22.5, 43)
  // and spun the forklift.
  [
    [-16, 0, 42],
    [12, 0, 42],
    [25, 0, 42],
    [22.5, 0, 43],
    [22.5, 0, 48],
    [26, 0, 48],
    [26, 0, 42],
    [-16, 0, 42],
  ],
  // Until 2026-10-21: squared off, but the dropoff at (22.5, 48) was 22.5 m
  // from the trailer it loads.
  [
    [-16, 0, 42],
    [12, 0, 42],
    [16, 0, 42],
    [22.5, 0, 42],
    [22.5, 0, 48],
    [28.5, 0, 48],
    [28.5, 0, 42],
    [-16, 0, 42],
  ],
  // Until 2026-10-20: the dropoff at (0, 47.25) set the pallet on the channel
  // floor below a dock deck 2 m up.
  [
    [-16, 0, 42],
    [-10, 0, 42],
    [-5, 0, 42],
    [0, 0, 42],
    [0, 0, 47.25],
    [0, 0, 42],
    [-8, 0, 42],
    [-16, 0, 42],
  ],
];

const LEGACY_ROUTES: Record<Dock, readonly LegacyRoute[]> = {
  // Every legacy shipping route has the same single editable corner (index 2).
  shipping: LEGACY_SHIPPING_ROUTES.map((points) => ({ points, editable: [2] })),
  receiving: [
    // Until 2026-10-20: the pickup at (-28, -43) was 28 m from the trailer it
    // unloads. No corner of it was editable.
    {
      points: [
        [-28, 0, -43],
        [-28, 0, -38],
        [-28, 0, -30],
        [-28, 0, -22],
        [-35, 0, -22],
        [-35, 0, -38],
      ],
      editable: [],
    },
  ],
};

const samePoint = (a: unknown, b: Vec3Tuple): boolean =>
  Array.isArray(a) && a.length === 3 && a.every((value, axis) => value === b[axis]);

/**
 * Moves a layout drawn on a legacy route onto the current one. The editable
 * corners of the legacy routes lie on legs the current routes no longer drive,
 * so a corner the player moved there is returned to the default rather than
 * carried across the hall. Any other layout is left untouched.
 */
function migrateLegacyRoutes(layout: LogisticsProposal | null): LogisticsProposal | null {
  if (!layout || !layout.routes) return layout;
  let routes = layout.routes;
  for (const dock of ['shipping', 'receiving'] as const) {
    const route = layout.routes[dock];
    if (!Array.isArray(route)) continue;
    const legacy = LEGACY_ROUTES[dock].some(
      (old) =>
        route.length === old.points.length &&
        old.points.every(
          (point, index) => old.editable.includes(index) || samePoint(route[index], point)
        )
    );
    if (legacy)
      routes = {
        ...routes,
        [dock]: SITE_LAYOUT.routes.forklifts[dock].points.map((point) => [...point]),
      };
  }
  return routes === layout.routes ? layout : { ...layout, routes };
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
  const layout = migrateLegacyRoutes(saved.layout);
  const previous = migrateLegacyRoutes(saved.previous);
  for (const candidate of [layout, previous]) {
    if (candidate === null && candidate === previous) continue;
    if (!candidate || !feasible(candidate))
      throw new Error('Saved logistics layout has invalid clearance');
  }
  const comparison = validComparison(saved.comparison);
  return structuredClone({
    layout: layout as LogisticsProposal,
    previous,
    revision: saved.revision,
    ...(comparison ? { comparison } : {}),
  });
}

type LayoutStoreReasonKey = keyof typeof logisticsLayoutStoreMessages.en;
/** A refusal the planner can translate at render, so a language switch reaches it. */
export type LogisticsReasonKey = LayoutStoreReasonKey | 'fleetNotReady';
export function logisticsReasonText(key: LogisticsReasonKey): string {
  return key === 'fleetNotReady'
    ? translate(logisticsRuntimeMessages, 'fleetNotReady')
    : translate(logisticsLayoutStoreMessages, key);
}

export function logisticsControlHoldKey(): LayoutStoreReasonKey | null {
  if (isPhysicalSessionRestoring()) return 'sessionRestoring';
  const game = useGameSimulationStore.getState();
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return 'safetyHold';
  if (isWorkplaceReplayActive() || isWorkplaceReplayRestoring()) return 'replayActive';
  const service = peekSCADAService();
  if (service ? service.getState().mode !== 'simulation' : useProductionStore.getState().scadaLive)
    return 'localControlOnly';
  return null;
}

export function logisticsControlHold(): string | null {
  const key = logisticsControlHoldKey();
  return key ? logisticsReasonText(key) : null;
}

/**
 * `reason` is the text in the language active when the call was made;
 * `reasonKey` is set whenever the reason is this store's own copy. A reason a
 * forklift controller gives has no key and stays as text.
 */
export interface LogisticsApplyResult {
  changed: boolean;
  reason: string | null;
  reasonKey?: LogisticsReasonKey;
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
  ) => LogisticsApplyResult;
  undoApplied: (revision: number, machineKey: string) => LogisticsApplyResult;
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
  ): LogisticsApplyResult => {
    const state = get();
    let reasonKey: LogisticsReasonKey | null = logisticsControlHoldKey();
    if (!reasonKey && useGameSimulationStore.getState().gameSpeed !== 0) reasonKey = 'pauseFirst';
    const machines = useProductionStore.getState().machines;
    if (
      !reasonKey &&
      (!machines.length || state.revision !== revision || spoutMachineKey(machines) !== machineKey)
    )
      reasonKey = 'layoutChanged';
    if (
      !reasonKey &&
      !scoreLogisticsLayout(
        proposal,
        DEFAULT_PLANNING_ASSUMPTIONS,
        capturedPlanningObstacles(machines, positionRegistry.getAllObstacles())
      ).feasible
    )
      reasonKey = 'clearanceFailed';
    if (!reasonKey && !logisticsFleetReady()) reasonKey = 'fleetNotReady';
    if (reasonKey) return { changed: false, reason: logisticsReasonText(reasonKey), reasonKey };
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
        : {
            changed: false,
            reason: logisticsReasonText('nothingToUndo'),
            reasonKey: 'nothingToUndo',
          };
    },
    restoreSaved: (saved) => {
      pendingMetres = pendingUnloads = 0;
      restoreLogisticsFleet(saved.layout);
      const { layout, previous, revision } = structuredClone(saved);
      const comparison = validComparison(structuredClone(saved.comparison));
      set({
        layout,
        previous,
        revision,
        sessionId: comparison?.sessionId ?? '',
        observation: comparison?.observation ?? emptyObservation(),
        before: comparison?.before ?? null,
        retainedAfter: comparison?.retainedAfter ?? null,
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
  const { layout, previous, revision, sessionId, observation, before, retainedAfter } =
    useLogisticsLayoutStore.getState();
  return structuredClone({
    layout,
    previous,
    revision,
    comparison: { sessionId, observation, before, retainedAfter },
  });
}
