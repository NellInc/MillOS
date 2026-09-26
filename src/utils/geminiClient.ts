/**
 * Gemini Flash Client for MillOS Plant Management
 *
 * SDK wrapper with:
 * - Model fallback chain (stable GA model first, survives model deprecations)
 * - Circuit breaker for API resilience
 * - Connection state management
 * - Context length protection (token limits)
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { logger } from './logger';

/**
 * Model fallback chain, tried in order. A model-not-found / not-supported
 * error advances to the next candidate instead of killing the AI layer —
 * the previous hardcoded single ID ('gemini-3-flash-preview') left live AI
 * silently dead once that preview model was retired.
 *
 * Verified against https://ai.google.dev/gemini-api/docs/latest-model (August 2026):
 * - gemini-3.6-flash: stable GA and the recommended 3.5 Flash migration target
 * - gemini-3.5-flash: stable GA fallback
 * - gemini-3-flash-preview: preview tier (restrictive rate limits)
 * - gemini-2.5-flash: legacy stable, shutdown announced for 2026-10-16
 */
export const GEMINI_MODEL_CANDIDATES = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_CANDIDATES)[number];

// Error patterns indicating the model ID itself is invalid/retired (vs a
// transient failure). Matches the legacy SDK's surfaced REST errors, e.g.
// "[404 Not Found] models/x is not found for API version v1beta, or is not
// supported for generateContent."
const MODEL_UNAVAILABLE_PATTERNS = ['is not found', 'not supported for', '404'] as const;

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Context limit protection
const MAX_PROMPT_CHARS = 24000; // ~6.8k tokens, safe for 32k context window
const MAX_PROMPT_TOKENS_ESTIMATE = 7000; // Leave headroom for response
// Conservative estimate: Gemini tokenizers vary 2.5-5.5 chars/token depending on
// content (code/structured ~2.5-3, English prose ~4, whitespace-heavy ~5+). 3.5
// adds margin so estimated token counts under-shoot less often than 4 would.
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30000; // 30 seconds

// MillOS decisions are interactive and must yield to the heuristic layer rather
// than holding plant-state prompts forever when the provider transport stalls.
// Eight provider-bound prompt copies cap at roughly 192 KB after truncation;
// exact-match keys retain the raw input and therefore have a separate cap below.
export const GEMINI_REQUEST_TIMEOUT_MS = 15000;
export const GEMINI_MAX_IN_FLIGHT_REQUESTS = 8;
// The provider sees only MAX_PROMPT_CHARS after truncation, but exact cache and
// coalescing keys retain the caller's original string. Cap that raw key so a
// handful of adversarial prompts cannot pin unbounded memory while preserving
// ample room for the largest generated plant-state prompt.
export const GEMINI_MAX_RAW_PROMPT_CHARS = 128 * 1024;

// Error patterns that indicate context overflow
const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'token limit',
  'too long',
  'maximum context',
  'exceeds the limit',
  'input too large',
] as const;

type RequestCancellationReason = 'timeout' | 'invalidated';

interface RequestControl {
  readonly signal: AbortSignal;
  readonly cancellation: Promise<never>;
  reason: RequestCancellationReason | null;
  cancel: (reason: RequestCancellationReason) => void;
  finish: () => void;
}

interface InFlightRequest {
  promise: Promise<string | null>;
}

class GeminiRequestTimeoutError extends Error {
  constructor() {
    super(`Request timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`);
    this.name = 'GeminiRequestTimeoutError';
  }
}

