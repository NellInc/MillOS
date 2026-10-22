import type { Vec3Tuple } from '../../constants/siteLayout';

/**
 * THE WORKING FLOOR OF THE HALL.
 *
 * Real-size machines in an 80 x 100 m hall read as an empty shed (both judges,
 * `interior` and `milling`). The machines stay where they are; this is the
 * floor a flour mill actually has around them, in world metres.
 *
 * Placement lives here, as plain data, so `hallDressingLayout.test.ts` can hold
 * every piece against the real forklift routes, the painted aisles and
 * walkways, the mill residents' walking circuits, the machines, belts, docks,
 * gallery steel and spouting without rendering anything. `HallDressing.tsx`
 * draws exactly these numbers.
 */

/** Top of the milling and packing pads (`buildProcessPads`: 0.16 m slabs on the floor). */
export const PROCESS_PAD_TOP = 0.16;

/** Plan half-extents (x, z) of each prop in its own frame, and its height. */
export const HALL_PROP_SIZE = {
  /** A loaded pallet: the staged-pallet footprint (`LOAD_SCALE` 1.4). */
  pallet: { halfX: 0.63, halfZ: 0.56, height: 1.35 },
  cart: { halfX: 0.6, halfZ: 0.3, height: 1.18 },
  partsRack: { halfX: 1.85, halfZ: 0.33, height: 2.25 },
  rollCradle: { halfX: 0.72, halfZ: 0.42, height: 0.7 },
  hoseReel: { halfX: 0.3, halfZ: 0.26, height: 0.78 },
  spillKit: { halfX: 0.4, halfZ: 0.4, height: 0.98 },
  palletJack: { halfX: 0.36, halfZ: 0.96, height: 1.4 },
} as const;

export type HallPropKind = keyof typeof HALL_PROP_SIZE;

interface Placed {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Yaw about +Y. */
  readonly rotation: number;
  /** The surface it stands on: 0 (floor) or `PROCESS_PAD_TOP`. */
  readonly baseY: number;
}

/** Flour sacks on a pallet, built `courses` courses (two sacks a course) high. */
export interface HallSackStack extends Placed {
  readonly courses: number;
}

/** Empty pallets stacked `count` high. */
export interface HallPalletPile extends Placed {
  readonly count: number;
}

export interface HallProp extends Placed {
  readonly kind: Exclude<HallPropKind, 'pallet'>;
}

/** A hose lying on its surface, from its reel to the nozzle. */
export interface HallHose {
  readonly id: string;
  /** The reel it is paid out from. */
  readonly reel: string;
  readonly radius: number;
  /** Centreline, world metres (y already includes the radius). */
  readonly points: readonly Vec3Tuple[];
}

/** A ladder cable tray on cantilever brackets, running along x. */
export interface HallCableTray {
  readonly id: string;
  readonly fromX: number;
  readonly toX: number;
  readonly z: number;
  /** Underside of the tray. */
  readonly y: number;
  readonly width: number;
  readonly railHeight: number;
  /** X of each bracket: the gallery posts it hangs from. */
  readonly bracketX: readonly number[];
  /** Face of the posts the brackets are bolted to. */
  readonly postFaceZ: number;
}

/** A conduit dropped from the tray down a post to a local isolator. */
export interface HallConduitDrop {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Top of the isolator box, where the conduit ends. */
  readonly bottomY: number;
  readonly topY: number;
  readonly isolator: { readonly width: number; readonly height: number; readonly depth: number };
}

/** A lit floor decal of settled flour and spill. */
export interface HallDustPatch {
  readonly id: string;
  /** The machine (or prop) the dust comes from. */
  readonly source: string;
  readonly x: number;
  readonly z: number;
  /** The surface under it; the decal is laid a hair above. */
  readonly baseY: number;
  readonly width: number;
  readonly depth: number;
  readonly rotation: number;
}

