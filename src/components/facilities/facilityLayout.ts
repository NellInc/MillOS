import type { Vec3Tuple } from '../../constants/siteLayout';

/**
 * THE MILL'S STAFF FACILITIES: two single-storey blocks built inside the hall.
 *
 * A flour mill keeps its welfare rooms and its office on the working floor,
 * where the people are, and this hall has exactly one bay where they fit: the
 * open floor between the packing cell (conveyors at z -20.5) and the south
 * walkway (z -37.25). The receiving dock apron (x -9 to 9, down to z -30) runs
 * through the middle of it, so there are two blocks, one either side of the
 * dock's axis, each with its doors on its north face, onto open floor and away
 * from the forklift lanes.
 *
 * - WELFARE (west): toilets with an accessible WC beside them, a locker and
 *   changing room, and the staff room with its kitchenette. The west service
 *   door and the tea benches on the west aisle are its neighbours.
 * - OFFICE (east): the mill manager's office, whose north window looks across
 *   the packing line, a meeting room and a first-aid room.
 *
 * Everything is in world metres. Walls are named by their centre line; a wall
 * is `FACILITY_WALL` thick. Every opening is in plan along its wall. The whole
 * layout is plain data so `facilityLayout.test.ts` can hold it against the
 * forklift routes, walkways, machines, belts, hall dressing, residents' walks,
 * portals and cameras without rendering anything, and `facilityGeometry.ts`
 * draws exactly these numbers.
 *
 * Access: the hall floor is level and so is every room (the floor finishes are
 * 12 mm sheets laid on it; no step, no ramp is needed). Door openings are
 * 1.1 m structural, which leaves 0.98 m clear between the frames with the leaf
 * standing open. The accessible WC follows the UK Approved Document M layout:
 * a 1.5 m turning circle clear of every fitting, the pan 450 mm from the side
 * wall with its front 750 mm from the back wall, a drop-down rail on the
 * transfer side, a lowered basin within reach of the pan, an emergency pull
 * cord reaching to the floor and a door that opens outward.
 */

export const FACILITY_WALL = 0.15;
/** Half the wall plus the 12 mm lining and its 3 mm standoff. */
export const FACILITY_LINING_INSET = FACILITY_WALL / 2 + 0.015;
/** Top of every partition and underside of the roof deck. */
export const FACILITY_DECK_BOTTOM = 2.95;
export const FACILITY_DECK_TOP = 3.15;
/** Top of the outer walls, which stand up round the deck as a parapet. */
export const FACILITY_PARAPET_TOP = 3.45;
/** Underside of each room's ceiling lining. */
export const FACILITY_CEILING = 2.88;
export const FACILITY_DOOR_HEAD = 2.1;
/** Structural door opening, frame to frame. */
export const FACILITY_DOOR_OPENING = 1.1;
/** Door frame (lining) width inside the opening, each side. */
export const FACILITY_DOOR_JAMB = 0.04;
export const FACILITY_DOOR_LEAF = { width: 1.0, thickness: 0.045 } as const;
/** Clear width with the leaf open at a right angle: frames and leaf thickness off. */
export const FACILITY_DOOR_CLEAR_WIDTH =
  FACILITY_DOOR_OPENING - 2 * FACILITY_DOOR_JAMB - FACILITY_DOOR_LEAF.thickness;
/** Room floor finishes: 12 mm sheets on the hall slab. */
export const FACILITY_FLOOR_TOP = 0.012;

export interface PlanRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type FacilityBlockId = 'welfare' | 'office';

export interface FacilityBlock extends PlanRect {
  readonly id: FacilityBlockId;
}

/** Wall centre lines of the two blocks. */
export const FACILITY_BLOCKS: readonly FacilityBlock[] = [
  { id: 'welfare', minX: -25.0, maxX: -10.6, minZ: -36.6, maxZ: -28.6 },
  { id: 'office', minX: 10.6, maxX: 25.0, minZ: -34.6, maxZ: -28.6 },
];

