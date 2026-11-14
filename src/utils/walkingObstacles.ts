import {
  GAS_STATION_SITE,
  landmarkLocalToWorld,
  SITE_LAYOUT,
  VILLAGE_ALLOTMENT,
  VILLAGE_HOME_PLOTS,
} from '../constants/siteLayout';
import { CANAL_FOOTBRIDGE_ACCESS } from '../constants/publicRealmLayout';
import { RIVERBANK_HEDGE_TRANSLATION_XZ } from '../components/exterior/riverbankHedgeGrounding';
import { facilityWalkingSolids } from '../components/facilities/facilityLayout';
import { PERSONNEL_DOOR, PERSONNEL_DOORS } from '../constants/accessibilityLayout';

/**
 * WALKING SOLIDS THE OTHER PREDICATES DO NOT KNOW.
 *
 * The walking model (`moveWalkingPosition`) already refuses the factory
 * machines, conveyors and docks, the castle, the bus shelter and the railway
 * station. Everything here was walked straight through: the five village
 * cottages, their garden walls, the allotment's picket fence and shed, the
 * village's civic buildings (church, town hall, pub, school, forge and the
 * three shops), every clipped hedge, the mill perimeter fence and the
 * gas-station shop. This module is the one list of them, read by all three
 * first-person controllers through `walkingObstacleBlocks`.
 *
 * Every solid is a plan-view box, full height: none of them is low enough to
 * step onto (the lowest, the riverbank hedge, is 0.5 m against the 0.23 m step
 * rule) and none is overhead. Openings are what the geometry leaves open: each
 * garden gate (1.63 m between the pillar caps), each allotment gate, the
 * cottage front-door approach up to the wall face, the perimeter's vehicle
 * gates and its canal pedestrian gate. The station shop's glazed frontage is
 * closed; its side door stands open, so the shop is walked as its walls and
 * fixtures.
 *
 * Where a datum is exported it is used (plots, allotment, perimeter line,
 * station site, footbridge, landscape hedges). Plot-, allotment- and
 * station-local dimensions are literals inside the components that build the
 * geometry, so they are reproduced here as named constants. The civic
 * buildings' walls are measured from their delivered GLBs: the ground-level
 * wall ring, 0.3-2 m up, without awnings, eaves, steps or porches.
 * `walkingObstacles.test.ts` raycasts the real village geometry and the GLBs
 * and reads the station, fence, building and hedge JSX to hold them to it.
 */

/**
 * A plan box in its own frame, for a solid that is not turned by a quarter
 * turn: centre, yaw (a three.js Y rotation, so local +z points along
 * (sin yaw, cos yaw)) and half extents. `cos` and `sin` are the yaw's, cached.
 */
export interface WalkingSolidFrame {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly cos: number;
  readonly sin: number;
  readonly halfX: number;
  readonly halfZ: number;
}

/**
 * Plan box. `minX..maxZ` is the world AABB; when `frame` is present the solid
 * is that turned box, and the AABB is only its envelope.
 */
export interface WalkingSolid {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly frame?: WalkingSolidFrame;
}

