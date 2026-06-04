import { create } from 'zustand';
import {
  RemotePlayer,
  LocalPlayerState,
  ConnectionState,
  PlayerColor,
  PLAYER_COLORS,
  MachineIntent,
  ChatMessage,
  PeerInfo,
} from '../multiplayer/types';
import { sanitizePlayerName, sanitizeRoomCode } from '../utils/sanitize';

// Generate a simple 6-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique player ID
function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface MultiplayerStore {
  // Connection state
  connectionState: ConnectionState;
  isHost: boolean;
  roomCode: string | null;
  localPlayerId: string;
  localPlayerName: string;
  localPlayerColor: PlayerColor;

  // Remote players (indexed by ID)
  remotePlayers: Map<string, RemotePlayer>;
  _remotePlayersArray: RemotePlayer[]; // Cached array for iteration

  // Local player state (for broadcasting)
  localPosition: [number, number, number];
  localRotation: number;
  localVelocity: [number, number, number];
  localSelectedMachineId: string | null;

  // Peer connections
  peers: Map<string, PeerInfo>;

  // Machine locks (machineId -> playerId)
  machineLocks: Map<string, string>;

  // Intent queue (client side, waiting for host response)
  pendingIntents: MachineIntent[];

  // Chat
  chatMessages: ChatMessage[];
  unreadChatCount: number;

  // Latency tracking
  averageLatencyMs: number;

  // Actions - Connection
  setConnectionState: (state: ConnectionState) => void;
  setLocalPlayerName: (name: string) => void;
  setLocalPlayerColor: (color: PlayerColor) => void;

  // Actions - Room management
  createRoom: () => string; // Returns room code
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  setRoomCode: (code: string | null) => void;
  setIsHost: (isHost: boolean) => void;

  // Actions - Remote players
  addRemotePlayer: (player: RemotePlayer) => void;
  updateRemotePlayer: (id: string, update: Partial<RemotePlayer>) => void;
  removeRemotePlayer: (id: string) => void;
  getRemotePlayer: (id: string) => RemotePlayer | undefined;
  getAllRemotePlayers: () => RemotePlayer[];

  // Actions - Local player state (called from FirstPersonController)
  setLocalPosition: (pos: [number, number, number]) => void;
  setLocalRotation: (rot: number) => void;
  setLocalVelocity: (vel: [number, number, number]) => void;
  setLocalSelectedMachine: (machineId: string | null) => void;
  getLocalPlayerState: () => LocalPlayerState;

  // Actions - Machine locks
  setMachineLock: (machineId: string, playerId: string | null) => void;
  getMachineLock: (machineId: string) => string | null;
  isLockedByOther: (machineId: string) => boolean;
  getLockedMachinesForPlayer: (playerId: string) => string[];

  // Actions - Intents
  submitIntent: (intent: Omit<MachineIntent, 'id' | 'timestamp' | 'playerId'>) => MachineIntent;
  resolveIntent: (intentId: string, success: boolean, error?: string) => void;
  getPendingIntents: () => MachineIntent[];

  // Actions - Peers
  addPeer: (peer: PeerInfo) => void;
  updatePeer: (id: string, update: Partial<PeerInfo>) => void;
  removePeer: (id: string) => void;
  setAverageLatency: (ms: number) => void;

  // Actions - Chat
  addChatMessage: (message: ChatMessage) => void;
  markChatRead: () => void;

  // Actions - Reset
  reset: () => void;
}

const initialState = {
  connectionState: 'disconnected' as ConnectionState,
  isHost: false,
  roomCode: null,
  localPlayerId: generatePlayerId(),
  localPlayerName: 'Player',
  localPlayerColor: PLAYER_COLORS[0],
  remotePlayers: new Map<string, RemotePlayer>(),
  _remotePlayersArray: [] as RemotePlayer[],
  peers: new Map<string, PeerInfo>(),
  machineLocks: new Map<string, string>(),
  pendingIntents: [] as MachineIntent[],
  chatMessages: [] as ChatMessage[],
  unreadChatCount: 0,
  averageLatencyMs: 0,
  localPosition: [0, 1.7, 0] as [number, number, number],
  localRotation: 0,
  localVelocity: [0, 0, 0] as [number, number, number],
  localSelectedMachineId: null,
};

