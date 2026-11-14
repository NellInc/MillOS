import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MAX_MATERIAL_MANIFESTS,
  useMaterialFlowStore,
  type MaterialManifest,
  type MaterialType,
  type ProductionBatch,
} from './materialFlowStore';
import { safeJSONStorage } from './storage';
import { useBreakdownStore } from './breakdownStore';
import {
  getDispatchQualityStatus,
  useQCLabStore,
  type DispatchQualityHoldReason,
} from './qcLabStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { unifiedGameTickMessages } from '../systems/UnifiedGameTick.messages';
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';
import { energyTariffPerKwh } from '../utils/energyCalculations';
import { getTagById } from '../scada/tagDatabase';
import {
  CAMPAIGN_MASS_EPSILON_KG as EPSILON_KG,
  challengeBlockReason,
  challengeCredit,
  getChallengeRecoveryIncident,
  materialShipmentTotals,
  OPERATIONS_CHALLENGES,
  RECOVERY_CHALLENGE_TARGET_KG,
  RECOVERY_CHALLENGE_WINDOW_MINUTES,
  challengeLabel,
  withMaterialBaseline,
  type OperationsChallengeId,
  type OperationsChallengeRun,
} from '../simulation/operationsPlay';
import { formatFixed, formatGrouped, getLocale, translate, useLocaleStore } from '../i18n';
import { buildProgramme, programmeShift } from '../simulation/programmes';
import { compareDispatchOrder, meetsMinimum } from '../simulation/shipmentPlan';
import { grainInShipped } from '../simulation/grainPrice';
import { DOCK_PROJECTION } from '../simulation/partnerProposals';
import {
  accumulateShiftOee,
  gradeShift,
  shiftGradeBasis,
  shiftGradeReasons,
  proposalRecordText,
  shiftHeadline,
  type ProposalRecord,
  type ShiftGrade,
  type ShiftGradeBasis,
  type ShiftOpenIncident,
  type ShiftOrderOutcome,
  type ShiftOeeRecord,
} from '../simulation/shiftReview';
import { operationsCampaignMessages as messages } from './operationsCampaignStore.messages';
import { incidentDescription, incidentTitle } from './incidentText';
import { dispatchBlockText } from './dispatchBlockText';
import { isPaceGameSpeed } from '../simulation/pace';
import { paceMessages } from '../simulation/pace.messages';
import { customerDisplayName } from './customerNames';
import {
  incidentResponse,
  INCIDENT_RESPONSES,
  PLANT_INCIDENT_MINUTES,
} from '../simulation/incidentResponses';

export type OrderStatus = 'planned' | 'active' | 'late' | 'fulfilled' | 'cancelled';
export type IncidentKind =
  | 'bearing_overheat'
  | 'dust_filter_pressure'
  | 'power_sag'
  | 'delayed_truck'
  | 'supplier_contamination'
  | 'packaging_shortage'
  | 'severe_rain'
  | 'control_network_degraded';
export type IncidentPhase = 'raised' | 'acknowledged' | 'mitigated' | 'resolved';
export type LogCategory = 'operation' | 'quality' | 'maintenance' | 'safety' | 'period';
/**
 * Who a logbook entry records: the operator's own choice, an AI agent command,
 * or the plant's controllers narrating what they did. Tagged at the call site,
 * since the same store action serves the operator, agents and the tick.
 * Entries saved before store v3 carry none and read as 'controller'.
 */
export type CampaignActor = 'operator' | 'agent' | 'controller';

export interface MillRecipe {
  id: string;
  label: string;
  finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
  sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
  minimumQuality: number;
}

export interface CustomerOrder {
  id: string;
  customer: string;
  recipe: MillRecipe;
  requiredKg: number;
  shippedKg: number;
  qualityFailureKg: number;
  dueAtMinute: number;
  priority: 'normal' | 'high' | 'critical';
  revenuePerKg: number;
  latePenaltyPerKgHour: number;
  status: OrderStatus;
  batchIds: string[];
  manifestIds: string[];
  completedAtMinute: number | null;
  /**
   * A programme's rush order: how much more it pays per kg than its
   * customer's usual terms (src/simulation/programmes.ts). Absent otherwise.
   */
  rushPremiumPercent?: number;
  /**
   * Set when the order was forfeited: closed unfulfilled (status 'cancelled')
   * FORFEIT_LATENESS_MINUTES past its due time (plan items 3.4, 3.7). Absent
   * on every order that was not, and on every order saved before forfeits.
   */
  forfeitedAtMinute?: number;
  /**
   * Why: 'unreachable' when the best stamp the line can make on its grain
   * (forfeitBestQuality) is under its minimum, 'late' otherwise.
   */
  forfeitReason?: 'unreachable' | 'late';
  /** The best stamp the line could make on the order's grain when it was forfeited. */
  forfeitBestQuality?: number;
  /** The penalty booked at the forfeit (FORFEIT_FEE_HOURS of its late rate on what it lacked). */
  forfeitFee?: number;
}

export interface OperationalIncident {
  id: string;
  kind: IncidentKind;
  title: string;
  description: string;
  phase: IncidentPhase;
  severity: 'low' | 'medium' | 'high' | 'critical';
  startedAtMinute: number;
  acknowledgedAtMinute: number | null;
  resolvedAtMinute: number | null;
  affectedMachineId: string | null;
  effectApplied: boolean;
  /**
   * 'plant' when the plant raised it (a started recovery challenge, or a mill
   * that failed after its service was answered "run on"): it takes the
   * partner's two answers and resolves at `endsAtMinute` (plan item 3.5).
   * Absent on a Chronicle-raised incident and on every incident saved before.
   */
  origin?: 'plant';
  /** How it was met (simulation/incidentResponses.ts); absent: halved, as before. */
  response?: string;
  /** A plant incident's end, set when it is answered. */
  endsAtMinute?: number;
  /** The answer's own action (a relief lorry, a filter, a recall) has run. */
  responseActed?: boolean;
}

export interface CampaignEconomics {
  revenue: number;
  energyCost: number;
  automationCost: number;
  wasteCost: number;
  maintenanceCost: number;
  demurrageCost: number;
  latePenalties: number;
}

/**
 * The purchase lines (plan items 3.3, 3.8), kept apart from CampaignEconomics
 * so readers that list its lines one by one keep their shape.
 */
export interface CampaignPurchaseLedger {
  /**
   * Grain bought, booked when a delivery is taken in (simulation/grainPrice.ts).
   * Optional, like the two lines below: a save from before them has none, and
   * every reader takes a missing line as 0.
   */
  grainCost?: number;
  /** Spare parts bought, booked when an order arrives with a grain delivery. */
  partsCost?: number;
  /**
   * Grain bought and not yet shipped, at cost: rises with each delivery, falls
   * by the grain in each shipment. A credit to the net, so a shift pays for the
   * grain in what it sold, and grain held as stock is money spent, not earned.
   */
  stockHeld?: number;
}

/** A purchase the plant books: grain at a delivery, parts on order arriving with it. */
export interface CampaignPurchase {
  grainCost?: number;
  partsCost?: number;
}

/** Failure costs accruing right now, per game hour; written by the tick that books them. */
export interface CampaignCostRates {
  maintenance: number;
  demurrage: number;
  late: number;
}
/** Each open work order costs this per game hour while its machine is down. */
export const MAINTENANCE_COST_PER_WORK_ORDER_HOUR = 90;
/** A docked shipping truck held by quality or isolation costs this per game hour. */
export const DEMURRAGE_COST_PER_HOUR = 120;
const ZERO_COST_RATES: CampaignCostRates = { maintenance: 0, demurrage: 0, late: 0 };

export interface ShiftCampaignMetrics extends CampaignEconomics, CampaignPurchaseLedger {
  dispatchedKg: number;
  qualityFailureKg: number;
  incidentsResolved: number;
  automaticActions: number;
  /**
   * Game minutes in the window during which a customer order was open. Held
   * clock time is not counted: a held tick never reaches tickCampaign.
   */
  commitmentMinutes: number;
  /**
   * The shift review's OEE inputs (plan item 7.6), over the minutes an order
   * was open. Absent on reports from before it; their review states no OEE.
   */
  oee?: ShiftOeeRecord;
}

export interface ShiftCampaignReport {
  id: string;
  shiftKey: string;
  shiftLabel: string;
  startedAtMinute: number;
  endedAtMinute: number;
  metrics: ShiftCampaignMetrics;
  completedOrderIds: string[];
  openRisks: string[];
  /** Null when no customer commitment was open and nothing shipped (store v3). */
  grade: ShiftGrade | null;
  summary: string;
  /** The evidence the grade was computed from (store v3; older reports lack it). */
  gradeBasis?: ShiftGradeBasis;
  /** Each order completed in, or still open at the end of, the window (store v3). */
  orderOutcomes?: ShiftOrderOutcome[];
  gradeReasons?: string[];
  /**
   * Before store v3, the window's last eight logbook lines of any origin; from
   * v3, the messages of `choices` only.
   */
  decisions?: string[];
  /** Operator and agent choices in the window (store v3). */
  choices?: ShiftChoice[];
  /** The plant's own narration in the window, last eight lines (store v3). */
  narration?: string[];
  /** Each narration line's wording, by index; null where a line has none (absent before). */
  narrationWording?: (LogWording | null)[];
  /**
   * Every partner proposal compared in the window, as keys and numbers, worded
   * at read time (shiftReview describeShiftProposals). Bounded by
   * MAX_REPORT_PROPOSALS; absent before plan 3.4.
   */
  proposals?: ProposalRecord[];
}

export interface CampaignLogEntry {
  id: string;
  simulationMinute: number;
  source: string;
  category: LogCategory;
  message: string;
  relatedId: string | null;
  actor?: CampaignActor;
  /** What `message` says, unworded, so it follows the language (absent before; free text has none). */
  wording?: LogWording;
  /** The catalogue key of `source` (absent before, and for a person's own identity). */
  sourceKey?: LogSourceKey;
}

/** A choice made in the window, by the operator or an AI agent. */
export interface ShiftChoice {
  minute: number;
  actor: Exclude<CampaignActor, 'controller'>;
  message: string;
  /** The logbook entry's wording, so a saved review follows the language (absent before). */
  wording?: LogWording;
}

/** A logbook source the store names from its own catalogue. */
export type LogSourceKey =
  | 'sourceRecoveryChallenge'
  | 'sourceOrderScheduler'
  | 'sourceAutonomousExecution'
  | 'sourceIncidentController'
  | 'sourceDispatchController'
  | 'sourceProductionExecution'
  | 'sourceControlLayer'
  | 'sourceScada'
  | 'sourceOperator';

/**
 * What a logbook line says with its raw parameters: numbers unformatted, and
 * anything that is itself copy (an incident, a recipe, a challenge, a pace, a
 * grain) as its code. A logbook line is persisted and read after a language
 * switch or on a page loaded in another language; it is worded again from this.
 */
export type LogWording =
  | { key: 'logProgrammeInitialized' | 'logChallengeAbandoned' }
  | { key: 'logOrderActivated'; customer: string; recipeId: string }
  | {
      key:
        | 'incidentRaised'
        | 'logIncidentAcknowledged'
        | 'logIncidentMitigated'
        | 'logIncidentResolved';
      kind: IncidentKind;
    }
  | {
      key: 'logChallengeStarted' | 'logChallengeCompleted' | 'logChallengeFailed';
      challengeId: OperationsChallengeId;
    }
  | {
      key: 'logProgrammeAccepted';
      number: number;
      customer: string;
      rushKg: number;
      totalKg: number;
    }
  | { key: 'logManifestAllocated'; manifest: string; kg: number }
  /** An order forfeited at its lateness bound; `best` is set when the line could not make it. */
  | {
      key: 'logOrderForfeited';
      customer: string;
      minutes: number;
      shippedKg: number;
      requiredKg: number;
      minimum: number;
      best: number | null;
      fee: number;
    }
  | {
      key: 'logSetpointWritten';
      tag: string;
      /** The tag's id, so its name follows the language; `tag` is the fallback. */
      tagId?: string;
      value: number;
      engUnit: string | null;
    }
  | { key: 'operatorAction'; action: OperatorAction }
  /** A partner proposal's record an hour after its answer (plan 3.0, 3.4). */
  | { key: 'proposalRecord'; record: ProposalRecord }
  | ExecutionWording;

type ExecutionWording =
  | {
      key:
        | 'execPlanning'
        | 'execPackedResting'
        | 'execReadyToLoad'
        | 'execReadyToDispatch'
        | 'execAllFulfilled'
        | 'execFulfilled';
    }
  | { key: 'execPackedPrestaging'; customer: string }
  | { key: 'execProcessing'; material: string | null }
  | {
      key: 'execQualityHold';
      load: Pick<DispatchLoadSnapshot, 'blockReason' | 'blockCode' | 'materialType'>;
    }
  | { key: 'execLoading'; loaded: number; capacity: number }
  | { key: 'execDispatched'; kg: number };

export interface CampaignConstraint {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  label: string;
  detail: string;
  relatedId: string | null;
  /** The catalogue key of `label`, so a saved review can word it again (absent before). */
  labelKey?: ConstraintLabelKey;
  /** What `detail` says, unworded, so a restored set can be worded again (absent before). */
  wording?: ConstraintWording;
}

/** A constraint detail's catalogue key with its raw (unformatted) parameters. */
export type ConstraintWording =
  | { key: 'constraintStorageDetail'; percent: number }
  | { key: 'constraintFeedDetail'; material: string }
  | {
      key: 'constraintOverdueDetail' | 'constraintDueSoonDetail';
      customer: string;
      minutes: number;
    }
  | { key: 'constraintDispatchDetail' }
  | { key: 'constraintMachineDownDetail'; machine: string; workOrderId: string; others: number }
  | { key: 'constraintMaintenanceDetail'; count: number };

type ConstraintLabelKey =
  | 'constraintStorageLabel'
  | 'constraintFeedLabel'
  | 'constraintOverdueLabel'
  | 'constraintDueSoonLabel'
  | 'constraintDispatchLabel'
  | 'constraintMaintenanceLabel';

export type FulfillmentStage =
  | 'planning'
  | 'milling'
  | 'quality_hold'
  | 'ready_to_load'
  | 'loading'
  | 'ready_to_dispatch'
  | 'dispatched'
  | 'fulfilled';

export type DispatchLoadStatus = 'away' | 'loading' | 'held' | 'ready' | 'departed';

/** Why a load is held or left empty; dispatchBlockText() words it in the language active now. */
export type DispatchQualityBlockCode =
  | 'certificationExpired'
  | 'unresolvedContamination'
  | 'failedQualityTest'
  | 'incidentDispatchIsolation'
  | 'qualityInterlockNotReleased';
export type DispatchBlockCode =
  | DispatchQualityBlockCode
  | 'departedWithoutLoad'
  | 'noCommitmentToShip'
  | 'waitingForMaterial';

export interface DispatchLoadSnapshot {
  cycleId: string;
  status: DispatchLoadStatus;
  loadedKg: number;
  capacityKg: number;
  materialType: Extract<MaterialType, 'flour' | 'semolina'>;
  /** Text in the language active when it was set; render dispatchBlockText() instead. */
  blockReason: string | null;
  /** Absent on loads saved before codes existed; those keep blockReason. */
  blockCode?: DispatchBlockCode | null;
  lastDispatchKg: number;
}

export interface OrderExecutionState {
  orderId: string | null;
  recipeId: string | null;
  sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'> | null;
  finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'> | null;
  stage: FulfillmentStage;
  lineSetpointPercent: number;
  remainingKg: number;
  sourceInventoryKg: number;
  finishedAvailableKg: number;
  releasedFinishedKg: number;
  qualityReleased: boolean;
  dispatchLoad: DispatchLoadSnapshot;
  /**
   * The order the line is producing for. It is the dispatch order until that
   * order's remainder is packed and waiting for a truck; then the line starts
   * the next commitment. Null before the first tick.
   */
  lineOrderId?: string | null;
  /** Customer of `lineOrderId` when it is not the dispatch order. */
  lineCustomer?: string | null;
}

/** What the line should make now: the dispatch order, or the next one pre-staged. */
export interface LineProductionPlan {
  orderId: string;
  customer: string;
  sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
  finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
  /** Finished kg still to admit for, counted against everything already committed. */
  remainingFinishedKg: number;
  prestaged: boolean;
}

export interface UtilityAssetTelemetry {
  id: string;
  label: string;
  contents: string;
  capacityLitres: number;
  levelPercent: number;
  temperatureC: number;
  pressureBar: number;
  status: 'normal' | 'low' | 'critical';
  /** Campaign minute a booked supplier delivery tops the vessel up; unset when none is booked. */
  refillDueMinute?: number;
}

/* The bulk supplier is called at this level and delivers a game half-day later. */
const UTILITY_REORDER_PERCENT = 30;
const UTILITY_DELIVERY_MINUTES = 12 * 60;

export interface CampaignTickContext {
  /** Physical material session, regenerated when its nonpersistent inventory restarts. */
  materialSessionId?: string;
  shiftKey: string;
  shiftLabel: string;
  manifests: ReadonlyArray<MaterialManifest>;
  productionBatches: ReadonlyArray<ProductionBatch>;
  totalEnergyKw: number;
  averageQuality: number;
  wasteKg: number;
  storageUtilization: number;
  shippingDocked: boolean;
  receivingDocked: boolean;
  dispatchReleased: boolean;
  sourceInventoryKg: number;
  finishedAvailableKg: number;
  releasedFinishedKg: number;
  dispatchLoad: DispatchLoadSnapshot;
  openWorkOrders: number;
  /** The oldest open work order, so the shift card can name the stopped machine. */
  openWorkOrder?: { id: string; machineId: string; machineName: string } | null;
  /** The order the line is producing for this tick (see LineProductionPlan). */
  lineOrderId?: string | null;
  lineCustomer?: string | null;
  /**
   * Minute of day on the visible game clock (gameTime * 60). The peak energy
   * tariff follows it; campaign elapsed time is used only when it is absent.
   */
  clockMinuteOfDay?: number;
  /**
   * Set by tickCampaign, never by a caller: the readings above are another
   * recipe's, so the active order's own route has not been read yet.
   */
  routeUnread?: boolean;
  /**
   * The best stamp the line can make on each grain: every unit on the product
   * path serviced, less what holds the stamp down for longer than a repair (a
   * Chronicle crop year or modifier). An open order whose minimum is above its
   * grain's figure cannot be made: it is not the order the plant works first
   * while another can be, and its forfeit says so. Absent, every order reads
   * as reachable, as before.
   */
  /** This tick's packing against the line rate, for the review's OEE (UnifiedGameTick). */
  oee?: { unitCount: number; packedKg: number; ratedKg: number };
  bestReachableQuality?: Partial<
    Record<Extract<MaterialType, 'wheat_grain' | 'corn_grain'>, number>
  >;
  /**
   * The grain cost of the plant's stock on site (grainPrice grainValueOnSite),
   * handed in on the first tick of a material session only: the opening stock,
   * booked as grain bought and held as stock that day, so its shipments debit
   * stock held for grain that was bought (review 2, the ledger).
   */
  openingStockValue?: number;
}

