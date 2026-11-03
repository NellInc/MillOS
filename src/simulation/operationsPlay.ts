import type {
  CampaignConstraint,
  CustomerOrder,
  OperationalIncident,
  OrderExecutionState,
} from '../stores/operationsCampaignStore';
import { formatFixed, formatGrouped, getLocale, translate } from '../i18n';
import { formatShiftDuration } from './shiftReview';
import { PROGRAMME_BULK, PROGRAMME_RUSH, PROGRAMME_STANDARD } from './programmes';
import { incidentTitle } from '../stores/incidentText';
import { dispatchBlockText } from '../stores/dispatchBlockText';
import { operationsPlayMessages } from './operationsPlay.messages';

/** Shared fulfilment tolerance; cosmetic consequences must agree with credit. */
export const CAMPAIGN_MASS_EPSILON_KG = 1e-6;

// At standard pace this gives two real minutes for cold-start production,
// controller recovery and a real truck load. Customer deadlines stay separate.
export const RECOVERY_CHALLENGE_WINDOW_MINUTES = 360;
export const RECOVERY_CHALLENGE_TARGET_KG = 1000;

export const OPERATIONS_CHALLENGES = [
  { id: 'power_recovery', kind: 'power_sag', label: 'Recover from a power sag' },
  { id: 'packaging_recovery', kind: 'packaging_shortage', label: 'Restore packaging throughput' },
  {
    id: 'network_recovery',
    kind: 'control_network_degraded',
    label: 'Recover control availability',
  },
] as const;
export type OperationsChallengeId = (typeof OPERATIONS_CHALLENGES)[number]['id'];

/** `label` above is the English reference; display text resolves at use time. */
const CHALLENGE_LABEL_KEYS = {
  power_recovery: 'challengePowerRecovery',
  packaging_recovery: 'challengePackagingRecovery',
  network_recovery: 'challengeNetworkRecovery',
} as const satisfies Record<OperationsChallengeId, string>;
export const challengeLabel = (id: OperationsChallengeId) =>
  translate(operationsPlayMessages, CHALLENGE_LABEL_KEYS[id]);
export interface OperationsChallengeRun {
  id: string;
  challengeId: OperationsChallengeId;
  incidentId: string;
  orderId: string;
  startedAtMinute: number;
  deadlineMinute: number;
  startingShippedKg: number;
  startingQualityFailureKg: number;
  /**
   * Kilograms of the order's finished product shipped, and failed on quality,
   * across every order when the run started. Dispatch credits a product to the
   * highest-priority open order of it, not to the order the player chose, so
   * the run counts the product. Absent on runs saved before it was recorded:
   * those read the order alone until withMaterialBaseline fills it in.
   */
  startingMaterialShippedKg?: number;
  startingMaterialQualityFailureKg?: number;
  targetKg: number;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  endedAtMinute: number | null;
}

type ChallengeLedgerOrder = Pick<CustomerOrder, 'id' | 'recipe' | 'shippedKg' | 'qualityFailureKg'>;

/** Shipped and quality-failed kilograms of one finished product over every order. */
export function materialShipmentTotals(
  orders: readonly ChallengeLedgerOrder[],
  material: CustomerOrder['recipe']['finishedMaterial']
): { shippedKg: number; qualityFailureKg: number } {
  let shippedKg = 0;
  let qualityFailureKg = 0;
  for (const order of orders) {
    if (order.recipe.finishedMaterial !== material) continue;
    shippedKg += order.shippedKg;
    qualityFailureKg += order.qualityFailureKg;
  }
  return { shippedKg, qualityFailureKg };
}

/**
 * A run saved before the product baseline existed, given one that keeps the
 * progress its own order already shows. The same run is returned when nothing
 * is missing or its order is gone.
 */
export function withMaterialBaseline(
  run: OperationsChallengeRun,
  orders: readonly ChallengeLedgerOrder[]
): OperationsChallengeRun {
  if (
    Number.isFinite(run.startingMaterialShippedKg) &&
    Number.isFinite(run.startingMaterialQualityFailureKg)
  )
    return run;
  const order = orders.find((candidate) => candidate.id === run.orderId);
  if (!order) return run;
  const totals = materialShipmentTotals(orders, order.recipe.finishedMaterial);
  return {
    ...run,
    startingMaterialShippedKg: totals.shippedKg - (order.shippedKg - run.startingShippedKg),
    startingMaterialQualityFailureKg:
      totals.qualityFailureKg - (order.qualityFailureKg - run.startingQualityFailureKg),
  };
}

/**
 * What the run has shipped of its product, and failed on quality, since it
 * started. Null when its order is gone. The completion check and the card both
 * read it, so they cannot disagree.
 */
