import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
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
import { workplaceMission } from '../simulation/workplaceImprovement';
import { safeJSONStorage } from './storage';
import { isWorkplaceReplayActive } from '../simulation/workplaceReplayRuntime';

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
                reason:
                  'Hand over to this role and use its current turn. Facilitators cannot record participant decisions.',
              };
            if (command.type === 'respondToPressure' && command.args[1] === 'accept-demand')
              return {
                changed: false,
                reason:
                  'This authored challenge cannot speak for a participant. Hand over to the affected role to raise its own objection.',
              };
            if (
              ['understand', 'acknowledgeImprovement'].includes(command.type) &&
              !turnChecks(access.workplace).every((q) => turn.answers[q.id] === q.correct)
            )
              return {
                changed: false,
                reason:
                  'Answer the current mandate, refusal and optional-duty checks correctly before confirming understanding.',
              };
          } else if (command.type === 'simulateResponses')
            return {
              changed: false,
              reason:
                'Separate turns require each role decision. Simulated responses are disabled.',
            };
          else if (command.type !== 'tick' && command.type !== 'stop' && access.turn)
            return {
              changed: false,
              reason: 'End the participant turn before facilitator setup or settlement.',
            };
        }
        if (
          ['beginImprovement', 'continueImprovement'].includes(command.type) &&
          isWorkplaceReplayActive()
        )
          return {
            changed: false,
            reason: 'Finish or forget the matched replay before continuing workplace obligations.',
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
              reason: 'Choose the interaction mode only before opening an untouched scenario.',
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
              reason:
                'End the previous turn and choose a fictional role in an open scenario, outside replay.',
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
              reason: 'Use a known answer in the current participant turn.',
            };
          if (turn.answers[question] === answer)
            return { changed: false, reason: 'Answer unchanged.' };
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
            return { changed: false, reason: 'Participant dispatch accepts role decisions only.' };
          return command.type === 'acknowledgeImprovement'
            ? presentAdvice(token)
            : apply(command, token);
        },
        rehearseReload: (revision) => {
          interruptAutomaticWorkplace();
          if (revision !== get().workplace.revision || isWorkplaceReplayActive())
            return {
              changed: false,
              reason: 'Read the current workplace outside replay before rehearsing reload.',
            };
          set({ workplace: restoreWorkplace(saveWorkplace(get().workplace)), turn: null });
          return {
            changed: true,
            reason:
              'Local reload rehearsal completed. Future authority expired; earned pay and recovery remain in review.',
          };
        },
        beginImprovement: (profile, revision, _mission, mode = get().workplace.mode) =>
          apply({ type: 'beginImprovement', args: [profile, revision, linkedMission(mode), mode] }),
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
        workplace: createWorkplace(),
        completedCampaigns: [],
        archiveCampaign: (expectedRevision) => {
          interruptAutomaticWorkplace();
          if (get().participationMode === 'separate-turns' && get().turn)
            return { changed: false, reason: 'End the participant turn before archiving.' };
          const current = get().workplace;
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
            return {
              changed: false,
              reason: 'The review changed. Read its current outcome first.',
            };
          if (isWorkplaceReplayActive())
            return { changed: false, reason: 'Finish or forget the matched replay first.' };
          if (
            current.mode !== 'game' ||
            current.phase !== 'review' ||
            current.campaign?.shift !== 2 ||
            current.campaign.history.length !== 2
          )
            return {
              changed: false,
              reason: 'Complete all three shifts before archiving a review.',
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
              reason:
                'Deliver owed recovery and settle objections and reserved pay before archiving.',
            };
          const review = completedReview(saveWorkplace(current));
          if (!review)
            return {
              changed: false,
              reason: 'This review could not be validated for the archive.',
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
        startMission: (profile, seed = 1) => {
          const operations = useOperationsCampaignStore.getState();
          const order = operations.orders.find((o) => o.id === operations.activeOrderId);
          if (
            !order ||
            order.status === 'fulfilled' ||
            order.status === 'cancelled' ||
            operations.activeChallenge ||
            order.qualityFailureKg !== 0 ||
            order.requiredKg <= order.shippedKg
          )
            return {
              changed: false,
              reason:
                'Choose an open, quality-qualified customer commitment with no active recovery challenge.',
            };
          return apply({
            type: 'startCampaign',
            args: [
              profile,
              seed,
              {
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
              },
            ],
          });
        },
        startCampaign: (...args) => apply({ type: 'startCampaign', args }),
        nextCampaignShift: (...args) => apply({ type: 'nextCampaignShift', args }),
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
              reason:
                'The safety stop holds this agreement. No new work during an emergency or drill.',
            };
          if (get().participationMode === 'separate-turns' && get().turn)
            return {
              changed: false,
              reason: 'End the participant turn before facilitator activation.',
            };
          const mission = workplaceMission(get().workplace);
          if (mission && mission.materialSessionId !== useMaterialFlowStore.getState().sessionId)
            return {
              changed: false,
              reason:
                'The physical material session changed. Historical receipts cannot authorise a new agreement.',
            };
          const current = get().workplace;
          if (current.mode === 'game' && current.improvement) {
            const advice = current.improvement.advice;
            if (!advice || advice.fingerprint !== captureCurrentPackingPlant(current).fingerprint)
              return {
                changed: false,
                reason:
                  'Plant evidence or the intended pace changed. Hear a fresh adviser response, then confirm understanding and ballots again.',
              };
          }
          const refreshed = current.improvement && linkedMission();
          if (refreshed && refreshed.evidence !== 'current')
            return {
              changed: false,
              reason:
                'Current quality-qualified dispatch evidence is required before funding a trial.',
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
          if (mission) {
            const order = useOperationsCampaignStore
              .getState()
              .orders.find((o) => o.id === mission.orderId);
            apply({
              type: 'tick',
              args: [
                args[0],
                args[1],
                args[2],
                {
                  orderId: order?.id ?? null,
                  materialSessionId: useMaterialFlowStore.getState().sessionId,
                  shippedKg: order?.shippedKg ?? 0,
                  qualityFailureKg: order?.qualityFailureKg ?? 0,
                  manifestIds: [...(order?.manifestIds ?? [])],
                  cancelled: order?.status === 'cancelled',
                },
              ],
            });
          } else apply({ type: 'tick', args });
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
      }),
      migrate: (persisted, version) => {
        if (version !== 1 || !persisted || typeof persisted !== 'object') return {};
        return {
          participationMode:
            'participationMode' in persisted ? persisted.participationMode : 'solo',
          workplace: 'workplace' in persisted ? persisted.workplace : null,
          completedCampaigns: [],
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