export type FacilityRoomId =
  | 'toilets'
  | 'accessible-wc'
  | 'lockers'
  | 'staff-room'
  | 'manager-office'
  | 'meeting-room'
  | 'first-aid';

export type FacilityFloorFinish = 'oak' | 'tile' | 'safety-vinyl' | 'carpet';
export type FacilityWallFinish = 'staff' | 'tiled' | 'lockers' | 'office' | 'meeting' | 'clinic';

export interface FacilityRoom extends PlanRect {
  readonly id: FacilityRoomId;
  readonly block: FacilityBlockId;
  readonly floor: FacilityFloorFinish;
  readonly walls: FacilityWallFinish;
  /** Suspended grid ceiling rather than a plain plastered one. */
  readonly gridCeiling: boolean;
}

/** Room plans on wall centre lines. */
export const FACILITY_ROOMS: readonly FacilityRoom[] = [
  {
    id: 'toilets',
    block: 'welfare',
    minX: -25.0,
    maxX: -20.2,
    minZ: -31.6,
    maxZ: -28.6,
    floor: 'tile',
    walls: 'tiled',
    gridCeiling: false,
  },
  {
    id: 'accessible-wc',
    block: 'welfare',
    minX: -20.2,
    maxX: -17.4,
    minZ: -31.6,
    maxZ: -28.6,
    floor: 'safety-vinyl',
    walls: 'tiled',
    gridCeiling: false,
  },
  {
    id: 'lockers',
    block: 'welfare',
    minX: -25.0,
    maxX: -17.4,
    minZ: -36.6,
    maxZ: -31.6,
    floor: 'safety-vinyl',
    walls: 'lockers',
    gridCeiling: false,
  },
  {
    id: 'staff-room',
    block: 'welfare',
    minX: -17.4,
    maxX: -10.6,
    minZ: -36.6,
    maxZ: -28.6,
    floor: 'oak',
    walls: 'staff',
    gridCeiling: false,
  },
  {
    id: 'manager-office',
    block: 'office',
    minX: 10.6,
    maxX: 16.6,
    minZ: -34.6,
    maxZ: -28.6,
    floor: 'carpet',
    walls: 'office',
    gridCeiling: true,
  },
  {
    id: 'meeting-room',
    block: 'office',
    minX: 16.6,
    maxX: 21.4,
    minZ: -34.6,
    maxZ: -28.6,
    floor: 'carpet',
    walls: 'meeting',
    gridCeiling: true,
  },
  {
    id: 'first-aid',
    block: 'office',
    minX: 21.4,
    maxX: 25.0,
    minZ: -34.6,
    maxZ: -28.6,
    floor: 'safety-vinyl',
    walls: 'clinic',
    gridCeiling: true,
  },
];

/** The room's clear interior: inside the wall linings. */
export function roomInterior(room: PlanRect): PlanRect {
  const i = FACILITY_LINING_INSET;
  return { minX: room.minX + i, maxX: room.maxX - i, minZ: room.minZ + i, maxZ: room.maxZ - i };
}

export const facilityRoom = (id: FacilityRoomId): FacilityRoom =>
  FACILITY_ROOMS.find((room) => room.id === id)!;

export type FacilityOpeningKind = 'door' | 'window' | 'obscured-window';

export interface FacilityOpening {
  readonly id: string;
  readonly kind: FacilityOpeningKind;
  /** Plan extent along the wall's run. */
  readonly from: number;
  readonly to: number;
  /** Bottom and top of the opening (a door's sill is the floor). */
  readonly sill: number;
  readonly head: number;
}

/**
 * A door: the side of the opening its leaf hangs from, and which way it opens
 * (`+1` toward the wall's +normal side, `-1` toward the other).
 */
export interface FacilityDoor extends FacilityOpening {
  readonly kind: 'door';
  readonly hinge: 'from' | 'to';
  readonly swing: 1 | -1;
  /** The room it serves (signage, approach). */
  readonly room: FacilityRoomId;
}

