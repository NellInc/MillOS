import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURFACE_LAYERS } from '../../constants/renderLayers';
import { DOCK_DECK } from '../../constants/dockLoading';
import { DOCK_LEVELER_LIP } from './dockApronLayout';

/**
 * Three yard details whose faces lay exactly on another surface of a different
 * colour (triangle-level probe, shipping scene). Each is pinned on the source,
 * as `dockApronLayout.test.ts` pins the platform geometry.
 */
const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
const block = (name: string) => {
  const start = source.indexOf(`const ${name}: React.FC`);
  expect(start, name).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n};\n', start));
};
/** A literal depth, optionally plus named `SURFACE_LAYERS` standoffs. */
const depthOf = (text: string) =>
  text.split('+').reduce((sum, term) => {
    const named = /SURFACE_LAYERS\.(\w+)/.exec(term);
    const value = named
      ? SURFACE_LAYERS[named[1] as keyof typeof SURFACE_LAYERS]
      : Number(term.trim());
    expect(Number.isFinite(value), term).toBe(true);
    return sum + value;
  }, 0);

describe('truck yard detail faces', () => {
  it('stands the safety-mirror caption off the mirror disc it overlaps', () => {
    const mirror = block('SafetyMirror');
    const disc = /<mesh position=\{\[0, 0, ([^\]]+)\]\}>\s*<circleGeometry/.exec(mirror)!;
    const caption = /<Text\s+position=\{\[0, -0\.35, ([^\]]+)\]\}/.exec(mirror)!;
    expect(depthOf(caption[1]) - depthOf(disc[1])).toBeGreaterThanOrEqual(SURFACE_LAYERS.label);
  });

  it('stands the NO IDLING title off the red ring whose bottom it reaches', () => {
    const sign = block('NoIdlingSign');
    const ring = /<mesh position=\{\[0, 2\.2, ([^\]]+)\]\}>\s*<ringGeometry/.exec(sign)!;
    const title = /position=\{\[0, 1\.95, ([^\]]+)\]\}[^>]*>\s*NO IDLING/.exec(sign)!;
    expect(depthOf(title[1]) - depthOf(ring[1])).toBeGreaterThanOrEqual(SURFACE_LAYERS.decal);
  });

  it('stands the dock status lights off the door frame line', () => {
    // Housings 0.2 m deep centred on the door line (z -1.8) shared both
    // faces with the generated 0.2 m door frame beside them.
    const doors = [...source.matchAll(/<RollUpDoor position=\{\[0, 0, ([-\d.]+)\]\}/g)];
    const lights = [...source.matchAll(/<DockStatusLight position=\{\[-?5, 4, ([-\d.]+)\]\}/g)];
    expect(doors).toHaveLength(2);
    expect(lights).toHaveLength(4);
    for (const light of lights)
      for (const door of doors)
        expect(Math.abs(Number(light[1]) - Number(door[1]))).toBeGreaterThanOrEqual(0.01);
  });

  it('keeps the dock leveler lip inside the deck plate ends', () => {
    // Both generated parts are 8 m wide; the plate's ends lay on the lip's
    // (x +/-4). Both are now scaled to the deck, the lip 2 cm narrower.
    const leveler = block('DockLeveler');
    expect(leveler).toMatch(/scale=\{\[DOCK_DECK\.width \/ 8,/);
    expect(leveler).toMatch(/DOCK_LEVELER_LIP\.width \/ 8,/);
    expect(DOCK_DECK.width - DOCK_LEVELER_LIP.width).toBeGreaterThanOrEqual(0.019);
  });
});
