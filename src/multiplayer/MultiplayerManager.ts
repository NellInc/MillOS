/**
 * MultiplayerManager - Orchestrates all multiplayer functionality
 *
 * Responsibilities:
 * - Managing peer connections via SignalingService
 * - Broadcasting local player state
 * - Processing incoming messages
 * - Host authority for game state
 * - Intent validation and conflict resolution
 */

import { DataConnection } from 'peerjs';
import { SignalingService, SignalingConfig } from './SignalingService';
import { PeerConnection } from './PeerConnection';
import {
  MultiplayerMessage,
  GameStateDiff,
  FullGameState,
  MachineIntent,
  PLAYER_COLORS,
  PlayerColor,
  RemotePlayer,
} from './types';
import { useMultiplayerStore } from '../stores/multiplayerStore';
import { useProductionStore } from '../stores/productionStore';
import { handleHostDisconnect } from './HostMigration';
import { logger } from '../utils/logger';
import { sanitizeChatMessage, sanitizePlayerName } from '../utils/sanitize';

// Broadcast frequencies
const PLAYER_UPDATE_INTERVAL = 50; // 20Hz for smooth movement
const STATE_SYNC_INTERVAL = 100; // 10Hz for game state
const PING_INTERVAL = 1000; // 1Hz for latency measurement

// Resolve any guest intent that has not received an INTENT_RESULT within this
// window as failed, so the UI surfaces the failure and pendingIntents does not
// grow unbounded when the host drops an INTENT silently.
const INTENT_TIMEOUT_MS = 5000;

export class MultiplayerManager {
  private signalingService: SignalingService | null = null;
  private peerConnections: Map<string, PeerConnection> = new Map();
  private playerUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private stateSyncInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private stateSequence = 0;
  private isDestroyed = false;

  // Callbacks for external integration
  private onGameStateRequest: (() => FullGameState) | null = null;
  private onMachineIntent:
    | ((intent: MachineIntent) => { success: boolean; error?: string })
    | null = null;

  /**
   * Set callback for getting current game state (called by host when new player joins)
   */
  setGameStateProvider(provider: () => FullGameState): void {
    this.onGameStateRequest = provider;
  }

  /**
   * Set callback for processing machine intents (called by host)
   */
  setIntentHandler(handler: (intent: MachineIntent) => { success: boolean; error?: string }): void {
    this.onMachineIntent = handler;
  }

  /**
   * Create and host a new room
   */
  async hostRoom(playerName: string): Promise<string> {
    const store = useMultiplayerStore.getState();
    const roomCode = store.createRoom();

    await this.initializeSignaling({
      roomCode,
      isHost: true,
      playerId: store.localPlayerId,
      playerName,
    });

    store.setConnectionState('connected');
    this.startBroadcasting();

    return roomCode;
  }

  /**
   * Join an existing room
   */
  async joinRoom(roomCode: string, playerName: string): Promise<void> {
    const store = useMultiplayerStore.getState();
    store.joinRoom(roomCode);

    await this.initializeSignaling({
      roomCode,
      isHost: false,
      playerId: store.localPlayerId,
      playerName,
    });

    // Set a timeout for receiving the initial state sync
    // If we don't receive it within 15 seconds, consider the connection failed
    setTimeout(() => {
      const currentState = useMultiplayerStore.getState();
      if (currentState.connectionState === 'connecting') {
        logger.multiplayer.error('Connection timeout - no state sync received');
        currentState.setConnectionState('disconnected');
        // Use the module-level destroy so the singleton is nulled, not just
        // flagged isDestroyed. Otherwise getMultiplayerManager() keeps returning
        // this poisoned (isDestroyed=true) instance and all later broadcasts/
        // state-syncs short-circuit, breaking subsequent multiplayer attempts.
        destroyMultiplayerManager();
      }
    }, 15000);
  }

  /**
   * Initialize the signaling service
   */
  private async initializeSignaling(config: SignalingConfig): Promise<void> {
    const store = useMultiplayerStore.getState();

    this.signalingService = new SignalingService(config, {
      onPeerConnected: (peerId, connection) => {
        this.handlePeerConnected(peerId, connection);
      },
      onPeerDisconnected: (peerId) => {
        this.handlePeerDisconnected(peerId);
      },
      onError: (error) => {
        logger.multiplayer.error('Signaling error:', error);
        store.setConnectionState('disconnected');
      },
      onOpen: () => {
        logger.multiplayer.debug('Signaling service ready');
      },
    });

    await this.signalingService.initialize();
  }

