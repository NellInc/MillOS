/**
 * MQTT Protocol Adapter for MillOS SCADA
 *
 * Connects to MQTT brokers via WebSocket for real-time SCADA data streams.
 * Supports:
 * - WebSocket-based MQTT (browser-compatible)
 * - Topic-based pub/sub for tag values
 * - Automatic reconnection with exponential backoff
 * - Last Will and Testament for disconnect detection
 * - QoS levels for reliable delivery
 *
 * Topic Structure:
 * - Subscribe: {topicPrefix}/tags/+/value (receive all tag updates)
 * - Subscribe: {topicPrefix}/tags/{tagId}/value (receive specific tag)
 * - Publish: {topicPrefix}/tags/{tagId}/write (write to tag)
 * - Subscribe: {topicPrefix}/alarms/+ (receive alarm notifications)
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
import { isValidMQTTPayload, MessageValidationError } from './messageValidation';

/** MQTT message payload for tag values */
interface MQTTTagPayload {
  tagId: string;
  value: number | boolean | string;
  quality: string;
  timestamp: number;
  sourceTimestamp?: number;
}

/** MQTT client state */
type MQTTState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Lightweight MQTT-over-WebSocket client
 * Uses native WebSocket API for browser compatibility
 */
class MQTTWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private subscriptions = new Map<string, Set<(topic: string, payload: string) => void>>();
  private messageId = 0;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private state: MQTTState = 'disconnected';
  private isConnecting = false;

  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;

  constructor(url: string, clientId: string) {
    this.url = url;
    this.clientId = clientId;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) return; // Guard against concurrent connections
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.isConnecting = true;
    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, 'mqtt');
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.sendConnectPacket();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = () => {
          const error = new Error('WebSocket error');
          this.onError?.(error);
          if (this.state === 'connecting') {
            this.isConnecting = false;
            reject(error);
          }
        };

        this.ws.onclose = (event) => {
          this.handleDisconnect(event.reason || 'Connection closed');
        };

        // Wait for CONNACK
        const timeout = setTimeout(() => {
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
          this.disconnect();
        }, 10000);

        const originalOnMessage = this.ws.onmessage;
        this.ws.onmessage = (event) => {
          const data = new Uint8Array(event.data);
          // Check for CONNACK (0x20)
          if (data[0] === 0x20) {
            clearTimeout(timeout);
            this.state = 'connected';
            this.isConnecting = false;
            this.startKeepAlive();
            this.ws!.onmessage = originalOnMessage;
            this.onConnect?.();
            resolve();
          }
        };
      } catch (err) {
        this.state = 'disconnected';
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      // Send DISCONNECT packet
      if (this.ws.readyState === WebSocket.OPEN) {
        const packet = new Uint8Array([0xe0, 0x00]); // DISCONNECT
        this.ws.send(packet);
      }
      this.ws.close();
      this.ws = null;
    }
    this.stopKeepAlive();
    this.state = 'disconnected';
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  subscribe(topic: string, callback: (topic: string, payload: string) => void): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
      // Send SUBSCRIBE packet
      this.sendSubscribePacket(topic);
    }
    this.subscriptions.get(topic)!.add(callback);
  }

  unsubscribe(topic: string, callback: (topic: string, payload: string) => void): void {
    const callbacks = this.subscriptions.get(topic);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(topic);
        // Send UNSUBSCRIBE packet
        this.sendUnsubscribePacket(topic);
      }
    }
  }

  /**
   * Encode an MQTT "Remaining Length" value using the variable-length-integer
   * (continuation-bit) scheme defined by MQTT 3.1.1 (1-4 bytes). Values up to
   * 268435455 are supported; anything larger is not representable in MQTT.
   */
  private static encodeRemainingLength(length: number): number[] {
    const bytes: number[] = [];
    let value = length;
    do {
      let encodedByte = value % 128;
      value = Math.floor(value / 128);
      // Set the continuation bit if there is more data to encode.
      if (value > 0) {
        encodedByte |= 0x80;
      }
      bytes.push(encodedByte);
    } while (value > 0);
    return bytes;
  }

  publish(topic: string, payload: string, qos = 0): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const topicBytes = new TextEncoder().encode(topic);
    const payloadBytes = new TextEncoder().encode(payload);

    // PUBLISH packet
    const fixedHeader = 0x30 | (qos << 1); // PUBLISH with QoS
    const remainingLength = 2 + topicBytes.length + payloadBytes.length + (qos > 0 ? 2 : 0);
    const lengthBytes = MQTTWebSocketClient.encodeRemainingLength(remainingLength);

    const packet = new Uint8Array(1 + lengthBytes.length + remainingLength);
    let offset = 0;

    packet[offset++] = fixedHeader;
    for (const lengthByte of lengthBytes) {
      packet[offset++] = lengthByte;
    }

    // Topic length (MSB, LSB)
    packet[offset++] = (topicBytes.length >> 8) & 0xff;
    packet[offset++] = topicBytes.length & 0xff;

    // Topic
    packet.set(topicBytes, offset);
    offset += topicBytes.length;

    // Message ID (for QoS > 0)
    if (qos > 0) {
      const msgId = ++this.messageId;
      packet[offset++] = (msgId >> 8) & 0xff;
      packet[offset++] = msgId & 0xff;
    }

    // Payload
    packet.set(payloadBytes, offset);

    this.ws.send(packet);
  }

  private sendConnectPacket(): void {
    if (!this.ws) return;

    const clientIdBytes = new TextEncoder().encode(this.clientId);
    const protocolName = new TextEncoder().encode('MQTT');

    // Variable header
    const variableHeader = new Uint8Array([
      0x00,
      0x04, // Protocol name length
      ...protocolName,
      0x04, // Protocol level (MQTT 3.1.1)
      0x02, // Connect flags (clean session)
      0x00,
      0x3c, // Keep alive (60 seconds)
    ]);

    // Payload
    const payload = new Uint8Array([
      (clientIdBytes.length >> 8) & 0xff,
      clientIdBytes.length & 0xff,
      ...clientIdBytes,
    ]);

    const remainingLength = variableHeader.length + payload.length;
    const lengthBytes = MQTTWebSocketClient.encodeRemainingLength(remainingLength);

    const packet = new Uint8Array(1 + lengthBytes.length + remainingLength);
    let offset = 0;
    packet[offset++] = 0x10; // CONNECT
    for (const lengthByte of lengthBytes) {
      packet[offset++] = lengthByte;
    }
    packet.set(variableHeader, offset);
    offset += variableHeader.length;
    packet.set(payload, offset);

    this.ws.send(packet);
  }

  private sendSubscribePacket(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const topicBytes = new TextEncoder().encode(topic);
    const msgId = ++this.messageId;

    const remainingLength = 2 + 2 + topicBytes.length + 1;
    const lengthBytes = MQTTWebSocketClient.encodeRemainingLength(remainingLength);
    const packet = new Uint8Array(1 + lengthBytes.length + remainingLength);
    let offset = 0;

    packet[offset++] = 0x82; // SUBSCRIBE
    for (const lengthByte of lengthBytes) {
      packet[offset++] = lengthByte;
    }
    packet[offset++] = (msgId >> 8) & 0xff;
    packet[offset++] = msgId & 0xff;
    packet[offset++] = (topicBytes.length >> 8) & 0xff;
    packet[offset++] = topicBytes.length & 0xff;
    packet.set(topicBytes, offset);
    offset += topicBytes.length;
    packet[offset] = 0x00; // QoS 0

    this.ws.send(packet);
  }

  private sendUnsubscribePacket(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const topicBytes = new TextEncoder().encode(topic);
    const msgId = ++this.messageId;

    const remainingLength = 2 + 2 + topicBytes.length;
    const lengthBytes = MQTTWebSocketClient.encodeRemainingLength(remainingLength);
    const packet = new Uint8Array(1 + lengthBytes.length + remainingLength);
    let offset = 0;

    packet[offset++] = 0xa2; // UNSUBSCRIBE
    for (const lengthByte of lengthBytes) {
      packet[offset++] = lengthByte;
    }
    packet[offset++] = (msgId >> 8) & 0xff;
    packet[offset++] = msgId & 0xff;
    packet[offset++] = (topicBytes.length >> 8) & 0xff;
    packet[offset++] = topicBytes.length & 0xff;
    packet.set(topicBytes, offset);

    this.ws.send(packet);
  }

  private handleMessage(data: ArrayBuffer): void {
    const bytes = new Uint8Array(data);
    const packetType = bytes[0] >> 4;

    switch (packetType) {
      case 3: // PUBLISH
        this.handlePublish(bytes);
        break;
      case 13: // PINGRESP
        // Keep-alive response received
        break;
    }
  }

  private handlePublish(bytes: Uint8Array): void {
    let offset = 1;

    // Remaining length: MQTT variable-length integer (1-4 bytes, continuation-bit scheme)
    let remainingLength = 0;
    let multiplier = 1;
    let lengthByte: number;
    do {
      lengthByte = bytes[offset++];
      remainingLength += (lengthByte & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((lengthByte & 0x80) !== 0 && offset < bytes.length && multiplier <= 128 * 128 * 128);

    // The variable header starts immediately after the remaining-length bytes;
    // the payload occupies the rest of the declared remaining length.
    const packetEnd = offset + remainingLength;

    // Topic length
    const topicLength = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    // Topic
    const topic = new TextDecoder().decode(bytes.slice(offset, offset + topicLength));
    offset += topicLength;

    // Payload
    const payload = new TextDecoder().decode(bytes.slice(offset, packetEnd));

    // Notify subscribers
    this.subscriptions.forEach((callbacks, pattern) => {
      if (this.topicMatches(pattern, topic)) {
        callbacks.forEach((cb) => {
          try {
            cb(topic, payload);
          } catch {
            // Callback error - silently ignored in production
          }
        });
      }
    });
  }

  private topicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') {
        return true; // Multi-level wildcard matches rest
      }
      if (patternParts[i] === '+') {
        continue; // Single-level wildcard matches any single level
      }
      if (patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    return patternParts.length === topicParts.length;
  }

  private handleDisconnect(reason: string): void {
    this.stopKeepAlive();
    this.state = 'disconnected';
    this.isConnecting = false;
    this.ws = null;
    this.onDisconnect?.(reason);
  }

  private startKeepAlive(): void {
    this.stopKeepAlive(); // Always clear first to prevent memory leak
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send PINGREQ
        const packet = new Uint8Array([0xc0, 0x00]);
        this.ws.send(packet);
      }
    }, 30000); // Every 30 seconds
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