/**
 * How late an open order may run before it is forfeited, in game minutes: half
 * a shift. Measured on the ten-shift harness, the latest any order delivered at
 * orders twice the programme's size was 76 minutes late; at three times, 252.
 * Every state therefore has a way out (Chronicle rule 4): an order the line
 * cannot make, or will not make in time, closes here, and the programmes go on.
 */
export const FORFEIT_LATENESS_MINUTES = 240;
/**
 * The penalty booked when an order is forfeited: this many hours of its late
 * rate on the kilograms it still lacked, on top of the late rate it accrued
 * while it was overdue. With the revenue it never earns, a forfeit always
 * costs more than delivering late.
 */
export const FORFEIT_FEE_HOURS = FORFEIT_LATENESS_MINUTES / 60;

/** Whether an open order's minimum is within the best stamp its grain allows. */
export function orderReachable(
  order: Pick<CustomerOrder, 'recipe'>,
  best: CampaignTickContext['bestReachableQuality']
): boolean {
  const figure = best?.[order.recipe.sourceMaterial];
  return figure === undefined || !Number.isFinite(figure)
    ? true
    : meetsMinimum(figure, order.recipe.minimumQuality);
}

/**
 * The programme an order belongs to, by id: `<prefix>-order-<k>` from
 * acceptNextProgramme, and the guided programme's `order-00k` as one.
 */
export function programmeOfOrder(orderId: string): string {
  const at = orderId.lastIndexOf('-order-');
  return at > 0 ? orderId.slice(0, at) : 'guided';
}

export interface AcceptProgrammeOptions {
  /**
   * Take it while an order of the running programme is still open (plan item
   * 3.7). At most one programme may be open beside the running one.
   */
  early?: boolean;
}

export interface IncidentEffect {
  productionMultiplier: number;
  energyMultiplier: number;
  qualityPenalty: number;
  dispatchBlocked: boolean;
  vehicleSpeedMultiplier: number;
}

interface OperationsCampaignState {
  initialized: boolean;
  activeChallenge: OperationsChallengeRun | null;
  challengeHistory: OperationsChallengeRun[];
  creditedBatchKg: Record<string, number>;
  lastMaterialSessionId: string | null;
  startChallenge: (id: OperationsChallengeId, actor?: CampaignActor) => boolean;
  abandonChallenge: (actor?: CampaignActor) => void;
  finishChallengeRecovery: (actor?: CampaignActor) => boolean;
  acceptNextProgramme: (actor?: CampaignActor, options?: AcceptProgrammeOptions) => boolean;
  /**
   * Forfeit an open order before its lateness bound (plan item 3.7): the
   * partner's early forfeit, once the facts say the line cannot make it. The
   * same close, fee and record as the bound's. False when it is not open.
   */
  forfeitOrder: (
    orderId: string,
    actor?: CampaignActor,
    best?: CampaignTickContext['bestReachableQuality']
  ) => boolean;
  elapsedMinutes: number;
  orders: CustomerOrder[];
  activeOrderId: string | null;
  incidents: OperationalIncident[];
  economics: CampaignEconomics & CampaignPurchaseLedger;
  shiftMetrics: ShiftCampaignMetrics;
  /** Instantaneous; not persisted. Reference is kept while the rates are unchanged. */
  costRates: CampaignCostRates;
  reports: ShiftCampaignReport[];
  logbook: CampaignLogEntry[];
  constraints: CampaignConstraint[];
  execution: OrderExecutionState;
  utilityAssets: UtilityAssetTelemetry[];
  processedManifestIds: string[];
  lastWasteKg: number;
  currentShiftKey: string | null;
  currentShiftLabel: string;
  shiftStartedAtMinute: number;
  sequence: number;
  /** Programmes accepted after the guided one; picks the next programme's variant. */
  programmeCount: number;
  initializeCampaign: () => void;
  activateOrder: (orderId: string, actor?: CampaignActor) => void;
  triggerIncident: (
    kind: IncidentKind,
    /** A plant-raised incident (plan item 3.5), and the unit it is on where not its definition's. */
    options?: { origin?: 'plant'; machineId?: string }
  ) => OperationalIncident | null;
  /**
   * Meet an incident with one of its two answers (plan item 3.5): acknowledged
   * if raised, then mitigated with that answer's shares. False when it is not
   * open or the answer is not one of its kind's.
   */
  respondToIncident: (
    incidentId: string,
    response: string,
    actor?: CampaignActor,
    /**
     * False for a Chronicle-raised incident: the answer only chooses how it is
     * met once mitigated; acknowledging and mitigating stay on its own route.
     */
    meet?: boolean
  ) => boolean;
  /** The answer's action has run, so it never runs twice. */
  markIncidentResponseActed: (incidentId: string) => void;
  /** Resolve every plant incident whose end has come (the tick, once a tick). */
  endPlantIncidents: () => void;
  /** A charge a response books (a relief lorry, a refused lot's fee), to the demurrage line. */
  bookDemurrageCharge: (amount: number) => void;
  /** A one-off energy charge (plan item 7.7: the temper card's drying), booked to energy. */
  bookEnergyCharge: (amount: number) => void;
  acknowledgeIncident: (incidentId: string, actor?: CampaignActor) => void;
  mitigateIncident: (incidentId: string, actor?: CampaignActor) => void;
  resolveIncident: (incidentId: string, actor?: CampaignActor) => void;
  markIncidentEffectApplied: (incidentId: string) => void;
  addLogEntry: (
    source: string,
    category: LogCategory,
    message: string,
    relatedId?: string | null,
    actor?: CampaignActor,
    /** The message's wording and the source's key, so the line follows the language. */
    keys?: { wording?: LogWording; sourceKey?: LogSourceKey }
  ) => void;
  tickCampaign: (deltaSimulationSeconds: number, context: CampaignTickContext) => void;
  getActiveProductionPlan: () => {
    orderId: string;
    sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
    finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
    lineSetpointPercent: number;
  } | null;
  /**
   * The recipe and feed budget for the line. Working if, once the dispatch
   * order's remainder is packed and waiting, the line pre-stages the next open
   * commitment instead of idling, while shipping keeps loading the dispatch
   * order's material.
   */
  getLineProductionPlan: (
    finishedAvailableKg: Partial<Record<Extract<MaterialType, 'flour' | 'semolina'>, number>>,
    /**
     * The best stamp each grain allows (CampaignTickContext.bestReachableQuality):
     * an order the line cannot make is neither made for nor counted in the
     * feed budget, or its kilograms are packed under its minimum and stranded.
     */
    bestReachable?: CampaignTickContext['bestReachableQuality']
  ) => LineProductionPlan | null;
  getProductionMultiplier: () => number;
  getIncidentEffect: () => IncidentEffect;
  /**
   * Book a purchase (CampaignPurchase): grain goes into stock held at cost, so
   * it reaches the net only as it ships (tickCampaign); parts are spent.
   */
  bookPurchase: (purchase: CampaignPurchase) => void;
  resetCampaign: () => void;
}

const MAX_LOG_ENTRIES = 160;
const MAX_REPORTS = 12;
const MAX_REPORT_CHOICES = 24;
/** Partner records a report keeps: about 3 a shift are compared in the measured play. */
const MAX_REPORT_PROPOSALS = 12;
const MAX_INCIDENTS = 32;
const MAX_PROCESSED_MANIFESTS = MAX_MATERIAL_MANIFESTS;

type BatchCreditEvidence = Pick<
  ProductionBatch,
  'id' | 'simulationTime' | 'materialType' | 'producedKg' | 'sourceContributions'
>;

