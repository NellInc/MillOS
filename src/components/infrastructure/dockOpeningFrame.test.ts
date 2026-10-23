import { describe, expect, it } from 'vitest';
import {
  DOCK_FLANGE,
  DOCK_FRAME_SECTION,
  DOCK_PANEL_BANDS,
  DOCK_WEB_DEPTH,
  dockFrameFlangeSpans,
  dockHoodBraces,
  dockHoodSlab,
  dockLevelerParts,
} from './OpenDockOpening';
import { SITE_LAYOUT } from '../../constants/siteLayout';

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

// final3 med-12 milling, dock threshold (x 2280-2400, y 890-910): "a dark
// stippled dash line". The probe put every stipple pixel on the leveler plate
// at x -6.2, z 48.2-49.6: the plate's x = -6 rib, a 20 mm strip running into
// the hall, seen from 31 m at 8 degrees. Its face and top together project to
// 1.7 px, so it broke into dashes along its length.
describe('dock leveler plate', () => {
  it('stands no relief on the plate that the milling camera sees under 2 px', () => {
    const parts = dockLevelerParts(30);
    const plate = parts.find((part) => part.role === 'plate');
    expect(plate).toBeDefined();
    expect(plate!.scale[0]).toBe(29);
    const { position, target, fov } = SITE_LAYOUT.cameras.milling;
    const pixelAngle = (2 * Math.tan((fov * Math.PI) / 360)) / 1440;
    for (const part of parts.filter((p) => p.role === 'relief')) {
      // The shipping opening stands at z 48 with the leveler's pivot 0.08 up.
      const centre = [part.position[0], part.position[1] + 0.08, part.position[2] + 48];
      const distance = Math.hypot(
        centre[0] - position[0],
        centre[1] - position[1],
        centre[2] - position[2]
      );
      const elevation = Math.atan2(
        position[1] - centre[1],
        Math.hypot(centre[0] - position[0], centre[2] - position[2])
      );
      const projected =
        part.scale[1] + Math.min(part.scale[0], part.scale[2]) * Math.sin(elevation);
      expect(
        projected / (distance * pixelAngle),
        `relief at ${part.position}`
      ).toBeGreaterThanOrEqual(2);
    }
    expect(target).toBeDefined();
  });
});

// interior column edges (2110,420)-(2130,1100), final-med-12: a dashed-white
// line down the shipping dock's left post. The probe put it at the junction
// of the post's side face (z 47.72) and its indoor flange: the 0.6 m web stops
// 2.5 cm short of each 0.15 m flange plate, centred 0.1 m off the web face, so
// the hall behind showed through a 2.5 cm slot the full 14 m height.
describe('dock opening I-beam', () => {
  it('runs the web into both flange plates with no slot', () => {
    const flangeInnerFace =
      DOCK_FRAME_SECTION.depth / 2 + DOCK_FLANGE.standoff - DOCK_FLANGE.thickness / 2;
    expect(DOCK_WEB_DEPTH / 2).toBeGreaterThan(flangeInnerFace);
    // Sunk into the plate, not through it.
    expect(DOCK_WEB_DEPTH / 2).toBeLessThan(flangeInnerFace + DOCK_FLANGE.thickness / 2);
  });
});