/** A plan rectangle in some local frame (a model's, a group's). */
export interface LocalRect {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Cottage bodies in each plot's own frame (door face toward +z), index-aligned
 * with `VILLAGE_HOME_PLOTS`. Width and depth are `DESIGNS[i].width/depth` in
 * `VillageGardens.tsx`: the plaster box the door and windows sit on. Window
 * sills and boxes stand proud of it at chest height beside the door, never in
 * front of it, so the door approach stays open.
 */
export const VILLAGE_HOME_BODIES = [
  { width: 5.6, depth: 4.4 },
  { width: 4.8, depth: 4.5 },
  { width: 5.2, depth: 4.2 },
  { width: 4.65, depth: 4.6 },
  { width: 5.7, depth: 4.4 },
] as const;

/** Pearl Cottage's bay: `[1.48, 1.66, 0.43]` at `(width * 0.29, front + 0.2)`. */
export const VILLAGE_HOME_BAY = { index: 4, halfX: 0.74, offsetZ: 0.2, halfZ: 0.215 } as const;

/**
 * One plot's garden boundary, in the plot frame, from `garden()` in
 * `VillageGardens.tsx`. Mirrored about x = 0.
 * - Front wall `[4.2, 0.62, 0.31]` at `(±3.05, 7.15)`, pillars `[0.3, 0.88, 0.4]`
 *   at x ±1.02 and ±5.12 under caps `[0.41, 0.1, 0.48]`: the gate opening is
 *   between the inner caps, |x| < 1.02 - 0.205.
 * - Side wall `[0.27, 0.44, 9.4]` at `(±5.12, 2.3)` under coping `[0.36, 0.08, 9.48]`.
 * - The open gate leaf: rails `[0.07, 0.07, 1.04]` at `(0.99, 6.52)`, folded
 *   back along the path's right edge.
 */
export const VILLAGE_GARDEN_BOUNDARY = {
  wallZ: 7.15,
  /** Half the cap depth, the deepest part of the front wall. */
  wallHalfDepth: 0.24,
  gateHalfWidth: 1.02 - 0.205,
  outerX: 5.12 + 0.205,
  sideX: 5.12 - 0.18,
  sideMinZ: 2.3 - 9.48 / 2,
  leaf: { x: 0.99, halfX: 0.035, minZ: 6.0, maxZ: 6.52 + 0.52 },
} as const;

/**
 * The allotment, in its own frame (the group turns it a quarter turn into the
 * village, so local +z is village +x: the east gate). From `allotment()`.
 * - Side pickets along x ±5.5, rails `[0.08, 0.065, 12.5]` centred z 0.25,
 *   posts `[0.09, 0.84, 0.12]`.
 * - End pickets at z -5.85 and 6.5, rails `[4.55, 0.08, 0.08]` centred x ±3.2,
 *   posts `[0.105, 0.86, 0.1]`: each end leaves a gate |x| < 3.2 - 4.55 / 2.
 * - The tool shed `[2.5, 2.05, 2.15]` at `(-3.3, -4.2)`, its door at z -3.06.
 */
export const VILLAGE_ALLOTMENT_BOUNDARY = {
  sideX: 5.5,
  sideHalfThickness: 0.045,
  sideMinZ: 0.25 - 12.5 / 2,
  sideMaxZ: 0.25 + 12.5 / 2,
  endZ: [-5.85, 6.5],
  endHalfThickness: 0.05,
  gateHalfWidth: 3.2 - 4.55 / 2,
  shed: { minX: -3.3 - 1.25, maxX: -3.3 + 1.25, minZ: -4.2 - 1.075, maxZ: -3.06 + 0.03 },
  /** The `VillageAllotment` group's yaw. */
  rotation: Math.PI / 2,
} as const;

/**
 * The mill perimeter fence, from `FactoryExterior.tsx`. It runs on
 * `SITE_LAYOUT.perimeter`, open front and back between the vehicle gate posts
 * at x ±32, and on the west side at the canal pedestrian gate, on the
 * footbridge's line, between sections ending at z -51.8 and -48.2. Posts are
 * `BoxGeometry(0.15, 2.4, 0.15)`, the rails 0.11 thick and continuous; the
 * gate posts are 0.4 m square.
 */
export const PERIMETER_FENCE = {
  postHalfWidth: 0.075,
  vehicleGateX: 32,
  gatePostHalfWidth: 0.2,
  pedestrianGate: { z: CANAL_FOOTBRIDGE_ACCESS.z, halfWidth: 1.8 },
} as const;

/**
 * The fence's runs, start to end, as `FenceSection` places them. A run's
 * solid is its centre line widened by the post half-width on every side.
 */
export const PERIMETER_FENCE_RUNS: readonly (readonly [
  readonly [number, number],
  readonly [number, number],
])[] = (() => {
  const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.perimeter;
  const gateX = PERIMETER_FENCE.vehicleGateX;
  const { z: gateZ, halfWidth } = PERIMETER_FENCE.pedestrianGate;
  return [
    [
      [minX, maxZ],
      [-gateX, maxZ],
    ],
    [
      [gateX, maxZ],
      [maxX, maxZ],
    ],
    [
      [minX, minZ],
      [-gateX, minZ],
    ],
    [
      [gateX, minZ],
      [maxX, minZ],
    ],
    [
      [minX, minZ],
      [minX, gateZ - halfWidth],
    ],
    [
      [minX, gateZ + halfWidth],
      [minX, maxZ],
    ],
    [
      [maxX, minZ],
      [maxX, maxZ],
    ],
  ];
})();

/**
 * The gas-station shop in station-local metres (`GasStation`'s group, which
 * `FactoryExterior` mounts at `GAS_STATION_SITE.position` with yaw 0). The
 * shell is the envelope of the `[-12, 0, 0]` group's walls: back wall outer
 * face x -16, glazed frontage x -8.0 with its mullions and kickplate to
 * -7.904, side walls to z ±5.0. The shop is entered through its open side
 * door, so the shell is walked as its walls (0.2 m thick; the glazing box is
 * x -8.2..-8.0) and the interior as its fixtures. The doorway is the gap
 * between the north wall's piers (x -12.64..-11.36), narrowed only by its
 * jambs (inner faces -12.61 and -11.39, standing to z 5.08) and the open leaf
 * (`STATION_DOOR_LEAF` in GasStationInstanced: x -12.64..-12.495 with its
 * pull, z 3.59..4.79). Fixtures are their delivered GLBs' footprints at their
 * mounted positions (counter 1.6 x 2.6, shelving 0.65 x 6, coffee machine 0.8
 * x 0.8, slushie 0.7 x 0.5, grill 0.6 x 0.5, magazine rack 0.8 x 0.4), the
 * drinks cabinet from its frame and glass front, and the snack endcap from
 * `StationTravelStop`'s shelves.
 */
export const STATION_SHOP_LOCAL = {
  yaw: 0,
  shell: { minX: -16, maxX: -7.904, minZ: -5, maxZ: 5 },
  solids: [
    { id: 'back-wall', minX: -16, maxX: -15.8, minZ: -5, maxZ: 5 },
    { id: 'south-wall', minX: -16, maxX: -7.904, minZ: -5, maxZ: -4.8 },
    { id: 'frontage', minX: -8.2, maxX: -7.904, minZ: -5, maxZ: 5 },
    { id: 'north-wall-west', minX: -16, maxX: -12.64, minZ: 4.8, maxZ: 5 },
    { id: 'north-wall-east', minX: -11.36, maxX: -7.904, minZ: 4.8, maxZ: 5 },
    { id: 'door-jamb-west', minX: -12.71, maxX: -12.61, minZ: 4.95, maxZ: 5.08 },
    { id: 'door-jamb-east', minX: -11.39, maxX: -11.29, minZ: 4.95, maxZ: 5.08 },
    { id: 'door-leaf', minX: -12.64, maxX: -12.495, minZ: 3.59, maxZ: 4.79 },
    { id: 'counter', minX: -9.8, maxX: -8.2, minZ: -2.3, maxZ: 0.3 },
    { id: 'shelving', minX: -15.15, maxX: -14.5, minZ: -3, maxZ: 3 },
    { id: 'drinks-cabinet', minX: -14.02, maxX: -9.98, minZ: -4.8, maxZ: -3.52 },
    { id: 'coffee-machine', minX: -9.96, maxX: -9.16, minZ: -3.9, maxZ: -3.1 },
    { id: 'slushie', minX: -10.52, maxX: -9.82, minZ: -2.25, maxZ: -1.75 },
    { id: 'grill', minX: -10.3, maxX: -9.7, minZ: -0.75, maxZ: -0.25 },
    { id: 'magazine-rack', minX: -10.9, maxX: -10.1, minZ: 2.8, maxZ: 3.2 },
    { id: 'snack-endcap', minX: -13.62, maxX: -13.08, minZ: 0.45, maxZ: 1.65 },
  ],
} as const;

/**
 * The village's civic buildings' ground-level wall rings, in each delivered
 * GLB's own metres (`public/models/village/<asset>.glb`, mounted unscaled by
 * `GeneratedModel`; its single node is the identity). Each rectangle is a
 * masonry mass's dominant vertical face between 0.3 m and 2 m: what a body
 * walks into. Doors are inside the wall plane and stay solid; there are no
 * interiors. Left out, and bounded by `walkingObstacles.test.ts`: joinery that
 * stands less than `VILLAGE_CIVIC_JOINERY_REACH` proud (door and window frames,
 * sills, window boxes, the shopfronts, plinth and string courses), and the
 * open parts in `VILLAGE_CIVIC_OPEN`. The shops' awnings, the town hall's
 * stairs and every eave are above or outside the ring, which is why the
 * recorded `VILLAGE_BUILDING_FOOTPRINTS` (which include them) are not used.
 */
export const VILLAGE_CIVIC_WALLS = {
  church: [
    // Nave, to its west plinth course; the corner buttresses stand on it.
    { id: 'nave', minX: -5, maxX: 5, minZ: -5.76, maxZ: 6.08 },
    // The tower base at the back (its plinth course is joinery).
    { id: 'tower', minX: -2, maxX: 2, minZ: -6.39, maxZ: -5.51 },
    ...[-1, 1].flatMap((side) => {
      const name = side < 0 ? 'west' : 'east';
      const [inner, outer, corner] = [side * 4.9, side * 5.47, side * 5.32];
      return [
        ...(
          [
            [-4.488, -3.807],
            [-1.568, -0.886],
            [1.353, 2.035],
            [4.274, 4.956],
          ] as const
        ).map(([minZ, maxZ], i) => ({
          id: `buttress-${name}-${i}`,
          minX: Math.min(inner, outer),
          maxX: Math.max(inner, outer),
          minZ,
          maxZ,
        })),
        ...(
          [
            ['back', -5.822, -5.413],
            ['front', 5.881, 6.29],
          ] as const
        ).map(([end, minZ, maxZ]) => ({
          id: `corner-buttress-${name}-${end}`,
          minX: Math.min(side * 4.7, corner),
          maxX: Math.max(side * 4.7, corner),
          minZ,
          maxZ,
        })),
      ];
    }),
  ],
  townhall: [{ id: 'walls', minX: -6, maxX: 6, minZ: -5, maxZ: 5 }],
  pub: [
    { id: 'walls', minX: -4, maxX: 4, minZ: -3, maxZ: 3 },
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        id: `corner-pier-${sx}-${sz}`,
        minX: Math.min(sx * 3.8, sx * 4.17),
        maxX: Math.max(sx * 3.8, sx * 4.17),
        minZ: Math.min(sz * 2.8, sz * 3.17),
        maxZ: Math.max(sz * 2.8, sz * 3.17),
      }))
    ),
  ],
  school: [
    { id: 'walls', minX: -5, maxX: 5, minZ: -3.5, maxZ: 3.5 },
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        id: `corner-pier-${sx}-${sz}`,
        minX: Math.min(sx * 4.7, sx * 5.32),
        maxX: Math.max(sx * 4.7, sx * 5.32),
        minZ: Math.min(sz * 3.3, sz * 3.72),
        maxZ: Math.max(sz * 3.3, sz * 3.72),
      }))
    ),
  ],
  forge: [
    { id: 'walls', minX: -2.02, maxX: 2.02, minZ: -3.19, maxZ: 0.64 },
    { id: 'gable-base', minX: -2.15, maxX: 2.15, minZ: -3.36, maxZ: -3.17 },
    // The brick hearth built out from the front wall into the open bay.
    { id: 'hearth', minX: -1.11, maxX: 0.31, minZ: 0.64, maxZ: 2.43 },
  ],
  shop: [{ id: 'walls', minX: -2.758, maxX: 2.758, minZ: -2.315, maxZ: 2.302 }],
} as const satisfies Record<string, readonly LocalRect[]>;