class GeminiRequestInvalidatedError extends Error {
  constructor() {
    super('Client state changed during provider request');
    this.name = 'GeminiRequestInvalidatedError';
  }
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private modelIndex = 0;
  private apiKey: string | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };
  private lastContextOverflow: boolean = false;
  private requestEpoch = 0;
  private inFlightRequests = new Map<string, InFlightRequest>();
  private activeRequestControls = new Set<RequestControl>();

  // Response cache for similar contexts
  private responseCache: Map<string, { response: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 second TTL
  private readonly CACHE_MAX_SIZE = 10;

  /**
   * Check the bounded cache for an exact prompt. The full string is the key,
   * avoiding the false hits that a lossy numeric normalizer or 32-bit hash can
   * produce for different plant states.
   */
  private getCachedResponse(prompt: string): string | null {
    const cached = this.responseCache.get(prompt);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      logger.info('[GeminiClient] Cache hit for strategic decision');
      return cached.response;
    }

    // Clean up expired entry
    if (cached) {
      this.responseCache.delete(prompt);
    }

    return null;
  }

  /**
   * Store response in cache
   */
  private setCachedResponse(prompt: string, response: string): void {
    // Evict oldest if at capacity
    if (this.responseCache.size >= this.CACHE_MAX_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(prompt, { response, timestamp: Date.now() });
  }

  /**
   * Initialize the Gemini client with an API key
   */
  initialize(apiKey: string): boolean {
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      logger.warn('[GeminiClient] Refusing to initialize with an empty API key');
      return false;
    }

    try {
      this.invalidateOutstandingRequests();
      this.apiKey = apiKey.trim();
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.modelIndex = 0;
      this.buildModel();

      // Reset circuit breaker on successful init
      this.resetCircuitBreaker();

      logger.info(`[GeminiClient] Initialized with ${this.getActiveModelId()}`);
      return true;
    } catch (error) {
      logger.error('[GeminiClient] Failed to initialize:', error);
      this.disconnect();
      return false;
    }
  }

  /** Instantiate the SDK model for the current candidate. */
  private buildModel(): void {
    if (!this.genAI) return;
    this.model = this.genAI.getGenerativeModel({
      model: GEMINI_MODEL_CANDIDATES[this.modelIndex],
      generationConfig: {
        maxOutputTokens: 2048,
      },
    });
  }

  /** The model ID currently in use (for UI display and cost tracking). */
  getActiveModelId(): GeminiModelId {
    return GEMINI_MODEL_CANDIDATES[this.modelIndex];
  }

  /** Whether an error means the model ID itself is invalid/retired. */
  private isModelUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return MODEL_UNAVAILABLE_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
  }

  /**
   * Advance to the next model candidate. Returns false when the chain is
   * exhausted (model stays on the last candidate; circuit breaker takes over).
   */
  private advanceModel(): boolean {
    if (this.modelIndex >= GEMINI_MODEL_CANDIDATES.length - 1) {
      logger.error('[GeminiClient] All model candidates unavailable:', GEMINI_MODEL_CANDIDATES);
      return false;
    }
    const previous = this.getActiveModelId();
    this.modelIndex++;
    this.buildModel();
    logger.warn(
      `[GeminiClient] Model ${previous} unavailable — falling back to ${this.getActiveModelId()}`
    );
    return true;
  }

  /**
   * Check if client is connected and ready
   */
  isConnected(): boolean {
    // Let an open breaker half-open once its cool-down has elapsed. Callers
    // gate on isConnected() before ever reaching generateContent(), so without
    // this the breaker could never reset and the strategic layer stayed dead.
    this.checkCircuitBreaker();
    return this.model !== null && !this.circuitBreaker.isOpen;
  }

  /**
   * Get the current API key (masked for display)
   */
  getMaskedApiKey(): string | null {
    if (!this.apiKey) return null;
    if (this.apiKey.length <= 8) return '****';
    return `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}`;
  }

  /**
   * Disconnect and clear the client
   */
  disconnect(): void {
    this.invalidateOutstandingRequests();
    this.genAI = null;
    this.model = null;
    this.apiKey = null;
    this.modelIndex = 0;
    logger.info('[GeminiClient] Disconnected');
  }

  /**
   * Check if circuit breaker should reset
   */
  private checkCircuitBreaker(): void {
    if (
      this.circuitBreaker.isOpen &&
      Date.now() - this.circuitBreaker.lastFailure >= CIRCUIT_BREAKER_RESET_MS
    ) {
      this.resetCircuitBreaker();
      logger.info('[GeminiClient] Circuit breaker reset');
    }
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      logger.warn(
        '[GeminiClient] Circuit breaker opened after failures:',
        this.circuitBreaker.failures
      );
    }
  }

  /**
   * Reset the circuit breaker
   */
  private resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };
  }

  /** Invalidate work and cached responses belonging to an old credential session. */
  private invalidateOutstandingRequests(): void {
    this.requestEpoch++;
    for (const control of this.activeRequestControls) {
      control.cancel('invalidated');
    }
    this.activeRequestControls.clear();
    this.inFlightRequests.clear();
    this.responseCache.clear();
    this.lastContextOverflow = false;
  }

  /**
   * Create one bounded provider-call lifetime. The SDK supports both timeout
   * and AbortSignal request options; the local rejection is retained because a
   * transport or test double can ignore either option and otherwise hang the
   * caller indefinitely.
   */
  private beginRequest(): RequestControl {
    const controller = new AbortController();
    let rejectCancellation!: (error: Error) => void;
    let finished = false;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });

    const control: RequestControl = {
      signal: controller.signal,
      cancellation,
      reason: null,
      cancel: (reason) => {
        if (finished || control.reason !== null) return;
        control.reason = reason;
        rejectCancellation(
          reason === 'timeout'
            ? new GeminiRequestTimeoutError()
            : new GeminiRequestInvalidatedError()
        );
        controller.abort();
      },
      finish: () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
      },
    };

    const timeoutId = setTimeout(() => control.cancel('timeout'), GEMINI_REQUEST_TIMEOUT_MS);
    this.activeRequestControls.add(control);
    return control;
  }

  private finishRequest(control: RequestControl): void {
    control.finish();
    this.activeRequestControls.delete(control);
  }

  private requestModel(
    model: GenerativeModel,
    prompt: string,
    control: RequestControl
  ): ReturnType<GenerativeModel['generateContent']> {
    const providerRequest = model.generateContent(prompt, {
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
      signal: control.signal,
    });
    return Promise.race([providerRequest, control.cancellation]);
  }

  /**
   * Estimate token count from character length (conservative)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
  }

  /**
   * Truncate prompt to stay within safe token limits
   * Preserves the structure by truncating the middle content
   */
  private truncatePrompt(prompt: string): string {
    if (prompt.length <= MAX_PROMPT_CHARS) {
      return prompt;
    }

    logger.warn(
      `[GeminiClient] Truncating prompt from ${prompt.length} to ${MAX_PROMPT_CHARS} chars`
    );

    // Find a safe split point - preserve the beginning (context) and end (instructions)
    const keepStart = Math.floor(MAX_PROMPT_CHARS * 0.6); // 60% from start
    const keepEnd = Math.floor(MAX_PROMPT_CHARS * 0.35); // 35% from end (5% for truncation notice)

    // Avoid cutting between UTF-16 surrogate pairs. A lone surrogate is
    // malformed input for the SDK's JSON transport and corrupts the prompt.
    let startEnd = keepStart;
    if (
      prompt.charCodeAt(startEnd - 1) >= 0xd800 &&
      prompt.charCodeAt(startEnd - 1) <= 0xdbff &&
      prompt.charCodeAt(startEnd) >= 0xdc00 &&
      prompt.charCodeAt(startEnd) <= 0xdfff
    ) {
      startEnd--;
    }

    let endStart = prompt.length - keepEnd;
    if (
      prompt.charCodeAt(endStart - 1) >= 0xd800 &&
      prompt.charCodeAt(endStart - 1) <= 0xdbff &&
      prompt.charCodeAt(endStart) >= 0xdc00 &&
      prompt.charCodeAt(endStart) <= 0xdfff
    ) {
      endStart++;
    }

    const truncated =
      prompt.slice(0, startEnd) +
      '\n\n[... context truncated for token limits ...]\n\n' +
      prompt.slice(endStart);

    return truncated;
  }

  /**
   * Check if an error indicates context overflow
   */
  private isContextOverflowError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMsg = error.message.toLowerCase();
    return CONTEXT_OVERFLOW_PATTERNS.some((pattern) => errorMsg.includes(pattern.toLowerCase()));
  }

  /**
   * Generate content with the Gemini model
   * Includes token estimation, safe truncation, and context overflow detection
   */
  generateContent(prompt: string): Promise<string | null> {
    this.checkCircuitBreaker();

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      logger.warn('[GeminiClient] Refusing to generate content for an empty prompt');
      return Promise.resolve(null);
    }

    if (prompt.length > GEMINI_MAX_RAW_PROMPT_CHARS) {
      logger.warn(
        `[GeminiClient] Refusing prompt above ${GEMINI_MAX_RAW_PROMPT_CHARS} retained characters`
      );
      return Promise.resolve(null);
    }

    if (!this.model) {
      logger.warn('[GeminiClient] Model not initialized');
      return Promise.resolve(null);
    }

    // Cached work needs no provider call and remains useful during an outage.
    const cachedResponse = this.getCachedResponse(prompt);
    if (cachedResponse !== null) {
      this.lastContextOverflow = false;
      return Promise.resolve(cachedResponse);
    }

    const existingRequest = this.inFlightRequests.get(prompt);
    if (existingRequest) {
      return existingRequest.promise;
    }

    if (this.circuitBreaker.isOpen) {
      logger.warn('[GeminiClient] Circuit breaker is open, skipping request');
      return Promise.resolve(null);
    }

    if (this.activeRequestControls.size >= GEMINI_MAX_IN_FLIGHT_REQUESTS) {
      logger.warn('[GeminiClient] Provider request capacity reached, skipping unique prompt');
      return Promise.resolve(null);
    }

    // Estimate and log token usage
    const estimatedTokens = this.estimateTokens(prompt);
    if (estimatedTokens > MAX_PROMPT_TOKENS_ESTIMATE) {
      logger.warn(`[GeminiClient] Prompt exceeds safe limit (${estimatedTokens} estimated tokens)`);
    }

    // Safe truncation if needed
    const safePrompt = this.truncatePrompt(prompt);
    const requestEpoch = this.requestEpoch;
    const control = this.beginRequest();
    const request = this.generateUncached(prompt, safePrompt, requestEpoch, control).finally(() => {
      this.finishRequest(control);
      if (this.inFlightRequests.get(prompt)?.promise === request) {
        this.inFlightRequests.delete(prompt);
      }
    });
    this.inFlightRequests.set(prompt, { promise: request });
    return request;
  }

  private async generateUncached(
    originalPrompt: string,
    safePrompt: string,
    requestEpoch: number,
    control: RequestControl
  ): Promise<string | null> {
    // One attempt per model candidate: a retired/invalid model ID advances
    // the fallback chain instead of opening the circuit breaker.
    for (;;) {
      const model = this.model;
      if (!model) return null;
      const attemptedModelIndex = this.modelIndex;
      try {
        const result = await this.requestModel(model, safePrompt, control);
        if (requestEpoch !== this.requestEpoch) return null;
        const response = result.response;
        const text = response.text();

        // Guard against empty/null model output before caching, so a transient
        // empty response is not cached and silently returned for future prompts
        if (typeof text !== 'string' || text.trim().length === 0) {
          logger.warn('[GeminiClient] Empty response from model');
          this.recordFailure();
          return null;
        }

        // Reset failures and overflow state on success
        this.circuitBreaker.failures = 0;
        this.lastContextOverflow = false;

        // Cache the successful response
        this.setCachedResponse(originalPrompt, text);

        return text;
      } catch (error) {
        if (requestEpoch !== this.requestEpoch || control.reason === 'invalidated') return null;

        if (control.reason === 'timeout') {
          this.recordFailure();
          logger.error('[GeminiClient] Generation deadline exceeded');
          return null;
        }

        // Check for context overflow specifically
        if (this.isContextOverflowError(error)) {
          this.lastContextOverflow = true;
          logger.error('[GeminiClient] Context overflow detected - falling back to heuristic');
          // Don't count overflow as circuit breaker failure
          return null;
        }

        // Retired/invalid model ID: try the next candidate in the chain
        if (this.isModelUnavailableError(error)) {
          // Another concurrent request may already have advanced this exact
          // retired model. Reuse its result instead of skipping a candidate.
          if (this.modelIndex !== attemptedModelIndex || this.advanceModel()) {
            continue;
          }
        }

        this.recordFailure();
        logger.error('[GeminiClient] Generation failed:', error);
        return null;
      }
    }
  }

  /**
   * Test connection with a simple prompt
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    this.checkCircuitBreaker();

    if (!this.model) {
      return { success: false, message: 'Client not initialized' };
    }

    if (this.circuitBreaker.isOpen) {
      return { success: false, message: 'Circuit breaker is open' };
    }

    if (this.activeRequestControls.size >= GEMINI_MAX_IN_FLIGHT_REQUESTS) {
      return { success: false, message: 'Provider request capacity reached' };
    }

    const requestEpoch = this.requestEpoch;
    const control = this.beginRequest();
    try {
      for (;;) {
        const model = this.model;
        if (!model) return { success: false, message: 'Client not initialized' };
        const attemptedModelIndex = this.modelIndex;
        try {
          const result = await this.requestModel(
            model,
            'Reply with exactly: "MillOS connection successful"',
            control
          );
          if (requestEpoch !== this.requestEpoch) {
            return { success: false, message: 'Client state changed during connection test' };
          }
          const text = result.response.text();

          if (typeof text !== 'string' || text.trim().length === 0) {
            this.recordFailure();
            return { success: false, message: 'Empty response from model' };
          }

          // Reset failures on a successful connection
          this.circuitBreaker.failures = 0;

          if (text.toLowerCase().includes('successful')) {
            return { success: true, message: `Connection verified (${this.getActiveModelId()})` };
          }

          return { success: true, message: `Connected (${this.getActiveModelId()})` };
        } catch (error) {
          if (requestEpoch !== this.requestEpoch || control.reason === 'invalidated') {
            return { success: false, message: 'Client state changed during connection test' };
          }

          if (control.reason === 'timeout') {
            this.recordFailure();
            return { success: false, message: new GeminiRequestTimeoutError().message };
          }

          // Retired/invalid model ID: try the next candidate in the chain
          if (this.isModelUnavailableError(error)) {
            if (this.modelIndex !== attemptedModelIndex || this.advanceModel()) {
              continue;
            }
          }

          this.recordFailure();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, message: errorMessage };
        }
      }
    } finally {
      this.finishRequest(control);
    }
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Check if the last request failed due to context overflow
   * Useful for diagnostics and graceful degradation decisions
   */
  hadContextOverflow(): boolean {
    return this.lastContextOverflow;
  }
}

// Singleton instance
export const geminiClient = new GeminiClient();
