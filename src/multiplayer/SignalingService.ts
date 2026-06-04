/**
 * SignalingService - Handles WebRTC peer discovery via PeerJS
 *
 * PeerJS handles the complexity of WebRTC signaling (ICE candidates, SDP exchange)
 * and provides a simple room-code based connection system.
 */

import Peer, { DataConnection } from 'peerjs';
import { logger } from '../utils/logger';

export interface SignalingConfig {
  roomCode: string;
  isHost: boolean;
  playerId: string;
  playerName: string;
}

export interface SignalingCallbacks {
  onPeerConnected: (peerId: string, connection: DataConnection) => void;
  onPeerDisconnected: (peerId: string) => void;
  onError: (error: Error) => void;
  onOpen: (myPeerId: string) => void;
}

// PeerJS server config - uses free public server by default
const PEERJS_CONFIG = {
  // Uses default PeerJS cloud server (free tier, good for small projects)
  // For production, consider self-hosting: https://github.com/peers/peerjs-server
  // Use Vite's import.meta.env.DEV (browser-safe); process.env is undefined in the browser bundle.
  debug: import.meta.env?.DEV ? 2 : 0,
};

export class SignalingService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private config: SignalingConfig;
  private callbacks: SignalingCallbacks;
  private isDestroyed = false;

  constructor(config: SignalingConfig, callbacks: SignalingCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Initialize the PeerJS connection
   * Host uses room code as peer ID, guests use a generated ID
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Host uses predictable ID based on room code
        // Guests use their player ID
        const peerId = this.config.isHost
          ? `millos-${this.config.roomCode}`
          : `millos-${this.config.roomCode}-${this.config.playerId}`;

        this.peer = new Peer(peerId, PEERJS_CONFIG);

        this.peer.on('open', (id) => {
          if (this.isDestroyed) return;
          logger.multiplayer.debug(`Connected to PeerJS server with ID: ${id}`);
          this.callbacks.onOpen(id);

          // If not host, connect to the host
          if (!this.config.isHost) {
            this.connectToHost();
          }

          resolve();
        });

        this.peer.on('connection', (conn) => {
          if (this.isDestroyed) return;
          this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
          if (this.isDestroyed) return;
          logger.multiplayer.error('PeerJS error:', err);

          // Handle specific error types
          if (err.type === 'unavailable-id') {
            // Room code already in use (host) or player already connected
            this.callbacks.onError(new Error('Room code already in use or already connected'));
          } else if (err.type === 'peer-unavailable') {
            // Host not found (for guests)
            this.callbacks.onError(new Error('Room not found. Check the room code.'));
          } else {
            this.callbacks.onError(err);
          }
        });

        this.peer.on('disconnected', () => {
          if (this.isDestroyed) return;
          logger.multiplayer.warn('Disconnected from PeerJS server, attempting reconnect...');
          // PeerJS does NOT auto-reconnect a server-disconnected peer; reconnect()
          // must be called explicitly. Existing P2P data connections survive a
          // signaling-server drop, but new connections are blocked until the
          // signaling channel is restored. A disconnected (not destroyed) peer is
          // the only valid target for reconnect().
          try {
            this.peer?.reconnect();
          } catch (err) {
            logger.multiplayer.error('PeerJS reconnect attempt failed:', err);
          }
        });

        // Set a timeout for initial connection
        setTimeout(() => {
          if (!this.peer?.open && !this.isDestroyed) {
            reject(new Error('Connection timeout - could not reach signaling server'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect to the host (called by guests)
   */
  private connectToHost(): void {
    if (!this.peer || this.isDestroyed) return;

    const hostPeerId = `millos-${this.config.roomCode}`;
    logger.multiplayer.debug(`Connecting to host: ${hostPeerId}`);

    const conn = this.peer.connect(hostPeerId, {
      reliable: true,
      metadata: {
        playerName: this.config.playerName,
        playerId: this.config.playerId,
      },
    });

    this.setupConnectionHandlers(conn, hostPeerId);
  }

  /**
   * Handle incoming connection (host receives guest connections)
   */
  private handleIncomingConnection(conn: DataConnection): void {
    const peerId = conn.peer;
    logger.multiplayer.debug(`Incoming connection from: ${peerId}`);
    this.setupConnectionHandlers(conn, peerId);
  }

  /**
   * Set up event handlers for a data connection
   */
  private setupConnectionHandlers(conn: DataConnection, peerId: string): void {
    conn.on('open', () => {
      if (this.isDestroyed) return;
      logger.multiplayer.debug(`Connection opened with: ${peerId}`);
      this.connections.set(peerId, conn);
      this.callbacks.onPeerConnected(peerId, conn);
    });

    conn.on('close', () => {
      if (this.isDestroyed) return;
      logger.multiplayer.debug(`Connection closed with: ${peerId}`);
      this.connections.delete(peerId);
      this.callbacks.onPeerDisconnected(peerId);
    });

    conn.on('error', (err) => {
      if (this.isDestroyed) return;
      logger.multiplayer.debug(`Connection error with ${peerId}:`, err);
      this.connections.delete(peerId);
      this.callbacks.onPeerDisconnected(peerId);
    });
  }

  /**
   * Get a connection by peer ID
   */
  getConnection(peerId: string): DataConnection | undefined {
    return this.connections.get(peerId);
  }

  /**
   * Get all active connections
   */
  getAllConnections(): DataConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connected peer IDs
   */
  getConnectedPeerIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if connected to a specific peer
   */
  isConnectedTo(peerId: string): boolean {
    return this.connections.has(peerId);
  }

  /**
   * Get total number of connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Disconnect from a specific peer
   */
  disconnectPeer(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  /**
   * Clean up and destroy the service
   */
  destroy(): void {
    this.isDestroyed = true;

    // Close all connections
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();

    // Destroy PeerJS instance
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    logger.multiplayer.debug('SignalingService destroyed');
  }

  /**
   * Check if the service is active
   */
  isActive(): boolean {
    return !this.isDestroyed && this.peer !== null && !this.peer.destroyed;
  }

  /**
   * Get the local peer ID
   */
  getLocalPeerId(): string | null {
    return this.peer?.id ?? null;
  }
}
