/**
 * Audit Store - Client-Side Security Event Logging
 *
 * Tracks security-relevant events for monitoring and analysis:
 * - Authentication attempts (success/failure)
 * - Input validation failures
 * - Rate limit violations
 * - API errors
 * - Suspicious activity patterns
 *
 * OWASP Reference: A09:2021 - Security Logging and Monitoring Failures
 * https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/
 *
 * Note: This is client-side logging only. In production, events should be
 * forwarded to a server-side logging system for proper audit trails.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types of audit events tracked by the system
 */
export type AuditEventType =
  // Authentication events
  | 'auth_attempt'
  | 'auth_success'
  | 'auth_failure'
  | 'auth_logout'
  | 'token_expired'
  // Input validation events
  | 'validation_failure'
  | 'xss_attempt_blocked'
  | 'injection_attempt_blocked'
  // Rate limiting events
  | 'rate_limit_exceeded'
  | 'rate_limit_warning'
  // API events
  | 'api_error'
  | 'api_timeout'
  | 'api_unauthorized'
  // Session events
  | 'session_start'
  | 'session_end'
  | 'session_timeout'
  // Suspicious activity
  | 'suspicious_input'
  | 'unusual_pattern'
  | 'brute_force_detected'
  // Multiplayer events
  | 'multiplayer_connect'
  | 'multiplayer_disconnect'
  | 'chat_message_blocked'
  // General security
  | 'security_warning'
  | 'security_error';

/**
 * Severity levels for audit events
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Structure of an audit event
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: AuditEventType;
  /** Event severity */
  severity: AuditSeverity;
  /** Human-readable message */
  message: string;
  /** When the event occurred */
  timestamp: number;
  /** Additional event details (sanitized) */
  details: Record<string, unknown>;
  /** Source component or module */
  source?: string;
  /** User/session identifier (anonymized) */
  sessionId?: string;
  /** Was this event reported to server */
  reported: boolean;
}

/**
 * Summary statistics for audit events
 */
export interface AuditStats {
  totalEvents: number;
  byType: Record<AuditEventType, number>;
  bySeverity: Record<AuditSeverity, number>;
  lastHourCount: number;
  criticalCount: number;
}

/**
 * Configuration for the audit system
 */
export interface AuditConfig {
  /** Maximum events to retain */
  maxEvents: number;
  /** Event retention period in milliseconds */
  retentionMs: number;
  /** Enable console logging of events */
  consoleLogging: boolean;
  /** Minimum severity to log */
  minSeverity: AuditSeverity;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default audit configuration
 */
const DEFAULT_CONFIG: AuditConfig = {
  maxEvents: 1000,
  retentionMs: 24 * 60 * 60 * 1000, // 24 hours
  consoleLogging: import.meta.env.DEV,
  minSeverity: 'info',
};

/**
 * Severity level ordering for comparison
 */
const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

/**
 * Default severity for each event type
 */
const DEFAULT_SEVERITIES: Record<AuditEventType, AuditSeverity> = {
  // Auth events
  auth_attempt: 'info',
  auth_success: 'info',
  auth_failure: 'warning',
  auth_logout: 'info',
  token_expired: 'warning',
  // Validation events
  validation_failure: 'warning',
  xss_attempt_blocked: 'error',
  injection_attempt_blocked: 'error',
  // Rate limiting
  rate_limit_exceeded: 'warning',
  rate_limit_warning: 'info',
  // API events
  api_error: 'warning',
  api_timeout: 'warning',
  api_unauthorized: 'warning',
  // Session events
  session_start: 'info',
  session_end: 'info',
  session_timeout: 'warning',
  // Suspicious activity
  suspicious_input: 'warning',
  unusual_pattern: 'warning',
  brute_force_detected: 'critical',
  // Multiplayer
  multiplayer_connect: 'info',
  multiplayer_disconnect: 'info',
  chat_message_blocked: 'warning',
  // General
  security_warning: 'warning',
  security_error: 'error',
};

// =============================================================================
// STORE
// =============================================================================

interface AuditStoreState {
  /** List of audit events */
  events: AuditEvent[];
  /** Current configuration */
  config: AuditConfig;
  /** Anonymous session ID for correlation */
  sessionId: string;

  /** Log an audit event */
  logEvent: (
    type: AuditEventType,
    message: string,
    details?: Record<string, unknown>,
    options?: {
      severity?: AuditSeverity;
      source?: string;
    }
  ) => void;

