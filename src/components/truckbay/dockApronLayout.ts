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

/**
 * The yard face of each platform section, armoured as a dock face is:
 * laminated rubber bumper pads bolted to steel backing plates, a steel nosing
 * angle along the top edge and steel angles down both vertical edges. final5
 * logistics-close (rubric backlog 8) read the two faces either side of the
 * forklift channel as plain dark blocks at the foot of the dock door. At
 * ~70 px/m there, a pad is 18 px wide and its grooves 1 px.
 */
export const DOCK_PLATFORM_DRESSING = {
  pad: {
    xs: [-0.68, 0.68],
    y: 1.3,
    width: 0.26,
    laminations: 5,
    lamination: 0.088,
    groove: 0.016,
    proud: 0.11,
  },
  backing: { width: 0.4, height: 0.64, thickness: 0.02 },
  lip: { height: 0.1, depth: 0.1, proud: 0.012, above: 0.006 },
  corner: { size: 0.08, proud: 0.008 },
} as const;

/**
 * The platform body's finish and arrises. final7 logistics-close (`dock_pair`)
 * still read both sections as sharp-edged boxes: the nosing and corner angles
 * were there, but at metal 0.55 in the dock's shade they sampled (0, 22, 40),
 * the body's own navy. The angles are now a light painted steel, a dielectric
 * so they do not take the dark hall's reflection, and the body's twelve
 * arrises are a 45 mm round (about 3 px at logistics-close) that catches its own
 * light line.
 */
export const DOCK_PLATFORM_BODY_COLOR = '#475569';
export const DOCK_PLATFORM_BEVEL = { radius: 0.045, segments: 2 } as const;
export const DOCK_FACE_STEEL_FINISH = {
  color: '#b3b8b9',
  roughness: 0.5,
  metalness: 0,
} as const;

export type DockDressingPart = ShelterPart & { readonly kind: 'rubber' | 'steel' };

/**
 * Every dressing part on one platform section's yard face, in the section's
 * own frame: x and z about its centre (the face is at z = depth / 2), y from
 * the ground.
 */
export function dockPlatformDressingParts(): DockDressingPart[] {
  const { pad, backing, lip, corner } = DOCK_PLATFORM_DRESSING;
  const { width, height, depth } = DOCK_PLATFORM_SECTION;
  const face = depth / 2;
  const parts: DockDressingPart[] = [];
  // Nosing angle along the top edge, a little proud of the face and the deck.
  parts.push({
    kind: 'steel',
    position: [0, height + lip.above - lip.height / 2, face + lip.proud - lip.depth / 2],
    scale: [width + 2 * corner.proud, lip.height, lip.depth],
  });
  // Corner angles down both vertical edges, stopping 4 mm under the nosing
  // so no two steel faces share a plane.
  const cornerTop = height + lip.above - lip.height - 0.004;
  for (const side of [-1, 1])
    parts.push({
      kind: 'steel',
      position: [
        side * (width / 2 + corner.proud - corner.size / 2),
        cornerTop / 2,
        face + corner.proud - corner.size / 2,
      ],
      scale: [corner.size, cornerTop, corner.size],
    });
  const padHeight = pad.laminations * pad.lamination + (pad.laminations - 1) * pad.groove;
  for (const x of pad.xs) {
    parts.push({
      kind: 'steel',
      position: [x, pad.y, face + backing.thickness / 2],
      scale: [backing.width, backing.height, backing.thickness],
    });
    for (let i = 0; i < pad.laminations; i += 1)
      parts.push({
        kind: 'rubber',
        position: [
          x,
          pad.y - padHeight / 2 + pad.lamination / 2 + i * (pad.lamination + pad.groove),
          face + backing.thickness + pad.proud / 2,
        ],
        scale: [pad.width, pad.lamination, pad.proud],
      });
  }
  return parts;
}

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
 * The dock shelter's pads, in each pad's own frame (centred; +z toward the
 * yard): two side pads 0.3 x 3.5 x 3 and a head pad 4.1 x 0.3 x 3. final4
 * logistics-close read them as untreated dark boxes either side of the ribbed
 * door. A shelter's pads are fabric over foam, folded: each now carries proud
 * pleat folds across its long faces (2 cm proud of every face they cross,
 * 0.25 m apart, about 10 px at logistics-close), and each side pad a yellow
 * guide stripe down its yard face, as drivers back onto.
 */
export const DOCK_SHELTER_PAD = {
  side: { width: 0.3, height: 3.5, depth: 3 },
  head: { width: 4.1, height: 0.3, depth: 3 },
} as const;
export const DOCK_SHELTER_PLEAT = { pitch: 0.25, thickness: 0.06, proud: 0.02 } as const;