  /**
   * Handle new peer connection
   */
  private handlePeerConnected(peerId: string, connection: DataConnection): void {
    const store = useMultiplayerStore.getState();
    const metadata = connection.metadata as { playerName?: string; playerId?: string } | undefined;
    const isHost = store.isHost;
    const playerId = metadata?.playerId || peerId;
    const playerName = sanitizePlayerName(metadata?.playerName) || 'Player';

    // Create peer connection wrapper
    const peerConn = new PeerConnection(connection, {
      onMessage: (message) => this.handleMessage(peerId, message),
      onClose: () => this.handlePeerDisconnected(peerId),
      onError: (error) => {
        logger.multiplayer.error(`Peer ${peerId} error:`, error);
      },
    });

    this.peerConnections.set(peerId, peerConn);

    // Guests connect only to the host. Avoid registering the local player as a remote entry
    // when metadata mirrors the local client (PeerJS echoes connection metadata back).
    if (!isHost) {
      store.addPeer({
        id: peerId,
        name: 'Host',
        color: PLAYER_COLORS[0],
        latencyMs: 0,
        connectionState: 'connected',
      });
      return;
    }

    // Assign a color to the new player
    const usedColors = store._remotePlayersArray.map((p) => p.color);
    usedColors.push(store.localPlayerColor);
    const availableColors = PLAYER_COLORS.filter((c) => !usedColors.includes(c));
    const playerColor: PlayerColor =
      availableColors[0] || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];

    // Add to store
    store.addRemotePlayer({
      id: playerId,
      name: playerName,
      position: [0, 1.7, 0],
      rotation: 0,
      velocity: [0, 0, 0],
      color: playerColor,
      selectedMachineId: null,
      isInFpsMode: true,
      lastUpdate: Date.now(),
    });

    store.addPeer({
      id: playerId,
      name: playerName,
      color: playerColor,
      latencyMs: 0,
      connectionState: 'connected',
    });

    // If host, send full game state to new player
    if (store.isHost && this.onGameStateRequest) {
      const fullState = this.onGameStateRequest();
      peerConn.send({
        type: 'FULL_STATE_SYNC',
        payload: fullState,
      });

      // Tell the new player about the host
      peerConn.send({
        type: 'PLAYER_JOIN',
        payload: {
          id: store.localPlayerId,
          name: store.localPlayerName,
          color: store.localPlayerColor,
        },
      });

      // Tell the new player about all existing remote players
      for (const existingPlayer of store._remotePlayersArray) {
        if (existingPlayer.id !== playerId) {
          peerConn.send({
            type: 'PLAYER_JOIN',
            payload: {
              id: existingPlayer.id,
              name: existingPlayer.name,
              color: existingPlayer.color,
            },
          });
        }
      }

      // Also announce the new player to all other peers
      this.broadcast(
        {
          type: 'PLAYER_JOIN',
          payload: {
            id: playerId,
            name: playerName,
            color: playerColor,
          },
        },
        peerId
      ); // Exclude the new player
    }

    logger.multiplayer.info(`Player connected: ${playerName} (${playerId})`);
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnected(peerId: string): void {
    // Guard against running twice for the same peer (onClose + stale sweep can
    // both fire). Store removals are idempotent but the PLAYER_LEAVE broadcast is not.
    if (!this.peerConnections.has(peerId)) return;

    const store = useMultiplayerStore.getState();

    const peerConn = this.peerConnections.get(peerId);
    const metadata = peerConn?.getMetadata();
    const playerId =
      store.isHost && metadata && typeof metadata.playerId === 'string'
        ? (metadata.playerId as string)
        : peerId;

    if (store.isHost) {
      store.removeRemotePlayer(playerId);
      store.removePeer(playerId);

      // Announce departure to other peers if host
      this.broadcast({
        type: 'PLAYER_LEAVE',
        payload: { id: playerId },
      });
      logger.multiplayer.info(`Player disconnected: ${playerId}`);
    } else {
      // Guest lost connection to host - stop broadcast loops and reset state
      store.removePeer(peerId);
      this.stopBroadcasting();
      handleHostDisconnect();
    }

    // Close the wrapper before dropping it. On the stale-sweep path the underlying
    // DataConnection is still open, so without this the connection/handlers leak.
    // PeerConnection.close() guards isOpen, so the normal 'close' path is a no-op here.
    peerConn?.close();
    this.peerConnections.delete(peerId);
  }

