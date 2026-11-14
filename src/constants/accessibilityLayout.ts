/**
 * Where the accessibility fittings stand, and the shapes of the mobility aids
 * (D-058). Pure numbers, no three.js: the people's routes (communityLife.ts),
 * the body poses (workerPose.ts), the fittings (AccessFittings.tsx) and their
 * tests read the same values.
 *
 * World metres unless a block says otherwise. Aid shapes are in the person's
 * own root frame: metres, +Z ahead, +X to their left, Y up from the floor.
 */
import type { Vec3Tuple } from './siteLayout';

// ---------------------------------------------------------------------------
// Mobility aids, in the person's root frame
// ---------------------------------------------------------------------------

/** A rigid-frame manual wheelchair, 24 inch drive wheels, sized for an adult. */
export const WHEELCHAIR = Object.freeze({
  /** Top of the cushion. */
  seatHeight: 0.5,
  seatDepth: 0.44,
  seatWidth: 0.44,
  /** Back of the seat, behind the root (the pelvis sits over the root). */
  seatBackZ: -0.2,
  backrestHeight: 0.42,
  /** Drive wheel: outer radius, centre plane and hub. */
  wheelRadius: 0.305,
  wheelX: 0.29,
  axleY: 0.305,
  axleZ: -0.08,
  /** Push rim, just outside the wheel. */
  rimRadius: 0.27,
  rimX: 0.335,
  /** Front casters. */
  casterRadius: 0.075,
  casterX: 0.2,
  casterZ: 0.3,
  /** Where the feet rest. */
  footplateY: 0.12,
  footplateZ: 0.42,
  /** Half the overall width, push rims included: what a route must leave clear. */
  halfWidth: 0.36,
});

/** Rim angle at the start and the end of a push, radians from the top, + forward. */
export const WHEELCHAIR_PUSH = Object.freeze({
  catchAngle: -0.55,
  releaseAngle: 0.95,
  /** Share of a push cycle the hand is on the rim; the rest is the recovery. */
  contact: 0.58,
  /** Ground covered by one push at an easy pace, metres. */
  metresPerPush: 1.25,
});

/**
 * Where the palm is on the push rim (or on its way back to it), for a push
 * cycle `phase` in radians. Root frame, metres. `side` +1 left, -1 right.
 * Working if the contact half of the cycle stays on the rim's circle and the
 * recovery lifts clear of it (accessibilityLayout.test.ts).
 */
export function wheelchairHandPoint(
  side: 1 | -1,
  phase: number,
  out: { x: number; y: number; z: number; onRim: boolean }
) {
  const cycle = Number.isFinite(phase) ? (((phase / (2 * Math.PI)) % 1) + 1) % 1 : 0;
  const { catchAngle, releaseAngle, contact } = WHEELCHAIR_PUSH;
  let angle: number,
    lift = 0;
  if (cycle < contact) {
    const t = cycle / contact;
    angle = catchAngle + (releaseAngle - catchAngle) * (t * t * (3 - 2 * t));
  } else {
    const t = (cycle - contact) / (1 - contact);
    angle = releaseAngle + (catchAngle - releaseAngle) * (t * t * (3 - 2 * t));
    lift = Math.sin(Math.PI * t);
  }
  const radius = WHEELCHAIR.rimRadius + 0.07 * lift;
  out.x = side * (WHEELCHAIR.rimX + 0.03 * lift);
  out.y = WHEELCHAIR.axleY + radius * Math.cos(angle);
  out.z = WHEELCHAIR.axleZ + radius * Math.sin(angle);
  out.onRim = lift === 0;
  return out;
}

/** A long cane held at the midline, two-point touch. Root frame, metres. */
export const LONG_CANE = Object.freeze({
  length: 1.24,
  /** Where the palm holds the grip. */
  grip: Object.freeze([-0.04, 0.95, 0.32] as const),
  /** Half the arc the tip sweeps, radians either side of straight ahead. */
  sweep: 0.36,
  /** Distance walked for one sweep across and back (two steps). */
  metresPerSweep: 1.45,
  /** The red band near the tip, metres up from the tip. */
  bandFrom: 0.1,
  bandTo: 0.3,
});

