/**
 * Gemini 3 Flash Client for MillOS Plant Management
 *
 * SDK wrapper with:
 * - thinkingLevel: 'high' for strategic plant decisions
 * - Circuit breaker for API resilience
 * - Connection state management
 * - Context length protection (token limits)
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { logger } from './logger';

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Context limit protection
const MAX_PROMPT_CHARS = 28000; // ~7k tokens, safe for 32k context window
const MAX_PROMPT_TOKENS_ESTIMATE = 7000; // Leave headroom for response
const CHARS_PER_TOKEN_ESTIMATE = 4; // Conservative estimate

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
   * Simple hash function for cache keys
   */
  private hashPrompt(prompt: string): string {
    // Extract key metrics for hashing (first 200 chars + length)
    const keyPart = prompt.slice(0, 200).replace(/\d+/g, 'N'); // Normalize numbers
    let hash = 0;
    for (let i = 0; i < keyPart.length; i++) {
      const char = keyPart.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `cache-${hash}-${prompt.length}`;
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

      // Configure model with high thinking level for strategic decisions
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });

      // Reset circuit breaker on successful init
      this.resetCircuitBreaker();

      logger.info('[GeminiClient] Initialized with Gemini 2.0 Flash');
      return true;
    } catch (error) {
      logger.error('[GeminiClient] Failed to initialize:', error);
      this.disconnect();
      return false;
    }
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

    try {
      const result = await this.model.generateContent(safePrompt);
      const response = result.response;
      const text = response.text();

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

      this.recordFailure();
      logger.error('[GeminiClient] Generation failed:', error);
      return null;
    }
  }

  /**
   * Test connection with a simple prompt
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.model) {
      return { success: false, message: 'Client not initialized' };
    }

    try {
      const result = await this.model.generateContent(
        'Reply with exactly: "MillOS connection successful"'
      );
      const text = result.response.text();

      if (text.toLowerCase().includes('successful')) {
        return { success: true, message: 'Connection verified' };
      }

      return { success: true, message: 'Connected (response received)' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: errorMessage };
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
