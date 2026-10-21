import { DOCK_DECK } from '../../constants/dockLoading';
import {
  DOCK_BUMPER_FACE_Z,
  TRACTOR_FRONT_OVERHANG,
  TRAILER_REAR_OVERHANG,
} from './truckController';

/**
 * DOCK APRON PAINT, in outward coordinates.
 *
 * `u` is metres outward from the dock line: the shipping dock group's local +z,
 * and the receiving dock's too once its markings are mounted under a pi turn
 * about Y (which also mirrors x, so receiving's blue lane and staging box sit
 * on the opposite world side from shipping's, as its cones and bollards do).
 *
 * The two 2 m dock platforms and the forklift channel slab between them run
 * from u -1.7 to u 4.1 at both docks. Everything here used to start at or
 * inside the dock line - the green bay, the blue lane, the staging box, the
 * stop bar at u 2, the guide and groove lines, and at shipping the KEEP CLEAR
 * zone at u -3, inside the building wall. Paint under a depth-writing solid is
 * hidden up close and stipples through it at distance, so all of it now starts
 * past the stop bar, which itself starts past the slab.
 *
 * `dockApronLayout.test.ts` checks the slab edge against the real platform and
 * channel geometry in `TruckBay.tsx`.
 */

/** Outboard edge of the platforms and channel slab (centre u 1.2, 5.8 m long). */
export const DOCK_SLAB_OUTBOARD_U = 4.1;

/**
 * One of the two 2 m dock platform sections either side of the forklift
 * channel (the other is mirrored in x). Inner face at x 2.0 on the channel
 * edge; outer face at x 4.52. The closed roll-up door (9 m wide, 0.15 m deep,
 * reaching down to the ground) passes 7.5 cm into the platforms' wall end, and
 * at 4.5 its end faces lay exactly on the platform's outer faces: two colours
 * at 0 mm. The 2 cm overhang buries those door ends inside the platform.
 */
export const DOCK_PLATFORM_SECTION = {
  x: 3.26,
  width: 2.52,
  height: 2,
  u: 1.2,
  depth: 5.8,
} as const;

/** The five rubber bumper blocks across the dock face. */
export const DOCK_BUMPER_BLOCK = { y: 0.8, height: 1.2 } as const;

/**
 * Every bumper block across the dock face, with its box. The centre block is
 * under the dock deck, so it stops below the deck's hanging lip (0.46); at 1.4
 * it stood 0.7 m up through the deck.
 */
export const DOCK_BUMPER_BLOCKS: readonly {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly u: number;
  readonly width: number;
  readonly depth: number;
}[] = [-3.5, -1.75, 0, 1.75, 3.5].map((x) => ({
  x,
  ...(x === 0 ? { y: 0.32, height: 0.24 } : DOCK_BUMPER_BLOCK),
  u: 0.2,
  width: 0.8,
  depth: 0.6,
}));

/**
 * The deck's lip, hinged under its far edge (the bumper face). Stowed it hangs
 * in front of the deck end; deployed it swings 0.3 rad out, its far corner
 * stopping short of the docked trailer's underride guard 0.1 m beyond.
 */
export const DOCK_LEVELER_LIP = {
  width: DOCK_DECK.width - 0.02,
  thickness: 0.05,
  depth: 0.15,
  stowedAngle: Math.PI / 2,
  deployedAngle: Math.PI / 2 - 0.3,
} as const;

/**
 * The two wear-indicator bumpers (x +/-2), whose 0.4 m rubber sits on the
 * blocks at x +/-1.75. At y 1.2 the rubber's top lay exactly on the blocks'
 * top at 1.4. Lowered 2 cm, its top is buried inside the block where they
 * overlap and its wear strip still straddles the block top.
 */
export const DOCK_WEAR_BUMPER = { x: 2, y: 1.18 } as const;

/**
 * The red stop bar across the apron. 4.2-4.6: clear of the slab at 4.1 and of
 * the yard cones (0.4 m bases at u 5, x +/-6 and +/-8) and dock bollards
 * (0.25 m radius at u 5, x +/-5.5) by 15 cm or more.
 */
export const DOCK_STOP_BAR = { u: 4.4, depth: 0.4, width: 14 } as const;

/** Where every other mark begins: the stop bar's outboard edge. */
export const DOCK_PAINT_START_U = DOCK_STOP_BAR.u + DOCK_STOP_BAR.depth / 2;

/**
 * Minimum width for a long thin ground line. 0.08-0.15 m lines resolved to
 * under a pixel at review distance and broke into dashes - aliasing that reads
 * exactly like z-fighting.
 */
export const DOCK_LINE_WIDTH = 0.25;

export interface DockMarking {
  readonly id: string;
  /** Centre x, dock-local. */
  readonly x: number;
  readonly width: number;
  readonly u0: number;
  readonly u1: number;
  readonly color: string;
  /** Omitted for opaque paint. */
  readonly opacity?: number;
}

const BAY_U1 = DOCK_PAINT_START_U + 10;
/**
 * The staging box starts 1 m past the bar so the yard cone at (-6, u 5) and
 * the bollard at (-5.5, u 5) stand beside it rather than on its edge line.
 */
const STAGING_U0 = DOCK_PAINT_START_U + 1;
const STAGING_U1 = STAGING_U0 + 5;

