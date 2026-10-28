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

import type {
  AppConfig,
  ChatOptions,
  ModelIntegrity,
  ModelRecord,
  WebWorkerMLCEngine,
  InitProgressReport,
} from '@mlc-ai/web-llm';
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
  /**
   * The build's chat template for one user turn, `{prompt}` marking it, as the
   * chat API renders it with enable_thinking:false. With it a long answer can
   * pause for a scoring call and continue from its own text (see generateContent).
   */
  rawTemplate?: string;
  /**
   * The build pinned to one Hugging Face commit, with web-llm verifying the
   * files it can check (config, model library, tokenizer) at every load. A
   * pinned commit cannot change, so the weight shards it lists cannot either.
   */
  pin?: { modelCommit: string; integrity: ModelIntegrity };
}

/**
 * binary-mlc-llm-libs commit 00fe7a40 (2026-10-11), which published the
 * v0_2_86/base model libraries web-llm 0.2.86's records point at through
 * `main`. Pinned with the builds so a later push to `main` cannot change the
 * WebAssembly this app runs; the record test fails if web-llm moves its
 * libraries, so an upgrade re-pins here on purpose.
 */
const MODEL_LIB_COMMIT = '00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0';
const MODEL_LIB_MAIN = '/binary-mlc-llm-libs/main/';

// Both builds' mlc-chat-config conv_template, plus the empty think block that
// enable_thinking:false inserts. Checked against the chat API in Chrome, 2026-10-25:
// the same answer speed and the same parsed strategic JSON.
const QWEN_RAW_TEMPLATE =
  '<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';

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
    rawTemplate: QWEN_RAW_TEMPLATE,
    pin: {
      modelCommit: '44b42469f9e192814bfd90440e3b377d89ba7a13',
      integrity: {
        config: 'sha256-uU1Tv95bSW2NliOb9GhOJLU5QgnlrvkSeGbvpFQ5VlE=',
        model_lib: 'sha256-VSFSvXb9VDLGuIdQqUisRNA4o8Vwvmqg8OdEBnqeKiU=',
        tokenizer: { 'tokenizer.json': 'sha256-X55NSQGpK5l+RjwfRgVQiLbMpcphplItG59kxLuBy0I=' },
      },
    },
  },
  'Qwen3-4B-q4f16_1-MLC': {
    label: 'Qwen3-4B Instruct',
    downloadGb: 2.3,
    vramGb: 3.4,
    contextWindow: 4096,
    chatOptions: { context_window_size: 4096 },
    rawTemplate: QWEN_RAW_TEMPLATE,
    pin: {
      modelCommit: 'a5c9fab855e3ccbdfed2e7e69683d75f30332161',
      integrity: {
        config: 'sha256-lyasfbzZBHX4BFYEvghi7xtIN+QyxQBNoguKbjSDMNo=',
        model_lib: 'sha256-Z4+VN8c4gRPigUHveo5BbMYA5yp88up6rA4EVlnT7L0=',
        tokenizer: { 'tokenizer.json': 'sha256-rrEzB6cazY/oGGHZStVKtonfdzMYgJ7tPL55S0SS2uQ=' },
      },
    },
  },
} as const satisfies Record<string, WebGPUModelProfile>;

/**
 * Where a download is kept: the browser Cache API (web-llm's default), or
 * IndexedDB when the Cache API refuses the write (see initEngine).
 */
export type ModelCacheBackend = 'cache' | 'indexeddb';
const CACHE_BACKENDS: readonly ModelCacheBackend[] = ['cache', 'indexeddb'];

/**
 * Chrome's refusal of a streamed Cache API write, seen with about 12 GB or
 * less free on this machine's disk (2026-10-25): "Cache.add() encountered a
 * network error". Quota errors are the same problem said plainly.
 */
export function isCacheWriteError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Cache\.(add|put)|QuotaExceeded|quota/i.test(text);
}

/**
 * A prebuilt record pinned as its profile says: the weights at the profile's
 * commit, the model library at MODEL_LIB_COMMIT, and the profile's hashes. A
 * record without a pin is returned unchanged.
 */
