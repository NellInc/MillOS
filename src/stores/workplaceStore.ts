import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  WorkplaceMission,
  WorkplaceMissionObservation,
  WorkplaceSampleReading,
  WorkplaceActions,
  WorkplaceState,
  WorkplaceProfile,
  WorkplaceReasonCopy,
  WorkplaceTransitionResult,
} from '../types/workplace';
import { bilateralWorkplaceMessages } from '../simulation/bilateralWorkplace.messages';
import { FIRST_ORDER_ID, useOperationsCampaignStore } from './operationsCampaignStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useProductionStore } from './productionStore';
import { selectRestartPending, useGameSimulationStore } from './gameSimulationStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import {
  benchOrderFor,
  getDispatchQualityStatus,
  prioritiseBenchTest,
  useQCLabStore,
} from './qcLabStore';
import { compareDispatchOrder, gradedStock, shipmentOrdersFrom } from '../simulation/shipmentPlan';
import { provideCrewAvailability } from '../simulation/workplaceCrew';
import { isBenchmarkRuntime } from '../runtime/runtimeMode';
import {
  queueFirst,
  resequenceEffect,
  resequenceTarget,
  type ResequenceDock,
} from '../simulation/workplaceResequence';
import { dockState } from '../systems/partnerProposalRuntime';
import { forecastPlans, type PlanForecast } from '../simulation/workplaceForecast';
import { customerDisplayName } from './customerNames';
import { capturePackingPlant, derivePackingAdvice } from '../simulation/workplaceAdvice';
import {
  authoredSeasonCommand,
  createWorkplace,
  planCrewWaits,
  prospectiveCover,
  localizeWorkplaceMembers,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import { handoffHoldsClock, workplaceMission } from '../simulation/workplaceImprovement';
import {
  ABSENCE_MINUTES,
  campaignShiftPause,
  crewAwayMinutes,
  qualifiedToCover,
  seasonEnded,
  seasonReserveCarried,
  seasonSobrasPool,
  shiftAbsentee,
  shiftResumable,
} from '../simulation/workplaceCampaign';
import { safeJSONStorage } from './storage';
import { isWorkplaceReplayActive } from '../simulation/workplaceReplayRuntime';
import { formatFixed, translate, useLocaleStore } from '../i18n';
import { workplaceStoreMessages as msg } from './workplaceStore.messages';
import { workplaceReplayStoreMessages } from './workplaceReplayStore.messages';
import { workplaceCampaignMessages } from '../simulation/workplaceCampaign.messages';
import { workplaceParticipationMessages } from '../simulation/workplaceParticipation.messages';
import { workplaceImprovementPanelMessages } from '../components/ui-new/widgets/WorkplaceImprovementPanel.messages';
import { workplacePackingEvidenceMessages } from '../components/ui-new/widgets/WorkplacePackingEvidence.messages';

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

/** A store refusal: a key whose copy takes no params. */
type StoreReasonKey = {
  [K in keyof typeof msg.en]: (typeof msg.en)[K] extends string ? K : never;
}[keyof typeof msg.en];
const refuse = (key: StoreReasonKey): WorkplaceTransitionResult => ({
  changed: false,
  reason: translate(msg, key),
  reasonCopy: { catalog: 'store', key },
});

const REASON_CATALOGS: Record<WorkplaceReasonCopy['catalog'], unknown> = {
  store: msg,
  engine: bilateralWorkplaceMessages,
  replay: workplaceReplayStoreMessages,
  // Understanding-check clarifications (season checks, participant turn checks).
  campaign: workplaceCampaignMessages,
  participation: workplaceParticipationMessages,
  // Lab status lines set by the handoff panel (season opened) and the matched
  // packing rehearsal (pause first, inputs changed, rehearsal failed).
  improvementPanel: workplaceImprovementPanelMessages,
  packingEvidence: workplacePackingEvidenceMessages,
};

/**
 * A transition's reason in the language active now. A status line that keeps a
 * result renders it through this, so a language switch reaches it; a reason
 * with no key, or a key its catalogue lacks, keeps the text it was given.
 * Working if a refusal shown in English reads in Portuguese after a switch.
 */
export function workplaceReasonText(
  result: Pick<WorkplaceTransitionResult, 'reason' | 'reasonCopy'>
): string | null {
  const copy = result.reasonCopy;
  const catalog = copy ? (REASON_CATALOGS[copy.catalog] as typeof msg | undefined) : undefined;
  if (!copy || !catalog || !Object.prototype.hasOwnProperty.call(catalog.en, copy.key))
    return result.reason;
  // A joined reason with a key that no longer resolves answers empty.
  return (
    (translate as (c: unknown, k: string, p?: unknown) => string)(catalog, copy.key, copy.params) ||
    result.reason
  );
}

// The physical session never saves while a matched replay runs, so a reload
// brings back the plant from before it. The workplace keeps its pre-replay
// record on disk alongside, rather than the replay's season bound to a plant it
// never ran on; forgetting the replay writes the season it left (replay store).
// Working if a reload mid-replay restores the pre-replay workplace.
const workplaceStorage: typeof safeJSONStorage = {
  ...safeJSONStorage,
  setItem: (name, value) =>
    isWorkplaceReplayActive() ? undefined : safeJSONStorage.setItem(name, value),
};

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
  return missionFor(order);
}

