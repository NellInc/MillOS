/**
 * UnifiedGameTick - Allocation-conscious game state updates
 *
 * ARCHITECTURE (per GPT 5.2 recommendations):
 * 1. REUSE OBJECTS - Module-level ctx/arrays, mutated not recreated
 * 2. STORE TRUTH ONLY - No cosmetic variance in store
 * 3. VISUAL SMOOTHING - Done at display time, not in store
 * 4. MINIMAL WRITES - Only write when truth actually changes
 *
 * The store holds TRUTH. Display adds COSMETICS.
 */

import { useEffect } from 'react';
import { centralTick, TICK_PRIORITY } from './CentralTickSystem';
import { resetUnitWork, stepUnitWork } from './unitService';
import { lineOverdrive, OVERDRIVE_WEAR_SLOPE } from '../simulation/machineLoad';
import { grainPurchaseCost, grainValueOnSite } from '../simulation/grainPrice';
import type { TickContext } from './CentralTickSystem';
import {
  useGameSimulationStore,
  getShiftForHour,
  getShiftWindowKey,
  selectRestartPending,
} from '../stores/gameSimulationStore';
import {
  useProductionStore,
  calculateEfficiency,
  getWearConfig,
  wearHoldsWarning,
} from '../stores/productionStore';
import {
  bindLotHeldBatches,
  getDispatchQualityStatus,
  stepLabBench,
  useQCLabStore,
} from '../stores/qcLabStore';
import {
  getNotifiedLotIds,
  useMaterialFlowStore,
  type MaterialFlowState,
  type MaterialType,
} from '../stores/materialFlowStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import {
  partsPrice,
  useBreakdownStore,
  wearWarningIgnored,
  type BreakdownType,
} from '../stores/breakdownStore';
import { buildIntakeFacts, type ArrivedLot } from './intakeRuntime';
import { actOnMetIncidents } from './incidentRuntime';
import { useUIStore } from '../stores/uiStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { BAG_WEIGHT_KG, type MachineData } from '../types';
import {
  DEMURRAGE_COST_PER_HOUR,
  MAINTENANCE_COST_PER_WORK_ORDER_HOUR,
  useOperationsCampaignStore,
  type DispatchQualityBlockCode,
  type DispatchLoadSnapshot,
  type OperationalIncident,
  incidentHoldsMachineWarning,
} from '../stores/operationsCampaignStore';
import { getSiteDemandKw } from '../utils/energyCalculations';
import { sanitizeGameSpeed } from '../stores/persistenceMigrations';
import { bagsPerGameHour, plantSecondsForGameSeconds } from '../simulation/pace';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { workplaceTickCapacity } from '../simulation/bilateralWorkplace';
import { handoffHoldsClock } from '../simulation/workplaceImprovement';
import {
  advanceReplayClock,
  endReplayClock,
  isWorkplaceReplayActive,
} from '../simulation/workplaceReplayRuntime';
import { peekSCADAService } from '../scada/SCADAService';
import { layoutComparisonCondition, useLogisticsLayoutStore } from '../stores/logisticsLayoutStore';
import { logisticsLoadingRate } from '../simulation/layoutPlanning';
import { useChronicleStore } from '../stores/chronicleStore';
import { effectInput } from '../chronicle/engine';
import { chronicleTotals, relievedCropKinds } from '../chronicle/effects';
import { temperAt } from '../chronicle/temper';
import { stampPenaltyFor, type LotStampContext } from '../simulation/lotQuality';
import { formatFixed, getLocale, translate } from '../i18n';
import { celebrateCampaignResults, openOrderIds } from './campaignResults';
import { unifiedGameTickMessages as msg } from './UnifiedGameTick.messages';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { nothingDueYet } from '../simulation/shiftReview';
import { readPlantClock } from '../utils/timeFormatting';
import { incidentAlertCopy } from '../stores/incidentText';
import { dispatchHoldAlertCopy } from '../stores/dispatchBlockText';
import { registerTickHooks, stepPartnerProposals } from './partnerProposalRuntime';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import { dispatchHoldsTruck } from '../simulation/dispatchProposal';
import { isBenchmarkRuntime } from '../runtime/runtimeMode';
import { customerDisplayName } from '../stores/customerNames';
import {
  allocateStock,
  compareDispatchOrder,
  DEFAULT_SHIPMENT_POLICY,
  gradedStock,
  meetsMinimum,
  planShipment,
  shipmentOrdersFrom,
  trimLoads,
  type ShipmentOrder,
  type ShipmentPlanInput,
  type ShipmentPolicy,
} from '../simulation/shipmentPlan';

// The tick's bell notices are keyed (src/i18n/alertCopy.ts), so the bell, which
// a reload restores, reads them in the language active now.
const TICK_ALERT_CATALOG = 'unifiedGameTick';
registerAlertCatalog(TICK_ALERT_CATALOG, msg);

// Tracks the receiving dock's docked state across ticks so a false->true
// transition (a grain truck arriving) triggers exactly one silo delivery.
let _lastReceivingTransferReady = false;
let _lastShippingDepartureCount = 0;
/** The language the last shipping-hold reason was compared in (page-local). */
let _holdNoticeLocale = getLocale();
let _shippingLoad: DispatchLoadSnapshot = {
  cycleId: 'shipping-0',
  status: 'away',
  loadedKg: 0,
  capacityKg: 5000,
  materialType: 'flour',
  blockReason: null,
  blockCode: null,
  lastDispatchKg: 0,
};

// One grain truck tops up ~15 t (silo capacity is 50 t)
const GRAIN_DELIVERY_KG = 15000;
// A shipping truck can load up to 5 t of finished flour or semolina.
const FINISHED_GOODS_SHIPMENT_KG = 5000;
const SHIPPING_LOAD_RATE_KG_PER_SECOND = 400;
// A delayed_truck incident that lands while a shipping truck is already on its
// way or at the dock cannot move an arrival timer that is not running; the
// delay is held here and added to the next scheduled arrival instead.
const DELAYED_TRUCK_MINUTES = 45;
let _pendingShippingDelayMinutes = 0;
/**
 * A refused lot's seeded delay to the next grain truck (plan item 3.1), held
 * until the refused truck has left, as the shipping delay is. Page-local: a
 * reload in the minutes before that truck leaves forgets it.
 */
let _pendingReceivingDelayMinutes = 0;
const delayNextGrainTruck = (minutes: number) => {
  if (Number.isFinite(minutes) && minutes > 0) _pendingReceivingDelayMinutes += minutes;
};

/**
 * A relief lorry for a delayed truck (plan item 3.5): the delay the incident
 * added is taken back, from the held delay first, else from the next arrival.
 * Returns the minutes taken back.
 */
function cancelShippingDelay(minutes: number = DELAYED_TRUCK_MINUTES): number {
  let left = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const fromHeld = Math.min(left, _pendingShippingDelayMinutes);
  _pendingShippingDelayMinutes -= fromHeld;
  left -= fromHeld;
  if (left > 0) {
    const trucks = useTruckScheduleStore.getState();
    const shipping = trucks.truckSchedule.shipping;
    if (!shipping.truckActive && Number.isFinite(shipping.nextArrivalMinutes)) {
      const taken = Math.min(left, shipping.nextArrivalMinutes);
      trucks.updateNextArrival('shipping', shipping.nextArrivalMinutes - taken);
      left -= taken;
    }
  }
  return (Number.isFinite(minutes) ? Math.max(0, minutes) : 0) - left;
}
// The partner's answers reach the two truck delays the tick holds (plan items 3.1, 3.5).
const TICK_HOOKS = {
  shippingDelayMinutes: DELAYED_TRUCK_MINUTES,
  cancelShippingDelay,
  delayNextGrainTruck,
};
registerTickHooks(TICK_HOOKS);
let _bagProductionCarry = 0;
/**
 * This tick's packing for the shift review's OEE (plan item 7.6): kilograms
 * packed, and what the running packers' rated capacity allows at the line
 * rate over the same plant seconds. Only seconds with packer flow count, so
 * a line waiting on the dock is not a speed loss (D22: the dock binds).
 */
const _oeeTick = { unitCount: 0, packedKg: 0, ratedKg: 0 };

export const calculateBagsProducedForTick = (
  deltaSeconds: number,
  packerFlowKgPerSecond: number,
  bagWeightKg: number = BAG_WEIGHT_KG
): number => {
  if (
    !Number.isFinite(deltaSeconds) ||
    !Number.isFinite(packerFlowKgPerSecond) ||
    !Number.isFinite(bagWeightKg) ||
    bagWeightKg <= 0
  ) {
    return 0;
  }
  return (Math.max(0, deltaSeconds) * Math.max(0, packerFlowKgPerSecond)) / bagWeightKg;
};

/** Bags per game hour; see bagsPerGameHour in src/simulation/pace.ts. */
export const calculatePackerThroughputBagsPerHour = (
  packerFlowKgPerSecond: number,
  bagWeightKg: number = BAG_WEIGHT_KG
): number => bagsPerGameHour(packerFlowKgPerSecond, bagWeightKg);

function sumMaterialInventory(flow: MaterialFlowState, materialType: MaterialType): number {
  let total = 0;
  flow.machineBuffers.forEach((buffer) => {
    total += buffer.inputBuffer.reduce(
      (sum, material) => sum + (material.type === materialType ? material.amount : 0),
      0
    );
    total += buffer.outputBuffer.reduce(
      (sum, material) => sum + (material.type === materialType ? material.amount : 0),
      0
    );
  });
  total += flow.network.segments.reduce(
    (sum, segment) =>
      sum +
      segment.inTransit.reduce(
        (segmentSum, material) =>
          segmentSum + (material.type === materialType ? material.amount : 0),
        0
      ),
    0
  );
  return total;
}

/** The shipment plan's input from the campaign and the shipping-load snapshot. */
function shipmentPlanInput(
  activePlan: { orderId: string } | null,
  stock: ShipmentPlanInput['stock'],
  policy: ShipmentPolicy
): ShipmentPlanInput {
  return {
    orders: shipmentOrdersFrom(useOperationsCampaignStore.getState().orders),
    activeOrderId: activePlan?.orderId ?? null,
    truck: _shippingLoad,
    stock,
    policy,
  };
}

/**
 * The open orders in the order the line's plan walks them: the active order,
 * then the dispatch queue (operationsCampaignStore getLineProductionPlan).
 */
function lineWalkOrders(): ShipmentOrder[] {
  const campaign = useOperationsCampaignStore.getState();
  const open = shipmentOrdersFrom(campaign.orders);
  const active = open.find((order) => order.id === campaign.activeOrderId);
  return [
    ...(active ? [active] : []),
    ...open.filter((order) => order !== active).sort(compareDispatchOrder),
  ];
}

/**
 * Packed finished stock by grade (plan item 3.4): each order counts only the
 * flour that meets its own minimum, so 93 flour never reads as the 95 order
 * packed. `strandedKg` is packed stock no open order can take.
 */
function getFinishedGoodsAvailability(
  flow: MaterialFlowState,
  materialType: Extract<MaterialType, 'flour' | 'semolina'>,
  orders: readonly ShipmentOrder[] = lineWalkOrders()
): { availableKg: number; releasedKg: number; strandedKg: number } {
  return gradedStock(orders, flow.productionBatches, materialType);
}

