/**
 * WebGPU Local LLM Client for MillOS Plant Management
 *
 * Browser-only neural core powered by @mlc-ai/web-llm running Qwen3-4B.
 * Implements the same public surface as {@link geminiClient} (generateContent
 * + isConnected) so it is a drop-in backend for the strategic AI layer when
 * the operator wants on-device inference with no API key and zero cost.
 *
 * Mirrors the CABAL workspace WebGPU brain (src/experts/webgpu-client.ts):
 * - The engine runs in a dedicated Web Worker (see webgpuWorker.ts) so the heavy
 *   WASM / WebGPU work stays off the main thread (the 3D scene stays responsive)
 *   and an in-flight download can be HARD-cancelled via worker.terminate().
 * - Lazy: @mlc-ai/web-llm (and the worker chunk) are only fetched when the
 *   operator opts into local inference — kept off the eager app bundle.
 * - Circuit breaker guards against cascading WebGPU / OOM failures.
 * - Qwen3 reasoning is disabled via enable_thinking:false; stripReasoning() is a
 *   backstop so the strategic JSON parser stays robust and the 45s strategic
 *   cadence is not blown by a multi-second reasoning pass.
 *
 * GPU NOTE: MillOS renders a heavy React Three Fiber scene every frame, so the
 * LLM shares the physical GPU with rendering. Qwen3-4B (~2.7GB VRAM) is the
 * operator-chosen default for CABAL parity; checkWebGPUAdapter() surfaces an
 * up-front warning when the adapter's limits suggest the device may struggle.
 */

import type { WebWorkerMLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import { logger } from './logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default model — matches CABAL's DEFAULT_MODEL_ID (Qwen3-4B q4f16). */
export const DEFAULT_WEBGPU_MODEL_ID = 'Qwen3-4B-q4f16_1-MLC';

/** Human-readable model label for the settings UI. */
export const DEFAULT_WEBGPU_MODEL_LABEL = 'Qwen3-4B Instruct';

// Context limit protection — mirror geminiClient's budget so prompts that fit
// Gemini also fit the local model (Qwen3-4B supports a 32k context window).
const MAX_PROMPT_CHARS = 28000;

// Generation config — mirrors geminiClient's Gemini settings for parity.
const GENERATION_CONFIG = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 2048,
} as const;

// Circuit breaker — no rate limiting needed for local inference, but WebGPU /
// OOM failures can cascade, so we still trip after repeated failures.
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30000;

// Heuristic VRAM floor (bytes) below which a 4B q4f16 model is likely to OOM.
// maxBufferSize on capable discrete/Apple-silicon GPUs is multi-GB; integrated
// GPUs frequently cap at 256MB–1GB. This is advisory only — never a hard block.
const ADVISORY_MIN_MAX_BUFFER_SIZE = 1_000_000_000; // ~1GB

// ============================================================================
// TYPES
// ============================================================================

export interface WebGPULoadProgress {
  /** Human-readable status text from the MLC engine. */
  text: string;
  /** 0..1 fraction of weights downloaded / shaders compiled. */
  progress: number;
}

export interface WebGPUAdapterReport {
  /** True when navigator.gpu exists AND an adapter could be acquired. */
  supported: boolean;
  /** Set when navigator.gpu is missing entirely. */
  noNavigatorGpu?: boolean;
  /** Advisory message when the adapter's limits suggest OOM risk for a 4B model. */
  warning?: string;
  /** Best-effort adapter description for display. */
  adapterLabel?: string;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Minimal structural WebGPU types so this module does not depend on
// @webgpu/types being in the tsconfig `types` allow-list (it currently is not).
interface MinimalGPUAdapter {
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
  requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string }>;
}
interface MinimalGPU {
  requestAdapter: () => Promise<MinimalGPUAdapter | null>;
}

// ============================================================================
// SUPPORT DETECTION
// ============================================================================

/** Returns true when WebGPU is exposed in the current browser context. */
export function checkWebGPUSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Probe the real GPU adapter (not just the `navigator.gpu` shim) and surface an
 * advisory warning when the adapter's limits suggest a 4B model may OOM while
 * the 3D scene is also rendering. Never throws; never hard-blocks.
 */
