import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MaterialManifest, MaterialType, ProductionBatch } from './materialFlowStore';
import { safeJSONStorage } from './storage';
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';

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

export interface ShiftCampaignMetrics extends CampaignEconomics {
  dispatchedKg: number;
  incidentsResolved: number;
  automaticActions: number;
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
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
}

export interface CampaignLogEntry {
  id: string;
  simulationMinute: number;
  source: string;
  category: LogCategory;
  message: string;
  relatedId: string | null;
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
  elapsedMinutes: number;
  orders: CustomerOrder[];
  activeOrderId: string | null;
  incidents: OperationalIncident[];
  economics: CampaignEconomics;
  shiftMetrics: ShiftCampaignMetrics;
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
  activateOrder: (orderId: string) => void;
  triggerIncident: (kind: IncidentKind) => OperationalIncident | null;
  acknowledgeIncident: (incidentId: string) => void;
  mitigateIncident: (incidentId: string) => void;
  resolveIncident: (incidentId: string) => void;
  markIncidentEffectApplied: (incidentId: string) => void;
  addLogEntry: (
    source: string,
    category: LogCategory,
    message: string,
    relatedId?: string | null
  ) => void;
  tickCampaign: (deltaSimulationSeconds: number, context: CampaignTickContext) => void;
  getActiveProductionPlan: () => {
    orderId: string;
    sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
    finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
    lineSetpointPercent: number;
  } | null;
  getProductionMultiplier: () => number;
  getIncidentEffect: () => IncidentEffect;
  resetCampaign: () => void;
}

const MAX_LOG_ENTRIES = 160;
const MAX_REPORTS = 12;
const MAX_INCIDENTS = 32;
const MAX_PROCESSED_MANIFESTS = 120;
const EPSILON_KG = 1e-6;
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
  incidentsResolved: 0,
  automaticActions: 0,
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
    label: 'Strong white bread flour',
    finishedMaterial: 'flour',
    sourceMaterial: 'wheat_grain',
    minimumQuality: 95,
  },
  fine_semolina: {
    id: 'fine_semolina',
    label: 'Fine corn semolina',
    finishedMaterial: 'semolina',
    sourceMaterial: 'corn_grain',
    minimumQuality: 90,
  },
  community_flour: {
    id: 'community_flour',
    label: 'Community all-purpose flour',
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
    title: 'Roller mill bearing overheat',
    description: 'R.M. 101 bearing temperature is rising toward the trip point.',
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
    title: 'Dust filter differential pressure',
    description: 'Extraction resistance is increasing around the sifting floor.',
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
    title: 'Site power sag',
    description: 'Incoming voltage is unstable and motor protection is limiting load.',
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
    title: 'Delayed dispatch truck',
    description: 'The scheduled collection is delayed, increasing finished goods pressure.',
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
    title: 'Supplier contamination alert',
    description: 'A source lot notification requires an immediate hold and traceability review.',
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
    title: 'Packaging material shortage',
    description: 'Packer consumables are below the active order requirement.',
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
    title: 'Severe rain and drainage loading',
    description: 'Yard drainage and the stream are rising, slowing vehicle movements.',
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
    title: 'Control network degraded',
    description: 'Redundant control links have fallen below the required availability threshold.',
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
    elapsedMinutes: 0,
    orders: createInitialOrders(),
    activeOrderId: 'order-001' as string | null,
    incidents: [] as OperationalIncident[],
    economics: { ...ZERO_ECONOMICS },
    shiftMetrics: { ...ZERO_SHIFT_METRICS },
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
  let stage: FulfillmentStage = 'milling';
  if (order.status === 'fulfilled' || remainingKg <= EPSILON_KG) stage = 'fulfilled';
  else if (context.dispatchLoad.status === 'departed' && context.dispatchLoad.lastDispatchKg > 0)
    stage = 'dispatched';
  else if (context.dispatchLoad.status === 'ready') stage = 'ready_to_dispatch';
  else if (context.dispatchLoad.status === 'loading') stage = 'loading';
  else if (context.dispatchLoad.status === 'held' || !context.dispatchReleased)
    stage = 'quality_hold';
  else if (context.releasedFinishedKg > EPSILON_KG) stage = 'ready_to_load';
  return {
    orderId: order.id,
    recipeId: order.recipe.id,
    sourceMaterial: order.recipe.sourceMaterial,
    finishedMaterial: order.recipe.finishedMaterial,
    stage,
    lineSetpointPercent: deriveLineSetpoint(order, elapsedMinutes, context.sourceInventoryKg),
    remainingKg,
    sourceInventoryKg: context.sourceInventoryKg,
    finishedAvailableKg: context.finishedAvailableKg,
    releasedFinishedKg: context.releasedFinishedKg,
    qualityReleased: context.dispatchReleased,
    dispatchLoad: { ...context.dispatchLoad },
  };
}

