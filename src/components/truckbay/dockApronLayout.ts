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

/** The red KEEP CLEAR zone and its label, at the outboard end of the bay. */
export const DOCK_KEEP_CLEAR = {
  id: 'keep-clear',
  x: 0,
  width: 5,
  u0: BAY_U1,
  u1: BAY_U1 + 2,
  color: '#ef4444',
  opacity: 0.25,
} as const satisfies DockMarking;

/** Blue truck guide lines at x 0 and +/-4. */
export const DOCK_GUIDE_LINES = {
  xs: [0, -4, 4],
  width: DOCK_LINE_WIDTH,
  u0: DOCK_PAINT_START_U,
  u1: 20,
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