/** How far the right hand's fingers close round the cane's grip (hand pose weight). */
export const LONG_CANE_GRIP_CLOSE = 0.55;

/** The cane's grip and tip for a sweep in [-1, 1]; the tip stays on the ground. */
export function longCanePoints(
  sweep: number,
  grip: { x: number; y: number; z: number },
  tip: { x: number; y: number; z: number }
) {
  const s = Number.isFinite(sweep) ? Math.max(-1, Math.min(1, sweep)) : 0;
  [grip.x, grip.y, grip.z] = LONG_CANE.grip;
  const drop = grip.y - 0.02;
  const reach = Math.sqrt(Math.max(0, LONG_CANE.length ** 2 - drop * drop));
  const angle = s * LONG_CANE.sweep;
  tip.x = grip.x + reach * Math.sin(angle);
  tip.y = 0.02;
  tip.z = grip.z + reach * Math.cos(angle);
}

// ---------------------------------------------------------------------------
// The mill hall
// ---------------------------------------------------------------------------

/**
 * The quality technician's bench, set to their seated working height with
 * knee room under it: a sit-stand bench on two lifting columns. They work at
 * it from their wheelchair, facing +Z.
 */
export const QC_BENCH = Object.freeze({
  centre: Object.freeze([-20, 0, 2.55] as Vec3Tuple),
  width: 1.8,
  depth: 0.75,
  /** Set for seated work; the columns stand it anywhere from 0.65 to 1.25 m. */
  topHeight: 0.74,
  /** Where the technician sits, at the bench edge. */
  post: Object.freeze([-20, 0, 1.75] as Vec3Tuple),
});

/** A table for the technician's tea break, with no fixed chair at their place. */
export const QC_BREAK_TABLE = Object.freeze({
  centre: Object.freeze([-23.6, 0, 6.55] as Vec3Tuple),
  radius: 0.45,
  height: 0.74,
  place: Object.freeze([-23.6, 0, 5.85] as Vec3Tuple),
});

/** A glazed acoustic room on the hall floor, door on its -Z face. */
export const QUIET_ROOM = Object.freeze({
  centre: Object.freeze([-27, 0, 9.6] as Vec3Tuple),
  width: 2.6,
  depth: 2.6,
  height: 2.5,
  /** Door centre, on the -Z face. */
  doorX: -27,
  doorWidth: 0.95,
  /** The armchair inside, facing out through the glazed door. */
  seat: Object.freeze([-27, 0, 10.25] as Vec3Tuple),
  seatHeight: 0.44,
});

/**
 * Visual alarm devices: a sounder with a strobe, wall-mounted on the hall's
 * walls (the hall's inner faces are x +/-40 and z +/-50), one beside each of
 * the four service exits and along both long walls. `facing` is the yaw the
 * device faces into the hall.
 */
export const HALL_VISUAL_ALARMS: readonly { position: Vec3Tuple; facing: number }[] = Object.freeze(
  [
    ...[-30, -6, 18, 34].map((z) => ({
      position: [-39.75, 2.7, z] as Vec3Tuple,
      facing: Math.PI / 2,
    })),
    ...[-30, -6, 18, 34].map((z) => ({
      position: [39.75, 2.7, z] as Vec3Tuple,
      facing: -Math.PI / 2,
    })),
    ...[-28, 28].map((x) => ({ position: [x, 2.7, -49.75] as Vec3Tuple, facing: 0 })),
    ...[-28, 28].map((x) => ({ position: [x, 2.7, 49.75] as Vec3Tuple, facing: Math.PI })),
  ]
);

/** The visual alert lamp at the east roller mill's workpost (rm-104), on a post. */
export const WORKPOST_ALERT_LAMP = Object.freeze({
  position: Object.freeze([19.6, 0, 33.4] as Vec3Tuple),
  height: 2.05,
});

// ---------------------------------------------------------------------------
// Step-free personnel doors beside the docks
// ---------------------------------------------------------------------------

