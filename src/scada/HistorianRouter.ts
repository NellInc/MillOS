/**
 * Historian Router for MillOS SCADA
 *
 * Routes historian queries to the appropriate backend based on:
 * - Time range (local for recent, remote for older data)
 * - Data availability
 * - Backend capabilities
 *
 * Supports automatic data blending from multiple sources.
 */

import type { Quality, TagHistoryPoint } from './types';
import type {
  IHistorian,
  HistorianConnectionConfig,
  HistorianQueryOptions,
  HistorianStatistics,
  InterpolationMode,
} from './HistorianInterface';
import { HistoryStore } from './HistoryStore';
import { PIAdapter } from './adapters/PIAdapter';
import { WonderwareAdapter } from './adapters/WonderwareAdapter';
import { logger } from '../utils/logger';

// ============================================================================
// Router Configuration
// ============================================================================

export interface HistorianRouterConfig {
  /** Primary historian configuration (PI, Wonderware, or local) */
  primary?: HistorianConnectionConfig;
  /** Local history retention in milliseconds (default: 24 hours) */
  localRetentionMs?: number;
  /** Whether to prefer local data when available */
  preferLocal?: boolean;
  /** Timeout for remote queries */
  remoteTimeoutMs?: number;
}

// ============================================================================
// Historian Router Implementation
// ============================================================================

export class HistorianRouter implements IHistorian {
  private localStore: HistoryStore;
  private remoteHistorian: IHistorian | null = null;
  private localRetentionMs: number;

  private connected: boolean = false;

  constructor(config: HistorianRouterConfig = {}) {
    this.localStore = new HistoryStore();
    this.localRetentionMs = config.localRetentionMs ?? 24 * 60 * 60 * 1000; // 24 hours

    // Create remote historian if configured
    if (config.primary) {
      this.remoteHistorian = this.createHistorian(config.primary);
    }
  }

  // === Factory ===

  private createHistorian(config: HistorianConnectionConfig): IHistorian | null {
    switch (config.type) {
      case 'pi':
        return new PIAdapter(config);
      case 'wonderware':
        return new WonderwareAdapter(config);
      case 'local':
        // Return wrapper around HistoryStore
        return new LocalHistorianAdapter(this.localStore);
      default:
        logger.warn(
          `[HistorianRouter] Unknown historian type: ${(config as { type: string }).type}`
        );
        return null;
    }
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    // Initialize local store
    await this.localStore.init();

    // Connect remote historian if available
    if (this.remoteHistorian) {
      try {
        await this.remoteHistorian.connect();
        logger.info(`[HistorianRouter] Connected to ${this.remoteHistorian.getName()}`);
      } catch (error) {
        logger.warn(
          '[HistorianRouter] Remote historian connection failed, using local only:',
          error
        );
        // Continue with local only
      }
    }

    this.connected = true;
    logger.info('[HistorianRouter] Initialized');
  }

  async disconnect(): Promise<void> {
    if (this.remoteHistorian) {
      await this.remoteHistorian.disconnect();
    }
    await this.localStore.close();
    this.connected = false;
    logger.info('[HistorianRouter] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    if (this.remoteHistorian?.isConnected()) {
      return `Router → ${this.remoteHistorian.getName()}`;
    }
    return 'Router → Local';
  }

  // === Read Operations ===

