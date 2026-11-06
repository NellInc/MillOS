import { create } from 'zustand';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  campaignRelationship,
  campaignTotals,
  restoreRelationshipEvents,
} from '../simulation/workplaceCampaign';
import {
  beginReplayClock,
  captureReplayParticipants,
  endReplayClock,
  isWorkplaceReplayActive,
  missingReplayParticipants,
  notifyReplayRecordChanged,
  replayParticipantsAvailable,
  restoreReplayParticipants,
} from '../simulation/workplaceReplayRuntime';
import { captureUnifiedTickState, restoreUnifiedTickState } from '../systems/UnifiedGameTick';
import { centralTick } from '../systems/CentralTickSystem';
import { peekSCADAService } from '../scada/SCADAService';
import {
  useProductionStore,
  cleanupThrottledBags,
  resetThrottledBagState,
} from './productionStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore, selectSafetyHoldActive } from './gameSimulationStore';
import { promoteCoveredOrders, useBreakdownStore } from './breakdownStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { useQCLabStore } from './qcLabStore';
import { useSafetyStore } from './safetyStore';
import { useAchievementsStore } from './achievementsStore';
import { useAnnouncementsStore } from './announcementsStore';
import { useUIStore } from './uiStore';
import { useWorkplaceStore } from './workplaceStore';
import { captureSavedLogisticsLayout, useLogisticsLayoutStore } from './logisticsLayoutStore';
import type { WorkplaceProfile, WorkplaceTransitionResult } from '../types/workplace';
import type { WorkplaceCheckpointInfo, WorkplaceReplayRun } from '../types/workplaceReplay';
import { formatFixed, translate } from '../i18n';
import { workplaceReplayStoreMessages as msg } from './workplaceReplayStore.messages';

type Data<S> = {
  [K in keyof S as S[K] extends (...args: never[]) => unknown ? never : K]: S[K];
};
function data<S extends object>(state: S): Data<S> {
  return structuredClone(
    Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
  ) as Data<S>;
}
function capturePlant() {
  return {
    logistics: captureSavedLogisticsLayout(),
    production: data(useProductionStore.getState()),
    material: data(useMaterialFlowStore.getState()),
    operations: data(useOperationsCampaignStore.getState()),
    game: data(useGameSimulationStore.getState()),
    breakdown: data(useBreakdownStore.getState()),
    trucks: data(useTruckScheduleStore.getState()),
    quality: data(useQCLabStore.getState()),
    safety: data(useSafetyStore.getState()),
    achievements: data(useAchievementsStore.getState()),
    announcements: data(useAnnouncementsStore.getState()),
    alerts: structuredClone(useUIStore.getState().alerts),
    tick: captureUnifiedTickState(),
    centralClock: centralTick.captureClock(),
  };
}
function restorePlant(raw: ReturnType<typeof capturePlant>) {
  const saved = structuredClone(raw);
  resetThrottledBagState();
  useMaterialFlowStore.setState(saved.material);
  useOperationsCampaignStore.setState(saved.operations);
  // Restored paused, before any tick: settle part reservations now.
  useBreakdownStore.setState({
    ...saved.breakdown,
    workOrders: promoteCoveredOrders(saved.breakdown.workOrders, saved.breakdown.partsInventory),
  });
  useTruckScheduleStore.setState(saved.trucks);
  useQCLabStore.setState(saved.quality);
  useSafetyStore.setState(saved.safety);
  useAchievementsStore.setState(saved.achievements);
  // Only the plant-time record comes back: the PA mode, caption setting and
  // live context are the player's, and captions from the checkpoint describe a
  // plant that is not running, so they return retired, kept in the transcript.
  useAnnouncementsStore.setState({
    announcements: saved.announcements.announcements.map((entry) => ({
      ...entry,
      dismissed: true,
    })),
    lastAnnouncementTime: saved.announcements.lastAnnouncementTime,
  });
  useUIStore.setState({ alerts: saved.alerts });
  useProductionStore.setState({ ...saved.production, scadaLive: false });
  // Clock ownership is live, not checkpoint data. Preserve exact hold objects
  // through both restoration and rollback, including participant-added holds.
  useGameSimulationStore.setState((live) => ({
    ...saved.game,
    gameSpeed: live.gameSpeed,
    clockHolds: live.clockHolds,
  }));
  useLogisticsLayoutStore.getState().restoreSaved(saved.logistics);
  restoreUnifiedTickState(saved.tick);
  centralTick.restoreClock(saved.centralClock);
}