export function challengeCredit(
  run: OperationsChallengeRun,
  orders: readonly ChallengeLedgerOrder[]
): { shippedKg: number; qualityFailureKg: number } | null {
  const order = orders.find((candidate) => candidate.id === run.orderId);
  if (!order) return null;
  const baseline = withMaterialBaseline(run, orders);
  const totals = materialShipmentTotals(orders, order.recipe.finishedMaterial);
  return {
    shippedKg: totals.shippedKg - (baseline.startingMaterialShippedKg ?? 0),
    qualityFailureKg: totals.qualityFailureKg - (baseline.startingMaterialQualityFailureKg ?? 0),
  };
}
export interface OperationsPlaySnapshot {
  orders: readonly CustomerOrder[];
  activeOrderId: string | null;
  execution: OrderExecutionState;
  constraints: readonly CampaignConstraint[];
  incidents: readonly OperationalIncident[];
  elapsedMinutes: number;
  activeChallenge: OperationsChallengeRun | null;
  challengeHistory: readonly OperationsChallengeRun[];
}
export interface OperationsNextAction {
  kind:
    | 'acknowledge'
    | 'mitigate'
    | 'resume'
    | 'resolve'
    | 'repair'
    | 'quality'
    | 'receiving'
    | 'dispatch'
    | 'production'
    | 'programme';
  targetId: string | null;
  label: string;
  consequence: string;
}

export function challengeBlockReason(state: OperationsPlaySnapshot): string | null {
  const order = state.orders.find((candidate) => candidate.id === state.activeOrderId);
  if (state.activeChallenge) return translate(operationsPlayMessages, 'blockActiveChallenge');
  if (!order || order.status === 'fulfilled' || order.status === 'cancelled')
    return translate(operationsPlayMessages, 'blockNoCommitment');
  if (state.incidents.some((incident) => incident.phase !== 'resolved'))
    return translate(operationsPlayMessages, 'blockOpenIncidents');
  if (state.execution.stage === 'planning')
    return translate(operationsPlayMessages, 'blockPlanning');
  if (state.execution.orderId !== order.id || state.execution.sourceInventoryKg <= 0)
    return translate(operationsPlayMessages, 'blockNoFeedstock');
  if (!state.execution.qualityReleased || state.execution.stage === 'quality_hold')
    return translate(operationsPlayMessages, 'blockQualityHold');
  return null;
}

export function getChallengeRecoveryIncident(
  state: OperationsPlaySnapshot
): OperationalIncident | undefined {
  const runs = [
    ...(state.activeChallenge ? [state.activeChallenge] : []),
    ...state.challengeHistory,
  ];
  return state.incidents.find(
    (incident) =>
      incident.phase !== 'resolved' &&
      runs.some(
        (run) =>
          run.incidentId === incident.id &&
          OPERATIONS_CHALLENGES.some(
            (definition) => definition.id === run.challengeId && definition.kind === incident.kind
          )
      )
  );
}

