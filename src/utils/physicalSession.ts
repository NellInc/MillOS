import {
  useProductionStore,
  cleanupThrottledBags,
  resetThrottledBagState,
  PRODUCTION_DELEGATED_KEYS,
} from '../stores/productionStore';
import {
  MAX_MATERIAL_MANIFESTS,
  retainShippedBatchWindow,
  useMaterialFlowStore,
  type MaterialFlowState,
} from '../stores/materialFlowStore';
import {
  compactBatchCreditKeys,
  useOperationsCampaignStore,
} from '../stores/operationsCampaignStore';
import { persistedGameSpeed, useGameSimulationStore } from '../stores/gameSimulationStore';
import { migrateLegacyGameSpeed } from '../simulation/pace';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useQCLabStore } from '../stores/qcLabStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useUIStore } from '../stores/uiStore';
import { captureUnifiedTickState, restoreUnifiedTickState } from '../systems/UnifiedGameTick';
import { centralTick } from '../systems/CentralTickSystem';
import { peekSCADAService } from '../scada/SCADAService';
import {
  captureReplayParticipants,
  missingReplayParticipants,
  restoreReplayParticipants,
  isWorkplaceReplayActive,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../simulation/workplaceReplayRuntime';
import { getStartupSnapshot, subscribeStartup } from './startupReadiness';
import { MachineType } from '../types';
import {
  captureSavedLogisticsLayout,
  useLogisticsLayoutStore,
  validateSavedLogisticsLayout,
} from '../stores/logisticsLayoutStore';
import { translate } from '../i18n';
import { physicalSessionMessages as messages } from './physicalSession.messages';

export const PHYSICAL_SESSION_KEY = 'millos-physical-session';
export const MAX_SAVE_BYTES = 3_000_000;
type Data<S> = { [K in keyof S as S[K] extends (...args: never[]) => unknown ? never : K]: S[K] };
function data<S extends object, K extends keyof Data<S> = never>(
  state: S,
  omit: readonly K[] = []
): Omit<Data<S>, K> {
  return structuredClone(
    Object.fromEntries(
      Object.entries(state).filter(
        ([k, v]) =>
          typeof v !== 'function' &&
          v !== undefined &&
          !(omit as readonly PropertyKey[]).includes(k)
      )
    )
  ) as Omit<Data<S>, K>;
}

// One record keeps physical stock, quality authority, faults and dispatch credit
// together. Preferences and revocable workplace permissions retain their own
// existing migration rules. Replay checkpoints remain in-memory only.
// Working if a reload retains held batches, parts and in-flight truck loads,
// without re-crediting a departure or restoring expired workplace authority.
export function capturePhysicalSession() {
  return {
    version: 1 as const,
    logistics: captureSavedLogisticsLayout(),
    // The delegated keys are stale copies of the quality, achievement, PA, replay
    // and truck owners, which save their own domains below.
    production: data(useProductionStore.getState(), PRODUCTION_DELEGATED_KEYS),
    // The process log is an in-memory diagnostic window of ~3 K-char records
    // (1.5 M chars at its cap: the whole save gate). Reload honesty rides on
    // stock, batch contributions and the ledger, so the save carries none of it.
    material: {
      ...data(useMaterialFlowStore.getState(), ['processGenealogy']),
      processGenealogy: [] as MaterialFlowState['processGenealogy'],
    },
    operations: data(useOperationsCampaignStore.getState()),
    game: data(useGameSimulationStore.getState()),
    maintenance: data(useBreakdownStore.getState()),
    trucks: data(useTruckScheduleStore.getState()),
    quality: data(useQCLabStore.getState()),
    safety: data(useSafetyStore.getState()),
    achievements: data(useAchievementsStore.getState()),
    tick: captureUnifiedTickState(),
    clock: centralTick.captureClock(),
    participants: captureReplayParticipants().map(({ id, value }) => ({ id, value })),
  };
}
type PhysicalSession = ReturnType<typeof capturePhysicalSession>;
const TAG = '__millosPhysicalType';
/** The record would exceed the save gate. Deterministic: retrying cannot help. */
export class PhysicalSaveTooLargeError extends Error {
  constructor() {
    super('Physical save is too large');
    this.name = 'PhysicalSaveTooLargeError';
  }
}
export function encodePhysicalSession(value: PhysicalSession): string {
  const encoded = JSON.stringify(value, function (this: Record<string, unknown>, key, v: unknown) {
    const original = this[key];
    if (original instanceof Date) return { [TAG]: 'date', value: original.toISOString() };
    if (original instanceof Map) return { [TAG]: 'map', value: [...original] };
    if (typeof v === 'number' && !Number.isFinite(v))
      throw new Error(`Non-finite saved value at ${key}`);
    return v;
  });
  if (encoded.length * 2 > MAX_SAVE_BYTES) throw new PhysicalSaveTooLargeError();
  return encoded;
}

// Records written before the history windows narrowed carry the whole process
// log and long batch and manifest tails. Trim them to today's windows before
// validation: a reload pauses for consent, so no tick would trim them before the
// first autosave, which would otherwise hit the gate again. Physical stock,
// holds and the ledger are untouched; only settled history is dropped.
function compactSavedHistories(value: unknown): void {
  const material = (value as { material?: unknown } | null)?.material;
  if (!material || typeof material !== 'object') return;
  const m = material as Record<string, unknown>;
  if (Array.isArray(m.processGenealogy)) m.processGenealogy = [];
  if (Array.isArray(m.manifests)) m.manifests = m.manifests.slice(-MAX_MATERIAL_MANIFESTS);
  if (
    Array.isArray(m.productionBatches) &&
    m.productionBatches.every((batch) => batch && typeof batch === 'object')
  )
    m.productionBatches = retainShippedBatchWindow(
      m.productionBatches as {
        disposition: MaterialFlowState['productionBatches'][number]['disposition'];
      }[]
    );
}

/**
 * Saved fields whose type admits null. The field check compares a saved value
 * with a fresh page's initial value, so a field that starts as a string and
 * clears to null in play (activeOrderId once every order is fulfilled) rejected
 * a genuine record. physicalSession.nullable.test.ts derives this list from the
 * captured type, so a new nullable field cannot be forgotten.
 */
export const NULLABLE_PHYSICAL_FIELDS = {
  production: ['selectedMachine', 'productionTarget'],
  operations: ['activeChallenge', 'lastMaterialSessionId', 'activeOrderId', 'currentShiftKey'],
  game: ['emergencyMachineId', 'activeSafetyEventId'],
} as const;

function validateTree(value: unknown, budget: { left: number }, depth = 0): void {
  if (--budget.left < 0 || depth > 50) throw new Error('Invalid save size');
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid saved date');
  } else if (value instanceof Map) {
    value.forEach((v, k) => {
      if (typeof k !== 'string') throw new Error('Invalid map key');
      validateTree(v, budget, depth + 1);
    });
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => {
      if (['__proto__', 'constructor', 'prototype'].includes(k))
        throw new Error('Invalid saved key');
      validateTree(v, budget, depth + 1);
    });
  } else if (
    typeof value === 'number'
      ? !Number.isFinite(value)
      : !['string', 'boolean', 'undefined'].includes(typeof value) && value !== null
  ) {
    throw new Error('Invalid saved value');
  }
}

