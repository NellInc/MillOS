/**
 * API Security Utilities
 *
 * UNUSED AT RUNTIME: nothing in src/ imports this module. It is scaffolding
 * for a possible future server-side auth integration and is NOT wired into any
 * active code path. The CSRF/JWT/secureFetch helpers below do not establish an
 * auth or CSRF posture for the current frontend-only app; they validate nothing
 * until a backend exists. Treat as a library stub, not as active protection.
 *
 * Client-side security utilities for API interactions including:
 * - Rate limiting (debounce/throttle)
 * - Request validation
 * - Token management utilities (for future auth integration)
 * - CSRF protection helpers
 *
 * OWASP References:
 * - A01:2021 - Broken Access Control
 * - A07:2021 - Identification and Authentication Failures
 * https://owasp.org/Top10/
 */

import { logger } from './logger';

// Local type definition (auditStore not yet implemented)
type AuditEventType =
  | 'api_request'
  | 'api_error'
  | 'rate_limit'
  | 'rate_limit_exceeded'
  | 'security_event';

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Rate limiter bucket for tracking request counts per endpoint
 */
interface RateLimitBucket {
  count: number;
  firstRequest: number;
  windowMs: number;
  maxRequests: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Key to identify the rate limit bucket (e.g., endpoint name) */
  key: string;
}

// Global rate limit storage (per-session, not persisted)
const rateLimitBuckets: Map<string, RateLimitBucket> = new Map();

/**
 * Check if a request is rate limited.
 * Returns true if the request should be blocked.
 *
 * @param config - Rate limit configuration
 * @returns Object with limited status and remaining info
 */
