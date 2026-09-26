import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RESTAdapter } from '../RESTAdapter';
import type { ConnectionConfig, TagDefinition, TagValue } from '../../types';

const TAGS: TagDefinition[] = [
  {
    id: 'TEST.TEMP.PV',
    name: 'Temperature',
    description: 'Test temperature',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: 'test-machine',
    group: 'TEMPERATURE',
  },
  {
    id: 'TEST.SPEED.SP',
    name: 'Speed setpoint',
    description: 'Test speed setpoint',
    dataType: 'FLOAT32',
    accessMode: 'READ_WRITE',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: 'test-machine',
    group: 'SETPOINT',
  },
];

const VALUES: TagValue[] = [
  { tagId: 'TEST.TEMP.PV', value: 42, quality: 'GOOD', timestamp: 1_000 },
  { tagId: 'TEST.SPEED.SP', value: 1_200, quality: 'GOOD', timestamp: 1_000 },
];

const response = (body?: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('RESTAdapter adversarial lifecycle and transport contracts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let adapter: RESTAdapter;

  const config = (overrides: Partial<ConnectionConfig> = {}): ConnectionConfig => ({
    type: 'rest',
    baseUrl: 'https://scada.test',
    pollInterval: 1_000,
    ...overrides,
  });

  const queueSuccessfulConnect = (values: TagValue[] = VALUES) => {
    fetchMock.mockResolvedValueOnce(response());
    fetchMock.mockResolvedValueOnce(response({ tags: values, serverTime: 1_000 }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    adapter = new RESTAdapter(TAGS, config());
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('coalesces concurrent connects into one health check, initial read, and poll timer', async () => {
    const health = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(health.promise)
      .mockResolvedValueOnce(response({ tags: VALUES, serverTime: 1_000 }));

    const first = adapter.connect();
    const second = adapter.connect();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    health.resolve(response());
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adapter.isConnected()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('aborts an in-flight connect on disconnect without resurrecting the adapter', async () => {
    let healthSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => {
      healthSignal = options.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        healthSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      });
    });

    const connecting = adapter.connect();
    await Promise.resolve();
    await adapter.disconnect();

    await expect(connecting).rejects.toThrow('Request aborted');
    expect(healthSignal?.aborted).toBe(true);
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getStatistics().errorCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows an immediate fresh connect while a cancelled attempt is still settling', async () => {
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => {
      const signal = options.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });

    const cancelled = adapter.connect();
    const cancelledRejection = expect(cancelled).rejects.toThrow('Request aborted');
    const disconnecting = adapter.disconnect();
    queueSuccessfulConnect();
    const replacement = adapter.connect();

    await disconnecting;
    await cancelledRejection;
    await expect(replacement).resolves.toBeUndefined();
    expect(adapter.isConnected()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('ignores a cancelled transport failure that arrives after a replacement connects', async () => {
    const lateHealth = deferred<Response>();
    fetchMock.mockReturnValueOnce(lateHealth.promise);
    const staleConnection = adapter.connect();
    const staleRejection = expect(staleConnection).rejects.toThrow('Request aborted');

    void adapter.disconnect();
    queueSuccessfulConnect();
    await adapter.connect();
    lateHealth.reject(new Error('late network failure'));
    await staleRejection;

    expect(adapter.getConnectionStatus()).toMatchObject({
      connected: true,
      reconnectAttempts: 0,
      error: undefined,
    });
    expect(adapter.getStatistics().errorCount).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('times out a stalled request exactly once and releases its timeout', async () => {
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => {
      const signal = options.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });

    const connecting = adapter.connect();
    const rejection = expect(connecting).rejects.toThrow('Request timeout after 10000ms');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(adapter.isConnected()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the request timeout active while a response body is being decoded', async () => {
    adapter = new RESTAdapter(TAGS, config({ pollInterval: 60_000 }));
    queueSuccessfulConnect();
    await adapter.connect();
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => {
      const signal = options.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          }),
      } as Response);
    });
    const rejected = vi.fn();

    void adapter.readTag('TEST.TEMP.PV').catch(rejected);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(rejected).toHaveBeenCalledOnce();
    expect(rejected.mock.calls[0][0]).toMatchObject({
      message: 'Request timeout after 10000ms',
    });
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('rejects an invalid initial snapshot atomically and leaves no background work', async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ tags: [null] }));

    await expect(adapter.connect()).rejects.toThrow('Malformed batch response');

    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getStatistics().errorCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['non-finite value', { ...VALUES[0], value: Number.POSITIVE_INFINITY }],
    ['non-finite timestamp', { ...VALUES[0], timestamp: Number.NaN }],
    ['non-finite source timestamp', { ...VALUES[0], sourceTimestamp: Number.NEGATIVE_INFINITY }],
    ['wrong tag identity', { ...VALUES[0], tagId: 'OTHER.TAG' }],
  ])('rejects a %s in a single-tag response', async (_label, malformed) => {
    queueSuccessfulConnect();
    await adapter.connect();
    fetchMock.mockResolvedValueOnce(response(malformed));

    await expect(adapter.readTag('TEST.TEMP.PV')).rejects.toThrow('Malformed tag response');
    expect(adapter.getStatistics().errorCount).toBe(1);
  });

  it('rejects a partially malformed batch instead of committing a partial snapshot', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    fetchMock.mockResolvedValueOnce(
      response({ tags: [VALUES[0], { ...VALUES[1], timestamp: Number.NaN }], serverTime: 2_000 })
    );

    await expect(adapter.readAllTags()).rejects.toThrow('Malformed batch response');
    expect(adapter.getStatistics().errorCount).toBe(1);
  });

  it('keeps concurrent out-of-order reads bound to their requested tags', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const temperature = deferred<Response>();
    const speed = deferred<Response>();
    fetchMock.mockReturnValueOnce(temperature.promise).mockReturnValueOnce(speed.promise);

    const temperatureRead = adapter.readTag('TEST.TEMP.PV');
    const speedRead = adapter.readTag('TEST.SPEED.SP');
    speed.resolve(response({ ...VALUES[1], value: 1_500, timestamp: 2_000 }));
    temperature.resolve(response({ ...VALUES[0], value: 43, timestamp: 2_000 }));

    await expect(Promise.all([temperatureRead, speedRead])).resolves.toEqual([
      { ...VALUES[0], value: 43, timestamp: 2_000 },
      { ...VALUES[1], value: 1_500, timestamp: 2_000 },
    ]);
    expect(adapter.getStatistics().errorCount).toBe(0);
  });

  it('keeps a newer same-tag response cached when an older request finishes last', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    fetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const olderRead = adapter.readTag('TEST.TEMP.PV');
    const newerRead = adapter.readTag('TEST.TEMP.PV');
    newer.resolve(response({ ...VALUES[0], value: 55, timestamp: 3_000 }));
    await newerRead;
    older.resolve(response({ ...VALUES[0], value: 25, timestamp: 2_000 }));
    await olderRead;

    const internal = adapter as unknown as { values: Map<string, TagValue> };
    expect(internal.values.get('TEST.TEMP.PV')).toMatchObject({ value: 55, timestamp: 3_000 });
  });

  it('does not notify a stale polling result after a newer read has committed', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const observer = vi.fn();
    adapter.subscribe(['TEST.TEMP.PV'], observer);
    const stalePoll = deferred<Response>();
    fetchMock.mockReturnValueOnce(stalePoll.promise);
    await vi.advanceTimersByTimeAsync(1_000);

    fetchMock.mockResolvedValueOnce(
      response({ ...VALUES[0], value: 55, timestamp: 3_000, sourceTimestamp: 3_000 })
    );
    await adapter.readTag('TEST.TEMP.PV');
    stalePoll.resolve(
      response({
        tags: [
          { ...VALUES[0], value: 25, timestamp: 3_000, sourceTimestamp: 3_000 },
          { ...VALUES[1], timestamp: 2_000 },
        ],
        serverTime: 2_000,
      })
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(observer).not.toHaveBeenCalled();
    const internal = adapter as unknown as { values: Map<string, TagValue> };
    expect(internal.values.get('TEST.TEMP.PV')).toMatchObject({ value: 55, timestamp: 3_000 });
  });

  it('rejects unknown and oversized tag requests without network access or allocation', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const callsBefore = fetchMock.mock.calls.length;

    await expect(adapter.readTag('ATTACKER.UNKNOWN')).rejects.toThrow('Unknown tag');
    await expect(adapter.readTags(['TEST.TEMP.PV', 'ATTACKER.UNKNOWN'])).rejects.toThrow(
      'Unknown tag'
    );
    await expect(adapter.readTags(Array(1_001).fill('TEST.TEMP.PV'))).rejects.toThrow(
      'Batch tag limit exceeded'
    );

    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
    const internal = adapter as unknown as { values: Map<string, TagValue> };
    expect(internal.values.has('ATTACKER.UNKNOWN')).toBe(false);
  });

  it('counts each failed operation even when a transport reuses one error object', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const sharedFailure = new Error('connection refused');
    fetchMock.mockRejectedValueOnce(sharedFailure).mockRejectedValueOnce(sharedFailure);

    await expect(adapter.readTag('TEST.TEMP.PV')).rejects.toBe(sharedFailure);
    await expect(adapter.readTag('TEST.TEMP.PV')).rejects.toBe(sharedFailure);

    expect(adapter.getStatistics().errorCount).toBe(2);
  });

  it('treats an empty batch read as a bounded no-op', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const callsBefore = fetchMock.mock.calls.length;

    await expect(adapter.readTags([])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
  });

  it('rejects unknown subscriptions atomically, deduplicates IDs, and removes empty sets', () => {
    const callback = vi.fn();
    const internal = adapter as unknown as {
      subscribers: Map<string, Set<(values: TagValue[]) => void>>;
    };

    expect(() =>
      adapter.subscribe(['TEST.TEMP.PV', 'TEST.TEMP.PV', 'ATTACKER.UNKNOWN'], callback)
    ).toThrow('Unknown tag: ATTACKER.UNKNOWN');
    expect(internal.subscribers.size).toBe(0);

    const unsubscribe = adapter.subscribe(['TEST.TEMP.PV', 'TEST.TEMP.PV'], callback);
    expect(internal.subscribers.get('TEST.TEMP.PV')).toEqual(new Set([callback]));
    unsubscribe();
    expect(internal.subscribers.size).toBe(0);
  });

  it('rejects type-incompatible writes locally and counts a transport failure once', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const callsBefore = fetchMock.mock.calls.length;

    await expect(adapter.writeTag('TEST.SPEED.SP', Number.NaN)).resolves.toBe(false);
    await expect(adapter.writeTag('TEST.SPEED.SP', Number.POSITIVE_INFINITY)).resolves.toBe(false);
    await expect(adapter.writeTag('TEST.SPEED.SP', 'fast')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);

    fetchMock.mockResolvedValueOnce(response(undefined, 503));
    await expect(adapter.writeTag('TEST.SPEED.SP', 1_500)).resolves.toBe(false);
    expect(adapter.getStatistics()).toMatchObject({ errorCount: 1, writesPerSecond: 0 });
  });

  it('never sends a control write after an explicit disconnect', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    await adapter.disconnect();
    const callsBefore = fetchMock.mock.calls.length;

    await expect(adapter.writeTag('TEST.SPEED.SP', 1_500)).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
    expect(adapter.getStatistics().errorCount).toBe(0);
  });

  it('serializes slow polling so interval backlog cannot create concurrent requests', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const slowPoll = deferred<Response>();
    fetchMock.mockReturnValueOnce(slowPoll.promise);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    slowPoll.resolve(response({ tags: VALUES, serverTime: 5_000 }));
    await Promise.resolve();
  });

  it('aborts a pending poll on disconnect and does not schedule recovery afterward', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    let pollSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, options: RequestInit) => {
      pollSignal = options.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        pollSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      });
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await adapter.disconnect();
    await Promise.resolve();

    expect(pollSignal?.aborted).toBe(true);
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getStatistics().errorCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not charge a replacement connection for a stale poll failure', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const stalePoll = deferred<Response>();
    fetchMock.mockReturnValueOnce(stalePoll.promise);
    await vi.advanceTimersByTimeAsync(1_000);

    void adapter.disconnect();
    queueSuccessfulConnect();
    await adapter.connect();
    stalePoll.reject(new Error('late poll failure'));
    await vi.advanceTimersByTimeAsync(0);

    expect(adapter.getConnectionStatus()).toMatchObject({ connected: true, error: undefined });
    expect(adapter.getStatistics().errorCount).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('retries failed recovery, resets stale cache authority, and restores one polling timer', async () => {
    queueSuccessfulConnect();
    await adapter.connect();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(adapter.getConnectionStatus()).toMatchObject({ connected: false, reconnectAttempts: 1 });
    expect(vi.getTimerCount()).toBe(1);

    fetchMock.mockRejectedValueOnce(new Error('still offline'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(adapter.getConnectionStatus()).toMatchObject({ connected: false, reconnectAttempts: 2 });
    expect(vi.getTimerCount()).toBe(1);

    const recoveredValues = VALUES.map((value, index) => ({
      ...value,
      value: index === 0 ? 21 : 900,
      timestamp: 500,
      sourceTimestamp: 500,
    }));
    fetchMock
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ tags: recoveredValues, serverTime: 8_000 }));
    await vi.advanceTimersByTimeAsync(4_000);

    expect(adapter.getConnectionStatus()).toMatchObject({ connected: true, reconnectAttempts: 0 });
    expect(vi.getTimerCount()).toBe(1);
    const internal = adapter as unknown as { values: Map<string, TagValue> };
    expect([...internal.values.values()]).toEqual(recoveredValues);
  });

  it('publishes the last polled values as STALE when polling loses the server', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const observer = vi.fn();
    adapter.subscribe([], observer);

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(adapter.getConnectionStatus()).toMatchObject({ connected: false });
    expect(observer).toHaveBeenLastCalledWith([
      expect.objectContaining({ tagId: 'TEST.TEMP.PV', value: 42, quality: 'STALE' }),
      expect.objectContaining({ tagId: 'TEST.SPEED.SP', value: 1_200, quality: 'STALE' }),
    ]);
  });

  it('isolates subscriber snapshots so one callback cannot corrupt another', async () => {
    queueSuccessfulConnect();
    await adapter.connect();
    const observed: TagValue[][] = [];
    adapter.subscribe([], (values) => {
      values[0].value = 999;
      values.pop();
    });
    adapter.subscribe([], (values) => observed.push(values));
    fetchMock.mockResolvedValueOnce(response({ tags: VALUES, serverTime: 2_000 }));

    await vi.advanceTimersByTimeAsync(1_000);

    expect(observed).toEqual([VALUES]);
    expect(observed[0]).not.toBe(VALUES);
  });

  it('uses a safe polling default for non-finite intervals instead of spinning', async () => {
    adapter = new RESTAdapter(TAGS, config({ pollInterval: Number.NaN }));
    queueSuccessfulConnect();
    await adapter.connect();

    await vi.advanceTimersByTimeAsync(50);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });
});
