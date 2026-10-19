/**
 * Adaptive Quality System
 *
 * Automatically adjusts graphics quality based on real-time FPS measurements.
 * Prevents stuttering by proactively lowering quality when performance drops.
 *
 * Features:
 * - FPS monitoring with rolling average
 * - Automatic quality downgrade on sustained low FPS
 * - Quality upgrade when performance headroom exists
 * - Configurable thresholds and hysteresis
 * - Integration with existing graphics store
 *
 * Usage:
 *   // In a component with useFrame
 *   useAdaptiveQuality();
 *
 *   // Or manual control
 *   adaptiveQualityManager.update(deltaTime);
 */

import { useGraphicsStore, GraphicsQuality } from '../stores/graphicsStore';

// Quality levels in order of performance cost (low to high)
const QUALITY_ORDER: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

/**
 * `millos-graphics` persists every quality write, so without this record an
 * automatic or recovery downgrade would come back as the next session's tier
 * and, through `userCeiling`, as a permanent cap. The record names the tier
 * such a downgrade applied and the explicit choice it displaced.
 * Working if an adaptive or 'Use low graphics' downgrade lasts only for the
 * session that needed it, while an explicit choice in Settings still persists.
 */
const SESSION_TIER_KEY = 'millos-graphics-session-tier';

interface SessionTierRecord {
  applied: GraphicsQuality;
  restoreTo: GraphicsQuality;
}

const isQuality = (value: unknown): value is GraphicsQuality =>
  QUALITY_ORDER.includes(value as GraphicsQuality);

function readSessionTier(): SessionTierRecord | null {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_TIER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionTierRecord> | null;
    return parsed && isQuality(parsed.applied) && isQuality(parsed.restoreTo)
      ? { applied: parsed.applied, restoreTo: parsed.restoreTo }
      : null;
  } catch {
    return null;
  }
}

function clearSessionTier(): void {
  try {
    globalThis.localStorage?.removeItem(SESSION_TIER_KEY);
  } catch {
    // Storage unavailable: nothing was recorded either.
  }
}

/** Records a session-only tier, keeping the first displaced choice across steps. */
function recordSessionTier(applied: GraphicsQuality, displaced: GraphicsQuality): void {
  const restoreTo = readSessionTier()?.restoreTo ?? displaced;
  if (applied === restoreTo) {
    clearSessionTier();
    return;
  }
  try {
    globalThis.localStorage?.setItem(SESSION_TIER_KEY, JSON.stringify({ applied, restoreTo }));
  } catch {
    // Without storage the downgrade cannot outlive the session anyway.
  }
}

interface AdaptiveQualityConfig {
  /** Target FPS to maintain */
  targetFps: number;
  /** FPS threshold below which to downgrade quality */
  downgradeThreshold: number;
  /** FPS threshold above which to upgrade quality (with headroom) */
  upgradeThreshold: number;
  /** Number of frames to average for FPS calculation */
  sampleSize: number;
  /** Minimum time between quality changes (ms) */
  cooldownMs: number;
  /** Sustained low-frame-rate duration required before a downgrade */
  downgradeSustainMs: number;
  /** Sustained high-frame-rate duration required before an upgrade */
  upgradeSustainMs: number;
  /** Whether adaptive quality is enabled */
  enabled: boolean;
  /** Minimum quality level (won't go below this) */
  minQuality: GraphicsQuality;
  /** Maximum quality level (won't go above this) */
  maxQuality: GraphicsQuality;
}

const DEFAULT_CONFIG: AdaptiveQualityConfig = {
  targetFps: 60,
  downgradeThreshold: 42,
  upgradeThreshold: 58,
  sampleSize: 90,
  cooldownMs: 12000,
  downgradeSustainMs: 2500,
  upgradeSustainMs: 12000,
  enabled: true,
  minQuality: 'low',
  maxQuality: 'ultra',
};

class AdaptiveQualityManager {
  private config: AdaptiveQualityConfig = { ...DEFAULT_CONFIG };
  private frameTimes: number[] = [];
  private lastChangeTime = 0;
  private lowFpsDurationMs = 0;
  private highFpsDurationMs = 0;
  private isInitialized = false;
  private isChangingQuality = false; // Prevent concurrent quality changes
  private changeGeneration = 0;
  private lastChoiceRevision: number | null = null;
  /** The last quality this manager applied; anything else was the user's choice. */
  private lastAppliedQuality: GraphicsQuality | null = null;
  /** The user's explicit choice: adaptive only restores what it took away. */
  private userCeiling: GraphicsQuality | null = null;
  /** Upgrade-sustain multiplier, doubled per downgrade so a tier that cannot hold does not oscillate. */
  private upgradeBackoff = 1;