export const useMultiplayerStore = create<MultiplayerStore>((set, get) => ({
  ...initialState,

  // Connection state
  setConnectionState: (state: ConnectionState) => set({ connectionState: state }),
  setLocalPlayerName: (name: string) =>
    // Defense-in-depth: sanitize at the store boundary so every caller
    // (lobby, panels) gets XSS-safe names broadcast to peers. Idempotent for
    // callers that already sanitize. Fall back to 'Player' if input is empty.
    set({ localPlayerName: sanitizePlayerName(name) || 'Player' }),
  setLocalPlayerColor: (color: PlayerColor) => set({ localPlayerColor: color }),

  // Room management
  createRoom: () => {
    const code = generateRoomCode();
    set({
      roomCode: code,
      isHost: true,
      connectionState: 'connecting',
      localPlayerId: generatePlayerId(),
    });
    return code;
  },

  joinRoom: (code) => {
    // Defense-in-depth: validate/normalize the room code at the store boundary.
    // sanitizeRoomCode upper-cases, strips non-alphanumerics, and requires
    // exactly 6 chars (returns '' otherwise). Fall back to a plain upper-case
    // of the raw input so a malformed code still produces a (non-matching)
    // value rather than silently blanking, preserving prior behavior.
    set({
      roomCode: sanitizeRoomCode(code) || code.toUpperCase(),
      isHost: false,
      connectionState: 'connecting',
      localPlayerId: generatePlayerId(),
    });
  },

  leaveRoom: () => {
    set({
      ...initialState,
      localPlayerId: generatePlayerId(),
      localPlayerName: get().localPlayerName, // Preserve name
    });
  },

  setRoomCode: (code) => set({ roomCode: code }),
  setIsHost: (isHost) => set({ isHost }),

  // Remote players
  addRemotePlayer: (player) => {
    const state = get();
    const newMap = new Map(state.remotePlayers);
    newMap.set(player.id, player);
    set({
      remotePlayers: newMap,
      _remotePlayersArray: Array.from(newMap.values()),
    });
  },

  updateRemotePlayer: (id, update) => {
    const state = get();
    const existing = state.remotePlayers.get(id);
    if (!existing) return;

    const updated = { ...existing, ...update, lastUpdate: Date.now() };
    const newMap = new Map(state.remotePlayers);
    newMap.set(id, updated);
    set({
      remotePlayers: newMap,
      _remotePlayersArray: Array.from(newMap.values()),
    });
  },

  removeRemotePlayer: (id) => {
    const state = get();
    const player = state.remotePlayers.get(id);
    const newMap = new Map(state.remotePlayers);
    newMap.delete(id);

    // Also clear any machine locks held by this player
    const newLocks = new Map(state.machineLocks);
    for (const [machineId, playerId] of newLocks) {
      if (playerId === id) {
        newLocks.delete(machineId);
      }
    }

    set({
      remotePlayers: newMap,
      _remotePlayersArray: Array.from(newMap.values()),
      machineLocks: newLocks,
    });

    // Dispatch event for UI notification
    if (player) {
      window.dispatchEvent(
        new CustomEvent('multiplayer:player-left', {
          detail: { id, name: player.name },
        })
      );
    }
  },

  getRemotePlayer: (id) => get().remotePlayers.get(id),
  getAllRemotePlayers: () => get()._remotePlayersArray,

  // Local player state
  setLocalPosition: (pos) => set({ localPosition: pos }),
  setLocalRotation: (rot) => set({ localRotation: rot }),
  setLocalVelocity: (vel) => set({ localVelocity: vel }),
  setLocalSelectedMachine: (machineId) => set({ localSelectedMachineId: machineId }),

  getLocalPlayerState: () => {
    const state = get();
    return {
      position: state.localPosition,
      rotation: state.localRotation,
      velocity: state.localVelocity,
      selectedMachineId: state.localSelectedMachineId,
      isInFpsMode: true, // Always true when in multiplayer FPS mode
    };
  },

  // Machine locks
  setMachineLock: (machineId, playerId) => {
    const newLocks = new Map(get().machineLocks);
    if (playerId === null) {
      newLocks.delete(machineId);
    } else {
      newLocks.set(machineId, playerId);
    }
    set({ machineLocks: newLocks });
  },

  getMachineLock: (machineId) => get().machineLocks.get(machineId) ?? null,

  isLockedByOther: (machineId) => {
    const state = get();
    const lockHolder = state.machineLocks.get(machineId);
    return lockHolder !== undefined && lockHolder !== state.localPlayerId;
  },

  getLockedMachinesForPlayer: (playerId) => {
    const locked: string[] = [];
    for (const [machineId, pid] of get().machineLocks) {
      if (pid === playerId) {
        locked.push(machineId);
      }
    }
    return locked;
  },

  // Intents
  submitIntent: (intent) => {
    const state = get();
    const fullIntent: MachineIntent = {
      ...intent,
      id: `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      playerId: state.localPlayerId,
      timestamp: Date.now(),
    };
    set({ pendingIntents: [...state.pendingIntents, fullIntent] });
    return fullIntent;
  },

  resolveIntent: (intentId, success, error) => {
    const state = get();
    set({
      pendingIntents: state.pendingIntents.filter((i) => i.id !== intentId),
    });
    // If failed, could trigger a notification here
    if (!success && error) {
      // Intent failed - notification would be triggered here
    }
  },

  getPendingIntents: () => get().pendingIntents,

  // Peers
  addPeer: (peer) => {
    const newPeers = new Map(get().peers);
    newPeers.set(peer.id, peer);
    set({ peers: newPeers });
  },

  updatePeer: (id, update) => {
    const state = get();
    const existing = state.peers.get(id);
    if (!existing) return;

    const newPeers = new Map(state.peers);
    newPeers.set(id, { ...existing, ...update });
    set({ peers: newPeers });
  },

  removePeer: (id) => {
    const newPeers = new Map(get().peers);
    newPeers.delete(id);
    set({ peers: newPeers });
  },

  setAverageLatency: (ms) => set({ averageLatencyMs: ms }),

  // Chat
  addChatMessage: (message) => {
    const state = get();
    set({
      chatMessages: [...state.chatMessages.slice(-99), message], // Keep last 100
      unreadChatCount: state.unreadChatCount + 1,
    });
  },

  markChatRead: () => set({ unreadChatCount: 0 }),

  // Reset
  reset: () => {
    set({
      ...initialState,
      localPlayerId: generatePlayerId(),
    });
  },
}));

// Selector hooks for common use cases
export const useIsMultiplayerActive = () =>
  useMultiplayerStore((s) => s.connectionState === 'connected');

export const useIsHost = () => useMultiplayerStore((s) => s.isHost);

export const useRoomCode = () => useMultiplayerStore((s) => s.roomCode);

export const useRemotePlayersArray = () => useMultiplayerStore((s) => s._remotePlayersArray);

export const useLocalPlayerId = () => useMultiplayerStore((s) => s.localPlayerId);

export const useMachineLock = (machineId: string) =>
  useMultiplayerStore((s) => s.machineLocks.get(machineId) ?? null);
