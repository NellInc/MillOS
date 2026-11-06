/**
 * The Riverside railway: one double-track line across the east meadow.
 *
 * It comes out of the north-east foothills through a brick portal, sweeps
 * round on a 150 m curve clear of the river's east end, runs straight past
 * Riverside station beside the visitor car park, and goes back into the
 * foothills through a second portal to the south. Everything that touches the
 * line - track, ballast, terrain corridor, platforms, portals, the train and
 * the tests - reads this one alignment, so nothing can drift from it.
 *
 * Distance along the line, `s`, runs from the north end cap (s = 0) to the
 * south end cap (s = RAILWAY_LENGTH). Each bore ends in a black void cap
 * `boreDepth` in from its portal; a train behind a cap is hidden. Both caps
 * sit before the near foothill ring rises above rail level (it starts at
 * r = 271 m), so no hillside shows inside a bore.
 *
 * Pure numbers, no three.js, so terrain and physics can import it freely.
 * Working if the portals, platforms and terrain corridor agree to the
 * centimetre with the track that is drawn.
 */
import { STANDARD_GAME_SPEED } from '../simulation/pace';

export type XZ = readonly [number, number];

/** Line geometry, metres. */
export const RAILWAY = {
  /** Centreline between the two tracks along the station straight. */
  stationX: 158.4,
  /** Track centres, 3.8 m apart: a Victorian double line. */
  trackSpacing: 3.8,
  /** Irish standard gauge, 5 ft 3 in, as on the Larne line. */
  gauge: 1.6,
  /** The straight turns into the north curve here. */
  arcStartZ: -10,
  arcRadius: 150,
  /** Heading change through the north curve. */
  arcTurn: (35 * Math.PI) / 180,
  /** Both portals stand this far from the mill, inside the walkable disc. */
  portalRadius: 228,
  /** Portal face to the void cap. The longest train is 55.5 m. */
  boreDepth: 57,
} as const;

/** Vertical datums for the permanent way, world metres. */
export const RAILWAY_LEVELS = {
  ground: -0.02,
  /** Top of the ballast shoulder. */
  ballastTop: 0.18,
  sleeperTop: 0.3,
  /** Top of rail: every vehicle stands on this. */
  railTop: 0.46,
  /** UK platform height above rail, 915 mm. */
  platformTop: 1.375,
} as const;

/** Nearest platform edge to its track centre: half the gauge plus the 730 mm stand-off. */
export const PLATFORM_EDGE_OFFSET = RAILWAY.gauge / 2 + 0.73;

/** Ballast formation half-widths from the line centre (double track). */
export const RAILWAY_FORMATION = {
  /** Top of the shoulder, outside each track's sleeper ends. */
  shoulder: RAILWAY.trackSpacing / 2 + 1.35 + 0.45,
  /** Toe, where the ballast meets the ground. */
  toe: RAILWAY.trackSpacing / 2 + 1.35 + 1.15,
} as const;

// ---------------------------------------------------------------------------
// Derived alignment
// ---------------------------------------------------------------------------

const { stationX, arcStartZ, arcRadius, arcTurn, portalRadius, boreDepth } = RAILWAY;

/** Centre of the north curve: east of the straight, which turns right going north. */
const ARC_CENTRE: XZ = [stationX + arcRadius, arcStartZ];
/** Northbound heading out of the curve. */
const NORTH_HEADING: XZ = [Math.sin(arcTurn), -Math.cos(arcTurn)];
const ARC_END: XZ = [
  ARC_CENTRE[0] - arcRadius * Math.cos(arcTurn),
  ARC_CENTRE[1] - arcRadius * Math.sin(arcTurn),
];

/** Where the ray from `from` along `dir` reaches `radius` from the mill. */
function rayToRadius(from: XZ, dir: XZ, radius: number): number {
  const b = from[0] * dir[0] + from[1] * dir[1];
  const c = from[0] ** 2 + from[1] ** 2 - radius ** 2;
  return -b + Math.sqrt(b * b - c);
}