  /**
   * Handle incoming message from a peer
   */
  private handleMessage(peerId: string, message: MultiplayerMessage): void {
    const store = useMultiplayerStore.getState();

    switch (message.type) {
      case 'PLAYER_UPDATE': {
        // PLAYER_UPDATE arrives 20Hz from an untrusted peer and is spread over the
        // existing player by the store. Validate-or-omit each field so a malicious
        // peer can't push NaN/Infinity coords (which crash PlayerInterpolation's
        // new THREE.Vector3(...) / RemotePlayerAvatar geometry) or clobber a good
        // name/identity. Omitted fields preserve the last-good value via the store's
        // partial spread. Identity (color) is fixed at PLAYER_JOIN, so it is ignored
        // here; id stays the lookup key; lastUpdate is set by the store.
        const p = message.payload;
        const update: Partial<RemotePlayer> = {};

        const cleanName = sanitizePlayerName(p.name);
        if (cleanName) update.name = cleanName;

        const isFiniteTriple = (v: unknown): v is [number, number, number] =>
          Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
        if (isFiniteTriple(p.position)) update.position = p.position;
        if (isFiniteTriple(p.velocity)) update.velocity = p.velocity;

        if (Number.isFinite(p.rotation)) update.rotation = p.rotation;

        if (p.selectedMachineId === null) {
          update.selectedMachineId = null;
        } else if (typeof p.selectedMachineId === 'string') {
          // Validate the peer-supplied machine id against the real machine registry
          // (seeded locally on every client when MillScene mounts) so a peer can't
          // inject fabricated/non-existent ids into remote player state. The list is
          // empty only during the brief window before the scene seeds it; accept
          // rather than falsely null during that initial-sync race, then reject
          // unknown ids once the registry is populated.
          const machines = useProductionStore.getState().machines;
          update.selectedMachineId =
            machines.length === 0 || machines.some((m) => m.id === p.selectedMachineId)
              ? p.selectedMachineId
              : null;
        }
        if (typeof p.isInFpsMode === 'boolean') update.isInFpsMode = p.isInFpsMode;

        store.updateRemotePlayer(p.id, update);
        break;
      }

      case 'PLAYER_JOIN': {
        // Validate the peer-supplied color against the allow-list before it
        // reaches Three.js materials / CSS swatches (untrusted peer input).
        const joinColor: PlayerColor = PLAYER_COLORS.includes(message.payload.color)
          ? message.payload.color
          : PLAYER_COLORS[0];
        store.addRemotePlayer({
          id: message.payload.id,
          name: sanitizePlayerName(message.payload.name) || 'Player',
          position: [0, 1.7, 0],
          rotation: 0,
          velocity: [0, 0, 0],
          color: joinColor,
          selectedMachineId: null,
          isInFpsMode: true,
          lastUpdate: Date.now(),
        });
        break;
      }

      case 'PLAYER_LEAVE':
        store.removeRemotePlayer(message.payload.id);
        break;

      case 'STATE_SYNC':
        // Only process if we're not the host
        if (!store.isHost) {
          this.applyStateDiff(message.payload);
        }
        break;

      case 'FULL_STATE_SYNC':
        // Only process if we're not the host
        if (!store.isHost) {
          this.applyFullState(message.payload);
          store.setConnectionState('connected');
          // Start broadcasting our position now that we're connected
          this.startBroadcasting();
        }
        break;

      case 'INTENT':
        // Host processes intents
        if (store.isHost && this.onMachineIntent) {
          const result = this.onMachineIntent(message.payload);
          // Send result back to the sender
          const peerConn = this.peerConnections.get(peerId);
          if (peerConn) {
            peerConn.send({
              type: 'INTENT_RESULT',
              payload: {
                intentId: message.payload.id,
                success: result.success,
                error: result.error,
              },
            });
          }
        }
        break;

      case 'INTENT_RESULT':
        store.resolveIntent(
          message.payload.intentId,
          message.payload.success,
          message.payload.error
        );
        break;

      case 'MACHINE_LOCK':
        // Host-authoritative broadcast: only guests apply a MACHINE_LOCK, and only
        // from the trusted host connection. The host must NOT accept lock changes
        // from untrusted guests — guests request locks via INTENT (submitIntent in
        // requestMachineLock/releaseMachineLock), which the host validates before
        // setting and broadcasting the lock itself. Trusting a guest's MACHINE_LOCK
        // here would let a malicious peer spoof arbitrary/other-player playerIds.
        if (!store.isHost) {
          store.setMachineLock(message.payload.machineId, message.payload.playerId);
        } else {
          logger.multiplayer.warn('Dropped host-only MACHINE_LOCK from peer', peerId);
        }
        break;

      case 'CHAT':
        store.addChatMessage({
          ...message.payload,
          message: sanitizeChatMessage(message.payload.message),
        });
        break;

      case 'AI_VOTE': {
        // Validate the untrusted-peer vote shape before forwarding it onto the
        // app event bus (mirrors the PING/PONG payload guards in PeerConnection).
        const vote = message.payload;
        if (
          !vote ||
          typeof vote.decisionId !== 'string' ||
          typeof vote.playerId !== 'string' ||
          typeof vote.approve !== 'boolean'
        ) {
          logger.multiplayer.warn('Dropped malformed AI_VOTE from peer', peerId);
          break;
        }
        // Dispatch event for UI components to receive the vote
        window.dispatchEvent(new CustomEvent('multiplayer:ai-vote', { detail: vote }));
        break;
      }

      default:
        logger.multiplayer.warn(
          'Unhandled multiplayer message type',
          (message as { type?: string }).type
        );
        break;
    }
  }