/**
 * Packed stock of `product` as the line's plan reads it (plan item 3.4). An
 * order whose minimum the line cannot make now (`quality` under it) reads as
 * covered: more flour would be flour it cannot take, and the line moves on to
 * the commitments it can serve rather than stopping on that one. It is made
 * again once the line makes flour that meets it (after a service).
 */
function lineStock(
  walk: readonly ShipmentOrder[],
  flow: MaterialFlowState,
  product: Extract<MaterialType, 'flour' | 'semolina'>,
  quality: number
): number {
  const ofProduct = walk.filter((order) => order.product === product);
  const { coveredKg, eligibleKg } = allocateStock(
    ofProduct,
    flow.productionBatches,
    product,
    (batch) => batch.disposition !== 'recalled' && batch.disposition !== 'shipped'
  );
  if (ofProduct.length === 0) return eligibleKg;
  let pool = 0;
  for (const order of ofProduct) {
    const owed = Math.max(0, order.remainingKg);
    const covered = coveredKg.get(order.id) ?? 0;
    if (quality < order.minimumQuality - 1e-6) {
      pool += owed;
      continue;
    }
    pool += covered;
    if (covered + 1e-6 < owed) break;
  }
  return pool;
}

/**
 * Intake (plan item 3.1): what the stamp's crop term reads from the Chronicle,
 * or null without an active charter (the crop year then stamps nothing, as
 * before). Only exported readers of the Chronicle are used.
 */
function lotStampContext(): LotStampContext | null {
  const chronicle = useChronicleStore.getState().chronicle;
  if (chronicle.status !== 'active' || !chronicle.charter || !chronicle.crop) return null;
  const input = effectInput(chronicle);
  const lots = useMaterialFlowStore.getState().sourceLots;
  return {
    crop: chronicle.crop,
    relieved: relievedCropKinds(input.improvements),
    otherPenalty: chronicleTotals(input).qualityPenalty,
    cropOf: (lotId) => lots.get(lotId)?.crop,
  };
}

const isWheatPath = (type: MaterialType) => type === 'wheat_grain' || type === 'flour';

/** The wheat and wheat flour in process (every buffer but the silos, every conveyor), by lot. */
export function lineWheatContributions(
  flow: MaterialFlowState
): { lotId: string; amount: number }[] {
  const out: { lotId: string; amount: number }[] = [];
  const take = (material: {
    type: MaterialType;
    sourceContributions?: SourceContributionLike[];
  }) => {
    if (!isWheatPath(material.type)) return;
    for (const source of material.sourceContributions ?? []) out.push(source);
  };
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType === 'silo') return;
    buffer.inputBuffer.forEach(take);
    buffer.outputBuffer.forEach(take);
  });
  for (const segment of flow.network.segments) segment.inTransit.forEach(take);
  return out;
}
export type SourceContributionLike = { lotId: string; amount: number };

/** Each wheat silo's grain, by lot (silos holding none are left out). */
export function wheatSiloContributions(flow: MaterialFlowState): SourceContributionLike[][] {
  const silos: SourceContributionLike[][] = [];
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    const wheat = buffer.outputBuffer.filter(
      (material) => material.type === 'wheat_grain' && material.amount > 1e-6
    );
    if (wheat.length > 0)
      silos.push(wheat.flatMap((material) => material.sourceContributions ?? []));
  });
  return silos;
}

/**
 * The Chronicle's penalty on the flour the line makes now: the grain in
 * process, else the grain in the silos, else the year in force. Without a
 * charter context, the plant-wide figure.
 */
function lineFlourPenalty(context: LotStampContext | null): number {
  if (!context) return useChronicleStore.getState().getEffect(true).qualityPenalty;
  const flow = useMaterialFlowStore.getState();
  const line = lineWheatContributions(flow);
  return stampPenaltyFor(line.length > 0 ? line : wheatSiloContributions(flow).flat(), context);
}

/**
 * The stamp each product is packed at this tick: the product path's quality,
 * less incident penalties and the Chronicle's penalty for that product's grain
 * (flour is milled from wheat, semolina from corn: MILL_RECIPES). Under a
 * charter flour's figure is the line's now; each packed portion is stamped by
 * its own grain (tickMaterialFlow's flourPenalty).
 */
function productStamps(
  machines: readonly MachineData[],
  context: LotStampContext | null = null
): Record<'flour' | 'semolina', number> {
  const base = stampBase(machines);
  const chronicle = useChronicleStore.getState();
  return {
    flour: Math.max(0, base - lineFlourPenalty(context)),
    semolina: Math.max(0, base - chronicle.getEffect(false).qualityPenalty),
  };
}

/** The product path's quality less incident penalties: a stamp before the grain's term. */
function stampBase(machines: readonly MachineData[]): number {
  return (
    productPathQuality(machines) -
    useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty
  );
}

/** The grain the line milled on the last tick: its plan's order, else the active order's. */
function lineSourceMaterial(
  campaign: ReturnType<typeof useOperationsCampaignStore.getState>
): MaterialType | null {
  const lineOrderId = campaign.execution.lineOrderId;
  const lineOrder = lineOrderId
    ? campaign.orders.find(
        (order) =>
          order.id === lineOrderId && order.status !== 'fulfilled' && order.status !== 'cancelled'
      )
    : undefined;
  return (
    lineOrder?.recipe.sourceMaterial ?? campaign.getActiveProductionPlan()?.sourceMaterial ?? null
  );
}

/**
 * The best stamp the line can make on each grain (operationsCampaignStore
 * bestReachableQuality): every product-path unit serviced, less the Chronicle
 * penalty that grain carries. Incident penalties are left out: an incident
 * is recovered, so it never makes an order impossible.
 */
function bestReachableQuality(
  context: LotStampContext | null = null
): Record<'wheat_grain' | 'corn_grain', number> {
  const chronicle = useChronicleStore.getState();
  const serviced = productPathQuality([]);
  return {
    wheat_grain: Math.max(0, serviced - bestWheatPenalty(context)),
    corn_grain: Math.max(0, serviced - chronicle.getEffect(false).qualityPenalty),
  };
}

/**
 * Under a charter, the best stamp on wheat once a "dry first" answer already
 * given reaches the rolls, and the minute it does (review 2, finding 3): the
 * same arithmetic as bestReachableQuality, with that temper in force. Null
 * when no such answer waits in its rest, or one is already at the rolls (the
 * figure now reads it). Read only for the forfeit: the line plan and the
 * active order keep the temper at the rolls now, so the line never mills an
 * order's wheat before it is dried.
 */
export function wheatReachableOnceDried(
  context: LotStampContext | null,
  minute: number
): { figure: number; fromMinute: number } | null {
  const temper = context?.crop.temper;
  if (!context || !temper || temper.inForce === 'dry-first') return null;
  // Not yet passed: one at the rolls from this minute is stepped in force
  // later in the tick (stepTemper), after this tick's stamp context was read.
  // And at the rolls when its grain gets there, by the rolls' own rule
  // (temperAt, the latest answer covering the minute): a later "standard"
  // answer can supersede it.
  const entry = temper.schedule.find(
    (candidate) =>
      candidate.option === 'dry-first' &&
      candidate.untilMinute > minute &&
      temperAt(temper, Math.max(minute, candidate.fromMinute)) === 'dry-first'
  );
  if (!entry) return null;
  const dried: LotStampContext = {
    ...context,
    crop: { ...context.crop, temper: { inForce: 'dry-first', schedule: [] } },
  };
  return { figure: bestReachableQuality(dried).wheat_grain, fromMinute: entry.fromMinute };
}

/**
 * Under a charter (plan item 3.1), the penalty of the wheat the line will be
 * fed: the silos' grain as the valves draw it, else the grain in process,
 * else the year in force (what the next delivery brings).
 */
function bestWheatPenalty(context: LotStampContext | null): number {
  if (!context) return useChronicleStore.getState().getEffect(true).qualityPenalty;
  const flow = useMaterialFlowStore.getState();
  // What the line will be fed: every wheat silo holding grain at the same
  // valve rate, so each counts once however full. The best single silo is not
  // what the mills get, and planning on it packs flour no order can take.
  // The mean is kept on purpose, where the temper card reads silo by silo
  // (lotQuality.ts worstBinPenalty): this asks whether an order
  // can be made at all, and the worst silo would answer no for flour the line
  // still makes. With one silo wet, one sound and one empty, two of the three
  // packers pack sound flour (silosMean.test.ts), so the mean's "reachable" is
  // right; with two wet beside one sound, the mean reads wet and some batches
  // still make 95, but the temper card is then raised (any wet silo) and the
  // partner dries, so the order is reachable again once the dried wheat is at
  // the rolls.
  const silos = wheatSiloContributions(flow);
  if (silos.length > 0) return stampPenaltyFor(equalWeight(silos), context);
  const line = lineWheatContributions(flow);
  return stampPenaltyFor(line, context);
}

/** Several bins' grain, each scaled to the same total, as the valves draw it. */
export function equalWeight(bins: SourceContributionLike[][]): SourceContributionLike[] {
  return bins.flatMap((grain) => {
    const mass = grain.reduce((sum, source) => sum + Math.max(0, source.amount), 0);
    return mass > 0
      ? grain.map((source) => ({ lotId: source.lotId, amount: source.amount / mass }))
      : [];
  });
}

/**
 * One bell notice for each order the campaign tick forfeited (plan item 3.7):
 * open before the tick, closed unfulfilled by it at its lateness bound.
 */
function announceForfeits(openBefore: ReadonlySet<string>): void {
  for (const order of useOperationsCampaignStore.getState().orders) {
    if (order.status !== 'cancelled' || order.forfeitedAtMinute === undefined) continue;
    if (!openBefore.has(order.id)) continue;
    const unreachable =
      order.forfeitReason === 'unreachable' && order.forfeitBestQuality !== undefined;
    const params = {
      customer: customerDisplayName(order.customer),
      minimum: order.recipe.minimumQuality,
      best: order.forfeitBestQuality ?? 0,
    };
    const key = unreachable ? 'orderForfeitedUnreachableMessage' : 'orderForfeitedMessage';
    useUIStore.getState().addAlert({
      id: `order-forfeited-${order.id}`,
      type: 'warning',
      title: translate(msg, 'orderForfeitedTitle'),
      message: unreachable
        ? translate(msg, 'orderForfeitedUnreachableMessage', params)
        : translate(msg, 'orderForfeitedMessage', params),
      timestamp: new Date(),
      acknowledged: false,
      copy: { catalog: TICK_ALERT_CATALOG, title: 'orderForfeitedTitle', message: key, params },
    });
  }
}