export function checkRateLimit(config: RateLimitConfig): {
  limited: boolean;
  remaining: number;
  resetMs: number;
} {
  const { key, windowMs, maxRequests } = config;
  const now = Date.now();

  let bucket = rateLimitBuckets.get(key);

  // Create or reset bucket if expired
  if (!bucket || now - bucket.firstRequest > bucket.windowMs) {
    bucket = {
      count: 0,
      firstRequest: now,
      windowMs,
      maxRequests,
    };
    rateLimitBuckets.set(key, bucket);
  }

  // Check if limit exceeded
  if (bucket.count >= bucket.maxRequests) {
    const resetMs = bucket.firstRequest + bucket.windowMs - now;
    return {
      limited: true,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  // Increment count and allow
  bucket.count++;

  return {
    limited: false,
    remaining: bucket.maxRequests - bucket.count,
    resetMs: bucket.firstRequest + bucket.windowMs - now,
  };
}

/**
 * Pre-configured rate limiters for common operations
 */
export const rateLimiters = {
  /**
   * Gemini API calls - limit to prevent quota exhaustion
   * 10 requests per 10 seconds
   */
  gemini: (callback: () => void) => {
    const result = checkRateLimit({
      key: 'gemini-api',
      windowMs: 10000,
      maxRequests: 10,
    });

    if (result.limited) {
      logger.warn('[RateLimit] Gemini API rate limited', {
        resetMs: result.resetMs,
      });
      return false;
    }

    callback();
    return true;
  },

  /**
   * Multiplayer chat - limit spam
   * 5 messages per 5 seconds
   */
  chat: (callback: () => void) => {
    const result = checkRateLimit({
      key: 'multiplayer-chat',
      windowMs: 5000,
      maxRequests: 5,
    });

    if (result.limited) {
      logger.warn('[RateLimit] Chat rate limited');
      return false;
    }

    callback();
    return true;
  },

  /**
   * Connection attempts - prevent reconnection storms
   * 3 attempts per 10 seconds
   */
  connect: (callback: () => void) => {
    const result = checkRateLimit({
      key: 'connection-attempt',
      windowMs: 10000,
      maxRequests: 3,
    });

    if (result.limited) {
      logger.warn('[RateLimit] Connection attempts rate limited', {
        resetMs: result.resetMs,
      });
      return false;
    }

    callback();
    return true;
  },
};

// =============================================================================
// DEBOUNCE / THROTTLE UTILITIES
// =============================================================================

/**
 * Create a debounced function that delays execution until after
 * the specified delay has passed since the last call.
 *
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function with cancel method
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Create a throttled function that limits execution to at most
 * once per specified interval.
 *
 * @param fn - Function to throttle
 * @param intervalMs - Minimum interval between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, intervalMs: number): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    } else {
      // Schedule trailing call
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
        timeoutId = null;
      }, intervalMs - timeSinceLastCall);
    }
  }) as T;
}

// =============================================================================
// TOKEN VALIDATION UTILITIES
// =============================================================================

/**
 * JWT-like token structure (for future auth integration)
 */
export interface TokenPayload {
  sub: string; // Subject (user ID)
  exp: number; // Expiration timestamp (seconds)
  iat: number; // Issued at timestamp (seconds)
  iss?: string; // Issuer
  aud?: string; // Audience
  roles?: string[]; // User roles
}

/**
 * Decode a JWT token payload without verification.
 * WARNING: This does NOT verify the signature. Server must verify.
 * Use only for client-side token inspection.
 *
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function decodeTokenPayload(token: unknown): TokenPayload | null {
  if (typeof token !== 'string' || !token.trim()) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    logger.warn('[TokenValidation] Invalid token format');
    return null;
  }

  try {
    // Decode base64url payload
    const payloadPart = parts[1] ?? '';
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload) as TokenPayload;
  } catch {
    logger.warn('[TokenValidation] Failed to decode token payload');
    return null;
  }
}

/**
 * Check if a token is expired (client-side check).
 * Server must also validate expiration.
 *
 * @param token - JWT token or decoded payload
 * @param bufferSeconds - Buffer time before actual expiration (default: 30)
 * @returns True if token is expired or will expire within buffer
 */
export function isTokenExpired(token: string | TokenPayload | null, bufferSeconds = 30): boolean {
  const payload = typeof token === 'string' ? decodeTokenPayload(token) : token;

  if (!payload || typeof payload.exp !== 'number') {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp < nowSeconds + bufferSeconds;
}

/**
 * Get time until token expiration in seconds.
 *
 * @param token - JWT token or decoded payload
 * @returns Seconds until expiration, or 0 if expired/invalid
 */
export function getTokenExpiresIn(token: string | TokenPayload | null): number {
  const payload = typeof token === 'string' ? decodeTokenPayload(token) : token;

  if (!payload || typeof payload.exp !== 'number') {
    return 0;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - nowSeconds);
}

// =============================================================================
// CSRF PROTECTION
// =============================================================================

/**
 * Generate a CSRF token for forms.
 * This should be included in requests and validated server-side.
 *
 * @returns Random CSRF token string
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * CSRF token storage key
 */
const CSRF_TOKEN_KEY = 'millos_csrf_token';

/**
 * Get or create a CSRF token for the current session.
 * Token is stored in sessionStorage (cleared on tab close).
 *
 * @returns CSRF token string
 */
export function getOrCreateCsrfToken(): string {
  let token = sessionStorage.getItem(CSRF_TOKEN_KEY);

  if (!token) {
    token = generateCsrfToken();
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  }

  return token;
}

/**
 * Clear the stored CSRF token (e.g., on logout).
 */
export function clearCsrfToken(): void {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
}

// =============================================================================
// REQUEST VALIDATION
// =============================================================================

/**
 * Allowed HTTP methods for API requests
 */
export type AllowedHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request validation options
 */
export interface RequestValidationOptions {
  /** Allowed HTTP methods */
  allowedMethods?: AllowedHttpMethod[];
  /** Required headers */
  requiredHeaders?: string[];
  /** Maximum request body size in bytes */
  maxBodySize?: number;
  /** Content-Type whitelist */
  allowedContentTypes?: string[];
}

/**
 * Validation result for requests
 */
export interface RequestValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a request before sending.
 * Use this to ensure requests meet security requirements.
 *
 * @param request - Request configuration to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateRequest(
  request: {
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    contentType?: string;
  },
  options: RequestValidationOptions = {}
): RequestValidationResult {
  const errors: string[] = [];

  const {
    allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    requiredHeaders = [],
    maxBodySize = 1024 * 1024, // 1MB default
    allowedContentTypes = ['application/json', 'text/plain', 'multipart/form-data'],
  } = options;

  // Validate HTTP method
  if (!allowedMethods.includes(request.method as AllowedHttpMethod)) {
    errors.push(`HTTP method ${request.method} not allowed`);
  }

  // Check required headers
  const headerKeys = Object.keys(request.headers ?? {}).map((k) => k.toLowerCase());
  for (const required of requiredHeaders) {
    if (!headerKeys.includes(required.toLowerCase())) {
      errors.push(`Missing required header: ${required}`);
    }
  }

  // Validate content type if present
  if (
    request.contentType &&
    !allowedContentTypes.some((ct) => request.contentType?.startsWith(ct))
  ) {
    errors.push(`Content-Type ${request.contentType} not allowed`);
  }

  // Validate body size
  if (request.body) {
    let bodySize = 0;

    if (typeof request.body === 'string') {
      bodySize = new Blob([request.body]).size;
    } else if (request.body instanceof Blob) {
      bodySize = request.body.size;
    } else if (request.body instanceof ArrayBuffer) {
      bodySize = request.body.byteLength;
    } else {
      bodySize = new Blob([JSON.stringify(request.body)]).size;
    }

    if (bodySize > maxBodySize) {
      errors.push(`Request body size (${bodySize} bytes) exceeds maximum (${maxBodySize} bytes)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// SECURE FETCH WRAPPER
// =============================================================================

/**
 * Options for secure fetch
 */
export interface SecureFetchOptions extends RequestInit {
  /** Automatically add CSRF token to headers */
  includeCsrf?: boolean;
  /** Rate limit key (if rate limiting should be applied) */
  rateLimitKey?: string;
  /** Rate limit window in ms */
  rateLimitWindowMs?: number;
  /** Max requests in rate limit window */
  rateLimitMaxRequests?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Callback for audit logging */
  onAuditEvent?: (event: { type: AuditEventType; details: Record<string, unknown> }) => void;
}

/**
 * Secure fetch wrapper with built-in protections.
 * Adds rate limiting, CSRF tokens, timeouts, and validation.
 *
 * @param url - Request URL
 * @param options - Fetch options with security enhancements
 * @returns Fetch response or throws on error
 */
export async function secureFetch(
  url: string,
  options: SecureFetchOptions = {}
): Promise<Response> {
  const {
    includeCsrf = true,
    rateLimitKey,
    rateLimitWindowMs = 10000,
    rateLimitMaxRequests = 20,
    timeoutMs = 30000,
    onAuditEvent,
    ...fetchOptions
  } = options;

  // Apply rate limiting if configured
  if (rateLimitKey) {
    const rateLimit = checkRateLimit({
      key: rateLimitKey,
      windowMs: rateLimitWindowMs,
      maxRequests: rateLimitMaxRequests,
    });

    if (rateLimit.limited) {
      onAuditEvent?.({
        type: 'rate_limit_exceeded',
        details: {
          url,
          key: rateLimitKey,
          resetMs: rateLimit.resetMs,
        },
      });

      throw new Error(`Rate limited. Retry in ${Math.ceil(rateLimit.resetMs / 1000)}s`);
    }
  }

  // Build headers with security additions
  const headers = new Headers(fetchOptions.headers);

  // Add CSRF token for state-changing requests
  if (includeCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method ?? 'GET')) {
    headers.set('X-CSRF-Token', getOrCreateCsrfToken());
  }

  // Security headers
  headers.set('X-Requested-With', 'XMLHttpRequest');

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
      credentials: 'same-origin', // Don't send cookies to cross-origin
    });

    // Log failed requests for audit
    if (!response.ok) {
      onAuditEvent?.({
        type: 'api_error',
        details: {
          url,
          status: response.status,
          statusText: response.statusText,
        },
      });
    }

    return response;
  } catch (error) {
    // Log network/timeout errors
    onAuditEvent?.({
      type: 'api_error',
      details: {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// SENSITIVE DATA HANDLING
// =============================================================================

/**
 * Mask sensitive data for logging/display.
 * Shows first and last few characters with asterisks in between.
 *
 * @param value - Sensitive string to mask
 * @param visibleChars - Number of characters to show at start/end
 * @returns Masked string
 */
export function maskSensitiveData(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '****';
  }

  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const masked = '*'.repeat(Math.min(8, value.length - visibleChars * 2));

  return `${start}${masked}${end}`;
}

/**
 * Securely clear sensitive data from memory.
 * Note: This doesn't guarantee the data is removed from memory
 * (JavaScript doesn't provide that guarantee), but it helps
 * reduce the window of exposure.
 *
 * @param obj - Object containing sensitive fields
 * @param fields - Field names to clear
 */
export function clearSensitiveFields(obj: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (field in obj) {
      // Overwrite with empty value
      obj[field] = '';
      // Then delete
      delete obj[field];
    }
  }
}
