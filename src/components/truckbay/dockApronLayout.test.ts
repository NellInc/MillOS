import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCK_FLOOD_HEADS,
  DOCK_FLOOD_POOLS,
  DOCK_FLOOR_MARKINGS,
  DOCK_GROOVE_STRIPES,
  DOCK_GUIDE_LINES,
  DOCK_KEEP_CLEAR,
  DOCK_LASER_GUIDES,
  DOCK_PAINT_START_U,
  DOCK_SLAB_OUTBOARD_U,
  DOCK_STOP_BAR,
  YARD_MAST,
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

describe('dock apron night floods', () => {
  it('mounts the heads beside the door frame and above the status lamps', () => {
    for (const x of DOCK_FLOOD_HEADS.xs) expect(Math.abs(x)).toBeGreaterThan(4.85 + 0.3);
    expect(DOCK_FLOOD_HEADS.y).toBeGreaterThan(4.3);
    expect(DOCK_FLOOD_HEADS.u).toBeGreaterThan(-1.8);
  });

  it('lights the truck lane from the stop bar to the end of KEEP CLEAR', () => {
    for (const u of [
      DOCK_STOP_BAR.u,
      (DOCK_STOP_BAR.u + DOCK_KEEP_CLEAR.u1) / 2,
      DOCK_KEEP_CLEAR.u1,
    ]) {
      const reach = Math.max(
        ...DOCK_FLOOD_POOLS.map((pool) => 1 - Math.hypot(pool.x, pool.u - u) / pool.radius)
      );
      expect(reach, `u ${u}`).toBeGreaterThan(0.1);
    }
  });

  it('is mounted at both docks', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    expect(source.match(/<DockApronFloods \/>/g)).toHaveLength(2);
  });
});

describe('yard mast pools', () => {
  it('throw as far as a 14 m mast does, not as far as a 4 m post', () => {
    // The four masts stand on the yard perimeter; with a 10 m pool the middle
    // of the 60 m yard got nothing at 22:00 and read as flat navy.
    expect(YARD_MAST.poolRadius).toBeGreaterThanOrEqual(YARD_MAST.height * 1.25);
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    expect(source.match(/<ExteriorLampPool radius=\{YARD_MAST\.poolRadius\} \/>/g)).toHaveLength(2);
    expect(source.match(/<cylinderGeometry args=\{\[0\.12, 0\.15, 14, 8\]\} \/>/g)).toHaveLength(2);
  });
});

describe('KEEP CLEAR against the docked truck', () => {
  it('lies beyond the docked tractor, on its pull-out path, with no guide line through it', async () => {
    // It sat at u 14.6-16.6, under the docked tractor's engine (u ~15.5): a
    // keep-clear box under a parking position protects nothing. It now keeps
    // the pull-out path in front of the docked tractor's nose clear.
    const { DOCK_BUMPER_FACE_Z, TRAILER_REAR_OVERHANG, TRACTOR_FRONT_OVERHANG } =
      await import('./truckController');
    const dockedNoseU =
      DOCK_BUMPER_FACE_Z + TRAILER_REAR_OVERHANG + 0.02 + TRACTOR_FRONT_OVERHANG - 50;
    expect(DOCK_KEEP_CLEAR.u0).toBeGreaterThan(dockedNoseU);
    expect(DOCK_KEEP_CLEAR.u0 - dockedNoseU).toBeLessThan(1.5);
    for (const run of [DOCK_GUIDE_LINES, DOCK_GROOVE_STRIPES, DOCK_LASER_GUIDES]) {
      expect(run.u1).toBeLessThan(DOCK_KEEP_CLEAR.u0);
    }
  });
});