/**
 * A level personnel door in each gable wall, beside its dock (2026-11-07).
 * The shipping and receiving decks stand a metre above the hall floor and
 * the docks' own pedestrian approach is the forklift's channel, so the front
 * and back egress zones had no step-free way out of their own. Each door is
 * at the end of the east walkway (x 35.5-38.5), clear of both forklift lanes
 * (which stay west of x 1.4), the dock platforms (to x 18) and the trucks
 * (which never come east of x 25 below z 70 in either yard).
 *
 * `outward` is the sign of z toward the yard; the leaf opens that way (the
 * way of escape) and stands held open against its hinge jamb on the east.
 */
export const PERSONNEL_DOORS: readonly {
  readonly id: 'front' | 'back';
  readonly x: number;
  readonly wallZ: number;
  readonly outward: 1 | -1;
  /** Where the egress drill marks the zone: 2 m out, like the service doors' markers. */
  readonly marker: readonly [number, number];
  /** Where someone waits for help, on the landing outside beside the door. */
  readonly refuge: readonly [number, number];
  /** The assembly point the outside walk leads to, on open apron. */
  readonly assembly: readonly [number, number];
}[] = Object.freeze(
  ([1, -1] as const).map((outward) => ({
    id: outward > 0 ? ('front' as const) : ('back' as const),
    x: 37,
    wallZ: 50 * outward,
    outward,
    marker: [37, 52 * outward] as const,
    refuge: [36, 51.6 * outward] as const,
    assembly: [37, 64 * outward] as const,
  }))
);

/**
 * The door set's dimensions, metres. A 1.0 m clear opening (a wheelchair needs
 * 0.8, the guidance for a public external door is 1.0) and 2.2 m clear height,
 * in a steel frame the depth of the 0.55 m wall plinth. The wall opening that
 * the glazing and the plinth leave is the frame's outside: `openingHalfWidth`
 * either side of the door's centre, `openingTop` high.
 */
export const PERSONNEL_DOOR = Object.freeze({
  clearWidth: 1.0,
  clearHeight: 2.2,
  /** Each jamb's face width; jambs stand either side of the clear opening. */
  jamb: 0.16,
  /** The head member above the clear height. */
  head: 0.21,
  /** The frame's depth through the wall (the plinth is 0.55 deep at z +/-50). */
  depth: 0.7,
  /** Half the wall opening the glazing and plinth leave (clear width plus both jambs). */
  openingHalfWidth: 0.66,
  /** Top of the wall opening: the glazing above starts here. */
  openingTop: 2.55,
  leafThickness: 0.05,
  /** The level landing outside: width across the door and depth out from the wall. */
  landing: Object.freeze({ width: 2.4, depth: 2.2 }),
  /** The walk from the landing to the assembly point. */
  walkWidth: 1.6,
  /** The assembly point's painted square, its side. */
  assemblySize: 4,
});

/**
 * The paved cross path behind the hall (FactoryExterior: `<GravelPath
 * start={[-65, 0, -60]} end={[65, 0, -60]} width={2} type="paved" />`, its
 * edging 0.1 m out and 0.15 wide), part of the site's walk network. The back
 * door's painted walk joins it and carries on beyond it to the assembly point;
 * the paint stops at its edging rather than lying across the paving.
 */
export const REAR_CROSS_PATH = Object.freeze({ z: -60, minX: -65, maxX: 65, halfWidth: 1.175 });

// ---------------------------------------------------------------------------
// The town hall (village)
// ---------------------------------------------------------------------------

/**
 * The town hall's frame: `townhall.glb` is mounted at village (0, 0, 20),
 * turned half round, and the village at world (-190, 0, 0) (VILLAGE_CIVIC_PLACEMENTS,
 * siteLayout VILLAGE_SITE). Local +Z is the front, which faces north onto the
 * square.
 */
export const TOWN_HALL_FRAME = Object.freeze({ x: -190, z: 20, yaw: Math.PI });
export function townHallToWorld(x: number, y: number, z: number): Vec3Tuple {
  return [TOWN_HALL_FRAME.x - x, y, TOWN_HALL_FRAME.z - z];
}

