/**
 * WebSocket Protocol Adapter for MillOS SCADA
 *
 * Direct WebSocket connection for real-time SCADA data.
 * Simpler than MQTT for basic pub/sub scenarios.
 *
 * Message Format:
 * - Subscribe: { type: 'subscribe', tagIds: string[] }
 * - Unsubscribe: { type: 'unsubscribe', tagIds: string[] }
 * - Write: { type: 'write', tagId: string, value: any }
 * - Update: { type: 'update', tagId: string, value: any, quality: string, timestamp: number }
 * - Batch: { type: 'batch', tags: TagValue[] }
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
import { isValidWSMessage, MessageValidationError } from './messageValidation';

/** WebSocket message types */
interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'write' | 'update' | 'batch' | 'snapshot' | 'error';
  tagId?: string;
  tagIds?: string[];
  value?: number | boolean | string;
  quality?: string;
  timestamp?: number;
  tags?: Array<{
    tagId: string;
    value: number | boolean | string;
    quality: string;
    timestamp: number;
  }>;
  error?: string;
}

export class WebSocketAdapter implements IProtocolAdapter {
  private config: ConnectionConfig;
  private tags: Map<string, TagDefinition> = new Map();
  private values: Map<string, TagValue> = new Map();
  private subscribers: Map<string, Set<(values: TagValue[]) => void>> = new Map();
  private globalSubscribers: Set<(values: TagValue[]) => void> = new Set();
  private connectionListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private ws: WebSocket | null = null;
  private connected = false;
  private connectTime = 0;
  private lastDisconnectTime = 0;
  private reconnectAttempts = 0;
  private lastError: string | undefined;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isDisconnecting = false; // Prevents reconnection after deliberate disconnect

  // Statistics
  private stats = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
    messagesReceived: 0,
    messagesSent: 0,
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

    // Reset the disconnecting flag when connecting
    this.isDisconnecting = false;

    const wsUrl = this.config.proxyUrl ?? this.config.baseUrl;
    if (!wsUrl) {
      throw new Error('WebSocket adapter requires proxyUrl or baseUrl in config');
    }

    // Convert http(s) to ws(s) if needed
    const url = wsUrl.replace(/^http/, 'ws');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          // Mark as deliberately closing so the onclose handler does not
          // schedule a background reconnect for a connect the caller already
          // saw fail (otherwise an orphaned reconnect loop runs after reject).
          this.isDisconnecting = true;
          reject(new Error('Connection timeout'));
          this.ws?.close();
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.connectTime = Date.now();
          this.reconnectAttempts = 0;
          this.lastError = undefined;

          // Start heartbeat
          this.startHeartbeat();

          // Subscribe to all tags
          this.sendMessage({
            type: 'subscribe',
            tagIds: Array.from(this.tags.keys()),
          });

          // Notify connection-state listeners that the link is up so a
          // consumer that previously saw it go down can recover.
          this.notifyConnectionChange();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = () => {
          const error = new Error('WebSocket error');
          this.lastError = error.message;
          this.stats.errorCount++;

          if (!this.connected) {
            clearTimeout(timeout);
            reject(error);
          }
        };

        this.ws.onclose = (event) => {
          this.handleDisconnect(event.reason || 'Connection closed');
        };
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.stats.errorCount++;
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    // Set flag to prevent reconnection attempts after deliberate disconnect
    this.isDisconnecting = true;

    this.stopReconnect();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.values.clear();
    // Clear subscribers to prevent memory leaks across reconnects
    this.subscribers.clear();
    this.globalSubscribers.clear();
    this.connectionListeners.clear();
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  async readTag(tagId: string): Promise<TagValue> {
    const value = this.values.get(tagId);
    if (!value) {
      return {
        tagId,
        value: 0,
        quality: 'STALE',
        timestamp: Date.now(),
      };
    }

    this.stats.readCount++;
    return { ...value };
  }

  async readTags(tagIds: string[]): Promise<TagValue[]> {
    return Promise.all(tagIds.map((id) => this.readTag(id)));
  }