export interface FacilityWallLine {
  readonly id: string;
  readonly block: FacilityBlockId;
  /** 'x': the wall runs along x at a fixed z; 'z': along z at a fixed x. */
  readonly runs: 'x' | 'z';
  /** The fixed coordinate (its centre line). */
  readonly at: number;
  /** Plan extent of the run, already trimmed or extended at the corners. */
  readonly from: number;
  readonly to: number;
  /** Outer walls rise to the parapet; partitions stop at the deck. */
  readonly outer: boolean;
  readonly openings: readonly (FacilityOpening | FacilityDoor)[];
}

const H = FACILITY_WALL / 2;
const door = (
  id: string,
  room: FacilityRoomId,
  centre: number,
  hinge: 'from' | 'to',
  swing: 1 | -1
): FacilityDoor => ({
  id,
  kind: 'door',
  room,
  from: centre - FACILITY_DOOR_OPENING / 2,
  to: centre + FACILITY_DOOR_OPENING / 2,
  sill: 0,
  head: FACILITY_DOOR_HEAD,
  hinge,
  swing,
});
const window = (
  id: string,
  from: number,
  to: number,
  sill = 0.9,
  head = 2.2,
  kind: 'window' | 'obscured-window' = 'window'
): FacilityOpening => ({ id, kind, from, to, sill, head });

/**
 * Walls along x run the full length of the block, corners included; walls along
 * z stop at their faces, so no two wall boxes share a volume.
 */
export const FACILITY_WALLS: readonly FacilityWallLine[] = [
  // ---- Welfare block ----------------------------------------------------
  {
    id: 'welfare-north',
    block: 'welfare',
    runs: 'x',
    at: -28.6,
    from: -25.0 - H,
    to: -10.6 + H,
    outer: true,
    openings: [
      window('toilets-high', -24.4, -22.75, 1.7, 2.2, 'obscured-window'),
      // Inward, hinged at its east frame; the vanity is opposite.
      door('toilets-door', 'toilets', -21.65, 'to', -1),
      // Outward into the hall (Approved Document M), hinged at its east frame.
      door('accessible-wc-door', 'accessible-wc', -19.5, 'to', 1),
      door('staff-room-door', 'staff-room', -16.6, 'from', -1),
      window('staff-room-north', -15.4, -11.3),
    ],
  },
  {
    id: 'welfare-south',
    block: 'welfare',
    runs: 'x',
    at: -36.6,
    from: -25.0 - H,
    to: -10.6 + H,
    outer: true,
    openings: [
      // East of the south locker bank, which stands 1.85 m tall to x -21.87.
      window('lockers-high', -21.6, -18.2, 1.7, 2.2, 'obscured-window'),
      // Over the kitchenette sink.
      window('staff-room-sink', -15.75, -14.25, 1.2, 2.2),
    ],
  },
  {
    id: 'welfare-west',
    block: 'welfare',
    runs: 'z',
    at: -25.0,
    from: -36.6 + H,
    to: -28.6 - H,
    outer: true,
    openings: [],
  },
  {
    id: 'welfare-east',
    block: 'welfare',
    runs: 'z',
    at: -10.6,
    from: -36.6 + H,
    to: -28.6 - H,
    outer: true,
    openings: [window('staff-room-east', -33.2, -29.4)],
  },
  {
    id: 'welfare-toilets-lockers',
    block: 'welfare',
    runs: 'x',
    at: -31.6,
    from: -25.0 + H,
    to: -17.4 - H,
    outer: false,
    openings: [],
  },
  {
    id: 'welfare-toilets-accessible',
    block: 'welfare',
    runs: 'z',
    at: -20.2,
    from: -31.6 + H,
    to: -28.6 - H,
    outer: false,
    openings: [],
  },
  {
    id: 'welfare-staff-room-west',
    block: 'welfare',
    runs: 'z',
    at: -17.4,
    from: -36.6 + H,
    to: -28.6 - H,
    outer: false,
    // The lockers open off the staff room, as a changing room does.
    openings: [door('lockers-door', 'lockers', -34.9, 'from', -1)],
  },
  // ---- Office block -----------------------------------------------------
  {
    id: 'office-north',
    block: 'office',
    runs: 'x',
    at: -28.6,
    from: 10.6 - H,
    to: 25.0 + H,
    outer: true,
    openings: [
      // The manager's window onto the packing floor.
      window('manager-office-north', 11.1, 14.6, 0.85, 2.25),
      door('manager-office-door', 'manager-office', 15.65, 'to', -1),
      window('meeting-room-north', 16.95, 19.4),
      door('meeting-room-door', 'meeting-room', 20.5, 'to', -1),
      door('first-aid-door', 'first-aid', 22.3, 'from', -1),
      window('first-aid-north', 23.3, 24.6, 1.05, 2.2),
    ],
  },
  {
    id: 'office-south',
    block: 'office',
    runs: 'x',
    at: -34.6,
    from: 10.6 - H,
    to: 25.0 + H,
    outer: true,
    openings: [],
  },
  {
    id: 'office-west',
    block: 'office',
    runs: 'z',
    at: 10.6,
    from: -34.6 + H,
    to: -28.6 - H,
    outer: true,
    openings: [window('manager-office-west', -33.2, -30.0, 0.85, 2.25)],
  },
  {
    id: 'office-east',
    block: 'office',
    runs: 'z',
    at: 25.0,
    from: -34.6 + H,
    to: -28.6 - H,
    outer: true,
    openings: [window('first-aid-east', -32.6, -30.8, 1.05, 2.2)],
  },
  {
    id: 'office-meeting-west',
    block: 'office',
    runs: 'z',
    at: 16.6,
    from: -34.6 + H,
    to: -28.6 - H,
    outer: false,
    openings: [],
  },
  {
    id: 'office-meeting-east',
    block: 'office',
    runs: 'z',
    at: 21.4,
    from: -34.6 + H,
    to: -28.6 - H,
    outer: false,
    openings: [],
  },
];

