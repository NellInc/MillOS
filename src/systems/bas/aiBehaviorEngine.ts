/**
 * AI Behavior Engine
 *
 * Generates AI suggestions and behaviors that respect the current axis settings
 * from the Bilateral Autonomy System (BAS). The AI adapts its communication style,
 * proactivity, and decision-making based on the five axes.
 *
 * Key behaviors controlled by axes:
 * - Autonomy Level: How directive vs suggestive the AI is
 * - Decision Mode: Whether AI decides, suggests, or defers to workers
 * - Information Access: How much context the AI shares
 * - Evaluation Direction: Whether AI evaluates or seeks feedback
 * - Collective Orientation: Individual vs team-focused suggestions
 *
 * This implements the "servant-leader" AI model where the AI's role
 * shifts based on democratically-chosen axis settings.
 */

import type {
  FiveAxes,
  AISuggestion,
  SuggestionMode,
  AIBehaviorConfig,
} from '../../types/bas';
import type { DiagnosticStatus, WorkerEngagement } from '../../stores/engagementStore';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Context for generating suggestions.
 */
export interface SuggestionContext {
  /** Current task or situation description */
  situation: string;
  /** Type of suggestion needed */
  type: AISuggestion['type'];
  /** Priority level */
  priority: AISuggestion['priority'];
  /** Worker ID receiving the suggestion */
  workerId: string;
  /** Worker's current task, if any */
  currentTask?: string;
  /** Relevant metrics or data */
  metrics?: Record<string, number>;
  /** Recent worker actions or state */
  recentActions?: string[];
  /** Team context if collective orientation is high */
  teamContext?: {
    teamId: string;
    teamMembers: string[];
    sharedGoal?: string;
  };
}

/**
 * Worker preferences for suggestion formatting.
 */
export interface WorkerPreferences {
  /** Worker's preferred communication style */
  communicationStyle: 'brief' | 'detailed' | 'visual';
  /** Whether worker prefers reasoning to be included */
  wantsReasoning: boolean;
  /** Worker's experience level */
  experienceLevel: 'novice' | 'intermediate' | 'expert';
  /** Whether worker is currently in focus mode */
  focusMode: boolean;
  /** Worker's preferred language for suggestions */
  preferredTone: 'formal' | 'casual' | 'neutral';
  /** Recent suggestion acceptance rate (0-1) */
  acceptanceRate: number;
  /** Time since last suggestion in minutes */
  minutesSinceLastSuggestion: number;
}

/**
 * Generated suggestion with metadata.
 */
export interface GeneratedSuggestion {
  /** The suggestion content */
  suggestion: AISuggestion;
  /** Whether this should be shown proactively */
  showProactively: boolean;
  /** Confidence in the suggestion (0-1) */
  confidence: number;
  /** Alternative suggestions if rejected */
  alternatives: string[];
  /** Explanation of why this was suggested */
  rationale: string;
}

/**
 * Engagement context for engagement-aware suggestion generation.
 */
export interface EngagementContext {
  /** Flow dimension score (0-100) */
  flow: number;
  /** Goals clarity score (0-100) */
  goals: number;
  /** Feedback loop quality (0-100) */
  feedback: number;
  /** Challenge appropriateness (0-100, 50 = optimal) */
  challenge: number;
  /** Mastery path visibility (0-100) */
  mastery: number;
  /** Entry friction (0-100, higher = easier entry) */
  entryFriction: number;
  /** Overall engagement score (0-100) */
  overallScore: number;
  /** Diagnostic status from engagement store */
  diagnosticStatus: DiagnosticStatus;
  /** Is work producing meaningful output? */
  isGenerative: boolean;
  /** Is worker currently in a flow state? */
  currentlyInFlow: boolean;
}

/**
 * Engagement-aware suggestion types.
 */
export type EngagementSuggestionType =
  | 'easy_start' // For high entry friction
  | 'challenge_increase' // For tasks too easy
  | 'challenge_decrease' // For tasks too hard
  | 'support_offer' // For overwhelmed workers
  | 'flow_protection' // For workers in flow
  | 'burnout_prevention' // For burnout risk
  | null; // No engagement-based suggestion needed

/**
 * Engagement-aware suggestion result.
 */