  async readAllTags(): Promise<TagValue[]> {
    this.stats.readCount += this.values.size;
    return Array.from(this.values.values()).map((v) => ({ ...v }));
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  async writeTag(tagId: string, value: number | boolean | string): Promise<boolean> {
    if (!this.ws || !this.connected) {
      return false;
    }

    const tag = this.tags.get(tagId);
    if (!tag) {
      return false;
    }

    if (tag.accessMode === 'READ') {
      return false;
    }

    try {
      this.sendMessage({
        type: 'write',
        tagId,
        value,
      });
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

  /**
   * Subscribe to connection-state transitions (connect success, disconnect,
   * and reconnection abandoned after max attempts). The value-subscriber path
   * (subscribe) only fires on tag updates, so a data-only consumer would never
   * learn the link is permanently down; this channel surfaces that.
   */
  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
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
      avgReadLatency: 0,
      errorCount: this.stats.errorCount,
      uptime,
    };
  }

  // =========================================================================
  // Message Handling
  // =========================================================================

  private handleMessage(data: string): void {
    try {
      // Parse JSON
      const parsed: unknown = JSON.parse(data);

      // Validate message structure
      if (!isValidWSMessage(parsed)) {
        throw new MessageValidationError(
          'Invalid WebSocket message structure',
          parsed,
          'WebSocket'
        );
      }

      // Type assertion after validation with explicit null check
      const msg = parsed as WSMessage;
      if (!msg || typeof msg.type !== 'string') {
        throw new MessageValidationError(
          'Invalid message: missing or invalid type field',
          parsed,
          'WebSocket'
        );
      }

      this.stats.messagesReceived++;

      switch (msg.type) {
        case 'update':
          // Only accept values for known tags so a compromised/MITM proxy
          // cannot inject arbitrary tagIds into the value store.
          if (msg.tagId && this.tags.has(msg.tagId)) {
            const tagValue = this.parseTagValue(msg);
            this.values.set(msg.tagId, tagValue);
            this.notifySubscribers([tagValue]);
          }
          break;

        case 'batch':
        case 'snapshot':
          if (msg.tags) {
            const tagValues = msg.tags
              // Drop tags that are not part of the known TagDefinition set.
              .filter((t) => this.tags.has(t.tagId))
              .map((t) => ({
                tagId: t.tagId,
                value: t.value ?? 0,
                quality: this.parseQuality(t.quality),
                timestamp: t.timestamp ?? Date.now(),
              }));
            tagValues.forEach((tv) => this.values.set(tv.tagId, tv));
            this.notifySubscribers(tagValues);
          }
          break;

        case 'error':
          this.stats.errorCount++;
          break;

        default:
          // Handle ping/pong and other unknown message types
          // No action needed for heartbeat messages
          break;
      }
    } catch {
      this.stats.errorCount++;
    }
  }

  private parseTagValue(msg: WSMessage): TagValue {
    return {
      tagId: msg.tagId!,
      value: msg.value ?? 0,
      quality: this.parseQuality(msg.quality ?? 'GOOD'),
      timestamp: msg.timestamp ?? Date.now(),
    };
  }

  private parseQuality(quality: string | undefined): Quality {
    // Null-safe: tolerate undefined/empty quality so a relaxed validator or
    // missing field cannot throw on `.toUpperCase()`.
    const q = String(quality ?? '').toUpperCase();
    if (q === 'GOOD' || q === 'UNCERTAIN' || q === 'BAD' || q === 'STALE') {
      return q as Quality;
    }
    return 'UNCERTAIN';
  }

  private sendMessage(msg: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      this.stats.messagesSent++;
    }
  }

  private handleDisconnect(_reason: string): void {
    this.stopHeartbeat();
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.ws = null;

    // Don't attempt reconnection if this was a deliberate disconnect
    if (this.isDisconnecting) {
      this.notifyConnectionChange();
      return;
    }

    // Attempt reconnection
    if (this.reconnectAttempts < 10) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      const jitter = Math.random() * 1000;

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch(() => {
          // Reconnect failed - will be retried
        });
      }, delay + jitter);
    } else {
      // Reconnection abandoned after the max attempts. Record a terminal error
      // so getConnectionStatus reflects it, then push the state to listeners so
      // a data-only consumer learns the feed is permanently dead instead of
      // silently showing stale values forever.
      this.lastError = 'WebSocket reconnection abandoned after maximum attempts';
    }

    // Surface the connection-state transition to listeners.
    this.notifyConnectionChange();
  }

  private stopReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private notifySubscribers(tagValues: TagValue[]): void {
    // Notify global subscribers with error isolation
    const globalCallbacksCopy = [...this.globalSubscribers];
    globalCallbacksCopy.forEach((callback) => {
      try {
        callback(tagValues);
      } catch {
        // Remove faulty callback to prevent repeated errors
        try {
          this.globalSubscribers.delete(callback);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    // Notify tag-specific subscribers with error isolation
    const subscriberUpdates = new Map<(values: TagValue[]) => void, TagValue[]>();

    try {
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
    } finally {
      // Always attempt to notify collected subscribers, even if collection had errors
      subscriberUpdates.forEach((values, callback) => {
        try {
          callback(values);
        } catch {
          // Remove faulty callback from all tag subscriptions
          try {
            this.subscribers.forEach((callbackSet) => {
              callbackSet.delete(callback);
            });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    }
  }

  private notifyConnectionChange(): void {
    if (this.connectionListeners.size === 0) {
      return;
    }
    const status = this.getConnectionStatus();
    // Iterate a copy with error isolation so one faulty listener cannot block
    // the others or break the disconnect/connect flow.
    const listenersCopy = [...this.connectionListeners];
    listenersCopy.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // Remove faulty listener to prevent repeated errors
        try {
          this.connectionListeners.delete(listener);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  }
}