export type VillageCivicAsset = keyof typeof VILLAGE_CIVIC_WALLS;

/** How far joinery may stand proud of a declared wall without being solid. */
export const VILLAGE_CIVIC_JOINERY_REACH = 0.3;

/**
 * Ground-level parts of the civic GLBs that are deliberately left walkable, in
 * model metres: the town hall's two porticos (stairs, columns, door surrounds)
 * and the forge's open bay (its canopy posts and the anvil), as porches.
 */
export const VILLAGE_CIVIC_OPEN: Partial<Record<VillageCivicAsset, readonly LocalRect[]>> = {
  townhall: [-1, 1].map((side) => ({
    id: `portico-${side < 0 ? 'back' : 'front'}`,
    minX: -3.1,
    maxX: 3.1,
    minZ: side < 0 ? -6.65 : 5,
    maxZ: side < 0 ? -5 : 6.65,
  })),
  forge: [{ id: 'open-bay', minX: -2.1, maxX: 2.1, minZ: 0.64, maxZ: 3.1 }],
};

/**
 * Where `VillageArea.tsx` mounts each civic building, in the village frame.
 * The shops' groups add `instanceYaw(position)` and `instanceScale(position)`
 * (`GeneratedModel.tsx`), reproduced by `shopNoise` below.
 */
