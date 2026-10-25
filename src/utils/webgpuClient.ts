/**
 * WebGPU Local LLM Client for MillOS Plant Management
 *
 * Browser-only neural core powered by @mlc-ai/web-llm running Qwen3.5-4B.
 * Implements the same public surface as {@link cloudAIClient} (generateContent
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
 * LLM shares the physical GPU with rendering (see WEBGPU_MODEL_PROFILES for
 * each model's VRAM); checkWebGPUAdapter() surfaces an up-front warning when
 * the adapter's limits suggest the device may struggle.
 */

import type { ChatOptions, WebWorkerMLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import { logger } from './logger';
import { formatFixed, translate } from '../i18n';
import { webgpuClientMessages as messages } from './webgpuClient.messages';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface WebGPUModelProfile {
  label: string;
  /** Weight download, from the build's tensor-cache.json. */
  downloadGb: number;
  /** web-llm's vram_required_MB for the build, rounded. */
  vramGb: number;
  /** Tokens of context the engine allocates; the prompt budget is derived from it. */
  contextWindow: number;
  /** Overrides passed to the engine over the build's mlc-chat-config.json. */
  chatOptions?: ChatOptions;
}

/**
 * The web-llm builds MillOS runs. Qwen3.5-4B became the default on 2026-10-25:
 * on this app's strategic prompt in a real browser it named the faulty machine
 * in 10 of 10 answers to Qwen3-4B's 4, and it routes incidents as a five-way
 * choice (see scoreNextToken). Both are the official mlc-ai builds.
 */
export const WEBGPU_MODEL_PROFILES = {
  'Qwen3.5-4B-q4f16_1-MLC': {
    label: 'Qwen3.5-4B',
    downloadGb: 2.4,
    vramGb: 3.9,
    contextWindow: 4096,
    chatOptions: {
      context_window_size: 4096,
      // The build (mlc-ai 44b42469) lists Qwen3's stop ids, 151643 and 151645,
      // which in Qwen3.5's 248k vocabulary are ordinary Korean and Thai word
      // pieces. These are Qwen3.5's own <|im_end|> and <|endoftext|>.
      conv_config: { stop_token_ids: [248046, 248044] },
    },
  },
  'Qwen3-4B-q4f16_1-MLC': {
    label: 'Qwen3-4B Instruct',
    downloadGb: 2.3,
    vramGb: 3.4,
    contextWindow: 4096,
    chatOptions: { context_window_size: 4096 },
  },
} as const satisfies Record<string, WebGPUModelProfile>;

export type WebGPUModelId = keyof typeof WEBGPU_MODEL_PROFILES;

/** Default model for the local core. */
export const DEFAULT_WEBGPU_MODEL_ID: WebGPUModelId = 'Qwen3.5-4B-q4f16_1-MLC';

/** Display label for the settings UI. */
export const DEFAULT_WEBGPU_MODEL_LABEL = WEBGPU_MODEL_PROFILES[DEFAULT_WEBGPU_MODEL_ID].label;

/** Download and VRAM of the default model, for the settings copy. */
export const DEFAULT_WEBGPU_MODEL_SIZE = {
  downloadGb: WEBGPU_MODEL_PROFILES[DEFAULT_WEBGPU_MODEL_ID].downloadGb,
  vramGb: WEBGPU_MODEL_PROFILES[DEFAULT_WEBGPU_MODEL_ID].vramGb,
};

// Generation config — mirrors cloudAIClient's cloud settings for parity.
const GENERATION_CONFIG = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 2048,
} as const;

// The prompt shares the context window with the answer, so the character budget
// follows the window: what is left after max_tokens and the chat template, at a
// conservative 3 characters per token (the strategic prompt's JSON runs at about
// 3.2). A 4,096-token window leaves 5,376 characters; the strategic prompt is
// about 720 tokens. web-llm rejects a prompt that does not fit outright.
const TEMPLATE_TOKENS = 256;
const CHARS_PER_TOKEN = 3;
function promptCharBudget(modelId: string): number {
  const profile = WEBGPU_MODEL_PROFILES[modelId as WebGPUModelId];
  const window = profile?.contextWindow ?? 4096;
  return (window - GENERATION_CONFIG.max_tokens - TEMPLATE_TOKENS) * CHARS_PER_TOKEN;
}