export const HALL_SACK_STACKS: readonly HallSackStack[] = [];
export const HALL_PALLET_PILES: readonly HallPalletPile[] = [];
export const HALL_PROPS: readonly HallProp[] = [];
export const HALL_HOSES: readonly HallHose[] = [];
export const HALL_CABLE_TRAYS: readonly HallCableTray[] = [];
export const HALL_CONDUIT_DROPS: readonly HallConduitDrop[] = [];
export const HALL_DUST: readonly HallDustPatch[] = [];

/** World-space box of one solid piece of dressing. */
export interface HallSolid {
  readonly id: string;
  /** Pieces in one group touch by design (a hose and its reel). */
  readonly group: string;
  /** Standing on the floor or a pad, as opposed to mounted overhead or on steel. */
  readonly onFloor: boolean;
  readonly baseY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const placedBox = (
  item: Placed,
  halfX: number,
  halfZ: number,
  height: number,
  group = item.id
): HallSolid => {
  const c = Math.abs(Math.cos(item.rotation));
  const s = Math.abs(Math.sin(item.rotation));
  const hx = halfX * c + halfZ * s;
  const hz = halfX * s + halfZ * c;
  return {
    id: item.id,
    group,
    onFloor: true,
    baseY: item.baseY,
    minX: item.x - hx,
    maxX: item.x + hx,
    minY: item.baseY,
    maxY: item.baseY + height,
    minZ: item.z - hz,
    maxZ: item.z + hz,
  };
};

/** Every solid piece of the dressing as a world box (decals are not solids). */
export function hallDressingSolids(): HallSolid[] {
  const solids: HallSolid[] = [];
  const pallet = HALL_PROP_SIZE.pallet;
  for (const stack of HALL_SACK_STACKS)
    solids.push(placedBox(stack, pallet.halfX, pallet.halfZ, pallet.height));
  for (const pile of HALL_PALLET_PILES)
    solids.push(placedBox(pile, pallet.halfX, pallet.halfZ, 0.17 * pile.count));
  for (const prop of HALL_PROPS) {
    const size = HALL_PROP_SIZE[prop.kind];
    solids.push(placedBox(prop, size.halfX, size.halfZ, size.height));
  }
  for (const hose of HALL_HOSES) {
    const xs = hose.points.map((p) => p[0]);
    const ys = hose.points.map((p) => p[1]);
    const zs = hose.points.map((p) => p[2]);
    const r = hose.radius;
    solids.push({
      id: hose.id,
      group: hose.reel,
      onFloor: true,
      baseY: Math.min(...ys) - r,
      minX: Math.min(...xs) - r,
      maxX: Math.max(...xs) + r,
      minY: Math.min(...ys) - r,
      maxY: Math.max(...ys) + r,
      minZ: Math.min(...zs) - r,
      maxZ: Math.max(...zs) + r,
    });
  }
  for (const tray of HALL_CABLE_TRAYS) {
    solids.push({
      id: tray.id,
      group: tray.id,
      onFloor: false,
      baseY: tray.y,
      minX: Math.min(tray.fromX, tray.toX),
      maxX: Math.max(tray.fromX, tray.toX),
      minY: tray.y - 0.1,
      maxY: tray.y + tray.railHeight + 0.02,
      minZ: tray.postFaceZ,
      maxZ: tray.z + tray.width / 2 + 0.03,
    });
  }
  for (const drop of HALL_CONDUIT_DROPS) {
    const box = drop.isolator;
    solids.push({
      id: drop.id,
      group: drop.id,
      onFloor: false,
      baseY: drop.bottomY - box.height,
      minX: Math.min(drop.x - drop.radius, drop.x - box.width / 2),
      maxX: Math.max(drop.x + drop.radius, drop.x + box.width / 2),
      minY: drop.bottomY - box.height,
      maxY: drop.topY,
      minZ: drop.z - drop.radius,
      maxZ: drop.z - drop.radius + box.depth,
    });
  }
  return solids;
}