export const VILLAGE_CIVIC_PLACEMENTS = [
  { name: 'church', asset: 'church', position: [0, 0, -40], rotation: 0 },
  { name: 'town-hall', asset: 'townhall', position: [0, 0, 20], rotation: Math.PI },
  { name: 'pub', asset: 'pub', position: [-25, 0, -15], rotation: Math.PI / 2 },
  { name: 'school', asset: 'school', position: [22, 0, 40], rotation: -Math.PI / 2 },
  { name: 'forge', asset: 'forge', position: [-22, 0, -55], rotation: Math.PI / 2 },
] as const;
export const VILLAGE_SHOP_PLACEMENTS = [
  { name: 'baker', position: [20, 0, 5], rotation: -Math.PI / 2 },
  { name: 'butcher', position: [20, 0, -10], rotation: -Math.PI / 2 },
  { name: 'general-store', position: [-20, 0, 30], rotation: Math.PI / 2 },
] as const;

/** `instanceNoise` from `GeneratedModel.tsx`. */
function shopNoise(position: readonly [number, number, number], seed: number): number {
  const value = Math.sin(position[0] * 12.9898 + position[2] * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}
/** A shop group's yaw and uniform scale, as `ShopBuilding` sets them. */
export function villageShopPose(placement: (typeof VILLAGE_SHOP_PLACEMENTS)[number]): {
  yaw: number;
  scale: number;
} {
  return {
    yaw: placement.rotation + (shopNoise(placement.position, 1) - 0.5) * 0.12,
    scale: 0.96 + shopNoise(placement.position, 2) * 0.08,
  };
}

/**
 * The town hall's privet runs (`TOWN_HALL_HEDGE_GEOMETRY`, `VillageGardens.tsx`)
 * in the town hall's frame: `run(x, z, length, side)`, along z when `side`.
 * `addCivicPrivet`'s profile is 0.46 m either side of the run's line at its
 * widest and its leaf blades reach 0.509 m; it rounds each end 0.36 m past
 * `length / 2`. The east side (-x) moved out to x -8.3 and its back return
 * was cut short for the Approved Document M ramp (2026-11-13,
 * `TOWN_HALL_PRIVET_RUNS`).
 */
export const TOWN_HALL_PRIVET = {
  runs: [
    { x: -8.3, z: 0, length: 12, alongZ: true },
    { x: -4.67, z: -8.2, length: 0.94, alongZ: false },
    { x: -5.9, z: 8.2, length: 3.4, alongZ: false },
    { x: 8, z: 0, length: 12, alongZ: true },
    { x: 5.9, z: -8.2, length: 3.4, alongZ: false },
    { x: 5.9, z: 8.2, length: 3.4, alongZ: false },
  ],
  halfWidth: 0.509,
  endReach: 0.36,
} as const;

/**
 * The two clipped hedges `FactoryExterior` lays from its own literals: the
 * canal walk's (`PATH_HEDGES`, `hedgeAlongPath(CANAL_WEST_PATH, -1, ...)`) and
 * the riverbank row (`<HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]}
 * width={0.4} />` inside the group moved by `RIVERBANK_HEDGE_TRANSLATION_XZ`).
 */
export const EXTERIOR_HEDGE_ROWS = [
  { id: 'canal-west-path', start: [-132.1, 85.5], end: [-132.1, 51], width: 0.5 },
  {
    id: 'riverbank',
    start: [-10 + RIVERBANK_HEDGE_TRANSLATION_XZ[0], -128 + RIVERBANK_HEDGE_TRANSLATION_XZ[1]],
    end: [10 + RIVERBANK_HEDGE_TRANSLATION_XZ[0], -128 + RIVERBANK_HEDGE_TRANSLATION_XZ[1]],
    width: 0.4,
  },
] as const;

const village = SITE_LAYOUT.landmarks.village;
const villageToWorld = (x: number, z: number): [number, number] => {
  const [wx, , wz] = landmarkLocalToWorld(village, [x, 0, z]);
  return [wx, wz];
};

/**
 * `LANDSCAPE_HEDGES` (`LandscapeDressing.tsx`), in world X/Z, reproduced so the
 * controllers do not import a component module; `walkingObstacles.test.ts`
 * holds the two equal. Each cottage plot has an outer hedge 8 m out from its
 * centre, two side hedges at +-7 m and a street hedge broken by a 4.8 m
 * opening; the rural rows are the crop field, the village meadow, the
 * forecourt's rear and the lineside hedge, each stopping at its walking gap.
 */
export const LANDSCAPE_HEDGE_ROWS: readonly {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly width: number;
}[] = (() => {
  const rows: { start: [number, number]; end: [number, number]; width: number }[] = [];
  for (const { position } of VILLAGE_HOME_PLOTS) {
    const [x, , z] = position;
    const outer = x + Math.sign(x) * 8,
      inner = x - Math.sign(x) * 8;
    for (const [start, end] of [
      [
        [outer, z - 7],
        [outer, z + 7],
      ],
      [
        [outer, z - 7],
        [inner, z - 7],
      ],
      [
        [outer, z + 7],
        [inner, z + 7],
      ],
      [
        [inner, z - 7],
        [inner, z - 2.4],
      ],
      [
        [inner, z + 2.4],
        [inner, z + 7],
      ],
    ] as const)
      rows.push({ start: villageToWorld(...start), end: villageToWorld(...end), width: 0.95 });
  }
  const rural = (start: [number, number], end: [number, number], width = 1.5) =>
    rows.push({ start, end, width });
  rural([53, 144], [51, 161]);
  rural([51, 161], [53, 180]);
  rural([53, 180], [70.5, 181]);
  rural([79.5, 181], [98, 180]);
  rural([98, 180], [99, 163]);
  rural([99, 163], [97, 145]);
  rural([-234, -77], [-239, -35], 1.8);
  rural([-239, -26], [-241, 14], 1.8);
  rural([-241, 24], [-237, 66], 1.8);
  rural([-232, 79], [-207, 81], 1.6);
  rural([-198, 82], [-172, 80], 1.6);
  rural([-108, 154], [-95, 155], 1.25);
  rural([-89, 155], [-69, 154], 1.25);
  rural([167.5, 99], [171, 119]);
  rural([172, 129], [168.5, 154]);
  return rows;
})();

const isQuarterTurn = (angle: number) =>
  Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2))) < 1e-9;

