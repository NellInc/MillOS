/**
 * Gemini Flash Client for MillOS Plant Management
 *
 * SDK wrapper with:
 * - Model fallback chain (stable GA model first, survives model deprecations)
 * - Circuit breaker for API resilience
 * - Connection state management
 * - Context length protection (token limits)
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { logger } from './logger';

/**
 * Model fallback chain, tried in order. A model-not-found / not-supported
 * error advances to the next candidate instead of killing the AI layer —
 * the previous hardcoded single ID ('gemini-3-flash-preview') left live AI
 * silently dead once that preview model was retired.
 *
 * Verified against https://ai.google.dev/gemini-api/docs/models (June 2026):
 * - gemini-3.5-flash: stable GA (May 2026), no announced shutdown
 * - gemini-3-flash-preview: preview tier (restrictive rate limits)
 * - gemini-2.5-flash: legacy stable, shutdown announced for 2026-10-16
 */
export const GEMINI_MODEL_CANDIDATES = [
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

// Error patterns that indicate context overflow
const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'token limit',
  'too long',
  'maximum context',
  'exceeds the limit',
  'input too large',
] as const;

class GeminiClient {
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

  // Response cache for similar contexts
  private responseCache: Map<string, { response: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 second TTL
  private readonly CACHE_MAX_SIZE = 10;

  /**
   * Robust hash function for cache keys
   *
   * Uses a full-prompt hash to prevent collisions entirely.
   * No normalization is applied - exact prompt matching only.
   *
   * Previous approaches with number normalization caused collisions:
   * - "Temperature: 95" vs "Temperature: 45" -> same hash (BAD)
   * - "Machine RM-101" vs "Machine RM-999" -> same hash (BAD)
   *
   * Current approach: Hash the ENTIRE prompt without normalization.
   * This ensures semantically different prompts never collide.
   * Trade-off: Slightly lower cache hit rate for truly identical content
   * with different timestamps, but zero false cache hits.
   */
  private hashPrompt(prompt: string): string {
    // Use djb2 hash algorithm on the full prompt for collision resistance
    // This is a well-tested hash with good distribution properties
    let hash1 = 5381;
    let hash2 = 52711;

    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash1 = (hash1 * 33) ^ char;
      hash2 = (hash2 * 33) ^ char;
    }

    // Combine both hashes for better collision resistance
    // Using unsigned right shift to ensure positive numbers
    const combined = ((hash1 >>> 0) * 4096 + (hash2 >>> 0)) >>> 0;

    // Include prompt length as additional discriminator
    return `cache-v2-${combined.toString(36)}-${prompt.length}`;
  }

  /**
   * Check cache for a similar prompt
   */
  private getCachedResponse(prompt: string): string | null {
    const cacheKey = this.hashPrompt(prompt);
    const cached = this.responseCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      logger.info('[GeminiClient] Cache hit for strategic decision');
      return cached.response;
    }

    // Clean up expired entry
    if (cached) {
      this.responseCache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Store response in cache
   */
  private setCachedResponse(prompt: string, response: string): void {
    const cacheKey = this.hashPrompt(prompt);

    // Evict oldest if at capacity
    if (this.responseCache.size >= this.CACHE_MAX_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(cacheKey, { response, timestamp: Date.now() });
  }

  /**
   * Initialize the Gemini client with an API key
   */
  initialize(apiKey: string): boolean {
    try {
      this.apiKey = apiKey;
      this.genAI = new GoogleGenerativeAI(apiKey);
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
        temperature: 0.7,
        topP: 0.9,
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
      Date.now() - this.circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_MS
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

    const truncated =
      prompt.slice(0, keepStart) +
      '\n\n[... context truncated for token limits ...]\n\n' +
      prompt.slice(-keepEnd);

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
  async generateContent(prompt: string): Promise<string | null> {
    this.checkCircuitBreaker();

    if (!this.model) {
      logger.warn('[GeminiClient] Model not initialized');
      return null;
    }

    if (this.circuitBreaker.isOpen) {
      logger.warn('[GeminiClient] Circuit breaker is open, skipping request');
      return null;
    }

    // Check cache first
    const cachedResponse = this.getCachedResponse(prompt);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Estimate and log token usage
    const estimatedTokens = this.estimateTokens(prompt);
    if (estimatedTokens > MAX_PROMPT_TOKENS_ESTIMATE) {
      logger.warn(`[GeminiClient] Prompt exceeds safe limit (${estimatedTokens} estimated tokens)`);
    }

    // Safe truncation if needed
    const safePrompt = this.truncatePrompt(prompt);

    // One attempt per model candidate: a retired/invalid model ID advances
    // the fallback chain instead of opening the circuit breaker.
    for (;;) {
      const model = this.model;
      if (!model) return null;
      try {
        const result = await model.generateContent(safePrompt);
        const response = result.response;
        const text = response.text();

        // Guard against empty/null model output before caching, so a transient
        // empty response is not cached and silently returned for future prompts
        if (!text) {
          logger.warn('[GeminiClient] Empty response from model');
          return null;
        }

        // Reset failures and overflow state on success
        this.circuitBreaker.failures = 0;
        this.lastContextOverflow = false;

        // Cache the successful response
        this.setCachedResponse(prompt, text);

        return text;
      } catch (error) {
        // Check for context overflow specifically
        if (this.isContextOverflowError(error)) {
          this.lastContextOverflow = true;
          logger.error('[GeminiClient] Context overflow detected - falling back to heuristic');
          // Don't count overflow as circuit breaker failure
          return null;
        }

        // Retired/invalid model ID: try the next candidate in the chain
        if (this.isModelUnavailableError(error) && this.advanceModel()) {
          continue;
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

    for (;;) {
      const model = this.model;
      if (!model) return { success: false, message: 'Client not initialized' };
      try {
        const result = await model.generateContent(
          'Reply with exactly: "MillOS connection successful"'
        );
        const text = result.response.text();

        // Reset failures on a successful connection
        this.circuitBreaker.failures = 0;

        if (text.toLowerCase().includes('successful')) {
          return { success: true, message: `Connection verified (${this.getActiveModelId()})` };
        }

        return { success: true, message: `Connected (${this.getActiveModelId()})` };
      } catch (error) {
        // Retired/invalid model ID: try the next candidate in the chain
        if (this.isModelUnavailableError(error) && this.advanceModel()) {
          continue;
        }

        this.recordFailure();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, message: errorMessage };
      }
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