export async function checkWebGPUAdapter(): Promise<WebGPUAdapterReport> {
  if (!checkWebGPUSupport()) {
    return { supported: false, noNavigatorGpu: true };
  }
  try {
    const gpu = (navigator as unknown as { gpu?: MinimalGPU }).gpu;
    if (!gpu) {
      return { supported: false, noNavigatorGpu: true };
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        warning: 'No WebGPU adapter available (GPU may be blocklisted or disabled).',
      };
    }

    const maxBufferSize = adapter.limits?.maxBufferSize ?? 0;
    const maxStorage = adapter.limits?.maxStorageBufferBindingSize ?? 0;
    let adapterLabel: string | undefined;
    // requestAdapterInfo is not in all browsers yet — best-effort only.
    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        const info = await adapter.requestAdapterInfo();
        adapterLabel = [info.vendor, info.architecture].filter(Boolean).join(' ') || undefined;
      } catch {
        /* adapter info is best-effort */
      }
    }

    let warning: string | undefined;
    if (maxBufferSize > 0 && maxBufferSize < ADVISORY_MIN_MAX_BUFFER_SIZE) {
      warning =
        `This GPU reports a small memory budget (maxBufferSize ` +
        `${(maxBufferSize / 1_048_576).toFixed(0)}MB, maxStorageBuffer ` +
        `${(maxStorage / 1_048_576).toFixed(0)}MB). Qwen3-4B needs ~2.7GB and may ` +
        `fail to load or stutter the 3D scene. A smaller model or Gemini API is safer here.`;
    }

    return { supported: true, warning, adapterLabel };
  } catch (error) {
    logger.warn('[WebGPU] Adapter probe failed:', error);
    return {
      supported: false,
      warning: error instanceof Error ? error.message : 'WebGPU adapter probe failed.',
    };
  }
}

// ============================================================================
// WEBGPU CLIENT — drop-in for geminiClient
// ============================================================================

