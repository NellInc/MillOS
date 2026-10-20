import { describe, expect, it } from 'vitest';
import { nameboardFrameBars } from './VillageSignage';

describe('village nameboard frame', () => {
  it('keeps the gold side bars from sharing the timber board top and bottom faces', () => {
    // Full-height side bars ended exactly on the board's top and bottom faces,
    // gold against brown at 0 mm on every shopfront and civic sign (village
    // static merges 0:0/0:3 and 0:8/0:12).
    for (const [width, height] of [
      [5.24, 0.72],
      [1.78, 0.91],
    ]) {
      const frame = nameboardFrameBars(width, height);
      const boardTop = frame.board[1] / 2;
      const barTop = frame.vertical.args[1] / 2;
      expect(boardTop - barTop).toBeGreaterThanOrEqual(0.004);
      // Still reaching past the horizontal bars, so the corners stay closed.
      const horizontalTop = frame.horizontal.y + frame.horizontal.args[1] / 2;
      expect(barTop).toBeGreaterThanOrEqual(horizontalTop);
    }
  });
});
