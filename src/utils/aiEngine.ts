/**
 * Autonomous plant decision engine.
 *
 * The engine watches process equipment, production flow, safety interlocks,
 * logistics routes, weather, and the active strategic backend. It is
 * deliberately limited to equipment and process state, with one standing
 * duty beside it: carrying out the adjustments colleagues asked for
 * (aiAccommodation.ts), from the agreements and schedules alone.
 */

import type { AIDecision, AlertData, MachineData } from '../types';
import { getWearConfig, useProductionStore } from '../stores/productionStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import type { WorkplaceState } from '../types/workplace';
import { cloudAIClient, type CloudResult } from './cloudAIClient';
import { chatgptClient } from './chatgptClient';
import { SpendCapError } from './spendBudget';
import { webgpuClient } from './webgpuClient';
import { initializeOnDeviceOperator } from './onDeviceOperator';
import { logger } from './logger';
import { readPlantClock } from './timeFormatting';
import { createTranslator, formatFixed, getLocale, translate, type Locale } from '../i18n';
import { aiEngineMessages as msg } from './aiEngine.messages';
import { alertText, sanitizeKeyedLine } from '../i18n/alertCopy';
import { resetAccommodationDecisions, stepAccommodationDecisions } from './aiAccommodation';

export const AI_ENGINE_TIMING = {
  tacticalDecisionInterval: 6000,
  strategicDecisionInterval: 45000,
  predictionUpdateInterval: 5000,
  metricsUpdateInterval: 1500,
  loopInterval: 2000,
  trendAnalysisCooldown: 60000,
  correlationAnalysisCooldown: 45000,
  anomalyDetectionCooldown: 30000,
  heatmapAnalysisCooldown: 90000,
  optimizationAnalysisCooldown: 45000,
  predictionAnalysisCooldown: 90000,
  safetyAnalysisCooldown: 30000,
  weatherDecisionCooldown: 120000,
} as const;

type DecisionType = AIDecision['type'];
type MetricName = 'temperature' | 'vibration' | 'load';

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface TrendData {
  machineId: string;
  metric: MetricName;
  history: MetricPoint[];
  direction: 'rising' | 'falling' | 'stable';
  rate: number;
}

interface PredictedEvent {
  id: string;
  machineId: string;
  event: string;
  probability: number;
  confidence: number;
  expectedAt: number;
  evidence: string[];
}

interface CrossMachinePattern {
  id: string;
  machineIds: string[];
  description: string;
  confidence: number;
  detectedAt: number;
}

interface AnomalyRecord {
  id: string;
  machineId: string;
  metric: MetricName;
  value: number;
  expectedRange: [number, number];
  severity: 'warning' | 'critical';
  detectedAt: number;
}

interface RouteHotspot {
  id: string;
  x: number;
  z: number;
  intensity: number;
  source: 'forklift' | 'truck' | 'dock';
}

interface DecisionImpactStats {
  totalDecisions: number;
  successfulDecisions: number;
  preventedShutdowns: number;
  estimatedSavings: number;
  shiftStart: number;
  byType: Record<DecisionType, { count: number; successRate: number }>;
}

interface ProductionTargets {
  daily: number;
  shift: number;
  current: number;
}

const MAX_METRIC_POINTS = 60;
const MAX_PREDICTED_EVENTS = 10;
const MAX_ANOMALIES = 100;
/** productionStore keeps 50 decisions; ten stay free for alert reactions and strategic plans. */
const TACTICAL_UNRESOLVED_LIMIT = 40;

const createTypeStats = (): DecisionImpactStats['byType'] => ({
  coordination: { count: 0, successRate: 0 },
  optimization: { count: 0, successRate: 0 },
  prediction: { count: 0, successRate: 0 },
  maintenance: { count: 0, successRate: 0 },
  safety: { count: 0, successRate: 0 },
});

const metricHistory = new Map<string, TrendData>();
const outcomeHistory = new Map<DecisionType, boolean[]>();
const machineDecisionCounts = new Map<string, number>();
const activeCooldowns = new Map<string, number>();
const pendingChains = new Map<string, string[]>();
let predictedEvents: PredictedEvent[] = [];
const crossMachinePatterns: CrossMachinePattern[] = [];
let anomalyHistory: AnomalyRecord[] = [];
const routeHotspots: RouteHotspot[] = [];
let drillPhase: 'none' | 'alert' | 'isolation' | 'verification' | 'review' = 'none';
let impactStats: DecisionImpactStats = {
  totalDecisions: 0,
  successfulDecisions: 0,
  preventedShutdowns: 0,
  estimatedSavings: 0,
  shiftStart: Date.now(),
  byType: createTypeStats(),
};
const productionTargets: ProductionTargets = { daily: 50000, shift: 16000, current: 0 };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getMachines(): MachineData[] {
  try {
    return useProductionStore.getState().machines ?? [];
  } catch {
    return [];
  }
}

function updateMetricHistory(machines: MachineData[], now = Date.now()): void {
  for (const machine of machines) {
    for (const metric of ['temperature', 'vibration', 'load'] as const) {
      const key = `${machine.id}-${metric}`;
      const value = finite(machine.metrics?.[metric]);
      const existing = metricHistory.get(key);
      const history = [...(existing?.history ?? []), { timestamp: now, value }].slice(
        -MAX_METRIC_POINTS
      );
      const first = history[0]?.value ?? value;
      const last = history.at(-1)?.value ?? value;
      const rate = history.length > 1 ? (last - first) / (history.length - 1) : 0;
      const direction = rate > 0.08 ? 'rising' : rate < -0.08 ? 'falling' : 'stable';
      metricHistory.set(key, { machineId: machine.id, metric, history, direction, rate });
    }
  }
}

function recordAnomalies(machines: MachineData[], now = Date.now()): void {
  const thresholds: Record<MetricName, { warning: number; critical: number }> = {
    temperature: { warning: 65, critical: 80 },
    vibration: { warning: 3, critical: 4.5 },
    load: { warning: 88, critical: 97 },
  };
  for (const machine of machines) {
    for (const metric of Object.keys(thresholds) as MetricName[]) {
      const value = finite(machine.metrics?.[metric]);
      const threshold = thresholds[metric];
      if (value < threshold.warning) continue;
      anomalyHistory.push({
        id: makeId('anomaly'),
        machineId: machine.id,
        metric,
        value,
        expectedRange: [0, threshold.warning],
        severity: value >= threshold.critical ? 'critical' : 'warning',
        detectedAt: now,
      });
    }
  }
  anomalyHistory = anomalyHistory.slice(-MAX_ANOMALIES);
}

