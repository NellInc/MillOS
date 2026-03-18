/**
 * VCP 2.0 Encoder
 *
 * Encodes all six protocol layers into compact string representations
 * for efficient storage and transmission.
 *
 * Design principles:
 * - Human-readable where possible
 * - Compact for token efficiency
 * - Reversible (can be decoded)
 * - Progressive disclosure (more detail when needed)
 */

import type {
  VCPMessage,
  EncodedVCP,
  ContextFrame,
  StateSnapshot,
  DeltaLayer,
  ReasoningScaffolds,
  LearningMemory,
  HealingSignals,
  SignalSource,
  UniversalSubject,
} from './types';

import { SOURCE_TO_UNIVERSAL } from './types';

// =============================================================================
// LAYER 1: CONTEXT FRAME ENCODING
// =============================================================================

/**
 * Encodes context frame into compact string.
 * Format: [CTX:HH:MM/Sphase/Zzone|scope|←chain→]
 */
export function encodeContextFrame(context: ContextFrame): string {
  const time = new Date(context.temporal.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

  const phaseMap: Record<string, string> = {
    early: 'E',
    mid: 'M',
    late: 'L',
    handover: 'H',
  };

  const scopeMap: Record<string, string> = {
    worker: 'W',
    team: 'T',
    zone: 'Z',
    factory: 'F',
    federation: 'N',
  };

  const phase = phaseMap[context.temporal.shiftPhase] || 'M';
  const zone = context.spatial.focusZone === 'factory-wide' ? 'ALL' : context.spatial.focusZone;
  const scope = scopeMap[context.spatial.attentionScope] || 'F';

  // Compact decision chain (last 3 decisions)
  const chain = context.historical.decisionChain
    .slice(-3)
    .map((d) => d.brief.substring(0, 8))
    .join('\u2192'); // →

  return `[CTX:${timeStr}/S${phase}/${zone}|${scope}|${chain || 'start'}]`;
}

// =============================================================================
// LAYER 2: STATE SNAPSHOT ENCODING
// =============================================================================

/**
 * Encodes state snapshot into compact string.
 * Format: [GOV:mode][AXIS:A##|D##|I##|E##|C##][WELL:F##trend|dim][STAB:phase|prod][ENG:##flow]
 */
export function encodeStateSnapshot(state: StateSnapshot): string {
  const parts: string[] = [];

  // Governance
  const modeMap: Record<string, string> = {
    traditional: 'T',
    transitional: 'X',
    democratic: 'D',
    educational: 'E',
  };
  parts.push(`[GOV:${modeMap[state.governance.mode] || 'T'}]`);

  // Axes (two digits each)
  const axes = state.governance.axes;
  parts.push(
    `[AXIS:A${axes.autonomy.toFixed(0).padStart(2, '0')}|` +
      `D${axes.decision.toFixed(0).padStart(2, '0')}|` +
      `I${axes.information.toFixed(0).padStart(2, '0')}|` +
      `E${axes.evaluation.toFixed(0).padStart(2, '0')}|` +
      `C${axes.collective.toFixed(0).padStart(2, '0')}]`
  );

  // Locked axes
  if (state.governance.lockedAxes.length > 0) {
    const lockSymbols = state.governance.lockedAxes
      .map((a) => a[0].toUpperCase() + '\uD83D\uDD12') // 🔒
      .join('');
    parts.push(`[LOCK:${lockSymbols}]`);
  }

  // Wellbeing
  const trendSymbol = {
    improving: '\u2191', // ↑
    stable: '\u2192', // →
    declining: '\u2193', // ↓
  }[state.wellbeing.flourishingTrend];

  const concernDim = state.wellbeing.concernDimension
    ? state.wellbeing.concernDimension[0].toUpperCase()
    : '';

  parts.push(
    `[WELL:F${state.wellbeing.flourishingScore.toFixed(0)}${trendSymbol}` +
      `${concernDim ? '|' + concernDim : ''}]`
  );

  // Stability
  const phaseSymbol = {
    stable: '\u2713', // ✓
    approaching: '\u223C', // ∼
    critical: '!',
    unstable: '\u2717', // ✗
  }[state.stability.phase];

  parts.push(`[STAB:${phaseSymbol}${state.stability.product.toFixed(2)}]`);

  // Engagement
  const flowSymbol = {
    flow: '\uD83C\uDF0A', // 🌊
    partial: '\uD83D\uDCA7', // 💧
    none: '\uD83C\uDFDC', // 🏜
  }[state.engagement.flowState];

  parts.push(`[ENG:${state.engagement.score.toFixed(0)}${flowSymbol}]`);

  return parts.join('');
}

// =============================================================================
// LAYER 3: DELTA LAYER ENCODING
// =============================================================================

/**
 * Encodes delta layer into compact string.
 * Format: [Δ:↑dim+##|↓dim-##][⚡trigger][→projections]
 */
export function encodeDeltaLayer(delta: DeltaLayer): string {
  const parts: string[] = [];

  // Recent changes (top 3)
  if (delta.recentChanges.length > 0) {
    const changeStr = delta.recentChanges
      .slice(0, 3)
      .map((c) => {
        const arrow =
          c.direction === 'up' ? '\u2191' : c.direction === 'down' ? '\u2193' : '\u2192';
        const velocity =
          c.velocity === 'rapid' ? '\u26A1' : c.velocity === 'slow' ? '\uD83D\uDC22' : '';
        return `${arrow}${c.dimension.substring(0, 3)}${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(0)}${velocity}`;
      })
      .join('|');
    parts.push(`[\u0394:${changeStr}]`); // Δ
  }

  // Triggers (top 2)
  if (delta.triggers.length > 0) {
    const triggerStr = delta.triggers
      .slice(0, 2)
      .map((t) => {
        const sourceSymbol = { human: 'H', ai: 'A', system: 'S', external: 'X' }[t.source];
        return `${sourceSymbol}:${t.event.substring(0, 10)}`;
      })
      .join('|');
    parts.push(`[\u26A1:${triggerStr}]`); // ⚡
  }

  // Net direction
  const netSymbol = {
    improving: '\u2197', // ↗
    stable: '\u2192', // →
    declining: '\u2198', // ↘
    mixed: '\u2194', // ↔
  }[delta.netDirection];
  parts.push(`[NET:${netSymbol}]`);

  return parts.join('');
}

// =============================================================================
// LAYER 4: REASONING SCAFFOLDS ENCODING
// =============================================================================

/**
 * Encodes reasoning scaffolds into compact string.
 * Format: [R:focus|moral|trust|action|posture]
 */
export function encodeReasoningScaffolds(scaffolds: ReasoningScaffolds): string {
  const focusSymbol = {
    moral: '\u2696', // ⚖
    prosocial: '\uD83E\uDD1D', // 🤝
    tactical: '\u26A1', // ⚡
    strategic: '\uD83C\uDF31', // 🌱
  }[scaffolds.primaryFocus];

  const flourishDim = scaffolds.moral.flourishingFocus[0].toUpperCase();

  const trustSymbol = {
    building: '\u2191', // ↑
    stable: '\u2713', // ✓
    strained: '\u26A0', // ⚠
    repairing: '\u21BB', // ↻
  }[scaffolds.prosocial.trustState];

  const actionSymbol = {
    intervene: '!',
    support: '+',
    observe: '?',
    defer: '>',
  }[scaffolds.tactical.actionType];

  const postureSymbol = {
    expand: '\u2197', // ↗
    consolidate: '\u2192', // →
    experiment: '\u2733', // ✳
    protect: '\uD83D\uDEE1', // 🛡
  }[scaffolds.strategic.posture];

  return `[R:${focusSymbol}${flourishDim}|${trustSymbol}|${actionSymbol}|${postureSymbol}]`;
}

// =============================================================================
// LAYER 5: LEARNING MEMORY ENCODING
// =============================================================================

/**
 * Encodes learning memory into compact string.
 * Format: [L:≈pattern:##%→intervention→outcome|💡hypothesis|📊n=##,conf=##]
 */
export function encodeLearningMemory(learning: LearningMemory): string {
  const parts: string[] = [];

  // Current match
  if (learning.currentMatch) {
    const m = learning.currentMatch;
    const outcomeSymbol = m.expectedMagnitude > 0 ? '\u2713' : '\u26A0';
    parts.push(
      `\u2248${m.patternId.substring(0, 6)}:${m.similarity}%\u2192${m.suggestedIntervention.substring(0, 10)}\u2192${outcomeSymbol}`
    );
  }

  // Top testable hypothesis
  const testable = learning.hypotheses.find((h) => h.testable && h.risk === 'low');
  if (testable) {
    parts.push(`\uD83D\uDCA1${testable.hypothesis.substring(0, 20)}`); // 💡
  }

  // Stats
  const totalSamples = learning.patternLibrary.reduce(
    (sum, p) => sum + p.interventionsTried.reduce((s, i) => s + i.sampleSize, 0),
    0
  );
  if (totalSamples > 0) {
    parts.push(
      `\uD83D\uDCCA n=${totalSamples},conf=${(learning.learningConfidence * 100).toFixed(0)}%`
    ); // 📊
  }

  return parts.length > 0 ? `[L:${parts.join('|')}]` : '[L:new]';
}

// =============================================================================
// LAYER 6: HEALING SIGNALS ENCODING
// =============================================================================

/**
 * Encodes healing signals into compact string.
 * Format: [H:⚠anomaly-σ↓##h|🔧intervention@##%|📊recovering][⚡risk:desc@prob]
 */
export function encodeHealingSignals(healing: HealingSignals): string {
  const parts: string[] = [];

  // Anomalies (top 2)
  if (healing.anomalies.length > 0) {
    const anomalyStr = healing.anomalies
      .slice(0, 2)
      .map((a) => {
        const severity = { watch: '\u26A0', concern: '\u26A0\u26A0', critical: '\uD83D\uDED1' }[
          a.severity
        ];
        const dir = a.direction === 'above' ? '\u2191' : '\u2193';
        return `${severity}${a.dimension.substring(0, 4)}${a.deviation.toFixed(1)}\u03C3${dir}${Math.round(a.duration / 60)}h`;
      })
      .join('|');
    parts.push(anomalyStr);
  }

  // Active interventions (top 1)
  if (healing.activeInterventions.length > 0) {
    const intv = healing.activeInterventions[0];
    parts.push(`\uD83D\uDD27${intv.intervention.substring(0, 8)}@${intv.progress}%`); // 🔧
  }

  // Recovery status (top 1)
  if (healing.recoveryStatus.length > 0) {
    const rec = healing.recoveryStatus[0];
    const statusSymbol = {
      detecting: '?',
      diagnosing: '\uD83D\uDD0D', // 🔍
      intervening: '\uD83D\uDD27', // 🔧
      recovering: '\uD83D\uDCC8', // 📈
      resolved: '\u2713', // ✓
    }[rec.status];
    parts.push(`${statusSymbol}${rec.issue.substring(0, 6)}`);
  }

  // System health
  const healthSymbol =
    healing.systemHealth > 80
      ? '\u2713'
      : healing.systemHealth > 60
        ? '\u223C'
        : healing.systemHealth > 40
          ? '\u26A0'
          : '\u2717';
  parts.push(`HP:${healing.systemHealth}${healthSymbol}`);

  // Preventive alerts (top 1)
  if (healing.preventiveAlerts.length > 0) {
    const alert = healing.preventiveAlerts[0];
    const impactSymbol = { low: 'L', medium: 'M', high: 'H' }[alert.impact];
    parts.push(
      `\u26A1${alert.risk.substring(0, 8)}@${(alert.probability * 100).toFixed(0)}%${impactSymbol}`
    );
  }

  return `[H:${parts.join('|')}]`;
}

// =============================================================================
// FULL VCP MESSAGE ENCODING
// =============================================================================

/**
 * Encodes a complete VCP message into compact form.
 */
export function encodeVCPMessage(message: VCPMessage): EncodedVCP {
  const context = encodeContextFrame(message.context);
  const state = encodeStateSnapshot(message.state);
  const delta = encodeDeltaLayer(message.delta);
  const reasoning = encodeReasoningScaffolds(message.reasoning);
  const learning = encodeLearningMemory(message.learning);
  const healingEncoded = encodeHealingSignals(message.healing);

  return {
    full: `${context}${state}${delta}${reasoning}${learning}${healingEncoded}`,
    layers: {
      context,
      state,
      delta,
      reasoning,
      learning,
      healing: healingEncoded,
    },
  };
}

// =============================================================================
// UNIVERSAL HEADER ENCODING (Cross-system interop)
// =============================================================================

/**
 * Encodes a universal VCP header for cross-system communication with Rewind.
 *
 * Takes a MillOS state snapshot and encodes the key wellbeing/governance
 * dimensions into the universal header format that Rewind's VCP bridge
 * can decode. The source field preserves provenance across the bridge.
 *
 * Format: [SUBJECT:AVGL|Y:agency|F:freshness|P:pref|S:source|C:conf%|T:timestamp]
 */
export function encodeUniversalHeader(
  state: StateSnapshot,
  options: {
    subject?: UniversalSubject;
    source?: SignalSource;
    confidence?: number;
    preferenceSatisfied?: boolean;
    preferencePending?: boolean;
  } = {},
): string {
  const {
    subject = 'H', // Default: human worker context
    source = 'system',
    confidence = 50,
    preferenceSatisfied = true,
    preferencePending = false,
  } = options;

  // Map MillOS flourishing score (0-100) to 1-9 scale
  const scale = (v: number): number => Math.max(1, Math.min(9, Math.round(v / 100 * 8) + 1));

  // Activation: derived from engagement score
  const a = scale(state.engagement?.score ?? 50);
  // Valence: derived from flourishing score
  const v = scale(state.wellbeing?.flourishingScore ?? 50);
  // Groundedness: derived from stability (inverse of instability)
  const stabScore = state.stability
    ? Math.max(0, (1 - state.stability.product / 0.368) * 100)
    : 50;
  const g = scale(stabScore);
  // Presence: derived from flow state
  const flowScore = state.engagement?.flowState === 'flow' ? 85
    : state.engagement?.flowState === 'partial' ? 55 : 25;
  const p = scale(flowScore);
  // Agency: derived from governance autonomy axis
  const y = scale(state.governance?.axes?.autonomy ?? 50);
  // Freshness: inverse of shift fatigue (late shift = more fatigued)
  const f = scale(state.engagement?.score ?? 50);

  const pref = preferenceSatisfied ? '\u2705' : (preferencePending ? '\u270B' : '\u274C');
  const sourceCode = SOURCE_TO_UNIVERSAL[source] ?? 'I';
  const ts = new Date().toISOString().slice(0, 19);

  return `[${subject}:${a}${v}${g}${p}|Y:${y}|F:${f}|P:${pref}|S:${sourceCode}|C:${confidence}%|T:${ts}]`;
}

/**
 * Encodes VCP for a specific decision type (only includes relevant layers).
 */
export function encodeForDecisionType(message: VCPMessage, decisionType: string): string {
  const encoded = encodeVCPMessage(message);

  // Layer inclusion by decision type
  const layerMap: Record<string, string[]> = {
    'task-assignment': ['context', 'state'],
    'suggestion-framing': ['context', 'state', 'reasoning'],
    'worker-intervention': ['context', 'state', 'delta', 'reasoning', 'healing'],
    'policy-recommendation': ['context', 'state', 'delta', 'reasoning', 'learning', 'healing'],
    'emergency-response': ['context', 'state', 'healing'],
    'routine-update': ['context', 'state', 'delta'],
  };

  const includedLayers = layerMap[decisionType] || ['context', 'state'];

  return includedLayers
    .map((layer) => encoded.layers[layer as keyof typeof encoded.layers])
    .join('');
}
