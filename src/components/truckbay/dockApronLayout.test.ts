import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCK_FLOOR_MARKINGS,
  DOCK_GROOVE_STRIPES,
  DOCK_GUIDE_LINES,
  DOCK_KEEP_CLEAR,
  DOCK_LASER_GUIDES,
  DOCK_PAINT_START_U,
  DOCK_SLAB_OUTBOARD_U,
  DOCK_STOP_BAR,
} from './dockApronLayout';

/**
 * Every piece of dock paint used to start at or inside the dock line, under the
 * 2 m platforms and the forklift channel slab that run from u -1.7 to u 4.1.
 * Paint under a solid that writes depth is either hidden or, at distance, wins
 * a bias fight it should never be in and stipples through. Working if no paint
 * begins before the stop bar and the stop bar begins beyond the slab.
 */
describe('dock apron paint layout', () => {
  it('derives the slab edge from the real platform and channel geometry', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    // Both docks: two platform sections and one channel slab, all centred at
    // u 1.2 and 5.8 m long.
    expect(source.match(/<boxGeometry args=\{\[2\.5, 2, 5\.8\]\} \/>/g)).toHaveLength(4);
    expect(source.match(/<boxGeometry args=\{\[4, 0\.02, 5\.8\]\} \/>/g)).toHaveLength(2);
    expect(source.match(/position=\{\[-?3\.25, 1, 1\.2\]\}/g)).toHaveLength(4);
    expect(source.match(/position=\{\[0, 0\.01, 1\.2\]\}/g)).toHaveLength(2);
    expect(DOCK_SLAB_OUTBOARD_U).toBeCloseTo(1.2 + 5.8 / 2, 6);
  });

  it('puts the stop bar wholly beyond the slab and every other mark beyond the bar', () => {
    expect(DOCK_STOP_BAR.u - DOCK_STOP_BAR.depth / 2).toBeGreaterThan(DOCK_SLAB_OUTBOARD_U);
    expect(DOCK_PAINT_START_U).toBeCloseTo(DOCK_STOP_BAR.u + DOCK_STOP_BAR.depth / 2, 6);
    for (const mark of [...DOCK_FLOOR_MARKINGS, DOCK_KEEP_CLEAR]) {
      expect(mark.u0, mark.id).toBeGreaterThanOrEqual(DOCK_PAINT_START_U);
      expect(mark.u1, mark.id).toBeGreaterThan(mark.u0);
    }
    for (const run of [DOCK_GUIDE_LINES, DOCK_GROOVE_STRIPES, DOCK_LASER_GUIDES]) {
      expect(run.u0).toBeGreaterThanOrEqual(DOCK_PAINT_START_U);
      expect(run.u1).toBeGreaterThan(run.u0);
    }
  });

  it('keeps KEEP CLEAR at the outboard end of the dock markings', () => {
    const outboard = Math.max(...DOCK_FLOOR_MARKINGS.map((mark) => mark.u1));
    expect(DOCK_KEEP_CLEAR.u0).toBeGreaterThanOrEqual(outboard);
  });

  it('widens the guide lines past the aliasing width at review distance', () => {
    expect(DOCK_GUIDE_LINES.width).toBeGreaterThanOrEqual(0.25);
  });
});