export const FACILITY_DOORS: readonly (FacilityDoor & { readonly wall: FacilityWallLine })[] =
  FACILITY_WALLS.flatMap((wall) =>
    wall.openings
      .filter((opening): opening is FacilityDoor => opening.kind === 'door')
      .map((d) => ({ ...d, wall }))
  );

/** Plan box of a wall's run between `from` and `to`. */
export function wallPlan(wall: FacilityWallLine, from = wall.from, to = wall.to): PlanRect {
  return wall.runs === 'x'
    ? { minX: from, maxX: to, minZ: wall.at - H, maxZ: wall.at + H }
    : { minX: wall.at - H, maxX: wall.at + H, minZ: from, maxZ: to };
}

/** Plan point at `along` on the wall's centre line, `across` toward +normal. */
export function wallPoint(wall: FacilityWallLine, along: number, across = 0): [number, number] {
  return wall.runs === 'x' ? [along, wall.at + across] : [wall.at + across, along];
}

/**
 * Where a person stands to go through each door, 0.9 m either side of the wall
 * on the door's centre line: `outside` is the way they came from (the hall for
 * every north-face door, the staff room for the lockers), `inside` is in the
 * room. Every door is in a wall whose +normal side is that way in, so it is
 * the same arithmetic for all of them. Exported for anyone routing people.
 */
export const FACILITY_DOOR_APPROACHES: readonly {
  readonly door: string;
  readonly room: FacilityRoomId;
  readonly outside: Vec3Tuple;
  readonly inside: Vec3Tuple;
}[] = FACILITY_DOORS.map((d) => {
  const mid = (d.from + d.to) / 2;
  const [ox, oz] = wallPoint(d.wall, mid, 0.9);
  const [ix, iz] = wallPoint(d.wall, mid, -0.9);
  return { door: d.id, room: d.room, outside: [ox, 0, oz], inside: [ix, 0, iz] };
});

