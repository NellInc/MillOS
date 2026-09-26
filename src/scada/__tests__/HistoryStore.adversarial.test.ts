import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryStore } from '../HistoryStore';
import type { Alarm, AlarmHistoryRecord, TagHistoryRecord, TagValue } from '../types';

interface BufferedTagRecord extends TagHistoryRecord {
  _bufferId: number;
}

interface BufferedAlarmRecord extends AlarmHistoryRecord {
  _bufferId: number;
}

interface InspectableHistoryStore {
  db: IDBDatabase | null;
  config: {
    retentionMs: number;
    batchIntervalMs: number;
    maxQueryPoints: number;
    maxBufferSize: number;
    changeDeadband: number;
    maxSampleIntervalMs: number;
  };
  writeBuffer: BufferedTagRecord[];
  alarmBuffer: BufferedAlarmRecord[];
  flushBuffers(): Promise<void>;
  cleanup(): Promise<void>;
}

interface ControlledTransaction {
  objectStore: () => { add: ReturnType<typeof vi.fn> };
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort?: (() => void) | null;
  error: DOMException | null;
  abort: ReturnType<typeof vi.fn>;
}

interface ControlledOpenRequest {
  result: IDBDatabase;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: ((event: { target: ControlledOpenRequest }) => void) | null;
}

const setupIndexedDB = globalThis.indexedDB;

const inspect = (store: HistoryStore): InspectableHistoryStore =>
  store as unknown as InspectableHistoryStore;

const tagValue = (tagId: string, value: number, timestamp = value): TagValue => ({
  tagId,
  value,
  quality: 'GOOD',
  timestamp,
});

const alarm = (id: string, timestamp = 1): Alarm => ({
  id,
  tagId: `TAG.${id}`,
  tagName: id,
  type: 'HI',
  state: 'UNACK',
  priority: 'HIGH',
  value: 90,
  threshold: 80,
  timestamp,
});

const createControlledWriteDatabase = () => {
  const transactions: ControlledTransaction[] = [];
  const close = vi.fn();
  const transaction = vi.fn(() => {
    const controlled: ControlledTransaction = {
      objectStore: () => ({ add: vi.fn() }),
      oncomplete: null,
      onerror: null,
      error: null,
      abort: vi.fn(),
    };
    transactions.push(controlled);
    return controlled;
  });

  return {
    database: { transaction, close } as unknown as IDBDatabase,
    transactions,
    transaction,
    close,
  };
};