export function deriveOperationsPlay(state: OperationsPlaySnapshot) {
  const activeOrder = state.orders.find((order) => order.id === state.activeOrderId) ?? null;
  const blockers = state.constraints.filter((constraint) => constraint.severity !== 'info');
  // The incident that most needs the operator: a raised one, then one awaiting
  // mitigation, then any still open. Working if an incident raised behind an
  // earlier mitigated one is offered for acknowledgement.
  const openIncidents = state.incidents.filter((candidate) => candidate.phase !== 'resolved');
  const incident =
    openIncidents.find((candidate) => candidate.phase === 'raised') ??
    openIncidents.find((candidate) => candidate.phase === 'acknowledged') ??
    openIncidents[0];
  const run = state.activeChallenge;
  const recovery = getChallengeRecoveryIncident(state);
  // A stopped machine outranks the delivery steps: its line cannot run until
  // the work order is repaired, verified and restarted in Mill Overview.
  const machineDown = state.constraints.find(
    (constraint) => constraint.id === 'maintenance-queue' && constraint.severity !== 'info'
  );
  const canAcceptNextProgramme =
    !run &&
    state.orders.length > 0 &&
    state.orders.every((order) => order.status === 'fulfilled' || order.status === 'cancelled');
  let nextAction: OperationsNextAction;
  if (incident?.phase === 'raised') {
    nextAction = {
      kind: 'acknowledge',
      targetId: incident.id,
      label: translate(operationsPlayMessages, 'acknowledgeLabel'),
      consequence: translate(operationsPlayMessages, 'acknowledgeConsequence', {
        title: incidentTitle(incident),
      }),
    };
  } else if (incident?.phase === 'acknowledged') {
    nextAction = {
      kind: 'mitigate',
      targetId: incident.id,
      label: translate(operationsPlayMessages, 'mitigateLabel'),
      consequence: translate(operationsPlayMessages, 'mitigateConsequence'),
    };
  } else if (recovery?.phase === 'mitigated' && !recovery.effectApplied) {
    nextAction = {
      kind: 'resume',
      targetId: recovery.id,
      label: translate(operationsPlayMessages, 'resumeLabel'),
      consequence: translate(operationsPlayMessages, 'resumeConsequence'),
    };
  } else if (recovery?.phase === 'mitigated' && recovery.effectApplied) {
    nextAction = {
      kind: 'resolve',
      targetId: recovery.id,
      label: translate(operationsPlayMessages, 'resolveLabel'),
      consequence: run
        ? translate(operationsPlayMessages, 'resolveConsequenceActive')
        : translate(operationsPlayMessages, 'resolveConsequenceEnded'),
    };
  } else if (machineDown) {
    nextAction = {
      kind: 'repair',
      targetId: machineDown.relatedId,
      label: translate(operationsPlayMessages, 'repairLabel'),
      consequence: machineDown.detail,
    };
  } else if (canAcceptNextProgramme && !incident) {
    nextAction = {
      kind: 'programme',
      targetId: null,
      label: translate(operationsPlayMessages, 'programmeLabel'),
      // What acceptNextProgramme creates (src/simulation/programmes.ts),
      // from the same constants, so the offer cannot drift from the programme.
      consequence: translate(operationsPlayMessages, 'programmeConsequence', {
        dayKg: formatGrouped(PROGRAMME_RUSH.kg + PROGRAMME_STANDARD.kg + PROGRAMME_BULK.kg),
        nightKg: formatGrouped(PROGRAMME_RUSH.kg + PROGRAMME_STANDARD.kg + PROGRAMME_BULK.nightKg),
        premium: formatFixed(PROGRAMME_RUSH.premiumPercent, 0),
        window: formatShiftDuration(PROGRAMME_RUSH.windowMinutes, getLocale()),
        standardKg: formatGrouped(PROGRAMME_STANDARD.kg),
      }),
    };
  } else if (!state.execution.qualityReleased || state.execution.stage === 'quality_hold') {
    nextAction = {
      kind: 'quality',
      targetId: activeOrder?.id ?? null,
      label: translate(operationsPlayMessages, 'qualityLabel'),
      consequence:
        dispatchBlockText(state.execution.dispatchLoad) ??
        translate(operationsPlayMessages, 'qualityConsequence'),
    };
  } else if (
    activeOrder &&
    // 'planning': a commitment just chosen or accepted, its route not yet read
    // by a tick; the inventory held is another order's, or none.
    state.execution.stage !== 'planning' &&
    state.execution.sourceInventoryKg <= 0 &&
    state.execution.releasedFinishedKg <= 0 &&
    state.execution.dispatchLoad.loadedKg <= 0
  ) {
    nextAction = {
      kind: 'receiving',
      targetId: activeOrder.id,
      label: translate(operationsPlayMessages, 'receivingLabel'),
      consequence: translate(operationsPlayMessages, 'receivingConsequence', {
        material: translate(operationsPlayMessages, 'sourceMaterial', {
          value: activeOrder.recipe.sourceMaterial,
        }),
      }),
    };
  } else if (
    ['ready_to_load', 'loading', 'ready_to_dispatch', 'dispatched'].includes(state.execution.stage)
  ) {
    nextAction = {
      kind: 'dispatch',
      targetId: activeOrder?.id ?? null,
      label: translate(operationsPlayMessages, 'dispatchLabel'),
      consequence: translate(operationsPlayMessages, 'dispatchConsequence'),
    };
  } else {
    nextAction = {
      kind: 'production',
      targetId: activeOrder?.id ?? null,
      label: incident
        ? translate(operationsPlayMessages, 'residualLabel')
        : translate(operationsPlayMessages, 'productionLabel'),
      consequence: incident
        ? translate(operationsPlayMessages, 'residualConsequence', {
            title: incidentTitle(incident),
          })
        : translate(operationsPlayMessages, 'productionConsequence'),
    };
  }
  const blockedReason = challengeBlockReason(state);
  const challengeIncident =
    run && state.incidents.find((incident) => incident.id === run.incidentId);
  const instruction = !challengeIncident
    ? translate(operationsPlayMessages, 'instructionInspect')
    : challengeIncident.phase === 'raised'
      ? translate(operationsPlayMessages, 'instructionAcknowledge')
      : challengeIncident.phase === 'acknowledged'
        ? translate(operationsPlayMessages, 'instructionMitigate')
        : challengeIncident.phase === 'resolved'
          ? translate(operationsPlayMessages, 'instructionRestored')
          : challengeIncident.effectApplied
            ? translate(operationsPlayMessages, 'instructionRestore')
            : translate(operationsPlayMessages, 'instructionQueued');
  return {
    activeOrder,
    blockers,
    nextAction,
    canAcceptNextProgramme,
    challenges: OPERATIONS_CHALLENGES.map(({ id }) => ({
      id,
      label: challengeLabel(id),
      available: blockedReason === null,
      blockedReason,
    })),
    challengeProgress: run
      ? {
          label: OPERATIONS_CHALLENGES.some((challenge) => challenge.id === run.challengeId)
            ? challengeLabel(run.challengeId)
            : translate(operationsPlayMessages, 'challengeFallback'),
          dispatchedKg: Math.max(0, challengeCredit(run, state.orders)?.shippedKg ?? 0),
          targetKg: run.targetKg,
          remainingMinutes: Math.max(0, run.deadlineMinute - state.elapsedMinutes),
          instruction,
          phase:
            challengeIncident?.phase === 'resolved'
              ? ('recovering' as const)
              : ('responding' as const),
        }
      : null,
  };
}
