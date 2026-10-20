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
  DOCK_BUMPER_BLOCK,
  DOCK_PLATFORM_SECTION,
  DOCK_WEAR_BUMPER,
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
    expect(source.match(/<DockPlatformSection side=\{-?1\}( castShadow)? \/>/g)).toHaveLength(4);
    expect(source.match(/<boxGeometry args=\{\[4, 0\.02, 5\.8\]\} \/>/g)).toHaveLength(2);
    expect(source.match(/position=\{\[0, 0\.01, 1\.2\]\}/g)).toHaveLength(2);
    expect(DOCK_PLATFORM_SECTION.u + DOCK_PLATFORM_SECTION.depth / 2).toBeCloseTo(
      DOCK_SLAB_OUTBOARD_U,
      6
    );
    expect(DOCK_SLAB_OUTBOARD_U).toBeCloseTo(1.2 + 5.8 / 2, 6);
    // The platform's inner face stays on the forklift channel's edge.
    expect(DOCK_PLATFORM_SECTION.x - DOCK_PLATFORM_SECTION.width / 2).toBeCloseTo(2, 6);
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

  it('shares no face between the platforms and the roll-up door or the bumpers', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const box = (name: string) =>
      new RegExp(`${name}: new THREE\\.BoxGeometry\\(([^)]*)\\)`)
        .exec(source)![1]
        .split(',')
        .map(Number);
    // The closed door reaches the ground and passes into the platforms' wall
    // end, so its end faces must lie inside the platform, not on its face.
    const [doorWidth] = box('door');
    const platformOuter = DOCK_PLATFORM_SECTION.x + DOCK_PLATFORM_SECTION.width / 2;
    expect(platformOuter - doorWidth / 2).toBeGreaterThanOrEqual(0.01);
    // The wear bumpers' rubber overlaps the blocks at x +/-1.75: their tops
    // must not coincide.
    const [, rubberHeight] = box('bumper');
    const blockTop = DOCK_BUMPER_BLOCK.y + DOCK_BUMPER_BLOCK.height / 2;
    const rubberTop = DOCK_WEAR_BUMPER.y + rubberHeight / 2;
    expect(Math.abs(rubberTop - blockTop)).toBeGreaterThanOrEqual(0.01);
    expect(
      source.match(
        /<DockBumperWithWear\s+position=\{\[-?DOCK_WEAR_BUMPER\.x, DOCK_WEAR_BUMPER\.y, 0\]\}/g
      )
    ).toHaveLength(4);
  });
});