// Batch IDs restart with material flow, so a credit key carries immutable
// production evidence: a save cannot re-credit the same batch on a new manifest.
// The source contributions enter as a digest, not verbatim, so saved size no
// longer grows with every lot and path a shipped batch drew from.
// Working if a key stays under ~160 chars and a credit saved under the older
// full-evidence key still blocks re-crediting after an upgrade.
function contributionDigest(contributions: BatchCreditEvidence['sourceContributions']): string {
  const text = JSON.stringify(contributions ?? []);
  let hash = 0x811c9dc5; // FNV-1a, 32-bit
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${contributions?.length ?? 0}:${(hash >>> 0).toString(36)}`;
}

export function batchCreditKey(sessionId: string | null, batch: BatchCreditEvidence): string {
  return [
    'b2',
    sessionId ?? '~',
    batch.id,
    batch.simulationTime,
    batch.materialType,
    batch.producedKg,
    contributionDigest(batch.sourceContributions),
  ].join('|');
}

/** The key format saved before compact keys; read only to migrate old credit. */
function legacyBatchCreditKey(sessionId: string | null, batch: BatchCreditEvidence): string {
  return JSON.stringify([
    sessionId,
    batch.id,
    batch.simulationTime,
    batch.materialType,
    batch.producedKg,
    batch.sourceContributions,
  ]);
}

function compactLegacyCreditKey(key: string): string {
  if (!key.startsWith('[')) return key;
  try {
    const parsed: unknown = JSON.parse(key);
    if (!Array.isArray(parsed) || parsed.length !== 6) return key;
    const [sessionId, id, simulationTime, materialType, producedKg, sourceContributions] = parsed;
    if (
      (sessionId !== null && typeof sessionId !== 'string') ||
      typeof id !== 'string' ||
      typeof simulationTime !== 'number' ||
      typeof materialType !== 'string' ||
      typeof producedKg !== 'number' ||
      !Array.isArray(sourceContributions)
    )
      return key;
    return batchCreditKey(sessionId, {
      id,
      simulationTime,
      materialType: materialType as BatchCreditEvidence['materialType'],
      producedKg,
      sourceContributions,
    });
  } catch {
    return key;
  }
}

/** Credit keys kept: every listed batch's, then the last CREDIT_KEY_TAIL of the rest. */
const CREDIT_KEY_TAIL = 24;
function retainCreditKeys(
  credited: Record<string, number>,
  listed: ReadonlySet<string>
): Record<string, number> {
  const entries = Object.entries(credited);
  const others = entries.filter(([key]) => !listed.has(key)).slice(-CREDIT_KEY_TAIL);
  const keep = new Set(others.map(([key]) => key));
  return Object.fromEntries(entries.filter(([key]) => listed.has(key) || keep.has(key)));
}

/** Rewrites full-evidence credit keys from older saves into the compact form. */
export function compactBatchCreditKeys(credited: Record<string, number>): Record<string, number> {
  const compacted: Record<string, number> = {};
  for (const [key, kg] of Object.entries(credited)) {
    const next = compactLegacyCreditKey(key);
    compacted[next] = Math.max(compacted[next] ?? 0, kg);
  }
  return compacted;
}
/** No open commitment: keep the line warm and build stock instead of stopping. */
const STOCK_BUILD_SETPOINT_PERCENT = 70;

const ZERO_ECONOMICS: CampaignEconomics & CampaignPurchaseLedger = {
  revenue: 0,
  energyCost: 0,
  automationCost: 0,
  wasteCost: 0,
  maintenanceCost: 0,
  demurrageCost: 0,
  latePenalties: 0,
  grainCost: 0,
  partsCost: 0,
  stockHeld: 0,
};

const ZERO_SHIFT_METRICS: ShiftCampaignMetrics = {
  ...ZERO_ECONOMICS,
  dispatchedKg: 0,
  qualityFailureKg: 0,
  incidentsResolved: 0,
  automaticActions: 0,
  commitmentMinutes: 0,
};

const EMPTY_DISPATCH_LOAD: DispatchLoadSnapshot = {
  cycleId: 'shipping-0',
  status: 'away',
  loadedKg: 0,
  capacityKg: 5000,
  materialType: 'flour',
  blockReason: null,
  blockCode: null,
  lastDispatchKg: 0,
};

export const MILL_RECIPES: Record<string, MillRecipe> = {
  strong_white: {
    id: 'strong_white',
    get label() {
      return translate(messages, 'recipeStrongWhite');
    },
    finishedMaterial: 'flour',
    sourceMaterial: 'wheat_grain',
    minimumQuality: 95,
  },
  fine_semolina: {
    id: 'fine_semolina',
    get label() {
      return translate(messages, 'recipeFineSemolina');
    },
    finishedMaterial: 'semolina',
    sourceMaterial: 'corn_grain',
    minimumQuality: 90,
  },
  community_flour: {
    id: 'community_flour',
    get label() {
      return translate(messages, 'recipeCommunityFlour');
    },
    finishedMaterial: 'flour',
    sourceMaterial: 'wheat_grain',
    minimumQuality: 92,
  },
};

export const INCIDENT_DEFINITIONS: Record<
  IncidentKind,
  Omit<
    OperationalIncident,
    | 'id'
    | 'phase'
    | 'startedAtMinute'
    | 'acknowledgedAtMinute'
    | 'resolvedAtMinute'
    | 'effectApplied'
  > & { effect: IncidentEffect }
> = {
  bearing_overheat: {
    kind: 'bearing_overheat',
    get title() {
      return translate(messages, 'bearingOverheatTitle');
    },
    get description() {
      return translate(messages, 'bearingOverheatDescription');
    },
    severity: 'high',
    affectedMachineId: 'rm-101',
    effect: {
      productionMultiplier: 0.82,
      energyMultiplier: 1.08,
      qualityPenalty: 0,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 1,
    },
  },
  dust_filter_pressure: {
    kind: 'dust_filter_pressure',
    get title() {
      return translate(messages, 'dustFilterPressureTitle');
    },
    get description() {
      return translate(messages, 'dustFilterPressureDescription');
    },
    severity: 'high',
    affectedMachineId: 'sifter-b',
    effect: {
      productionMultiplier: 0.88,
      energyMultiplier: 1.12,
      qualityPenalty: 3,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 1,
    },
  },
  power_sag: {
    kind: 'power_sag',
    get title() {
      return translate(messages, 'powerSagTitle');
    },
    get description() {
      return translate(messages, 'powerSagDescription');
    },
    severity: 'critical',
    affectedMachineId: null,
    effect: {
      productionMultiplier: 0.45,
      energyMultiplier: 0.7,
      qualityPenalty: 1,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 1,
    },
  },
  delayed_truck: {
    kind: 'delayed_truck',
    get title() {
      return translate(messages, 'delayedTruckTitle');
    },
    get description() {
      return translate(messages, 'delayedTruckDescription');
    },
    severity: 'medium',
    affectedMachineId: null,
    effect: {
      productionMultiplier: 0.92,
      energyMultiplier: 1,
      qualityPenalty: 0,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 1,
    },
  },
  supplier_contamination: {
    kind: 'supplier_contamination',
    get title() {
      return translate(messages, 'supplierContaminationTitle');
    },
    get description() {
      return translate(messages, 'supplierContaminationDescription');
    },
    severity: 'critical',
    affectedMachineId: null,
    effect: {
      productionMultiplier: 0.7,
      energyMultiplier: 1,
      qualityPenalty: 10,
      dispatchBlocked: true,
      vehicleSpeedMultiplier: 1,
    },
  },
  packaging_shortage: {
    kind: 'packaging_shortage',
    get title() {
      return translate(messages, 'packagingShortageTitle');
    },
    get description() {
      return translate(messages, 'packagingShortageDescription');
    },
    severity: 'high',
    affectedMachineId: 'packer-0',
    effect: {
      productionMultiplier: 0.6,
      energyMultiplier: 0.88,
      qualityPenalty: 0,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 1,
    },
  },
  severe_rain: {
    kind: 'severe_rain',
    get title() {
      return translate(messages, 'severeRainTitle');
    },
    get description() {
      return translate(messages, 'severeRainDescription');
    },
    severity: 'high',
    affectedMachineId: null,
    effect: {
      productionMultiplier: 0.9,
      energyMultiplier: 1.06,
      qualityPenalty: 1,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 0.55,
    },
  },
  control_network_degraded: {
    kind: 'control_network_degraded',
    get title() {
      return translate(messages, 'controlNetworkDegradedTitle');
    },
    get description() {
      return translate(messages, 'controlNetworkDegradedDescription');
    },
    severity: 'high',
    affectedMachineId: null,
    effect: {
      productionMultiplier: 0.75,
      energyMultiplier: 1.03,
      qualityPenalty: 4,
      dispatchBlocked: false,
      vehicleSpeedMultiplier: 0.8,
    },
  },
};

/** The live MILL_RECIPES entry an order's recipe id names, or null for an unknown one. */
function liveRecipe(order: CustomerOrder | null | undefined): MillRecipe | null {
  const recipeId = order?.recipe?.id;
  return typeof recipeId === 'string' &&
    Object.prototype.hasOwnProperty.call(MILL_RECIPES, recipeId)
    ? MILL_RECIPES[recipeId]
    : null;
}

/**
 * Orders whose recipe is a copy (JSON or structuredClone froze its label in
 * the language of the save) re-linked to the live entry. The same array when
 * every recipe is already live, so a caller can tell whether anything changed.
 */
function relinkOrderRecipes(orders: CustomerOrder[]): CustomerOrder[] {
  if (orders.every((order) => order?.recipe === (liveRecipe(order) ?? order?.recipe)))
    return orders;
  return orders.map((order) => {
    const live = liveRecipe(order);
    return live && order.recipe !== live ? { ...order, recipe: live } : order;
  });
}

/*
 * Whether packed stock covers an order's remainder: to within a kilogram, but
 * never with nothing packed. A truck that catches up with released stock
 * leaves with what it has, so an order can owe a part kilogram; with nothing
 * packed for it the line must make it, or the line moves on, the truck waits
 * for product nobody makes and the card calls the rest packed.
 * Working if a 0.5 kg remainder with no stock keeps the line on its order.
 */
function remainderPacked(remainingKg: number, packedKg: number): boolean {
  return remainingKg <= EPSILON_KG || (packedKg > EPSILON_KG && packedKg >= remainingKg - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function appendBounded<T>(values: readonly T[], value: T, limit: number): T[] {
  return [...values.slice(-(limit - 1)), value];
}

/*
 * The incident list is bounded, but an open incident is live state: its
 * effect, the card's next step and its owner's recovery (a challenge, the
 * Chronicle) all read it. The oldest resolved incident goes first; the oldest
 * open one only when every kept incident is open.
 * Working if an incident mitigated early survives 32 newer ones that resolved.
 */
function appendIncident(
  incidents: readonly OperationalIncident[],
  incident: OperationalIncident
): OperationalIncident[] {
  const next = [...incidents, incident];
  while (next.length > MAX_INCIDENTS) {
    const resolved = next.findIndex((candidate) => candidate.phase === 'resolved');
    next.splice(resolved === -1 ? 0 : resolved, 1);
  }
  return next;
}

/**
 * Whether the truck at the dock holds a load of this order's product, is
 * about to leave with it (loading or ready), and no other open order of that
 * product (`otherTaker`) would take it. Forfeited then, nothing of the
 * product would be owed when the truck leaves, and the truck would carry that
 * flour off ungraded with no order to pay for it while its grain is still
 * debited (review 2, finding 7). So the forfeit waits for the truck to leave,
 * about 15 game minutes from docking (DOCK_PROJECTION): the load is delivered
 * to the order at its late terms, and only what it still lacks is forfeited.
 * Delivering late always costs less than the forfeit (D-110), the flour is
 * already aboard, and returned to stock it would wait for an order that may
 * never take it. A truck held at the dock (a quality hold, waiting for stock)
 * does not hold the forfeit: the bound stays a way out.
 *
 * The wait is bounded by the dock's own turn: a docked truck leaves before the
 * next one is due (DOCK_PROJECTION.cycleMinutes, 81 game minutes from one
 * departure to the next), so one still at the dock a whole cycle past the
 * order's bound is held by something else (a stop, a drill), and the order is
 * forfeited then. Its load then returns to stock at departure rather than
 * leave unpaid (UnifiedGameTick, the departure).
 */
export function truckLoadingFor(
  order: Pick<CustomerOrder, 'recipe' | 'dueAtMinute'>,
  load: Pick<DispatchLoadSnapshot, 'status' | 'loadedKg' | 'materialType'> | undefined,
  docked: boolean,
  otherTaker: boolean,
  minute: number
): boolean {
  return (
    minute < order.dueAtMinute + FORFEIT_LATENESS_MINUTES + DOCK_PROJECTION.cycleMinutes &&
    docked &&
    !otherTaker &&
    !!load &&
    (load.status === 'loading' || load.status === 'ready') &&
    load.loadedKg > EPSILON_KG &&
    load.materialType === order.recipe.finishedMaterial
  );
}

/**
 * An open order forfeited now: closed unfulfilled ('cancelled') with when, why
 * and its fee (FORFEIT_FEE_HOURS of its late rate on what it lacked), and the
 * record's wording. Pure; the caller books the fee and writes the line.
 */
function forfeitOrderAt(
  order: CustomerOrder,
  minute: number,
  best: CampaignTickContext['bestReachableQuality']
): { order: CustomerOrder; fee: number; wording: LogWording } {
  const lackingKg = Math.max(0, order.requiredKg - order.shippedKg);
  const fee = Math.round(lackingKg * order.latePenaltyPerKgHour * FORFEIT_FEE_HOURS * 100) / 100;
  const figure = best?.[order.recipe.sourceMaterial];
  const reason = orderReachable(order, best) ? 'late' : 'unreachable';
  return {
    fee,
    wording: {
      key: 'logOrderForfeited',
      customer: order.customer,
      minutes: minute - order.dueAtMinute,
      shippedKg: order.shippedKg,
      requiredKg: order.requiredKg,
      minimum: order.recipe.minimumQuality,
      best: reason === 'unreachable' && figure !== undefined ? figure : null,
      fee,
    },
    order: {
      ...order,
      status: 'cancelled',
      forfeitedAtMinute: minute,
      forfeitReason: reason,
      ...(figure !== undefined && Number.isFinite(figure) ? { forfeitBestQuality: figure } : {}),
      forfeitFee: fee,
    },
  };
}

function forfeitLogEntry(
  sequence: number,
  minute: number,
  orderId: string,
  wording: LogWording,
  actor?: CampaignActor
): CampaignLogEntry {
  return {
    id: `log-${String(sequence).padStart(4, '0')}`,
    simulationMinute: minute,
    source: translate(messages, 'sourceOrderScheduler'),
    category: 'operation',
    message: logWordingText(wording) ?? '',
    relatedId: orderId,
    ...(actor ? { actor } : {}),
    wording,
    sourceKey: 'sourceOrderScheduler',
  };
}

function priorityRank(priority: CustomerOrder['priority']): number {
  return priority === 'critical' ? 0 : priority === 'high' ? 1 : 2;
}

/** The tour's guided order: the first commitment of a new campaign. */
export const FIRST_ORDER_ID = 'order-001';

function createInitialOrders(): CustomerOrder[] {
  return [
    {
      id: FIRST_ORDER_ID,
      customer: "Riverside Bakers' Cooperative",
      recipe: MILL_RECIPES.strong_white,
      requiredKg: 6000,
      shippedKg: 0,
      qualityFailureKg: 0,
      dueAtMinute: 240,
      priority: 'critical',
      revenuePerKg: 0.82,
      latePenaltyPerKgHour: 0.035,
      status: 'active',
      batchIds: [],
      manifestIds: [],
      completedAtMinute: null,
    },
    {
      id: 'order-002',
      customer: 'Community Pasta Works',
      recipe: MILL_RECIPES.fine_semolina,
      requiredKg: 4000,
      shippedKg: 0,
      qualityFailureKg: 0,
      dueAtMinute: 360,
      priority: 'high',
      revenuePerKg: 0.94,
      latePenaltyPerKgHour: 0.03,
      status: 'planned',
      batchIds: [],
      manifestIds: [],
      completedAtMinute: null,
    },
    {
      id: 'order-003',
      customer: 'County School Meals',
      recipe: MILL_RECIPES.community_flour,
      requiredKg: 8000,
      shippedKg: 0,
      qualityFailureKg: 0,
      dueAtMinute: 480,
      priority: 'normal',
      revenuePerKg: 0.68,
      latePenaltyPerKgHour: 0.02,
      status: 'planned',
      batchIds: [],
      manifestIds: [],
      completedAtMinute: null,
    },
  ];
}

function createInitialExecution(): OrderExecutionState {
  return {
    orderId: 'order-001',
    recipeId: 'strong_white',
    sourceMaterial: 'wheat_grain',
    finishedMaterial: 'flour',
    stage: 'planning',
    lineSetpointPercent: 100,
    remainingKg: 6000,
    sourceInventoryKg: 0,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    qualityReleased: true,
    dispatchLoad: { ...EMPTY_DISPATCH_LOAD },
    lineOrderId: null,
    lineCustomer: null,
  };
}

function createInitialUtilityTelemetry(): UtilityAssetTelemetry[] {
  return UTILITY_ASSET_DEFINITIONS.map((asset) => ({
    id: asset.id,
    label: asset.label,
    contents: asset.contents,
    capacityLitres: asset.capacityLitres,
    levelPercent: asset.nominalLevelPercent,
    temperatureC: asset.nominalTemperatureC,
    pressureBar: asset.nominalPressureBar,
    status: 'normal',
  }));
}

function emptyState() {
  return {
    initialized: false,
    activeChallenge: null as OperationsChallengeRun | null,
    challengeHistory: [] as OperationsChallengeRun[],
    creditedBatchKg: {} as Record<string, number>,
    lastMaterialSessionId: null as string | null,
    elapsedMinutes: 0,
    orders: createInitialOrders(),
    activeOrderId: 'order-001' as string | null,
    incidents: [] as OperationalIncident[],
    economics: { ...ZERO_ECONOMICS },
    shiftMetrics: { ...ZERO_SHIFT_METRICS },
    costRates: ZERO_COST_RATES,
    reports: [] as ShiftCampaignReport[],
    logbook: [] as CampaignLogEntry[],
    constraints: [] as CampaignConstraint[],
    execution: createInitialExecution(),
    utilityAssets: createInitialUtilityTelemetry(),
    processedManifestIds: [] as string[],
    lastWasteKg: 0,
    currentShiftKey: null as string | null,
    currentShiftLabel: 'Morning',
    shiftStartedAtMinute: 0,
    sequence: 0,
    programmeCount: 0,
  };
}

function deriveLineSetpoint(
  order: CustomerOrder,
  elapsedMinutes: number,
  sourceKg: number
): number {
  if (sourceKg <= EPSILON_KG) return 0;
  const remainingMinutes = order.dueAtMinute - elapsedMinutes;
  const base = order.priority === 'critical' ? 100 : order.priority === 'high' ? 92 : 84;
  const urgency =
    remainingMinutes <= 0 ? 8 : remainingMinutes <= 90 ? 5 : remainingMinutes <= 180 ? 2 : 0;
  return clamp(base + urgency, 0, 108);
}

function deriveExecution(
  order: CustomerOrder | undefined,
  elapsedMinutes: number,
  context: CampaignTickContext
): OrderExecutionState {
  if (!order) {
    return {
      ...createInitialExecution(),
      orderId: null,
      recipeId: null,
      sourceMaterial: null,
      finishedMaterial: null,
      stage: 'fulfilled',
      lineSetpointPercent: STOCK_BUILD_SETPOINT_PERCENT,
      remainingKg: 0,
      qualityReleased: context.dispatchReleased,
      dispatchLoad: { ...context.dispatchLoad },
    };
  }
  const remainingKg = Math.max(0, order.requiredKg - order.shippedKg);
  const packed =
    remainingKg > EPSILON_KG && remainderPacked(remainingKg, context.finishedAvailableKg);
  const lineOrderId = context.lineOrderId ?? order.id;
  // An empty cycle carries no product; the tick gives it the live recipe's.
  const ownLoad =
    context.dispatchLoad.materialType === order.recipe.finishedMaterial ||
    context.dispatchLoad.loadedKg <= EPSILON_KG;
  let stage: FulfillmentStage = 'milling';
  if (order.status === 'fulfilled' || remainingKg <= EPSILON_KG) stage = 'fulfilled';
  else if (context.routeUnread) stage = 'planning';
  // A load of another product is not this order's: the departure that
  // fulfilled the previous order (its record stays until the next truck
  // docks), or a truck still loading the product the player switched away
  // from. Working if the next order on another product reads as milling.
  else if (
    ownLoad &&
    context.dispatchLoad.status === 'departed' &&
    context.dispatchLoad.lastDispatchKg > 0
  )
    stage = 'dispatched';
  else if (ownLoad && context.dispatchLoad.status === 'ready') stage = 'ready_to_dispatch';
  else if (ownLoad && context.dispatchLoad.status === 'loading') stage = 'loading';
  else if (!context.dispatchReleased) stage = 'quality_hold';
  else if (context.releasedFinishedKg > EPSILON_KG) stage = 'ready_to_load';
  return {
    orderId: order.id,
    recipeId: order.recipe.id,
    sourceMaterial: order.recipe.sourceMaterial,
    finishedMaterial: order.recipe.finishedMaterial,
    stage,
    lineSetpointPercent: deriveLineSetpoint(
      order,
      elapsedMinutes,
      packed && lineOrderId !== order.id ? Infinity : context.sourceInventoryKg
    ),
    remainingKg,
    sourceInventoryKg: context.sourceInventoryKg,
    finishedAvailableKg: context.finishedAvailableKg,
    releasedFinishedKg: context.releasedFinishedKg,
    qualityReleased: context.dispatchReleased,
    dispatchLoad: { ...context.dispatchLoad },
    lineOrderId,
    lineCustomer: lineOrderId !== order.id ? (context.lineCustomer ?? null) : null,
  };
}

/** Grain name in running copy; English keeps the id with spaces ("wheat grain"). */
function sourceMaterialName(material: string): string {
  if (material === 'wheat_grain') return translate(messages, 'materialWheatGrain');
  if (material === 'corn_grain') return translate(messages, 'materialCornGrain');
  return material.replaceAll('_', ' ');
}

function executionWording(execution: OrderExecutionState): ExecutionWording {
  switch (execution.stage) {
    case 'planning':
      return { key: 'execPlanning' };
    case 'milling':
      // Working if a line held by the feed budget never claims to be processing.
      if (
        execution.remainingKg > 0 &&
        remainderPacked(execution.remainingKg, execution.finishedAvailableKg)
      )
        return execution.lineCustomer
          ? { key: 'execPackedPrestaging', customer: execution.lineCustomer }
          : { key: 'execPackedResting' };
      return { key: 'execProcessing', material: execution.sourceMaterial ?? null };
    case 'quality_hold': {
      const { blockCode, blockReason, materialType } = execution.dispatchLoad;
      // A coded reason is worded from its code; only an uncoded one keeps its text.
      return {
        key: 'execQualityHold',
        load: {
          blockCode: blockCode ?? null,
          blockReason: blockCode ? null : blockReason,
          materialType,
        },
      };
    }
    case 'ready_to_load':
      return { key: 'execReadyToLoad' };
    case 'loading':
      return {
        key: 'execLoading',
        loaded: Math.round(execution.dispatchLoad.loadedKg),
        capacity: Math.round(execution.dispatchLoad.capacityKg),
      };
    case 'ready_to_dispatch':
      return { key: 'execReadyToDispatch' };
    case 'dispatched':
      return { key: 'execDispatched', kg: Math.round(execution.dispatchLoad.lastDispatchKg) };
    case 'fulfilled':
      return { key: execution.orderId === null ? 'execAllFulfilled' : 'execFulfilled' };
  }
}

/** A logbook line's text in the language active now; null when this build cannot word it. */
export function logWordingText(wording: LogWording | null | undefined): string | null {
  if (!wording || typeof wording !== 'object') return null;
  try {
    switch (wording.key) {
      case 'logProgrammeInitialized':
      case 'logChallengeAbandoned':
      case 'execPlanning':
      case 'execPackedResting':
      case 'execReadyToLoad':
      case 'execReadyToDispatch':
      case 'execAllFulfilled':
      case 'execFulfilled':
        return translate(messages, wording.key);
      case 'logOrderActivated': {
        if (!Object.prototype.hasOwnProperty.call(MILL_RECIPES, wording.recipeId)) return null;
        return translate(messages, 'logOrderActivated', {
          customer: customerDisplayName(wording.customer),
          recipe: MILL_RECIPES[wording.recipeId].label,
        });
      }
      case 'incidentRaised':
      case 'logIncidentAcknowledged':
      case 'logIncidentMitigated':
      case 'logIncidentResolved': {
        if (!Object.prototype.hasOwnProperty.call(INCIDENT_DEFINITIONS, wording.kind)) return null;
        const title = incidentTitle({ kind: wording.kind, title: '' });
        return wording.key === 'incidentRaised'
          ? title
          : translate(messages, wording.key, { title });
      }
      case 'logChallengeStarted':
      case 'logChallengeCompleted':
      case 'logChallengeFailed':
        if (!OPERATIONS_CHALLENGES.some((challenge) => challenge.id === wording.challengeId))
          return null;
        return translate(messages, wording.key, {
          label: challengeLabel(wording.challengeId),
        });
      case 'logProgrammeAccepted':
        return translate(messages, 'logProgrammeAccepted', {
          number: formatFixed(wording.number, 0),
          customer: customerDisplayName(wording.customer),
          rushKg: formatGrouped(wording.rushKg),
          totalKg: formatGrouped(wording.totalKg),
        });
      case 'logManifestAllocated':
        return translate(messages, 'logManifestAllocated', {
          manifest: wording.manifest,
          kg: formatGrouped(wording.kg, { maximumFractionDigits: 1 }),
        });
      case 'logOrderForfeited': {
        const params = {
          customer: customerDisplayName(wording.customer),
          minutes: formatFixed(Math.max(0, Math.round(wording.minutes)), 0),
          shipped: formatGrouped(Math.round(wording.shippedKg)),
          required: formatGrouped(Math.round(wording.requiredKg)),
          minimum: formatFixed(wording.minimum, 0),
          fee: formatFixed(wording.fee, 2),
        };
        return wording.best !== null && Number.isFinite(wording.best)
          ? translate(messages, 'logOrderForfeitedUnreachable', {
              ...params,
              best: formatFixed(wording.best, 1),
            })
          : translate(messages, 'logOrderForfeited', params);
      }
      case 'logSetpointWritten': {
        const number = formatGrouped(wording.value, { maximumFractionDigits: 1 });
        return translate(messages, 'logSetpointWritten', {
          tag: (wording.tagId && getTagById(wording.tagId)?.name) || wording.tag,
          reading: wording.engUnit ? `${number} ${wording.engUnit}` : number,
        });
      }
      case 'operatorAction':
        return operatorActionText(wording.action);
      case 'proposalRecord':
        return proposalRecordText(wording.record, getLocale());
      case 'execPackedPrestaging':
        return translate(messages, 'execPackedPrestaging', {
          customer: customerDisplayName(wording.customer),
        });
      case 'execProcessing':
        return translate(messages, 'execProcessing', {
          material:
            wording.material != null
              ? sourceMaterialName(wording.material)
              : translate(messages, 'materialScheduledGrain'),
        });
      case 'execQualityHold':
        return dispatchBlockText(wording.load) ?? translate(messages, 'execQualityHold');
      case 'execLoading':
        return translate(messages, 'execLoading', {
          // Grouped in every language: English read "5000 kg" beside "1,200".
          loaded: formatGrouped(wording.loaded),
          capacity: formatGrouped(wording.capacity),
        });
      case 'execDispatched':
        return translate(messages, 'execDispatched', { kg: formatGrouped(wording.kg) });
      default:
        return null;
    }
  } catch {
    // A record from another build whose parameters this one cannot read keeps its text.
    return null;
  }
}

/** A logbook entry (or review line) worded again in the language active now. */
function rewordLine<T extends { message: string; wording?: LogWording }>(line: T): T {
  const message = logWordingText(line.wording);
  return message === null || message === line.message ? line : { ...line, message };
}

function rewordLogbook(logbook: CampaignLogEntry[]): CampaignLogEntry[] {
  if (!Array.isArray(logbook)) return logbook;
  let changed = false;
  const next = logbook.map((entry) => {
    if (!entry || (!entry.wording && !entry.sourceKey)) return entry;
    let worded = rewordLine(entry);
    if (entry.sourceKey && Object.prototype.hasOwnProperty.call(messages.en, entry.sourceKey)) {
      const source = translate(messages, entry.sourceKey);
      if (source !== worded.source) worded = { ...worded, source };
    }
    if (worded !== entry) changed = true;
    return worded;
  });
  return changed ? next : logbook;
}

function rewordReports(reports: ShiftCampaignReport[]): ShiftCampaignReport[] {
  if (!Array.isArray(reports)) return reports;
  let changed = false;
  const next = reports.map((report) => {
    if (!report) return report;
    const choices = Array.isArray(report.choices) ? report.choices.map(rewordLine) : undefined;
    const choicesChanged = !!choices && choices.some((choice, i) => choice !== report.choices![i]);
    const narration =
      Array.isArray(report.narration) && Array.isArray(report.narrationWording)
        ? report.narration.map((line, i) => logWordingText(report.narrationWording![i]) ?? line)
        : undefined;
    const narrationChanged =
      !!narration && narration.some((line, i) => line !== report.narration![i]);
    if (!choicesChanged && !narrationChanged) return report;
    changed = true;
    return {
      ...report,
      ...(choicesChanged
        ? {
            choices,
            // From v3, decisions are the choices' messages.
            ...(report.decisions ? { decisions: choices!.map((choice) => choice.message) } : {}),
          }
        : {}),
      ...(narrationChanged ? { narration } : {}),
    };
  });
  return changed ? next : reports;
}

function combinedIncidentEffect(incidents: ReadonlyArray<OperationalIncident>): IncidentEffect {
  const effect: IncidentEffect = {
    productionMultiplier: 1,
    energyMultiplier: 1,
    qualityPenalty: 0,
    dispatchBlocked: false,
    vehicleSpeedMultiplier: 1,
  };
  for (const incident of incidents) {
    if (incident.phase === 'resolved') continue;
    const definition = INCIDENT_DEFINITIONS[incident.kind].effect;
    const scale = incident.phase === 'mitigated' ? 0.5 : 1;
    // Met with an answer (plan item 3.5), each part takes that answer's share.
    const shares =
      incident.phase === 'mitigated'
        ? incidentResponse(incident.kind, incident.response)?.shares
        : null;
    effect.productionMultiplier *=
      1 - (1 - definition.productionMultiplier) * (shares?.production ?? scale);
    effect.energyMultiplier *= 1 + (definition.energyMultiplier - 1) * (shares?.energy ?? scale);
    effect.qualityPenalty += definition.qualityPenalty * (shares?.quality ?? scale);
    effect.dispatchBlocked ||= shares
      ? definition.dispatchBlocked && shares.dispatch > 0
      : definition.dispatchBlocked && incident.phase !== 'mitigated';
    effect.vehicleSpeedMultiplier *=
      1 - (1 - definition.vehicleSpeedMultiplier) * (shares?.vehicle ?? scale);
  }
  return {
    productionMultiplier: clamp(effect.productionMultiplier, 0.2, 1),
    energyMultiplier: clamp(effect.energyMultiplier, 0.5, 1.5),
    qualityPenalty: clamp(effect.qualityPenalty, 0, 30),
    dispatchBlocked: effect.dispatchBlocked,
    vehicleSpeedMultiplier: clamp(effect.vehicleSpeedMultiplier, 0.25, 1),
  };
}

/** A constraint's detail in the language active now. */
function constraintDetail(wording: ConstraintWording): string {
  switch (wording.key) {
    case 'constraintStorageDetail':
      return translate(messages, wording.key, { percent: formatFixed(wording.percent, 0) });
    case 'constraintFeedDetail':
      return translate(messages, wording.key, { material: sourceMaterialName(wording.material) });
    case 'constraintOverdueDetail':
    case 'constraintDueSoonDetail':
      return translate(messages, wording.key, {
        customer: customerDisplayName(wording.customer),
        count: wording.minutes,
        minutes: formatFixed(wording.minutes, 0),
      });
    case 'constraintDispatchDetail':
      return translate(messages, wording.key);
    case 'constraintMachineDownDetail':
      return translate(messages, wording.key, {
        machine: wording.machine,
        workOrderId: wording.workOrderId,
        others: wording.others,
        othersText: formatFixed(wording.others, 0),
      });
    case 'constraintMaintenanceDetail':
      return translate(messages, wording.key, {
        count: wording.count,
        countText: formatFixed(wording.count, 0),
      });
  }
}

const worded = (
  labelKey: ConstraintLabelKey,
  wording: ConstraintWording
): Pick<CampaignConstraint, 'label' | 'labelKey' | 'detail' | 'wording'> => ({
  label: translate(messages, labelKey),
  labelKey,
  detail: constraintDetail(wording),
  wording,
});

/*
 * Constraints a tick did not write (a reload's JSON record, a replay's clone)
 * keep the language they were saved in, and no tick runs while the shift is
 * held. Each one the tick wrote carries its label key and wording, so it is
 * worded again in the language active now. The same array when nothing reads
 * differently, so a subscriber writing the result back settles at once.
 * Working if a reload or a language switch before the first tick reads in the
 * active language, and a set saved before wording existed is left as saved.
 */
function rewordConstraints(constraints: CampaignConstraint[]): CampaignConstraint[] {
  if (!Array.isArray(constraints)) return constraints;
  let changed = false;
  const next = constraints.map((constraint) => {
    if (!constraint?.labelKey || !constraint.wording) return constraint;
    const label = translate(messages, constraint.labelKey);
    const detail = constraintDetail(constraint.wording);
    if (label === constraint.label && detail === constraint.detail) return constraint;
    changed = true;
    return { ...constraint, label, detail };
  });
  return changed ? next : constraints;
}

/*
 * No tick runs while the shift is paused, but mitigating or resolving the
 * incident that isolates dispatch lifts the isolation at once. The constraint
 * the last tick wrote goes with it; every other one stands until the next tick.
 * Working if a paused card stops reading "Blocked: Dispatch isolated" the
 * moment the contamination is mitigated.
 */
function constraintsAfterIncidents(
  constraints: CampaignConstraint[],
  incidents: ReadonlyArray<OperationalIncident>
): CampaignConstraint[] {
  if (
    !constraints.some((constraint) => constraint.id === 'dispatch-isolated') ||
    combinedIncidentEffect(incidents).dispatchBlocked
  )
    return constraints;
  return constraints.filter((constraint) => constraint.id !== 'dispatch-isolated');
}

const QUALITY_BLOCK_CODES = {
  certification_expired: 'certificationExpired',
  unresolved_contamination: 'unresolvedContamination',
  failed_quality_test: 'failedQualityTest',
} as const satisfies Record<DispatchQualityHoldReason, DispatchQualityBlockCode>;

const QUALITY_HOLD_CODES: ReadonlySet<DispatchBlockCode> = new Set<DispatchQualityBlockCode>([
  ...Object.values(QUALITY_BLOCK_CODES),
  'incidentDispatchIsolation',
  'qualityInterlockNotReleased',
]);

/*
 * The execution the last tick wrote holds dispatch, and prices the docked
 * truck, on a quality reason, and no tick runs while the shift is paused. When
 * the hold changes outside a tick (the isolating incident mitigated or
 * resolved, an alert closed or a batch recalled in the QC lab) the execution
 * holds on what the next tick will read: the laboratory's own interlock, in
 * UnifiedGameTick's order of reasons, or nothing; the demurrage rate follows
 * the tick's formula. A stage it moves is narrated as the tick narrates one,
 * or the next tick, finding the stage already moved, would leave it out.
 * Only a lift is followed; a hold placed while paused waits for the tick.
 * The same execution, and rates, when nothing reads differently.
 * Working if a paused card stops reading "Review the quality hold" for a hold
 * just cleared, and names the QC hold that still stands instead.
 */
function withLiveQualityHold(
  state: Pick<OperationsCampaignState, 'execution' | 'costRates' | 'elapsedMinutes'>,
  sequence: number,
  logbook: CampaignLogEntry[]
): Pick<OperationsCampaignState, 'execution' | 'costRates' | 'sequence' | 'logbook'> {
  const { execution, costRates } = state;
  const quality = getDispatchQualityStatus(
    useQCLabStore.getState().qcLab,
    useMaterialFlowStore.getState().productionBatches
  );
  const blockCode: DispatchQualityBlockCode | null = quality.reason
    ? QUALITY_BLOCK_CODES[quality.reason]
    : quality.released
      ? null
      : 'qualityInterlockNotReleased';
  const load = execution.dispatchLoad;
  const dispatchLoad =
    load.blockCode && QUALITY_HOLD_CODES.has(load.blockCode) && load.blockCode !== blockCode
      ? {
          ...load,
          blockCode,
          blockReason: blockCode ? translate(unifiedGameTickMessages, blockCode) : null,
        }
      : load;
  const released = !blockCode;
  const stage: FulfillmentStage =
    execution.stage === 'quality_hold' && released
      ? execution.releasedFinishedKg > EPSILON_KG
        ? 'ready_to_load'
        : 'milling'
      : execution.stage;
  const demurrage =
    useTruckScheduleStore.getState().truckSchedule.shipping.truckDocked && !released
      ? DEMURRAGE_COST_PER_HOUR
      : 0;
  const next: OrderExecutionState =
    released === execution.qualityReleased && stage === execution.stage && dispatchLoad === load
      ? execution
      : { ...execution, qualityReleased: released, stage, dispatchLoad };
  if (stage !== execution.stage) {
    sequence += 1;
    const wording = executionWording(next);
    logbook = appendBounded(
      logbook,
      {
        id: `log-${String(sequence).padStart(4, '0')}`,
        simulationMinute: state.elapsedMinutes,
        source: translate(messages, 'sourceProductionExecution'),
        category: 'operation',
        message: logWordingText(wording) ?? '',
        relatedId: next.orderId,
        wording,
        sourceKey: 'sourceProductionExecution',
      },
      MAX_LOG_ENTRIES
    );
  }
  return {
    execution: next,
    costRates: demurrage === costRates.demurrage ? costRates : { ...costRates, demurrage },
    sequence,
    logbook,
  };
}

/** What lifting a dispatch-isolating incident changes beyond the incident itself. */
function afterIncidentsChanged(
  state: Pick<
    OperationsCampaignState,
    'constraints' | 'execution' | 'costRates' | 'incidents' | 'elapsedMinutes'
  >,
  incidents: ReadonlyArray<OperationalIncident>,
  sequence: number,
  logbook: CampaignLogEntry[]
): Pick<
  OperationsCampaignState,
  'constraints' | 'execution' | 'costRates' | 'sequence' | 'logbook'
> {
  const constraints = constraintsAfterIncidents(state.constraints, incidents);
  if (
    !combinedIncidentEffect(state.incidents).dispatchBlocked ||
    combinedIncidentEffect(incidents).dispatchBlocked
  )
    return {
      constraints,
      execution: state.execution,
      costRates: state.costRates,
      sequence,
      logbook,
    };
  return { constraints, ...withLiveQualityHold(state, sequence, logbook) };
}

function makeConstraints(
  state: Pick<OperationsCampaignState, 'orders' | 'activeOrderId' | 'incidents' | 'elapsedMinutes'>,
  context: CampaignTickContext,
  incidentEffect: IncidentEffect
): CampaignConstraint[] {
  const constraints: CampaignConstraint[] = [];
  if (context.storageUtilization >= 0.85) {
    constraints.push({
      id: 'storage-high',
      severity: context.storageUtilization >= 0.95 ? 'critical' : 'warning',
      ...worded('constraintStorageLabel', {
        key: 'constraintStorageDetail',
        percent: Math.round(context.storageUtilization * 100),
      }),
      relatedId: null,
    });
  }
  const activeOrder = state.orders.find((order) => order.id === state.activeOrderId);
  // An empty route stops nothing once the dispatch order's remainder is packed
  // (deriveExecution's test), unless the line pre-stages an order on that same
  // grain. sourceInventoryKg is the dispatch order's grain only.
  // Working if the card never reads Blocked beside "packed, waiting".
  const activeRemainingKg = activeOrder
    ? Math.max(0, activeOrder.requiredKg - activeOrder.shippedKg)
    : 0;
  const lineOrder = state.orders.find((order) => order.id === context.lineOrderId);
  const feedNeeded =
    !!activeOrder &&
    (activeRemainingKg <= EPSILON_KG ||
      !remainderPacked(activeRemainingKg, context.finishedAvailableKg) ||
      (!!lineOrder &&
        lineOrder.id !== activeOrder.id &&
        lineOrder.recipe.sourceMaterial === activeOrder.recipe.sourceMaterial));
  if (
    activeOrder &&
    feedNeeded &&
    !context.routeUnread &&
    context.sourceInventoryKg <= EPSILON_KG
  ) {
    constraints.push({
      id: `recipe-feed-${activeOrder.id}`,
      severity: 'critical',
      ...worded('constraintFeedLabel', {
        key: 'constraintFeedDetail',
        material: activeOrder.recipe.sourceMaterial,
      }),
      relatedId: activeOrder.id,
    });
  }
  const nextOrder = state.orders
    .filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
    .sort((a, b) => a.dueAtMinute - b.dueAtMinute)[0];
  if (nextOrder) {
    const remainingMinutes = nextOrder.dueAtMinute - state.elapsedMinutes;
    if (remainingMinutes <= 90) {
      const overdue = remainingMinutes <= 0;
      constraints.push({
        id: `order-due-${nextOrder.id}`,
        severity: overdue ? 'critical' : 'warning',
        ...worded(overdue ? 'constraintOverdueLabel' : 'constraintDueSoonLabel', {
          key: overdue ? 'constraintOverdueDetail' : 'constraintDueSoonDetail',
          customer: nextOrder.customer,
          minutes: overdue
            ? Math.max(1, Math.ceil(-remainingMinutes))
            : Math.ceil(remainingMinutes),
        }),
        relatedId: nextOrder.id,
      });
    }
  }
  if (incidentEffect.dispatchBlocked) {
    constraints.push({
      id: 'dispatch-isolated',
      severity: 'critical',
      ...worded('constraintDispatchLabel', { key: 'constraintDispatchDetail' }),
      relatedId:
        state.incidents.find(
          (incident) =>
            incident.phase !== 'resolved' &&
            incident.phase !== 'mitigated' &&
            INCIDENT_DEFINITIONS[incident.kind].effect.dispatchBlocked
        )?.id ?? null,
    });
  }
  // An open work order is a stopped machine: every phase short of
  // returned_to_service keeps it locked out. It reads as Attention, never as a
  // background note the shift card drops. Working if the card names the machine
  // and the repair becomes the next action.
  if (context.openWorkOrders > 0) {
    const order = context.openWorkOrder;
    constraints.push({
      id: 'maintenance-queue',
      severity: 'warning',
      ...worded(
        'constraintMaintenanceLabel',
        order
          ? {
              key: 'constraintMachineDownDetail',
              machine: order.machineName,
              workOrderId: order.id,
              others: context.openWorkOrders - 1,
            }
          : { key: 'constraintMaintenanceDetail', count: context.openWorkOrders }
      ),
      relatedId: order?.machineId ?? null,
    });
  }
  return constraints;
}

/*
 * Constraints are live state worded when a tick computes them, and no tick
 * runs while the clock is held. The last tick's inputs are kept so a language
 * switch can word the same constraints again; a set the tick did not write (a
 * restore, a reset) is left alone.
 * Working if a paused shift card follows a language switch at once.
 */
let lastConstraintSource: {
  input: Parameters<typeof makeConstraints>[0];
  context: CampaignTickContext;
  effect: IncidentEffect;
  constraints: CampaignConstraint[];
} | null = null;

export interface ShiftReportInput {
  id: string;
  shiftKey: string;
  shiftLabel: string;
  startedAtMinute: number;
  endedAtMinute: number;
  metrics: ShiftCampaignMetrics;
  orders: ReadonlyArray<CustomerOrder>;
  logbook: ReadonlyArray<CampaignLogEntry>;
  /** Labels of the non-info constraints open at close. */
  risks: string[];
  /** Their catalogue keys, by index (CampaignConstraint.labelKey). */
  riskLabelKeys?: (string | null)[];
  /** The customer each overdue risk is about, by index (ShiftGradeBasis.riskSubjects). */
  riskSubjects?: (string | null)[];
  incidents: ReadonlyArray<OperationalIncident>;
  /**
   * The logbook sequence at which this window opened (windowStartSequence).
   * The tick that closes a window writes its dispatch lines at the minute the
   * next one starts, so the minute alone cannot tell the two windows apart.
   * Absent for the first window and for windows opened before the sequence
   * could be read; those use the minute.
   */
  startedAfterSequence?: number;
}

/*
 * The non-info constraints open at close: what a report carries as its risks.
 * The shift card names one due constraint, the earliest-due open order, but
 * the grade counts every order still open past its due time at the close as
 * its own risk, as each late completed order counts in lateDeliveries.
 * Working if two overdue open orders cost two issues in the grade while the
 * card still shows one due line.
 *
 * "Commitment due soon" is a warning on the card, not a carried risk: an order
 * on schedule but due after the close is nothing the shift could have cleared
 * (plan 1.7). Its constraint is the one order-due line that is not critical.
 * Working if an on-schedule order due 30 minutes after the close still allows
 * an A, and an order overdue at the close does not.
 */
const isDueSoon = (constraint: CampaignConstraint) =>
  constraint.id.startsWith('order-due-') && constraint.severity !== 'critical';
function riskEvidence(
  constraints: ReadonlyArray<CampaignConstraint>,
  orders: ReadonlyArray<CustomerOrder> = [],
  atMinute = Number.NEGATIVE_INFINITY
) {
  const open = constraints.filter(
    (constraint) => constraint.severity !== 'info' && !isDueSoon(constraint)
  );
  const named = new Set(
    open
      .filter((constraint) => constraint.id.startsWith('order-due-'))
      .map((constraint) => constraint.relatedId)
  );
  const overdueLabelKey: ConstraintLabelKey = 'constraintOverdueLabel';
  const overdueLabel = translate(messages, overdueLabelKey);
  const overdue = orders.filter(
    (order) =>
      order.status !== 'fulfilled' &&
      order.status !== 'cancelled' &&
      order.dueAtMinute - atMinute <= 0 &&
      !named.has(order.id)
  );
  // Each overdue order is named once, by its customer (shiftRiskLabels), so two
  // read as two orders rather than one label twice.
  const subjectOf = (constraint: CampaignConstraint) =>
    constraint.id.startsWith('order-due-') && constraint.labelKey === overdueLabelKey
      ? (orders.find((order) => order.id === constraint.relatedId)?.customer ?? null)
      : null;
  const riskSubjects = [...open.map(subjectOf), ...overdue.map((order) => order.customer)];
  const labels = [
    ...open.map((constraint) => constraint.label),
    ...overdue.map(() => overdueLabel),
  ];
  return {
    risks: labels.map((label, index) => {
      const subject = riskSubjects[index];
      return subject
        ? translate(messages, 'riskNamed', { label, subject: customerDisplayName(subject) })
        : label;
    }),
    riskLabelKeys: [
      ...open.map((constraint) => constraint.labelKey ?? null),
      ...overdue.map(() => overdueLabelKey),
    ],
    riskSubjects,
  };
}

const LOG_SEQUENCE = /^log-(\d+)$/;
const WINDOW_KEY = /^day-(\d+)-(morning|afternoon|night)$/;
const WINDOW_ORDER = { morning: 0, afternoon: 1, night: 2 } as const;

/**
 * Whether the window keyed `openKey` was cut short by Reset to 10 AM (Settings),
 * which returns the clock to the first window of day 0. No shift boundary ever
 * leads back to it, so a later open window meeting it was reset, not closed.
 * Grading those minutes alone would be a letter for a window that never ran
 * its course, and a reset could farm short, easy grades.
 * Working if a reset adds no report and the window it opened, closing at
 * 14:00, carries the cut-short window's start and evidence.
 */
export function isClockResetWindow(openKey: string, nextKey: string): boolean {
  if (nextKey !== 'day-0-morning') return false;
  const match = WINDOW_KEY.exec(openKey);
  if (!match) return false;
  return Number(match[1]) * 3 + WINDOW_ORDER[match[2] as keyof typeof WINDOW_ORDER] > 0;
}
const REPORT_SEQUENCE = /^period-report-(\d+)$/;

/**
 * The sequence the open window started at, read from the report that closed
 * the window before it: that report's id carries the sequence taken when it
 * was written, after the closing tick's own lines and before any of the next
 * window's. No new saved state, so every save already carries it. Undefined
 * when no report closed at `shiftStartedAtMinute`.
 */
export function windowStartSequence(
  reports: ReadonlyArray<Pick<ShiftCampaignReport, 'id' | 'endedAtMinute'>> | undefined,
  shiftStartedAtMinute: number
): number | undefined {
  const last = reports?.at(-1);
  if (!last || last.endedAtMinute !== shiftStartedAtMinute) return undefined;
  const match = REPORT_SEQUENCE.exec(last.id);
  return match ? Number(match[1]) : undefined;
}

/**
 * One shift report from the evidence the campaign holds. Pure: the closing
 * tick and the live "this shift so far" view both call it.
 */
export function buildShiftReport(input: ShiftReportInput): ShiftCampaignReport {
  const { orders, startedAtMinute } = input;
  // Strictly after the start: only a tick completes an order, at the minute it
  // ends, and the tick that closes a window starts the next one at that same
  // minute. Working if an order fulfilled on a closing tick is reported once.
  const completedHere = (order: CustomerOrder) =>
    order.status === 'fulfilled' &&
    order.completedAtMinute !== null &&
    order.completedAtMinute > startedAtMinute;
  const open = (order: CustomerOrder) =>
    order.status !== 'fulfilled' && order.status !== 'cancelled';
  // Forfeited in this window (plan item 3.7): a missed commitment, counted
  // with the late deliveries and listed with the orders. Read from its log
  // line, by the window's sequence watermark as the choices are: a partner's
  // forfeit lands just after the tick that opened the window, at its very
  // minute. An order whose line has left the logbook goes by the minute.
  const watermarkOf = input.startedAfterSequence;
  const forfeitLines = input.logbook.filter((entry) => entry.wording?.key === 'logOrderForfeited');
  const forfeitedInWindow = new Set(
    forfeitLines
      .filter((entry) => {
        const sequence = LOG_SEQUENCE.exec(entry.id);
        return watermarkOf !== undefined && sequence
          ? Number(sequence[1]) > watermarkOf
          : entry.simulationMinute > startedAtMinute;
      })
      .map((entry) => entry.relatedId)
  );
  const forfeitLogged = new Set(forfeitLines.map((entry) => entry.relatedId));
  const forfeitedHere = (order: CustomerOrder) =>
    order.status === 'cancelled' &&
    order.forfeitedAtMinute !== undefined &&
    (forfeitedInWindow.has(order.id) ||
      (!forfeitLogged.has(order.id) && order.forfeitedAtMinute > startedAtMinute));
  const completed = orders.filter(completedHere);
  const unsafe = input.incidents.filter(
    (incident) =>
      incident.phase !== 'resolved' &&
      (incident.severity === 'high' || incident.severity === 'critical')
  );
  const gradeBasis = shiftGradeBasis(
    input.metrics,
    input.risks,
    unsafe.map((incident) => incidentTitle(incident)),
    completed.filter((order) => order.completedAtMinute! > order.dueAtMinute + 1e-6).length +
      orders.filter(forfeitedHere).length,
    unsafe.map((incident) => ({
      title: incidentTitle(incident),
      detail: incidentDescription(incident),
      phase: incident.phase as ShiftOpenIncident['phase'],
      kind: incident.kind,
    })),
    input.riskLabelKeys,
    // Commitments that could have shipped: due by the close, open or done here.
    orders.filter(
      (order) =>
        (open(order) || completedHere(order) || forfeitedHere(order)) &&
        order.dueAtMinute <= input.endedAtMinute + 1e-6
    ).length,
    input.riskSubjects
  );
  const grade = gradeShift(gradeBasis);
  const locale = getLocale();
  const watermark = input.startedAfterSequence;
  const inWindow = input.logbook.filter((entry) => {
    if (entry.category === 'period') return false;
    const sequence = LOG_SEQUENCE.exec(entry.id);
    return watermark !== undefined && sequence
      ? Number(sequence[1]) > watermark
      : entry.simulationMinute >= startedAtMinute;
  });
  // Every choice in the window is kept up to a generous bound; narration is
  // what the plant did and is only a tail.
  const choices: ShiftChoice[] = inWindow
    .filter((entry) => entry.actor === 'operator' || entry.actor === 'agent')
    .slice(-MAX_REPORT_CHOICES)
    .map((entry) => ({
      minute: entry.simulationMinute,
      actor: entry.actor as ShiftChoice['actor'],
      message: entry.message,
      ...(entry.wording ? { wording: entry.wording } : {}),
    }));
  // The partner's records reach the review through their own field, not
  // the narration's tail, which keeps eight lines of anything the plant said.
  // They stay in the narration and choices too, which the debrief renders.
  const proposals = inWindow
    .flatMap((entry) => (entry.wording?.key === 'proposalRecord' ? [entry.wording.record] : []))
    .slice(-MAX_REPORT_PROPOSALS);
  const narrated = inWindow
    .filter((entry) => (entry.actor ?? 'controller') === 'controller')
    .slice(-8);
  return {
    id: input.id,
    shiftKey: input.shiftKey,
    shiftLabel: input.shiftLabel,
    startedAtMinute,
    endedAtMinute: input.endedAtMinute,
    metrics: { ...input.metrics },
    completedOrderIds: completed.map((order) => order.id),
    orderOutcomes: orders
      .filter((order) => completedHere(order) || open(order) || forfeitedHere(order))
      .map((order) => ({
        id: order.id,
        customer: order.customer,
        requiredKg: order.requiredKg,
        shippedKg: order.shippedKg,
        dueAtMinute: order.dueAtMinute,
        completedAtMinute: completedHere(order) ? order.completedAtMinute : null,
        qualityFailureKg: order.qualityFailureKg,
        ...(forfeitedHere(order)
          ? {
              forfeit: {
                atMinute: order.forfeitedAtMinute!,
                reason: order.forfeitReason ?? ('late' as const),
                minimum: order.recipe.minimumQuality,
                best: order.forfeitBestQuality ?? null,
              },
            }
          : {}),
      })),
    openRisks: [...input.risks],
    grade,
    gradeBasis,
    gradeReasons: shiftGradeReasons(gradeBasis, locale),
    decisions: choices.map((choice) => choice.message),
    choices,
    narration: narrated.map((entry) => entry.message),
    narrationWording: narrated.map((entry) => entry.wording ?? null),
    ...(proposals.length > 0 ? { proposals } : {}),
    summary: shiftHeadline(gradeBasis, grade, locale),
  };
}

export type ProvisionalReportSource = Pick<
  OperationsCampaignState,
  | 'currentShiftKey'
  | 'currentShiftLabel'
  | 'shiftStartedAtMinute'
  | 'elapsedMinutes'
  | 'shiftMetrics'
  | 'orders'
  | 'logbook'
  | 'constraints'
  | 'incidents'
> &
  // Optional so a caller that omits it keeps the minute test (windowStartSequence).
  Partial<Pick<OperationsCampaignState, 'reports'>>;

/**
 * The open window as a report: what "this shift so far" shows before the
 * clock closes it. Its risks are the constraints the last tick computed, the
 * same set a closing report uses. Null before the first tick of a window.
 * Working if the window in which a programme completes can be reviewed at
 * once, with the same grade rules and order lines as a saved report.
 */
export function selectProvisionalShiftReport(
  state: ProvisionalReportSource
): ShiftCampaignReport | null {
  if (!state.currentShiftKey || state.elapsedMinutes <= state.shiftStartedAtMinute) return null;
  return buildShiftReport({
    id: `provisional-${state.currentShiftKey}`,
    shiftKey: state.currentShiftKey,
    shiftLabel: state.currentShiftLabel,
    startedAtMinute: state.shiftStartedAtMinute,
    endedAtMinute: state.elapsedMinutes,
    metrics: state.shiftMetrics,
    orders: state.orders,
    logbook: state.logbook,
    ...riskEvidence(state.constraints, state.orders, state.elapsedMinutes),
    incidents: state.incidents,
    startedAfterSequence: windowStartSequence(state.reports, state.shiftStartedAtMinute),
  });
}

export const useOperationsCampaignStore = create<OperationsCampaignState>()(
  persist(
    (set, get) => ({
      ...emptyState(),

      startChallenge: (id, actor = 'controller') => {
        const state = get();
        const definition = OPERATIONS_CHALLENGES.find((challenge) => challenge.id === id);
        if (!definition || challengeBlockReason(state)) return false;
        const order = state.orders.find((candidate) => candidate.id === state.activeOrderId)!;
        // The challenge is the incident it stands for, raised by the plant: the
        // partner's two answers then meet it as in play (plan item 3.5).
        const incident = state.triggerIncident(definition.kind, { origin: 'plant' });
        if (!incident) return false;
        const material = materialShipmentTotals(state.orders, order.recipe.finishedMaterial);
        set({
          activeChallenge: {
            id: `challenge-${incident.id}`,
            challengeId: id,
            incidentId: incident.id,
            orderId: order.id,
            startedAtMinute: state.elapsedMinutes,
            deadlineMinute: state.elapsedMinutes + RECOVERY_CHALLENGE_WINDOW_MINUTES,
            startingShippedKg: order.shippedKg,
            startingQualityFailureKg: order.qualityFailureKg,
            startingMaterialShippedKg: material.shippedKg,
            startingMaterialQualityFailureKg: material.qualityFailureKg,
            targetKg: Math.min(RECOVERY_CHALLENGE_TARGET_KG, order.requiredKg - order.shippedKg),
            status: 'active',
            endedAtMinute: null,
          },
        });
        get().addLogEntry(
          translate(messages, 'sourceRecoveryChallenge'),
          'operation',
          translate(messages, 'logChallengeStarted', { label: challengeLabel(id) }),
          incident.id,
          actor,
          {
            wording: { key: 'logChallengeStarted', challengeId: id },
            sourceKey: 'sourceRecoveryChallenge',
          }
        );
        return true;
      },
      abandonChallenge: (actor = 'controller') => {
        const state = get();
        if (!state.activeChallenge) return;
        set({
          activeChallenge: null,
          challengeHistory: appendBounded(
            state.challengeHistory,
            {
              ...state.activeChallenge,
              status: 'abandoned',
              endedAtMinute: state.elapsedMinutes,
            },
            8
          ),
        });
        state.addLogEntry(
          translate(messages, 'sourceRecoveryChallenge'),
          'operation',
          translate(messages, 'logChallengeAbandoned'),
          null,
          actor,
          { wording: { key: 'logChallengeAbandoned' }, sourceKey: 'sourceRecoveryChallenge' }
        );
      },
      finishChallengeRecovery: (actor = 'controller') => {
        const state = get();
        const incident = getChallengeRecoveryIncident(state);
        if (!incident || incident.phase !== 'mitigated' || !incident.effectApplied) return false;
        state.resolveIncident(incident.id, actor);
        return true;
      },
      acceptNextProgramme: (actor = 'controller', options = {}) => {
        const state = get();
        const open = state.orders.filter(
          (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
        );
        if (state.activeChallenge) return false;
        // Taken early (plan item 3.7), it joins the running programme: at most
        // one programme open beside it, and the running order keeps the line
        // and the dock until the queue moves on. Otherwise every order is closed.
        const early = options.early === true && open.length > 0;
        if (open.length > 0 && !early) return false;
        if (early && new Set(open.map((order) => programmeOfOrder(order.id))).size > 1)
          return false;
        // Varied by programme number and shift (src/simulation/programmes.ts);
        // ids keep the logbook sequence, so they stay unique across a session.
        const number = state.programmeCount + 2;
        const programme = buildProgramme(
          createInitialOrders(),
          number,
          programmeShift(state.currentShiftKey),
          state.elapsedMinutes,
          `programme-${state.sequence + 1}`
        );
        const lead = programme[0];
        const totalKg = programme.reduce((sum, order) => sum + order.requiredKg, 0);
        set(
          early
            ? {
                // The orders queue behind the one in hand; the tick's
                // activation picks the next by priority and due time as each
                // one closes, and the line and the dock keep what they hold.
                orders: [
                  ...state.orders.slice(-30),
                  ...programme.map((order) => ({ ...order, status: 'planned' as const })),
                ],
                programmeCount: state.programmeCount + 1,
              }
            : {
                orders: [...state.orders.slice(-30), ...programme],
                activeOrderId: lead.id,
                programmeCount: state.programmeCount + 1,
                execution: {
                  ...createInitialExecution(),
                  orderId: lead.id,
                  recipeId: lead.recipe.id,
                  sourceMaterial: lead.recipe.sourceMaterial,
                  finishedMaterial: lead.recipe.finishedMaterial,
                  remainingKg: lead.requiredKg,
                  // Plant readings, not the order's: no tick runs while the
                  // shift is paused, and the card must not drop a quality hold
                  // or a truck half loaded at the dock until one does.
                  qualityReleased: state.execution.qualityReleased,
                  dispatchLoad: { ...state.execution.dispatchLoad },
                },
              }
        );
        state.addLogEntry(
          translate(messages, 'sourceOrderScheduler'),
          'operation',
          translate(messages, 'logProgrammeAccepted', {
            number: formatFixed(number, 0),
            customer: customerDisplayName(lead.customer),
            rushKg: formatGrouped(lead.requiredKg),
            totalKg: formatGrouped(totalKg),
          }),
          null,
          actor,
          {
            wording: {
              key: 'logProgrammeAccepted',
              number,
              customer: lead.customer,
              rushKg: lead.requiredKg,
              totalKg,
            },
            sourceKey: 'sourceOrderScheduler',
          }
        );
        return true;
      },

      forfeitOrder: (orderId, actor = 'controller', best) => {
        const state = get();
        const order = state.orders.find((candidate) => candidate.id === orderId);
        if (!order || order.status === 'fulfilled' || order.status === 'cancelled') return false;
        // Not while a truck at the dock is about to leave with its flour
        // (truckLoadingFor): refused, and the bound forfeits what is left.
        const docked = useTruckScheduleStore.getState().truckSchedule.shipping.truckDocked ?? false;
        const otherTaker = state.orders.some(
          (other) =>
            other.id !== orderId &&
            other.status !== 'fulfilled' &&
            other.status !== 'cancelled' &&
            other.recipe.finishedMaterial === order.recipe.finishedMaterial
        );
        if (
          truckLoadingFor(
            order,
            state.execution.dispatchLoad,
            docked,
            otherTaker,
            state.elapsedMinutes
          )
        )
          return false;
        const forfeit = forfeitOrderAt(order, state.elapsedMinutes, best);
        const sequence = state.sequence + 1;
        const book = <T extends CampaignEconomics>(ledger: T): T => ({
          ...ledger,
          latePenalties: ledger.latePenalties + forfeit.fee,
        });
        set({
          orders: state.orders.map((candidate) =>
            candidate.id === orderId ? forfeit.order : candidate
          ),
          economics: book(state.economics),
          shiftMetrics: book(state.shiftMetrics),
          sequence,
          logbook: appendBounded(
            state.logbook,
            forfeitLogEntry(sequence, state.elapsedMinutes, orderId, forfeit.wording, actor),
            MAX_LOG_ENTRIES
          ),
        });
        return true;
      },

      initializeCampaign: () => {
        if (get().initialized) return;
        set((state) => ({
          initialized: true,
          sequence: state.sequence + 1,
          logbook: appendBounded(
            state.logbook,
            {
              id: `log-${String(state.sequence + 1).padStart(4, '0')}`,
              simulationMinute: state.elapsedMinutes,
              source: translate(messages, 'sourceAutonomousExecution'),
              category: 'operation',
              message: translate(messages, 'logProgrammeInitialized'),
              relatedId: state.activeOrderId,
              wording: { key: 'logProgrammeInitialized' },
              sourceKey: 'sourceAutonomousExecution',
            },
            MAX_LOG_ENTRIES
          ),
        }));
      },

      activateOrder: (orderId, actor = 'controller') =>
        set((state) => {
          const selected = state.orders.find((order) => order.id === orderId);
          if (!selected || selected.status === 'fulfilled' || selected.status === 'cancelled')
            return state;
          // A recovery challenge holds its customer until it ends: the card
          // locks the choice, and an agent command meets the same rule here.
          // Working if a switch during a challenge changes nothing and logs nothing.
          if (state.activeChallenge && state.activeChallenge.orderId !== orderId) return state;
          // Already the order in hand: re-selecting it (an agent command aimed
          // at the current order) would drop a loading truck's stage to
          // planning and log a decision nobody made.
          // Working if it changes nothing and logs nothing.
          if (state.activeOrderId === orderId && state.execution.orderId === orderId) return state;
          const sequence = state.sequence + 1;
          // No tick runs while the clock is held, so the execution would keep
          // the previous order's remainder, packed stock and pre-staged
          // customer, and the HUD would read the new order as packed. Packed
          // stock carries across only for the same product. The grain reading
          // stays until a tick: every reader of it waits out 'planning'.
          // Working if a paused switch shows the chosen order's own remainder.
          const sameProduct = state.execution.finishedMaterial === selected.recipe.finishedMaterial;
          // The empty-feed block names the previous order's grain. On another
          // grain it says nothing about the new order until a tick reads that
          // route; on the same grain the empty reading still holds for it.
          // Working if a paused switch to a corn order does not read Blocked on wheat.
          const feedPrefix = 'recipe-feed-';
          const constraints = state.constraints.some(
            (constraint) => constraint.id.startsWith(feedPrefix) && constraint.relatedId !== orderId
          )
            ? state.constraints.flatMap((constraint) => {
                if (!constraint.id.startsWith(feedPrefix) || constraint.relatedId === orderId)
                  return [constraint];
                const material =
                  constraint.wording?.key === 'constraintFeedDetail'
                    ? constraint.wording.material
                    : null;
                // As makeConstraints: a remainder already packed needs no feed.
                const packed =
                  sameProduct &&
                  remainderPacked(
                    Math.max(0, selected.requiredKg - selected.shippedKg),
                    state.execution.finishedAvailableKg
                  );
                return material === selected.recipe.sourceMaterial && !packed
                  ? [{ ...constraint, id: `${feedPrefix}${orderId}`, relatedId: orderId }]
                  : [];
              })
            : state.constraints;
          return {
            constraints,
            activeOrderId: orderId,
            orders: state.orders.map((order) =>
              order.id === orderId
                ? { ...order, status: 'active' }
                : order.status === 'active'
                  ? { ...order, status: 'planned' }
                  : order
            ),
            execution: {
              ...state.execution,
              orderId,
              recipeId: selected.recipe.id,
              sourceMaterial: selected.recipe.sourceMaterial,
              finishedMaterial: selected.recipe.finishedMaterial,
              stage: 'planning',
              remainingKg: Math.max(0, selected.requiredKg - selected.shippedKg),
              finishedAvailableKg: sameProduct ? state.execution.finishedAvailableKg : 0,
              releasedFinishedKg: sameProduct ? state.execution.releasedFinishedKg : 0,
              lineOrderId: null,
              lineCustomer: null,
            },
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: translate(messages, 'sourceOrderScheduler'),
                category: 'operation',
                message: translate(messages, 'logOrderActivated', {
                  customer: customerDisplayName(selected.customer),
                  recipe: selected.recipe.label,
                }),
                relatedId: selected.id,
                actor,
                wording: {
                  key: 'logOrderActivated',
                  customer: selected.customer,
                  recipeId: selected.recipe.id,
                },
                sourceKey: 'sourceOrderScheduler',
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      triggerIncident: (kind, options = {}) => {
        const state = get();
        if (
          state.incidents.some(
            (incident) => incident.kind === kind && incident.phase !== 'resolved'
          )
        )
          return null;
        const definition = INCIDENT_DEFINITIONS[kind];
        const sequence = state.sequence + 1;
        const incident: OperationalIncident = {
          id: `incident-${String(sequence).padStart(4, '0')}`,
          kind,
          title: definition.title,
          description: definition.description,
          phase: 'raised',
          severity: definition.severity,
          startedAtMinute: state.elapsedMinutes,
          acknowledgedAtMinute: null,
          resolvedAtMinute: null,
          affectedMachineId: options.machineId ?? definition.affectedMachineId,
          effectApplied: false,
          ...(options.origin === 'plant' ? { origin: 'plant' as const } : {}),
        };
        set({
          incidents: appendIncident(state.incidents, incident),
          sequence,
          logbook: appendBounded(
            state.logbook,
            {
              id: `log-${String(sequence).padStart(4, '0')}`,
              simulationMinute: state.elapsedMinutes,
              source: translate(messages, 'sourceIncidentController'),
              category: definition.severity === 'critical' ? 'safety' : 'operation',
              message: definition.title,
              relatedId: incident.id,
              wording: { key: 'incidentRaised', kind },
              sourceKey: 'sourceIncidentController',
            },
            MAX_LOG_ENTRIES
          ),
        });
        return incident;
      },

      acknowledgeIncident: (incidentId, actor = 'controller') =>
        set((state) => {
          const target = state.incidents.find(
            (incident) => incident.id === incidentId && incident.phase === 'raised'
          );
          if (!target) return state;
          const sequence = state.sequence + 1;
          return {
            incidents: state.incidents.map((incident) =>
              incident.id === incidentId
                ? { ...incident, phase: 'acknowledged', acknowledgedAtMinute: state.elapsedMinutes }
                : incident
            ),
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: translate(messages, 'sourceIncidentController'),
                category: 'operation',
                message: translate(messages, 'logIncidentAcknowledged', {
                  title: incidentTitle(target),
                }),
                relatedId: incidentId,
                actor,
                wording: { key: 'logIncidentAcknowledged', kind: target.kind },
                sourceKey: 'sourceIncidentController',
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      mitigateIncident: (incidentId, actor = 'controller') => {
        set((state) => {
          // Only a live incident can be mitigated; an unknown or already
          // settled id is a no-op, not an automatic action.
          const target = state.incidents.find(
            (incident) =>
              incident.id === incidentId &&
              incident.phase !== 'resolved' &&
              incident.phase !== 'mitigated'
          );
          if (!target) return state;
          if (state.activeChallenge?.incidentId === incidentId && target.phase !== 'acknowledged')
            return state;
          const sequence = state.sequence + 1;
          // A plant incident is met with an answer and ends at a stated minute
          // (plan item 3.5); the free Mitigate gives it its kind's first answer.
          const plant = target.origin === 'plant';
          const response =
            incidentResponse(target.kind, target.response)?.id ??
            (plant ? INCIDENT_RESPONSES[target.kind][0].id : undefined);
          const incidents = state.incidents.map(
            (incident): OperationalIncident =>
              incident.id === incidentId
                ? {
                    ...incident,
                    phase: 'mitigated',
                    acknowledgedAtMinute: incident.acknowledgedAtMinute ?? state.elapsedMinutes,
                    ...(response ? { response } : {}),
                    ...(plant
                      ? { endsAtMinute: state.elapsedMinutes + PLANT_INCIDENT_MINUTES }
                      : {}),
                  }
                : incident
          );
          return {
            incidents,
            shiftMetrics: {
              ...state.shiftMetrics,
              automaticActions: state.shiftMetrics.automaticActions + 1,
            },
            ...afterIncidentsChanged(
              state,
              incidents,
              sequence,
              appendBounded(
                state.logbook,
                {
                  id: `log-${String(sequence).padStart(4, '0')}`,
                  simulationMinute: state.elapsedMinutes,
                  source: translate(messages, 'sourceIncidentController'),
                  category: 'operation',
                  message: translate(messages, 'logIncidentMitigated', {
                    title: incidentTitle(target),
                  }),
                  relatedId: incidentId,
                  actor,
                  wording: { key: 'logIncidentMitigated', kind: target.kind },
                  sourceKey: 'sourceIncidentController',
                },
                MAX_LOG_ENTRIES
              )
            ),
          };
        });
        closeSettledIncidentPredictions(get().incidents, incidentId);
      },

      resolveIncident: (incidentId, actor = 'controller') => {
        set((state) => {
          const target = state.incidents.find(
            (incident) => incident.id === incidentId && incident.phase !== 'resolved'
          );
          if (!target) return state;
          if (
            state.activeChallenge?.incidentId === incidentId &&
            (target.phase !== 'mitigated' || !target.effectApplied)
          )
            return state;
          const sequence = state.sequence + 1;
          const incidents = state.incidents.map(
            (incident): OperationalIncident =>
              incident.id === incidentId
                ? { ...incident, phase: 'resolved', resolvedAtMinute: state.elapsedMinutes }
                : incident
          );
          return {
            incidents,
            shiftMetrics: {
              ...state.shiftMetrics,
              incidentsResolved: state.shiftMetrics.incidentsResolved + 1,
              automaticActions: state.shiftMetrics.automaticActions + 1,
            },
            ...afterIncidentsChanged(
              state,
              incidents,
              sequence,
              appendBounded(
                state.logbook,
                {
                  id: `log-${String(sequence).padStart(4, '0')}`,
                  simulationMinute: state.elapsedMinutes,
                  source: translate(messages, 'sourceIncidentController'),
                  category: 'maintenance',
                  message: translate(messages, 'logIncidentResolved', {
                    title: incidentTitle(target),
                  }),
                  relatedId: incidentId,
                  actor,
                  wording: { key: 'logIncidentResolved', kind: target.kind },
                  sourceKey: 'sourceIncidentController',
                },
                MAX_LOG_ENTRIES
              )
            ),
          };
        });
        closeSettledIncidentPredictions(get().incidents, incidentId);
      },

      respondToIncident: (incidentId, response, actor = 'controller', meet = true) => {
        const target = get().incidents.find(
          (incident) =>
            incident.id === incidentId &&
            (incident.phase === 'raised' || incident.phase === 'acknowledged')
        );
        const answer = target ? incidentResponse(target.kind, response) : null;
        if (!target || !answer) return false;
        set((state) => ({
          incidents: state.incidents.map((incident) =>
            incident.id === incidentId ? { ...incident, response: answer.id } : incident
          ),
        }));
        if (!meet) return true;
        if (target.phase === 'raised') get().acknowledgeIncident(incidentId, actor);
        get().mitigateIncident(incidentId, actor);
        return get().incidents.some(
          (incident) => incident.id === incidentId && incident.phase === 'mitigated'
        );
      },

      markIncidentResponseActed: (incidentId) =>
        set((state) => ({
          incidents: state.incidents.map((incident) =>
            incident.id === incidentId ? { ...incident, responseActed: true } : incident
          ),
        })),

      endPlantIncidents: () => {
        const state = get();
        for (const incident of state.incidents)
          if (
            incident.origin === 'plant' &&
            incident.phase === 'mitigated' &&
            incident.effectApplied &&
            typeof incident.endsAtMinute === 'number' &&
            Number.isFinite(incident.endsAtMinute) &&
            state.elapsedMinutes >= incident.endsAtMinute
          )
            get().resolveIncident(incident.id, 'controller');
      },

      bookDemurrageCharge: (amount) => {
        const charge = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        if (charge === 0) return;
        set((state) => ({
          economics: {
            ...state.economics,
            demurrageCost: state.economics.demurrageCost + charge,
          },
          shiftMetrics: {
            ...state.shiftMetrics,
            demurrageCost: state.shiftMetrics.demurrageCost + charge,
          },
        }));
      },

      bookEnergyCharge: (amount) => {
        const charge = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        if (charge === 0) return;
        set((state) => ({
          economics: { ...state.economics, energyCost: state.economics.energyCost + charge },
          shiftMetrics: {
            ...state.shiftMetrics,
            energyCost: state.shiftMetrics.energyCost + charge,
          },
        }));
      },

      markIncidentEffectApplied: (incidentId) =>
        set((state) => ({
          incidents: state.incidents.map((incident) =>
            incident.id === incidentId ? { ...incident, effectApplied: true } : incident
          ),
        })),

      addLogEntry: (source, category, message, relatedId = null, actor = 'controller', keys) =>
        set((state) => {
          const trimmed = message.trim();
          if (!trimmed) return state;
          const sequence = state.sequence + 1;
          const namedSource = source.trim();
          const sourceKey = namedSource ? keys?.sourceKey : 'sourceControlLayer';
          return {
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: namedSource || translate(messages, 'sourceControlLayer'),
                category,
                message: trimmed,
                relatedId,
                actor,
                ...(keys?.wording ? { wording: keys.wording } : {}),
                ...(sourceKey ? { sourceKey } : {}),
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      tickCampaign: (deltaSimulationSeconds, context) => {
        if (!Number.isFinite(deltaSimulationSeconds) || deltaSimulationSeconds <= 0) return;
        set((state) => {
          const deltaMinutes = deltaSimulationSeconds / 60;
          const deltaHours = deltaSimulationSeconds / 3600;
          const elapsedMinutes = state.elapsedMinutes + deltaMinutes;
          let sequence = state.sequence;
          let orders = state.orders.map((order) => ({
            ...order,
            batchIds: [...order.batchIds],
            manifestIds: [...order.manifestIds],
          }));
          let logbook = state.logbook;
          const materialSessionChanged =
            context.materialSessionId !== undefined &&
            context.materialSessionId !== state.lastMaterialSessionId;
          let processedManifestIds = materialSessionChanged ? [] : [...state.processedManifestIds];
          const creditedBatchKg = { ...state.creditedBatchKg };
          const economics = { ...state.economics };
          let shiftMetrics = { ...state.shiftMetrics };
          const incidentEffect = combinedIncidentEffect(state.incidents);
          const batchesById = new Map(context.productionBatches.map((batch) => [batch.id, batch]));

          for (const manifest of context.manifests) {
            if (manifest.kind !== 'shipping' || processedManifestIds.includes(manifest.id))
              continue;
            processedManifestIds.push(manifest.id);
            let remaining = Math.max(0, Number.isFinite(manifest.actualKg) ? manifest.actualKg : 0);
            const materialRemaining = new Map<MaterialType, number>();
            for (const material of manifest.materials)
              materialRemaining.set(
                material.type,
                (materialRemaining.get(material.type) ?? 0) +
                  Math.max(0, Number.isFinite(material.amount) ? material.amount : 0)
              );
            const sourceMass = manifest.sourceLots.reduce(
              (sum, source) =>
                sum + Math.max(0, Number.isFinite(source.amount) ? source.amount : 0),
              0
            );
            remaining = Math.min(remaining, sourceMass);
            let allocatedManifestKg = 0;
            for (const product of manifest.productBatches) {
              // A batch can be split across orders, but never beyond its own mass.
              const batch = batchesById.get(product.batchId);
              if (
                !batch ||
                !batch.dispatchManifestIds.includes(manifest.id) ||
                !batch.sealed ||
                (batch.disposition !== 'shipped' && batch.disposition !== 'released')
              )
                continue;
              const material = batch.materialType;
              const creditSessionId = context.materialSessionId ?? null;
              const creditKey = batchCreditKey(creditSessionId, batch);
              if (creditedBatchKg[creditKey] === undefined) {
                // Adopt credit a record from before compact keys still holds.
                const legacyKey = legacyBatchCreditKey(creditSessionId, batch);
                if (creditedBatchKg[legacyKey] !== undefined) {
                  creditedBatchKg[creditKey] = creditedBatchKg[legacyKey];
                  delete creditedBatchKg[legacyKey];
                }
              }
              let productRemaining = Math.min(
                Math.max(0, Number.isFinite(product.amount) ? product.amount : 0),
                Math.max(
                  0,
                  (Number.isFinite(batch.producedKg) ? batch.producedKg : 0) -
                    (creditedBatchKg[creditKey] ?? 0)
                ),
                materialRemaining.get(material) ?? 0,
                remaining
              );
              creditedBatchKg[creditKey] = (creditedBatchKg[creditKey] ?? 0) + productRemaining;
              materialRemaining.set(
                material,
                (materialRemaining.get(material) ?? 0) - productRemaining
              );
              remaining -= productRemaining;
              // No order is paid for flour under its recipe minimum (plan item
              // 3.4, D6): each batch is read at the stamp it was packed at,
              // whatever the manifest says it was loaded for. A batch saved
              // before stamps were recorded reads as conforming.
              const queue = orders
                .filter(
                  (candidate) =>
                    candidate.status !== 'fulfilled' &&
                    candidate.status !== 'cancelled' &&
                    candidate.recipe.finishedMaterial === material &&
                    meetsMinimum(batch.qualityScore, candidate.recipe.minimumQuality)
                )
                .sort(compareDispatchOrder);
              // The orders the shipment plan loaded this batch for are served
              // first, in its order; then the one it named; the rest, and any
              // manifest without either, go by the dispatch queue.
              const preferred = [
                ...(manifest.orderLoads ?? [])
                  .filter((load) => load.batchId === product.batchId)
                  .map((load) => load.orderId),
                ...(manifest.orderId ? [manifest.orderId] : []),
              ];
              for (const orderId of [...preferred].reverse()) {
                const chosen = queue.findIndex((candidate) => candidate.id === orderId);
                if (chosen > 0) queue.unshift(...queue.splice(chosen, 1));
              }
              for (const order of queue) {
                if (productRemaining <= EPSILON_KG) break;
                const needed = Math.max(0, order.requiredKg - order.shippedKg);
                const allocated = Math.min(needed, productRemaining);
                if (allocated <= EPSILON_KG) continue;
                order.shippedKg += allocated;
                productRemaining -= allocated;
                allocatedManifestKg += allocated;
                if (!order.batchIds.includes(product.batchId)) order.batchIds.push(product.batchId);
                if (!order.manifestIds.includes(manifest.id)) order.manifestIds.push(manifest.id);
                // The queue holds only orders whose minimum the batch meets, so
                // nothing here adds to qualityFailureKg or its 0.08 a kg any
                // more: both stay on orders and reports saved before plan 3.4.
                const revenue = allocated * order.revenuePerKg;
                economics.revenue += revenue;
                shiftMetrics.revenue += revenue;
                shiftMetrics.dispatchedKg += allocated;
                if (order.shippedKg + EPSILON_KG >= order.requiredKg) {
                  order.status = 'fulfilled';
                  order.completedAtMinute = elapsedMinutes;
                } else {
                  order.status = 'active';
                }
              }
            }
            // An empty shipment (nothing owed of its product) is not news.
            if (allocatedManifestKg > EPSILON_KG) {
              sequence += 1;
              logbook = appendBounded(
                logbook,
                {
                  id: `log-${String(sequence).padStart(4, '0')}`,
                  simulationMinute: elapsedMinutes,
                  source: translate(messages, 'sourceDispatchController'),
                  category: 'operation',
                  message: translate(messages, 'logManifestAllocated', {
                    manifest: manifest.id,
                    kg: formatGrouped(allocatedManifestKg, { maximumFractionDigits: 1 }),
                  }),
                  relatedId: manifest.id,
                  wording: {
                    key: 'logManifestAllocated',
                    manifest: manifest.id,
                    kg: allocatedManifestKg,
                  },
                  sourceKey: 'sourceDispatchController',
                },
                MAX_LOG_ENTRIES
              );
            }
          }
          processedManifestIds = processedManifestIds.slice(-MAX_PROCESSED_MANIFESTS);

          orders = orders.map((order) =>
            order.status !== 'fulfilled' &&
            order.status !== 'cancelled' &&
            elapsedMinutes > order.dueAtMinute
              ? { ...order, status: 'late' }
              : order
          );
          // The way out (plan items 3.4, 3.7; Chronicle rule 4): an order
          // FORFEIT_LATENESS_MINUTES past its due time is closed unfulfilled,
          // with a penalty and the reason in the record. Flour packed for it
          // stays in stock for any order it meets.
          const best = context.bestReachableQuality;
          let forfeitFees = 0;
          // An open order of a product, not at its bound this tick, that would
          // take a truck's load of it.
          const takerOf = (product: CustomerOrder['recipe']['finishedMaterial']) =>
            orders.some(
              (other) =>
                other.status !== 'fulfilled' &&
                other.status !== 'cancelled' &&
                other.recipe.finishedMaterial === product &&
                elapsedMinutes < other.dueAtMinute + FORFEIT_LATENESS_MINUTES
            );
          orders = orders.map((order) => {
            if (
              order.status === 'fulfilled' ||
              order.status === 'cancelled' ||
              elapsedMinutes < order.dueAtMinute + FORFEIT_LATENESS_MINUTES ||
              // A truck about to leave with its flour delivers it first.
              truckLoadingFor(
                order,
                context.dispatchLoad,
                context.shippingDocked,
                takerOf(order.recipe.finishedMaterial),
                elapsedMinutes
              )
            )
              return order;
            const forfeit = forfeitOrderAt(order, elapsedMinutes, best);
            forfeitFees += forfeit.fee;
            sequence += 1;
            logbook = appendBounded(
              logbook,
              forfeitLogEntry(sequence, elapsedMinutes, order.id, forfeit.wording),
              MAX_LOG_ENTRIES
            );
            return forfeit.order;
          });
          if (forfeitFees > 0) {
            economics.latePenalties += forfeitFees;
            shiftMetrics.latePenalties += forfeitFees;
          }
          // The order the plant works first: the active one while it is open
          // and can be made; otherwise the first in the queue, an order the
          // line can make before one it cannot (its grain's best stamp is
          // under its minimum), so the others are not held behind it.
          let activeOrderId = state.activeOrderId;
          const active = orders.find((order) => order.id === activeOrderId);
          const isOpen = (order: CustomerOrder) =>
            order.status !== 'fulfilled' && order.status !== 'cancelled';
          const reachable = (order: CustomerOrder) => orderReachable(order, best);
          if (
            !active ||
            !isOpen(active) ||
            (!reachable(active) && orders.some((order) => isOpen(order) && reachable(order)))
          ) {
            activeOrderId =
              orders
                .filter(isOpen)
                .sort(
                  (a, b) =>
                    Number(!reachable(a)) - Number(!reachable(b)) ||
                    priorityRank(a.priority) - priorityRank(b.priority) ||
                    a.dueAtMinute - b.dueAtMinute
                )[0]?.id ?? null;
            orders = orders.map((order) =>
              order.id === activeOrderId && order.status === 'planned'
                ? { ...order, status: 'active' }
                : order
            );
          }
          // The grain and stock readings are the plan's that was active when
          // the tick started (UnifiedGameTick reads it first). An order this
          // tick fulfilled rolls on to the next; on another recipe the readings
          // say nothing about it until a tick reads its route, as a paused
          // activateOrder holds. Working if the rollover neither reads Blocked
          // on the old grain nor logs a stage judged from the old stock.
          const readingOrder = state.orders.find(
            (order) =>
              order.id === state.activeOrderId &&
              order.status !== 'fulfilled' &&
              order.status !== 'cancelled'
          );
          const nextActive = orders.find((order) => order.id === activeOrderId);
          const tickContext: CampaignTickContext =
            !!nextActive &&
            activeOrderId !== state.activeOrderId &&
            (readingOrder?.recipe.sourceMaterial !== nextActive.recipe.sourceMaterial ||
              readingOrder?.recipe.finishedMaterial !== nextActive.recipe.finishedMaterial)
              ? { ...context, routeUnread: true }
              : context;

          const effectiveEnergyKw = Math.max(
            0,
            context.totalEnergyKw * incidentEffect.energyMultiplier
          );
          const utilityAssets = state.utilityAssets.map((asset, index) => {
            const definition = UTILITY_ASSET_DEFINITIONS.find(
              (candidate) => candidate.id === asset.id
            );
            if (!definition) return asset;
            const consumptionLitres =
              asset.id === 'utility-fuel-oil-01'
                ? effectiveEnergyKw * deltaHours * 0.018
                : asset.id === 'utility-process-oil-02'
                  ? state.execution.lineSetpointPercent * deltaHours * 0.012
                  : asset.id.startsWith('utility-lpg')
                    ? deltaHours * 0.8
                    : deltaHours * 0.15;
            const currentLitres = (asset.levelPercent / 100) * asset.capacityLitres;
            let levelPercent = clamp(
              ((currentLitres - consumptionLitres) / asset.capacityLitres) * 100,
              0,
              100
            );
            // A vessel at its reorder level books the supplier, whose delivery
            // tops it back up; without it a long session ran every vessel dry.
            // A booking further off than one delivery (a clock wound back) is
            // rebooked from now.
            let refillDueMinute = asset.refillDueMinute;
            if (
              refillDueMinute !== undefined &&
              (!Number.isFinite(refillDueMinute) ||
                refillDueMinute - elapsedMinutes > UTILITY_DELIVERY_MINUTES)
            ) {
              refillDueMinute = elapsedMinutes + UTILITY_DELIVERY_MINUTES;
            }
            if (refillDueMinute === undefined && levelPercent <= UTILITY_REORDER_PERCENT) {
              refillDueMinute = elapsedMinutes + UTILITY_DELIVERY_MINUTES;
            }
            if (refillDueMinute !== undefined && elapsedMinutes >= refillDueMinute) {
              levelPercent = Math.max(levelPercent, definition.nominalLevelPercent);
              refillDueMinute = undefined;
            }
            const { refillDueMinute: _previousDue, ...rest } = asset;
            return {
              ...rest,
              ...(refillDueMinute !== undefined ? { refillDueMinute } : {}),
              levelPercent: Math.round(levelPercent * 100) / 100,
              temperatureC:
                Math.round(
                  (definition.nominalTemperatureC +
                    Math.sin(elapsedMinutes / 90 + index * 0.7) * 1.4) *
                    10
                ) / 10,
              pressureBar:
                Math.round(
                  Math.max(
                    0,
                    definition.nominalPressureBar +
                      Math.sin(
                        elapsedMinutes / (definition.kind === 'lpg_vessel' ? 55 : 120) + index
                      ) *
                        (definition.kind === 'lpg_vessel' ? 0.12 : 0.01)
                  ) * 100
                ) / 100,
              status:
                levelPercent <= 10
                  ? ('critical' as const)
                  : levelPercent <= 20
                    ? ('low' as const)
                    : ('normal' as const),
            };
          });

          const minuteOfDay =
            context.clockMinuteOfDay !== undefined && Number.isFinite(context.clockMinuteOfDay)
              ? context.clockMinuteOfDay
              : elapsedMinutes % (24 * 60);
          const energyCost = effectiveEnergyKw * energyTariffPerKwh(minuteOfDay) * deltaHours;
          const automationCost = 28 * deltaHours;
          // A changed physical session starts a new waste ledger even when its
          // counter already exceeds the previous reading. Same-session reload
          // retains the baseline so old waste is never charged again.
          const newWasteKg =
            materialSessionChanged || context.wasteKg < state.lastWasteKg
              ? context.wasteKg
              : context.wasteKg - state.lastWasteKg;
          const wasteCost = Math.max(0, newWasteKg) * 0.18;
          // Rates first, so the cost the card shows per game hour and the cost
          // booked here can never disagree.
          const rates: CampaignCostRates = {
            maintenance: context.openWorkOrders * MAINTENANCE_COST_PER_WORK_ORDER_HOUR,
            demurrage:
              context.shippingDocked &&
              (!context.dispatchReleased || incidentEffect.dispatchBlocked)
                ? DEMURRAGE_COST_PER_HOUR
                : 0,
            late: orders.reduce((sum, order) => {
              if (order.status !== 'late') return sum;
              return (
                sum + Math.max(0, order.requiredKg - order.shippedKg) * order.latePenaltyPerKgHour
              );
            }, 0),
          };
          const costRates =
            rates.maintenance === state.costRates?.maintenance &&
            rates.demurrage === state.costRates?.demurrage &&
            Math.abs(rates.late - (state.costRates?.late ?? Number.NaN)) < 1e-9
              ? state.costRates
              : rates;
          const maintenanceCost = rates.maintenance * deltaHours;
          const demurrageCost = rates.demurrage * deltaHours;
          const latePenalties = rates.late * deltaHours;
          // Exposure is read at the start of the tick: an order fulfilled by
          // this tick's manifest was still owed while the tick ran.
          if (
            state.orders.some(
              (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
            )
          ) {
            shiftMetrics.commitmentMinutes = (shiftMetrics.commitmentMinutes ?? 0) + deltaMinutes;
            if (context.oee)
              shiftMetrics.oee = accumulateShiftOee(shiftMetrics.oee, {
                ...context.oee,
                minutes: deltaMinutes,
                unitsDown: context.openWorkOrders,
                // The stamp packed now against the minimum of the order the line works.
                conforming: (() => {
                  const lineOrder = state.orders.find(
                    (order) => order.id === (context.lineOrderId ?? state.activeOrderId)
                  );
                  return lineOrder
                    ? meetsMinimum(context.averageQuality, lineOrder.recipe.minimumQuality)
                    : true;
                })(),
              });
          }
          for (const [key, value] of Object.entries({
            energyCost,
            automationCost,
            wasteCost,
            maintenanceCost,
            demurrageCost,
            latePenalties,
          }) as Array<[keyof CampaignEconomics, number]>) {
            economics[key] += value;
            shiftMetrics[key] += value;
          }
          // The grain in what left on a truck this tick leaves stock held: the
          // net pays for it now, as it pays for the grain in nothing unsold.
          // Read from the shipping manifests the credit loop above took in.
          let grainShipped = 0;
          for (const manifest of context.manifests)
            if (
              manifest.kind === 'shipping' &&
              (materialSessionChanged || !state.processedManifestIds.includes(manifest.id))
            )
              grainShipped += grainInShipped(manifest.materials);
          if (grainShipped > 0) {
            economics.stockHeld = (economics.stockHeld ?? 0) - grainShipped;
            shiftMetrics.stockHeld = (shiftMetrics.stockHeld ?? 0) - grainShipped;
          }
          // A new material session's opening stock, at cost, as bought that
          // day and held: it nets nothing now (bought and held at once), and
          // its grain leaves stock held as it ships, as bought grain's does.
          // Before, opening stock was never bought but was debited when it
          // shipped, so stock held ran below zero (review 2, the ledger).
          const opening =
            materialSessionChanged &&
            Number.isFinite(context.openingStockValue) &&
            (context.openingStockValue ?? 0) > 0
              ? (context.openingStockValue as number)
              : 0;
          if (opening > 0)
            for (const ledger of [economics, shiftMetrics]) {
              ledger.grainCost = (ledger.grainCost ?? 0) + opening;
              ledger.stockHeld = (ledger.stockHeld ?? 0) + opening;
            }

          let reports = state.reports;
          let currentShiftKey = state.currentShiftKey ?? context.shiftKey;
          let currentShiftLabel = state.currentShiftKey
            ? state.currentShiftLabel
            : context.shiftLabel;
          let shiftStartedAtMinute = state.currentShiftKey
            ? state.shiftStartedAtMinute
            : state.elapsedMinutes;
          const constraintInput = {
            orders,
            activeOrderId,
            incidents: state.incidents,
            elapsedMinutes,
          };
          if (
            currentShiftKey !== context.shiftKey &&
            isClockResetWindow(currentShiftKey, context.shiftKey)
          ) {
            // Reset to 10 AM cut this window short: it carries on under the
            // window the reset opened, so it is graded once, at that window's
            // close, with all of its evidence.
            currentShiftKey = context.shiftKey;
            currentShiftLabel = context.shiftLabel;
          } else if (currentShiftKey !== context.shiftKey) {
            const risks = riskEvidence(
              makeConstraints(constraintInput, tickContext, incidentEffect),
              orders,
              elapsedMinutes
            );
            sequence += 1;
            const report = buildShiftReport({
              id: `period-report-${String(sequence).padStart(4, '0')}`,
              shiftKey: currentShiftKey,
              shiftLabel: currentShiftLabel,
              startedAtMinute: shiftStartedAtMinute,
              endedAtMinute: elapsedMinutes,
              metrics: shiftMetrics,
              orders,
              logbook,
              ...risks,
              incidents: state.incidents,
              startedAfterSequence: windowStartSequence(state.reports, shiftStartedAtMinute),
            });
            reports = appendBounded(reports, report, MAX_REPORTS);
            currentShiftKey = context.shiftKey;
            currentShiftLabel = context.shiftLabel;
            shiftStartedAtMinute = elapsedMinutes;
            shiftMetrics = { ...ZERO_SHIFT_METRICS };
          }

          const constraints = makeConstraints(constraintInput, tickContext, incidentEffect);
          lastConstraintSource = {
            input: constraintInput,
            context: tickContext,
            effect: incidentEffect,
            constraints,
          };
          const activeOrder = orders.find((order) => order.id === activeOrderId);
          const execution = deriveExecution(activeOrder, elapsedMinutes, {
            ...tickContext,
            dispatchReleased: context.dispatchReleased && !incidentEffect.dispatchBlocked,
          });
          if (
            execution.orderId !== state.execution.orderId ||
            execution.stage !== state.execution.stage
          ) {
            sequence += 1;
            const wording = executionWording(execution);
            logbook = appendBounded(
              logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: elapsedMinutes,
                source: translate(messages, 'sourceProductionExecution'),
                category: execution.stage === 'quality_hold' ? 'quality' : 'operation',
                message: logWordingText(wording) ?? '',
                relatedId: execution.orderId,
                wording,
                sourceKey: 'sourceProductionExecution',
              },
              MAX_LOG_ENTRIES
            );
          }

          // A run saved before the product baseline takes it from the orders as
          // they stood before this tick's shipments, keeping its progress so far.
          let activeChallenge = state.activeChallenge
            ? withMaterialBaseline(state.activeChallenge, state.orders)
            : null;
          let challengeHistory = state.challengeHistory;
          if (activeChallenge) {
            const order = orders.find((candidate) => candidate.id === activeChallenge?.orderId);
            const incident = state.incidents.find(
              (candidate) => candidate.id === activeChallenge?.incidentId
            );
            // Kilograms of the order's product shipped to any order since the
            // start: dispatch credits the highest-priority order of a product.
            const credit = challengeCredit(activeChallenge, orders);
            const qualityFailed = !!credit && credit.qualityFailureKg > EPSILON_KG;
            // The credited mass passed release when it shipped; a later hold on
            // the plant's current dispatch does not undo a target already met.
            const safe =
              order &&
              credit &&
              !qualityFailed &&
              !state.incidents.some(
                (incident) =>
                  incident.phase !== 'resolved' &&
                  (incident.severity === 'high' || incident.severity === 'critical')
              );
            const completed =
              safe &&
              incident?.effectApplied &&
              incident.acknowledgedAtMinute !== null &&
              incident.phase === 'resolved' &&
              credit.shippedKg + EPSILON_KG >= activeChallenge.targetKg;
            const failed =
              elapsedMinutes >= activeChallenge.deadlineMinute || !order || qualityFailed;
            if (completed || failed) {
              const status =
                completed && elapsedMinutes <= activeChallenge.deadlineMinute
                  ? 'completed'
                  : 'failed';
              challengeHistory = appendBounded(
                challengeHistory,
                { ...activeChallenge, status, endedAtMinute: elapsedMinutes },
                8
              );
              // Its start and an abandon are logged; so is how it ended, or the
              // shift review never says whether the run was won.
              // Working if the narration names a completed or failed run.
              if (OPERATIONS_CHALLENGES.some((run) => run.id === activeChallenge?.challengeId)) {
                const wording: LogWording = {
                  key: status === 'completed' ? 'logChallengeCompleted' : 'logChallengeFailed',
                  challengeId: activeChallenge.challengeId,
                };
                sequence += 1;
                logbook = appendBounded(
                  logbook,
                  {
                    id: `log-${String(sequence).padStart(4, '0')}`,
                    simulationMinute: elapsedMinutes,
                    source: translate(messages, 'sourceRecoveryChallenge'),
                    category: 'operation',
                    message: logWordingText(wording) ?? '',
                    relatedId: activeChallenge.incidentId,
                    wording,
                    sourceKey: 'sourceRecoveryChallenge',
                  },
                  MAX_LOG_ENTRIES
                );
              }
              activeChallenge = null;
            }
          }
          return {
            initialized: true,
            activeChallenge,
            challengeHistory,
            // Only a batch still listed can appear in a manifest to credit:
            // its key is kept, and a short tail of the rest (plan item 3.4,
            // the save's budget; was the last 1,000 keys of any batch).
            creditedBatchKg: retainCreditKeys(
              creditedBatchKg,
              new Set(
                context.productionBatches.map((batch) =>
                  batchCreditKey(context.materialSessionId ?? null, batch)
                )
              )
            ),
            lastMaterialSessionId: context.materialSessionId ?? state.lastMaterialSessionId,
            elapsedMinutes,
            orders,
            activeOrderId,
            economics,
            shiftMetrics,
            costRates,
            reports,
            logbook,
            constraints,
            execution,
            utilityAssets,
            processedManifestIds,
            lastWasteKg: context.wasteKg,
            currentShiftKey,
            currentShiftLabel,
            shiftStartedAtMinute,
            sequence,
          };
        });
      },

      getActiveProductionPlan: () => {
        const state = get();
        const order = state.orders.find((candidate) => candidate.id === state.activeOrderId);
        if (!order || order.status === 'fulfilled' || order.status === 'cancelled') return null;
        return {
          orderId: order.id,
          sourceMaterial: order.recipe.sourceMaterial,
          finishedMaterial: order.recipe.finishedMaterial,
          lineSetpointPercent:
            state.execution.orderId === order.id ? state.execution.lineSetpointPercent : 100,
        };
      },

      getLineProductionPlan: (finishedAvailableKg, bestReachable) => {
        const state = get();
        const active = state.orders.find((candidate) => candidate.id === state.activeOrderId);
        if (!active || active.status === 'fulfilled' || active.status === 'cancelled') return null;
        // Only orders the line cannot make are open: nothing is milled for them.
        if (!orderReachable(active, bestReachable)) return null;
        // Walk the commitments in the order dispatch will serve them: the
        // active order, then the same priority/due order activation uses. Packed
        // stock covers them in turn; the line works on the first one it does not
        // cover. The feed budget counts every committed kg of a product, so the
        // plan's budget is the remainder of every queued order of that product
        // up to and including it.
        const queue = [
          active,
          ...state.orders
            .filter(
              (order) =>
                order.id !== active.id &&
                order.status !== 'fulfilled' &&
                order.status !== 'cancelled' &&
                orderReachable(order, bestReachable)
            )
            .sort(compareDispatchOrder),
        ];
        const stock = { flour: 0, semolina: 0, ...finishedAvailableKg };
        const queuedKg = { flour: 0, semolina: 0 };
        for (const order of queue) {
          const material = order.recipe.finishedMaterial;
          const remainingKg = Math.max(0, order.requiredKg - order.shippedKg);
          queuedKg[material] += remainingKg;
          const covered = Math.min(remainingKg, Math.max(0, stock[material]));
          stock[material] -= covered;
          if (!remainderPacked(remainingKg, covered))
            return {
              orderId: order.id,
              customer: order.customer,
              sourceMaterial: order.recipe.sourceMaterial,
              finishedMaterial: material,
              remainingFinishedKg: queuedKg[material],
              prestaged: order.id !== active.id,
            };
        }
        // Everything queued is packed: keep the active recipe, with no new feed.
        return {
          orderId: active.id,
          customer: active.customer,
          sourceMaterial: active.recipe.sourceMaterial,
          finishedMaterial: active.recipe.finishedMaterial,
          remainingFinishedKg: queuedKg[active.recipe.finishedMaterial],
          prestaged: false,
        };
      },

      // One rate, the player's (plan item 3.6): the line runs at the production
      // speed set in Settings, slowed only by an open incident. The derived
      // line setpoint no longer scales it; execution keeps it for old saves.
      getProductionMultiplier: () =>
        clamp(combinedIncidentEffect(get().incidents).productionMultiplier, 0, 1),

      getIncidentEffect: () => combinedIncidentEffect(get().incidents),
      bookPurchase: (purchase) => {
        const money = (value: number | undefined) =>
          Number.isFinite(value) ? Math.max(0, value as number) : 0;
        const grain = money(purchase.grainCost);
        const parts = money(purchase.partsCost);
        if (grain === 0 && parts === 0) return;
        set((state) => {
          const add = <T extends CampaignPurchaseLedger>(ledger: T): T => ({
            ...ledger,
            grainCost: (ledger.grainCost ?? 0) + grain,
            partsCost: (ledger.partsCost ?? 0) + parts,
            stockHeld: (ledger.stockHeld ?? 0) + grain,
          });
          return { economics: add(state.economics), shiftMetrics: add(state.shiftMetrics) };
        });
      },
      resetCampaign: () => set(emptyState()),
    }),
    {
      name: 'millos-autonomous-operations',
      storage: safeJSONStorage,
      // v3: shift reports may carry no letter (grade null) and optional review
      // evidence; shift metrics gain commitmentMinutes. Every addition is
      // optional or defaulted in merge, so a v2 save passes through unchanged
      // and its reports still render from their saved summary and reasons.
      // Zustand drops a save whose version differs when no migrate is given,
      // which is why this pass-through exists. An older build reading a v3
      // save has no migrate and starts fresh (a downgrade only).
      version: 3,
      migrate: (persisted) => persisted as Partial<OperationsCampaignState>,
      partialize: (state) => ({
        initialized: state.initialized,
        activeChallenge: state.activeChallenge,
        creditedBatchKg: state.creditedBatchKg,
        processedManifestIds: state.processedManifestIds,
        lastMaterialSessionId: state.lastMaterialSessionId,
        lastWasteKg: state.lastWasteKg,
        challengeHistory: state.challengeHistory,
        elapsedMinutes: state.elapsedMinutes,
        orders: state.orders,
        activeOrderId: state.activeOrderId,
        incidents: state.incidents,
        economics: state.economics,
        shiftMetrics: state.shiftMetrics,
        reports: state.reports,
        logbook: state.logbook,
        constraints: state.constraints,
        execution: state.execution,
        utilityAssets: state.utilityAssets,
        currentShiftKey: state.currentShiftKey,
        currentShiftLabel: state.currentShiftLabel,
        shiftStartedAtMinute: state.shiftStartedAtMinute,
        sequence: state.sequence,
        programmeCount: state.programmeCount,
      }),
      // Restore receipts only alongside their physical session identity. A real
      // material reset clears them in tickCampaign, while same-session rehydrate
      // must retain partially shipped receipts and the charged-waste baseline.
      // Older saves without a physical session retain the legacy reset.
      merge: (persisted, current) => {
        const restored =
          persisted && typeof persisted === 'object'
            ? (persisted as Partial<OperationsCampaignState>)
            : {};
        const materialSessionId =
          typeof restored.lastMaterialSessionId === 'string' && restored.lastMaterialSessionId
            ? restored.lastMaterialSessionId
            : null;
        return {
          ...current,
          ...restored,
          // JSON froze each recipe label in the save's language; re-link restored
          // orders to the live MILL_RECIPES entries so a language switch reaches them.
          ...(Array.isArray(restored.orders)
            ? { orders: relinkOrderRecipes(restored.orders) }
            : {}),
          shiftMetrics: {
            ...ZERO_SHIFT_METRICS,
            ...(restored.shiftMetrics ?? current.shiftMetrics),
          },
          challengeHistory: (Array.isArray(restored.challengeHistory)
            ? restored.challengeHistory
            : []
          ).slice(-8),
          processedManifestIds:
            materialSessionId && Array.isArray(restored.processedManifestIds)
              ? [
                  ...new Set(restored.processedManifestIds.filter((id) => typeof id === 'string')),
                ].slice(-MAX_PROCESSED_MANIFESTS)
              : [],
          creditedBatchKg: compactBatchCreditKeys(
            Object.fromEntries(
              Object.entries(restored.creditedBatchKg ?? {})
                .filter(([, value]) => Number.isFinite(value) && value >= 0)
                .slice(-1000)
            )
          ),
          lastWasteKg:
            materialSessionId &&
            typeof restored.lastWasteKg === 'number' &&
            Number.isFinite(restored.lastWasteKg) &&
            restored.lastWasteKg >= 0
              ? restored.lastWasteKg
              : 0,
          lastMaterialSessionId: materialSessionId,
        };
      },
    }
  )
);

/** A control a person (or an agent acting for them) operated outside the campaign's own actions. */
export type OperatorAction =
  | { kind: 'maintenance'; machine: string }
  | { kind: 'restart'; machine: string }
  | { kind: 'drillStarted' }
  | { kind: 'drillEnded' }
  | { kind: 'emergencyStop' }
  | { kind: 'emergencyCleared' }
  | { kind: 'pace'; gameSpeed: number }
  | { kind: 'batchTest' | 'batchHold' | 'batchRetest' | 'batchRecall'; batch: string };

const OPERATOR_ACTION_CATEGORY: Record<OperatorAction['kind'], LogCategory> = {
  maintenance: 'maintenance',
  restart: 'maintenance',
  drillStarted: 'safety',
  drillEnded: 'safety',
  emergencyStop: 'safety',
  emergencyCleared: 'safety',
  pace: 'operation',
  batchTest: 'quality',
  batchHold: 'quality',
  batchRetest: 'quality',
  batchRecall: 'quality',
};

const BATCH_ACTION_KEYS = {
  batchTest: 'logOperatorBatchTest',
  batchHold: 'logOperatorBatchHold',
  batchRetest: 'logOperatorBatchRetest',
  batchRecall: 'logOperatorBatchRecall',
} as const;

/**
 * Writes a plant control the player operated to the campaign logbook as their
 * decision; the shift review's "Your decisions" is read from it. The same store
 * actions serve agents and the tick, so the control's own handler calls this,
 * as recordSetpointDecision does for SCADA writes.
 * Working if Perform Maintenance, Restart Unit, a drill, an E-stop and a pace
 * change each appear in the debrief instead of "the mill ran on its controllers".
 */
export function recordOperatorAction(
  action: OperatorAction,
  actor: Exclude<CampaignActor, 'controller'> = 'operator'
): void {
  useOperationsCampaignStore
    .getState()
    .addLogEntry(
      translate(messages, 'sourceOperator'),
      OPERATOR_ACTION_CATEGORY[action.kind],
      operatorActionText(action) ?? '',
      'machine' in action ? action.machine : 'batch' in action ? action.batch : null,
      actor,
      { wording: { key: 'operatorAction', action: { ...action } }, sourceKey: 'sourceOperator' }
    );
}

/** An operator action's logbook line in the language active now; null for an unknown kind. */
function operatorActionText(action: OperatorAction): string | null {
  switch (action.kind) {
    case 'maintenance':
      return translate(messages, 'logOperatorMaintenance', { machine: action.machine });
    case 'restart':
      return translate(messages, 'logOperatorRestart', { machine: action.machine });
    case 'pace':
      return translate(messages, 'logOperatorPace', {
        pace: isPaceGameSpeed(action.gameSpeed)
          ? translate(paceMessages, `pace${action.gameSpeed}`)
          : translate(paceMessages, 'paceCustom'),
      });
    case 'drillStarted':
      return translate(messages, 'logOperatorDrillStarted');
    case 'drillEnded':
      return translate(messages, 'logOperatorDrillEnded');
    case 'emergencyStop':
      return translate(messages, 'logOperatorEmergencyStop');
    case 'emergencyCleared':
      return translate(messages, 'logOperatorEmergencyCleared');
    case 'batchTest':
    case 'batchHold':
    case 'batchRetest':
    case 'batchRecall':
      // A batch is named as Overview lists it.
      return translate(messages, BATCH_ACTION_KEYS[action.kind], {
        batch: action.batch.toUpperCase(),
      });
    default:
      return null;
  }
}

/*
 * A reload restores the campaign from the physical session record (JSON) and a
 * replay restores a structured clone; neither passes through `merge`, and both
 * freeze each recipe's label in the language of the save. Re-link them here, so
 * the commitment list, the rush line and the logbook follow the language.
 * Working if a save written in English reads its recipes in pt-BR after reload.
 */
useOperationsCampaignStore.subscribe((state, previous) => {
  if (state.orders === previous.orders || !Array.isArray(state.orders)) return;
  const orders = relinkOrderRecipes(state.orders);
  if (orders !== state.orders) useOperationsCampaignStore.setState({ orders });
});

useLocaleStore.subscribe((state, previous) => {
  if (state.locale === previous.locale) return;
  const source = lastConstraintSource;
  const current = useOperationsCampaignStore.getState().constraints;
  if (!source || current !== source.constraints) {
    // A restored set: no tick inputs on this page, so each is worded from its own record.
    const constraints = rewordConstraints(current);
    if (constraints !== current) useOperationsCampaignStore.setState({ constraints });
    return;
  }
  const constraints = makeConstraints(source.input, source.context, source.effect);
  lastConstraintSource = { ...source, constraints };
  useOperationsCampaignStore.setState({ constraints });
});

/*
 * The logbook and each saved review's choices and narration are persisted
 * text. Lines that carry their wording are worded again when the language
 * switches, and when a restore writes lines worded in the save's language;
 * free text and lines saved before wording existed keep their stored text.
 * Working if the logbook and "Your decisions" read in the language now active.
 */
const rewordCampaignCopy = () => {
  const state = useOperationsCampaignStore.getState();
  const logbook = rewordLogbook(state.logbook);
  const reports = rewordReports(state.reports);
  if (logbook !== state.logbook || reports !== state.reports)
    useOperationsCampaignStore.setState({ logbook, reports });
};
useLocaleStore.subscribe((state, previous) => {
  if (state.locale !== previous.locale) rewordCampaignCopy();
});
useOperationsCampaignStore.subscribe((state, previous) => {
  const reportsReplaced = state.reports !== previous.reports;
  // An append keeps the previous last line; a restore or replay replaces every line.
  const last = previous.logbook?.at(-1);
  const logbookReplaced =
    state.logbook !== previous.logbook &&
    Array.isArray(state.logbook) &&
    (last === undefined || !state.logbook.includes(last));
  if (reportsReplaced || logbookReplaced) rewordCampaignCopy();
});

/*
 * A hold cleared in the QC lab while the shift is paused (withLiveQualityHold).
 * Only an execution held on quality, with no incident isolating dispatch, is
 * read again; the QC lab writes the material store first, so the batches it
 * judges are already settled.
 */
useQCLabStore.subscribe((qc, previous) => {
  if (qc.qcLab === previous.qcLab) return;
  const state = useOperationsCampaignStore.getState();
  if (
    (state.execution.qualityReleased && state.execution.stage !== 'quality_hold') ||
    combinedIncidentEffect(state.incidents).dispatchBlocked
  )
    return;
  const next = withLiveQualityHold(state, state.sequence, state.logbook);
  if (next.execution !== state.execution || next.costRates !== state.costRates)
    useOperationsCampaignStore.setState(next);
});

// A restore writes constraints worded in the save's language, which may not be this page's.
useOperationsCampaignStore.subscribe((state, previous) => {
  if (state.constraints === previous.constraints) return;
  if (state.constraints === lastConstraintSource?.constraints) return;
  const constraints = rewordConstraints(state.constraints);
  if (constraints !== state.constraints) useOperationsCampaignStore.setState({ constraints });
});

/**
 * A dust-filter incident raises a prediction on its unit (UnifiedGameTick).
 * Once the incident is mitigated or resolved that prediction is closed, or it
 * would refuse the unit's next wear prediction and later read 'Estimated
 * window passed'. Its bookings and any wear prediction stay.
 * Working if a settled incident leaves no prediction of its own open.
 */
function closeSettledIncidentPredictions(
  incidents: readonly OperationalIncident[],
  incidentId: string
): void {
  const incident = incidents.find((candidate) => candidate.id === incidentId);
  if (
    incident?.kind === 'dust_filter_pressure' &&
    incident.affectedMachineId &&
    (incident.phase === 'mitigated' || incident.phase === 'resolved')
  )
    useBreakdownStore.getState().closeIncidentPredictions(incident.affectedMachineId);
}

/**
 * A dust-filter pressure incident warns its unit until the fix is applied
 * (mitigated), whatever the SCADA mode; the cool-off and the tick both ask here.
 * Allocation-free: the tick calls it per machine.
 */
export function incidentHoldsMachineWarning(machineId: string): boolean {
  return useOperationsCampaignStore
    .getState()
    .incidents.some(
      (incident) =>
        incident.kind === 'dust_filter_pressure' &&
        incident.affectedMachineId === machineId &&
        (incident.phase === 'raised' || incident.phase === 'acknowledged')
    );
}
