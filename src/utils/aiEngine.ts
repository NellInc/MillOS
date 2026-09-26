/**
 * Autonomous plant decision engine.
 *
 * The engine watches process equipment, production flow, safety interlocks,
 * logistics routes, weather, and the active strategic backend. It is
 * deliberately limited to equipment and process state.
 */

import type { AIDecision, AlertData, MachineData } from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { geminiClient } from './geminiClient';
import { webgpuClient } from './webgpuClient';
import { logger } from './logger';

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

const DECISION_TYPES: DecisionType[] = [
  'coordination',
  'optimization',
  'prediction',
  'maintenance',
  'safety',
];
const MAX_METRIC_POINTS = 60;
const MAX_PREDICTED_EVENTS = 10;
const MAX_ANOMALIES = 100;

const createTypeStats = (): DecisionImpactStats['byType'] => ({
  coordination: { count: 0, successRate: 0 },
  optimization: { count: 0, successRate: 0 },
  prediction: { count: 0, successRate: 0 },
  maintenance: { count: 0, successRate: 0 },
  safety: { count: 0, successRate: 0 },
});

const metricHistory = new Map<string, TrendData>();
const confidenceAdjustments = new Map<DecisionType, number>(
  DECISION_TYPES.map((type) => [type, 0])
);
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

function decisionForType(type: DecisionType, machine: MachineData): AIDecision {
  const temperature = finite(machine.metrics?.temperature);
  const vibration = finite(machine.metrics?.vibration);
  const load = finite(machine.metrics?.load);
  const wear = finite(machine.metrics?.wear);
  const adjustment = confidenceAdjustments.get(type) ?? 0;
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
        action: `Allocate autonomous service route to ${machine.name}`,
        reasoning: `The route planner detected equipment demand at ${machine.id} with ${load.toFixed(0)} percent load.`,
        confidence: clamp(78 + adjustment, 45, 98),
        impact: 'Keeps service traffic deterministic and clears shared aisles.',
        priority: load > 90 ? 'high' : 'medium',
      };
    case 'maintenance':
      return {
        ...common,
        action: `Queue condition-based maintenance for ${machine.name}`,
        reasoning: `Telemetry reports ${temperature.toFixed(1)} C, ${vibration.toFixed(2)} mm/s vibration, and ${wear.toFixed(0)} percent wear.`,
        confidence: clamp(82 + adjustment, 45, 98),
        impact: 'Reduces breakdown risk while preserving the controlled production path.',
        priority: temperature >= 80 || vibration >= 4.5 || wear >= 85 ? 'critical' : 'high',
      };
    case 'safety':
      return {
        ...common,
        action: `Engage interlocked safe state around ${machine.name}`,
        reasoning:
          'The autonomous safety layer detected a limit or test condition requiring isolation.',
        confidence: clamp(94 + adjustment, 50, 99),
        impact:
          'Stops hazardous motion, closes affected routes, and preserves diagnostic evidence.',
        priority: 'critical',
      };
    case 'prediction':
      return {
        ...common,
        action: `Statistical anomaly detected on ${machine.name}`,
        reasoning: `Trend analysis combines ${temperature.toFixed(1)} C, ${vibration.toFixed(2)} mm/s vibration, ${load.toFixed(0)} percent load, and ${wear.toFixed(0)} percent wear.`,
        confidence: clamp(76 + adjustment, 40, 96),
        impact: 'Provides lead time for an automatic derate or maintenance queue entry.',
        priority: temperature >= 80 || vibration >= 4.5 ? 'high' : 'medium',
      };
    case 'optimization':
      return {
        ...common,
        action: `Balance process load through ${machine.name}`,
        reasoning: `The line is carrying ${load.toFixed(0)} percent load at ${finite(machine.metrics?.efficiency, 100).toFixed(0)} percent local efficiency.`,
        confidence: clamp(74 + adjustment, 40, 95),
        impact: 'Smooths material flow, limits recirculation, and protects downstream capacity.',
        priority: load > 90 ? 'high' : 'medium',
      };
  }
}

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
  const type =
    forceType ??
    (emergencyTest ? 'safety' : critical ? 'maintenance' : warning ? 'prediction' : 'optimization');
  return recordDecision(decisionForType(type, machine));
}

export function reactToAlert(alert: AlertData): AIDecision | null {
  const machine = getMachines().find((candidate) => candidate.id === alert.machineId);
  if (!machine) return null;
  const type: DecisionType =
    alert.type === 'critical' || alert.type === 'safety'
      ? 'safety'
      : alert.type === 'warning'
        ? 'maintenance'
        : 'prediction';
  const base = decisionForType(type, machine);
  return recordDecision({
    ...base,
    id: makeId('alert-response'),
    triggeredBy: 'alert',
    relatedAlertId: alert.id,
    reasoning: `${alert.title}: ${alert.message}`,
  });
}

