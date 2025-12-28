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

/**
 * Decode HTML entities back to their original characters.
 * Use only when you need to process previously encoded content.
 * WARNING: Decoded content should NOT be rendered as HTML without re-encoding.
 *
 * @param input - The encoded string
 * @returns Decoded string
 */
export function decodeHtmlEntities(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.documentElement.textContent ?? '';
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

/**
 * Sanitize worker name (for custom worker names in the simulation).
 *
 * @param name - Raw worker name
 * @returns Sanitized worker name
 */
export function sanitizeWorkerName(name: unknown): string {
  return sanitizeString(name, {
    maxLength: 50,
    trim: true,
    allowedPattern: /[^a-zA-Z0-9\s.,'-]/g,
    replacementChar: '',
  });
}

// =============================================================================
// URL SANITIZATION
// =============================================================================

/**
 * Allowed URL protocols for links.
 * OWASP: javascript: and data: protocols are common XSS vectors.
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * Sanitize and validate a URL.
 * Prevents javascript:, data:, and other dangerous protocol attacks.
 *
 * @param url - Raw URL string
 * @returns Sanitized URL or null if invalid/dangerous
 *
 * @example
 * sanitizeUrl('javascript:alert(1)') // Returns null
 * sanitizeUrl('https://example.com') // Returns 'https://example.com'
 */
export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    // Check protocol against whitelist
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    // Invalid URL
    return null;
  }
}

/**
 * Check if a URL is safe to navigate to.
 * More strict than sanitizeUrl - for actual navigation.
 *
 * @param url - URL to check
 * @returns True if URL is safe for navigation
 */
export function isUrlSafe(url: unknown): boolean {
  const sanitized = sanitizeUrl(url);

  if (!sanitized) {
    return false;
  }

  try {
    const parsed = new URL(sanitized);

    // Only allow http/https for navigation
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Block localhost and internal IPs (SSRF prevention)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
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
    // Security event logged server-side only - avoid exposing details to console
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      // Only log in development, not production
      console.warn('[Security] JSON input exceeds maximum length:', input.length);
    }
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

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: unknown;
}

/**
 * Validate and sanitize an object against a schema of validators.
 * Returns both validation result and sanitized data.
 *
 * @param input - Object to validate
 * @param schema - Map of field names to validator functions
 * @returns Validation result with sanitized data
 */
export function validateObject<T extends Record<string, unknown>>(
  input: unknown,
  schema: Record<keyof T, (value: unknown) => ValidationResult>
): ValidationResult & { sanitized?: T } {
  if (typeof input !== 'object' || input === null) {
    return {
      valid: false,
      errors: ['Input must be an object'],
    };
  }

  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};
  const inputObj = input as Record<string, unknown>;

  for (const [key, validator] of Object.entries(schema)) {
    const result = validator(inputObj[key]);

    if (!result.valid) {
      errors.push(...result.errors.map((e) => `${key}: ${e}`));
    }

    sanitized[key] = result.sanitized ?? inputObj[key];
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: sanitized as T,
  };
}

/**
 * Create a string validator with options
 */
export function createStringValidator(
  options: SanitizeStringOptions & { required?: boolean } = {}
): (value: unknown) => ValidationResult {
  return (value: unknown): ValidationResult => {
    const { required = false, ...sanitizeOpts } = options;

    if (value === null || value === undefined || value === '') {
      if (required) {
        return { valid: false, errors: ['Field is required'] };
      }
      return { valid: true, errors: [], sanitized: '' };
    }

    const sanitized = sanitizeString(value, sanitizeOpts);

    return {
      valid: true,
      errors: [],
      sanitized,
    };
  };
}

/**
 * Create a number validator with options
 */
export function createNumberValidator(
  options: SanitizeNumberOptions & { required?: boolean } = {}
): (value: unknown) => ValidationResult {
  return (value: unknown): ValidationResult => {
    const { required = false, ...sanitizeOpts } = options;

    if (value === null || value === undefined) {
      if (required) {
        return { valid: false, errors: ['Field is required'] };
      }
      return { valid: true, errors: [], sanitized: sanitizeOpts.fallback ?? 0 };
    }

    const sanitized = sanitizeNumber(value, sanitizeOpts);

    // Check if the original was actually valid
    if (typeof value !== 'number' && typeof value !== 'string') {
      return {
        valid: false,
        errors: ['Must be a number'],
        sanitized,
      };
    }

    return {
      valid: true,
      errors: [],
      sanitized,
    };
  };
}
