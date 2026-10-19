import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  WorkplaceMission,
  WorkplaceActions,
  WorkplaceState,
  WorkplaceProfile,
  WorkplaceTransitionResult,
} from '../types/workplace';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useProductionStore } from './productionStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { getDispatchQualityStatus, useQCLabStore } from './qcLabStore';
import { capturePackingPlant, derivePackingAdvice } from '../simulation/workplaceAdvice';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import { handoffHoldsClock, workplaceMission } from '../simulation/workplaceImprovement';
import { safeJSONStorage } from './storage';
import { isWorkplaceReplayActive } from '../simulation/workplaceReplayRuntime';
import { translate } from '../i18n';
import { workplaceStoreMessages as msg } from './workplaceStore.messages';

import {
  ROLE_COMMANDS,
  interruptAutomaticWorkplace,
  isRoleCommand,
  commandActor,
  turnChecks,
  type RoleCommand,
  type TurnCheckId,
} from '../simulation/workplaceParticipation';

const MAX_COMPLETED_CAMPAIGNS = 6;

/** A fresh link to the mill's active order, when it is open and quality-qualified. */
function openActiveOrderMission(exceptOrderId?: string): WorkplaceMission | undefined {
  const operations = useOperationsCampaignStore.getState();
  const order = operations.orders.find((o) => o.id === operations.activeOrderId);
  if (
    !order ||
    order.id === exceptOrderId ||
    order.status === 'fulfilled' ||
    order.status === 'cancelled' ||
    operations.activeChallenge ||
    order.qualityFailureKg !== 0 ||
    order.requiredKg <= order.shippedKg
  )
    return undefined;
  return {
    orderId: order.id,
    customer: order.customer,
    materialSessionId: useMaterialFlowStore.getState().sessionId,
    startingShippedKg: order.shippedKg,
    originalTargetKg: order.requiredKg - order.shippedKg,
    targetKg: order.requiredKg - order.shippedKg,
    observedShippedKg: order.shippedKg,
    creditedKg: 0,
    manifestIds: [...order.manifestIds],
    evidence: 'current',
  };
}

/**
 * The order the next campaign shift links, if any: the mill's open active
 * order, once the order being worked is fulfilled or the follow-on's evidence
 * has gone bad (cancelled, quality-failed or stale), the two cases the engine
 * accepts a new link for. Read-only, so the season card can say what happens.
 * Working if a bad follow-on is replaced, a fulfilled commitment is never
 * relinked to itself, and the last shift offers nothing.
 */
export function pendingFollowOn(state: WorkplaceState): WorkplaceMission | undefined {
  const campaign = state.campaign;
  if (!campaign?.mission || campaign.shift >= 2) return undefined;
  const link = campaign.followOn ?? campaign.mission;
  const fulfilled =
    useOperationsCampaignStore.getState().orders.find((o) => o.id === link.orderId)?.status ===
    'fulfilled';
  if (!fulfilled && (!campaign.followOn || campaign.followOn.evidence === 'current'))
    return undefined;
  // A stale link to an order still open may be relinked fresh; it starts at
  // that order's current shipped weight, so no earlier dispatch is re-credited.
  const next = openActiveOrderMission(fulfilled ? link.orderId : undefined);
  return next && next.orderId !== campaign.mission.orderId ? next : undefined;
}
/** Observation only. Freshness is checked against the current physical facts,
 * rather than assuming that a matching order id makes its execution cache fresh. */
