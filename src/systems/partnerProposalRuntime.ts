/**
 * The partner's proposals on the live plant: reads the stores into plain facts
 * (simulation/partnerProposals.ts PlantWorld), raises, settles, expires and
 * compares proposals once a central tick, and carries out what an answer does.
 *
 * Everything runs on the campaign's game minutes, so P holds a window and pace
 * scales it. It keeps no module state: the dedupe and the windows live in the
 * proposal store, which the physical session saves (captureUnifiedTickState
 * pins the tick's own saved fields, and this adds none).
 */
import {
  closesAtMinute,
  compareProposal,
  comparisonDue,
  isExpired,
  minutesToFailure,
  priceAll,
  proposalEffect,
  raiseProposals,
  resolveProposal,
  settleProposal,
  withdrawProposal,
  commitmentLateMinutes,
  DOCK_PROJECTION,
  type DockState,
  type PartName,
  type PartnerProposal,
  type PlantUnitFacts,
  type PlantWorld,
  type ProposalDecider,
  type ProposalEffect,
} from '../simulation/partnerProposals';
import { partnerProposalMessages as msg } from '../simulation/partnerProposals.messages';
import { describeProposalRecord, proposalRecordWording } from '../simulation/shiftReview';
import { buildProgramme, programmeShift } from '../simulation/programmes';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import {
  FIRST_ORDER_ID,
  FORFEIT_FEE_HOURS,
  FORFEIT_LATENESS_MINUTES,
  MAINTENANCE_COST_PER_WORK_ORDER_HOUR,
  orderReachable,
  programmeOfOrder,
  recordOperatorAction,
  useOperationsCampaignStore,
  type CampaignActor,
} from '../stores/operationsCampaignStore';
import {
  PART_PRICE,
  partsPrice,
  servicePart,
  useBreakdownStore,
  type BreakdownType,
} from '../stores/breakdownStore';
import {
  beginUnitService,
  bookUnitServiceForQuiet,
  minutesToQuiet,
  serviceAwaitingCrew,
  unitInService,
  unitServiceMinutes,
} from './unitService';
import {
  calculateEfficiency,
  getWearConfig,
  minimumServiceWear,
  useProductionStore,
} from '../stores/productionStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { BENCH_TEST_MINUTES } from '../stores/qcLabStore';
import {
  allocateStock,
  compareDispatchOrder,
  loadableStock,
  meetsMinimum,
  shipmentOrdersFrom,
} from '../simulation/shipmentPlan';
import { NEXT_TRUCK_MINUTES } from '../simulation/dispatchProposal';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { useUIStore } from '../stores/uiStore';
import { improvementObligations } from '../simulation/workplaceImprovement';
import type { WorkplaceState } from '../types/workplace';
import type { MachineData } from '../types';
import { getLocale, translate } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { customerDisplayName } from '../stores/customerNames';
import { intakeOutcome, receiveLot, refuseLot, type ArrivedLot } from './intakeRuntime';
import {
  ringTemper,
  ringTemperDecision,
  runTemper,
  stepTemper,
  temperWorld,
  type TemperGrain,
} from './temperRuntime';
import {
  incidentDefaultDelegation,
  incidentWorld,
  runIncidentResponse,
  ringIncident,
  ringIncidentDecision,
  ringIntake,
  ringIntakeDecision,
} from './incidentRuntime';

const ALERT_CATALOG = 'partnerProposals';
registerAlertCatalog(ALERT_CATALOG, msg);

/**
 * The parts each failure's work order requires: breakdownStore's
 * PARTS_FOR_BREAKDOWN, which it does not export. partnerProposalRuntime.test.ts
 * triggers a breakdown of each type and pins this table against it.
 */
export const FAILURE_PARTS: Record<BreakdownType, PartName[]> = {
  mechanical: ['bearings', 'belts'],
  electrical: ['sensors', 'motors'],
  overheating: ['filters', 'sensors'],
  vibration_failure: ['bearings', 'belts'],
};

/**
 * Game minutes a failure's service unit works: breakdownStore triggerBreakdown
 * sets 30 + (sequence x 7 mod 30), every value 30-59 once in 30 sequences, so
 * a failure not yet raised expects their mean. Pinned by the runtime test.
 */
export const EXPECTED_REPAIR_MINUTES = 44.5;

/** What the tick hands in, so this module never imports the tick back. */
export interface PartnerTickInputs {
  /** The tick's productPathQuality. */
  qualityOf: (machines: readonly MachineData[]) => number;
  /** The tick's machineWearPace. */
  wearPace: (machineId: string) => number;
  /** The Chronicle's wear multiplier, as the tick applies it. */
  wearMultiplier: number;
  /** Incident and Chronicle quality penalties, as the tick subtracts them. */
  qualityPenalty: number;
  /** The best stamp the line can make on each grain (the tick's bestReachableQuality). */
  bestReachable?: Partial<Record<'wheat_grain' | 'corn_grain', number>>;
  /**
   * Under a charter, the best stamp on wheat once a "dry first" answer already
   * given reaches the rolls, and the minute it does (the tick's
   * wheatReachableOnceDried); null or absent when none waits in its rest.
   */
  wheatOnceDried?: { figure: number; fromMinute: number } | null;
  /** A wheat lot that docked this tick under a charter (plan item 3.1). */
  arrivedLot?: ArrivedLot;
  /** The product path's stamp less incident penalties, before the grain's term. */
  intakeBase?: number;
  /** Under a charter, the wheat the line will be fed and its stamp context (plan item 7.7). */
  temperGrain?: () => TemperGrain | null;
}

/** What the tick lends the answers that move its own truck delays (plan items 3.1, 3.5). */
export interface TickHooks {
  shippingDelayMinutes: number;
  cancelShippingDelay: (minutes?: number) => number;
  delayNextGrainTruck: (minutes: number) => void;
}
let tickHooks: TickHooks | null = null;
/** The tick registers its hooks once, at load. */
export function registerTickHooks(hooks: TickHooks): void {
  tickHooks = hooks;
}
export const getTickHooks = () => tickHooks;