function applyCampaignIncidentConsequence(incident: OperationalIncident): void {
  const production = useProductionStore.getState();
  const flow = useMaterialFlowStore.getState();

  switch (incident.kind) {
    case 'bearing_overheat': {
      const machine = production.machines.find(
        (candidate) => candidate.id === incident.affectedMachineId
      );
      // Raised by the failure itself (plan item 3.5): the unit is already down.
      const alreadyDown =
        !!machine && !!useBreakdownStore.getState().getBreakdownForMachine(machine.id);
      if (machine && !alreadyDown) {
        production.updateMachineStatus(machine.id, 'critical');
        useBreakdownStore.getState().triggerBreakdown(machine.id, machine.name, 'overheating');
      }
      break;
    }
    case 'dust_filter_pressure':
      if (incident.affectedMachineId) {
        const machine = production.machines.find(
          (candidate) => candidate.id === incident.affectedMachineId
        );
        // 'warning' is a running state: written over a stopped or locked-out
        // unit it would start it. Only a running unit takes the warning.
        // Working if a facility stop or open repair keeps the unit as it was.
        if (machine?.status === 'running') production.updateMachineStatus(machine.id, 'warning');
        if (machine && (machine.status === 'running' || machine.status === 'idle')) {
          useBreakdownStore.getState().addPredictiveAlert(machine.id, machine.name, {
            vibration: machine.metrics.vibration,
            temperature: machine.metrics.temperature,
            load: machine.metrics.load,
          });
        }
      }
      break;
    case 'delayed_truck': {
      const trucks = useTruckScheduleStore.getState();
      const shipping = trucks.truckSchedule.shipping;
      if (shipping.truckActive) {
        _pendingShippingDelayMinutes += DELAYED_TRUCK_MINUTES;
      } else {
        trucks.updateNextArrival('shipping', shipping.nextArrivalMinutes + DELAYED_TRUCK_MINUTES);
      }
      break;
    }
    case 'supplier_contamination':
      useQCLabStore.getState().triggerContaminationAlert({
        type: 'supplier_notification',
        severity: 'high',
        // The notified grain: every lot in the silos or in process now. Flour
        // milled from it forms on hold until the alert is released or recalled.
        sourceLotIds: getNotifiedLotIds(flow),
        batchIds: flow.productionBatches
          .filter((batch) => batch.availableKg > 0 && batch.disposition !== 'shipped')
          .map((batch) => batch.id),
        controlSource: 'Operations campaign controller',
        controlNote: translate(msg, 'supplierTraceabilityNote'),
        // Keyed, so Batch Genealogy reads the hold in the language active now.
        controlNoteKey: { catalog: 'qcLab', key: 'supplierTraceabilityNote' },
      });
      break;
    case 'severe_rain':
      useGameSimulationStore.getState().setWeather('storm');
      break;
    case 'power_sag':
    case 'packaging_shortage':
    case 'control_network_degraded':
      // Their continuing effects are represented by the campaign multiplier.
      break;
  }

  useUIStore.getState().addAlert({
    id: `campaign-${incident.id}`,
    type: incident.severity === 'critical' ? 'critical' : 'warning',
    title: incident.title,
    message: translate(msg, 'incidentAlert', { description: incident.description }),
    machineId: incident.affectedMachineId ?? undefined,
    timestamp: new Date(),
    acknowledged: false,
    // Read from the bell, so a muted PA does not hide it from a screen reader.
    announce: incident.severity === 'critical' ? 'assertive' : 'polite',
    copy: incidentAlertCopy(incident),
  });
  useOperationsCampaignStore.getState().markIncidentEffectApplied(incident.id);
}

/**
 * A shift report written by this tick is announced once, in the notification
 * list, naming where the review is. Only a report this tick appended counts:
 * comparing the last id, not the length, keeps a restored save and the
 * bounded report list from announcing anything.
 * Working if the 14:00 boundary on the ordinary path raises one notice and a
 * reload raises none.
 */
function announceClosedShift(lastReportBefore: string | undefined): void {
  const report = useOperationsCampaignStore.getState().reports.at(-1);
  if (!report || report.id === lastReportBefore) return;
  const shift = /(morning|afternoon|night)$/.exec(report.shiftKey)?.[1] ?? report.shiftLabel;
  // An ungraded shift is not a clean one while a serious incident is open,
  // and one whose commitment had not yet fallen due is not commitment-free.
  // Nothing due is checked first: a window whose commitment had not fallen due
  // had commitments, whether or not an incident is open.
  const nothingDue = !!report.gradeBasis && nothingDueYet(report.gradeBasis);
  const incidentOpen = !!report.gradeBasis?.unsafeTitles.length;
  const titleKey =
    report.grade !== null
      ? 'shiftClosedTitle'
      : nothingDue
        ? incidentOpen
          ? 'shiftClosedNothingDueIncidentTitle'
          : 'shiftClosedNothingDueTitle'
        : incidentOpen
          ? 'shiftClosedUngradedIncidentTitle'
          : 'shiftClosedUngradedTitle';
  const variant = (
    {
      shiftClosedTitle: 'graded',
      shiftClosedNothingDueIncidentTitle: 'nothingDueIncident',
      shiftClosedNothingDueTitle: 'nothingDue',
      shiftClosedUngradedIncidentTitle: 'incident',
      shiftClosedUngradedTitle: 'ungraded',
    } as const
  )[titleKey];
  const title =
    report.grade === null
      ? translate(msg, titleKey, { shift })
      : translate(msg, 'shiftClosedTitle', { shift, grade: report.grade });
  const message = translate(msg, 'shiftClosedMessage');
  useUIStore.getState().addAlert({
    id: `shift-review-${report.id}`,
    type: 'info',
    title,
    message,
    timestamp: new Date(),
    acknowledged: false,
    announce: 'polite',
    copy: {
      catalog: TICK_ALERT_CATALOG,
      title: titleKey,
      message: 'shiftClosedMessage',
      params: report.grade === null ? { shift } : { shift, grade: report.grade },
    },
  });
  // The bell files it and reads it once to screen readers, whatever the PA
  // mode or mute; the PA caption is what a sighted player sees at the moment
  // the shift ends, so it is caption-only rather than read a second time.
  useAnnouncementsStore.getState().addAnnouncement({
    type: report.grade === 'A' || report.grade === 'B' ? 'success' : 'info',
    message: translate(msg, 'shiftClosedCaption', {
      variant,
      shift,
      grade: report.grade ?? undefined,
    }),
    priority: 3,
    source: 'Shift review',
    channel: 'operational',
    captionOnly: true,
    copy: {
      catalog: TICK_ALERT_CATALOG,
      key: 'shiftClosedCaption',
      params: report.grade === null ? { variant, shift } : { variant, shift, grade: report.grade },
    },
  });
}

function getStorageUtilization(): number {
  let occupiedKg = 0;
  let capacityKg = 0;
  useMaterialFlowStore.getState().machineBuffers.forEach((buffer) => {
    occupiedKg += buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0);
    occupiedKg += buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
    capacityKg += buffer.inputCapacity + buffer.outputCapacity;
  });
  return capacityKg > 0 ? occupiedKg / capacityKg : 0;
}

// Machine status type (matches MachineData.status)
type MachineStatus = 'running' | 'idle' | 'warning' | 'critical';

/**
 * Product quality from the product path: every mill, sifter and packer. Silos
 * store grain and cannot lower it. Each point of average efficiency lost costs
 * 0.2 quality points, so a line whose units sit just short of their warnings
 * (~80% efficiency) still makes Strong White (95) and only a line run well
 * past its warnings drops below it.
 * A unit that is down (broken, stopped or offline for service) stays in the
 * mean at the efficiency it left with: a broken unit's last running figure
 * (its wear's efficiency just short of its breakdown threshold, or its wear's
 * own for a fault raised below it), any other its recorded efficiency. When a
 * stopped unit dropped out, a breakdown lifted the stamp on everything still
 * packed, so breaking a worn mill beat servicing it (plan item 3.3).
 * Working if a breakdown leaves the stamp where it was, never higher, and a
 * fully worn line still fails.
 */
const PRODUCT_PATH_TYPES: ReadonlySet<string> = new Set(['ROLLER_MILL', 'PLANSIFTER', 'PACKER']);
const QUALITY_PER_EFFICIENCY_POINT = 0.2;
const PRISTINE_QUALITY = 99.5;
/** A broken unit's efficiency as it last ran: its wear's, capped just short of the breakdown. */
function lastRunningEfficiency(machine: MachineData): number {
  const wear = Number.isFinite(machine.metrics.wear) ? machine.metrics.wear : 0;
  return calculateEfficiency(
    Math.min(wear, getWearConfig(machine.type).breakdownThreshold - 0.01),
    machine.type
  );
}
export function productPathQuality(machines: readonly MachineData[]): number {
  let sum = 0;
  let count = 0;
  for (const machine of machines) {
    if (!PRODUCT_PATH_TYPES.has(machine.type)) continue;
    const efficiency =
      machine.status === 'critical'
        ? lastRunningEfficiency(machine)
        : Number.isFinite(machine.metrics.efficiency)
          ? machine.metrics.efficiency
          : 100;
    sum += Math.max(0, Math.min(100, efficiency));
    count += 1;
  }
  if (count === 0) return PRISTINE_QUALITY;
  const quality = PRISTINE_QUALITY - (100 - sum / count) * QUALITY_PER_EFFICIENCY_POINT;
  return Math.round(Math.max(0, Math.min(PRISTINE_QUALITY, quality)) * 10) / 10;
}

// The retired daily-target milestones' mask (D11). Nothing reads it now; it is
// kept, carried as saved, because the physical save pins the tick state's fields
// (captureUnifiedTickState) and rejects a save that lacks or adds one.
let _milestonesReachedMask = 0;

// ============================================================
// REUSABLE MODULE-LEVEL OBJECTS (never recreated)
// ============================================================

// Reusable breakdowns array - cleared with .length = 0, never reallocated
const _breakdowns: Array<{
  id: string;
  name: string;
  machineType: string;
  breakdownType: BreakdownType;
}> = [];

// Reusable metrics object - mutated in place
const _metricsUpdate = {
  efficiency: 0,
  uptime: 100,
  quality: 99.5,
  throughput: 0,
};

// Reusable metric tracking object
const _metricTrackingUpdate = {
  totalRunningSeconds: 0,
  totalElapsedSeconds: 0,
  lastRecalcTime: 0,
};

// Reusable arrays for machine change tracking (cleared each tick, never reallocated)
const _changedIndices: number[] = [];
const _changedData: Array<{
  newStatus: MachineStatus;
  newWear: number;
  newEfficiency: number;
  crossedWarning: boolean;
}> = [];

// Sub-resolution wear carried between ticks, per machine. Stored wear keeps
// two decimals, and at low game speeds a single tick's increment is far below
// that, so without the carry the rounding erased every tick's wear.
const _wearCarry = new Map<string, number>();

// Every unit on a line used to start unworn at one rate, so all four mills (or
// all three packers) warned in the same minute. Later units run a gentler duty:
// the first unit of each line keeps the documented one-warning-per-game-day
// pace and nothing wears faster than before. Working if a line's warnings
// arrive one machine at a time and no breakdown comes earlier than it did.
const WEAR_PACE: Readonly<Record<string, number>> = {
  'rm-102': 0.88,
  'rm-103': 0.78,
  'rm-104': 0.7,
  'sifter-b': 0.88,
  'sifter-c': 0.78,
  'packer-1': 0.88,
  'packer-2': 0.78,
};
export const machineWearPace = (machineId: string): number => WEAR_PACE[machineId] ?? 1;

/** Lowest load of a unit that is working (machineLoad.ts targets 50 + line rate * 30). */
const WORKING_LOAD = 50;
/**
 * A working unit's wear multiplier at this line rate (machineLoad.ts
 * lineOverdrive); a unit easing to idle with nothing to work is not overdriven.
 */
export const unitOverdrive = (load: number, lineRate: number): number =>
  Number.isFinite(load) && load >= WORKING_LOAD ? lineOverdrive(lineRate, OVERDRIVE_WEAR_SLOPE) : 1;

