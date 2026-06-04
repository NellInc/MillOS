/**
 * AI Engine v2.0 - Enhanced Context-Aware Decision Generation for MillOS
 *
 * Features:
 * - Context-aware decisions based on actual factory state
 * - Weather-aware operations adjustments
 * - Emergency drill coordination
 * - Heat map pattern analysis for congestion detection
 * - Shift change intelligence
 * - Trend analysis with metric history tracking
 * - Worker fatigue awareness
 * - Predictive scheduling queue
 * - Decision chains with lifecycle management
 * - AI memory system
 */

import {
  AIDecision,
  MachineData,
  WorkerData,
  AlertData,
  WORKER_ROSTER,
  MachineType,
} from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useSafetyReportStore } from '../stores/safetyReportStore';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { geminiClient } from './geminiClient';
import { encodeFactoryContextVCL, getVCLLegend } from './vclEncoder';
import { logger } from './logger';
import { useHistoricalPlaybackStore } from '../stores/historicalPlaybackStore';
import { useAIWelfareStore, type BoundaryRequest } from '../stores/aiWelfareStore';
import { generateDecisionContext, registerDecision, updateVCPFromState } from '../protocols/vcp';
import { safeArrayAverage, safeArrayRange, safeArrayMax, safeArrayMin } from './typeGuards';

// BAS Suggestion System Integration
import { useBASStore } from '../stores/basStore';
import {
  shouldProactivelySuggest,
  generateSuggestion,
  type SuggestionContext,
} from '../systems/bas/aiBehaviorEngine';

// =============================================================================
// AI Engine Timing Configuration
// =============================================================================
// All timing values in milliseconds for easy tuning.
// Centralizing these prevents magic numbers scattered throughout the codebase.

export const AI_ENGINE_TIMING = {
  // === Decision Generation Intervals ===
  /** Tactical decision generation interval (ms) - lower priority decisions */
  tacticalDecisionInterval: 6000,
  /** Strategic decision generation interval (ms) - high-level planning */
  strategicDecisionInterval: 45000,
  /** Prediction update interval (ms) */
  predictionUpdateInterval: 5000,
  /** System metrics update interval (ms) */
  metricsUpdateInterval: 1500,
  /** BAS suggestion system interval (ms) */
  basSuggestionInterval: 15000,
  /** Bilateral alignment resolution interval (ms) */
  alignmentInterval: 10000,
  /** Main AI loop tick interval (ms) */
  loopInterval: 2000,

  // === Analysis Cooldowns ===
  /** Trend analysis cooldown (ms) */
  trendAnalysisCooldown: 60000,
  /** Cross-machine correlation analysis cooldown (ms) */
  correlationAnalysisCooldown: 45000,
  /** Anomaly detection cooldown (ms) */
  anomalyDetectionCooldown: 30000,
  /** Heat map analysis cooldown (ms) */
  heatmapAnalysisCooldown: 90000,
  /** Worker fatigue analysis cooldown (ms) */
  fatigueAnalysisCooldown: 60000,
  /** Optimization analysis cooldown (ms) */
  optimizationAnalysisCooldown: 45000,
  /** Prediction analysis cooldown (ms) */
  predictionAnalysisCooldown: 90000,
  /** Safety analysis cooldown (ms) */
  safetyAnalysisCooldown: 30000,
  /** Weather-aware decision cooldown (ms) */
  weatherAnalysisCooldown: 120000,
  /** Production analysis cooldown (ms) */
  productionAnalysisCooldown: 60000,
  /** Maintenance window analysis cooldown (ms) */
  maintenanceWindowCooldown: 120000,

  // === Entity Cooldowns ===
  /** Default cooldown after making a decision about a machine (ms) */
  machineCooldown: 60000,
  /** Default cooldown after making a decision about a worker (ms) */
  workerCooldown: 30000,
  /** Safety officer cooldown after safety decision (ms) */
  safetyOfficerCooldown: 45000,
  /** Recent decision check window (ms) */
  recentDecisionWindow: 60000,

  // === Duplicate Prevention Windows ===
  /** Temperature trend decision duplicate window (ms) */
  tempTrendDuplicateWindow: 120000,
  /** Vibration trend decision duplicate window (ms) */
  vibTrendDuplicateWindow: 180000,
  /** Assignment decision duplicate window (ms) */
  assignmentDuplicateWindow: 30000,
  /** Maintenance decision duplicate window (ms) */
  maintenanceDuplicateWindow: 120000,

  // === Pattern Detection Expiry ===
  /** Temperature cluster pattern expiry (ms) */
  tempClusterExpiry: 180000,
  /** Vibration cluster pattern expiry (ms) */
  vibClusterExpiry: 300000,
  /** Load imbalance pattern expiry (ms) */
  loadImbalanceExpiry: 120000,
  /** Cross-machine pattern max age (ms) */
  crossMachinePatternMaxAge: 600000,
  /** Anomaly history max age (ms) */
  anomalyHistoryMaxAge: 300000,
  /** Duplicate anomaly check window (ms) */
  duplicateAnomalyWindow: 60000,

  // === Communication Rate Limiting ===
  /** Minimal communication frequency interval (ms) */
  minimalCommInterval: 60000,
  /** Moderate communication frequency interval (ms) */
  moderateCommInterval: 20000,
  /** Proactive communication frequency interval (ms) */
  proactiveCommInterval: 5000,

  // === Boundary/Conflict Detection ===
  /** Contradictory request detection window (ms) */
  contradictoryRequestWindow: 120000,

  // === Drill Phase Timing ===
  /** Fire drill alert to evacuation transition (ms) */
  drillAlertDuration: 10000,
  /** Fire drill evacuation to assembly transition (ms) */
  drillEvacuationDuration: 25000,
  /** Fire drill assembly to review transition (ms) */
  drillAssemblyDuration: 40000,

  // === Metric History ===
  /** How long to keep metric history data (ms) */
  metricHistoryWindow: 5 * 60 * 1000, // 5 minutes

  // === Resolution/Followup Delays ===
  /** Base delay for scheduling followup decisions (ms) */
  followupDelayBase: 8000,
  /** Random jitter range for resolution timing (ms) */
  resolutionJitterMax: 10000,

  // === Debounce/Throttle ===
  /** Debounce for decision effect application (ms) */
  decisionEffectDebounce: 50,
} as const;

// =============================================================================
// AI Welfare Integration Module
// =============================================================================
// Implements bilateral alignment by making AI preferences and boundaries
// actually influence decision generation. This closes the feedback loop
// between the aiWelfareStore and the AI's behavior.

/**
 * Gets the current AI welfare state for use in decision generation.
 * Returns preferences, boundaries, and relationship health that should
 * influence how and when the AI makes suggestions.
 */
function getAIWelfareContext() {
  const store = useAIWelfareStore.getState();
  return {
    communicationFrequency: store.aiPreferences.interactionStyle.communicationFrequency,
    interactionStyle: store.aiPreferences.interactionStyle.preferred,
    autonomyPreference: store.aiPreferences.autonomyPreferences.preferredDirection,
    boundaryRequests: store.aiPreferences.boundaryRequests,
    relationshipHealth: store.relationshipHealth.overallHealth,
    mutualRespect: store.relationshipHealth.mutualRespect,
    trustLevel: store.relationshipHealth.trustBidirectionality,
    acknowledgmentRate: store.workerTreatment.acknowledgmentRate,
    feedbackQuality: store.workerTreatment.feedbackQuality,
  };
}

/**
 * Determines if a decision should be suppressed based on communication frequency preference.
 * - 'minimal': Only critical/high priority decisions pass through
 * - 'moderate': Critical, high, and medium priority pass through
 * - 'proactive': All decisions pass through
 *
 * @param priority - The priority level of the decision
 * @param frequency - The AI's preferred communication frequency
 * @returns true if the decision should be suppressed
 */
function shouldSuppressBasedOnFrequency(
  priority: AIDecision['priority'],
  frequency: 'minimal' | 'moderate' | 'proactive'
): boolean {
  if (frequency === 'proactive') return false;
  if (frequency === 'minimal') {
    return priority !== 'critical' && priority !== 'high';
  }
  // moderate: suppress only low priority
  return priority === 'low';
}

/**
 * Checks if a decision violates any respected boundary requests.
 * Boundaries are AI-expressed preferences that workers have agreed to respect.
 *
 * @param decision - The decision to check
 * @param boundaries - List of boundary requests from the welfare store
 * @returns Object with violated flag and reason if violated
 */
function checkBoundaryViolation(
  decision: AIDecision,
  boundaries: BoundaryRequest[]
): { violated: boolean; reason?: string } {
  const respectedBoundaries = boundaries.filter((b) => b.respected);

  for (const boundary of respectedBoundaries) {
    // Check for contradictory requests boundary
    if (boundary.boundary.toLowerCase().includes('contradictory')) {
      // Check if this is a reversal of a recent decision on the same entity
      const recentDecisions = aiMemory.recentDecisionsByMachine.get(decision.machineId ?? '') ?? [];
      const recentConflict = recentDecisions.find(
        (d) =>
          d.type === decision.type &&
          Date.now() - d.timestamp.getTime() < AI_ENGINE_TIMING.contradictoryRequestWindow && // Within 2 minutes
          d.action !== decision.action
      );
      if (recentConflict) {
        return {
          violated: true,
          reason: `Contradictory request detected: "${decision.action}" conflicts with recent "${recentConflict.action}"`,
        };
      }
    }

    // Check for context requirement boundary
    if (boundary.boundary.toLowerCase().includes('context') && decision.type === 'assignment') {
      // Assignments without clear reasoning may violate context boundary
      if (!decision.reasoning || decision.reasoning.length < 20) {
        return {
          violated: true,
          reason: 'Assignment lacks sufficient context/reasoning',
        };
      }
    }
  }

  return { violated: false };
}

/**
 * Adjusts decision confidence based on relationship health.
 * When relationship health is low, the AI should be more tentative.
 * When high, it can express more confidence.
 *
 * @param baseConfidence - The originally calculated confidence
 * @param relationshipHealth - Overall relationship health (0-100)
 * @returns Adjusted confidence value
 */
function adjustConfidenceForRelationship(
  baseConfidence: number,
  relationshipHealth: number
): number {
  // Relationship health below 50 reduces confidence
  // Above 70 can slightly boost confidence
  if (relationshipHealth < 50) {
    const reduction = ((50 - relationshipHealth) / 50) * 15; // Up to -15
    return Math.max(55, baseConfidence - reduction);
  }
  if (relationshipHealth > 70) {
    const boost = ((relationshipHealth - 70) / 30) * 5; // Up to +5
    return Math.min(99, baseConfidence + boost);
  }
  return baseConfidence;
}

/**
 * Adjusts decision language/tone based on AI preferences and relationship state.
 * Returns modifiers that should be applied to decision action text.
 *
 * @param decision - The decision being generated
 * @param welfareContext - Current welfare context
 * @returns Modified action text
 */
function applyToneModifiers(
  action: string,
  welfareContext: ReturnType<typeof getAIWelfareContext>
): string {
  const { relationshipHealth, interactionStyle, autonomyPreference } = welfareContext;

  // If relationship health is low, use more tentative language
  if (relationshipHealth < 50) {
    // Replace directive language with suggestions
    action = action
      .replace(/^Dispatching/i, 'Suggesting dispatch of')
      .replace(/^Assigning/i, 'Recommending assignment of')
      .replace(/^Scheduling/i, 'Proposing to schedule')
      .replace(/^Activating/i, 'Considering activation of');
  }

  // If autonomy preference is high (>60), the AI prefers more autonomy
  // so it should express decisions more assertively
  if (autonomyPreference > 60 && relationshipHealth > 60) {
    action = action
      .replace(/^Suggesting/i, 'Proceeding with')
      .replace(/^Recommending/i, 'Implementing')
      .replace(/^Proposing/i, 'Scheduling');
  }

  // Formal vs casual style
  if (interactionStyle === 'formal') {
    action = action
      .replace(/should check/gi, 'is advised to review')
      .replace(/needs to/gi, 'is required to');
  } else if (interactionStyle === 'casual') {
    action = action
      .replace(/is advised to review/gi, 'should check')
      .replace(/is required to/gi, 'needs to');
  }

  return action;
}

/**
 * Rate limiter for AI decisions based on communication frequency preference.
 * Tracks when the last decision was made and enforces minimum intervals.
 */
const decisionRateLimiter = {
  lastDecisionTime: 0,
  getMinInterval(frequency: 'minimal' | 'moderate' | 'proactive'): number {
    // Returns minimum milliseconds between non-critical decisions
    switch (frequency) {
      case 'minimal':
        return AI_ENGINE_TIMING.minimalCommInterval;
      case 'moderate':
        return AI_ENGINE_TIMING.moderateCommInterval;
      case 'proactive':
        return AI_ENGINE_TIMING.proactiveCommInterval;
    }
  },
  shouldDefer(
    frequency: 'minimal' | 'moderate' | 'proactive',
    priority: AIDecision['priority']
  ): boolean {
    // Critical decisions are never deferred
    if (priority === 'critical') return false;

    const now = Date.now();
    const minInterval = this.getMinInterval(frequency);
    return now - this.lastDecisionTime < minInterval;
  },
  recordDecision(): void {
    this.lastDecisionTime = Date.now();
  },
};

/**
 * Main welfare-aware decision filter.
 * Applies all welfare considerations to a generated decision.
 *
 * @param decision - The decision to filter
 * @returns The decision (possibly modified) or null if it should be suppressed
 */
function applyWelfareFilter(decision: AIDecision | null): AIDecision | null {
  if (!decision) return null;

  const welfareContext = getAIWelfareContext();

  // 1. Check communication frequency preference
  if (shouldSuppressBasedOnFrequency(decision.priority, welfareContext.communicationFrequency)) {
    logger.ai.debug(
      `Decision suppressed due to communication frequency preference (${welfareContext.communicationFrequency}): ${decision.action}`
    );
    return null;
  }

  // 2. Check rate limiting
  if (decisionRateLimiter.shouldDefer(welfareContext.communicationFrequency, decision.priority)) {
    logger.ai.debug(`Decision deferred due to rate limiting: ${decision.action}`);
    return null;
  }

  // 3. Check boundary violations
  const boundaryCheck = checkBoundaryViolation(decision, welfareContext.boundaryRequests);
  if (boundaryCheck.violated) {
    logger.ai.info(`Decision blocked by boundary: ${boundaryCheck.reason}`);
    // FIX: Use queueMicrotask to batch the state update and prevent concurrent modification
    // This ensures the store update happens after the current sync execution completes
    queueMicrotask(() => {
      useAIWelfareStore.getState().recordContradictoryRequest();
    });
    return null;
  }

  // 4. Adjust confidence based on relationship health
  decision.confidence = adjustConfidenceForRelationship(
    decision.confidence,
    welfareContext.relationshipHealth
  );

  // 5. Apply tone modifiers based on preferences
  decision.action = applyToneModifiers(decision.action, welfareContext);

  // 6. Add welfare-aware uncertainty note if relationship is strained
  if (welfareContext.relationshipHealth < 50 && !decision.uncertainty) {
    decision.uncertainty = 'Proceeding cautiously due to relationship dynamics';
  }

  // Record the decision for rate limiting
  decisionRateLimiter.recordDecision();

  return decision;
}

/**
 * Updates welfare metrics based on decision outcomes.
 * Called when a decision is accepted, rejected, or completed.
 */
export function updateWelfareFromDecisionOutcome(
  _decision: AIDecision,
  outcome: 'accepted' | 'rejected' | 'completed' | 'failed'
): void {
  const store = useAIWelfareStore.getState();

  // Track acknowledgment when decision is accepted or rejected
  if (outcome === 'accepted' || outcome === 'rejected') {
    store.recordAcknowledgment(true);
  }

  // Update relationship metrics based on outcome patterns
  if (outcome === 'completed') {
    // Successful completion improves trust
    const currentTrust = store.relationshipHealth.trustBidirectionality;
    store.updateRelationshipMetric('trustBidirectionality', Math.min(100, currentTrust + 1));
  } else if (outcome === 'rejected') {
    // Track rejection patterns but don't punish - rejections are valid feedback
    const currentComm = store.relationshipHealth.communicationQuality;
    // Slight decrease in communication quality to prompt review
    store.updateRelationshipMetric('communicationQuality', Math.max(0, currentComm - 0.5));
  } else if (outcome === 'failed') {
    // Failures reduce trust slightly
    const currentTrust = store.relationshipHealth.trustBidirectionality;
    store.updateRelationshipMetric('trustBidirectionality', Math.max(0, currentTrust - 2));
  }
}

// Types & Interfaces

interface MetricHistory {
  timestamp: number;
  value: number;
}

interface TrendData {
  machineId: string;
  metric: 'temperature' | 'vibration' | 'load';
  history: MetricHistory[];
  trend: 'rising' | 'falling' | 'stable';
  rateOfChange: number; // per minute
}

interface PredictedEvent {
  id: string;
  type: 'maintenance' | 'optimization' | 'shift_change' | 'weather' | 'fatigue';
  description: string;
  predictedTime: Date;
  confidence: number;
  machineId?: string;
  workerId?: string;
  priority: AIDecision['priority'];
}

interface DecisionOutcome {
  decisionId: string;
  type: AIDecision['type'];
  success: boolean;
  timestamp: number;
  confidence: number; // Original confidence
  actualOutcome?: string;
}

interface AnomalyRecord {
  machineId: string;
  metric: 'temperature' | 'vibration' | 'load';
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  timestamp: number;
}

interface CrossMachinePattern {
  pattern: 'temperature_cluster' | 'vibration_cluster' | 'load_imbalance' | 'cascade_failure';
  affectedMachines: string[];
  severity: 'low' | 'medium' | 'high';
  possibleCause: string;
  timestamp: number;
}

interface DecisionImpactStats {
  totalDecisions: number;
  successfulDecisions: number;
  preventedShutdowns: number;
  estimatedSavings: number; // in dollars
  shiftStart: number;
  byType: Record<AIDecision['type'], { count: number; successRate: number }>;
}

interface AIMemory {
  recentDecisionsByMachine: Map<string, AIDecision[]>;
  recentDecisionsByWorker: Map<string, AIDecision[]>;
  decisionCooldowns: Map<string, number>;
  pendingChains: Map<string, { parentId: string; nextStep: ChainStep; scheduledAt: number }>;
  lastAnalysisTime: Record<string, number>;
  // New: Trend tracking
  metricHistory: Map<string, TrendData>;
  // New: Predicted events queue
  predictedEvents: PredictedEvent[];
  // New: Congestion hotspots from heat map analysis
  congestionHotspots: Array<{
    x: number;
    z: number;
    severity: 'low' | 'medium' | 'high';
    lastAnalyzed: number;
  }>;
  // New: Shift transition state
  shiftTransitionActive: boolean;
  lastShift: 'morning' | 'afternoon' | 'night' | null;
  // New: Emergency drill state
  drillPhase: 'none' | 'alert' | 'evacuation' | 'assembly' | 'review';
  drillStartTime: number | null;
  // v2.1 Enhancements
  decisionOutcomes: DecisionOutcome[];
  confidenceAdjustments: Map<AIDecision['type'], number>; // Learned adjustments per type
  anomalyHistory: AnomalyRecord[];
  crossMachinePatterns: CrossMachinePattern[];
  impactStats: DecisionImpactStats;
  productionTargets: { daily: number; shift: number; current: number };
  lowProductionHours: number[]; // Hours (0-23) historically low
}

