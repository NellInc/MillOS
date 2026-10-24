import { WORLD_REALM_PATHS, type RealmPath } from '../../constants/publicRealmLayout';
import { MILLOS_TERRAIN_REGIONS, signedDistanceToShape } from '../terrain/splatMapGenerator';
import { TerrainChannel } from '../terrain/terrainTypes';

/**
 * THE KERB ALONG THE SITE HARDSTANDING'S EDGE.
 *
 * The perimeter hardstanding (`MILLOS_TERRAIN_REGIONS[0]`, x +/-100, z +/-90)
 * used to fade into the grass over a 3.5 m soft splat edge, which the art judge
 * read as a ~150 px airbrushed band with no kerb. A real yard stops at a
 * kerb. The splat edge is now a step, and this strip is laid over what the
 * splat's bilinear filter still leaves of a ramp: one texel, 1.09 m on medium
 * (512 over 560 m) and 0.55 m on high and ultra, and on which side of the edge
 * it falls depends on where the texel centres land. Measured on the real
 * splat: [-1.02, +0.08] m on the x edges and [-0.86, +0.23] m on the z edges
 * at 512, [-0.20, +0.35] and [-0.04, +0.51] at 1024. The section below covers
 * the union, which is why the flush channel is wide and mostly on the paving
 * side; `perimeterKerbLayout.test.ts` re-measures it.
 *
 * Section, outward from the paving: a flush concrete edge channel from
 * `channelInner` to `kerbInner`, then a raised kerb to `kerbOuter`, all in
 * metres from the edge line. Grass meets the kerb's back face. Low (256) keeps
 * a ~2 m ramp that no sensible kerb covers; it is the tier with no relief maps
 * and no height blend, and is left as a gradient by design.
 *
 * GAPS ARE DERIVED, NOT PLACED. The kerb breaks wherever the ground just
 * outside the edge is something other than grass - another splat region (the
 * truck yard, roads, verges, the corner apron), an authored yard plane the
 * splat does not paint (`PERIMETER_KERB_EXTRA_PAVING`) - and wherever a path
 * crosses the edge (`PERIMETER_KERB_CROSSINGS`, plus the public realm's own
 * `WORLD_REALM_PATHS`). `perimeterKerbLayout.test.ts` re-reads the paths from
 * `FactoryExterior.tsx` so a path added there without a gap fails.
 *
 * Working if the yard ends at a hard concrete line with grass behind it, and
 * no road or footpath runs into a kerb.
 */

export const PERIMETER_KERB_SECTION = {
  /** Paving side of the edge channel, metres from the edge (negative = inside). */
  channelInner: -1.08,
  /** Where the channel meets the raised kerb. */
  kerbInner: 0.3,
  /** The kerb's back face, which the grass meets. */
  kerbOuter: 0.56,
  /** World Y of the channel's top: just proud of the terrain datum (-0.02). */
  channelTop: 0.012,
  /** World Y of the kerb's top: a 12-15 cm upstand. */
  kerbTop: 0.13,
  /** World Y the blocks are bedded to, below the terrain. */
  base: -0.14,
} as const;

/** Shortest run worth building, metres. */
const MIN_RUN = 2;
const STEP = 0.25;
/** How far outside the edge the "is this grass" probe looks, metres. */
const PROBE_OUT = 1;
/** Clear space either side of a crossing path, beyond its own half-width. */
const CROSSING_MARGIN = 1;

/**
 * Footpaths and roads in `FactoryExterior.tsx` that meet the perimeter edge,
 * in world X/Z. The test parses that file and fails on any crossing missing.
 */
export const PERIMETER_KERB_CROSSINGS: readonly RealmPath[] = [
  // West walk out to the front-pond and canal paths.
  { start: [-95, 85], end: [-128.75, 85], width: 3 },
  // Path to the lake.
  { start: [95, 85], end: [120, 92], width: 2.5 },
  // Path to the east pond, from the yard's corner (end: `EAST_POND_APPROACH`).
  { start: [100, -85], end: [108.2, -80], width: 1.8 },
  // Parking-lot road. It stopped 5 m short of the corner, on grass the old
  // soft edge used to smear over; it now runs on into the corner.
  { start: [101, 89], end: [120, 70], width: 5 },
];

/**
 * Hardstanding the splat does not paint: the receiving yard plane in
 * `TruckBay.tsx` (the shipping yard's 60 x 60 m plane turned half a
 * revolution), which runs over the perimeter's north edge.
 */
export const PERIMETER_KERB_EXTRA_PAVING = [
  { minX: -30, maxX: 30, minZ: -110, maxZ: -50 },
] as const;

export type KerbSide = 'east' | 'west' | 'north' | 'south';

/** One straight kerb run. `from`/`to` run along the edge's own axis. */
export interface PerimeterKerbRun {
  readonly side: KerbSide;
  /** The edge line: x for east/west, z for north/south. */
  readonly line: number;
  /** +1 if outward is the positive axis, -1 if negative. */
  readonly outward: 1 | -1;
  readonly from: number;
  readonly to: number;
}

const perimeter = MILLOS_TERRAIN_REGIONS[0];

/** The kerbed hardstanding's edge lines. */
export const PERIMETER_KERB_RECT = (() => {
  if (perimeter.channel !== TerrainChannel.ASPHALT || perimeter.shape.type !== 'rect') {
    throw new Error('perimeterKerb: MILLOS_TERRAIN_REGIONS[0] is no longer the perimeter rect');
  }
  const { x, z, width, height } = perimeter.shape;
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - height / 2, maxZ: z + height / 2 };
})();

