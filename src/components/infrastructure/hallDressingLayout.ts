import {
  MILL_BASE_PLATE_SCALE,
  PACKER_BASE_PLATE_SCALE,
  PROCESS_GALLERY_POST_X,
  PROCESS_MACHINE_INSTALL_SCALE,
  SITE_LAYOUT,
  type Vec3Tuple,
} from '../../constants/siteLayout';

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
  pallet: { halfX: 0.63, halfZ: 0.56, height: 1.7 },
  cart: { halfX: 0.6, halfZ: 0.3, height: 1.18 },
  partsRack: { halfX: 1.92, halfZ: 0.33, height: 2.25 },
  rollCradle: { halfX: 0.8, halfZ: 0.42, height: 0.7 },
  hoseReel: { halfX: 0.3, halfZ: 0.3, height: 0.78 },
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
  /** The tray it leaves; the two meet by design. */
  readonly tray: string;
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
  /**
   * The machine's base plate, grown a hair, in the patch's own frame: the
   * decal is a ring around it rather than a sheet under it.
   */
  readonly hole?: { readonly halfX: number; readonly halfZ: number };
}

const PT = PROCESS_PAD_TOP;
const HOSE_RADIUS = 0.022;

/**
 * Bagged stock staged in the open band between the packing line and the sifter
 * gallery (z -4.6 to 14.4 is clear of the packing circuits at z -5.2/-6.4 and
 * of the gallery's posts and sifter hangers at z 15.2/16.8): a west bay of six
 * pallets in two rows, some still being built, and three more east, both well
 * inside the painted forklift aisles at x +/-31.
 */