const NORTH_APPROACH = rayToRadius(ARC_END, NORTH_HEADING, portalRadius);
const NORTH_PORTAL: XZ = [
  ARC_END[0] + NORTH_HEADING[0] * NORTH_APPROACH,
  ARC_END[1] + NORTH_HEADING[1] * NORTH_APPROACH,
];
const NORTH_VOID: XZ = [
  NORTH_PORTAL[0] + NORTH_HEADING[0] * boreDepth,
  NORTH_PORTAL[1] + NORTH_HEADING[1] * boreDepth,
];
const SOUTH_PORTAL: XZ = [stationX, Math.sqrt(portalRadius ** 2 - stationX ** 2)];
const SOUTH_VOID: XZ = [stationX, SOUTH_PORTAL[1] + boreDepth];

type Segment =
  | { kind: 'line'; from: XZ; to: XZ; length: number }
  | { kind: 'arc'; startAngle: number; sweep: number; length: number };

const line = (from: XZ, to: XZ): Segment => ({
  kind: 'line',
  from,
  to,
  length: Math.hypot(to[0] - from[0], to[1] - from[1]),
});

/** North void to south void, in order of increasing `s`. */
const SEGMENTS: readonly Segment[] = [
  line(NORTH_VOID, NORTH_PORTAL),
  line(NORTH_PORTAL, ARC_END),
  // Southbound through the curve the angle about its centre falls back to PI.
  { kind: 'arc', startAngle: Math.PI + arcTurn, sweep: -arcTurn, length: arcRadius * arcTurn },
  line([stationX, arcStartZ], SOUTH_PORTAL),
  line(SOUTH_PORTAL, SOUTH_VOID),
];

const SEGMENT_STARTS: readonly number[] = SEGMENTS.map((_, index) =>
  SEGMENTS.slice(0, index).reduce((sum, previous) => sum + previous.length, 0)
);

/**
 * Distances at which swept geometry (rails, ballast) needs a cross-section:
 * the two ends of every straight, and every `arcStep` metres round the curve.
 */
export function railwaySweepStations(arcStep = 1): number[] {
  const stations: number[] = [];
  SEGMENTS.forEach((segment, index) => {
    const start = SEGMENT_STARTS[index];
    const steps = segment.kind === 'arc' ? Math.max(1, Math.ceil(segment.length / arcStep)) : 1;
    for (let i = 0; i <= steps; i++) {
      const s = start + (segment.length * i) / steps;
      if (stations.length === 0 || s - stations[stations.length - 1] > 1e-6) stations.push(s);
    }
  });
  return stations;
}

/** Total length between the two void caps. */
export const RAILWAY_LENGTH =
  SEGMENT_STARTS[SEGMENTS.length - 1] + SEGMENTS[SEGMENTS.length - 1].length;

/** `s` at each named point on the line. */
export const RAILWAY_STATIONS_S = {
  northPortal: SEGMENT_STARTS[1],
  curveEnd: SEGMENT_STARTS[2],
  straightStart: SEGMENT_STARTS[3],
  southPortal: SEGMENT_STARTS[4],
} as const;

/** A mutable alignment sample; pass one in to sample without allocating. */
export interface AlignmentSample {
  x: number;
  z: number;
  /** Unit direction of increasing `s` (broadly southward). */
  dirX: number;
  dirZ: number;
}

export const createAlignmentSample = (): AlignmentSample => ({ x: 0, z: 0, dirX: 0, dirZ: 1 });

/**
 * Point and direction on the line centre at `s`. Beyond either void the line
 * runs on straight, so a hidden train still has somewhere to stand.
 */