/** A fresh link to `order`, from its shipped weight now, so nothing shipped before is credited. */
function missionFor(
  order: ReturnType<typeof useOperationsCampaignStore.getState>['orders'][number]
): WorkplaceMission {
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
 * Whether the tour's own first delivery is behind the player (D4): no new
 * cooperative season starts before it, by itself or from a player control. A
 * missing first order counts as delivered: the campaign keeps only its last 30
 * orders, and a programme is accepted only once every order is in. A season
 * already under way never asks, so a save that began one earlier carries on.
 * Working if no season starts while order-001 is open.
 */
export function firstDeliveryFulfilled(
  orders: readonly { id: string; status: string }[] = useOperationsCampaignStore.getState().orders
): boolean {
  const first = orders.find((order) => order.id === FIRST_ORDER_ID);
  return !first || first.status === 'fulfilled' || first.status === 'cancelled';
}

/** A new season (idle, none begun) that D4 still holds for the first delivery. */
function awaitsFirstDelivery(workplace: WorkplaceState): boolean {
  return workplace.phase === 'idle' && !workplace.campaign && !firstDeliveryFulfilled();
}

/**
 * Whether the default season may arrive by itself now: after the first
 * delivery, and on an open order a new season can bind, so admission never
 * starts a runner whose first step would refuse.
 */
export function defaultSeasonMayArrive(): boolean {
  return firstDeliveryFulfilled() && openActiveOrderMission() !== undefined;
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
  // The execution reads packed stock by grade, for the orders in the line's
  // walk (UnifiedGameTick lineWalkOrders and gradedStock, plan item 3.4): only
  // tested stock that meets an order's minimum is released. Read the same way,
  // or every capture with a batch on the bench reads as stale.
  const open = shipmentOrdersFrom(operations.orders);
  const activeOpen = open.find((o) => o.id === operations.activeOrderId);
  const walk = [
    ...(activeOpen ? [activeOpen] : []),
    ...open.filter((o) => o !== activeOpen).sort(compareDispatchOrder),
  ];
  const graded = order
    ? gradedStock(walk, material.productionBatches, order.recipe.finishedMaterial)
    : { availableKg: 0, releasedKg: 0 };
  const released = graded.releasedKg;
  const available = graded.availableKg;
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
    // A season's follow-on order is the one it works once its commitment is in;
    // a resequenced shift works the order it made active (review 2).
    (!mission ||
      mission.orderId === order.id ||
      state.campaign?.followOn?.orderId === order.id ||
      state.campaign?.sequenced?.orderId === order.id ||
      (resequencing(state) && resequenceTarget(operations.orders)?.targetOrderId === order.id)) &&
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
/**
 * 5.3: whether a quality investigation is open on the line, as Quality reads
 * it: an unresolved contamination alert, or a failed test whose batch still
 * has stock on hold. Its way out is in the lab. An expired certificate is not
 * an inspection. Working if Quality refuses while either holds dispatch.
 */
export function qualityInspectionOpen(): boolean {
  const reason = getDispatchQualityStatus(
    useQCLabStore.getState().qcLab,
    useMaterialFlowStore.getState().productionBatches
  ).reason;
  return reason === 'unresolved_contamination' || reason === 'failed_quality_test';
}

/**
 * 5.7: the bench as Monday reads it, for the order the season works now: a
 * released batch of that order's product, awaiting its test, that the bench
 * would read against that order's minimum (`benchOrderFor`); and, once a
 * sample holds the line, what the bench made of it: its latest test, or that
 * it left the bench untested. Read only on Monday's shift of a game season.
 */
function mondayBench(
  state: WorkplaceState,
  orderId: string
): Pick<WorkplaceMissionObservation, 'pendingSampleBatchId' | 'sampleReading'> {
  const c = state.campaign;
  if (state.mode !== 'game' || c?.shift !== 1 || c.inspectionComplete) return {};
  const orders = useOperationsCampaignStore.getState().orders;
  const order = orders.find((o) => o.id === orderId);
  const batches = useMaterialFlowStore.getState().productionBatches;
  const benchOrders = shipmentOrdersFrom(orders);
  const pending =
    order && order.status !== 'fulfilled' && order.status !== 'cancelled'
      ? batches.find(
          (b) =>
            b.awaitingTest &&
            b.disposition === 'released' &&
            b.availableKg > 0 &&
            b.materialType === order.recipe.finishedMaterial &&
            benchOrderFor(b, benchOrders)?.id === order.id
        )
      : undefined;
  const sampleId = c.mondaySample?.batchId;
  let sampleReading: WorkplaceSampleReading | null = null;
  if (sampleId) {
    const batch = batches.find((b) => b.id === sampleId);
    const waiting =
      !!batch?.awaitingTest && batch.disposition === 'released' && batch.availableKg > 0;
    if (!waiting) {
      const test = [...useQCLabStore.getState().qcLab.testHistory]
        .reverse()
        .find((t) => t.batchId === sampleId);
      const quality = test?.qualityScore ?? batch?.qualityScore;
      sampleReading = {
        batchId: sampleId,
        tested: !!test,
        passed: !!test?.passed,
        quality: typeof quality === 'number' && Number.isFinite(quality) ? quality : null,
        minimum:
          typeof test?.minimumQuality === 'number' && Number.isFinite(test.minimumQuality)
            ? test.minimumQuality
            : null,
      };
    }
  }
  return { pendingSampleBatchId: pending?.id ?? null, sampleReading };
}

/**
 * 5.7: once Quality has begun Monday's inspection, its sample goes first on
 * the lab's bench (the Overview's Test first), so the inspection is the lab's
 * real test. Never in a replay or a benchmark; nothing when the batch no
 * longer awaits its test (the engine then ends the hold).
 */
function putMondaySampleFirst(state: WorkplaceState) {
  const c = state.campaign;
  const id = c?.mondaySample?.batchId;
  if (
    !id ||
    state.mode !== 'game' ||
    c.shift !== 1 ||
    c.decision !== 'inspect' ||
    c.inspectionComplete ||
    isWorkplaceReplayActive() ||
    isBenchmarkRuntime()
  )
    return;
  const lab = useQCLabStore.getState().qcLab;
  if (lab.benchFirst === id || lab.bench?.batchId === id) return;
  prioritiseBenchTest(id);
}

/**
 * 5.4 and 5.6: the dock and the line as the plant's projection reads them now:
 * the partner's own reading (partnerProposalRuntime `dockState`), every order
 * taken as one the line can make.
 */
export function workplaceDockNow(): ResequenceDock {
  const { orders: _orders, latestProgramme: _latest, ...dock } = dockState(undefined);
  return dock;
}

/**
 * 5.6: each plan's forecast from the plant as it stands (workplaceForecast):
 * the adviser's steady rehearsal of the real material flow for what is
 * packed, the dock for what can leave. Six flow simulations, so a caller runs
 * it on a press and keeps the result, never on every render.
 * Working if the forecast follows the plant and a shift's shipped kilograms
 * fall within its bounds.
 */
export function forecastWorkplacePlansNow(state: WorkplaceState): PlanForecast[] {
  const operations = useOperationsCampaignStore.getState();
  const c = state.campaign;
  return forecastPlans({
    advice: derivePackingAdvice(captureCurrentPackingPlant(state), 'steady'),
    dock: workplaceDockNow(),
    orders: operations.orders,
    activeOrderId: operations.activeOrderId,
    // Review 2: what each plan ships for the season, from the orders it credits.
    seasonOrderIds: [c?.mission?.orderId, c?.followOn?.orderId].filter((id): id is string => !!id),
    minute: operations.elapsedMinutes,
    // Review 2: what each plan leaves waiting on a shift someone is away.
    waits: Object.fromEntries(
      (['steady', 'resequence', 'cover'] as const).map((id) => [id, planCrewWaits(state, id)])
    ),
  });
}

/**
 * 5.4: what a plan does to the plant this shift, one line each, read from the
 * live stores on render: who is away at the shift's start and what waits for
 * them, or what agreed cover keeps going; and, for resequence, which order the
 * next truck serves and the minutes each open order then has in hand.
 * Working if every plan that costs the plant something says so on its choice.
 */
export function planPlantEffect(
  state: WorkplaceState,
  planId: WorkplaceState['planId'] = state.planId
): string[] {
  if (state.mode !== 'game' || !state.campaign || state.improvement) return [];
  const wm = bilateralWorkplaceMessages;
  const lines: string[] = [];
  const away = shiftAbsentee(state);
  const minute = formatFixed(ABSENCE_MINUTES, 0);
  // Review 2: release stays with a member qualified for it: the one covering
  // now, or the one activation would choose.
  const coverer =
    state.phase === 'active'
      ? state.members.find((m) => m.id === state.activeCoverMemberId)
      : prospectiveCover({ ...state, planId });
  if (away && !(state.phase === 'active' && state.minute >= ABSENCE_MINUTES))
    lines.push(
      translate(
        wm,
        planId === 'cover'
          ? away === 'quality'
            ? coverer && qualifiedToCover(coverer, away)
              ? 'effectCoverQuality'
              : 'effectCoverQualityHeld'
            : 'effectCoverMaintenance'
          : away === 'quality'
            ? 'effectAwayQuality'
            : 'effectAwayMaintenance',
        { minute, role: coverer?.role ?? '' }
      )
    );
  if (planId === 'resequence') {
    const operations = useOperationsCampaignStore.getState();
    const effect = resequenceEffect(
      operations.orders,
      workplaceDockNow(),
      operations.elapsedMinutes
    );
    if (!effect) lines.push(translate(wm, 'effectNoResequence'));
    else {
      const first = operations.orders.find((o) => o.id === effect.targetOrderId)!;
      const list = effect.inHand
        .map((entry) =>
          translate(wm, entry.minutes < 0 ? 'effectLate' : 'effectInHand', {
            customer: customerDisplayName(entry.customer),
            minutes: formatFixed(Math.abs(entry.minutes), 0),
          })
        )
        .join('; ');
      lines.push(
        translate(wm, effect.rushFirst ? 'effectRushFirst' : 'effectRushLast', {
          customer: customerDisplayName(first.customer),
          list,
        })
      );
    }
  }
  return lines;
}

/**
 * 5.4: resequencing, agreed and activated, moves the rush by the campaign's
 * own order activation (the guide's order picker's call), and for the shift
 * only: when the shift stops being worked, the order it put first gives way
 * to the dispatch queue's own first, if both are still open. Both read the
 * queue, not memory, so a reload or a pause mid-shift resequences the same way
 * on resume. Never in a replay or a benchmark, outside a game season, or
 * inside a handoff trial.
 */
const resequencing = (state: WorkplaceState) =>
  state.mode === 'game' &&
  !!state.campaign &&
  !state.improvement &&
  state.planId === 'resequence' &&
  !isWorkplaceReplayActive() &&
  !isBenchmarkRuntime();
function applyResequence(state: WorkplaceState) {
  if (state.phase !== 'active' || !resequencing(state)) return;
  const operations = useOperationsCampaignStore.getState();
  const target = resequenceTarget(operations.orders);
  if (target && operations.activeOrderId !== target.targetOrderId)
    operations.activateOrder(target.targetOrderId, 'operator');
}
function endResequence(before: WorkplaceState['phase'], state: WorkplaceState) {
  if (before !== 'active' || state.phase === 'active' || !resequencing(state)) return;
  const operations = useOperationsCampaignStore.getState();
  const target = resequenceTarget(operations.orders);
  const first = queueFirst(operations.orders);
  if (target && first && operations.activeOrderId === target.targetOrderId)
    operations.activateOrder(first.id, 'operator');
}

/**
 * 5.3 (D5): in solo play of a season the player is Packing. The other roles
 * answer for themselves (simulateResponses), so their understanding, ballots
 * and cover consent are not the player's to cast. Separate turns, workshop and
 * standalone exercises keep every role's own input, as before.
 */
const AUTHORED_ROLE_COMMANDS = new Set([
  'understand',
  'vote',
  'consentToCover',
  // 5b: each role's own calls and ballots (authoredSeasonCommand casts them).
  'campaignDecision',
  'elect',
  'voteSurplus',
  // A role's voice is its own: it raises and resolves its own objections.
  'object',
  'resolveObjection',
]);
function castsForAuthoredRole(
  participationMode: WorkplaceStore['participationMode'],
  workplace: WorkplaceState,
  command: WorkplaceCommand
): boolean {
  if (participationMode !== 'solo' || workplace.mode !== 'game') return false;
  // A handoff trial's verdict is each role's own too; its other steps are not
  // a season's, and stay as they were.
  const authoredCommand = workplace.improvement
    ? command.type === 'voteImprovementReview'
    : !!workplace.campaign && AUTHORED_ROLE_COMMANDS.has(command.type);
  if (!authoredCommand) return false;
  // A decision and a resolution name their actor second (commandActor's rule).
  const actor = (command.args as unknown[])[
    command.type === 'resolveObjection' || command.type === 'campaignDecision' ? 1 : 0
  ];
  return typeof actor === 'string' && actor !== 'packing';
}

/**
 * 5.3 (D5): in solo play, after any change, the authored roles do what is
 * theirs to do now (authoredSeasonCommand), one step at a time, applied
 * straight to the engine so the automatic season is not interrupted by it.
 * Working if the player never makes another role's call and the season runs.
 */
function withAuthoredSteps(
  participationMode: WorkplaceStore['participationMode'],
  workplace: WorkplaceState
): WorkplaceState {
  if (participationMode !== 'solo') return workplace;
  let state = workplace;
  for (let step = 0; step < 8; step++) {
    const command = authoredSeasonCommand(state);
    if (!command) break;
    const result = transitionWorkplace(state, command);
    if (!result.changed) break;
    state = result.state;
  }
  return state;
}

/**
 * Review 2: an ended season whose pool is still unsettled. A charter that
 * shares surplus must share it before the season is kept (`'vote'`); one that
 * does not is settled in its own terms here (`settled`), so a kept season
 * never loses its pool. Null when there is nothing to settle.
 */
function unsettledSurplus(
  kept: Omit<WorkplaceState, 'improvement'>
): { kind: 'vote' } | { kind: 'settled'; state: WorkplaceState } | null {
  // A handoff's origin is a season without its handoff; the rules are the same.
  const state = kept as WorkplaceState;
  if (!state.campaign || !seasonEnded(state) || state.distributionComplete) return null;
  if (!(seasonSobrasPool(state) > 1e-8)) return null;
  if (state.practices.includes('gainsharing')) return { kind: 'vote' };
  const charter = transitionWorkplace(state, { type: 'distributeSurplus', args: [] });
  return charter.changed ? { kind: 'settled', state: charter.state } : { kind: 'vote' };
}

/**
 * Review 2: a season left early never loses what it earned: it is settled by
 * the statutory default (the Reserve Fund and the Assistance Fund first, the
 * rest kept in the Reserve Fund) and the record says the season was left.
 * Unchanged when nothing was earned or it is already settled.
 */
function settleLeft(kept: Omit<WorkplaceState, 'improvement'>): WorkplaceState {
  const state = kept as WorkplaceState;
  if (!state.campaign || state.distributionComplete || !(seasonSobrasPool(state) > 1e-8))
    return state;
  const settled = transitionWorkplace(state, { type: 'distributeSurplus', args: ['left'] });
  return settled.changed ? settled.state : state;
}

const recoveryOutstanding = (state: WorkplaceState) =>
  state.members.some((member) => member.recoveryOwedMinutes > 0) ||
  state.campaign?.history.some((shift) =>
    shift.members.some((member) => member.recoveryOwedMinutes > 0)
  );

// A retained season was never itself reloaded: it keeps why its shift ended.
function completedReview(input: unknown): WorkplaceState | null {
  const restored = restoreWorkplace(input, true);
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
  const restored = restoreWorkplace(input, true);
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
  /**
   * Review 2: how many seasons have begun, so each new one is numbered after
   * the last and the Reserve Fund passes on from the season begun last, once.
   */
  seasonsBegun: number;
  /**
   * `seed` defaults to the idle workplace's own, so every season has its own
   * draw. `replaces`: the season a matched replay puts this one in place of;
   * it keeps that season's number and Reserve Fund.
   */
  startMission: (
    profile: WorkplaceProfile,
    seed?: number,
    replaces?: WorkplaceState
  ) => WorkplaceTransitionResult;
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
              return refuse('useCurrentTurn');
            if (command.type === 'respondToPressure' && command.args[1] === 'accept-demand')
              return refuse('challengeCannotSpeak');
            if (
              ['understand', 'acknowledgeImprovement'].includes(command.type) &&
              !turnChecks(access.workplace).every((q) => turn.answers[q.id] === q.correct)
            )
              return refuse('answerChecksFirst');
          } else if (command.type === 'simulateResponses')
            return refuse('simulatedResponsesDisabled');
          else if (command.type !== 'tick' && command.type !== 'stop' && access.turn)
            return refuse('endTurnBeforeSetup');
        }
        if (castsForAuthoredRole(access.participationMode, access.workplace, command))
          return refuse('authoredRoleAnswers');
        if (
          [
            'beginImprovement',
            'continueImprovement',
            'cancelImprovement',
            'closeImprovement',
            'resumeShift',
          ].includes(command.type) &&
          isWorkplaceReplayActive()
        )
          return refuse('finishReplayBeforeObligations');
        const result = transitionWorkplace(get().workplace, command);
        const { changed, reason, reasonCopy } = result;
        const state = changed
          ? withAuthoredSteps(get().participationMode, result.state)
          : result.state;
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
        return { changed, reason, ...(reasonCopy ? { reasonCopy } : {}) };
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
      /**
       * Review 2: a new season is numbered after the last one begun, and opens
       * with the Reserve Fund only the season begun just before it carries:
       * the reserve leaves that account when a season takes it, and returns
       * only when that season is archived or left. Seasons saved before they
       * were numbered are read as before (the latest by seed), once. A season
       * a matched replay puts in place of another keeps that one's number and
       * reserve, so a replay never brings it twice.
       * Working if A, then B from the Overview card, then C never brings A's reserve twice.
       */
      const beginSeason = (
        profile: WorkplaceProfile,
        seed: number,
        mission: WorkplaceMission | undefined,
        replaces?: WorkplaceState
      ) => {
        const begun = get().seasonsBegun;
        let season: number;
        let reserve: number;
        if (replaces?.campaign) {
          season = replaces.campaign.season ?? begun;
          reserve = replaces.campaign.reserveBrought ?? 0;
        } else {
          const retained = [...get().completedCampaigns, ...get().leftCampaigns];
          const numbered = retained
            .filter((s) => s.campaign?.season !== undefined)
            .sort((a, b) => b.campaign!.season! - a.campaign!.season!);
          const last =
            numbered[0] ??
            [get().completedCampaigns.at(-1), get().leftCampaigns.at(-1)]
              .filter((s): s is WorkplaceState => !!s)
              .sort((a, b) => b.seed - a.seed)[0];
          season = begun + 1;
          reserve =
            last && (last.campaign?.season ?? 0) === begun
              ? Math.min(1e6, seasonReserveCarried(last))
              : 0;
        }
        const result = apply({
          type: 'startCampaign',
          args: [
            profile,
            seed,
            mission,
            reserve > 1e-8 ? reserve : 0,
            season >= 1 ? season : undefined,
          ],
        });
        if (result.changed && !replaces?.campaign) set({ seasonsBegun: Math.max(begun, season) });
        return result;
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
            return refuse('chooseModeBeforeScenario');
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
            return refuse('chooseFictionalRole');
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
            return refuse('knownAnswerRequired');
          if (turn.answers[question] === answer) return refuse('answerUnchanged');
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
          // A clarification kept on a status line follows a language switch.
          return answer === q.correct
            ? { changed: true, reason: null }
            : {
                changed: true,
                reason: q.clarification,
                reasonCopy: { catalog: 'participation', key: q.clarificationKey },
              };
        },
        runTurnCommand: (token, command) => {
          if (!isRoleCommand(command)) return refuse('roleDecisionsOnly');
          return command.type === 'acknowledgeImprovement'
            ? presentAdvice(token)
            : apply(command, token);
        },
        rehearseReload: (revision) => {
          interruptAutomaticWorkplace();
          if (revision !== get().workplace.revision || isWorkplaceReplayActive())
            return refuse('readBeforeReload');
          set({ workplace: restoreWorkplace(saveWorkplace(get().workplace)), turn: null });
          return {
            changed: true,
            reason: translate(msg, 'reloadRehearsed'),
            reasonCopy: { catalog: 'store', key: 'reloadRehearsed' },
          };
        },
        beginImprovement: (profile, revision, _mission, mode = get().workplace.mode) => {
          // Review 2: a handoff begun from a season's final review keeps that
          // season when it closes, so the season's surplus is shared first.
          if (unsettledSurplus(get().workplace)?.kind === 'vote')
            return refuse('settleSurplusBeforeArchive');
          return apply({
            type: 'beginImprovement',
            args: [profile, revision, linkedMission(mode), mode],
          });
        },
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
        resumeShift: (revision) => apply({ type: 'resumeShift', args: [revision] }),
        closeImprovement: (revision) => {
          const origin = get().workplace.improvement?.origin;
          const result = apply({ type: 'closeImprovement', args: [revision] });
          // A season the experiment opened from is kept as archiving or leaving
          // keeps it: completed after its final review, otherwise left early.
          // Working if closing never silently drops the season it began from.
          // Review 2: a season kept from here never loses its pool either.
          const surplus = origin ? unsettledSurplus(origin) : null;
          const kept = surplus?.kind === 'settled' ? surplus.state : origin;
          const completed = result.changed && kept ? completedReview(kept) : null;
          const left =
            result.changed && origin?.campaign && !completed
              ? leftReview(settleLeft(origin))
              : null;
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
            return refuse('endTurnBeforeArchive');
          const current = get().workplace;
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
            return refuse('reviewChanged');
          if (isWorkplaceReplayActive()) return refuse('finishReplayFirst');
          if (
            current.mode !== 'game' ||
            current.phase !== 'review' ||
            current.campaign?.shift !== 2 ||
            current.campaign.history.length !== 2
          )
            return refuse('completeThreeShifts');
          // An archived season can never resume, so a final shift a reload,
          // a safety stop or a resolved objection paused would be kept as
          // "agreement pending" for good. Working if it archives only once
          // resumed and finished or ended.
          if (shiftResumable(current))
            return refuse(
              campaignShiftPause(current) === 'reload'
                ? 'resumePausedBeforeArchive'
                : 'resumeStoppedBeforeArchive'
            );
          if (
            recoveryOutstanding(current) ||
            current.objections.some((objection) => objection.status === 'open') ||
            current.finance.wageReserve > 0 ||
            current.finance.compensationReserve > 0 ||
            current.activeCoverMemberId !== null ||
            current.coverRemainingMinutes > 0
          )
            return refuse('settleBeforeArchive');
          // Review 2: archiving never loses the season's pool. A charter that
          // shares surplus waits for its members to share it; one that does
          // not settles it in its own terms (the Reserve Fund) as it archives.
          const surplus = unsettledSurplus(current);
          if (surplus?.kind === 'vote') return refuse('settleSurplusBeforeArchive');
          const settled = surplus?.kind === 'settled' ? surplus.state : current;
          const review = completedReview(saveWorkplace(settled));
          if (!review) return refuse('reviewNotValidated');
          const fresh = createWorkplace('game', current.seed === 0xffffffff ? 1 : current.seed + 1);
          fresh.revision = settled.revision + 1;
          // 5.9: an adopted handoff arrangement outlives the season it ran in.
          if (current.arrangementsInPlace?.length)
            fresh.arrangementsInPlace = [...current.arrangementsInPlace];
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
        seasonsBegun: 0,
        leaveCampaign: (expectedRevision) => {
          interruptAutomaticWorkplace();
          if (get().participationMode === 'separate-turns' && get().turn)
            return refuse('endTurnBeforeLeave');
          const current = get().workplace;
          if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
            return refuse('reviewChanged');
          if (isWorkplaceReplayActive()) return refuse('finishReplayFirst');
          const result = transitionWorkplace(current, {
            type: 'leaveCampaign',
            args: [expectedRevision],
          });
          if (!result.changed)
            return {
              changed: false,
              reason: result.reason,
              ...(result.reasonCopy ? { reasonCopy: result.reasonCopy } : {}),
            };
          // An unworked deliberation is kept as stopped, never as a worked shift.
          const stopped =
            current.phase === 'deliberating'
              ? transitionWorkplace(current, { type: 'stop', args: [] }).state
              : current;
          const record = leftReview(saveWorkplace(settleLeft(stopped)));
          if (!record) return refuse('reviewNotValidated');
          set({
            workplace: result.state,
            turn: null,
            leftCampaigns: [...get().leftCampaigns, record].slice(-MAX_COMPLETED_CAMPAIGNS),
          });
          return { changed: true, reason: null };
        },
        endExercise: (expectedRevision) => {
          if (isWorkplaceReplayActive()) return refuse('finishReplayFirst');
          return apply({ type: 'endExercise', args: [expectedRevision] });
        },
        // D4: a new season, linked or the lab's own, starts only after the
        // first delivery. Only a new one asks: a season already under way
        // (restored or not) never passes through here.
        // Working if no caller starts a season while order-001 is open.
        // 5.9: a new season opens with the Reserve Fund the last archived
        // season carried, which pays its first purchases.
        startMission: (profile, seed = get().workplace.seed, replaces) => {
          if (awaitsFirstDelivery(get().workplace)) return refuse('firstDeliveryFirst');
          const mission = openActiveOrderMission();
          if (!mission) return refuse('openCommitmentRequired');
          return beginSeason(profile, seed, mission, replaces);
        },
        // The Lab's season (no linked order) is a season too: numbered, and
        // it carries the Reserve Fund on (review 2).
        startCampaign: (profile, seed, mission, reserveBrought) => {
          if (awaitsFirstDelivery(get().workplace)) return refuse('firstDeliveryFirst');
          if (reserveBrought !== undefined)
            return apply({ type: 'startCampaign', args: [profile, seed, mission, reserveBrought] });
          return beginSeason(profile, seed ?? get().workplace.seed, mission);
        },
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
        // The authored roles read the plant: Quality, whether an inspection is open.
        simulateResponses: (plant) =>
          apply({
            type: 'simulateResponses',
            args: [plant ?? { inspectionOpen: qualityInspectionOpen() }],
          }),
        object: (...args) => apply({ type: 'object', args }),
        resolveObjection: (...args) => apply({ type: 'resolveObjection', args }),
        activate: (...args) => {
          interruptAutomaticWorkplace();
          const safety = useGameSimulationStore.getState();
          if (
            get().workplace.mode === 'game' &&
            (safety.emergencyActive || safety.emergencyDrillMode)
          )
            return refuse('safetyStopHolds');
          // CLEAR releases the interlock but leaves the units idle (D13): the
          // agreement runs again with the line, after RESTART LINE.
          if (get().workplace.mode === 'game' && selectRestartPending(safety))
            return refuse('restartLineFirst');
          if (get().participationMode === 'separate-turns' && get().turn)
            return refuse('endTurnBeforeActivation');
          const mission = workplaceMission(get().workplace);
          if (mission && mission.materialSessionId !== useMaterialFlowStore.getState().sessionId)
            return refuse('materialSessionChanged');
          const current = get().workplace;
          if (current.mode === 'game' && current.improvement) {
            const advice = current.improvement.advice;
            if (!advice || advice.fingerprint !== captureCurrentPackingPlant(current).fingerprint)
              return refuse('freshAdviceRequired');
          }
          const refreshed = current.improvement && linkedMission();
          if (refreshed && refreshed.evidence !== 'current')
            return refuse('dispatchEvidenceRequired');
          const activationInput = refreshed
            ? { ...current, improvement: { ...current.improvement!, mission: refreshed } }
            : current;
          // Review 2: the order resequencing makes active is linked from its
          // shipped weight now, so its deliveries count for the season.
          const sequencedOrder = resequencing(current)
            ? useOperationsCampaignStore
                .getState()
                .orders.find(
                  (o) =>
                    o.id ===
                    resequenceTarget(useOperationsCampaignStore.getState().orders)?.targetOrderId
                )
            : undefined;
          const result = transitionWorkplace(activationInput, {
            type: 'activate',
            args: sequencedOrder ? [args[0], missionFor(sequencedOrder)] : [args[0]],
          });
          // A shift resumed past Monday's minute holds at once: Quality acts.
          if (result.changed) {
            set({
              workplace: withAuthoredSteps(get().participationMode, result.state),
              turn: null,
            });
            applyResequence(get().workplace);
          }
          return {
            changed: result.changed,
            reason: result.reason,
            ...(result.reasonCopy ? { reasonCopy: result.reasonCopy } : {}),
          };
        },
        withdraw: (...args) => apply({ type: 'withdraw', args }),
        stop: (...args) => apply({ type: 'stop', args }),
        tick: (...args) => {
          const phaseBefore = get().workplace.phase;
          const mission = workplaceMission(get().workplace);
          const followOn = get().workplace.campaign?.followOn;
          const sequenced = get().workplace.campaign?.sequenced;
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
          if (mission) {
            // 5.7: Monday reads the bench for the order the season works now
            // (a follow-on once the commitment is in), never in a replay.
            // Review 2: on a resequenced shift, the order the agreed plan made active.
            const working =
              sequenced && get().workplace.phase === 'active'
                ? sequenced.orderId
                : followOn &&
                    useOperationsCampaignStore
                      .getState()
                      .orders.find((o) => o.id === mission.orderId)?.status === 'fulfilled'
                  ? followOn.orderId
                  : mission.orderId;
            const bench = isWorkplaceReplayActive() ? {} : mondayBench(get().workplace, working);
            apply({
              type: 'tick',
              args: [
                args[0],
                args[1],
                args[2],
                { ...observe(mission.orderId), ...bench },
                followOn ? observe(followOn.orderId) : undefined,
                sequenced ? observe(sequenced.orderId) : undefined,
              ],
            });
            putMondaySampleFirst(get().workplace);
          } else apply({ type: 'tick', args });
          endResequence(phaseBefore, get().workplace);
        },
        elect: (...args) => apply({ type: 'elect', args }),
        voteSurplus: (...args) => apply({ type: 'voteSurplus', args }),
        distributeSurplus: (...args) => apply({ type: 'distributeSurplus', args }),
      };
    },
    {
      name: 'millos-workplace-laboratory',
      version: 2,
      storage: workplaceStorage,
      partialize: (state) => ({
        participationMode: state.participationMode,
        workplace: saveWorkplace(state.workplace),
        completedCampaigns: state.completedCampaigns.map(saveWorkplace),
        leftCampaigns: state.leftCampaigns.map(saveWorkplace),
        seasonsBegun: state.seasonsBegun,
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
        const workplace = restoreWorkplace('workplace' in saved ? saved.workplace : null);
        const completedCampaigns = retainedReviews(
          'completedCampaigns' in saved ? saved.completedCampaigns : null
        );
        const leftCampaigns = retainedLeftSeasons(
          'leftCampaigns' in saved ? saved.leftCampaigns : null
        );
        // Review 2: optional (older saves have none). Never below a season the
        // save holds; a live season begun before seasons were numbered is
        // numbered now, so the reserve it holds passes on once it is retained.
        const numbers = [workplace, ...completedCampaigns, ...leftCampaigns].map(
          (s) => s.campaign?.season ?? 0
        );
        const recorded =
          'seasonsBegun' in saved &&
          Number.isSafeInteger(saved.seasonsBegun) &&
          (saved.seasonsBegun as number) >= 0
            ? (saved.seasonsBegun as number)
            : 0;
        let seasonsBegun = Math.max(recorded, ...numbers);
        if (workplace.campaign && workplace.campaign.season === undefined) {
          seasonsBegun += 1;
          workplace.campaign.season = seasonsBegun;
        }
        return {
          ...current,
          participationMode:
            !('participationMode' in saved) || saved.participationMode === 'solo'
              ? 'solo'
              : 'separate-turns',
          turn: null,
          workplace,
          completedCampaigns,
          leftCampaigns,
          seasonsBegun,
        };
      },
    }
  )
);

