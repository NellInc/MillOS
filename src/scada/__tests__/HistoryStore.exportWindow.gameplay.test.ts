import { describe, expect, it, vi } from 'vitest';
import { HistoryStore } from '../HistoryStore';

/**
 * A trend export of a 24 h window read through the query cap (maxQueryPoints,
 * 10,000 per tag): a 1 Hz tag kept its newest ~2.8 h and the file said nothing
 * about the other ~21 h. Working if CSV and JSON exports carry every sample in
 * the requested window, while an on-screen trend query stays capped.
 */
interface Row {
  tagId: string;
  timestamp: number;
  value: number;
  quality: 'GOOD';
}

const sampleRows = (timestamps: number[]): Row[] =>
  timestamps.map((timestamp, index) => ({
    tagId: 'RM101.FT001.PV',
    timestamp,
    value: index + 1,
    quality: 'GOOD',
  }));

const rows: Row[] = sampleRows(Array.from({ length: 12 }, (_, index) => index + 1));

type Bound = {
  lower: [string, number];
  upper: [string, number];
  lowerOpen?: boolean;
  upperOpen?: boolean;
};

const storeWithRows = (source: Row[] = rows) => {
  const settle = <T extends { onsuccess: (() => void) | null }>(request: T): T => {
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  const inRange = (range: Bound) =>
    source.filter(
      (row) =>
        row.tagId === range.lower[0] &&
        (range.lowerOpen ? row.timestamp > range.lower[1] : row.timestamp >= range.lower[1]) &&
        (range.upperOpen ? row.timestamp < range.upper[1] : row.timestamp <= range.upper[1])
    );
  const index = {
    getAll: vi.fn((range: Bound, count?: number) =>
      settle({
        result: count === undefined ? inRange(range) : inRange(range).slice(0, count),
        onsuccess: null as (() => void) | null,
        onerror: null,
      })
    ),
  };
  const store = new HistoryStore({ maxQueryPoints: 4 });
  (store as unknown as { db: IDBDatabase }).db = {
    transaction: () => ({ objectStore: () => ({ index: () => index }), abort: vi.fn() }),
  } as unknown as IDBDatabase;
  return { store, index };
};

describe('HistoryStore export window', () => {
  it('exports every CSV row in the requested window, past the query cap', async () => {
    const csv = await storeWithRows().store.exportToCSV(['RM101.FT001.PV'], 0, 100);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('timestamp,tagId,value,quality');
    expect(lines.slice(1).map((line) => Number(line.split(',')[0]))).toEqual(
      rows.map((row) => row.timestamp)
    );
  });

  it('exports every JSON sample in the requested window, past the query cap', async () => {
    const json = await storeWithRows().store.exportToJSON(['RM101.FT001.PV'], 0, 100);
    expect(json.tags['RM101.FT001.PV'].map((point) => point.timestamp)).toEqual(
      rows.map((row) => row.timestamp)
    );
  });

  it('keeps the on-screen trend query capped', async () => {
    const history = await storeWithRows().store.getHistory('RM101.FT001.PV', 0, 100);
    expect(history).toHaveLength(4);
  });

  it('reads an export in pages no larger than the query cap', async () => {
    // One unbounded read of a 24 h, 1 Hz window can outlast the IndexedDB
    // timeout, and a timed-out tag exports as no rows at all.
    const { store, index } = storeWithRows();
    const json = await store.exportToJSON(['RM101.FT001.PV'], 0, 100);
    expect(json.tags['RM101.FT001.PV']).toHaveLength(rows.length);
    expect(index.getAll.mock.calls.length).toBeGreaterThan(1);
    for (const [, count] of index.getAll.mock.calls) expect(count).toBe(4);
  });

  it('keeps every sample that shares a timestamp across a page boundary', async () => {
    const tied = sampleRows([1, 2, 3, 4, 4, 4, 5, 6, 7]);
    const csv = await storeWithRows(tied).store.exportToCSV(['RM101.FT001.PV'], 0, 100);
    expect(
      csv
        .split('\n')
        .slice(1)
        .map((line) => Number(line.split(',')[2]))
    ).toEqual(tied.map((row) => row.value));
  });
});

/**
 * The JSON export asked for the newest 1,000 alarms of the window and said
 * nothing about the rest. Working if every alarm in the window is exported.
 */
describe('HistoryStore JSON export alarms', () => {
  it('exports every alarm in the requested window, newest first', async () => {
    const alarms = Array.from({ length: 6 }, (_, index) => ({
      id: `alarm-${index + 1}`,
      timestamp: index + 1,
    }));
    const index = {
      openCursor: vi.fn((range: { lower: number; upper: number }, direction: string) => {
        const matching = alarms
          .filter((alarm) => alarm.timestamp >= range.lower && alarm.timestamp <= range.upper)
          .sort((a, b) => (direction === 'prev' ? b.timestamp - a.timestamp : 0));
        let position = 0;
        const request = {
          result: null as { value: unknown; continue: () => void } | null,
          onsuccess: null as (() => void) | null,
          onerror: null,
        };
        const step = () => {
          const alarm = matching[position];
          request.result = alarm
            ? {
                value: alarm,
                continue: () => {
                  position += 1;
                  queueMicrotask(step);
                },
              }
            : null;
          request.onsuccess?.();
        };
        queueMicrotask(step);
        return request;
      }),
    };
    const store = new HistoryStore({ maxQueryPoints: 4 });
    vi.spyOn(store, 'getMultipleTagHistory').mockResolvedValue({});
    (store as unknown as { db: IDBDatabase }).db = {
      transaction: () => ({ objectStore: () => ({ index: () => index }), abort: vi.fn() }),
    } as unknown as IDBDatabase;

    const json = await store.exportToJSON([], 0, 100, true);
    expect(json.alarms?.map((alarm) => alarm.id)).toEqual(
      [...alarms].reverse().map((alarm) => alarm.id)
    );
    // An on-screen alarm query stays capped.
    await expect(store.getAlarmHistory(0, 100, 1000)).resolves.toHaveLength(4);
  });
});