export function sampleAlignment(
  s: number,
  out: AlignmentSample = createAlignmentSample()
): AlignmentSample {
  const safe = Number.isFinite(s) ? s : 0;
  let index = SEGMENTS.length - 1;
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (safe < SEGMENT_STARTS[i] + SEGMENTS[i].length) {
      index = i;
      break;
    }
  }
  const segment = SEGMENTS[index];
  const local = safe - SEGMENT_STARTS[index];
  if (segment.kind === 'line') {
    out.dirX = (segment.to[0] - segment.from[0]) / segment.length;
    out.dirZ = (segment.to[1] - segment.from[1]) / segment.length;
    out.x = segment.from[0] + out.dirX * local;
    out.z = segment.from[1] + out.dirZ * local;
    return out;
  }
  const angle = segment.startAngle + (segment.sweep * local) / segment.length;
  out.x = ARC_CENTRE[0] + arcRadius * Math.cos(angle);
  out.z = ARC_CENTRE[1] + arcRadius * Math.sin(angle);
  // d/ds of the point, for a negative sweep: the tangent is (sin, -cos).
  out.dirX = Math.sin(angle);
  out.dirZ = -Math.cos(angle);
  return out;
}

/** The two tracks. 1 is the west track beside the building, 2 the east. */
export type RailwayTrack = 1 | 2;

/** Lateral offset of a track from the centre, positive to the east at the station. */
export const trackOffset = (track: RailwayTrack): number =>
  ((track === 1 ? -1 : 1) * RAILWAY.trackSpacing) / 2;

/**
 * Point on a track (or any lateral offset) at `s`. The east normal of the
 * direction (dirX, dirZ) is (dirZ, -dirX): +X along the station straight.
 */
export function sampleOffset(
  s: number,
  offset: number,
  out: AlignmentSample = createAlignmentSample()
): AlignmentSample {
  sampleAlignment(s, out);
  out.x += out.dirZ * offset;
  out.z -= out.dirX * offset;
  return out;
}

/** `s` on the station straight for a world z. */
export const straightS = (z: number): number => RAILWAY_STATIONS_S.straightStart + (z - arcStartZ);

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

/**
 * Tunnel mouths, posed like `SITE_LAYOUT.roadTunnels`: local +Z faces the
 * valley and the bore runs toward local -Z. Their yaw comes from the line's
 * own tangent, so a portal can never point anywhere but down its track.
 */
export const RAILWAY_PORTALS = [
  {
    id: 'railway-portal-north',
    position: [NORTH_PORTAL[0], 0, NORTH_PORTAL[1]] as const,
    rotation: Math.atan2(-NORTH_HEADING[0], -NORTH_HEADING[1]),
  },
  {
    id: 'railway-portal-south',
    position: [SOUTH_PORTAL[0], 0, SOUTH_PORTAL[1]] as const,
    rotation: Math.PI,
  },
] as const;

// ---------------------------------------------------------------------------
// Station
// ---------------------------------------------------------------------------

const track1X = stationX + trackOffset(1);
const track2X = stationX + trackOffset(2);

/**
 * Riverside station, laid out west to east from the car park kerb:
 * forecourt, building, platform 1, the two tracks, platform 2. Platform 1 is
 * the northbound side and carries the building's canopy; platform 2 has its
 * own freestanding shelter. Axis-aligned boxes in world metres.
 */
