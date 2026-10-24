import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DOCK_FLANGE,
  DOCK_FRAME_MATERIALS,
  DOCK_FRAME_MIN_LUMINANCE,
  DOCK_FRAME_SECTION,
  DOCK_PANEL_BANDS,
  DOCK_WEB_DEPTH,
  dockFrameFlangeSpans,
  dockHoodBraces,
  dockHoodSlab,
  dockLevelerParts,
  dockPostDetailParts,
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

describe('dock post detail', () => {
  /**
   * final5 med-12 interior: the shipping dock's west post, seen end-on at the
   * right of the frame, read as a dark stack of blocks: a plain box whose only
   * articulation was the 1.2 m panel normal. Web stiffeners every 2.4 m or
   * less divide it into bays the eye can count, and a leveller control station
   * at hand height on the hall face says what the post is for.
   */
  it('stiffens the post web at a counted pitch and hangs a control station on the hall face', () => {
    const height = 14;
    const parts = dockPostDetailParts(height);
    const stiffeners = parts.filter((p) => p.role === 'stiffener');
    const ys = [...new Set(stiffeners.map((p) => p.position[1]))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThanOrEqual(5);
    const stops = [-height / 2, ...ys, height / 2];
    for (let i = 1; i < stops.length; i++) expect(stops[i] - stops[i - 1]).toBeLessThanOrEqual(2.4);
    const webHalf = DOCK_FRAME_SECTION.width / 2;
    const flangeInner =
      DOCK_FRAME_SECTION.depth / 2 + DOCK_FLANGE.standoff - DOCK_FLANGE.thickness / 2;
    for (const p of stiffeners) {
      // Both sides of the web, inside the flange outstand, short of the flanges.
      const inner = Math.abs(p.position[0]) - p.scale[0] / 2;
      const outer = Math.abs(p.position[0]) + p.scale[0] / 2;
      expect(inner).toBeGreaterThanOrEqual(webHalf - 1e-9);
      expect(outer).toBeLessThanOrEqual(webHalf + 0.15 + 1e-9);
      expect(p.scale[2] / 2).toBeLessThan(flangeInner);
    }
    expect(new Set(stiffeners.map((p) => Math.sign(p.position[0])))).toEqual(new Set([-1, 1]));
    const station = parts.filter((p) => p.role === 'station');
    expect(station.length).toBeGreaterThanOrEqual(2);
    for (const p of station) {
      // Hand height, proud of the indoor flange (local -z is the hall).
      expect(p.position[1] + height / 2).toBeGreaterThan(1);
      expect(p.position[1] + height / 2).toBeLessThan(1.8);
      expect(p.position[2] - p.scale[2] / 2).toBeLessThan(-(flangeInner + DOCK_FLANGE.thickness));
      expect(p.position[2] + p.scale[2] / 2).toBeLessThanOrEqual(
        -(flangeInner + DOCK_FLANGE.thickness) + 1e-9
      );
    }
  });
});

describe('dock post stiffener finish', () => {
  /**
   * final6 med-12 interior, the near right column: short white dashes at a
   * 2.33 m pitch, e.g. (118,123,123) at (2170,684) on a post of (0,32,55). They
   * are the stiffeners' 3 cm top faces, the only up-facing faces on the post:
   * the painted profile's ledge dust and edge wear mix them toward pale
   * neutral (still grey at 18:30), and with no shadow received they took the
   * noon sun under the roof. A stiffener is the post's steel, not a ledge.
   */
  it('paints the stiffeners without ledge dust or edge wear', () => {
    const parts = dockPostDetailParts(14).filter((p) => p.role === 'stiffener');
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) expect(p.material).toBe('stiffener');
    const material = DOCK_FRAME_MATERIALS.stiffener as THREE.Material & {
      userData: { millosWorldSurface?: { uSurfMask: { value: THREE.Vector4 } } };
    };
    const mask = material.userData.millosWorldSurface?.uSurfMask.value;
    expect(mask?.y).toBe(0);
    expect(mask?.z).toBe(0);
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

describe('dock hood soffit', () => {
  /**
   * final7 med-12 milling, top right (full-res x 1800-2400, y 0-280): mean RGB
   * (12, 30, 38), 72% of the box under L20, beside a liner at L120 under the
   * same roof. It is not the roof deck: it is the shipping dock's interior
   * hood (34 x 8 m at y 15.5, z 40-48), which low-12 does not draw at all, and
   * whose `canopy` paint sat on the 0.07 coal floor the posts were lifted off
   * for the same "flat slab" read. Lit only by fill, and that fill the grass's
   * green-khaki, it read as a hole. SSAO is not involved: medium has none.
   */
  it('paints the hood underside as a soffit in shade, lit by the hall floor', () => {
    const material = DOCK_FRAME_MATERIALS.canopy as THREE.MeshStandardMaterial & {
      userData: {
        millosWorldSurface?: {
          uSurfDeck: { value: THREE.Vector4 };
          uSurfRib: { value: THREE.Vector4 };
        };
      };
    };
    const c = material.color;
    expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toBeGreaterThanOrEqual(
      DOCK_FRAME_MIN_LUMINANCE - 1e-6
    );
    const surface = material.userData.millosWorldSurface;
    // The hall's grey bounce, as the roof liner takes it.
    expect(surface?.uSurfDeck.value.w).toBeGreaterThanOrEqual(0.8);
    // A box-filtered deck rib across the hood's 34 m span, at a pitch the
    // milling camera resolves: >= 11 px a pitch (RIB_NYQUIST_FADE's far end).
    const period = surface?.uSurfDeck.value.x ?? 0;
    expect(surface?.uSurfDeck.value.z).toBe(0);
    expect(surface?.uSurfRib.value.y).toBe(1);
    const hood = dockHoodSlab(30, 14).centre;
    const camera = SITE_LAYOUT.cameras.milling;
    const distance = Math.hypot(
      camera.position[0] - hood[0],
      camera.position[1] - hood[1],
      camera.position[2] - (48 + hood[2])
    );
    const metresPerPixel = (2 * Math.tan(((camera.fov ?? 50) * Math.PI) / 360) * distance) / 864;
    expect(period / metresPerPixel).toBeGreaterThanOrEqual(11);
  });

  it('keeps the hood out of the static batch, which would drop its finish overrides', () => {
    // The batcher's merged arm clones the material and re-applies the bare
    // profile (`applyBatchWorldSurface`), so the bounce and the rib would go.
    const source = readFileSync('src/components/infrastructure/OpenDockOpening.tsx', 'utf8');
    const hood = source.slice(source.indexOf('material={MATERIALS.canopy}') - 200);
    expect(hood.slice(0, 600)).toContain('noStaticBatch: true');
  });
});