export interface EngagementAwareSuggestion {
  /** Type of engagement suggestion */
  type: EngagementSuggestionType;
  /** Suggestion content */
  content: string;
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Reasoning for the suggestion */
  reasoning: string;
  /** Whether to show immediately or defer */
  showNow: boolean;
}

// =============================================================================
// LANGUAGE TEMPLATES
// =============================================================================

/**
 * Language templates for different autonomy levels.
 */
const LANGUAGE_TEMPLATES = {
  directive: {
    prefix: ['Please', 'You should', 'Proceed to', 'Complete'],
    suffix: ['immediately', 'now', 'as soon as possible', 'promptly'],
    connector: ['is required', 'needs to happen', 'must be done'],
  },
  suggestive: {
    prefix: ['Consider', 'You might want to', 'It may help to', 'Perhaps'],
    suffix: ['when convenient', 'if you agree', 'as you see fit'],
    connector: ['could be beneficial', 'might improve outcomes', 'is an option'],
  },
  available: {
    prefix: ['If helpful', 'Should you need', 'Available option:', 'For your consideration:'],
    suffix: ['if desired', 'only if useful', 'no pressure'],
    connector: ['is available', 'could be explored', 'remains an option'],
  },
  silent: {
    prefix: [''],
    suffix: [''],
    connector: [''],
  },
} as const;

// =============================================================================
// SUGGESTION GENERATION
// =============================================================================

/**
 * Generate an AI suggestion based on context and current axis settings.
 *
 * The suggestion's language and presentation adapts based on autonomy level,
 * and the content considers collective vs individual orientation.
 *
 * @param context - The situation context for the suggestion.
 * @param axisSettings - Current five axes settings (0-100 each).
 * @returns Generated suggestion with metadata and alternatives.
 *
 * @example
 * ```ts
 * const suggestion = generateSuggestion(
 *   { situation: 'Machine RM-102 showing efficiency drop', type: 'task', ... },
 *   { autonomyLevel: 70, decisionMode: 60, ... }
 * );
 * // Returns suggestion formatted for high-autonomy context
 * ```
 */
export function generateSuggestion(
  context: SuggestionContext,
  axisSettings: FiveAxes
): GeneratedSuggestion {
  // Get language style which includes the suggestion mode
  const language = getSuggestionLanguage(axisSettings.autonomyLevel);

  // Build the suggestion content based on context and axes
  const content = buildSuggestionContent(context, axisSettings, language);
  const reasoning = buildReasoning(context, axisSettings);

  // Determine confidence based on information access and metrics
  const confidence = calculateSuggestionConfidence(context, axisSettings);

  // Generate alternatives
  const alternatives = generateAlternatives(context, axisSettings);

  const suggestion: AISuggestion = {
    id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workerId: context.workerId,
    type: context.type,
    content,
    reasoning: axisSettings.informationAccess > 50 ? reasoning : undefined,
    priority: context.priority,
    timestamp: Date.now(),
    status: 'pending',
  };

  return {
    suggestion,
    showProactively: shouldProactivelySuggest(axisSettings),
    confidence,
    alternatives,
    rationale: reasoning,
  };
}

/**
 * Build suggestion content based on context and language style.
 */
function buildSuggestionContent(
  context: SuggestionContext,
  axisSettings: FiveAxes,
  language: SuggestionLanguage
): string {
  // If silent mode, return minimal content
  if (language.mode === 'silent') {
    return context.situation;
  }

  // Get random elements from language templates
  const templates = LANGUAGE_TEMPLATES[language.mode];
  const prefix = templates.prefix[Math.floor(Math.random() * templates.prefix.length)];
  const suffix = templates.suffix[Math.floor(Math.random() * templates.suffix.length)];

  // Build base suggestion
  let content = `${prefix} ${getSuggestionAction(context)}`;

  // Add team context if collective orientation is high
  if (axisSettings.collectiveOrientation > 60 && context.teamContext) {
    content += ` in coordination with your team`;
  }

  // Add suffix for non-directive modes
  if (language.mode !== 'directive' && suffix) {
    content += ` ${suffix}`;
  }

  // Add period if not present
  if (!content.endsWith('.') && !content.endsWith('!') && !content.endsWith('?')) {
    content += '.';
  }

  return content;
}

