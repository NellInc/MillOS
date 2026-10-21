import { LOADING_PROP_FOOTPRINT } from '../props/LoadingProps';

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

/** Props standing on the island slab (their y is the slab top). */
export const DOCK_ISLAND_ITEMS: readonly DockDressingItem[] = [
  { id: 'empties-tall', kind: 'palletStack', at: on(-2.2, -2.2), rotation: 0.04, count: 11 },
  { id: 'empties-mid', kind: 'palletStack', at: on(-2.2, -0.6), rotation: -0.06, count: 7 },
  { id: 'empties-short', kind: 'palletStack', at: on(-0.6, -2.2), rotation: 0.1, count: 4 },
  { id: 'load-waiting-a', kind: 'load', at: on(1.1, -2.1), rotation: 0 },
  { id: 'load-waiting-b', kind: 'load', at: on(2.5, -2.1), rotation: 0.03 },
  { id: 'load-waiting-c', kind: 'load', at: on(2.5, -0.5), rotation: -0.02 },
  { id: 'jack', kind: 'palletJack', at: on(0.9, 0.9), rotation: 0.55 },
  // Leaned on the 7-high stack: its foot 0.3 m out, its top against the stack.
  { id: 'spare-board', kind: 'dockBoard', at: on(-2.2, 0.29), rotation: Math.PI },
  { id: 'spare-chocks', kind: 'wheelChocks', at: on(-2.4, 2.5), rotation: 0.2 },
  { id: 'spill-kit', kind: 'spillKit', at: on(2.6, 2.5), rotation: -0.3 },
];

/** Bollards at the island's four corners, on the kerb. */
export const DOCK_ISLAND_BOLLARDS: readonly (readonly [number, number])[] = [
  [DOCK_PALLET_ISLAND.minX + 0.3, DOCK_PALLET_ISLAND.minZ + 0.3],
  [DOCK_PALLET_ISLAND.maxX - 0.3, DOCK_PALLET_ISLAND.minZ + 0.3],
  [DOCK_PALLET_ISLAND.minX + 0.3, DOCK_PALLET_ISLAND.maxZ - 0.3],
  [DOCK_PALLET_ISLAND.maxX - 0.3, DOCK_PALLET_ISLAND.maxZ - 0.3],
];

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

/** Everything solid this dressing puts on the yard, for vehicle-path checks. */
export function dockDressingFootprints(): PlanRect[] {
  return [
    { id: 'pallet-island', ...DOCK_PALLET_ISLAND },
    ...DOCK_APRON_ITEMS.map(dockDressingBounds),
  ];
}
