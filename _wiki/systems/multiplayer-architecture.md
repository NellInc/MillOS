# Multiplayer Architecture

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-12 -->
<!-- wiki:status = active -->

## Summary

MillOS multiplayer is a host-authoritative social simulation over PeerJS WebRTC data channels. The host owns shared game state, players broadcast local movement at 20 Hz, and the host sends shared-state updates at 10 Hz. (src/multiplayer/MultiplayerManager.ts:1-10; src/multiplayer/MultiplayerManager.ts:30-33)

## Discovery and connection

A host uses a predictable peer identifier built from the six-character room code; a guest identifier adds its player ID. (src/multiplayer/SignalingService.ts:45-58) The default configuration uses the public PeerJS cloud signaling service. (src/multiplayer/SignalingService.ts:25-31) A signaling disconnect triggers PeerJS reconnect while existing peer data connections may survive. (src/multiplayer/SignalingService.ts:94-107)

Room codes identify a room and are not an authentication credential. This makes multiplayer unsuitable for credentials, private plant data, or safety-critical commands. [Inference from predictable identifiers and public signaling] (src/multiplayer/SignalingService.ts:25-31; src/multiplayer/SignalingService.ts:45-58)

## Authority and identity

MultiplayerManager owns connection orchestration, state broadcasts, and machine intent processing. (src/multiplayer/MultiplayerManager.ts:1-10; src/multiplayer/MultiplayerManager.ts:40-65) The host binds each connection to a verified player ID and overwrites identity-bearing fields from subsequent messages so peers cannot impersonate another room member through message data. (src/multiplayer/MultiplayerManager.ts:49-53) A guest accepts an authoritative connection only from its expected host peer identifier. (src/multiplayer/MultiplayerManager.ts:55-59; src/multiplayer/MultiplayerManager.ts:134-139)

These controls constrain the maintained protocol, but the room still trusts its host to provide game state. They do not provide cryptographic host identity or industrial authorization. [Inference from host authority and predictable host identifier] (src/multiplayer/MultiplayerManager.ts:49-59; src/multiplayer/SignalingService.ts:52-58)

## Message boundary

Every received PeerJS payload is validated before it reaches message callbacks. (src/multiplayer/PeerConnection.ts:54-67) The discriminated-union validator bounds identifiers, vectors, machine lists, lock maps, chat, nested intent parameters, finite numbers, and timestamps across all maintained message variants. (src/multiplayer/messageValidation.ts:1-140; src/multiplayer/messageValidation.ts:142-213)

Messages sent before a connection opens use a 256-item queue. High-frequency PLAYER_UPDATE and STATE_SYNC messages are coalesced, and capacity eviction prefers stale coalescible state before older control traffic. (src/multiplayer/PeerConnection.ts:18-25; src/multiplayer/PeerConnection.ts:121-140)

## Host loss

Host departure ends the session. The guest store leaves the room and dispatches a UI event explaining that the session ended. (src/multiplayer/HostDisconnect.ts:1-31) No host migration, consensus, state transfer, or split-brain recovery protocol is implemented. (src/multiplayer/HostDisconnect.ts:1-4)

## Provenance

- Sources consulted: src/multiplayer/MultiplayerManager.ts, src/multiplayer/SignalingService.ts, src/multiplayer/PeerConnection.ts, src/multiplayer/messageValidation.ts, src/multiplayer/HostDisconnect.ts
- Last verified against sources: 2026-08-12

## See Also

- [[millos:systems/safety-audit-security-logging]] — local audit and trust boundaries
- [[millos:systems/game-simulation]] — synchronized simulation state