export function decodePhysicalSession(raw: string): PhysicalSession {
  // encodePhysicalSession has gated every write since the record existed, so a
  // record over the gate was not written by this app. It takes the ordinary
  // restore-failure path: record retained, clock paused, Reset offered.
  if (raw.length * 2 > MAX_SAVE_BYTES) throw new PhysicalSaveTooLargeError();
  const value = JSON.parse(raw, (_key, v: unknown) => {
    if (v && typeof v === 'object' && TAG in v) {
      const tagged = v as Record<string, unknown>;
      if (Object.keys(tagged).length !== 2) throw new Error('Invalid saved type');
      if (tagged[TAG] === 'date' && typeof tagged.value === 'string') return new Date(tagged.value);
      if (
        tagged[TAG] === 'map' &&
        Array.isArray(tagged.value) &&
        tagged.value.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string')
      )
        return new Map(tagged.value);
      throw new Error('Invalid saved type');
    }
    return v;
  }) as PhysicalSession;
  compactSavedHistories(value);
  validateTree(value, { left: 200_000 });
  if (!value || value.version !== 1) throw new Error('Unsupported physical save');
  // Records from before the delegated copies were dropped still carry them. Their
  // owners' own domains are authoritative, so discard the copies, not the record.
  if (value.production && typeof value.production === 'object')
    for (const key of PRODUCTION_DELEGATED_KEYS) Reflect.deleteProperty(value.production, key);
  const defaults = capturePhysicalSession();
  for (const domain of [
    'production',
    'material',
    'operations',
    'game',
    'maintenance',
    'trucks',
    'quality',
    'safety',
    'achievements',
    'tick',
    'clock',
  ] as const) {
    const saved = value[domain],
      expected = defaults[domain];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      throw new Error('Missing physical domain');
    for (const [key, entry] of Object.entries(saved)) {
      if (!(key in expected) || typeof (expected as Record<string, unknown>)[key] === 'function')
        throw new Error(`Unknown physical field ${domain}.${key}`);
      const before = (expected as Record<string, unknown>)[key];
      if (
        entry === null
          ? before !== null &&
            !(
              NULLABLE_PHYSICAL_FIELDS[domain as keyof typeof NULLABLE_PHYSICAL_FIELDS] as
                | readonly string[]
                | undefined
            )?.includes(key)
          : before instanceof Map
            ? !(entry instanceof Map)
            : Array.isArray(before)
              ? !Array.isArray(entry)
              : before !== null && typeof before !== typeof entry
      )
        throw new Error(`Invalid physical field ${domain}.${key}`);
    }
    for (const key of Object.keys(expected))
      if (!(key in saved)) throw new Error(`Incomplete physical domain ${domain}.${key}`);
  }
  const m = value.material;
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (
    [m.initialInventoryKg, m.receivedKg, m.wasteKg, m.byproductKg, m.shippedKg].some(
      (n) => !nonnegative(n)
    ) ||
    m.network.segments.some((s) => !s || !nonnegative(s.currentLoad))
  )
    throw new Error('Invalid material ledger');
  if (!m.sessionId || m.machineBuffers.size === 0 || !Array.isArray(m.network.segments))
    throw new Error('Missing material session');
  const inventory = [...m.machineBuffers.values()].reduce(
    (sum, b) =>
      sum +
      [...b.inputBuffer, ...b.outputBuffer].reduce((s, x) => {
        if (!Number.isFinite(x.amount) || x.amount < 0) throw new Error('Invalid inventory');
        return s + x.amount;
      }, 0),
    0
  );
  const transit = m.network.segments.reduce((sum, s) => sum + s.currentLoad, 0);
  const error =
    m.initialInventoryKg +
    m.receivedKg -
    inventory -
    transit -
    m.wasteKg -
    m.byproductKg -
    m.shippedKg;
  if (!Number.isFinite(error) || Math.abs(error) > 0.01)
    throw new Error('Unbalanced physical save');
  if (
    !Array.isArray(value.production.machines) ||
    !Array.isArray(value.quality.qcLab.contaminationAlerts) ||
    !Array.isArray(value.maintenance.workOrders) ||
    !Array.isArray(value.participants)
  )
    throw new Error('Invalid physical lists');
  const machines = value.production.machines;
  const machineIds = new Set<string>();
  for (const machine of machines) {
    if (
      !machine ||
      typeof machine.id !== 'string' ||
      !machine.id ||
      machineIds.has(machine.id) ||
      typeof machine.name !== 'string' ||
      !Object.values(MachineType).includes(machine.type) ||
      !['running', 'idle', 'warning', 'critical'].includes(machine.status) ||
      ![machine.position, machine.size].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
      ) ||
      !Number.isFinite(machine.rotation) ||
      !machine.metrics ||
      !['rpm', 'temperature', 'vibration', 'load', 'wear', 'efficiency'].every((k) =>
        Number.isFinite(machine.metrics[k as keyof typeof machine.metrics])
      ) ||
      typeof machine.lastMaintenance !== 'string' ||
      typeof machine.nextMaintenance !== 'string'
    )
      throw new Error('Invalid saved machine');
    machineIds.add(machine.id);
  }
  const orderIds = new Set<string>();
  for (const order of value.operations.orders) {
    if (
      !order ||
      typeof order.id !== 'string' ||
      orderIds.has(order.id) ||
      typeof order.customer !== 'string' ||
      !order.recipe ||
      !['flour', 'semolina'].includes(order.recipe.finishedMaterial) ||
      !['wheat_grain', 'corn_grain'].includes(order.recipe.sourceMaterial) ||
      !['planned', 'active', 'late', 'fulfilled', 'cancelled'].includes(order.status) ||
      [order.requiredKg, order.shippedKg, order.qualityFailureKg, order.dueAtMinute].some(
        (n) => !nonnegative(n)
      ) ||
      ![order.batchIds, order.manifestIds].every(
        (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')
      )
    )
      throw new Error('Invalid saved order');
    orderIds.add(order.id);
  }
  if (
    Object.values(value.maintenance.partsInventory).some(
      (n) => !nonnegative(n) || !Number.isInteger(n)
    ) ||
    value.maintenance.workOrders.some(
      (w) =>
        !w ||
        !machineIds.has(w.machineId) ||
        ![
          'diagnosed',
          'awaiting_parts',
          'repairing',
          'verification',
          'ready_to_restart',
          'restart_requested',
          'returned_to_service',
        ].includes(w.phase) ||
        !Array.isArray(w.audit) ||
        ![w.requiredParts, w.consumedParts].every(
          (parts) =>
            Array.isArray(parts) && parts.every((p) => p in value.maintenance.partsInventory)
        )
    )
  )
    throw new Error('Invalid saved maintenance');
  for (const alert of value.quality.qcLab.contaminationAlerts.filter((a) => !a.resolved)) {
    if (
      alert.batchIds.some(
        (id) =>
          !m.productionBatches.some(
            (b) => b.id === id && b.disposition !== 'released' && b.disposition !== 'shipped'
          )
      )
    )
      throw new Error('Unbound quality hold');
    if (
      alert.sourceLotIds.some(
        (id) => !m.sourceLots.has(id) || m.sourceLots.get(id)?.disposition === 'released'
      )
    )
      throw new Error('Unbound source hold');
  }
  const participantIds = value.participants.map((p) => p.id);
  if (new Set(participantIds).size !== participantIds.length)
    throw new Error('Duplicate continuation');
  if (value.participants.some((p) => typeof p.id !== 'string' || p.value === undefined))
    throw new Error('Invalid continuation');
  if (REQUIRED_REPLAY_PARTICIPANTS.some((id) => !participantIds.includes(id)))
    throw new Error('Incomplete scene continuation');
  value.logistics = validateSavedLogisticsLayout(value.logistics, value.production.machines);
  return value;
}