/**
 * A plan box `halfX` by `halfZ` about (x, z), turned by `yaw`. A quarter turn
 * gives a plain AABB; anything else carries its frame.
 */
function turnedSolid(
  id: string,
  x: number,
  z: number,
  yaw: number,
  halfX: number,
  halfZ: number
): WalkingSolid {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const ex = Math.abs(halfX * c) + Math.abs(halfZ * s),
    ez = Math.abs(halfX * s) + Math.abs(halfZ * c);
  const box = { id, minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
  if (isQuarterTurn(yaw)) return box;
  return { ...box, frame: { x, z, yaw, cos: c, sin: s, halfX, halfZ } };
}

/** A clipped hedge row: `width` across, exactly start to end along its line. */
export function hedgeRowSolid(
  id: string,
  start: readonly [number, number],
  end: readonly [number, number],
  width: number
): WalkingSolid {
  const dx = end[0] - start[0],
    dz = end[1] - start[1];
  return turnedSolid(
    id,
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    Math.atan2(dx, dz),
    width / 2,
    Math.hypot(dx, dz) / 2
  );
}

/** The world AABB of a local box carried through `toWorld`. */
function worldBox(
  id: string,
  box: Omit<WalkingSolid, 'id'>,
  toWorld: (x: number, z: number) => [number, number]
): WalkingSolid {
  const corners = [
    toWorld(box.minX, box.minZ),
    toWorld(box.maxX, box.minZ),
    toWorld(box.minX, box.maxZ),
    toWorld(box.maxX, box.maxZ),
  ];
  return {
    id,
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
  };
}

/** Yaw then translate, as a three.js group with `rotation={[0, yaw, 0]}`. */
function groupToParent(
  position: readonly [number, number, number],
  yaw: number
): (x: number, z: number) => [number, number] {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return (x, z) => [position[0] + x * c + z * s, position[2] - x * s + z * c];
}

/** Plot-frame solids for one cottage and its garden. */
export function villagePlotLocalSolids(index: number): WalkingSolid[] {
  const { width, depth } = VILLAGE_HOME_BODIES[index];
  const g = VILLAGE_GARDEN_BOUNDARY;
  const solids: WalkingSolid[] = [
    { id: 'home', minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 },
  ];
  if (index === VILLAGE_HOME_BAY.index) {
    const x = width * 0.29,
      z = depth / 2 + VILLAGE_HOME_BAY.offsetZ;
    solids.push({
      id: 'home-bay',
      minX: x - VILLAGE_HOME_BAY.halfX,
      maxX: x + VILLAGE_HOME_BAY.halfX,
      minZ: z - VILLAGE_HOME_BAY.halfZ,
      maxZ: z + VILLAGE_HOME_BAY.halfZ,
    });
  }
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    const [inner, outer] = [side * g.gateHalfWidth, side * g.outerX];
    solids.push(
      {
        id: `garden-front-wall-${name}`,
        minX: Math.min(inner, outer),
        maxX: Math.max(inner, outer),
        minZ: g.wallZ - g.wallHalfDepth,
        maxZ: g.wallZ + g.wallHalfDepth,
      },
      {
        id: `garden-side-wall-${name}`,
        minX: Math.min(side * g.sideX, outer),
        maxX: Math.max(side * g.sideX, outer),
        minZ: g.sideMinZ,
        maxZ: g.wallZ + g.wallHalfDepth,
      }
    );
  }
  solids.push({
    id: 'garden-gate-leaf',
    minX: g.leaf.x - g.leaf.halfX,
    maxX: g.leaf.x + g.leaf.halfX,
    minZ: g.leaf.minZ,
    maxZ: g.leaf.maxZ,
  });
  return solids;
}