class WebGPUClient {
  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private loadingPromise: Promise<boolean> | null = null;
  private modelId: string = DEFAULT_WEBGPU_MODEL_ID;
  private cancelled = false;
  // Resolver for the in-flight load's cancellation race (see initEngine).
  private cancelResolve: (() => void) | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };

  /** Whether the model is loaded and ready to serve inference. */
  isConnected(): boolean {
    return this.engine !== null && !this.circuitBreaker.isOpen;
  }

  /** Whether a model load is currently in flight. */
  isLoading(): boolean {
    return this.loadingPromise !== null && this.engine === null;
  }

  /** The active model identifier. */
  getModelId(): string {
    return this.modelId;
  }

  // --------------------------------------------------------------------------
  // ENGINE LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Download + compile the model and bring the engine online. Idempotent: a
   * concurrent call returns the in-flight promise; a completed load returns true
   * immediately. Resolves false on failure (callers fall back to heuristic).
   */
  async load(
    onProgress?: (progress: WebGPULoadProgress) => void,
    modelId: string = DEFAULT_WEBGPU_MODEL_ID
  ): Promise<boolean> {
    if (this.engine !== null && this.modelId === modelId) {
      return true;
    }
    if (this.loadingPromise && this.modelId === modelId) {
      return this.loadingPromise;
    }

    // Honor the circuit breaker so repeated load failures (OOM / device-lost)
    // back off instead of hammering the GPU.
    this.checkCircuitBreaker();
    if (this.circuitBreaker.isOpen) {
      logger.warn('[WebGPU] Circuit breaker open; deferring model load');
      return false;
    }

    this.modelId = modelId;
    this.cancelled = false;
    // Pass modelId explicitly so a concurrent load() of a different model can't
    // mutate this.modelId out from under an in-flight CreateMLCEngine.
    this.loadingPromise = this.initEngine(modelId, onProgress).finally(() => {
      this.loadingPromise = null;
    });
    return this.loadingPromise;
  }

  /**
   * Resolve when an in-flight load settles (true if the engine is online).
   * Lets a second consumer await an existing load without restarting it.
   */
  async whenReady(): Promise<boolean> {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    return this.engine !== null;
  }

  /**
   * Hard-cancel an in-flight load. Terminating the worker kills its in-flight
   * model fetches immediately (web-llm exposes no load-time AbortSignal on the
   * main-thread API), and resolving the cancellation race lets the pending
   * load() settle — otherwise the awaited CreateWebWorkerMLCEngine would hang
   * forever, since the terminated worker never posts its result back. Safe any
   * time; a subsequent load() spins a fresh worker.
   */
  cancelLoad(): void {
    this.cancelled = true;
    this.teardownWorker();
    this.cancelResolve?.();
    logger.info('[WebGPU] Load cancelled; worker terminated');
  }

  /** Terminate the worker and drop the engine handle. Idempotent. */
  private teardownWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.engine = null;
  }

  private async initEngine(
    modelId: string,
    onProgress?: (progress: WebGPULoadProgress) => void
  ): Promise<boolean> {
    if (!checkWebGPUSupport()) {
      logger.warn('[WebGPU] navigator.gpu unavailable — cannot load local model');
      return false;
    }

    // Spin up the engine's worker. The static new URL() literal lets Vite bundle
    // the worker (and web-llm's runtime) as its own lazy chunk.
    const worker = new Worker(new URL('./webgpuWorker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;

    // Cancellation race: cancelLoad() terminates the worker AND resolves this,
    // so the load settles even though the dead worker never posts a result.
    const cancelSignal = new Promise<'cancelled'>((resolve) => {
      this.cancelResolve = () => resolve('cancelled');
    });

    try {
      // Dynamic import keeps the main-thread web-llm proxy off the eager bundle.
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const enginePromise = CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report: InitProgressReport) => {
          if (!this.cancelled) {
            onProgress?.({ text: report.text, progress: report.progress });
          }
        },
      });
      // Swallow a late rejection if we cancel mid-handshake (the worker dies, so
      // this promise may reject after the race has already resolved).
      enginePromise.catch(() => undefined);

      const result = await Promise.race([enginePromise, cancelSignal]);

      if (result === 'cancelled' || this.cancelled) {
        this.teardownWorker();
        logger.info('[WebGPU] Load cancelled during init; worker terminated');
        return false;
      }

      this.engine = result;
      this.modelId = modelId;
      this.resetCircuitBreaker();
      logger.info(`[WebGPU] Model ${modelId} loaded successfully (worker)`);
      return true;
    } catch (error) {
      this.teardownWorker();
      // Count load failures toward the breaker so OOM / device-lost loops back off.
      this.recordFailure();
      logger.error(`[WebGPU] Failed to load model ${modelId}:`, error);
      return false;
    } finally {
      this.cancelResolve = null;
    }
  }

  /** Unload the engine and free GPU memory (terminates the worker). */
  async disconnect(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    this.resetCircuitBreaker();
    if (engine) {
      try {
        await engine.unload();
      } catch (error) {
        logger.warn('[WebGPU] Engine unload failed:', error);
      }
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    logger.info('[WebGPU] Disconnected');
  }

  // --------------------------------------------------------------------------
  // CIRCUIT BREAKER
  // --------------------------------------------------------------------------

  private checkCircuitBreaker(): void {
    if (
      this.circuitBreaker.isOpen &&
      Date.now() - this.circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_MS
    ) {
      this.resetCircuitBreaker();
      logger.info('[WebGPU] Circuit breaker reset');
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      logger.warn('[WebGPU] Circuit breaker opened after failures:', this.circuitBreaker.failures);
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
  }

  getCircuitBreakerStatus(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  // --------------------------------------------------------------------------
  // PROMPT HANDLING
  // --------------------------------------------------------------------------

  /** Truncate to the safe budget, preserving head (context) and tail (instructions). */
  private truncatePrompt(prompt: string): string {
    if (prompt.length <= MAX_PROMPT_CHARS) {
      return prompt;
    }
    logger.warn(`[WebGPU] Truncating prompt from ${prompt.length} to ${MAX_PROMPT_CHARS} chars`);
    const keepStart = Math.floor(MAX_PROMPT_CHARS * 0.6);
    const keepEnd = Math.floor(MAX_PROMPT_CHARS * 0.35);
    return (
      prompt.slice(0, keepStart) +
      '\n\n[... context truncated for token limits ...]\n\n' +
      prompt.slice(-keepEnd)
    );
  }

  /**
   * Strip Qwen3 reasoning output. Even with `/no_think`, Qwen3 emits an empty
   * `<think></think>` block; with thinking on it can contain braces that would
   * corrupt the strategic JSON parser's greedy `{...}` match.
   */
  private stripReasoning(text: string): string {
    // Remove complete <think>...</think> blocks (empty when thinking is disabled,
    // full when a thinking pass ran).
    let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove a leading think block truncated by max_tokens (no closing tag),
    // which would otherwise leak reasoning braces into the strategic JSON parser.
    result = result.replace(/^\s*<think>[\s\S]*$/i, '');
    return result.trim();
  }

  // --------------------------------------------------------------------------
  // INFERENCE — drop-in for geminiClient.generateContent
  // --------------------------------------------------------------------------

  /**
   * Generate content from the local model. Same contract as
   * geminiClient.generateContent: returns the text, or null on
   * not-ready / circuit-open / failure so callers fall back to heuristic.
   */
  async generateContent(prompt: string): Promise<string | null> {
    this.checkCircuitBreaker();

    if (!this.engine) {
      logger.warn('[WebGPU] Model not loaded');
      return null;
    }
    if (this.circuitBreaker.isOpen) {
      logger.warn('[WebGPU] Circuit breaker is open, skipping request');
      return null;
    }

    const safePrompt = this.truncatePrompt(prompt);

    try {
      // NOTE: response_format:{type:'json_object'} is intentionally NOT used.
      // web-llm 0.2.84's WASM grammar binding throws "Cannot pass non-string to
      // std::string" at inference for this model (verified via the real-GPU E2E;
      // matches the long-standing limitation CABAL documented). JSON reliability
      // instead comes from: enable_thinking:false (no chain-of-thought to derail
      // the output) + stripReasoning() + a tolerant {...}-extracting parser, all
      // verified to yield clean parseable JSON. Truncation is surfaced below.
      const response = await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: safePrompt }],
        temperature: GENERATION_CONFIG.temperature,
        top_p: GENERATION_CONFIG.top_p,
        max_tokens: GENERATION_CONFIG.max_tokens,
        // enable_thinking:false is the typed, engine-enforced way to skip Qwen3's
        // chain-of-thought pass — survives model swaps and prompt truncation,
        // unlike a `/no_think` text suffix. stripReasoning() remains a backstop.
        extra_body: { enable_thinking: false },
      });

      const choice = response.choices?.[0];
      if (choice?.finish_reason === 'length') {
        // The cap was hit — surface it instead of silently returning partial JSON.
        logger.warn(
          '[WebGPU] Generation reached the max_tokens cap (finish_reason=length); ' +
            'strategic JSON may be truncated this cycle.'
        );
      }
      const raw = choice?.message?.content ?? '';
      const text = this.stripReasoning(raw);

      // Reset the breaker fully on success.
      this.resetCircuitBreaker();

      return text || null;
    } catch (error) {
      this.recordFailure();
      logger.error('[WebGPU] Generation failed:', error);
      return null;
    }
  }

  /**
   * Quick smoke test that the loaded model can respond. Used by the settings UI
   * after a model load completes.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.engine) {
      return { success: false, message: 'Model not loaded' };
    }
    try {
      const text = await this.generateContent('Reply with exactly: MillOS local core online');
      if (text && text.toLowerCase().includes('online')) {
        return { success: true, message: 'Local model verified' };
      }
      return { success: !!text, message: text ? 'Connected (response received)' : 'No response' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // --------------------------------------------------------------------------
  // STATIC CACHE MANAGEMENT
  // --------------------------------------------------------------------------

  static async isModelCached(modelId: string = DEFAULT_WEBGPU_MODEL_ID): Promise<boolean> {
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      return await hasModelInCache(modelId);
    } catch {
      return false;
    }
  }

  static async deleteModelCache(modelId: string = DEFAULT_WEBGPU_MODEL_ID): Promise<void> {
    const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
    await deleteModelAllInfoInCache(modelId);
  }

  static async getCacheStorageSize(): Promise<{ bytes: number; formatted: string } | null> {
    try {
      if (
        typeof navigator === 'undefined' ||
        !('storage' in navigator) ||
        !navigator.storage.estimate
      ) {
        return null;
      }
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ?? 0;
      const formatted =
        used > 1_073_741_824
          ? `${(used / 1_073_741_824).toFixed(1)} GB`
          : `${(used / 1_048_576).toFixed(0)} MB`;
      return { bytes: used, formatted };
    } catch {
      return null;
    }
  }
}

// Singleton instance — one engine load serves the whole app (matches geminiClient).
export const webgpuClient = new WebGPUClient();

export { WebGPUClient };