export function captureCurrentPackingPlant(state: WorkplaceState) {
  const material = useMaterialFlowStore.getState();
  const production = useProductionStore.getState();
  const operations = useOperationsCampaignStore.getState();
  const order = operations.orders.find((o) => o.id === operations.activeOrderId) ?? null;
  const mission = workplaceMission(state);
  const execution = operations.execution;
  const qualityRelease =
    getDispatchQualityStatus(useQCLabStore.getState().qcLab, material.productionBatches).released &&
    !operations.getIncidentEffect().dispatchBlocked;
  const packed = material.productionBatches.filter(
    (b) => b.materialType === order?.recipe.finishedMaterial
  );
  const released = packed
    .filter((b) => b.disposition === 'released')
    .reduce((n, b) => n + b.availableKg, 0);
  const available = packed.reduce((n, b) => n + b.availableKg, 0);
  const inventory = (type: string | undefined) =>
    [...material.machineBuffers.values()].reduce(
      (n, b) =>
        n +
        [...b.inputBuffer, ...b.outputBuffer].reduce(
          (v, m) => v + (m.type === type ? m.amount : 0),
          0
        ),
      0
    ) +
    material.network.segments.reduce(
      (n, segment) =>
        n + segment.inTransit.reduce((v, m) => v + (m.type === type ? m.amount : 0), 0),
      0
    );
  const dock = useTruckScheduleStore.getState().truckSchedule.shipping;
  const loadPresent = ['loading', 'held', 'ready'].includes(execution.dispatchLoad.status);
  const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 0.01;
  const executionFresh =
    !!order &&
    (!mission || mission.orderId === order.id) &&
    operations.lastMaterialSessionId === material.sessionId &&
    execution.orderId === order.id &&
    execution.recipeId === order.recipe.id &&
    execution.sourceMaterial === order.recipe.sourceMaterial &&
    execution.finishedMaterial === order.recipe.finishedMaterial &&
    close(execution.remainingKg, Math.max(0, order.requiredKg - order.shippedKg)) &&
    close(execution.sourceInventoryKg, inventory(order.recipe.sourceMaterial)) &&
    close(execution.finishedAvailableKg, available) &&
    close(execution.releasedFinishedKg, released) &&
    execution.qualityReleased === qualityRelease &&
    loadPresent === dock.transferReady;
  // Reflect machine actions even if the material coupling tick has not yet run.
  const machines = new Map(production.machines.map((m) => [m.id, m]));
  const flow = {
    ...material,
    machineBuffers: new Map(
      [...material.machineBuffers].map(([id, b]) => {
        const m = machines.get(id);
        return [
          id,
          { ...b, isProcessing: !!m && (m.status === 'running' || m.status === 'warning') },
        ];
      })
    ),
  };
  const gameSpeed = useGameSimulationStore.getState().gameSpeed;
  return capturePackingPlant(flow, {
    order,
    missionMaterialSessionId: mission?.materialSessionId ?? material.sessionId,
    productionSpeed: production.productionSpeed,
    campaignMultiplier: operations.getProductionMultiplier(),
    gameSpeed: gameSpeed > 0 ? gameSpeed : 30,
    qualityRelease,
    dispatchLoad: execution.dispatchLoad,
    executionFresh,
  });
}
const recoveryOutstanding = (state: WorkplaceState) =>
  state.members.some((member) => member.recoveryOwedMinutes > 0) ||
  state.campaign?.history.some((shift) =>
    shift.members.some((member) => member.recoveryOwedMinutes > 0)
  );

function completedReview(input: unknown): WorkplaceState | null {
  const restored = restoreWorkplace(input);
  if (
    restored.mode !== 'game' ||
    restored.phase !== 'review' ||
    restored.campaign?.shift !== 2 ||
    restored.campaign.history.length !== 2 ||
    recoveryOutstanding(restored) ||
    restored.objections.some((objection) => objection.status === 'open')
  )
    return null;
  // The validated review is redacted again so private role preferences never
  // reappear in retained records, including after rehydration.
  return saveWorkplace(restored) as WorkplaceState;
}

/** A season left early: a validated, redacted stopped review that owes nothing. */
function leftReview(input: unknown): WorkplaceState | null {
  const restored = restoreWorkplace(input);
  if (
    restored.mode !== 'game' ||
    restored.phase !== 'review' ||
    !restored.campaign ||
    restored.improvement ||
    recoveryOutstanding(restored) ||
    restored.objections.some((objection) => objection.status === 'open')
  )
    return null;
  return saveWorkplace(restored) as WorkplaceState;
}

function retainedLeftSeasons(input: unknown): WorkplaceState[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-MAX_COMPLETED_CAMPAIGNS)
    .map(leftReview)
    .filter((review): review is WorkplaceState => review !== null);
}

function retainedReviews(input: unknown): WorkplaceState[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-MAX_COMPLETED_CAMPAIGNS)
    .map(completedReview)
    .filter((review): review is WorkplaceState => review !== null);
}