export function pinnedModelRecord(record: ModelRecord): ModelRecord {
  const profile: WebGPUModelProfile | undefined =
    WEBGPU_MODEL_PROFILES[record.model_id as WebGPUModelId];
  if (!profile?.pin) return record;
  return {
    ...record,
    model: `${record.model.replace(/\/+$/, '')}/resolve/${profile.pin.modelCommit}/`,
    model_lib: record.model_lib.replace(
      MODEL_LIB_MAIN,
      `/binary-mlc-llm-libs/${MODEL_LIB_COMMIT}/`
    ),
    integrity: profile.pin.integrity,
  };
}

/**
 * web-llm's prebuilt list with `modelId` pinned, plus the fast lane's copy of
 * it when `laneId` is given (the same files, so the cache serves both).
 */
export function pinnedAppConfig(
  prebuilt: AppConfig,
  modelId: string,
  laneId: string | null = null,
  cacheBackend: ModelCacheBackend = 'cache'
): AppConfig {
  const record = prebuilt.model_list.find((entry) => entry.model_id === modelId);
  if (!record) return prebuilt;
  const pinned = pinnedModelRecord(record);
  return {
    ...prebuilt,
    ...(cacheBackend === 'cache' ? {} : { cacheBackend }),
    model_list: [
      ...prebuilt.model_list.map((entry) => (entry === record ? pinned : entry)),
      ...(laneId ? [{ ...pinned, model_id: laneId }] : []),
    ],
  };
}

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

/**
 * The fast lane: a second copy of the same build under its own model_id, so
 * routing runs beside a strategic generation instead of queueing behind it.
 * web-llm keeps one lock per loaded model, and both copies share the one
 * download. Measured in Chrome on Qwen3.5-4B, 2026-10-25: a routing call
 * arriving 3 s into a strategic answer took 2.8-3.4 s with the fast lane and
 * 27.9 s without; the strategic answer was not measurably slower (36.5 s,
 * against 37.4 s alone). Cost: one more copy of the weights in GPU memory.
 */
export function fastLaneModelId(modelId: string): string {
  return `${modelId}-fast-lane`;
}

/**
 * Without the fast lane, a strategic answer pauses for a scoring call instead
 * of making it wait (see generateContent). Past this many pauses in one answer
 * further calls wait behind it, so a burst of routing cannot starve strategy.
 */
const MAX_PAUSES = 8;