function executionMessage(execution: OrderExecutionState): string {
  switch (execution.stage) {
    case 'planning':
      return 'Production route planned.';
    case 'milling':
      return `Processing ${execution.sourceMaterial?.replaceAll('_', ' ') ?? 'scheduled grain'} for the active recipe.`;
    case 'quality_hold':
      return execution.dispatchLoad.blockReason ?? 'Finished goods are held at the quality gate.';
    case 'ready_to_load':
      return 'Released finished goods are ready at the shipping bay.';
    case 'loading':
      return `Shipping load is ${execution.dispatchLoad.loadedKg.toFixed(0)} of ${execution.dispatchLoad.capacityKg.toFixed(0)} kg.`;
    case 'ready_to_dispatch':
      return 'The outbound load is ready for departure.';
    case 'dispatched':
      return `${execution.dispatchLoad.lastDispatchKg.toFixed(0)} kg left the shipping bay.`;
    case 'fulfilled':
      return execution.orderId === null
        ? 'All commitments fulfilled. The line is building stock at a reduced setpoint.'
        : 'Commitment fulfilled.';
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

function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
      label: 'Storage capacity',
      detail: `${Math.round(context.storageUtilization * 100)}% of material capacity is occupied.`,
      relatedId: null,
    });
  }
  const activeOrder = state.orders.find((order) => order.id === state.activeOrderId);
  if (activeOrder && context.sourceInventoryKg <= EPSILON_KG) {
    constraints.push({
      id: `recipe-feed-${activeOrder.id}`,
      severity: 'critical',
      label: 'Recipe feed unavailable',
      detail: `${sentenceStart(activeOrder.recipe.sourceMaterial.replaceAll('_', ' '))} inventory is empty.`,
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
        label: remainingMinutes <= 0 ? 'Commitment overdue' : 'Commitment due soon',
        detail:
          remainingMinutes <= 0
            ? `${nextOrder.customer} is ${Math.max(1, Math.ceil(-remainingMinutes))} simulated minutes overdue.`
            : `${Math.ceil(remainingMinutes)} simulated minutes remain for ${nextOrder.customer}.`,
        relatedId: nextOrder.id,
      });
    }
  }
  if (incidentEffect.dispatchBlocked) {
    constraints.push({
      id: 'dispatch-isolated',
      severity: 'critical',
      label: 'Dispatch isolated',
      detail: 'An active incident requires the shipping quality gate to remain closed.',
      relatedId:
        state.incidents.find(
          (incident) =>
            incident.phase !== 'resolved' &&
            incident.phase !== 'mitigated' &&
            INCIDENT_DEFINITIONS[incident.kind].effect.dispatchBlocked
        )?.id ?? null,
    });
  }
  if (context.openWorkOrders > 0) {
    constraints.push({
      id: 'maintenance-queue',
      severity: context.openWorkOrders > 3 ? 'warning' : 'info',
      label: 'Maintenance queue',
      detail: `${context.openWorkOrders} autonomous work order${context.openWorkOrders === 1 ? '' : 's'} open.`,
      relatedId: null,
    });
  }
  return constraints;
}

