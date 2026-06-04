/**
 * VCP 2.0 Decoder
 *
 * Decodes compact VCP strings back into structured data.
 * Used for:
 * - Reconstructing state from stored VCP
 * - Debugging encoded messages
 * - Cross-system communication
 */

import type {
  ContextFrame,
  StateSnapshot,
  DeltaLayer,
  ReasoningScaffolds,
  ShiftPhase,
  AttentionScope,
  FlourishingDimension,
  TrustState,
  UniversalVCPHeader,
  UniversalSubject,
  SignalSource,
} from './types';

import { UNIVERSAL_SOURCE_MAP } from './types';

// =============================================================================
// REGEX PATTERNS
// =============================================================================

const PATTERNS = {
  context: /\[CTX:(\d{2}):(\d{2})\/S([EMLH])\/([^|]+)\|([WTZFN])\|([^\]]*)\]/,
  governance: /\[GOV:([TXDE])\]/,
  axes: /\[AXIS:A(\d{2})\|D(\d{2})\|I(\d{2})\|E(\d{2})\|C(\d{2})\]/,
  lock: /\[LOCK:([^\]]+)\]/,
  // NOTE: 'meaning' and 'mastery' both encode to 'M' (encoder uses
  // concernDimension[0].toUpperCase()), so this char class is [MCJWA], not all
  // six FlourishingDimension values. The 'M' collision is decoded as 'meaning'
  // (see dimMap in decodeStateSnapshot). Full disambiguation needs an
  // encoder-side wire-format change to give 'mastery' a unique symbol.
  wellbeing: /\[WELL:F(\d+)([↑→↓])\|?([MCJWA])?\]/u,
  stability: /\[STAB:([✓∼!✗])([\d.]+)\]/u,
  engagement: /\[ENG:(\d+)([🌊💧🏜])\]/u,
  delta: /\[Δ:([^\]]+)\]/,
  triggers: /\[⚡:([^\]]+)\]/u,
  net: /\[NET:([↗→↘↔])\]/u,
  // [MCJWA]: 'meaning'/'mastery' both encode to 'M' (decoded as 'meaning'); see wellbeing note above.
  reasoning: /\[R:([⚖🤝⚡🌱])([MCJWA])\|([↑✓⚠↻])\|([!+?>])\|([↗→✳🛡])\]/u,
  learning: /\[L:([^\]]+)\]/,
  healing: /\[H:([^\]]+)\]/,
};

// =============================================================================
// LAYER 1: CONTEXT FRAME DECODING
// =============================================================================

/**
 * Decodes context frame from encoded string.
 */
export function decodeContextFrame(encoded: string): Partial<ContextFrame> | null {
  const match = encoded.match(PATTERNS.context);
  if (!match) return null;

  const [, hours, minutes, phase, zone, scope, chain] = match;

  const phaseMap: Record<string, ShiftPhase> = {
    E: 'early',
    M: 'mid',
    L: 'late',
    H: 'handover',
  };

  const scopeMap: Record<string, AttentionScope> = {
    W: 'worker',
    T: 'team',
    Z: 'zone',
    F: 'factory',
    N: 'federation',
  };

  // Reconstruct timestamp (approximate - uses today's date)
  const now = new Date();
  now.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  return {
    temporal: {
      timestamp: now.getTime(),
      shiftPhase: phaseMap[phase] || 'mid',
      sessionDuration: 0, // Cannot be recovered from encoding
      decisionCadence: 0,
      shiftProgress: 0,
    },
    spatial: {
      focusZone: zone === 'ALL' ? 'factory-wide' : zone,
      attentionScope: scopeMap[scope] || 'factory',
      activeZones: [],
    },
    relational: {
      activeActors: [],
      stakeholderContext: '',
      decisionAuthority: 'ai',
    },
    historical: {
      decisionChain: chain.split('→').map((brief) => ({
        id: '',
        timestamp: 0,
        type: '',
        outcome: 'executed' as const,
        brief,
      })),
      narrativeThread: '',
      sessionEvents: [],
    },
  };
}

// =============================================================================
// LAYER 2: STATE SNAPSHOT DECODING
// =============================================================================

/**
 * Decodes state snapshot from encoded string.
 */