function recordPrediction(machine: MachineData, now = Date.now()): void {
  const temperature = finite(machine.metrics?.temperature);
  const vibration = finite(machine.metrics?.vibration);
  const wear = finite(machine.metrics?.wear);
  const probability = clamp(
    25 + Math.max(0, temperature - 55) * 1.2 + vibration * 6 + wear * 0.35,
    0,
    98
  );
  if (probability < 55) return;
  predictedEvents = [
    ...predictedEvents.filter((event) => event.machineId !== machine.id),
    {
      id: makeId('prediction'),
      machineId: machine.id,
      event: 'Automatic protective derate may engage',
      probability,
      confidence: clamp(probability - 5, 50, 95),
      expectedAt: now + Math.round((100 - probability) * 60000),
      evidence: [
        `Temperature ${temperature.toFixed(1)} C`,
        `Vibration ${vibration.toFixed(2)} mm/s`,
        `Wear ${wear.toFixed(1)} percent`,
      ],
    },
  ].slice(-MAX_PREDICTED_EVENTS);
}

function recordDecision(decision: AIDecision): AIDecision | null {
  const store = useProductionStore.getState();
  const accepted = store.addAIDecision?.(decision);
  if (accepted !== true) return null;
  if (decision.machineId) {
    machineDecisionCounts.set(
      decision.machineId,
      (machineDecisionCounts.get(decision.machineId) ?? 0) + 1
    );
  }
  return decision;
}

// ---------------------------------------------------------------------------
// Card copy that follows the interface language
// ---------------------------------------------------------------------------

type EngineMessageKey = keyof (typeof msg)['en'] & string;

/** One line of a card as a catalogue key and raw params (numbers are formatted when shown). */
export interface DecisionCopyEntry {
  key: EngineMessageKey;
  params?: Record<string, string | number>;
}

/** The keyed form of a card's text, saved with the card. */
export interface DecisionCopy {
  action?: DecisionCopyEntry;
  reasoning?: DecisionCopyEntry;
  impact?: DecisionCopyEntry;
  /** An alert reaction's reason: the keys of the alert it quotes (src/i18n/alertCopy). */
  alert?: AlertData['copy'];
}

/** An engine card: the stored text is the language it was filed in; `copy` re-renders it. */
export type KeyedDecision = AIDecision & { copy?: DecisionCopy };

// Decimal places per numeric param, as the cards have always printed them.
const COPY_PARAM_DIGITS: Record<string, number> = { temperature: 1, vibration: 2 };

function renderCopy(entry: DecisionCopyEntry | undefined, stored: string, locale: Locale): string {
  // A card saved before keys were kept, or by a later build with a key this
  // build lacks, shows the text it was recorded with.
  if (
    !entry ||
    typeof entry.key !== 'string' ||
    !Object.prototype.hasOwnProperty.call(msg.en, entry.key)
  )
    return stored;
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(entry.params ?? {})) {
    params[name] =
      typeof value === 'number' ? formatFixed(value, COPY_PARAM_DIGITS[name] ?? 0, locale) : value;
  }
  return createTranslator(msg, locale)(entry.key, params);
}

/** The alert's words as the bell shows them now; its stored quote if a key is unknown. */
function alertReasoning(alertCopy: NonNullable<AlertData['copy']>, stored: string): string {
  const text = alertText({ title: '', message: '', copy: alertCopy });
  return text.title && text.message ? `${text.title}: ${text.message}` : stored;
}

/**
 * The text a decision card shows, in `locale`. A card the engine filed keeps
 * its copy as keys, so a pending card the player still has to answer reads in
 * the language they switched to; an operator's modified action, model text and
 * cards recorded before keys were kept show what was stored.
 */
export function decisionCardText(
  decision: AIDecision,
  locale: Locale = getLocale()
): { action: string; reasoning: string; impact: string; note?: string; outcome?: string } {
  const copy = (decision as KeyedDecision).copy;
  const response = decision.response;
  const t = createTranslator(msg, locale);
  const modified = response?.disposition === 'modified' && Boolean(response.modifiedAction);
  // The engine's deferral notes are its own (sweepDeferredDecisions): a pending
  // card handed back, and a deferral that lapsed.
  const returned =
    decision.status === 'pending' &&
    response?.disposition === 'deferred' &&
    response.deferralReturned === true;
  const lapsed = decision.status === 'superseded' && response?.disposition === 'deferred';
  return {
    action: modified ? decision.action : renderCopy(copy?.action, decision.action, locale),
    reasoning: copy?.alert
      ? alertReasoning(copy.alert, decision.reasoning)
      : renderCopy(copy?.reasoning, decision.reasoning, locale),
    impact: renderCopy(copy?.impact, decision.impact, locale),
    note: returned
      ? t('deferralReturned', {
          hours: formatFixed(DEFERRAL_RETURN_PLANT_HOURS, 0, locale),
          lapse: formatFixed(DEFERRAL_LAPSE_PLANT_HOURS, 0, locale),
        })
      : lapsed
        ? t('deferralLapsed', {
            hours: formatFixed(DEFERRAL_RETURN_PLANT_HOURS + DEFERRAL_LAPSE_PLANT_HOURS, 0, locale),
          })
        : response?.note,
    outcome: lapsed
      ? t('deferralLapsed', {
          hours: formatFixed(DEFERRAL_RETURN_PLANT_HOURS + DEFERRAL_LAPSE_PLANT_HOURS, 0, locale),
        })
      : decision.outcome,
  };
}

/** Stored text in the language active now, beside the keys it was rendered from. */
function keyedText(
  copy: DecisionCopy
): Pick<KeyedDecision, 'action' | 'reasoning' | 'impact' | 'copy'> {
  const locale = getLocale();
  return {
    action: renderCopy(copy.action, '', locale),
    reasoning: renderCopy(copy.reasoning, '', locale),
    impact: renderCopy(copy.impact, '', locale),
    copy,
  };
}