function gradePeriod(metrics: ShiftCampaignMetrics, risks: string[]): ShiftCampaignReport['grade'] {
  const margin =
    metrics.revenue -
    metrics.energyCost -
    metrics.automationCost -
    metrics.wasteCost -
    metrics.maintenanceCost -
    metrics.demurrageCost -
    metrics.latePenalties;
  if (risks.length === 0 && margin >= 0 && metrics.dispatchedKg >= 4000) return 'A';
  if (risks.length <= 1 && margin >= 0 && metrics.dispatchedKg >= 2500) return 'B';
  if (risks.length <= 2 && metrics.dispatchedKg > 0) return 'C';
  if (metrics.dispatchedKg > 0) return 'D';
  return 'F';
}

export const useOperationsCampaignStore = create<OperationsCampaignState>()(
  persist(
    (set, get) => ({
      ...emptyState(),

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
              source: 'Autonomous execution',
              category: 'operation',
              message: 'Production programme initialized from equipment and inventory state.',
              relatedId: state.activeOrderId,
            },
            MAX_LOG_ENTRIES
          ),
        }));
      },

      activateOrder: (orderId) =>
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
                source: 'Order scheduler',
                category: 'operation',
                message: `${selected.customer}: ${selected.recipe.label} is now the active commitment.`,
                relatedId: selected.id,
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
              source: 'Incident controller',
              category: definition.severity === 'critical' ? 'safety' : 'operation',
              message: definition.title,
              relatedId: incident.id,
            },
            MAX_LOG_ENTRIES
          ),
        });
        return incident;
      },

      acknowledgeIncident: (incidentId) =>
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
                source: 'Incident controller',
                category: 'operation',
                message: `${target.title} acknowledged.`,
                relatedId: incidentId,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      mitigateIncident: (incidentId) =>
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
                source: 'Incident controller',
                category: 'operation',
                message: `${target.title} mitigated; residual effect halved.`,
                relatedId: incidentId,
              },
              MAX_LOG_ENTRIES
            ),
          };
        }),

      resolveIncident: (incidentId) =>
        set((state) => {
          const target = state.incidents.find(
            (incident) => incident.id === incidentId && incident.phase !== 'resolved'
          );
          if (!target) return state;
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
                source: 'Incident controller',
                category: 'maintenance',
                message: `${target.title} resolved and controls returned to normal.`,
                relatedId: incidentId,
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

      addLogEntry: (source, category, message, relatedId = null) =>
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
                source: source.trim() || 'Control layer',
                category,
                message: trimmed,
                relatedId,
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
          let processedManifestIds = [...state.processedManifestIds];
          const economics = { ...state.economics };
          let shiftMetrics = { ...state.shiftMetrics };
          const incidentEffect = combinedIncidentEffect(state.incidents);
          const batchesById = new Map(context.productionBatches.map((batch) => [batch.id, batch]));

          for (const manifest of context.manifests) {
            if (manifest.kind !== 'shipping' || processedManifestIds.includes(manifest.id))
              continue;
            processedManifestIds.push(manifest.id);
            let remaining = manifest.actualKg;
            for (const product of manifest.productBatches) {
              // A batch can be split across orders, but never beyond its own mass.
              let productRemaining = product.amount;
              const batch = batchesById.get(product.batchId);
              const material = batch?.materialType ?? manifest.materials[0]?.type;
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
                if (remaining <= EPSILON_KG || productRemaining <= EPSILON_KG) break;
                const needed = Math.max(0, order.requiredKg - order.shippedKg);
                const allocated = Math.min(needed, remaining, productRemaining);
                if (allocated <= EPSILON_KG) continue;
                order.shippedKg += allocated;
                remaining -= allocated;
                productRemaining -= allocated;
                if (!order.batchIds.includes(product.batchId)) order.batchIds.push(product.batchId);
                if (!order.manifestIds.includes(manifest.id)) order.manifestIds.push(manifest.id);
                if (context.averageQuality < order.recipe.minimumQuality) {
                  order.qualityFailureKg += allocated;
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
            sequence += 1;
            logbook = appendBounded(
              logbook,
              {
                id: `log-${String(sequence).padStart(4, '0')}`,
                simulationMinute: elapsedMinutes,
                source: 'Dispatch controller',
                category: 'operation',
                message: `${manifest.id} allocated ${manifest.actualKg.toFixed(1)} kg across active commitments.`,
                relatedId: manifest.id,
              },
              MAX_LOG_ENTRIES
            );
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
          // The material-flow waste counter is per session; if it restarted
          // below the last reading, everything it now holds is new waste.
          const newWasteKg =
            context.wasteKg >= state.lastWasteKg
              ? context.wasteKg - state.lastWasteKg
              : context.wasteKg;
          const wasteCost = Math.max(0, newWasteKg) * 0.18;
          const maintenanceCost = context.openWorkOrders * 90 * deltaHours;
          const demurrageCost =
            context.shippingDocked && (!context.dispatchReleased || incidentEffect.dispatchBlocked)
              ? 120 * deltaHours
              : 0;
          const latePenalties = orders.reduce((sum, order) => {
            if (order.status !== 'late') return sum;
            return (
              sum +
              Math.max(0, order.requiredKg - order.shippedKg) *
                order.latePenaltyPerKgHour *
                deltaHours
            );
          }, 0);
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
            const grade = gradePeriod(shiftMetrics, risks);
            sequence += 1;
            const report: ShiftCampaignReport = {
              id: `period-report-${String(sequence).padStart(4, '0')}`,
              shiftKey: currentShiftKey,
              shiftLabel: currentShiftLabel,
              startedAtMinute: shiftStartedAtMinute,
              endedAtMinute: elapsedMinutes,
              metrics: { ...shiftMetrics },
              completedOrderIds: orders
                .filter(
                  (order) =>
                    order.status === 'fulfilled' &&
                    order.completedAtMinute !== null &&
                    order.completedAtMinute >= shiftStartedAtMinute
                )
                .map((order) => order.id),
              openRisks: risks,
              grade,
              summary:
                grade === 'A' || grade === 'B'
                  ? 'Commitments, controls, and recovery actions remained coherent through the period.'
                  : 'The next period inherits material constraints or unresolved operational risk.',
            };
            reports = appendBounded(reports, report, MAX_REPORTS);
            currentShiftKey = context.shiftKey;
            currentShiftLabel = context.shiftLabel;
            shiftStartedAtMinute = elapsedMinutes;
            shiftMetrics = { ...ZERO_SHIFT_METRICS };
          }

          const constraints = makeConstraints(constraintInput, context, incidentEffect);
          const activeOrder = orders.find((order) => order.id === activeOrderId);
          const execution = deriveExecution(activeOrder, elapsedMinutes, context);
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
                source: 'Production execution',
                category: execution.stage === 'quality_hold' ? 'quality' : 'operation',
                message: executionMessage(execution),
                relatedId: execution.orderId,
              },
              MAX_LOG_ENTRIES
            );
          }

          return {
            initialized: true,
            elapsedMinutes,
            orders,
            activeOrderId,
            economics,
            shiftMetrics,
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
      version: 2,
      partialize: (state) => ({
        initialized: state.initialized,
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
      // Material-flow manifest ids and the waste counter restart every session,
      // so their bookkeeping must too: a restored id list skipped the new
      // session's colliding shipping-000N manifests (no revenue, no fulfilment).
      // Older blobs still carry both fields, hence a merge, not just partialize.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted && typeof persisted === 'object'
          ? (persisted as Partial<OperationsCampaignState>)
          : {}),
        processedManifestIds: [],
        lastWasteKg: 0,
      }),
    }
  )
);
