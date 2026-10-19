/**
 * The truck-yard ground stack, pinned as one ordering.
 *
 * Every surface here shares `EXTERIOR_LAYERS.ground` and is separated by
 * polygonOffset alone, so the only thing that decides which one is drawn
 * where two overlap is the factor. Two surfaces with the SAME factor tie
 * exactly and z-fight; that is what the yard, apron and road did once their
 * offsets were lost (all three at 0).
 *
 * The yard is deliberately unbiased rather than `exteriorMid`: the village
 * shuttle turnaround (`CommunityLife.tsx`, a 12 m disc at (20, 118)) already
 * holds `exteriorMid` +3 and overlaps the shipping yard over ~70 m^2, so a +3
 * yard would tie with it.
 *
 * Working if: terrain > turnaround > yard > apron = road > paint, and no two
 * OVERLAPPING surfaces share a factor (apron and road do not overlap).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POLYGON_OFFSET } from '../renderLayers';
import { YARD_GROUND_DEPTH } from '../../components/truckbay/yardSurfaces';

type Depth = {
  readonly polygonOffset: boolean;
  readonly polygonOffsetFactor?: number;
  readonly polygonOffsetUnits?: number;
};

const factorOf = (depth: Depth): number =>
  depth.polygonOffset ? (depth.polygonOffsetFactor ?? 0) : 0;

/** The named preset a source block binds, read from the real file. */
const presetIn = (path: string, marker: string, window = 900): keyof typeof POLYGON_OFFSET => {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf(marker);
  expect(start, `${marker} not found in ${path}`).toBeGreaterThanOrEqual(0);
  const block = source.slice(start, start + window);
  const preset = block.match(/POLYGON_OFFSET\.(\w+)\.factor/)?.[1];
  expect(preset, `no POLYGON_OFFSET preset after ${marker}`).toBeDefined();
  return preset as keyof typeof POLYGON_OFFSET;
};

describe('truck-yard ground stack', () => {
  const terrain =
    POLYGON_OFFSET[presetIn('src/components/terrain/TerrainMaterial.tsx', 'polygonOffset: true')]
      .factor;
  const turnaround =
    POLYGON_OFFSET[
      presetIn('src/components/CommunityLife.tsx', 'name="village-shuttle-turnaround"')
    ].factor;
  const yard = factorOf(YARD_GROUND_DEPTH.yard);
  const apron = factorOf(YARD_GROUND_DEPTH.apron);
  const road = factorOf(YARD_GROUND_DEPTH.road);
  const paint = POLYGON_OFFSET.exteriorOverlay.factor;

  it('orders terrain behind the turnaround, behind the yard, behind apron and road, behind paint', () => {
    expect(terrain).toBeGreaterThan(turnaround);
    expect(turnaround).toBeGreaterThan(yard);
    expect(yard).toBeGreaterThan(apron);
    expect(apron).toBe(road);
    expect(apron).toBeGreaterThan(paint);
  });

  it('leaves the yard explicitly unbiased rather than tied with the turnaround', () => {
    expect(YARD_GROUND_DEPTH.yard.polygonOffset).toBe(false);
    expect(yard).not.toBe(turnaround);
  });

  it('biases apron and road with a named preset, units matching factor', () => {
    for (const depth of [YARD_GROUND_DEPTH.apron, YARD_GROUND_DEPTH.road]) {
      expect(depth.polygonOffset).toBe(true);
      expect(depth.polygonOffsetFactor).toBe(POLYGON_OFFSET.exteriorTop.factor);
      expect(depth.polygonOffsetUnits).toBe(POLYGON_OFFSET.exteriorTop.units);
    }
  });

  it('paints the labels that sit on the apron with a bias in front of the apron', () => {
    // A label 1 cm above a -1 surface with no bias of its own loses beyond
    // ~5.5 m on medium. Both apron labels must take the ground-paint surface.
    const truckBay = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const keepClear = truckBay.slice(0, truckBay.indexOf('>\n      KEEP CLEAR\n'));
    expect(keepClear.slice(keepClear.lastIndexOf('<Text'))).toContain('surface="painted-ground"');
    const staging = readFileSync('src/components/truckbay/PalletStaging.tsx', 'utf8');
    const label = staging.slice(0, staging.indexOf("'EMPTY PALLETS'"));
    expect(label.slice(label.lastIndexOf('<SceneText'))).toContain('surface="painted-ground"');
  });
});