export const DOCK_FLOOR_MARKINGS: readonly DockMarking[] = [
  { id: 'bay', x: 0, width: 3, u0: DOCK_PAINT_START_U, u1: BAY_U1, color: '#22c55e', opacity: 0.3 },
  {
    id: 'bay-edge-west',
    x: -1.5,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: '#22c55e',
  },
  {
    id: 'bay-edge-east',
    x: 1.5,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: '#22c55e',
  },
  {
    id: 'forklift-lane',
    x: 3,
    width: 1.5,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: '#3b82f6',
    opacity: 0.3,
  },
  {
    id: 'staging',
    x: -4,
    width: 4,
    u0: STAGING_U0,
    u1: STAGING_U1,
    color: '#fbbf24',
    opacity: 0.2,
  },
  {
    id: 'staging-edge-west',
    x: -6,
    width: DOCK_LINE_WIDTH,
    u0: STAGING_U0,
    u1: STAGING_U1,
    color: '#fbbf24',
  },
  {
    id: 'staging-edge-east',
    x: -2,
    width: DOCK_LINE_WIDTH,
    u0: STAGING_U0,
    u1: STAGING_U1,
    color: '#fbbf24',
  },
];

/**
 * Where the docked tractor's front plate stands, in u: the trailer's rear on
 * the bumper face, the tractor ahead of it (truckController's dock pose).
 */
export const DOCKED_TRACTOR_NOSE_U =
  DOCK_BUMPER_FACE_Z + TRAILER_REAR_OVERHANG + 0.02 + TRACTOR_FRONT_OVERHANG - 50;

/**
 * The red KEEP CLEAR zone and its label: the docked tractor's pull-out path,
 * just beyond its nose. It sat at u 14.6-16.6, under the docked tractor's
 * engine, where it protected nothing and hid the truck's oil stain.
 */
export const DOCK_KEEP_CLEAR = {
  id: 'keep-clear',
  x: 0,
  width: 5,
  u0: Math.round((DOCKED_TRACTOR_NOSE_U + 0.6) * 10) / 10,
  u1: Math.round((DOCKED_TRACTOR_NOSE_U + 2.6) * 10) / 10,
  color: '#ef4444',
  opacity: 0.25,
} as const satisfies DockMarking;

/** Blue truck guide lines at x 0 and +/-4, stopping short of KEEP CLEAR. */
export const DOCK_GUIDE_LINES = {
  xs: [0, -4, 4],
  width: DOCK_LINE_WIDTH,
  u0: DOCK_PAINT_START_U,
  u1: DOCK_KEEP_CLEAR.u0 - 0.3,
} as const;

/** Yellow warning stripes at x +/-2.1 where the old sunken groove ran. */
export const DOCK_GROOVE_STRIPES = {
  xs: [-2.1, 2.1],
  width: 0.3,
  u0: DOCK_PAINT_START_U,
  u1: 17,
} as const;

/** The green laser alignment lines; their projectors stand at u 16. */
export const DOCK_LASER_GUIDES = { u0: DOCK_PAINT_START_U, u1: 16.5 } as const;

/** Centre and length of a run in u. */
export const spanOf = (run: { readonly u0: number; readonly u1: number }) => ({
  centre: (run.u0 + run.u1) / 2,
  length: run.u1 - run.u0,
});

/**
 * Night light on the apron, where the trucks and forklifts work. The yard's
 * four poles stand on its perimeter (x +/-30), so at 22:00 the dock front was
 * the darkest working ground on the site. Two wall-pack floods either side of
 * the door, above the status lamps and clear of the 9.7 m door frame, throw
 * one pool each across the truck lane, from the stop bar to KEEP CLEAR
 * beyond the docked tractor (a 5.6 m head throws about twice its height).
 * No light source: lenses and additive pools on the shared lamp level, as the
 * yard poles are drawn on medium (see `useYardLampsEnabled` in TruckBay.tsx).
 */
export const DOCK_FLOOD_HEADS = { xs: [-6.2, 6.2], y: 5.6, u: -1.55 } as const;
export const DOCK_FLOOD_POOLS = [
  { x: -2.6, u: 10.5, radius: 11 },
  { x: 2.6, u: 10.5, radius: 11 },
] as const;

/**
 * The yard's four perimeter masts (TruckBay.tsx, 14 m poles at x +/-30). Their
 * pool was 10 m, a street post's throw, so at 22:00 the middle of the 60 m
 * yard was untouched navy. A mast flood throws about 1.3x its height.
 */
export const YARD_MAST = { height: 14, poolRadius: 18 } as const;

/**
 * The dock door frame (`dockDoorFrame` GLB, measured): 9.7 m wide, top at
 * y 5.25, 0.286 m deep, its centre plane at dock-local z -1.8 + 0.0425.
 */
export const DOCK_DOOR_FRAME = { halfWidth: 4.85, top: 5.25, z: -1.7575, depth: 0.286 } as const;

/**
 * The dock's name and its dock number, painted on a board standing on the door
 * frame's head. Both lines used to float in the open bay over the door at y 6
 * and 4.5 with nothing behind them ("SHIPPING" and "DOCK 1 - OUTBOUND" read as
 * HUD text in shipping and logistics-close), and the lower line lay across the
 * rolled-up door (4.1-4.9 m when open).
 */
export const DOCK_FACADE_BOARD = {
  width: 6.8,
  bottom: DOCK_DOOR_FRAME.top - 0.02,
  top: DOCK_DOOR_FRAME.top + 2.08,
  z: DOCK_DOOR_FRAME.z,
  depth: 0.12,
} as const;

export const DOCK_FACADE_LINES = {
  title: { y: 6.62, fontSize: 0.95 },
  subtitle: { y: 5.72, fontSize: 0.42 },
  z: DOCK_FACADE_BOARD.z + DOCK_FACADE_BOARD.depth / 2 + 0.012,
} as const;