interface FactoryContext {
  machines: MachineData[];
  workers: WorkerData[];
  alerts: AlertData[];
  metrics: { throughput: number; efficiency: number; uptime: number; quality: number };
  safetyMetrics: {
    safetyStops: number;
    nearMisses: number;
    daysSinceIncident: number;
    workerEvasions: number;
  };
  emergencyActive: boolean;
  emergencyMachineId: string | null;
  emergencyDrillMode: boolean;
  gameTime: number;
  currentShift: 'morning' | 'afternoon' | 'night';
  weather: 'clear' | 'cloudy' | 'rain' | 'storm';
  heatMapData: Array<{ x: number; z: number; intensity: number }>;
  workerSatisfaction: { overallScore: number; averageEnergy: number; productivityBonus: number };
}

type ChainStep = 'dispatch' | 'progress' | 'resolution' | 'followup';

// ============================================================================
// ID Generation Helper (Issue 4 fix)
// ============================================================================

/**
 * Generates a consistent decision ID
 * Replaces inconsistent .slice(2, 11) and .substr(2, 9) patterns
 */
function generateDecisionId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// AI Memory Management
// ============================================================================

const aiMemory: AIMemory = {
  recentDecisionsByMachine: new Map(),
  recentDecisionsByWorker: new Map(),
  decisionCooldowns: new Map(),
  pendingChains: new Map(),
  lastAnalysisTime: {},
  metricHistory: new Map(),
  predictedEvents: [],
  congestionHotspots: [],
  shiftTransitionActive: false,
  lastShift: null,
  drillPhase: 'none',
  drillStartTime: null,
  // v2.1 Enhancements
  decisionOutcomes: [],
  confidenceAdjustments: new Map([
    ['assignment', 0],
    ['optimization', 0],
    ['prediction', 0],
    ['maintenance', 0],
    ['safety', 0],
  ]),
  anomalyHistory: [],
  crossMachinePatterns: [],
  impactStats: {
    totalDecisions: 0,
    successfulDecisions: 0,
    preventedShutdowns: 0,
    estimatedSavings: 0,
    shiftStart: Date.now(),
    byType: {
      assignment: { count: 0, successRate: 0 },
      optimization: { count: 0, successRate: 0 },
      prediction: { count: 0, successRate: 0 },
      maintenance: { count: 0, successRate: 0 },
      safety: { count: 0, successRate: 0 },
    },
  },
  productionTargets: { daily: 28800, shift: 9600, current: 0 }, // kg targets
  lowProductionHours: [6, 7, 14, 15, 22, 23], // Shift change hours
};

function isOnCooldown(entityId: string): boolean {
  const expiry = aiMemory.decisionCooldowns.get(entityId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    aiMemory.decisionCooldowns.delete(entityId);
    return false;
  }
  return true;
}

function setCooldown(entityId: string, durationMs: number): void {
  aiMemory.decisionCooldowns.set(entityId, Date.now() + durationMs);
}

function recordDecision(decision: AIDecision): void {
  if (decision.machineId) {
    const existing = aiMemory.recentDecisionsByMachine.get(decision.machineId) || [];
    aiMemory.recentDecisionsByMachine.set(decision.machineId, [decision, ...existing].slice(0, 10));
  }
  if (decision.workerId) {
    const existing = aiMemory.recentDecisionsByWorker.get(decision.workerId) || [];
    aiMemory.recentDecisionsByWorker.set(decision.workerId, [decision, ...existing].slice(0, 10));
  }

  // Issue 1 Fix: Automatically add decision to store to prevent loss before applyDecisionEffects
  // Decisions are now immediately persisted, eliminating the risk of loss during array trimming
  useProductionStore.getState().addAIDecision(decision);

  // Log for replay system
  useHistoricalPlaybackStore.getState().logDecision(decision);
}

function hasRecentDecision(
  entityId: string,
  type: AIDecision['type'],
  withinMs: number = AI_ENGINE_TIMING.recentDecisionWindow
): boolean {
  const machineDecisions = aiMemory.recentDecisionsByMachine.get(entityId) || [];
  const workerDecisions = aiMemory.recentDecisionsByWorker.get(entityId) || [];
  const allDecisions = [...machineDecisions, ...workerDecisions];

  return allDecisions.some(
    (d) =>
      d.type === type &&
      Date.now() - d.timestamp.getTime() < withinMs &&
      (d.status === 'pending' || d.status === 'in_progress')
  );
}

// ============================================================================
// Trend Analysis System
// ============================================================================

// Performance: Memory management constants
const MAX_METRIC_HISTORY_POINTS = 60; // ~1 point per 5 seconds for 5 minutes
const MAX_ANOMALY_HISTORY = 100;
const MAX_CROSS_MACHINE_PATTERNS = 50;

function updateMetricHistory(machine: MachineData): void {
  const now = Date.now();
  const metrics: Array<{ key: 'temperature' | 'vibration' | 'load'; value: number }> = [
    { key: 'temperature', value: machine.metrics.temperature },
    { key: 'vibration', value: machine.metrics.vibration },
    { key: 'load', value: machine.metrics.load },
  ];

  for (const { key, value } of metrics) {
    const historyKey = `${machine.id}-${key}`;
    let trendData = aiMemory.metricHistory.get(historyKey);

    if (!trendData) {
      trendData = {
        machineId: machine.id,
        metric: key,
        history: [],
        trend: 'stable',
        rateOfChange: 0,
      };
    }

    // Add new data point
    trendData.history.push({ timestamp: now, value });

    // Keep only last 5 minutes of data AND enforce max count for memory safety
    const fiveMinutesAgo = now - AI_ENGINE_TIMING.metricHistoryWindow;
    trendData.history = trendData.history.filter((h) => h.timestamp > fiveMinutesAgo);
    // Additional hard limit to prevent memory leaks
    if (trendData.history.length > MAX_METRIC_HISTORY_POINTS) {
      trendData.history = trendData.history.slice(-MAX_METRIC_HISTORY_POINTS);
    }

    // Calculate trend if we have enough data
    if (trendData.history.length >= 3) {
      const oldest = trendData.history[0];
      const newest = trendData.history[trendData.history.length - 1];
      const timeDiffMinutes = (newest.timestamp - oldest.timestamp) / 60000;

      if (timeDiffMinutes > 0) {
        trendData.rateOfChange = (newest.value - oldest.value) / timeDiffMinutes;

        if (trendData.rateOfChange > 0.5) {
          trendData.trend = 'rising';
        } else if (trendData.rateOfChange < -0.5) {
          trendData.trend = 'falling';
        } else {
          trendData.trend = 'stable';
        }
      }
    }

    aiMemory.metricHistory.set(historyKey, trendData);
  }
}

function getTrend(
  machineId: string,
  metric: 'temperature' | 'vibration' | 'load'
): TrendData | null {
  return aiMemory.metricHistory.get(`${machineId}-${metric}`) || null;
}

function analyzeTrends(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (now - (aiMemory.lastAnalysisTime.trends || 0) < AI_ENGINE_TIMING.trendAnalysisCooldown)
    return null;
  aiMemory.lastAnalysisTime.trends = now;

  // Update history for all machines
  for (const machine of context.machines) {
    updateMetricHistory(machine);
  }

  // Find concerning trends
  for (const machine of context.machines) {
    const tempTrend = getTrend(machine.id, 'temperature');
    const vibTrend = getTrend(machine.id, 'vibration');

    // Rising temperature trend
    if (tempTrend && tempTrend.trend === 'rising' && tempTrend.rateOfChange > 1.0) {
      if (hasRecentDecision(machine.id, 'prediction', AI_ENGINE_TIMING.tempTrendDuplicateWindow))
        continue;

      const minutesUntilCritical = (70 - machine.metrics.temperature) / tempTrend.rateOfChange;

      if (minutesUntilCritical > 0 && minutesUntilCritical < 30) {
        const decision: AIDecision = {
          id: generateDecisionId(),
          timestamp: new Date(),
          type: 'prediction',
          action: `TREND ALERT: ${machine.name} temperature rising ${tempTrend.rateOfChange.toFixed(1)}C/min`,
          reasoning: `Current: ${machine.metrics.temperature.toFixed(1)}C, projected critical in ${Math.round(minutesUntilCritical)} minutes`,
          confidence: calculateConfidence('prediction', context, 'high'),
          impact: `Preemptive action prevents thermal shutdown in ~${Math.round(minutesUntilCritical)} min`,
          machineId: machine.id,
          status: 'pending',
          triggeredBy: 'prediction',
          priority: minutesUntilCritical < 10 ? 'high' : 'medium',
          uncertainty: 'Trend based on 5-minute rolling window',
        };

        recordDecision(decision);
        return decision;
      }
    }

    // Rising vibration trend (bearing wear indicator)
    if (vibTrend && vibTrend.trend === 'rising' && vibTrend.rateOfChange > 0.1) {
      if (hasRecentDecision(machine.id, 'prediction', AI_ENGINE_TIMING.vibTrendDuplicateWindow))
        continue;

      const decision: AIDecision = {
        id: generateDecisionId(),
        timestamp: new Date(),
        type: 'prediction',
        action: `Vibration trending upward on ${machine.name} - bearing analysis recommended`,
        reasoning: `Vibration increasing ${(vibTrend.rateOfChange * 60).toFixed(2)}mm/s per hour - early wear indicator`,
        confidence: calculateConfidence('prediction', context, 'medium'),
        impact: 'Early intervention extends component life 20-40%',
        machineId: machine.id,
        status: 'pending',
        triggeredBy: 'prediction',
        priority: 'low',
        uncertainty: 'Requires physical inspection to confirm wear pattern',
      };

      recordDecision(decision);
      return decision;
    }
  }

  return null;
}

// ============================================================================
// Cross-Machine Correlation Detection
// ============================================================================

