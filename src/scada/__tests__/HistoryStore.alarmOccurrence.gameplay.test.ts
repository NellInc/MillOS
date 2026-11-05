import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCADAService } from '../SCADAService';
import { HistoryStore } from '../HistoryStore';
import type { AlarmManager } from '../AlarmManager';
import type { Alarm, AlarmHistoryRecord } from '../types';

/**
 * An alarm that returns to normal before anyone acknowledges it is written to
 * the historian when it returns (RTN_UNACK), and again when the operator then
 * acknowledges it (archived as NORMAL, stamped cleared at the acknowledgement).
 * The JSON export and the Events tab's 100-row read carried both rows: one
 * excursion recorded twice, the second saying it cleared when it was
 * acknowledged. Working if each occurrence is one history entry, cleared when
 * the reading returned and carrying who acknowledged it.
 */

/** Just enough IndexedDB for the alarm history: adds, and a newest-first cursor. */
function fakeAlarmDb() {
  const rows: (AlarmHistoryRecord & { id: number })[] = [];
  let nextId = 1;
  const transaction = () => {
    const tx = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      abort: vi.fn(),
      objectStore: () => ({
        add: (record: AlarmHistoryRecord) => {
          rows.push({ ...record, id: nextId++ });
          queueMicrotask(() => tx.oncomplete?.());
        },
        index: () => ({
          openCursor: (range: { lower: number; upper: number }) => {
            const ordered = rows
              .filter((row) => row.raisedAt >= range.lower && row.raisedAt <= range.upper)
              .sort((a, b) => b.raisedAt - a.raisedAt || b.id - a.id);
            let position = 0;
            const request = {
              result: null as unknown,
              onsuccess: null as (() => void) | null,
              onerror: null,
            };
            const step = () => {
              const row = ordered[position];
              request.result = row
                ? {
                    value: row,
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
          },
        }),
      }),
    };
    return tx;
  };
  return { db: { transaction } as unknown as IDBDatabase, rows };
}

describe('one alarm occurrence, one history entry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an alarm that returned unacknowledged and was then acknowledged as one entry', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval'] });
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
    const service = new SCADAService();
    const history = new HistoryStore();
    const fake = fakeAlarmDb();
    (history as unknown as { db: IDBDatabase }).db = fake.db;
    (service as unknown as { historyStore: HistoryStore }).historyStore = history;
    const manager = (service as unknown as { alarmManager: AlarmManager }).alarmManager;
    // The subscription start() makes.
    const unsubscribe = manager.subscribe(
      (
        service as unknown as { handleAlarmUpdates: (alarms: Alarm[]) => void }
      ).handleAlarmUpdates.bind(service)
    );
    const flush = () =>
      (history as unknown as { flushBuffers: () => Promise<void> }).flushBuffers();
    vi.advanceTimersByTime(5_001);

    const sample = (value: number) =>
      manager.evaluate({ tagId: 'RM101.TT001.PV', value, quality: 'GOOD', timestamp: Date.now() });
    const startedAt = Date.now();
    sample(70);
    const raised = manager.getActiveAlarms().find((a) => a.tagId === 'RM101.TT001.PV')!;
    vi.advanceTimersByTime(30_000);
    sample(40);
    const returnedAt = Date.now();
    await flush();
    vi.advanceTimersByTime(90_000);
    manager.acknowledge(raised.id, 'Operator', 'Bearing checked');
    await flush();
    unsubscribe();

    const entries = (await history.getAlarmHistory(startedAt - 1, Date.now(), 100)).filter(
      (entry) => entry.alarmId === raised.id
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      state: 'NORMAL',
      acknowledgedBy: 'Operator',
      clearedAt: returnedAt,
    });
  });
});