// Circuit breaker — no rate limiting needed for local inference, but WebGPU /
// OOM failures can cascade, so we still trip after repeated failures.
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30000;

// Upper bound on one local generation. cloudAIClient bounds every provider call;
// without a deadline here a stalled worker (device lost, OOM thrash) leaves the
// strategic layer's dedupe promise pending and its "analyzing" state stuck on.
// Deliberately generous: a legitimate 2048-token run on a slow GPU can take well
// over the 45 s strategic cadence, and must not be killed as a hang.
const WEBGPU_GENERATION_TIMEOUT_MS = 120_000;

// Heuristic VRAM floor (bytes) below which a 4B q4f16 model is likely to OOM.
// maxBufferSize on capable discrete/Apple-silicon GPUs is multi-GB; integrated
// GPUs frequently cap at 256MB–1GB. This is advisory only — never a hard block.
const ADVISORY_MIN_MAX_BUFFER_SIZE = 1_000_000_000; // ~1GB

// ============================================================================
// TYPES
// ============================================================================

export interface WebGPULoadProgress {
  /** Display status text from the MLC engine. */
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
        warning: translate(messages, 'noAdapter'),
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
      warning = translate(messages, 'smallMemory', {
        buffer: formatFixed(maxBufferSize / 1_048_576, 0),
        storage: formatFixed(maxStorage / 1_048_576, 0),
        model: DEFAULT_WEBGPU_MODEL_LABEL,
        vram: formatFixed(DEFAULT_WEBGPU_MODEL_SIZE.vramGb, 1),
      });
    }

    return { supported: true, warning, adapterLabel };
  } catch (error) {
    logger.warn('[WebGPU] Adapter probe failed:', error);
    return {
      supported: false,
      warning: error instanceof Error ? error.message : translate(messages, 'probeFailed'),
    };
  }
}