function decisionForType(type: DecisionType, machine: MachineData): KeyedDecision {
  const temperature = finite(machine.metrics?.temperature);
  const vibration = finite(machine.metrics?.vibration);
  const load = finite(machine.metrics?.load);
  const wear = finite(machine.metrics?.wear);
  // A fixed figure per kind of card. It never moves with the player's answers:
  // agreement with the player is not evidence that the card was right.
  const common = {
    id: makeId(`plant-${type}`),
    timestamp: new Date(),
    type,
    status: 'pending' as const,
    machineId: machine.id,
    triggeredBy: 'metric' as const,
  };

  switch (type) {
    case 'coordination':
      return {
        ...common,
        ...keyedText({
          action: { key: 'coordinationAction', params: { machine: machine.name } },
          reasoning: { key: 'coordinationReasoning', params: { machineId: machine.id, load } },
          impact: { key: 'coordinationImpact' },
        }),
        confidence: 78,
        priority: load > 90 ? 'high' : 'medium',
      };
    case 'maintenance':
      return {
        ...common,
        ...keyedText({
          action: { key: 'maintenanceAction', params: { machine: machine.name } },
          reasoning: { key: 'maintenanceReasoning', params: { temperature, vibration, wear } },
          impact: { key: 'maintenanceImpact' },
        }),
        confidence: 82,
        priority: temperature >= 80 || vibration >= 4.5 || wear >= 85 ? 'critical' : 'high',
      };
    case 'safety':
      return {
        ...common,
        ...keyedText({
          action: { key: 'safetyAction', params: { machine: machine.name } },
          reasoning: { key: 'safetyReasoning' },
          impact: { key: 'safetyImpact' },
        }),
        confidence: 94,
        priority: 'critical',
      };
    case 'prediction':
      return {
        ...common,
        ...keyedText({
          action: { key: 'predictionAction', params: { machine: machine.name } },
          reasoning: {
            key: 'predictionReasoning',
            params: { temperature, vibration, load, wear },
          },
          impact: { key: 'predictionImpact' },
        }),
        confidence: 76,
        priority: temperature >= 80 || vibration >= 4.5 ? 'high' : 'medium',
      };
    case 'optimization':
      return {
        ...common,
        ...keyedText({
          action: { key: 'optimizationAction', params: { machine: machine.name } },
          reasoning: {
            key: 'optimizationReasoning',
            params: { load, efficiency: finite(machine.metrics?.efficiency, 100) },
          },
          impact: { key: 'optimizationImpact' },
        }),
        confidence: 74,
        priority: load > 90 ? 'high' : 'medium',
      };
  }
}

/**
 * The card kinds the rules layer files: each one does something when accepted
 * (safety idles a running unit, maintenance eases a tripped unit back, an
 * optimization trims the line rate). 'prediction' and 'coordination' changed
 * nothing when accepted (review 10, F3) and are no longer filed; the floor
 * decisions they stood beside are the partner's proposals now
 * (systems/partnerProposalRuntime.ts). Saved ones still read, and a pending one
 * is withdrawn (retireRemovedCards).
 */
const FILED_TYPES: ReadonlySet<DecisionType> = new Set(['safety', 'maintenance', 'optimization']);

export function generateContextAwareDecision(forceType?: DecisionType): AIDecision | null {
  const machines = getMachines();
  if (machines.length === 0) return null;

  const now = Date.now();
  updateMetricHistory(machines, now);
  recordAnomalies(machines, now);

  let emergencyTest = false;
  try {
    emergencyTest = Boolean(useGameSimulationStore.getState().emergencyDrillMode);
  } catch {
    emergencyTest = false;
  }
  drillPhase = emergencyTest ? 'isolation' : 'none';

  const ranked = [...machines].sort((a, b) => {
    const risk = (machine: MachineData) =>
      finite(machine.metrics?.temperature) +
      finite(machine.metrics?.vibration) * 12 +
      finite(machine.metrics?.wear) * 0.7 +
      finite(machine.metrics?.load) * 0.25 +
      (machine.status === 'critical' ? 100 : machine.status === 'warning' ? 40 : 0);
    return risk(b) - risk(a);
  });
  const machine = ranked[0];
  if (!machine) return null;
  recordPrediction(machine, now);

  const critical =
    machine.status === 'critical' ||
    finite(machine.metrics?.temperature) >= 80 ||
    finite(machine.metrics?.vibration) >= 4.5 ||
    finite(machine.metrics?.wear) >= 85;
  const warning =
    machine.status === 'warning' ||
    finite(machine.metrics?.temperature) >= 65 ||
    finite(machine.metrics?.vibration) >= 3 ||
    finite(machine.metrics?.load) >= 88 ||
    finite(machine.metrics?.wear) >= 65;
  // A unit in warning is the partner's to propose on (its wear prediction), not a card's.
  const type =
    forceType ??
    (emergencyTest ? 'safety' : critical ? 'maintenance' : warning ? null : 'optimization');
  if (type === null || !FILED_TYPES.has(type)) return null;
  // Only the player (or the agent) resolves a pending card, and the store
  // refuses every admission once its 50 cards are all unresolved. So file no
  // copy of a card still waiting, and stop filing tactical cards with room
  // left for alert reactions and strategic plans. Working if an unattended
  // engine never fills the queue.
  const decisions = useProductionStore.getState().aiDecisions ?? [];
  const unresolved = decisions.filter(
    (decision) => decision.status === 'pending' || decision.status === 'in_progress'
  );
  if (
    unresolved.length >= TACTICAL_UNRESOLVED_LIMIT ||
    unresolved.some(
      (decision) =>
        decision.status === 'pending' && decision.machineId === machine.id && decision.type === type
    )
  ) {
    return null;
  }
  return recordDecision(decisionForType(type, machine));
}

export function reactToAlert(alert: AlertData): AIDecision | null {
  const machine = getMachines().find((candidate) => candidate.id === alert.machineId);
  if (!machine) return null;
  // Alarms only (scheduleAlertReactions files nothing else): no 'prediction' card.
  if (alert.type !== 'critical' && alert.type !== 'safety' && alert.type !== 'warning') return null;
  const type: DecisionType =
    alert.type === 'critical' || alert.type === 'safety' ? 'safety' : 'maintenance';
  const base = decisionForType(type, machine);
  const reaction: KeyedDecision = {
    ...base,
    id: makeId('alert-response'),
    triggeredBy: 'alert',
    relatedAlertId: alert.id,
    // The alert's own words, as it was filed; a keyed alert's keys follow the language.
    reasoning: `${alert.title}: ${alert.message}`,
    copy: {
      action: base.copy?.action,
      impact: base.copy?.impact,
      ...(alert.copy ? { alert: alert.copy } : {}),
    },
  };
  return recordDecision(reaction);
}