const distanceToPath = (x: number, z: number, path: RealmPath): number => {
  const dx = path.end[0] - path.start[0];
  const dz = path.end[1] - path.start[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - path.start[0]) * dx + (z - path.start[1]) * dz) / (dx * dx + dz * dz))
  );
  return Math.hypot(x - path.start[0] - t * dx, z - path.start[1] - t * dz);
};

/** True where the ground beyond the edge at (x, z) is grass, and nothing crosses. */
export function kerbWanted(
  x: number,
  z: number,
  outX: number,
  outZ: number,
  crossings: readonly RealmPath[] = [...PERIMETER_KERB_CROSSINGS, ...WORLD_REALM_PATHS]
): boolean {
  const px = x + outX * PROBE_OUT;
  const pz = z + outZ * PROBE_OUT;
  for (const region of MILLOS_TERRAIN_REGIONS) {
    if (region === perimeter || region.channel === TerrainChannel.GRASS) continue;
    if (signedDistanceToShape(px, pz, region.shape) <= (region.edgeSoftness ?? 0) + STEP) {
      return false;
    }
  }
  for (const paving of PERIMETER_KERB_EXTRA_PAVING) {
    if (
      px >= paving.minX - STEP &&
      px <= paving.maxX + STEP &&
      pz >= paving.minZ - STEP &&
      pz <= paving.maxZ + STEP
    ) {
      return false;
    }
  }
  for (const path of crossings) {
    const clear = path.width / 2 + CROSSING_MARGIN;
    if (distanceToPath(x, z, path) <= clear || distanceToPath(px, pz, path) <= clear) return false;
  }
  return true;
}

const runsAlong = (
  side: KerbSide,
  line: number,
  outward: 1 | -1,
  start: number,
  end: number,
  crossings?: readonly RealmPath[]
): PerimeterKerbRun[] => {
  const runs: PerimeterKerbRun[] = [];
  const vertical = side === 'east' || side === 'west';
  let runStart: number | null = null;
  const close = (at: number) => {
    if (runStart !== null && at - runStart >= MIN_RUN) {
      runs.push({ side, line, outward, from: runStart, to: at });
    }
    runStart = null;
  };
  const count = Math.round((end - start) / STEP);
  for (let i = 0; i <= count; i += 1) {
    const along = start + i * STEP;
    const wanted = vertical
      ? kerbWanted(line, along, outward, 0, crossings)
      : kerbWanted(along, line, 0, outward, crossings);
    if (wanted && runStart === null) runStart = along;
    if (!wanted) close(along - STEP);
  }
  close(end);
  return runs;
};

/**
 * Every kerb run around the perimeter. The east/west runs carry the corners
 * (they extend past the north/south lines to the kerb's outer face); the
 * north/south channels stop at the east/west channels' paving side, and their
 * raised kerbs run on to the east/west kerbs' front faces (`kerbRunBoxes`), so
 * the upstand turns the corner unbroken and no two blocks share a top face.
 */
export function buildPerimeterKerbRuns(crossings?: readonly RealmPath[]): PerimeterKerbRun[] {
  const { minX, maxX, minZ, maxZ } = PERIMETER_KERB_RECT;
  const { kerbOuter, channelInner } = PERIMETER_KERB_SECTION;
  return [
    ...runsAlong('east', maxX, 1, minZ - kerbOuter, maxZ + kerbOuter, crossings),
    ...runsAlong('west', minX, -1, minZ - kerbOuter, maxZ + kerbOuter, crossings),
    ...runsAlong('south', maxZ, 1, minX - channelInner, maxX + channelInner, crossings),
    ...runsAlong('north', minZ, -1, minX - channelInner, maxX + channelInner, crossings),
  ];
}

/** A run's two blocks as world-space boxes: centre and size, for instancing. */
export function kerbRunBoxes(run: PerimeterKerbRun): {
  channel: { centre: [number, number, number]; size: [number, number, number] };
  kerb: { centre: [number, number, number]; size: [number, number, number] };
} {
  const { channelInner, kerbInner, kerbOuter, channelTop, kerbTop, base } = PERIMETER_KERB_SECTION;
  const { minX, maxX } = PERIMETER_KERB_RECT;
  const corner = 1e-6;
  const turnsCorner = run.side === 'north' || run.side === 'south';
  // A north/south kerb that reaches a corner runs on to the side kerb's face.
  const kerbFrom =
    turnsCorner && run.from <= minX - channelInner + corner ? minX - kerbInner : run.from;
  const kerbTo = turnsCorner && run.to >= maxX + channelInner - corner ? maxX + kerbInner : run.to;
  const block = (inner: number, outer: number, top: number, from: number, to: number) => {
    const along = (from + to) / 2;
    const length = to - from;
    const across = run.line + (run.outward * (inner + outer)) / 2;
    const width = outer - inner;
    const centreY = (top + base) / 2;
    const height = top - base;
    return run.side === 'east' || run.side === 'west'
      ? {
          centre: [across, centreY, along] as [number, number, number],
          size: [width, height, length] as [number, number, number],
        }
      : {
          centre: [along, centreY, across] as [number, number, number],
          size: [length, height, width] as [number, number, number],
        };
  };
  return {
    channel: block(channelInner, kerbInner, channelTop, run.from, run.to),
    kerb: block(kerbInner, kerbOuter, kerbTop, kerbFrom, kerbTo),
  };
}
