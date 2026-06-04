/**
 * Wonderware/AVEVA Historian Adapter for MillOS SCADA
 *
 * Connects to AVEVA Historian (formerly Wonderware InSQL/Historian).
 * Supports:
 * - REST API (modern deployments)
 * - SQL queries via AAHD provider (legacy)
 * - Windows and SQL authentication
 *
 * @see https://docs.aveva.com/
 */

import type { Quality, TagHistoryPoint } from '../types';
import type {
  IHistorian,
  WonderwareConnectionConfig,
  HistorianQueryOptions,
  HistorianStatistics,
  InterpolationMode,
} from '../HistorianInterface';
import { logger } from '../../utils/logger';

// ============================================================================
// Wonderware REST API Response Types
// ============================================================================

interface WWHistoryValue {
  TimeStamp: string;
  Value: number | string | boolean;
  Quality: number; // OPC quality code
  QualityDetail?: string;
}

interface WWHistoryResponse {
  Data: WWHistoryValue[];
  TagName: string;
  StartTime: string;
  EndTime: string;
  Count: number;
}

interface WWTagInfo {
  TagName: string;
  Description: string;
  EngUnits: string;
  MinValue: number;
  MaxValue: number;
  DataType: string;
}

// ============================================================================
// Quality Code Mapping
// ============================================================================

/**
 * Map OPC quality codes to our Quality type.
 *
 * This handles the standard 8-bit OPC DA quality byte, where the top two
 * bits (>>6 & 0x3) are the major quality field (Good/Uncertain/Bad) and the
 * lower bits are substatus. If a deployment's REST API ever returns the full
 * 16-bit OPC quality word, the Quality field would need normalising first.
 */
function mapOpcQuality(opcQuality: number): Quality {
  const major = (opcQuality >> 6) & 0x3;
  switch (major) {
    case 3: // Good (0xC0-0xFF)
      return 'GOOD';
    case 1: // Uncertain (0x40-0x7F)
      return 'UNCERTAIN';
    case 0: // Bad (0x00-0x3F)
    default:
      return 'BAD';
  }
}

// ============================================================================
// Wonderware Adapter Implementation
// ============================================================================

export class WonderwareAdapter implements IHistorian {
  private serverHost: string;
  private serverPort: number;
  private protocol: 'rest' | 'sql';
  private authHeader: string = '';
  private connected: boolean = false;
  private timeout: number;
  private baseUrl: string;

  constructor(config: WonderwareConnectionConfig) {
    this.serverHost = config.serverHost;
    this.serverPort = config.serverPort ?? (config.protocol === 'rest' ? 32568 : 1433);
    this.protocol = config.protocol;
    this.timeout = config.timeout ?? 30000;

    // Build base URL for REST API.
    // Default to https:// so Basic-auth credentials (potentially Windows
    // domain creds) are sent over TLS, not in cleartext. http:// requests
    // are also blocked as mixed content when MillOS is served over https.
    this.baseUrl = `https://${this.serverHost}:${this.serverPort}/Historian/v1`;

    // Build authorization header
    if (config.authMode === 'windows' && config.domain && config.username && config.password) {
      // NTLM auth (browser may handle automatically)
      const credentials = btoa(`${config.domain}\\${config.username}:${config.password}`);
      this.authHeader = `Basic ${credentials}`;
    } else if (config.authMode === 'sql' && config.username && config.password) {
      const credentials = btoa(`${config.username}:${config.password}`);
      this.authHeader = `Basic ${credentials}`;
    }
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    if (this.protocol === 'sql') {
      logger.warn(
        '[WonderwareAdapter] SQL protocol requires server-side proxy - not yet implemented'
      );
      throw new Error('SQL protocol not supported in browser environment');
    }

    try {
      // Test connection by fetching tag list
      const response = await this.fetchWithAuth(`${this.baseUrl}/Tags?maxCount=1`);
      if (!response.ok) {
        throw new Error(`Wonderware connection failed: ${response.status} ${response.statusText}`);
      }
      this.connected = true;
      logger.info('[WonderwareAdapter] Connected to AVEVA Historian');
    } catch (error) {
      this.connected = false;
      logger.error('[WonderwareAdapter] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('[WonderwareAdapter] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return `AVEVA Historian (${this.serverHost})`;
  }

  // === Read Operations ===

  async getRecordedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const maxCount = options?.maxPoints ?? 10000;
    const url =
      `${this.baseUrl}/Tags/${encodeURIComponent(tagId)}/RawData?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `maxCount=${maxCount}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      logger.warn(
        `[WonderwareAdapter] Failed to get recorded values for ${tagId}: ${response.status}`
      );
      return [];
    }

    const data: WWHistoryResponse = await response.json();
    const rows = Array.isArray(data?.Data) ? data.Data : [];
    return this.mapWWValuesToHistoryPoints(rows);
  }