export function applyDecisionEffects(
  decision: AIDecision,
  disposition: 'automatic' | 'accepted' | 'modified' = 'automatic',
  options?: { note?: string; modifiedAction?: string }
): void {
  const store = useProductionStore.getState();
  store.recordDecisionResponse?.(decision.id, disposition, options);

  if (decision.machineId && decision.type === 'safety') {
    // A safe state for a unit that is running. One already stopped stays as it
    // is: idling a tripped, worn-out or broken unit cleared its lockout.
    const machine = store.machines.find((item) => item.id === decision.machineId);
    if (machine?.status === 'running' || machine?.status === 'warning') {
      store.updateMachineStatus?.(machine.id, 'idle');
    }
  } else if (decision.machineId && decision.type === 'maintenance') {
    const machine = store.machines.find((item) => item.id === decision.machineId);
    // Only a trip eases back: a worn-out unit or open repair stays locked out
    // ('warning' is a running state), and a facility stop holds the unit until
    // its release. Working if no AI decision starts a unit under repair or a stop.
    if (
      machine?.status === 'critical' &&
      (machine.metrics.wear ?? 0) < getWearConfig(machine.type).breakdownThreshold &&
      !useBreakdownStore.getState().getBreakdownForMachine(machine.id)
    ) {
      const clock = useGameSimulationStore.getState();
      if (clock.emergencyActive) {
        store.updateMachineStatus?.(machine.id, 'idle');
        clock.setReleaseStatus?.(machine.id, 'warning');
      } else store.updateMachineStatus?.(machine.id, 'warning');
    }
  } else if (decision.type === 'optimization' && !decision.id.startsWith('strategic-')) {
    // A load-balancing decision trims the line rate by 2%, as its impact text
    // says. Strategic guidance only records priorities, and a stopped line
    // stays stopped. Working if no accepted decision silently changes pace.
    // The player's rate runs 0-200%: the trim only ever lowers it, and a rate
    // at or under its 55% floor is left as it is.
    const current = finite(store.productionSpeed, 1);
    if (current > 0.55) store.setProductionSpeed?.(Math.max(0.55, current * 0.98));
  }

  store.updateDecisionStatus?.(
    decision.id,
    'completed',
    disposition === 'automatic'
      ? translate(msg, 'completedAutomatic')
      : translate(msg, 'completedConfirmed')
  );
}

export function updateWelfareFromDecisionOutcome(
  _decision: AIDecision,
  _outcome: 'completed' | 'rejected' | 'modified' | 'deferred'
): void {
  // This compatibility boundary remains for persisted decision callbacks.
}

function recordDecisionOutcome(decision: AIDecision, success: boolean): void {
  const history = [...(outcomeHistory.get(decision.type) ?? []), success].slice(-30);
  outcomeHistory.set(decision.type, history);
  const successes = history.filter(Boolean).length;
  const rate = history.length > 0 ? successes / history.length : 0;

  impactStats.totalDecisions += 1;
  if (success) impactStats.successfulDecisions += 1;
  const typeStats = impactStats.byType[decision.type];
  typeStats.count += 1;
  typeStats.successRate = Math.round(rate * 100);
  if (
    success &&
    // pt-BR words match the same engine decisions as the English ones (aiEngine.messages.ts).
    /shutdown|safe state|derate|maintenance|desligamento|estado seguro|manutenção/i.test(
      `${decision.action} ${decision.impact}`
    )
  ) {
    impactStats.preventedShutdowns += 1;
    impactStats.estimatedSavings += 2500;
  }
}

export function trackDecisionOutcome(decision: AIDecision): void {
  if (!decision.outcome?.trim()) return;
  // Judged by status and the response, never by the outcome's words: those are
  // stored in the language active when they were filed.
  recordDecisionOutcome(
    decision,
    decision.status === 'completed' && decision.response?.disposition !== 'rejected'
  );
}

export function getPredictedEvents(): PredictedEvent[] {
  return clone(predictedEvents);
}

export function getCongestionHotspots(): RouteHotspot[] {
  return clone(routeHotspots);
}

export function getMetricTrends(): Map<string, TrendData> {
  return new Map([...metricHistory.entries()].map(([key, value]) => [key, clone(value)]));
}

export function getAIMemoryState() {
  return {
    machineDecisionCounts: Object.fromEntries(machineDecisionCounts),
    assetDecisionCounts: Object.fromEntries(machineDecisionCounts),
    activeCooldowns: Object.fromEntries(activeCooldowns),
    pendingChains: Object.fromEntries(pendingChains),
    predictedEvents: clone(predictedEvents),
    congestionHotspots: clone(routeHotspots),
    drillPhase,
  };
}

export function getImpactStats(): DecisionImpactStats {
  return clone(impactStats);
}

export function getProductionTargets(): ProductionTargets {
  return { ...productionTargets };
}

export function resetShiftStats(): void {
  impactStats = {
    totalDecisions: 0,
    successfulDecisions: 0,
    preventedShutdowns: 0,
    estimatedSavings: 0,
    shiftStart: Date.now(),
    byType: createTypeStats(),
  };
  productionTargets.current = 0;
}

export function getCrossMachinePatterns(): CrossMachinePattern[] {
  return clone(crossMachinePatterns);
}

export function getAnomalyHistory(): AnomalyRecord[] {
  return clone(anomalyHistory);
}

export function getSparklineData(machineId: string, metric: MetricName): number[] {
  const values = metricHistory
    .get(`${machineId}-${metric}`)
    ?.history.slice(-20)
    .map((point) => point.value);
  if (!values?.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value) => (value - min) / range);
}

export function shouldTriggerAudioCue(decision: AIDecision): boolean {
  return (
    decision.priority === 'critical' ||
    (decision.priority === 'high' && decision.type === 'safety') ||
    (decision.type === 'prediction' && /anomaly|anomalia/i.test(decision.action))
  );
}

let shiftObserverUnsubscribe: (() => void) | null = null;
let shiftObserverUsers = 0;
let lastObservedShift: string | null = null;

export function initializeShiftObserver(): () => void {
  if (!shiftObserverUnsubscribe) {
    lastObservedShift = useGameSimulationStore.getState().currentShift;
    shiftObserverUnsubscribe = useGameSimulationStore.subscribe((state) => {
      if (lastObservedShift && state.currentShift !== lastObservedShift) resetShiftStats();
      lastObservedShift = state.currentShift;
    });
  }
  shiftObserverUsers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    shiftObserverUsers = Math.max(0, shiftObserverUsers - 1);
    if (shiftObserverUsers > 0) return;
    shiftObserverUnsubscribe?.();
    shiftObserverUnsubscribe = null;
    lastObservedShift = null;
  };
}