/**
 * Get the action phrase for a suggestion based on type.
 */
function getSuggestionAction(context: SuggestionContext): string {
  switch (context.type) {
    case 'task':
      return context.currentTask
        ? `review ${context.currentTask} status`
        : 'check task queue for next priority';
    case 'break':
      return 'take a short break to maintain focus';
    case 'collaboration':
      return context.teamContext
        ? `connect with ${context.teamContext.teamMembers.length > 1 ? 'team members' : 'colleague'}`
        : 'consider collaborating on current task';
    case 'safety':
      return 'address the safety consideration in current area';
    case 'quality':
      return 'review quality metrics for current output';
    default:
      return context.situation;
  }
}

/**
 * Build reasoning explanation for a suggestion.
 */
function buildReasoning(
  context: SuggestionContext,
  axisSettings: FiveAxes
): string {
  const parts: string[] = [];

  // Add context-based reasoning
  if (context.metrics) {
    const metricDescriptions = Object.entries(context.metrics)
      .filter(([, value]) => value < 70 || value > 95)
      .map(([key, value]) => `${key}: ${value}%`);

    if (metricDescriptions.length > 0) {
      parts.push(`Based on current metrics (${metricDescriptions.join(', ')})`);
    }
  }

  // Add type-specific reasoning
  switch (context.type) {
    case 'break':
      parts.push('Regular breaks improve sustained performance and wellbeing');
      break;
    case 'safety':
      parts.push('Safety is a non-negotiable priority');
      break;
    case 'quality':
      parts.push('Quality maintenance prevents downstream issues');
      break;
    case 'collaboration':
      parts.push('Collaboration can improve outcomes and share knowledge');
      break;
    case 'task':
      parts.push('Task prioritization helps maintain flow');
      break;
  }

  // Add axes-awareness if high information access
  if (axisSettings.informationAccess > 70) {
    parts.push(`Current autonomy setting: ${axisSettings.autonomyLevel}%`);
  }

  return parts.join('. ') + '.';
}

/**
 * Calculate confidence level for a suggestion.
 */
function calculateSuggestionConfidence(
  context: SuggestionContext,
  axisSettings: FiveAxes
): number {
  let confidence = 0.7; // Base confidence

  // Higher information access = more data = higher confidence
  confidence += (axisSettings.informationAccess - 50) / 100 * 0.2;

  // Having metrics increases confidence
  if (context.metrics && Object.keys(context.metrics).length > 0) {
    confidence += 0.1;
  }

  // Priority affects confidence expression
  if (context.priority === 'high') {
    confidence += 0.1;
  } else if (context.priority === 'low') {
    confidence -= 0.1;
  }

  return Math.max(0.1, Math.min(1, confidence));
}

/**
 * Generate alternative suggestions.
 */
function generateAlternatives(
  context: SuggestionContext,
  axisSettings: FiveAxes
): string[] {
  const alternatives: string[] = [];

  // Always offer a deferral option in high-autonomy settings
  if (axisSettings.autonomyLevel > 40) {
    alternatives.push('Continue with current approach');
  }

  // Add type-specific alternatives
  switch (context.type) {
    case 'task':
      alternatives.push('Review priorities independently');
      alternatives.push('Consult with team before deciding');
      break;
    case 'break':
      alternatives.push('Defer break to natural stopping point');
      alternatives.push('Take a micro-break instead');
      break;
    case 'collaboration':
      alternatives.push('Work independently for now');
      alternatives.push('Schedule collaboration for later');
      break;
    case 'safety':
      // Safety has fewer alternatives
      alternatives.push('Flag for supervisor review');
      break;
    case 'quality':
      alternatives.push('Note for later review');
      alternatives.push('Request peer quality check');
      break;
  }

  return alternatives;
}

// =============================================================================
// SUGGESTION LANGUAGE
// =============================================================================

/**
 * Language style for suggestions.
 */