/** Allotment-frame solids: both picket sides, both ends either side of their gates, the shed. */
export function villageAllotmentLocalSolids(): WalkingSolid[] {
  const a = VILLAGE_ALLOTMENT_BOUNDARY;
  const solids: WalkingSolid[] = [];
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    solids.push({
      id: `allotment-side-${name}`,
      minX: side * a.sideX - a.sideHalfThickness,
      maxX: side * a.sideX + a.sideHalfThickness,
      minZ: a.sideMinZ,
      maxZ: a.sideMaxZ,
    });
    for (const z of a.endZ) {
      const [inner, outer] = [side * a.gateHalfWidth, side * (a.sideX + a.sideHalfThickness)];
      solids.push({
        id: `allotment-end-${z < 0 ? 'west' : 'east'}-${name}`,
        minX: Math.min(inner, outer),
        maxX: Math.max(inner, outer),
        minZ: z - a.endHalfThickness,
        maxZ: z + a.endHalfThickness,
      });
    }
  }
  solids.push({ id: 'allotment-shed', ...a.shed });
  return solids;
}

function perimeterSolids(): WalkingSolid[] {
  const h = PERIMETER_FENCE.postHalfWidth,
    g = PERIMETER_FENCE.gatePostHalfWidth;
  const runs = PERIMETER_FENCE_RUNS.map(([[x0, z0], [x1, z1]], index) => ({
    id: `perimeter-fence-${index}`,
    minX: Math.min(x0, x1) - h,
    maxX: Math.max(x0, x1) + h,
    minZ: Math.min(z0, z1) - h,
    maxZ: Math.max(z0, z1) + h,
  }));
  const { minZ, maxZ } = SITE_LAYOUT.perimeter;
  const gatePosts = [-1, 1].flatMap((sx) =>
    [minZ, maxZ].map((z) => {
      const x = sx * PERIMETER_FENCE.vehicleGateX;
      return {
        id: `perimeter-gate-post-${x}-${z}`,
        minX: x - g,
        maxX: x + g,
        minZ: z - g,
        maxZ: z + g,
      };
    })
  );
  return [...runs, ...gatePosts];
}

/** The hall's wall plinth depth (OptimizedFactoryInfrastructure's lower wall segments). */
export const HALL_WALL_DEPTH = 0.55;

/**
 * THE HALL SHELL (report 04 F4, P6). The four walls on `SITE_LAYOUT.factory`'s
 * bounds, plinth below and glazing to the eaves above, so a body cannot pass
 * or jump them. Openings are what the shell leaves open: each dock and service
 * portal, open its full width, and the clear 1.0 m between each personnel
 * door's jambs (PERSONNEL_DOORS; the jambs themselves are solid). The doors
 * stand open: the drill's step-free routes go through them
 * (systems/accessibleEgress.ts). `hallWalls.test.ts` holds these runs to the
 * plinth segments the shell draws.
 */
