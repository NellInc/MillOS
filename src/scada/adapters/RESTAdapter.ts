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
import { isTagValueCompatible } from './messageValidation';

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

class RESTRequestAbortedError extends Error {
  constructor() {
    super('Request aborted');
    this.name = 'AbortError';
  }
}

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

const MAX_REST_BATCH_TAG_IDS = 1_000;

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
  private connectPromise: Promise<void> | null = null;
  private pollPromise: Promise<void> | null = null;
  private lifecycleEpoch = 0;
  private deliberatelyDisconnected = true;
  private activeControllers = new Set<AbortController>();
  private nextReadSequence = 0;
  private committedReads = new Map<string, { timestamp: number; requestSequence: number }>();

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

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.deliberatelyDisconnected = false;
    const epoch = ++this.lifecycleEpoch;
    const connection = this.performConnect(epoch).finally(() => {
      if (this.connectPromise === connection) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = connection;
    return connection;
  }

  async disconnect(): Promise<void> {
    this.deliberatelyDisconnected = true;
    this.lifecycleEpoch++;
    // Detach cancelled work immediately. Its epoch checks still prevent a
    // late result from committing, while callers may begin a fresh lifecycle
    // without waiting for an abort-ignoring transport to settle.
    this.connectPromise = null;
    this.pollPromise = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.abortActiveRequests();
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.resetReadAuthority();
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
    const epoch = this.lifecycleEpoch;
    const tag = this.tags.get(tagId);
    if (!tag) {
      throw new Error(`Unknown tag: ${tagId}`);
    }
    const requestSequence = ++this.nextReadSequence;

    try {
      this.assertCurrentLifecycle(epoch);
      const { response, data } = await this.fetchWithAuthAndConsume(
        `${this.config.baseUrl}/tags/${encodeURIComponent(tagId)}`,
        {},
        async (result) => ({
          response: result,
          data: result.ok ? await result.json() : undefined,
        })
      );
      this.assertCurrentLifecycle(epoch);

      if (!response.ok) {
        throw new Error(`Failed to read tag: ${response.status}`);
      }

      if (
        !this.isValidTagResponse(data) ||
        data.tagId !== tagId ||
        !isTagValueCompatible(tag, data.value)
      ) {
        throw new Error('Malformed tag response: missing required fields');
      }
      const tagValue = this.parseTagResponse(data);

      this.commitTagValue(tagValue, requestSequence);
      this.stats.readCount++;
      this.updateLatency(performance.now() - start);

      return { ...tagValue };
    } catch (err) {
      if (epoch !== this.lifecycleEpoch || this.deliberatelyDisconnected) {
        throw new RESTRequestAbortedError();
      }
      this.recordError(err);
      throw err;
    }
  }

  async readTags(tagIds: string[]): Promise<TagValue[]> {
    const { values } = await this.readTagsAndCommit(tagIds);
    return values;
  }

  private async readTagsAndCommit(
    tagIds: string[]
  ): Promise<{ values: TagValue[]; committedValues: TagValue[] }> {
    if (tagIds.length > MAX_REST_BATCH_TAG_IDS) {
      throw new Error(`Batch tag limit exceeded (${MAX_REST_BATCH_TAG_IDS})`);
    }
    const uniqueTagIds = Array.from(new Set(tagIds));
    if (uniqueTagIds.length === 0) return { values: [], committedValues: [] };
    const unknownTag = uniqueTagIds.find((tagId) => !this.tags.has(tagId));
    if (unknownTag) {
      throw new Error(`Unknown tag: ${unknownTag}`);
    }

    const start = performance.now();
    const epoch = this.lifecycleEpoch;
    const requestSequence = ++this.nextReadSequence;

    try {
      this.assertCurrentLifecycle(epoch);
      const { response, data } = await this.fetchWithAuthAndConsume(
        `${this.config.baseUrl}/tags/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds: uniqueTagIds }),
        },
        async (result) => ({
          response: result,
          data: result.ok ? await result.json() : undefined,
        })
      );
      this.assertCurrentLifecycle(epoch);

      if (!response.ok) {
        throw new Error(`Failed to read tags: ${response.status}`);
      }

      if (!data || typeof data !== 'object' || !('tags' in data) || !Array.isArray(data.tags)) {
        throw new Error('Malformed batch response: missing tags array');
      }
      const batch = data as RESTBatchResponse;
      const requested = new Set(uniqueTagIds);
      const returned = new Set<string>();
      const isCompleteSnapshot =
        batch.tags.length === uniqueTagIds.length &&
        batch.tags.every((entry) => {
          const tag =
            this.isValidTagResponse(entry) && requested.has(entry.tagId)
              ? this.tags.get(entry.tagId)
              : undefined;
          if (!tag || !isTagValueCompatible(tag, entry.value)) return false;
          if (!requested.has(entry.tagId) || returned.has(entry.tagId)) return false;
          returned.add(entry.tagId);
          return true;
        });
      if (!isCompleteSnapshot || returned.size !== requested.size) {
        throw new Error('Malformed batch response: incomplete or invalid tag snapshot');
      }

      const tagValues = batch.tags.map((entry) => this.parseTagResponse(entry));

      const committedValues = tagValues.filter((tv) => this.commitTagValue(tv, requestSequence));
      this.stats.readCount += tagValues.length;
      this.updateLatency(performance.now() - start);

      return {
        values: tagValues.map((value) => ({ ...value })),
        committedValues: committedValues.map((value) => ({ ...value })),
      };
    } catch (err) {
      if (epoch !== this.lifecycleEpoch || this.deliberatelyDisconnected) {
        throw new RESTRequestAbortedError();
      }
      this.recordError(err);
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
    if (!this.connected || this.deliberatelyDisconnected) {
      return false;
    }

    const tag = this.tags.get(tagId);
    if (!tag) {
      return false;
    }

    if (tag.accessMode === 'READ') {
      return false;
    }

    if (!isTagValueCompatible(tag, value)) {
      return false;
    }

    const epoch = this.lifecycleEpoch;
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
      this.assertCurrentLifecycle(epoch);

      if (!response.ok) {
        throw new Error(`Failed to write tag: ${response.status}`);
      }

      this.stats.writeCount++;
      return true;
    } catch (error) {
      if (epoch !== this.lifecycleEpoch || this.deliberatelyDisconnected) {
        return false;
      }
      this.recordError(error);
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

    const uniqueTagIds = [...new Set(tagIds)];
    const unknownTag = uniqueTagIds.find((id) => !this.tags.has(id));
    if (unknownTag) {
      throw new Error(`Unknown tag: ${unknownTag}`);
    }

    uniqueTagIds.forEach((id) => {
      if (!this.subscribers.has(id)) {
        this.subscribers.set(id, new Set());
      }
      this.subscribers.get(id)!.add(callback);
    });

    return () => {
      uniqueTagIds.forEach((id) => {
        const callbacks = this.subscribers.get(id);
        callbacks?.delete(callback);
        if (callbacks?.size === 0) {
          this.subscribers.delete(id);
        }
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

  private poll(): Promise<void> {
    if (!this.connected) return Promise.resolve();
    if (this.pollPromise) return this.pollPromise;

    const epoch = this.lifecycleEpoch;
    const polling = (async () => {
      try {
        const { committedValues } = await this.readTagsAndCommit(Array.from(this.tags.keys()));
        if (
          committedValues.length > 0 &&
          this.connected &&
          !this.deliberatelyDisconnected &&
          epoch === this.lifecycleEpoch
        ) {
          this.notifySubscribers(committedValues);
        }
      } catch (error) {
        if (
          this.connected &&
          !this.deliberatelyDisconnected &&
          epoch === this.lifecycleEpoch &&
          !isAbortError(error)
        ) {
          this.handleConnectionError(error);
        }
      }
    })().finally(() => {
      if (this.pollPromise === polling) {
        this.pollPromise = null;
      }
    });
    this.pollPromise = polling;
    return polling;
  }

  private handleConnectionError(error: unknown): void {
    if (this.deliberatelyDisconnected || this.reconnectTimeoutId) return;

    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.lastError = error instanceof Error ? error.message : 'Connection lost';
    this.lifecycleEpoch++;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.abortActiveRequests();
    // The last polled values are no longer being refreshed; publish them as
    // STALE before the cache is dropped, or they read as GOOD indefinitely.
    const now = this.lastDisconnectTime;
    const stale = Array.from(this.values.values()).map(
      (value): TagValue => ({ ...value, quality: 'STALE', timestamp: now })
    );
    // The recovering server may have restarted its source clock. Values and
    // ordering metadata from the failed connection have no authority over the
    // replacement lifecycle.
    this.resetReadAuthority();
    this.reconnectAttempts++;
    this.scheduleReconnect();
    if (stale.length > 0) this.notifySubscribers(stale);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit,
    consume: (response: Response) => Promise<T> | T,
    timeoutMs = 10000
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    this.activeControllers.add(controller);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return await consume(response);
    } catch (err) {
      if (isAbortError(err)) {
        if (timedOut) {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw new RESTRequestAbortedError();
      }
      throw err;
    } finally {
      clearTimeout(timeout);
      this.activeControllers.delete(controller);
    }
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return this.fetchWithAuthAndConsume(url, options, (response) => response);
  }

  private async fetchWithAuthAndConsume<T>(
    url: string,
    options: RequestInit,
    consume: (response: Response) => Promise<T> | T
  ): Promise<T> {
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

    return this.fetchWithTimeout(url, { ...options, headers }, consume);
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
      d.tagId.length > 0 &&
      (typeof d.value === 'number' ||
        typeof d.value === 'boolean' ||
        typeof d.value === 'string') &&
      (typeof d.value !== 'number' || Number.isFinite(d.value)) &&
      typeof d.quality === 'string' &&
      typeof d.timestamp === 'number' &&
      Number.isFinite(d.timestamp) &&
      (d.sourceTimestamp === undefined ||
        (typeof d.sourceTimestamp === 'number' && Number.isFinite(d.sourceTimestamp)))
    );
  }

  private parseTagResponse(data: RESTTagResponse): TagValue {
    return {
      tagId: data.tagId,
      value: data.value,
      quality: this.parseQuality(data.quality),
      timestamp: data.timestamp,
      ...(data.sourceTimestamp === undefined ? {} : { sourceTimestamp: data.sourceTimestamp }),
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

  private commitTagValue(tagValue: TagValue, requestSequence: number): boolean {
    const incomingTimestamp = tagValue.sourceTimestamp ?? tagValue.timestamp;
    const committed = this.committedReads.get(tagValue.tagId);
    if (
      committed &&
      (incomingTimestamp < committed.timestamp ||
        (incomingTimestamp === committed.timestamp && requestSequence < committed.requestSequence))
    ) {
      return false;
    }

    this.values.set(tagValue.tagId, { ...tagValue });
    this.committedReads.set(tagValue.tagId, {
      timestamp: incomingTimestamp,
      requestSequence,
    });
    return true;
  }

  private notifySubscribers(tagValues: TagValue[]): void {
    // Notify global subscribers
    this.globalSubscribers.forEach((callback) => {
      try {
        callback(tagValues.map((value) => ({ ...value })));
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
        callback(values.map((value) => ({ ...value })));
      } catch {
        // Subscriber callback error - silently ignored in production
      }
    });
  }

  private async performConnect(epoch: number): Promise<void> {
    const baseUrl = this.config.baseUrl;
    let initialReadStarted = false;

    try {
      if (!baseUrl) {
        throw new Error('REST adapter requires baseUrl in config');
      }

      const response = await this.fetchWithAuth(`${baseUrl}/health`);
      this.assertCurrentLifecycle(epoch);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      // A successful health check begins a fresh diagnostics window. The
      // initial snapshot remains part of that window and must also succeed
      // before the adapter is advertised as connected.
      this.stats = {
        readCount: 0,
        writeCount: 0,
        errorCount: 0,
        totalLatency: 0,
        latencyCount: 0,
      };

      initialReadStarted = true;
      const { committedValues: initialValues } = await this.readTagsAndCommit(
        Array.from(this.tags.keys())
      );
      this.assertCurrentLifecycle(epoch);

      this.connected = true;
      this.connectTime = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = undefined;
      if (initialValues.length > 0) {
        this.notifySubscribers(initialValues);
      }

      const interval = this.safePollInterval();
      this.pollInterval = setInterval(() => void this.poll(), interval);
    } catch (error) {
      if (epoch !== this.lifecycleEpoch) {
        throw new RESTRequestAbortedError();
      }
      this.connected = false;
      if (!isAbortError(error)) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
      // The batch read owns the error counter for the initial snapshot. Health,
      // configuration, and lifecycle failures are owned by connect itself.
      if (!initialReadStarted) {
        this.recordError(error);
      }
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.deliberatelyDisconnected || this.reconnectTimeoutId) return;

    if (this.reconnectAttempts >= 5) {
      this.lastError = 'Reconnect limit reached (5 attempts)';
      // Keep subscribers: a failure path must not silently unsubscribe callers
      // (disconnect() is where clearing is intentional).
      this.values.clear();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (this.deliberatelyDisconnected) return;

      this.connect().catch((error) => {
        if (this.deliberatelyDisconnected || isAbortError(error)) return;
        this.reconnectAttempts++;
        this.scheduleReconnect();
      });
    }, delay);
  }

  private safePollInterval(): number {
    const interval = this.config.pollInterval;
    return Number.isFinite(interval) && (interval as number) > 0
      ? Math.max(10, interval as number)
      : 1000;
  }

  private assertCurrentLifecycle(epoch: number): void {
    if (this.deliberatelyDisconnected || epoch !== this.lifecycleEpoch) {
      throw new RESTRequestAbortedError();
    }
  }

  private abortActiveRequests(): void {
    this.activeControllers.forEach((controller) => controller.abort());
    this.activeControllers.clear();
  }

  private resetReadAuthority(): void {
    this.values.clear();
    this.committedReads.clear();
    this.nextReadSequence = 0;
  }

  private recordError(error: unknown): void {
    if (isAbortError(error)) return;
    this.stats.errorCount++;
  }
}