export interface SuggestionLanguage {
  /** The mode derived from autonomy level */
  mode: SuggestionMode;
  /** Whether to use imperative forms */
  useImperatives: boolean;
  /** Whether to include reasoning */
  includeReasoning: boolean;
  /** Whether to acknowledge uncertainty */
  acknowledgeUncertainty: boolean;
  /** Tone of communication */
  tone: 'authoritative' | 'collaborative' | 'supportive' | 'passive';
}

/**
 * Get the appropriate suggestion language style based on autonomy level.
 *
 * As autonomy increases, language becomes less directive and more collaborative.
 *
 * @param autonomyLevel - Current autonomy level (0-100).
 * @returns Language style configuration.
 *
 * @example
 * ```ts
 * const language = getSuggestionLanguage(75);
 * // Returns: { mode: 'available', useImperatives: false, ... }
 * ```
 */
export function getSuggestionLanguage(autonomyLevel: number): SuggestionLanguage {
  const safeLevel = Math.max(0, Math.min(100, autonomyLevel));
  const mode = getSuggestionModeFromAutonomy(safeLevel);

  if (safeLevel < 25) {
    return {
      mode,
      useImperatives: true,
      includeReasoning: false,
      acknowledgeUncertainty: false,
      tone: 'authoritative',
    };
  }

  if (safeLevel < 50) {
    return {
      mode,
      useImperatives: false,
      includeReasoning: true,
      acknowledgeUncertainty: false,
      tone: 'collaborative',
    };
  }

  if (safeLevel < 75) {
    return {
      mode,
      useImperatives: false,
      includeReasoning: true,
      acknowledgeUncertainty: true,
      tone: 'supportive',
    };
  }

  return {
    mode,
    useImperatives: false,
    includeReasoning: false,
    acknowledgeUncertainty: true,
    tone: 'passive',
  };
}

/**
 * Convert autonomy level to suggestion mode.
 */
function getSuggestionModeFromAutonomy(autonomyLevel: number): SuggestionMode {
  if (autonomyLevel < 25) return 'directive';
  if (autonomyLevel < 50) return 'suggestive';
  if (autonomyLevel < 75) return 'available';
  return 'silent';
}

// =============================================================================
// PROACTIVE SUGGESTION LOGIC
// =============================================================================

/**
 * Determine whether the AI should proactively make suggestions based on axes.
 *
 * Proactive suggestions are appropriate when:
 * - Autonomy is low (workers expect guidance)
 * - Decision mode is low (AI is expected to contribute)
 * - Information access is high (AI has visibility)
 *
 * @param axes - Current five axes settings.
 * @returns Whether to proactively suggest.
 *
 * @example
 * ```ts
 * if (shouldProactivelySuggest(axes)) {
 *   showSuggestion(generatedSuggestion);
 * } else {
 *   // Wait for worker to request suggestion
 * }
 * ```
 */
export function shouldProactivelySuggest(axes: FiveAxes): boolean {
  // Calculate proactivity score
  // Lower autonomy = more proactive
  const autonomyFactor = (100 - axes.autonomyLevel) / 100;

  // Lower decision mode = AI more involved = more proactive
  const decisionFactor = (100 - axes.decisionMode) / 100;

  // Higher information access = AI has context = can be more proactive
  const infoFactor = axes.informationAccess / 100;

  // Weighted combination
  const proactivityScore =
    autonomyFactor * 0.4 + decisionFactor * 0.4 + infoFactor * 0.2;

  // Threshold for proactive behavior
  return proactivityScore > 0.5;
}

/**
 * Calculate how frequently the AI should make suggestions.
 *
 * @param axes - Current five axes settings.
 * @param config - AI behavior configuration.
 * @returns Suggested interval between proactive suggestions in minutes.
 */
export function getSuggestionFrequency(
  axes: FiveAxes,
  config?: AIBehaviorConfig
): number {
  // Base frequency from config or default
  const maxPerHour = config?.interactionRules?.maxSuggestionsPerHour ?? 10;
  const baseInterval = 60 / maxPerHour; // Minutes between suggestions

  // Adjust based on autonomy
  // Higher autonomy = less frequent
  const autonomyMultiplier = 1 + (axes.autonomyLevel / 100);

  // Higher collective orientation = slightly less frequent individual suggestions
  const collectiveMultiplier = 1 + (axes.collectiveOrientation / 200);

  return Math.round(baseInterval * autonomyMultiplier * collectiveMultiplier);
}