/**
 * Game minutes until wear reaches the breakdown threshold at the current load.
 * `wearMultiplier` is the Chronicle's, so the forecast matches the wear the
 * tick actually applies.
 */
function gameMinutesToWearBreakdown(
  machineId: string,
  machineType: string,
  wear: number,
  load: number,
  wearMultiplier = 1,
  lineRate = 1
): number {
  const wearConfig = getWearConfig(machineType);
  const ratePerGameSecond =
    wearConfig.wearRatePerSecond *
    machineWearPace(machineId) *
    (0.5 + (Number.isFinite(load) ? load : 0) / 100) *
    unitOverdrive(load, lineRate) *
    (wearMultiplier > 0 ? wearMultiplier : 1);
  if (!(ratePerGameSecond > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(0, wearConfig.breakdownThreshold - wear) / ratePerGameSecond / 60;
}

/** Open work orders for the campaign context, naming the oldest one. */
function openWorkOrderSummary() {
  const open = useBreakdownStore
    .getState()
    .workOrders.filter((workOrder) => workOrder.phase !== 'returned_to_service');
  const oldest = open[0];
  return {
    openWorkOrders: open.length,
    openWorkOrder: oldest
      ? { id: oldest.id, machineId: oldest.machineId, machineName: oldest.machineName }
      : null,
  };
}

function inferBreakdownType(machine: MachineData): BreakdownType {
  if (machine.metrics.temperature >= 80) return 'overheating';
  if (machine.type === 'PLANSIFTER') return 'vibration_failure';
  if (machine.type === 'SILO') return 'electrical';
  return 'mechanical';
}

// ============================================================
// MACHINE UPDATE - TRUTH ONLY (no cosmetic variance)
// ============================================================

/**
 * Check if a machine's TRUTH has changed (not cosmetic values)
 * Truth = status, wear, efficiency
 * Cosmetics = RPM variance, load variance, temp fluctuation
 *
 * Temperature is deliberately not written here: MachineSimulationController
 * owns it offline (per-type targets) and SCADA owns it once live. A third
 * writer only made the value oscillate between models.
 *
 * `gameSeconds` is SIMULATED time (real delta x game speed). Wear is a
 * mechanical-ageing process, so it accrues per game second, at every pace
 * alike (standard pace is 30 game seconds per real second, `simulation/pace.ts`).
 * When it was driven by real seconds a first warning took ~25 real hours, so
 * no session saw one.
 */
function updateMachineTruth(
  machine: MachineData,
  gameSeconds: number,
  lineRate = 1
): {
  changed: boolean;
  newStatus: MachineStatus;
  newWear: number;
  newEfficiency: number;
  breakdown: boolean;
  crossedWarning: boolean;
} {
  const isRunning = machine.status === 'running' || machine.status === 'warning';
  const isBrokenDown = machine.status === 'critical';

  // Broken machines don't change
  if (isBrokenDown) {
    return {
      changed: false,
      newStatus: machine.status,
      newWear: machine.metrics.wear ?? 0,
      newEfficiency: machine.metrics.efficiency ?? 100,
      breakdown: false,
      crossedWarning: false,
    };
  }

  const baseWear = machine.metrics.wear ?? 0;
  const baseLoad = machine.metrics.load;
  const wearConfig = getWearConfig(machine.type);

  // Wear accumulation (this IS truth). Stored at 0.01 resolution; the
  // remainder below that carries to the next tick instead of being rounded off.
  let newWear = baseWear;
  if (isRunning) {
    const loadFactor = 0.5 + baseLoad / 100;
    const wearIncrement =
      wearConfig.wearRatePerSecond *
      machineWearPace(machine.id) *
      gameSeconds *
      loadFactor *
      unitOverdrive(baseLoad, lineRate);
    const preciseWear = baseWear + (_wearCarry.get(machine.id) ?? 0) + wearIncrement;
    // The epsilon keeps a stored value like 0.29 (28.999... x 100) from
    // flooring below itself; the max keeps wear monotonic while running.
    newWear = Math.min(100, Math.max(baseWear, Math.floor(preciseWear * 100 + 1e-9) / 100));
    _wearCarry.set(machine.id, newWear >= 100 ? 0 : preciseWear - newWear);
  }

  // Efficiency based on wear (derived truth)
  const newEfficiency = calculateEfficiency(newWear, machine.type);

  // Status based on wear (truth)
  let newStatus = machine.status;
  let breakdown = false;
  if (newWear >= wearConfig.breakdownThreshold) {
    newStatus = 'critical';
    breakdown = true;
  } else if (newWear >= wearConfig.warningThreshold && machine.status === 'running') {
    newStatus = 'warning';
  }

  // Check if truth actually changed (not cosmetics)
  const wearChanged = newWear !== baseWear;
  const efficiencyChanged = newEfficiency !== (machine.metrics.efficiency ?? 100);
  const statusChanged = newStatus !== machine.status;

  return {
    changed: wearChanged || efficiencyChanged || statusChanged,
    newStatus,
    newWear,
    newEfficiency,
    breakdown,
    // The wear prediction and its notice fire on this crossing, whatever the
    // status: a unit already held in warning (hot, shaking, or by a dust-filter
    // incident) would otherwise never get them, and a restart of a unit past
    // the threshold would repeat them. Working if each crossing warns once.
    crossedWarning:
      !breakdown &&
      baseWear < wearConfig.warningThreshold &&
      newWear >= wearConfig.warningThreshold,
  };
}

// ============================================================
// UNIFIED TICK - ZERO ALLOCATION PATH
// ============================================================

/**
 * The 'scada' clock hold is set below when live or hybrid control takes the
 * plant during a workplace replay or trial (the run stops; the plant may not
 * advance under a control mode the replay cannot own). Its cause is the mode,
 * so it ends when the mode is the simulation again (or no service is running),
 * at the pace it held; "Resume the clock" remains for a player who wants it
 * sooner. Allocation-free: it runs every tick, paused or not.
 */
function releaseScadaHoldWhenLocal(): void {
  const game = useGameSimulationStore.getState();
  let held = false;
  for (let i = 0; i < game.clockHolds.length; i++)
    if (game.clockHolds[i].holder === 'scada') {
      held = true;
      break;
    }
  if (!held) return;
  const mode = peekSCADAService()?.getState().mode;
  if (mode !== undefined && mode !== 'simulation') return;
  game.releaseNoticeHold('scada');
}

/**
 * `shipmentPolicy` is for measurement only: the central tick passes `ctx`
 * alone, so the game runs DEFAULT_SHIPMENT_POLICY ('fill'), and a benchmark
 * the old rule ('default'). It is an argument, not state,
 * so no save carries it.
 */
function unifiedGameTick(
  ctx: TickContext,
  // Benchmarks keep the truck rule they were measured with (inert, plan 3.4).
  shipmentPolicy: ShipmentPolicy = isBenchmarkRuntime() ? 'default' : DEFAULT_SHIPMENT_POLICY,
  /** Measurement only, as shipmentPolicy: labBench false runs without the bench. */
  measure: {
    labBench?: boolean;
    /** False keeps the plant-wide crop penalty and raises no intake proposal (plan item 3.1). */
    intake?: boolean;
    /** False raises no plant incident from an ignored wear warning (plan item 3.5). */
    plantIncidents?: boolean;
  } = {}
): void {
  const { deltaSeconds: rawDeltaSeconds, gameSpeed } = ctx;

  // Cap delta to prevent large time jumps (e.g., from tab being hidden)
  // Must be >= tickInterval (0.5s) to avoid slowing down game time
  // Cap at 1.0s to handle minor frame drops while preventing runaway accumulation
  let deltaSeconds = Number.isFinite(rawDeltaSeconds)
    ? Math.max(0, Math.min(rawDeltaSeconds, 1.0))
    : 0;

  // Before the paused return: the hold below has stopped the clock.
  releaseScadaHoldWhenLocal();
  const safeGameSpeed = sanitizeGameSpeed(gameSpeed);
  if (deltaSeconds === 0 || safeGameSpeed === 0) return;
  // A material session the campaign has not seen: its opening stock at cost,
  // read before this tick moves any of it (booked by tickCampaign).
  const openingFlow = useMaterialFlowStore.getState();
  const openingStockValue =
    useOperationsCampaignStore.getState().lastMaterialSessionId !== openingFlow.sessionId
      ? grainValueOnSite(openingFlow)
      : undefined;
  const replayActive = isWorkplaceReplayActive();
  const workplaceBefore = useWorkplaceStore.getState().workplace;
  const workplacePhaseBefore = workplaceBefore.phase;
  // A finalised member review (verdict set, which requires no owed recovery)
  // releases the plant. Working if the trial and its deliberation stay held
  // while the reviewed receipts stay fixed and play resumes ordinary pacing.
  const improvementActive =
    workplaceBefore.mode === 'game' &&
    !!workplaceBefore.improvement &&
    !(workplaceBefore.phase === 'review' && workplaceBefore.improvement.verdict);
  const controlMode =
    replayActive || improvementActive ? peekSCADAService()?.getState().mode : undefined;
  if (controlMode !== undefined && controlMode !== 'simulation') {
    useWorkplaceStore.getState().stop();
    useGameSimulationStore.getState().holdClock('scada');
    endReplayClock();
    // The stop's write was skipped while the replay ran; write what it left.
    useWorkplaceStore.setState({});
    return;
  }
  if (replayActive || improvementActive) {
    const game = useGameSimulationStore.getState();
    const agreement = useWorkplaceStore.getState().workplace;
    // Replay preparation and review navigation grant no plant time. Recovery
    // after an early stop needs an explicit resume and remains real elapsed
    // time, bounded by concurrent member debts rather than their sum.
    const remainingMinutes =
      agreement.phase === 'active'
        ? Math.max(0, agreement.durationMinutes - agreement.minute)
        : agreement.phase === 'review' && !game.emergencyActive
          ? Math.max(0, ...agreement.members.map((member) => member.recoveryOwedMinutes))
          : 0;
    if (game.gameSpeed === 0 || remainingMinutes === 0) {
      // A handoff decision holds through its derived hold (workplaceStore), which
      // keeps a pace chosen meanwhile as its resume pace; this is the backstop.
      // A safety stop is the exception: the plant still gains no time here, but
      // a running clock lets the egress drill verify its zones and end itself.
      // Working if a drill over an open review completes once play is resumed.
      if (game.gameSpeed !== 0 && !(game.emergencyActive && !replayActive))
        game.holdClock(!replayActive && handoffHoldsClock(agreement) ? 'handoff' : 'workplace');
      return;
    }
    // This one admitted delta drives all plant clocks, material, costs, wear
    // and logical replay time. Clamping the workplace ledger alone is too late.
    deltaSeconds = Math.min(deltaSeconds, (remainingMinutes * 60) / safeGameSpeed);
  }
  advanceReplayClock(deltaSeconds * safeGameSpeed * 1000);
  // One time model (src/simulation/pace.ts): the clock and campaign advance by
  // game seconds, everything physical by plant seconds, a fixed fraction of
  // them. Working if a pace change scales material, loading, bags, downtime and
  // the yard together with the deadlines it is measured against.
  const gameSeconds = deltaSeconds * safeGameSpeed;
  const plantSeconds = plantSecondsForGameSeconds(gameSeconds);
  const workplaceShippedBefore = useMaterialFlowStore.getState().shippedKg;
  const materialTimeBefore = useMaterialFlowStore.getState().simulationTime;

  // Clear reusable arrays (no allocation)
  _breakdowns.length = 0;

  // 1. Calculate new game time (pure math, no allocation)
  const gameStore = useGameSimulationStore.getState();
  // Capture mode holds the time of day; production and motion keep the pace.
  const hoursElapsed = gameStore.timeOfDayHeld ? 0 : (deltaSeconds * safeGameSpeed) / 3600;
  const newGameTime = (((gameStore.gameTime + hoursElapsed) % 24) + 24) % 24;

  // Handle day rollover
  let newGameDay = gameStore.gameDay;
  if (newGameTime < gameStore.gameTime && hoursElapsed > 0) {
    newGameDay = Math.min(Number.MAX_SAFE_INTEGER, newGameDay + 1);

    // Close out the production day: reset the daily counter and milestone
    // tracking so the target loop restarts fresh. The end of a shift is
    // announced by its review (announceClosedShift); the 'shift_complete'
    // celebration once queued here had no renderer.
    const dayEndStore = useProductionStore.getState();
    dayEndStore.resetDailyBagsProduced();
    _milestonesReachedMask = 0;
    // 'Days safe' rides the same rollover; a safety stop resets it to 0.
    useSafetyStore.getState().incrementDaysSafe();
  }

  // 2. Update machine TRUTH (not cosmetics)
  let prodStore = useProductionStore.getState();
  const campaign = useOperationsCampaignStore.getState();
  campaign.initializeCampaign();
  useOperationsCampaignStore
    .getState()
    .incidents.filter((incident) => incident.phase !== 'resolved' && !incident.effectApplied)
    .forEach(applyCampaignIncidentConsequence);
  // A plant incident ends at its stated minute; a Chronicle incident met on
  // its own route runs the answer it took (plan item 3.5).
  useOperationsCampaignStore.getState().endPlantIncidents();
  if (!isBenchmarkRuntime()) actOnMetIncidents(TICK_HOOKS);
  // An incident's warning lasts until it is mitigated, in either SCADA mode;
  // with SCADA on nothing else would lift it short of maintenance. A unit
  // still hot, shaking or worn keeps its warning for those reasons. A live
  // SCADA link may escalate status from its own alarms; those are not ours.
  const scadaMode = peekSCADAService()?.getState().mode;
  const plantOwnsStatus = scadaMode === undefined || scadaMode === 'simulation';
  for (const machine of useProductionStore.getState().machines) {
    if (
      plantOwnsStatus &&
      machine.status === 'warning' &&
      machine.metrics.temperature < 55 &&
      machine.metrics.vibration < 3.5 &&
      !wearHoldsWarning(machine) &&
      !incidentHoldsMachineWarning(machine.id)
    )
      useProductionStore.getState().updateMachineStatus(machine.id, 'running');
  }
  prodStore = useProductionStore.getState();
  const maintenanceStore = useBreakdownStore.getState();
  // Downtime is read against the shift clock, so it is counted in game seconds.
  maintenanceStore.tickDowntime(gameSeconds);

  // A restart request is the final far-side contract in the maintenance loop.
  // The production store resets machine wear/status first; only then does the
  // work order close and release the lockout.
  const repairedUnits: string[] = [];
  for (const workOrder of maintenanceStore.workOrders) {
    // A facility stop, drill or interlocked crisis holds a queued restart; it
    // applies on the first tick after the stop clears, which restores only
    // what the stop idled. A cleared stop still holds it until RESTART LINE
    // (D13). Working if no repaired unit runs during a stop or before the restart.
    if (
      workOrder.phase === 'restart_requested' &&
      !gameStore.emergencyActive &&
      !selectRestartPending(gameStore)
    ) {
      const result = useProductionStore
        .getState()
        .performMaintenance(workOrder.machineId, workOrder.id);
      if (result.success) {
        useBreakdownStore.getState().confirmMachineRestart(workOrder.breakdownId);
        repairedUnits.push(workOrder.machineId);
      }
    }
  }
  // Services and Restarts run on these game seconds (systems/unitService.ts):
  // a serviced unit comes back, a booking for the quiet spell starts, and a
  // unit offline for service stays offline whatever else started it.
  stepUnitWork(gameSeconds);
  prodStore = useProductionStore.getState();
  const machines = prodStore.machines;
  // The Mill Chronicle's bounded answer to recorded history: neutral (all 1s
  // and no penalty) until a charter is signed. The crop-year quality penalty
  // applies only while the line mills wheat: the grain of the order the line
  // made for on the last tick (it may pre-stage another order than the one
  // shipping), else the active order's. Read from the active order alone, a
  // corn dispatch stamped pre-staged wheat flour as if the crop were sound.
  const chronicleEffect = useChronicleStore
    .getState()
    .getEffect(lineSourceMaterial(campaign) === 'wheat_grain');
  // Intake (plan item 3.1): under a charter the crop term is read from the
  // grain itself, so the line's figure is the grain in process.
  const stampContext = measure.intake === false ? null : lotStampContext();
  const lineChroniclePenalty =
    stampContext && lineSourceMaterial(campaign) === 'wheat_grain'
      ? lineFlourPenalty(stampContext)
      : chronicleEffect.qualityPenalty;
  // A repaired unit comes back still worn (repairedWear), past its warning, so
  // it never crosses the warning on its way up and would get no prediction:
  // raise its wear prediction here, so its service is proposed and the unit
  // does not run on to fail again unasked.
  // Working if every repaired unit past its warning carries a wear prediction.
  for (const machineId of repairedUnits) {
    const unit = prodStore.machines.find((m) => m.id === machineId);
    if (!unit || (unit.metrics.wear ?? 0) < getWearConfig(unit.type).warningThreshold) continue;
    useBreakdownStore.getState().addPredictiveAlert(
      unit.id,
      unit.name,
      {
        vibration: unit.metrics.vibration,
        temperature: unit.metrics.temperature,
        load: unit.metrics.load,
      },
      gameMinutesToWearBreakdown(
        unit.id,
        unit.type,
        unit.metrics.wear ?? 0,
        unit.metrics.load,
        chronicleEffect.wearMultiplier,
        prodStore.productionSpeed
      ),
      inferBreakdownType(unit)
    );
  }

  let anyMachineChanged = false;
  let runningCount = 0;
  let totalRunningDelta = 0;

  // Check each machine for truth changes
  // Use module-level reusable arrays (cleared here, never reallocated)
  _changedIndices.length = 0;
  _changedData.length = 0;

  for (let i = 0; i < machines.length; i++) {
    const machine = machines[i];
    const isRunning = machine.status === 'running' || machine.status === 'warning';

    if (isRunning) {
      runningCount++;
      totalRunningDelta += plantSeconds;
    }

    const result = updateMachineTruth(
      machine,
      deltaSeconds * safeGameSpeed * chronicleEffect.wearMultiplier,
      prodStore.productionSpeed
    );

    if (result.breakdown) {
      _breakdowns.push({
        id: machine.id,
        name: machine.name,
        machineType: machine.type,
        breakdownType: inferBreakdownType(machine),
      });
    }

    if (result.changed) {
      anyMachineChanged = true;
      _changedIndices.push(i);
      _changedData.push({
        newStatus: result.newStatus,
        newWear: result.newWear,
        newEfficiency: result.newEfficiency,
        crossedWarning: result.crossedWarning,
      });
    }
  }

  // 3. Count running packers for throughput calculation
  let runningPackerCount = 0;
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    if (m.type === 'PACKER' && (m.status === 'running' || m.status === 'warning')) {
      runningPackerCount++;
    }
  }

  // 4. Calculate metrics (always, not just when machines change)
  const totalMachines = machines.length || 1;
  const { productionSpeed } = prodStore;
  const campaignStore = useOperationsCampaignStore.getState();
  const campaignMultiplier = campaignStore.getProductionMultiplier();
  const activeProductionPlan = campaignStore.getActiveProductionPlan();
  // Negotiated line pacing: the autonomous season applies it by default and
  // StatusHUD names it beside the plant rate. It never creates product, releases quality
  // holds, changes machine safety status, or alters decorative pedestrian routes.
  // One rate (plan item 3.6): the player's production speed. Benchmarks keep
  // the derived line setpoint they were captured with.
  const benchmarkSetpoint = isBenchmarkRuntime()
    ? Math.min(1.08, Math.max(0, campaignStore.execution.lineSetpointPercent / 100))
    : 1;
  const effectiveProductionSpeed =
    productionSpeed *
    campaignMultiplier *
    benchmarkSetpoint *
    chronicleEffect.productionMultiplier *
    workplaceTickCapacity(
      useWorkplaceStore.getState().workplace,
      (deltaSeconds * safeGameSpeed) / 60
    );

  // Efficiency: percentage of machines running
  _metricsUpdate.efficiency = Math.round((runningCount / totalMachines) * 100 * 10) / 10;

  // Quality of the product being made now, from the running product path (see
  // productPathQuality). It is stamped on every batch packed this tick, and a
  // shipment is judged by its batches' stamps. A lab test records a batch's
  // grade; it no longer overrides the plant reading for the rest of the session.
  _metricsUpdate.quality = Math.max(
    0,
    productPathQuality(machines) -
      useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty -
      lineChroniclePenalty
  );

  // Update tracking
  _metricTrackingUpdate.totalRunningSeconds =
    prodStore._metricTracking.totalRunningSeconds + totalRunningDelta;
  _metricTrackingUpdate.totalElapsedSeconds =
    prodStore._metricTracking.totalElapsedSeconds + plantSeconds;

  // Uptime: percentage of time machines have been running
  _metricsUpdate.uptime =
    _metricTrackingUpdate.totalElapsedSeconds > 0
      ? Math.round(
          (_metricTrackingUpdate.totalRunningSeconds /
            (_metricTrackingUpdate.totalElapsedSeconds * totalMachines)) *
            100 *
            10
        ) / 10
      : 100;

  // The operator KPI follows the same final-stage mass flow used by SCADA.
  // This value is from the preceding material tick, so it is one 500 ms sample
  // behind the scene while remaining stable and free of an extra store write.
  _metricsUpdate.throughput = calculatePackerThroughputBagsPerHour(
    useMaterialFlowStore.getState().currentPackerFlowRate
  );

  // 5. Update store - machines only if changed, metrics always
  if (anyMachineChanged) {
    // Create new machines array only when needed
    const newMachines = [...machines];
    for (let j = 0; j < _changedIndices.length; j++) {
      const idx = _changedIndices[j];
      const data = _changedData[j];
      const oldMachine = machines[idx];

      newMachines[idx] = {
        ...oldMachine,
        status: data.newStatus,
        metrics: {
          ...oldMachine.metrics,
          wear: data.newWear,
          efficiency: data.newEfficiency,
        },
      };
      if (data.crossedWarning) {
        useBreakdownStore.getState().addPredictiveAlert(
          oldMachine.id,
          oldMachine.name,
          {
            vibration: oldMachine.metrics.vibration,
            temperature: oldMachine.metrics.temperature,
            load: oldMachine.metrics.load,
          },
          gameMinutesToWearBreakdown(
            oldMachine.id,
            oldMachine.type,
            data.newWear,
            oldMachine.metrics.load,
            chronicleEffect.wearMultiplier,
            prodStore.productionSpeed
          ),
          // The failure this unit's wear breakdown will take, so the
          // prediction and the booked service name it.
          inferBreakdownType(oldMachine)
        );
        // The PA line is spoken once; the bell keeps it, tied to the machine,
        // so its Open repair action can take the player to the maintenance.
        // Working if a wear warning is listed in the bell with Open repair.
        useUIStore.getState().addAlert({
          id: `wear-warning-${oldMachine.id}-${Date.now()}`,
          type: 'warning',
          title: translate(msg, 'wearWarningTitle'),
          message: translate(msg, 'wearWarningMessage', { name: oldMachine.name }),
          machineId: oldMachine.id,
          timestamp: new Date(),
          acknowledged: false,
          // The bell reads it to screen readers; the PA line is caption-only.
          announce: 'polite',
          copy: {
            catalog: TICK_ALERT_CATALOG,
            title: 'wearWarningTitle',
            message: 'wearWarningMessage',
            params: { name: oldMachine.name },
          },
        });
      }
    }

    useProductionStore.setState({
      machines: newMachines,
      _metricTracking: { ..._metricTrackingUpdate },
      metrics: { ..._metricsUpdate },
    });
  } else {
    // Still update metrics and tracking even if machines didn't change
    useProductionStore.setState({
      _metricTracking: { ..._metricTrackingUpdate },
      metrics: { ..._metricsUpdate },
    });
  }

  // 3b. The daily bag target's 25/50/75/100% milestones are gone (D11): the
  // goal on the HUD is the programme the customers committed to, and its
  // results (each order delivered, each graded shift) are queued where the
  // campaign ticks, below (celebrateCampaignResults).

  // 4. Update game time only if changed
  const timeChanged =
    Math.abs(newGameTime - gameStore.gameTime) > 0.0001 || newGameDay !== gameStore.gameDay;
  if (timeChanged) {
    useGameSimulationStore.setState({
      gameTime: newGameTime,
      gameDay: newGameDay,
    });

    // Keep the shift in lock-step with the clock. This unified tick replaced the
    // store's tickGameTime (which reconciled the shift inline); without this the
    // clock advanced but currentShift stayed frozen at its load-time value, so
    // the HUD showed e.g. "Afternoon" at 23:59. getShiftForHour derives from the
    // final time, so a single high-speed tick spanning multiple boundaries still
    // lands on the correct shift. setShift silently updates shiftData too.
    const expectedShift = getShiftForHour(newGameTime);
    if (expectedShift !== gameStore.currentShift) {
      gameStore.setShift(expectedShift);
    }
  }

  // 4a. Truck arrivals run on the simulation clock (game minutes), matching
  // lastDepartureSimulationMinutes and the dock ETA readout. Advancing them
  // before the dock logic below lets an arrival released this tick be seen by
  // it. A delay held for a truck that was already en route applies to the
  // first arrival scheduled after it departs, before that timer advances.
  const truckSchedule = useTruckScheduleStore.getState();
  if (_pendingShippingDelayMinutes > 0) {
    const shipping = truckSchedule.truckSchedule.shipping;
    if (!shipping.truckActive) {
      truckSchedule.updateNextArrival(
        'shipping',
        shipping.nextArrivalMinutes + _pendingShippingDelayMinutes
      );
      _pendingShippingDelayMinutes = 0;
    }
  }
  if (_pendingReceivingDelayMinutes > 0) {
    const receiving = useTruckScheduleStore.getState().truckSchedule.receiving;
    if (!receiving.truckActive) {
      truckSchedule.updateNextArrival(
        'receiving',
        receiving.nextArrivalMinutes + _pendingReceivingDelayMinutes
      );
      _pendingReceivingDelayMinutes = 0;
    }
  }
  truckSchedule.tickArrivals((deltaSeconds * safeGameSpeed) / 60);

  // 4b. Advance the material-flow simulation (grain -> mills -> sifters -> packers).
  // This tick was orphaned when ConveyorSystem was modularized (a5d0c21) — the
  // whole flow network silently froze. It belongs here, on the simulation tick,
  // not in a render-loop useFrame.
  const flowStore = useMaterialFlowStore.getState();
  // Couple machine status to flow FIRST so a stopped/broken machine stops
  // processing material this same tick (action -> consequence).
  flowStore.syncMachineProcessing(
    anyMachineChanged ? useProductionStore.getState().machines : machines
  );
  flowStore.syncTransportGeometry(
    anyMachineChanged ? useProductionStore.getState().machines : machines
  );
  // The line works to its own plan: the dispatch order, or once that order's
  // remainder is packed and waiting for a truck, the next commitment. Shipping
  // below still loads the dispatch order's material.
  // An order the line cannot make on its grain (plan item 3.7) is not walked:
  // flour made for it would be packed under its minimum and strand the packers.
  const best = bestReachableQuality(stampContext);
  const walk = lineWalkOrders().filter((order) =>
    meetsMinimum(
      best[order.product === 'flour' ? 'wheat_grain' : 'corn_grain'],
      order.minimumQuality
    )
  );
  const stockByProduct = {
    flour: getFinishedGoodsAvailability(flowStore, 'flour', walk),
    semolina: getFinishedGoodsAvailability(flowStore, 'semolina', walk),
  };
  // Each product's stamp: a Chronicle crop year marks down flour (wheat) and
  // never semolina (corn), whatever grain the mills are on now, since the
  // packers pack what the buffers already hold.
  const productQuality = productStamps(machines, stampContext);
  const linePlan = campaignStore.getLineProductionPlan(
    {
      flour: lineStock(walk, flowStore, 'flour', productQuality.flour),
      semolina: lineStock(walk, flowStore, 'semolina', productQuality.semolina),
    },
    best
  );
  // Packed flour no open order can take sits in the packers and counts
  // against the feed budget. It is made up again only while the line now
  // makes flour that meets the planned order's minimum: a worn line would
  // only pack more of what no one takes (plan item 3.4).
  const plannedMinimum = linePlan
    ? walk.find((order) => order.id === linePlan.orderId)?.minimumQuality
    : undefined;
  const strandedTopUp =
    linePlan &&
    plannedMinimum !== undefined &&
    productQuality[linePlan.finishedMaterial] >= plannedMinimum
      ? stockByProduct[linePlan.finishedMaterial].strandedKg
      : 0;
  const labBench = measure.labBench ?? !isBenchmarkRuntime();
  flowStore.tickMaterialFlow(
    plantSeconds,
    effectiveProductionSpeed,
    linePlan
      ? {
          sourceMaterial: linePlan.sourceMaterial,
          finishedMaterial: linePlan.finishedMaterial,
          remainingFinishedKg: linePlan.remainingFinishedKg + strandedTopUp,
        }
      : undefined,
    // Under a charter each packed portion of flour takes its own grain's term.
    stampContext ? { ...productQuality, flour: Math.max(0, stampBase(machines)) } : productQuality,
    // Grain leaves the silos only for the line's plan (PLAN_ONLY_SILO_FEED);
    // benchmarks keep the open valves they were captured with.
    {
      labBench,
      planFeed: !isBenchmarkRuntime(),
      ...(stampContext
        ? { flourPenalty: (sources) => stampPenaltyFor(sources, stampContext) }
        : {}),
    }
  );
  // A supplier alert whose named batches have all settled takes the held
  // flour packed from its lots since, so the lab can still close it.
  bindLotHeldBatches();
  // The lab's bench (plan item 3.2): one batch at a time, on game minutes,
  // read against the order it would serve. Idle when nothing awaits a test.
  {
    const benchFlow = useMaterialFlowStore.getState();
    stepLabBench(
      gameSeconds / 60,
      shipmentOrdersFrom(useOperationsCampaignStore.getState().orders),
      // A batch is still filling while its packer packs its product now.
      (packerId, material) => {
        const buffer = benchFlow.machineBuffers.get(packerId);
        return (
          benchFlow.currentPackerFlowRate > 0 &&
          !!buffer?.isProcessing &&
          buffer.inputBuffer.some((entry) => entry.type === material && entry.amount > 1)
        );
      }
    );
  }

  // 4c. Convert the exact final-stage mass flow into completed 25 kg bags on
  // the same central cadence. Fractional carry preserves mass across ticks.
  // The HUD, SCADA packer-flow tag, finished inventory and bag counter now all
  // describe the same packer output rather than parallel rate estimates.
  _oeeTick.packedKg = 0;
  _oeeTick.ratedKg = 0;
  _oeeTick.unitCount = 0;
  for (let i = 0; i < machines.length; i++)
    if (machines[i].type !== 'CONTROL_ROOM') _oeeTick.unitCount++;
  if (runningPackerCount > 0) {
    const liveFlow = useMaterialFlowStore.getState();
    const flowRate = liveFlow.currentPackerFlowRate;
    if (flowRate > 0 && plantSeconds > 0) {
      let ratedKgPerSecond = 0;
      for (let i = 0; i < machines.length; i++) {
        const m = machines[i];
        if (m.type === 'PACKER' && (m.status === 'running' || m.status === 'warning'))
          ratedKgPerSecond += liveFlow.machineBuffers.get(m.id)?.processingRate ?? 0;
      }
      _oeeTick.packedKg = flowRate * plantSeconds;
      _oeeTick.ratedKg = ratedKgPerSecond * Math.max(0, productionSpeed) * plantSeconds;
    }
    _bagProductionCarry += calculateBagsProducedForTick(plantSeconds, flowRate);
    const completedBags = Math.floor(_bagProductionCarry);
    if (completedBags > 0) {
      _bagProductionCarry -= completedBags;
      useProductionStore.getState().incrementBagsProduced(completedBags);
    }
  }

  // 4d. Grain deliveries: when a receiving truck docks, it refills the
  // emptiest silo — without this the silos drain dry in under an hour of
  // simulation and the flow network starves permanently.
  const receivingTransferReady =
    useTruckScheduleStore.getState().truckSchedule.receiving.transferReady;
  let arrivedLot: ArrivedLot | null = null;
  if (receivingTransferReady && !_lastReceivingTransferReady) {
    // A signed chronicle stamps the lot with this crop year's attributes.
    // Replays and improvement trials are not history; their lots stay unstamped.
    const deliveryIndex = useChronicleStore.getState().chronicle.deliveries;
    const crop =
      replayActive || improvementActive ? null : useChronicleStore.getState().stampDelivery();
    const before = useMaterialFlowStore.getState();
    const wheatBefore = sumMaterialInventory(before, 'wheat_grain');
    const cornBefore = sumMaterialInventory(before, 'corn_grain');
    // Intake (plan item 3.1): under a charter a wheat lot waits at the intake
    // for the partner's proposal, which takes it in (or refuses it) below.
    // Without a charter, in a replay, a trial or a benchmark, it goes to the
    // emptiest silo at once, as before.
    const intakeFacts =
      crop && stampContext && !isBenchmarkRuntime()
        ? buildIntakeFacts(
            { deliveryIndex, amountKg: GRAIN_DELIVERY_KG, crop },
            stampContext,
            stampBase(useProductionStore.getState().machines)
          )
        : null;
    if (intakeFacts) arrivedLot = intakeFacts;
    else
      flowStore.receiveGrainDelivery(GRAIN_DELIVERY_KG, {
        ...(crop ? { crop } : {}),
        gameClock: readPlantClock(),
      });
    // Grain is bought as it is taken in (plan item 3.8): what the silo took,
    // by grain, at its price (simulation/grainPrice.ts). The same truck brings
    // the parts the partner's reorder rule has on order, and only those
    // (breakdownStore PARTS_REORDER_RULE); they are paid for as they arrive.
    const after = useMaterialFlowStore.getState();
    const partsArrived = useBreakdownStore.getState().restockDelivery();
    useOperationsCampaignStore.getState().bookPurchase({
      grainCost: grainPurchaseCost({
        wheat_grain: sumMaterialInventory(after, 'wheat_grain') - wheatBefore,
        corn_grain: sumMaterialInventory(after, 'corn_grain') - cornBefore,
      }),
      partsCost: partsPrice(partsArrived),
    });
  }
  _lastReceivingTransferReady = receivingTransferReady;

  // 4e. Loading is a docked operation. Product remains conserved in finished
  // goods until the vehicle actually departs, when the material store creates
  // the authoritative dispatch manifest. The load snapshot is operational
  // intent only, never a second inventory ledger.
  const shippingSchedule = useTruckScheduleStore.getState().truckSchedule.shipping;
  const shippingTransferReady = shippingSchedule.transferReady;
  const dockFlow = useMaterialFlowStore.getState();
  const codeByQualityReason = {
    certification_expired: 'certificationExpired',
    unresolved_contamination: 'unresolvedContamination',
    failed_quality_test: 'failedQualityTest',
  } as const satisfies Record<string, DispatchQualityBlockCode>;
  const qualityBlockCodeFor = (
    quality: ReturnType<typeof getDispatchQualityStatus>
  ): DispatchQualityBlockCode | null =>
    useOperationsCampaignStore.getState().getIncidentEffect().dispatchBlocked
      ? 'incidentDispatchIsolation'
      : quality.reason
        ? codeByQualityReason[quality.reason]
        : !quality.released
          ? 'qualityInterlockNotReleased'
          : null;
  if (shippingSchedule.departureCount < _lastShippingDepartureCount) {
    _shippingLoad = {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: FINISHED_GOODS_SHIPMENT_KG,
      materialType: 'flour',
      blockReason: null,
      blockCode: null,
      lastDispatchKg: 0,
    };
  }
  if (shippingSchedule.departureCount > _lastShippingDepartureCount) {
    // Transfer readiness falls during door closing, while the truck is still
    // secured at the dock. Only the controller's completed departure counts.
    // Final quality release still applies if conditions changed after loading.
    const departureQuality = getDispatchQualityStatus(
      useQCLabStore.getState().qcLab,
      dockFlow.productionBatches
    );
    const departureBlockCode = qualityBlockCodeFor(departureQuality);
    const departureBlockReason = departureBlockCode ? translate(msg, departureBlockCode) : null;
    // The manifest names the order the plan credits first, read now from live
    // state: the load snapshot is saved and does not carry it.
    // So does which batch goes to which order (plan item 3.4): only flour
    // that meets each order's minimum, up to what the truck took aboard.
    const departurePlan = departureBlockReason
      ? null
      : planShipment(
          shipmentPlanInput(activeProductionPlan, dockFlow.productionBatches, shipmentPolicy)
        );
    const departureOrderId = departurePlan?.orderId ?? null;
    // An order of another product is the line's, and nothing of this load's
    // product is owed any more (its order was forfeited while the truck was
    // held at the dock past the forfeit's wait): the load stays in stock
    // rather than leave with no order to pay for it (review 2, finding 7).
    // Benchmarks keep the old truck rule.
    const ownerless =
      !!departurePlan &&
      !departurePlan.graded &&
      departureOrderId === null &&
      !!activeProductionPlan &&
      !isBenchmarkRuntime();
    const actualKg =
      !departurePlan || ownerless
        ? 0
        : dockFlow.shipFinishedGoods(_shippingLoad.loadedKg, _shippingLoad.materialType, {
            gameClock: readPlantClock(),
            ...(departureOrderId ? { orderId: departureOrderId } : {}),
            // With no order of its product owed nothing is read against a
            // minimum, and the truck takes released stock as it always did.
            ...(departurePlan.graded
              ? { loads: trimLoads(departurePlan.loads, _shippingLoad.loadedKg) }
              : {}),
          });
    _shippingLoad = {
      ..._shippingLoad,
      status: 'departed',
      loadedKg: actualKg,
      lastDispatchKg: actualKg,
      blockReason:
        actualKg > 0
          ? null
          : (departureBlockReason ??
            _shippingLoad.blockReason ??
            translate(msg, 'departedWithoutLoad')),
      // A held reason from a load saved before codes existed keeps its stored text.
      blockCode:
        actualKg > 0
          ? null
          : (departureBlockCode ??
            (_shippingLoad.blockReason
              ? (_shippingLoad.blockCode ?? null)
              : 'departedWithoutLoad')),
    };
  }
  const shippingCycleId = `shipping-${shippingSchedule.departureCount + 1}`;
  if (shippingTransferReady && _shippingLoad.cycleId !== shippingCycleId) {
    _shippingLoad = {
      cycleId: shippingCycleId,
      status: 'loading',
      loadedKg: 0,
      capacityKg: FINISHED_GOODS_SHIPMENT_KG,
      materialType: activeProductionPlan?.finishedMaterial ?? 'flour',
      blockReason: null,
      blockCode: null,
      lastDispatchKg: 0,
    };
  }

  // No open commitment (a programme is complete): a truck that loaded now
  // would carry the line's stock-build output to no customer, with no order
  // credit and no revenue, and the batches it took could never be credited to
  // the next programme. It holds at the dock instead, never 'ready', so the
  // yard keeps it docked until a programme opens a commitment. An empty cycle
  // follows the live recipe, since it opened before there was one.
  // Working if the stock built while waiting is still there to ship.
  const commitmentHoldReason = activeProductionPlan ? null : translate(msg, 'noCommitmentToShip');

  if (shippingTransferReady) {
    const qualityStatus = getDispatchQualityStatus(
      useQCLabStore.getState().qcLab,
      dockFlow.productionBatches
    );
    const qualityBlockCode = qualityBlockCodeFor(qualityStatus);
    const qualityBlockReason = qualityBlockCode ? translate(msg, qualityBlockCode) : null;
    // The product, the kilograms and the readiness come from the shipment plan
    // (src/simulation/shipmentPlan.ts). An empty truck takes the active
    // order's product; after a mid-load switch to another product's order the
    // truck keeps its own and loads toward what that product's open orders
    // owe, never shedding what it holds. The holds stay here: they read the
    // lab and the incidents.
    const plan = planShipment(
      shipmentPlanInput(activeProductionPlan, dockFlow.productionBatches, shipmentPolicy)
    );
    if (plan.materialType !== _shippingLoad.materialType)
      _shippingLoad = { ..._shippingLoad, materialType: plan.materialType };
    const releasedKg = plan.releasedKg;
    const previousStatus = _shippingLoad.status;
    const previousBlockReason = _shippingLoad.blockReason;
    const previousBlockCode = _shippingLoad.blockCode;

    if (commitmentHoldReason) {
      _shippingLoad = {
        ..._shippingLoad,
        status: 'held',
        blockReason: commitmentHoldReason,
        blockCode: 'noCommitmentToShip',
      };
    } else if (qualityBlockReason) {
      _shippingLoad = {
        ..._shippingLoad,
        status: 'held',
        blockReason: qualityBlockReason,
        blockCode: qualityBlockCode,
      };
    } else if (
      releasedKg <= _shippingLoad.loadedKg + 1e-6 &&
      _shippingLoad.loadedKg < plan.readyAtKg - 1e-6 &&
      plan.awaitingTestKg > 1e-6
    ) {
      // Tested stock is aboard and more the orders take is on the lab's
      // bench (plan item 3.2): the truck waits for it rather than leaving
      // short and making the order wait a whole truck.
      _shippingLoad = { ..._shippingLoad, status: 'loading', blockReason: null, blockCode: null };
    } else if (
      releasedKg <= _shippingLoad.loadedKg + 1e-6 &&
      _shippingLoad.loadedKg < plan.readyAtKg - 1e-6 &&
      dispatchHoldsTruck(
        usePartnerProposalStore.getState().proposals,
        _shippingLoad.cycleId,
        useOperationsCampaignStore.getState().elapsedMinutes
      )
    ) {
      // A dispatch question is open for this truck, or it was answered
      // "hold" (plan item 3.4): it waits at the dock for in-spec flour
      // rather than leaving on the stock-out with what it has aboard.
      _shippingLoad = { ..._shippingLoad, status: 'loading', blockReason: null, blockCode: null };
    } else if (releasedKg <= _shippingLoad.loadedKg + 1e-6) {
      // Released stock has run out: ready with anything aboard (plan.ready).
      _shippingLoad = {
        ..._shippingLoad,
        status: plan.ready ? 'ready' : 'held',
        blockReason: plan.ready
          ? null
          : translate(msg, 'waitingForMaterial', { material: _shippingLoad.materialType }),
        blockCode: plan.ready ? null : 'waitingForMaterial',
      };
    } else {
      const loadedKg = Math.min(
        plan.targetKg,
        _shippingLoad.loadedKg +
          logisticsLoadingRate(
            useLogisticsLayoutStore.getState().layout,
            SHIPPING_LOAD_RATE_KG_PER_SECOND
          ) *
            plantSeconds
      );
      _shippingLoad = {
        ..._shippingLoad,
        loadedKg,
        // Readiness after this tick's loading: at capacity or at what is owed.
        status: loadedKg >= plan.readyAtKg - 1e-6 ? 'ready' : 'loading',
        blockReason: null,
        blockCode: null,
      };
    }

    // The reason is translated copy: a language switch alone changes its text,
    // so text counts as a new hold only within one language (a different held
    // batch under the same code still re-announces).
    const locale = getLocale();
    const reasonChanged =
      previousBlockReason !== _shippingLoad.blockReason && locale === _holdNoticeLocale;
    _holdNoticeLocale = locale;
    if (
      _shippingLoad.status === 'held' &&
      (previousStatus !== 'held' || previousBlockCode !== _shippingLoad.blockCode || reasonChanged)
    ) {
      useUIStore.getState().addAlert(
        commitmentHoldReason
          ? {
              id: `dispatch-commitment-wait-${_shippingLoad.cycleId}`,
              type: 'info',
              title: translate(msg, 'shippingAwaitingProgrammeTitle'),
              message: commitmentHoldReason,
              timestamp: new Date(),
              acknowledged: false,
              copy: dispatchHoldAlertCopy({ kind: 'programme' }),
            }
          : {
              id: `${qualityBlockReason ? 'dispatch-quality-hold' : 'dispatch-supply-wait'}-${_shippingLoad.cycleId}`,
              type: qualityBlockReason ? 'warning' : 'info',
              title: qualityBlockReason
                ? translate(msg, 'dispatchQualityHoldTitle')
                : translate(msg, 'shippingAwaitingProductTitle'),
              message: qualityBlockReason
                ? translate(msg, 'clearBeforeRelease', {
                    reason: qualityBlockReason,
                    rate: formatFixed(DEMURRAGE_COST_PER_HOUR, 2),
                  })
                : (_shippingLoad.blockReason ?? translate(msg, 'waitingForProduct')),
              timestamp: new Date(),
              acknowledged: false,
              // A quality hold stops the truck: read it whatever the PA or mute.
              ...(qualityBlockReason ? { announce: 'polite' as const } : {}),
              copy: qualityBlockCode
                ? dispatchHoldAlertCopy({
                    kind: 'quality',
                    code: qualityBlockCode,
                    rate: DEMURRAGE_COST_PER_HOUR,
                  })
                : dispatchHoldAlertCopy({
                    kind: 'supply',
                    code: _shippingLoad.blockCode,
                    material: _shippingLoad.materialType,
                  }),
            }
      );
    }
  }
  _lastShippingDepartureCount = shippingSchedule.departureCount;

  const latestProduction = useProductionStore.getState();
  const latestFlow = useMaterialFlowStore.getState();
  const latestGame = useGameSimulationStore.getState();
  const latestTrucks = useTruckScheduleStore.getState().truckSchedule;
  const materialSeconds = Math.max(0, latestFlow.simulationTime - materialTimeBefore);
  const dispatchStatus = getDispatchQualityStatus(
    useQCLabStore.getState().qcLab,
    latestFlow.productionBatches
  );
  useLogisticsLayoutStore.getState().observe(
    latestFlow.sessionId,
    plantSeconds,
    materialSeconds,
    latestFlow.currentPackerFlowRate * plantSeconds,
    Math.max(0, latestFlow.shippedKg - workplaceShippedBefore),
    layoutComparisonCondition({
      productionSpeed: latestProduction.productionSpeed,
      gameSpeed: safeGameSpeed,
      machines: latestProduction.machines,
      dispatchReleased: dispatchStatus.released,
      forkliftsStopped: useSafetyStore.getState().forkliftEmergencyStop,
    })
  );
  const totalEnergyKw = getSiteDemandKw(
    latestProduction.machines,
    latestGame.gameTime,
    latestGame.emergencyActive,
    latestProduction.productionSpeed
  );
  const executionPlan = useOperationsCampaignStore.getState().getActiveProductionPlan();
  const executionMaterial = executionPlan?.finishedMaterial ?? _shippingLoad.materialType;
  const finishedAvailability = getFinishedGoodsAvailability(latestFlow, executionMaterial);
  const lastReportBefore = useOperationsCampaignStore.getState().reports.at(-1)?.id;
  const openBefore = openOrderIds();
  useOperationsCampaignStore.getState().tickCampaign(deltaSeconds * safeGameSpeed, {
    // A save taken between 00:00 and 06:00 under the old per-day key closes
    // one short Night report on its first tick after upgrading; the campaign
    // store cannot re-key it without the clock.
    shiftKey: getShiftWindowKey(latestGame.gameDay, latestGame.gameTime, latestGame.currentShift),
    shiftLabel: translate(msg, 'shiftLabel', { shift: latestGame.currentShift }),
    manifests: latestFlow.manifests,
    materialSessionId: latestFlow.sessionId,
    productionBatches: latestFlow.productionBatches,
    totalEnergyKw: totalEnergyKw * chronicleEffect.energyMultiplier,
    averageQuality: latestProduction.metrics.quality,
    wasteKg: latestFlow.wasteKg,
    storageUtilization: getStorageUtilization(),
    shippingDocked: latestTrucks.shipping.truckDocked,
    receivingDocked: latestTrucks.receiving.truckDocked,
    dispatchReleased: dispatchStatus.released,
    sourceInventoryKg: executionPlan
      ? sumMaterialInventory(latestFlow, executionPlan.sourceMaterial)
      : 0,
    finishedAvailableKg: finishedAvailability.availableKg,
    releasedFinishedKg: finishedAvailability.releasedKg,
    dispatchLoad: { ..._shippingLoad },
    ...openWorkOrderSummary(),
    clockMinuteOfDay: latestGame.gameTime * 60,
    lineOrderId: linePlan?.orderId ?? null,
    lineCustomer: linePlan?.prestaged ? linePlan.customer : null,
    bestReachableQuality: bestReachableQuality(stampContext),
    oee: _oeeTick,
    // The opening stock, on a material session's first tick (the ledger).
    ...(openingStockValue !== undefined ? { openingStockValue } : {}),
  });
  announceForfeits(openBefore);
  // The chronicle reads the campaign's recorded evidence after it has closed
  // any shift. Replays and improvement trials own the clock and are not history.
  useChronicleStore.getState().observe(replayActive || improvementActive);
  announceClosedShift(lastReportBefore);
  // A replay re-runs the past: its deliveries are not this session's results.
  if (!replayActive) celebrateCampaignResults(openBefore, lastReportBefore);
  // Workshops advance only through facilitator inputs. They must not acquire a
  // clock, pay or apparent shipment evidence from unrelated plant activity.
  if (useWorkplaceStore.getState().workplace.mode === 'game') {
    useWorkplaceStore
      .getState()
      .tick(
        (deltaSeconds * safeGameSpeed) / 60,
        Math.max(0, latestFlow.shippedKg - workplaceShippedBefore),
        latestGame.emergencyActive
      );
    const reviewed = useWorkplaceStore.getState().workplace;
    // The derived handoff hold already covers a review with nothing owed; an
    // ended trial that owes recovery waits here for an explicit resume.
    if (
      (replayActive || (reviewed.improvement && !reviewed.improvement.verdict)) &&
      reviewed.phase === 'review' &&
      (workplacePhaseBefore === 'active' ||
        reviewed.members.every((member) => member.recoveryOwedMinutes === 0)) &&
      (replayActive || !handoffHoldsClock(reviewed))
    )
      useGameSimulationStore.getState().holdClock('workplace');
  }

  // 4f. The partner's proposals (systems/partnerProposalRuntime.ts): raised
  // from the plant, answered elsewhere, expired on the campaign's game minutes
  // (so P holds them and pace scales them), compared an hour on. It keeps its
  // state in its own saved store, none here. Benchmarks, replays and trials
  // are not play: nothing is raised and nothing expires in them.
  if (!replayActive && !improvementActive && !isBenchmarkRuntime())
    stepPartnerProposals({
      qualityOf: productPathQuality,
      // The service card prices wear as the tick applies it, overdrive included.
      wearPace: (machineId: string) =>
        machineWearPace(machineId) *
        lineOverdrive(useProductionStore.getState().productionSpeed, OVERDRIVE_WEAR_SLOPE),
      wearMultiplier: chronicleEffect.wearMultiplier,
      qualityPenalty:
        useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty +
        lineChroniclePenalty,
      bestReachable: bestReachableQuality(stampContext),
      wheatOnceDried: wheatReachableOnceDried(
        stampContext,
        useOperationsCampaignStore.getState().elapsedMinutes
      ),
      ...(arrivedLot ? { arrivedLot } : {}),
      intakeBase: stampBase(useProductionStore.getState().machines),
      // The temper card (plan item 7.7): the wheat the line will be fed, which
      // prices the drying. The card is raised on the silos one by one
      // (temperRuntime.ts wheatSiloBins), not on this mean.
      ...(stampContext
        ? {
            temperGrain: () => {
              const flow = useMaterialFlowStore.getState();
              const silos = wheatSiloContributions(flow);
              return {
                grain: silos.length > 0 ? equalWeight(silos) : lineWheatContributions(flow),
                context: stampContext,
              };
            },
          }
        : {}),
    });

  // 5. Handle breakdowns (async, outside main path)
  if (_breakdowns.length > 0) {
    // Copy breakdowns before async (since we reuse the array)
    const breakdownsCopy = _breakdowns.map((b) => ({ ...b }));
    breakdownsCopy.forEach(({ id, name, machineType, breakdownType }) => {
      // A roller mill that fails with its wear warning ignored (no service,
      // or its service answered "run on") overheats a bearing: a plant
      // incident with the partner's two answers (plan item 3.5).
      const overheats =
        measure.plantIncidents !== false &&
        !isBenchmarkRuntime() &&
        !replayActive &&
        !improvementActive &&
        machineType === 'ROLLER_MILL' &&
        wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, id);
      const breakdown = useBreakdownStore.getState().triggerBreakdown(id, name, breakdownType);
      if (!breakdown) return;
      if (overheats)
        useOperationsCampaignStore
          .getState()
          .triggerIncident('bearing_overheat', { origin: 'plant', machineId: id });
      const breakdownParams = {
        name,
        machineType,
        workOrderId: breakdown.workOrderId,
        rate: MAINTENANCE_COST_PER_WORK_ORDER_HOUR,
      };
      useUIStore.getState().addAlert({
        id: `breakdown-${id}-${Date.now()}`,
        type: 'critical',
        title: translate(msg, 'breakdownTitle'),
        message: translate(msg, 'breakdownMessage', breakdownParams),
        machineId: id,
        timestamp: new Date(),
        acknowledged: false,
        // The bell reads it to screen readers; the PA line is caption-only.
        announce: 'assertive',
        copy: {
          catalog: TICK_ALERT_CATALOG,
          title: 'breakdownTitle',
          message: 'breakdownMessage',
          params: breakdownParams,
        },
      });
    });
  }
}