export function hallWallSolids(): WalkingSolid[] {
  const half = HALL_WALL_DEPTH / 2;
  const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.factory.bounds;
  const solids: WalkingSolid[] = [];
  for (const [key, portal] of Object.entries(SITE_LAYOUT.portals)) {
    const front = portal.normal[2] !== 0;
    const centre = front ? portal.centre[0] : portal.centre[2];
    const gaps: [number, number][] = [[centre - portal.halfWidth, centre + portal.halfWidth]];
    if (front)
      for (const door of PERSONNEL_DOORS)
        if (Math.sign(door.wallZ) === Math.sign(portal.centre[2]))
          gaps.push([
            door.x - PERSONNEL_DOOR.clearWidth / 2,
            door.x + PERSONNEL_DOOR.clearWidth / 2,
          ]);
    gaps.sort((a, b) => a[0] - b[0]);
    let start = front ? minX : minZ;
    const runs: [number, number][] = [];
    for (const [from, to] of gaps) {
      runs.push([start, from]);
      start = to;
    }
    runs.push([start, front ? maxX : maxZ]);
    runs.forEach(([from, to], index) => {
      const line = front ? portal.centre[2] : portal.centre[0];
      solids.push(
        front
          ? {
              id: `hall-wall-${key}-${index}`,
              minX: from,
              maxX: to,
              minZ: line - half,
              maxZ: line + half,
            }
          : {
              id: `hall-wall-${key}-${index}`,
              minX: line - half,
              maxX: line + half,
              minZ: from,
              maxZ: to,
            }
      );
    });
  }
  // Each personnel door's frame and its leaf, as StepFreeExits draws them: the
  // jambs run the frame's depth through the plinth, and the leaf stands open
  // 90 degrees outward, hinged at the east jamb, clear of the 1.0 m opening.
  for (const door of PERSONNEL_DOORS) {
    const depth = PERSONNEL_DOOR.depth / 2;
    const jambOuter = PERSONNEL_DOOR.openingHalfWidth + 0.02;
    const inner = PERSONNEL_DOOR.clearWidth / 2;
    for (const side of [-1, 1] as const)
      solids.push({
        id: `hall-door-${door.id}-jamb-${side < 0 ? 'west' : 'east'}`,
        minX: side < 0 ? door.x - jambOuter : door.x + inner,
        maxX: side < 0 ? door.x - inner : door.x + jambOuter,
        minZ: door.wallZ - depth,
        maxZ: door.wallZ + depth,
      });
    const leafX = door.x + inner + 0.01;
    const [near, far] = [depth, depth + PERSONNEL_DOOR.clearWidth].map(
      (d) => door.wallZ + door.outward * d
    );
    solids.push({
      id: `hall-door-${door.id}-leaf`,
      minX: leafX,
      maxX: leafX + PERSONNEL_DOOR.leafThickness,
      minZ: Math.min(near, far),
      maxZ: Math.max(near, far),
    });
  }
  return solids;
}

const HALL_WALLS: readonly WalkingSolid[] = hallWallSolids();

/**
 * True when a body of `radius` at (x, z) would overlap a hall wall. For a
 * driven forklift, which treats the walls as walkers do (report 04 P6).
 */
export function hallWallBlocks(x: number, z: number, radius: number): boolean {
  for (const box of HALL_WALLS)
    if (
      x + radius > box.minX &&
      x - radius < box.maxX &&
      z + radius > box.minZ &&
      z - radius < box.maxZ
    )
      return true;
  return false;
}

function buildWalkingObstacles(): WalkingSolid[] {
  const solids: WalkingSolid[] = [...HALL_WALLS];
  VILLAGE_HOME_PLOTS.forEach((plot, index) => {
    const toVillage = groupToParent(plot.position, plot.rotation);
    for (const box of villagePlotLocalSolids(index))
      solids.push(
        worldBox(`village-${plot.name}-${box.id}`, box, (x, z) =>
          villageToWorld(...toVillage(x, z))
        )
      );
  });
  const toAllotment = groupToParent(
    [VILLAGE_ALLOTMENT.x, 0, VILLAGE_ALLOTMENT.z],
    VILLAGE_ALLOTMENT_BOUNDARY.rotation
  );
  for (const box of villageAllotmentLocalSolids())
    solids.push(worldBox(`village-${box.id}`, box, (x, z) => villageToWorld(...toAllotment(x, z))));
  solids.push(...perimeterSolids());
  const toStation = groupToParent(GAS_STATION_SITE.position, STATION_SHOP_LOCAL.yaw);
  solids.push(
    ...STATION_SHOP_LOCAL.solids.map((box) => worldBox(`station-shop-${box.id}`, box, toStation)),
    // The ice chest and vending machine stand against the south wall
    // (GasStationInstanced, 2026-11-06), outside the shop shell at z -5.
    worldBox(
      'station-shop-ice-chest',
      { minX: -14.41, maxX: -13.09, minZ: -5.76, maxZ: -5 },
      toStation
    ),
    worldBox(
      'station-shop-vending',
      { minX: -10.035, maxX: -9.065, minZ: -5.82, maxZ: -5 },
      toStation
    )
  );
  solids.push(...villageCivicSolids(), ...hedgeSolids());
  // The staff facilities in the hall: walls with their doorways left open,
  // the open door leaves and the larger fittings (facilityLayout.ts).
  solids.push(...facilityWalkingSolids());
  return solids;
}

