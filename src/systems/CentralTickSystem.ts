/**
 * CentralTickSystem - Single Source of Truth for All Game Ticks
 *
 * ARCHITECTURE PRINCIPLES:
 * 1. ONE tick loop, not scattered setIntervals
 * 2. Deterministic updates - no Math.random() in hot paths
 * 3. Batched store updates - minimize React re-renders
 * 4. Priority-based execution - critical systems first
 * 5. CPU-efficient - we're CPU bound, not GPU bound
 * 6. LAZY EXECUTION - spread work across frames to avoid spikes
 *
 * USAGE:
 * - Register callbacks with centralTick.register(id, callback, priority)
 * - Unregister with centralTick.unregister(id)
 * - System runs automatically via useFrame in CentralTickProvider
 *
 * LAZY MODE:
 * - Critical callbacks (priority < 10) run immediately
 * - Normal callbacks are queued and processed 1-2 per frame
 * - This spreads CPU load across multiple frames instead of spiking
 *
 * DETERMINISTIC VARIANCE:
 * Instead of Math.random(), use deterministicVariance(seed, time) which
 * produces consistent pseudo-random values based on seed + time.
 */

// Deterministic pseudo-random based on seed - no Math.random()!
// Uses simple hash function for consistent results
export function deterministicVariance(seed: number, time: number, amplitude: number = 1): number {
  const x = Math.sin(seed * 12.9898 + time * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 * amplitude - amplitude; // Returns -amplitude to +amplitude
}

// Deterministic 0-1 value based on seed
export function deterministicValue(seed: number, time: number): number {
  const x = Math.sin(seed * 12.9898 + time * 78.233) * 43758.5453;
  return x - Math.floor(x); // Returns 0 to 1
}

// Generate stable seed from string ID
export function idToSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export interface TickContext {
  deltaSeconds: number; // Real time since last tick
  gameTime: number; // Current game time (0-24)
  gameSpeed: number; // Game speed multiplier
  elapsedTime: number; // Total elapsed real time
  tickCount: number; // Total ticks since start
}

export type TickCallback = (ctx: TickContext) => void;

interface RegisteredCallback {
  id: string;
  callback: TickCallback;
  priority: number; // Lower = runs first
  enabled: boolean;
}

// Tick priorities - lower numbers run first
export const TICK_PRIORITY = {
  CRITICAL: 0, // Time advancement, core game state
  HIGH: 10, // Machine status, production metrics
  NORMAL: 50, // Worker updates, AI decisions
  LOW: 100, // Ambient effects, non-critical updates
  BACKGROUND: 200, // Analytics, history recording
} as const;

class CentralTickSystemImpl {
  private callbacks: Map<string, RegisteredCallback> = new Map();
  private sortedCallbacks: RegisteredCallback[] = [];
  private needsSort = false;

  // Timing
  private lastTickTime = 0;
  private tickInterval = 0.5; // seconds - 0.5s gives ~1.5 game-min jumps at gameSpeed=180
  private tickCount = 0;
  private elapsedTime = 0;

  // State
  private isPaused = false;

  // Batching
  private pendingUpdates: Array<() => void> = [];

  // LAZY EXECUTION - spread non-critical work across frames
  private lazyQueue: Array<{ callback: RegisteredCallback; ctx: TickContext }> = [];
  private lazyItemsPerFrame = 1; // Process 1 callback per frame for smoothest distribution
  private lazyEnabled = true; // Can disable for testing

  /**
   * Register a tick callback
   * @param id Unique identifier for this callback
   * @param callback Function to call each tick
   * @param priority Lower = runs first (use TICK_PRIORITY constants)
   */
  register(id: string, callback: TickCallback, priority: number = TICK_PRIORITY.NORMAL): void {
    if (this.callbacks.has(id)) {
      console.warn(`[CentralTick] Callback '${id}' already registered, replacing`);
    }

    this.callbacks.set(id, {
      id,
      callback,
      priority,
      enabled: true,
    });
    this.needsSort = true;
  }

  /**
   * Unregister a tick callback
   */
  unregister(id: string): void {
    this.callbacks.delete(id);
    // Purge any already-queued lazy items so an unregistered callback cannot
    // fire one more time from the lazy queue on the next frame.
    this.lazyQueue = this.lazyQueue.filter((q) => q.callback.id !== id);
    this.needsSort = true;
  }

  /**
   * Enable/disable a callback without removing it
   */
  setEnabled(id: string, enabled: boolean): void {
    const cb = this.callbacks.get(id);
    if (cb) {
      cb.enabled = enabled;
    }
  }

  /**
   * Set tick interval in seconds
   */
  setInterval(seconds: number): void {
    this.tickInterval = Math.max(0.1, seconds);
  }

  /**
   * Pause/resume ticking
   */
  setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  /**
   * Queue a store update to be batched
   * Call this instead of direct store.set() in tick callbacks
   */
  queueUpdate(updateFn: () => void): void {
    this.pendingUpdates.push(updateFn);
  }

  /**
   * Enable/disable lazy execution
   */
  setLazyEnabled(enabled: boolean): void {
    this.lazyEnabled = enabled;
  }

  /**
   * Set how many lazy callbacks to process per frame
   */
  setLazyItemsPerFrame(count: number): void {
    this.lazyItemsPerFrame = Math.max(1, count);
  }

  /**
   * Main tick function - called from useFrame
   * @param currentTime Current elapsed time from Three.js clock
   * @param gameTime Current game time from store
   * @param gameSpeed Current game speed from store
   * @returns true if a tick was executed
   */
  tick(currentTime: number, gameTime: number, gameSpeed: number): boolean {
    if (this.isPaused) return false;

    // Check if enough time has passed
    const deltaTime = currentTime - this.lastTickTime;
    if (deltaTime < this.tickInterval) {
      return false;
    }

    this.lastTickTime = currentTime;
    this.tickCount++;
    this.elapsedTime = currentTime;

    // Sort callbacks if needed
    if (this.needsSort) {
      this.sortedCallbacks = Array.from(this.callbacks.values()).sort(
        (a, b) => a.priority - b.priority
      );
      this.needsSort = false;
    }

    // Build context
    const ctx: TickContext = {
      deltaSeconds: this.tickInterval, // Use interval, not actual delta (for consistency)
      gameTime,
      gameSpeed,
      elapsedTime: this.elapsedTime,
      tickCount: this.tickCount,
    };

    // Execute callbacks based on priority
    // CRITICAL (< 10): Run immediately - these are essential for game state
    // Others: Queue for lazy execution if enabled
    for (const registered of this.sortedCallbacks) {
      if (!registered.enabled) continue;

      if (registered.priority < TICK_PRIORITY.HIGH || !this.lazyEnabled) {
        // Run critical callbacks immediately
        try {
          registered.callback(ctx);
        } catch (error) {
          console.error(`[CentralTick] Error in callback '${registered.id}':`, error);
        }
      } else {
        // Queue non-critical callbacks for lazy execution
        this.lazyQueue.push({ callback: registered, ctx });
      }
    }

    // Flush batched updates from immediate callbacks
    this.flushPendingUpdates();

    return true;
  }

  /**
   * Process lazy queue - call this every frame from useFrame
   * Processes a few queued callbacks per frame to spread CPU load
   */
  processLazyQueue(): void {
    if (this.lazyQueue.length === 0) return;

    // Process up to lazyItemsPerFrame callbacks
    const toProcess = Math.min(this.lazyItemsPerFrame, this.lazyQueue.length);

    for (let i = 0; i < toProcess; i++) {
      const item = this.lazyQueue.shift();
      if (!item) break;

      try {
        item.callback.callback(item.ctx);
      } catch (error) {
        console.error(`[CentralTick] Error in lazy callback '${item.callback.id}':`, error);
      }
    }

    // Flush any batched updates from lazy callbacks
    this.flushPendingUpdates();
  }

  /**
   * Get lazy queue length for debugging
   */
  getLazyQueueLength(): number {
    return this.lazyQueue.length;
  }

  /**
   * Flush pending batched updates
   */
  private flushPendingUpdates(): void {
    if (this.pendingUpdates.length === 0) return;

    for (const update of this.pendingUpdates) {
      try {
        update();
      } catch (error) {
        console.error('[CentralTick] Error in batched update:', error);
      }
    }
    this.pendingUpdates = [];
  }

  /**
   * Get current tick stats for debugging
   */
  getStats() {
    return {
      callbackCount: this.callbacks.size,
      tickCount: this.tickCount,
      tickInterval: this.tickInterval,
      elapsedTime: this.elapsedTime,
      isPaused: this.isPaused,
      lazyQueueLength: this.lazyQueue.length,
      lazyEnabled: this.lazyEnabled,
      lazyItemsPerFrame: this.lazyItemsPerFrame,
      callbacks: Array.from(this.callbacks.keys()),
    };
  }

  /**
   * Reset the system (for testing)
   */
  reset(): void {
    this.callbacks.clear();
    this.sortedCallbacks = [];
    this.needsSort = false;
    this.lastTickTime = 0;
    this.tickCount = 0;
    this.elapsedTime = 0;
    this.pendingUpdates = [];
    this.lazyQueue = [];
  }
}

// Singleton instance
export const centralTick = new CentralTickSystemImpl();

// Export type for the instance
export type CentralTickSystem = typeof centralTick;