// ---------------------------------------------------------------------------
// Fixtures that people can sit at or must walk round
// ---------------------------------------------------------------------------

/** A solid fitting, in plan, with its height (for the walking model and tests). */
export interface FacilitySolid extends PlanRect {
  readonly id: string;
  readonly room: FacilityRoomId | 'hall';
  readonly height: number;
}

/** Seats a person can use, facing `rotation` (three.js yaw; 0 faces +z). */
export interface FacilitySeat {
  readonly id: string;
  readonly room: FacilityRoomId;
  readonly position: Vec3Tuple;
  readonly rotation: number;
  readonly kind: 'chair' | 'sofa' | 'armchair' | 'bench' | 'desk-chair';
}

const PI = Math.PI;
const staff = roomInterior(facilityRoom('staff-room'));
const lockers = roomInterior(facilityRoom('lockers'));
const toilets = roomInterior(facilityRoom('toilets'));
const accessible = roomInterior(facilityRoom('accessible-wc'));
const office = roomInterior(facilityRoom('manager-office'));
const meeting = roomInterior(facilityRoom('meeting-room'));
const firstAid = roomInterior(facilityRoom('first-aid'));

/** Staff-room plan: the kitchenette along the south wall, two tables, a sofa corner. */
export const STAFF_ROOM = {
  interior: staff,
  /** Base units (and the lowered, knee-space section at their west end). */
  counter: { minX: staff.minX, maxX: -12.9, minZ: staff.minZ, maxZ: staff.minZ + 0.6 },
  /** Accessible section: worktop at 760 mm, open below for a wheelchair. */
  loweredCounter: { minX: staff.minX, maxX: staff.minX + 1.0 },
  worktopTop: 0.9,
  loweredWorktopTop: 0.76,
  sinkCentreX: -15.0,
  fridge: { minX: -12.85, maxX: -12.2, minZ: staff.minZ, maxZ: staff.minZ + 0.65 },
  tables: [
    { id: 'staff-table-south', x: -14.6, z: -33.7 },
    { id: 'staff-table-north', x: -14.6, z: -31.0 },
  ],
  /** Tables are 1.2 m along x by 0.8 m. */
  tableHalf: [0.6, 0.4] as const,
  sofa: { minX: staff.maxX - 0.85, maxX: staff.maxX, minZ: -31.9, maxZ: -29.9 },
  armchair: { x: -13.05, z: -29.35 },
  coffeeTable: { x: -12.4, z: -30.9 },
  rug: { x: -12.35, z: -30.75, halfX: 1.15, halfZ: 0.95 },
} as const;

export const LOCKER_ROOM = {
  interior: lockers,
  southBank: {
    minX: lockers.minX,
    maxX: lockers.minX + 8 * 0.38,
    minZ: lockers.minZ,
    maxZ: lockers.minZ + 0.45,
  },
  westBank: { minX: lockers.minX, maxX: lockers.minX + 0.45, minZ: -35.6, maxZ: -35.6 + 8 * 0.38 },
  bench: { minX: -22.4, maxX: -20.4, minZ: -34.0, maxZ: -33.6 },
  hookRailX: [-24.3, -20.3] as const,
} as const;

export const TOILETS = {
  interior: toilets,
  /** Three cubicles along the south wall, each 1.0 m wide and 1.5 m deep. */
  cubicleFrontZ: toilets.minZ + 1.5,
  cubicleXs: [toilets.minX, toilets.minX + 1.0, toilets.minX + 2.0, toilets.minX + 3.0] as const,
  vanity: {
    minX: toilets.maxX - 1.5,
    maxX: toilets.maxX,
    minZ: toilets.minZ,
    maxZ: toilets.minZ + 0.55,
  },
} as const;

