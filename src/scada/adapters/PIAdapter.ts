/**
 * OSIsoft PI Web API Adapter for MillOS SCADA
 *
 * Connects to OSIsoft PI Data Archive via PI Web API.
 * Supports:
 * - Basic, Kerberos, and Bearer token authentication
 * - Recorded, interpolated, and plot data retrieval
 * - WebId caching for efficient tag lookups
 *
 * @see https://docs.osisoft.com/bundle/pi-web-api-reference/page/help.html
 */

import type { Quality, TagHistoryPoint } from '../types';
import type {
  IHistorian,
  PIConnectionConfig,
  HistorianQueryOptions,
  HistorianStatistics,
  InterpolationMode,
} from '../HistorianInterface';
import { logger } from '../../utils/logger';

// ============================================================================
// PI Web API Response Types
// ============================================================================

interface PIValue {
  Timestamp: string;
  Value: number | string | boolean | { Value: number; Name: string };
  UnitsAbbreviation?: string;
  Good: boolean;
  Questionable: boolean;
  Substituted: boolean;
}

interface PIStreamValuesResponse {
  Links: Record<string, string>;
  Items: PIValue[];
}

interface PIPointResponse {
  WebId: string;
  Id: number;
  Name: string;
  Path: string;
  Descriptor: string;
  PointClass: string;
  PointType: string;
  DigitalSetName?: string;
  EngineeringUnits: string;
  Zero: number;
  Span: number;
  Step: boolean;
  Future: boolean;
}

// ============================================================================
// PI Adapter Implementation
// ============================================================================

export class PIAdapter implements IHistorian {
  private baseUrl: string;
  private serverPath: string;
  private authHeader: string = '';
  private connected: boolean = false;
  private timeout: number;
  private webIdCache: Map<string, string> = new Map();

  constructor(config: PIConnectionConfig) {
    this.baseUrl = config.baseUrl;
    this.serverPath = config.serverPath;
    this.timeout = config.timeout ?? 30000;

    // Build authorization header based on auth method
    switch (config.authMethod) {
      case 'basic':
        if (config.username && config.password) {
          const credentials = btoa(`${config.username}:${config.password}`);
          this.authHeader = `Basic ${credentials}`;
        }
        break;
      case 'bearer':
        if (config.bearerToken) {
          this.authHeader = `Bearer ${config.bearerToken}`;
        }
        break;
      case 'kerberos':
        // Kerberos requires negotiate, browser handles automatically
        // For Node.js, would need additional configuration
        this.authHeader = 'Negotiate';
        break;
    }
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    try {
      // Test connection by fetching system info
      const response = await this.fetchWithAuth(`${this.baseUrl}/system`);
      if (!response.ok) {
        throw new Error(`PI Web API connection failed: ${response.status} ${response.statusText}`);
      }
      this.connected = true;
      logger.info('[PIAdapter] Connected to PI Web API');
    } catch (error) {
      this.connected = false;
      logger.error('[PIAdapter] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.webIdCache.clear();
    logger.info('[PIAdapter] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return `PI Web API (${this.serverPath})`;
  }

  // === Read Operations ===

  async getRecordedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const webId = await this.getWebId(tagId);
    if (!webId) return [];

    const maxCount = options?.maxPoints ?? 10000;
    const url =
      `${this.baseUrl}/streams/${webId}/recorded?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `maxCount=${maxCount}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      logger.warn(`[PIAdapter] Failed to get recorded values for ${tagId}: ${response.status}`);
      return [];
    }

    const data: PIStreamValuesResponse = await response.json();
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return this.mapPIValuesToHistoryPoints(items);
  }

  async getInterpolatedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervalMs: number,
    _options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const webId = await this.getWebId(tagId);
    if (!webId) return [];

    // PI Web API expects interval as ISO 8601 duration
    const intervalStr = this.msToIsoDuration(intervalMs);
    const url =
      `${this.baseUrl}/streams/${webId}/interpolated?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `interval=${intervalStr}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      logger.warn(`[PIAdapter] Failed to get interpolated values for ${tagId}: ${response.status}`);
      return [];
    }

