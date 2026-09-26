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
  private pendingQualityChange: GraphicsQuality | null = null;
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
    const current = useGraphicsStore.getState().graphics.quality;
    if (current !== this.lastAppliedQuality) {
      this.userCeiling = current;
      this.lastAppliedQuality = current;
      this.upgradeBackoff = 1;
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
    if (this.isChangingQuality) {
      // Queue this change for later
      this.pendingQualityChange = newQuality;
      return;
    }

    this.isChangingQuality = true;
    // Quality level is read from store when actually applied in scheduleChange callback

    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleChange =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 100);

    scheduleChange(() => {
      try {
        this.lastAppliedQuality = newQuality;
        useGraphicsStore.getState().setGraphicsQuality(newQuality);
        this.frameTimes = []; // Reset samples after change
      } catch {
        // Failed to change quality, ignore
      } finally {
        this.isChangingQuality = false;

        // Process any pending change
        if (this.pendingQualityChange !== null) {
          const pending = this.pendingQualityChange;
          this.pendingQualityChange = null;
          // Wait a bit before processing pending change
          setTimeout(() => this.safeQualityChange(pending), 1000);
        }
      }
    });
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
    this.frameTimes = [];
    this.lowFpsDurationMs = 0;
    this.highFpsDurationMs = 0;
    this.lastChangeTime = 0;
    this.upgradeBackoff = 1;
  }
}

// Singleton instance
export const adaptiveQualityManager = new AdaptiveQualityManager();

// Export config type for external use
export type { AdaptiveQualityConfig };
