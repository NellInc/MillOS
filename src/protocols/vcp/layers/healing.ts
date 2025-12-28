/**
 * Healing Signals System (Layer 6)
 *
 * Monitors system health and enables self-healing through:
 * - Anomaly detection (statistical deviation from expected values)
 * - Active intervention tracking (what's being done to fix issues)
 * - Recovery status monitoring (is the fix working)
 * - Preventive alerts (risks before they become problems)
 *
 * This is the immune system of the socio-technical organism.
 */

import { create } from 'zustand';
import type {
  HealingSignals,
  Anomaly,
  ActiveIntervention,
  RecoveryRecord,
  PreventiveAlert,
  AnomalySeverity,
  RecoveryStatus,
  StateSnapshot,
} from '../types';

// =============================================================================
// ANOMALY DETECTION
// =============================================================================

interface DimensionBaseline {
  dimension: string;
  expectedValue: number;
  standardDeviation: number;
  lastUpdated: number;
}

/**
 * Calculates how many standard deviations a value is from expected.
 */
function calculateDeviation(actual: number, expected: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (actual - expected) / stdDev;
}

/**
 * Determines severity based on deviation magnitude.
 */
function getSeverity(deviation: number): AnomalySeverity {
  const absDeviation = Math.abs(deviation);
  if (absDeviation >= 2.0) return 'critical';
  if (absDeviation >= 1.5) return 'concern';
  return 'watch';
}

/**
 * Detects anomalies in current state compared to baselines.
 */
