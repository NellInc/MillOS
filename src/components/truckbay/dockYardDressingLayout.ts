import {
  LOADING_PROP_FOOTPRINT,
  LOADING_PROP_HEIGHT,
  palletStackHeight,
} from '../props/LoadingProps';

/**
 * WHAT A WORKING SHIPPING DOCK KEEPS ON ITS APRON, AND WHERE.
 *
 * `logistics-close` looks down the shipping yard toward the dock from (18, 96):
 * about 55% of that frame was bare apron with two dashed lines. Nothing here is
 * placed by eye against the frame. The trucks' swept path over a whole visit
 * (`truckController.ts`, checked in `truckController.test.ts`) leaves two clear
 * pieces of yard in view:
 *
 *  - the middle of the turning loop, x 3-16 / z 82-90, which every truck drives
 *    round and none crosses. It becomes a kerbed pallet island: empty pallet
 *    stacks, loads waiting for the next trailer, a pallet jack, spare chocks, a
 *    spare dock board and a spill kit, with a bollard at each corner.
 *  - the strip east of the x 18-21 inbound lane, beside the dispatch box, where
 *    two wrapped loads and a short pallet stack wait to be staged.
 *
 * World metres; the shipping yard only (receiving is not in a graded frame and
 * keeps its own dressing).
 */

export type DockDressingKind =
  | 'load'
  | 'palletStack'
  | 'palletJack'
  | 'wheelChocks'
  | 'dockBoard'
  | 'spillKit';

export interface DockDressingItem {
  readonly id: string;
  readonly kind: DockDressingKind;
  /** World x, z. */
  readonly at: readonly [number, number];
  /** Yaw, radians. */
  readonly rotation: number;
  /** Pallets in a stack. */
  readonly count?: number;
}

/** The island: kerb outline in world x/z, kerb section and top. */
export const DOCK_PALLET_ISLAND = {
  minX: 7.5,
  maxX: 14.5,
  minZ: 82.5,
  maxZ: 89.5,
  kerbWidth: 0.25,
  kerbHeight: 0.15,
  /** Infill slab top: just under the kerb, so the kerb reads as a lip. */
  slabTop: 0.12,
} as const;

const ISLAND_X = (DOCK_PALLET_ISLAND.minX + DOCK_PALLET_ISLAND.maxX) / 2;
const ISLAND_Z = (DOCK_PALLET_ISLAND.minZ + DOCK_PALLET_ISLAND.maxZ) / 2;
const on = (dx: number, dz: number): readonly [number, number] => [ISLAND_X + dx, ISLAND_Z + dz];

/**
 * Props standing on the island slab (their y is the slab top).
 *
 * Laid out against the graded cameras, not only in plan
 * (`dockYardDressingLayout.test.ts`): the corner bollard, the spill bin and
 * the jack used to stand on one line of sight from logistics-close, 0.1-0.5 m
 * apart, and read as one prop clipping another. The pallet rows now keep a
 * metre off the corner bollards, the jack stands square in the middle with its
 * forks toward the loads it serves, and the bin sits at the front edge between
 * the chocks and the jack's handle.
 */
export const DOCK_ISLAND_ITEMS: readonly DockDressingItem[] = [
  { id: 'empties-tall', kind: 'palletStack', at: on(-1.8, -1.7), rotation: 0.04, count: 11 },
  { id: 'empties-mid', kind: 'palletStack', at: on(-2.2, -0.4), rotation: -0.06, count: 7 },
  { id: 'empties-short', kind: 'palletStack', at: on(-0.3, -2.2), rotation: 0.1, count: 4 },
  { id: 'load-waiting-a', kind: 'load', at: on(1.2, -2.1), rotation: 0 },
  { id: 'load-waiting-b', kind: 'load', at: on(2.5, -0.8), rotation: 0.03 },
  { id: 'load-waiting-c', kind: 'load', at: on(2.5, 0.5), rotation: -0.02 },
  { id: 'jack', kind: 'palletJack', at: on(0.5, 0.9), rotation: 0 },
  // Leaned on the 7-high stack: its foot 0.3 m out, its top against the stack.
  { id: 'spare-board', kind: 'dockBoard', at: on(-2.2, 0.49), rotation: Math.PI },
  { id: 'spare-chocks', kind: 'wheelChocks', at: on(-2.4, 2.5), rotation: 0.2 },
  { id: 'spill-kit', kind: 'spillKit', at: on(-0.4, 2.6), rotation: -0.3 },
];

/** Bollards at the island's four corners, on the kerb. */
export const DOCK_ISLAND_BOLLARDS: readonly (readonly [number, number])[] = [
  [DOCK_PALLET_ISLAND.minX + 0.3, DOCK_PALLET_ISLAND.minZ + 0.3],
  [DOCK_PALLET_ISLAND.maxX - 0.3, DOCK_PALLET_ISLAND.minZ + 0.3],
  [DOCK_PALLET_ISLAND.minX + 0.3, DOCK_PALLET_ISLAND.maxZ - 0.3],
  [DOCK_PALLET_ISLAND.maxX - 0.3, DOCK_PALLET_ISLAND.maxZ - 0.3],
];

/**
 * The painted TRUCK STAGING legend on the shipping yard, world metres (the
 * receiving yard's is this turned half a revolution about the site origin).
 *
 * It lay across the yard at (0, 90), 2 m letters reading along x: under the
 * back-in lane's heaviest tyre tracks (`yardWear.ts`) and its east end on the
 * pallet island's corner (shipping med-06, med-rain). The strip west of the
 * trucks' loop, between it and the x -18 lane line, carries no wheel and no
 * dressing, so the legend now reads down that strip toward the dock.
 * `along` is the axis the words run along.
 */