  /**
   * Apply a state diff from the host
   */
  private applyStateDiff(diff: GameStateDiff): void {
    // This would update the production store
    // For now, we'll emit an event that the app can listen to
    window.dispatchEvent(new CustomEvent('multiplayer:state-diff', { detail: diff }));
  }

  /**
   * Apply full state from the host (initial sync)
   */
  private applyFullState(state: FullGameState): void {
    const store = useMultiplayerStore.getState();

    // Apply machine locks
    for (const [machineId, playerId] of Object.entries(state.machineLocks)) {
      store.setMachineLock(machineId, playerId);
    }

    // Emit event for production store to sync
    window.dispatchEvent(new CustomEvent('multiplayer:full-state', { detail: state }));
  }

  /**
   * Broadcast a message to all connected peers (optionally excluding one)
   */
  broadcast(message: MultiplayerMessage, excludePeerId?: string): void {
    for (const [peerId, conn] of this.peerConnections) {
      if (peerId !== excludePeerId) {
        conn.send(message);
      }
    }
  }

  /**
   * Send a message to a specific peer
   */
  sendTo(peerId: string, message: MultiplayerMessage): boolean {
    const conn = this.peerConnections.get(peerId);
    if (conn) {
      return conn.send(message);
    }
    return false;
  }

  /**
   * Start broadcasting local player state
   */
  private startBroadcasting(): void {
    const store = useMultiplayerStore.getState();

    // Player position updates (20Hz)
    this.playerUpdateInterval = setInterval(() => {
      if (this.isDestroyed) return;

      const state = useMultiplayerStore.getState();
      const playerState = state.getLocalPlayerState();

      this.broadcast({
        type: 'PLAYER_UPDATE',
        payload: {
          id: state.localPlayerId,
          name: state.localPlayerName,
          position: playerState.position,
          rotation: playerState.rotation,
          velocity: playerState.velocity,
          color: state.localPlayerColor,
          selectedMachineId: playerState.selectedMachineId,
          isInFpsMode: playerState.isInFpsMode,
          lastUpdate: Date.now(),
        },
      });
    }, PLAYER_UPDATE_INTERVAL);

    // Game state sync (10Hz, host only)
    if (store.isHost) {
      this.stateSyncInterval = setInterval(() => {
        if (this.isDestroyed || !this.onGameStateRequest) return;

        const fullState = this.onGameStateRequest();
        this.stateSequence++;

        this.broadcast({
          type: 'STATE_SYNC',
          payload: {
            sequence: this.stateSequence,
            machines: fullState.machines,
            gameTime: fullState.gameTime,
            weather: fullState.weather,
            emergencyActive: fullState.emergencyActive,
            timestamp: Date.now(),
          },
        });
      }, STATE_SYNC_INTERVAL);
    }

    // Ping all peers and check for stale connections (1Hz)
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return;

      // Sweep stale pending intents (guest path). Any intent that has not been
      // resolved by an INTENT_RESULT within INTENT_TIMEOUT_MS is resolved as
      // failed so the UI is notified and pendingIntents stays bounded.
      const now = Date.now();
      const pendingStore = useMultiplayerStore.getState();
      for (const intent of pendingStore.pendingIntents) {
        if (now - intent.timestamp > INTENT_TIMEOUT_MS) {
          pendingStore.resolveIntent(intent.id, false, 'Intent timed out');
        }
      }

      let totalLatency = 0;
      let count = 0;
      const stalePeers: string[] = [];

      for (const [peerId, conn] of this.peerConnections) {
        // Check for stale connections before pinging
        if (conn.isStale()) {
          logger.multiplayer.warn(
            `Peer ${peerId} is stale (no messages for ${conn.getTimeSinceLastMessage()}ms), disconnecting`
          );
          stalePeers.push(peerId);
          continue;
        }

        conn.ping();
        totalLatency += conn.getLatency();
        count++;
      }

      // Disconnect stale peers
      for (const peerId of stalePeers) {
        this.handlePeerDisconnected(peerId);
      }

      if (count > 0) {
        useMultiplayerStore.getState().setAverageLatency(Math.round(totalLatency / count));
      }
    }, PING_INTERVAL);
  }

  /**
   * Stop broadcasting
   */
  private stopBroadcasting(): void {
    if (this.playerUpdateInterval) {
      clearInterval(this.playerUpdateInterval);
      this.playerUpdateInterval = null;
    }
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
      this.stateSyncInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Submit a machine control intent (for non-host players)
   */
  submitIntent(intent: Omit<MachineIntent, 'id' | 'timestamp' | 'playerId'>): void {
    const store = useMultiplayerStore.getState();

    if (store.isHost) {
      // Host processes locally
      if (this.onMachineIntent) {
        const result = this.onMachineIntent({
          ...intent,
          id: `intent_${Date.now()}`,
          playerId: store.localPlayerId,
          timestamp: Date.now(),
        });
        // Handle result locally
        if (!result.success) {
          logger.multiplayer.warn('Local intent failed:', result.error);
        }
      }
    } else {
      // Guest sends to host
      const fullIntent = store.submitIntent(intent);

      // Find host connection (first peer for guests)
      const hostConn = this.peerConnections.values().next().value;
      if (hostConn) {
        hostConn.send({
          type: 'INTENT',
          payload: fullIntent,
        });
      } else {
        // No host connection: the INTENT can never be sent, so resolve it
        // locally as failed instead of leaving it stuck in pendingIntents
        // forever. The timeout sweep covers the case where the host receives
        // the INTENT but silently drops it (no INTENT_RESULT returned).
        store.resolveIntent(fullIntent.id, false, 'Not connected to host');
      }
    }
  }

  /**
   * Request a machine lock
   */
  requestMachineLock(machineId: string): void {
    const store = useMultiplayerStore.getState();

    if (store.isHost) {
      // Host sets lock directly and broadcasts
      store.setMachineLock(machineId, store.localPlayerId);
      this.broadcast({
        type: 'MACHINE_LOCK',
        payload: { machineId, playerId: store.localPlayerId },
      });
    } else {
      // Guest requests lock via intent
      this.submitIntent({
        type: 'ADJUST',
        machineId,
        parameters: { action: 'lock' },
      });
    }
  }

  /**
   * Release a machine lock
   */
  releaseMachineLock(machineId: string): void {
    const store = useMultiplayerStore.getState();

    if (store.isHost) {
      store.setMachineLock(machineId, null);
      this.broadcast({
        type: 'MACHINE_LOCK',
        payload: { machineId, playerId: null },
      });
    } else {
      this.submitIntent({
        type: 'ADJUST',
        machineId,
        parameters: { action: 'unlock' },
      });
    }
  }

  /**
   * Send a chat message
   */
  sendChat(message: string): void {
    const store = useMultiplayerStore.getState();

    const cleanMessage = sanitizeChatMessage(message);
    if (!cleanMessage) return;

    const chatMessage = {
      id: `chat_${Date.now()}`,
      from: store.localPlayerId,
      fromName: store.localPlayerName,
      message: cleanMessage,
      timestamp: Date.now(),
    };

    // Add to local store
    store.addChatMessage(chatMessage);

    // Broadcast to peers
    this.broadcast({
      type: 'CHAT',
      payload: chatMessage,
    });
  }

  /**
   * Leave the current room
   */
  leave(): void {
    const store = useMultiplayerStore.getState();

    // Notify peers we're leaving
    this.broadcast({
      type: 'PLAYER_LEAVE',
      payload: { id: store.localPlayerId },
    });

    this.destroy();
    store.leaveRoom();
  }

  /**
   * Clean up and destroy the manager
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stopBroadcasting();

    // Close all peer connections
    for (const conn of this.peerConnections.values()) {
      conn.close();
    }
    this.peerConnections.clear();

    // Destroy signaling service
    if (this.signalingService) {
      this.signalingService.destroy();
      this.signalingService = null;
    }

    logger.multiplayer.debug('MultiplayerManager destroyed');
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.peerConnections.size;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.peerConnections.size > 0 || useMultiplayerStore.getState().isHost;
  }
}

// Singleton instance
let multiplayerManager: MultiplayerManager | null = null;

export function getMultiplayerManager(): MultiplayerManager {
  if (!multiplayerManager) {
    multiplayerManager = new MultiplayerManager();
  }
  return multiplayerManager;
}

export function destroyMultiplayerManager(): void {
  if (multiplayerManager) {
    multiplayerManager.destroy();
    multiplayerManager = null;
  }
}