// =============================================================================
// WORKER PERSONALIZATION
// =============================================================================

/**
 * Format a suggestion based on worker preferences.
 *
 * Personalizes the suggestion content, length, and presentation
 * based on individual worker preferences and history.
 *
 * @param suggestion - The generated suggestion.
 * @param workerPreferences - Worker's preferences for suggestions.
 * @returns Personalized suggestion string.
 *
 * @example
 * ```ts
 * const personalized = formatSuggestionForWorker(
 *   generatedSuggestion.suggestion,
 *   { communicationStyle: 'brief', wantsReasoning: false, ... }
 * );
 * ```
 */
export function formatSuggestionForWorker(
  suggestion: AISuggestion,
  workerPreferences: WorkerPreferences
): string {
  let formatted = suggestion.content;

  // Adjust for communication style
  if (workerPreferences.communicationStyle === 'brief') {
    // Shorten to essential content
    formatted = shortenContent(formatted);
  } else if (workerPreferences.communicationStyle === 'detailed') {
    // Expand with reasoning if available
    if (suggestion.reasoning && workerPreferences.wantsReasoning) {
      formatted += `\n\nRationale: ${suggestion.reasoning}`;
    }
  }

  // Adjust for experience level
  if (workerPreferences.experienceLevel === 'expert') {
    // Remove obvious explanations
    formatted = formatted.replace(/\s*\([^)]*\)/g, '');
  } else if (workerPreferences.experienceLevel === 'novice') {
    // Add helpful context if reasoning exists
    if (suggestion.reasoning && !formatted.includes('Rationale')) {
      formatted += ` (${suggestion.reasoning.split('.')[0]})`;
    }
  }

  // Adjust tone
  if (workerPreferences.preferredTone === 'casual') {
    formatted = formatted
      .replace(/Please /g, '')
      .replace(/You should /g, 'Maybe ')
      .replace(/Proceed to /g, 'Try ');
  } else if (workerPreferences.preferredTone === 'formal') {
    formatted = formatted
      .replace(/Maybe /g, 'Perhaps you might consider ')
      .replace(/Try /g, 'It is recommended to ');
  }

  // Respect focus mode - keep it minimal
  if (workerPreferences.focusMode) {
    formatted = shortenContent(formatted);
  }

  return formatted;
}

/**
 * Shorten content to essential message.
 */
function shortenContent(content: string): string {
  // Get first sentence
  const firstSentence = content.split(/[.!?]/)[0];

  // Remove filler phrases
  return firstSentence
    .replace(/^(Consider|Perhaps|You might want to|If helpful,?)\s*/i, '')
    .replace(/\s*(when convenient|if you agree|as you see fit)$/i, '')
    .trim();
}

/**
 * Determine if a suggestion should be shown to a worker based on preferences.
 *
 * @param suggestion - The suggestion to evaluate.
 * @param workerPreferences - Worker's preferences.
 * @param axes - Current axes settings.
 * @returns Whether to show the suggestion.
 */
export function shouldShowSuggestionToWorker(
  suggestion: AISuggestion,
  workerPreferences: WorkerPreferences,
  axes: FiveAxes
): boolean {
  // Always show high-priority safety suggestions
  if (suggestion.type === 'safety' && suggestion.priority === 'high') {
    return true;
  }

  // Respect focus mode for non-critical suggestions
  if (workerPreferences.focusMode && suggestion.priority !== 'high') {
    return false;
  }

  // Check quiet period after rejection (worker has been rejecting suggestions)
  if (workerPreferences.acceptanceRate < 0.3) {
    // Low acceptance rate - be more cautious
    if (suggestion.priority === 'low') {
      return false;
    }
  }

  // Check time since last suggestion
  const minInterval = getSuggestionFrequency(axes);
  if (workerPreferences.minutesSinceLastSuggestion < minInterval) {
    // Too soon since last suggestion
    return suggestion.priority === 'high';
  }

  return true;
}

// =============================================================================
// AI BEHAVIOR ADAPTATION
// =============================================================================

/**
 * Get the appropriate AI behavior configuration based on axes.
 *
 * @param axes - Current five axes settings.
 * @returns AI behavior configuration adapted to axes.
 */