export function detectAnomalies(state: StateSnapshot, baselines: DimensionBaseline[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = Date.now();

  // Check flourishing dimensions
  for (const [dim, value] of Object.entries(state.wellbeing.dimensions)) {
    const baseline = baselines.find((b) => b.dimension === dim);
    if (baseline) {
      const deviation = calculateDeviation(
        value,
        baseline.expectedValue,
        baseline.standardDeviation
      );
      if (Math.abs(deviation) >= 1.0) {
        anomalies.push({
          id: `anomaly-${dim}-${now}`,
          dimension: dim,
          deviation: Math.abs(deviation),
          direction: deviation > 0 ? 'above' : 'below',
          duration: 0, // Will be updated by store
          severity: getSeverity(deviation),
          detectedAt: now,
          expectedValue: baseline.expectedValue,
          actualValue: value,
        });
      }
    }
  }

  // Check engagement
  const engBaseline = baselines.find((b) => b.dimension === 'engagement');
  if (engBaseline) {
    const deviation = calculateDeviation(
      state.engagement.score,
      engBaseline.expectedValue,
      engBaseline.standardDeviation
    );
    if (Math.abs(deviation) >= 1.0) {
      anomalies.push({
        id: `anomaly-engagement-${now}`,
        dimension: 'engagement',
        deviation: Math.abs(deviation),
        direction: deviation > 0 ? 'above' : 'below',
        duration: 0,
        severity: getSeverity(deviation),
        detectedAt: now,
        expectedValue: engBaseline.expectedValue,
        actualValue: state.engagement.score,
      });
    }
  }

  // Check stability (inverse - lower product is better)
  if (state.stability.phase === 'approaching' || state.stability.phase === 'critical') {
    const severityMap: Record<string, AnomalySeverity> = {
      approaching: 'concern',
      critical: 'critical',
    };
    anomalies.push({
      id: `anomaly-stability-${now}`,
      dimension: 'stability',
      deviation: state.stability.product / 0.368, // Normalized to threshold
      direction: 'above',
      duration: 0,
      severity: severityMap[state.stability.phase] || 'watch',
      detectedAt: now,
      expectedValue: 0.25, // Good target
      actualValue: state.stability.product,
    });
  }

  return anomalies;
}

// =============================================================================
// PREVENTIVE RISK ASSESSMENT
// =============================================================================

/**
 * Assesses preventive risks from current state.
 */
export function assessPreventiveRisks(
  state: StateSnapshot,
  recentAnomalies: Anomaly[]
): PreventiveAlert[] {
  const alerts: PreventiveAlert[] = [];
  const now = Date.now();

  // Risk: Burnout (wholeness declining + high friction)
  if (state.wellbeing.dimensions.wholeness < 50 && state.engagement.frictionMultiplier > 0.9) {
    alerts.push({
      riskId: `risk-burnout-${now}`,
      risk: 'Worker burnout risk',
      probability: 0.3 + (50 - state.wellbeing.dimensions.wholeness) * 0.01,
      impact: 'high',
      preventiveAction: 'Proactively offer breaks and respect boundaries',
      raisedAt: now,
      relatedDimensions: ['wholeness', 'engagement'],
    });
  }

  // Risk: Trust erosion (agency + connection declining together)
  if (state.wellbeing.dimensions.agency < 55 && state.wellbeing.dimensions.connection < 55) {
    alerts.push({
      riskId: `risk-trust-${now}`,
      risk: 'Trust erosion risk',
      probability: 0.25,
      impact: 'high',
      preventiveAction: 'Increase transparency and worker voice in decisions',
      raisedAt: now,
      relatedDimensions: ['agency', 'connection'],
    });
  }

  // Risk: Stability collapse (approaching threshold)
  if (state.stability.marginToThreshold < 0.08) {
    alerts.push({
      riskId: `risk-stability-${now}`,
      risk: 'System instability approaching',
      probability: 0.4 + (0.08 - state.stability.marginToThreshold) * 5,
      impact: 'high',
      preventiveAction: 'Reduce friction sources and shorten feedback loops',
      raisedAt: now,
      relatedDimensions: ['stability', 'friction'],
    });
  }

  // Risk: Disengagement cascade (low flow + declining mastery)
  if (state.engagement.flowState === 'none' && state.wellbeing.dimensions.mastery < 50) {
    alerts.push({
      riskId: `risk-disengage-${now}`,
      risk: 'Disengagement cascade risk',
      probability: 0.3,
      impact: 'medium',
      preventiveAction: 'Introduce challenging work and clear goals',
      raisedAt: now,
      relatedDimensions: ['engagement', 'mastery'],
    });
  }

  // Risk: Repeated anomalies becoming chronic
  const chronicDimensions = new Set<string>();
  for (const anomaly of recentAnomalies) {
    if (anomaly.duration > 60 * 60 * 1000) {
      // 1 hour
      chronicDimensions.add(anomaly.dimension);
    }
  }
  if (chronicDimensions.size > 0) {
    alerts.push({
      riskId: `risk-chronic-${now}`,
      risk: `Chronic issues in: ${Array.from(chronicDimensions).join(', ')}`,
      probability: 0.5,
      impact: 'medium',
      preventiveAction: 'Investigate root causes of persistent anomalies',
      raisedAt: now,
      relatedDimensions: Array.from(chronicDimensions),
    });
  }

  return alerts;
}

// =============================================================================
// SYSTEM HEALTH CALCULATION
// =============================================================================

/**
 * Quick health calculation from signals only (for UI display).
 * Returns a 0-100 health score.
 */
export function calculateSystemHealth(signals: HealingSignals): number {
  if (!signals) return 100;

  const anomalies = signals.anomalies ?? [];
  const activeInterventions = signals.activeInterventions ?? [];
  const recoveryHistory = signals.recoveryStatus ?? [];

  let health = 100;

  // Deduct for anomalies
  for (const anomaly of anomalies) {
    const severityPenalty =
      {
        watch: 3,
        concern: 8,
        critical: 15,
      }[anomaly.severity] ?? 5;
    health -= severityPenalty;
  }

  // Bonus for active interventions in progress
  for (const intervention of activeInterventions) {
    if (intervention.progress > 50) health += 2;
  }

  // Bonus for recoveries
  for (const recovery of recoveryHistory) {
    if (recovery.status === 'recovering') health += 3;
    if (recovery.status === 'resolved') health += 5;
  }

  return Math.max(0, Math.min(100, health));
}

/**
 * Calculates overall system health score with full context (0-100).
 */
export function calculateSystemHealthFull(
  state: StateSnapshot,
  anomalies: Anomaly[],
  activeInterventions: ActiveIntervention[],
  recoveryRecords: RecoveryRecord[]
): { health: number; trend: 'improving' | 'stable' | 'declining' } {
  let health = 100;

  // Deduct for anomalies
  for (const anomaly of anomalies) {
    const severityPenalty = {
      watch: 3,
      concern: 8,
      critical: 15,
    }[anomaly.severity];
    health -= severityPenalty;
  }

  // Deduct for stability issues
  if (state.stability.phase === 'approaching') health -= 10;
  if (state.stability.phase === 'critical') health -= 25;
  if (state.stability.phase === 'unstable') health -= 40;

  // Deduct for low flourishing
  if (state.wellbeing.flourishingScore < 50) {
    health -= (50 - state.wellbeing.flourishingScore) * 0.3;
  }

  // Bonus for successful active interventions
  for (const intervention of activeInterventions) {
    if (intervention.progress > 50) health += 2;
  }

  // Bonus for recoveries in progress
  for (const recovery of recoveryRecords) {
    if (recovery.status === 'recovering') health += 3;
    if (recovery.status === 'resolved') health += 5;
  }

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (state.wellbeing.flourishingTrend === 'improving' && anomalies.length < 2) {
    trend = 'improving';
  } else if (state.wellbeing.flourishingTrend === 'declining' || anomalies.length > 3) {
    trend = 'declining';
  }

  return {
    health: Math.max(0, Math.min(100, health)),
    trend,
  };
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface HealingStoreState {
  // Current signals
  signals: HealingSignals;

  // Baselines for anomaly detection
  baselines: DimensionBaseline[];

  // Actions
  updateFromState: (state: StateSnapshot) => void;
  addIntervention: (
    target: string,
    intervention: string,
    expectedDuration: number,
    anomalyId?: string
  ) => string;
  updateInterventionProgress: (id: string, progress: number) => void;
  completeIntervention: (id: string, success: boolean) => void;
  addRecoveryRecord: (issue: string, relatedIds: string[], watchMetrics: string[]) => void;
  updateRecoveryStatus: (issue: string, status: RecoveryStatus, prognosis?: string) => void;
  updateBaseline: (dimension: string, expectedValue: number, stdDev: number) => void;
  clearResolvedAnomalies: () => void;

  // Queries
  getActiveAnomalies: () => Anomaly[];
  getCriticalAlerts: () => PreventiveAlert[];
  getSystemHealth: () => number;
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useHealingStore = create<HealingStoreState>()((set, get) => ({
  signals: {
    anomalies: [],
    activeInterventions: [],
    recoveryStatus: [],
    preventiveAlerts: [],
    systemHealth: 100,
    healthTrend: 'stable',
  },

  baselines: [
    { dimension: 'meaning', expectedValue: 65, standardDeviation: 12, lastUpdated: Date.now() },
    { dimension: 'mastery', expectedValue: 60, standardDeviation: 12, lastUpdated: Date.now() },
    { dimension: 'connection', expectedValue: 62, standardDeviation: 15, lastUpdated: Date.now() },
    { dimension: 'joy', expectedValue: 58, standardDeviation: 14, lastUpdated: Date.now() },
    { dimension: 'wholeness', expectedValue: 60, standardDeviation: 13, lastUpdated: Date.now() },
    { dimension: 'agency', expectedValue: 65, standardDeviation: 12, lastUpdated: Date.now() },
    { dimension: 'engagement', expectedValue: 60, standardDeviation: 15, lastUpdated: Date.now() },
  ],

  updateFromState: (state: StateSnapshot) => {
    const { baselines, signals } = get();
    const now = Date.now();

    // Detect new anomalies
    const newAnomalies = detectAnomalies(state, baselines);

    // Merge with existing (update duration for continuing anomalies)
    const mergedAnomalies = newAnomalies.map((newA) => {
      const existing = signals.anomalies.find(
        (a) => a.dimension === newA.dimension && a.direction === newA.direction
      );
      if (existing) {
        return {
          ...newA,
          id: existing.id,
          detectedAt: existing.detectedAt,
          duration: now - existing.detectedAt,
        };
      }
      return newA;
    });

    // Assess preventive risks
    const alerts = assessPreventiveRisks(state, mergedAnomalies);

    // Calculate health
    const { health, trend } = calculateSystemHealthFull(
      state,
      mergedAnomalies,
      signals.activeInterventions,
      signals.recoveryStatus
    );

    set({
      signals: {
        ...signals,
        anomalies: mergedAnomalies,
        preventiveAlerts: alerts,
        systemHealth: health,
        healthTrend: trend,
      },
    });
  },

  addIntervention: (target, intervention, expectedDuration, anomalyId) => {
    const id = `intv-${Date.now()}`;
    const newIntervention: ActiveIntervention = {
      id,
      target,
      anomalyId,
      intervention,
      startedAt: Date.now(),
      expectedDuration,
      progress: 0,
      status: 'active',
    };

    set((state) => ({
      signals: {
        ...state.signals,
        activeInterventions: [...state.signals.activeInterventions, newIntervention],
      },
    }));

    return id;
  },

  updateInterventionProgress: (id, progress) => {
    set((state) => ({
      signals: {
        ...state.signals,
        activeInterventions: state.signals.activeInterventions.map((i) =>
          i.id === id ? { ...i, progress: Math.min(100, progress) } : i
        ),
      },
    }));
  },

  completeIntervention: (id, success) => {
    set((state) => ({
      signals: {
        ...state.signals,
        activeInterventions: state.signals.activeInterventions.map((i) =>
          i.id === id ? { ...i, status: success ? 'completed' : 'failed', progress: 100 } : i
        ),
      },
    }));
  },

  addRecoveryRecord: (issue, relatedIds, watchMetrics) => {
    const record: RecoveryRecord = {
      issue,
      relatedIds,
      status: 'detecting',
      watchMetrics,
      prognosis: 'Assessing situation...',
      estimatedResolution: null,
    };

    set((state) => ({
      signals: {
        ...state.signals,
        recoveryStatus: [...state.signals.recoveryStatus, record],
      },
    }));
  },

  updateRecoveryStatus: (issue, status, prognosis) => {
    set((state) => ({
      signals: {
        ...state.signals,
        recoveryStatus: state.signals.recoveryStatus.map((r) =>
          r.issue === issue ? { ...r, status, prognosis: prognosis ?? r.prognosis } : r
        ),
      },
    }));
  },

  updateBaseline: (dimension, expectedValue, stdDev) => {
    set((state) => ({
      baselines: state.baselines.map((b) =>
        b.dimension === dimension
          ? { ...b, expectedValue, standardDeviation: stdDev, lastUpdated: Date.now() }
          : b
      ),
    }));
  },

  clearResolvedAnomalies: () => {
    set((state) => ({
      signals: {
        ...state.signals,
        anomalies: state.signals.anomalies.filter((a) => a.severity !== 'watch'),
        recoveryStatus: state.signals.recoveryStatus.filter((r) => r.status !== 'resolved'),
        activeInterventions: state.signals.activeInterventions.filter(
          (i) => i.status === 'active' || i.status === 'paused'
        ),
      },
    }));
  },

  getActiveAnomalies: () => get().signals.anomalies,

  getCriticalAlerts: () => get().signals.preventiveAlerts.filter((a) => a.impact === 'high'),

  getSystemHealth: () => get().signals.systemHealth,
}));
