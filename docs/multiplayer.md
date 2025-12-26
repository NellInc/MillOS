# Multiplayer System Documentation

MillOS supports peer-to-peer multiplayer for 2-8 players, allowing visitors to explore the grain mill together and collaboratively control machines.

## Quick Start

### Creating a Room (Host)

1. Open the control panel on the left side
2. Expand the **Multiplayer** section
3. Enter your display name
4. Click **Create Room**
5. Share the 6-character room code with others (e.g., `MILL42`)

### Joining a Room (Guest)

1. Open the control panel on the left side
2. Expand the **Multiplayer** section
3. Enter your display name
4. Enter the room code shared by the host
5. Click **Join**

### In-Game Controls

- **V key** - Toggle first-person mode (required to see other players)
- **WASD** - Move around
- **Shift** - Sprint
- **Chat icon** (bottom-right) - Open chat window
- **ESC** - Exit first-person mode

---

## Architecture Overview

### Host-Authority Model

The multiplayer system uses a **host-authority model** where:

- The first player to create a room becomes the **host**
- The host owns all authoritative game state (machines, time, weather)
- Guest players send **intents** (requests) to the host
- The host validates and applies changes, then broadcasts to all players
- Each player owns their own position (peer-to-peer broadcast)

```
[Host Player]  <──WebRTC DataChannel──>  [Guest Players]
     |                                        |
     ├─ Owns game state                       ├─ Send intents
     ├─ Validates actions                     ├─ Receive state updates
     └─ Broadcasts at 10Hz                    └─ Own their position
```

### Why Host-Authority (not CRDTs)?

| Factor | Host-Authority | CRDTs (Y.js) |
|--------|---------------|--------------|
| Complexity | Simple | High |
| Bundle size | ~50KB (PeerJS) | ~80KB+ |
| Conflict resolution | Automatic | Complex merging |
| Debugging | Easy | Hard |

For 2-8 players, host-authority offers the best balance of simplicity and reliability.

---

## Technical Components

### File Structure

```
src/multiplayer/
  types.ts                 # Type definitions
  SignalingService.ts      # PeerJS room signaling
  PeerConnection.ts        # WebRTC DataChannel wrapper
  MultiplayerManager.ts    # Main orchestration
  PlayerInterpolation.ts   # Smooth movement buffer
  HostMigration.ts         # Disconnect handling
  hooks/
    useMultiplayerSync.ts  # State sync hook
    index.ts
  index.ts                 # Module exports

src/stores/
  multiplayerStore.ts      # Zustand store for multiplayer state

src/components/multiplayer/
  RemotePlayerAvatar.tsx   # 3D player model
  RemotePlayersGroup.tsx   # Renders all remote players
  MultiplayerLobby.tsx     # Create/join room UI
  MachineLockIndicator.tsx # Visual lock indicator
  ConnectionQuality.tsx    # Network quality display
  MultiplayerChat.tsx      # Chat system
  AIDecisionVoting.tsx     # Collaborative voting
  index.ts
```

### Key Classes

#### MultiplayerManager

The main orchestration class that handles:

- Room creation and joining
- Peer connection management
- Message broadcasting
- State synchronization
- Intent processing

```typescript
import { getMultiplayerManager } from './multiplayer';

const manager = getMultiplayerManager();

// Host a room
const roomCode = await manager.hostRoom('PlayerName');

// Join a room
await manager.joinRoom('MILL42', 'PlayerName');

// Send chat message
manager.sendChat('Hello everyone!');

// Leave room
manager.leave();
```

#### SignalingService

Handles WebRTC peer discovery using PeerJS:

- Host creates a predictable peer ID: `millos-{ROOMCODE}`
- Guests connect to the host's peer ID
- Once connected, signaling server is no longer needed

#### PeerConnection

Wrapper for WebRTC DataChannel communication:

- Message serialization/deserialization
- Send queue for offline buffering
- Ping/pong latency measurement

### Zustand Store

The `multiplayerStore` manages:

```typescript
interface MultiplayerStore {
  // Connection
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  isHost: boolean;
  roomCode: string | null;

  // Players
  localPlayerId: string;
  localPlayerName: string;
  localPlayerColor: PlayerColor;
  remotePlayers: Map<string, RemotePlayer>;

  // Local position (for broadcasting)
  localPosition: [number, number, number];
  localRotation: number;
  localVelocity: [number, number, number];

  // Machine locks
  machineLocks: Map<string, string>; // machineId -> playerId

  // Chat
  chatMessages: ChatMessage[];
  unreadChatCount: number;
}
```

---

## Network Protocol

### Message Types

All messages are sent as JSON over WebRTC DataChannel:

```typescript
type MultiplayerMessage =
  | { type: 'PLAYER_UPDATE'; payload: RemotePlayer }
  | { type: 'PLAYER_JOIN'; payload: { id, name, color } }
  | { type: 'PLAYER_LEAVE'; payload: { id } }
  | { type: 'STATE_SYNC'; payload: GameStateDiff }
  | { type: 'FULL_STATE_SYNC'; payload: FullGameState }
  | { type: 'INTENT'; payload: MachineIntent }
  | { type: 'INTENT_RESULT'; payload: { intentId, success, error? } }
  | { type: 'MACHINE_LOCK'; payload: { machineId, playerId } }
  | { type: 'CHAT'; payload: ChatMessage }
  | { type: 'PING'; payload: { timestamp } }
  | { type: 'PONG'; payload: { timestamp, hostTime } };
```

### Broadcast Frequencies