let outcomeObserverUnsubscribe: (() => void) | null = null;
let outcomeObserverUsers = 0;
const trackedOutcomeIds = new Set<string>();
const MAX_TRACKED_OUTCOME_IDS = 500;

function trackTerminalOutcomeOnce(decision: AIDecision): void {
  if (
    !decision.outcome ||
    trackedOutcomeIds.has(decision.id) ||
    (decision.status !== 'completed' && decision.status !== 'superseded')
  ) {
    return;
  }
  trackedOutcomeIds.add(decision.id);
  while (trackedOutcomeIds.size > MAX_TRACKED_OUTCOME_IDS) {
    const oldestId = trackedOutcomeIds.values().next().value;
    if (oldestId === undefined) break;
    trackedOutcomeIds.delete(oldestId);
  }
  // A deferral that lapsed was never tried, so it counts in the outcome
  // statistics neither way.
  if (decision.status === 'superseded' && decision.response?.disposition === 'deferred') return;
  trackDecisionOutcome(decision);
}

export function initializeDecisionOutcomeTracking(): () => void {
  if (!outcomeObserverUnsubscribe) {
    outcomeObserverUnsubscribe = useProductionStore.subscribe((state) => {
      state.aiDecisions.forEach(trackTerminalOutcomeOnce);
    });
    const currentDecisions = useProductionStore.getState().aiDecisions;
    if (Array.isArray(currentDecisions)) currentDecisions.forEach(trackTerminalOutcomeOnce);
  }
  outcomeObserverUsers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    outcomeObserverUsers = Math.max(0, outcomeObserverUsers - 1);
    if (outcomeObserverUsers > 0) return;
    outcomeObserverUnsubscribe?.();
    outcomeObserverUnsubscribe = null;
  };
}

/** The delay before the rules layer answers a new machine alert. */
export const ALERT_REACTION_DELAY_MS = 1500;
const MAX_SEEN_ALERT_IDS = 500;
let alertReactionUnsubscribe: (() => void) | null = null;
let alertReactionUsers = 0;
const seenAlertIds = new Set<string>();
// One pending reaction per alert: a later alerts update (another alert, a
// dismissal, an acknowledgement) never cancels or repeats one already due.
const alertReactionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function markAlertSeen(id: string): void {
  seenAlertIds.add(id);
  while (seenAlertIds.size > MAX_SEEN_ALERT_IDS) {
    const oldestId = seenAlertIds.values().next().value;
    if (oldestId === undefined) break;
    seenAlertIds.delete(oldestId);
  }
}

function scheduleAlertReactions(alerts: AlertData[]): void {
  for (const alert of alerts) {
    if (seenAlertIds.has(alert.id)) continue;
    markAlertSeen(alert.id);
    if (
      !alert.machineId ||
      // Alarms only: a finished repair's success notice or an info note names
      // its machine too, and is no reason to raise a card about it.
      (alert.type !== 'warning' && alert.type !== 'critical' && alert.type !== 'safety') ||
      // The on-device operator's own notices (onDeviceOperator.ts notify) report
      // what an AI did; the rules layer does not answer them with a card.
      alert.id.startsWith('on-device-') ||
      alertReactionTimeouts.has(alert.id)
    ) {
      continue;
    }
    armAlertReaction(alert);
  }
}

function armAlertReaction(alert: AlertData): void {
  alertReactionTimeouts.set(
    alert.id,
    setTimeout(() => {
      alertReactionTimeouts.delete(alert.id);
      // Only a standing alert is a reason to act: one dismissed (often while
      // the clock was held) or returned to normal before this was due is not.
      const live = useUIStore.getState().alerts.find((item) => item.id === alert.id);
      if (!live || live.returnedToNormal) return;
      // A held shift clock freezes the plant, as it holds the engine's cards:
      // the reaction waits for the clock instead of idling a frozen machine. A
      // hidden tab stops the frames that run the plant, so it waits for that too.
      const clock = useGameSimulationStore.getState();
      if (clock.gameSpeed === 0 || clock.isTabVisible === false) {
        armAlertReaction(alert);
        return;
      }
      // Reactions are rules-layer cards: none while LLM-only mode pauses it.
      if (!isTacticalLayerActive()) return;
      const decision = reactToAlert(alert);
      if (decision) applyDecisionEffects(decision);
    }, ALERT_REACTION_DELAY_MS)
  );
}

/**
 * Answer each new machine alert with a rules-layer card, whether or not the AI
 * panel is open. Alerts already listed when the lease starts are left alone:
 * a safety reaction idles its machine, so only a live alert is a reason to act.
 * Leased like the other observers; the last release cancels pending reactions.
 */
export function initializeAlertReactions(): () => void {
  if (!alertReactionUnsubscribe) {
    seenAlertIds.clear();
    useUIStore.getState().alerts.forEach((alert) => markAlertSeen(alert.id));
    alertReactionUnsubscribe = useUIStore.subscribe((state, previous) => {
      if (state.alerts !== previous?.alerts) scheduleAlertReactions(state.alerts);
    });
  }
  alertReactionUsers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    alertReactionUsers = Math.max(0, alertReactionUsers - 1);
    if (alertReactionUsers > 0) return;
    alertReactionUnsubscribe?.();
    alertReactionUnsubscribe = null;
    alertReactionTimeouts.forEach((timeout) => clearTimeout(timeout));
    alertReactionTimeouts.clear();
    seenAlertIds.clear();
  };
}

function getActiveLLM(): {
  generateContent: (prompt: string) => Promise<CloudResult | null>;
  isConnected: () => boolean;
} {
  const backend = useAIConfigStore.getState().llmBackend;
  return backend === 'webgpu'
    ? {
        isConnected: () => webgpuClient.isConnected(),
        generateContent: async (prompt) => {
          const text = await webgpuClient.generateContent(prompt);
          return text ? { text, inputTokens: 0, outputTokens: 0 } : null;
        },
      }
    : backend === 'chatgpt'
      ? {
          isConnected: () => chatgptClient.isConnected(),
          generateContent: async (prompt) => {
            const text = await chatgptClient.generateContent(prompt);
            return text ? { text, inputTokens: 0, outputTokens: 0 } : null;
          },
        }
      : {
          isConnected: () => cloudAIClient.hasKey(backend),
          generateContent: (prompt) => cloudAIClient.generateContent(backend, prompt),
        };
}

