import type { DataConnection } from 'peerjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PENDING_MULTIPLAYER_MESSAGES,
  PeerConnection,
  type PeerConnectionCallbacks,
} from '../PeerConnection';
import { PLAYER_COLORS, type MultiplayerMessage } from '../types';

class FakeDataConnection {
  open = false;
  peer = 'peer-1';
  metadata = {};
  send = vi.fn();
  close = vi.fn();
  private listeners = new Map<string, Array<(value?: unknown) => void>>();

  on(event: string, callback: (value?: unknown) => void): void {
    const callbacks = this.listeners.get(event) ?? [];
    callbacks.push(callback);
    this.listeners.set(event, callbacks);
  }

  emit(event: string, value?: unknown): void {
    this.listeners.get(event)?.forEach((callback) => callback(value));
  }
}

const chatMessage = (index: number): MultiplayerMessage => ({
  type: 'CHAT',
  payload: {
    id: `chat-${index}`,
    from: 'player-1',
    fromName: 'Miller',
    message: `message ${index}`,
    timestamp: index,
  },
});

const playerUpdate = (x: number): MultiplayerMessage => ({
  type: 'PLAYER_UPDATE',
  payload: {
    id: 'player-1',
    name: 'Miller',
    position: [x, 1.7, 0],
    rotation: 0,
    velocity: [0, 0, 0],
    color: PLAYER_COLORS[0],
    selectedMachineId: null,
    isInFpsMode: true,
    lastUpdate: x,
  },
});

describe('PeerConnection trust boundary', () => {
  let raw: FakeDataConnection;
  let callbacks: PeerConnectionCallbacks;
  let peer: PeerConnection;

  beforeEach(() => {
    raw = new FakeDataConnection();
    callbacks = {
      onMessage: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn(),
    };
    peer = new PeerConnection(raw as unknown as DataConnection, callbacks);
  });

  it('drops malformed incoming data before dispatch', () => {
    raw.emit('data', { type: 'CHAT', payload: { message: 'missing identity' } });
    raw.emit('data', { type: 'UNKNOWN', payload: {} });
    expect(callbacks.onMessage).not.toHaveBeenCalled();

    const valid = chatMessage(1);
    raw.emit('data', valid);
    expect(callbacks.onMessage).toHaveBeenCalledWith(valid);
  });

  it('bounds the pre-open queue and drops the oldest control message', () => {
    for (let index = 0; index < MAX_PENDING_MULTIPLAYER_MESSAGES + 20; index += 1) {
      peer.send(chatMessage(index));
    }

    raw.open = true;
    raw.emit('open');

    expect(raw.send).toHaveBeenCalledTimes(MAX_PENDING_MULTIPLAYER_MESSAGES);
    expect(raw.send.mock.calls[0][0].payload.id).toBe('chat-20');
    expect(raw.send.mock.lastCall?.[0].payload.id).toBe(
      `chat-${MAX_PENDING_MULTIPLAYER_MESSAGES + 19}`
    );
  });

  it('coalesces high-frequency state to the newest queued update', () => {
    for (let index = 0; index < 100; index += 1) peer.send(playerUpdate(index));

    raw.open = true;
    raw.emit('open');

    expect(raw.send).toHaveBeenCalledTimes(1);
    expect(raw.send).toHaveBeenCalledWith(playerUpdate(99));
  });
});
