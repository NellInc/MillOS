import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { HistoryStore } from '../HistoryStore';
import type { TagValue } from '../types';

const originalIndexedDB = (globalThis as any).indexedDB;

describe('HistoryStore fallback', () => {
  beforeAll(() => {
    (globalThis as any).indexedDB = undefined;
  });

  afterAll(() => {
    (globalThis as any).indexedDB = originalIndexedDB;
  });

  it('initializes without IndexedDB and no-ops safely', async () => {
    const store = new HistoryStore();
    await expect(store.init()).resolves.toBeUndefined();

    const sample: TagValue = {
      tagId: 'TEST.TAG',
      value: 1,
      quality: 'GOOD',
      timestamp: Date.now(),
    };

    store.writeTagValue(sample);
    await expect(store.getHistory('TEST.TAG', 0, Date.now())).resolves.toEqual([]);
    await expect(store.getAlarmHistory(0, Date.now())).resolves.toEqual([]);
  });

  it('exports tag histories through the parallel partial-result query path', async () => {
    const store = new HistoryStore();
    const getHistories = vi.spyOn(store, 'getMultipleTagHistory').mockResolvedValue({
      'TEST.A': [{ timestamp: 100, value: 1, quality: 'GOOD' }],
      'TEST.B': [{ timestamp: 200, value: 2, quality: 'UNCERTAIN' }],
    });

    await expect(store.exportToCSV(['TEST.A', 'TEST.B'], 0, 300)).resolves.toBe(
      ['timestamp,tagId,value,quality', '100,TEST.A,1,GOOD', '200,TEST.B,2,UNCERTAIN'].join('\n')
    );
    // An export reads the whole window, not the on-screen trend cap.
    expect(getHistories).toHaveBeenCalledWith(['TEST.A', 'TEST.B'], 0, 300, {
      wholeWindow: true,
    });
  });
});