export function isLLMModeActive(): boolean {
  const state = useAIConfigStore.getState();
  return (state.aiMode === 'gemini' || state.aiMode === 'hybrid') && state.isLLMReady();
}

export function isStrategicLayerActive(): boolean {
  const state = useAIConfigStore.getState();
  // 'gemini' is the persisted ID for LLM-only mode: the strategic layer runs and the tactical
  // rules layer is paused (see isTacticalLayerActive).
  return (state.aiMode === 'hybrid' || state.aiMode === 'gemini') && state.isLLMReady();
}

export function isTacticalLayerActive(): boolean {
  const state = useAIConfigStore.getState();
  return state.aiMode === 'heuristic' || state.aiMode === 'hybrid' || !state.isLLMReady();
}

/**
 * The people on a live workplace shift, as team totals: no member, role or
 * private choice (projectWorkplace keeps willingness to cover private, and so
 * does this). Null outside an active shift, so the strategic answer is never
 * asked about people it has no record of.
 */
export function strategicPeopleSummary(workplace: WorkplaceState) {
  if (workplace.phase !== 'active' || workplace.members.length === 0) return null;
  const total = (key: 'extraMinutes' | 'restMinutes' | 'recoveryOwedMinutes') =>
    workplace.members.reduce((sum, member) => sum + member[key], 0);
  return {
    peopleOnShift: workplace.members.length,
    extraMinutesWorked: total('extraMinutes'),
    restMinutesTaken: total('restMinutes'),
    recoveryMinutesOwed: total('recoveryOwedMinutes'),
    coverInProgress: workplace.activeCoverMemberId !== null,
    openObjections: workplace.objections.filter((o) => o.status === 'open').length,
    refusalsRespected: workplace.refusalsRespected,
  };
}

/**
 * With two machines in warning, the local 4B named the milder one in 7 of 30
 * answers; with this line, 0 of 30, nothing else worse (D-028). Measured on the
 * local model only, so the cloud prompts go without it until measured there.
 */
export const STRATEGIC_SEVERITY_LINE =
  'When more than one machine is in warning, focus on the one with the worst readings: highest wear, then vibration, then temperature.';

export function strategicPrompt(
  machines: MachineData[],
  { severityRanking = false }: { severityRanking?: boolean } = {}
): string {
  const production = useProductionStore.getState();
  const simulation = useGameSimulationStore.getState();
  const people = strategicPeopleSummary(useWorkplaceStore.getState().workplace);
  const telemetry = machines.map((machine) => ({
    id: machine.id,
    status: machine.status,
    load: finite(machine.metrics?.load),
    temperature: finite(machine.metrics?.temperature),
    vibration: finite(machine.metrics?.vibration),
    wear: finite(machine.metrics?.wear),
  }));
  return [
    'You are the strategic controller for a staffed grain mill digital twin with autonomous logistics.',
    'Return one JSON object only: {"priorities": 1-3 short imperative strings (under 80 characters each), "reasoning": 1-2 sentences, "insight"?: string, "tradeoff"?: string, "focusMachine"?: one equipment id from the telemetry, "actionPlan"?: [immediate, short-term, preparation] as 3 strings}.',
    'Prioritize safety interlocks, stable material flow, quality, energy, condition maintenance, and autonomous logistics.',
    ...(severityRanking ? [STRATEGIC_SEVERITY_LINE] : []),
    // Only with a live shift's team totals: then the people come first, and
    // the answer has a record to speak from.
    ...(people
      ? [
          'People come first: never plan on extra minutes or cover nobody has agreed to, and protect recovery time that is owed before chasing throughput.',
          `People on shift (team totals only): ${JSON.stringify(people)}.`,
        ]
      : []),
    // Model text lands verbatim in the player's decision cards, so ask for their language.
    ...(getLocale() === 'pt-BR'
      ? [
          'Write every string value in Brazilian Portuguese (pt-BR), using 24-hour times; keep the JSON keys and equipment ids unchanged.',
        ]
      : []),
    `Plant period: ${simulation.currentShift}. Weather: ${simulation.weather}.`,
    `Production: ${JSON.stringify(production.metrics)}.`,
    `Equipment telemetry: ${JSON.stringify(telemetry)}.`,
  ].join('\n');
}

const STRATEGIC_TEXT_LIMIT = 160;

/** cloudAIClient refusals that repeat on every call until the player reconnects a key. */
const TERMINAL_CLOUD_REFUSALS = new Set([
  'billingUnverified',
  'keyRejected',
  'creditLimit',
  'limitedKeyRequired',
  'capRequired',
  'connectKey',
  'directKeysLocalOnly',
]);

function parseStrategicResponse(response: string): {
  priorities: string[];
  reasoning: string;
  insight?: string;
  tradeoff?: string;
  focusMachine?: string;
  actionPlan?: string[];
} | null {
  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    // Model text lands verbatim in decision cards and the aria-live decision
    // announcement, so every field is trimmed and bounded here.
    const clip = (value: unknown): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const text = value.trim().slice(0, STRATEGIC_TEXT_LIMIT);
      return text || undefined;
    };
    const clipList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .map(clip)
            .filter((item): item is string => item !== undefined)
            .slice(0, 3)
        : [];
    const priorities = clipList(parsed.priorities);
    if (!priorities.length) return null;
    const actionPlan = clipList(parsed.actionPlan);
    return {
      priorities,
      reasoning: clip(parsed.reasoning) ?? translate(msg, 'strategicReasoningFallback'),
      insight: clip(parsed.insight),
      tradeoff: clip(parsed.tradeoff),
      focusMachine: clip(parsed.focusMachine),
      actionPlan: actionPlan.length ? actionPlan : undefined,
    };
  } catch {
    return null;
  }
}

let strategicRequestEpoch = 0;
let strategicDecisionPromise: Promise<AIDecision | null> | null = null;
let strategicDecisionKey: string | null = null;