/**
 * Approved Document M Volume 2 (2015 edition incorporating the 2020 and 2024
 * amendments, gov.uk), the limits this ramp is built to. Page numbers are the
 * document's printed folios.
 *
 * - Table 1 and 1.26 b (p. 19): a flight's gradient may be no steeper than
 *   1:12 at a 2 m going, 1:15 at 5 m and 1:20 at 10 m, "for goings between 2m
 *   and 10m, it is acceptable to interpolate ... 1:14 for a 4m going or 1:19
 *   for a 9m going": 1:(going + 10).
 * - 1.26 c (p. 19): "no flight has a going greater than 10m, or a rise of
 *   more than 500mm".
 * - 1.26 e (p. 19): "a surface width between walls, upstands or kerbs of at
 *   least 1.5m".
 * - 1.26 h and i (p. 20): landings at the foot and head "at least 1.2m long",
 *   intermediate landings "at least 1.5m long", clear of obstructions.
 * - 1.26 m (p. 20): "a kerb on the open side of any ramp or landing at least
 *   100mm high, which contrasts visually"; 1.26 f (p. 20): the ramp surface's
 *   colour "contrasts visually with that of the landings". 0.26 (pp. 14-15):
 *   contrast visually means a light reflectance value difference "greater
 *   than 30 points".
 * - 1.37 (pp. 22-23): top handrail 900-1000 mm above the ramp's pitch line
 *   (a), extending "at least 300mm horizontally beyond the top and bottom" (d),
 *   32-50 mm round (h), protruding no more than 100 mm into the surface width
 *   (i), 50-75 mm clear of an adjacent wall (j), its inner face no more than
 *   50 mm beyond the surface width (l).
 */
export const DOC_M_RAMP = Object.freeze({
  maxGoing: 10,
  maxFlightRise: 0.5,
  /** Table 1's interpolated limit: the steepest gradient (rise over going) a flight of this going may have. */
  maxGradient: (going: number) => 1 / (Math.min(10, Math.max(2, going)) + 10),
  minSurfaceWidth: 1.5,
  minEndLanding: 1.2,
  minIntermediateLanding: 1.5,
  minKerbHeight: 0.1,
  minContrastLrv: 30,
  handrailHeight: Object.freeze({ min: 0.9, max: 1.0 }),
  handrailExtension: 0.3,
  handrailDiameter: Object.freeze({ min: 0.032, max: 0.05 }),
  handrailMaxIntrusion: 0.1,
  handrailWallClearance: Object.freeze({ min: 0.05, max: 0.075 }),
  handrailMaxOutside: 0.05,
});

/**
 * A ramp beside the front steps, in the town hall's frame. The front landing
 * is 0.80 m up (five 0.16 m steps, measured from townhall.glb), so the ramp
 * leaves the landing along the front and runs down the east side inside the
 * privet in two flights with a level landing between. Same door as everyone
 * else.
 *
 * Built to DOC_M_RAMP (2026-11-13). Each flight rises 0.4 m over a 6.8 m
 * going, 1:17 against Table 1's 1:16.8 for that going; the mid landing is
 * 1.55 m and the head landing 2.2 m long. The surface is 1.505 m between the
 * outer kerb and the hall's plinth face (x -6.065, 0.32 m high, from
 * rebuild_village_architecture.py `civic_plinth`); past the hall's back wall
 * (z -5.065) a second kerb takes the plinth's place. Three flights were the
 * other way to 0.8 m and would need 1.8 m passing landings (1.26 j). The two
 * flights run 15.15 m with the mid landing, 4 m further back than the old
 * 1:12 ramp, so the privet beside it moved 0.3 m east and its back return
 * was cut short at the inner kerb (VillageGardens TOWN_HALL_PRIVET_RUNS).
 *
 * The portico's east column stands on a base (x -3.0..-2.2, z 5.22..6.02 in
 * townhall.glb) 0.12 m off the wall, so nothing wider than a hand passes
 * behind it. The ramp's landing reaches the portico landing in front of the
 * column instead, on an apron built over the east end of the steps
 * (2026-11-07); the steps keep x -0.9..2.85, 3.75 m wide. The apron runs
 * 0.3 m further out than the head landing so that 1.5 m stays clear between
 * the column base and its kerb.
 */