/** Default for the fast lane: on where the browser reports at least 8 GB of memory (Chrome's ceiling). */
export function fastLaneByDefault(): boolean {
  const memory = (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory;
  return typeof memory === 'number' && memory >= 8;
}

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

/** One pausable answer's state, shared with its deadline (see generateContent). */
interface PausableRun {
  stopped: boolean;
  /** Time spent paused for scoring calls, which the deadline does not count. */
  pausedMs: number;
  pausedSince: number | null;
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

/**
 * When the WebGPU device is lost (mostly memory pressure), web-llm 0.2.86
 * unloads its models but keeps the engine, and every later request fails as
 * not loaded. Seen in Chrome on this machine, 2026-10-25, with three 4B models
 * resident at once. The worker passes errors on as text, so match the text.
 */
const ENGINE_GONE = /model not loaded|is not loaded with a model|device was lost/i;
export function isEngineGoneError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return ENGINE_GONE.test(text);
}

// ============================================================================
// WEBGPU CLIENT — drop-in for cloudAIClient
// ============================================================================

class WebGPUClient {
  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private loadingPromise: Promise<boolean> | null = null;
  private modelId: string = DEFAULT_WEBGPU_MODEL_ID;
  // The fast lane's model_id while one is loaded; every request then names its lane.
  private fastLaneId: string | null = null;
  // Scoring calls in flight without a fast lane; a pausable answer gives way to them.
  private waitingScores = new Set<Promise<unknown>>();
  private engineLostListeners = new Set<() => void>();
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

  /** Called once each time a loaded engine loses its model (see isEngineGoneError). */
  onEngineLost(listener: () => void): () => void {
    this.engineLostListeners.add(listener);
    return () => this.engineLostListeners.delete(listener);
  }

  /** Drop an engine whose model is gone, so nothing keeps calling it. */
  private dropIfGone(engine: WebWorkerMLCEngine, error: unknown): void {
    if (this.engine !== engine || !isEngineGoneError(error)) return;
    logger.warn('[WebGPU] The engine lost its model (WebGPU device lost); dropping it');
    this.teardownWorker();
    this.engineLostListeners.forEach((listener) => listener());
  }

  /** Whether short scoring calls have their own copy of the model. */
  hasFastLane(): boolean {
    return this.engine !== null && this.fastLaneId !== null;
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
    modelId: string = DEFAULT_WEBGPU_MODEL_ID,
    fastLane: boolean = false
  ): Promise<boolean> {
    if (this.loadingPromise && this.modelId === modelId) {
      return this.loadingPromise;
    }
    if (this.engine !== null && this.modelId === modelId) {
      if ((this.fastLaneId !== null) === fastLane) return true;
      // Adding or dropping the fast lane is a reload of the same weights.
      await this.disconnect();
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
    this.loadingPromise = this.initEngine(modelId, onProgress, fastLane).finally(() => {
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
    this.fastLaneId = null;
  }

  private async initEngine(
    modelId: string,
    onProgress?: (progress: WebGPULoadProgress) => void,
    fastLane = false,
    cacheBackend: ModelCacheBackend = 'cache'
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
      const { CreateWebWorkerMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
      // web-llm merges these over the build's config and the record's overrides.
      const chatOptions = WEBGPU_MODEL_PROFILES[modelId as WebGPUModelId]?.chatOptions;
      const record = prebuiltAppConfig.model_list.find((entry) => entry.model_id === modelId);
      const laneId = fastLane && record ? fastLaneModelId(modelId) : null;
      // The pinned record, and the fast lane as the same record under a second
      // id: same weights URL, so the browser cache serves it without a second
      // download.
      const appConfig = pinnedAppConfig(prebuiltAppConfig, modelId, laneId, cacheBackend);
      const engineConfig = {
        appConfig,
        initProgressCallback: (report: InitProgressReport) => {
          if (!this.cancelled) {
            onProgress?.({ text: report.text, progress: report.progress });
          }
        },
      };
      const enginePromise = laneId
        ? CreateWebWorkerMLCEngine(worker, [modelId, laneId], engineConfig, [
            chatOptions ?? {},
            chatOptions ?? {},
          ])
        : CreateWebWorkerMLCEngine(worker, modelId, engineConfig, chatOptions);
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
      this.fastLaneId = laneId;
      this.resetCircuitBreaker();
      logger.info(
        `[WebGPU] Model ${modelId} loaded successfully (worker${laneId ? ', with fast lane' : ''})`
      );
      void WebGPUClient.dropUnpinnedCopy(modelId);
      return true;
    } catch (error) {
      this.teardownWorker();
      if (cacheBackend === 'cache' && !this.cancelled && isCacheWriteError(error)) {
        // Chrome refuses streamed Cache API writes on a nearly full disk while
        // whole-file stores still succeed: try once more through IndexedDB.
        logger.warn(`[WebGPU] The browser cache refused ${modelId}; retrying with IndexedDB`);
        this.cancelResolve = null;
        // Awaited, so this call's finally cannot clear the retry's cancel hook.
        return await this.initEngine(modelId, onProgress, fastLane, 'indexeddb');
      }
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
    this.fastLaneId = null;
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
    // Without a fast lane, a build whose template is known answers through the
    // pausable path, so scoring calls do not wait out the whole answer.
    const profile: WebGPUModelProfile | undefined =
      WEBGPU_MODEL_PROFILES[this.modelId as WebGPUModelId];
    const template = this.fastLaneId ? undefined : profile?.rawTemplate;
    const run: PausableRun = { stopped: false, pausedMs: 0, pausedSince: null };
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
      const completion: Promise<{ text: string; finish: string | null }> = template
        ? // A function replacement, so a `$&` in the prompt stays literal.
          this.generatePausable(
            engine,
            template.replace('{prompt}', () => safePrompt),
            run
          )
        : engine.chat.completions
            .create({
              // With the fast lane loaded, web-llm needs every request to name its model.
              ...(this.fastLaneId ? { model: this.modelId } : {}),
              messages: [{ role: 'user', content: safePrompt }],
              temperature: GENERATION_CONFIG.temperature,
              top_p: GENERATION_CONFIG.top_p,
              max_tokens: GENERATION_CONFIG.max_tokens,
              // enable_thinking:false is the typed, engine-enforced way to skip Qwen3's
              // chain-of-thought pass — survives model swaps and prompt truncation,
              // unlike a `/no_think` text suffix. stripReasoning() remains a backstop.
              extra_body: { enable_thinking: false },
            })
            .then((response) => ({
              text: response.choices?.[0]?.message?.content ?? '',
              finish: response.choices?.[0]?.finish_reason ?? null,
            }));
      // A late rejection after the deadline has nowhere to go.
      completion.catch(() => undefined);
      // The deadline resolves to a null sentinel rather than rejecting, so the
      // catch below never double-counts a timeout as a second failure. Time spent
      // paused for scoring calls does not count: each has its own deadline.
      const started = Date.now();
      const deadline = new Promise<null>((resolve) => {
        const arm = (ms: number) => {
          timeoutId = setTimeout(() => {
            const paused =
              run.pausedMs + (run.pausedSince === null ? 0 : Date.now() - run.pausedSince);
            const left = WEBGPU_GENERATION_TIMEOUT_MS - (Date.now() - started - paused);
            if (left > 0) arm(left);
            else resolve(null);
          }, ms);
        };
        arm(WEBGPU_GENERATION_TIMEOUT_MS);
      });
      const response = await Promise.race([completion, deadline]);
      if (response === null) {
        // The pausable path interrupts itself at its next token, and never
        // interrupts a scoring call it is waiting on.
        run.stopped = true;
        if (!template) {
          try {
            engine.interruptGenerate();
          } catch {
            // The worker may already be gone; the breaker below still records it.
          }
        }
        this.recordFailure();
        logger.warn(
          `[WebGPU] Generation exceeded ${WEBGPU_GENERATION_TIMEOUT_MS / 1000}s; interrupted.`
        );
        return null;
      }

      if (response.finish === 'length') {
        // The cap was hit — surface it instead of silently returning partial JSON.
        logger.warn(
          '[WebGPU] Generation reached the max_tokens cap (finish_reason=length); ' +
            'strategic JSON may be truncated this cycle.'
        );
      }
      const text = this.stripReasoning(response.text);

      // Reset the breaker fully on success.
      this.resetCircuitBreaker();

      return text || null;
    } catch (error) {
      this.recordFailure();
      logger.error('[WebGPU] Generation failed:', error);
      this.dropIfGone(engine, error);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * One answer that gives way to scoring calls, for a single loaded copy. It
   * streams through the raw completion API with the build's template. When a
   * scoring call is waiting, it interrupts at the next token and drains the
   * stream, which frees the model. It then lets every waiting call run and
   * continues from the prompt plus its own text, with the tokens left. Measured
   * in Chrome on Qwen3.5-4B through this client, 2026-10-25: a routing call 3 s
   * into a strategic answer took 5.8 and 7.3 s (2.0 s alone, 27.9 s queued
   * behind the answer), and both continued answers parsed and named the faulty
   * machine. Each pause costs a prefill of the prompt and the text so far: the
   * paused answers took 1.5 and 9.5 s longer than the unpaused ones run beside
   * them, which themselves differed by 7.4 s. web-llm 0.2.86 resets its
   * interrupt flag when a request starts, so the interrupt is raised from a
   * received token, never before the answer's request has begun.
   */
  private async generatePausable(
    engine: WebWorkerMLCEngine,
    prompt: string,
    run: PausableRun
  ): Promise<{ text: string; finish: string | null }> {
    let text = '';
    let tokens = 0;
    let pauses = 0;
    for (;;) {
      // A deadline passed during a pause must not cost another prefill.
      if (run.stopped) return { text, finish: 'abort' };
      const stream = await engine.completions.create({
        prompt: prompt + text,
        stream: true,
        stream_options: { include_usage: true },
        temperature: GENERATION_CONFIG.temperature,
        top_p: GENERATION_CONFIG.top_p,
        max_tokens: GENERATION_CONFIG.max_tokens - tokens,
      });
      let finish: string | null = null;
      let interrupted = false;
      let chunks = 0;
      let counted: number | undefined;
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice?.text) {
          text += choice.text;
          chunks += 1;
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) counted = chunk.usage.completion_tokens;
        // The stream runs on to its final chunk after this; only then is the model free.
        if (!interrupted && (run.stopped || (this.waitingScores.size > 0 && pauses < MAX_PAUSES))) {
          interrupted = true;
          engine.interruptGenerate();
        }
      }
      tokens += counted ?? chunks;
      if (run.stopped) return { text, finish: 'abort' };
      if (!interrupted || finish !== 'abort' || tokens >= GENERATION_CONFIG.max_tokens) {
        return { text, finish: finish === 'abort' ? 'length' : finish };
      }
      pauses += 1;
      run.pausedSince = Date.now();
      while (this.waitingScores.size > 0) {
        await Promise.allSettled([...this.waitingScores]);
      }
      run.pausedMs += Date.now() - run.pausedSince;
      run.pausedSince = null;
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
   * the engine itself: with the fast lane it runs beside a strategic
   * generation, and without one a pausable generation gives way to it
   * (generatePausable); any other waits it out.
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
        // The fast lane when there is one, so a strategic generation never holds this up.
        ...(this.fastLaneId ? { model: this.fastLaneId } : {}),
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
      const settled = Promise.race([completion, stop]);
      // A pausing answer continues only once every call registered here has settled.
      if (!this.fastLaneId) this.waitingScores.add(settled);
      const response = await settled.finally(() => this.waitingScores.delete(settled));
      if (response === null) return null;
      const top = response.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
      return top.map((entry) => ({ token: entry.token, probability: Math.exp(entry.logprob) }));
    } catch (error) {
      this.recordFailure();
      logger.error('[WebGPU] Next-token scoring failed:', error);
      this.dropIfGone(engine, error);
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

  /** Whether the pinned copy, the one load() uses, is downloaded. */
  static async isModelCached(modelId: string = DEFAULT_WEBGPU_MODEL_ID): Promise<boolean> {
    try {
      const { hasModelInCache, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
      for (const backend of CACHE_BACKENDS) {
        const config = pinnedAppConfig(prebuiltAppConfig, modelId, null, backend);
        if (await hasModelInCache(modelId, config).catch(() => false)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Delete the pinned copy from either store, and the unpinned one an earlier
   * version of this app downloaded from `resolve/main` (different URLs, so a
   * different cache entry).
   */
  static async deleteModelCache(modelId: string = DEFAULT_WEBGPU_MODEL_ID): Promise<void> {
    const { deleteModelAllInfoInCache, prebuiltAppConfig } = await import('@mlc-ai/web-llm');
    const configs = [
      ...CACHE_BACKENDS.map((backend) =>
        pinnedAppConfig(prebuiltAppConfig, modelId, null, backend)
      ),
      prebuiltAppConfig,
    ];
    // Most players never used IndexedDB: one store's failure must not stop the others.
    let failure: unknown = null;
    for (const config of configs) {
      try {
        await deleteModelAllInfoInCache(modelId, config);
      } catch (error) {
        logger.warn(`[WebGPU] Could not clear one store for ${modelId}:`, error);
        failure ??= error;
      }
    }
    // A failure that left a copy behind is still a failure to delete; say so.
    if (failure !== null && (await WebGPUClient.isModelCached(modelId))) throw failure;
  }

  /**
   * After a pinned load, drop the unpinned copy left by an earlier version of
   * this app, so a player does not keep two downloads of the same model. Never
   * fails a load: a cache that cannot be read is left as it is.
   */
  private static async dropUnpinnedCopy(modelId: string): Promise<void> {
    try {
      const { hasModelInCache, deleteModelAllInfoInCache, prebuiltAppConfig } =
        await import('@mlc-ai/web-llm');
      const record = prebuiltAppConfig.model_list.find((entry) => entry.model_id === modelId);
      if (!record || pinnedModelRecord(record) === record) return;
      if (!(await hasModelInCache(modelId, prebuiltAppConfig))) return;
      await deleteModelAllInfoInCache(modelId, prebuiltAppConfig);
      logger.info(`[WebGPU] Removed the unpinned download of ${modelId}`);
    } catch (error) {
      logger.warn('[WebGPU] Could not check for an unpinned download:', error);
    }
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