  /**
   * Update with current frame delta time
   * Call this every frame (in useFrame or requestAnimationFrame)
   */
  update(deltaSeconds: number): void {
    if (!this.config.enabled || !this.isInitialized) return;

    // Any quality this manager did not apply (the persisted startup value, a
    // settings click, a keyboard shortcut) is the user's ceiling.
    const state = useGraphicsStore.getState();
    const current = state.graphics.quality;
    if (this.lastChoiceRevision === null) this.lastChoiceRevision = state.qualityChoiceRevision;
    else if (state.qualityChoiceRevision !== this.lastChoiceRevision) {
      this.lastChoiceRevision = state.qualityChoiceRevision;
      clearSessionTier();
      this.acceptUserChoice(current);
    }
    if (current !== this.lastAppliedQuality) {
      if (this.lastAppliedQuality !== null) this.acceptUserChoice(current);
      else {
        this.userCeiling = current;
        this.lastAppliedQuality = current;
      }
    }

    // Convert to FPS
    const fps = 1 / Math.max(deltaSeconds, 0.001);

    // Add to rolling buffer
    this.frameTimes.push(fps);
    if (this.frameTimes.length > this.config.sampleSize) {
      this.frameTimes.shift();
    }

    // Need enough samples before making decisions
    if (this.frameTimes.length < this.config.sampleSize / 2) return;

    const avgFps = this.getAverageFps();
    const now = Date.now();

    // Check cooldown
    if (now - this.lastChangeTime < this.config.cooldownMs) return;

    // Check for sustained low FPS
    if (avgFps < this.config.downgradeThreshold) {
      this.lowFpsDurationMs += deltaSeconds * 1000;
      this.highFpsDurationMs = 0;

      if (this.lowFpsDurationMs >= this.config.downgradeSustainMs) {
        this.downgradeQuality();
        this.lastChangeTime = now;
        this.lowFpsDurationMs = 0;
      }
    }
    // Check for sustained high FPS (with headroom to upgrade)
    else if (avgFps > this.config.upgradeThreshold) {
      this.highFpsDurationMs += deltaSeconds * 1000;
      this.lowFpsDurationMs = 0;

      if (this.highFpsDurationMs >= this.config.upgradeSustainMs * this.upgradeBackoff) {
        this.upgradeQuality();
        this.lastChangeTime = now;
        this.highFpsDurationMs = 0;
      }
    } else {
      // FPS is acceptable, reset counters
      this.lowFpsDurationMs = 0;
      this.highFpsDurationMs = 0;
    }
  }

  /**
   * Get the current average FPS
   */
  getAverageFps(): number {
    if (this.frameTimes.length === 0) return 60;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    return sum / this.frameTimes.length;
  }

  /**
   * Get current FPS stats for display
   */
  getStats(): { currentFps: number; avgFps: number; quality: GraphicsQuality } {
    const currentFps =
      this.frameTimes.length > 0 ? this.frameTimes[this.frameTimes.length - 1] : 60;
    return {
      currentFps: Math.round(currentFps),
      avgFps: Math.round(this.getAverageFps()),
      quality: useGraphicsStore.getState().graphics.quality,
    };
  }

  /**
   * Safely apply a quality change outside of the render loop
   * Uses requestIdleCallback to avoid WebGL context issues
   */
  private safeQualityChange(newQuality: GraphicsQuality): void {
    // Both decision paths already refuse concurrent work; no deferred queue is needed.
    if (this.isChangingQuality) return;

    this.isChangingQuality = true;
    const generation = ++this.changeGeneration;
    const { graphics, qualityChoiceRevision } = useGraphicsStore.getState();
    const sourceQuality = graphics.quality;
    const scheduleChange =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 100);

