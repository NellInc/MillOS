/**
 * Historian Interface for MillOS SCADA
 *
 * Common abstraction layer for enterprise process historians:
 * - OSIsoft PI
 * - Wonderware/AVEVA Historian
 * - Local IndexedDB (HistoryStore)
 *
 * Supports multiple interpolation modes and time-range queries.
 */

import type { Quality, TagHistoryPoint } from './types';

// ============================================================================
// Interpolation Modes
// ============================================================================

/**
 * Data retrieval modes for historian queries.
 * Based on OSIsoft PI Web API conventions.
 */
export type InterpolationMode =
  | 'recorded' // Raw recorded values (no interpolation)
  | 'interpolated' // Linear interpolation at regular intervals
  | 'plot' // Min/max plot values for efficient trending
  | 'average' // Time-weighted average over intervals
  | 'minimum' // Minimum value over intervals
  | 'maximum' // Maximum value over intervals
  | 'delta'; // Change (last - first) over intervals

// ============================================================================
// Query Options
// ============================================================================

export interface HistorianQueryOptions {
  /** Number of points to return (for interpolated/plot modes) */
  intervals?: number;
  /** Interval duration in milliseconds (for interpolated mode) */
  intervalMs?: number;
  /** Maximum number of raw points to return */
  maxPoints?: number;
  /** Include bad quality points */
  includeBadQuality?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// Historian Statistics
// ============================================================================

export interface HistorianStatistics {
  /** Total points in storage */
  totalPoints: number;
  /** Oldest timestamp in storage */
  oldestTimestamp: number | null;
  /** Newest timestamp in storage */
  newestTimestamp: number | null;
  /** Number of tags with data */
  tagCount: number;
  /** Storage size in bytes (if available) */
  storageBytes?: number;
}

// ============================================================================
// Historian Interface
// ============================================================================

/**
 * Common interface for all historian backends.
 * Implementations can wrap enterprise historians or local storage.
 */
export interface IHistorian {
  // === Lifecycle ===

  /** Initialize connection to the historian */
  connect(): Promise<void>;

  /** Disconnect from the historian */
  disconnect(): Promise<void>;

  /** Check if currently connected */
  isConnected(): boolean;

  /** Get historian name/type for debugging */
  getName(): string;

  // === Read Operations ===

  /**
   * Get raw recorded values for a tag within a time range.
   * Returns only the actually recorded values, no interpolation.
   */
  getRecordedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]>;

  /**
   * Get interpolated values at regular intervals.
   * Useful for charting with consistent x-axis spacing.
   */
  getInterpolatedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervalMs: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]>;

  /**
   * Get plot values (min/max pairs) for efficient trending.
   * Returns a reduced dataset suitable for visual display.
   */
  getPlotValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervals: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]>;

  /**
   * Get the latest recorded value for a tag.
   */
  getLatestValue(tagId: string): Promise<TagHistoryPoint | null>;

  /**
   * Get history for multiple tags at once.
   * More efficient than multiple single-tag queries.
   */
  getMultipleTagHistory(
    tagIds: string[],
    startTime: Date,
    endTime: Date,
    mode?: InterpolationMode,
    options?: HistorianQueryOptions
  ): Promise<Record<string, TagHistoryPoint[]>>;

  // === Write Operations (if supported) ===

  /**
   * Write a historical value to the historian.
   * May not be supported by all backends.
   */
  writeValue?(tagId: string, value: number, timestamp: Date, quality?: Quality): Promise<void>;

  // === Metadata ===

  /**
   * Get the available time range for a tag.
   * Returns null if tag has no data.
   */
  getAvailableRange(tagId: string): Promise<{ start: Date; end: Date } | null>;

  /**
   * Get storage statistics.
   */
  getStatistics(): Promise<HistorianStatistics>;
}

// ============================================================================
// Historian Configuration Extensions
// ============================================================================

/**
 * OSIsoft PI Web API configuration
 */
export interface PIConnectionConfig {
  type: 'pi';
  /** PI Web API base URL (e.g., "https://piserver/piwebapi") */
  baseUrl: string;
  /** PI Data Archive path (e.g., "\\\\PISERVER\\Production") */
  serverPath: string;
  /** Authentication method */
  authMethod: 'basic' | 'kerberos' | 'bearer';
  /** Username for basic auth */
  username?: string;
  /** Password for basic auth */
  password?: string;
  /** Bearer token for OAuth */
  bearerToken?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to verify SSL certificates */
  verifySsl?: boolean;
}

/**
 * AVEVA/Wonderware Historian configuration
 */
export interface WonderwareConnectionConfig {
  type: 'wonderware';
  /** Historian server hostname or IP */
  serverHost: string;
  /** Server port (default: 32568 for REST, 1433 for SQL) */
  serverPort?: number;
  /** Protocol to use */
  protocol: 'rest' | 'sql';
  /** Authentication mode */
  authMode: 'windows' | 'sql';
  /** Domain for Windows auth */
  domain?: string;
  /** Username */
  username?: string;
  /** Password */
  password?: string;
  /** Database name for SQL mode */
  database?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Union type for all historian configurations
 */
export type HistorianConnectionConfig =
  | PIConnectionConfig
  | WonderwareConnectionConfig
  | { type: 'local' }; // Local IndexedDB storage

// ============================================================================
// Factory Function Types
// ============================================================================

/**
 * Factory function to create historian instances
 */
export type HistorianFactory = (config: HistorianConnectionConfig) => IHistorian;

// ============================================================================
// Default Export
// ============================================================================

export default IHistorian;
