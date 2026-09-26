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
import {
  isTagValueCompatible,
  isValidMQTTPayload,
  MessageValidationError,
} from './messageValidation';

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

const MQTT_MAX_REMAINING_LENGTH = 268_435_455;
const MQTT_MAX_UTF8_FIELD_BYTES = 65_535;
const MAX_MQTT_APPLICATION_PAYLOAD_BYTES = 1024 * 1024;
const MAX_MQTT_FRAME_BYTES =
  1 + 4 + 2 + MQTT_MAX_UTF8_FIELD_BYTES + 2 + MAX_MQTT_APPLICATION_PAYLOAD_BYTES;
const MQTT_KEEP_ALIVE_INTERVAL_MS = 30_000;
const MQTT_PING_RESPONSE_TIMEOUT_MS = 10_000;
const MQTT_ACK_TIMEOUT_MS = 10_000;
const MAX_PENDING_ACKNOWLEDGEMENTS = 1024;

type AcknowledgementKind = 'PUBACK' | 'SUBACK';

interface PendingAcknowledgement {
  kind: AcknowledgementKind;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Lightweight MQTT-over-WebSocket client
 * Uses native WebSocket API for browser compatibility
 */
class MQTTWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private subscriptions = new Map<string, Set<(topic: string, payload: string) => void>>();
  private subscriptionAcknowledgements = new Map<string, Promise<void>>();
  private pendingAcknowledgements = new Map<number, PendingAcknowledgement>();
  private messageId = 0;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private pingResponseTimeout: ReturnType<typeof setTimeout> | null = null;
  private state: MQTTState = 'disconnected';
  private connectPromise: Promise<void> | null = null;
  private cancelPendingConnect: ((error: Error) => void) | null = null;

  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;

  constructor(url: string, clientId: string) {
    this.url = url;
    this.clientId = clientId;
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.state === 'connected') return Promise.resolve();

    this.state = 'connecting';