/**
 * The button's own gate (PlayableShift.tsx linkedReviewPending, private there):
 * a programme waits for a workplace review the campaign is linked to.
 */
function linkedReviewPending(state: WorkplaceState): boolean {
  if (state.improvement)
    return (
      state.phase !== 'review' ||
      !state.improvement.verdict ||
      improvementObligations(state).length > 0
    );
  return (
    !!state.campaign?.mission &&
    (state.campaign.shift !== 2 ||
      state.phase !== 'review' ||
      state.members.some((member) => member.recoveryOwedMinutes > 0) ||
      state.objections.some((objection) => objection.status === 'open'))
  );
}

const actorDecider = (actor: CampaignActor | undefined): ProposalDecider | null =>
  actor === 'operator' ? 'operator' : actor === 'agent' ? 'agent' : actor ? 'partner' : null;

function programmeFacts(): PlantWorld['programme'] {
  const campaign = useOperationsCampaignStore.getState();
  const accepted = [...campaign.logbook]
    .reverse()
    .find((entry) => entry.wording?.key === 'logProgrammeAccepted');
  const canAccept =
    deriveOperationsPlay(campaign).canAcceptNextProgramme &&
    !linkedReviewPending(useWorkplaceStore.getState().workplace);
  const base = {
    canAccept,
    programmeCount: campaign.programmeCount,
    lastAcceptedBy: accepted ? actorDecider(accepted.actor ?? 'controller') : null,
  };
  if (!canAccept) return { ...base, offer: null };
  // The programme acceptNextProgramme would build now, from the same templates.
  const number = campaign.programmeCount + 2;
  const orders = buildProgramme(
    useOperationsCampaignStore.getInitialState().orders,
    number,
    programmeShift(campaign.currentShiftKey),
    campaign.elapsedMinutes,
    'offer'
  );
  const committedKg = orders.reduce((sum, order) => sum + order.requiredKg, 0);
  const owed = { flour: 0, semolina: 0 };
  for (const order of orders) owed[order.recipe.finishedMaterial] += order.requiredKg;
  const released = { flour: 0, semolina: 0 };
  for (const batch of useMaterialFlowStore.getState().productionBatches)
    if (
      batch.disposition === 'released' &&
      batch.availableKg > 0 &&
      (batch.materialType === 'flour' || batch.materialType === 'semolina')
    )
      released[batch.materialType] += batch.availableKg;
  return {
    ...base,
    offer: {
      programmeNumber: number,
      programmeCount: campaign.programmeCount,
      committedKg,
      revenue: orders.reduce((sum, order) => sum + order.requiredKg * order.revenuePerKg, 0),
      firstDueMinutes:
        Math.min(...orders.map((order) => order.dueAtMinute)) - campaign.elapsedMinutes,
      stockReadyKg:
        Math.min(owed.flour, released.flour) + Math.min(owed.semolina, released.semolina),
    },
  };
}

/**
 * The next truck's departure, read from where it is in the yard, and the
 * line's packing rate (plan wave 3d; DOCK_PROJECTION has the measurement).
 */
function nextDepartureInMinutes(): number {
  const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
  const P = DOCK_PROJECTION;
  if (!shipping.truckActive || shipping.lifecyclePhase === 'scheduled')
    return (
      Math.max(0, Number.isFinite(shipping.nextArrivalMinutes) ? shipping.nextArrivalMinutes : 0) +
      P.arrivalToDepartureMinutes
    );
  if (shipping.lifecyclePhase === 'approaching') return P.approachingToDepartureMinutes;
  if (shipping.lifecyclePhase === 'departing') return P.leavingToDepartureMinutes;
  return P.dockedToDepartureMinutes;
}

/**
 * The dock as it stands (plan item 3.7, wave 3d): every open order with what
 * it still lacks, its late rate and whether the line can make it (the tick's
 * best reachable stamp); when the next truck leaves and what a truck carries;
 * the packed stock by product, tested and on the bench; and the line's rate
 * and product. projectDock reads it as the plant runs it.
 */
