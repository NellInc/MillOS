import { describe, expect, it } from 'vitest';
import {
  MAX_TREND_ROWS,
  MAX_TREND_TAGS,
  mergeAndDownsampleTrendHistory,
  TREND_QUALITY_SUFFIX,
} from '../trendProcessing';
import type { TagHistoryPoint } from '../types';

describe('SCADA trend processing', () => {
  it('preserves bad-quality samples as explicit gaps', () => {
    const tagId = 'RM101.TT001.PV';
    const rows = mergeAndDownsampleTrendHistory(
      [tagId],
      [
        [
          { timestamp: 1_100, value: 42, quality: 'GOOD' },
          { timestamp: 2_100, value: 99, quality: 'BAD' },
        ],
      ]
    );

    expect(rows[0][tagId]).toBe(42);
    expect(rows[1][tagId]).toBeUndefined();
    expect(rows[1][`${tagId}${TREND_QUALITY_SUFFIX}`]).toBe('BAD');
  });

  it('holds a deadband-compressed slow tag forward until a bad sample ends the hold', () => {
    const fast = Array.from({ length: 5 }, (_, index) => ({
      timestamp: index * 1_000,
      value: 60 + index,
      quality: 'GOOD' as const,
    }));
    const slow: TagHistoryPoint[] = [
      { timestamp: 0, value: 12, quality: 'GOOD' },
      { timestamp: 3_000, value: 0, quality: 'BAD' },
    ];
    const rows = mergeAndDownsampleTrendHistory(['FAST', 'SLOW'], [fast, slow]);

    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3).map((row) => row.SLOW)).toEqual([12, 12, 12]);
    expect(rows[1][`SLOW${TREND_QUALITY_SUFFIX}`]).toBe('GOOD');
    expect(rows[3].SLOW).toBeUndefined();
    expect(rows[3][`SLOW${TREND_QUALITY_SUFFIX}`]).toBe('BAD');
    expect(rows[4].SLOW).toBeUndefined();
    expect(rows[4][`SLOW${TREND_QUALITY_SUFFIX}`]).toBeUndefined();
  });

  it('bounds long ranges while preserving first and last samples', () => {
    const history = Array.from({ length: 2_000 }, (_, index) => ({
      timestamp: index * 1_000,
      value: index,
      quality: 'GOOD' as const,
    }));
    const rows = mergeAndDownsampleTrendHistory(['tag'], [history], 100);

    expect(rows).toHaveLength(100);
    expect(rows[0].timestamp).toBe(0);
    expect(rows.at(-1)?.timestamp).toBe(1_999_000);
  });

  it('skips malformed legacy points instead of returning non-finite chart rows', () => {
    const corruptHistory = [
      { timestamp: 1_100, value: 42, quality: 'GOOD' },
      { timestamp: Number.NaN, value: 1, quality: 'GOOD' },
      { timestamp: Number.POSITIVE_INFINITY, value: 2, quality: 'GOOD' },
      { timestamp: 2_100, value: Number.NaN, quality: 'GOOD' },
      { timestamp: 3_100, value: Number.NEGATIVE_INFINITY, quality: 'BAD' },
      { timestamp: 4_100, value: 4, quality: 'BROKEN' },
      null,
    ] as unknown as TagHistoryPoint[];

    const rows = mergeAndDownsampleTrendHistory(['tag'], [corruptHistory]);

    expect(rows).toEqual([{ timestamp: 1_000, tag: 42, tag__quality: 'GOOD' }]);
    expect(rows.every((row) => Number.isFinite(row.timestamp))).toBe(true);
  });

  it('ignores reserved and quality-suffix-colliding tag IDs without corrupting rows', () => {
    const tagIds = ['safe', 'timestamp', '__proto__', `safe${TREND_QUALITY_SUFFIX}`];
    const histories = tagIds.map((_, index) => [
      { timestamp: 1_100, value: index + 1, quality: 'GOOD' as const },
    ]);

    const rows = mergeAndDownsampleTrendHistory(tagIds, histories);

    expect(rows).toEqual([{ timestamp: 1_000, safe: 1, safe__quality: 'GOOD' }]);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });

  it('bounds raw tag traversal even when every candidate is invalid', () => {
    let indexedReads = 0;
    const tagIds = new Proxy(
      Array.from({ length: 10_000 }, () => ''),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
          return Reflect.get(target, property, receiver);
        },
      }
    );

    expect(mergeAndDownsampleTrendHistory(tagIds, [])).toEqual([]);
    expect(indexedReads).toBe(MAX_TREND_TAGS);
  });

  it.each([
    { maxRows: 0, expectedTimestamps: [] },
    { maxRows: Number.NaN, expectedTimestamps: [] },
    { maxRows: Number.NEGATIVE_INFINITY, expectedTimestamps: [] },
    { maxRows: 1, expectedTimestamps: [0] },
    { maxRows: 1.9, expectedTimestamps: [0] },
    { maxRows: 2, expectedTimestamps: [0, 3_000] },
  ])('honours the exact $maxRows row boundary', ({ maxRows, expectedTimestamps }) => {
    const history = Array.from({ length: 4 }, (_, index) => ({
      timestamp: index * 1_000,
      value: index,
      quality: 'GOOD' as const,
    }));

    const rows = mergeAndDownsampleTrendHistory(['tag'], [history], maxRows);

    expect(rows.map((row) => row.timestamp)).toEqual(expectedTimestamps);
  });

  it.each([Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    'caps an excessive maxRows value of %s at the application row ceiling',
    (maxRows) => {
      const history = Array.from({ length: MAX_TREND_ROWS + 100 }, (_, index) => ({
        timestamp: index * 1_000,
        value: index,
        quality: 'GOOD' as const,
      }));

      const rows = mergeAndDownsampleTrendHistory(['tag'], [history], maxRows);

      expect(rows).toHaveLength(MAX_TREND_ROWS);
      expect(rows[0].timestamp).toBe(0);
      expect(rows.at(-1)?.timestamp).toBe((history.length - 1) * 1_000);
    }
  );
});