export const TOWN_HALL_RAMP = Object.freeze({
  landingY: 0.8,
  /**
   * Top landing, beside the portico's own landing (which ends at |x| 2.57).
   * Its front stands 2 cm proud of the bottom riser (z 7.3), not in its plane.
   */
  top: Object.freeze({ minX: -7.67, maxX: -3.05, minZ: 5.0, maxZ: 7.32 }),
  /** The apron over the steps' east end, in front of the column: same level as the landing. */
  apron: Object.freeze({ minX: -3.45, maxX: -0.9, minZ: 5.9, maxZ: 7.63 }),
  /** The flights run along x in [minX, maxX], down toward -Z: kerb's outer face to the wall. */
  minX: -7.67,
  maxX: -6.0,
  /** The walking surface between the outer kerb and the plinth face (or the inner kerb). */
  clearMinX: -7.57,
  clearMaxX: -6.065,
  /** Kerbs on every open side of the ramp and its landings, inside the edges above. */
  kerb: Object.freeze({ width: 0.1, height: 0.1 }),
  /** The hall's plinth ends here; from here to the foot the inner side is open and kerbed. */
  wallEndZ: -5.065,
  flights: Object.freeze([
    Object.freeze({ fromZ: 5.0, toZ: -1.8, fromY: 0.8, toY: 0.4 }),
    Object.freeze({ fromZ: -3.35, toZ: -10.15, fromY: 0.4, toY: 0 }),
  ]),
  /** The level landing between the flights. */
  midLanding: Object.freeze({ fromZ: -1.8, toZ: -3.35, y: 0.4 }),
  /** The paved landing at the foot, on the ground. */
  footLanding: Object.freeze({ fromZ: -10.15, toZ: -11.4 }),
  railHeight: 0.9,
  /** Handrail centre lines: over the outer kerb, and 73 mm off the plastered wall. */
  outerRailX: -7.62,
  innerRailX: -6.095,
  railRadius: 0.022,
});

/**
 * The ramp's finishes (sRGB albedo): landings in the hall's pale stone, the
 * flights in a dark granite sett and the kerbs in a pale limestone, so the
 * flights contrast with the landings (1.26 f) and the kerbs with both (1.26 m),
 * each pair more than 30 light reflectance points apart (0.26).
 */
export const TOWN_HALL_RAMP_FINISH = Object.freeze({
  landing: '#b9b2a6',
  flight: '#605a52',
  kerb: '#ece8de',
});

/** The ramp's walking height at a point in the town hall frame, or null off it. */
export function townHallRampHeight(x: number, z: number): number | null {
  const r = TOWN_HALL_RAMP;
  for (const level of [r.top, r.apron])
    if (x >= level.minX && x <= level.maxX && z >= level.minZ && z <= level.maxZ) return r.landingY;
  if (x < r.minX || x > r.maxX) return null;
  for (const flight of r.flights) {
    const hi = Math.max(flight.fromZ, flight.toZ),
      lo = Math.min(flight.fromZ, flight.toZ);
    if (z >= lo && z <= hi)
      return (
        flight.fromY +
        ((z - flight.fromZ) / (flight.toZ - flight.fromZ)) * (flight.toY - flight.fromY)
      );
  }
  if (z <= r.midLanding.fromZ && z >= r.midLanding.toZ) return r.midLanding.y;
  return null;
}

type LocalXZ = readonly [number, number];

/** Half the thickness a handrail line blocks a walker with, metres. */
export const TOWN_HALL_RAIL_HALF_WIDTH = 0.03;

/**
 * The kerbs as plan rectangles in the town hall frame, each `kerb.height`
 * above the surface it edges: the outer side from the head landing's front
 * to the foot, the head landing's front, the step out to the apron's deeper
 * front, the apron's front, the apron's edge above the steps, and the inner
 * side from the end of the hall's plinth to the foot.
 */