export function dockState(bestReachable: PartnerTickInputs['bestReachable']): DockState {
  const campaign = useOperationsCampaignStore.getState();
  const open = campaign.orders.filter(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
  const stock = { flour: { tested: 0, bench: 0 }, semolina: { tested: 0, bench: 0 } };
  for (const batch of useMaterialFlowStore.getState().productionBatches)
    if (
      batch.disposition === 'released' &&
      batch.availableKg > 0 &&
      (batch.materialType === 'flour' || batch.materialType === 'semolina')
    )
      stock[batch.materialType][batch.awaitingTest ? 'bench' : 'tested'] += batch.availableKg;
  const speed = useProductionStore.getState().productionSpeed;
  const capacity = campaign.execution.dispatchLoad.capacityKg;
  return {
    orders: open.map((order) => ({
      remainingKg: Math.max(0, order.requiredKg - order.shippedKg),
      dueAtMinute: order.dueAtMinute,
      priority: order.priority,
      product: order.recipe.finishedMaterial,
      programme: programmeOfOrder(order.id),
      reachable: orderReachable(order, bestReachable),
      active: order.id === campaign.activeOrderId,
      latePerKgHour: order.latePenaltyPerKgHour,
    })),
    nextTruckInMinutes: nextDepartureInMinutes(),
    cycleMinutes: DOCK_PROJECTION.cycleMinutes,
    capacityKg: Number.isFinite(capacity) && capacity > 0 ? capacity : 5000,
    latestProgramme: open.length > 0 ? programmeOfOrder(open[open.length - 1].id) : null,
    stock,
    lineKgPerMinute:
      DOCK_PROJECTION.lineKgPerMinuteAtFullRate *
      (Number.isFinite(speed) ? Math.max(0, speed) : 0) *
      campaign.getProductionMultiplier(),
    lineProduct: campaign.getActiveProductionPlan()?.finishedMaterial ?? null,
    forfeitAfterMinutes: FORFEIT_LATENESS_MINUTES,
  };
}

/**
 * Taking the next programme early (plan item 3.7): offered while exactly one
 * programme is open, the guide's own offer is not (an order is still open),
 * no challenge holds the plant and no workplace review is pending. Priced in
 * the late order-minutes it adds on the dock and the kilograms it commits.
 */
function commitmentFacts(inputs: PartnerTickInputs): PlantWorld['commitment'] {
  const campaign = useOperationsCampaignStore.getState();
  const dock = dockState(inputs.bestReachable);
  const open = campaign.orders.filter(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
  // Not during the guided first delivery: the tour's order is the player's own.
  const firstClosed = !open.some((order) => order.id === FIRST_ORDER_ID);
  const canTakeEarly =
    open.length > 0 &&
    firstClosed &&
    !campaign.activeChallenge &&
    new Set(open.map((order) => programmeOfOrder(order.id))).size === 1 &&
    !linkedReviewPending(useWorkplaceStore.getState().workplace);
  if (!canTakeEarly) return { canTakeEarly, offer: null, dock };
  const number = campaign.programmeCount + 2;
  const programme = buildProgramme(
    useOperationsCampaignStore.getInitialState().orders,
    number,
    programmeShift(campaign.currentShiftKey),
    campaign.elapsedMinutes,
    'offer'
  );
  const orders = programme.map((order) => ({
    kg: order.requiredKg,
    dueInMinutes: order.dueAtMinute - campaign.elapsedMinutes,
    priority: order.priority,
    product: order.recipe.finishedMaterial,
    latePerKgHour: order.latePenaltyPerKgHour,
  }));
  return {
    canTakeEarly,
    dock,
    offer: {
      programmeNumber: number,
      programmeCount: campaign.programmeCount,
      committedKg: orders.reduce((sum, order) => sum + order.kg, 0),
      revenue: programme.reduce((sum, order) => sum + order.requiredKg * order.revenuePerKg, 0),
      orders,
      lateMinutes: commitmentLateMinutes(orders, dock, campaign.elapsedMinutes),
    },
  };
}

/** The tick's wear rate on a unit (updateMachineTruth), per game minute; 0 while it is not running. */
function unitWearPerMinute(
  machine: MachineData,
  inputs: Pick<PartnerTickInputs, 'wearPace' | 'wearMultiplier'>
): number {
  if (machine.status !== 'running' && machine.status !== 'warning') return 0;
  const load = Number.isFinite(machine.metrics.load) ? machine.metrics.load : 0;
  return (
    getWearConfig(machine.type).wearRatePerSecond *
    inputs.wearPace(machine.id) *
    (0.5 + load / 100) *
    (inputs.wearMultiplier > 0 ? inputs.wearMultiplier : 1) *
    60
  );
}

/**
 * The line's stamp before the grain's term, `minutes` on (the temper card,
 * plan item 7.7): `base` less what the units' wear takes off by then, each
 * worn at the tick's rate up to its warning, where its wear prediction raises
 * the service the partner gives by default (a unit already past it stays
 * where it is). An answer covers flour milled until its shift's wheat is
 * gone, so pricing it on the stamp at the moment it is raised let the partner
 * keep the standard temper at 95.1 and pack the shift's later flour at 94.7
 * (the Chronicle probe, 13 November).
 */
export function projectedStampBase(
  inputs: Pick<PartnerTickInputs, 'qualityOf' | 'wearPace' | 'wearMultiplier'>,
  base: number,
  minutes: number
): number {
  const machines = useProductionStore.getState().machines;
  const worn = machines.map((machine) => {
    const rate = unitWearPerMinute(machine, inputs);
    const warning = getWearConfig(machine.type).warningThreshold;
    const wear = Number.isFinite(machine.metrics.wear) ? machine.metrics.wear : 0;
    if (!(rate > 0) || !(minutes > 0) || wear >= warning) return machine;
    const later = Math.min(warning, wear + rate * minutes);
    const lost = calculateEfficiency(wear, machine.type) - calculateEfficiency(later, machine.type);
    if (!(lost > 0)) return machine;
    const efficiency = Number.isFinite(machine.metrics.efficiency)
      ? machine.metrics.efficiency
      : 100;
    return {
      ...machine,
      metrics: { ...machine.metrics, wear: later, efficiency: efficiency - lost },
    };
  });
  const drop = inputs.qualityOf(machines) - inputs.qualityOf(worn);
  return base - (Number.isFinite(drop) ? Math.max(0, drop) : 0);
}

/** One unit's facts, with the stamp priced through the tick's own function. */
function unitFacts(
  machine: MachineData,
  machines: readonly MachineData[],
  inputs: PartnerTickInputs,
  strictestMinimum: number | null,
  openMinimums: number[],
  toQuiet: number | null
): PlantUnitFacts {
  const maintenance = useBreakdownStore.getState();
  const config = getWearConfig(machine.type);
  const wear = Number.isFinite(machine.metrics.wear) ? machine.metrics.wear : 0;
  const alert = maintenance.predictiveAlerts.find(
    (candidate) =>
      candidate.machineId === machine.id && !candidate.acknowledged && candidate.windowFromWear
  );
  const freePart = servicePart(maintenance.workOrders, maintenance.partsInventory);
  const failureParts = FAILURE_PARTS[alert?.predictedFailureType ?? 'mechanical'];
  const stamp = (replacement: MachineData) =>
    Math.max(
      0,
      inputs.qualityOf(machines.map((m) => (m.id === machine.id ? replacement : m))) -
        inputs.qualityPenalty
    );
  const servicedWear = Math.max(0, wear - Math.min(wear, config.maintenanceReduction));
  const nearFailureWear = Math.max(wear, config.breakdownThreshold - 0.01);
  const asRunning = (unitWear: number): MachineData => ({
    ...machine,
    status: 'running',
    metrics: {
      ...machine.metrics,
      wear: unitWear,
      efficiency: calculateEfficiency(unitWear, machine.type),
    },
  });
  return {
    machineId: machine.id,
    machineName: machine.name,
    wear,
    breakdownWear: config.breakdownThreshold,
    wearPerMinute: unitWearPerMinute(machine, inputs),
    servicePart: freePart ?? null,
    failureParts: [...failureParts],
    repairMinutes: EXPECTED_REPAIR_MINUTES,
    workOrderRatePerHour: MAINTENANCE_COST_PER_WORK_ORDER_HOUR,
    qualityServiced: stamp(asRunning(servicedWear)),
    qualityAtFailure: stamp(asRunning(nearFailureWear)),
    strictestMinimum,
    openMinimums,
    servicePartPrice: freePart ? PART_PRICE[freePart] : 0,
    failurePartsPrice: partsPrice(
      failureParts.reduce<Partial<Record<PartName, number>>>((counts, part) => {
        counts[part] = (counts[part] ?? 0) + 1;
        return counts;
      }, {})
    ),
    serviceMinutes: unitServiceMinutes(machine.type),
    minutesToQuiet: toQuiet,
    openWearAlertId: alert?.id ?? null,
    brokenDown: machine.status === 'critical' || !!maintenance.getBreakdownForMachine(machine.id),
    minimumServiceWear: minimumServiceWear(machine.type),
    serviceRefused: alert?.serviceRefused ? { ...alert.serviceRefused } : null,
    stopped: useGameSimulationStore.getState().emergencyActive,
  };
}

/**
 * The plant as plain facts. Units are built only where a proposal needs them:
 * an open wear prediction, or a service proposal still open or awaiting its
 * comparison.
 */
export function readPlantWorld(
  inputs: PartnerTickInputs,
  proposals: readonly PartnerProposal[]
): PlantWorld {
  const campaign = useOperationsCampaignStore.getState();
  const machines = useProductionStore.getState().machines;
  const wanted = new Set<string>();
  for (const alert of useBreakdownStore.getState().predictiveAlerts)
    if (!alert.acknowledged && alert.windowFromWear) wanted.add(alert.machineId);
  for (const proposal of proposals)
    if (proposal.kind === 'service' && (proposal.status === 'open' || !proposal.comparison))
      wanted.add((proposal as PartnerProposal<'service'>).facts.machineId);
  const open = campaign.orders.filter(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
  const strictestMinimum =
    open.length > 0 ? Math.max(...open.map((order) => order.recipe.minimumQuality)) : null;
  const openMinimums = [...new Set(open.map((order) => order.recipe.minimumQuality))].sort(
    (x, y) => y - x
  );
  const toQuiet = wanted.size > 0 ? minutesToQuiet() : null;
  return {
    sessionId: useMaterialFlowStore.getState().sessionId,
    minute: campaign.elapsedMinutes,
    programme: programmeFacts(),
    units: machines
      .filter((machine) => wanted.has(machine.id))
      .map((machine) =>
        unitFacts(machine, machines, inputs, strictestMinimum, openMinimums, toQuiet)
      ),
    ...dispatchWorld(),
    commitment: commitmentFacts(inputs),
    ...forfeitWorld(inputs),
    intake: inputs.arrivedLot ?? null,
    intakeOutcome: typeof inputs.intakeBase === 'number' ? intakeOutcome(inputs.intakeBase) : null,
    ...incidentWorld(inputs, tickHooks),
    temper: temperWorld(inputs.temperGrain?.() ?? null, inputs.intakeBase, (base, minutes) =>
      projectedStampBase(inputs, base, minutes)
    ),
  };
}

/**
 * Orders past their due time that the line cannot make on their grain (the
 * tick's best reachable stamp under their minimum), each with what a forfeit
 * books now and what keeping it to its bound would (plan item 3.7). Not an
 * order that a "dry first" answer already given makes reachable once its
 * wheat reaches the rolls, before the order's bound: the stamp then is the
 * dried grain's (review 2, finding 3).
 */
function forfeitWorld(inputs: PartnerTickInputs): Pick<PlantWorld, 'forfeit' | 'openOrderIds'> {
  const campaign = useOperationsCampaignStore.getState();
  const open = campaign.orders.filter(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
  const dried = inputs.wheatOnceDried;
  const forfeit = open.flatMap((order) => {
    const best = inputs.bestReachable?.[order.recipe.sourceMaterial];
    if (best === undefined || campaign.elapsedMinutes < order.dueAtMinute) return [];
    if (orderReachable(order, inputs.bestReachable)) return [];
    if (
      dried &&
      order.recipe.sourceMaterial === 'wheat_grain' &&
      dried.fromMinute < order.dueAtMinute + FORFEIT_LATENESS_MINUTES &&
      meetsMinimum(dried.figure, order.recipe.minimumQuality)
    )
      return [];
    const lackingKg = Math.max(0, order.requiredKg - order.shippedKg);
    return [
      {
        orderId: order.id,
        customer: order.customer,
        minimum: order.recipe.minimumQuality,
        best,
        lackingKg,
        latePerKgHour: order.latePenaltyPerKgHour,
        minutesToBound: Math.max(
          0,
          order.dueAtMinute + FORFEIT_LATENESS_MINUTES - campaign.elapsedMinutes
        ),
        fee: Math.round(lackingKg * order.latePenaltyPerKgHour * FORFEIT_FEE_HOURS * 100) / 100,
      },
    ];
  });
  return { forfeit, openOrderIds: open.map((order) => order.id) };
}

// ---------------------------------------------------------------------------
// What an answer does
// ---------------------------------------------------------------------------

/**
 * Carries out an answer's effect with the same store calls its own button
 * makes. False when the plant refuses it (a stop, an open fault, no free part,
 * nothing left to accept), so the record says what actually ran.
 */
/** A service begun, or waiting to begin when the season's Maintenance is back (5.4). */
const serviceAsked = (result: ReturnType<typeof beginUnitService>) =>
  result.started || result.reason === 'awaiting-crew';

export function runProposalEffect(effect: ProposalEffect, decidedBy: ProposalDecider): boolean {
  const actor: CampaignActor = decidedBy === 'partner' ? 'controller' : decidedBy;
  switch (effect.type) {
    case 'none':
      return true;
    case 'receive-lot':
      return receiveLot(effect);
    case 'refuse-lot':
      return refuseLot(effect, tickHooks?.delayNextGrainTruck);
    case 'respond-incident':
      return runIncidentResponse(effect, actor, tickHooks);
    case 'temper':
      return runTemper(effect);
    case 'forfeit-order':
      return useOperationsCampaignStore
        .getState()
        .forfeitOrder(effect.orderId, actor, { wheat_grain: effect.best, corn_grain: effect.best });
    case 'accept-programme':
      if (linkedReviewPending(useWorkplaceStore.getState().workplace)) return false;
      return useOperationsCampaignStore
        .getState()
        .acceptNextProgramme(actor, effect.early ? { early: true } : {});
    case 'service-unit':
    case 'service-unit-quiet': {
      // The Inspector's Maintain (unitService beginUnitService): the unit goes
      // offline for its service minutes and takes a part, refused during a
      // stop, with an open fault, or with no free part. The quiet answer books
      // it for the next quiet spell instead.
      if (useGameSimulationStore.getState().emergencyActive) return false;
      const machine = useProductionStore
        .getState()
        .machines.find((candidate) => candidate.id === effect.machineId);
      if (!machine) return false;
      const ran =
        effect.type === 'service-unit'
          ? serviceAsked(beginUnitService(effect.machineId))
          : bookUnitServiceForQuiet(effect.machineId);
      if (ran && decidedBy !== 'partner')
        recordOperatorAction({ kind: 'maintenance', machine: machine.name }, decidedBy);
      return ran;
    }
  }
}

/**
 * A service that could not start for a cause that clears (a stop or a drill,
 * no free part) says so, on the proposal and on the unit's prediction, so the
 * partner offers it again once the cause clears (the service kind's raise)
 * and a failure meanwhile is not read as a warning ignored. A service
 * answered "run on" clears the prediction's mark: that warning was ignored.
 */
function withRefusal<P extends PartnerProposal>(
  proposal: P,
  effect: ProposalEffect,
  ran: boolean
): P {
  if (!proposal.resolution || proposal.kind !== 'service') return proposal;
  const machineId = (proposal as PartnerProposal<'service'>).facts.machineId;
  if (proposal.resolution.optionId === 'run-on') {
    useBreakdownStore.getState().holdPredictedService(machineId, null);
    return proposal;
  }
  if (ran || effect.type !== 'service-unit') return proposal;
  const maintenance = useBreakdownStore.getState();
  const refusal = useGameSimulationStore.getState().emergencyActive
    ? 'stopped'
    : !servicePart(maintenance.workOrders, maintenance.partsInventory)
      ? 'no-part'
      : null;
  if (!refusal) return proposal;
  maintenance.holdPredictedService(machineId, refusal);
  return { ...proposal, resolution: { ...proposal.resolution, refusal } };
}

/**
 * A service asked for while the season's Maintenance was away runs when they
 * are back (unitService); if it then could not start (no part), its
 * prediction says so (`serviceRefused`) and stays open. Its proposal, which
 * resolved as having run, is corrected: it did not run.
 */
function refusedAfterWaiting(proposals: PartnerProposal[], world: PlantWorld): PartnerProposal[] {
  let changed = false;
  const next = proposals.map((proposal) => {
    if (proposal.kind !== 'service' || proposal.status !== 'resolved') return proposal;
    const resolution = proposal.resolution;
    if (!resolution?.ran || resolution.optionId !== 'service') return proposal;
    const facts = (proposal as PartnerProposal<'service'>).facts;
    const unit = world.units.find((candidate) => candidate.machineId === facts.machineId);
    if (!unit?.serviceRefused || unit.openWearAlertId !== facts.alertId) return proposal;
    if (unitInService(facts.machineId) || serviceAwaitingCrew(facts.machineId)) return proposal;
    changed = true;
    return {
      ...proposal,
      resolution: { ...resolution, ran: false, refusal: unit.serviceRefused.reason },
    };
  });
  return changed ? next : proposals;
}

// ---------------------------------------------------------------------------
// The bell and the record
// ---------------------------------------------------------------------------

/**
 * An asked card's bell: what is asked and how many game minutes there are to
 * answer, read once to a screen reader as it is raised (announce, the alert
 * path), since the partner's choice runs when the window closes. Keyed through
 * `bellAsked`, so it reads in the language active now.
 */
function fileAsked(
  proposal: PartnerProposal,
  key: string,
  params: Record<string, string | number>
): void {
  const asked = { ...params, asked: key, window: proposal.windowMinutes };
  useUIStore.getState().addAlert({
    id: `partner-proposal-${proposal.id}`,
    type: 'info',
    title: translate(msg, 'bellProposalTitle'),
    message: translate(msg, 'bellAsked', asked),
    timestamp: new Date(),
    acknowledged: false,
    announce: 'polite',
    copy: {
      catalog: ALERT_CATALOG,
      title: 'bellProposalTitle',
      message: 'bellAsked',
      params: asked,
    },
  });
}

function ringProposal(proposal: PartnerProposal): void {
  // The early programme is asked again each hour it stands: the card is
  // there, and the bell rang at the first ask.
  if (proposal.kind === 'commitment' && (proposal as PartnerProposal<'commitment'>).facts.ask > 1)
    return;
  if (proposal.kind === 'intake') return ringIntake(proposal as PartnerProposal<'intake'>);
  if (proposal.kind === 'incident') return ringIncident(proposal as PartnerProposal<'incident'>);
  if (proposal.kind === 'temper') return ringTemper(proposal as PartnerProposal<'temper'>);
  if (proposal.kind === 'forfeit') {
    const facts = (proposal as PartnerProposal<'forfeit'>).facts;
    const params = {
      customer: customerDisplayName(facts.customer),
      minimum: facts.minimum,
      best: facts.best,
    };
    fileAsked(proposal, 'bellForfeitProposed', params);
    return;
  }
  if (proposal.kind === 'dispatch') {
    const facts = (proposal as PartnerProposal<'dispatch'>).facts;
    const params = { customer: customerDisplayName(facts.customer), minimum: facts.minimumQuality };
    fileAsked(proposal, 'bellDispatchProposed', params);
    return;
  }
  const params: Record<string, string | number> =
    proposal.kind === 'programme'
      ? {
          number: (proposal as PartnerProposal<'programme'>).facts.programmeNumber,
          kg: (proposal as PartnerProposal<'programme'>).facts.committedKg,
        }
      : proposal.kind === 'commitment'
        ? {
            number: (proposal as PartnerProposal<'commitment'>).facts.programmeNumber,
            kg: (proposal as PartnerProposal<'commitment'>).facts.committedKg,
            late: (proposal as PartnerProposal<'commitment'>).facts.lateMinutes,
          }
        : {
            machine: (proposal as PartnerProposal<'service'>).facts.machineName,
            minutes: Math.round(
              minutesToFailure((proposal as PartnerProposal<'service'>).facts) ?? 0
            ),
          };
  const key =
    proposal.kind === 'programme'
      ? 'bellProgrammeProposed'
      : proposal.kind === 'commitment'
        ? 'bellCommitmentProposed'
        : !(proposal as PartnerProposal<'service'>).facts.reoffered
          ? 'bellServiceProposed'
          : (proposal as PartnerProposal<'service'>).facts.reofferedAfter === 'stopped'
            ? 'bellServiceProposedAfterStop'
            : 'bellServiceProposedAgain';
  // 'info', and no machineId: the rules layer answers machine alarms with a
  // card of its own (aiEngine initializeAlertReactions); this is not one.
  fileAsked(proposal, key, params);
}

/**
 * The bell when the partner decided (a window closed, or the kind is on
 * "decide and tell me"): what it did, and what the other answer would have
 * cost, priced as its button was (plan item 3.0, the delegation rule).
 */
function ringDecision(proposal: PartnerProposal, ran: boolean): void {
  if (proposal.kind === 'intake')
    return ringIntakeDecision(proposal as PartnerProposal<'intake'>, ran);
  if (proposal.kind === 'incident')
    return ringIncidentDecision(proposal as PartnerProposal<'incident'>, ran);
  if (proposal.kind === 'temper')
    return ringTemperDecision(proposal as PartnerProposal<'temper'>, ran);
  const decided: { key: string; params: Record<string, string | number> } =
    proposal.kind === 'forfeit'
      ? {
          key: ran ? 'bellForfeitDecided' : 'bellForfeitRefused',
          params: {
            customer: customerDisplayName((proposal as PartnerProposal<'forfeit'>).facts.customer),
          },
        }
      : proposal.kind === 'dispatch'
        ? {
            key: 'bellDispatchDecided',
            params: {
              customer: customerDisplayName(
                (proposal as PartnerProposal<'dispatch'>).facts.customer
              ),
            },
          }
        : proposal.kind === 'programme'
          ? {
              key: ran ? 'bellProgrammeDecided' : 'bellProgrammeRefused',
              params: { number: (proposal as PartnerProposal<'programme'>).facts.programmeNumber },
            }
          : proposal.kind === 'commitment'
            ? {
                key: !ran
                  ? 'bellCommitmentRefused'
                  : proposal.defaultOptionId === 'take'
                    ? 'bellCommitmentTaken'
                    : 'bellCommitmentWaited',
                params: {
                  number: (proposal as PartnerProposal<'commitment'>).facts.programmeNumber,
                },
              }
            : {
                key: ran ? 'bellServiceDecided' : 'bellServiceRefused',
                params: { machine: (proposal as PartnerProposal<'service'>).facts.machineName },
              };
  const other = proposal.options.find((option) => option.id !== proposal.defaultOptionId);
  const params: Record<string, string | number> = other
    ? {
        ...decided.params,
        decided: decided.key,
        other: other.id,
        money: Math.max(0, other.price.currency),
        kg: Math.max(0, other.price.kg),
        minutes: Math.max(0, other.price.minutes ?? 0),
      }
    : decided.params;
  const key = other ? 'bellDecidedTold' : decided.key;
  useUIStore.getState().addAlert({
    id: `partner-decided-${proposal.id}`,
    type: ran ? 'info' : 'warning',
    title: translate(msg, 'bellDecidedTitle'),
    message: (translate as (c: unknown, k: string, p: unknown) => string)(msg, key, params),
    timestamp: new Date(),
    acknowledged: false,
    // A decision that could not run is a problem, read once; one that ran stays quiet.
    ...(ran ? {} : { announce: 'polite' as const }),
    copy: { catalog: ALERT_CATALOG, title: 'bellDecidedTitle', message: key, params },
  });
}

/** The comparison's line in the campaign log, under the one who decided. */
function writeRecord(proposal: PartnerProposal): void {
  const line = describeProposalRecord(proposal, getLocale());
  if (!line || !proposal.resolution) return;
  const decidedBy = proposal.resolution.decidedBy;
  const actor: CampaignActor = decidedBy === 'partner' ? 'controller' : decidedBy;
  useOperationsCampaignStore.getState().addLogEntry(
    translate(msg, decidedBy === 'partner' ? 'deciderPartner' : 'deciderOperator'),
    proposal.kind === 'service'
      ? 'maintenance'
      : proposal.kind === 'intake' || proposal.kind === 'temper'
        ? 'quality'
        : 'operation',
    line,
    proposal.id,
    actor,
    // Keyed, so the shift report keeps every record and words it at read time.
    { wording: proposalRecordWording(proposal) }
  );
}

// ---------------------------------------------------------------------------
// Answering, and the tick's one call
// ---------------------------------------------------------------------------

/**
 * Answer an open proposal: its option's effect runs now and the proposal
 * resolves with what ran. The card's buttons call this as the operator; an
 * agent command as the agent. False when there is no such open proposal.
 */
export function answerPartnerProposal(
  proposalId: string,
  optionId: string,
  decidedBy: Exclude<ProposalDecider, 'partner'> = 'operator'
): boolean {
  const store = usePartnerProposalStore.getState();
  const proposal = store.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal || proposal.status !== 'open') return false;
  if (!proposal.options.some((option) => option.id === optionId)) return false;
  const effect = proposalEffect(proposal.kind, optionId, proposal.facts);
  const ran = runProposalEffect(effect, decidedBy);
  const minute = useOperationsCampaignStore.getState().elapsedMinutes;
  // Re-read: the effect's own store writes do not touch this store.
  usePartnerProposalStore
    .getState()
    .setProposals(
      usePartnerProposalStore
        .getState()
        .proposals.map((candidate) =>
          candidate.id === proposalId
            ? withRefusal(resolveProposal(candidate, optionId, decidedBy, minute, ran), effect, ran)
            : candidate
        )
    );
  return true;
}

/**
 * The tick's one call: drop another session's proposals, settle what the
 * plant answered by other means, expire windows (the partner's choice runs,
 * stamped at the window's close), raise what the plant now calls for (decided
 * at once where the player delegated the kind), and write the comparison of
 * anything resolved an hour ago. The caller skips it in benchmark runtime and
 * replays, so nothing is raised or expires there.
 */
export function stepPartnerProposals(inputs: PartnerTickInputs): void {
  const store = usePartnerProposalStore.getState();
  const sessionId = useMaterialFlowStore.getState().sessionId;
  const minute = useOperationsCampaignStore.getState().elapsedMinutes;
  // A reset plant (new material session, or a campaign clock wound back)
  // ends every proposal of the old one.
  let proposals = store.proposals.filter(
    (proposal) => proposal.sessionId === sessionId && proposal.raisedAtMinute <= minute + 1e-9
  );
  let changed = proposals.length !== store.proposals.length;
  // The temper at the rolls follows the campaign's minute (plan item 7.7).
  stepTemper();
  if (
    proposals.length === 0 &&
    store.proposals.length === 0 &&
    !inputs.arrivedLot &&
    !inputs.temperGrain &&
    !needsWorld()
  )
    return;

  let world = readPlantWorld(inputs, proposals);

  // 0. A service that waited for the crew and then could not start did not run.
  const corrected = refusedAfterWaiting(proposals, world);
  if (corrected !== proposals) {
    proposals = corrected;
    changed = true;
  }

  // 1. Answered by other means: the guide's Accept button, the Inspector's
  // Maintain, an agent command, or overtaken by a failure.
  proposals = proposals.map((proposal) => {
    if (proposal.status !== 'open') return proposal;
    const settled = settleProposal(proposal, world);
    if (!settled) return proposal;
    changed = true;
    return settled.type === 'withdrawn'
      ? withdrawProposal(proposal)
      : resolveProposal(proposal, settled.optionId, settled.decidedBy, minute, true);
  });

  // 2. Windows closed unanswered: the partner's choice runs.
  for (const proposal of proposals) {
    if (!isExpired(proposal, minute)) continue;
    const effect = proposalEffect(proposal.kind, proposal.defaultOptionId, proposal.facts);
    const ran = runProposalEffect(effect, 'partner');
    const at = closesAtMinute(proposal);
    proposals = proposals.map((candidate) =>
      candidate.id === proposal.id
        ? withRefusal(
            resolveProposal(candidate, proposal.defaultOptionId, 'partner', at, ran),
            effect,
            ran
          )
        : candidate
    );
    if (tellsDecision(proposal)) ringDecision(proposal, ran);
    changed = true;
  }
  if (changed) world = readPlantWorld(inputs, proposals);

  // 3. New proposals; a delegated kind is decided at once and the bell says so.
  let sequence = store.sequence;
  const raised = raiseProposals(
    world,
    proposals,
    (index) => `proposal-${String(sequence + index + 1).padStart(5, '0')}`,
    store.settledSubjects
  );
  if (raised.length > 0) {
    sequence += raised.length;
    changed = true;
    for (const proposal of raised) {
      if (delegationOf(proposal, store) === 'decide') {
        const effect = proposalEffect(proposal.kind, proposal.defaultOptionId, proposal.facts);
        const ran = runProposalEffect(effect, 'partner');
        proposals = [
          ...proposals,
          withRefusal(
            resolveProposal(proposal, proposal.defaultOptionId, 'partner', minute, ran),
            effect,
            ran
          ),
        ];
        if (tellsDecision(proposal)) ringDecision(proposal, ran);
      } else {
        proposals = [...proposals, proposal];
        ringProposal(proposal);
      }
    }
  }

  // 4. An hour after an answer, every answer priced again on what it measured.
  for (const proposal of proposals) {
    if (!comparisonDue(proposal, minute)) continue;
    const compared = compareProposal(proposal, world, minute);
    proposals = proposals.map((candidate) => (candidate.id === proposal.id ? compared : candidate));
    writeRecord(compared);
    changed = true;
  }

  if (changed) usePartnerProposalStore.getState().setProposals(proposals, sequence);
}

/**
 * Whether the partner's own decision rings the bell. Every decision that does
 * something does. Waiting on an early programme does nothing and is asked
 * again each hour, so it rings nothing; the offer stays in the record.
 */
function tellsDecision(proposal: PartnerProposal): boolean {
  return !(proposal.kind === 'commitment' && proposal.defaultOptionId === 'wait');
}

/**
 * Whether the partner decides a proposal at once: the player's setting for its
 * kind where they set one, else the kind's default by the delegation rule, read
 * per incident kind for an incident (plan item 3.5).
 */
function delegationOf(
  proposal: PartnerProposal,
  store: ReturnType<typeof usePartnerProposalStore.getState>
) {
  if (proposal.kind === 'incident' && !(store.delegationChosen ?? []).includes('incident'))
    return incidentDefaultDelegation((proposal as PartnerProposal<'incident'>).facts.incidentKind);
  return store.delegation[proposal.kind];
}

/** True when the plant may call for a proposal now (so an empty store still looks). */
function needsWorld(): boolean {
  // An open incident may want its two answers (plan item 3.5).
  if (useOperationsCampaignStore.getState().incidents.some((i) => i.phase === 'raised'))
    return true;
  // A truck at the dock for an order: the dispatch kind may have a question.
  if (dispatchWorld().dispatchCycleId) return true;
  if (
    useBreakdownStore.getState().predictiveAlerts.some((a) => !a.acknowledged && a.windowFromWear)
  )
    return true;
  const campaign = useOperationsCampaignStore.getState();
  if (deriveOperationsPlay(campaign).canAcceptNextProgramme) return true;
  // One programme open: taking the next early may be on offer (plan item 3.7).
  return campaign.orders.some(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
}

/**
 * Game minutes for owed flour to be packed at the line's rated speed and
 * tested: three packers at 25 kg a plant second, two plant seconds a game
 * minute, times the line rate (materialFlowStore packer processingRate,
 * simulation/pace.ts), then the bench.
 */
const PACKED_KG_PER_GAME_MINUTE_AT_FULL_RATE = 3 * 25 * 2;

/**
 * The dispatch question as the plant stands (plan item 3.4): a truck at the
 * dock for the active order, which is short of flour that meets its minimum,
 * while tested flour of its product under that minimum is taken by another
 * open order. Null when there is no such question.
 */
function dispatchWorld(): Pick<PlantWorld, 'dispatch' | 'dispatchCycleId' | 'lineQuality'> {
  const campaign = useOperationsCampaignStore.getState();
  const load = campaign.execution.dispatchLoad;
  const docked = useTruckScheduleStore.getState().truckSchedule.shipping.transferReady;
  const lineQuality = useProductionStore.getState().metrics.quality;
  const cycleId =
    docked && (load.status === 'loading' || load.status === 'ready' || load.status === 'held')
      ? load.cycleId
      : null;
  const none = { dispatch: null, dispatchCycleId: cycleId, lineQuality };
  if (!cycleId) return none;
  const orders = shipmentOrdersFrom(campaign.orders);
  const active = orders.find((order) => order.id === campaign.activeOrderId);
  if (!active || active.remainingKg <= 1e-6 || active.product !== load.materialType) return none;
  const stock = useMaterialFlowStore.getState().productionBatches;
  const covered =
    allocateStock([active], stock, active.product, loadableStock).coveredKg.get(active.id) ?? 0;
  const short = active.remainingKg - covered;
  if (short <= 1e-6) return none;
  const others = orders.filter(
    (order) =>
      order.id !== active.id &&
      order.product === active.product &&
      order.remainingKg > 1e-6 &&
      order.minimumQuality < active.minimumQuality
  );
  let heldKg = 0;
  let to: (typeof orders)[number] | null = null;
  for (const batch of stock) {
    if (batch.materialType !== active.product || !loadableStock(batch) || batch.availableKg <= 0)
      continue;
    if (meetsMinimum(batch.qualityScore, active.minimumQuality)) continue;
    const taker = others
      .filter((order) => meetsMinimum(batch.qualityScore, order.minimumQuality))
      .sort(compareDispatchOrder)[0];
    if (!taker) continue;
    heldKg += batch.availableKg;
    if (!to || compareDispatchOrder(taker, to) < 0) to = taker;
  }
  if (!to || heldKg <= 1e-6) return none;
  const order = campaign.orders.find((candidate) => candidate.id === active.id)!;
  const toOrder = campaign.orders.find((candidate) => candidate.id === to!.id)!;
  const rate =
    PACKED_KG_PER_GAME_MINUTE_AT_FULL_RATE *
    Math.max(0.05, useProductionStore.getState().productionSpeed || 0);
  return {
    dispatchCycleId: cycleId,
    lineQuality,
    dispatch: {
      cycleId,
      orderId: active.id,
      customer: order.customer,
      recipeId: order.recipe.id,
      minimumQuality: active.minimumQuality,
      owedKg: active.remainingKg,
      dueInMinutes: active.dueAtMinute - campaign.elapsedMinutes,
      heldKg,
      toOrderId: toOrder.id,
      toCustomer: toOrder.customer,
      toRecipeId: toOrder.recipe.id,
      qualityNow: lineQuality,
      inSpecMinutes: short / rate + BENCH_TEST_MINUTES,
      nextTruckMinutes: NEXT_TRUCK_MINUTES,
    },
  };
}

/** For tests and the card: each option of a proposal priced on its own facts. */
export const pricedOptions = (proposal: PartnerProposal) => priceAll(proposal.kind, proposal.facts);