/** Every civic wall rectangle, carried through its building's group and the village. */
function villageCivicSolids(): WalkingSolid[] {
  const solids: WalkingSolid[] = [];
  for (const { name, asset, position, rotation } of VILLAGE_CIVIC_PLACEMENTS) {
    const toVillage = groupToParent(position, rotation);
    for (const box of VILLAGE_CIVIC_WALLS[asset])
      solids.push(
        worldBox(`village-${name}-${box.id}`, box, (x, z) => villageToWorld(...toVillage(x, z)))
      );
  }
  // The village anchor is a yaw and a uniform scale, so a turned shop box
  // stays a box: carry its centre, add the yaws, multiply the scales.
  for (const placement of VILLAGE_SHOP_PLACEMENTS) {
    const { yaw, scale } = villageShopPose(placement);
    const toVillage = groupToParent(placement.position, yaw);
    for (const box of VILLAGE_CIVIC_WALLS.shop) {
      const [vx, vz] = toVillage(
        ((box.minX + box.maxX) / 2) * scale,
        ((box.minZ + box.maxZ) / 2) * scale
      );
      const [wx, wz] = villageToWorld(vx, vz);
      solids.push(
        turnedSolid(
          `village-${placement.name}-${box.id}`,
          wx,
          wz,
          yaw + village.rotation[1],
          ((box.maxX - box.minX) / 2) * scale * village.scale,
          ((box.maxZ - box.minZ) / 2) * scale * village.scale
        )
      );
    }
  }
  return solids;
}

/** The town hall's privet, every landscape hedge row and the two exterior rows. */
function hedgeSolids(): WalkingSolid[] {
  const hall = VILLAGE_CIVIC_PLACEMENTS.find((p) => p.asset === 'townhall')!;
  const toVillage = groupToParent(hall.position, hall.rotation);
  const { halfWidth, endReach } = TOWN_HALL_PRIVET;
  const privet = TOWN_HALL_PRIVET.runs.map(({ x, z, length, alongZ }, i) => {
    const [across, along] = [halfWidth, length / 2 + endReach];
    const [hx, hz] = alongZ ? [across, along] : [along, across];
    return worldBox(
      `village-town-hall-privet-${i}`,
      { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz },
      (lx, lz) => villageToWorld(...toVillage(lx, lz))
    );
  });
  return [
    ...privet,
    ...LANDSCAPE_HEDGE_ROWS.map(({ start, end, width }, i) =>
      hedgeRowSolid(`hedge-landscape-${i}`, start, end, width)
    ),
    ...EXTERIOR_HEDGE_ROWS.map(({ id, start, end, width }) =>
      hedgeRowSolid(`hedge-${id}`, start, end, width)
    ),
  ];
}

/**
 * Every solid, in world X/Z. Plots, the allotment, the civic buildings and the
 * village sit at quarter-turn yaws, so each of their AABBs is the box itself,
 * not an envelope (`walkingObstacles.test.ts` holds that). The shops (turned by
 * their instance yaw) and the slanted hedge rows carry a `frame`.
 */
export const WALKING_OBSTACLES: readonly WalkingSolid[] = buildWalkingObstacles();

/** The solid a body of `radius` standing at (x, z) would overlap, if any. */
export function walkingObstacleAt(x: number, z: number, radius = 0.4): WalkingSolid | null {
  for (const box of WALKING_OBSTACLES) {
    if (
      !(
        x + radius > box.minX &&
        x - radius < box.maxX &&
        z + radius > box.minZ &&
        z - radius < box.maxZ
      )
    )
      continue;
    const f = box.frame;
    if (!f) return box;
    // Into the box's frame: the inverse of `groupToParent`'s turn.
    const dx = x - f.x,
      dz = z - f.z;
    if (
      Math.abs(dx * f.cos - dz * f.sin) < f.halfX + radius &&
      Math.abs(dx * f.sin + dz * f.cos) < f.halfZ + radius
    )
      return box;
  }
  return null;
}

/**
 * True when a body of `radius` at (x, z) would overlap a cottage, a garden or
 * allotment wall, the perimeter fence or the station shop. Same box test as
 * the controllers' machine `collides`, so the three of them agree.
 */
export function walkingObstacleBlocks(x: number, z: number, radius = 0.4): boolean {
  return walkingObstacleAt(x, z, radius) !== null;
}
