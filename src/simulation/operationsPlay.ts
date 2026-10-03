import type {
  CampaignConstraint,
  CustomerOrder,
  OperationalIncident,
  OrderExecutionState,
} from '../stores/operationsCampaignStore';

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
export interface OperationsChallengeRun {
  id: string;
  challengeId: OperationsChallengeId;
  incidentId: string;
  orderId: string;
  startedAtMinute: number;
  deadlineMinute: number;
  startingShippedKg: number;
  startingQualityFailureKg: number;
  targetKg: number;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  endedAtMinute: number | null;
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
    | 'resolve'
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
  if (state.activeChallenge) return 'Finish or abandon the active challenge first.';
  if (!order || order.status === 'fulfilled' || order.status === 'cancelled')
    return 'Accept a production programme with an open commitment first.';
  if (state.incidents.some((incident) => incident.phase !== 'resolved'))
    return 'Recover existing incidents before adding another challenge.';
  if (state.execution.stage === 'planning')
    return 'Wait for the selected route to refresh its inventory and quality readings.';
  if (state.execution.orderId !== order.id || state.execution.sourceInventoryKg <= 0)
    return 'Receive the active recipe feedstock before starting.';
  if (!state.execution.qualityReleased || state.execution.stage === 'quality_hold')
    return 'Resolve the existing quality hold before starting.';
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
  const incident = state.incidents.find((candidate) => candidate.phase !== 'resolved');
  const run = state.activeChallenge;
  const recovery = getChallengeRecoveryIncident(state);
  const canAcceptNextProgramme =
    !run &&
    state.orders.every((order) => order.status === 'fulfilled' || order.status === 'cancelled');
  let nextAction: OperationsNextAction;
  if (incident?.phase === 'raised') {
    nextAction = {
      kind: 'acknowledge',
      targetId: incident.id,
      label: 'Acknowledge incident',
      consequence: `${incident.title}: acknowledgement records ownership; its production and safety effects remain active.`,
    };
  } else if (incident?.phase === 'acknowledged') {
    nextAction = {
      kind: 'mitigate',
      targetId: incident.id,
      label: 'Apply incident mitigation',
      consequence:
        'Halves the incident’s throughput and quality penalties. Existing equipment failures and quality holds still require their own recovery.',
    };
  } else if (recovery?.phase === 'mitigated' && recovery.effectApplied) {
    nextAction = {
      kind: 'resolve',
      targetId: recovery.id,
      label: 'Restore challenge controller',
      consequence: run
        ? 'Restores this effect-only controller scenario to normal. Complete the challenge by dispatching its target mass through the real quality and shipping gates.'
        : 'Restores the abandoned or expired scenario controller to normal. Its recorded challenge result remains unchanged; a fresh challenge can then be started.',
    };
  } else if (!state.execution.qualityReleased || state.execution.stage === 'quality_hold') {
    nextAction = {
      kind: 'quality',
      targetId: activeOrder?.id ?? null,
      label: 'Review quality hold',
      consequence:
        state.execution.dispatchLoad.blockReason ??
        'Inspect source traceability and tests in the QC lab. Held batches cannot satisfy a customer commitment.',
    };
  } else if (
    activeOrder &&
    state.execution.sourceInventoryKg <= 0 &&
    state.execution.releasedFinishedKg <= 0 &&
    state.execution.dispatchLoad.loadedKg <= 0
  ) {
    nextAction = {
      kind: 'receiving',
      targetId: activeOrder.id,
      label: 'Inspect incoming feedstock',
      consequence: `The ${activeOrder.recipe.sourceMaterial.replaceAll('_', ' ')} route is empty. Receiving and releasing the matching source lot permits milling to resume.`,
    };
  } else if (canAcceptNextProgramme) {
    nextAction = {
      kind: 'programme',
      targetId: null,
      label: 'Accept next production programme',
      consequence:
        'Creates three new 3,000 kg customer commitments with real recipe, quality and dispatch requirements. Existing stock remains available; no goods or revenue are created.',
    };
  } else if (
    ['ready_to_load', 'loading', 'ready_to_dispatch', 'dispatched'].includes(state.execution.stage)
  ) {
    nextAction = {
      kind: 'dispatch',
      targetId: activeOrder?.id ?? null,
      label: 'Inspect shipping progress',
      consequence:
        'Only material recorded on a departed shipping manifest credits the commitment. Loading and released stock alone earn no revenue.',
    };
  } else {
    nextAction = {
      kind: 'production',
      targetId: activeOrder?.id ?? null,
      label: incident ? 'Inspect residual incident effects' : 'Inspect active production route',
      consequence: incident
        ? `${incident.title} retains residual effects. Recover the affected equipment or hold in its owning workspace; acknowledgement alone cannot restore it.`
        : 'Follow feedstock through mills, sifters and packers. The scheduler sets recipe throughput; quality release precedes shipment.',
    };
  }
  const blockedReason = challengeBlockReason(state);
  const challengeOrder = run && state.orders.find((order) => order.id === run.orderId);
  return {
    activeOrder,
    blockers,
    nextAction,
    canAcceptNextProgramme,
    challenges: OPERATIONS_CHALLENGES.map(({ id, label }) => ({
      id,
      label,
      available: blockedReason === null,
      blockedReason,
    })),
    challengeProgress: run
      ? {
          label:
            OPERATIONS_CHALLENGES.find((challenge) => challenge.id === run.challengeId)?.label ??
            'Recovery challenge',
          dispatchedKg: Math.max(
            0,
            (challengeOrder?.shippedKg ?? run.startingShippedKg) - run.startingShippedKg
          ),
          targetKg: run.targetKg,
          remainingMinutes: Math.max(0, run.deadlineMinute - state.elapsedMinutes),
          phase:
            state.incidents.find((incident) => incident.id === run.incidentId)?.phase === 'resolved'
              ? ('recovering' as const)
              : ('responding' as const),
        }
      : null,
  };
}