// Opaque raw state is deliberately absent from Zustand, persistence and exports.
let saved: {
  plant: ReturnType<typeof capturePlant>;
  participants: ReturnType<typeof captureReplayParticipants>;
  epoch: number;
} | null = null;
let sequence = 0;
const result = (reason: string | null = null): WorkplaceTransitionResult => ({
  changed: reason === null,
  reason,
});
type ReplayReasonKey = Exclude<keyof typeof msg.en, 'seedRange' | 'reportScope' | 'reportLimits'>;
// A refusal keeps its key, so the replay panel's status follows a language
// switch. Working if a refused capture reads in Portuguese after one.
const refuse = (key: ReplayReasonKey, params?: { missing: string }): WorkplaceTransitionResult => ({
  changed: false,
  reason: translate(msg, key, params),
  reasonCopy: { catalog: 'replay', key, ...(params ? { params } : {}) },
});
function safetyReason(): ReplayReasonKey | null {
  // Participant turns, their checks and role commands all refuse while a
  // replay runs, so a replay under separate turns could never be agreed or run.
  // Working if separate turns are refused before any checkpoint or restore.
  if (useWorkplaceStore.getState().participationMode !== 'solo') return 'soloOnly';
  const game = useGameSimulationStore.getState();
  if (game.gameSpeed !== 0) return 'pauseFirst';
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return 'safetyHold';
  const service = peekSCADAService();
  if (service && service.getState().mode !== 'simulation') return 'localControlOnly';
  if (useQCLabStore.getState().qcLab.isRunning) return 'labTestRunning';
  const state = useWorkplaceStore.getState().workplace;
  if (state.improvement) return 'improvementActive';
  if (state.mode !== 'game') return 'gameModeOnly';
  if (campaignTotals(state).members.some((m) => m.recoveryOwedMinutes > 1e-8))
    return 'recoveryOwed';
  return null;
}

interface WorkplaceReplayStore {
  checkpoint: WorkplaceCheckpointInfo | null;
  runs: WorkplaceReplayRun[];
  activeRunId: string | null;
  guided: boolean;
  capture: (seed: number) => WorkplaceTransitionResult;
  begin: (profile: WorkplaceProfile) => WorkplaceTransitionResult;
  record: () => WorkplaceTransitionResult;
  forget: () => WorkplaceTransitionResult;
  setGuided: (guided: boolean) => void;
}