export const TOWN_HALL_RAMP_KERBS: readonly {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}[] = (() => {
  const r = TOWN_HALL_RAMP;
  const w = r.kerb.width,
    foot = r.flights[1].toZ;
  const jog = r.apron.minX;
  return Object.freeze([
    { minX: r.minX, maxX: r.minX + w, minZ: foot, maxZ: r.top.maxZ },
    { minX: r.minX + w, maxX: jog, minZ: r.top.maxZ - w, maxZ: r.top.maxZ },
    { minX: jog, maxX: jog + w, minZ: r.top.maxZ - w, maxZ: r.apron.maxZ - w },
    { minX: jog, maxX: r.apron.maxX, minZ: r.apron.maxZ - w, maxZ: r.apron.maxZ },
    { minX: r.apron.maxX - w, maxX: r.apron.maxX, minZ: r.apron.minZ, maxZ: r.apron.maxZ - w },
    { minX: r.clearMaxX, maxX: r.clearMaxX + w, minZ: foot, maxZ: r.wallEndZ },
  ]);
})();

/**
 * The ramp's handrails as plan lines in the town hall frame: over the outer
 * kerb from the head landing's front to 0.3 m past the foot, along the wall
 * side from 0.3 m onto the head landing to 0.3 m past the foot (DOC_M_RAMP
 * 1.37 d), and over the kerbs of the head landing's front, the apron's step
 * and front, and the apron's edge above the steps. Each carries handrails 0.9
 * and 0.6 m above the surface beside it. AccessFittings draws them and the
 * first-person walker stops at them (`townHallBlocks`), so the ramp is walked
 * up, not stepped off. The first line is the outer rail (TOWN_HALL_RAMP_LAMPS).
 */
export const TOWN_HALL_RAMP_RAILS: readonly { readonly from: LocalXZ; readonly to: LocalXZ }[] =
  (() => {
    const r = TOWN_HALL_RAMP;
    const half = r.kerb.width / 2;
    const outer = r.outerRailX,
      inner = r.innerRailX,
      front = r.top.maxZ - half,
      jog = r.apron.minX + half,
      apronFront = r.apron.maxZ - half,
      edge = r.apron.maxX - half,
      foot = r.flights[1].toZ - 0.3;
    return Object.freeze([
      { from: [outer, front] as LocalXZ, to: [outer, foot] as LocalXZ },
      { from: [inner, r.flights[0].fromZ + 0.3] as LocalXZ, to: [inner, foot] as LocalXZ },
      { from: [outer, front] as LocalXZ, to: [jog, front] as LocalXZ },
      { from: [jog, front] as LocalXZ, to: [jog, apronFront] as LocalXZ },
      { from: [jog, apronFront] as LocalXZ, to: [edge, apronFront] as LocalXZ },
      { from: [edge, apronFront] as LocalXZ, to: [edge, r.apron.minZ + 0.15] as LocalXZ },
    ]);
  })();

/** Spacing the rail posts aim for along a rail line, metres. */
const RAIL_POST_PITCH = 1.2;

/** The posts along one rail line, evenly spaced from end to end, in the town hall frame. */
export function townHallRailPosts(rail: (typeof TOWN_HALL_RAMP_RAILS)[number]): LocalXZ[] {
  const { from, to } = rail;
  const posts = Math.max(
    1,
    Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / RAIL_POST_PITCH)
  );
  return Array.from({ length: posts + 1 }, (_, i) => {
    const t = i / posts;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as LocalXZ;
  });
}

/**
 * Low lights on the outer rail's posts, which light the ramp from its side:
 * the three civic ground lamps that stood on the ramp's line before it was
 * built (CIVIC_LAMPS `hall-verge`, `hall-side-near`, `hall-side-far`; there is
 * 12 cm between the kerb and the privet, no room for a ground fitting).
 * One at the head of the first flight, one on the mid landing and one on the
 * second flight (2026-11-13: the posts nearest z 4.5, -2.55 and -8.5), 0.4 m
 * above the surface there (under the 0.6 m rail), its lens 7 cm in from the
 * post toward the walking surface. Town hall frame; `facing` is +1 (toward
 * +x, the ramp).
 */