let pending: PhysicalSession | null = null;
export const isPhysicalSessionRestoring = () => pending !== null;

function restoreStores(saved: PhysicalSession) {
  resetThrottledBagState();
  useMaterialFlowStore.setState(saved.material);
  useOperationsCampaignStore.setState({
    ...saved.operations,
    creditedBatchKg: compactBatchCreditKeys(saved.operations.creditedBatchKg),
  });
  useBreakdownStore.setState(saved.maintenance);
  useTruckScheduleStore.setState(saved.trucks);
  useQCLabStore.setState(saved.quality);
  useSafetyStore.setState(saved.safety);
  useAchievementsStore.setState(saved.achievements);
  useProductionStore.setState({ ...saved.production, scadaLive: false });
  useLogisticsLayoutStore.getState().restoreSaved(saved.logistics);
  // Frame-driven owners also observe gameSpeed; hold them through warm-up,
  // then resume the saved pace together with the central clock. A save taken
  // under a tour or other session hold resumes the pace the player had chosen,
  // and a save from before the single time model maps its 180 default to 30.
  const savedHolds = Array.isArray(saved.game.clockHolds) ? saved.game.clockHolds : [];
  useGameSimulationStore.setState({
    ...saved.game,
    gameSpeed: migrateLegacyGameSpeed(
      persistedGameSpeed({ gameSpeed: saved.game.gameSpeed, clockHolds: savedHolds })
    ),
    clockHolds: [],
    isTabVisible: !document.hidden,
  });
  useGameSimulationStore.getState().holdClock('restore');
}