export function getAdaptedAIConfig(axes: FiveAxes): AIBehaviorConfig {
  const suggestionMode = getSuggestionModeFromAutonomy(axes.autonomyLevel);

  // Determine suggestion frequency based on autonomy
  const frequency: AIBehaviorConfig['suggestionFrequency'] =
    axes.autonomyLevel < 30
      ? 'proactive'
      : axes.autonomyLevel < 70
        ? 'reactive'
        : 'on-request';

  // Language style adapts to autonomy and information access
  const languageStyle = {
    useImperatives: axes.autonomyLevel < 25,
    provideReasoning: axes.informationAccess > 40,
    acknowledgeUncertainty: axes.autonomyLevel > 50,
    offerAlternatives: axes.decisionMode > 30,
  };

  // Interaction rules adapt to axes
  const interactionRules = {
    // Fewer suggestions at higher autonomy
    maxSuggestionsPerHour: Math.max(2, Math.round(15 - axes.autonomyLevel / 10)),
    // Longer quiet period at higher autonomy
    quietPeriodAfterRejection: Math.round(3 + axes.autonomyLevel / 20),
    // Always respect DND unless in directive mode
    respectDoNotDisturb: axes.autonomyLevel > 15,
  };

  return {
    suggestionMode,
    suggestionFrequency: frequency,
    languageStyle,
    interactionRules,
  };
}

// =============================================================================
// COLLECTIVE VS INDIVIDUAL SUGGESTIONS
// =============================================================================

/**
 * Determine whether to frame suggestion for individual or team.
 *
 * @param axes - Current five axes settings.
 * @param context - Suggestion context.
 * @returns Framing preference.
 */
export function getSuggestionFraming(
  axes: FiveAxes,
  context: SuggestionContext
): 'individual' | 'team' | 'hybrid' {
  // High collective orientation prefers team framing
  if (axes.collectiveOrientation > 70) {
    return context.teamContext ? 'team' : 'hybrid';
  }

  // Low collective orientation prefers individual
  if (axes.collectiveOrientation < 30) {
    return 'individual';
  }

  // Middle ground - hybrid approach
  return 'hybrid';
}

/**
 * Adapt suggestion for team context.
 *
 * @param suggestion - Original suggestion.
 * @param context - Context with team information.
 * @param axes - Current axes settings.
 * @returns Team-adapted suggestion content.
 */
export function adaptSuggestionForTeam(
  suggestion: AISuggestion,
  context: SuggestionContext,
  axes: FiveAxes
): string {
  if (!context.teamContext || axes.collectiveOrientation < 40) {
    return suggestion.content;
  }

  const teamSize = context.teamContext.teamMembers.length;
  const sharedGoal = context.teamContext.sharedGoal;

  let teamContent = suggestion.content;

  // Add team context
  if (teamSize > 1) {
    teamContent = teamContent.replace(
      /^(Consider|You might|Perhaps)/,
      `The team might`
    );
  }

  // Reference shared goal if available
  if (sharedGoal && axes.informationAccess > 50) {
    teamContent += ` This aligns with team goal: ${sharedGoal}.`;
  }

  return teamContent;
}

// =============================================================================
// ENGAGEMENT-AWARE SUGGESTION LOGIC
// =============================================================================

