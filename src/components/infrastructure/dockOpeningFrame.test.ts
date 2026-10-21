import { describe, expect, it } from 'vitest';
import {
  DOCK_FRAME_SECTION,
  dockFrameFlangeSpans,
  dockHoodBraces,
  dockHoodSlab,
} from './OpenDockOpening';

describe('dock hood braces', () => {
  // Both openings in MillScene: shipping 30 x 14, receiving 18 x 14.
  it.each([
    [30, 14],
    [18, 14],
  ])('runs each %s m hood brace from a post flange up to the hood underside', (width, height) => {
    const hood = dockHoodSlab(width, height);
    const underside = hood.centre[1] - hood.size[1] / 2;
    const { width: frameWidth, depth: frameDepth } = DOCK_FRAME_SECTION;
    // The post's indoor flange: 0.15 m plate centred 0.1 m behind the post.
    const flangeFace = -frameDepth / 2 - 0.1 - 0.075;
    const postX = width / 2 + frameWidth / 2;
    const braces = dockHoodBraces(width, height);
    expect(braces).toHaveLength(2);
    for (const { start, end } of braces) {
      const [low, high] = start[1] < end[1] ? [start, end] : [end, start];
      // Low end: on the flange's indoor face, within the plate, below the post top.
      expect(Math.abs(Math.abs(low[0]) - postX)).toBeLessThan((frameWidth + 0.3) / 2);
      expect(low[2]).toBeGreaterThan(flangeFace - 0.02);
      expect(low[2]).toBeLessThan(flangeFace + 0.15);
      expect(low[1]).toBeGreaterThan(0);
      expect(low[1]).toBeLessThan(height);
      // High end: into the hood slab's underside, inside its plan.
      expect(high[1]).toBeGreaterThanOrEqual(underside);
      expect(high[1]).toBeLessThan(underside + hood.size[1]);
      expect(Math.abs(high[0])).toBeLessThan(hood.size[0] / 2);
      expect(high[2]).toBeLessThan(hood.centre[2] + hood.size[2] / 2);
      expect(high[2]).toBeGreaterThan(hood.centre[2] - hood.size[2] / 2);
      // A brace, not a hanger: it climbs as it reaches out over the hall.
      expect(high[2]).toBeLessThan(low[2]);
    }
  });
});

describe('dock opening frame flanges', () => {
  it('stops the outer post flanges where the header flange begins', () => {
    // Both flanges are 0.15 m plates on the same outer plane. The header
    // flange hangs 0.1 m below the header, so full-height post flanges ran
    // 0.1 m up inside it: both faces of each plate pair coincided (0 mm,
    // different roughness maps) at the top of every post.
    for (const height of [14, 6]) {
      const spans = dockFrameFlangeSpans(height);
      expect(spans.outerPostFlange.y1).toBeLessThanOrEqual(spans.headerFlange.y0 + 1e-9);
      // Abutting, not gapped: the steelwork still reads as one frame.
      expect(spans.headerFlange.y0 - spans.outerPostFlange.y1).toBeLessThan(1e-6);
      // The inner flange has no header flange to meet and keeps full height.
      expect(spans.innerPostFlange.y1).toBe(height);
    }
  });
});