function finishRestore() {
  const startup = getStartupSnapshot();
  if (!pending || !(startup.opened || startup.ready) || missingReplayParticipants().length) return;
  const owners = captureReplayParticipants();
  if (pending.participants.some((p) => !owners.some((o) => o.id === p.id)))
    throw new Error('Scene continuation changed');
  const saved = pending;
  restoreReplayParticipants(
    owners
      .filter((o) => saved.participants.some((p) => p.id === o.id))
      .map((o) => ({ ...o, value: saved.participants.find((p) => p.id === o.id)!.value }))
  );
  // The mount hook resets tick carry, so restore it only after the real assembly
  // registers. The existing clock restore rebases elapsed render time.
  restoreUnifiedTickState(saved.tick);
  centralTick.restoreClock(saved.clock);
  useProductionStore.getState().setProductionSpeed(saved.production.productionSpeed);
  useGameSimulationStore.getState().releaseClock('restore');
  pending = null;
}

export function installPhysicalSession(
  providedStorage?: Pick<Storage, 'getItem' | 'setItem'>
): () => void {
  let disabled = false,
    writing = false,
    queued = false,
    saveFailed = false,
    lastWritten: string | null = null;
  const notify = (id: string, type: 'info' | 'warning', title: string, message: string) =>
    useUIStore.getState().addAlert({
      id,
      type,
      title,
      message,
      timestamp: new Date(),
      acknowledged: false,
    });
  // Working if only a record this tab could not load pauses the shift: halt()
  // guards restore integrity, notify() reports a save problem while play goes on.
  const halt = (message: string, error?: unknown) => {
    if (error !== undefined) console.error('[physicalSession] restore failed:', error);
    disabled = true;
    useGameSimulationStore.getState().holdClock('restoreFailed');
    notify(
      'physical-save-unavailable',
      'warning',
      translate(messages, 'saveNeedsAttention'),
      translate(messages, 'resetHint', { reason: message })
    );
  };
  const localControl = () =>
    !peekSCADAService() || peekSCADAService()?.getState().mode === 'simulation';
  let storage: Pick<Storage, 'getItem' | 'setItem'>;
  try {
    storage = providedStorage ?? window.localStorage;
  } catch {
    halt(translate(messages, 'storageUnavailable'));
    return () => {
      pending = null;
    };
  }
  try {
    const raw = storage.getItem(PHYSICAL_SESSION_KEY);
    if (raw) {
      if (!localControl()) throw new Error('Physical resume requires local simulation control');
      const saved = decodePhysicalSession(raw);
      restoreStores(saved);
      pending = saved;
      lastWritten = raw;
    }
  } catch (error) {
    halt(translate(messages, 'restoreFailed'), error);
  }
  const save = () => {
    const startup = getStartupSnapshot();
    if (
      disabled ||
      writing ||
      pending ||
      !(startup.opened || startup.ready) ||
      missingReplayParticipants().length ||
      isWorkplaceReplayActive() ||
      !localControl()
    )
      return;
    writing = true;
    try {
      // Reset Simulation clears local storage before reload. Never resurrect it.
      // Another tab owns a non-null record: stop writing here, keep this shift running.
      if (storage.getItem(PHYSICAL_SESSION_KEY) !== lastWritten) {
        disabled = true;
        if (storage.getItem(PHYSICAL_SESSION_KEY) !== null)
          notify(
            'physical-save-other-tab',
            'info',
            translate(messages, 'otherTabTitle'),
            translate(messages, 'otherTabMessage')
          );
        return;
      }
      cleanupThrottledBags();
      const raw = encodePhysicalSession(capturePhysicalSession());
      storage.setItem(PHYSICAL_SESSION_KEY, raw);
      lastWritten = raw;
      saveFailed = false;
    } catch (error) {
      // Working if a failed cycle keeps the last good record, retries on the next
      // interval and alerts once per failure run; only a quota error blames storage.
      // An oversized record fails every cycle until it shrinks, so it is named
      // as a stop, not a skip, and logged once per run rather than every 5 s.
      const name = (error as { name?: unknown } | null)?.name;
      const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
      const tooLarge = error instanceof PhysicalSaveTooLargeError;
      if (!saveFailed) {
        console.error('[physicalSession] autosave failed:', error);
        notify(
          'physical-autosave-skipped',
          'info',
          translate(messages, tooLarge ? 'autosaveStoppedTitle' : 'autosaveSkippedTitle'),
          tooLarge
            ? translate(messages, 'autosaveTooLarge')
            : quota
              ? translate(messages, 'autosaveSkippedQuota')
              : translate(messages, 'autosaveSkippedMessage')
        );
      }
      saveFailed = true;
    } finally {
      writing = false;
    }
  };
  const queue = () => {
    if (queued || disabled) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      save();
    });
  };
  const startup = subscribeStartup(() => {
    try {
      finishRestore();
    } catch (error) {
      halt(translate(messages, 'continuationFailed'), error);
    }
  });
  // Coalesce a quality or repair action after all its synchronous store writes.
  // Ordinary stock/clock autosaves are paced, with a latest-state flush on exit.
  const qc = useQCLabStore.subscribe(queue);
  const logistics = useLogisticsLayoutStore.subscribe((now, before) => {
    if (now.revision !== before.revision) queue();
  });
  const maintenance = useBreakdownStore.subscribe((now, before) => {
    if (
      now.idSequence !== before.idSequence ||
      now.partsInventory !== before.partsInventory ||
      now.maintenanceSchedule !== before.maintenanceSchedule ||
      // Repair progress now advances every tick on the shift clock, so it rides
      // the paced autosave; its start and finish are phase changes above.
      now.workOrders.some((w, i) => w.phase !== before.workOrders[i]?.phase)
    )
      queue();
  });
  // A scene owner that fails to mount (an error boundary renders nothing) holds a
  // restored clock at 0 and stops autosave with no sign. Never resume a half-
  // restored shift; say what happened instead. Working if a required owner still
  // missing ~20 s after the scene is ready raises one notice per outage.
  let missingChecks = 0,
    sceneWarned = false;
  const watchScene = () => {
    if (
      disabled ||
      !getStartupSnapshot().ready ||
      isWorkplaceReplayActive() ||
      !missingReplayParticipants().length
    ) {
      missingChecks = 0;
      sceneWarned = false;
      return;
    }
    if (++missingChecks < 4 || sceneWarned) return;
    sceneWarned = true;
    if (pending)
      notify(
        'physical-scene-incomplete',
        'warning',
        translate(messages, 'sceneWaitingTitle'),
        translate(messages, 'sceneWaitingMessage')
      );
    else
      notify(
        'physical-scene-incomplete',
        'info',
        translate(messages, 'autosavePausedTitle'),
        translate(messages, 'autosavePausedMessage')
      );
  };
  const timer = window.setInterval(() => {
    watchScene();
    save();
  }, 5000);
  window.addEventListener('pagehide', save);
  const visibility = () => {
    if (document.hidden) save();
  };
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.clearInterval(timer);
    startup();
    qc();
    logistics();
    maintenance();
    window.removeEventListener('pagehide', save);
    document.removeEventListener('visibilitychange', visibility);
    pending = null;
  };
}