/** One fold, as a box centre and size in its pad's frame. */
export interface ShelterPart {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

const pleatOffsets = (span: number): number[] => {
  const count = Math.floor((span - 0.2) / DOCK_SHELTER_PLEAT.pitch) + 1;
  const first = -((count - 1) * DOCK_SHELTER_PLEAT.pitch) / 2;
  return Array.from({ length: count }, (_, i) => first + i * DOCK_SHELTER_PLEAT.pitch);
};

/** Folds across a side pad: horizontal, wrapping both long faces and the yard face. */
export const DOCK_SHELTER_SIDE_PLEATS: readonly ShelterPart[] = pleatOffsets(
  DOCK_SHELTER_PAD.side.height
).map((y) => ({
  position: [0, y, 0],
  scale: [
    DOCK_SHELTER_PAD.side.width + 2 * DOCK_SHELTER_PLEAT.proud,
    DOCK_SHELTER_PLEAT.thickness,
    DOCK_SHELTER_PAD.side.depth + 2 * DOCK_SHELTER_PLEAT.proud,
  ],
}));

/** Folds across the head pad: running front to back, wrapping its underside and yard face. */
export const DOCK_SHELTER_HEAD_PLEATS: readonly ShelterPart[] = pleatOffsets(
  DOCK_SHELTER_PAD.head.width
).map((x) => ({
  position: [x, 0, 0],
  scale: [
    DOCK_SHELTER_PLEAT.thickness,
    DOCK_SHELTER_PAD.head.height + 2 * DOCK_SHELTER_PLEAT.proud,
    DOCK_SHELTER_PAD.head.depth + 2 * DOCK_SHELTER_PLEAT.proud,
  ],
}));

/** The yellow guide stripe down each side pad's yard face, standing off the folds. */
export const DOCK_SHELTER_GUIDE_STRIPE: ShelterPart = {
  position: [0, 0, DOCK_SHELTER_PAD.side.depth / 2 + DOCK_SHELTER_PLEAT.proud + 0.015],
  scale: [0.18, DOCK_SHELTER_PAD.side.height - 0.2, 0.02],
};

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

/**
 * One painted rectangle on the apron, in plan: centre `x`, `width` across, and
 * `u0`-`u1` outward. Every mark is a line - narrow in x (it runs outward) or
 * narrow in u (it runs across) - and every one is opaque paint.
 */
export interface DockMarking {
  readonly id: string;
  /** Centre x, dock-local. */
  readonly x: number;
  readonly width: number;
  readonly u0: number;
  readonly u1: number;
  readonly color: string;
}

/**
 * Weathered thermoplastic, authored as display sRGB. The saturated UI hues
 * these replaced (#22c55e, #3b82f6, #fbbf24, #ef4444) read as screen colours
 * laid over the concrete.
 */
export const DOCK_PAINT = {
  green: '#3f9a5c',
  blue: '#3f6fae',
  yellow: '#d9ad3c',
  red: '#b8392f',
} as const;

const BAY_U1 = DOCK_PAINT_START_U + 10;
/**
 * The staging box starts 1 m past the bar so the yard cone at (-6, u 5) and
 * the bollard at (-5.5, u 5) stand beside it rather than on its edge line.
 */
const STAGING_U0 = DOCK_PAINT_START_U + 1;
const STAGING_U1 = STAGING_U0 + 5;
/** Box ends run between the two side lines, so no corner is painted twice. */
const STAGING_END_WIDTH = 4 - DOCK_LINE_WIDTH;

/**
 * THE DOCK APRON PAINT, AS PAINT.
 *
 * The truck bay, the walkway and the staging box used to be translucent
 * colour fills (opacity 0.2-0.3) with their edge lines, two half-opacity blue
 * guides at x +/-4 running through the staging box, yellow "groove" stripes at
 * x +/-2.1 left from a sunken groove long since removed, and (on ultra) three
 * pulsing green "laser" lines over the bay centre. Seen across the apron they
 * overlapped into a see-through rainbow that every review read as an AR
 * overlay. Real dock paint is opaque lines on concrete: each area is now its
 * outline, no mark lies on another (`dockApronLayout.test.ts`), and the paint
 * is lit and worn (`DockPaintLine` in TruckBay.tsx).
 */
export const DOCK_FLOOR_MARKINGS: readonly DockMarking[] = [
  {
    id: 'bay-edge-west',
    x: -1.5,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: DOCK_PAINT.green,
  },
  {
    id: 'bay-edge-east',
    x: 1.5,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: DOCK_PAINT.green,
  },
  {
    id: 'walkway-edge-inner',
    x: 2.25,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: DOCK_PAINT.blue,
  },
  {
    id: 'walkway-edge-outer',
    x: 3.75,
    width: DOCK_LINE_WIDTH,
    u0: DOCK_PAINT_START_U,
    u1: BAY_U1,
    color: DOCK_PAINT.blue,
  },
  {
    id: 'staging-edge-west',
    x: -6,
    width: DOCK_LINE_WIDTH,
    u0: STAGING_U0,
    u1: STAGING_U1,
    color: DOCK_PAINT.yellow,
  },
  {
    id: 'staging-edge-east',
    x: -2,
    width: DOCK_LINE_WIDTH,
    u0: STAGING_U0,
    u1: STAGING_U1,
    color: DOCK_PAINT.yellow,
  },
  {
    id: 'staging-edge-near',
    x: -4,
    width: STAGING_END_WIDTH,
    u0: STAGING_U0,
    u1: STAGING_U0 + DOCK_LINE_WIDTH,
    color: DOCK_PAINT.yellow,
  },
  {
    id: 'staging-edge-far',
    x: -4,
    width: STAGING_END_WIDTH,
    u0: STAGING_U1 - DOCK_LINE_WIDTH,
    u1: STAGING_U1,
    color: DOCK_PAINT.yellow,
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
  color: DOCK_PAINT.red,
} as const satisfies DockMarking;

/** KEEP CLEAR is a painted box with its words inside, not a tinted rectangle. */
export const DOCK_KEEP_CLEAR_OUTLINE: readonly DockMarking[] = (() => {
  const { x, width, u0, u1, color } = DOCK_KEEP_CLEAR;
  const line = DOCK_LINE_WIDTH;
  return [
    { id: 'keep-clear-near', x, width, u0, u1: u0 + line, color },
    { id: 'keep-clear-far', x, width, u0: u1 - line, u1, color },
    ...[-1, 1].map((side) => ({
      id: `keep-clear-side-${side < 0 ? 'west' : 'east'}`,
      x: x + side * (width / 2 - line / 2),
      width: line,
      u0: u0 + line,
      u1: u1 - line,
      color,
    })),
  ];
})();

/**
 * The blue truck guide line down the bay centre, stopping short of KEEP CLEAR.
 * The two at x +/-4 ran through the staging box and beside the walkway.
 */
export const DOCK_GUIDE_LINES = {
  xs: [0],
  width: DOCK_LINE_WIDTH,
  u0: DOCK_PAINT_START_U,
  u1: DOCK_KEEP_CLEAR.u0 - 0.3,
} as const;

/** Where the (decorative, ultra-only) laser projectors stand, in u. */
export const DOCK_LASER_PROJECTOR_U = 16;

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
 * The dock's name and its dock number, painted on a board carried on two
 * posts off the door frame's head. Both lines used to float in the open bay
 * over the door at y 6 and 4.5 with nothing behind them ("SHIPPING" and
 * "DOCK 1 - OUTBOUND" read as HUD text in shipping and logistics-close), and
 * the lower line lay across the rolled-up door (4.1-4.9 m when open).
 *
 * The board then stood ON the frame head, 5.23-7.31 m, and the truck canopy's
 * front edge beam (`DOCK_CANOPY`, roof edge 6.2 m at u 10.7) crossed it from
 * the yard: seen from logistics-close (eye 3.8 m) the beam covers the board
 * plane up to about 6.9 m, which took the lower half of "SHIPPING" (worst at
 * 18:30), and from the shipping camera (eye 9 m) the roof hid the subtitle.
 * Every line clears from 6.55 m up (`dockApronLayout.test.ts` ray-casts the
 * canopy model); the board starts at 7.0 for margin.
 */
const DOCK_FACADE_BOARD_BOTTOM = 7.0;
export const DOCK_FACADE_BOARD = {
  width: 6.8,
  bottom: DOCK_FACADE_BOARD_BOTTOM,
  top: DOCK_FACADE_BOARD_BOTTOM + 2.1,
  z: DOCK_DOOR_FRAME.z,
  depth: 0.12,
} as const;

/**
 * The board's edge trim: 4 cm proud of the rim, inset 1 cm behind BOTH faces.
 * It used to sit 1 cm toward the hall at 2 cm less depth, which put its
 * hall-side face exactly on the board's and z-fought into a jagged dark fringe
 * seen through the glazing from inside (milling, packing).
 */
export const DOCK_FACADE_TRIM = {
  width: DOCK_FACADE_BOARD.width + 0.08,
  height: DOCK_FACADE_BOARD.top - DOCK_FACADE_BOARD.bottom + 0.08,
  z: DOCK_FACADE_BOARD.z,
  depth: DOCK_FACADE_BOARD.depth - 0.02,
} as const;

/**
 * The board's two posts: steel standing on the door frame's head (sunk 2 cm),
 * 6 cm up into the board, and shallower than the edge trim so no face of a
 * post lies on a face of the board or trim.
 */
export const DOCK_FACADE_POSTS = {
  xs: [-2.6, 2.6],
  width: 0.14,
  depth: 0.08,
  bottom: DOCK_DOOR_FRAME.top - 0.02,
  top: DOCK_FACADE_BOARD.bottom + 0.06,
  z: DOCK_FACADE_BOARD.z,
} as const;

export const DOCK_FACADE_LINES = {
  title: { y: DOCK_FACADE_BOARD.bottom + 1.39, fontSize: 0.95 },
  subtitle: { y: DOCK_FACADE_BOARD.bottom + 0.49, fontSize: 0.42 },
  z: DOCK_FACADE_BOARD.z + DOCK_FACADE_BOARD.depth / 2 + 0.012,
} as const;
