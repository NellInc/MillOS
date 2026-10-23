import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { SPLAT_BOUNDS, TerrainChannel } from '../terrain/terrainTypes';
import {
  generateSplatMap,
  MILLOS_TERRAIN_REGIONS,
  regionClearance,
} from '../terrain/splatMapGenerator';
import {
  buildPerimeterKerbRuns,
  kerbRunBoxes,
  PERIMETER_KERB_CROSSINGS,
  PERIMETER_KERB_RECT,
  PERIMETER_KERB_SECTION,
  type PerimeterKerbRun,
} from './perimeterKerbLayout';

const perimeter = MILLOS_TERRAIN_REGIONS[0];
// `EAST_POND_APPROACH` in FactoryExterior, without importing the whole scene.
const eastPond = SITE_LAYOUT.exteriorFeatures.ponds[1];
const EAST_POND_APPROACH = [eastPond.position[0] - eastPond.radius - 0.8, 0, eastPond.position[2]];

/**
 * Paths and roads FactoryExterior lays, in world X/Z: literal props, plus
 * `{...NAME}` spreads of an exported `{ start, end, width }` constant (the lake
 * approach became `LAKE_APPROACH_PATH` when its hedge was laid along it). The
 * spreads resolve through the module's own exports, since some ends are computed.
 */
async function factoryExteriorPaths() {
  const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const pattern =
    /<(?:GravelPath|ConnectingRoad)\s+start=\{\[(-?[\d.]+), [-\d.]+, (-?[\d.]+)\]\}\s+end=\{(?:\[(-?[\d.]+), [-\d.]+, (-?[\d.]+)\]|(EAST_POND_APPROACH))\}\s+width=\{([\d.]+)\}/g;
  const literal = [...source.matchAll(pattern)].map((m) => ({
    start: [Number(m[1]), Number(m[2])] as const,
    end: (m[5]
      ? [EAST_POND_APPROACH[0], EAST_POND_APPROACH[2]]
      : [Number(m[3]), Number(m[4])]) as readonly [number, number],
    width: Number(m[6]),
  }));
  // FactoryExterior's own path constants, plus those it imports from the lighting module.
  const exterior = {
    ...((await import('./ExteriorLighting')) as unknown as Record<string, unknown>),
    ...((await import('../FactoryExterior')) as unknown as Record<string, unknown>),
  };
  const spread = [...source.matchAll(/<(?:GravelPath|ConnectingRoad)\s+\{\.\.\.([A-Z_]+)\}/g)].map(
    ([, name]) => {
      const path = exterior[name] as
        | { start: readonly number[]; end: readonly number[]; width: number }
        | undefined;
      expect(path, `${name} is spread into a path but not exported`).toBeDefined();
      const { start, end, width } = path as NonNullable<typeof path>;
      return {
        start: [start[0], start[2]] as const,
        end: [end[0], end[2]] as readonly [number, number],
        width,
      };
    }
  );
  return [...literal, ...spread];
}

/** Where a segment crosses (or touches within its half-width) a kerb run's line. */
function runBlocksPath(
  run: PerimeterKerbRun,
  path: { start: readonly [number, number]; end: readonly [number, number]; width: number }
): boolean {
  const vertical = run.side === 'east' || run.side === 'west';
  const [a, b] = vertical ? [path.start[0], path.end[0]] : [path.start[1], path.end[1]];
  const [pa, pb] = vertical ? [path.start[1], path.end[1]] : [path.start[0], path.end[0]];
  const lo = Math.min(a, b) - path.width / 2;
  const hi = Math.max(a, b) + path.width / 2;
  // The path must reach the kerb line to be blocked by it.
  if (run.line < lo || run.line > hi) return false;
  const t = a === b ? 0 : Math.max(0, Math.min(1, (run.line - a) / (b - a)));
  const along = pa + (pb - pa) * t;
  return along + path.width / 2 > run.from && along - path.width / 2 < run.to;
}

function bilinear(data: Uint8Array, size: number, x: number, z: number, channel: number) {
  const u = ((x - SPLAT_BOUNDS.minX) / (SPLAT_BOUNDS.maxX - SPLAT_BOUNDS.minX)) * size - 0.5;
  const v = ((z - SPLAT_BOUNDS.minZ) / (SPLAT_BOUNDS.maxZ - SPLAT_BOUNDS.minZ)) * size - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const at = (xx: number, yy: number) => data[(yy * size + xx) * 4 + channel] / 255;
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
}