  async getRecordedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    return this.getBlendedData(tagId, startTime, endTime, 'recorded', options);
  }

  async getInterpolatedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervalMs: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const points = await this.getBlendedData(tagId, startTime, endTime, 'interpolated', {
      ...options,
      intervalMs,
    });

    // If we got raw data from blending, interpolate locally
    if (points.length > 0) {
      return this.interpolatePoints(points, startTime, endTime, intervalMs);
    }

    return points;
  }

  async getPlotValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervals: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    return this.getBlendedData(tagId, startTime, endTime, 'plot', {
      ...options,
      intervals,
    });
  }

  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    // Try local first (fastest)
    const localLatest = await this.localStore.getLatestValue(tagId);
    if (localLatest) {
      return localLatest;
    }

    // Fall back to remote
    if (this.remoteHistorian?.isConnected()) {
      return this.remoteHistorian.getLatestValue(tagId);
    }

    return null;
  }

  async getMultipleTagHistory(
    tagIds: string[],
    startTime: Date,
    endTime: Date,
    mode: InterpolationMode = 'recorded',
    options?: HistorianQueryOptions
  ): Promise<Record<string, TagHistoryPoint[]>> {
    const result: Record<string, TagHistoryPoint[]> = {};

    // Parallel fetch for all tags
    const promises = tagIds.map(async (tagId) => {
      result[tagId] = await this.getBlendedData(tagId, startTime, endTime, mode, options);
    });

    await Promise.all(promises);
    return result;
  }

  // === Blending Logic ===

  private async getBlendedData(
    tagId: string,
    startTime: Date,
    endTime: Date,
    mode: InterpolationMode,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const now = Date.now();
    const cutoffTime = now - this.localRetentionMs;
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    // Case 1: All data within local retention window
    if (startMs >= cutoffTime) {
      const localData = await this.localStore.getHistory(tagId, startMs, endMs);
      if (localData.length > 0 || !this.remoteHistorian?.isConnected()) {
        return localData;
      }
    }

    // Case 2: All data before local retention window
    if (endMs < cutoffTime && this.remoteHistorian?.isConnected()) {
      return this.fetchFromRemote(tagId, startTime, endTime, mode, options);
    }

    // Case 3: Data spans both local and remote
    if (this.remoteHistorian?.isConnected() && startMs < cutoffTime) {
      const [remoteData, localData] = await Promise.all([
        this.fetchFromRemote(tagId, startTime, new Date(cutoffTime), mode, options),
        this.localStore.getHistory(tagId, cutoffTime, endMs),
      ]);

      // Merge and dedupe by timestamp
      return this.mergeHistoryPoints(remoteData, localData);
    }

    // Fallback: local only
    return this.localStore.getHistory(tagId, startMs, endMs);
  }

  private async fetchFromRemote(
    tagId: string,
    startTime: Date,
    endTime: Date,
    mode: InterpolationMode,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    if (!this.remoteHistorian) return [];

    try {
      switch (mode) {
        case 'interpolated':
          return await this.remoteHistorian.getInterpolatedValues(
            tagId,
            startTime,
            endTime,
            options?.intervalMs ?? 60000,
            options
          );
        case 'plot':
          return await this.remoteHistorian.getPlotValues(
            tagId,
            startTime,
            endTime,
            options?.intervals ?? 100,
            options
          );
        default:
          return await this.remoteHistorian.getRecordedValues(tagId, startTime, endTime, options);
      }
    } catch (error) {
      logger.warn(`[HistorianRouter] Remote fetch failed for ${tagId}:`, error);
      return [];
    }
  }

  private mergeHistoryPoints(
    older: TagHistoryPoint[],
    newer: TagHistoryPoint[]
  ): TagHistoryPoint[] {
    // Combine and sort by timestamp
    const merged = [...older, ...newer];
    merged.sort((a, b) => a.timestamp - b.timestamp);

    // Dedupe by timestamp (keep first occurrence)
    const seen = new Set<number>();
    return merged.filter((p) => {
      if (seen.has(p.timestamp)) return false;
      seen.add(p.timestamp);
      return true;
    });
  }

  private interpolatePoints(
    points: TagHistoryPoint[],
    startTime: Date,
    endTime: Date,
    intervalMs: number
  ): TagHistoryPoint[] {
    if (points.length === 0) return [];

    const result: TagHistoryPoint[] = [];
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    for (let t = startMs; t <= endMs; t += intervalMs) {
      // Find surrounding points for interpolation
      let before: TagHistoryPoint | null = null;
      let after: TagHistoryPoint | null = null;

      for (const p of points) {
        if (p.timestamp <= t) before = p;
        if (p.timestamp >= t && !after) after = p;
        if (before && after) break;
      }

      let value: number;
      let quality: Quality = 'GOOD';

      if (before && after && before !== after) {
        // Linear interpolation
        const ratio = (t - before.timestamp) / (after.timestamp - before.timestamp);
        value = before.value + (after.value - before.value) * ratio;
        if (before.quality !== 'GOOD' || after.quality !== 'GOOD') {
          quality = 'UNCERTAIN';
        }
      } else if (before) {
        value = before.value;
        quality = before.quality;
      } else if (after) {
        value = after.value;
        quality = after.quality;
      } else {
        continue; // No data available
      }

      result.push({ timestamp: t, value, quality });
    }

    return result;
  }

  // === Metadata ===

  async getAvailableRange(tagId: string): Promise<{ start: Date; end: Date } | null> {
    const localStats = await this.localStore.getStats();
    let start = localStats.oldestTimestamp;
    let end = localStats.newestTimestamp;

    // Extend with remote range if available
    if (this.remoteHistorian?.isConnected()) {
      const remoteRange = await this.remoteHistorian.getAvailableRange(tagId);
      if (remoteRange) {
        if (!start || remoteRange.start.getTime() < start) {
          start = remoteRange.start.getTime();
        }
        if (!end || remoteRange.end.getTime() > end) {
          end = remoteRange.end.getTime();
        }
      }
    }

    if (start && end) {
      return { start: new Date(start), end: new Date(end) };
    }

    return null;
  }

  async getStatistics(): Promise<HistorianStatistics> {
    const localStats = await this.localStore.getStats();
    return {
      totalPoints: localStats.tagHistoryCount,
      oldestTimestamp: localStats.oldestTimestamp,
      newestTimestamp: localStats.newestTimestamp,
      tagCount: -1, // Unknown
    };
  }

  // === Public: Access Local Store Directly ===

  getLocalStore(): HistoryStore {
    return this.localStore;
  }
}