export const TOWN_HALL_RAMP_LAMP_HEIGHT = 0.4;
export const TOWN_HALL_RAMP_LAMP_INSET = 0.07;
export const TOWN_HALL_RAMP_LAMPS: readonly {
  readonly post: LocalXZ;
  readonly lens: readonly [number, number, number];
}[] = (() => {
  const posts = townHallRailPosts(TOWN_HALL_RAMP_RAILS[0]);
  return Object.freeze(
    [4.5, -2.55, -8.5].map((near) => {
      const post = posts.reduce((best, p) =>
        Math.abs(p[1] - near) < Math.abs(best[1] - near) ? p : best
      );
      const x = post[0] + TOWN_HALL_RAMP_LAMP_INSET;
      const y = (townHallRampHeight(x, post[1]) ?? 0) + TOWN_HALL_RAMP_LAMP_HEIGHT;
      return { post, lens: [x, y, post[1]] as const };
    })
  );
})();

/**
 * The step-free way from the front door to the street, in the town hall
 * frame (y is the surface): along the portico landing, round the front of the
 * east column on the apron (midway between the column base and the apron's
 * kerb), along the ramp's landing, down both flights on the middle of the
 * surface and across the foot landing. It keeps a wheelchair's half-width plus
 * 0.1 m off the column base and the rails, and a chair on the portico landing
 * (0.8 m deep, z 5.1..5.9) stays on it (agreedAdjustments.test.ts holds both).
 */
export const TOWN_HALL_STEP_FREE_ROUTE: readonly (readonly [number, number, number])[] = (() => {
  const r = TOWN_HALL_RAMP;
  const rampX = (r.clearMinX + r.clearMaxX) / 2;
  const [f1, f2] = r.flights;
  return Object.freeze([
    [0, r.landingY, 5.5],
    [-1.55, r.landingY, 5.5],
    [-1.55, r.landingY, 6.75],
    [rampX, r.landingY, 6.75],
    [rampX, f1.fromY, f1.fromZ],
    [rampX, f1.toY, f1.toZ],
    [rampX, f2.fromY, f2.fromZ],
    [rampX, f2.toY, f2.toZ],
    [rampX, 0, r.footLanding.toZ - 0.3],
  ] as const);
})();

/**
 * The town hall's two porticos as townhall.glb builds them (front +z, back
 * -z, the same both ways; measured 2026-11-07): a landing 0.8 m up for
 * |x| <= 2.57 between the wall face (|z| 5.1) and the top nosing (|z| 5.9),
 * four 0.35 m treads of 0.16 m down to the bottom nosing at |z| 7.3, and a
 * column at each front corner on a base of radius 0.4.
 */
export const TOWN_HALL_PORTICO = Object.freeze({
  landingHalfX: 2.57,
  wallZ: 5.1,
  nosingZ: 5.9,
  footZ: 7.3,
  tread: 0.35,
  riser: 0.16,
  stepHalfX: 2.6,
  columnX: 2.6,
  columnZ: 5.62,
  columnRadius: 0.4,
  /** Base to capital: solid to anyone who has not jumped clear over it. */
  columnTop: 5,
});

/** The portico landing or step height at a point in the town hall frame, or null. */
export function townHallPorticoHeight(x: number, z: number): number | null {
  const p = TOWN_HALL_PORTICO;
  const depth = Math.abs(z);
  if (depth >= p.wallZ && depth <= p.nosingZ && Math.abs(x) <= p.landingHalfX)
    return TOWN_HALL_RAMP.landingY;
  if (depth > p.nosingZ && depth <= p.footZ && Math.abs(x) <= p.stepHalfX) {
    const step = Math.min(3, Math.floor((depth - p.nosingZ) / p.tread));
    return TOWN_HALL_RAMP.landingY - p.riser * (step + 1);
  }
  return null;
}

/** World x/z into the town hall frame (the frame is turned half round, so it is its own inverse). */
export function townHallLocal(x: number, z: number): [number, number] {
  return [TOWN_HALL_FRAME.x - x, TOWN_HALL_FRAME.z - z];
}

/** Whether a world point is close enough to the town hall for its levels and step rule. */
export function nearTownHall(x: number, z: number): boolean {
  const [lx, lz] = townHallLocal(x, z);
  return Math.abs(lx) < 12 && Math.abs(lz) < 12;
}