/**
 * Accessible WC (Approved Document M, figure 18): pan centre 450 mm from the
 * east wall, its front 750 mm from the back wall, the basin on the same side
 * wall within reach of the pan, the turning circle clear of all of it.
 */
export const ACCESSIBLE_WC = {
  interior: accessible,
  panCentreX: accessible.maxX - 0.45,
  panFrontZ: accessible.minZ + 0.75,
  panHalfWidth: 0.19,
  seatHeight: 0.48,
  basin: { minX: accessible.maxX - 0.4, maxX: accessible.maxX, minZ: -30.5, maxZ: -30.05 },
  basinRim: 0.72,
  /** Drop-down rail on the transfer side, 320 mm from the pan centre. */
  dropRailX: accessible.maxX - 0.45 - 0.32,
  /** The cord hangs from the ceiling beside the pan, its lower bangle 100 mm up. */
  pullCord: { x: -18.75, z: -30.95, bangles: [0.1, 0.9] as const },
  turning: { x: -19.25, z: -29.85, radius: 0.75 },
} as const;

export const MANAGER_OFFICE = {
  interior: office,
  desk: { x: 13.2, z: -32.3, halfX: 0.85, halfZ: 0.4, top: 0.74 },
  chair: { x: 13.2, z: -33.15 },
  visitorXs: [12.6, 13.8] as const,
  visitorZ: -31.3,
  shelves: [
    { minX: 10.95, maxX: 11.85 },
    { minX: 14.45, maxX: 15.35 },
  ],
  shelfDepth: 0.35,
  filing: { minX: 15.6, maxX: 16.1, minZ: office.minZ, maxZ: office.minZ + 0.62 },
  whiteboard: { minZ: -33.25, maxZ: -31.25, bottom: 0.95, top: 2.1 },
} as const;

export const MEETING_ROOM = {
  interior: meeting,
  table: { x: 19.0, z: -31.85, halfX: 0.5, halfZ: 1.1, top: 0.74 },
  chairZs: [-32.6, -31.85, -31.1] as const,
  sideboard: { minX: 17.8, maxX: 20.2, minZ: meeting.minZ, maxZ: meeting.minZ + 0.45 },
} as const;

export const FIRST_AID_ROOM = {
  interior: firstAid,
  couch: { minX: firstAid.maxX - 0.7, maxX: firstAid.maxX, minZ: -34.35, maxZ: -32.45 },
  sinkUnit: { minX: 21.9, maxX: 22.8, minZ: firstAid.minZ, maxZ: firstAid.minZ + 0.5 },
  chair: { x: 22.9, z: -31.2 },
} as const;

/** Timber planters along the north frontages, on the hall floor. */
export const FACILITY_PLANTERS: readonly PlanRect[] = [
  { minX: -15.0, maxX: -11.7, minZ: -28.525 + 0.02, maxZ: -28.525 + 0.5 },
  { minX: 11.4, maxX: 14.3, minZ: -28.525 + 0.02, maxZ: -28.525 + 0.5 },
];