// ============================================================
// HOOK TO REGISTER TICK
// ============================================================

/**
 * Clear the module-level edge-detection state. Without this a remount (HMR,
 * a new game) inherits the previous session's dock and shipping edges and can
 * miss the next grain delivery.
 */
export function resetUnifiedTickState(): void {
  _lastReceivingTransferReady = false;
  _lastShippingDepartureCount = 0;
  _shippingLoad = {
    cycleId: 'shipping-0',
    status: 'away',
    loadedKg: 0,
    capacityKg: 5000,
    materialType: 'flour',
    blockReason: null,
    blockCode: null,
    lastDispatchKg: 0,
  };
  _bagProductionCarry = 0;
  _milestonesReachedMask = 0;
  _wearCarry.clear();
  _pendingShippingDelayMinutes = 0;
  _pendingReceivingDelayMinutes = 0;
  resetUnitWork();
}

export function captureUnifiedTickState() {
  return structuredClone({
    receivingReady: _lastReceivingTransferReady,
    departureCount: _lastShippingDepartureCount,
    shippingLoad: _shippingLoad,
    bagCarry: _bagProductionCarry,
    milestones: _milestonesReachedMask,
    wearCarry: _wearCarry,
    shippingDelay: _pendingShippingDelayMinutes,
  });
}

export function restoreUnifiedTickState(state: ReturnType<typeof captureUnifiedTickState>) {
  const saved = structuredClone(state);
  _lastReceivingTransferReady = saved.receivingReady;
  _lastShippingDepartureCount = saved.departureCount;
  _shippingLoad = saved.shippingLoad;
  _bagProductionCarry = saved.bagCarry;
  _milestonesReachedMask = saved.milestones;
  _wearCarry.clear();
  saved.wearCarry.forEach((value, key) => _wearCarry.set(key, value));
  _pendingShippingDelayMinutes = saved.shippingDelay;
}

export function useUnifiedGameTick(): void {
  useEffect(() => {
    resetUnifiedTickState();
    centralTick.register('unified-game-tick', unifiedGameTick, TICK_PRIORITY.CRITICAL);
    return () => {
      centralTick.unregister('unified-game-tick');
      resetUnifiedTickState();
    };
  }, []);
}

export { unifiedGameTick };