// ============================================================================
// Local Historian Adapter (wraps HistoryStore)
// ============================================================================

class LocalHistorianAdapter implements IHistorian {
  private store: HistoryStore;
  private connected: boolean = false;

  constructor(store: HistoryStore) {
    this.store = store;
  }

  async connect(): Promise<void> {
    await this.store.init();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.store.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return 'Local IndexedDB';
  }

  async getRecordedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    _options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    return this.store.getHistory(tagId, startTime.getTime(), endTime.getTime());
  }

  async getInterpolatedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    _intervalMs: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    // Local store doesn't support interpolation natively
    return this.getRecordedValues(tagId, startTime, endTime, options);
  }

  async getPlotValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    _intervals: number,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    return this.getRecordedValues(tagId, startTime, endTime, options);
  }

  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    return this.store.getLatestValue(tagId);
  }

  async getMultipleTagHistory(
    tagIds: string[],
    startTime: Date,
    endTime: Date,
    _mode?: InterpolationMode,
    _options?: HistorianQueryOptions
  ): Promise<Record<string, TagHistoryPoint[]>> {
    return this.store.getMultipleTagHistory(tagIds, startTime.getTime(), endTime.getTime());
  }

  async getAvailableRange(_tagId: string): Promise<{ start: Date; end: Date } | null> {
    const stats = await this.store.getStats();
    if (stats.oldestTimestamp && stats.newestTimestamp) {
      return {
        start: new Date(stats.oldestTimestamp),
        end: new Date(stats.newestTimestamp),
      };
    }
    return null;
  }

  async getStatistics(): Promise<HistorianStatistics> {
    const stats = await this.store.getStats();
    return {
      totalPoints: stats.tagHistoryCount,
      oldestTimestamp: stats.oldestTimestamp,
      newestTimestamp: stats.newestTimestamp,
      tagCount: -1,
    };
  }
}

export default HistorianRouter;