export const FACILITY_SEATS: readonly FacilitySeat[] = [
  ...STAFF_ROOM.tables.flatMap((t) =>
    [-0.32, 0.32].flatMap((dx) => [
      {
        id: `${t.id}-s${dx < 0 ? 'w' : 'e'}`,
        room: 'staff-room' as const,
        position: [t.x + dx, 0, t.z - 0.62] as Vec3Tuple,
        rotation: 0,
        kind: 'chair' as const,
      },
      {
        id: `${t.id}-n${dx < 0 ? 'w' : 'e'}`,
        room: 'staff-room' as const,
        position: [t.x + dx, 0, t.z + 0.62] as Vec3Tuple,
        rotation: PI,
        kind: 'chair' as const,
      },
    ])
  ),
  {
    id: 'staff-sofa-south',
    room: 'staff-room',
    position: [staff.maxX - 0.45, 0, -31.4],
    rotation: -PI / 2,
    kind: 'sofa',
  },
  {
    id: 'staff-sofa-north',
    room: 'staff-room',
    position: [staff.maxX - 0.45, 0, -30.4],
    rotation: -PI / 2,
    kind: 'sofa',
  },
  {
    id: 'staff-armchair',
    room: 'staff-room',
    position: [STAFF_ROOM.armchair.x, 0, STAFF_ROOM.armchair.z],
    rotation: (PI * 3) / 4,
    kind: 'armchair',
  },
  {
    id: 'locker-bench',
    room: 'lockers',
    position: [-21.4, 0, -33.8],
    rotation: PI,
    kind: 'bench',
  },
  {
    id: 'manager-desk-chair',
    room: 'manager-office',
    position: [MANAGER_OFFICE.chair.x, 0, MANAGER_OFFICE.chair.z],
    rotation: 0,
    kind: 'desk-chair',
  },
  ...MANAGER_OFFICE.visitorXs.map((x, i) => ({
    id: `manager-visitor-${i}`,
    room: 'manager-office' as const,
    position: [x, 0, MANAGER_OFFICE.visitorZ] as Vec3Tuple,
    rotation: PI,
    kind: 'chair' as const,
  })),
  ...MEETING_ROOM.chairZs.flatMap((z, i) => [
    {
      id: `meeting-chair-w${i}`,
      room: 'meeting-room' as const,
      position: [MEETING_ROOM.table.x - 0.78, 0, z] as Vec3Tuple,
      rotation: PI / 2,
      kind: 'chair' as const,
    },
    {
      id: `meeting-chair-e${i}`,
      room: 'meeting-room' as const,
      position: [MEETING_ROOM.table.x + 0.78, 0, z] as Vec3Tuple,
      rotation: -PI / 2,
      kind: 'chair' as const,
    },
  ]),
  {
    id: 'first-aid-chair',
    room: 'first-aid',
    position: [FIRST_AID_ROOM.chair.x, 0, FIRST_AID_ROOM.chair.z],
    rotation: PI / 2,
    kind: 'chair',
  },
];

const rect = (
  id: string,
  room: FacilitySolid['room'],
  r: PlanRect,
  height: number
): FacilitySolid => ({ id, room, height, ...r });
const centred = (
  id: string,
  room: FacilitySolid['room'],
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
  height: number
): FacilitySolid =>
  rect(id, room, { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ }, height);

