/**
 * REST Protocol Adapter for MillOS SCADA
 *
 * Connects to REST APIs for live SCADA data with configurable polling.
 * Supports:
 * - Polling-based data fetching with configurable intervals
 * - Batch tag reads for efficiency
 * - Automatic reconnection with exponential backoff
 * - Authentication via API key or Bearer token
 */

import {
  IProtocolAdapter,
  TagDefinition,
  TagValue,
  Quality,
  ConnectionConfig,
  ConnectionStatus,
  AdapterStatistics,
} from '../types';

/** REST API response format for tag values */
interface RESTTagResponse {
  tagId: string;
  value: number | boolean | string;
  quality: string;
  timestamp: number;
  sourceTimestamp?: number;
}

/** REST API response for batch reads */
interface RESTBatchResponse {
  tags: RESTTagResponse[];
  serverTime: number;
}

/** REST API write request */
interface RESTWriteRequest {
  tagId: string;
  value: number | boolean | string;
}

export class RESTAdapter implements IProtocolAdapter {
  private config: ConnectionConfig;
  private tags: Map<string, TagDefinition> = new Map();
  private values: Map<string, TagValue> = new Map();
  private subscribers: Map<string, Set<(values: TagValue[]) => void>> = new Map();
  private globalSubscribers: Set<(values: TagValue[]) => void> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private connectTime = 0;
  private lastDisconnectTime = 0;
  private reconnectAttempts = 0;
  private lastError: string | undefined;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Statistics
  private stats = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
    totalLatency: 0,
    latencyCount: 0,
  };

  constructor(tagDefinitions: TagDefinition[], config: ConnectionConfig) {
    this.config = config;
    tagDefinitions.forEach((tag) => this.tags.set(tag.id, tag));
  }

  // =========================================================================
  // Lifecycle Methods
  // =========================================================================

  async connect(): Promise<void> {
    if (this.connected) return;

    const baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      throw new Error('REST adapter requires baseUrl in config');
    }

    try {
      // Test connection with health check
      const response = await this.fetchWithAuth(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      this.connected = true;
      this.connectTime = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = undefined;

      // Reset the statistics accumulation window so rate/latency denominators
      // (derived from connectTime/uptime) match the counters, avoiding inflated
      // readsPerSecond/avgReadLatency on the diagnostics panel after a reconnect.
      this.stats = {
        readCount: 0,
        writeCount: 0,
        errorCount: 0,
        totalLatency: 0,
        latencyCount: 0,
      };

      // Start polling
      const interval = this.config.pollInterval ?? 1000;
      this.pollInterval = setInterval(() => this.poll(), interval);

      // Do initial poll
      await this.poll();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.stats.errorCount++;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.values.clear();
    // Clear subscribers to prevent memory leaks across reconnects
    this.subscribers.clear();
    this.globalSubscribers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  async readTag(tagId: string): Promise<TagValue> {
    const start = performance.now();

    try {
      const response = await this.fetchWithAuth(
        `${this.config.baseUrl}/tags/${encodeURIComponent(tagId)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to read tag: ${response.status}`);
      }

      const data: RESTTagResponse = await response.json();
      if (!this.isValidTagResponse(data)) {
        throw new Error('Malformed tag response: missing required fields');
      }
      const tagValue = this.parseTagResponse(data);

      this.values.set(tagId, tagValue);
      this.stats.readCount++;
      this.updateLatency(performance.now() - start);

      return tagValue;
    } catch (err) {
      this.stats.errorCount++;
      throw err;
    }
  }

  async readTags(tagIds: string[]): Promise<TagValue[]> {
    const start = performance.now();

    try {
      const response = await this.fetchWithAuth(`${this.config.baseUrl}/tags/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to read tags: ${response.status}`);
      }

      const data: RESTBatchResponse = await response.json();
      if (!data || !Array.isArray(data.tags)) {
        throw new Error('Malformed batch response: missing tags array');
      }
      const tagValues = data.tags
        .filter((t) => this.isValidTagResponse(t))
        .map((t) => this.parseTagResponse(t));

      tagValues.forEach((tv) => this.values.set(tv.tagId, tv));
      this.stats.readCount += tagIds.length;
      this.updateLatency(performance.now() - start);

      return tagValues;
    } catch (err) {
      this.stats.errorCount++;
      throw err;
    }
  }

  async readAllTags(): Promise<TagValue[]> {
    const tagIds = Array.from(this.tags.keys());
    return this.readTags(tagIds);
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  async writeTag(tagId: string, value: number | boolean | string): Promise<boolean> {
    const tag = this.tags.get(tagId);
    if (!tag) {
      return false;
    }

    if (tag.accessMode === 'READ') {
      return false;
    }

    try {
      const request: RESTWriteRequest = { tagId, value };
      const response = await this.fetchWithAuth(
        `${this.config.baseUrl}/tags/${encodeURIComponent(tagId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to write tag: ${response.status}`);
      }

      this.stats.writeCount++;
      return true;
    } catch {
      this.stats.errorCount++;
      return false;
    }
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  subscribe(tagIds: string[], callback: (values: TagValue[]) => void): () => void {
    if (tagIds.length === 0) {
      // Subscribe to all tags
      this.globalSubscribers.add(callback);
      return () => {
        this.globalSubscribers.delete(callback);
      };
    }

    tagIds.forEach((id) => {
      if (!this.subscribers.has(id)) {
        this.subscribers.set(id, new Set());
      }
      this.subscribers.get(id)!.add(callback);
    });

    return () => {
      tagIds.forEach((id) => {
        this.subscribers.get(id)?.delete(callback);
      });
    };
  }

  // =========================================================================
  // Diagnostics
  // =========================================================================

  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      lastConnectTime: this.connectTime || undefined,
      lastDisconnectTime: this.lastDisconnectTime || undefined,
      reconnectAttempts: this.reconnectAttempts,
      error: this.lastError,
    };
  }

  getStatistics(): AdapterStatistics {
    const uptime = this.connected ? (Date.now() - this.connectTime) / 1000 : 0;
    return {
      readsPerSecond: uptime > 0 ? this.stats.readCount / uptime : 0,
      writesPerSecond: uptime > 0 ? this.stats.writeCount / uptime : 0,
      avgReadLatency:
        this.stats.latencyCount > 0 ? this.stats.totalLatency / this.stats.latencyCount : 0,
      errorCount: this.stats.errorCount,
      uptime,
    };
  }

  // =========================================================================
  // Polling
  // =========================================================================

  private async poll(): Promise<void> {
    if (!this.connected) return;

    try {
      const tagValues = await this.readAllTags();
      this.notifySubscribers(tagValues);
    } catch {
      this.handleConnectionError();
    }
  }

  private handleConnectionError(): void {
    // Already scheduled a reconnect, prevent race condition
    if (this.reconnectTimeoutId) return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts >= 5) {
      // Terminal failure: surface a distinct error so consumers polling
      // getConnectionStatus() can distinguish a permanent give-up from a
      // transient blip. (Reconnect ceiling and subscriber-teardown behavior
      // are intentionally unchanged pending a product decision.)
      this.lastError = 'Reconnect limit reached (5 attempts)';
      this.disconnect();
    } else {
      this.lastError = 'Connection lost';

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      this.reconnectTimeoutId = setTimeout(() => {
        this.reconnectTimeoutId = null;
        this.connect().catch(() => {
          // Reconnection failed - will be retried
        });
      }, delay);
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 10000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    const headers = new Headers(options.headers);

    if (this.config.apiKey) {
      headers.set('Authorization', `Bearer ${this.config.apiKey}`);
    }

    return this.fetchWithTimeout(url, { ...options, headers });
  }

  /**
   * Validates a raw REST tag entry has the required shape before parsing.
   * Guards against malformed 200 responses (e.g. `{}`, `{error:...}`, null entries)
   * that would otherwise throw inside poll() and be misclassified as a lost connection.
   */
  private isValidTagResponse(data: unknown): data is RESTTagResponse {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const d = data as Record<string, unknown>;
    return (
      typeof d.tagId === 'string' &&
      (typeof d.value === 'number' ||
        typeof d.value === 'boolean' ||
        typeof d.value === 'string') &&
      typeof d.quality === 'string' &&
      typeof d.timestamp === 'number'
    );
  }

  private parseTagResponse(data: RESTTagResponse): TagValue {
    return {
      tagId: data.tagId,
      value: data.value,
      quality: this.parseQuality(data.quality),
      timestamp: data.timestamp,
      sourceTimestamp: data.sourceTimestamp,
    };
  }

  private parseQuality(quality: string): Quality {
    const q = quality.toUpperCase();
    if (q === 'GOOD' || q === 'UNCERTAIN' || q === 'BAD' || q === 'STALE') {
      return q as Quality;
    }
    return 'UNCERTAIN';
  }

  private updateLatency(latency: number): void {
    this.stats.totalLatency += latency;
    this.stats.latencyCount++;
  }

  private notifySubscribers(tagValues: TagValue[]): void {
    // Notify global subscribers
    this.globalSubscribers.forEach((callback) => {
      try {
        callback(tagValues);
      } catch {
        // Subscriber callback error - silently ignored in production
      }
    });

    // Notify tag-specific subscribers
    const subscriberUpdates = new Map<(values: TagValue[]) => void, TagValue[]>();

    tagValues.forEach((tv) => {
      const callbacks = this.subscribers.get(tv.tagId);
      if (callbacks) {
        callbacks.forEach((cb) => {
          if (!subscriberUpdates.has(cb)) {
            subscriberUpdates.set(cb, []);
          }
          subscriberUpdates.get(cb)!.push(tv);
        });
      }
    });

    subscriberUpdates.forEach((values, callback) => {
      try {
        callback(values);
      } catch {
        // Subscriber callback error - silently ignored in production
      }
    });
  }
}
