# Multiplayer Architecture

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS supports real-time co-op multiplayer via WebRTC (PeerJS). The architecture is host-authoritative with a 6-character room code system. All multiplayer logic lives in `src/multiplayer/`. State is synchronized at 20Hz (player position) and 10Hz (game state). MVP host migration is not implemented: host disconnect ends the session. (src/multiplayer/MultiplayerManager.ts; SignalingService.ts)

## Core Components

All in `src/multiplayer/`:

| File | Role |
|------|------|
| `MultiplayerManager.ts` | Orchestrator: peer connections, broadcast, host authority, intent validation |
| `SignalingService.ts` | PeerJS wrapper: peer discovery, ICE/SDP via free PeerJS cloud server |
| `PeerConnection.ts` | Per-peer data channel management |
| `PlayerInterpolation.ts` | Smooth remote player movement between state updates |
| `HostMigration.ts` | Host disconnect handler (MVP: ends session, no migration) |
| `types.ts` | `MultiplayerMessage`, `RemotePlayer`, `GameStateDiff`, `FullGameState`, `MachineIntent`, `PLAYER_COLORS` |

## Broadcast Frequencies

From MultiplayerManager.ts:
- `PLAYER_UPDATE_INTERVAL = 50ms` — 20Hz player position/state
- `STATE_SYNC_INTERVAL = 100ms` — 10Hz game state diff
- `PING_INTERVAL = 1000ms` — 1Hz latency measurement

## Room Code System

6-character alphanumeric codes generated from unambiguous characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Host peer ID: `millos-<roomCode>`. Guest peer ID: `millos-<roomCode>-<playerId>`. This makes the host's peer discoverable by guests using only the room code. (SignalingService.ts:48–52; multiplayerStore.ts)

## Host Authority

Host is the single authority for `MachineIntent` validation. `setIntentHandler()` callback — called by host to process machine control intents from guests. `setGameStateProvider()` — host provides full game state to new joiners. Guests send intents; host validates and broadcasts authoritative result.

## Host Migration

`HostMigration.ts`: MVP implementation. On host disconnect: guest calls `store.leaveRoom()`, dispatches `multiplayer:host-disconnected` CustomEvent for UI notification. Full migration (elect new host by latency, state transfer, reconnect) is documented as future work but not implemented. (HostMigration.ts:44–52)

## Store Integration

`src/stores/multiplayerStore.ts` (Zustand): tracks `connectionState`, `isHost`, `roomCode`, `localPlayerId`, `localPlayerName`, `localPlayerColor`, `remotePlayers` (Map), `_remotePlayersArray` (cached array). Room codes generated fresh per session; player IDs are `player_<timestamp>_<random>`.

## Peer Infrastructure

Uses PeerJS free public cloud server by default. For production, self-hosting recommended (`peerjs-server`). Debug level 2 in development, 0 in production. (SignalingService.ts:PEERJS_CONFIG)

## Provenance

- Sources: `src/multiplayer/MultiplayerManager.ts`, `src/multiplayer/SignalingService.ts`, `src/multiplayer/HostMigration.ts`, `src/stores/multiplayerStore.ts`
- Last verified: 2026-05-23

## See Also

- [[millos:systems/store-architecture]] — Zustand store patterns MillOS uses
- [[millos:systems/game-simulation]] — MachineIntent targets (what multiplayer guests control)
