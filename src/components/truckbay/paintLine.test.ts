/**
 * Thin dock paint must not break into dashes at review distance.
 *
 * A 0.25 m line seen across a 45 m apron at a grazing angle covers less than
 * one pixel, so the rasteriser drops it on alternate pixels: the bay edges,
 * guide lines, stop bars and laser lines read as dotted dashes laid over the
 * bands (no MSAA: the composer runs without multisampling). A line is
 * therefore drawn on a quad at least PAINT_LINE_MIN_QUAD wide with the paint
 * itself in a mipmapped mask, so far away it fades to a continuous soft line
 * instead of dashing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAINT_LINE_MIN_QUAD,
  paintLineProfile,
  paintLineQuad,
  THIN_PAINT_LIMIT,
} from './paintLine';

describe('dock paint lines', () => {
  it('draws every thin line on a quad wide enough to rasterise continuously', () => {
    for (const width of [0.03, 0.05, 0.15, 0.25, 0.3, 0.4]) {
      const { quadWidth, core } = paintLineQuad(width);
      expect(quadWidth).toBeGreaterThanOrEqual(PAINT_LINE_MIN_QUAD);
      expect(quadWidth).toBeGreaterThanOrEqual(width * 3 - 1e-9);
      expect(core * quadWidth).toBeCloseTo(width, 9);
    }
    expect(paintLineQuad(1.5)).toEqual({ quadWidth: 1.5, core: 1 });
  });

  it('keeps the same amount of paint in the mask, so distance only softens the line', () => {
    for (const core of [1 / 3, 1 / 15, 0.04]) {
      const profile = paintLineProfile(core, 128);
      const mean = profile.reduce((sum, value) => sum + value, 0) / profile.length;
      expect(mean).toBeGreaterThan(core * 0.9);
      expect(mean).toBeLessThan(core * 1.1 + 1 / 128);
      expect(profile[0]).toBe(0);
      expect(profile[profile.length - 1]).toBe(0);
      expect(Math.max(...profile)).toBeGreaterThan(0.6);
    }
  });

  it('leaves no dock line in TruckBay drawn as a bare thin plane', () => {
    const truckBay = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const bare = truckBay.match(
      /<planeGeometry args=\{\[\s*(?:DOCK_GUIDE_LINES\.width|DOCK_GROOVE_STRIPES\.width|DOCK_STOP_BAR\.width|0\.0[35],|4, 0\.15)/g
    );
    expect(bare ?? []).toEqual([]);
    // Thin floor markings route through the line path.
    const plane = truckBay.slice(truckBay.indexOf('const DockMarkingPlane'));
    expect(plane.slice(0, 1200)).toContain('THIN_PAINT_LIMIT');
    expect(THIN_PAINT_LIMIT).toBeGreaterThan(0.25);
  });
});
