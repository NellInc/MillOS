import { describe, expect, it } from 'vitest';
import { dockFrameFlangeSpans } from './OpenDockOpening';

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
