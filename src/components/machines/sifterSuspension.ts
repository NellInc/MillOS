import { PROCESS_MACHINE_INSTALL_SCALE, SIFTER_LAYOUT } from '../../constants/siteLayout';

/**
 * HOW A PLANSIFTER HANGS.
 *
 * A plansifter is not stood on a floor: its sieve stack gyrates, so it hangs
 * from steel overhead on flexible canes, and the floor under it is air (plus
 * the outlet sock). final-med-12 interior read the three sifters as crates on
 * the deck - they stood on a full-footprint platform slab, and their four
 * suspension rods ran INSIDE the casing, where no pixel of them showed.
 *
 * Now each sifter has its own gantry standing on the gallery deck - four
 * columns, two headers and two cross beams over the canes - and eight canes in
 * corner pairs, outside the casing and trays, from the cross beams down to
 * brackets bolted into the casing's lowest full-width course. The gantry is
 * laid out from the sifter's anchor, so it stays with the machine, and the
 * canes swing with the gyration (`CompactMachines`).
 *
 * Authored metres about the sifter's floor anchor, installed with it
 * (`getMachineAssemblyScale`, x0.5). Real size of the casing at this scale:
 * 3.25 x 2.83 m, 2.9 m to the lid - the band of a large eight-section
 * plansifter (2.3-3 m by 2.9 m), so the sifters are not scaled up to fill the
 * 43 m gallery; the gantries are what make it a working floor.
 */

export interface SuspensionBox {
  readonly centre: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

export interface SuspensionCane {
  readonly x: number;
  readonly z: number;
  readonly bottom: number;
  readonly top: number;
}

/** The gallery deck top, 0.15 m (world) under the sifter anchor (`buildProcessGallery`). */
const DECK = -0.15 / PROCESS_MACHINE_INSTALL_SCALE.sifter;
/** Underside of the cross beams the canes hang from: clear of the 6.33 lid and 7.56 inlet top. */
const SOFFIT = 7;
const BEAM_DEPTH = 0.7;
const STEEL = 0.6;
/** Gantry column centres, each way: clear of the drive drum (x 4.26) and the trays. */
const COLUMN = 4.6;
/** Cross beams over the cane pairs. */
const BEAM_X = 3.6;
/** Bracket top, inside the casing's first full-width course (y 0.70-1.13). */
const BRACKET_TOP = 1;

const corners: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const box = (
  centre: readonly [number, number, number],
  size: readonly [number, number, number]
): SuspensionBox => ({ centre, size });

const canes: SuspensionCane[] = [];
for (const [sx, sz] of corners)
  for (const x of [3.45, 3.75])
    canes.push({ x: sx * x, z: sz * 3.2, bottom: BRACKET_TOP, top: SOFFIT });

export const SIFTER_SUSPENSION = {
  caneRadius: 0.06,
  standsOnPlatform: false,
  /** Two canes at each corner, 0.3 apart along x, 0.22 outboard of the trays in z. */
  canes: canes as readonly SuspensionCane[],
  /** Corner lugs, 0.1 into the casing in both x and z, under each cane pair. */
  brackets: corners.map(([sx, sz]) =>
    box([sx * 3.55, BRACKET_TOP - 0.08, sz * 3.075], [0.8, 0.16, 0.55])
  ),
  gantry: [
    // Columns on base plates.
    ...corners.flatMap(([sx, sz]) => [
      box([sx * COLUMN, (DECK + SOFFIT) / 2, sz * COLUMN], [STEEL, SOFFIT - DECK, STEEL]),
      box([sx * COLUMN, DECK + 0.06, sz * COLUMN], [0.9, 0.12, 0.9]),
    ]),
    // Headers along x, seated on the column tops.
    ...[-1, 1].map((sz) =>
      box([0, SOFFIT + BEAM_DEPTH / 2, sz * COLUMN], [2 * COLUMN + STEEL, BEAM_DEPTH, STEEL])
    ),
    // Cross beams over the canes, framed between the headers.
    ...[-1, 1].map((sx) =>
      box([sx * BEAM_X, SOFFIT + BEAM_DEPTH / 2, 0], [STEEL, BEAM_DEPTH, 2 * COLUMN - STEEL])
    ),
  ],
  /**
   * The flexible outlet sock: from the casing's underframe down through the
   * deck aperture to the top of the finished-product spout, which starts 2 m
   * (world) under the anchor (`spoutRoutes`, sifter -> packer).
   */
  sock: {
    radius: 0.36,
    top: SIFTER_LAYOUT.bodyCentreY - SIFTER_LAYOUT.bodyHeight / 2 + 0.05,
    bottom: -2 / PROCESS_MACHINE_INSTALL_SCALE.sifter,
  },
} as const;
