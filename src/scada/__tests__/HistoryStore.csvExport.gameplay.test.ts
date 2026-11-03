import { describe, expect, it, vi } from 'vitest';
import { HistoryStore } from '../HistoryStore';

describe('HistoryStore CSV export', () => {
  it('writes each tag once when the caller repeats a tag id', async () => {
    const store = new HistoryStore();
    vi.spyOn(store, 'getMultipleTagHistory').mockResolvedValue({
      'RM101.SPEED': [
        { timestamp: 1, value: 10, quality: 'GOOD' },
        { timestamp: 2, value: 11, quality: 'GOOD' },
      ],
    });
    const csv = await store.exportToCSV(['RM101.SPEED', 'RM101.SPEED'], 0, 10);
    expect(csv.split('\n')).toEqual([
      'timestamp,tagId,value,quality',
      '1,RM101.SPEED,10,GOOD',
      '2,RM101.SPEED,11,GOOD',
    ]);
  });
});
