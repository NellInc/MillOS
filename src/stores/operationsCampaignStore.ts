import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MAX_MATERIAL_MANIFESTS,
  type MaterialManifest,
  type MaterialType,
  type ProductionBatch,
} from './materialFlowStore';
import { safeJSONStorage } from './storage';
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';
import {
  CAMPAIGN_MASS_EPSILON_KG as EPSILON_KG,
  challengeBlockReason,
  getChallengeRecoveryIncident,
  OPERATIONS_CHALLENGES,
  RECOVERY_CHALLENGE_TARGET_KG,
  RECOVERY_CHALLENGE_WINDOW_MINUTES,
  challengeLabel,
  type OperationsChallengeId,
  type OperationsChallengeRun,
} from '../simulation/operationsPlay';
import { formatFixed, getLocale, translate } from '../i18n';
import {
  gradeShift,
  shiftGradeBasis,
  shiftGradeReasons,
  shiftHeadline,
  type ShiftGrade,
  type ShiftGradeBasis,
  type ShiftOpenIncident,
  type ShiftOrderOutcome,
} from '../simulation/shiftReview';
import { operationsCampaignMessages as messages } from './operationsCampaignStore.messages';
import { incidentDescription, incidentTitle } from './incidentText';

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

export interface ShiftCampaignMetrics extends CampaignEconomics {
  dispatchedKg: number;
  qualityFailureKg: number;
  incidentsResolved: number;
  automaticActions: number;
  /**
   * Game minutes in the window during which a customer order was open. Held
   * clock time is not counted: a held tick never reaches tickCampaign.
   */
  commitmentMinutes: number;
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
}

export interface CampaignLogEntry {
  id: string;
  simulationMinute: number;
  source: string;
  category: LogCategory;
  message: string;
  relatedId: string | null;
  actor?: CampaignActor;
}

/** A choice made in the window, by the operator or an AI agent. */
export interface ShiftChoice {
  minute: number;
  actor: Exclude<CampaignActor, 'controller'>;
  message: string;
}

export interface CampaignConstraint {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  label: string;
  detail: string;
  relatedId: string | null;
}

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

export interface DispatchLoadSnapshot {
  cycleId: string;
  status: DispatchLoadStatus;
  loadedKg: number;
  capacityKg: number;
  materialType: Extract<MaterialType, 'flour' | 'semolina'>;
  blockReason: string | null;
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
}

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
  acceptNextProgramme: (actor?: CampaignActor) => boolean;
  elapsedMinutes: number;
  orders: CustomerOrder[];
  activeOrderId: string | null;
  incidents: OperationalIncident[];
  economics: CampaignEconomics;
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
  initializeCampaign: () => void;
  activateOrder: (orderId: string, actor?: CampaignActor) => void;
  triggerIncident: (kind: IncidentKind) => OperationalIncident | null;
  acknowledgeIncident: (incidentId: string, actor?: CampaignActor) => void;
  mitigateIncident: (incidentId: string, actor?: CampaignActor) => void;
  resolveIncident: (incidentId: string, actor?: CampaignActor) => void;
  markIncidentEffectApplied: (incidentId: string) => void;
  addLogEntry: (
    source: string,
    category: LogCategory,
    message: string,
    relatedId?: string | null,
    actor?: CampaignActor
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
    finishedAvailableKg: Partial<Record<Extract<MaterialType, 'flour' | 'semolina'>, number>>
  ) => LineProductionPlan | null;
  getProductionMultiplier: () => number;
  getIncidentEffect: () => IncidentEffect;
  resetCampaign: () => void;
}

const MAX_LOG_ENTRIES = 160;
const MAX_REPORTS = 12;
const MAX_REPORT_CHOICES = 24;
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

