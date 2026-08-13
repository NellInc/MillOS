import { describe, expect, it } from 'vitest';
import { isValidMultiplayerMessage, MULTIPLAYER_PROTOCOL_LIMITS } from '../messageValidation';
import { PLAYER_COLORS, type MultiplayerMessage } from '../types';

const now = 1_800_000_000_000;
const machine = {
  id: 'RM101',
  status: 'running' as const,
  metrics: { rpm: 900, temperature: 42, vibration: 1.2, load: 80 },
};
const player = {
  id: 'player-1',
  name: 'Miller',
  position: [1, 2, 3] as [number, number, number],
  rotation: 0.5,
  velocity: [0, 0, 1] as [number, number, number],
  color: PLAYER_COLORS[0],
  selectedMachineId: 'RM101',
  isInFpsMode: true,
  lastUpdate: now,
};

const validMessages: MultiplayerMessage[] = [
  { type: 'PLAYER_UPDATE', payload: player },
  { type: 'PLAYER_JOIN', payload: { id: 'player-1', name: 'Miller', color: PLAYER_COLORS[0] } },
  { type: 'PLAYER_LEAVE', payload: { id: 'player-1' } },
  {
    type: 'STATE_SYNC',
    payload: { sequence: 1, machines: [machine], gameTime: 10, timestamp: now },
  },
  {
    type: 'FULL_STATE_SYNC',
    payload: {
      gameTime: 10,
      weather: 'clear',
      emergencyActive: false,
      machines: [machine],
      machineLocks: { RM101: 'player-1' },
    },
  },
  {
    type: 'INTENT',
    payload: {
      id: 'intent-1',
      type: 'ADJUST',
      machineId: 'RM101',
      playerId: 'player-1',
      timestamp: now,
      parameters: { setpoint: 900 },
    },
  },
  { type: 'INTENT_RESULT', payload: { intentId: 'intent-1', success: true } },
  {
    type: 'AI_VOTE',
    payload: { decisionId: 'decision-1', playerId: 'player-1', approve: true, timestamp: now },
  },
  {
    type: 'CHAT',
    payload: {
      id: 'chat-1',
      from: 'player-1',
      fromName: 'Miller',
      message: 'Mill 101 is stable.',
      timestamp: now,
    },
  },
  { type: 'PING', payload: { timestamp: now } },
  { type: 'PONG', payload: { timestamp: now, hostTime: now + 5 } },
  { type: 'MACHINE_LOCK', payload: { machineId: 'RM101', playerId: 'player-1' } },
];

describe('multiplayer message validation', () => {
  it.each(validMessages)('accepts the maintained $type contract', (message) => {
    expect(isValidMultiplayerMessage(message)).toBe(true);
  });

  it('rejects unknown types and missing payloads', () => {
    expect(isValidMultiplayerMessage({ type: 'TAKE_OVER', payload: {} })).toBe(false);
    expect(isValidMultiplayerMessage({ type: 'CHAT' })).toBe(false);
    expect(isValidMultiplayerMessage(null)).toBe(false);
  });

  it('rejects nonfinite coordinates and timestamps before Three.js or stores see them', () => {
    expect(
      isValidMultiplayerMessage({
        type: 'PLAYER_UPDATE',
        payload: { ...player, position: [Number.NaN, 0, 0] },
      })
    ).toBe(false);
    expect(isValidMultiplayerMessage({ type: 'PING', payload: { timestamp: Infinity } })).toBe(
      false
    );
    expect(
      isValidMultiplayerMessage({
        type: 'STATE_SYNC',
        payload: { sequence: -1, gameTime: 10, timestamp: now },
      })
    ).toBe(false);
    expect(
      isValidMultiplayerMessage({
        type: 'STATE_SYNC',
        payload: { sequence: 1, gameTime: 24, weather: 'hail', timestamp: now },
      })
    ).toBe(false);
  });

  it('rejects oversized chat, machine lists, lock maps, and intent parameter graphs', () => {
    expect(
      isValidMultiplayerMessage({
        type: 'CHAT',
        payload: { ...validMessages[8].payload, message: 'x'.repeat(501) },
      })
    ).toBe(false);
    expect(
      isValidMultiplayerMessage({
        type: 'STATE_SYNC',
        payload: {
          sequence: 1,
          timestamp: now,
          machines: new Array(MULTIPLAYER_PROTOCOL_LIMITS.maxMachines + 1).fill(machine),
        },
      })
    ).toBe(false);
    expect(
      isValidMultiplayerMessage({
        type: 'FULL_STATE_SYNC',
        payload: {
          gameTime: 1,
          weather: 'clear',
          emergencyActive: false,
          machines: [],
          machineLocks: Object.fromEntries(
            Array.from({ length: MULTIPLAYER_PROTOCOL_LIMITS.maxMachines + 1 }, (_, index) => [
              `machine-${index}`,
              'player-1',
            ])
          ),
        },
      })
    ).toBe(false);
    expect(
      isValidMultiplayerMessage({
        type: 'INTENT',
        payload: {
          ...validMessages[5].payload,
          parameters: new Array(MULTIPLAYER_PROTOCOL_LIMITS.maxJsonNodes + 1).fill(1),
        },
      })
    ).toBe(false);
  });

  it('rejects prototype-bearing parameter objects and invalid colors', () => {
    expect(
      isValidMultiplayerMessage({
        type: 'INTENT',
        payload: { ...validMessages[5].payload, parameters: new Date() },
      })
    ).toBe(false);
    expect(
      isValidMultiplayerMessage({
        type: 'PLAYER_JOIN',
        payload: { id: 'player-1', name: 'Miller', color: '#ffffff' },
      })
    ).toBe(false);
  });
});