/**
 * The walking surface the ramp, its landings and the porticos give at a world
 * point, or null where the ground is the terrain. Read by
 * `sampleWalkingGroundHeight`, which also applies the 0.23 m step rule here.
 */
export function townHallWalkingHeight(x: number, z: number): number | null {
  if (!nearTownHall(x, z)) return null;
  const [lx, lz] = townHallLocal(x, z);
  return townHallRampHeight(lx, lz) ?? townHallPorticoHeight(lx, lz);
}

/**
 * True when a walker of `radius` with its feet at `feet` would meet a ramp
 * handrail (below its top rail) or a portico column at a world point.
 */
export function townHallBlocks(x: number, z: number, feet: number, radius = 0.4): boolean {
  if (!nearTownHall(x, z)) return false;
  const [lx, lz] = townHallLocal(x, z);
  const p = TOWN_HALL_PORTICO;
  if (feet < p.columnTop)
    for (const cx of [-p.columnX, p.columnX])
      for (const cz of [-p.columnZ, p.columnZ])
        if (Math.hypot(lx - cx, lz - cz) < radius + p.columnRadius) return true;
  for (const { from, to } of TOWN_HALL_RAMP_RAILS) {
    const dx = to[0] - from[0],
      dz = to[1] - from[1];
    const length = dx * dx + dz * dz;
    const t =
      length > 0
        ? Math.max(0, Math.min(1, ((lx - from[0]) * dx + (lz - from[1]) * dz) / length))
        : 0;
    const px = from[0] + dx * t,
      pz = from[1] + dz * t;
    if (Math.hypot(lx - px, lz - pz) >= radius + TOWN_HALL_RAIL_HALF_WIDTH) continue;
    if (feet < (townHallRampHeight(px, pz) ?? 0) + TOWN_HALL_RAMP.railHeight) return true;
  }
  return false;
}

/**
 * Corduroy hazard paving across the head and the foot of the front steps, over
 * the width the steps still have beside the ramp's apron (x from -0.85).
 */
export const TOWN_HALL_STEP_TACTILE = Object.freeze([
  // Foot of the flight, a tread's depth out from the bottom nosing (local z 7.3).
  Object.freeze({ minX: -0.85, maxX: 2.85, minZ: 7.6, maxZ: 8.0, y: 0 }),
  // Head of the flight, on the landing behind the top nosing (local z 5.9).
  Object.freeze({ minX: -0.85, maxX: 2.6, minZ: 5.35, maxZ: 5.75, y: 0.8 }),
]);

/** The front door, in the town hall frame: the landing's back edge. */
export const TOWN_HALL_DOOR_LOCAL = Object.freeze([0, 0.8, 5.05] as Vec3Tuple);

/** The induction-loop sign beside the front door, in the town hall frame. */
export const TOWN_HALL_LOOP_SIGN = Object.freeze({
  position: Object.freeze([-3.1, 1.95, 5.07] as Vec3Tuple),
  size: 0.32,
});

/** Office hours of the town hall: the clerks' lunch outings fall inside them. */
export const TOWN_HALL_HOURS = Object.freeze({ open: 9, close: 17 });

// ---------------------------------------------------------------------------
// Car park and crossings
// ---------------------------------------------------------------------------

/**
 * The accessible bay in the station car park: `ParkingLot` at (120, 0, 50),
 * two rows of six 3.5 m bays; row 1, bay 4 is kept empty by its occupancy
 * pattern and is the one nearest the station. The bay is marked 2.4 m wide with
 * a hatched 1.1 m transfer zone on its west side.
 */
export const ACCESSIBLE_BAYS: readonly {
  centre: readonly [number, number];
  width: number;
  depth: number;
  transferSide: -1 | 1;
}[] = Object.freeze([{ centre: [123.75, 55.5], width: 3.5, depth: 5, transferSide: -1 }]);

/** Blister paving on each dropped-kerb apron of a crossing, metres deep from the kerb. */
export const CROSSING_TACTILE_DEPTH = 0.8;