describe('perimeter hardstanding edge', () => {
  it('steps the splat at the edge but keeps the meadow and dressing clear of it', () => {
    expect(perimeter.channel).toBe(TerrainChannel.ASPHALT);
    expect(perimeter.edgeSoftness ?? 0).toBe(0);
    // The relief and the trees keep the 3.5 m they always had.
    expect(regionClearance(perimeter)).toBe(3.5);
  });

  it('lays a kerb on every side, and the yard edge the yard camera sees is kerbed', () => {
    const runs = buildPerimeterKerbRuns();
    for (const side of ['east', 'west', 'north', 'south'] as const) {
      expect(runs.some((run) => run.side === side)).toBe(true);
    }
    const total = runs.reduce((sum, run) => sum + run.to - run.from, 0);
    expect(total).toBeGreaterThan(450);
    // The yard frame looks along the east edge between the silos and the pond.
    const east = runs.filter((run) => run.side === 'east');
    expect(east.some((run) => run.from <= -60 && run.to >= 60)).toBe(true);
  });

  it('never runs a kerb across a road or footpath', async () => {
    const runs = buildPerimeterKerbRuns();
    const fromSource = await factoryExteriorPaths();
    expect(fromSource.length).toBeGreaterThan(8);
    for (const path of fromSource) {
      for (const run of runs) {
        expect(runBlocksPath(run, path), JSON.stringify({ path, run })).toBe(false);
      }
    }
    // Every crossing the module lists is still in FactoryExterior.
    for (const crossing of PERIMETER_KERB_CROSSINGS) {
      expect(
        fromSource.some(
          (p) =>
            p.start[0] === crossing.start[0] &&
            p.start[1] === crossing.start[1] &&
            p.width === crossing.width
        ),
        JSON.stringify(crossing)
      ).toBe(true);
    }
    // Importing FactoryExterior transforms the whole exterior graph cold: 10.4 s on CI.
  }, 60_000);

  /**
   * The kerb only reads as a hard edge if it covers the ramp the splat's
   * bilinear filter leaves: paving fully inside its inner face, grass fully
   * behind its back face. Checked on the real generated splat at the medium
   * (512) and high (1024) resolutions, at points along every run.
   */
  it.each([512, 1024])('covers the splat ramp at %i', (resolution) => {
    const data = generateSplatMap(MILLOS_TERRAIN_REGIONS, resolution, SPLAT_BOUNDS).image
      .data as Uint8Array;
    const { channelInner, kerbOuter } = PERIMETER_KERB_SECTION;
    let worstInside = 1;
    let worstOutside = 0;
    for (const run of buildPerimeterKerbRuns()) {
      const vertical = run.side === 'east' || run.side === 'west';
      for (let along = run.from + 3; along < run.to - 3; along += 2.3) {
        const point = (offset: number) => {
          const across = run.line + run.outward * offset;
          return vertical ? ([across, along] as const) : ([along, across] as const);
        };
        const [ix, iz] = point(channelInner - 0.02);
        const [ox, oz] = point(kerbOuter + 0.02);
        worstInside = Math.min(worstInside, bilinear(data, resolution, ix, iz, 1));
        worstOutside = Math.max(worstOutside, bilinear(data, resolution, ox, oz, 1));
      }
    }
    expect(worstInside).toBeGreaterThan(0.85);
    expect(worstOutside).toBeLessThan(0.05);
  });

  it('builds blocks that never share a top face at a corner', () => {
    const boxes = buildPerimeterKerbRuns().flatMap((run) => {
      const { channel, kerb } = kerbRunBoxes(run);
      return [channel, kerb];
    });
    const overlaps = (a: (typeof boxes)[number], b: (typeof boxes)[number], axis: 0 | 2): number =>
      Math.min(a.centre[axis] + a.size[axis] / 2, b.centre[axis] + b.size[axis] / 2) -
      Math.max(a.centre[axis] - a.size[axis] / 2, b.centre[axis] - b.size[axis] / 2);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const area =
          Math.max(0, overlaps(boxes[i], boxes[j], 0)) *
          Math.max(0, overlaps(boxes[i], boxes[j], 2));
        const topI = boxes[i].centre[1] + boxes[i].size[1] / 2;
        const topJ = boxes[j].centre[1] + boxes[j].size[1] / 2;
        // Overlap in plan is allowed only where one block's top is buried in the other.
        if (Math.abs(topI - topJ) < 1e-6) expect(area, `${i} ${j}`).toBeLessThan(1e-6);
      }
    }
    expect(PERIMETER_KERB_RECT).toEqual({ minX: -100, maxX: 100, minZ: -90, maxZ: 90 });
  });
});
