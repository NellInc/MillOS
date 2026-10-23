import { CONVEYOR_LAYOUT } from '../../constants/siteLayout';

/**
 * THE END OF THE PACKING LINE.
 *
 * The roller conveyor (`CONVEYOR_LAYOUT.roller`, x -15..15 at z -19) ended at
 * its west end in a red bar and nothing else: no bags, no palletiser, no
 * wrapper, so the process had no end (packing frame). This is the cell a bag
 * line ends in, laid out west of that bar in the order a bag travels:
 *
 *   accumulation table (bags queue for the layer former)
 *   -> gantry palletiser (a pallet under it, three courses built, a bag in the gripper)
 *   -> stretch wrapper (a full load on the turntable, film carriage up the mast)
 *   -> outfeed (two finished loads waiting for the forklift)
 *
 * with the palletiser's empty-pallet magazine beside it. Static props: the
 * rollers carry no cargo and their animation is untouched.
 *
 * It sits between the main belt (z -17.5 edge) and the receiving forklift's
 * x -28 lane (swept to x -26.65), clear of both; `endOfLineLayout.test.ts`
 * checks it against every conveyor, machine, forklift corridor and the
 * workers' walking circuits. World metres.
 */

const ROLLER = CONVEYOR_LAYOUT.roller;
/** The roller line's west end and its frame's half width (2.5 m frame). */
export const ROLLER_WEST_END_X = ROLLER.position[0] - ROLLER.length / 2;
const LINE_Z = ROLLER.position[2];

export interface CellRect {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const rect = (id: string, cx: number, cz: number, halfX: number, halfZ: number): CellRect => ({
  id,
  minX: cx - halfX,
  maxX: cx + halfX,
  minZ: cz - halfZ,
  maxZ: cz + halfZ,
});

/** Bag accumulation table, butted against the roller line's end. */
export const EOL_INFEED = {
  ...rect('eol-infeed', ROLLER_WEST_END_X - 0.05 - 0.85, LINE_Z, 0.85, 1.2),
  top: 0.9,
} as const;

/** Gantry palletiser: four posts, a top frame, a layer plate and a bag gripper. */
export const EOL_PALLETISER = {
  ...rect('eol-palletiser', -18.2, LINE_Z - 0.2, 1.35, 1.3),
  height: 3.2,
  /** Courses already on the pallet under it. */
  courses: 3,
} as const;

/** Its empty-pallet magazine, on the far side from the main belt. */
export const EOL_MAGAZINE = {
  ...rect('eol-magazine', -18.2, -21.55, 0.63, 0.56),
  count: 9,
} as const;

/** Rotary-table stretch wrapper with its mast on the far side. */
export const EOL_WRAPPER = {
  ...rect('eol-wrapper', -21.9, LINE_Z - 0.2, 1.0, 1.3),
  table: { x: -21.9, z: LINE_Z - 0.05, radius: 0.95, height: 0.12 },
  mast: { x: -21.9, z: LINE_Z - 1.35, height: 2.6 },
} as const;

/** Finished loads waiting for the forklift, turned to present their fork entries. */
export const EOL_OUTFEED_LOADS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -24.55, z: -18.75 },
  { x: -24.55, z: -20.3 },
];
/** A wrapped load turned a quarter: 1.12 m in x, 1.26 m in z. */
export const EOL_OUTFEED = EOL_OUTFEED_LOADS.map((load, index) =>
  rect(`eol-outfeed-${index}`, load.x, load.z, 0.56, 0.63)
);

export const END_OF_LINE_FOOTPRINTS: readonly CellRect[] = [
  EOL_INFEED,
  EOL_PALLETISER,
  EOL_MAGAZINE,
  EOL_WRAPPER,
  ...EOL_OUTFEED,
];