interface LifecycleTransaction {
  storeName: string;
  mode: IDBTransactionMode;
  transaction: IDBTransaction;
  add: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

const createLifecycleDatabase = () => {
  const transactions: LifecycleTransaction[] = [];
  const close = vi.fn();
  const transaction = vi.fn((storeName: string, mode: IDBTransactionMode) => {
    const add = vi.fn();
    const clear = vi.fn();
    const cursorRequest = {
      result: null,
      error: null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    const controlled = {
      objectStore: () => ({
        add,
        clear,
        index: () => ({ openCursor: () => cursorRequest }),
      }),
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      error: null,
      abort: vi.fn(),
    } as unknown as IDBTransaction;
    transactions.push({ storeName, mode, transaction: controlled, add, clear });
    return controlled;
  });

  return {
    database: { transaction, close } as unknown as IDBDatabase,
    transactions,
    close,
  };
};

const createOpenHarness = () => {
  const close = vi.fn();
  const database = {
    objectStoreNames: { contains: vi.fn(() => true) },
    transaction: vi.fn(() => {
      throw new Error('no cleanup transaction configured');
    }),
    close,
  } as unknown as IDBDatabase;
  const request: ControlledOpenRequest = {
    result: database,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  const open = vi.fn(() => request as unknown as IDBOpenDBRequest);
  globalThis.indexedDB = { open } as unknown as IDBFactory;
  return { database, request, open, close };
};

interface StalledTransaction {
  storeName: string;
  mode: IDBTransactionMode;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  error: DOMException | null;
  abort: ReturnType<typeof vi.fn>;
}

const createStalledDatabase = () => {
  const transactions: StalledTransaction[] = [];
  const close = vi.fn();
  const transaction = vi.fn((storeName: string, mode: IDBTransactionMode) => {
    const request = {
      result: null,
      error: null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    const store = {
      add: vi.fn(() => request),
      clear: vi.fn(() => request),
      count: vi.fn(() => request),
      index: vi.fn(() => ({
        getAll: vi.fn(() => request),
        openCursor: vi.fn(() => request),
      })),
    };
    const controlled: StalledTransaction = {
      storeName,
      mode,
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
      abort: vi.fn(() => controlled.onabort?.()),
    };
    transactions.push(controlled);
    return { ...controlled, objectStore: () => store };
  });

  return {
    database: { transaction, close } as unknown as IDBDatabase,
    transactions,
    transaction,
    close,
  };
};

afterEach(() => {
  globalThis.indexedDB = setupIndexedDB;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HistoryStore adversarial boundaries', () => {
  it('normalizes malformed or impractical configuration before it reaches runtime resources', () => {
    const store = new HistoryStore({
      retentionMs: Number.NEGATIVE_INFINITY,
      batchIntervalMs: 0,
      maxQueryPoints: Number.POSITIVE_INFINITY,
      maxBufferSize: Number.NaN,
      changeDeadband: -1,
      maxSampleIntervalMs: -5,
    });

    expect(inspect(store).config).toEqual({
      retentionMs: 24 * 60 * 60 * 1000,
      batchIntervalMs: 1000,
      maxQueryPoints: 10000,
      maxBufferSize: 2000,
      changeDeadband: 0.5,
      maxSampleIntervalMs: 60_000,
    });

    const boundaryStore = new HistoryStore({
      maxQueryPoints: 100_000,
      maxBufferSize: 100_000,
    });
    expect(inspect(boundaryStore).config).toMatchObject({
      maxQueryPoints: 100_000,
      maxBufferSize: 100_000,
    });

    const excessiveStore = new HistoryStore({
      maxQueryPoints: 100_001,
      maxBufferSize: 100_001,
    });
    expect(inspect(excessiveStore).config).toMatchObject({
      maxQueryPoints: 10_000,
      maxBufferSize: 2_000,
    });
  });

  it('coalesces concurrent initialization into one database and one timer pair', async () => {
    vi.useFakeTimers();
    const harness = createOpenHarness();
    const store = new HistoryStore();

    const first = store.init();
    const second = store.init();
    expect(harness.open).toHaveBeenCalledOnce();

    harness.request.onsuccess?.();
    await Promise.all([first, second]);
    expect(vi.getTimerCount()).toBe(2);

    await store.close(false);
    expect(harness.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out stalled initialization and closes a database that opens after the deadline', async () => {
    vi.useFakeTimers();
    const harness = createOpenHarness();
    const store = new HistoryStore();
    let settled = false;
    const initializing = store.init().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await initializing;

    harness.request.onsuccess?.();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prevents a pending initialization from resurrecting state after close', async () => {
    vi.useFakeTimers();
    const harness = createOpenHarness();
    const store = new HistoryStore();
    const initializing = store.init();

    await store.close(false);
    harness.request.onsuccess?.();
    await initializing;

    expect(harness.close).toHaveBeenCalledOnce();
    expect(inspect(store).db).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can re-enable history after a disabled lifecycle is closed', async () => {
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    const store = new HistoryStore();
    await store.init();
    await store.close(false);

    const harness = createOpenHarness();
    const initializing = store.init();
    harness.request.onsuccess?.();
    await initializing;

    expect(inspect(store).db).toBe(harness.database);
    await store.close(false);
  });

  it('keeps both pending queues bounded before storage is available', () => {
    const store = new HistoryStore({ maxBufferSize: 2, changeDeadband: 0 });

    for (let index = 0; index < 5; index++) {
      store.writeTagValue(tagValue(`TAG.${index}`, index));
      store.writeAlarm(alarm(`ALARM.${index}`, index));
    }

    expect(inspect(store).writeBuffer.map((record) => record.tagId)).toEqual(['TAG.3', 'TAG.4']);
    expect(inspect(store).alarmBuffer.map((record) => record.alarmId)).toEqual([
      'ALARM.3',
      'ALARM.4',
    ]);

    const reentryStore = new HistoryStore({ maxBufferSize: 2 });
    reentryStore.writeTagValue(tagValue('EVICTED', 1, 1));
    reentryStore.writeTagValue(tagValue('RETAINED.1', 2, 2));
    reentryStore.writeTagValue(tagValue('RETAINED.2', 3, 3));
    reentryStore.writeTagValue(tagValue('EVICTED', 1, 4));
    expect(inspect(reentryStore).writeBuffer.map((record) => record.tagId)).toEqual([
      'RETAINED.2',
      'EVICTED',
    ]);
  });

  it('normalizes boolean samples and rejects values that would poison numeric history', () => {
    const store = new HistoryStore({ changeDeadband: 0 });

    store.writeTagValues([
      tagValue('VALID', 4, 10),
      tagValue('NAN_VALUE', Number.NaN, 11),
      tagValue('INFINITE_VALUE', Number.POSITIVE_INFINITY, 12),
      tagValue('NAN_TIME', 5, Number.NaN),
      { ...tagValue('STRING_VALUE', 6, 13), value: '6' },
      { ...tagValue('', 7, 14) },
      { ...tagValue('BAD_QUALITY', 7, 14), quality: 'UNKNOWN' as TagValue['quality'] },
      { ...tagValue('BOOLEAN_VALUE', 7, 14), value: true },
    ]);

    expect(inspect(store).writeBuffer).toMatchObject([
      { tagId: 'VALID', timestamp: 10, value: 4, quality: 'GOOD' },
      { tagId: 'BOOLEAN_VALUE', timestamp: 14, value: 1, quality: 'GOOD' },
    ]);
  });

  it('retains quality transitions even when the numeric change is inside the deadband', () => {
    const store = new HistoryStore({ changeDeadband: 1 });

    store.writeTagValues([
      tagValue('TAG', 10, 1),
      tagValue('TAG', 10.5, 2),
      { ...tagValue('TAG', 10.5, 3), quality: 'BAD' },
      { ...tagValue('TAG', 10.75, 4), quality: 'BAD' },
      { ...tagValue('TAG', 10.75, 5), quality: 'GOOD' },
    ]);

    expect(inspect(store).writeBuffer).toMatchObject([
      { timestamp: 1, value: 10, quality: 'GOOD' },
      { timestamp: 3, value: 10.5, quality: 'BAD' },
      { timestamp: 5, value: 10.75, quality: 'GOOD' },
    ]);
  });

  it('rewrites a steady value once the heartbeat interval elapses', () => {
    const store = new HistoryStore({ changeDeadband: 1, maxSampleIntervalMs: 60_000 });

    store.writeTagValues([
      tagValue('TAG', 10, 0),
      tagValue('TAG', 10, 30_000),
      tagValue('TAG', 10, 59_999),
      tagValue('TAG', 10, 60_000),
      tagValue('TAG', 10, 90_000),
    ]);

    expect(inspect(store).writeBuffer).toMatchObject([
      { timestamp: 0, value: 10 },
      { timestamp: 60_000, value: 10 },
    ]);
  });

  it('applies a per-tag change deadband before the global default', () => {
    const store = new HistoryStore({
      changeDeadband: 0.5,
      changeDeadbandFor: (tagId) => (tagId === 'FINE' ? 0.05 : undefined),
    });

    store.writeTagValues([
      tagValue('FINE', 25, 1),
      tagValue('FINE', 25.1, 2),
      tagValue('COARSE', 25, 3),
      tagValue('COARSE', 25.1, 4),
    ]);

    expect(inspect(store).writeBuffer.map(({ tagId, value }) => [tagId, value])).toEqual([
      ['FINE', 25],
      ['FINE', 25.1],
      ['COARSE', 25],
    ]);
  });

  it('keeps the newest samples when a window holds more than the query cap', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      tagId: 'TAG',
      timestamp: index,
      value: index,
      quality: 'GOOD',
    }));
    const settle = <T extends { onsuccess: (() => void) | null }>(request: T): T => {
      queueMicrotask(() => request.onsuccess?.());
      return request;
    };
    const index = {
      openKeyCursor: vi.fn(() => {
        let position = rows.length - 1;
        const request: { result: unknown; onsuccess: (() => void) | null; onerror: null } = {
          result: null,
          onsuccess: null,
          onerror: null,
        };
        const cursorAt = (
          at: number
        ): { key: [string, number]; advance: (count: number) => void } | null =>
          at >= 0
            ? {
                key: ['TAG', rows[at].timestamp],
                advance: (count: number) => {
                  position -= count;
                  request.result = cursorAt(position);
                  settle(request);
                },
              }
            : null;
        request.result = cursorAt(position);
        return settle(request);
      }),
      getAll: vi.fn((range: { lower: [string, number] }, limit: number) =>
        settle({
          result: rows.filter((row) => row.timestamp >= range.lower[1]).slice(0, limit),
          onsuccess: null as (() => void) | null,
          onerror: null,
        })
      ),
    };
    const store = new HistoryStore({ maxQueryPoints: 4 });
    inspect(store).db = {
      transaction: () => ({ objectStore: () => ({ index: () => index }) }),
    } as unknown as IDBDatabase;

    const history = await store.getHistory('TAG', 0, 100);
    expect(history.map((point) => point.timestamp)).toEqual([6, 7, 8, 9]);
  });

  it('rejects malformed alarms before they can corrupt IndexedDB ordering', () => {
    const store = new HistoryStore();

    store.writeAlarm(alarm('VALID', 10));
    store.writeAlarm({ ...alarm('BAD_VALUE', 11), value: Number.NaN });
    store.writeAlarm({ ...alarm('BAD_TIME', 12), acknowledgedAt: Number.POSITIVE_INFINITY });
    store.writeAlarm({ ...alarm('BAD_STATE', 13), state: 'UNKNOWN' as Alarm['state'] });

    expect(inspect(store).alarmBuffer).toMatchObject([
      { alarmId: 'VALID', tagId: 'TAG.VALID', value: 90, raisedAt: 10 },
    ]);
  });

  it('does not open IndexedDB for malformed or reversed query ranges', async () => {
    const transaction = vi.fn();
    const store = new HistoryStore();
    inspect(store).db = { transaction } as unknown as IDBDatabase;

    await expect(store.getHistory('TAG', Number.NaN, 10)).resolves.toEqual([]);
    await expect(store.getHistory('TAG', 20, 10)).resolves.toEqual([]);
    await expect(store.getAlarmHistory(0, Number.POSITIVE_INFINITY)).resolves.toEqual([]);
    await expect(store.getAlarmHistory(0, 10, 0)).resolves.toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('clears the timeout as soon as a successful query settles', async () => {
    vi.useFakeTimers();
    const request = {
      result: [{ timestamp: 5, value: 7, quality: 'GOOD' }],
      error: null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    };
    const getAll = vi.fn(() => {
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    const store = new HistoryStore();
    inspect(store).db = {
      transaction: () => ({
        objectStore: () => ({ index: () => ({ getAll }) }),
      }),
    } as unknown as IDBDatabase;

    await expect(store.getHistory('TAG', 0, 10)).resolves.toEqual([
      { timestamp: 5, value: 7, quality: 'GOOD' },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an already-running flush before closing its database', async () => {
    const controlled = createControlledWriteDatabase();
    const store = new HistoryStore({ changeDeadband: 0 });
    inspect(store).db = controlled.database;
    store.writeTagValue(tagValue('TAG', 1));

    const flushing = inspect(store).flushBuffers();
    await Promise.resolve();
    expect(controlled.transactions).toHaveLength(1);
    const closing = store.close();
    await Promise.resolve();
    await Promise.resolve();

    let assertionError: unknown;
    try {
      expect(controlled.close).not.toHaveBeenCalled();
    } catch (error) {
      assertionError = error;
    } finally {
      controlled.transactions[0].oncomplete?.();
      await flushing;
      await closing;
    }

    if (assertionError) throw assertionError;
    expect(controlled.close).toHaveBeenCalledOnce();
  });

  it('rejects a stalled close after aborting its flush and retaining pending records', async () => {
    vi.useFakeTimers();
    const controlled = createControlledWriteDatabase();
    const store = new HistoryStore({ changeDeadband: 0 });
    inspect(store).db = controlled.database;
    store.writeTagValue(tagValue('TAG', 1));

    let outcome: 'pending' | 'fulfilled' | 'rejected' = 'pending';
    let closeError: unknown;
    const closing = store.close().then(
      () => {
        outcome = 'fulfilled';
      },
      (error: unknown) => {
        outcome = 'rejected';
        closeError = error;
      }
    );
    await vi.advanceTimersByTimeAsync(10_000);

    let assertionError: unknown;
    try {
      expect(outcome).toBe('rejected');
      expect(closeError).toEqual(
        new Error('HistoryStore closed with records that could not be flushed')
      );
      expect(controlled.transactions[0].abort).toHaveBeenCalledOnce();
      expect(inspect(store).writeBuffer).toHaveLength(1);
    } catch (error) {
      assertionError = error;
    } finally {
      if (outcome === 'pending') controlled.transactions[0].oncomplete?.();
      await closing;
    }

    if (assertionError) throw assertionError;

    const recovery = createControlledWriteDatabase();
    inspect(store).db = recovery.database;
    const retry = inspect(store).flushBuffers();
    await Promise.resolve();
    recovery.transactions[0].oncomplete?.();
    await retry;
    expect(inspect(store).writeBuffer).toHaveLength(0);
  });

  it('completes successful statistics and clear transactions', async () => {
    const store = new HistoryStore();
    await store.init();

    try {
      await expect(store.getStats()).resolves.toEqual({
        tagHistoryCount: 0,
        alarmHistoryCount: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      });
      await expect(store.clearAll()).resolves.toBeUndefined();
    } finally {
      await store.close(false);
    }
  });

  it('serializes clear with maintenance and discards every pre-clear in-memory snapshot', async () => {
    const controlled = createLifecycleDatabase();
    const store = new HistoryStore({ changeDeadband: 1 });
    inspect(store).db = controlled.database;
    store.writeTagValue(tagValue('TAG', 10, 1));

    const flushing = inspect(store).flushBuffers();
    await vi.waitFor(() => expect(controlled.transactions).toHaveLength(1));
    const cleaning = inspect(store).cleanup();
    expect(controlled.transactions).toHaveLength(3);

    const clearing = store.clearAll();
    await Promise.resolve();
    expect(controlled.transactions).toHaveLength(3);

    store.writeTagValue(tagValue('TAG', 20, 2));
    controlled.transactions
      .slice(0, 3)
      .forEach(({ transaction }) => (transaction.oncomplete as (() => void) | null)?.());
    await Promise.all([flushing, cleaning]);
    await vi.waitFor(() => expect(controlled.transactions).toHaveLength(5));

    store.writeTagValue(tagValue('TAG', 20, 3));
    store.writeAlarm(alarm('DURING_CLEAR', 3));
    controlled.transactions
      .slice(3)
      .forEach(({ transaction }) => (transaction.oncomplete as (() => void) | null)?.());
    await clearing;

    expect(controlled.transactions.slice(3).map(({ storeName }) => storeName)).toEqual([
      'tagHistory',
      'alarmHistory',
    ]);
    expect(
      controlled.transactions.slice(3).every(({ clear }) => clear.mock.calls.length === 1)
    ).toBe(true);
    expect(inspect(store).writeBuffer).toEqual([]);
    expect(inspect(store).alarmBuffer).toEqual([]);

    store.writeTagValue(tagValue('TAG', 20, 4));
    expect(inspect(store).writeBuffer).toMatchObject([
      { tagId: 'TAG', value: 20, timestamp: 4, quality: 'GOOD' },
    ]);
  });

  it('coalesces cleanup calls and close waits for their bounded transaction lifetime', async () => {
    vi.useFakeTimers();
    const controlled = createStalledDatabase();
    const store = new HistoryStore();
    inspect(store).db = controlled.database;

    const firstCleanup = inspect(store).cleanup();
    const secondCleanup = inspect(store).cleanup();
    expect(secondCleanup).toBe(firstCleanup);
    expect(controlled.transactions.map(({ storeName }) => storeName)).toEqual([
      'tagHistory',
      'alarmHistory',
    ]);

    let closed = false;
    const closing = store.close(false).then(() => {
      closed = true;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(closed).toBe(false);
    expect(controlled.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([firstCleanup, closing]);
    expect(closed).toBe(true);
    expect(controlled.close).toHaveBeenCalledOnce();
    expect(controlled.transactions.every(({ abort }) => abort.mock.calls.length === 1)).toBe(true);
  });

  it.each([
    ['getHistory', (store: HistoryStore) => store.getHistory('TAG', 0, 1)],
    ['getLatestValue', (store: HistoryStore) => store.getLatestValue('TAG')],
    ['getAlarmHistory', (store: HistoryStore) => store.getAlarmHistory(0, 1)],
    ['getStats', (store: HistoryStore) => store.getStats()],
    ['cleanup', (store: HistoryStore) => inspect(store).cleanup()],
    ['clearAll', (store: HistoryStore) => store.clearAll()],
  ])('bounds and aborts a stalled %s operation', async (_name, invoke) => {
    vi.useFakeTimers();
    const controlled = createStalledDatabase();
    const store = new HistoryStore();
    inspect(store).db = controlled.database;
    let outcome: 'fulfilled' | 'rejected' | null = null;
    void invoke(store).then(
      () => {
        outcome = 'fulfilled';
      },
      () => {
        outcome = 'rejected';
      }
    );

    await vi.advanceTimersByTimeAsync(10_000);

    expect(outcome).not.toBeNull();
    expect(controlled.transactions.length).toBeGreaterThan(0);
    expect(controlled.transactions.every(({ abort }) => abort.mock.calls.length === 1)).toBe(true);
  });

  it('retains a failed flush for a later successful retry', async () => {
    let attempt = 0;
    const transaction = vi.fn(() => {
      const shouldFail = attempt++ === 0;
      const controlled: ControlledTransaction = {
        objectStore: () => ({ add: vi.fn() }),
        oncomplete: null,
        onerror: null,
        error: shouldFail ? new DOMException('write failed') : null,
        abort: vi.fn(),
      };
      queueMicrotask(() => {
        if (shouldFail) controlled.onerror?.();
        else controlled.oncomplete?.();
      });
      return controlled;
    });
    const store = new HistoryStore({ changeDeadband: 0 });
    inspect(store).db = { transaction, close: vi.fn() } as unknown as IDBDatabase;
    store.writeTagValue(tagValue('TAG', 1));

    await inspect(store).flushBuffers();
    expect(inspect(store).writeBuffer).toHaveLength(1);
    await inspect(store).flushBuffers();
    expect(inspect(store).writeBuffer).toHaveLength(0);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('isolates per-tag failures and de-duplicates repeated tag requests', async () => {
    const store = new HistoryStore();
    const getHistory = vi.spyOn(store, 'getHistory').mockImplementation(async (tagId) => {
      if (tagId === 'BROKEN') throw new Error('query failed');
      return [{ timestamp: 1, value: 2, quality: 'GOOD' }];
    });

    await expect(store.getMultipleTagHistory(['GOOD', 'BROKEN', 'GOOD'], 0, 10)).resolves.toEqual({
      GOOD: [{ timestamp: 1, value: 2, quality: 'GOOD' }],
      BROKEN: [],
    });
    expect(getHistory).toHaveBeenCalledTimes(2);
  });

  it('bounds parallel tag queries and safely returns prototype-named tag IDs', async () => {
    const store = new HistoryStore();
    let activeQueries = 0;
    let maximumActiveQueries = 0;
    let releaseQueries!: () => void;
    const queryGate = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    const getHistory = vi.spyOn(store, 'getHistory').mockImplementation(async () => {
      activeQueries++;
      maximumActiveQueries = Math.max(maximumActiveQueries, activeQueries);
      await queryGate;
      activeQueries--;
      return [{ timestamp: 1, value: 2, quality: 'GOOD' }];
    });
    const tagIds = ['__proto__', ...Array.from({ length: 9 }, (_, index) => `TAG.${index}`)];

    const querying = store.getMultipleTagHistory(tagIds, 0, 10);
    await vi.waitFor(() => expect(getHistory).toHaveBeenCalledTimes(8));
    expect(maximumActiveQueries).toBe(8);
    releaseQueries();
    const result = await querying;

    expect(getHistory).toHaveBeenCalledTimes(10);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual([{ timestamp: 1, value: 2, quality: 'GOOD' }]);
  });

  it('accepts 256 unique tag queries and rejects excessive or malformed batches', async () => {
    const store = new HistoryStore();
    const getHistory = vi.spyOn(store, 'getHistory').mockResolvedValue([]);
    const boundaryTagIds = Array.from({ length: 256 }, (_, index) => `TAG.${index}`);

    const boundaryResult = await store.getMultipleTagHistory(boundaryTagIds, 0, 10);
    expect(Object.keys(boundaryResult)).toHaveLength(256);
    expect(getHistory).toHaveBeenCalledTimes(256);

    const excessiveTagIds = [...boundaryTagIds, 'TAG.256'];

    await expect(store.getMultipleTagHistory(excessiveTagIds, 0, 10)).rejects.toThrow(
      'HistoryStore batches are limited to 256 unique tags'
    );
    await expect(store.getMultipleTagHistory([''], 0, 10)).rejects.toThrow(
      'HistoryStore tagIds must be non-empty strings'
    );
    await expect(store.getMultipleTagHistory(null as unknown as string[], 0, 10)).rejects.toThrow(
      'HistoryStore tagIds must be an array'
    );
    expect(getHistory).toHaveBeenCalledTimes(256);
  });

  it('bounds duplicate-heavy batch input before traversing hostile entries', async () => {
    const store = new HistoryStore();
    const getHistory = vi.spyOn(store, 'getHistory').mockResolvedValue([]);

    await expect(
      store.getMultipleTagHistory(
        Array.from({ length: 1_024 }, () => 'DUPLICATE'),
        0,
        10
      )
    ).resolves.toEqual({ DUPLICATE: [] });
    expect(getHistory).toHaveBeenCalledOnce();

    let indexedReads = 0;
    const oversized = new Proxy(
      Array.from({ length: 1_025 }, () => 'DUPLICATE'),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
          return Reflect.get(target, property, receiver);
        },
      }
    );

    await expect(store.getMultipleTagHistory(oversized, 0, 10)).rejects.toThrow(
      'HistoryStore batches are limited to 1024 input entries'
    );
    expect(indexedReads).toBe(0);
    expect(getHistory).toHaveBeenCalledOnce();
  });

  it('captures write inputs as immutable value snapshots', () => {
    const store = new HistoryStore({ changeDeadband: 0 });
    const sample = tagValue('ORIGINAL', 10, 20);
    const alarmSample = alarm('ORIGINAL_ALARM', 30);

    store.writeTagValue(sample);
    store.writeAlarm(alarmSample);
    sample.tagId = 'MUTATED';
    sample.value = 999;
    sample.timestamp = 999;
    alarmSample.id = 'MUTATED_ALARM';
    alarmSample.value = 999;

    expect(inspect(store).writeBuffer[0]).toMatchObject({
      tagId: 'ORIGINAL',
      value: 10,
      timestamp: 20,
    });
    expect(inspect(store).alarmBuffer[0]).toMatchObject({
      alarmId: 'ORIGINAL_ALARM',
      value: 90,
      raisedAt: 30,
    });
  });
});