    const data: PIStreamValuesResponse = await response.json();
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return this.mapPIValuesToHistoryPoints(items);
  }

  async getPlotValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervals: number,
    _options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const webId = await this.getWebId(tagId);
    if (!webId) return [];

    const url =
      `${this.baseUrl}/streams/${webId}/plot?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `intervals=${intervals}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      logger.warn(`[PIAdapter] Failed to get plot values for ${tagId}: ${response.status}`);
      return [];
    }

    const data: PIStreamValuesResponse = await response.json();
    const items = Array.isArray(data?.Items) ? data.Items : [];
    return this.mapPIValuesToHistoryPoints(items);
  }

  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    const webId = await this.getWebId(tagId);
    if (!webId) return null;

    const url = `${this.baseUrl}/streams/${webId}/value`;
    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      return null;
    }

    const data: PIValue = await response.json();
    if (!data || typeof data !== 'object' || data.Timestamp === undefined) {
      return null;
    }
    const points = this.mapPIValuesToHistoryPoints([data]);
    return points[0] ?? null;
  }

  async getMultipleTagHistory(
    tagIds: string[],
    startTime: Date,
    endTime: Date,
    mode: InterpolationMode = 'recorded',
    options?: HistorianQueryOptions
  ): Promise<Record<string, TagHistoryPoint[]>> {
    const result: Record<string, TagHistoryPoint[]> = {};

    // Fetch in parallel for better performance. A single tag's failure must
    // not poison the whole batch, so each tag's body is guarded and rejected
    // tags resolve to [].
    const promises = tagIds.map(async (tagId) => {
      try {
        let points: TagHistoryPoint[];
        switch (mode) {
          case 'interpolated':
            points = await this.getInterpolatedValues(
              tagId,
              startTime,
              endTime,
              options?.intervalMs ?? 60000,
              options
            );
            break;
          case 'plot':
            points = await this.getPlotValues(
              tagId,
              startTime,
              endTime,
              options?.intervals ?? 100,
              options
            );
            break;
          default:
            points = await this.getRecordedValues(tagId, startTime, endTime, options);
        }
        result[tagId] = points;
      } catch (error) {
        logger.warn(`[PIAdapter] Failed to get history for ${tagId}:`, error);
        result[tagId] = [];
      }
    });

    await Promise.allSettled(promises);
    return result;
  }

  // === Metadata ===

  async getAvailableRange(tagId: string): Promise<{ start: Date; end: Date } | null> {
    // PI doesn't have a direct API for this, use summary endpoint
    const webId = await this.getWebId(tagId);
    if (!webId) return null;

    // Get first and last recorded values
    try {
      const [first, last] = await Promise.all([
        this.fetchWithAuth(`${this.baseUrl}/streams/${webId}/recorded?maxCount=1&startTime=*-100y`),
        this.fetchWithAuth(
          `${this.baseUrl}/streams/${webId}/recorded?maxCount=1&startTime=*&endTime=*&reversed=true`
        ),
      ]);

      if (!first.ok || !last.ok) return null;

      const firstData: PIStreamValuesResponse = await first.json();
      const lastData: PIStreamValuesResponse = await last.json();

      if (firstData.Items.length === 0 || lastData.Items.length === 0) return null;

      return {
        start: new Date(firstData.Items[0].Timestamp),
        end: new Date(lastData.Items[0].Timestamp),
      };
    } catch {
      return null;
    }
  }

  async getStatistics(): Promise<HistorianStatistics> {
    // PI Web API doesn't provide aggregate stats easily
    // Return minimal info
    return {
      totalPoints: -1, // Unknown
      oldestTimestamp: null,
      newestTimestamp: null,
      tagCount: this.webIdCache.size,
    };
  }

  // === Private Helpers ===

  private async getWebId(tagId: string): Promise<string | null> {
    // Check cache first
    const cachedWebId = this.webIdCache.get(tagId);
    if (cachedWebId !== undefined) {
      return cachedWebId;
    }

    // Look up by path
    const path = `${this.serverPath}\\${tagId}`;
    const encodedPath = encodeURIComponent(path);
    const url = `${this.baseUrl}/points?path=${encodedPath}`;

    try {
      const response = await this.fetchWithAuth(url);
      if (!response.ok) {
        logger.warn(`[PIAdapter] Tag not found: ${tagId}`);
        return null;
      }

      const data: PIPointResponse = await response.json();
      // Validate before caching so a transient/malformed lookup is not cached
      // as a permanent failure (the cache hit check uses `!== undefined`).
      if (!data || typeof data.WebId !== 'string') {
        return null;
      }
      this.webIdCache.set(tagId, data.WebId);
      return data.WebId;
    } catch (error) {
      logger.error(`[PIAdapter] Failed to get WebId for ${tagId}:`, error);
      return null;
    }
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.authHeader) {
        headers['Authorization'] = this.authHeader;
      }

      return await fetch(url, {
        headers,
        signal: controller.signal,
        // Note: SSL verification is browser-controlled
        // In Node.js, would need additional configuration
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapPIValuesToHistoryPoints(items: PIValue[]): TagHistoryPoint[] {
    return items.map((item) => {
      // Handle complex value objects (e.g., digital states)
      let value: number;
      if (typeof item.Value === 'object' && item.Value !== null) {
        value = (item.Value as { Value: number }).Value ?? 0;
      } else if (typeof item.Value === 'boolean') {
        value = item.Value ? 1 : 0;
      } else if (typeof item.Value === 'string') {
        value = parseFloat(item.Value) || 0;
      } else {
        value = item.Value ?? 0;
      }

      // Map PI quality flags to our Quality type
      let quality: Quality = 'GOOD';
      if (!item.Good) {
        quality = 'BAD';
      } else if (item.Questionable) {
        quality = 'UNCERTAIN';
      } else if (item.Substituted) {
        quality = 'UNCERTAIN';
      }

      return {
        timestamp: new Date(item.Timestamp).getTime(),
        value,
        quality,
      };
    });
  }

  private msToIsoDuration(ms: number): string {
    // Convert milliseconds to ISO 8601 duration.
    // Guard against sub-second/negative/NaN input: PI Web API rejects PT0S and
    // malformed durations, so clamp to a minimum valid interval of 1 second.
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 1000;
    const seconds = Math.max(1, Math.floor(safeMs / 1000));
    if (seconds < 60) return `PT${seconds}S`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `PT${minutes}M`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `PT${hours}H`;
    const days = Math.floor(hours / 24);
    return `P${days}D`;
  }
}

export default PIAdapter;