export const HALL_SACK_STACKS: readonly HallSackStack[] = [
  { id: 'sacks-west-1', x: -19, z: 9.4, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-west-2', x: -17.5, z: 9.4, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-west-3', x: -16, z: 9.4, rotation: 0, baseY: 0, courses: 5 },
  { id: 'sacks-west-4', x: -19, z: 10.8, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-west-5', x: -17.5, z: 10.8, rotation: 0, baseY: 0, courses: 4 },
  { id: 'sacks-west-6', x: -16, z: 10.8, rotation: 0, baseY: 0, courses: 2 },
  { id: 'sacks-east-1', x: 21.5, z: 9.4, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-east-2', x: 23, z: 9.4, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-east-3', x: 21.5, z: 10.8, rotation: 0, baseY: 0, courses: 3 },
  // West of the gallery, between it and the x -31 aisle: a short bay of bran sacks.
  { id: 'sacks-gallery-west-1', x: -24.8, z: 23.6, rotation: 0, baseY: 0, courses: 6 },
  { id: 'sacks-gallery-west-2', x: -24.8, z: 25, rotation: 0, baseY: 0, courses: 3 },
  // Mid-floor, a pair waiting for the packing line under the finished-product spouts.
  { id: 'sacks-mid-1', x: 4.6, z: 4.4, rotation: Math.PI / 2, baseY: 0, courses: 5 },
  { id: 'sacks-mid-2', x: 6, z: 4.4, rotation: Math.PI / 2, baseY: 0, courses: 6 },
];

/** Empty pallets waiting beside each bay. */
export const HALL_PALLET_PILES: readonly HallPalletPile[] = [
  { id: 'pallets-west', x: -14.4, z: 9.4, rotation: 0, baseY: 0, count: 6 },
  { id: 'pallets-east', x: 24.6, z: 9.4, rotation: 0, baseY: 0, count: 4 },
  { id: 'pallets-mid', x: 7.6, z: 4.4, rotation: Math.PI / 2, baseY: 0, count: 7 },
];

/**
 * Carts, reels, the spill kit and the spare-roll cradle stand on the milling
 * pad in the gaps between the mills (south of the operators' stops at z 33.5);
 * the parts rack and one cart stand under the sifter gallery between the
 * hangers of sifters A and B, facing the mills.
 */
export const HALL_PROPS: readonly HallProp[] = [
  { id: 'pallet-jack-west', kind: 'palletJack', x: -14.4, z: 11.3, rotation: 0, baseY: 0 },
  { id: 'cart-rm101', kind: 'cart', x: -19.6, z: 27.45, rotation: 0, baseY: PT },
  { id: 'cart-rm102', kind: 'cart', x: -5, z: 27.45, rotation: 0, baseY: PT },
  { id: 'cart-rm104', kind: 'cart', x: 21.2, z: 27.7, rotation: Math.PI / 2, baseY: PT },
  { id: 'cart-gallery', kind: 'cart', x: -6.4, z: 21.9, rotation: Math.PI, baseY: 0 },
  { id: 'parts-rack', kind: 'partsRack', x: -7, z: 23.55, rotation: 0, baseY: 0 },
  { id: 'parts-rack-west', kind: 'partsRack', x: -25.4, z: 18.6, rotation: Math.PI / 2, baseY: 0 },
  { id: 'cart-west', kind: 'cart', x: -23.6, z: 16.4, rotation: 0.35, baseY: 0 },
  { id: 'cart-mid', kind: 'cart', x: 2.6, z: 3.2, rotation: -0.25, baseY: 0 },
  { id: 'roll-cradle', kind: 'rollCradle', x: 11, z: 31.8, rotation: 0, baseY: PT },
  { id: 'hose-reel-rm101', kind: 'hoseReel', x: -21.2, z: 32.3, rotation: 0, baseY: PT },
  { id: 'hose-reel-rm103', kind: 'hoseReel', x: 7.4, z: 27.3, rotation: Math.PI, baseY: PT },
  { id: 'spill-kit-milling', kind: 'spillKit', x: -1.2, z: 32.2, rotation: 0, baseY: PT },
];

/** Points on the pad as (x, z), or (x, z, lift) where the hose leaves its drum. */
const onPad = (points: readonly (readonly [number, number, number?])[]): Vec3Tuple[] =>
  points.map(([x, z, lift = 0]) => [x, PT + HOSE_RADIUS + lift, z]);

/** Air hoses paid out across the pad toward the mill they were last used on. */
export const HALL_HOSES: readonly HallHose[] = [
  {
    id: 'hose-rm101',
    reel: 'hose-reel-rm101',
    radius: HOSE_RADIUS,
    points: onPad([
      [-21.2, 32.25, 0.15],
      [-21.05, 31.85],
      [-19.8, 31.3],
      [-18.2, 32.1],
      [-16.4, 31.4],
      [-14.6, 30.5],
      [-13, 30.3],
      [-12.25, 30.6],
    ]),
  },
  {
    id: 'hose-rm103',
    reel: 'hose-reel-rm103',
    radius: HOSE_RADIUS,
    points: onPad([
      [7.4, 27.35, 0.15],
      [7.55, 27.75],
      [8.3, 28.1],
      [9.6, 27.7],
      [10.6, 28.4],
      [9.4, 29.3],
      [7.6, 29.6],
      [6.3, 29.9],
    ]),
  },
];

/** North face of the gallery's north post row (shafts 0.36 m deep about z 24.8). */
const GALLERY_NORTH_POST_FACE = SITE_LAYOUT.factory.zones.sifting + 4.8 + 0.18;

/**
 * Power to the milling floor: a ladder tray bracketed off the gallery's north
 * posts at 4.2 m, below the pipe-support beams (7.2 m) and the lift rack (5 m),
 * and a conduit down each post to a local isolator at hand height.
 */
export const HALL_CABLE_TRAYS: readonly HallCableTray[] = [
  {
    id: 'cable-tray-milling',
    fromX: -21,
    toX: 21,
    z: GALLERY_NORTH_POST_FACE + 0.42,
    y: 4.2,
    width: 0.45,
    railHeight: 0.1,
    bracketX: PROCESS_GALLERY_POST_X,
    postFaceZ: GALLERY_NORTH_POST_FACE,
  },
];

export const HALL_CONDUIT_DROPS: readonly HallConduitDrop[] = PROCESS_GALLERY_POST_X.map((x) => ({
  id: `conduit-post-${x}`,
  tray: 'cable-tray-milling',
  x,
  z: GALLERY_NORTH_POST_FACE + 0.025,
  radius: 0.025,
  bottomY: 1.75,
  topY: 4.2,
  isolator: { width: 0.3, height: 0.4, depth: 0.2 },
}));

/**
 * The bare footprint each machine's dust ring keeps off: its installed base
 * plate grown 6 cm. A decal laid under the plate drew a ragged pale fringe up
 * the plate's foot (polygon offset over a 1 cm lift), and flour does not
 * settle under a machine that stands on it anyway.
 */
const DUST_HOLE_MARGIN = 0.06;
const plateHole = (scale: readonly number[], install: number) => ({
  halfX: (scale[0] * install) / 2 + DUST_HOLE_MARGIN,
  halfZ: (scale[2] * install) / 2 + DUST_HOLE_MARGIN,
});
const MILL_DUST_HOLE = plateHole(MILL_BASE_PLATE_SCALE, PROCESS_MACHINE_INSTALL_SCALE.rollerMill);
const PACKER_DUST_HOLE = plateHole(PACKER_BASE_PLATE_SCALE, PROCESS_MACHINE_INSTALL_SCALE.packer);

/** A ring about a metre wide round each mill's plate, thickest at its foot. */
const millDust = SITE_LAYOUT.machines.rollerMills.map(
  ({ id, position: [x, , z] }, i): HallDustPatch => ({
    id: `dust-${id}`,
    source: id,
    x,
    z,
    baseY: PT,
    width: 2 * (MILL_DUST_HOLE.halfX + 1),
    depth: 2 * (MILL_DUST_HOLE.halfZ + 0.9),
    rotation: i % 2 ? Math.PI : 0,
    hole: MILL_DUST_HOLE,
  })
);
/** Under each plansifter, where its sieve-frame seals weep onto the floor. */
const sifterDust = SITE_LAYOUT.machines.sifters.map(
  ({ id, position: [x, , z] }, i): HallDustPatch => ({
    id: `dust-${id}`,
    source: id,
    x,
    z,
    baseY: 0,
    width: 4.6,
    depth: 4.6,
    rotation: i % 2 ? Math.PI / 2 : 0,
  })
);
/** Round each packer's plate, short of the quality and packer stops at z -8.8. */
const packerDust = SITE_LAYOUT.machines.packers.map(
  ({ id, position: [x, , z] }, i): HallDustPatch => ({
    id: `dust-${id}`,
    source: id,
    x,
    z,
    baseY: PT,
    width: 2 * (PACKER_DUST_HOLE.halfX + 0.8),
    depth: 2 * (PACKER_DUST_HOLE.halfZ + 0.9),
    rotation: i % 2 ? Math.PI : 0,
    hole: PACKER_DUST_HOLE,
  })
);

/** A drift off each mill's gallery-side corner, where the air hoses blow it. */
const millDrift = SITE_LAYOUT.machines.rollerMills.map(
  ({ id, position: [x, , z] }, i): HallDustPatch => ({
    id: `drift-${id}`,
    source: id,
    x: x + (i % 2 ? -1.9 : 1.9),
    z: z - 1.9,
    baseY: PT,
    width: 2.6,
    depth: 1.6,
    rotation: i % 2 ? 0.2 : -0.2,
  })
);

export const HALL_DUST: readonly HallDustPatch[] = [
  ...millDust,
  ...millDrift,
  ...sifterDust,
  ...packerDust,
  // Spill where sacks are handled.
  {
    id: 'spill-sacks-west',
    source: 'sacks-west-4',
    x: -17.6,
    z: 12,
    baseY: 0,
    width: 1.6,
    depth: 1,
    rotation: 0.3,
  },
  {
    id: 'spill-sacks-east',
    source: 'sacks-east-3',
    x: 22.3,
    z: 12,
    baseY: 0,
    width: 1.2,
    depth: 0.9,
    rotation: -0.4,
  },
];

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
      group: drop.tray,
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