export const useWorkplaceReplayStore = create<WorkplaceReplayStore>((set, get) => {
  /** Builds and keeps the live run's review; whether the replay ends is the caller's. */
  const recordRun = (): WorkplaceTransitionResult => {
    const checkpoint = get().checkpoint;
    const id = get().activeRunId;
    if (!checkpoint || !saved || !id) return refuse('startRunFirst');
    const service = peekSCADAService();
    if (service && service.getState().mode !== 'simulation') return refuse('matchedEvidenceLocal');
    const state = useWorkplaceStore.getState().workplace;
    const totals = campaignTotals(state);
    if (state.phase !== 'review' || totals.members.some((m) => m.recoveryOwedMinutes > 1e-8))
      return refuse('reviewBeforeRecording');
    const mission = state.campaign?.mission;
    const operations = useOperationsCampaignStore.getState();
    const order = operations.orders.find((o) => o.id === checkpoint.orderId);
    if (
      !mission ||
      !order ||
      mission.evidence !== 'current' ||
      mission.materialSessionId !== saved.plant.material.sessionId ||
      useMaterialFlowStore.getState().sessionId !== saved.plant.material.sessionId
    )
      return refuse('evidenceChanged');
    const startingOrder = saved.plant.operations.orders.find((o) => o.id === checkpoint.orderId)!;
    const accounts = [...(state.campaign?.history.map((h) => h.finance) ?? []), state.finance];
    const sum = (key: 'wagesPaid' | 'compensationPaid' | 'improvementSpend') =>
      accounts.reduce((n, f) => n + f[key], 0);
    const plantCosts = (economics: typeof operations.economics) =>
      Object.entries(economics).reduce((n, [key, value]) => n + (key === 'revenue' ? 0 : value), 0);
    const run: WorkplaceReplayRun = {
      id,
      checkpointId: checkpoint.id,
      profile: state.campaign!.profile,
      planId: state.planId,
      charter: {
        practices: [...state.practices],
        workerAutonomy: state.workerAutonomy,
        governance: state.governance,
        aiAuthority: state.aiAuthority,
      },
      shiftPlans: [
        ...state.campaign!.history.map((h) => ({ shift: h.shift, planId: h.planId })),
        { shift: state.campaign!.shift, planId: state.planId },
      ],
      shiftCount: totals.shiftsReviewed,
      elapsedMinutes: operations.elapsedMinutes - saved.plant.operations.elapsedMinutes,
      agreementMinutes: state.minute + state.campaign!.history.reduce((n, h) => n + h.minute, 0),
      targetKg: mission.targetKg,
      deferredKg: mission.originalTargetKg - mission.targetKg,
      dispatchedKg: Math.max(0, order.shippedKg - startingOrder.shippedKg),
      remainingKg: Math.max(0, order.requiredKg - order.shippedKg),
      manifestIds: order.manifestIds.filter(
        (manifestId) => !startingOrder.manifestIds.includes(manifestId)
      ),
      materialErrorKg: useMaterialFlowStore.getState().getMaterialBalance().errorKg,
      genealogyErrorKg: useMaterialFlowStore.getState().getGenealogyBalance().errorKg,
      financial: {
        plantRevenue: operations.economics.revenue - saved.plant.operations.economics.revenue,
        plantCosts: plantCosts(operations.economics) - plantCosts(saved.plant.operations.economics),
        workplaceWages: sum('wagesPaid'),
        compensation: sum('compensationPaid'),
        improvements: sum('improvementSpend'),
      },
      members: totals.members.map(({ refusalsRespected, ...member }) => ({
        ...member,
        refusalRespected: refusalsRespected > 0,
      })),
      receipts: campaignRelationship(state).map((receipt) => ({
        shift: receipt.shift,
        events: receipt.events === null ? null : restoreRelationshipEvents(receipt.events),
      })),
      objections: state.objections.map(({ actorId, kind, status }) => ({ actorId, kind, status })),
      objectionsRaised: totals.objectionsRaised,
      objectionsResolved: totals.objectionsResolved,
      refusalsRespected: totals.refusalsRespected,
      promisesKept: totals.promisesKept,
    };
    set({ runs: [...get().runs.filter((r) => r.id !== id), run].slice(-12) });
    return result();
  };
  return {
    checkpoint: null,
    runs: [],
    activeRunId: null,
    guided: false,
    setGuided: (guided) => set({ guided }),
    capture: (seed) => {
      const reason = safetyReason();
      if (reason) return refuse(reason);
      if (!Number.isSafeInteger(seed) || seed < 1 || seed > 2147483647)
        return result(translate(msg, 'seedRange', { max: formatFixed(2147483647, 0) }));
      const state = useWorkplaceStore.getState().workplace;
      // A retained run is recorded and its season is ordinary play, so only a
      // live run blocks a fresh capture. Working if Capture works once a
      // retained run's season has been left or archived.
      if (
        selectReplayRunLive(get()) ||
        !['idle', 'deliberating'].includes(state.phase) ||
        state.minute !== 0 ||
        state.campaign?.history.length ||
        state.finance.wagesPaid !== 0 ||
        state.members.some((m) => m.extraMinutes > 0 || m.earnedPay > 0)
      )
        return refuse('untouchedStart');
      const missing = missingReplayParticipants();
      if (missing.length) return refuse('waitForScene', { missing: missing.join(', ') });
      const operations = useOperationsCampaignStore.getState();
      const order = operations.orders.find((o) => o.id === operations.activeOrderId);
      if (
        !order ||
        operations.activeChallenge ||
        ['fulfilled', 'cancelled'].includes(order.status) ||
        order.requiredKg <= order.shippedKg ||
        order.qualityFailureKg !== 0
      )
        return refuse('openOrderRequired');
      cleanupThrottledBags();
      const plant = capturePlant();
      const participants = captureReplayParticipants();
      const checkpoint: WorkplaceCheckpointInfo = {
        id: `plant-${++sequence}`,
        orderId: order.id,
        customer: order.customer,
        remainingKg: order.requiredKg - order.shippedKg,
        seed,
        gameDay: plant.game.gameDay,
        gameTime: plant.game.gameTime,
        sourceKg: [...plant.material.machineBuffers.values()].reduce(
          (total, buffer) =>
            total +
            [...buffer.inputBuffer, ...buffer.outputBuffer].reduce(
              (n, parcel) =>
                n +
                (parcel.type === 'wheat_grain' || parcel.type === 'corn_grain' ? parcel.amount : 0),
              0
            ),
          0
        ),
        faults: plant.breakdown.activeBreakdowns.map((fault) => ({
          machineName: fault.machineName,
          type: fault.type,
        })),
        participantIds: participants.map((p) => p.id),
      };
      saved = { plant, participants, epoch: Date.now() };
      // Retained runs stay for comparison (the learning review names a changed
      // checkpoint); only Forget discards them.
      set({ checkpoint, activeRunId: null });
      return result();
    },
    begin: (profile) => {
      const reason = safetyReason();
      if (reason) return refuse(reason);
      const checkpoint = get().checkpoint;
      const raw = saved;
      if (!checkpoint || !raw) return refuse('captureFirst');
      if (!['toe-dip', 'team', 'cooperative'].includes(profile)) return refuse('knownCharter');
      if (!replayParticipantsAvailable(raw.participants) || missingReplayParticipants().length)
        return refuse('sceneChanged');
      if (useMaterialFlowStore.getState().sessionId !== raw.plant.material.sessionId)
        return refuse('materialSessionChanged');
      const state = useWorkplaceStore.getState().workplace;
      const activeRunId = get().activeRunId;
      // A retained run is fixed and its season is saved: rewinding never records
      // it again, and never throws away a shift begun in it since the retain.
      const retained =
        activeRunId !== null &&
        !isWorkplaceReplayActive() &&
        get().runs.some((run) => run.id === activeRunId);
      if (retained) {
        if (state.phase === 'active') return refuse('finishCurrentShift');
      } else if (activeRunId) {
        // Retained on the way to the next charter, with the clock still running,
        // so the disk keeps the pre-replay pair the physical session holds.
        const recorded = recordRun();
        if (!recorded.changed) return recorded;
      } else if (
        !['idle', 'deliberating'].includes(state.phase) ||
        state.minute !== 0 ||
        state.finance.wagesPaid !== 0
      )
        return refuse('finishCurrentShift');
      const rollback = capturePlant();
      const rollbackParticipants = captureReplayParticipants();
      beginReplayClock(checkpoint.seed, raw.epoch);
      try {
        restorePlant(raw.plant);
        restoreReplayParticipants(raw.participants);
        const fresh = createWorkplace('game', checkpoint.seed);
        fresh.revision = state.revision + 1;
        useWorkplaceStore.setState({ workplace: fresh });
        const started = useWorkplaceStore.getState().startMission(profile, checkpoint.seed);
        if (!started.changed) throw new Error(started.reason ?? 'Agreement could not start.');
        useGameSimulationStore.getState().holdClock('workplace');
        set({ activeRunId: `run-${++sequence}` });
        return result();
      } catch {
        // Internal participant failures fail closed; the prior reviewed receipts survive.
        let rollbackComplete = true;
        try {
          restorePlant(rollback);
          restoreReplayParticipants(rollbackParticipants);
        } catch {
          rollbackComplete = false;
        }
        useWorkplaceStore.setState({ workplace: state });
        endReplayClock();
        saved = null;
        set({ checkpoint: null, activeRunId: null, guided: false });
        if (!rollbackComplete) useGameSimulationStore.getState().holdClock('restoreFailed');
        return refuse(rollbackComplete ? 'restorationFailed' : 'rollbackFailed');
      }
    },
    record: () => {
      const id = get().activeRunId;
      if (id && !isWorkplaceReplayActive() && get().runs.some((run) => run.id === id))
        return refuse('alreadyRetained');
      const recorded = recordRun();
      if (!recorded.changed) return recorded;
      // A retained review keeps the replay's plant, so the replay ends here: the
      // physical session saves again and the season it retained is written, while
      // the checkpoint stays for further charters (begin restarts the clock).
      // Working if a reload after retaining returns to the retained review.
      endReplayClock();
      useWorkplaceStore.setState({});
      notifyReplayRecordChanged();
      return recorded;
    },
    forget: () => {
      const state = useWorkplaceStore.getState().workplace;
      if (
        state.phase === 'active' ||
        campaignTotals(state).members.some((m) => m.recoveryOwedMinutes > 1e-8)
      )
        return refuse('finishAgreement');
      saved = null;
      endReplayClock();
      // The replay's plant now stays (the physical session saves again), so the
      // workplace it left is written too; nothing was written while it ran.
      useWorkplaceStore.setState({});
      set({ checkpoint: null, runs: [], activeRunId: null, guided: false });
      // The plant record is written in the same microtask as the workplace.
      notifyReplayRecordChanged();
      return result();
    },
  };
});

/**
 * A run is live from its start until it is retained. A retained run's season is
 * the saved one (record ends the replay), so it blocks nothing a replay blocks.
 */
export const selectReplayRunLive = (state: {
  activeRunId: string | null;
  runs: WorkplaceReplayRun[];
}) => state.activeRunId !== null && !state.runs.some((run) => run.id === state.activeRunId);

export function exportWorkplaceReplayReport() {
  const { checkpoint, runs } = useWorkplaceReplayStore.getState();
  return JSON.stringify(
    {
      schemaVersion: 1,
      scope: translate(msg, 'reportScope'),
      checkpoint,
      runs,
      limits: translate(msg, 'reportLimits'),
    },
    null,
    2
  );
}