/** Every fitting the walking model should stop at (chairs and small things are not). */
export const FACILITY_FITTINGS: readonly FacilitySolid[] = [
  rect('staff-counter', 'staff-room', STAFF_ROOM.counter, STAFF_ROOM.worktopTop),
  rect('staff-fridge', 'staff-room', STAFF_ROOM.fridge, 1.8),
  ...STAFF_ROOM.tables.map((t) =>
    centred(t.id, 'staff-room', t.x, t.z, STAFF_ROOM.tableHalf[0], STAFF_ROOM.tableHalf[1], 0.74)
  ),
  rect('staff-sofa', 'staff-room', STAFF_ROOM.sofa, 0.85),
  centred(
    'staff-coffee-table',
    'staff-room',
    STAFF_ROOM.coffeeTable.x,
    STAFF_ROOM.coffeeTable.z,
    0.45,
    0.27,
    0.42
  ),
  rect('locker-bank-south', 'lockers', LOCKER_ROOM.southBank, 1.85),
  rect('locker-bank-west', 'lockers', LOCKER_ROOM.westBank, 1.85),
  rect('locker-bench', 'lockers', LOCKER_ROOM.bench, 0.45),
  rect('toilet-vanity', 'toilets', TOILETS.vanity, 0.86),
  // Cubicle side panels; the fronts stand open at each door.
  ...TOILETS.cubicleXs.slice(1).map((x, i) =>
    rect(
      `toilet-cubicle-panel-${i}`,
      'toilets',
      {
        minX: x - 0.015,
        maxX: x + 0.015,
        minZ: TOILETS.interior.minZ,
        maxZ: TOILETS.cubicleFrontZ,
      },
      2.0
    )
  ),
  rect('accessible-wc-basin', 'accessible-wc', ACCESSIBLE_WC.basin, ACCESSIBLE_WC.basinRim),
  centred(
    'manager-desk',
    'manager-office',
    MANAGER_OFFICE.desk.x,
    MANAGER_OFFICE.desk.z,
    MANAGER_OFFICE.desk.halfX,
    MANAGER_OFFICE.desk.halfZ,
    MANAGER_OFFICE.desk.top
  ),
  ...MANAGER_OFFICE.shelves.map((s, i) =>
    rect(
      `manager-shelves-${i}`,
      'manager-office',
      {
        minX: s.minX,
        maxX: s.maxX,
        minZ: office.minZ,
        maxZ: office.minZ + MANAGER_OFFICE.shelfDepth,
      },
      2.0
    )
  ),
  rect('manager-filing', 'manager-office', MANAGER_OFFICE.filing, 1.32),
  centred(
    'meeting-table',
    'meeting-room',
    MEETING_ROOM.table.x,
    MEETING_ROOM.table.z,
    MEETING_ROOM.table.halfX,
    MEETING_ROOM.table.halfZ,
    MEETING_ROOM.table.top
  ),
  rect('meeting-sideboard', 'meeting-room', MEETING_ROOM.sideboard, 0.8),
  rect('first-aid-couch', 'first-aid', FIRST_AID_ROOM.couch, 0.62),
  rect('first-aid-sink', 'first-aid', FIRST_AID_ROOM.sinkUnit, 0.9),
  ...FACILITY_PLANTERS.map((p, i) => rect(`facility-planter-${i}`, 'hall', p, 0.55)),
];

/** The open leaf of each door, standing at a right angle to its wall. */
export function doorLeafPlan(d: FacilityDoor & { readonly wall: FacilityWallLine }): PlanRect {
  const hingeAlong = d.hinge === 'from' ? d.from + FACILITY_DOOR_JAMB : d.to - FACILITY_DOOR_JAMB;
  const inward = d.hinge === 'from' ? 1 : -1;
  // The leaf's own face sits just inside the jamb, so the clear width loses its thickness.
  const a = hingeAlong;
  const b = hingeAlong + inward * FACILITY_DOOR_LEAF.thickness;
  const c0 = d.swing * H;
  const c1 = d.swing * (H + FACILITY_DOOR_LEAF.width);
  if (d.wall.runs === 'x')
    return {
      minX: Math.min(a, b),
      maxX: Math.max(a, b),
      minZ: d.wall.at + Math.min(c0, c1),
      maxZ: d.wall.at + Math.max(c0, c1),
    };
  return {
    minX: d.wall.at + Math.min(c0, c1),
    maxX: d.wall.at + Math.max(c0, c1),
    minZ: Math.min(a, b),
    maxZ: Math.max(a, b),
  };
}

/**
 * Walls with their door openings left open, plus every door leaf and fitting:
 * the plan boxes `walkingObstacles.ts` adds to first-person walking.
 */
export function facilityWalkingSolids(): {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}[] {
  const solids: { id: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const wall of FACILITY_WALLS) {
    const doors = wall.openings.filter((o) => o.kind === 'door').sort((a, b) => a.from - b.from);
    let start = wall.from;
    doors.forEach((d, i) => {
      if (d.from > start)
        solids.push({ id: `facility-${wall.id}-${i}`, ...wallPlan(wall, start, d.from) });
      start = d.to;
    });
    if (wall.to > start)
      solids.push({ id: `facility-${wall.id}-${doors.length}`, ...wallPlan(wall, start, wall.to) });
  }
  for (const d of FACILITY_DOORS) solids.push({ id: `facility-${d.id}-leaf`, ...doorLeafPlan(d) });
  for (const f of FACILITY_FITTINGS)
    solids.push({ id: `facility-${f.id}`, minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ });
  return solids;
}