    scheduleChange(() => {
      // A cancelled callback must never release the ownership of newer work.
      if (generation !== this.changeGeneration) return;
      try {
        const state = useGraphicsStore.getState();
        if (
          !this.config.enabled ||
          state.qualityChoiceRevision !== qualityChoiceRevision ||
          state.graphics.quality !== sourceQuality
        )
          return;
        recordSessionTier(newQuality, this.userCeiling ?? sourceQuality);
        this.lastAppliedQuality = newQuality;
        state.setGraphicsQuality(newQuality, 'adaptive');
        this.frameTimes = [];
      } catch {
        // Failed to change quality, ignore
      } finally {
        if (generation === this.changeGeneration) this.isChangingQuality = false;
      }
    });
  }

  /** A real preset choice starts fresh measurement under the existing cooldown.
   * Working if same-tier clicks invalidate old decisions, while fresh sustained
   * low FPS can still adapt after the unchanged cooldown.
   */
  private acceptUserChoice(quality: GraphicsQuality): void {
    this.invalidatePendingChange();
    this.frameTimes = [];
    this.lowFpsDurationMs = 0;
    this.highFpsDurationMs = 0;
    this.userCeiling = quality;
    this.lastAppliedQuality = quality;
    this.upgradeBackoff = 1;
    this.lastChangeTime = Date.now();
  }

  /** A recovery choice caps this session only; it is not recorded as the user's tier. */
  acceptSessionChoice(quality: GraphicsQuality): void {
    this.acceptUserChoice(quality);
  }

  private invalidatePendingChange(): void {
    this.changeGeneration++;
    this.isChangingQuality = false;
  }

  /**
   * Downgrade to next lower quality level
   */
  private downgradeQuality(): boolean {
    // Don't initiate change if one is already in progress
    if (this.isChangingQuality) return false;

    const currentQuality = useGraphicsStore.getState().graphics.quality;
    const currentIndex = QUALITY_ORDER.indexOf(currentQuality);
    const minIndex = QUALITY_ORDER.indexOf(this.config.minQuality);

    if (currentIndex > minIndex) {
      const newQuality = QUALITY_ORDER[currentIndex - 1];
      this.upgradeBackoff = Math.min(this.upgradeBackoff * 2, 8);
      this.safeQualityChange(newQuality);
      return true;
    }
    return false;
  }

  /**
   * Upgrade to next higher quality level
   */
  private upgradeQuality(): boolean {
    // Don't initiate change if one is already in progress
    if (this.isChangingQuality) return false;

    const currentQuality = useGraphicsStore.getState().graphics.quality;
    const currentIndex = QUALITY_ORDER.indexOf(currentQuality);
    const maxIndex = QUALITY_ORDER.indexOf(this.config.maxQuality);
    const ceilingIndex = this.userCeiling ? QUALITY_ORDER.indexOf(this.userCeiling) : maxIndex;

    if (currentIndex < Math.min(maxIndex, ceilingIndex)) {
      const newQuality = QUALITY_ORDER[currentIndex + 1];
      this.safeQualityChange(newQuality);
      return true;
    }
    return false;
  }

  /**
   * Configure the adaptive quality system
   */
  configure(config: Partial<AdaptiveQualityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable or disable adaptive quality
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.invalidatePendingChange();
      this.frameTimes = [];
      this.lowFpsDurationMs = 0;
      this.highFpsDurationMs = 0;
    }
  }

  /**
   * Check if adaptive quality is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Initialize the manager (call once on app start)
   */
  initialize(): void {
    this.isInitialized = true;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.invalidatePendingChange();
    this.lastChoiceRevision = null;
    this.lastAppliedQuality = null;
    this.userCeiling = null;
    this.frameTimes = [];
    this.lowFpsDurationMs = 0;
    this.highFpsDurationMs = 0;
    this.lastChangeTime = 0;
    this.upgradeBackoff = 1;
  }
}

// Singleton instance
export const adaptiveQualityManager = new AdaptiveQualityManager();

/**
 * Applies a recovery tier (the loading cover's 'Use low graphics') for this
 * session only. It is the session's ceiling, so adaptive will not climb back
 * over it, but the next session starts at the visitor's own choice.
 */
export function applySessionQuality(quality: GraphicsQuality): void {
  const state = useGraphicsStore.getState();
  const current = state.graphics.quality;
  if (current === quality) return;
  recordSessionTier(quality, current);
  adaptiveQualityManager.acceptSessionChoice(quality);
  state.setGraphicsQuality(quality, 'adaptive');
}

let explicitChoiceWatcher: (() => void) | null = null;

/**
 * Call once at startup, before the scene first renders: puts back the explicit
 * choice that an automatic or recovery downgrade displaced last session, and
 * forgets the record as soon as the visitor makes a new explicit choice.
 */
export function restoreSessionScopedQuality(): void {
  explicitChoiceWatcher ??= useGraphicsStore.subscribe((next, previous) => {
    if (next.qualityChoiceRevision !== previous.qualityChoiceRevision) clearSessionTier();
  });
  const record = readSessionTier();
  if (!record) return;
  clearSessionTier();
  const state = useGraphicsStore.getState();
  // Anything other than the recorded automatic tier was chosen since; keep it.
  if (state.graphics.quality !== record.applied) return;
  state.setGraphicsQuality(record.restoreTo, 'adaptive');
}

// Export config type for external use
export type { AdaptiveQualityConfig };
