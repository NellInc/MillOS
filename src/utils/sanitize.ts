/**
 * Input Sanitization Utilities
 *
 * Provides XSS protection and input validation for user-generated content.
 * Defense-in-depth approach: sanitize at input boundary, validate at processing.
 *
 * OWASP Reference: A03:2021 - Injection
 * https://owasp.org/Top10/A03_2021-Injection/
 */

// =============================================================================
// HTML ENTITY ENCODING
// =============================================================================

/**
 * HTML entity map for encoding dangerous characters.
 * These characters have special meaning in HTML and must be encoded
 * to prevent XSS attacks when displaying user input.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Encode HTML entities in a string to prevent XSS.
 * Use this when displaying ANY user-provided content in the DOM.
 *
 * @param input - The string to encode
 * @returns Encoded string safe for HTML display
 *
 * @example
 * encodeHtmlEntities('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function encodeHtmlEntities(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] ?? char);
}

// =============================================================================
// STRING SANITIZATION
// =============================================================================

/**
 * Options for sanitizeString function
 */
export interface SanitizeStringOptions {
  /** Maximum allowed length (default: 1000) */
  maxLength?: number;
  /** Trim whitespace from start/end (default: true) */
  trim?: boolean;
  /** Convert to lowercase (default: false) */
  lowercase?: boolean;
  /** Remove all whitespace (default: false) */
  removeWhitespace?: boolean;
  /** Allowed characters regex pattern (default: allows most printable) */
  allowedPattern?: RegExp;
  /** Replace disallowed characters with this string (default: '') */
  replacementChar?: string;
}

/**
 * Default pattern allows letters, numbers, spaces, and common punctuation.
 * Excludes potentially dangerous characters by default.
 */
const DEFAULT_ALLOWED_PATTERN = /[^a-zA-Z0-9\s.,!?@#$%&*()_+=\-[\]{}|;:'"~]/g;

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Applies multiple layers of protection based on options.
 *
 * @param input - The string to sanitize
 * @param options - Sanitization options
 * @returns Sanitized string
 *
 * @example
 * sanitizeString('<script>alert(1)</script>', { maxLength: 50 })
 * // Returns: 'scriptalert1script'
 */
export function sanitizeString(input: unknown, options: SanitizeStringOptions = {}): string {
  // Type coercion with fallback
  if (input === null || input === undefined) {
    return '';
  }

  let result = String(input);

  const {
    maxLength = 1000,
    trim = true,
    lowercase = false,
    removeWhitespace = false,
    allowedPattern = DEFAULT_ALLOWED_PATTERN,
    replacementChar = '',
  } = options;

  // Step 1: Trim whitespace if requested
  if (trim) {
    result = result.trim();
  }

  // Step 2: Enforce maximum length (truncate, don't reject)
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  // Step 3: Remove disallowed characters
  result = result.replace(allowedPattern, replacementChar);

  // Step 4: Remove whitespace if requested
  if (removeWhitespace) {
    result = result.replace(/\s+/g, '');
  }

  // Step 5: Convert case if requested
  if (lowercase) {
    result = result.toLowerCase();
  }

  // Step 6: Normalize whitespace (multiple spaces to single)
  result = result.replace(/\s+/g, ' ');

  return result;
}

// =============================================================================
// SPECIFIC SANITIZERS
// =============================================================================

/**
 * Sanitize player name for multiplayer.
 * Allows only alphanumeric characters, underscores, and hyphens.
 *
 * @param name - Raw player name input
 * @returns Sanitized player name (max 20 chars)
 */
export function sanitizePlayerName(name: unknown): string {
  return sanitizeString(name, {
    maxLength: 20,
    trim: true,
    allowedPattern: /[^a-zA-Z0-9_\- ]/g,
    replacementChar: '',
  });
}

/**
 * Sanitize chat message for multiplayer.
 * Encodes HTML entities and removes control characters.
 *
 * @param message - Raw chat message
 * @returns Sanitized message safe for display
 */
export function sanitizeChatMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return '';
  }

  // Remove control characters and null bytes (security)
  // eslint-disable-next-line no-control-regex -- Intentional: Security pattern to strip dangerous control characters
  let clean = message.replace(/[\x00-\x1F\x7F]/g, '');

  // Trim and limit length
  clean = clean.trim().slice(0, 500);

  // Encode HTML entities to prevent XSS
  clean = encodeHtmlEntities(clean);

  return clean;
}

/**
 * Sanitize room code for multiplayer.
 * Allows only uppercase alphanumeric, exactly 6 characters.
 *
 * @param code - Raw room code
 * @returns Sanitized room code or empty string if invalid
 */
export function sanitizeRoomCode(code: unknown): string {
  if (typeof code !== 'string') {
    return '';
  }

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Room codes must be exactly 6 characters
  if (clean.length !== 6) {
    return '';
  }

  return clean;
}

// =============================================================================
// JSON SANITIZATION
// =============================================================================

/**
 * Options for JSON parsing
 */
export interface ParseJsonOptions {
  /** Maximum string length to parse (default: 100000) */
  maxLength?: number;
  /** Fallback value if parsing fails */
  fallback?: unknown;
}

/**
 * Safely parse JSON with size limits and error handling.
 * Prevents JSON-based DoS attacks from oversized payloads.
 *
 * @param input - JSON string to parse
 * @param options - Parsing options
 * @returns Parsed object or fallback value
 *
 * @example
 * safeJsonParse('{"key": "value"}') // Returns { key: 'value' }
 * safeJsonParse('invalid', { fallback: {} }) // Returns {}
 */
export function safeJsonParse<T = unknown>(
  input: unknown,
  options: ParseJsonOptions = {}
): T | null {
  const { maxLength = 100000, fallback = null } = options;

  if (typeof input !== 'string') {
    return fallback as T | null;
  }

  // Prevent oversized JSON payloads (DoS protection)
  if (input.length > maxLength) {
    return fallback as T | null;
  }

  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback as T | null;
  }
}

// =============================================================================
// NUMBER SANITIZATION
// =============================================================================

/**
 * Options for number sanitization
 */
export interface SanitizeNumberOptions {
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Default value if invalid */
  fallback?: number;
  /** Force integer (floor the value) */
  integer?: boolean;
}

/**
 * Sanitize a numeric input with bounds checking.
 * Prevents NaN, Infinity, and out-of-bounds values.
 *
 * @param input - Raw numeric input
 * @param options - Sanitization options
 * @returns Sanitized number
 */
export function sanitizeNumber(input: unknown, options: SanitizeNumberOptions = {}): number {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    fallback = 0,
    integer = false,
  } = options;

  let num: number;

  if (typeof input === 'number') {
    num = input;
  } else if (typeof input === 'string') {
    num = parseFloat(input);
  } else {
    return fallback;
  }

  // Check for NaN and Infinity
  if (!Number.isFinite(num)) {
    return fallback;
  }

  // Apply bounds
  num = Math.max(min, Math.min(max, num));

  // Force integer if requested
  if (integer) {
    num = Math.floor(num);
  }

  return num;
}