export interface WorkplaceStore extends WorkplaceActions {
  participationMode: 'solo' | 'separate-turns';
  turn: {
    token: string;
    actorId: string;
    anchor: WorkplaceState;
    answers: Partial<Record<TurnCheckId, string>>;
  } | null;
  setParticipationMode: (mode: 'solo' | 'separate-turns') => WorkplaceTransitionResult;
  startTurn: (actorId: string) => WorkplaceTransitionResult;
  endTurn: () => WorkplaceTransitionResult;
  answerTurnCheck: (
    token: string,
    question: TurnCheckId,
    answer: string
  ) => WorkplaceTransitionResult;
  runTurnCommand: (token: string, command: RoleCommand) => WorkplaceTransitionResult;
  rehearseReload: (revision: number) => WorkplaceTransitionResult;
  workplace: WorkplaceState;
  completedCampaigns: WorkplaceState[];
  /** Seasons left before their final review, kept with what they earned. */
  leftCampaigns: WorkplaceState[];
  startMission: (profile: WorkplaceProfile, seed?: number) => WorkplaceTransitionResult;
  archiveCampaign: (expectedRevision: number) => WorkplaceTransitionResult;
}

export const useWorkplaceStore = create<WorkplaceStore>()(
  persist(
    (set, get) => {
      const apply = (command: WorkplaceCommand, token?: string) => {
        if (command.type !== 'tick') interruptAutomaticWorkplace();
        const access = get();
        if (access.participationMode === 'separate-turns') {
          if (isRoleCommand(command)) {
            const turn = access.turn;
            if (
              isWorkplaceReplayActive() ||
              !turn ||
              token !== turn.token ||
              turn.anchor !== access.workplace ||
              commandActor(command) !== turn.actorId
            )
              return {
                changed: false,
                reason: translate(msg, 'useCurrentTurn'),
              };
            if (command.type === 'respondToPressure' && command.args[1] === 'accept-demand')
              return {
                changed: false,
                reason: translate(msg, 'challengeCannotSpeak'),
              };
            if (
              ['understand', 'acknowledgeImprovement'].includes(command.type) &&
              !turnChecks(access.workplace).every((q) => turn.answers[q.id] === q.correct)
            )
              return {
                changed: false,
                reason: translate(msg, 'answerChecksFirst'),
              };
          } else if (command.type === 'simulateResponses')
            return {
              changed: false,
              reason: translate(msg, 'simulatedResponsesDisabled'),
            };
          else if (command.type !== 'tick' && command.type !== 'stop' && access.turn)
            return {
              changed: false,
              reason: translate(msg, 'endTurnBeforeSetup'),
            };
        }
        if (
          [
            'beginImprovement',
            'continueImprovement',
            'cancelImprovement',
            'closeImprovement',
          ].includes(command.type) &&
          isWorkplaceReplayActive()
        )
          return {
            changed: false,
            reason: translate(msg, 'finishReplayBeforeObligations'),
          };
        const { state, changed, reason } = transitionWorkplace(get().workplace, command);
        if (changed) {
          const turn = get().turn;
          set({
            workplace: state,
            turn:
              turn && state.revision === turn.anchor.revision && state.phase === turn.anchor.phase
                ? { ...turn, anchor: state }
                : null,
          });
        }
        return { changed, reason };
      };
      const linkedMission = (mode = get().workplace.mode) => {
        const state = get().workplace;
        if (mode !== 'game') return undefined;
        const retained = workplaceMission(state);
        const operations = useOperationsCampaignStore.getState();
        const order = operations.orders.find(
          (o) => o.id === (retained?.orderId ?? operations.activeOrderId)
        );
        if (!order || order.status === 'cancelled')
          return retained ? { ...retained, evidence: 'missing' as const } : undefined;
        if (
          !retained &&
          (order.status === 'fulfilled' || order.qualityFailureKg > 0 || operations.activeChallenge)
        )
          return undefined;
        const mission = retained ?? {
          orderId: order.id,
          customer: order.customer,
          materialSessionId: useMaterialFlowStore.getState().sessionId,
          startingShippedKg: order.shippedKg,
          originalTargetKg: order.requiredKg - order.shippedKg,
          targetKg: order.requiredKg - order.shippedKg,
          observedShippedKg: order.shippedKg,
          creditedKg: 0,
          manifestIds: [...order.manifestIds],
          evidence: 'current' as const,
        };
        return {
          ...mission,
          observedShippedKg: order.shippedKg,
          creditedKg: order.shippedKg - mission.startingShippedKg,
          manifestIds: [...order.manifestIds],
          evidence:
            mission.materialSessionId !== useMaterialFlowStore.getState().sessionId
              ? ('stale' as const)
              : order.qualityFailureKg > 0
                ? ('quality-failed' as const)
                : ('current' as const),
        };
      };
      const presentAdvice = (token?: string) => {
        const current = get().workplace;
        const advice =
          current.mode === 'game' && current.improvement?.proposalId
            ? derivePackingAdvice(
                captureCurrentPackingPlant(current),
                current.improvement.stopped ? 'steady' : current.improvement.proposalId
              )
            : undefined;
        return apply({ type: 'acknowledgeImprovement', args: advice ? [advice] : [] }, token);
      };
      return {
        participationMode: 'solo',
        turn: null,
        setParticipationMode: (mode) => {
          const s = get().workplace;
          if (
            !['solo', 'separate-turns'].includes(mode) ||
            s.phase !== 'idle' ||
            s.campaign ||
            s.improvement ||
            s.events.length ||
            s.members.some((m) => m.earnedPay || m.recoveryOwedMinutes) ||
            isWorkplaceReplayActive()
          )
            return {
              changed: false,
              reason: translate(msg, 'chooseModeBeforeScenario'),
            };
          set({ participationMode: mode, turn: null });
          return { changed: true, reason: null };
        },
        startTurn: (actorId) => {
          const s = get().workplace;
          if (
            get().participationMode !== 'separate-turns' ||
            get().turn ||
            isWorkplaceReplayActive() ||
            s.phase === 'idle' ||
            ![...s.members.map((m) => m.id), 'mind'].includes(actorId)
          )
            return {
              changed: false,
              reason: translate(msg, 'chooseFictionalRole'),
            };
          set({ turn: { token: crypto.randomUUID(), actorId, anchor: s, answers: {} } });
          return { changed: true, reason: null };
        },
        endTurn: () => {
          set({ turn: null });
          return { changed: true, reason: null };
        },
        answerTurnCheck: (token, question, answer) => {
          const { turn, workplace } = get();
          const q = turnChecks(workplace).find((q) => q.id === question);
          if (
            get().participationMode !== 'separate-turns' ||
            isWorkplaceReplayActive() ||
            !turn ||
            turn.token !== token ||
            turn.anchor !== workplace ||
            workplace.phase !== 'deliberating' ||
            !q ||
            !q.options.some((o) => o.value === answer)
          )
            return {
              changed: false,
              reason: translate(msg, 'knownAnswerRequired'),
            };
          if (turn.answers[question] === answer)
            return { changed: false, reason: translate(msg, 'answerUnchanged') };
          const state = structuredClone(workplace);
          const actor = state.members.find((m) => m.id === turn.actorId);
          if (actor) {
            actor.understood = false;
            actor.ballot = null;
            actor.coverConsent = null;
          } else {
            if (state.improvement) state.improvement.acknowledged = false;
            if (state.campaign) {
              state.campaign.adviserAcknowledged = false;
              state.campaign.checks.mind = {};
            }
          }
          set({
            workplace: state,
            turn: { ...turn, anchor: state, answers: { ...turn.answers, [question]: answer } },
          });
          return { changed: true, reason: answer === q.correct ? null : q.clarification };
        },
        runTurnCommand: (token, command) => {
          if (!isRoleCommand(command))
            return { changed: false, reason: translate(msg, 'roleDecisionsOnly') };
          return command.type === 'acknowledgeImprovement'
            ? presentAdvice(token)
            : apply(command, token);
        },
        rehearseReload: (revision) => {
          interruptAutomaticWorkplace();
          if (revision !== get().workplace.revision || isWorkplaceReplayActive())
            return {
              changed: false,
              reason: translate(msg, 'readBeforeReload'),
            };
          set({ workplace: restoreWorkplace(saveWorkplace(get().workplace)), turn: null });
          return {
            changed: true,
            reason: translate(msg, 'reloadRehearsed'),
          };
        },
        beginImprovement: (profile, revision, _mission, mode = get().workplace.mode) =>
          apply({ type: 'beginImprovement', args: [profile, revision, linkedMission(mode), mode] }),
        cancelImprovement: (...args) => apply({ type: 'cancelImprovement', args }),
        proposeImprovement: (...args) => apply({ type: 'proposeImprovement', args }),
        challengeImprovement: (...args) => apply({ type: 'challengeImprovement', args }),
        acknowledgeImprovement: () => presentAdvice(),
        setImprovementEpisode: (...args) => apply({ type: 'setImprovementEpisode', args }),
        respondImprovementEpisode: (...args) => apply({ type: 'respondImprovementEpisode', args }),
        stopImprovement: (...args) => apply({ type: 'stopImprovement', args }),
        acknowledgeImprovementReview: (...args) =>
          apply({ type: 'acknowledgeImprovementReview', args }),
        voteImprovementReview: (...args) => apply({ type: 'voteImprovementReview', args }),
        finishImprovementReview: (...args) => apply({ type: 'finishImprovementReview', args }),
        continueImprovement: (revision) =>
          apply({ type: 'continueImprovement', args: [revision, linkedMission()] }),
        closeImprovement: (revision) => {
          const origin = get().workplace.improvement?.origin;
          const result = apply({ type: 'closeImprovement', args: [revision] });
          // A season the experiment opened from is kept as archiving or leaving
          // keeps it: completed after its final review, otherwise left early.
          // Working if closing never silently drops the season it began from.
          const completed = result.changed && origin ? completedReview(origin) : null;
          const left = result.changed && origin?.campaign && !completed ? leftReview(origin) : null;
          if (completed)
            set({
              completedCampaigns: [...get().completedCampaigns, completed].slice(
                -MAX_COMPLETED_CAMPAIGNS
              ),
            });
          if (left)
            set({
              leftCampaigns: [...get().leftCampaigns, left].slice(-MAX_COMPLETED_CAMPAIGNS),
            });
          return result;
        },
        workplace: createWorkplace(),
        completedCampaigns: [],
        archiveCampaign: (expectedRevision) => {
          interruptAutomaticWorkplace();
          if (get().participationMode === 'separate-turns' && get().turn)
            return { changed: false, reason: translate(msg, 'endTurnBeforeArchive') };
          const current = get().workplace;
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
            return {
              changed: false,
              reason: translate(msg, 'reviewChanged'),
            };
          if (isWorkplaceReplayActive())
            return { changed: false, reason: translate(msg, 'finishReplayFirst') };
          if (
            current.mode !== 'game' ||
            current.phase !== 'review' ||
            current.campaign?.shift !== 2 ||
            current.campaign.history.length !== 2
          )
            return {
              changed: false,
              reason: translate(msg, 'completeThreeShifts'),
            };
          if (
            recoveryOutstanding(current) ||
            current.objections.some((objection) => objection.status === 'open') ||
            current.finance.wageReserve > 0 ||
            current.finance.compensationReserve > 0 ||
            current.activeCoverMemberId !== null ||
            current.coverRemainingMinutes > 0
          )
            return {
              changed: false,
              reason: translate(msg, 'settleBeforeArchive'),
            };
          const review = completedReview(saveWorkplace(current));
          if (!review)
            return {
              changed: false,
              reason: translate(msg, 'reviewNotValidated'),
            };
          const fresh = createWorkplace('game', current.seed === 0xffffffff ? 1 : current.seed + 1);
          fresh.revision = current.revision + 1;
          set({
            workplace: fresh,
            turn: null,
            completedCampaigns: [...get().completedCampaigns, review].slice(
              -MAX_COMPLETED_CAMPAIGNS
            ),
          });
          return { changed: true, reason: null };
        },
        leftCampaigns: [],
        leaveCampaign: (expectedRevision) => {
          interruptAutomaticWorkplace();
          if (get().participationMode === 'separate-turns' && get().turn)
            return { changed: false, reason: translate(msg, 'endTurnBeforeLeave') };
          const current = get().workplace;
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
            return { changed: false, reason: translate(msg, 'reviewChanged') };
          if (isWorkplaceReplayActive())
            return { changed: false, reason: translate(msg, 'finishReplayFirst') };
          const result = transitionWorkplace(current, {
            type: 'leaveCampaign',
            args: [expectedRevision],
          });
          if (!result.changed) return { changed: false, reason: result.reason };
          // An unworked deliberation is kept as stopped, never as a worked shift.
          const stopped =
            current.phase === 'deliberating'
              ? transitionWorkplace(current, { type: 'stop', args: [] }).state
              : current;
          const record = leftReview(saveWorkplace(stopped));
          if (!record) return { changed: false, reason: translate(msg, 'reviewNotValidated') };
          set({
            workplace: result.state,
            turn: null,
            leftCampaigns: [...get().leftCampaigns, record].slice(-MAX_COMPLETED_CAMPAIGNS),
          });
          return { changed: true, reason: null };
        },
        startMission: (profile, seed = 1) => {
          const mission = openActiveOrderMission();
          if (!mission)
            return {
              changed: false,
              reason: translate(msg, 'openCommitmentRequired'),
            };
          return apply({ type: 'startCampaign', args: [profile, seed, mission] });
        },
        startCampaign: (...args) => apply({ type: 'startCampaign', args }),
        // Once the order being worked is fulfilled, or a follow-on can no
        // longer earn, the next shift works the mill's active order, so later
        // dispatch still earns the cooperative (see pendingFollowOn).
        nextCampaignShift: () => {
          const next = pendingFollowOn(get().workplace);
          return apply({ type: 'nextCampaignShift', args: next ? [next] : [] });
        },
        answerCheck: (...args) => apply({ type: 'answerCheck', args }),
        campaignDecision: (...args) => apply({ type: 'campaignDecision', args }),
        respondToPressure: (...args) => apply({ type: 'respondToPressure', args }),
        start: (...args) => apply({ type: 'start', args }),
        configure: (...args) => apply({ type: 'configure', args }),
        selectPlan: (...args) => apply({ type: 'selectPlan', args }),
        understand: (...args) => apply({ type: 'understand', args }),
        vote: (...args) => apply({ type: 'vote', args }),
        consentToCover: (...args) => apply({ type: 'consentToCover', args }),
        sharePreference: (...args) => apply({ type: 'sharePreference', args }),
        chooseTask: (...args) => apply({ type: 'chooseTask', args }),
        simulateResponses: (...args) => apply({ type: 'simulateResponses', args }),
        object: (...args) => apply({ type: 'object', args }),
        resolveObjection: (...args) => apply({ type: 'resolveObjection', args }),
        activate: (...args) => {
          interruptAutomaticWorkplace();
          const safety = useGameSimulationStore.getState();
          if (
            get().workplace.mode === 'game' &&
            (safety.emergencyActive || safety.emergencyDrillMode)
          )
            return {
              changed: false,
              reason: translate(msg, 'safetyStopHolds'),
            };
          if (get().participationMode === 'separate-turns' && get().turn)
            return {
              changed: false,
              reason: translate(msg, 'endTurnBeforeActivation'),
            };
          const mission = workplaceMission(get().workplace);
          if (mission && mission.materialSessionId !== useMaterialFlowStore.getState().sessionId)
            return {
              changed: false,
              reason: translate(msg, 'materialSessionChanged'),
            };
          const current = get().workplace;
          if (current.mode === 'game' && current.improvement) {
            const advice = current.improvement.advice;
            if (!advice || advice.fingerprint !== captureCurrentPackingPlant(current).fingerprint)
              return {
                changed: false,
                reason: translate(msg, 'freshAdviceRequired'),
              };
          }
          const refreshed = current.improvement && linkedMission();
          if (refreshed && refreshed.evidence !== 'current')
            return {
              changed: false,
              reason: translate(msg, 'dispatchEvidenceRequired'),
            };
          const activationInput = refreshed
            ? { ...current, improvement: { ...current.improvement!, mission: refreshed } }
            : current;
          const result = transitionWorkplace(activationInput, { type: 'activate', args });
          if (result.changed) set({ workplace: result.state, turn: null });
          return { changed: result.changed, reason: result.reason };
        },
        withdraw: (...args) => apply({ type: 'withdraw', args }),
        stop: (...args) => apply({ type: 'stop', args }),
        tick: (...args) => {
          const mission = workplaceMission(get().workplace);
          const followOn = get().workplace.campaign?.followOn;
          const observe = (orderId: string) => {
            const order = useOperationsCampaignStore
              .getState()
              .orders.find((o) => o.id === orderId);
            return {
              orderId: order?.id ?? null,
              materialSessionId: useMaterialFlowStore.getState().sessionId,
              shippedKg: order?.shippedKg ?? 0,
              qualityFailureKg: order?.qualityFailureKg ?? 0,
              manifestIds: [...(order?.manifestIds ?? [])],
              cancelled: order?.status === 'cancelled',
            };
          };
          if (mission)
            apply({
              type: 'tick',
              args: [
                args[0],
                args[1],
                args[2],
                observe(mission.orderId),
                followOn ? observe(followOn.orderId) : undefined,
              ],
            });
          else apply({ type: 'tick', args });
        },
        elect: (...args) => apply({ type: 'elect', args }),
        voteSurplus: (...args) => apply({ type: 'voteSurplus', args }),
        distributeSurplus: (...args) => apply({ type: 'distributeSurplus', args }),
      };
    },
    {
      name: 'millos-workplace-laboratory',
      version: 2,
      storage: safeJSONStorage,
      partialize: (state) => ({
        participationMode: state.participationMode,
        workplace: saveWorkplace(state.workplace),
        completedCampaigns: state.completedCampaigns.map(saveWorkplace),
        leftCampaigns: state.leftCampaigns.map(saveWorkplace),
      }),
      migrate: (persisted, version) => {
        if (version !== 1 || !persisted || typeof persisted !== 'object') return {};
        return {
          participationMode:
            'participationMode' in persisted ? persisted.participationMode : 'solo',
          workplace: 'workplace' in persisted ? persisted.workplace : null,
          completedCampaigns: [],
          leftCampaigns: [],
        };
      },
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === 'object' ? persisted : {};
        return {
          ...current,
          participationMode:
            !('participationMode' in saved) || saved.participationMode === 'solo'
              ? 'solo'
              : 'separate-turns',
          turn: null,
          workplace: restoreWorkplace('workplace' in saved ? saved.workplace : null),
          completedCampaigns: retainedReviews(
            'completedCampaigns' in saved ? saved.completedCampaigns : null
          ),
          leftCampaigns: retainedLeftSeasons('leftCampaigns' in saved ? saved.leftCampaigns : null),
        };
      },
    }
  )
);

