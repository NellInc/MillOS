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
import {
  isTagValueCompatible,
  isValidWSMessage,
  MessageValidationError,
} from './messageValidation';

/** WebSocket message types */
interface WSMessage {
  type:
    | 'subscribe'
    | 'unsubscribe'
    | 'write'
    | 'update'
    | 'batch'
    | 'snapshot'
    | 'error'
    | 'ping'
    | 'pong';
  tagId?: string;
  tagIds?: string[];
  value?: number | boolean | string;
  quality?: string;
  timestamp?: number;
  sourceTimestamp?: number;
  tags?: Array<{
    tagId: string;
    value: number | boolean | string;
    quality: string;
    timestamp: number;
    sourceTimestamp?: number;
  }>;
  error?: string;
}

// Bound JSON parsing work for an untrusted transport frame. The catalogue's
// largest legitimate snapshot is comfortably below this ceiling.
const MAX_WEBSOCKET_FRAME_CHARS = 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_RESPONSE_TIMEOUT_MS = 10_000;

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
  private heartbeatResponseTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisconnecting = false; // Prevents reconnection after deliberate disconnect
  private connectPromise: Promise<void> | null = null;
  private cancelPendingConnect: ((error: Error) => void) | null = null;
  private committedTimestamps = new Map<string, number>();

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

  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    // Reset the disconnecting flag when connecting
    this.isDisconnecting = false;
    // A caller may recover the connection before an automatic retry fires.
    this.stopReconnect();

    const wsUrl = this.config.proxyUrl ?? this.config.baseUrl;
    if (!wsUrl) {
      return Promise.reject(new Error('WebSocket adapter requires proxyUrl or baseUrl in config'));
    }

    // Convert http(s) to ws(s) if needed
    const url = wsUrl.replace(/^http/, 'ws');

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.stats.errorCount++;
      return Promise.reject(err);
    }

    this.ws = socket;
    let resolveConnect!: () => void;
    let rejectConnect!: (error: Error) => void;
    let settled = false;
    let suppressReconnectOnClose = false;
    const promise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });
    this.connectPromise = promise;

    const timeout = setTimeout(() => {
      if (this.connectPromise !== promise || this.ws !== socket) return;
      suppressReconnectOnClose = true;
      fail(new Error('Connection timeout'));
      socket.close();
    }, 10000);

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (this.connectPromise === promise) {
        this.connectPromise = null;
        this.cancelPendingConnect = null;
      }
    };

    const succeed = (): void => {
      if (settled) return;
      finish();
      resolveConnect();
    };

    const fail = (error: Error): void => {
      if (settled) return;
      finish();
      rejectConnect(error);
    };

    this.cancelPendingConnect = (error) => {
      suppressReconnectOnClose = true;
      fail(error);
    };

    socket.onopen = () => {
      // Events from a failed, cancelled, or replaced socket have no authority
      // over the current connection.
      if (this.ws !== socket || this.connectPromise !== promise || this.isDisconnecting) {
        socket.close();
        return;
      }

      try {
        this.connected = true;
        this.stopReconnect();
        this.startHeartbeat();
        this.sendMessage({
          type: 'subscribe',
          tagIds: Array.from(this.tags.keys()),
        });
        this.connectTime = Date.now();
        this.reconnectAttempts = 0;
        this.lastError = undefined;
        this.notifyConnectionChange();
        succeed();
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.lastError = error.message;
        this.stats.errorCount++;
        suppressReconnectOnClose = true;
        this.connected = false;
        this.stopHeartbeat();
        if (this.ws === socket) this.ws = null;
        fail(error);
        socket.close();
      }
    };

    socket.onmessage = (event) => {
      if (this.ws === socket && this.connected) {
        this.handleMessage(event.data);
      }
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      const error = new Error('WebSocket error');
      this.lastError = error.message;
      this.stats.errorCount++;
      if (!this.connected) {
        suppressReconnectOnClose = true;
        if (this.ws === socket) this.ws = null;
        fail(error);
        socket.close();
      }
    };

    socket.onclose = (event) => {
      if (this.ws !== socket) return;
      if (this.connectPromise === promise) {
        fail(new Error(event.reason || 'Connection closed before opening'));
      }
      this.handleDisconnect(socket, event.reason || 'Connection closed', !suppressReconnectOnClose);
    };

    return promise;
  }

  async disconnect(): Promise<void> {
    // Set flag to prevent reconnection attempts after deliberate disconnect
    this.isDisconnecting = true;

    this.stopReconnect();
    this.stopHeartbeat();

    const socket = this.ws;
    this.ws = null;
    this.connected = false;
    this.cancelPendingConnect?.(new Error('WebSocket connection cancelled'));
    if (socket) {
      socket.close(1000, 'Client disconnect');
    }
    this.lastDisconnectTime = Date.now();
    this.resetValueAuthority();
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
    if (!this.isConnected()) {
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
    if (typeof data !== 'string' || data.length > MAX_WEBSOCKET_FRAME_CHARS) {
      this.stats.errorCount++;
      return;
    }

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
            const tag = this.tags.get(msg.tagId)!;
            if (
              !isTagValueCompatible(tag, msg.value) ||
              !this.isValidSourceTimestamp(msg.sourceTimestamp)
            ) {
              throw new MessageValidationError(
                'WebSocket update value does not match tag type',
                msg,
                'WebSocket'
              );
            }
            const tagValue = this.parseTagValue(msg);
            if (this.commitTagValue(tagValue)) {
              this.notifySubscribers([tagValue]);
            }
          }
          break;

        case 'batch':
        case 'snapshot':
          if (msg.tags) {
            const knownTags = msg.tags.filter((tagValue) => this.tags.has(tagValue.tagId));
            const isCompatibleSnapshot = knownTags.every((tagValue) => {
              const tag = this.tags.get(tagValue.tagId)!;
              return (
                isTagValueCompatible(tag, tagValue.value) &&
                this.isValidSourceTimestamp(tagValue.sourceTimestamp)
              );
            });
            if (!isCompatibleSnapshot) {
              throw new MessageValidationError(
                'WebSocket batch contains an incompatible known-tag value',
                msg,
                'WebSocket'
              );
            }

            const tagValues = knownTags.map((t) => ({
              tagId: t.tagId,
              value: t.value,
              quality: this.parseQuality(t.quality),
              timestamp: t.timestamp,
              ...(t.sourceTimestamp === undefined ? {} : { sourceTimestamp: t.sourceTimestamp }),
            }));
            const committedValues = tagValues.filter((tagValue) => this.commitTagValue(tagValue));
            if (committedValues.length > 0) {
              this.notifySubscribers(committedValues);
            }
          }
          break;

        case 'ping':
          this.sendMessage({ type: 'pong' });
          break;

        case 'pong':
          this.clearHeartbeatResponseTimeout();
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
      value: msg.value!,
      quality: this.parseQuality(msg.quality!),
      timestamp: msg.timestamp!,
      ...(msg.sourceTimestamp === undefined ? {} : { sourceTimestamp: msg.sourceTimestamp }),
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.ws.send(JSON.stringify(msg));
    this.stats.messagesSent++;
  }

  private handleDisconnect(socket: WebSocket, _reason: string, allowReconnect = true): void {
    if (this.ws !== socket) return;

    this.stopHeartbeat();
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.ws = null;
    // An unplanned loss leaves the last values unrefreshed; publish them as
    // STALE before the cache is dropped, or they read as GOOD indefinitely.
    const now = this.lastDisconnectTime;
    const stale = this.isDisconnecting
      ? []
      : Array.from(this.values.values()).map(
          (value): TagValue => ({ ...value, quality: 'STALE', timestamp: now })
        );
    this.resetValueAuthority();
    if (stale.length > 0) this.notifySubscribers(stale);

    // Don't attempt reconnection if this was a deliberate disconnect
    if (this.isDisconnecting || !allowReconnect) {
      this.notifyConnectionChange();
      return;
    }

    this.scheduleReconnect();

    // Surface the connection-state transition to listeners.
    this.notifyConnectionChange();
  }

  private scheduleReconnect(): void {
    if (this.isDisconnecting || this.connected || this.connectPromise || this.reconnectTimeout) {
      return;
    }

    if (this.reconnectAttempts >= 10) {
      this.lastError = 'WebSocket reconnection abandoned after maximum attempts';
      this.notifyConnectionChange();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    const jitter = Math.random() * 1000;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.isDisconnecting || this.connected || this.connectPromise) return;
      this.connect().catch(() => {
        // A constructor failure or timed-out attempt may not produce a close
        // event, so explicitly keep the bounded recovery loop moving.
        this.scheduleReconnect();
      });
    }, delay + jitter);
  }

  private stopReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const socket = this.ws;
    this.heartbeatInterval = setInterval(() => {
      if (this.ws !== socket || socket?.readyState !== WebSocket.OPEN) return;
      if (this.heartbeatResponseTimeout) return;

      try {
        socket.send(JSON.stringify({ type: 'ping' }));
        this.stats.messagesSent++;
        this.heartbeatResponseTimeout = setTimeout(() => {
          this.heartbeatResponseTimeout = null;
          if (this.ws !== socket || !this.connected || socket.readyState !== WebSocket.OPEN) return;

          const error = new Error('WebSocket heartbeat timeout');
          this.lastError = error.message;
          this.stats.errorCount++;
          socket.close();
          this.handleDisconnect(socket, error.message);
        }, HEARTBEAT_RESPONSE_TIMEOUT_MS);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.lastError = error.message;
        this.stats.errorCount++;
        socket.close();
        this.handleDisconnect(socket, error.message);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatResponseTimeout();
  }

  private clearHeartbeatResponseTimeout(): void {
    if (this.heartbeatResponseTimeout) {
      clearTimeout(this.heartbeatResponseTimeout);
      this.heartbeatResponseTimeout = null;
    }
  }

  private isValidSourceTimestamp(timestamp: number | undefined): boolean {
    return timestamp === undefined || Number.isFinite(timestamp);
  }

  private commitTagValue(tagValue: TagValue): boolean {
    const timestamp = tagValue.sourceTimestamp ?? tagValue.timestamp;
    const committedTimestamp = this.committedTimestamps.get(tagValue.tagId);
    if (committedTimestamp !== undefined && timestamp < committedTimestamp) {
      return false;
    }

    this.values.set(tagValue.tagId, { ...tagValue });
    this.committedTimestamps.set(tagValue.tagId, timestamp);
    return true;
  }

  private resetValueAuthority(): void {
    this.values.clear();
    this.committedTimestamps.clear();
  }

  private notifySubscribers(tagValues: TagValue[]): void {
    // Notify global subscribers with error isolation
    const globalCallbacksCopy = [...this.globalSubscribers];
    globalCallbacksCopy.forEach((callback) => {
      try {
        callback(tagValues.map((value) => ({ ...value })));
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
          callback(values.map((value) => ({ ...value })));
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