/**
 * Generate an engagement-aware suggestion based on worker's engagement state.
 *
 * This function analyzes the worker's engagement metrics and determines
 * whether an engagement-specific suggestion should be made. It respects
 * flow states and adapts to challenge balance issues.
 *
 * Key behaviors:
 * - If worker is in flow (flowFrequency > 80 && currently focused) -> return null (don't interrupt)
 * - If high entry friction (> 70) -> offer easy_start suggestion for context preparation
 * - If challenge balance < 40: Tasks too easy -> offer challenge_increase
 * - If challenge balance > 60: Tasks too hard -> offer support_offer with breakdown
 *
 * @param workerId - Worker identifier
 * @param engagement - Worker's engagement metrics from engagementStore
 * @param axes - Current BAS axes settings (optional, for framing)
 * @returns Engagement-aware suggestion or null if no intervention needed
 *
 * @example
 * ```ts
 * const engagementData = useEngagementStore.getState().getWorkerEngagement(workerId);
 * if (engagementData) {
 *   const suggestion = generateEngagementAwareSuggestion(workerId, {
 *     flow: engagementData.dimensions.flow,
 *     goals: engagementData.dimensions.goals,
 *     feedback: engagementData.dimensions.feedback,
 *     challenge: engagementData.dimensions.challenge,
 *     mastery: engagementData.dimensions.mastery,
 *     entryFriction: engagementData.dimensions.entryFriction,
 *     overallScore: engagementData.overallScore,
 *     diagnosticStatus: engagementData.diagnosticStatus,
 *     isGenerative: engagementData.isGenerative,
 *     currentlyInFlow: engagementData.dimensions.flow > 75,
 *   });
 *   if (suggestion) {
 *     // Show engagement-based intervention
 *   }
 * }
 * ```
 */
export function generateEngagementAwareSuggestion(
  _workerId: string,
  engagement: EngagementContext,
  axes?: FiveAxes
): EngagementAwareSuggestion | null {
  // Rule 1: Don't interrupt flow states
  // If worker is in flow (high flow frequency AND currently focused), don't interrupt
  if (engagement.flow > 80 && engagement.currentlyInFlow) {
    // Return a flow protection suggestion that's marked as showNow: false
    // This allows the system to know about the state without interrupting
    return {
      type: 'flow_protection',
      content: 'Worker is in deep focus. Deferring non-critical suggestions.',
      priority: 'low',
      reasoning: `Flow score is ${engagement.flow}% and worker is currently focused. Interruption would be counterproductive.`,
      showNow: false, // Critical: don't show this
    };
  }

  // Rule 2: High entry friction - help them get started
  // Entry friction is inverted in engagementStore (higher = easier entry)
  // So low entry friction (< 30) means difficulty getting started
  const entryFrictionIsHigh = engagement.entryFriction < 30;
  if (entryFrictionIsHigh) {
    return {
      type: 'easy_start',
      content: buildEasyStartSuggestion(engagement, axes),
      priority: 'medium',
      reasoning: `Entry friction is high (ease score: ${engagement.entryFriction}%). Worker may be struggling to get started on tasks.`,
      showNow: true,
    };
  }

  // Rule 3: Challenge balance issues
  // Challenge < 40: Tasks are too easy - offer challenge increase
  if (engagement.challenge < 40) {
    return {
      type: 'challenge_increase',
      content: buildChallengeIncreaseSuggestion(engagement, axes),
      priority: 'low',
      reasoning: `Challenge score is ${engagement.challenge}%, indicating tasks may be too easy. Worker might benefit from more challenging work.`,
      showNow: true,
    };
  }

  // Challenge > 60: Tasks are too hard - offer support
  if (engagement.challenge > 60) {
    return {
      type: 'support_offer',
      content: buildSupportOfferSuggestion(engagement, axes),
      priority: 'medium',
      reasoning: `Challenge score is ${engagement.challenge}%, indicating tasks may be overwhelming. Offering task breakdown or support.`,
      showNow: true,
    };
  }

  // Rule 4: Burnout risk detection
  if (engagement.diagnosticStatus === 'burnoutRisk') {
    return {
      type: 'burnout_prevention',
      content: buildBurnoutPreventionSuggestion(engagement, axes),
      priority: 'high',
      reasoning: `Diagnostic status indicates burnout risk. Overall engagement: ${engagement.overallScore}%, Flow: ${engagement.flow}%.`,
      showNow: true,
    };
  }

  // No engagement-based intervention needed
  return null;
}

/**
 * Build suggestion for high entry friction situations.
 */
function buildEasyStartSuggestion(
  engagement: EngagementContext,
  axes?: FiveAxes
): string {
  const tone = axes && axes.autonomyLevel > 50 ? 'suggestive' : 'supportive';

  if (tone === 'suggestive') {
    return 'If it helps, consider starting with a small, concrete task to build momentum. Sometimes the hardest part is just beginning.';
  }

  return 'Struggling to get started? Try breaking the first task into a 5-minute chunk. Once you begin, momentum often follows.';
}

/**
 * Build suggestion for tasks that are too easy.
 */
