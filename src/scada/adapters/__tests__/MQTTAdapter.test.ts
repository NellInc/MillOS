import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MQTTAdapter } from '../MQTTAdapter';
import type { TagDefinition } from '../../types';

type SocketHandler = ((event: any) => void) | null;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocol: string;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  onopen: SocketHandler = null;
  onmessage: SocketHandler = null;
  onerror: SocketHandler = null;
  onclose: SocketHandler = null;
  sent: Uint8Array[] = [];
  closeCalls = 0;
  throwOnSend = false;
  autoAcknowledgeSubscriptions = true;

  constructor(url: string, protocol: string) {
    this.url = url;
    this.protocol = protocol;
    FakeWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
    if (this.throwOnSend) throw new Error('transport send failed');
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(bytes);
    this.sent.push(copy);

    if (copy[0] >> 4 === 8 && this.autoAcknowledgeSubscriptions) {
      const messageId = packetIdentifier(copy);
      queueMicrotask(() => this.suback(messageId));
    }
  }

  close(): void {
    this.closeCalls++;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ reason: 'client disconnect' });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  receive(bytes: Uint8Array): void {
    const copy = bytes.slice();
    this.onmessage?.({ data: copy.buffer });
  }

  connack(returnCode = 0): void {
    this.receive(new Uint8Array([0x20, 0x02, 0x00, returnCode]));
  }

  puback(messageId: number): void {
    this.receive(new Uint8Array([0x40, 0x02, (messageId >> 8) & 0xff, messageId & 0xff]));
  }

  suback(messageId: number, returnCode = 0): void {
    this.receive(
      new Uint8Array([0x90, 0x03, (messageId >> 8) & 0xff, messageId & 0xff, returnCode])
    );
  }

  fail(): void {
    this.onerror?.({});
  }

  brokerClose(reason = 'broker unavailable'): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ reason });
  }
}

const packetIdentifier = (packet: Uint8Array): number => {
  let offset = 1;
  while ((packet[offset++] & 0x80) !== 0) {
    // Skip MQTT variable-length encoding.
  }

  if (packet[0] >> 4 === 3) {
    const topicLength = (packet[offset] << 8) | packet[offset + 1];
    offset += 2 + topicLength;
  }

  return (packet[offset] << 8) | packet[offset + 1];
};

const tags: TagDefinition[] = [
  {
    id: 'RM101.SP001.SP',
    name: 'Mill setpoint',
    description: 'Writable speed setpoint',
    dataType: 'FLOAT32',
    accessMode: 'READ_WRITE',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2_000,
    machineId: 'rm-101',
    group: 'SETPOINT',
  },
  {
    id: 'RM101.TT001.PV',
    name: 'Mill temperature',
    description: 'Read-only temperature',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 120,
    machineId: 'rm-101',
    group: 'TEMPERATURE',
  },
];

const makeAdapter = () =>
  new MQTTAdapter(tags, {
    type: 'mqtt',
    brokerUrl: 'wss://broker.invalid/mqtt',
    topicPrefix: 'mill',
    clientId: 'unit-client',
  });

const publishPacket = (topic: string, payload: string): Uint8Array => {
  const topicBytes = new TextEncoder().encode(topic);
  const payloadBytes = new TextEncoder().encode(payload);
  const remainingLength = 2 + topicBytes.length + payloadBytes.length;
  const encodedLength: number[] = [];
  let value = remainingLength;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    encodedLength.push(byte);
  } while (value > 0);

  const packet = new Uint8Array(1 + encodedLength.length + remainingLength);
  packet[0] = 0x30;
  packet.set(encodedLength, 1);
  let offset = 1 + encodedLength.length;
  packet[offset++] = (topicBytes.length >> 8) & 0xff;
  packet[offset++] = topicBytes.length & 0xff;
  packet.set(topicBytes, offset);
  offset += topicBytes.length;
  packet.set(payloadBytes, offset);
  return packet;
};

const tagPayload = (tagId: string, value: number, timestamp: number, sourceTimestamp?: number) =>
  JSON.stringify({
    tagId,
    value,
    quality: 'GOOD',
    timestamp,
    ...(sourceTimestamp === undefined ? {} : { sourceTimestamp }),
  });