    const promise = new Promise<void>((resolve, reject) => {
      // Guard so the connect Promise is settled exactly once. Without this, a
      // clean server-initiated close before CONNACK (onclose fires, onerror does
      // not) would leave the Promise pending until the 10s timeout.
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let socket: WebSocket | null = null;

      const clearAttempt = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        this.cancelPendingConnect = null;
      };

      const rejectAttempt = (error: Error, closeSocket: boolean) => {
        if (settled) return;
        settled = true;
        clearAttempt();
        this.state = 'disconnected';
        if (this.ws === socket) this.ws = null;
        if (closeSocket && socket) this.disposeSocket(socket, false);
        reject(error);
      };

      try {
        const activeSocket = new WebSocket(this.url, 'mqtt');
        socket = activeSocket;
        this.ws = activeSocket;
        activeSocket.binaryType = 'arraybuffer';
        this.cancelPendingConnect = (error) => rejectAttempt(error, false);

        activeSocket.onopen = () => {
          if (this.ws !== activeSocket || settled) return;
          try {
            this.sendConnectPacket();
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.onError?.(error);
            rejectAttempt(error, true);
          }
        };

        activeSocket.onerror = () => {
          if (this.ws !== activeSocket) return;
          const error = new Error('WebSocket error');
          this.onError?.(error);
          if (this.state === 'connecting' && !settled) {
            rejectAttempt(error, true);
          }
        };

        activeSocket.onclose = (event) => {
          if (this.ws !== activeSocket) return;
          const reason = event.reason || 'Connection closed';
          // A clean close before CONNACK fires onclose with no preceding onerror.
          // Reject the pending connect Promise so callers don't stall until the
          // timeout and the real close reason is surfaced.
          if (this.state === 'connecting' && !settled) {
            rejectAttempt(new Error(`Closed before CONNACK: ${reason}`), false);
            return;
          }
          this.handleDisconnect(reason);
          this.detachSocket(activeSocket);
        };

        // Wait for CONNACK
        timeout = setTimeout(() => {
          if (settled) return;
          rejectAttempt(new Error('Connection timeout'), true);
        }, 10000);

        activeSocket.onmessage = (event) => {
          if (this.ws !== activeSocket || settled) return;
          const data = this.toBytes(event.data);
          if (!data) {
            rejectAttempt(new Error('Invalid binary CONNACK'), true);
            return;
          }
          // Check for CONNACK (0x20)
          if (data[0] === 0x20) {
            if (data.length !== 4 || data[1] !== 0x02 || data[2] !== 0x00) {
              rejectAttempt(new Error('Invalid CONNACK packet'), true);
              return;
            }
            if (data[3] !== 0x00) {
              rejectAttempt(new Error(`Broker refused CONNACK (${data[3]})`), true);
              return;
            }
            settled = true;
            clearAttempt();
            this.state = 'connected';
            this.startKeepAlive();
            activeSocket.onmessage = (messageEvent) => {
              if (this.ws === activeSocket) this.handleMessage(messageEvent.data);
            };
            this.onConnect?.();
            resolve();
          }
        };
      } catch (err) {
        this.state = 'disconnected';
        if (!settled) {
          settled = true;
          clearAttempt();
          if (socket) this.disposeSocket(socket, false);
          reject(err);
        }
      }
    });

    this.connectPromise = promise;
    const clearPromise = () => {
      if (this.connectPromise === promise) this.connectPromise = null;
    };
    promise.then(clearPromise, clearPromise);
    return promise;
  }

  disconnect(): void {
    const socket = this.ws;
    this.ws = null;
    const cancel = this.cancelPendingConnect;
    this.cancelPendingConnect = null;
    cancel?.(new Error('Connection cancelled'));
    if (socket) this.disposeSocket(socket, true);
    this.rejectPendingAcknowledgements(new Error('MQTT connection closed'));
    this.subscriptionAcknowledgements.clear();
    this.stopKeepAlive();
    this.state = 'disconnected';
  }

  private disposeSocket(socket: WebSocket, sendDisconnect: boolean): void {
    this.detachSocket(socket);
    try {
      if (sendDisconnect && socket.readyState === WebSocket.OPEN) {
        socket.send(new Uint8Array([0xe0, 0x00]));
      }
    } catch {
      // Cleanup must continue if the transport closes between the state check and send.
    }
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {
      // The socket is already unusable; handlers and timers have still been released.
    }
  }

  private detachSocket(socket: WebSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private toBytes(data: unknown): Uint8Array | null {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  subscribe(topic: string, callback: (topic: string, payload: string) => void): Promise<void> {
    const existingCallbacks = this.subscriptions.get(topic);
    if (existingCallbacks) {
      existingCallbacks.add(callback);
      return this.subscriptionAcknowledgements.get(topic) ?? Promise.resolve();
    }

    const callbacks = new Set([callback]);
    this.subscriptions.set(topic, callbacks);

    let acknowledgement: Promise<void>;
    try {
      acknowledgement = this.sendSubscribePacket(topic);
    } catch (cause) {
      this.subscriptions.delete(topic);
      throw cause;
    }

    const trackedAcknowledgement = acknowledgement.then(
      () => {
        this.subscriptionAcknowledgements.delete(topic);
      },
      (error: unknown) => {
        this.subscriptionAcknowledgements.delete(topic);
        // Every callback on this topic depends on the same broker subscription.
        // A rejected or timed-out SUBACK means none of them is active.
        this.subscriptions.delete(topic);
        throw error;
      }
    );
    this.subscriptionAcknowledgements.set(topic, trackedAcknowledgement);
    return trackedAcknowledgement;
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
    if (!Number.isInteger(length) || length < 0 || length > MQTT_MAX_REMAINING_LENGTH) {
      throw new Error(`Invalid MQTT Remaining Length: ${length}`);
    }
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

  publish(topic: string, payload: string, qos = 0): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    if (!Number.isInteger(qos) || qos < 0 || qos > 1) {
      throw new Error(`Invalid MQTT QoS: ${qos}`);
    }
    if (payload.length > MAX_MQTT_APPLICATION_PAYLOAD_BYTES) {
      throw new Error('MQTT application payload exceeds the 1 MiB limit');
    }

    const topicBytes = this.encodeUTF8Field(topic, 'topic');
    const payloadBytes = new TextEncoder().encode(payload);
    if (payloadBytes.length > MAX_MQTT_APPLICATION_PAYLOAD_BYTES) {
      throw new Error('MQTT application payload exceeds the 1 MiB limit');
    }

    // PUBLISH packet
    const fixedHeader = 0x30 | (qos << 1); // PUBLISH with QoS
    const remainingLength = 2 + topicBytes.length + payloadBytes.length + (qos > 0 ? 2 : 0);
    const lengthBytes = MQTTWebSocketClient.encodeRemainingLength(remainingLength);

    if (1 + lengthBytes.length + remainingLength > MAX_MQTT_FRAME_BYTES) {
      throw new Error('MQTT frame exceeds the application frame limit');
    }

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

    let messageId: number | null = null;

    // Message ID (for QoS > 0)
    if (qos > 0) {
      messageId = this.nextMessageId();
      packet[offset++] = (messageId >> 8) & 0xff;
      packet[offset++] = messageId & 0xff;
    }

    // Payload
    packet.set(payloadBytes, offset);

    this.ws.send(packet);
    if (messageId === null) return Promise.resolve();
    return this.awaitAcknowledgement(messageId, 'PUBACK');
  }

  private sendConnectPacket(): void {
    if (!this.ws) return;

    const clientIdBytes = this.encodeUTF8Field(this.clientId, 'client ID');
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

  private sendSubscribePacket(topic: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const topicBytes = this.encodeUTF8Field(topic, 'topic');
    const msgId = this.nextMessageId();

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
    return this.awaitAcknowledgement(msgId, 'SUBACK');
  }

  private sendUnsubscribePacket(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const topicBytes = this.encodeUTF8Field(topic, 'topic');
    const msgId = this.nextMessageId();

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

  private nextMessageId(): number {
    if (this.pendingAcknowledgements.size >= MAX_PENDING_ACKNOWLEDGEMENTS) {
      throw new Error('Too many pending MQTT acknowledgements');
    }

    for (let attempts = 0; attempts < 0xffff; attempts++) {
      this.messageId = this.messageId >= 0xffff ? 1 : this.messageId + 1;
      if (!this.pendingAcknowledgements.has(this.messageId)) return this.messageId;
    }

    throw new Error('No MQTT packet identifiers available');
  }

  private awaitAcknowledgement(messageId: number, kind: AcknowledgementKind): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingAcknowledgements.get(messageId);
        if (!pending || pending.kind !== kind) return;
        this.pendingAcknowledgements.delete(messageId);
        reject(new Error(`MQTT ${kind} timeout for packet ${messageId}`));
      }, MQTT_ACK_TIMEOUT_MS);

      this.pendingAcknowledgements.set(messageId, { kind, resolve, reject, timeout });
    });
  }

  private encodeUTF8Field(value: string, label: string): Uint8Array {
    if (value.length > MQTT_MAX_UTF8_FIELD_BYTES) {
      throw new Error(`MQTT ${label} exceeds the 65535-byte limit`);
    }
    const bytes = new TextEncoder().encode(value);
    if (bytes.length > MQTT_MAX_UTF8_FIELD_BYTES) {
      throw new Error(`MQTT ${label} exceeds the 65535-byte limit`);
    }
    return bytes;
  }

  private handleMessage(data: unknown): void {
    const bytes = this.toBytes(data);
    if (!bytes || bytes.length === 0) return;
    if (bytes.length > MAX_MQTT_FRAME_BYTES) {
      this.onError?.(new Error('MQTT frame exceeds the application frame limit'));
      return;
    }
    const packetType = bytes[0] >> 4;

    switch (packetType) {
      case 3: // PUBLISH
        this.handlePublish(bytes);
        break;
      case 4: // PUBACK
        this.handlePubAck(bytes);
        break;
      case 9: // SUBACK
        this.handleSubAck(bytes);
        break;
      case 13: // PINGRESP
        if (bytes.length === 2 && bytes[1] === 0) {
          this.clearPingResponseTimeout();
        }
        break;
    }
  }

  private handlePubAck(bytes: Uint8Array): void {
    if (bytes.length !== 4 || bytes[0] !== 0x40 || bytes[1] !== 0x02) return;
    const messageId = (bytes[2] << 8) | bytes[3];
    this.resolveAcknowledgement(messageId, 'PUBACK');
  }

  private handleSubAck(bytes: Uint8Array): void {
    if (bytes.length !== 5 || bytes[0] !== 0x90 || bytes[1] !== 0x03) return;
    const messageId = (bytes[2] << 8) | bytes[3];
    const pending = this.pendingAcknowledgements.get(messageId);
    if (!pending || pending.kind !== 'SUBACK') return;

    const returnCode = bytes[4];
    if (returnCode === 0x00) {
      this.resolveAcknowledgement(messageId, 'SUBACK');
      return;
    }

    this.rejectAcknowledgement(
      messageId,
      'SUBACK',
      new Error(
        returnCode === 0x80
          ? `MQTT subscription rejected for packet ${messageId}`
          : `Invalid MQTT SUBACK return code ${returnCode}`
      )
    );
  }

  private resolveAcknowledgement(messageId: number, kind: AcknowledgementKind): void {
    const pending = this.pendingAcknowledgements.get(messageId);
    if (!pending || pending.kind !== kind) return;
    this.pendingAcknowledgements.delete(messageId);
    clearTimeout(pending.timeout);
    pending.resolve();
  }

  private rejectAcknowledgement(messageId: number, kind: AcknowledgementKind, error: Error): void {
    const pending = this.pendingAcknowledgements.get(messageId);
    if (!pending || pending.kind !== kind) return;
    this.pendingAcknowledgements.delete(messageId);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private rejectPendingAcknowledgements(error: Error): void {
    const acknowledgements = [...this.pendingAcknowledgements.values()];
    this.pendingAcknowledgements.clear();
    acknowledgements.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
  }

  private handlePublish(bytes: Uint8Array): void {
    if (bytes.length < 2) return;
    let offset = 1;

    // Remaining length: MQTT variable-length integer (1-4 bytes, continuation-bit scheme)
    let remainingLength = 0;
    let multiplier = 1;
    let lengthByte = 0;
    let lengthBytes = 0;
    do {
      if (offset >= bytes.length || lengthBytes === 4) return;
      lengthByte = bytes[offset++];
      lengthBytes++;
      remainingLength += (lengthByte & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((lengthByte & 0x80) !== 0);

    // The variable header starts immediately after the remaining-length bytes;
    // the payload occupies the rest of the declared remaining length.
    const packetEnd = offset + remainingLength;
    if (remainingLength < 2 || packetEnd > bytes.length || offset + 2 > packetEnd) return;

    // Topic length
    const topicLength = (bytes[offset] << 8) | bytes[offset + 1];
    // Reject malformed frames before slicing: ensure the topic-length prefix and
    // declared topic bytes both fit within the buffer and the declared packet end.
    if (offset + 2 + topicLength > bytes.length || offset + 2 + topicLength > packetEnd) {
      return;
    }
    offset += 2;

    const payloadLength = packetEnd - (offset + topicLength);
    if (payloadLength > MAX_MQTT_APPLICATION_PAYLOAD_BYTES) {
      this.onError?.(new Error('MQTT application payload exceeds the 1 MiB limit'));
      return;
    }

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
    this.rejectPendingAcknowledgements(new Error(`MQTT connection closed: ${reason}`));
    this.subscriptionAcknowledgements.clear();
    this.state = 'disconnected';
    this.ws = null;
    this.onDisconnect?.(reason);
  }

  private startKeepAlive(): void {
    this.stopKeepAlive(); // Always clear first to prevent memory leak
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const socket = this.ws;
        if (this.pingResponseTimeout) return;
        try {
          // Send PINGREQ
          socket.send(new Uint8Array([0xc0, 0x00]));
          this.pingResponseTimeout = setTimeout(() => {
            this.pingResponseTimeout = null;
            if (this.ws === socket) {
              this.failConnectedTransport(socket, new Error('MQTT keep-alive response timeout'));
            }
          }, MQTT_PING_RESPONSE_TIMEOUT_MS);
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failConnectedTransport(socket, error);
        }
      }
    }, MQTT_KEEP_ALIVE_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.clearPingResponseTimeout();
  }

  private clearPingResponseTimeout(): void {
    if (this.pingResponseTimeout) {
      clearTimeout(this.pingResponseTimeout);
      this.pingResponseTimeout = null;
    }
  }

  private failConnectedTransport(socket: WebSocket, error: Error): void {
    if (this.ws !== socket) return;
    this.onError?.(error);
    this.ws = null;
    this.disposeSocket(socket, false);
    this.handleDisconnect(error.message);
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
  private connectPromise: Promise<void> | null = null;
  private lifecycleGeneration = 0;

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

  connect(): Promise<void> {
    if (this.connected && this.client?.isConnected()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    if (this.permanentlyDisconnected) {
      return Promise.reject(
        new Error('Max reconnection attempts reached. Adapter is permanently disconnected.')
      );
    }

    const brokerUrl = this.config.brokerUrl;
    if (!brokerUrl) {
      return Promise.reject(new Error('MQTT adapter requires brokerUrl in config'));
    }

    const clientId =
      this.config.clientId ?? `millos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const generation = this.lifecycleGeneration;
    const attempt = this.establishConnection(brokerUrl, clientId, generation);
    this.connectPromise = attempt;
    const clearAttempt = () => {
      if (this.connectPromise === attempt) this.connectPromise = null;
    };
    attempt.then(clearAttempt, clearAttempt);
    return attempt;
  }

  private async establishConnection(
    brokerUrl: string,
    clientId: string,
    generation: number
  ): Promise<void> {
    const client = new MQTTWebSocketClient(brokerUrl, clientId);
    this.client = client;

    client.onDisconnect = () => {
      if (this.isCurrentClient(client, generation)) {
        this.handleDisconnect(client, generation);
      }
    };

    client.onError = (error) => {
      if (!this.isCurrentClient(client, generation)) return;
      this.lastError = error.message;
      if (this.connected && client.isConnected()) this.stats.errorCount++;
    };

    try {
      await client.connect();
      if (!this.isCurrentClient(client, generation)) {
        client.disconnect();
        throw new Error('Connection cancelled');
      }

      // A successful CONNACK only establishes the transport. Do not expose the
      // adapter as connected until the broker accepts its required telemetry
      // subscription as well.
      const topicPrefix = this.config.topicPrefix ?? 'scada';
      await client.subscribe(`${topicPrefix}/tags/+/value`, (topic, payload) => {
        if (this.isCurrentClient(client, generation)) this.handleTagMessage(topic, payload);
      });
      if (!this.isCurrentClient(client, generation)) {
        client.disconnect();
        throw new Error('Connection cancelled');
      }

      this.connected = true;
      this.connectTime = Date.now();
      this.reconnectAttempts = 0;
      this.lastError = undefined;
    } catch (err) {
      if (this.isCurrentClient(client, generation)) {
        this.client = null;
        this.connected = false;
        client.onDisconnect = undefined;
        client.onError = undefined;
        client.disconnect();
        this.lastError = err instanceof Error ? err.message : String(err);
        this.stats.errorCount++;
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.lifecycleGeneration++;
    this.clearReconnectTimeout();

    const client = this.client;
    this.client = null;
    this.connectPromise = null;
    if (client) {
      client.onDisconnect = undefined;
      client.onError = undefined;
      client.disconnect();
    }

    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.values.clear();
  }

  private isCurrentClient(client: MQTTWebSocketClient, generation: number): boolean {
    return this.client === client && this.lifecycleGeneration === generation;
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

    if (!isTagValueCompatible(tag, value)) {
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

      await this.client.publish(topic, payload, 1); // QoS 1 for reliable delivery
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

    const knownTagIds = [...new Set(tagIds)].filter((id) => this.tags.has(id));
    knownTagIds.forEach((id) => {
      if (!this.subscribers.has(id)) {
        this.subscribers.set(id, new Set());
      }
      this.subscribers.get(id)!.add(callback);
    });

    return () => {
      knownTagIds.forEach((id) => {
        const callbacks = this.subscribers.get(id);
        callbacks?.delete(callback);
        if (callbacks?.size === 0) this.subscribers.delete(id);
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

  private handleTagMessage(topic: string, payload: string): void {
    try {
      // Parse JSON
      const parsed: unknown = JSON.parse(payload);

      // Validate message structure
      if (!isValidMQTTPayload(parsed)) {
        throw new MessageValidationError('Invalid MQTT payload structure', parsed, 'MQTT');
      }

      const data = parsed;
      const topicPrefix = this.config.topicPrefix ?? 'scada';
      const tag = this.tags.get(data.tagId);
      if (!tag) {
        throw new MessageValidationError('MQTT payload references an unknown tag', data, 'MQTT');
      }
      if (topic !== `${topicPrefix}/tags/${data.tagId}/value`) {
        throw new MessageValidationError('MQTT topic and payload tag do not match', data, 'MQTT');
      }
      if (!isTagValueCompatible(tag, data.value)) {
        throw new MessageValidationError(
          'MQTT payload value does not match tag type',
          data,
          'MQTT'
        );
      }
      const tagValue = this.parseTagPayload(data);

      const current = this.values.get(tagValue.tagId);
      if (current) {
        const currentSequence = current.sourceTimestamp ?? current.timestamp;
        const incomingSequence = tagValue.sourceTimestamp ?? tagValue.timestamp;
        if (incomingSequence < currentSequence) return;
        if (
          incomingSequence === currentSequence &&
          current.value === tagValue.value &&
          current.quality === tagValue.quality &&
          current.timestamp === tagValue.timestamp &&
          current.sourceTimestamp === tagValue.sourceTimestamp
        ) {
          return;
        }
      }

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

  private handleDisconnect(client: MQTTWebSocketClient, generation: number): void {
    if (!this.isCurrentClient(client, generation)) return;
    this.client = null;
    this.connected = false;
    this.lastDisconnectTime = Date.now();
    this.reconnectAttempts++;

    // The last samples are no longer being refreshed; say so rather than let
    // them read as GOOD for as long as the link stays down. The cache keeps
    // its source timestamps so ordering checks on reconnect are unaffected.
    const now = this.lastDisconnectTime;
    const stale: TagValue[] = [];
    this.values.forEach((value, tagId) => {
      this.values.set(tagId, { ...value, quality: 'STALE' });
      stale.push({ ...value, quality: 'STALE', timestamp: now });
    });
    if (stale.length > 0) this.notifySubscribers(stale);

    this.scheduleReconnect(generation);
  }

  private scheduleReconnect(generation: number): void {
    if (generation !== this.lifecycleGeneration || this.connected) return;
    if (this.reconnectAttempts >= 10) {
      this.permanentlyDisconnected = true;
      return;
    }

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    const jitter = Math.random() * 1000;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (generation !== this.lifecycleGeneration) return;
      void this.connect().catch(() => this.handleReconnectFailure(generation));
    }, delay + jitter);
  }

  private handleReconnectFailure(generation: number): void {
    if (generation !== this.lifecycleGeneration || this.connected) return;
    this.reconnectAttempts++;
    this.scheduleReconnect(generation);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
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
}
