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
import type { WorkplaceProfile, WorkplaceTransitionResult } from '../types/workplace';
import type { WorkplaceCheckpointInfo, WorkplaceReplayRun } from '../types/workplaceReplay';

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
  useGameSimulationStore.setState({ ...saved.game, gameSpeed: 0 });
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
  if (game.gameSpeed !== 0) return 'Pause the simulation before capturing or rewinding.';
  if (selectSafetyHoldActive(game) || useSafetyStore.getState().forkliftEmergencyStop)
    return 'Resolve the site safety hold first. Replay cannot clear emergency authority.';
  const service = peekSCADAService();
  if (service && service.getState().mode !== 'simulation')
    return 'Replay is available only with local simulation control, never live or hybrid SCADA.';
  if (useQCLabStore.getState().qcLab.isRunning)
    return 'Finish the current laboratory test before capturing or rewinding.';
  const state = useWorkplaceStore.getState().workplace;
  if (state.improvement)
    return 'Retain the handoff trial and its reviews. Replay cannot rewind an improvement cycle.';
  if (state.mode !== 'game') return 'Choose Game mode for an operational replay.';
  if (campaignTotals(state).members.some((m) => m.recoveryOwedMinutes > 1e-8))
    return 'Deliver all earned recovery before rewinding. Repayment cannot be erased.';
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
      return result('Choose a whole-number seed from 1 to 2147483647.');
    const state = useWorkplaceStore.getState().workplace;
    if (
      get().activeRunId ||
      !['idle', 'deliberating'].includes(state.phase) ||
      state.minute !== 0 ||
      state.campaign?.history.length ||
      state.finance.wagesPaid !== 0 ||
      state.members.some((m) => m.extraMinutes > 0 || m.earnedPay > 0)
    )
      return result(
        'Capture an untouched starting discussion. Complete and record this run first.'
      );
    const missing = missingReplayParticipants();
    if (missing.length) return result(`Wait for the complete local scene: ${missing.join(', ')}.`);
    const operations = useOperationsCampaignStore.getState();
    const order = operations.orders.find((o) => o.id === operations.activeOrderId);
    if (
      !order ||
      operations.activeChallenge ||
      ['fulfilled', 'cancelled'].includes(order.status) ||
      order.requiredKg <= order.shippedKg ||
      order.qualityFailureKg !== 0
    )
      return result(
        'Select an open, quality-qualified customer order without a recovery challenge.'
      );
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
    if (!checkpoint || !raw) return result('Capture a paused starting situation first.');
    if (!['toe-dip', 'team', 'cooperative'].includes(profile))
      return result('Choose a known charter.');
    if (!replayParticipantsAvailable(raw.participants) || missingReplayParticipants().length)
      return result(
        'The scene changed. Reloading or remounting invalidates an in-memory checkpoint.'
      );
    if (useMaterialFlowStore.getState().sessionId !== raw.plant.material.sessionId)
      return result(
        'The material session changed. Start a new experiment from an untouched discussion.'
      );
    const state = useWorkplaceStore.getState().workplace;
    if (get().activeRunId) {
      const recorded = get().record();
      if (!recorded.changed) return recorded;
    } else if (
      !['idle', 'deliberating'].includes(state.phase) ||
      state.minute !== 0 ||
      state.finance.wagesPaid !== 0
    )
      return result('Finish and record the current shift before starting another replay.');
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
        rollbackComplete
          ? 'Restoration failed. The prior situation was restored; capture a fresh checkpoint.'
          : 'Restoration and rollback failed. The game remains paused; checkpoint disabled. Reload before another experiment. Reviewed receipts remain available.'
      );
    }
  },
  record: () => {
    const checkpoint = get().checkpoint;
    const id = get().activeRunId;
    if (!checkpoint || !saved || !id) return result('Start a checkpoint run before recording.');
    const service = peekSCADAService();
    if (service && service.getState().mode !== 'simulation')
      return result(
        'Matched evidence requires local simulation control. Live or hybrid control cannot be recorded as a replay.'
      );
    const state = useWorkplaceStore.getState().workplace;
    const totals = campaignTotals(state);
    if (state.phase !== 'review' || totals.members.some((m) => m.recoveryOwedMinutes > 1e-8))
      return result('Review the shift and deliver all earned recovery before recording.');
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
      return result(
        'The linked order or material evidence changed. No matched run can be recorded.'
      );
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
      return result('Finish the agreement and repay recovery before ending the experiment.');
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
      scope: 'Synthetic local game runs; actual ledger deltas, no real-worker efficacy claim.',
      checkpoint,
      runs,
      limits:
        'Starting conditions match. Frame-driven vehicle motion can differ between runs. Compare elapsed and agreement time; no winner or trust score is inferred. Raw checkpoints and consent are never exported.',
    },
    null,
    2
  );
}