  async getInterpolatedValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervalMs: number,
    _options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    const url =
      `${this.baseUrl}/Tags/${encodeURIComponent(tagId)}/InterpolatedData?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `resolutionMS=${intervalMs}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      logger.warn(
        `[WonderwareAdapter] Failed to get interpolated values for ${tagId}: ${response.status}`
      );
      return [];
    }

    const data: WWHistoryResponse = await response.json();
    const rows = Array.isArray(data?.Data) ? data.Data : [];
    return this.mapWWValuesToHistoryPoints(rows);
  }

  async getPlotValues(
    tagId: string,
    startTime: Date,
    endTime: Date,
    intervals: number,
    _options?: HistorianQueryOptions
  ): Promise<TagHistoryPoint[]> {
    // Wonderware uses "TrendData" with numberOfIntervals
    const url =
      `${this.baseUrl}/Tags/${encodeURIComponent(tagId)}/TrendData?` +
      `startTime=${startTime.toISOString()}&` +
      `endTime=${endTime.toISOString()}&` +
      `numberOfIntervals=${intervals}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      // Fall back to interpolated if TrendData not available.
      // Guard against intervals <= 0 (Infinity) and negative durations
      // (startTime > endTime) producing a malformed historian request.
      const safeIntervals = intervals > 0 ? intervals : 100;
      const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
      const intervalMs = Math.max(1, Math.floor(durationMs / safeIntervals));
      return this.getInterpolatedValues(tagId, startTime, endTime, intervalMs);
    }

    const data: WWHistoryResponse = await response.json();
    const rows = Array.isArray(data?.Data) ? data.Data : [];
    return this.mapWWValuesToHistoryPoints(rows);
  }

  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    const url = `${this.baseUrl}/Tags/${encodeURIComponent(tagId)}/CurrentValue`;
    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      return null;
    }

    const data: WWHistoryValue = await response.json();
    if (!data || data.TimeStamp === undefined) {
      return null;
    }
    const points = this.mapWWValuesToHistoryPoints([data]);
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

    // Fetch in parallel
    const promises = tagIds.map(async (tagId) => {
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
    });

    await Promise.all(promises);
    return result;
  }

  // === Metadata ===

  async getAvailableRange(tagId: string): Promise<{ start: Date; end: Date } | null> {
    try {
      const url = `${this.baseUrl}/Tags/${encodeURIComponent(tagId)}`;
      const response = await this.fetchWithAuth(url);
      if (!response.ok) return null;

      const tagInfo: WWTagInfo & { FirstTime?: string; LastTime?: string } = await response.json();

      if (tagInfo.FirstTime && tagInfo.LastTime) {
        return {
          start: new Date(tagInfo.FirstTime),
          end: new Date(tagInfo.LastTime),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async getStatistics(): Promise<HistorianStatistics> {
    // Wonderware doesn't provide aggregate stats easily
    return {
      totalPoints: -1,
      oldestTimestamp: null,
      newestTimestamp: null,
      tagCount: -1,
    };
  }

  // === Private Helpers ===

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
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapWWValuesToHistoryPoints(items: WWHistoryValue[]): TagHistoryPoint[] {
    return items.map((item) => {
      let value: number;
      if (typeof item.Value === 'boolean') {
        value = item.Value ? 1 : 0;
      } else if (typeof item.Value === 'string') {
        value = parseFloat(item.Value) || 0;
      } else {
        value = item.Value ?? 0;
      }

      return {
        timestamp: new Date(item.TimeStamp).getTime(),
        value,
        quality: mapOpcQuality(item.Quality),
      };
    });
  }
}

export default WonderwareAdapter;