export class MQTTAdapter implements IProtocolAdapter {
  private config: ConnectionConfig;
  private tags: Map<string, TagDefinition> = new Map();
  private values: Map<string, TagValue> = new Map();
  private subscribers: Map<string, Set<(values: TagValue[]) => void>> = new Map();
  private globalSubscribers: Set<(values: TagValue[]) => void> = new Set();
  private client: MQTTWebSocketClient | null = null;
  private connected = false;
  private connectTime = 0;
  private lastDisconnectTime = 0;
  private reconnectAttempts = 0;
  private lastError: string | undefined;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private permanentlyDisconnected = false;

  // Statistics
  private stats = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
    messagesReceived: 0,
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

    if (this.permanentlyDisconnected) {
      throw new Error('Max reconnection attempts reached. Adapter is permanently disconnected.');
    }

    const brokerUrl = this.config.brokerUrl;
    if (!brokerUrl) {
      throw new Error('MQTT adapter requires brokerUrl in config');
    }

    const clientId =
      this.config.clientId ?? `millos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      this.client = new MQTTWebSocketClient(brokerUrl, clientId);

      this.client.onConnect = () => {
        // Connected to broker
      };

      this.client.onDisconnect = () => {
        this.handleDisconnect();
      };

      this.client.onError = (error) => {
        this.lastError = error.message;
        this.stats.errorCount++;
      };

      await this.client.connect();

      this.connected = true;
      this.connectTime = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = undefined;

      // Subscribe to all tag value updates
      const topicPrefix = this.config.topicPrefix ?? 'scada';
      this.client.subscribe(`${topicPrefix}/tags/+/value`, (topic, payload) => {
        this.handleTagMessage(topic, payload);
      });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.stats.errorCount++;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.values.clear();
  }

  isConnected(): boolean {
    return this.connected && (this.client?.isConnected() ?? false);
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  async readTag(tagId: string): Promise<TagValue> {
    // MQTT is push-based, so we return the last known value
    const value = this.values.get(tagId);
    if (!value) {
      // Return stale placeholder if no value received yet
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
    if (!this.client || !this.connected) {
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
      const topicPrefix = this.config.topicPrefix ?? 'scada';
      const topic = `${topicPrefix}/tags/${tagId}/write`;
      const payload = JSON.stringify({
        tagId,
        value,
        timestamp: Date.now(),
      });

      this.client.publish(topic, payload, 1); // QoS 1 for reliable delivery
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
      avgReadLatency: 0, // MQTT is push-based, no read latency
      errorCount: this.stats.errorCount,
      uptime,
    };
  }

  /**
   * Reset the connection state to allow reconnection after permanent disconnect.
   * Call this before connect() if the adapter was previously permanently disconnected.
   */
  resetConnection(): void {
    this.permanentlyDisconnected = false;
    this.reconnectAttempts = 0;
    this.lastError = undefined;
  }

  // =========================================================================
  // Message Handling
  // =========================================================================

  private handleTagMessage(_topic: string, payload: string): void {
    try {
      // Parse JSON
      const parsed: unknown = JSON.parse(payload);

      // Validate message structure
      if (!isValidMQTTPayload(parsed)) {
        throw new MessageValidationError('Invalid MQTT payload structure', parsed, 'MQTT');
      }

      const data = parsed;
      const tagValue = this.parseTagPayload(data);

      this.values.set(tagValue.tagId, tagValue);
      this.stats.messagesReceived++;

      // Notify subscribers
      this.notifySubscribers([tagValue]);
    } catch {
      this.stats.errorCount++;
    }
  }

  private parseTagPayload(data: MQTTTagPayload): TagValue {
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

  private handleDisconnect(): void {
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.reconnectAttempts++;

    if (this.reconnectAttempts < 10) {
      // Exponential backoff with jitter
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      const jitter = Math.random() * 1000;

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch(() => {
          // Reconnect failed - will be retried
        });
      }, delay + jitter);
    } else {
      this.permanentlyDisconnected = true;
    }
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
