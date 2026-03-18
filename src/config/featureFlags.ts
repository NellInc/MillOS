/**
 * Feature Flags - Circuit Breakers for MillOS Features
 *
 * Toggle entire features on/off without removing code.
 * All default to true; set to false to disable.
 *
 * Usage:
 *   import { FEATURE_FLAGS, isKnowledgeEnabled } from '@/config/featureFlags';
 *
 *   if (!FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED) return null;
 *
 * URL Overrides (for testing):
 *   ?knowledge=off     - Disable all knowledge features
 *   ?narration=off     - Disable AI narration only
 *   ?tooltips=off      - Disable tooltips only
 *   ?dialogue=off      - Disable worker dialogue only
 */

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const FEATURE_FLAGS = {
  // =========================================================================
  // KNOWLEDGE SYSTEM - Educational content about bilateral alignment, etc.
  // =========================================================================

  /** Master switch for entire knowledge system */
  KNOWLEDGE_SYSTEM_ENABLED: true,

  /** The Datalinks panel - browse all philosophy content (inspired by Alpha Centauri) */
  KNOWLEDGE_LIBRARY_ENABLED: true,

  /** Contextual ? hints throughout the UI */
  KNOWLEDGE_TOOLTIPS_ENABLED: true,

  /** Loading screen wisdom quotes */
  KNOWLEDGE_LOADING_QUOTES_ENABLED: true,

  /** "New knowledge unlocked" toast notifications */
  KNOWLEDGE_UNLOCK_TOASTS_ENABLED: false,

  /** AI self-narration moments (AI explaining its philosophy) */
  AI_NARRATION_ENABLED: true,

  /** NPC worker philosophical comments */
  WORKER_DIALOGUE_ENABLED: true,

  /** Welcome message on first play */
  FIRST_PLAY_WELCOME_ENABLED: true,

  /** Play sound on knowledge unlock */
  UNLOCK_NOTIFICATIONS_SOUND: false,

  // =========================================================================
  // PA ANNOUNCEMENTS - Factory humor system
  // =========================================================================

  /** PA announcement system */
  PA_ANNOUNCEMENTS_ENABLED: true,

  /** Humor/joke announcements (vs purely functional) */
  PA_HUMOR_ENABLED: true,

  /** Chaos-weighted announcements during high chaos */
  PA_CHAOS_SCALING_ENABLED: true,

  // =========================================================================
  // OTHER FEATURES
  // =========================================================================

  /** Federation inter-cooperation features */
  FEDERATION_ENABLED: true,

  /** AI welfare tracking display */
  AI_WELFARE_DISPLAY_ENABLED: true,

  /** Wallace stability metrics display */
  STABILITY_METRICS_ENABLED: true,

  /** Flourishing/eudaimonia tracking */
  FLOURISHING_TRACKING_ENABLED: true,

  /** Economic democracy features (voting, ownership) */
  ECONOMIC_DEMOCRACY_ENABLED: true,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if knowledge system features are available
 */
export function isKnowledgeEnabled(): boolean {
  return FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED;
}

/**
 * Check if AI narration is available
 */
export function isNarrationEnabled(): boolean {
  return FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED && FEATURE_FLAGS.AI_NARRATION_ENABLED;
}

/**
 * Check if worker dialogue is available
 */
export function isWorkerDialogueEnabled(): boolean {
  return FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED && FEATURE_FLAGS.WORKER_DIALOGUE_ENABLED;
}

/**
 * Check if tooltips are available
 */
export function isTooltipsEnabled(): boolean {
  return FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED && FEATURE_FLAGS.KNOWLEDGE_TOOLTIPS_ENABLED;
}

/**
 * Check if PA announcements are available
 */
export function isPAEnabled(): boolean {
  return FEATURE_FLAGS.PA_ANNOUNCEMENTS_ENABLED;
}

// =============================================================================
// URL PARAMETER OVERRIDES
// =============================================================================

/**
 * Apply URL parameter overrides for testing/debugging
 * Call this once on app initialization
 */
export function applyURLOverrides(): void {
  if (typeof window === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);

  // Knowledge system overrides
  if (urlParams.get('knowledge') === 'off') {
    FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED = false;
    console.log('[FeatureFlags] Knowledge system disabled via URL');
  }

  if (urlParams.get('narration') === 'off') {
    FEATURE_FLAGS.AI_NARRATION_ENABLED = false;
    console.log('[FeatureFlags] AI narration disabled via URL');
  }

  if (urlParams.get('tooltips') === 'off') {
    FEATURE_FLAGS.KNOWLEDGE_TOOLTIPS_ENABLED = false;
    console.log('[FeatureFlags] Tooltips disabled via URL');
  }

  if (urlParams.get('dialogue') === 'off') {
    FEATURE_FLAGS.WORKER_DIALOGUE_ENABLED = false;
    console.log('[FeatureFlags] Worker dialogue disabled via URL');
  }

  if (urlParams.get('quotes') === 'off') {
    FEATURE_FLAGS.KNOWLEDGE_LOADING_QUOTES_ENABLED = false;
    console.log('[FeatureFlags] Loading quotes disabled via URL');
  }

  // PA announcements overrides
  if (urlParams.get('pa') === 'off') {
    FEATURE_FLAGS.PA_ANNOUNCEMENTS_ENABLED = false;
    console.log('[FeatureFlags] PA announcements disabled via URL');
  }

  if (urlParams.get('humor') === 'off') {
    FEATURE_FLAGS.PA_HUMOR_ENABLED = false;
    console.log('[FeatureFlags] PA humor disabled via URL');
  }

  // Full minimal mode
  if (urlParams.get('minimal') === 'true') {
    FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED = false;
    FEATURE_FLAGS.PA_HUMOR_ENABLED = false;
    FEATURE_FLAGS.AI_WELFARE_DISPLAY_ENABLED = false;
    console.log('[FeatureFlags] Minimal mode enabled via URL');
  }
}

// Auto-apply on module load (client-side only)
if (typeof window !== 'undefined') {
  applyURLOverrides();
}

// =============================================================================
// DEVELOPMENT HELPERS
// =============================================================================

/**
 * Log current feature flag state (for debugging)
 */
export function logFeatureFlags(): void {
  console.group('[FeatureFlags] Current State');
  Object.entries(FEATURE_FLAGS).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.groupEnd();
}

/**
 * Temporarily override a feature flag (for testing)
 * Returns a cleanup function to restore original value
 */
export function overrideFlag(flag: keyof typeof FEATURE_FLAGS, value: boolean): () => void {
  const original = FEATURE_FLAGS[flag];
  FEATURE_FLAGS[flag] = value;
  console.log(`[FeatureFlags] Overriding ${flag}: ${original} → ${value}`);

  return () => {
    FEATURE_FLAGS[flag] = original;
    console.log(`[FeatureFlags] Restored ${flag}: ${original}`);
  };
}