export const RAILWAY_STATION = {
  name: 'Riverside',
  /** Platform centre, where a standing train is centred. */
  centreZ: 50,
  forecourt: { minX: 132.5, maxX: 141, minZ: 6, maxZ: 82 },
  building: { minX: 141, maxX: 149, minZ: 32, maxZ: 68 },
  platform1: { minX: 141, maxX: track1X - PLATFORM_EDGE_OFFSET, minZ: 12, maxZ: 88 },
  platform2: {
    minX: track2X + PLATFORM_EDGE_OFFSET,
    maxX: track2X + PLATFORM_EDGE_OFFSET + 4.6,
    minZ: 12,
    maxZ: 88,
  },
  /** Each platform runs down to ground over a ramp this long at both ends. */
  rampLength: 8,
  /** Boarded barrow crossing between the feet of the north ramps. */
  crossingZ: 2.6,
  /** The forecourt entrance: a flight of steps up the plinth, beside the cross gable. */
  entranceZ: 62.5,
  /**
   * Eight stone treads from the forecourt to the booking hall door, the top
   * one a landing. `face` is the plinth's street face.
   */
  entranceSteps: { face: 140.9, rises: 8, going: 0.3, landing: 0.7, halfWidth: 1.25, cheek: 0.25 },
  /** The street-side cross gable, a metre proud of the building. */
  gable: { front: 140, minZ: 52, maxZ: 60.5 },
  /** Timber screen at the back of platform 2's shelter. */
  shelterScreen: { minX: 165.76, maxX: 165.84, minZ: 41.7, maxZ: 56.3, top: 4.1 },
  /**
   * Raised flower beds on platform 1's wide open ends, beyond the building:
   * brick-kerbed, `height` above the deck. Clear of the tubs, benches and
   * running-in boards along the back fence and of the lamps near the edge.
   */
  gardens: [
    { minX: 144.6, maxX: 147.4, minZ: 19, maxZ: 29 },
    { minX: 144.6, maxX: 147.4, minZ: 71, maxZ: 81 },
  ],
  gardenHeight: 0.32,
  /**
   * Taco truck at the north end of the forecourt (smaller z is north), its
   * serving hatch (local -X) facing the car park.
   */
  foodTruck: { position: [137.4, 0, 25] as const, rotation: 0 },
  /**
   * The picnic shelter beside it. `BrickCarport` centres its footprint a
   * quarter of its depth behind its origin, so this origin puts the
   * footprint's centre at z 12, clear of platform 1's back wall at x 141.
   */
  shelter: { position: [136.75, 0, 13.65] as const, rotation: 0, size: [7.6, 3.5, 6.6] as const },
} as const;

export const RAILWAY_TRACK_X = { 1: track1X, 2: track2X } as const;

// ---------------------------------------------------------------------------
// Terrain corridor
// ---------------------------------------------------------------------------

/**
 * The north curve, bore included, as a polyline for the terrain `path`
 * region. The arc is sampled at 5 degree steps; its chords stay within
 * 0.15 m of the true curve, far inside the corridor's half-width.
 */
export const RAILWAY_NORTH_CORRIDOR: readonly XZ[] = (() => {
  const points: XZ[] = [NORTH_VOID, NORTH_PORTAL, ARC_END];
  const steps = Math.ceil(arcTurn / ((5 * Math.PI) / 180));
  for (let i = 1; i <= steps; i++) {
    const angle = Math.PI + arcTurn * (1 - i / steps);
    points.push([
      ARC_CENTRE[0] + arcRadius * Math.cos(angle),
      ARC_CENTRE[1] + arcRadius * Math.sin(angle),
    ]);
  }
  return points;
})();

/** The station straight and south bore, from the end of the curve to the south void. */
export const RAILWAY_STRAIGHT_CORRIDOR = {
  x: stationX,
  minZ: arcStartZ,
  maxZ: SOUTH_VOID[1],
} as const;

/** Half-width of the gravel corridor painted under the line. */
export const RAILWAY_CORRIDOR_HALF_WIDTH = RAILWAY_FORMATION.toe + 1.5;

// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------

export type RailwayVehicleKind = 'engine' | 'coach';

/** A tank engine and three coaches. `pivot` is each bogie centre from the vehicle centre. */
export const RAILWAY_CONSIST: readonly {
  kind: RailwayVehicleKind;
  length: number;
  pivot: number;
}[] = [
  { kind: 'engine', length: 10.6, pivot: 3.1 },
  { kind: 'coach', length: 14.5, pivot: 4.9 },
  { kind: 'coach', length: 14.5, pivot: 4.9 },
  { kind: 'coach', length: 14.5, pivot: 4.9 },
];
/** Buffers nearly touching: the consist is close-coupled. */
export const RAILWAY_COUPLING_GAP = 0.05;
export const RAILWAY_TRAIN_LENGTH =
  RAILWAY_CONSIST.reduce((sum, vehicle) => sum + vehicle.length, 0) +
  RAILWAY_COUPLING_GAP * (RAILWAY_CONSIST.length - 1);

/** Game hours in one real second at standard pace. */
const HOURS_PER_SECOND = STANDARD_GAME_SPEED / 3600;