  /** Get events by type */
  getEventsByType: (type: AuditEventType) => AuditEvent[];

  /** Get events by severity */
  getEventsBySeverity: (severity: AuditSeverity) => AuditEvent[];

  /** Get events in time range */
  getEventsInRange: (startMs: number, endMs: number) => AuditEvent[];

  /** Get recent events */
  getRecentEvents: (count: number) => AuditEvent[];

  /** Get audit statistics */
  getStats: () => AuditStats;

  /** Check for suspicious patterns */
  checkForPatterns: () => {
    bruteForce: boolean;
    rateAbuse: boolean;
    validationSpam: boolean;
  };

  /** Update configuration */
  updateConfig: (config: Partial<AuditConfig>) => void;

  /** Clear old events based on retention policy */
  pruneEvents: () => void;

  /** Export events for analysis */
  exportEvents: () => string;

  /** Clear all events */
  clearEvents: () => void;
}

/**
 * Generate a simple anonymous session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Sanitize event details to prevent sensitive data leakage
 */
function sanitizeDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    // Skip sensitive field names
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('key') ||
      lowerKey.includes('auth')
    ) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Truncate long strings
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
      continue;
    }

    // Handle nested objects (shallow)
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = '[Object]';
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Audit store for security event logging
 */
export const useAuditStore = create<AuditStoreState>()(
  persist(
    (set, get) => ({
      events: [],
      config: DEFAULT_CONFIG,
      sessionId: generateSessionId(),

      logEvent: (type, message, details = {}, options = {}) => {
        const state = get();
        const severity = options.severity ?? DEFAULT_SEVERITIES[type];

        // Check minimum severity
        if (
          SEVERITY_ORDER[severity] <
          SEVERITY_ORDER[state.config.minSeverity]
        ) {
          return;
        }

        const event: AuditEvent = {
          id: generateEventId(),
          type,
          severity,
          message,
          timestamp: Date.now(),
          details: sanitizeDetails(details),
          source: options.source,
          sessionId: state.sessionId,
          reported: false,
        };

        // Log to console if enabled
        if (state.config.consoleLogging) {
          const logFn =
            severity === 'critical' || severity === 'error'
              ? logger.error
              : severity === 'warning'
                ? logger.warn
                : logger.info;

          logFn(`[Audit:${type}] ${message}`, event.details);
        }

        // Add to store
        set((s) => {
          const newEvents = [...s.events, event];

          // Enforce max events limit
          if (newEvents.length > s.config.maxEvents) {
            newEvents.shift();
          }

          return { events: newEvents };
        });

        // Critical events trigger immediate pattern check
        if (severity === 'critical') {
          const patterns = get().checkForPatterns();
          if (patterns.bruteForce) {
            logger.error('[SECURITY] Brute force pattern detected!');
          }
        }
      },

      getEventsByType: (type) => {
        return get().events.filter((e) => e.type === type);
      },

      getEventsBySeverity: (severity) => {
        return get().events.filter((e) => e.severity === severity);
      },

      getEventsInRange: (startMs, endMs) => {
        return get().events.filter(
          (e) => e.timestamp >= startMs && e.timestamp <= endMs
        );
      },

      getRecentEvents: (count) => {
        const events = get().events;
        return events.slice(-count);
      },

      getStats: () => {
        const events = get().events;
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;

        const byType = {} as Record<AuditEventType, number>;
        const bySeverity = { info: 0, warning: 0, error: 0, critical: 0 };
        let lastHourCount = 0;
        let criticalCount = 0;

        for (const event of events) {
          byType[event.type] = (byType[event.type] ?? 0) + 1;
          bySeverity[event.severity]++;

          if (event.timestamp >= oneHourAgo) {
            lastHourCount++;
          }

          if (event.severity === 'critical') {
            criticalCount++;
          }
        }

        return {
          totalEvents: events.length,
          byType,
          bySeverity,
          lastHourCount,
          criticalCount,
        };
      },

      checkForPatterns: () => {
        const events = get().events;
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        const oneMinuteAgo = now - 60 * 1000;

        const recentEvents = events.filter((e) => e.timestamp >= fiveMinutesAgo);

        // Pattern: Brute force - many auth failures in short time
        const authFailures = recentEvents.filter(
          (e) => e.type === 'auth_failure'
        );
        const bruteForce = authFailures.length >= 5;

        // Pattern: Rate abuse - many rate limit events
        const rateLimits = recentEvents.filter(
          (e) => e.type === 'rate_limit_exceeded'
        );
        const rateAbuse = rateLimits.length >= 10;

        // Pattern: Validation spam - many validation failures in 1 minute
        const validationFailures = recentEvents.filter(
          (e) => e.type === 'validation_failure' && e.timestamp >= oneMinuteAgo
        );
        const validationSpam = validationFailures.length >= 20;

        return {
          bruteForce,
          rateAbuse,
          validationSpam,
        };
      },

      updateConfig: (newConfig) => {
        set((s) => ({
          config: { ...s.config, ...newConfig },
        }));
      },

      pruneEvents: () => {
        const { config } = get();
        const cutoff = Date.now() - config.retentionMs;

        set((s) => ({
          events: s.events.filter((e) => e.timestamp >= cutoff),
        }));
      },

      exportEvents: () => {
        const events = get().events;
        return JSON.stringify(events, null, 2);
      },

      clearEvents: () => {
        set({ events: [] });
      },
    }),
    {
      name: 'millos-audit-store',
      version: 1,
      partialize: (state) => ({
        // Only persist events and config, regenerate sessionId
        events: state.events,
        config: state.config,
      }),
    }
  )
);

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Log a validation failure event
 */
