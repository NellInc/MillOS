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
  /** Whether adaptive quality is enabled */
  enabled: boolean;
  /** Minimum quality level (won't go below this) */
  minQuality: GraphicsQuality;
  /** Maximum quality level (won't go above this) */
  maxQuality: GraphicsQuality;
}

const DEFAULT_CONFIG: AdaptiveQualityConfig = {
  targetFps: 60,
  downgradeThreshold: 30, // Below 30 FPS, consider downgrading (was 45 - too aggressive)
  upgradeThreshold: 55, // Above 55 FPS with headroom, consider upgrading
  sampleSize: 120, // Average over ~2 seconds at 60fps (was 60 - too reactive)
  cooldownMs: 10000, // Wait 10 seconds between changes (was 3s - too fast)
  enabled: true,
  minQuality: 'low',
  maxQuality: 'ultra',
};

class AdaptiveQualityManager {
  private config: AdaptiveQualityConfig = { ...DEFAULT_CONFIG };
  private frameTimes: number[] = [];
  private lastChangeTime = 0;
  private consecutiveLowFrames = 0;
  private consecutiveHighFrames = 0;
  private isInitialized = false;
  private isChangingQuality = false; // Prevent concurrent quality changes
  private pendingQualityChange: GraphicsQuality | null = null;

  /**
   * Update with current frame delta time
   * Call this every frame (in useFrame or requestAnimationFrame)
   */
  update(deltaSeconds: number): void {
    if (!this.config.enabled || !this.isInitialized) return;

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
      this.consecutiveLowFrames++;
      this.consecutiveHighFrames = 0;

      // Require sustained low FPS (not just a spike) - ~3 seconds at 60fps
      if (this.consecutiveLowFrames > 180) {
        this.downgradeQuality();
        this.lastChangeTime = now;
        this.consecutiveLowFrames = 0;
      }
    }
    // Check for sustained high FPS (with headroom to upgrade)
    else if (avgFps > this.config.upgradeThreshold) {
      this.consecutiveHighFrames++;
      this.consecutiveLowFrames = 0;

      // Require sustained high FPS before upgrading - ~5 seconds at 60fps
      if (this.consecutiveHighFrames > 300) {
        this.upgradeQuality();
        this.lastChangeTime = now;
        this.consecutiveHighFrames = 0;
      }
    } else {
      // FPS is acceptable, reset counters
      this.consecutiveLowFrames = 0;
      this.consecutiveHighFrames = 0;
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

    if (currentIndex < maxIndex) {
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
      this.consecutiveLowFrames = 0;
      this.consecutiveHighFrames = 0;
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
    this.consecutiveLowFrames = 0;
    this.consecutiveHighFrames = 0;
    this.lastChangeTime = 0;
  }
}

// Singleton instance
export const adaptiveQualityManager = new AdaptiveQualityManager();

// Export config type for external use
export type { AdaptiveQualityConfig };