// External replay replacement (including rollback) cannot retain a participant grant.
// Working if any out-of-band workplace replacement invalidates its anchored turn.
useWorkplaceStore.subscribe(({ workplace, turn }) => {
  if (turn && turn.anchor !== workplace) useWorkplaceStore.setState({ turn: null });
});

// The handoff hold is derived from workplace state, never pushed by a button,
// so a restore, replay rollback or persist merge re-establishes or ends it.
// Working if the clock is held exactly while handoffHoldsClock is true and a
// pace chosen meanwhile is the pace the plant resumes at.
function syncHandoffHold(workplace: WorkplaceState) {
  const clock = useGameSimulationStore.getState();
  const held = clock.clockHolds.some((hold) => hold.holder === 'handoff');
  if (handoffHoldsClock(workplace)) {
    if (!held || clock.gameSpeed > 0) clock.holdClock('handoff');
  } else if (held) clock.releaseClock('handoff');
}
useWorkplaceStore.subscribe(({ workplace }, previous) => {
  if (workplace !== previous.workplace) syncHandoffHold(workplace);
});
syncHandoffHold(useWorkplaceStore.getState().workplace);

/** Captures a render's token so retained callbacks cannot borrow the next turn. */
export function useWorkplaceControls() {
  const store = useWorkplaceStore();
  if (store.participationMode === 'solo') return store;
  const controls = { ...store };
  for (const type of ROLE_COMMANDS) {
    Reflect.set(controls, type, (...args: unknown[]) =>
      store.runTurnCommand(store.turn?.token ?? '', { type, args } as RoleCommand)
    );
  }
  return controls;
}