const ZERO_ECONOMICS: CampaignEconomics = {
  revenue: 0,
  energyCost: 0,
  automationCost: 0,
  wasteCost: 0,
  maintenanceCost: 0,
  demurrageCost: 0,
  latePenalties: 0,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function appendBounded<T>(values: readonly T[], value: T, limit: number): T[] {
  return [...values.slice(-(limit - 1)), value];
}

function priorityRank(priority: CustomerOrder['priority']): number {
  return priority === 'critical' ? 0 : priority === 'high' ? 1 : 2;
}

function createInitialOrders(): CustomerOrder[] {
  return [
    {
      id: 'order-001',
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
  const remainderPacked =
    remainingKg > EPSILON_KG && context.finishedAvailableKg >= remainingKg - 1;
  const lineOrderId = context.lineOrderId ?? order.id;
  let stage: FulfillmentStage = 'milling';
  if (order.status === 'fulfilled' || remainingKg <= EPSILON_KG) stage = 'fulfilled';
  else if (context.dispatchLoad.status === 'departed' && context.dispatchLoad.lastDispatchKg > 0)
    stage = 'dispatched';
  else if (context.dispatchLoad.status === 'ready') stage = 'ready_to_dispatch';
  else if (context.dispatchLoad.status === 'loading') stage = 'loading';
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
      remainderPacked && lineOrderId !== order.id ? Infinity : context.sourceInventoryKg
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

function executionMessage(execution: OrderExecutionState): string {
  switch (execution.stage) {
    case 'planning':
      return translate(messages, 'execPlanning');
    case 'milling':
      // Working if a line held by the feed budget never claims to be processing.
      if (execution.remainingKg > 0 && execution.finishedAvailableKg >= execution.remainingKg - 1)
        return execution.lineCustomer
          ? translate(messages, 'execPackedPrestaging', { customer: execution.lineCustomer })
          : translate(messages, 'execPackedResting');
      return translate(messages, 'execProcessing', {
        material:
          execution.sourceMaterial != null
            ? sourceMaterialName(execution.sourceMaterial)
            : translate(messages, 'materialScheduledGrain'),
      });
    case 'quality_hold':
      return execution.dispatchLoad.blockReason ?? translate(messages, 'execQualityHold');
    case 'ready_to_load':
      return translate(messages, 'execReadyToLoad');
    case 'loading':
      return translate(messages, 'execLoading', {
        loaded: formatFixed(execution.dispatchLoad.loadedKg, 0),
        capacity: formatFixed(execution.dispatchLoad.capacityKg, 0),
      });
    case 'ready_to_dispatch':
      return translate(messages, 'execReadyToDispatch');
    case 'dispatched':
      return translate(messages, 'execDispatched', {
        kg: formatFixed(execution.dispatchLoad.lastDispatchKg, 0),
      });
    case 'fulfilled':
      return execution.orderId === null
        ? translate(messages, 'execAllFulfilled')
        : translate(messages, 'execFulfilled');
  }
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
    effect.productionMultiplier *= 1 - (1 - definition.productionMultiplier) * scale;
    effect.energyMultiplier *= 1 + (definition.energyMultiplier - 1) * scale;
    effect.qualityPenalty += definition.qualityPenalty * scale;
    effect.dispatchBlocked ||= definition.dispatchBlocked && incident.phase !== 'mitigated';
    effect.vehicleSpeedMultiplier *= 1 - (1 - definition.vehicleSpeedMultiplier) * scale;
  }
  return {
    productionMultiplier: clamp(effect.productionMultiplier, 0.2, 1),
    energyMultiplier: clamp(effect.energyMultiplier, 0.5, 1.5),
    qualityPenalty: clamp(effect.qualityPenalty, 0, 30),
    dispatchBlocked: effect.dispatchBlocked,
    vehicleSpeedMultiplier: clamp(effect.vehicleSpeedMultiplier, 0.25, 1),
  };
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
      label: translate(messages, 'constraintStorageLabel'),
      detail: translate(messages, 'constraintStorageDetail', {
        percent: formatFixed(Math.round(context.storageUtilization * 100), 0),
      }),
      relatedId: null,
    });
  }
  const activeOrder = state.orders.find((order) => order.id === state.activeOrderId);
  if (activeOrder && context.sourceInventoryKg <= EPSILON_KG) {
    constraints.push({
      id: `recipe-feed-${activeOrder.id}`,
      severity: 'critical',
      label: translate(messages, 'constraintFeedLabel'),
      detail: translate(messages, 'constraintFeedDetail', {
        material: sourceMaterialName(activeOrder.recipe.sourceMaterial),
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
      constraints.push({
        id: `order-due-${nextOrder.id}`,
        severity: remainingMinutes <= 0 ? 'critical' : 'warning',
        label: translate(
          messages,
          remainingMinutes <= 0 ? 'constraintOverdueLabel' : 'constraintDueSoonLabel'
        ),
        detail:
          remainingMinutes <= 0
            ? translate(messages, 'constraintOverdueDetail', {
                customer: nextOrder.customer,
                count: Math.max(1, Math.ceil(-remainingMinutes)),
                minutes: formatFixed(Math.max(1, Math.ceil(-remainingMinutes)), 0),
              })
            : translate(messages, 'constraintDueSoonDetail', {
                customer: nextOrder.customer,
                count: Math.ceil(remainingMinutes),
                minutes: formatFixed(Math.ceil(remainingMinutes), 0),
              }),
        relatedId: nextOrder.id,
      });
    }
  }
  if (incidentEffect.dispatchBlocked) {
    constraints.push({
      id: 'dispatch-isolated',
      severity: 'critical',
      label: translate(messages, 'constraintDispatchLabel'),
      detail: translate(messages, 'constraintDispatchDetail'),
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
      label: translate(messages, 'constraintMaintenanceLabel'),
      detail: order
        ? translate(messages, 'constraintMachineDownDetail', {
            machine: order.machineName,
            workOrderId: order.id,
            others: context.openWorkOrders - 1,
            othersText: formatFixed(context.openWorkOrders - 1, 0),
          })
        : translate(messages, 'constraintMaintenanceDetail', {
            count: context.openWorkOrders,
            countText: formatFixed(context.openWorkOrders, 0),
          }),
      relatedId: order?.machineId ?? null,
    });
  }
  return constraints;
}

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
  incidents: ReadonlyArray<OperationalIncident>;
}

/**
 * One shift report from the evidence the campaign holds. Pure: the closing
 * tick and the live "this shift so far" view both call it.
 */
export function buildShiftReport(input: ShiftReportInput): ShiftCampaignReport {
  const { orders, startedAtMinute } = input;
  const completedHere = (order: CustomerOrder) =>
    order.status === 'fulfilled' &&
    order.completedAtMinute !== null &&
    order.completedAtMinute >= startedAtMinute;
  const open = (order: CustomerOrder) =>
    order.status !== 'fulfilled' && order.status !== 'cancelled';
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
    completed.filter((order) => order.completedAtMinute! > order.dueAtMinute + 1e-6).length,
    unsafe.map((incident) => ({
      title: incidentTitle(incident),
      detail: incidentDescription(incident),
      phase: incident.phase as ShiftOpenIncident['phase'],
    }))
  );
  const grade = gradeShift(gradeBasis);
  const locale = getLocale();
  const inWindow = input.logbook.filter(
    (entry) => entry.simulationMinute >= startedAtMinute && entry.category !== 'period'
  );
  // Every choice in the window is kept up to a generous bound; narration is
  // what the plant did and is only a tail.
  const choices: ShiftChoice[] = inWindow
    .filter((entry) => entry.actor === 'operator' || entry.actor === 'agent')
    .slice(-MAX_REPORT_CHOICES)
    .map((entry) => ({
      minute: entry.simulationMinute,
      actor: entry.actor as ShiftChoice['actor'],
      message: entry.message,
    }));
  return {
    id: input.id,
    shiftKey: input.shiftKey,
    shiftLabel: input.shiftLabel,
    startedAtMinute,
    endedAtMinute: input.endedAtMinute,
    metrics: { ...input.metrics },
    completedOrderIds: completed.map((order) => order.id),
    orderOutcomes: orders
      .filter((order) => completedHere(order) || open(order))
      .map((order) => ({
        id: order.id,
        customer: order.customer,
        requiredKg: order.requiredKg,
        shippedKg: order.shippedKg,
        dueAtMinute: order.dueAtMinute,
        completedAtMinute: completedHere(order) ? order.completedAtMinute : null,
        qualityFailureKg: order.qualityFailureKg,
      })),
    openRisks: [...input.risks],
    grade,
    gradeBasis,
    gradeReasons: shiftGradeReasons(gradeBasis, locale),
    decisions: choices.map((choice) => choice.message),
    choices,
    narration: inWindow
      .filter((entry) => (entry.actor ?? 'controller') === 'controller')
      .slice(-8)
      .map((entry) => entry.message),
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
>;

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
    risks: state.constraints
      .filter((constraint) => constraint.severity !== 'info')
      .map((constraint) => constraint.label),
    incidents: state.incidents,
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
        const incident = state.triggerIncident(definition.kind);
        if (!incident) return false;
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
          actor
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
          actor
        );
      },
      finishChallengeRecovery: (actor = 'controller') => {
        const state = get();
        const incident = getChallengeRecoveryIncident(state);
        if (!incident || incident.phase !== 'mitigated' || !incident.effectApplied) return false;
        state.resolveIncident(incident.id, actor);
        return true;
      },
      acceptNextProgramme: (actor = 'controller') => {
        const state = get();
        if (
          state.activeChallenge ||
          state.orders.some((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
        )
          return false;
        const programme = createInitialOrders().map((order, index) => ({
          ...order,
          id: `programme-${state.sequence + 1}-order-${index + 1}`,
          requiredKg: 3000,
          dueAtMinute: state.elapsedMinutes + 180 + index * 120,
        }));
        set({
          orders: [...state.orders.slice(-30), ...programme],
          activeOrderId: programme[0].id,
          execution: { ...createInitialExecution(), orderId: programme[0].id, remainingKg: 3000 },
        });
        state.addLogEntry(
          translate(messages, 'sourceOrderScheduler'),
          'operation',
          translate(messages, 'logProgrammeAccepted'),
          null,
          actor
        );
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
          const sequence = state.sequence + 1;
          return {
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
                  customer: selected.customer,
                  recipe: selected.recipe.label,
                }),
                relatedId: selected.id,
                actor,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      triggerIncident: (kind) => {
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
          affectedMachineId: definition.affectedMachineId,
          effectApplied: false,
        };
        set({
          incidents: appendBounded(state.incidents, incident, MAX_INCIDENTS),
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
                message: translate(messages, 'logIncidentAcknowledged', { title: target.title }),
                relatedId: incidentId,
                actor,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      mitigateIncident: (incidentId, actor = 'controller') =>
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
          return {
            incidents: state.incidents.map((incident) =>
              incident.id === incidentId
                ? {
                    ...incident,
                    phase: 'mitigated',
                    acknowledgedAtMinute: incident.acknowledgedAtMinute ?? state.elapsedMinutes,
                  }
                : incident
            ),
            shiftMetrics: {
              ...state.shiftMetrics,
              automaticActions: state.shiftMetrics.automaticActions + 1,
            },
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: translate(messages, 'sourceIncidentController'),
                category: 'operation',
                message: translate(messages, 'logIncidentMitigated', { title: target.title }),
                relatedId: incidentId,
                actor,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      resolveIncident: (incidentId, actor = 'controller') =>
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
          return {
            incidents: state.incidents.map((incident) =>
              incident.id === incidentId
                ? { ...incident, phase: 'resolved', resolvedAtMinute: state.elapsedMinutes }
                : incident
            ),
            shiftMetrics: {
              ...state.shiftMetrics,
              incidentsResolved: state.shiftMetrics.incidentsResolved + 1,
              automaticActions: state.shiftMetrics.automaticActions + 1,
            },
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: translate(messages, 'sourceIncidentController'),
                category: 'maintenance',
                message: translate(messages, 'logIncidentResolved', { title: target.title }),
                relatedId: incidentId,
                actor,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      markIncidentEffectApplied: (incidentId) =>
        set((state) => ({
          incidents: state.incidents.map((incident) =>
            incident.id === incidentId ? { ...incident, effectApplied: true } : incident
          ),
        })),

      addLogEntry: (source, category, message, relatedId = null, actor = 'controller') =>
        set((state) => {
          const trimmed = message.trim();
          if (!trimmed) return state;
          const sequence = state.sequence + 1;
          return {
            sequence,
            logbook: appendBounded(
              state.logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: state.elapsedMinutes,
                source: source.trim() || translate(messages, 'sourceControlLayer'),
                category,
                message: trimmed,
                relatedId,
                actor,
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
              for (const order of orders
                .filter(
                  (candidate) =>
                    candidate.status !== 'fulfilled' &&
                    candidate.status !== 'cancelled' &&
                    candidate.recipe.finishedMaterial === material
                )
                .sort(
                  (a, b) =>
                    priorityRank(a.priority) - priorityRank(b.priority) ||
                    a.dueAtMinute - b.dueAtMinute
                )) {
                if (productRemaining <= EPSILON_KG) break;
                const needed = Math.max(0, order.requiredKg - order.shippedKg);
                const allocated = Math.min(needed, productRemaining);
                if (allocated <= EPSILON_KG) continue;
                order.shippedKg += allocated;
                productRemaining -= allocated;
                allocatedManifestKg += allocated;
                if (!order.batchIds.includes(product.batchId)) order.batchIds.push(product.batchId);
                if (!order.manifestIds.includes(manifest.id)) order.manifestIds.push(manifest.id);
                // Each batch is judged at the quality it was packed at; batches
                // saved before that was recorded fall back to the plant reading.
                const shippedQuality = Number.isFinite(batch.qualityScore)
                  ? (batch.qualityScore as number)
                  : context.averageQuality;
                if (shippedQuality < order.recipe.minimumQuality) {
                  order.qualityFailureKg += allocated;
                  shiftMetrics.qualityFailureKg = (shiftMetrics.qualityFailureKg ?? 0) + allocated;
                  economics.latePenalties += allocated * 0.08;
                  shiftMetrics.latePenalties += allocated * 0.08;
                }
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
                    kg: formatFixed(allocatedManifestKg, 1),
                  }),
                  relatedId: manifest.id,
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
          let activeOrderId = state.activeOrderId;
          const active = orders.find((order) => order.id === activeOrderId);
          if (!active || active.status === 'fulfilled' || active.status === 'cancelled') {
            activeOrderId =
              orders
                .filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
                .sort(
                  (a, b) =>
                    priorityRank(a.priority) - priorityRank(b.priority) ||
                    a.dueAtMinute - b.dueAtMinute
                )[0]?.id ?? null;
            orders = orders.map((order) =>
              order.id === activeOrderId && order.status === 'planned'
                ? { ...order, status: 'active' }
                : order
            );
          }

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
            const levelPercent = clamp(
              ((currentLitres - consumptionLitres) / asset.capacityLitres) * 100,
              0,
              100
            );
            return {
              ...asset,
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
          const energyCost =
            effectiveEnergyKw *
            (minuteOfDay >= 540 && minuteOfDay <= 1260 ? 0.15 : 0.08) *
            deltaHours;
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
          )
            shiftMetrics.commitmentMinutes = (shiftMetrics.commitmentMinutes ?? 0) + deltaMinutes;
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
          if (currentShiftKey !== context.shiftKey) {
            const risks = makeConstraints(constraintInput, context, incidentEffect)
              .filter((constraint) => constraint.severity !== 'info')
              .map((constraint) => constraint.label);
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
              risks,
              incidents: state.incidents,
            });
            reports = appendBounded(reports, report, MAX_REPORTS);
            currentShiftKey = context.shiftKey;
            currentShiftLabel = context.shiftLabel;
            shiftStartedAtMinute = elapsedMinutes;
            shiftMetrics = { ...ZERO_SHIFT_METRICS };
          }

          const constraints = makeConstraints(constraintInput, context, incidentEffect);
          const activeOrder = orders.find((order) => order.id === activeOrderId);
          const execution = deriveExecution(activeOrder, elapsedMinutes, {
            ...context,
            dispatchReleased: context.dispatchReleased && !incidentEffect.dispatchBlocked,
          });
          if (
            execution.orderId !== state.execution.orderId ||
            execution.stage !== state.execution.stage
          ) {
            sequence += 1;
            logbook = appendBounded(
              logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: elapsedMinutes,
                source: translate(messages, 'sourceProductionExecution'),
                category: execution.stage === 'quality_hold' ? 'quality' : 'operation',
                message: executionMessage(execution),
                relatedId: execution.orderId,
              },
              MAX_LOG_ENTRIES
            );
          }

          let activeChallenge = state.activeChallenge;
          let challengeHistory = state.challengeHistory;
          if (activeChallenge) {
            const order = orders.find((candidate) => candidate.id === activeChallenge?.orderId);
            const incident = state.incidents.find(
              (candidate) => candidate.id === activeChallenge?.incidentId
            );
            const safe =
              order &&
              order.qualityFailureKg <= activeChallenge.startingQualityFailureKg &&
              context.dispatchReleased &&
              !incidentEffect.dispatchBlocked &&
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
              order.shippedKg - activeChallenge.startingShippedKg + EPSILON_KG >=
                activeChallenge.targetKg;
            const failed =
              elapsedMinutes >= activeChallenge.deadlineMinute ||
              !order ||
              order.qualityFailureKg > activeChallenge.startingQualityFailureKg;
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
              activeChallenge = null;
            }
          }
          return {
            initialized: true,
            activeChallenge,
            challengeHistory,
            creditedBatchKg: Object.fromEntries(Object.entries(creditedBatchKg).slice(-1000)),
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

      getLineProductionPlan: (finishedAvailableKg) => {
        const state = get();
        const active = state.orders.find((candidate) => candidate.id === state.activeOrderId);
        if (!active || active.status === 'fulfilled' || active.status === 'cancelled') return null;
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
                order.status !== 'cancelled'
            )
            .sort(
              (a, b) =>
                priorityRank(a.priority) - priorityRank(b.priority) || a.dueAtMinute - b.dueAtMinute
            ),
        ];
        const stock = { flour: 0, semolina: 0, ...finishedAvailableKg };
        const queuedKg = { flour: 0, semolina: 0 };
        for (const order of queue) {
          const material = order.recipe.finishedMaterial;
          const remainingKg = Math.max(0, order.requiredKg - order.shippedKg);
          queuedKg[material] += remainingKg;
          const covered = Math.min(remainingKg, Math.max(0, stock[material]));
          stock[material] -= covered;
          if (remainingKg - covered > 1)
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

      getProductionMultiplier: () => {
        const state = get();
        const incident = combinedIncidentEffect(state.incidents).productionMultiplier;
        const setpoint = clamp(state.execution.lineSetpointPercent / 100, 0, 1.08);
        return clamp(incident * setpoint, 0, 1.08);
      },

      getIncidentEffect: () => combinedIncidentEffect(get().incidents),
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
            ? {
                orders: restored.orders.map((order) => {
                  const recipeId = order?.recipe?.id;
                  return typeof recipeId === 'string' &&
                    Object.prototype.hasOwnProperty.call(MILL_RECIPES, recipeId)
                    ? { ...order, recipe: MILL_RECIPES[recipeId] }
                    : order;
                }),
              }
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