// 5.4: the plant asks whether a role is at work (workplaceCrew): no while the
// season has it away at a shift's start with no cover doing its work. Never in
// a replay or a benchmark, so neither changes a test or a service there.
provideCrewAvailability((role) =>
  isWorkplaceReplayActive() || isBenchmarkRuntime()
    ? 0
    : crewAwayMinutes(useWorkplaceStore.getState().workplace, role)
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

// Member roles, boundaries and preferences are stored as text; a language
// switch rewrites them in place (a reload already regenerates them on restore).
// It is not an out-of-band replacement, so an open participant turn moves with it.
useLocaleStore.subscribe((state, previous) => {
  if (state.locale === previous.locale) return;
  const { workplace, turn, completedCampaigns, leftCampaigns } = useWorkplaceStore.getState();
  // Retained reviews print their member roles too; they follow the switch.
  // Working if an archived season reads in the language just chosen.
  const completed = completedCampaigns.map(localizeWorkplaceMembers);
  const left = leftCampaigns.map(localizeWorkplaceMembers);
  const reviewsChanged =
    completed.some((review, i) => review !== completedCampaigns[i]) ||
    left.some((review, i) => review !== leftCampaigns[i]);
  if (reviewsChanged)
    useWorkplaceStore.setState({ completedCampaigns: completed, leftCampaigns: left });
  const localized = localizeWorkplaceMembers(workplace);
  if (localized === workplace) return;
  useWorkplaceStore.setState({
    workplace: localized,
    turn: turn && turn.anchor === workplace ? { ...turn, anchor: localized } : turn,
  });
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