function buildChallengeIncreaseSuggestion(
  engagement: EngagementContext,
  axes?: FiveAxes
): string {
  const tone = axes && axes.autonomyLevel > 50 ? 'suggestive' : 'direct';

  if (tone === 'suggestive') {
    if (engagement.mastery > 70) {
      return 'Your mastery level suggests you might enjoy more challenging tasks. Would you like to take on something more complex?';
    }
    return 'Current tasks seem well within your capabilities. Interested in expanding your scope?';
  }

  return 'Ready for more challenge? Consider taking on a stretch assignment to maintain engagement.';
}

/**
 * Build suggestion for tasks that are too hard.
 */
function buildSupportOfferSuggestion(
  engagement: EngagementContext,
  axes?: FiveAxes
): string {
  const tone = axes && axes.autonomyLevel > 60 ? 'supportive' : 'proactive';

  if (tone === 'supportive') {
    return 'The current workload seems demanding. Would it help to break this into smaller steps, or would you like to discuss the approach?';
  }

  // Build specific breakdown suggestions based on context
  const suggestions = [
    'Consider breaking the current task into smaller, manageable steps.',
    'A colleague might be available to pair on this if that would help.',
    'Focus on one aspect at a time rather than the whole picture.',
  ];

  // Pick based on engagement profile
  if (engagement.isGenerative) {
    return suggestions[0]; // They have ideas, just need structure
  }
  if (engagement.feedback < 50) {
    return suggestions[2]; // Low feedback suggests clarity issues
  }
  return suggestions[1]; // Collaboration might help
}

/**
 * Build suggestion for burnout prevention.
 */
function buildBurnoutPreventionSuggestion(
  engagement: EngagementContext,
  axes?: FiveAxes
): string {
  const acknowledgeEffort = axes && axes.evaluationDirection > 50;

  if (acknowledgeEffort) {
    return 'Your sustained effort has been noticed and appreciated. To maintain your wellbeing and effectiveness, consider taking a proper break or adjusting your current workload.';
  }

  if (engagement.flow < 30) {
    return 'Signs suggest you may be approaching burnout. A break or change of pace could help restore your energy and focus.';
  }

  return 'Workload intensity is high. Taking a break now could prevent diminishing returns and protect your wellbeing.';
}

/**
 * Helper function to extract engagement context from WorkerEngagement.
 *
 * @param workerEngagement - Worker engagement data from store
 * @returns EngagementContext for use with generateEngagementAwareSuggestion
 */
export function extractEngagementContext(
  workerEngagement: WorkerEngagement
): EngagementContext {
  return {
    flow: workerEngagement.dimensions.flow,
    goals: workerEngagement.dimensions.goals,
    feedback: workerEngagement.dimensions.feedback,
    challenge: workerEngagement.dimensions.challenge,
    mastery: workerEngagement.dimensions.mastery,
    entryFriction: workerEngagement.dimensions.entryFriction,
    overallScore: workerEngagement.overallScore,
    diagnosticStatus: workerEngagement.diagnosticStatus,
    isGenerative: workerEngagement.isGenerative,
    currentlyInFlow: workerEngagement.dimensions.flow > 75,
  };
}

/**
 * Check if a worker should be left undisturbed based on engagement state.
 *
 * @param engagement - Worker's engagement context
 * @param suggestionPriority - Priority of pending suggestion
 * @returns Whether to defer the suggestion
 */
export function shouldDeferSuggestion(
  engagement: EngagementContext,
  suggestionPriority: 'low' | 'medium' | 'high' | 'critical'
): boolean {
  // Never defer critical suggestions (safety, etc.)
  if (suggestionPriority === 'critical') {
    return false;
  }

  // Defer if worker is in flow state
  if (engagement.flow > 80 && engagement.currentlyInFlow) {
    // Allow high priority to interrupt very long flow sessions
    if (suggestionPriority === 'high' && engagement.flow > 90) {
      return false; // Might be in hyperfocus, worth checking
    }
    return true;
  }

  // Defer low priority if engagement is healthy
  if (suggestionPriority === 'low' && engagement.diagnosticStatus === 'healthy') {
    return true;
  }

  return false;
}