async function runStrategicDecision(
  requestEpoch: number,
  requestMode: string,
  requestBackend: string,
  requestConnectionEpoch: number
): Promise<AIDecision | null> {
  const config = useAIConfigStore.getState();
  if (
    config.aiMode !== requestMode ||
    config.llmBackend !== requestBackend ||
    config.connectionEpoch !== requestConnectionEpoch ||
    !isStrategicLayerActive()
  ) {
    return null;
  }
  const llm = getActiveLLM();
  if (!llm.isConnected()) return null;

  let configurationChanged = false;
  const unsubscribeConfig = useAIConfigStore.subscribe((state) => {
    if (
      state.aiMode !== requestMode ||
      state.llmBackend !== requestBackend ||
      state.connectionEpoch !== requestConnectionEpoch
    ) {
      configurationChanged = true;
    }
  });
  config.setStrategicThinking(true);
  try {
    // The severity line is measured on the local model only (D-028).
    const prompt = strategicPrompt(getMachines(), {
      severityRanking: requestBackend === 'webgpu',
    });
    const result = await llm.generateContent(prompt);
    if (
      requestEpoch !== strategicRequestEpoch ||
      configurationChanged ||
      !result ||
      !llm.isConnected() ||
      !isStrategicLayerActive() ||
      useAIConfigStore.getState().aiMode !== requestMode ||
      useAIConfigStore.getState().llmBackend !== requestBackend ||
      useAIConfigStore.getState().connectionEpoch !== requestConnectionEpoch
    ) {
      return null;
    }
    const liveConfig = useAIConfigStore.getState();
    const strategic = parseStrategicResponse(result.text);
    if (!strategic) return null;
    // Only keep a focus machine the plant actually has, so neither the decision
    // nor the Strategic tab's "Focus" chip points at an asset that isn't there.
    const machineIds = new Set(getMachines().map((machine) => machine.id));
    const focusMachine =
      strategic.focusMachine && machineIds.has(strategic.focusMachine)
        ? strategic.focusMachine
        : undefined;
    const copy: DecisionCopy = {
      action: { key: 'strategicAction', params: { priority: strategic.priorities[0] } },
      impact:
        strategic.priorities.length > 1
          ? {
              key: 'strategicAdditionalPriorities',
              params: { priorities: strategic.priorities.slice(1).join('; ') },
            }
          : { key: 'strategicRecorded' },
    };
    const decision: KeyedDecision = {
      id: makeId('strategic'),
      timestamp: new Date(),
      type: 'optimization',
      ...keyedText(copy),
      // Model text, asked for in the player's language (strategicPrompt).
      reasoning: [strategic.reasoning, strategic.insight, strategic.tradeoff]
        .filter(Boolean)
        .join(' '),
      confidence: 85,
      machineId: focusMachine,
      status: 'completed',
      priority: 'medium',
      triggeredBy: 'prediction',
    };
    const recorded = recordDecision(decision);
    if (!recorded) return null;
    liveConfig.setStrategicPriorities(strategic.priorities, {
      actionPlan: strategic.actionPlan,
      insight: strategic.insight,
      tradeoff: strategic.tradeoff,
      focusMachine,
    });
    return recorded;
  } catch (error) {
    // A refusal only a reconnect clears (unverified OpenRouter billing, a
    // revoked key, spent credit) would fail every later plan in silence, under
    // a badge still reading Hybrid. It stands down to the free rules layer and
    // says why, as the spend cap does; a rate limit or timeout just retries.
    const cloudCopy = sanitizeKeyedLine((error as { copy?: unknown } | null)?.copy);
    if (
      error instanceof SpendCapError ||
      (error instanceof Error &&
        cloudCopy?.catalog === 'cloudAIClient' &&
        TERMINAL_CLOUD_REFUSALS.has(String(cloudCopy.key)))
    ) {
      const current = useAIConfigStore.getState();
      if (
        current.llmBackend === requestBackend &&
        current.connectionEpoch === requestConnectionEpoch
      ) {
        current.setAIMode('heuristic');
        useAIConfigStore.setState({
          connectionError: error.message,
          connectionErrorCopy: error instanceof SpendCapError ? error.copy : (cloudCopy ?? null),
        });
      }
    }
    if (requestBackend === 'chatgpt') {
      const current = useAIConfigStore.getState();
      current.setChatGPTError(
        error instanceof Error ? error.message : translate(msg, 'chatgptRequestFailed'),
        sanitizeKeyedLine((error as { copy?: unknown } | null)?.copy)
      );
      if (!chatgptClient.isConnected()) void current.refreshChatGPT();
    }
    logger.ai.error('Strategic decision generation failed', error);
    return null;
  } finally {
    unsubscribeConfig();
  }
}

export function generateStrategicDecision(): Promise<AIDecision | null> {
  const config = useAIConfigStore.getState();
  const requestKey = `${config.aiMode}:${config.llmBackend}:${config.connectionEpoch}`;
  if (strategicDecisionPromise && strategicDecisionKey === requestKey) {
    return strategicDecisionPromise;
  }
  if (strategicDecisionPromise) {
    strategicRequestEpoch += 1;
    strategicDecisionPromise = null;
    strategicDecisionKey = null;
  }
  const requestEpoch = strategicRequestEpoch;
  const promise = runStrategicDecision(
    requestEpoch,
    config.aiMode,
    config.llmBackend,
    config.connectionEpoch
  );
  strategicDecisionPromise = promise;
  strategicDecisionKey = requestKey;
  void promise.finally(() => {
    if (strategicDecisionPromise !== promise) return;
    strategicDecisionPromise = null;
    strategicDecisionKey = null;
    if (requestEpoch === strategicRequestEpoch) {
      useAIConfigStore.getState().setStrategicThinking(false);
    }
  });
  return promise;
}

/** Plant hours a deferred card waits before it comes back to the player, once. */
export const DEFERRAL_RETURN_PLANT_HOURS = 1;
/** Plant hours after that return before a still-deferred card is superseded. */
export const DEFERRAL_LAPSE_PLANT_HOURS = 2;

// Deferral times on the plant clock, kept on the card's own response. The store
// stamps a response in wall time only, so the engine stamps the plant clock
// when it first sees a deferral, whichever surface recorded it (the panel's
// Defer, the agent's decision.respond). On the card, the stamp is saved with it,
// so a reload neither restarts the wait nor brings the card back twice.

const plantHours = (clock: { day: number; hour: number }) => clock.day * 24 + clock.hour;

/** True once a deferred card has come back to the player (it cannot be deferred again). */
export function isDeferralReturned(decisionId: string): boolean {
  const decision = useProductionStore
    .getState()
    .aiDecisions?.find((candidate) => candidate.id === decisionId);
  return (
    decision?.response?.disposition === 'deferred' && decision.response.deferralReturned === true
  );
}

/**
 * A saved card of a kind no longer filed, still pending, is withdrawn: its
 * buttons changed nothing. Answered ones keep their record.
 */