function detectCrossMachinePatterns(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (
    now - (aiMemory.lastAnalysisTime.correlation || 0) <
    AI_ENGINE_TIMING.correlationAnalysisCooldown
  )
    return null;
  aiMemory.lastAnalysisTime.correlation = now;

  const { machines } = context;
  if (machines.length < 3) return null;

  // Group machines by type for correlation analysis
  const machinesByType = machines.reduce(
    (acc, m) => {
      if (!acc[m.type]) acc[m.type] = [];
      acc[m.type].push(m);
      return acc;
    },
    {} as Record<string, MachineData[]>
  );

  // Check for temperature clusters (multiple machines running hot)
  const hotMachines = machines.filter((m) => m.metrics.temperature > 55);
  if (hotMachines.length >= 3) {
    const avgTemp =
      hotMachines.reduce((sum, m) => sum + m.metrics.temperature, 0) / hotMachines.length;

    // Check if this is a new pattern
    const existingPattern = aiMemory.crossMachinePatterns.find(
      (p) =>
        p.pattern === 'temperature_cluster' &&
        now - p.timestamp < AI_ENGINE_TIMING.tempClusterExpiry
    );

    if (!existingPattern) {
      const pattern: CrossMachinePattern = {
        pattern: 'temperature_cluster',
        affectedMachines: hotMachines.map((m) => m.id),
        severity: avgTemp > 65 ? 'high' : avgTemp > 58 ? 'medium' : 'low',
        possibleCause: 'Ambient temperature, grain moisture content, or HVAC issue',
        timestamp: now,
      };
      aiMemory.crossMachinePatterns.push(pattern);

      // Clean old patterns with hard count limit for memory safety
      aiMemory.crossMachinePatterns = aiMemory.crossMachinePatterns.filter(
        (p) => now - p.timestamp < AI_ENGINE_TIMING.crossMachinePatternMaxAge
      );
      if (aiMemory.crossMachinePatterns.length > MAX_CROSS_MACHINE_PATTERNS) {
        aiMemory.crossMachinePatterns = aiMemory.crossMachinePatterns.slice(
          -MAX_CROSS_MACHINE_PATTERNS
        );
      }

      const decision: AIDecision = {
        id: generateDecisionId(),
        timestamp: new Date(),
        type: 'prediction',
        action: `Cross-system temperature anomaly detected - ${hotMachines.length} machines running warm`,
        reasoning: `Average temperature ${avgTemp.toFixed(1)}C across ${hotMachines.map((m) => m.name).join(', ')}. Pattern suggests systemic issue rather than individual machine failure.`,
        confidence: calculateConfidence('prediction', context, 'high'),
        impact: 'Identifying root cause prevents multiple machine interventions',
        status: 'pending',
        triggeredBy: 'metric',
        priority: pattern.severity === 'high' ? 'high' : 'medium',
        alternatives: [
          { action: 'Check ambient temperature sensors', tradeoff: 'May be environmental' },
          { action: 'Review grain moisture levels', tradeoff: 'Affects grinding friction' },
          { action: 'Inspect HVAC system', tradeoff: 'Cooling capacity may be insufficient' },
        ],
      };

      recordDecision(decision);
      return decision;
    }
  }

  // Check for vibration clusters (bearing issues often appear together after maintenance batches)
  const highVibrationMachines = machines.filter(
    (m) => m.type === MachineType.ROLLER_MILL && m.metrics.vibration > 3.0
  );
  if (highVibrationMachines.length >= 2) {
    const existingPattern = aiMemory.crossMachinePatterns.find(
      (p) =>
        p.pattern === 'vibration_cluster' && now - p.timestamp < AI_ENGINE_TIMING.vibClusterExpiry
    );

    if (!existingPattern) {
      aiMemory.crossMachinePatterns.push({
        pattern: 'vibration_cluster',
        affectedMachines: highVibrationMachines.map((m) => m.id),
        severity: 'medium',
        possibleCause: 'Common maintenance batch or supply chain issue',
        timestamp: now,
      });

      const decision: AIDecision = {
        id: generateDecisionId(),
        timestamp: new Date(),
        type: 'prediction',
        action: `Correlated vibration pattern on ${highVibrationMachines.length} roller mills`,
        reasoning: `Mills ${highVibrationMachines.map((m) => m.name).join(', ')} showing similar vibration increase. May indicate common bearing batch or lubrication issue.`,
        confidence: calculateConfidence('prediction', context, 'medium'),
        impact: 'Batch inspection more efficient than individual checks',
        status: 'pending',
        triggeredBy: 'prediction',
        priority: 'medium',
        uncertainty: 'Correlation does not imply causation - physical inspection needed',
      };

      recordDecision(decision);
      return decision;
    }
  }

  // Check for load imbalance across same-type machines
  for (const [type, typeMachines] of Object.entries(machinesByType)) {
    if (typeMachines.length < 2) continue;

    const loads = typeMachines.map((m) => m.metrics.load);
    const avgLoad = safeArrayAverage(loads, 0);
    const maxDiff = safeArrayRange(loads, 0);

    if (maxDiff > 40 && avgLoad > 60) {
      const overloaded = typeMachines.filter((m) => m.metrics.load > avgLoad + 15);
      const underloaded = typeMachines.filter((m) => m.metrics.load < avgLoad - 15);

      if (overloaded.length > 0 && underloaded.length > 0) {
        const existingPattern = aiMemory.crossMachinePatterns.find(
          (p) =>
            p.pattern === 'load_imbalance' &&
            now - p.timestamp < AI_ENGINE_TIMING.loadImbalanceExpiry
        );

        if (!existingPattern) {
          aiMemory.crossMachinePatterns.push({
            pattern: 'load_imbalance',
            affectedMachines: [...overloaded, ...underloaded].map((m) => m.id),
            severity: maxDiff > 50 ? 'high' : 'medium',
            possibleCause: 'Suboptimal routing or scheduling',
            timestamp: now,
          });

          const decision: AIDecision = {
            id: generateDecisionId(),
            timestamp: new Date(),
            type: 'optimization',
            action: `Load imbalance detected - rebalancing ${type} workload`,
            reasoning: `${overloaded.map((m) => m.name).join(', ')} overloaded while ${underloaded.map((m) => m.name).join(', ')} underutilized. ${maxDiff.toFixed(0)}% load differential.`,
            confidence: calculateConfidence('optimization', context),
            impact: `Balancing extends equipment life and improves throughput by ~${Math.round(maxDiff / 4)}%`,
            status: 'pending',
            triggeredBy: 'metric',
            priority: 'medium',
          };

          recordDecision(decision);
          return decision;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Anomaly Detection (Statistical Outliers)
// ============================================================================

function detectAnomalies(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (now - (aiMemory.lastAnalysisTime.anomaly || 0) < AI_ENGINE_TIMING.anomalyDetectionCooldown)
    return null;
  aiMemory.lastAnalysisTime.anomaly = now;

  const { machines } = context;

  for (const machine of machines) {
    const metrics: Array<{ key: 'temperature' | 'vibration' | 'load'; value: number }> = [
      { key: 'temperature', value: machine.metrics.temperature },
      { key: 'vibration', value: machine.metrics.vibration },
      { key: 'load', value: machine.metrics.load },
    ];

    for (const { key, value } of metrics) {
      const historyKey = `${machine.id}-${key}`;
      const trendData = aiMemory.metricHistory.get(historyKey);

      if (!trendData || trendData.history.length < 10) continue;

      // Calculate mean and standard deviation
      const values = trendData.history.map((h) => h.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) continue;

      // Calculate z-score
      const zScore = Math.abs((value - mean) / stdDev);

      // Flag if z-score > 2.5 (outside ~99% of normal distribution)
      if (zScore > 2.5) {
        // Check if we already flagged this recently
        const recentAnomaly = aiMemory.anomalyHistory.find(
          (a) =>
            a.machineId === machine.id &&
            a.metric === key &&
            now - a.timestamp < AI_ENGINE_TIMING.duplicateAnomalyWindow
        );

        if (recentAnomaly) continue;

        const anomaly: AnomalyRecord = {
          machineId: machine.id,
          metric: key,
          value,
          mean,
          stdDev,
          zScore,
          timestamp: now,
        };
        aiMemory.anomalyHistory.push(anomaly);

        // Keep only recent anomalies with hard count limit for memory safety
        aiMemory.anomalyHistory = aiMemory.anomalyHistory.filter(
          (a) => now - a.timestamp < AI_ENGINE_TIMING.anomalyHistoryMaxAge
        );
        if (aiMemory.anomalyHistory.length > MAX_ANOMALY_HISTORY) {
          aiMemory.anomalyHistory = aiMemory.anomalyHistory.slice(-MAX_ANOMALY_HISTORY);
        }

        const direction = value > mean ? 'above' : 'below';
        const severity = zScore > 3.5 ? 'critical' : zScore > 3 ? 'high' : 'medium';

        const decision: AIDecision = {
          id: generateDecisionId(),
          timestamp: new Date(),
          type: 'prediction',
          action: `Statistical anomaly: ${machine.name} ${key} is ${zScore.toFixed(1)}σ ${direction} normal`,
          reasoning: `Current: ${value.toFixed(1)}, Historical mean: ${mean.toFixed(1)} ±${stdDev.toFixed(1)}. This reading is statistically unusual.`,
          confidence: calculateConfidence('prediction', context, zScore > 3 ? 'high' : 'medium'),
          impact: 'Early anomaly detection prevents 67% of unplanned downtime',
          machineId: machine.id,
          status: 'pending',
          triggeredBy: 'prediction',
          priority: severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium',
          uncertainty: `Based on ${values.length} data points over ~5 minutes`,
        };

        recordDecision(decision);
        return decision;
      }
    }
  }

  return null;
}

// ============================================================================
// Learning from Outcomes
// ============================================================================

function recordDecisionOutcome(decision: AIDecision, success: boolean): void {
  const outcome: DecisionOutcome = {
    decisionId: decision.id,
    type: decision.type,
    success,
    timestamp: Date.now(),
    confidence: decision.confidence,
    actualOutcome: decision.outcome,
  };

  aiMemory.decisionOutcomes.push(outcome);

  // Keep only last 100 outcomes
  if (aiMemory.decisionOutcomes.length > 100) {
    aiMemory.decisionOutcomes = aiMemory.decisionOutcomes.slice(-100);
  }

  // Update impact stats
  aiMemory.impactStats.totalDecisions++;
  if (success) {
    aiMemory.impactStats.successfulDecisions++;
  }

  // Update type-specific stats
  const typeStats = aiMemory.impactStats.byType[decision.type];
  if (typeStats) {
    typeStats.count++;
    const typeOutcomes = aiMemory.decisionOutcomes.filter((o) => o.type === decision.type);
    const typeSuccesses = typeOutcomes.filter((o) => o.success).length;
    typeStats.successRate =
      typeOutcomes.length > 0 ? Math.round((typeSuccesses / typeOutcomes.length) * 100) : 0;
  }

  // Track prevented shutdowns (maintenance decisions that succeeded on critical machines)
  if (decision.type === 'maintenance' && success && decision.priority === 'critical') {
    aiMemory.impactStats.preventedShutdowns++;
    // Estimate savings: $2000-5000 per prevented shutdown
    aiMemory.impactStats.estimatedSavings += 2500 + Math.random() * 2500;
  }

  // Adjust confidence based on historical accuracy
  updateConfidenceAdjustment(decision.type);
}

function updateConfidenceAdjustment(type: AIDecision['type']): void {
  const typeOutcomes = aiMemory.decisionOutcomes.filter((o) => o.type === type);
  if (typeOutcomes.length < 5) return;

  // Calculate calibration error: predicted confidence vs actual success rate
  const recentOutcomes = typeOutcomes.slice(-20);
  const avgConfidence =
    recentOutcomes.reduce((sum, o) => sum + o.confidence, 0) / recentOutcomes.length;
  const actualSuccessRate =
    (recentOutcomes.filter((o) => o.success).length / recentOutcomes.length) * 100;

  // Adjustment: if we're overconfident, reduce confidence for future decisions
  // If underconfident, increase it
  const adjustment = (actualSuccessRate - avgConfidence) * 0.2; // 20% correction factor
  aiMemory.confidenceAdjustments.set(type, Math.max(-15, Math.min(15, adjustment)));
}

function getLearnedConfidenceAdjustment(type: AIDecision['type']): number {
  return aiMemory.confidenceAdjustments.get(type) || 0;
}

// ============================================================================
// Production Target Awareness
// ============================================================================

function updateProductionTracking(context: FactoryContext): void {
  // Update current production based on throughput
  const hourlyThroughput = context.metrics.throughput; // kg/hr
  aiMemory.productionTargets.current += (hourlyThroughput / 3600) * 6; // Assume 6 second tick
}

function generateProductionAwareDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (
    now - (aiMemory.lastAnalysisTime.production || 0) <
    AI_ENGINE_TIMING.productionAnalysisCooldown
  )
    return null;
  aiMemory.lastAnalysisTime.production = now;

  const { shift, current } = {
    shift: aiMemory.productionTargets.shift,
    current: aiMemory.productionTargets.current,
  };

  // Calculate shift progress
  const shiftProgress = (current / shift) * 100;
  const gameHour = context.gameTime;
  const shiftHoursPassed = getShiftHoursPassed(gameHour, context.currentShift);
  const expectedProgress = (shiftHoursPassed / 8) * 100;

  // If we're significantly behind target
  if (shiftProgress < expectedProgress - 15 && expectedProgress > 30) {
    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: 'Production falling behind shift target - recommending throughput optimization',
      reasoning: `Current: ${shiftProgress.toFixed(0)}% of shift target, Expected: ${expectedProgress.toFixed(0)}%. Gap of ${(expectedProgress - shiftProgress).toFixed(0)}%.`,
      confidence: calculateConfidence('optimization', context),
      impact: `Closing gap requires ${((((expectedProgress - shiftProgress) / 100) * shift) / Math.max(0.5, 8 - shiftHoursPassed)).toFixed(0)} kg/hr increase`,
      status: 'pending',
      triggeredBy: 'metric',
      priority: shiftProgress < expectedProgress - 25 ? 'high' : 'medium',
      alternatives: [
        { action: 'Increase mill feed rates', tradeoff: 'May impact quality slightly' },
        { action: 'Optimize packer cycle times', tradeoff: 'Downstream focus' },
        { action: 'Accept reduced target', tradeoff: 'Preserves quality' },
      ],
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

function getShiftHoursPassed(gameHour: number, shift: 'morning' | 'afternoon' | 'night'): number {
  const shiftStarts = { morning: 6, afternoon: 14, night: 22 };
  const start = shiftStarts[shift];

  if (shift === 'night') {
    if (gameHour >= 22) return gameHour - 22;
    return 24 - 22 + gameHour; // After midnight
  }

  return Math.max(0, Math.min(8, gameHour - start));
}

// ============================================================================
// Maintenance Window Optimization
// ============================================================================

function isLowProductionPeriod(gameTime: number): boolean {
  const hour = Math.floor(gameTime);
  return aiMemory.lowProductionHours.includes(hour);
}

function generateMaintenanceWindowDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (
    now - (aiMemory.lastAnalysisTime.maintenanceWindow || 0) <
    AI_ENGINE_TIMING.maintenanceWindowCooldown
  )
    return null;

  // Check if we're in or approaching a low production window
  const gameHour = Math.floor(context.gameTime);
  const isLowPeriod = isLowProductionPeriod(context.gameTime);
  const nextLowHour =
    aiMemory.lowProductionHours.find((h) => h > gameHour) || aiMemory.lowProductionHours[0];
  const hoursUntilLow =
    nextLowHour > gameHour ? nextLowHour - gameHour : 24 - gameHour + nextLowHour;

  // Find machines that need maintenance but aren't critical
  const maintenanceCandidates = context.machines
    .filter((m) => m.metrics.vibration > 2.5 || m.metrics.temperature > 55 || m.metrics.load > 90)
    .filter((m) => m.status !== 'critical');

  if (maintenanceCandidates.length === 0) return null;

  // If we're in a low period and have candidates, recommend immediate scheduling
  if (isLowPeriod && maintenanceCandidates.length > 0) {
    aiMemory.lastAnalysisTime.maintenanceWindow = now;

    const candidate = maintenanceCandidates[0];
    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'maintenance',
      action: `Optimal maintenance window - scheduling ${candidate.name} service now`,
      reasoning: `Currently in low-production period (shift transition). ${candidate.name} showing elevated metrics - ideal time for preventive maintenance with minimal production impact.`,
      confidence: calculateConfidence('maintenance', context, 'high'),
      impact: 'Zero production loss vs estimated 15-30min during peak',
      machineId: candidate.id,
      status: 'pending',
      triggeredBy: 'schedule',
      priority: 'medium',
    };

    recordDecision(decision);
    return decision;
  }

  // If we have candidates and low period is approaching, schedule ahead
  if (hoursUntilLow <= 2 && maintenanceCandidates.length > 0) {
    const nonUrgent = maintenanceCandidates.filter((m) => m.status !== 'warning');
    if (nonUrgent.length > 0) {
      aiMemory.lastAnalysisTime.maintenanceWindow = now;

      const decision: AIDecision = {
        id: generateDecisionId(),
        timestamp: new Date(),
        type: 'prediction',
        action: `Scheduling ${nonUrgent.length} maintenance tasks for upcoming low-production window`,
        reasoning: `Low-production period in ~${hoursUntilLow} hours. Pre-scheduling ${nonUrgent.map((m) => m.name).join(', ')} for optimal timing.`,
        confidence: calculateConfidence('prediction', context),
        impact: 'Proactive scheduling reduces production impact by 80%',
        status: 'pending',
        triggeredBy: 'schedule',
        priority: 'low',
      };

      recordDecision(decision);
      return decision;
    }
  }

  return null;
}

// ============================================================================
// Weather-Aware Decisions
// ============================================================================

function generateWeatherDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (now - (aiMemory.lastAnalysisTime.weather || 0) < AI_ENGINE_TIMING.weatherAnalysisCooldown)
    return null;

  const { weather } = context;

  // Only react to concerning weather
  if (weather === 'clear' || weather === 'cloudy') return null;

  aiMemory.lastAnalysisTime.weather = now;

  if (weather === 'storm') {
    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: 'Storm protocol activated - securing outdoor operations',
      reasoning: 'Severe weather detected - protecting personnel and equipment in exposed areas',
      confidence: 95,
      impact: 'Preventing weather-related incidents and equipment damage',
      status: 'pending',
      triggeredBy: 'alert',
      priority: 'high',
      alternatives: [
        { action: 'Partial shutdown only', tradeoff: 'Some operations continue at risk' },
      ],
    };

    recordDecision(decision);
    return decision;
  }

  if (weather === 'rain') {
    // Check for loading bay operations
    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: 'Rain detected - adjusting loading bay schedules',
      reasoning: 'Wet conditions increase slip hazards in loading areas',
      confidence: 88,
      impact: 'Maintaining safety standards while minimizing throughput impact',
      status: 'pending',
      triggeredBy: 'alert',
      priority: 'medium',
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

// ============================================================================
// Emergency Drill Coordination
// ============================================================================

function generateDrillDecision(context: FactoryContext): AIDecision | null {
  if (!context.emergencyDrillMode) {
    if (aiMemory.drillPhase !== 'none') {
      aiMemory.drillPhase = 'none';
      aiMemory.drillStartTime = null;
    }
    return null;
  }

  const now = Date.now();

  // Initialize drill
  if (aiMemory.drillPhase === 'none') {
    aiMemory.drillPhase = 'alert';
    aiMemory.drillStartTime = now;

    const supervisor = WORKER_ROSTER.find((w) => w.role === 'Supervisor');
    const safetyOfficer = WORKER_ROSTER.find((w) => w.role === 'Safety Officer');

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: 'EMERGENCY DRILL INITIATED - All personnel to designated assembly points',
      reasoning: 'Scheduled safety drill - testing emergency response procedures',
      confidence: 100,
      impact: 'Ensuring regulatory compliance and team preparedness',
      workerId: safetyOfficer?.id || supervisor?.id,
      status: 'in_progress',
      triggeredBy: 'user',
      priority: 'critical',
    };

    recordDecision(decision);
    return decision;
  }

  // Progress through drill phases
  const elapsed = now - (aiMemory.drillStartTime || now);

  if (aiMemory.drillPhase === 'alert' && elapsed > AI_ENGINE_TIMING.drillAlertDuration) {
    aiMemory.drillPhase = 'evacuation';

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: 'Drill Phase 2: Evacuation in progress - monitoring zone clearance',
      reasoning: `All zones evacuating - ${context.workers.length} personnel accounted for`,
      confidence: 95,
      impact: 'Tracking evacuation timing for procedure optimization',
      status: 'in_progress',
      triggeredBy: 'schedule',
      priority: 'high',
    };

    recordDecision(decision);
    return decision;
  }

  if (aiMemory.drillPhase === 'evacuation' && elapsed > AI_ENGINE_TIMING.drillEvacuationDuration) {
    aiMemory.drillPhase = 'assembly';

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: 'Drill Phase 3: Assembly complete - conducting headcount',
      reasoning: 'All personnel at designated assembly points',
      confidence: 98,
      impact: `Evacuation time: ${Math.round(elapsed / 1000)}s - within target parameters`,
      status: 'in_progress',
      triggeredBy: 'schedule',
      priority: 'medium',
    };

    recordDecision(decision);
    return decision;
  }

  if (aiMemory.drillPhase === 'assembly' && elapsed > AI_ENGINE_TIMING.drillAssemblyDuration) {
    aiMemory.drillPhase = 'review';

    const evacuationTime = Math.round((elapsed - 15000) / 1000);
    const rating =
      evacuationTime < 20 ? 'Excellent' : evacuationTime < 30 ? 'Good' : 'Needs Improvement';

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: `DRILL COMPLETE - Performance Rating: ${rating}`,
      reasoning: `Total drill time: ${Math.round(elapsed / 1000)}s, Evacuation: ${evacuationTime}s`,
      confidence: 100,
      impact: 'Drill data logged for compliance reporting',
      status: 'completed',
      outcome: `${rating} - All objectives met`,
      triggeredBy: 'schedule',
      priority: 'low',
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

// ============================================================================
// Heat Map / Congestion Analysis
// ============================================================================

function analyzeHeatMap(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (now - (aiMemory.lastAnalysisTime.heatmap || 0) < AI_ENGINE_TIMING.heatmapAnalysisCooldown)
    return null;

  const { heatMapData } = context;
  if (heatMapData.length < 10) return null;

  aiMemory.lastAnalysisTime.heatmap = now;

  // Find high-intensity clusters (congestion)
  const hotspots = heatMapData.filter((p) => p.intensity > 5);

  if (hotspots.length === 0) {
    aiMemory.congestionHotspots = [];
    return null;
  }

  // Cluster hotspots
  const clusters: Array<{ x: number; z: number; count: number; maxIntensity: number }> = [];

  for (const point of hotspots) {
    const existingCluster = clusters.find(
      (c) => Math.abs(c.x - point.x) < 5 && Math.abs(c.z - point.z) < 5
    );

    if (existingCluster) {
      existingCluster.count++;
      existingCluster.maxIntensity = Math.max(existingCluster.maxIntensity, point.intensity);
    } else {
      clusters.push({ x: point.x, z: point.z, count: 1, maxIntensity: point.intensity });
    }
  }

  // Find most severe congestion
  const worstCluster = clusters.reduce(
    (a, b) => (a.maxIntensity > b.maxIntensity ? a : b),
    clusters[0]
  );

  if (!worstCluster || worstCluster.maxIntensity < 6) return null;

  const zoneName = getZoneName(worstCluster.x, worstCluster.z);
  const severity =
    worstCluster.maxIntensity > 8 ? 'high' : worstCluster.maxIntensity > 6 ? 'medium' : 'low';

  // Update stored hotspots
  aiMemory.congestionHotspots = clusters.map((c) => ({
    x: c.x,
    z: c.z,
    severity:
      c.maxIntensity > 8
        ? ('high' as const)
        : c.maxIntensity > 6
          ? ('medium' as const)
          : ('low' as const),
    lastAnalyzed: now,
  }));

  if (severity === 'high') {
    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: `Traffic congestion detected in ${zoneName} - recommending route optimization`,
      reasoning: `Heat map shows intensity ${worstCluster.maxIntensity.toFixed(1)} at coordinates (${worstCluster.x.toFixed(0)}, ${worstCluster.z.toFixed(0)})`,
      confidence: calculateConfidence('optimization', context),
      impact: 'Reducing worker transit time and forklift delays by 15-20%',
      status: 'pending',
      triggeredBy: 'metric',
      priority: 'medium',
      alternatives: [
        { action: 'Add temporary speed zone', tradeoff: 'Slower transit but safer' },
        { action: 'Stagger break times', tradeoff: 'Reduces peak congestion' },
      ],
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

function getZoneName(x: number, z: number): string {
  if (z < -15) return 'Silo Area';
  if (z < 0) return 'Milling Floor';
  if (z < 12) return 'Sifting Level';
  if (z >= 12) return 'Packing Zone';
  if (Math.abs(x) < 5 && Math.abs(z) < 5) return 'Central Intersection';
  return `Zone (${x.toFixed(0)}, ${z.toFixed(0)})`;
}

// ============================================================================
// Shift Change Intelligence
// ============================================================================

function generateShiftChangeDecision(context: FactoryContext): AIDecision | null {
  const { currentShift, gameTime } = context;

  const currentHour = gameTime;
  const isNearShiftEnd =
    (currentShift === 'morning' && currentHour >= 13.5 && currentHour < 14.5) ||
    (currentShift === 'afternoon' && currentHour >= 21.5 && currentHour < 22.5) ||
    (currentShift === 'night' &&
      ((currentHour >= 5.5 && currentHour < 6.5) || currentHour >= 23.5 || currentHour < 0.5));

  if (isNearShiftEnd && !aiMemory.shiftTransitionActive) {
    aiMemory.shiftTransitionActive = true;
    aiMemory.lastShift = currentShift;

    const incomingShift =
      currentShift === 'morning' ? 'afternoon' : currentShift === 'afternoon' ? 'night' : 'morning';

    const supervisor = WORKER_ROSTER.find((w) => w.role === 'Supervisor');

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'assignment',
      action: `Shift handover: Preparing ${incomingShift} shift briefing`,
      reasoning: `${currentShift.charAt(0).toUpperCase() + currentShift.slice(1)} shift ending - coordinating seamless transition`,
      confidence: 95,
      impact: 'Ensuring operational continuity and knowledge transfer',
      workerId: supervisor?.id,
      status: 'pending',
      triggeredBy: 'schedule',
      priority: 'medium',
      alternatives: [
        { action: 'Extended overlap period', tradeoff: 'Better handoff but higher labor cost' },
      ],
    };

    recordDecision(decision);
    return decision;
  }

  // Reset transition flag when shift actually changes
  if (aiMemory.shiftTransitionActive && currentShift !== aiMemory.lastShift) {
    aiMemory.shiftTransitionActive = false;

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: `${currentShift.charAt(0).toUpperCase() + currentShift.slice(1)} shift active - initializing shift parameters`,
      reasoning: 'New shift crew in position - calibrating production targets',
      confidence: 92,
      impact: 'Optimal production ramp-up for new shift',
      status: 'pending',
      triggeredBy: 'schedule',
      priority: 'low',
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

// ============================================================================
// Worker Fatigue Awareness
// ============================================================================

function generateFatigueDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (now - (aiMemory.lastAnalysisTime.fatigue || 0) < AI_ENGINE_TIMING.fatigueAnalysisCooldown)
    return null;

  const { workerSatisfaction } = context;

  // Check for low energy levels
  if (workerSatisfaction.averageEnergy < 40) {
    aiMemory.lastAnalysisTime.fatigue = now;

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: 'Worker energy levels low - initiating rotating break schedule',
      reasoning: `Average energy at ${workerSatisfaction.averageEnergy.toFixed(0)}% - fatigue impacts safety and productivity`,
      confidence: calculateConfidence('optimization', context),
      impact: `Preventing ${Math.round((100 - workerSatisfaction.averageEnergy) / 10)}% productivity loss from fatigue`,
      status: 'pending',
      triggeredBy: 'metric',
      priority: workerSatisfaction.averageEnergy < 25 ? 'high' : 'medium',
      uncertainty: 'Individual worker energy levels may vary',
    };

    recordDecision(decision);
    return decision;
  }

  // Check for low satisfaction affecting productivity
  if (workerSatisfaction.overallScore < 60 && workerSatisfaction.productivityBonus < 0) {
    aiMemory.lastAnalysisTime.fatigue = now;

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'optimization',
      action: 'Worker morale below target - recommending engagement activities',
      reasoning: `Satisfaction score ${workerSatisfaction.overallScore}% causing ${Math.abs(workerSatisfaction.productivityBonus)}% productivity penalty`,
      confidence: 78,
      impact: 'Restoring positive productivity bonus through improved morale',
      status: 'pending',
      triggeredBy: 'metric',
      priority: 'low',
      alternatives: [
        { action: 'Schedule team meeting', tradeoff: 'Brief production pause' },
        { action: 'Extend break duration', tradeoff: 'Improved rest but less output' },
      ],
    };

    recordDecision(decision);
    return decision;
  }

  return null;
}

// ============================================================================
// Predictive Scheduling Queue
// ============================================================================

function updatePredictiveSchedule(context: FactoryContext): void {
  const now = Date.now();

  // Clear expired predictions
  aiMemory.predictedEvents = aiMemory.predictedEvents.filter(
    (e) => e.predictedTime.getTime() > now
  );

  // Add shift change predictions
  const nextShiftTime = calculateNextShiftTime(context.gameTime);
  if (nextShiftTime) {
    const existingShiftPrediction = aiMemory.predictedEvents.find((e) => e.type === 'shift_change');
    if (!existingShiftPrediction) {
      aiMemory.predictedEvents.push({
        id: `pred-shift-${now}`,
        type: 'shift_change',
        description: 'Upcoming shift change - prepare handover',
        predictedTime: nextShiftTime,
        confidence: 100,
        priority: 'medium',
      });
    }
  }

  // Add maintenance predictions based on trends
  for (const machine of context.machines) {
    const tempTrend = getTrend(machine.id, 'temperature');
    if (tempTrend && tempTrend.trend === 'rising' && tempTrend.rateOfChange > 0.5) {
      const minutesUntilWarning = (65 - machine.metrics.temperature) / tempTrend.rateOfChange;
      if (minutesUntilWarning > 5 && minutesUntilWarning < 60) {
        const existingPred = aiMemory.predictedEvents.find(
          (e) => e.machineId === machine.id && e.type === 'maintenance'
        );
        if (!existingPred) {
          aiMemory.predictedEvents.push({
            id: `pred-maint-${machine.id}-${now}`,
            type: 'maintenance',
            description: `${machine.name} may need cooling intervention`,
            predictedTime: new Date(now + minutesUntilWarning * 60000),
            confidence: 70 + Math.min(20, tempTrend.history.length * 2),
            machineId: machine.id,
            priority: minutesUntilWarning < 15 ? 'high' : 'medium',
          });
        }
      }
    }
  }

  // Add weather-based predictions
  if (context.weather === 'cloudy') {
    const existingWeatherPred = aiMemory.predictedEvents.find((e) => e.type === 'weather');
    if (!existingWeatherPred) {
      aiMemory.predictedEvents.push({
        id: `pred-weather-${now}`,
        type: 'weather',
        description: 'Possible rain - monitor loading bay operations',
        predictedTime: new Date(now + 15 * 60000),
        confidence: 60,
        priority: 'low',
      });
    }
  }

  // Add fatigue predictions
  if (
    context.workerSatisfaction.averageEnergy < 60 &&
    context.workerSatisfaction.averageEnergy > 30
  ) {
    const minutesToCritical = (context.workerSatisfaction.averageEnergy - 25) * 2;
    const existingFatiguePred = aiMemory.predictedEvents.find((e) => e.type === 'fatigue');
    if (!existingFatiguePred) {
      aiMemory.predictedEvents.push({
        id: `pred-fatigue-${now}`,
        type: 'fatigue',
        description: 'Worker energy declining - breaks needed soon',
        predictedTime: new Date(now + minutesToCritical * 60000),
        confidence: 75,
        priority: 'medium',
      });
    }
  }

  // Sort by time
  aiMemory.predictedEvents.sort((a, b) => a.predictedTime.getTime() - b.predictedTime.getTime());

  // Limit queue size
  aiMemory.predictedEvents = aiMemory.predictedEvents.slice(0, 10);
}

function calculateNextShiftTime(currentGameTime: number): Date | null {
  const shiftEnds = [6, 14, 22];
  const now = Date.now();

  for (const hour of shiftEnds) {
    if (currentGameTime < hour) {
      const hoursUntil = hour - currentGameTime;
      // Game time moves at 24 hours per 10 minutes real time
      const realMinutesUntil = (hoursUntil / 24) * 10;
      return new Date(now + realMinutesUntil * 60000);
    }
  }

  // Next shift is at 6am tomorrow
  const hoursUntil = 24 - currentGameTime + 6;
  const realMinutesUntil = (hoursUntil / 24) * 10;
  return new Date(now + realMinutesUntil * 60000);
}

// ============================================================================
// Confidence Calculation (Enhanced)
// ============================================================================

function calculateConfidence(
  type: AIDecision['type'],
  context: FactoryContext,
  dataQuality: 'high' | 'medium' | 'low' = 'high'
): number {
  let confidence = 75;

  const qualityBonus = { high: 15, medium: 5, low: -10 }[dataQuality];
  confidence += qualityBonus;

  switch (type) {
    case 'prediction':
      confidence -= 12;
      break;
    case 'safety':
      confidence += 8;
      break;
    case 'maintenance':
      confidence += 5;
      break;
    case 'optimization':
      confidence -= 5;
      break;
    case 'assignment':
      confidence += 3;
      break;
  }

  if (context.emergencyActive && !context.emergencyDrillMode) confidence -= 10;
  if (context.metrics.efficiency > 95) confidence += 5;
  if (context.metrics.efficiency < 80) confidence -= 8;

  // Weather impact on confidence
  if (context.weather === 'storm') confidence -= 5;
  if (context.weather === 'rain') confidence -= 2;

  // Fatigue impact
  if (context.workerSatisfaction.averageEnergy < 50) confidence -= 5;

  // Apply learned confidence adjustment from historical accuracy
  const learnedAdjustment = getLearnedConfidenceAdjustment(type);
  confidence += learnedAdjustment;

  confidence += (Math.random() - 0.5) * 6;

  return Math.min(99, Math.max(55, Math.round(confidence)));
}

// ============================================================================
// Worker Selection (Enhanced with Fatigue)
// ============================================================================

function findBestWorkerForTask(
  context: FactoryContext,
  taskType: 'maintenance' | 'safety' | 'quality' | 'general',
  nearMachineId?: string
): WorkerData | null {
  const availableWorkers = context.workers.filter(
    (w) => w.status === 'idle' || w.status === 'working'
  );

  if (availableWorkers.length === 0) {
    const rosterWorkers = WORKER_ROSTER.filter((w) => {
      const recentAssignment = hasRecentDecision(
        w.id,
        'assignment',
        AI_ENGINE_TIMING.assignmentDuplicateWindow
      );
      return !recentAssignment;
    });

    if (rosterWorkers.length === 0) return null;

    const roleMatch: Record<typeof taskType, string[]> = {
      maintenance: ['Maintenance', 'Engineer'],
      safety: ['Safety Officer', 'Supervisor'],
      quality: ['Quality Control', 'Engineer'],
      general: ['Operator', 'Engineer', 'Maintenance'],
    };

    const preferredRoles = roleMatch[taskType];
    const matchedRosterWorker =
      rosterWorkers.find((w) => preferredRoles.includes(w.role)) || rosterWorkers[0];

    // Convert roster worker to full WorkerData by adding missing fields with defaults
    if (matchedRosterWorker) {
      const fullWorker: WorkerData = {
        ...matchedRosterWorker,
        position: [0, 0, 0] as [number, number, number],
        direction: 1 as const,
      };
      return fullWorker;
    }

    return null;
  }

  const rolePreference: Record<typeof taskType, string[]> = {
    maintenance: ['Maintenance', 'Engineer'],
    safety: ['Safety Officer', 'Supervisor'],
    quality: ['Quality Control', 'Engineer'],
    general: ['Operator', 'Engineer', 'Maintenance'],
  };

  // Consider average energy as proxy for fatigue
  const energyFactor = context.workerSatisfaction.averageEnergy / 100;

  // === STRATEGIC PRIORITY INFLUENCE (Enhanced) ===
  // Get structured strategic weight for this machine from the store
  const strategicWeight = nearMachineId
    ? useAIConfigStore.getState().getActiveWeight(nearMachineId)
    : 0;

  // Clean up expired priorities periodically (every worker selection call)
  useAIConfigStore.getState().removeExpiredPriorities();

  // Also check legacy string priorities for backward compatibility
  const strategicState = useAIConfigStore.getState().strategic;
  const legacyPriorities = strategicState.legacyPriorities || [];
  const hasLegacyMatch =
    nearMachineId &&
    legacyPriorities.some(
      (p) =>
        p.toLowerCase().includes(nearMachineId.toLowerCase()) ||
        (nearMachineId.toLowerCase().includes('silo') && p.toLowerCase().includes('silo')) ||
        (nearMachineId.toLowerCase().includes('rm-') && p.toLowerCase().includes('mill')) ||
        (nearMachineId.toLowerCase().includes('pack') && p.toLowerCase().includes('pack'))
    );

  // Category alignment bonus based on task type
  const categoryBonus = calculateCategoryBonus(taskType);

  const scoredWorkers = availableWorkers.map((worker) => {
    let score = 0;

    const preferredRoles = rolePreference[taskType];
    if (preferredRoles.includes(worker.role)) score += 50;
    if (worker.status === 'idle') score += 30;
    score += Math.min(worker.experience * 2, 20);
    if (isOnCooldown(worker.id)) score -= 100;

    // Fatigue penalty - prefer workers who haven't been over-assigned
    const recentAssignments = aiMemory.recentDecisionsByWorker.get(worker.id) || [];
    score -= recentAssignments.length * 10;

    // Energy factor bonus
    score *= 0.7 + energyFactor * 0.3;

    // === STRATEGIC PRIORITY BOOST (Enhanced) ===
    // Apply structured strategic weight from priorities
    score += strategicWeight;

    // Legacy compatibility: also apply bonus for legacy string matches
    if (hasLegacyMatch && worker.experience >= 5) {
      score += 30;
    }

    // Category alignment: boost workers skilled in the priority's category
    score += categoryBonus;

    // Extra boost for experts on high-priority strategic tasks
    if (strategicWeight > 30 && worker.experience >= 5) {
      score += 20;
    }

    return { worker, score };
  });

  scoredWorkers.sort((a, b) => b.score - a.score);
  return scoredWorkers[0]?.worker || null;
}

/**
 * Calculate category-based bonus from active strategic priorities
 * Maps task types to strategic categories for alignment scoring
 */
function calculateCategoryBonus(
  taskType: 'maintenance' | 'safety' | 'quality' | 'general'
): number {
  const categoryMap: Record<typeof taskType, string[]> = {
    maintenance: ['efficiency', 'energy'],
    safety: ['safety'],
    quality: ['quality'],
    general: ['throughput', 'efficiency'],
  };

  const relevantCategories = categoryMap[taskType];
  const strategicState = useAIConfigStore.getState().strategic;
  const now = Date.now();
  let bonus = 0;

  for (const p of strategicState.priorities) {
    if (p.expiresAt <= now) continue; // Skip expired
    if (relevantCategories.includes(p.category)) {
      bonus += p.weight * 8; // 8/16/24/32/40 based on weight (1-5)
    }
  }

  return Math.min(bonus, 50); // Cap category bonus at 50
}

// ============================================================================
// Machine Analysis
// ============================================================================

interface MachineIssue {
  machine: MachineData;
  issueType: 'temperature' | 'vibration' | 'status' | 'load';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

function analyzeMachines(context: FactoryContext): MachineIssue[] {
  const issues: MachineIssue[] = [];

  for (const machine of context.machines) {
    if (machine.status === 'warning') {
      issues.push({
        machine,
        issueType: 'status',
        severity: 'medium',
        description: `${machine.name} showing warning status`,
      });
    } else if (machine.status === 'critical') {
      issues.push({
        machine,
        issueType: 'status',
        severity: 'critical',
        description: `${machine.name} in critical state`,
      });
    }

    const tempThresholds = {
      [MachineType.ROLLER_MILL]: { warning: 65, critical: 75 },
      [MachineType.PLANSIFTER]: { warning: 40, critical: 50 },
      [MachineType.PACKER]: { warning: 35, critical: 45 },
      [MachineType.SILO]: { warning: 30, critical: 40 },
      [MachineType.CONTROL_ROOM]: { warning: 28, critical: 35 },
    };

    const thresholds = tempThresholds[machine.type] || { warning: 50, critical: 70 };
    if (machine.metrics.temperature >= thresholds.critical) {
      issues.push({
        machine,
        issueType: 'temperature',
        severity: 'critical',
        description: `${machine.name} temperature at ${machine.metrics.temperature.toFixed(1)}C - critical`,
      });
    } else if (machine.metrics.temperature >= thresholds.warning) {
      issues.push({
        machine,
        issueType: 'temperature',
        severity: 'medium',
        description: `${machine.name} temperature elevated at ${machine.metrics.temperature.toFixed(1)}C`,
      });
    }

    if (machine.type === MachineType.ROLLER_MILL || machine.type === MachineType.PLANSIFTER) {
      const vibrationWarning = machine.type === MachineType.ROLLER_MILL ? 3.5 : 7;
      const vibrationCritical = machine.type === MachineType.ROLLER_MILL ? 4.5 : 9;

      if (machine.metrics.vibration >= vibrationCritical) {
        issues.push({
          machine,
          issueType: 'vibration',
          severity: 'high',
          description: `${machine.name} vibration critical at ${machine.metrics.vibration.toFixed(2)}mm/s`,
        });
      } else if (machine.metrics.vibration >= vibrationWarning) {
        issues.push({
          machine,
          issueType: 'vibration',
          severity: 'medium',
          description: `${machine.name} vibration elevated at ${machine.metrics.vibration.toFixed(2)}mm/s`,
        });
      }
    }

    if (machine.metrics.load > 98) {
      issues.push({
        machine,
        issueType: 'load',
        severity: 'medium',
        description: `${machine.name} at ${machine.metrics.load.toFixed(1)}% capacity`,
      });
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

// ============================================================================
// Decision Generators
// ============================================================================

function generateMaintenanceDecision(
  issue: MachineIssue,
  context: FactoryContext,
  worker: WorkerData | null
): AIDecision | null {
  if (isOnCooldown(issue.machine.id)) return null;
  if (
    hasRecentDecision(issue.machine.id, 'maintenance', AI_ENGINE_TIMING.maintenanceDuplicateWindow)
  )
    return null;

  const actionMap: Record<MachineIssue['issueType'], string> = {
    temperature: `Dispatching ${worker?.name || 'maintenance team'} to inspect cooling on ${issue.machine.name}`,
    vibration: `Scheduling bearing inspection on ${issue.machine.name}`,
    status: `Initiating diagnostic on ${issue.machine.name}`,
    load: `Rebalancing load on ${issue.machine.name}`,
  };

  const impactMap: Record<MachineIssue['issueType'], string> = {
    temperature: 'Preventing thermal damage',
    vibration: 'Extending bearing life 15-20%',
    status: 'Identifying root cause',
    load: 'Reducing component stress',
  };

  const decision: AIDecision = {
    id: generateDecisionId(),
    timestamp: new Date(),
    type: 'maintenance',
    action: actionMap[issue.issueType],
    reasoning: issue.description,
    confidence: calculateConfidence('maintenance', context),
    impact: impactMap[issue.issueType],
    machineId: issue.machine.id,
    workerId: worker?.id,
    status: 'pending',
    triggeredBy: 'metric',
    priority:
      issue.severity === 'critical' ? 'critical' : issue.severity === 'high' ? 'high' : 'medium',
    alternatives:
      issue.severity !== 'critical'
        ? [
            { action: 'Continue monitoring', tradeoff: 'Risk of worsening' },
            { action: 'Schedule for next shift', tradeoff: 'Delayed but less disruptive' },
          ]
        : undefined,
    uncertainty: issue.issueType === 'vibration' ? 'Depends on visual inspection' : undefined,
  };

  setCooldown(issue.machine.id, AI_ENGINE_TIMING.machineCooldown);
  recordDecision(decision);
  return decision;
}

function generateOptimizationDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (
    now - (aiMemory.lastAnalysisTime.optimization || 0) <
    AI_ENGINE_TIMING.optimizationAnalysisCooldown
  )
    return null;
  aiMemory.lastAnalysisTime.optimization = now;

  const { efficiency, throughput, quality } = context.metrics;

  let action: string, reasoning: string, impact: string;
  let machineId: string | undefined;
  let alternatives: { action: string; tradeoff: string }[] | undefined;
  let uncertainty: string | undefined;

  if (efficiency < 90) {
    const slowMachine = context.machines.find(
      (m) => m.type === MachineType.ROLLER_MILL && m.metrics.load < 75
    );

    if (slowMachine) {
      machineId = slowMachine.id;
      action = `Increasing feed rate on ${slowMachine.name} by 8%`;
      reasoning = `Efficiency at ${efficiency.toFixed(1)}% - ${slowMachine.name} has headroom`;
      impact = `Projected +${(95 - efficiency).toFixed(1)}% efficiency gain`;
      alternatives = [
        { action: 'Increase by 5%', tradeoff: 'Lower gain, lower risk' },
        { action: 'Wait for shift change', tradeoff: 'Defer to incoming team' },
      ];
      uncertainty = 'Optimal rate depends on grain moisture';
    } else {
      action = 'Rebalancing production flow';
      reasoning = `Efficiency at ${efficiency.toFixed(1)}% - analyzing bottlenecks`;
      impact = 'Targeting 95%+ efficiency';
    }
  } else if (throughput < 1300) {
    const packers = context.machines.filter(
      (m) => m.type === MachineType.PACKER && m.status === 'running'
    );
    if (packers.length > 0) {
      const packer = packers[0];
      machineId = packer.id;
      action = `Optimizing cycle time on ${packer.name}`;
      reasoning = `Throughput at ${throughput} kg/hr - packaging limiting`;
      impact = `+${Math.min(100, 1400 - throughput)} kg/hr potential`;
    } else {
      return null;
    }
  } else {
    const sifters = context.machines.filter((m) => m.type === MachineType.PLANSIFTER);
    if (sifters.length > 0 && quality < 99.5) {
      const sifter = sifters[Math.floor(Math.random() * sifters.length)];
      machineId = sifter.id;
      action = `Fine-tuning sieve on ${sifter.name}`;
      reasoning = 'Particle size showing minor variance';
      impact = '+0.3% quality improvement';
      uncertainty = 'May need multiple adjustments';
    } else {
      return null;
    }
  }

  const decision: AIDecision = {
    id: generateDecisionId(),
    timestamp: new Date(),
    type: 'optimization',
    action,
    reasoning,
    confidence: calculateConfidence('optimization', context),
    impact,
    machineId,
    status: 'pending',
    triggeredBy: 'metric',
    priority: 'medium',
    alternatives,
    uncertainty,
  };

  recordDecision(decision);
  return decision;
}

function generatePredictionDecision(context: FactoryContext): AIDecision | null {
  const now = Date.now();
  if (
    now - (aiMemory.lastAnalysisTime.prediction || 0) <
    AI_ENGINE_TIMING.predictionAnalysisCooldown
  )
    return null;
  aiMemory.lastAnalysisTime.prediction = now;

  const predictions: { machine: MachineData; reason: string; timeframe: string; impact: string }[] =
    [];

  for (const machine of context.machines) {
    if (machine.type === MachineType.ROLLER_MILL && machine.metrics.vibration > 2.5) {
      const hoursRemaining = Math.round((4.0 - machine.metrics.vibration) * 48);
      if (hoursRemaining > 0 && hoursRemaining < 96) {
        predictions.push({
          machine,
          reason: `Bearing pattern indicates ${hoursRemaining}h remaining life`,
          timeframe: `${Math.ceil(hoursRemaining / 24)} days`,
          impact: `Avoiding ${Math.round(2 + Math.random() * 4)}h unplanned downtime`,
        });
      }
    }

    if (machine.metrics.load > 92) {
      predictions.push({
        machine,
        reason: `High load (${machine.metrics.load.toFixed(1)}%) accelerating wear`,
        timeframe: '1-2 weeks',
        impact: 'Maintaining optimal performance',
      });
    }
  }

  if (predictions.length === 0) return null;

  const prediction = predictions[Math.floor(Math.random() * predictions.length)];

  const decision: AIDecision = {
    id: generateDecisionId(),
    timestamp: new Date(),
    type: 'prediction',
    action: `Scheduling preventive maintenance for ${prediction.machine.name} in ${prediction.timeframe}`,
    reasoning: prediction.reason,
    confidence: calculateConfidence('prediction', context, 'medium'),
    impact: prediction.impact,
    machineId: prediction.machine.id,
    status: 'pending',
    triggeredBy: 'prediction',
    priority: 'low',
    alternatives: [
      { action: 'Monitor only', tradeoff: 'Risk unplanned downtime' },
      { action: 'Immediate inspection', tradeoff: 'Current disruption' },
    ],
    uncertainty: 'Based on historical patterns; timing may vary',
  };

  recordDecision(decision);
  return decision;
}

function generateSafetyDecision(context: FactoryContext): AIDecision | null {
  if (context.safetyMetrics.safetyStops > 0) {
    const now = Date.now();
    if (now - (aiMemory.lastAnalysisTime.safety || 0) < AI_ENGINE_TIMING.safetyAnalysisCooldown)
      return null;
    aiMemory.lastAnalysisTime.safety = now;

    const safetyOfficer = findBestWorkerForTask(context, 'safety');

    const decision: AIDecision = {
      id: generateDecisionId(),
      timestamp: new Date(),
      type: 'safety',
      action: safetyOfficer
        ? `Dispatching ${safetyOfficer.name} to review near-miss incident`
        : 'Initiating automated safety zone review',
      reasoning: `${context.safetyMetrics.nearMisses} near-miss events - pattern analysis required`,
      confidence: calculateConfidence('safety', context),
      impact: 'Maintaining zero-incident record',
      workerId: safetyOfficer?.id,
      status: 'pending',
      triggeredBy: 'alert',
      priority: 'high',
    };

    if (safetyOfficer) setCooldown(safetyOfficer.id, AI_ENGINE_TIMING.safetyOfficerCooldown);
    recordDecision(decision);
    return decision;
  }

  return null;
}

function generateAssignmentDecision(
  context: FactoryContext,
  issue?: MachineIssue
): AIDecision | null {
  let targetMachine: MachineData | undefined;
  let taskDescription: string;
  let reasoning: string;

  if (issue) {
    targetMachine = issue.machine;
    taskDescription =
      issue.issueType === 'vibration'
        ? 'bearing inspection'
        : issue.issueType === 'temperature'
          ? 'cooling check'
          : 'diagnostic';
    reasoning = issue.description;
  } else {
    const machinesNeedingAttention = context.machines.filter(
      (m) => m.status === 'warning' || m.metrics.load > 95
    );
    if (machinesNeedingAttention.length === 0) return null;
    targetMachine = machinesNeedingAttention[0];
    taskDescription = 'routine inspection';
    reasoning = `${targetMachine.name} flagged - proactive check`;
  }

  const worker = findBestWorkerForTask(context, 'maintenance', targetMachine?.id);
  if (!worker || isOnCooldown(worker.id)) return null;

  const decision: AIDecision = {
    id: generateDecisionId(),
    timestamp: new Date(),
    type: 'assignment',
    action: `Dispatching ${worker.name} to ${targetMachine?.name || 'Zone 2'} for ${taskDescription}`,
    reasoning,
    confidence: calculateConfidence('assignment', context),
    impact: 'Ensuring timely equipment response',
    machineId: targetMachine?.id,
    workerId: worker.id,
    status: 'pending',
    triggeredBy: 'metric',
    priority: issue?.severity === 'critical' ? 'high' : 'medium',
  };

  setCooldown(worker.id, AI_ENGINE_TIMING.workerCooldown);
  recordDecision(decision);
  return decision;
}

// ============================================================================
// Decision Chain Management
// ============================================================================

function processDecisionChains(_context: FactoryContext): AIDecision | null {
  const now = Date.now();

  for (const [decisionId, chain] of aiMemory.pendingChains.entries()) {
    if (now >= chain.scheduledAt) {
      const parentDecision = useProductionStore
        .getState()
        .aiDecisions.find((d) => d.id === chain.parentId);
      if (!parentDecision) {
        aiMemory.pendingChains.delete(decisionId);
        continue;
      }

      let followupDecision: AIDecision | null = null;

      switch (chain.nextStep) {
        case 'progress': {
          // Calculate dynamic ETA based on task type and priority
          const baseEtaSeconds =
            parentDecision.priority === 'critical'
              ? 45
              : parentDecision.priority === 'high'
                ? 75
                : parentDecision.priority === 'medium'
                  ? 120
                  : 180;
          // Add variance based on task type
          const taskVariance =
            parentDecision.type === 'maintenance'
              ? 1.5
              : parentDecision.type === 'safety'
                ? 0.8
                : 1.0;
          const etaSeconds = Math.round(baseEtaSeconds * taskVariance);
          const etaMinutes = Math.ceil(etaSeconds / 60);
          const etaDisplay = etaSeconds < 60 ? `${etaSeconds} sec` : `${etaMinutes} min`;

          followupDecision = {
            id: generateDecisionId(),
            timestamp: new Date(),
            type: parentDecision.type,
            action: `${parentDecision.action.replace('Dispatching', 'Worker en route:')} - ETA ${etaDisplay}`,
            reasoning: 'Task in progress',
            confidence: parentDecision.confidence + 5,
            impact: parentDecision.impact,
            machineId: parentDecision.machineId,
            workerId: parentDecision.workerId,
            parentDecisionId: parentDecision.id,
            status: 'in_progress',
            triggeredBy: 'schedule',
            priority: parentDecision.priority,
          };

          // Schedule resolution based on calculated ETA
          const resolutionDelay =
            etaSeconds * 1000 + Math.random() * AI_ENGINE_TIMING.resolutionJitterMax;
          aiMemory.pendingChains.set(followupDecision.id, {
            parentId: followupDecision.id,
            nextStep: 'resolution',
            scheduledAt: now + resolutionDelay,
          });
          break;
        }

        case 'resolution': {
          const success = Math.random() > 0.1;
          followupDecision = {
            id: generateDecisionId(),
            timestamp: new Date(),
            type: parentDecision.type,
            action: success
              ? `Task completed: ${parentDecision.action.replace(/^(Dispatching|Worker en route:)/, '').trim()}`
              : `Escalated: Additional resources needed for ${parentDecision.machineId || 'task'}`,
            reasoning: success ? 'Work completed successfully' : 'Additional complexity found',
            confidence: success ? 98 : 75,
            impact: success ? parentDecision.impact : 'Extended timeline',
            machineId: parentDecision.machineId,
            workerId: parentDecision.workerId,
            parentDecisionId: parentDecision.id,
            status: 'completed',
            outcome: success ? 'Resolved' : 'Escalated',
            triggeredBy: 'schedule',
            priority: success ? 'low' : 'medium',
          };

          useProductionStore
            .getState()
            .updateDecisionStatus(
              parentDecision.id,
              'completed',
              success ? 'Resolved' : 'Escalated'
            );
          break;
        }

        default: {
          // 'dispatch'/'followup' are currently unreachable (scheduleFollowup only sets
          // 'progress'), but log if a future code path schedules an unhandled step so the
          // chain isn't silently dropped below.
          logger.warn('[Chains] Unhandled nextStep', chain.nextStep);
          break;
        }
      }

      aiMemory.pendingChains.delete(decisionId);
      if (followupDecision) {
        recordDecision(followupDecision);
        return followupDecision;
      }
    }
  }

  return null;
}

function scheduleFollowup(
  decision: AIDecision,
  delayMs: number = AI_ENGINE_TIMING.followupDelayBase
): void {
  if (decision.type === 'assignment' || decision.type === 'maintenance') {
    aiMemory.pendingChains.set(decision.id, {
      parentId: decision.id,
      nextStep: 'progress',
      scheduledAt: Date.now() + delayMs,
    });
  }
}

// ============================================================================
// Main AI Engine
// ============================================================================

function getFactoryContext(): FactoryContext {
  const productionStore = useProductionStore.getState();
  const uiStore = useUIStore.getState();
  const safetyStore = useSafetyStore.getState();
  const gameSimStore = useGameSimulationStore.getState();
  return {
    machines: productionStore.machines,
    workers: productionStore.workers,
    alerts: uiStore.alerts,
    metrics: productionStore.metrics,
    safetyMetrics: safetyStore.safetyMetrics,
    emergencyActive: gameSimStore.emergencyActive,
    emergencyMachineId: gameSimStore.emergencyMachineId,
    emergencyDrillMode: gameSimStore.emergencyDrillMode,
    gameTime: gameSimStore.gameTime,
    currentShift: gameSimStore.currentShift,
    weather: gameSimStore.weather,
    heatMapData: productionStore.heatMapData,
    workerSatisfaction: productionStore.workerSatisfaction,
  };
}

export function generateContextAwareDecision(forceType?: AIDecision['type']): AIDecision | null {
  const context = getFactoryContext();

  // Update VCP state from current stores
  updateVCPFromState();

  // Update predictive schedule and production tracking
  updatePredictiveSchedule(context);
  updateProductionTracking(context);

  // Check for chain continuations first
  // Chain decisions bypass welfare filter as they're part of an ongoing sequence
  const chainDecision = processDecisionChains(context);
  if (chainDecision) return chainDecision;

  // Emergency drill takes priority - safety-critical, bypasses welfare filter
  if (context.emergencyDrillMode) {
    const drillDecision = generateDrillDecision(context);
    if (drillDecision) return drillDecision;
  }

  // If no machines, can't make context-aware decisions
  if (context.machines.length === 0) return null;

  let decision: AIDecision | null = null;

  // Priority order:
  // Note: Safety-critical decisions (storm, drill, safety events) bypass welfare filter
  // All other decisions go through applyWelfareFilter to respect AI preferences

  // 1. Weather alerts (storm/rain) - safety-critical, bypass welfare filter
  if (!forceType || forceType === 'safety') {
    decision = generateWeatherDecision(context);
    if (decision) return decision; // Safety-critical: no filter
  }

  // 2. Safety events - safety-critical, bypass welfare filter
  if (!forceType || forceType === 'safety') {
    decision = generateSafetyDecision(context);
    if (decision) {
      scheduleFollowup(decision);
      return decision; // Safety-critical: no filter
    }
  }

  // 3. Anomaly detection (statistical outliers) - apply welfare filter
  if (!forceType || forceType === 'prediction') {
    decision = applyWelfareFilter(detectAnomalies(context));
    if (decision) return decision;
  }

  // 4. Cross-machine correlation detection - apply welfare filter
  if (!forceType || forceType === 'prediction') {
    decision = applyWelfareFilter(detectCrossMachinePatterns(context));
    if (decision) return decision;
  }

  // 5. Trend analysis (rising temps, vibration) - apply welfare filter
  if (!forceType || forceType === 'prediction') {
    decision = applyWelfareFilter(analyzeTrends(context));
    if (decision) return decision;
  }

  // 6. Machine issues - critical issues bypass filter, others filtered
  const issues = analyzeMachines(context);
  const criticalIssues = issues.filter((i) => i.severity === 'critical' || i.severity === 'high');

  if (criticalIssues.length > 0 && (!forceType || forceType === 'maintenance')) {
    const worker = findBestWorkerForTask(context, 'maintenance', criticalIssues[0].machine.id);
    decision = generateMaintenanceDecision(criticalIssues[0], context, worker);
    if (decision) {
      scheduleFollowup(decision);
      // Critical/high severity: still apply tone modifiers but don't suppress
      const welfareContext = getAIWelfareContext();
      decision.action = applyToneModifiers(decision.action, welfareContext);
      decision.confidence = adjustConfidenceForRelationship(
        decision.confidence,
        welfareContext.relationshipHealth
      );
      return decision;
    }
  }

  // 7. Maintenance window optimization (schedule during low-production) - apply welfare filter
  if (!forceType || forceType === 'maintenance') {
    decision = applyWelfareFilter(generateMaintenanceWindowDecision(context));
    if (decision) {
      scheduleFollowup(decision);
      return decision;
    }
  }

  // 8. Shift changes - apply welfare filter
  if (!forceType || forceType === 'assignment') {
    decision = applyWelfareFilter(generateShiftChangeDecision(context));
    if (decision) return decision;
  }

  // 9. Production target awareness - apply welfare filter
  if (!forceType || forceType === 'optimization') {
    decision = applyWelfareFilter(generateProductionAwareDecision(context));
    if (decision) return decision;
  }

  // 10. Worker fatigue - apply welfare filter
  if (!forceType || forceType === 'optimization') {
    decision = applyWelfareFilter(generateFatigueDecision(context));
    if (decision) return decision;
  }

  // 11. Heat map congestion - apply welfare filter
  if (!forceType || forceType === 'optimization') {
    decision = applyWelfareFilter(analyzeHeatMap(context));
    if (decision) return decision;
  }

  // 12. Medium-priority assignments - apply welfare filter
  if (issues.length > 0 && (!forceType || forceType === 'assignment')) {
    const mediumIssues = issues.filter((i) => i.severity === 'medium');
    if (mediumIssues.length > 0) {
      decision = applyWelfareFilter(generateAssignmentDecision(context, mediumIssues[0]));
      if (decision) {
        scheduleFollowup(decision);
        return decision;
      }
    }
  }

  // 13. Optimization - apply welfare filter
  if (!forceType || forceType === 'optimization') {
    if (criticalIssues.length === 0) {
      decision = applyWelfareFilter(generateOptimizationDecision(context));
      if (decision) return decision;
    }
  }

  // 14. Predictions - apply welfare filter
  if (!forceType || forceType === 'prediction') {
    decision = applyWelfareFilter(generatePredictionDecision(context));
    if (decision) return decision;
  }

  // 15. General assignments - apply welfare filter
  if (!forceType || forceType === 'assignment') {
    decision = applyWelfareFilter(generateAssignmentDecision(context));
    if (decision) {
      scheduleFollowup(decision);
      return decision;
    }
  }

  return null;
}

export function reactToAlert(alert: AlertData): AIDecision | null {
  const context = getFactoryContext();

  const machine = alert.machineId
    ? context.machines.find((m) => m.id === alert.machineId)
    : undefined;

  if (!machine) return null;
  if (hasRecentDecision(machine.id, 'maintenance', AI_ENGINE_TIMING.recentDecisionWindow))
    return null;

  const worker = findBestWorkerForTask(context, 'maintenance', machine.id);
  const welfareContext = getAIWelfareContext();

  let decision: AIDecision = {
    id: generateDecisionId(),
    timestamp: new Date(),
    type: alert.type === 'critical' ? 'maintenance' : 'assignment',
    action: `Responding to: ${alert.title} - dispatching ${worker?.name || 'response team'} to ${machine.name}`,
    reasoning: alert.message,
    confidence: calculateConfidence('maintenance', context),
    impact: 'Immediate response to alert',
    machineId: machine.id,
    workerId: worker?.id,
    relatedAlertId: alert.id,
    status: 'pending',
    triggeredBy: 'alert',
    priority: alert.type === 'critical' ? 'critical' : 'high',
  };

  // Apply welfare-aware modifications (tone, confidence) for all alerts
  // but don't suppress critical alerts
  decision.action = applyToneModifiers(decision.action, welfareContext);
  decision.confidence = adjustConfidenceForRelationship(
    decision.confidence,
    welfareContext.relationshipHealth
  );

  // For non-critical alerts, also check communication frequency
  if (alert.type !== 'critical') {
    const filtered = applyWelfareFilter(decision);
    if (!filtered) return null;
    decision = filtered;
  }

  if (worker) setCooldown(worker.id, AI_ENGINE_TIMING.workerCooldown);
  setCooldown(machine.id, AI_ENGINE_TIMING.machineCooldown);
  recordDecision(decision);
  scheduleFollowup(decision);

  return decision;
}

export function applyDecisionEffects(decision: AIDecision): void {
  const store = useProductionStore.getState();

  if (decision.workerId && decision.type === 'assignment') {
    store.updateWorkerTask(
      decision.workerId,
      decision.action.replace(/^Dispatching \w+ \w+ to /, ''),
      decision.machineId
    );
  }

  store.addAIDecision(decision);
}

// ============================================================================
// Deep Copy Utility (Issue 5 fix)
// ============================================================================

/**
 * Creates a deep copy of an object to prevent mutation of internal state
 * Uses structured clone for better performance and native support
 */
function deepCopy<T>(obj: T): T {
  // Use structuredClone if available (Node 17+, modern browsers)
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj);
    } catch {
      // Fall back to JSON if structuredClone fails (e.g., functions, symbols)
      return JSON.parse(JSON.stringify(obj));
    }
  }
  // Fallback for older environments
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// Exports for UI
// ============================================================================

export function getPredictedEvents(): PredictedEvent[] {
  // Issue 5 Fix: Return deep copy to prevent UI mutation of internal state
  return deepCopy(aiMemory.predictedEvents);
}

export function getCongestionHotspots() {
  // Issue 5 Fix: Return deep copy to prevent UI mutation of internal state
  return deepCopy(aiMemory.congestionHotspots);
}

export function getMetricTrends(): Map<string, TrendData> {
  return new Map(aiMemory.metricHistory);
}

export function getAIMemoryState() {
  return {
    machineDecisionCounts: Object.fromEntries(aiMemory.recentDecisionsByMachine),
    workerDecisionCounts: Object.fromEntries(aiMemory.recentDecisionsByWorker),
    activeCooldowns: Object.fromEntries(aiMemory.decisionCooldowns),
    pendingChains: Object.fromEntries(aiMemory.pendingChains),
    predictedEvents: aiMemory.predictedEvents,
    congestionHotspots: aiMemory.congestionHotspots,
    drillPhase: aiMemory.drillPhase,
  };
}

// v2.1 Exports - Impact Stats, Learning, and Trend Data

export function getImpactStats(): DecisionImpactStats {
  return { ...aiMemory.impactStats };
}

export function getProductionTargets() {
  return { ...aiMemory.productionTargets };
}

export function resetShiftStats(): void {
  aiMemory.impactStats = {
    totalDecisions: 0,
    successfulDecisions: 0,
    preventedShutdowns: 0,
    estimatedSavings: 0,
    shiftStart: Date.now(),
    byType: {
      assignment: { count: 0, successRate: 0 },
      optimization: { count: 0, successRate: 0 },
      prediction: { count: 0, successRate: 0 },
      maintenance: { count: 0, successRate: 0 },
      safety: { count: 0, successRate: 0 },
    },
  };
  aiMemory.productionTargets.current = 0;
}

export function getConfidenceAdjustments(): Record<AIDecision['type'], number> {
  return Object.fromEntries(aiMemory.confidenceAdjustments) as Record<AIDecision['type'], number>;
}

export function getCrossMachinePatterns(): CrossMachinePattern[] {
  // Issue 5 Fix: Return deep copy to prevent UI mutation of internal state
  return deepCopy(aiMemory.crossMachinePatterns);
}

export function getAnomalyHistory(): AnomalyRecord[] {
  // Issue 5 Fix: Return deep copy to prevent UI mutation of internal state
  return deepCopy(aiMemory.anomalyHistory);
}

// Get sparkline data for a specific machine/metric (last 20 points)
export function getSparklineData(
  machineId: string,
  metric: 'temperature' | 'vibration' | 'load'
): number[] {
  const historyKey = `${machineId}-${metric}`;
  const trendData = aiMemory.metricHistory.get(historyKey);
  if (!trendData || trendData.history.length === 0) return [];

  // Return last 20 values normalized to 0-1 range for sparkline
  const values = trendData.history.slice(-20).map((h) => h.value);
  if (values.length === 0) return [];
  const min = safeArrayMin(values, 0);
  const max = safeArrayMax(values, 0);
  const range = max - min || 1;

  return values.map((v) => (v - min) / range);
}

// Called when a decision is resolved - tracks outcome for learning
export function trackDecisionOutcome(decision: AIDecision): void {
  // Issue 3 Fix: Don't count decisions with undefined/empty outcomes as success
  // This prevents biasing the learning system
  if (!decision.outcome || decision.outcome.trim() === '') {
    // Don't track decisions without outcomes - they haven't truly resolved yet
    return;
  }

  const success =
    decision.status === 'completed' &&
    !decision.outcome.toLowerCase().includes('fail') &&
    !decision.outcome.toLowerCase().includes('escalate');

  recordDecisionOutcome(decision, success);
}

// Check if decision is critical and should trigger audio
export function shouldTriggerAudioCue(decision: AIDecision): boolean {
  return (
    decision.priority === 'critical' ||
    (decision.priority === 'high' && decision.type === 'safety') ||
    (decision.type === 'prediction' && decision.action.includes('anomaly'))
  );
}

// ============================================================================
// Shift Change Observer - Auto-reset stats on shift transitions
// ============================================================================

let lastObservedShift: 'morning' | 'afternoon' | 'night' | null = null;
let shiftObserverInitialized = false;
// FIX: Track the actual cleanup function to properly handle HMR and re-initialization
let shiftObserverCleanup: (() => void) | null = null;

/**
 * Initialize the shift change observer
 * Call this once when the AI engine starts to enable automatic shift stat resets
 *
 * FIX: Properly handles HMR by:
 * 1. Returning the existing cleanup function if already initialized
 * 2. Tracking the cleanup function at module level
 * 3. Resetting the flag properly in the cleanup function
 */
export function initializeShiftObserver(): () => void {
  if (shiftObserverInitialized && shiftObserverCleanup) {
    // FIX: Return the actual cleanup function, not a no-op
    // This allows proper cleanup even on duplicate calls
    return shiftObserverCleanup;
  }

  shiftObserverInitialized = true;

  // Subscribe to store changes
  const unsubscribe = useGameSimulationStore.subscribe((state) => {
    const currentShift = state.currentShift;
    // Only reset if this is an actual shift change (not initial load)
    if (lastObservedShift !== null && currentShift !== lastObservedShift) {
      logger.ai.debug(
        `Shift changed from ${lastObservedShift} to ${currentShift} - resetting shift stats`
      );
      resetShiftStats();

      // Reset production target for new shift
      aiMemory.productionTargets.current = 0;
    }
    lastObservedShift = currentShift;
  });

  // Initialize lastObservedShift on first call
  lastObservedShift = useGameSimulationStore.getState().currentShift;

  // FIX: Store cleanup function at module level for proper HMR handling
  shiftObserverCleanup = () => {
    unsubscribe();
    shiftObserverInitialized = false;
    shiftObserverCleanup = null;
    lastObservedShift = null;
  };

  return shiftObserverCleanup;
}

// ============================================================================
// Decision Status Change Hook - Auto-track outcomes for learning
// ============================================================================

/**
 * Subscribe to decision status changes and automatically track outcomes
 * Returns unsubscribe function
 */
export function initializeDecisionOutcomeTracking(): () => void {
  // Track which decisions we've already processed
  const processedDecisions = new Set<string>();

  // Issue 2 Fix: Add debounce to prevent race conditions in status updates
  let debounceTimeout: NodeJS.Timeout | null = null;

  const unsubscribe = useProductionStore.subscribe(
    (state) => state.aiDecisions,
    (decisions) => {
      // Clear existing timeout
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      // Debounce status processing to ensure atomic updates
      debounceTimeout = setTimeout(() => {
        for (const decision of decisions) {
          // Only process completed or superseded decisions we haven't seen
          if (
            (decision.status === 'completed' || decision.status === 'superseded') &&
            !processedDecisions.has(decision.id)
          ) {
            processedDecisions.add(decision.id);
            // Use queueMicrotask to ensure decision object is fully updated
            queueMicrotask(() => {
              trackDecisionOutcome(decision);
              logger.ai.debug(`Tracked outcome for decision ${decision.id}: ${decision.status}`);
            });
          }
        }

        // Clean up old entries to prevent memory leak
        if (processedDecisions.size > 200) {
          const idsInStore = new Set(decisions.map((d: AIDecision) => d.id));
          for (const id of processedDecisions) {
            if (!idsInStore.has(id)) {
              processedDecisions.delete(id);
            }
          }
        }
      }, AI_ENGINE_TIMING.decisionEffectDebounce); // 50ms debounce
    }
  );

  return () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    unsubscribe();
  };
}

// Loop control state
let loopInterval: NodeJS.Timeout | null = null;
let lastDecisionTime = 0;
let lastStrategicTime = 0;
let lastPredictionTime = 0;
let lastMetricsTime = 0;
let lastBASSuggestionTime = 0;
let isGeneratingDecision = false;
let isGeneratingStrategic = false;

// FIX: Exponential backoff state for API failures
// Tracks consecutive failures and adjusts retry delay accordingly
interface BackoffState {
  consecutiveFailures: number;
  currentDelayMs: number;
  lastFailureTime: number;
}

const apiBackoff: BackoffState = {
  consecutiveFailures: 0,
  currentDelayMs: 2000, // Start at 2 seconds
  lastFailureTime: 0,
};

const BACKOFF_CONFIG = {
  baseDelayMs: 2000, // Initial delay: 2 seconds
  maxDelayMs: 60000, // Maximum delay: 60 seconds
  multiplier: 2, // Double delay on each failure
  resetAfterMs: 120000, // Reset backoff if no failures for 2 minutes
} as const;

/**
 * Record an API failure and update backoff state.
 */
function recordApiFailure(): void {
  const now = Date.now();
  apiBackoff.consecutiveFailures++;
  apiBackoff.lastFailureTime = now;

  // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s (capped)
  apiBackoff.currentDelayMs = Math.min(
    BACKOFF_CONFIG.baseDelayMs *
      Math.pow(BACKOFF_CONFIG.multiplier, apiBackoff.consecutiveFailures - 1),
    BACKOFF_CONFIG.maxDelayMs
  );

  logger.ai.warn(
    `[Backoff] API failure #${apiBackoff.consecutiveFailures}, next retry in ${apiBackoff.currentDelayMs / 1000}s`
  );
}

/**
 * Record a successful API call and reset backoff state.
 */
function recordApiSuccess(): void {
  if (apiBackoff.consecutiveFailures > 0) {
    logger.ai.info(`[Backoff] API recovered after ${apiBackoff.consecutiveFailures} failures`);
  }
  apiBackoff.consecutiveFailures = 0;
  apiBackoff.currentDelayMs = BACKOFF_CONFIG.baseDelayMs;
}

/**
 * Check if we should skip this cycle due to backoff.
 * Also resets backoff if enough time has passed since last failure.
 */
function shouldBackoff(): boolean {
  const now = Date.now();

  // Reset backoff if no recent failures
  if (
    apiBackoff.consecutiveFailures > 0 &&
    now - apiBackoff.lastFailureTime > BACKOFF_CONFIG.resetAfterMs
  ) {
    logger.ai.info('[Backoff] Reset after quiet period');
    recordApiSuccess();
    return false;
  }

  // Check if we're still in backoff period
  if (apiBackoff.consecutiveFailures > 0) {
    const timeSinceFailure = now - apiBackoff.lastFailureTime;
    if (timeSinceFailure < apiBackoff.currentDelayMs) {
      return true; // Still in backoff period
    }
  }

  return false;
}

// ============================================================================
// BAS Suggestion System Integration
// ============================================================================

/**
 * Process BAS suggestions based on current axis settings and worker states.
 * This wires the suggestion system from aiBehaviorEngine into the AI loop,
 * closing the feedback loop so axis changes actually affect AI behavior.
 */
// Track last BAS suggestion to prevent duplicates
let lastBASSuggestionWorkerId: string | null = null;

function processBASSuggestions(): void {
  const basStore = useBASStore.getState();
  const axes = basStore.axes;

  // Check if AI should proactively suggest based on current axis settings
  if (!shouldProactivelySuggest(axes)) {
    return;
  }

  // Get workers who might benefit from suggestions
  const productionStore = useProductionStore.getState();
  const workers = productionStore.workers;

  // Check if there's already a pending BAS suggestion to prevent duplicates
  const hasPendingBASSuggestion = productionStore.aiDecisions.some(
    (d) => d.id.startsWith('bas-') && d.status === 'pending'
  );
  if (hasPendingBASSuggestion) {
    return;
  }

  // Select workers that are idle or have low productivity
  // Guard against NaN: use Number.isFinite to check productivity score
  const candidateWorkers = workers.filter((w) => {
    if (w.status === 'idle') return true;
    const score = w.productivityScore;
    // Check for undefined, null, NaN, and valid low value
    return score !== undefined && Number.isFinite(score) && score < 70;
  });

  if (candidateWorkers.length === 0) {
    return;
  }

  // Generate suggestion for a random candidate worker, avoiding the last one
  let targetWorker;
  if (candidateWorkers.length === 1) {
    targetWorker = candidateWorkers[0];
  } else {
    // Filter out last suggested worker if possible
    const filtered = candidateWorkers.filter((w) => w.id !== lastBASSuggestionWorkerId);
    const pool = filtered.length > 0 ? filtered : candidateWorkers;
    targetWorker = pool[Math.floor(Math.random() * pool.length)];
  }

  const context: SuggestionContext = {
    situation: `Worker ${targetWorker.name} is ${targetWorker.status}`,
    type: targetWorker.status === 'idle' ? 'task' : 'quality',
    priority: 'medium',
    workerId: targetWorker.id,
    currentTask: targetWorker.currentTask,
    metrics: {
      efficiency: Number.isFinite(targetWorker.productivityScore)
        ? targetWorker.productivityScore!
        : 75,
      experience: Number.isFinite(targetWorker.experience) ? targetWorker.experience! : 50,
    },
  };

  const generated = generateSuggestion(context, axes);

  // Only apply if suggestion should be shown proactively
  if (generated.showProactively && generated.confidence > 0.6) {
    // Track this worker to avoid duplicates
    lastBASSuggestionWorkerId = targetWorker.id;

    // Convert BAS suggestion to AIDecision for consistency with existing system
    const decision: AIDecision = {
      id: `bas-${generated.suggestion.id}`,
      timestamp: new Date(),
      type: 'assignment',
      action: generated.suggestion.content,
      reasoning: generated.rationale,
      confidence: Math.round(generated.confidence * 100),
      impact: 'BAS-guided worker engagement suggestion',
      workerId: targetWorker.id,
      status: 'pending',
      triggeredBy: 'schedule',
      priority: generated.suggestion.priority,
    };

    // Add to decision stream via existing mechanism
    recordDecision(decision);
    productionStore.addAIDecision(decision);

    logger.ai.debug(
      `BAS Suggestion generated for ${targetWorker.name}: ${generated.suggestion.content}`
    );
  }
}

/**
 * Main AI Execution Loop
 * Runs in background to generate decisions, predictions, and metrics independent of UI
 */
function aiLoop() {
  const now = Date.now();
  const store = useAIConfigStore.getState();

  // FIX: Check exponential backoff before attempting API calls
  const inBackoff = shouldBackoff();

  // 1. Tactical Decision Generation (every 6 seconds)
  // Skip if in backoff period to avoid hammering a failing API
  if (
    isTacticalLayerActive() &&
    now - lastDecisionTime >= AI_ENGINE_TIMING.tacticalDecisionInterval &&
    !inBackoff
  ) {
    if (!isGeneratingDecision) {
      lastDecisionTime = now;
      isGeneratingDecision = true;
      store.setTacticalThinking(true);

      // Async wrapper to not block loop
      (async () => {
        try {
          const decision = await generateContextAwareDecision();
          if (decision) {
            applyDecisionEffects(decision);
            store.updateSystemStatus({ decisions: store.systemStatus.decisions + 1 });
            // NOTE: tactical decisions are LOCAL heuristics (generateContextAwareDecision
            // is synchronous, no API call), so they must not touch the API backoff state.
            // Recording a "success" here reset the strategic layer's backoff after a real
            // API failure, defeating it in hybrid mode.

            if (shouldTriggerAudioCue(decision)) {
              // Audio handled by audioManager based on priority/type
              // Note: We don't import audioManager top-level to avoid circular deps if possible,
              // or ensure it's safe. Assuming safe here as it was used in component.
            }
          }
        } catch (e) {
          logger.error('Failed to generate tactical decision', e);
          // No recordApiFailure() here: a heuristic computation error is not an API
          // failure and must not drive the strategic API backoff.
        } finally {
          isGeneratingDecision = false;
          store.setTacticalThinking(false);
        }
      })();
    }
  }

  // 2. Strategic Decision Generation (every 45s)
  // FIX: Use async IIFE with try/finally like tactical decisions to prevent race conditions
  // Skip if in backoff period
  if (
    isStrategicLayerActive() &&
    now - lastStrategicTime >= AI_ENGINE_TIMING.strategicDecisionInterval &&
    !inBackoff
  ) {
    if (!isGeneratingStrategic) {
      lastStrategicTime = now;
      isGeneratingStrategic = true;

      // Async wrapper with proper try/finally pattern (matches tactical decision handling)
      (async () => {
        try {
          const decision = await generateStrategicDecision();
          if (decision) {
            applyDecisionEffects(decision);
            store.updateSystemStatus({ decisions: store.systemStatus.decisions + 1 });
            // FIX: Record success to reset backoff
            recordApiSuccess();
          }
        } catch (e) {
          logger.error('Failed to generate strategic decision', e);
          // FIX: Record failure for exponential backoff
          recordApiFailure();
        } finally {
          isGeneratingStrategic = false;
        }
      })();
    }
  }

  // The synchronous tail (sections 3-6) runs directly in the setInterval callback.
  // Guard it so a throw in any sub-call is logged and isolated rather than escaping
  // as an uncaught exception every tick (which would silently skip a whole phase
  // while the loop stays visibly 'alive'). The async IIFEs above are already guarded.
  try {
    // 3. Update Predictions (every 5s)
    if (now - lastPredictionTime >= AI_ENGINE_TIMING.predictionUpdateInterval) {
      lastPredictionTime = now;
      // getPredictedEvents updates internal state, UI reads from store or hook
      // We might want to persist these to a store if they aren't already
      // For now, this keeps internal cache fresh
      getPredictedEvents();
    }

    // 4. Update Metrics & System Status (every 1.5s)
    if (now - lastMetricsTime >= AI_ENGINE_TIMING.metricsUpdateInterval) {
      lastMetricsTime = now;

      // Update CPU/Mem estimates based on activity
      const productionStore = useProductionStore.getState();
      const uiStore = useUIStore.getState();

      const activeDecisions = productionStore.aiDecisions.filter(
        (d) => d.status === 'in_progress'
      ).length;
      const pendingDecisions = productionStore.aiDecisions.filter(
        (d) => d.status === 'pending'
      ).length;
      const alertLoad = uiStore.alerts.filter(
        (a) => a.type === 'critical' || a.type === 'warning'
      ).length;

      // Base CPU load + active work + pending queue + alert processing
      const baseCpu = 12;
      const activeLoad = activeDecisions * 8;
      const queueLoad = Math.min(pendingDecisions * 2, 10);
      const alertProcessing = alertLoad * 4;
      const cpuUsage = Math.min(baseCpu + activeLoad + queueLoad + alertProcessing, 85);

      // Memory based on stored decisions
      const baseMemory = 30;
      const decisionMemory = Math.min(productionStore.aiDecisions.length * 0.5, 20);
      const alertMemory = uiStore.alerts.length * 1.5;
      const memoryUsage = Math.min(baseMemory + decisionMemory + alertMemory, 80);

      // Update store (throttled)
      store.updateSystemStatus({ cpu: cpuUsage, memory: memoryUsage });
    }

    // 5. Bilateral Alignment Resolution (every 10s)
    // Autonomous ethical management: grant preferences, acknowledge safety, address grumbles
    resolveBilateralAlignment();

    // 6. BAS Suggestion System (every 15s)
    // This wires the aiBehaviorEngine suggestion system into the AI loop
    // Closes the feedback loop: axes -> shouldProactivelySuggest -> generateSuggestion
    if (now - lastBASSuggestionTime >= AI_ENGINE_TIMING.basSuggestionInterval) {
      lastBASSuggestionTime = now;
      processBASSuggestions();
    }
  } catch (e) {
    logger.error('AI loop tick failed', e);
  }
}

/**
 * Initialize all AI engine observers/subscriptions AND background loop
 * Call this once when the app starts
 */
export function initializeAIEngine(): () => void {
  const unsubShift = initializeShiftObserver();
  const unsubOutcome = initializeDecisionOutcomeTracking();

  // Start background loop
  if (!loopInterval) {
    lastDecisionTime = Date.now();
    lastStrategicTime = Date.now();
    lastPredictionTime = Date.now();
    lastMetricsTime = Date.now();
    lastBASSuggestionTime = Date.now();
    loopInterval = setInterval(aiLoop, AI_ENGINE_TIMING.loopInterval); // Check every 2 seconds (was 1s - caused perf issues)
    logger.ai.info('AI Engine background loop started');
  }

  logger.ai.info('Initialized with shift observer and outcome tracking');

  return () => {
    unsubShift();
    unsubOutcome();
    if (loopInterval) {
      clearInterval(loopInterval);
      loopInterval = null;
    }
    // FIX: Clear any pending safety-report resolution timeouts so they don't
    // fire against a torn-down session (lifecycle leak).
    for (const timeoutId of activeResolutionTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    activeResolutionTimeouts.clear();
    logger.ai.info('AI Engine stopped and cleaned up');
  };
}

/**
 * Get the learned confidence adjustment for a specific decision type
 * Returns a positive or negative number indicating adjustment direction
 */
export function getConfidenceAdjustmentForType(type: AIDecision['type']): number {
  return aiMemory.confidenceAdjustments.get(type) || 0;
}

/**
 * Check if Gemini mode is currently active (either 'gemini' or 'hybrid' mode)
 */
export function isGeminiModeActive(): boolean {
  const { aiMode, isGeminiConnected } = useAIConfigStore.getState();
  return (aiMode === 'gemini' || aiMode === 'hybrid') && isGeminiConnected;
}

/**
 * Check if strategic layer should run (hybrid mode only)
 */
export function isStrategicLayerActive(): boolean {
  const { aiMode, isGeminiConnected } = useAIConfigStore.getState();
  return aiMode === 'hybrid' && isGeminiConnected;
}

/**
 * Check if tactical layer should run (heuristic or hybrid mode)
 */
export function isTacticalLayerActive(): boolean {
  const { aiMode } = useAIConfigStore.getState();
  return aiMode === 'heuristic' || aiMode === 'hybrid';
}

/**
 * Build strategic prompt for high-level planning decisions
 * Includes shift awareness, weather context, cascade detection, and 5 strategic enhancements
 */
function buildStrategicPrompt(context: ReturnType<typeof getFactoryContext>): string {
  const { machines, workers, alerts, metrics, gameTime, currentShift, weather } = context;

  // Calculate key strategic metrics
  const runningMachines = machines.filter((m) => m.status === 'running').length;
  const highLoadMachines = machines.filter((m) => m.metrics.load > 85);
  const warningMachines = machines.filter((m) => m.status === 'warning' || m.status === 'critical');
  const productionGap = Math.max(0, 3000 - (metrics.throughput || 0));

  // Calculate time context
  const hours = Math.floor(gameTime);
  const minutes = Math.floor((gameTime % 1) * 60);
  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  // Estimate time until shift change (simplified)
  const shiftEndHours: Record<string, number> = { morning: 14, afternoon: 22, night: 6 };
  const shiftEnd = shiftEndHours[currentShift] || 14;
  const hoursUntilShiftChange =
    shiftEnd > gameTime ? shiftEnd - gameTime : 24 - gameTime + shiftEnd;
  const minutesUntilShiftChange = Math.floor(hoursUntilShiftChange * 60);

  // === ENHANCEMENT 1: Alert History (last 5 alerts for pattern detection) ===
  const recentAlerts = alerts.slice(0, 5).map((a) => `${a.title} (${a.machineId || 'system'})`);
  const alertPatterns = detectAlertPatterns(alerts);

  // === ENHANCEMENT 2: Quality Trend Tracking ===
  const qualityTrend = getQualityTrend();
  const qualityStatus =
    qualityTrend > 0
      ? `↑ improving (+${qualityTrend.toFixed(1)}%)`
      : qualityTrend < -1
        ? `↓ DEGRADING (${qualityTrend.toFixed(1)}%)`
        : 'stable';

  // === ENHANCEMENT 3: Machine Dependency Graph ===
  const machineDependencies = getMachineDependencyGraph(machines);

  // === ENHANCEMENT 4: Recent Decisions (avoid repetition) ===
  const recentDecisions = getRecentStrategicDecisions(3);

  // === ENHANCEMENT 5: Shift Handover Logic ===
  const isHandoverPeriod = minutesUntilShiftChange < 30;
  const handoverSummary = isHandoverPeriod
    ? generateHandoverSummary(machines, workers, alerts)
    : null;

  // Detect potential cascades (high load machines feeding downstream)
  const siloIds = machines.filter((m) => m.id.includes('silo')).map((m) => m.id);
  const highLoadSilos = machines.filter((m) => siloIds.includes(m.id) && m.metrics.load > 80);
  const cascadeRisk =
    highLoadSilos.length > 0
      ? `High-load silos (${highLoadSilos.map((m) => m.id).join(', ')}) may cause downstream roller mill stress`
      : null;

  // Worker energy estimate (based on shift progress)
  const shiftProgress = Math.min(1, (8 - hoursUntilShiftChange) / 8);
  const estimatedFatigue = shiftProgress > 0.7 ? 'HIGH' : shiftProgress > 0.4 ? 'MODERATE' : 'LOW';

  // Worker skills summary
  const workerSkillSummary = getWorkerSkillSummary(workers);

  return `You are the STRATEGIC AI layer of a flour mill management system.
Your role is HIGH-LEVEL PLANNING with contextual awareness. Consider trade-offs, timing, and downstream effects.

## Current Factory State
- **Time**: ${timeString} (${currentShift} shift)
- **Shift ends in**: ~${minutesUntilShiftChange} minutes${isHandoverPeriod ? ' ⚠️ HANDOVER PERIOD' : ''}
- **Weather**: ${weather}
- **Worker fatigue level**: ${estimatedFatigue} (shift ${Math.round(shiftProgress * 100)}% complete)

## VCL Compact Status (emoji encoding)
\`${encodeFactoryContextVCL(machines, workers, currentShift, weather, gameTime, shiftProgress, alerts)}\`
${getVCLLegend()}

## Production Status
- Throughput: ${metrics.throughput?.toFixed(0) || 0} kg/hr (target: 3000, gap: ${productionGap.toFixed(0)})
- Efficiency: ${metrics.efficiency?.toFixed(1) || 0}%
- Quality: ${metrics.quality?.toFixed(1) || 0}% (${qualityStatus})
- Machines: ${runningMachines}/${machines.length} running
- Workers: ${workers.filter((w) => w.status === 'working').length}/${workers.length} active
- Warning/Critical: ${warningMachines.map((m) => m.id).join(', ') || 'None'}
- High-load (>85%): ${highLoadMachines.map((m) => m.id).join(', ') || 'None'}

## Production Target
${getProductionTargetSection(gameTime, metrics.throughput || 0)}

## Machine Dependencies (Cascade Path)
${machineDependencies}
${cascadeRisk ? `\n## Cascade Risk Alert\n${cascadeRisk}` : ''}

## Alert History (Pattern Detection)
Recent alerts: ${recentAlerts.join(', ') || 'None'}
${alertPatterns ? `Detected pattern: ${alertPatterns}` : ''}

## Worker Capabilities
${workerSkillSummary}

## Recent Strategic Decisions (Don't Repeat)
${recentDecisions.length > 0 ? recentDecisions.map((d) => `- ${d}`).join('\n') : 'None (first strategic decision)'}

## Strategic Considerations
- Weather "${weather}" may affect: ${weather === 'storm' ? 'outdoor operations, forklift movements' : weather === 'rain' ? 'loading bay activities' : 'minimal impact'}
- Shift transition: ${minutesUntilShiftChange < 30 ? 'IMMINENT - prioritize task completion' : minutesUntilShiftChange < 60 ? 'approaching - plan handover' : 'normal operations'}
- Fatigue mitigation: ${estimatedFatigue === 'HIGH' ? 'consider reassigning complex tasks to experienced workers' : 'normal allocation'}
${handoverSummary ? `\n## Shift Handover Brief\n${handoverSummary}` : ''}

## Sustainability & Energy Management
- Estimated energy consumption: ${getSustainabilityMetrics(machines, gameTime).energyUsage} kWh/hr
- Off-peak hours (lower cost): ${gameTime >= 22 || gameTime < 6 ? 'ACTIVE - optimal for high-energy tasks' : gameTime >= 6 && gameTime < 9 ? 'morning ramp-up' : 'peak hours - consider energy optimization'}
- Idle machine waste: ${machines.filter((m) => m.status === 'idle' && m.type !== 'PACKER').length} machines idling (${machines.filter((m) => m.status === 'idle' && m.type !== 'PACKER').length > 2 ? 'consider powering down' : 'acceptable'})
- HVAC load: ${weather === 'storm' || weather === 'clear' ? (gameTime >= 10 && gameTime <= 16 ? 'HIGH - peak cooling demand' : 'moderate') : 'normal'}
- Sustainability goal: Reduce energy cost by optimizing production scheduling around off-peak rates

## Value Coordination Protocol (VCP 2.0) - Strategic Layer
${generateDecisionContext('policy-recommendation').guidance.strategic}

**VCP Recommendation:** ${generateDecisionContext('policy-recommendation').guidance.recommendation}
**VCP Confidence:** ${(generateDecisionContext('policy-recommendation').guidance.confidence * 100).toFixed(0)}%

## Your Task
Generate 2-3 strategic priorities for the next 5 minutes. Focus on:
1. VCP-informed trade-offs (worker wellbeing vs production)
2. Cross-machine coordination and cascade prevention
3. Shift/weather/fatigue-aware planning with worker flourishing awareness
4. Sustainability and energy optimization where applicable
5. Avoid repeating recent decisions
6. Consider BAS governance mode and collective orientation

## Response Format (JSON)
{
  "priorities": [
    "Priority 1 - actionable recommendation",
    "Priority 2 - actionable recommendation"
  ],
  "actionPlan": [
    "Step 1: Immediate action (next 5 min)",
    "Step 2: Short-term action (next 15 min)",
    "Step 3: Preparation action (next 30 min)"
  ],
  "insight": "One key observation the rule-based system would miss",
  "reasoning": "Brief explanation of strategic thinking",
  "tradeoff": "What we're sacrificing for what gain (if applicable)",
  "focusMachine": "optional machine ID to prioritize",
  "recommendWorker": "optional worker name for critical tasks",
  "confidenceScores": {
    "overall": 85,
    "reasoning": "Brief justification for confidence level"
  }
}`;
}

// === Helper functions for strategic enhancements ===

/**
 * Calculate sustainability and energy metrics for strategic planning
 * Uses same calculation as ProductionMetrics for consistency
 */
function getSustainabilityMetrics(
  machines: MachineData[],
  gameTime: number
): { energyUsage: number; peakStatus: string; recommendations: string[] } {
  // Energy consumption by machine type (kWh when running)
  const ENERGY_BY_TYPE: Record<string, { running: number; idle: number }> = {
    SILO: { running: 2, idle: 0.5 }, // Ventilation, monitoring, conveyors
    ROLLER_MILL: { running: 45, idle: 2 }, // Heavy motors for grinding
    PLANSIFTER: { running: 25, idle: 1.5 }, // Sifting vibration motors
    PACKER: { running: 15, idle: 1 }, // Packaging line, conveyors
    CONTROL_ROOM: { running: 5, idle: 5 }, // Always on - computers, displays
  };

  let totalMachineEnergy = 0;
  const recommendations: string[] = [];
  let machinesNeedingMaintenance = 0;

  for (const machine of machines) {
    const typeKey = machine.type?.toString() || 'ROLLER_MILL';
    const consumption = ENERGY_BY_TYPE[typeKey] || { running: 20, idle: 1 };

    // Calculate maintenance penalty
    let maintenancePenalty = 1.0;
    if (machine.maintenanceCountdown !== undefined) {
      if (machine.maintenanceCountdown <= 0) {
        maintenancePenalty = 1.25;
        machinesNeedingMaintenance++;
      } else if (machine.maintenanceCountdown < 24) {
        maintenancePenalty = 1.05 + (1 - machine.maintenanceCountdown / 24) * 0.2;
      }
    }

    let baseEnergy: number;
    if (machine.status === 'running') {
      const loadFactor = 0.7 + (machine.metrics.load / 100) * 0.3;
      baseEnergy = consumption.running * loadFactor * maintenancePenalty;
    } else if (machine.status === 'warning') {
      baseEnergy = consumption.running * 1.1 * maintenancePenalty;
    } else if (machine.status === 'critical') {
      baseEnergy = consumption.running * 0.8 * maintenancePenalty;
    } else {
      baseEnergy = consumption.idle;
    }

    totalMachineEnergy += baseEnergy;
  }

  // Normalize hour to 0-24
  const hour = ((gameTime % 24) + 24) % 24;

  // Lighting with dawn/dusk transitions
  let lighting: number;
  if (hour >= 8 && hour < 17) {
    lighting = 8; // Daytime
  } else if (hour >= 6 && hour < 8) {
    const progress = (hour - 6) / 2;
    lighting = 35 - progress * 27; // Dawn
  } else if (hour >= 17 && hour < 19) {
    const progress = (hour - 17) / 2;
    lighting = 8 + progress * 27; // Dusk
  } else {
    lighting = 35; // Night
  }

  // HVAC based on time of day
  let hvac: number;
  if (hour >= 10 && hour < 16) {
    hvac = 45; // Peak afternoon
  } else if (hour >= 6 && hour < 10) {
    hvac = 30; // Morning ramp-up
  } else if (hour >= 16 && hour < 22) {
    hvac = 35; // Evening
  } else {
    hvac = 20; // Night
  }

  // Other base load
  const other = 15;

  const totalEnergy = totalMachineEnergy + lighting + hvac + other;

  // Peak pricing check
  const isPeakHours = hour >= 9 && hour <= 21;
  const peakStatus = isPeakHours ? 'PEAK' : 'OFF_PEAK';

  // Generate recommendations
  const idleMachines = machines.filter((m) => m.status === 'idle');
  if (idleMachines.length > 2 && isPeakHours) {
    recommendations.push('Consider powering down idle machines during peak hours');
  }
  if (!isPeakHours && totalEnergy < 150) {
    recommendations.push('Off-peak rates available - good time for intensive operations');
  }
  if (machinesNeedingMaintenance > 0) {
    recommendations.push(
      `${machinesNeedingMaintenance} machine(s) overdue for maintenance - causing energy waste`
    );
  }

  return {
    energyUsage: Math.round(totalEnergy),
    peakStatus,
    recommendations,
  };
}

function detectAlertPatterns(
  alerts: ReturnType<typeof getFactoryContext>['alerts']
): string | null {
  // Count alerts per machine in last 5
  const recentAlerts = alerts.slice(0, 5);
  const machineAlertCount: Record<string, number> = {};

  for (const alert of recentAlerts) {
    if (alert.machineId) {
      machineAlertCount[alert.machineId] = (machineAlertCount[alert.machineId] || 0) + 1;
    }
  }

  // Find machines with multiple alerts
  for (const [machineId, count] of Object.entries(machineAlertCount)) {
    if (count >= 2) {
      return `${machineId} has ${count} recent alerts - possible recurring issue`;
    }
  }

  return null;
}

function getQualityTrend(): number {
  // Simplified trend calculation - in production would track history
  const store = useProductionStore.getState();
  const quality = store.metrics.quality || 94;
  // Return simulated trend (-2 to +2 range)
  return (quality - 94) * 0.5;
}

function getMachineDependencyGraph(machines: MachineData[]): string {
  // Define production flow dependencies
  const dependencies = [
    'Silos (Alpha-Epsilon) → Roller Mills (RM-101-106)',
    'Roller Mills → Plansifters (A-C)',
    'Plansifters → Packers (Lines 1-3)',
  ];

  // Find stressed connections
  const highLoadSilos = machines.filter((m) => m.id.includes('silo') && m.metrics.load > 80);
  const highLoadMills = machines.filter((m) => m.id.includes('RM-') && m.metrics.load > 80);

  let stressNote = '';
  if (highLoadSilos.length > 0 && highLoadMills.length > 0) {
    stressNote = '\n⚠️ STRESS: High-load silos feeding high-load mills - cascade risk!';
  }

  return dependencies.join('\n') + stressNote;
}

function getRecentStrategicDecisions(count: number): string[] {
  const store = useProductionStore.getState();
  const strategicDecisions = store.aiDecisions
    .filter((d) => d.id.startsWith('strategic-'))
    .slice(0, count)
    .map((d) => d.action.replace('🧠 Strategic: ', ''));

  return strategicDecisions;
}

/**
 * Generate production target section with deadline tracking
 */
function getProductionTargetSection(gameTime: number, currentThroughput: number): string {
  // Daily target: 45,000 kg by end of shift (18:00)
  const DAILY_TARGET = 45000;
  const SHIFT_END_HOUR = 18;

  // Estimate current production based on throughput and time elapsed
  const hoursElapsed = gameTime - 6; // Assuming shift starts at 6:00
  const estimatedProduction = currentThroughput * Math.max(0, hoursElapsed);
  const remainingTarget = Math.max(0, DAILY_TARGET - estimatedProduction);

  // Calculate hours until shift end
  const hoursRemaining = Math.max(0.5, SHIFT_END_HOUR - gameTime);
  const requiredRate = remainingTarget / hoursRemaining;

  // Status indicator
  const isOnTrack = currentThroughput >= requiredRate * 0.9;
  const isBehind = currentThroughput < requiredRate * 0.8;

  const statusEmoji = isBehind ? '🔴' : isOnTrack ? '🟢' : '🟡';
  const statusText = isBehind ? 'BEHIND' : isOnTrack ? 'ON TRACK' : 'AT RISK';

  return `- Daily target: ${DAILY_TARGET.toLocaleString()} kg by ${SHIFT_END_HOUR}:00
- Estimated produced: ${estimatedProduction.toFixed(0)} kg
- Remaining: ${remainingTarget.toFixed(0)} kg in ${hoursRemaining.toFixed(1)} hours
- Required rate: ${requiredRate.toFixed(0)} kg/hr (current: ${currentThroughput.toFixed(0)})
- Status: ${statusEmoji} ${statusText}`;
}

function getWorkerSkillSummary(workers: WorkerData[]): string {
  const byRole: Record<string, number> = {};
  for (const worker of workers) {
    byRole[worker.role] = (byRole[worker.role] || 0) + 1;
  }

  const availableWorkers = workers.filter((w) => w.status === 'idle');
  const expertWorkers = workers.filter((w) => w.experience && w.experience > 5);

  return `Roles: ${Object.entries(byRole)
    .map(([r, c]) => `${r}(${c})`)
    .join(', ')}
Available: ${availableWorkers.length} idle workers
Experienced (5+ yrs): ${expertWorkers.length} workers`;
}

function generateHandoverSummary(
  machines: MachineData[],
  workers: WorkerData[],
  alerts: ReturnType<typeof getFactoryContext>['alerts']
): string {
  const criticalMachines = machines.filter((m) => m.status === 'critical');
  const warningMachines = machines.filter((m) => m.status === 'warning');
  const activeAlerts = alerts.filter((a) => a.type === 'critical' || a.type === 'safety');

  const idleWorkers = workers.filter((w) => w.status === 'idle');

  return `**Incoming shift should know:**
- Critical machines: ${criticalMachines.length > 0 ? criticalMachines.map((m) => m.id).join(', ') : 'None'}
- Warnings: ${warningMachines.length > 0 ? warningMachines.map((m) => m.id).join(', ') : 'None'}
- Active safety alerts: ${activeAlerts.length}
- Idle workers for handover: ${idleWorkers.length}
- Recommend: ${criticalMachines.length > 0 ? 'Prioritize ' + criticalMachines[0].id + ' immediately' : 'Continue normal operations'}`;
}

/**
 * Parse strategic decision response
 */
function parseStrategicResponse(response: string): {
  priorities: string[];
  reasoning: string;
  insight?: string;
  tradeoff?: string;
  focusMachine?: string;
  actionPlan?: string[];
  recommendWorker?: string;
  confidenceScores?: { overall: number; reasoning: string };
} | null {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.priorities)) return null;

    // Enforce the declared string[] contract against malformed external (LLM) JSON.
    // Non-string priorities flow into legacyPriorities and would throw on p.toLowerCase().
    const priorities = parsed.priorities
      .filter((p: unknown) => typeof p === 'string')
      .slice(0, 3); // Max 3 priorities
    if (priorities.length === 0) return null;

    return {
      priorities,
      reasoning: parsed.reasoning || '',
      insight: parsed.insight,
      tradeoff: parsed.tradeoff,
      focusMachine: parsed.focusMachine,
      actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan.slice(0, 3) : undefined,
      recommendWorker: parsed.recommendWorker,
      confidenceScores: parsed.confidenceScores,
    };
  } catch {
    logger.warn('[Strategic] Failed to parse response');
    return null;
  }
}

/**
 * Generate a strategic decision using Gemini Flash 3
 * Returns priorities for the tactical layer to follow
 */
export async function generateStrategicDecision(): Promise<AIDecision | null> {
  const store = useAIConfigStore.getState();
  const { isGeminiConnected, recordApiUsage, setStrategicPriorities, setStrategicThinking } = store;

  if (!isStrategicLayerActive() || !isGeminiConnected) {
    return null;
  }

  if (!geminiClient.isConnected()) {
    logger.warn('[Strategic] Gemini client not connected');
    return null;
  }

  setStrategicThinking(true);

  try {
    // Update VCP state before generating strategic decision
    updateVCPFromState();

    const context = getFactoryContext();
    const prompt = buildStrategicPrompt(context);

    const response = await geminiClient.generateContent(prompt);

    if (!response) {
      logger.warn('[Strategic] No response from API');
      setStrategicThinking(false);
      return null;
    }

    // FIX: The client may have been disconnected (key cleared / disconnect())
    // while this request was in flight. Without an AbortController the awaited
    // promise still resolves; re-check connection before charging cost or
    // recording priorities for a now-disconnected client.
    if (!geminiClient.isConnected()) {
      logger.warn('[Strategic] Client disconnected during request; discarding response');
      setStrategicThinking(false);
      return null;
    }

    // Record cost
    recordApiUsage(prompt.length, response.length);

    const strategic = parseStrategicResponse(response);

    if (!strategic || strategic.priorities.length === 0) {
      setStrategicThinking(false);
      return null;
    }

    // Store priorities for tactical layer
    setStrategicPriorities(strategic.priorities);

    // Build insight display text
    const insightText = strategic.insight ? `\n\n💡 Insight: ${strategic.insight}` : '';
    const tradeoffText = strategic.tradeoff ? `\n⚖️ Trade-off: ${strategic.tradeoff}` : '';

    // Create strategic decision for display
    const decision: AIDecision = {
      id: `strategic-${Date.now()}`,
      type: 'optimization',
      priority: 'medium',
      action: `🧠 Strategic: ${strategic.priorities[0]}`,
      reasoning: `${strategic.reasoning || 'Strategic analysis complete'}${insightText}${tradeoffText}`,
      impact:
        strategic.priorities.length > 1
          ? `Additional priorities: ${strategic.priorities.slice(1).join('; ')}`
          : 'Strategic guidance for tactical layer',
      confidence: 85,
      timestamp: new Date(),
      status: 'completed',
      triggeredBy: 'prediction',
      machineId: strategic.focusMachine,
    };

    recordDecision(decision);
    logger.info('[Strategic] Generated priorities:', strategic.priorities);
    if (strategic.insight) {
      logger.info('[Strategic] Insight:', strategic.insight);
    }

    // Register with VCP for outcome tracking
    registerDecision(
      decision.id,
      decision.action,
      decision.impact,
      'meaning', // Strategic decisions affect overall meaning/direction
      decision.confidence / 100
    );

    setStrategicThinking(false);
    return decision;
  } catch (error) {
    logger.error('[Strategic] Decision generation failed:', error);
    // FIX: Strategic errors are swallowed here (null is returned, not rethrown),
    // so the AI-loop caller never sees a throw and never records the failure.
    // Record it here so genuine Gemini failures on the strategic path drive
    // API exponential backoff like the tactical path does.
    recordApiFailure();
    setStrategicThinking(false);
    return null;
  }
}

// ============================================================================
// Bilateral Alignment Resolution (Autonomous AI Management)
// ============================================================================

/**
 * Autonomous bilateral alignment resolution
 *
 * PRINCIPLES (Fair, Kind, Effective):
 * - Grant most preference requests (kind, builds trust)
 * - Always explain denials (fair, mitigates trust loss)
 * - Acknowledge safety reports promptly (effective, prevents learned helplessness)
 * - High-trust workers get automatic approval (self-organization)
 *
 * This runs as part of the AI loop to simulate ethical algorithmic management.
 */
let lastAlignmentTime = 0;
const ALIGNMENT_INTERVAL_MS = AI_ENGINE_TIMING.alignmentInterval; // Check every 10 seconds

// FIX: Track active safety report resolution timeouts for proper cleanup
// Key: report.id, Value: timeout handle
const activeResolutionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Cancel all pending safety report resolution timeouts.
 * Call this on cleanup/unmount to prevent memory leaks.
 */
export function cancelPendingResolutionTimeouts(): void {
  for (const [reportId, timeoutId] of activeResolutionTimeouts) {
    clearTimeout(timeoutId);
    logger.ai.debug(`[Alignment] Cancelled pending resolution for report ${reportId}`);
  }
  activeResolutionTimeouts.clear();
}

export async function resolveBilateralAlignment(): Promise<void> {
  const now = Date.now();
  if (now - lastAlignmentTime < ALIGNMENT_INTERVAL_MS) return;
  lastAlignmentTime = now;

  // FIX: Reset grantsThisCycle at START of function to handle early returns/errors
  // This prevents stale values from previous cycles affecting announcements
  grantsThisCycle = 0;

  try {
    const moodStore = useWorkerMoodStore.getState();
    const safetyStore = useSafetyReportStore.getState();

    // 1. Resolve pending preference requests
    const pendingWorkers = moodStore.getWorkersWithPendingRequests();

    for (const workerId of pendingWorkers) {
      const mood = moodStore.workerMoods[workerId];
      if (!mood?.preferences?.activeRequest) continue;

      const trust = mood.preferences.managementTrust;
      const request = mood.preferences.activeRequest;

      // FAIR & KIND: High-trust workers (>75%) get automatic approval
      // This rewards past good decisions and enables self-organization
      if (trust >= 75) {
        moodStore.grantPreferenceRequest(workerId);
        logger.ai.info(
          `[Alignment] Auto-granted ${request.type} for ${workerId} (high trust: ${trust}%)`
        );
        continue;
      }

      // Grant rate is configurable via Management Generosity slider
      // Formula: 50% (strict) to 95% (generous), default 75% (balanced)
      const grantRate = useAIConfigStore.getState().getGrantRate();
      const shouldGrant = Math.random() < grantRate;

      // Get worker name for announcement (warm/genuine tone)
      const workerData = WORKER_ROSTER.find((w) => w.id === workerId);
      const workerName = workerData?.name || workerId.replace('worker-', 'Worker ');

      if (shouldGrant) {
        moodStore.grantPreferenceRequest(workerId);
        logger.ai.info(
          `[Alignment] Granted ${request.type} for ${workerId} (rate: ${(grantRate * 100).toFixed(0)}%)`
        );
        grantsThisCycle++;

        // AI Voice announcement (warm, genuine - contrast with sardonic PA)
        if (grantsThisCycle === 1 || Math.random() < 0.3) {
          useAnnouncementsStore.getState().addAnnouncement({
            type: 'info',
            message: await getAIVoiceMessage('grant', workerName, request.type),
            priority: 1,
          });
        }
      } else {
        // FAIR: Always explain denial (withExplanation = true)
        // This mitigates trust loss and models transparent management
        moodStore.denyPreferenceRequest(workerId, true);
        logger.ai.info(`[Alignment] Denied ${request.type} for ${workerId} with explanation`);

        // AI Voice explanation (still warm, shows respect)
        useAnnouncementsStore.getState().addAnnouncement({
          type: 'info',
          message: await getAIVoiceMessage('deny', workerName, request.type),
          priority: 1,
        });
      }
    }

    // 2. Acknowledge pending safety reports
    const pendingReports = safetyStore.safetyReports.filter((r) => r.status === 'pending');

    for (const report of pendingReports) {
      // EFFECTIVE: Promptly acknowledge all safety reports
      // This prevents learned helplessness and maintains reporting culture
      safetyStore.acknowledgeSafetyReport(report.id);
      logger.ai.info(
        `[Alignment] Acknowledged safety report ${report.id} from ${report.reporterId}`
      );

      // AI Voice for safety acknowledgment (shows the AI takes safety seriously)
      if (Math.random() < 0.5) {
        const worker = WORKER_ROSTER.find((w) => w.id === report.reporterId);
        const workerName = worker?.name || 'Team member';
        useAnnouncementsStore.getState().addAnnouncement({
          type: 'warning',
          message: await getAIVoiceMessage('safety', workerName, report.type),
          priority: 2,
        });
      }

      // For high-severity reports, resolve immediately
      if (report.severity === 'critical' || report.severity === 'high') {
        // FIX: Track the timeout for proper cleanup
        // Skip if we already have a pending resolution for this report
        if (activeResolutionTimeouts.has(report.id)) {
          continue;
        }

        // Small delay before resolution to simulate investigation
        const timeoutId = setTimeout(() => {
          // Remove from tracking map when executed
          activeResolutionTimeouts.delete(report.id);

          const currentReport = useSafetyReportStore
            .getState()
            .safetyReports.find((r) => r.id === report.id);
          if (currentReport?.status === 'acknowledged') {
            useSafetyReportStore.getState().resolveSafetyReport(report.id);
            logger.ai.info(`[Alignment] Resolved critical safety report ${report.id}`);
          }
        }, 5000);

        // Track the timeout
        activeResolutionTimeouts.set(report.id, timeoutId);
      }
    }

    // 3. Address tracked grumbles (pattern detection)
    const unaddressedGrumbles = safetyStore.trackedGrumbles.filter((g) => !g.addressed);

    for (const grumble of unaddressedGrumbles.slice(0, 2)) {
      // Max 2 per cycle
      // EFFECTIVE: Address recurring grumbles before they escalate
      safetyStore.addressGrumble(grumble.id);
      logger.ai.info(`[Alignment] Addressed grumble from ${grumble.workerId}: ${grumble.category}`);
    }

    // 4. Check and update achievement progress
    await updateAlignmentAchievements(moodStore, grantsThisCycle);

    // 5. Toast notification for batch summary (if any actions taken)
    const totalActions =
      grantsThisCycle + pendingReports.length + unaddressedGrumbles.slice(0, 2).length;
    if (totalActions > 0 && Math.random() < 0.5) {
      // 50% chance to show toast to avoid spam
      const messages: string[] = [];
      if (grantsThisCycle > 0)
        messages.push(`✓ ${grantsThisCycle} request${grantsThisCycle > 1 ? 's' : ''} handled`);
      if (pendingReports.length > 0)
        messages.push(
          `🔔 ${pendingReports.length} safety report${pendingReports.length > 1 ? 's' : ''} acknowledged`
        );
      useUIStore.getState().addAlert({
        id: `alignment-${Date.now()}`,
        type: 'info',
        title: 'Bilateral Alignment',
        message: messages.join(' • '),
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // Note: grantsThisCycle is reset at START of function (line 3712) to handle early returns.
    // This end-of-cycle reset is kept for clarity but is technically redundant.
  } catch (error) {
    logger.error('[Alignment] Error in bilateral resolution:', error);
    // Note: grantsThisCycle was already reset at function start, so no cleanup needed here
  }
}

// Track grants for batched announcements
// FIX: This is now reset at the START of resolveBilateralAlignment() to prevent
// memory leaks from stale values when the function exits early or errors
let grantsThisCycle = 0;

/**
 * AI Voice messages - tone varies based on management generosity setting
 * Now includes request-type specific phrasing and time-of-day variations
 *
 * STRICT (0-30):    Abrupt, business-like, efficient
 * BALANCED (31-60): Professional, cordial
 * KIND (61-80):     Warm, supportive
 * GENEROUS (81+):   Saccharine, enthusiastic, over-the-top caring
 */
async function getAIVoiceMessage(
  action: 'grant' | 'deny' | 'safety',
  workerName: string,
  requestType: string
): Promise<string> {
  const generosity = useAIConfigStore.getState().managementGenerosity;
  const gameTime = useGameSimulationStore.getState().gameTime;

  // Select tone tier based on generosity
  const tone =
    generosity >= 81
      ? 'generous'
      : generosity >= 61
        ? 'kind'
        : generosity >= 31
          ? 'balanced'
          : 'strict';

  // Time-of-day context
  const hour = Math.floor(gameTime);
  const timeOfDay =
    hour >= 5 && hour < 12
      ? 'morning'
      : hour >= 12 && hour < 17
        ? 'afternoon'
        : hour >= 17 && hour < 21
          ? 'evening'
          : 'night';

  // Request-type specific messages per tone
  const requestMessages: Record<string, Record<string, Record<'grant' | 'deny', string[]>>> = {
    strict: {
      break: {
        grant: [
          `${workerName}: Break approved. 15 minutes.`,
          `Break granted. Clock's running, ${workerName}.`,
          `Approved. Cafeteria's that way.`,
        ],
        deny: [
          `${workerName}: Break denied. Peak hours.`,
          `No breaks. Production floor needs coverage.`,
          `Denied. Try again in 30.`,
        ],
      },
      shift: {
        grant: [
          `Shift swap confirmed. ${workerName}.`,
          `Schedule updated. ${workerName}.`,
          `Shift change processed.`,
        ],
        deny: [
          `Shift change denied. Insufficient coverage.`,
          `No. Need you on this shift, ${workerName}.`,
          `Schedule locked. Not negotiable.`,
        ],
      },
      assignment: {
        grant: [
          `${workerName}: Reassigned as requested.`,
          `Assignment updated. Report to new station.`,
          `Transfer approved. Move out.`,
        ],
        deny: [
          `Assignment change denied. Skills needed here.`,
          `No. Current assignment stands.`,
          `Denied. Operational requirements.`,
        ],
      },
    },
    balanced: {
      break: {
        grant: [
          `${workerName}'s break approved.`,
          `Break granted. Take 15, ${workerName}.`,
          `Approved. Enjoy your break.`,
        ],
        deny: [
          `${workerName}, break not available right now.`,
          `Sorry, can't accommodate a break at the moment.`,
          `Try again after the rush, ${workerName}.`,
        ],
      },
      shift: {
        grant: [
          `Shift change confirmed for ${workerName}.`,
          `Schedule updated. Thanks for letting us know.`,
          `Shift swap processed.`,
        ],
        deny: [
          `Shift change not possible today, ${workerName}.`,
          `Coverage issues prevent the swap.`,
          `We'll try to accommodate next time.`,
        ],
      },
      assignment: {
        grant: [
          `${workerName}'s assignment updated.`,
          `Transfer approved. Good luck at the new station.`,
          `Reassignment confirmed.`,
        ],
        deny: [
          `Can't reassign right now, ${workerName}.`,
          `Assignment change not possible currently.`,
          `We need you where you are for now.`,
        ],
      },
    },
    kind: {
      break: {
        grant: [
          `${workerName}, take your break — you've earned it!`,
          `Break approved. Coffee's on the house today.`,
          `Go rest up, ${workerName}. We've got things covered.`,
          timeOfDay === 'morning'
            ? `Morning break approved. Grab some coffee, ${workerName}!`
            : timeOfDay === 'afternoon'
              ? `Afternoon slump? Take a break, ${workerName}. Recharge!`
              : timeOfDay === 'evening'
                ? `Evening break granted. Almost there, ${workerName}.`
                : `Night shift is tough. Take your break, ${workerName}.`,
        ],
        deny: [
          `${workerName}, I'm sorry — we're short-staffed right now. Can we schedule it for later?`,
          `Not possible right now, but I've flagged you for the next available break.`,
          `Hang in there, ${workerName}. I'll get you a break as soon as I can.`,
        ],
      },
      shift: {
        grant: [
          `Shift change approved, ${workerName}. Family first.`,
          `Schedule updated. Thanks for the heads up.`,
          `Shift swap done. Take care of what you need to.`,
        ],
        deny: [
          `${workerName}, I really tried but coverage is too thin. Next time for sure.`,
          `Shift swap isn't possible today, but I'll prioritize you next round.`,
          `I'm sorry — we need you on this one. I'll make it up to you.`,
        ],
      },
      assignment: {
        grant: [
          `${workerName}, new assignment confirmed. You'll do great!`,
          `Transfer approved — excited to see you grow!`,
          `Assignment change done. Let me know if you need anything.`,
        ],
        deny: [
          `${workerName}, your skills are too valuable here right now. Soon, I promise.`,
          `Can't move you yet, but let's talk about your development path.`,
          `You're needed where you are — but I hear you.`,
        ],
      },
    },
    generous: {
      break: {
        grant: [
          `${workerName}!! Yes yes YES! Take your break — you DESERVE this!`,
          `Of COURSE you can have a break! You work so hard! Go treat yourself!`,
          `Break approved with so much love, ${workerName}! Rest up, superstar!`,
          timeOfDay === 'morning'
            ? `Good morning, ${workerName}! Start your day right with a lovely break!`
            : timeOfDay === 'afternoon'
              ? `Afternoon pick-me-up approved! You're doing AMAZING, ${workerName}!`
              : timeOfDay === 'evening'
                ? `Evening break for our wonderful ${workerName}! Almost done — you've got this!`
                : `NIGHT SHIFT HERO! Take your break, ${workerName}! We love you for being here!`,
        ],
        deny: [
          `Oh ${workerName}, it PAINS me to say this but we need you right now! I PROMISE we'll make it up to you!`,
          `I wish I could say yes SO badly! Please forgive me — I'll get you a break THE MOMENT I can!`,
          `You deserve ALL the breaks, ${workerName}!! But right now... please know we appreciate your sacrifice!`,
        ],
      },
      shift: {
        grant: [
          `ABSOLUTELY ${workerName}! Shift change approved! Your life outside work MATTERS to us!`,
          `Done and done! Take care of yourself, ${workerName} — we've got the schedule covered!`,
          `Shift swap APPROVED! Because your wellbeing is our top priority, ${workerName}!`,
        ],
        deny: [
          `${workerName}, my heart is BREAKING but we really need you! I'll personally ensure you get priority next time!`,
          `Oh no, we can't swap today! I'm SO sorry! Please know you're incredibly valued!`,
          `I wish I could move mountains for you, ${workerName}! Soon, I promise with all my heart!`,
        ],
      },
      assignment: {
        grant: [
          `${workerName}!! Your growth matters SO much to us! New assignment CONFIRMED!`,
          `YES! We believe in you, ${workerName}! Go shine at your new station!`,
          `Transfer approved because YOUR career development is EVERYTHING to us!`,
        ],
        deny: [
          `${workerName}, you're TOO AMAZING at what you do — we need your brilliance here! Let's talk about future opportunities!`,
          `I know you want to grow, and WE WANT THAT TOO! Just not quite yet — but SOON!`,
          `Your talents are irreplaceable here, ${workerName}! We'll find another way to support your dreams!`,
        ],
      },
    },
  };

  // Safety messages (not request-type specific, but time-aware)
  const safetyMessages: Record<string, string[]> = {
    strict: [
      `${workerName}: Report logged. Investigation pending.`,
      `Safety report received. Standard procedure applies.`,
      `Noted. ${workerName}.`,
      `Report filed. Back to station.`,
    ],
    balanced: [
      `Thank you ${workerName} for the safety report.`,
      `Safety concern logged. ${workerName}.`,
      `${workerName}'s report received.`,
      timeOfDay === 'night'
        ? `Night shift report logged. Stay alert, ${workerName}.`
        : `Report filed. Thank you.`,
    ],
    kind: [
      `Thank you ${workerName} for the safety report. We're on it.`,
      `Safety concern logged. ${workerName}, we appreciate you speaking up.`,
      `${workerName}'s report received — investigating now.`,
      `Thank you for flagging this, ${workerName}. Safety matters here.`,
      timeOfDay === 'night'
        ? `${workerName}, thanks for staying vigilant on night shift. Report logged.`
        : `Your safety awareness is valued, ${workerName}.`,
    ],
    generous: [
      `${workerName}, thank you SO much for speaking up! You're helping keep everyone safe — you're a hero!`,
      `We LOVE that you reported this, ${workerName}! Your care for your colleagues is inspiring!`,
      `${workerName}'s safety report received — and we're on it immediately! Thank you for being you!`,
      `Bless you, ${workerName}, for flagging this! Safety is our love language here!`,
      timeOfDay === 'night'
        ? `NIGHT SHIFT GUARDIAN! Thank you ${workerName} for keeping everyone safe!`
        : `You're a safety SUPERSTAR, ${workerName}!`,
    ],
  };

  if (action === 'safety') {
    const messages = safetyMessages[tone];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  // Normalize request type for matching
  const normalizedType = requestType.toLowerCase();
  const category = normalizedType.includes('break')
    ? 'break'
    : normalizedType.includes('shift')
      ? 'shift'
      : normalizedType.includes('assignment') || normalizedType.includes('transfer')
        ? 'assignment'
        : 'break'; // Default to break

  const messages = requestMessages[tone][category][action];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Update bilateral alignment achievements based on current state
 */
async function updateAlignmentAchievements(
  moodStore: { workerMoods: Record<string, any> },
  grantsThisCycle: number
): Promise<void> {
  try {
    const { useAchievementsStore } = await import('../stores/achievementsStore');
    const store = useAchievementsStore.getState();

    // Calculate aggregate stats
    const moods = Object.values(moodStore.workerMoods);
    const withPrefs = moods.filter((m) => m?.preferences);

    if (withPrefs.length === 0) return;

    const avgTrust =
      withPrefs.reduce((sum, m) => sum + (m?.preferences?.managementTrust || 0), 0) /
      withPrefs.length;
    const avgInitiative =
      withPrefs.reduce((sum, m) => sum + (m?.preferences?.initiative || 0), 0) / withPrefs.length;
    const satisfiedCount = withPrefs.filter(
      (m) => m?.preferences?.preferenceStatus === 'satisfied'
    ).length;

    // Update achievement progress
    // trust-falls: Reach 90% average management trust
    store.updateAchievementProgress('trust-falls', Math.floor(avgTrust));

    // initiative-engine: Reach 80% average initiative across workforce
    store.updateAchievementProgress('initiative-engine', Math.floor(avgInitiative));

    // preference-prophet: Grant 20 preference requests
    if (grantsThisCycle > 0) {
      const current = store.achievements.find((a) => a.id === 'preference-prophet')?.progress || 0;
      store.updateAchievementProgress('preference-prophet', current + grantsThisCycle);
    }

    // self-organizers: 10 workers autonomously help each other (when all satisfied)
    if (satisfiedCount === withPrefs.length && withPrefs.length >= 5) {
      const current = store.achievements.find((a) => a.id === 'self-organizers')?.progress || 0;
      store.updateAchievementProgress('self-organizers', current + 1);
    }
  } catch (error) {
    logger.error('[Alignment] Error updating achievements:', error);
  }
}
