import { describe, expect, it } from 'vitest';
import { DOCK_PANEL_BANDS, dockFrameFlangeSpans } from './OpenDockOpening';

describe('dock steel panel pitch', () => {
  it('draws panels about 1.2 m across, not a 0.3 m tile grid', () => {
    // The forklift scene's dock posts carried "the same small tile grid as the
    // packers" (final-med-12). Each band was cut for ~1.2 m per TILE, but
    // `generateMachinePanelNormal(512, 4, 7)` draws 4 x 4 panels per tile, so
    // every member carried 0.29-0.3 m bevelled squares.
    const PANELS_PER_TILE = 4;
    for (const [name, { member, normal }] of Object.entries(DOCK_PANEL_BANDS)) {
      const pitchX = member[0] / (normal.repeat.x * PANELS_PER_TILE);
      const pitchY = member[1] / (normal.repeat.y * PANELS_PER_TILE);
      expect(pitchX, `${name} across`).toBeGreaterThan(1);
      expect(pitchY, `${name} along`).toBeGreaterThan(1);
      expect(Math.min(pitchX, pitchY), name).toBeLessThan(1.5);
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