export const TRUCK_STAGING_LETTERING = {
  text: 'TRUCK STAGING',
  x: -14,
  z: 83,
  fontSize: 2,
  along: 'z',
} as const;

/**
 * A conservative plan box for a single line of capitals: 0.7 em per character
 * (Roboto's widest capital here, N, is 0.71 em; the line averages 0.59) and
 * one em across the line.
 */
export function paintedLegendBounds(legend: {
  readonly text: string;
  readonly x: number;
  readonly z: number;
  readonly fontSize: number;
  readonly along: 'x' | 'z';
}): Omit<PlanRect, 'id'> {
  const half = (legend.text.length * 0.7 * legend.fontSize) / 2;
  const across = legend.fontSize / 2;
  const hx = legend.along === 'x' ? half : across;
  const hz = legend.along === 'x' ? across : half;
  return {
    minX: legend.x - hx,
    maxX: legend.x + hx,
    minZ: legend.z - hz,
    maxZ: legend.z + hz,
  };
}

/** Props standing on the apron itself, east of the inbound lane. */
export const DOCK_APRON_ITEMS: readonly DockDressingItem[] = [
  { id: 'lane-load-a', kind: 'load', at: [24.2, 81.4], rotation: Math.PI / 2 },
  { id: 'lane-load-b', kind: 'load', at: [24.3, 83.1], rotation: Math.PI / 2 + 0.04 },
  { id: 'lane-empties', kind: 'palletStack', at: [24.6, 86.2], rotation: 0.08, count: 6 },
];

const FOOTPRINT: Record<DockDressingKind, readonly [number, number]> = {
  load: LOADING_PROP_FOOTPRINT.pallet,
  palletStack: LOADING_PROP_FOOTPRINT.pallet,
  palletJack: LOADING_PROP_FOOTPRINT.palletJack,
  wheelChocks: LOADING_PROP_FOOTPRINT.wheelChocks,
  dockBoard: LOADING_PROP_FOOTPRINT.dockBoard,
  spillKit: LOADING_PROP_FOOTPRINT.spillKit,
};

export interface PlanRect {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** World-axis bounds of one item's plan footprint, at its yaw. */
export function dockDressingBounds(item: DockDressingItem): PlanRect {
  const [hx, hz] = FOOTPRINT[item.kind];
  const c = Math.abs(Math.cos(item.rotation));
  const s = Math.abs(Math.sin(item.rotation));
  const ex = hx * c + hz * s;
  const ez = hx * s + hz * c;
  return {
    id: item.id,
    minX: item.at[0] - ex,
    maxX: item.at[0] + ex,
    minZ: item.at[1] - ez,
    maxZ: item.at[1] + ez,
  };
}

/** A plan rect with the height band it occupies, world metres. */
export interface DressingBox extends PlanRect {
  readonly minY: number;
  readonly maxY: number;
}

/** The island's corner bollards: post radius and top above the kerb. */
export const DOCK_ISLAND_BOLLARD = { radius: 0.115, height: 1.16 } as const;

/** Height of one dressing item's top above the surface it stands on. */
export function dockDressingHeight(item: DockDressingItem): number {
  return item.kind === 'palletStack'
    ? palletStackHeight(item.count ?? 6)
    : LOADING_PROP_HEIGHT[item.kind];
}

/**
 * Every solid on the island as a world box: the props on the slab and the four
 * corner bollards on the kerb. This is what the staging-bay no-overlap test
 * projects through the graded cameras.
 */
export function dockIslandBoxes(
  items: readonly DockDressingItem[] = DOCK_ISLAND_ITEMS
): DressingBox[] {
  const island = DOCK_PALLET_ISLAND;
  const r = DOCK_ISLAND_BOLLARD.radius;
  return [
    ...items.map((item) => ({
      ...dockDressingBounds(item),
      minY: island.slabTop,
      maxY: island.slabTop + dockDressingHeight(item),
    })),
    ...DOCK_ISLAND_BOLLARDS.map(([x, z], index) => ({
      id: `bollard-${index}`,
      minX: x - r,
      maxX: x + r,
      minZ: z - r,
      maxZ: z + r,
      minY: island.kerbHeight,
      maxY: island.kerbHeight + DOCK_ISLAND_BOLLARD.height,
    })),
  ];
}

/** Everything solid this dressing puts on the yard, for vehicle-path checks. */
export function dockDressingFootprints(): PlanRect[] {
  return [
    { id: 'pallet-island', ...DOCK_PALLET_ISLAND },
    ...DOCK_APRON_ITEMS.map(dockDressingBounds),
  ];
}

/**
 * THE TRAILER DROP YARD (SITE_LAYOUT.serviceYard.trailerDropYard, a 20 x 30 m
 * pad), in pad-local metres: three dropped trailers, noses toward +z, each in
 * its own bay. The old 0.1 m bay lines ran straight down the middle of each
 * trailer (they stood at x -6, 0 and 6, the trailers' own centrelines) and
 * read as a white stick under the nearest box in overview.
 */
export const TRAILER_DROP_YARD = {
  pad: { width: 20, depth: 30 },
  trailers: [
    { x: -6, z: -5, accent: '#2f6f8f' },
    { x: 0, z: 2, accent: '#9a3b2f' },
    { x: 6, z: -8, accent: '#3d7a4f' },
  ],
  bayLines: { xs: [-9, -3, 3, 9], width: 0.15, z0: -14.5, z1: 9.5 },
} as const;
/** A parked trailer's half width over its tyres, and its half length. */
export const PARKED_TRAILER_HALF = { width: 1.6, length: 5.75 } as const;