/**
 * A visit every two game hours, alternating direction, so each direction
 * calls every four. Durations are authored in real seconds at standard pace;
 * a faster pace is a time-lapse of the same run. The standing time is centred
 * on each even hour, so captures taken on the hour find a train at the platform.
 */
export const RAILWAY_TIMETABLE = {
  periodHours: 2,
  approachHours: 37 * HOURS_PER_SECOND,
  standHours: 30 * HOURS_PER_SECOND,
  departHours: 30 * HOURS_PER_SECOND,
  /** Clearance beyond a void cap before a train counts as gone. */
  hiddenMargin: 2,
} as const;

export type RailwayTrainPhase = 'hidden' | 'arriving' | 'standing' | 'departing';

export interface RailwayTrainPose {
  phase: RailwayTrainPhase;
  visible: boolean;
  track: RailwayTrack;
  /** +1 southbound (increasing s), -1 northbound. */
  direction: 1 | -1;
  /** `s` of the leading buffer beam. */
  headS: number;
}

export const createRailwayTrainPose = (): RailwayTrainPose => ({
  phase: 'hidden',
  visible: false,
  track: 1,
  direction: -1,
  headS: RAILWAY_LENGTH + RAILWAY_TIMETABLE.hiddenMargin,
});

const STOP_CENTRE_S = straightS(RAILWAY_STATION.centreZ);

/**
 * The train at a world hour (day * 24 + hour). Even visits run north on
 * track 1 beside the building, odd visits south on track 2. Arrival brakes
 * evenly from the void cap to a stand centred on the platform; departure
 * accelerates evenly until the last coach is behind the far cap.
 * Working if the train never jumps while visible and stands exactly at the
 * platform for the whole standing phase.
 */
export function sampleRailwayTrain(
  hour: number,
  out: RailwayTrainPose = createRailwayTrainPose()
): RailwayTrainPose {
  const { periodHours, approachHours, standHours, departHours, hiddenMargin } = RAILWAY_TIMETABLE;
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const visit = Math.round(safeHour / periodHours);
  const t = safeHour - visit * periodHours;
  const north = ((visit % 2) + 2) % 2 === 0;
  const direction = north ? -1 : 1;
  const half = RAILWAY_TRAIN_LENGTH / 2;
  const stopHead = STOP_CENTRE_S + direction * half;
  // Wholly behind the arrival cap, and wholly behind the departure cap.
  const startHead = north ? RAILWAY_LENGTH + hiddenMargin : -hiddenMargin;
  const endHead = north
    ? -hiddenMargin - RAILWAY_TRAIN_LENGTH
    : RAILWAY_LENGTH + hiddenMargin + RAILWAY_TRAIN_LENGTH;
  const standStart = -standHours / 2;
  const standEnd = standHours / 2;
  out.track = north ? 1 : 2;
  out.direction = direction;
  if (t < standStart - approachHours) {
    out.phase = 'hidden';
    out.headS = startHead;
  } else if (t < standStart) {
    const u = (t - (standStart - approachHours)) / approachHours;
    out.phase = 'arriving';
    out.headS = startHead + (stopHead - startHead) * (1 - (1 - u) * (1 - u));
  } else if (t <= standEnd) {
    out.phase = 'standing';
    out.headS = stopHead;
  } else if (t < standEnd + departHours) {
    const u = (t - standEnd) / departHours;
    out.phase = 'departing';
    out.headS = stopHead + (endHead - stopHead) * u * u;
  } else {
    out.phase = 'hidden';
    out.headS = endHead;
  }
  const tailS = out.headS - direction * RAILWAY_TRAIN_LENGTH;
  out.visible = Math.max(out.headS, tailS) > 0 && Math.min(out.headS, tailS) < RAILWAY_LENGTH;
  return out;
}

/** One vehicle's pose on the track: its centre's `s`, centre and yaw (the model faces local +Z). */
export interface RailwayVehiclePose {
  s: number;
  x: number;
  z: number;
  yaw: number;
}

const _front = createAlignmentSample();
const _rear = createAlignmentSample();

