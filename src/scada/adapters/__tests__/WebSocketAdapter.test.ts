import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketAdapter } from '../WebSocketAdapter';
import type { TagDefinition, TagValue } from '../../types';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  throwOnSend = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.throwOnSend) throw new Error('transport send failed');
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  error(): void {
    this.onerror?.(new Event('error'));
  }

  serverClose(reason = 'server closed'): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ reason } as CloseEvent);
  }

  message(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const tags: TagDefinition[] = [
  {
    id: 'TEST.TT001.PV',
    name: 'Temperature',
    description: 'Test temperature',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: 'test-1',
    group: 'TEMPERATURE',
  },
  {
    id: 'TEST.SP001.SP',
    name: 'Speed setpoint',
    description: 'Writable test setpoint',
    dataType: 'FLOAT32',
    accessMode: 'READ_WRITE',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2_000,
    machineId: 'test-1',
    group: 'SETPOINT',
  },
];

const updateFrame = (value: number) =>
  JSON.stringify({
    type: 'update',
    tagId: tags[0].id,
    value,
    quality: 'GOOD',
    timestamp: 1234,
  });

describe('WebSocketAdapter lifecycle and recovery', () => {
  let adapter: WebSocketAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    adapter = new WebSocketAdapter(tags, {
      type: 'websocket',
      baseUrl: 'https://scada.example.test/socket',
    });
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('coalesces concurrent connect callers onto one socket and one heartbeat', async () => {
    const first = adapter.connect();
    const second = adapter.connect();
    const sockets = [...FakeWebSocket.instances];
    sockets.forEach((socket) => socket.open());

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cancels an in-flight connect and ignores every later event from that socket', async () => {
    const updates = vi.fn();
    adapter.subscribe([], updates);
    const pending = adapter.connect();
    const socket = FakeWebSocket.instances[0];

    await adapter.disconnect();
    socket.open();
    socket.message(updateFrame(71));

    await expect(pending).rejects.toThrow('cancelled');
    expect(adapter.isConnected()).toBe(false);
    expect(updates).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a failed socket closing after its replacement has connected', async () => {
    const failed = adapter.connect();
    const staleSocket = FakeWebSocket.instances[0];
    staleSocket.error();
    await expect(failed).rejects.toThrow('WebSocket error');

    const replacement = adapter.connect();
    const liveSocket = FakeWebSocket.instances[1];
    liveSocket.open();
    await replacement;
    staleSocket.serverClose('late close');

    expect(adapter.isConnected()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('closes a socket that errors before opening and releases its timeout', async () => {
    const pending = adapter.connect();
    const socket = FakeWebSocket.instances[0];

    socket.error();

    await expect(pending).rejects.toThrow('WebSocket error');
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(adapter.isConnected()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects and fully cleans up when the initial subscription send throws', async () => {
    const pending = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.throwOnSend = true;

    socket.open();

    await expect(pending).rejects.toThrow('transport send failed');
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: false,
      error: 'transport send failed',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a pending reconnect timer when a manual recovery succeeds', async () => {
    const initial = adapter.connect();
    FakeWebSocket.instances[0].open();
    await initial;
    FakeWebSocket.instances[0].serverClose();
    expect(vi.getTimerCount()).toBe(1);

    const recovery = adapter.connect();
    FakeWebSocket.instances[1].open();
    await recovery;

    expect(adapter.isConnected()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('continues automatic recovery after a reconnect attempt times out', async () => {
    const initial = adapter.connect();
    FakeWebSocket.instances[0].open();
    await initial;
    FakeWebSocket.instances[0].serverClose();

    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(4000);

    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(3);
  });

  it('gives an automatic replacement fresh cache and timestamp authority', async () => {
    const initial = adapter.connect();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    await initial;
    firstSocket.message(
      JSON.stringify({
        type: 'update',
        tagId: tags[0].id,
        value: 80,
        quality: 'GOOD',
        timestamp: 8_000,
        sourceTimestamp: 8_000,
      })
    );
    firstSocket.serverClose();

    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ quality: 'STALE' });
    await vi.advanceTimersByTimeAsync(2_000);
    const replacement = FakeWebSocket.instances[1];
    replacement.open();
    replacement.message(
      JSON.stringify({
        type: 'update',
        tagId: tags[0].id,
        value: 20,
        quality: 'GOOD',
        timestamp: 1_000,
        sourceTimestamp: 1_000,
      })
    );

    expect(adapter.isConnected()).toBe(true);
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({
      value: 20,
      timestamp: 1_000,
      sourceTimestamp: 1_000,
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('publishes the last values as STALE when the link drops unexpectedly', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const observer = vi.fn();
    adapter.subscribe([], observer);

    socket.message(updateFrame(42));
    socket.serverClose();

    expect(observer).toHaveBeenLastCalledWith([
      expect.objectContaining({ tagId: tags[0].id, value: 42, quality: 'STALE' }),
    ]);
  });

  it('does not publish STALE values on a deliberate disconnect', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const observer = vi.fn();
    adapter.subscribe([], observer);
    socket.message(updateFrame(42));
    observer.mockClear();

    await adapter.disconnect();

    expect(observer).not.toHaveBeenCalled();
  });

  it('turns a heartbeat send failure into one bounded reconnect attempt', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    socket.throwOnSend = true;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: false,
      reconnectAttempts: 1,
      error: 'transport send failed',
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('disconnects and schedules bounded recovery when a peer misses its heartbeat deadline', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({ type: 'ping' });
    expect(adapter.isConnected()).toBe(true);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(adapter.isConnected()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);

    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: false,
      reconnectAttempts: 1,
      error: 'WebSocket heartbeat timeout',
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears heartbeat deadlines on pong, responds to ping, and leaves no timer on disconnect', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.getTimerCount()).toBe(2);
    socket.message(JSON.stringify({ type: 'pong' }));
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.getTimerCount()).toBe(2);
    socket.message(JSON.stringify({ type: 'ping' }));
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({ type: 'pong' });
    await adapter.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates subscriber mutations from stored values and other subscribers', async () => {
    const initial = adapter.connect();
    FakeWebSocket.instances[0].open();
    await initial;

    adapter.subscribe([], (values) => {
      values[0].value = 999;
    });
    const globalObserver = vi.fn();
    const tagObserver = vi.fn();
    adapter.subscribe([], globalObserver);
    adapter.subscribe([tags[0].id], tagObserver);

    FakeWebSocket.instances[0].message(updateFrame(42));

    expect(globalObserver.mock.calls[0][0][0].value).toBe(42);
    expect(tagObserver.mock.calls[0][0][0].value).toBe(42);
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ value: 42 });
  });

  it('rejects unknown subscriptions atomically, deduplicates IDs, and removes empty sets', () => {
    const callback = vi.fn();
    const internal = adapter as unknown as {
      subscribers: Map<string, Set<(values: TagValue[]) => void>>;
    };

    expect(() => adapter.subscribe([tags[0].id, tags[0].id, 'ATTACKER.UNKNOWN'], callback)).toThrow(
      'Unknown tag: ATTACKER.UNKNOWN'
    );
    expect(internal.subscribers.size).toBe(0);

    const unsubscribe = adapter.subscribe([tags[0].id, tags[0].id], callback);
    expect(internal.subscribers.get(tags[0].id)).toEqual(new Set([callback]));
    unsubscribe();
    expect(internal.subscribers.size).toBe(0);
  });

  it('rejects a type-invalid batch atomically instead of committing valid siblings', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const observer = vi.fn();
    adapter.subscribe([], observer);

    socket.message(
      JSON.stringify({
        type: 'batch',
        tags: [
          { tagId: tags[0].id, value: 42, quality: 'GOOD', timestamp: 2_000 },
          { tagId: tags[1].id, value: 'fast', quality: 'GOOD', timestamp: 2_000 },
        ],
      })
    );

    expect(observer).not.toHaveBeenCalled();
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ quality: 'STALE' });
    expect(adapter.getStatistics().errorCount).toBe(1);
  });

  it('orders updates and batches by source timestamp with transport timestamp fallback', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const observer = vi.fn();
    adapter.subscribe([tags[0].id], observer);

    socket.message(
      JSON.stringify({
        type: 'update',
        tagId: tags[0].id,
        value: 60,
        quality: 'GOOD',
        timestamp: 5_000,
        sourceTimestamp: 3_000,
      })
    );
    socket.message(
      JSON.stringify({
        type: 'batch',
        tags: [
          {
            tagId: tags[0].id,
            value: 20,
            quality: 'GOOD',
            timestamp: 9_999,
            sourceTimestamp: 2_000,
          },
        ],
      })
    );
    socket.message(
      JSON.stringify({
        type: 'batch',
        tags: [{ tagId: tags[0].id, value: 70, quality: 'GOOD', timestamp: 4_000 }],
      })
    );

    expect(observer.mock.calls.map(([values]) => values[0].value)).toEqual([60, 70]);
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ value: 70 });
  });

  it('rejects oversized frames before JSON parsing and remains usable', async () => {
    const initial = adapter.connect();
    FakeWebSocket.instances[0].open();
    await initial;
    const parse = vi.spyOn(JSON, 'parse');

    FakeWebSocket.instances[0].message('x'.repeat(1024 * 1024 + 1));
    expect(parse).not.toHaveBeenCalled();

    FakeWebSocket.instances[0].message('{');
    FakeWebSocket.instances[0].message(updateFrame(37));
    expect(parse).toHaveBeenCalledTimes(2);
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ value: 37 });
  });

  it('rejects incomplete updates instead of fabricating GOOD zero telemetry', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const observer = vi.fn();
    adapter.subscribe([], observer);

    for (const frame of [
      { type: 'update', tagId: tags[0].id, quality: 'GOOD', timestamp: 1 },
      { type: 'update', tagId: tags[0].id, value: 0, timestamp: 1 },
      { type: 'update', tagId: tags[0].id, value: 0, quality: 'GOOD' },
    ]) {
      socket.message(JSON.stringify(frame));
    }

    expect(observer).not.toHaveBeenCalled();
    await expect(adapter.readTag(tags[0].id)).resolves.toMatchObject({ quality: 'STALE' });
    expect(adapter.getStatistics().errorCount).toBe(3);
  });

  it('rejects incompatible and closing-socket writes without reporting success', async () => {
    const initial = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await initial;
    const sentBefore = socket.sent.length;

    await expect(adapter.writeTag('TEST.SP001.SP', 'fast')).resolves.toBe(false);
    socket.readyState = FakeWebSocket.CLOSING;
    await expect(adapter.writeTag('TEST.SP001.SP', 1_500)).resolves.toBe(false);

    expect(socket.sent).toHaveLength(sentBefore);
    expect(adapter.getStatistics()).toMatchObject({ writesPerSecond: 0, errorCount: 0 });
  });
});