// ============================================================================
// WEBGPU CLIENT — drop-in for cloudAIClient
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
    // Half-open the breaker after its cool-down (see cloudAIClient.isConnected).
    this.checkCircuitBreaker();
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
      const enginePromise = CreateWebWorkerMLCEngine(
        worker,
        modelId,
        {
          initProgressCallback: (report: InitProgressReport) => {
            if (!this.cancelled) {
              onProgress?.({ text: report.text, progress: report.progress });
            }
          },
        },
        // web-llm merges these over the build's config and the record's overrides.
        WEBGPU_MODEL_PROFILES[modelId as WebGPUModelId]?.chatOptions
      );
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
    const budget = promptCharBudget(this.modelId);
    if (prompt.length <= budget) {
      return prompt;
    }
    logger.warn(`[WebGPU] Truncating prompt from ${prompt.length} to ${budget} chars`);
    const keepStart = Math.floor(budget * 0.6);
    const keepEnd = Math.floor(budget * 0.35);
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
  // INFERENCE — drop-in for cloudAIClient.generateContent
  // --------------------------------------------------------------------------

  /**
   * Generate content from the local model. Same contract as
   * cloudAIClient.generateContent: returns the text, or null on
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
    const engine = this.engine;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // NOTE: response_format:{type:'json_object'} is intentionally NOT used.
      // web-llm's WASM grammar binding throws "Cannot pass non-string to
      // std::string" at inference for this model, still so on 0.2.86 (verified on
      // a real GPU 2026-10-24, GrammarMatcherInitError; first seen on 0.2.84;
      // matches the long-standing limitation CABAL documented). JSON reliability
      // instead comes from: enable_thinking:false (no chain-of-thought to derail
      // the output) + stripReasoning() + a tolerant {...}-extracting parser, all
      // verified to yield clean parseable JSON. Truncation is surfaced below.
      const completion = engine.chat.completions.create({
        messages: [{ role: 'user', content: safePrompt }],
        temperature: GENERATION_CONFIG.temperature,
        top_p: GENERATION_CONFIG.top_p,
        max_tokens: GENERATION_CONFIG.max_tokens,
        // enable_thinking:false is the typed, engine-enforced way to skip Qwen3's
        // chain-of-thought pass — survives model swaps and prompt truncation,
        // unlike a `/no_think` text suffix. stripReasoning() remains a backstop.
        extra_body: { enable_thinking: false },
      });
      // The deadline resolves to a null sentinel rather than rejecting, so the
      // catch below never double-counts a timeout as a second failure.
      const deadline = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), WEBGPU_GENERATION_TIMEOUT_MS);
      });
      const response = await Promise.race([completion, deadline]);
      if (response === null) {
        try {
          engine.interruptGenerate();
        } catch {
          // The worker may already be gone; the breaker below still records it.
        }
        this.recordFailure();
        logger.warn(
          `[WebGPU] Generation exceeded ${WEBGPU_GENERATION_TIMEOUT_MS / 1000}s; interrupted.`
        );
        return null;
      }

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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Score a small choice by the model's next token. logit_bias lifts only
   * `tokenIds`, and web-llm applies it before computing logprobs, so at
   * temperature 1 the returned top_logprobs are the model's distribution over
   * exactly those tokens (verified in Chrome on both models: the five returned
   * tokens summed to 1). No grammar is involved, so the GrammarMatcherInitError
   * above does not apply. Returns null when the model is not ready, the breaker
   * is open, the call fails or times out, or `signal` aborts. Never interrupts
   * the engine: a strategic generation may hold it, and this call waits behind it.
   */
  async scoreNextToken({
    system,
    user,
    tokenIds,
    signal,
  }: {
    system: string;
    user: string;
    tokenIds: readonly number[];
    signal?: AbortSignal;
  }): Promise<Array<{ token: string; probability: number }> | null> {
    this.checkCircuitBreaker();
    const engine = this.engine;
    // web-llm accepts top_logprobs of 0 to 5, so at most five options.
    if (!engine || this.circuitBreaker.isOpen || signal?.aborted || !tokenIds.length) {
      return null;
    }
    if (tokenIds.length > 5) return null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const completion = engine.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 1,
        top_p: 1,
        max_tokens: 1,
        logit_bias: Object.fromEntries(tokenIds.map((id) => [String(id), 100])),
        logprobs: true,
        top_logprobs: tokenIds.length,
        extra_body: { enable_thinking: false },
      });
      // A late rejection after a timeout or abort has nowhere to go.
      completion.catch(() => undefined);
      const stop = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), WEBGPU_GENERATION_TIMEOUT_MS);
        onAbort = () => resolve(null);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      const response = await Promise.race([completion, stop]);
      if (response === null) return null;
      const top = response.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
      return top.map((entry) => ({ token: entry.token, probability: Math.exp(entry.logprob) }));
    } catch (error) {
      this.recordFailure();
      logger.error('[WebGPU] Next-token scoring failed:', error);
      return null;
    } finally {
      clearTimeout(timeoutId);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Quick smoke test that the loaded model can respond. Used by the settings UI
   * after a model load completes.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.engine) {
      return { success: false, message: translate(messages, 'modelNotLoaded') };
    }
    try {
      const text = await this.generateContent('Reply with exactly: MillOS local core online');
      if (text && text.toLowerCase().includes('online')) {
        return { success: true, message: translate(messages, 'modelVerified') };
      }
      return {
        success: !!text,
        message: text ? translate(messages, 'responseReceived') : translate(messages, 'noResponse'),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : translate(messages, 'unknownError'),
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
          ? translate(messages, 'sizeGb', { size: formatFixed(used / 1_073_741_824, 1) })
          : translate(messages, 'sizeMb', { size: formatFixed(used / 1_048_576, 0) });
      return { bytes: used, formatted };
    } catch {
      return null;
    }
  }
}

// Singleton instance — one engine load serves the whole app (matches cloudAIClient).
export const webgpuClient = new WebGPUClient();

export { WebGPUClient };