/**
 * Place every vehicle of the consist by its two bogie centres, so the train
 * articulates round the curve instead of swinging as one rigid bar. The
 * engine leads; each vehicle faces the direction of travel.
 * Allocation-free: fill a pre-built array of RAILWAY_CONSIST.length poses.
 */
export function placeRailwayConsist(pose: RailwayTrainPose, out: RailwayVehiclePose[]): void {
  const offset = trackOffset(pose.track);
  let cursor = pose.headS;
  for (let i = 0; i < RAILWAY_CONSIST.length; i++) {
    const vehicle = RAILWAY_CONSIST[i];
    const centre = cursor - (pose.direction * vehicle.length) / 2;
    sampleOffset(centre + pose.direction * vehicle.pivot, offset, _front);
    sampleOffset(centre - pose.direction * vehicle.pivot, offset, _rear);
    const target = out[i];
    target.s = centre;
    target.x = (_front.x + _rear.x) / 2;
    target.z = (_front.z + _rear.z) / 2;
    target.yaw = Math.atan2(_front.x - _rear.x, _front.z - _rear.z);
    cursor -= pose.direction * (vehicle.length + RAILWAY_COUPLING_GAP);
  }
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

/** Everything the station adds to walking lies inside this box. */
export function nearRailwayStation(x: number, z: number): boolean {
  const { forecourt, platform2, platform1, rampLength } = RAILWAY_STATION;
  return (
    x > forecourt.minX + 2 &&
    x < platform2.maxX + 1.5 &&
    z > platform1.minZ - rampLength - 1.5 &&
    z < platform1.maxZ + rampLength + 1.5
  );
}

/** Height of a tread of the forecourt steps at `x`, or null off them. */
function entranceStepHeight(x: number, z: number): number | null {
  const { face, rises, going, landing, halfWidth } = RAILWAY_STATION.entranceSteps;
  const foot = face - landing - (rises - 1) * going;
  if (Math.abs(z - RAILWAY_STATION.entranceZ) > halfWidth || x < foot || x > face) return null;
  const tread = Math.min(rises - 1, Math.floor((x - foot) / going));
  return (
    RAILWAY_LEVELS.ground +
    ((RAILWAY_LEVELS.platformTop - RAILWAY_LEVELS.ground) * (tread + 1)) / rises
  );
}

/**
 * Walking height on the station's raised floors: both platforms, their ramps
 * and the forecourt steps. Null anywhere else, so the terrain applies.
 * Working if a walker climbs the steps or a ramp onto a platform, and the
 * step limit near the station keeps them off the platform faces.
 */
export function railwayStationWalkingHeight(x: number, z: number): number | null {
  if (!nearRailwayStation(x, z)) return null;
  const step = entranceStepHeight(x, z);
  if (step !== null) return step;
  const { platformTop: top, ground } = RAILWAY_LEVELS;
  const ramp = RAILWAY_STATION.rampLength;
  for (const p of [RAILWAY_STATION.platform1, RAILWAY_STATION.platform2]) {
    if (x < p.minX || x > p.maxX) continue;
    if (z >= p.minZ && z <= p.maxZ) return top;
    if (z >= p.minZ - ramp && z < p.minZ)
      return ground + ((top - ground) * (z - (p.minZ - ramp))) / ramp;
    if (z > p.maxZ && z <= p.maxZ + ramp) return top - ((top - ground) * (z - p.maxZ)) / ramp;
  }
  return null;
}

/** Solid parts of the station a walker cannot pass: [minX, maxX, minZ, maxZ, bottom, top]. */
export const RAILWAY_STATION_SOLIDS: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
])[] = (() => {
  const {
    building: b,
    gable: g,
    entranceSteps: e,
    entranceZ,
    platform1: p1,
    platform2: p2,
    shelterScreen: sc,
  } = RAILWAY_STATION;
  const { ground, platformTop } = RAILWAY_LEVELS;
  const foot = e.face - e.landing - (e.rises - 1) * e.going;
  return [
    [b.minX - 0.1, b.maxX + 0.1, b.minZ, b.maxZ + 0.1, ground, 12],
    [g.front - 0.1, b.minX, g.minZ, g.maxZ, ground, 11],
    ...[-1, 1].map(
      (side) =>
        [
          foot,
          e.face,
          Math.min(entranceZ + side * e.halfWidth, entranceZ + side * (e.halfWidth + e.cheek)),
          Math.max(entranceZ + side * e.halfWidth, entranceZ + side * (e.halfWidth + e.cheek)),
          ground,
          platformTop + 0.75,
        ] as const
    ),
    [sc.minX, sc.maxX, sc.minZ, sc.maxZ, platformTop, sc.top],
    [p1.minX + 0.07, p1.minX + 0.17, p1.minZ, b.minZ, platformTop, platformTop + 1.2],
    [p1.minX + 0.07, p1.minX + 0.17, b.maxZ, p1.maxZ, platformTop, platformTop + 1.2],
    [p2.maxX - 0.17, p2.maxX - 0.07, p2.minZ, p2.maxZ, platformTop, platformTop + 1.2],
    ...RAILWAY_STATION.gardens.map(
      (g) =>
        [
          g.minX,
          g.maxX,
          g.minZ,
          g.maxZ,
          platformTop,
          platformTop + RAILWAY_STATION.gardenHeight,
        ] as const
    ),
  ];
})();