export function applyDecisionEffects(
  decision: AIDecision,
  disposition: 'automatic' | 'accepted' | 'modified' = 'automatic',
  options?: { note?: string; modifiedAction?: string }
): void {
  const store = useProductionStore.getState();
  store.recordDecisionResponse?.(decision.id, disposition, options);

  if (decision.machineId && decision.type === 'safety') {
    store.updateMachineStatus?.(decision.machineId, 'idle');
  } else if (decision.machineId && decision.type === 'maintenance') {
    const machine = store.machines.find((item) => item.id === decision.machineId);
    if (machine?.status === 'critical') store.updateMachineStatus?.(decision.machineId, 'warning');
  } else if (decision.type === 'optimization') {
    store.setProductionSpeed?.(clamp(finite(store.productionSpeed, 1) * 0.98, 0.55, 1.35));
  }

  store.updateDecisionStatus?.(
    decision.id,
    'completed',
    disposition === 'automatic'
      ? 'Completed by autonomous control layer'
      : 'Completed after control confirmation'
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
  confidenceAdjustments.set(decision.type, clamp((rate - 0.65) * 20, -10, 10));

  impactStats.totalDecisions += 1;
  if (success) impactStats.successfulDecisions += 1;
  const typeStats = impactStats.byType[decision.type];
  typeStats.count += 1;
  typeStats.successRate = Math.round(rate * 100);
  if (
    success &&
    /shutdown|safe state|derate|maintenance/i.test(`${decision.action} ${decision.impact}`)
  ) {
    impactStats.preventedShutdowns += 1;
    impactStats.estimatedSavings += 2500;
  }
}

export function trackDecisionOutcome(decision: AIDecision): void {
  if (!decision.outcome?.trim()) return;
  const failed = /fail|escalat|reject|supersed/i.test(decision.outcome);
  recordDecisionOutcome(decision, decision.status === 'completed' && !failed);
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

export function getConfidenceAdjustments(): Record<DecisionType, number> {
  return Object.fromEntries(
    DECISION_TYPES.map((type) => [type, confidenceAdjustments.get(type) ?? 0])
  ) as Record<DecisionType, number>;
}

export function getConfidenceAdjustmentForType(type: DecisionType): number {
  return confidenceAdjustments.get(type) ?? 0;
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
    (decision.type === 'prediction' && /anomaly/i.test(decision.action))
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

function getActiveLLM(): {
  generateContent: (prompt: string) => Promise<string | null>;
  isConnected: () => boolean;
} {
  return useAIConfigStore.getState().llmBackend === 'webgpu' ? webgpuClient : geminiClient;
}

export function isGeminiModeActive(): boolean {
  const state = useAIConfigStore.getState();
  return (state.aiMode === 'gemini' || state.aiMode === 'hybrid') && state.isLLMReady();
}

export function isStrategicLayerActive(): boolean {
  const state = useAIConfigStore.getState();
  // 'gemini' is the LLM-only mode: the strategic layer runs and the tactical
  // rules layer is paused (see isTacticalLayerActive).
  return (state.aiMode === 'hybrid' || state.aiMode === 'gemini') && state.isLLMReady();
}

export function isTacticalLayerActive(): boolean {
  const mode = useAIConfigStore.getState().aiMode;
  return mode === 'heuristic' || mode === 'hybrid';
}

function strategicPrompt(machines: MachineData[]): string {
  const production = useProductionStore.getState();
  const simulation = useGameSimulationStore.getState();
  const telemetry = machines.map((machine) => ({
    id: machine.id,
    status: machine.status,
    load: finite(machine.metrics?.load),
    temperature: finite(machine.metrics?.temperature),
    vibration: finite(machine.metrics?.vibration),
    wear: finite(machine.metrics?.wear),
  }));
  return [
    'You are the strategic controller for an uncrewed grain mill digital twin.',
    'Return one JSON object only: {"priorities": 1-3 short imperative strings (under 80 characters each), "reasoning": 1-2 sentences, "insight"?: string, "tradeoff"?: string, "focusMachine"?: one equipment id from the telemetry, "actionPlan"?: [immediate, short-term, preparation] as 3 strings}.',
    'Prioritize safety interlocks, stable material flow, quality, energy, condition maintenance, and autonomous logistics.',
    `Plant period: ${simulation.currentShift}. Weather: ${simulation.weather}.`,
    `Production: ${JSON.stringify(production.metrics)}.`,
    `Equipment telemetry: ${JSON.stringify(telemetry)}.`,
  ].join('\n');
}

const STRATEGIC_TEXT_LIMIT = 160;

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
      reasoning: clip(parsed.reasoning) ?? 'Strategic analysis complete.',
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
  requestBackend: string
): Promise<AIDecision | null> {
  const config = useAIConfigStore.getState();
  if (
    config.aiMode !== requestMode ||
    config.llmBackend !== requestBackend ||
    !isStrategicLayerActive()
  ) {
    return null;
  }
  const llm = getActiveLLM();
  if (!llm.isConnected()) return null;

  let configurationChanged = false;
  const unsubscribeConfig = useAIConfigStore.subscribe((state) => {
    if (state.aiMode !== requestMode || state.llmBackend !== requestBackend) {
      configurationChanged = true;
    }
  });
  config.setStrategicThinking(true);
  try {
    const prompt = strategicPrompt(getMachines());
    const response = await llm.generateContent(prompt);
    if (
      requestEpoch !== strategicRequestEpoch ||
      configurationChanged ||
      !response ||
      !llm.isConnected() ||
      !isStrategicLayerActive() ||
      useAIConfigStore.getState().aiMode !== requestMode ||
      useAIConfigStore.getState().llmBackend !== requestBackend
    ) {
      return null;
    }
    const liveConfig = useAIConfigStore.getState();
    if (config.llmBackend === 'gemini') {
      liveConfig.recordApiUsage(prompt.length, response.length);
    }
    const strategic = parseStrategicResponse(response);
    if (!strategic) return null;
    // Only keep a focus machine the plant actually has, so neither the decision
    // nor the Strategic tab's "Focus" chip points at an asset that isn't there.
    const machineIds = new Set(getMachines().map((machine) => machine.id));
    const focusMachine =
      strategic.focusMachine && machineIds.has(strategic.focusMachine)
        ? strategic.focusMachine
        : undefined;
    const decision: AIDecision = {
      id: makeId('strategic'),
      timestamp: new Date(),
      type: 'optimization',
      action: `Strategic: ${strategic.priorities[0]}`,
      reasoning: [strategic.reasoning, strategic.insight, strategic.tradeoff]
        .filter(Boolean)
        .join(' '),
      confidence: 85,
      impact:
        strategic.priorities.length > 1
          ? `Additional priorities: ${strategic.priorities.slice(1).join('; ')}`
          : 'Strategic guidance recorded for the tactical controller.',
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
    logger.ai.error('Strategic decision generation failed', error);
    return null;
  } finally {
    unsubscribeConfig();
  }
}

export function generateStrategicDecision(): Promise<AIDecision | null> {
  const config = useAIConfigStore.getState();
  const requestKey = `${config.aiMode}:${config.llmBackend}`;
  if (strategicDecisionPromise && strategicDecisionKey === requestKey) {
    return strategicDecisionPromise;
  }
  if (strategicDecisionPromise) {
    strategicRequestEpoch += 1;
    strategicDecisionPromise = null;
    strategicDecisionKey = null;
  }
  const requestEpoch = strategicRequestEpoch;
  const promise = runStrategicDecision(requestEpoch, config.aiMode, config.llmBackend);
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

let loopInterval: ReturnType<typeof setInterval> | null = null;
let lastTactical = 0;
let lastStrategic = 0;
let lastMetrics = 0;
let engineUsers = 0;

function aiLoop(): void {
  const now = Date.now();
  const config = useAIConfigStore.getState();
  const production = useProductionStore.getState();
  const alerts = useUIStore.getState().alerts;

  if (now - lastMetrics >= AI_ENGINE_TIMING.metricsUpdateInterval) {
    lastMetrics = now;
    const pending = production.aiDecisions.filter(
      (decision) => decision.status === 'pending'
    ).length;
    const active = production.aiDecisions.filter(
      (decision) => decision.status === 'in_progress'
    ).length;
    const alertLoad = alerts.filter(
      (alert) => alert.type === 'critical' || alert.type === 'warning'
    ).length;
    config.updateSystemStatus({
      cpu: clamp(12 + pending * 2 + active * 7 + alertLoad * 4, 8, 85),
      memory: clamp(28 + production.aiDecisions.length * 0.45 + alerts.length, 20, 78),
      decisions: production.aiDecisions.length,
    });
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
  if (!loopInterval) {
    lastTactical = Date.now();
    lastStrategic = Date.now();
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
    if (engineUsers > 0) return;
    if (loopInterval) clearInterval(loopInterval);
    loopInterval = null;
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