export function auditValidationFailure(
  field: string,
  reason: string,
  value?: unknown
): void {
  useAuditStore.getState().logEvent('validation_failure', `Validation failed for ${field}: ${reason}`, {
    field,
    reason,
    valueType: typeof value,
    valueLength: typeof value === 'string' ? value.length : undefined,
  });
}

/**
 * Log an XSS attempt that was blocked
 */
export function auditXssBlocked(input: string, context: string): void {
  useAuditStore.getState().logEvent(
    'xss_attempt_blocked',
    `XSS attempt blocked in ${context}`,
    {
      context,
      inputLength: input.length,
      inputPreview: input.slice(0, 50),
    },
    { severity: 'error' }
  );
}

/**
 * Log a rate limit event
 */
export function auditRateLimit(
  endpoint: string,
  remaining: number,
  resetMs: number
): void {
  useAuditStore.getState().logEvent('rate_limit_exceeded', `Rate limit exceeded for ${endpoint}`, {
    endpoint,
    remaining,
    resetMs,
  });
}

/**
 * Log an authentication attempt
 */
export function auditAuthAttempt(
  success: boolean,
  method: string,
  details?: Record<string, unknown>
): void {
  useAuditStore.getState().logEvent(
    success ? 'auth_success' : 'auth_failure',
    `Authentication ${success ? 'succeeded' : 'failed'} via ${method}`,
    { method, ...details },
    { severity: success ? 'info' : 'warning' }
  );
}

/**
 * Log an API error
 */
export function auditApiError(
  url: string,
  status: number,
  message: string
): void {
  useAuditStore.getState().logEvent('api_error', `API error: ${status} - ${message}`, {
    url,
    status,
    message,
  });
}

/**
 * Log suspicious input detection
 */
export function auditSuspiciousInput(
  input: string,
  reason: string,
  context: string
): void {
  useAuditStore.getState().logEvent(
    'suspicious_input',
    `Suspicious input detected: ${reason}`,
    {
      context,
      reason,
      inputLength: input.length,
    },
    { severity: 'warning' }
  );
}

/**
 * Log a multiplayer event
 */
export function auditMultiplayer(
  action: 'connect' | 'disconnect',
  roomCode?: string
): void {
  useAuditStore.getState().logEvent(
    action === 'connect' ? 'multiplayer_connect' : 'multiplayer_disconnect',
    `Multiplayer ${action}${roomCode ? ` (room: ${roomCode})` : ''}`,
    { roomCode }
  );
}

// =============================================================================
// AUTOMATIC CLEANUP
// =============================================================================

// Set up automatic event pruning (every 15 minutes)
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      useAuditStore.getState().pruneEvents();
    },
    15 * 60 * 1000
  );

  // Log session start
  useAuditStore.getState().logEvent('session_start', 'MillOS session started', {
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });

  // Log session end on unload
  window.addEventListener('beforeunload', () => {
    useAuditStore.getState().logEvent('session_end', 'MillOS session ended');
  });
}
