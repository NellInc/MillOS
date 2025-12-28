/**
 * PeerConnection - Wrapper for WebRTC DataChannel communication
 *
 * Handles message serialization, send queuing, and reliability.
 */

import { DataConnection } from 'peerjs';
import { MultiplayerMessage } from './types';

export interface PeerConnectionCallbacks {
  onMessage: (message: MultiplayerMessage) => void;
  onClose: () => void;
  onError: (error: Error) => void;
}

// Timeout for stale connection detection (5 seconds without any message)
const STALE_CONNECTION_TIMEOUT = 5000;

export class PeerConnection {
  private connection: DataConnection;
  private callbacks: PeerConnectionCallbacks;
  private isOpen = false;
  private messageQueue: MultiplayerMessage[] = [];
  private lastPingTime = 0;
  private latencyMs = 0;
  private lastMessageTime = Date.now();

  constructor(connection: DataConnection, callbacks: PeerConnectionCallbacks) {
    this.connection = connection;
    this.callbacks = callbacks;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle connection open
    if (this.connection.open) {
      this.isOpen = true;
      this.flushQueue();
    }

    this.connection.on('open', () => {
      this.isOpen = true;
      this.flushQueue();
    });

    // Handle incoming data
    this.connection.on('data', (data) => {
      try {
        // PeerJS already handles JSON parsing for objects
        const message = data as MultiplayerMessage;
        this.handleMessage(message);
      } catch {
        // Failed to parse message - ignore
      }
    });

    // Handle connection close
    this.connection.on('close', () => {
      this.isOpen = false;
      this.callbacks.onClose();
    });

    // Handle errors
    this.connection.on('error', (err) => {
      this.callbacks.onError(err);
    });
  }

  private handleMessage(message: MultiplayerMessage): void {
    // Update last message time for stale detection
    this.lastMessageTime = Date.now();

    // Handle ping/pong for latency measurement
    if (message.type === 'PING') {
      // Respond with pong
      this.send({
        type: 'PONG',
        payload: {
          timestamp: message.payload.timestamp,
          hostTime: Date.now(),
        },
      });
      return;
    }

    if (message.type === 'PONG') {
      // Calculate latency
      const roundTrip = Date.now() - message.payload.timestamp;
      this.latencyMs = Math.round(roundTrip / 2);
      return;
    }

    // Pass other messages to callback
    this.callbacks.onMessage(message);
  }

  /**
   * Send a message to this peer
   */
  send(message: MultiplayerMessage): boolean {
    if (!this.isOpen) {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.connection.send(message);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Flush queued messages
   */
  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.isOpen) {
      const message = this.messageQueue.shift();
      if (message) {
        this.connection.send(message);
      }
    }
  }

  /**
   * Send a ping to measure latency
   */
  ping(): void {
    this.lastPingTime = Date.now();
    this.send({
      type: 'PING',
      payload: { timestamp: this.lastPingTime },
    });
  }

  /**
   * Get current latency in milliseconds
   */
  getLatency(): number {
    return this.latencyMs;
  }

  /**
   * Check if connection is open
   */
  isConnected(): boolean {
    return this.isOpen && this.connection.open;
  }

  /**
   * Check if connection is stale (no messages received recently)
   */
  isStale(): boolean {
    return Date.now() - this.lastMessageTime > STALE_CONNECTION_TIMEOUT;
  }

  /**
   * Get time since last message in milliseconds
   */
  getTimeSinceLastMessage(): number {
    return Date.now() - this.lastMessageTime;
  }

  /**
   * Get the peer ID
   */
  getPeerId(): string {
    return this.connection.peer;
  }

  /**
   * Get connection metadata
   */
  getMetadata(): Record<string, unknown> {
    return (this.connection.metadata as Record<string, unknown>) ?? {};
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isOpen = false;
    this.connection.close();
  }
}
