import {
  useProductionStore,
  cleanupThrottledBags,
  resetThrottledBagState,
} from '../stores/productionStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
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

export const PHYSICAL_SESSION_KEY = 'millos-physical-session';
const MAX_SAVE_BYTES = 3_000_000;
type Data<S> = { [K in keyof S as S[K] extends (...args: never[]) => unknown ? never : K]: S[K] };
function data<S extends object>(state: S): Data<S> {
  return structuredClone(
    Object.fromEntries(
      Object.entries(state).filter(([, v]) => typeof v !== 'function' && v !== undefined)
    )
  ) as Data<S>;
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
    production: data(useProductionStore.getState()),
    material: data(useMaterialFlowStore.getState()),
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
export function encodePhysicalSession(value: PhysicalSession): string {
  const encoded = JSON.stringify(value, function (this: Record<string, unknown>, key, v: unknown) {
    const original = this[key];
    if (original instanceof Date) return { [TAG]: 'date', value: original.toISOString() };
    if (original instanceof Map) return { [TAG]: 'map', value: [...original] };
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Non-finite saved value');
    return v;
  });
  if (encoded.length * 2 > MAX_SAVE_BYTES) throw new Error('Physical save is too large');
  return encoded;
}

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
  if (raw.length * 2 > MAX_SAVE_BYTES) throw new Error('Physical save is too large');
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
  validateTree(value, { left: 200_000 });
  if (!value || value.version !== 1) throw new Error('Unsupported physical save');
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
        throw new Error('Unknown physical field');
      const before = (expected as Record<string, unknown>)[key];
      if (
        before instanceof Map
          ? !(entry instanceof Map)
          : Array.isArray(before)
            ? !Array.isArray(entry)
            : before !== null && typeof before !== typeof entry
      )
        throw new Error('Invalid physical field');
    }
    for (const key of Object.keys(expected))
      if (!(key in saved)) throw new Error('Incomplete physical domain');
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
  useOperationsCampaignStore.setState(saved.operations);
  useBreakdownStore.setState(saved.maintenance);
  useTruckScheduleStore.setState(saved.trucks);
  useQCLabStore.setState(saved.quality);
  useSafetyStore.setState(saved.safety);
  useAchievementsStore.setState(saved.achievements);
  useProductionStore.setState({ ...saved.production, scadaLive: false });
  useLogisticsLayoutStore.getState().restoreSaved(saved.logistics);
  // Frame-driven owners also observe gameSpeed; hold them through warm-up,
  // then resume the saved speed together with the central clock.
  useGameSimulationStore.setState({ ...saved.game, gameSpeed: 0, isTabVisible: !document.hidden });
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
  useGameSimulationStore.getState().setGameSpeed(saved.game.gameSpeed);
  pending = null;
}

export function installPhysicalSession(
  providedStorage?: Pick<Storage, 'getItem' | 'setItem'>
): () => void {
  let disabled = false,
    writing = false,
    queued = false,
    lastWritten: string | null = null;
  const warn = (message: string) => {
    disabled = true;
    useGameSimulationStore.getState().setGameSpeed(0);
    useUIStore.getState().addAlert({
      id: 'physical-save-unavailable',
      type: 'warning',
      title: 'Shift save needs attention',
      message,
      timestamp: new Date(),
      acknowledged: false,
    });
  };
  const localControl = () =>
    !peekSCADAService() || peekSCADAService()?.getState().mode === 'simulation';
  let storage: Pick<Storage, 'getItem' | 'setItem'>;
  try {
    storage = providedStorage ?? window.localStorage;
  } catch {
    warn(
      'Browser storage is unavailable. This shift is paused and cannot be saved in this browser.'
    );
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
  } catch {
    warn(
      'The saved physical shift could not be restored. Its record is retained. The clock is paused and this tab will not overwrite it.'
    );
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
      if (storage.getItem(PHYSICAL_SESSION_KEY) !== lastWritten) {
        if (storage.getItem(PHYSICAL_SESSION_KEY) !== null)
          warn(
            'The saved shift changed outside this tab. Reload to use that record; this tab is paused and will not overwrite it.'
          );
        else disabled = true;
        return;
      }
      cleanupThrottledBags();
      const raw = encodePhysicalSession(capturePhysicalSession());
      storage.setItem(PHYSICAL_SESSION_KEY, raw);
      lastWritten = raw;
    } catch {
      warn(
        'Your latest physical shift could not be saved. Earlier saved progress is retained. Free browser storage before continuing; reloading may lose unsaved changes.'
      );
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
    } catch {
      warn(
        'Scene continuation could not be restored. The saved record is retained and the clock is paused.'
      );
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
      now.workOrders.some((w, i) => w.phase !== before.workOrders[i]?.phase) ||
      now.activeBreakdowns.some(
        (b, i) => b.repairProgress !== before.activeBreakdowns[i]?.repairProgress
      )
    )
      queue();
  });
  const timer = window.setInterval(save, 5000);
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