const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('MQTTAdapter adversarial transport lifecycle', () => {
  let adapter: MQTTAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    adapter = makeAdapter();
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const connect = async (): Promise<FakeWebSocket> => {
    const connecting = adapter.connect();
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.open();
    socket.connack();
    await connecting;
    return socket;
  };

  it('coalesces concurrent connect calls into one transport', async () => {
    const first = adapter.connect();
    const second = adapter.connect();
    const sockets = [...FakeWebSocket.instances];

    for (const socket of sockets) {
      socket.open();
      socket.connack();
    }
    await Promise.all([first, second]);

    expect(sockets).toHaveLength(1);
    expect(adapter.isConnected()).toBe(true);
    expect(sockets[0].sent.filter((packet) => packet[0] === 0x82)).toHaveLength(1);
  });

  it('cancels an in-flight connect without scheduling a reconnect', async () => {
    const connecting = adapter.connect();
    const rejected = expect(connecting).rejects.toThrow(/cancel|closed/i);
    const socket = FakeWebSocket.instances[0];
    socket.open();

    await adapter.disconnect();

    await rejected;
    expect(adapter.isConnected()).toBe(false);
    expect(socket.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets a fresh connect win when disconnect races the CONNACK continuation', async () => {
    const firstAttempt = adapter.connect();
    const firstRejected = expect(firstAttempt).rejects.toThrow(/cancel/i);
    const first = FakeWebSocket.instances[0];
    first.open();
    first.connack();

    const disconnecting = adapter.disconnect();
    const secondAttempt = adapter.connect();
    const second = FakeWebSocket.instances[1];
    second.open();
    second.connack();

    await disconnecting;
    await firstRejected;
    await secondAttempt;

    expect(adapter.isConnected()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('disconnects an established transport without resurrecting it', async () => {
    const socket = await connect();
    expect(vi.getTimerCount()).toBe(1);

    await adapter.disconnect();

    expect(adapter.isConnected()).toBe(false);
    expect(socket.closeCalls).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a broker-refused CONNACK and closes the failed socket', async () => {
    const connecting = adapter.connect();
    const rejected = expect(connecting).rejects.toThrow(/CONNACK|refused/i);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.connack(5);

    await rejected;
    expect(adapter.isConnected()).toBe(false);
    expect(socket.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not report connected when the broker rejects the required subscription', async () => {
    const connecting = adapter.connect();
    const rejected = expect(connecting).rejects.toThrow(/subscription rejected/i);
    const socket = FakeWebSocket.instances[0];
    socket.autoAcknowledgeSubscriptions = false;
    socket.open();
    socket.connack();
    await flushMicrotasks();

    const subscribe = socket.sent.find((packet) => packet[0] >> 4 === 8)!;
    expect(adapter.isConnected()).toBe(false);
    socket.suback(packetIdentifier(subscribe), 0x80);

    await rejected;
    expect(adapter.isConnected()).toBe(false);
    expect(socket.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails and releases a connection whose required SUBACK never arrives', async () => {
    const connecting = adapter.connect();
    const rejected = expect(connecting).rejects.toThrow(/SUBACK timeout/i);
    const socket = FakeWebSocket.instances[0];
    socket.autoAcknowledgeSubscriptions = false;
    socket.open();
    socket.connack();
    await flushMicrotasks();

    expect(adapter.isConnected()).toBe(false);
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
    expect(socket.closeCalls).toBe(1);
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects immediately and disposes the socket when CONNECT send throws', async () => {
    const connecting = adapter.connect();
    const socket = FakeWebSocket.instances[0];
    socket.throwOnSend = true;

    socket.open();

    await expect(connecting).rejects.toThrow('transport send failed');
    expect(socket.closeCalls).toBe(1);
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries after a reconnect handshake fails and disposes the failed socket', async () => {
    const first = await connect();
    first.brokerClose();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    const retry = FakeWebSocket.instances[1];
    retry.open();
    retry.fail();
    await flushMicrotasks();

    expect(retry.closeCalls).toBe(1);
    expect(adapter.getConnectionStatus().reconnectAttempts).toBe(2);
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops a sustained broker-failure loop after ten bounded attempts', async () => {
    const first = await connect();
    first.brokerClose();

    for (let attempt = 2; attempt <= 10; attempt++) {
      const priorAttempts = attempt - 1;
      const delay = Math.min(1_000 * 2 ** priorAttempts, 30_000);
      await vi.advanceTimersByTimeAsync(delay);
      const retry = FakeWebSocket.instances.at(-1)!;
      retry.open();
      retry.fail();
      await flushMicrotasks();
    }

    expect(adapter.getConnectionStatus().reconnectAttempts).toBe(10);
    expect(vi.getTimerCount()).toBe(0);
    await expect(adapter.connect()).rejects.toThrow(/permanently disconnected/i);
  });

  it('ignores error callbacks from a transport replaced during recovery', async () => {
    const first = await connect();
    first.brokerClose();
    await vi.advanceTimersByTimeAsync(2_000);

    const recovered = FakeWebSocket.instances[1];
    recovered.open();
    recovered.connack();
    await flushMicrotasks();
    expect(adapter.isConnected()).toBe(true);

    first.fail();

    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getConnectionStatus()).toMatchObject({
      error: undefined,
      reconnectAttempts: 0,
    });
  });

  it('turns a keep-alive send failure into one bounded recovery attempt', async () => {
    const socket = await connect();
    socket.throwOnSend = true;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(socket.closeCalls).toBe(1);
    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: false,
      reconnectAttempts: 1,
      error: 'transport send failed',
    });
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('recovers a half-open connection after a missing PINGRESP deadline', async () => {
    const socket = await connect();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.sent.at(-1)).toEqual(new Uint8Array([0xc0, 0x00]));
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(socket.closeCalls).toBe(1);
    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: false,
      reconnectAttempts: 1,
      error: 'MQTT keep-alive response timeout',
    });
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears the response deadline when a valid PINGRESP arrives', async () => {
    const socket = await connect();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.getTimerCount()).toBe(2);
    socket.receive(new Uint8Array([0xd0, 0x00]));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(adapter.isConnected()).toBe(true);
    expect(socket.closeCalls).toBe(0);
    expect(adapter.getStatistics().errorCount).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('MQTTAdapter adversarial message and resource boundaries', () => {
  let adapter: MQTTAdapter;
  let socket: FakeWebSocket;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    adapter = makeAdapter();
    const connecting = adapter.connect();
    socket = FakeWebSocket.instances[0];
    socket.open();
    socket.connack();
    await connecting;
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('bounds the value store to the declared tag catalogue', async () => {
    const callback = vi.fn();
    adapter.subscribe([], callback);

    for (let i = 0; i < 256; i++) {
      const tagId = `ATTACKER.${i}`;
      socket.receive(publishPacket(`mill/tags/${tagId}/value`, tagPayload(tagId, i, i + 1)));
    }
    socket.receive(
      publishPacket('mill/tags/RM101.TT001.PV/value', tagPayload('RM101.TT001.PV', 45, 1_000))
    );

    expect(await adapter.readAllTags()).toEqual([
      {
        tagId: 'RM101.TT001.PV',
        value: 45,
        quality: 'GOOD',
        timestamp: 1_000,
        sourceTimestamp: undefined,
      },
    ]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('rejects a topic and payload tag mismatch', async () => {
    const callback = vi.fn();
    adapter.subscribe([], callback);
    socket.receive(
      publishPacket('mill/tags/RM101.SP001.SP/value', tagPayload('RM101.TT001.PV', 75, 1_000))
    );

    expect(await adapter.readAllTags()).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
    expect(adapter.getStatistics().errorCount).toBe(1);
  });

  it('rejects a structurally valid payload whose value violates the tag data type', async () => {
    const callback = vi.fn();
    adapter.subscribe([], callback);
    socket.receive(
      publishPacket(
        'mill/tags/RM101.TT001.PV/value',
        JSON.stringify({
          tagId: 'RM101.TT001.PV',
          value: 'forty-five',
          quality: 'GOOD',
          timestamp: 1_000,
        })
      )
    );

    expect(await adapter.readAllTags()).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
    expect(adapter.getStatistics().errorCount).toBe(1);
  });

  it('does not roll a tag back when an older or duplicate delivery arrives', async () => {
    const callback = vi.fn();
    adapter.subscribe(['RM101.TT001.PV'], callback);
    const topic = 'mill/tags/RM101.TT001.PV/value';
    const newest = tagPayload('RM101.TT001.PV', 80, 2_000, 1_900);

    socket.receive(publishPacket(topic, newest));
    socket.receive(publishPacket(topic, tagPayload('RM101.TT001.PV', 20, 3_000, 1_800)));
    socket.receive(publishPacket(topic, newest));

    expect(await adapter.readTag('RM101.TT001.PV')).toMatchObject({
      value: 80,
      timestamp: 2_000,
      sourceTimestamp: 1_900,
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('publishes the last values as STALE on an unplanned broker disconnect', async () => {
    const callback = vi.fn();
    adapter.subscribe(['RM101.TT001.PV'], callback);
    const topic = 'mill/tags/RM101.TT001.PV/value';
    socket.receive(publishPacket(topic, tagPayload('RM101.TT001.PV', 45, 1_000)));

    socket.brokerClose();

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ tagId: 'RM101.TT001.PV', value: 45, quality: 'STALE' }),
    ]);
    expect(await adapter.readTag('RM101.TT001.PV')).toMatchObject({
      value: 45,
      quality: 'STALE',
      timestamp: 1_000,
    });
  });

  it('isolates subscriber mutations from stored values and later callbacks', async () => {
    adapter.subscribe([], (values) => {
      values[0].value = 999;
      values.pop();
    });
    const globalObserver = vi.fn();
    const tagObserver = vi.fn();
    adapter.subscribe([], globalObserver);
    adapter.subscribe(['RM101.TT001.PV'], tagObserver);

    socket.receive(
      publishPacket('mill/tags/RM101.TT001.PV/value', tagPayload('RM101.TT001.PV', 45, 1_000))
    );

    expect(globalObserver.mock.calls[0][0]).toMatchObject([{ value: 45 }]);
    expect(tagObserver.mock.calls[0][0]).toMatchObject([{ value: 45 }]);
    await expect(adapter.readTag('RM101.TT001.PV')).resolves.toMatchObject({ value: 45 });
  });

  it('rejects truncated frames whose declared length exceeds the received bytes', async () => {
    const callback = vi.fn();
    adapter.subscribe([], callback);
    const packet = publishPacket(
      'mill/tags/RM101.TT001.PV/value',
      tagPayload('RM101.TT001.PV', 45, 1_000)
    );
    packet[1]++;

    socket.receive(packet);

    expect(await adapter.readAllTags()).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
  });

  it('decodes the exact payload limit but rejects limit plus one before JSON parsing', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const topic = 'mill/tags/RM101.TT001.PV/value';

    socket.receive(publishPacket(topic, 'x'.repeat(1024 * 1024)));
    expect(parse).toHaveBeenCalledOnce();
    parse.mockClear();

    socket.receive(publishPacket(topic, 'x'.repeat(1024 * 1024 + 1)));
    expect(parse).not.toHaveBeenCalled();
  });

  it('enforces supported QoS, payload, and UTF-8 topic limits before packet allocation', () => {
    const internal = adapter as unknown as {
      client: { publish(topic: string, payload: string, qos?: number): Promise<void> };
    };
    const sentBefore = socket.sent.length;

    expect(() => internal.client.publish('t', 'x'.repeat(1024 * 1024))).not.toThrow();
    expect(() => internal.client.publish('t', 'x'.repeat(1024 * 1024 + 1))).toThrow(
      'payload exceeds'
    );
    expect(() => internal.client.publish('t'.repeat(65_535), '')).not.toThrow();
    expect(() => internal.client.publish('t'.repeat(65_536), '')).toThrow('topic exceeds');
    expect(() => internal.client.publish('t', '', 2)).toThrow('Invalid MQTT QoS');

    expect(socket.sent).toHaveLength(sentBefore + 2);
  });

  it('releases per-tag subscription entries and ignores unknown subscription IDs', () => {
    const noops = Array.from({ length: 512 }, (_, i) =>
      adapter.subscribe([`UNKNOWN.${i}`], vi.fn())
    );
    noops.forEach((unsubscribe) => unsubscribe());

    const unsubscribe = adapter.subscribe(['RM101.TT001.PV'], vi.fn());
    unsubscribe();

    const internal = adapter as unknown as {
      subscribers: Map<string, Set<(values: unknown[]) => void>>;
    };
    expect(internal.subscribers.size).toBe(0);
  });

  it('rejects non-finite and type-incompatible writes before publishing', async () => {
    const before = socket.sent.length;

    await expect(adapter.writeTag('RM101.SP001.SP', Number.NaN)).resolves.toBe(false);
    await expect(adapter.writeTag('RM101.SP001.SP', Number.POSITIVE_INFINITY)).resolves.toBe(false);
    await expect(adapter.writeTag('RM101.SP001.SP', 'fast')).resolves.toBe(false);

    expect(socket.sent).toHaveLength(before);
  });

  it('settles a QoS 1 write only after the matching PUBACK', async () => {
    const internal = adapter as unknown as {
      stats: { writeCount: number };
    };
    let settled = false;
    const writing = adapter.writeTag('RM101.SP001.SP', 1_500).then((result) => {
      settled = true;
      return result;
    });
    await flushMicrotasks();

    const publish = socket.sent.at(-1)!;
    const messageId = packetIdentifier(publish);
    expect(publish[0] & 0x06).toBe(0x02);
    expect(settled).toBe(false);
    expect(internal.stats.writeCount).toBe(0);

    socket.suback(messageId);
    socket.puback(messageId === 0xffff ? 1 : messageId + 1);
    await flushMicrotasks();
    expect(settled).toBe(false);

    socket.puback(messageId);
    await expect(writing).resolves.toBe(true);
    expect(internal.stats.writeCount).toBe(1);
  });

  it('fails pending QoS 1 writes on acknowledgement timeout and disconnect', async () => {
    const timedOut = adapter.writeTag('RM101.SP001.SP', 1_400);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(timedOut).resolves.toBe(false);

    const internal = adapter as unknown as {
      client: { pendingAcknowledgements: Map<number, unknown> };
    };
    expect(internal.client.pendingAcknowledgements.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);

    const disconnected = adapter.writeTag('RM101.SP001.SP', 1_500);
    socket.brokerClose('acknowledgement channel lost');
    await expect(disconnected).resolves.toBe(false);
    expect(adapter.isConnected()).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('bounds pending acknowledgements and clears every waiter on disconnect', async () => {
    const internal = adapter as unknown as {
      client: {
        publish(topic: string, payload: string, qos?: number): Promise<void>;
        pendingAcknowledgements: Map<number, unknown>;
      };
    };
    const client = internal.client;
    const pending = Array.from({ length: 1024 }, (_, i) =>
      client.publish(`mill/test/${i}`, 'x', 1).catch(() => undefined)
    );
    const sentAtLimit = socket.sent.length;

    expect(() => client.publish('mill/test/overflow', 'x', 1)).toThrow(/too many pending/i);
    expect(socket.sent).toHaveLength(sentAtLimit);
    expect(client.pendingAcknowledgements.size).toBe(1024);

    await adapter.disconnect();
    await Promise.all(pending);
    expect(client.pendingAcknowledgements.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wraps packet identifiers and skips an identifier that still awaits PUBACK', async () => {
    const internal = adapter as unknown as { client: { messageId: number } };
    internal.client.messageId = 65_535;

    const firstWrite = adapter.writeTag('RM101.SP001.SP', 1_500);
    const firstPacket = socket.sent.at(-1)!;
    expect(packetIdentifier(firstPacket)).toBe(1);

    internal.client.messageId = 65_535;
    const secondWrite = adapter.writeTag('RM101.SP001.SP', 1_600);
    const secondPacket = socket.sent.at(-1)!;
    expect(packetIdentifier(secondPacket)).toBe(2);

    socket.puback(2);
    await expect(secondWrite).resolves.toBe(true);
    socket.puback(1);
    await expect(firstWrite).resolves.toBe(true);
  });
});
