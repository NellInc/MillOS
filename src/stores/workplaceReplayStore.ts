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
  missingReplayParticipants,
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
import { useBreakdownStore } from './breakdownStore';
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
  useBreakdownStore.setState(saved.breakdown);
  useTruckScheduleStore.setState(saved.trucks);
  useQCLabStore.setState(saved.quality);
  useSafetyStore.setState(saved.safety);
  useAchievementsStore.setState(saved.achievements);
  useAnnouncementsStore.setState(saved.announcements);
  useUIStore.setState({ alerts: saved.alerts });
  useProductionStore.setState({ ...saved.production, scadaLive: false });
  // A replay restore holds the clock for the workplace step it replays, so the
  // pace control names the hold and its own Resume releases it.
  useGameSimulationStore.setState({
    ...saved.game,
    gameSpeed: 0,
    clockHolds: [{ holder: 'workplace', resumeSpeed: 0 }],
  });
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
function safetyReason() {
  const game = useGameSimulationStore.getState();
  if (game.gameSpeed !== 0) return translate(msg, 'pauseFirst');
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return translate(msg, 'safetyHold');
  const service = peekSCADAService();
  if (service && service.getState().mode !== 'simulation')
    return translate(msg, 'localControlOnly');
  if (useQCLabStore.getState().qcLab.isRunning) return translate(msg, 'labTestRunning');
  const state = useWorkplaceStore.getState().workplace;
  if (state.improvement) return translate(msg, 'improvementActive');
  if (state.mode !== 'game') return translate(msg, 'gameModeOnly');
  if (campaignTotals(state).members.some((m) => m.recoveryOwedMinutes > 1e-8))
    return translate(msg, 'recoveryOwed');
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

export const useWorkplaceReplayStore = create<WorkplaceReplayStore>((set, get) => ({
  checkpoint: null,
  runs: [],
  activeRunId: null,
  guided: false,
  setGuided: (guided) => set({ guided }),
  capture: (seed) => {
    const reason = safetyReason();
    if (reason) return result(reason);
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 2147483647)
      return result(translate(msg, 'seedRange', { max: formatFixed(2147483647, 0) }));
    const state = useWorkplaceStore.getState().workplace;
    if (
      get().activeRunId ||
      !['idle', 'deliberating'].includes(state.phase) ||
      state.minute !== 0 ||
      state.campaign?.history.length ||
      state.finance.wagesPaid !== 0 ||
      state.members.some((m) => m.extraMinutes > 0 || m.earnedPay > 0)
    )
      return result(translate(msg, 'untouchedStart'));
    const missing = missingReplayParticipants();
    if (missing.length)
      return result(translate(msg, 'waitForScene', { missing: missing.join(', ') }));
    const operations = useOperationsCampaignStore.getState();
    const order = operations.orders.find((o) => o.id === operations.activeOrderId);
    if (
      !order ||
      operations.activeChallenge ||
      ['fulfilled', 'cancelled'].includes(order.status) ||
      order.requiredKg <= order.shippedKg ||
      order.qualityFailureKg !== 0
    )
      return result(translate(msg, 'openOrderRequired'));
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
      faults: plant.breakdown.activeBreakdowns.map(
        (fault) => `${fault.machineName}: ${fault.type}`
      ),
      participantIds: participants.map((p) => p.id),
    };
    saved = { plant, participants, epoch: Date.now() };
    set({ checkpoint, runs: [], activeRunId: null });
    return result();
  },
  begin: (profile) => {
    const reason = safetyReason();
    if (reason) return result(reason);
    const checkpoint = get().checkpoint;
    const raw = saved;
    if (!checkpoint || !raw) return result(translate(msg, 'captureFirst'));
    if (!['toe-dip', 'team', 'cooperative'].includes(profile))
      return result(translate(msg, 'knownCharter'));
    if (!replayParticipantsAvailable(raw.participants) || missingReplayParticipants().length)
      return result(translate(msg, 'sceneChanged'));
    if (useMaterialFlowStore.getState().sessionId !== raw.plant.material.sessionId)
      return result(translate(msg, 'materialSessionChanged'));
    const state = useWorkplaceStore.getState().workplace;
    if (get().activeRunId) {
      const recorded = get().record();
      if (!recorded.changed) return recorded;
    } else if (
      !['idle', 'deliberating'].includes(state.phase) ||
      state.minute !== 0 ||
      state.finance.wagesPaid !== 0
    )
      return result(translate(msg, 'finishCurrentShift'));
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
      return result(
        rollbackComplete ? translate(msg, 'restorationFailed') : translate(msg, 'rollbackFailed')
      );
    }
  },
  record: () => {
    const checkpoint = get().checkpoint;
    const id = get().activeRunId;
    if (!checkpoint || !saved || !id) return result(translate(msg, 'startRunFirst'));
    const service = peekSCADAService();
    if (service && service.getState().mode !== 'simulation')
      return result(translate(msg, 'matchedEvidenceLocal'));
    const state = useWorkplaceStore.getState().workplace;
    const totals = campaignTotals(state);
    if (state.phase !== 'review' || totals.members.some((m) => m.recoveryOwedMinutes > 1e-8))
      return result(translate(msg, 'reviewBeforeRecording'));
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
      return result(translate(msg, 'evidenceChanged'));
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
  },
  forget: () => {
    const state = useWorkplaceStore.getState().workplace;
    if (
      state.phase === 'active' ||
      campaignTotals(state).members.some((m) => m.recoveryOwedMinutes > 1e-8)
    )
      return result(translate(msg, 'finishAgreement'));
    saved = null;
    endReplayClock();
    set({ checkpoint: null, runs: [], activeRunId: null, guided: false });
    return result();
  },
}));

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