function retireRemovedCards(): void {
  const store = useProductionStore.getState();
  for (const decision of store.aiDecisions ?? [])
    if (
      decision.status === 'pending' &&
      !decision.id.startsWith('strategic-') &&
      !FILED_TYPES.has(decision.type)
    )
      store.updateDecisionStatus?.(decision.id, 'superseded', translate(msg, 'cardRetired'));
}

function sweepDeferredDecisions(): void {
  const clock = readPlantClock();
  if (!clock) return;
  const now = plantHours(clock);
  const store = useProductionStore.getState();
  for (const decision of store.aiDecisions ?? []) {
    const response = decision.response;
    if (decision.status !== 'pending' || response?.disposition !== 'deferred') continue;
    const at = response.deferredAt ? plantHours(response.deferredAt) : undefined;
    // Reset to 10 AM winds the clock back: the wait starts again rather than
    // reading as negative time that never lapses.
    if (at === undefined || !Number.isFinite(at) || now < at) {
      store.recordDecisionResponse?.(decision.id, 'deferred', {
        note: response.note,
        deferredAt: { day: clock.day, hour: clock.hour },
      });
      continue;
    }
    const waited = now - at;
    if (waited >= DEFERRAL_RETURN_PLANT_HOURS + DEFERRAL_LAPSE_PLANT_HOURS) {
      const lapsed = translate(msg, 'deferralLapsed', {
        hours: formatFixed(DEFERRAL_RETURN_PLANT_HOURS + DEFERRAL_LAPSE_PLANT_HOURS, 0),
      });
      // The note that said when it would lapse gives way to the lapse itself,
      // on every surface that reads the response.
      store.recordDecisionResponse?.(decision.id, 'deferred', { note: lapsed });
      store.updateDecisionStatus?.(decision.id, 'superseded', lapsed);
    } else if (!response.deferralReturned && waited >= DEFERRAL_RETURN_PLANT_HOURS) {
      store.recordDecisionResponse?.(decision.id, 'deferred', {
        deferralReturned: true,
        note: translate(msg, 'deferralReturned', {
          hours: formatFixed(DEFERRAL_RETURN_PLANT_HOURS, 0),
          lapse: formatFixed(DEFERRAL_LAPSE_PLANT_HOURS, 0),
        }),
      });
    }
  }
}

let loopInterval: ReturnType<typeof setInterval> | null = null;
let lastTactical = 0;
let lastStrategic = 0;
let lastMetrics = 0;
let lastLoopAt = 0;
let engineUsers = 0;

function aiLoop(): void {
  const now = Date.now();
  const sinceLastLoop = lastLoopAt > 0 ? Math.max(0, now - lastLoopAt) : 0;
  lastLoopAt = now;
  const config = useAIConfigStore.getState();
  const production = useProductionStore.getState();

  if (now - lastMetrics >= AI_ENGINE_TIMING.metricsUpdateInterval) {
    lastMetrics = now;
    // The card count only. The rules layer has no CPU or memory reading to
    // report, so it writes none (review 10, F3).
    config.updateSystemStatus({ decisions: production.aiDecisions.length });
  }

  retireRemovedCards();
  sweepDeferredDecisions();
  // Agreed adjustments: alarms as light and vibration, quiet-room bookings
  // (aiAccommodation.ts, D-058). Runs while the clock is held, as alarms can.
  stepAccommodationDecisions();

  // While the shift clock is held (P, Paused, tour, handoff, any holder) the
  // plant is frozen: no card about it and no request on the player's LLM key.
  // Held time does not count toward either cadence, so resuming continues the
  // interval where it stopped rather than firing at once.
  //
  // The cadence itself stays on wall time that elapses with the clock
  // running, not game time. It is a reading rate for a person: on game time
  // 4x would file a pending card every 1.5 real seconds (and spend 4x the
  // LLM budget), and 1/2x would leave the panel silent for 12 s.
  //
  // A hidden browser tab stops the frame loop that runs the plant clock, so it
  // holds the engine the same way (this interval keeps firing, throttled).
  const simulation = useGameSimulationStore.getState();
  if (simulation.gameSpeed === 0 || simulation.isTabVisible === false) {
    lastTactical += sinceLastLoop;
    lastStrategic += sinceLastLoop;
    return;
  }

  if (isTacticalLayerActive() && now - lastTactical >= AI_ENGINE_TIMING.tacticalDecisionInterval) {
    lastTactical = now;
    config.setTacticalThinking(true);
    try {
      generateContextAwareDecision();
    } finally {
      config.setTacticalThinking(false);
    }
  }

  if (
    isStrategicLayerActive() &&
    now - lastStrategic >= AI_ENGINE_TIMING.strategicDecisionInterval
  ) {
    lastStrategic = now;
    void generateStrategicDecision();
  }
}

export function initializeAIEngine(): () => void {
  engineUsers += 1;
  const shiftCleanup = initializeShiftObserver();
  const outcomeCleanup = initializeDecisionOutcomeTracking();
  const operatorCleanup = initializeOnDeviceOperator();
  const alertReactionCleanup = initializeAlertReactions();
  if (!loopInterval) {
    lastTactical = Date.now();
    lastStrategic = Date.now();
    lastLoopAt = Date.now();
    lastMetrics = 0;
    loopInterval = setInterval(aiLoop, AI_ENGINE_TIMING.loopInterval);
    logger.ai.info('Autonomous plant decision engine started');
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    engineUsers = Math.max(0, engineUsers - 1);
    // Every engine lease owns one observer lease. Release those independently
    // even while another engine user keeps the shared loop alive.
    shiftCleanup();
    outcomeCleanup();
    operatorCleanup();
    alertReactionCleanup();
    if (engineUsers > 0) return;
    if (loopInterval) clearInterval(loopInterval);
    loopInterval = null;
    resetAccommodationDecisions();
    strategicRequestEpoch += 1;
    strategicDecisionPromise = null;
    strategicDecisionKey = null;
    useAIConfigStore.getState().setStrategicThinking(false);
    logger.ai.info('Autonomous plant decision engine stopped');
  };
}

export function cancelPendingResolutionTimeouts(): void {
  // Compatibility API. The autonomous engine has no delayed resolution actions.
}

export async function resolveBilateralAlignment(): Promise<void> {
  // Compatibility API for earlier persisted sessions. Equipment decisions no longer
  // masquerade as choices made by embodied characters.
}
