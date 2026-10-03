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
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import { safeJSONStorage } from './storage';
import { isWorkplaceReplayActive } from '../simulation/workplaceReplayRuntime';

const MAX_COMPLETED_CAMPAIGNS = 6;
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

interface WorkplaceStore extends WorkplaceActions {
  workplace: WorkplaceState;
  completedCampaigns: WorkplaceState[];
  startMission: (profile: WorkplaceProfile, seed?: number) => WorkplaceTransitionResult;
  archiveCampaign: (expectedRevision: number) => WorkplaceTransitionResult;
}

export const useWorkplaceStore = create<WorkplaceStore>()(
  persist(
    (set, get) => {
      const apply = (command: WorkplaceCommand) => {
        const { state, changed, reason } = transitionWorkplace(get().workplace, command);
        if (changed) set({ workplace: state });
        return { changed, reason };
      };
      return {
        workplace: createWorkplace(),
        completedCampaigns: [],
        archiveCampaign: (expectedRevision) => {
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
          const mission = get().workplace.campaign?.mission;
          if (mission && mission.materialSessionId !== useMaterialFlowStore.getState().sessionId)
            return {
              changed: false,
              reason:
                'The physical material session changed. Historical receipts cannot authorise a new agreement.',
            };
          return apply({ type: 'activate', args });
        },
        withdraw: (...args) => apply({ type: 'withdraw', args }),
        stop: (...args) => apply({ type: 'stop', args }),
        tick: (...args) => {
          const mission = get().workplace.campaign?.mission;
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
        workplace: saveWorkplace(state.workplace),
        completedCampaigns: state.completedCampaigns.map(saveWorkplace),
      }),
      migrate: (persisted, version) => {
        if (version !== 1 || !persisted || typeof persisted !== 'object') return {};
        return {
          workplace: 'workplace' in persisted ? persisted.workplace : null,
          completedCampaigns: [],
        };
      },
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === 'object' ? persisted : {};
        return {
          ...current,
          workplace: restoreWorkplace('workplace' in saved ? saved.workplace : null),
          completedCampaigns: retainedReviews(
            'completedCampaigns' in saved ? saved.completedCampaigns : null
          ),
        };
      },
    }
  )
);