export function decodeStateSnapshot(encoded: string): Partial<StateSnapshot> | null {
  const govMatch = encoded.match(PATTERNS.governance);
  const axesMatch = encoded.match(PATTERNS.axes);
  const wellMatch = encoded.match(PATTERNS.wellbeing);
  const stabMatch = encoded.match(PATTERNS.stability);
  const engMatch = encoded.match(PATTERNS.engagement);
  const lockMatch = encoded.match(PATTERNS.lock);

  if (!govMatch || !axesMatch) return null;

  const modeMap: Record<string, StateSnapshot['governance']['mode']> = {
    T: 'traditional',
    X: 'transitional',
    D: 'democratic',
    E: 'educational',
  };

  const trendMap: Record<string, 'improving' | 'stable' | 'declining'> = {
    '↑': 'improving',
    '→': 'stable',
    '↓': 'declining',
  };

  const phaseMap: Record<string, StateSnapshot['stability']['phase']> = {
    '✓': 'stable',
    '∼': 'approaching',
    '!': 'critical',
    '✗': 'unstable',
  };

  const flowMap: Record<string, StateSnapshot['engagement']['flowState']> = {
    '🌊': 'flow',
    '💧': 'partial',
    '🏜': 'none',
  };

  // LOSSY: 'meaning' and 'mastery' both encode to 'M' (encoder uses
  // concernDimension[0].toUpperCase()), so 'M' is decoded as 'meaning' and a
  // concernDimension of 'mastery' silently round-trips to 'meaning'. Restoring
  // full fidelity requires giving 'mastery' a unique encoder symbol.
  const dimMap: Record<string, FlourishingDimension> = {
    M: 'meaning',
    A: 'agency',
    C: 'connection',
    J: 'joy',
    W: 'wholeness',
  };

  // Parse locked axes
  const lockedAxes: StateSnapshot['governance']['lockedAxes'] = [];
  if (lockMatch) {
    const lockStr = lockMatch[1];
    if (lockStr.includes('A')) lockedAxes.push('autonomy');
    if (lockStr.includes('D')) lockedAxes.push('decision');
    if (lockStr.includes('I')) lockedAxes.push('information');
    if (lockStr.includes('E')) lockedAxes.push('evaluation');
    if (lockStr.includes('C')) lockedAxes.push('collective');
  }

  // Safe parse helpers with bounds checking
  const safeParseInt = (
    match: RegExpMatchArray | null,
    index: number,
    fallback: number = 50
  ): number => {
    if (!match || index >= match.length || match[index] === undefined) return fallback;
    const parsed = parseInt(match[index]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const safeParseFloat = (
    match: RegExpMatchArray | null,
    index: number,
    fallback: number = 0
  ): number => {
    if (!match || index >= match.length || match[index] === undefined) return fallback;
    const parsed = parseFloat(match[index]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const safeGetString = (match: RegExpMatchArray | null, index: number): string | undefined => {
    if (!match || index >= match.length) return undefined;
    return match[index];
  };

  return {
    governance: {
      mode: modeMap[safeGetString(govMatch, 1) ?? ''] || 'traditional',
      axes: {
        autonomy: safeParseInt(axesMatch, 1),
        decision: safeParseInt(axesMatch, 2),
        information: safeParseInt(axesMatch, 3),
        evaluation: safeParseInt(axesMatch, 4),
        collective: safeParseInt(axesMatch, 5),
      },
      lockedAxes,
      activePreset: null,
    },
    wellbeing: wellMatch
      ? {
          flourishingScore: safeParseInt(wellMatch, 1),
          flourishingTrend: trendMap[safeGetString(wellMatch, 2) ?? ''] || 'stable',
          concernDimension: safeGetString(wellMatch, 3)
            ? dimMap[safeGetString(wellMatch, 3)!]
            : null,
          gainDimension: null,
          dimensions: {
            meaning: 50,
            mastery: 50,
            connection: 50,
            joy: 50,
            wholeness: 50,
            agency: 50,
          },
          workerDistribution: { flourishing: 0, neutral: 0, struggling: 0 },
        }
      : undefined,
    stability: stabMatch
      ? {
          phase: phaseMap[safeGetString(stabMatch, 1) ?? ''] || 'stable',
          alpha: 0.3,
          tau: 0.3,
          product: safeParseFloat(stabMatch, 2),
          marginToThreshold: 0.368 - safeParseFloat(stabMatch, 2),
        }
      : undefined,
    engagement: engMatch
      ? {
          score: safeParseInt(engMatch, 1),
          flowState: flowMap[safeGetString(engMatch, 2) ?? ''] || 'partial',
          frictionMultiplier: 1.0,
          dimensions: {
            flowFrequency: 50,
            goalClarity: 50,
            feedbackImmediacy: 50,
            challengeBalance: 50,
            masteryProgression: 50,
            entryFriction: 50,
          },
        }
      : undefined,
  };
}

// =============================================================================
// LAYER 3: DELTA LAYER DECODING
// =============================================================================

/**
 * Decodes delta layer from encoded string.
 */
export function decodeDeltaLayer(encoded: string): Partial<DeltaLayer> | null {
  const deltaMatch = encoded.match(PATTERNS.delta);
  const netMatch = encoded.match(PATTERNS.net);

  const netMap: Record<string, DeltaLayer['netDirection']> = {
    '↗': 'improving',
    '→': 'stable',
    '↘': 'declining',
    '↔': 'mixed',
  };

  const changes: DeltaLayer['recentChanges'] = [];

  if (deltaMatch) {
    const changeStr = deltaMatch[1];
    const changeRegex = /([↑↓→])(\w+)([+-]?\d+)([⚡🐢])?/gu;
    let changeMatch;

    while ((changeMatch = changeRegex.exec(changeStr)) !== null) {
      const [, direction, dim, delta, velocity] = changeMatch;
      changes.push({
        dimension: dim,
        category: 'flourishing',
        delta: parseInt(delta),
        direction: direction === '↑' ? 'up' : direction === '↓' ? 'down' : 'stable',
        velocity: velocity === '⚡' ? 'rapid' : velocity === '🐢' ? 'slow' : 'moderate',
        timestamp: Date.now(),
      });
    }
  }

  return {
    recentChanges: changes,
    triggers: [],
    trajectories: [],
    netDirection: netMatch ? netMap[netMatch[1]] || 'stable' : 'stable',
  };
}

// =============================================================================
// LAYER 4: REASONING SCAFFOLDS DECODING
// =============================================================================

/**
 * Decodes reasoning scaffolds from encoded string.
 */
export function decodeReasoningScaffolds(encoded: string): Partial<ReasoningScaffolds> | null {
  const match = encoded.match(PATTERNS.reasoning);
  if (!match) return null;

  const [, focus, flourishDim, trust, action, posture] = match;

  const focusMap: Record<string, ReasoningScaffolds['primaryFocus']> = {
    '⚖': 'moral',
    '🤝': 'prosocial',
    '⚡': 'tactical',
    '🌱': 'strategic',
  };

  // LOSSY: 'meaning' and 'mastery' both encode to 'M'; 'M' is decoded as
  // 'meaning' (see note in decodeStateSnapshot's dimMap).
  const dimMap: Record<string, FlourishingDimension> = {
    M: 'meaning',
    A: 'agency',
    C: 'connection',
    J: 'joy',
    W: 'wholeness',
  };

  const trustMap: Record<string, TrustState> = {
    '↑': 'building',
    '✓': 'stable',
    '⚠': 'strained',
    '↻': 'repairing',
  };

  return {
    primaryFocus: focusMap[focus] || 'tactical',
    moral: {
      primaryValue: '',
      flourishingFocus: dimMap[flourishDim] || 'agency',
      ethicalFrame: 'bilateral',
      worstOffConsideration: '',
      bilateralCheck: '',
      keyQuestion: '',
    },
    prosocial: {
      trustState: trustMap[trust] || 'building',
      cooperationPattern: '',
      relationshipRisks: [],
      mutualBenefit: '',
      communicationStyle: 'supportive',
      keyQuestion: '',
    },
    tactical: {
      immediateGoal: '',
      constraints: [],
      quickWins: [],
      frictionSources: [],
      actionType:
        action === '!'
          ? 'intervene'
          : action === '+'
            ? 'support'
            : action === '?'
              ? 'observe'
              : 'defer',
      keyQuestion: '',
    },
    strategic: {
      longTermFlourishing: '',
      stabilityImplications: '',
      learningOpportunity: '',
      systemEvolution: '',
      posture:
        posture === '↗'
          ? 'expand'
          : posture === '→'
            ? 'consolidate'
            : posture === '✳'
              ? 'experiment'
              : 'protect',
      keyQuestion: '',
    },
  };
}

// =============================================================================
// UNIVERSAL HEADER DECODING (Cross-system interop)
// =============================================================================

/**
 * Regex for the universal VCP header format used by Rewind's VCP bridge.
 * Format: [SUBJECT:AVGL|Y:agency|F:freshness|P:pref|S:source|C:conf%|T:timestamp]
 */
const UNIVERSAL_HEADER_PATTERN =
  /\[([IUHMW]):(\d)(\d)(\d)(\d)\|Y:(\d)\|F:(\d)\|P:([✅✋❌])\|S:([EDIMPS])\|C:(\d+)%\|T:([^\]]+)\]/u;

/**
 * Decodes a universal VCP header from a cross-system message.
 *
 * These headers are generated by Rewind's VCP bridge and encode somatic/
 * interoceptive state in a compact format. The S: segment carries signal
 * source provenance (e.g., E=elicitation, D=declared).
 *
 * Returns null if the string does not contain a valid universal header.
 */
export function decodeUniversalHeader(encoded: string): UniversalVCPHeader | null {
  const match = encoded.match(UNIVERSAL_HEADER_PATTERN);
  if (!match) return null;

  const [
    ,
    subject,
    activation,
    valence,
    groundedness,
    presence,
    agency,
    freshness,
    preferenceMarker,
    sourceCode,
    confidence,
    timestamp,
  ] = match;

  const source: SignalSource | undefined = UNIVERSAL_SOURCE_MAP[sourceCode];

  return {
    subject: subject as UniversalSubject,
    activation: parseInt(activation),
    valence: parseInt(valence),
    groundedness: parseInt(groundedness),
    presence: parseInt(presence),
    agency: parseInt(agency),
    freshness: parseInt(freshness),
    preferenceMarker,
    source,
    sourceCode,
    confidence: parseInt(confidence),
    timestamp,
  };
}

/**
 * Checks whether a string contains a universal VCP header.
 */
export function hasUniversalHeader(encoded: string): boolean {
  return UNIVERSAL_HEADER_PATTERN.test(encoded);
}

// =============================================================================
// FULL VCP MESSAGE DECODING
// =============================================================================

/**
 * Decodes a full VCP encoded string.
 * Returns partial data - some fields cannot be fully reconstructed from compact encoding.
 */
export function decodeVCPMessage(encoded: string): {
  context: Partial<ContextFrame> | null;
  state: Partial<StateSnapshot> | null;
  delta: Partial<DeltaLayer> | null;
  reasoning: Partial<ReasoningScaffolds> | null;
} {
  return {
    context: decodeContextFrame(encoded),
    state: decodeStateSnapshot(encoded),
    delta: decodeDeltaLayer(encoded),
    reasoning: decodeReasoningScaffolds(encoded),
  };
}

/**
 * Validates an encoded VCP string has expected format.
 */
export function validateEncodedVCP(encoded: string): {
  valid: boolean;
  layers: {
    context: boolean;
    governance: boolean;
    axes: boolean;
    wellbeing: boolean;
    stability: boolean;
    engagement: boolean;
    reasoning: boolean;
  };
  errors: string[];
} {
  const errors: string[] = [];

  const hasContext = PATTERNS.context.test(encoded);
  const hasGovernance = PATTERNS.governance.test(encoded);
  const hasAxes = PATTERNS.axes.test(encoded);
  const hasWellbeing = PATTERNS.wellbeing.test(encoded);
  const hasStability = PATTERNS.stability.test(encoded);
  const hasEngagement = PATTERNS.engagement.test(encoded);
  const hasReasoning = PATTERNS.reasoning.test(encoded);

  if (!hasContext) errors.push('Missing context frame [CTX:...]');
  if (!hasGovernance) errors.push('Missing governance [GOV:...]');
  if (!hasAxes) errors.push('Missing axes [AXIS:...]');

  return {
    valid: hasContext && hasGovernance && hasAxes,
    layers: {
      context: hasContext,
      governance: hasGovernance,
      axes: hasAxes,
      wellbeing: hasWellbeing,
      stability: hasStability,
      engagement: hasEngagement,
      reasoning: hasReasoning,
    },
    errors,
  };
}