| Data | Frequency | Direction |
|------|-----------|-----------|
| Player position | 20Hz (50ms) | All peers |
| Game state | 10Hz (100ms) | Host → Guests |
| Latency ping | 1Hz (1000ms) | All peers |
| Chat messages | Immediate | All peers |
| Machine intents | Immediate | Guest → Host |

### Data Sizes

- Player update: ~100 bytes
- State diff: ~200-500 bytes
- Full state sync: ~2-5 KB (on join only)

---

## Machine Control

### Intent System

When a player wants to control a machine:

1. Player clicks machine → creates `MachineIntent`
2. If host: validate and apply locally
3. If guest: send intent to host
4. Host validates against current state
5. Host applies change and broadcasts result
6. Guest receives `INTENT_RESULT`

```typescript
interface MachineIntent {
  id: string;
  type: 'START' | 'STOP' | 'ADJUST';
  machineId: string;
  playerId: string;
  timestamp: number;
  parameters?: Record<string, unknown>;
}
```

### Machine Locking

Soft-locking prevents conflicts:

- When a player selects a machine, they acquire a lock
- Other players see a colored ring and the player's name
- Lock holder can control the machine freely
- Lock is released on deselection or disconnect

```typescript
// Check if machine is locked by another player
const { canControl, lockHolderName } = useCanControlMachine(machineId);

if (!canControl) {
  alert(`Machine is being controlled by ${lockHolderName}`);
}
```

---

## UI Components

### MultiplayerLobby

Located in the left control panel:

- Name input field
- Create Room button
- Join Room input + button
- Connected players list
- Room code display with copy button
- Leave Room button

### MultiplayerChat

Floating chat button in bottom-right corner:

- Expandable chat window
- Auto-scroll to latest message
- Unread message badge
- Color-coded player names
- 200 character message limit
- Last 100 messages retained

### ConnectionQuality

Shows network health:

- Signal bars (excellent/good/fair/poor)
- Latency in milliseconds
- Color-coded by quality

### MachineLockIndicator

3D indicator rendered at machine position:

- Colored ring on floor
- Player name billboard (when locked by other)
- Color matches locking player

### RemotePlayerAvatar

3D avatar for other players:

- Capsule body with player color
- Walking animation based on velocity
- Name tag billboard
- Selection ring when controlling machine
- Subtle point light for visibility

---

## State Synchronization

### What Gets Synchronized

| State | Owner | Sync Method |
|-------|-------|-------------|
| Game time | Host | Broadcast 10Hz |
| Weather | Host | On change |
| Machine status | Host | Broadcast 10Hz |
| Machine metrics | Host | Broadcast 10Hz |
| Emergency state | Host | Immediate |
| Player positions | Each player | P2P 20Hz |
| Machine locks | Host | Immediate |
| Chat messages | Originator | Immediate |

### Initial Sync

When a new player joins:

1. Host sends `FULL_STATE_SYNC` with complete game state
2. Guest applies all machine states
3. Guest applies game time and weather
4. Guest applies existing machine locks
5. Connection state set to 'connected'

### Conflict Resolution

When two players click the same machine:

1. Both send `MachineIntent` to host
2. Host processes in arrival order (FIFO)
3. First intent wins
4. Second player receives "already in that state" or lock conflict

---

## Position Interpolation

Remote player positions are smoothed using:

### Simple Lerp (Current)

```typescript
// Every frame
const lerpFactor = Math.min(delta * 12, 1);
position.lerp(targetPosition, lerpFactor);
```

### Buffer System (Advanced)

For higher quality, use `PlayerInterpolationBuffer`:

```typescript
import { interpolationManager } from './multiplayer';

// Add incoming position sample
const buffer = interpolationManager.getBuffer(playerId);
buffer.addSample(position, rotation, velocity, timestamp);

// Get interpolated position for rendering
const state = buffer.getInterpolatedState(Date.now());
```

The buffer:
- Holds positions 100ms in the past
- Interpolates between samples
- Extrapolates briefly if packets are late

---

## Error Handling

### Connection Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| `unavailable-id` | Room code in use | Choose different code |
| `peer-unavailable` | Host not found | Check room code |
| Connection timeout | Network issues | Retry or check firewall |

### Host Disconnect

When the host leaves:

1. Guests receive disconnect event
2. Session ends for all players
3. Players return to disconnected state

Future enhancement: Automatic host migration to lowest-latency player.

---

## Performance Considerations

### Network

- Position updates throttled to 20Hz
- State sync throttled to 10Hz
- Messages batched where possible
- ~50-100 bytes per position update

### Rendering

- Remote players use simplified geometry
- Walk animation is procedural (no skeletal)
- Name tags use billboard optimization
- Machine lock indicators use basic materials

### Memory

- Last 100 chat messages retained
- Position buffer holds 20 samples per player
- Peer connections cleaned up on disconnect

---

## Dependencies

```json
{
  "peerjs": "^1.5.4"
}
```

PeerJS handles:
- WebRTC complexity (ICE, STUN, TURN)
- Signaling server (free cloud tier)
- DataChannel abstraction
- Reconnection logic

---

## Future Enhancements

Potential improvements not yet implemented:

1. **Host Migration** - Automatic failover when host disconnects
2. **Voice Chat** - WebRTC audio channels
3. **Spectator Mode** - Watch without controlling
4. **Replay System** - Record and playback sessions
5. **Persistent Rooms** - Save room state across sessions
6. **Authentication** - User accounts and permissions
7. **Larger Scale** - Server-based architecture for 50+ players