/** True where a body of `radius` at `feet` would overlap one of the station's solids. */
export function railwayStationBlocks(
  x: number,
  z: number,
  feet: number,
  radius = 0.4,
  bodyHeight = 1.8
): boolean {
  if (!nearRailwayStation(x, z)) return false;
  for (const [minX, maxX, minZ, maxZ, bottom, top] of RAILWAY_STATION_SOLIDS)
    if (
      feet < top &&
      feet + bodyHeight > bottom &&
      x + radius > minX &&
      x - radius < maxX &&
      z + radius > minZ &&
      z - radius < maxZ
    )
      return true;
  return false;
}

/**
 * The station's floors and solids as boxes for the physics assembly: both
 * platform decks, each ramp as eight 1 m treads, the forecourt steps and the
 * solids walking already blocks.
 */
export function railwayStationObstacles(): {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}[] {
  const { ground, platformTop } = RAILWAY_LEVELS;
  const { platform1, platform2, rampLength, entranceSteps: e, entranceZ } = RAILWAY_STATION;
  const boxes: ReturnType<typeof railwayStationObstacles> = [];
  [platform1, platform2].forEach((p, index) => {
    const { minX, maxX, minZ, maxZ } = p;
    boxes.push({
      id: `railway-platform-${index + 1}`,
      minX,
      maxX,
      minZ,
      maxZ,
      minY: ground - 0.2,
      maxY: platformTop,
    });
    for (let i = 0; i < rampLength; i++) {
      const top = ground + ((platformTop - ground) * (i + 1)) / (rampLength + 1);
      boxes.push(
        {
          id: `railway-ramp-${index + 1}-n${i}`,
          minX,
          maxX,
          minZ: minZ - rampLength + i,
          maxZ: minZ - rampLength + i + 1,
          minY: ground - 0.2,
          maxY: top,
        },
        {
          id: `railway-ramp-${index + 1}-s${i}`,
          minX,
          maxX,
          minZ: maxZ + rampLength - i - 1,
          maxZ: maxZ + rampLength - i,
          minY: ground - 0.2,
          maxY: top,
        }
      );
    }
  });
  const foot = e.face - e.landing - (e.rises - 1) * e.going;
  for (let i = 0; i < e.rises; i++)
    boxes.push({
      id: `railway-entrance-step-${i}`,
      minX: foot + i * e.going,
      maxX: e.face,
      minZ: entranceZ - e.halfWidth,
      maxZ: entranceZ + e.halfWidth,
      minY: ground - 0.2,
      maxY: ground + ((platformTop - ground) * (i + 1)) / e.rises,
    });
  RAILWAY_STATION_SOLIDS.forEach(([minX, maxX, minZ, maxZ, minY, maxY], index) =>
    boxes.push({ id: `railway-solid-${index}`, minX, maxX, minZ, maxZ, minY, maxY })
  );
  return boxes;
}
