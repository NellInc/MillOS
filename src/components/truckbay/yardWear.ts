import { TRUCK_TYRE_WIDTH, TRUCK_WHEEL_LAYOUT } from './OptimizedTruckBay';
import { createTruckController, stepTruckController } from './truckController';
import type { TruckAnimState } from './useTruckPhysics';

/**
 * TYRE TRACKS AND OIL ON THE TRUCK YARDS, laid from the trucks' real paths.
 *
 * Nothing here is placed by eye. One whole shipping visit is stepped through
 * the same controller the trucks drive with (`truckController.ts`), and every
 * wheel line of the compact truck (`TRUCK_WHEEL_LAYOUT`) is followed across the
 * yard. Wear is heaviest where a real yard wears: the back-in lane, where every
 * trailer reverses on the same line, then the 14 m arcs, where the tandems
 * scrub; open straights at road speed leave the least. Oil drips where a
 * tractor stands with its engine running: the dock, where the trailer stops on
 * the bumper and the tractor idles through the service.
 *
 * The receiving yard is the shipping yard turned half a revolution about the
 * site origin, exactly as the controller turns its truck, so it is the same
 * layout with x and z negated.
 *
 * Working if the marks sit under the wheels in every capture, and a change to
 * the controller's paths moves them with it (`yardWear.test.ts`).
 */

export interface TruckWheelLine {
  readonly id: string;
  readonly isTrailer: boolean;
  /** Axle position along the tractor (or, for the trailer, the coupling) axis. */
  readonly axleZ: number;
  /** Centre of the tyre contact band across the vehicle. */
  readonly centreX: number;
  /** Contact band width: one tyre, or a dual pair. */
  readonly width: number;
}

const groupWheelLines = (): TruckWheelLine[] => {
  const groups = new Map<string, { isTrailer: boolean; z: number; xs: number[] }>();
  for (const [x, , z, isTrailer] of TRUCK_WHEEL_LAYOUT) {
    const key = `${isTrailer ? 'trailer' : 'tractor'}:${z}:${Math.sign(x)}`;
    const group = groups.get(key) ?? { isTrailer, z, xs: [] };
    group.xs.push(x);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, { isTrailer, z, xs }]) => {
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    return {
      id: key,
      isTrailer,
      axleZ: z,
      centreX: (min + max) / 2,
      width: max - min + TRUCK_TYRE_WIDTH,
    };
  });
};

/** One line per axle side: steer singles, drive and trailer duals. */
export const TRUCK_WHEEL_LINES: readonly TruckWheelLine[] = groupWheelLines();

/** Where a wheel line meets the ground for a pose (world metres). */
export const wheelLineContact = (
  pose: Pick<TruckAnimState, 'x' | 'z' | 'rotation' | 'trailerAngle'>,
  line: Pick<TruckWheelLine, 'isTrailer' | 'axleZ' | 'centreX'>
): { x: number; z: number } => {
  // The trailer turns about the tractor origin, inside the tractor's frame.
  const yaw = pose.rotation + (line.isTrailer ? pose.trailerAngle : 0);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: pose.x + line.centreX * cos + line.axleZ * sin,
    z: pose.z - line.centreX * sin + line.axleZ * cos,
  };
};

/**
 * Drip points in the tractor's frame: the engine sump behind the steer axle
 * (3.7 m) and the gearbox ahead of the drive axle (0.4 m).
 */
export const TRUCK_OIL_DRIP_POINTS = [
  { x: 0.05, z: 3.2, radius: 0.62, opacity: 0.7 },
  { x: -0.12, z: 1.7, radius: 0.36, opacity: 0.5 },
] as const;

/**
 * The drips laid at each drip point of a standing tractor, in its frame: the
 * fresh one (turned at random), then the older streak drips drawn out ALONG
 * the bay (`stretch`, turned with the tractor). `yardWear.test.ts` pins the
 * streak's length and width and keeps it behind the tractor's nose.
 */
const OIL_DRIP_AGES: ReadonlyArray<{
  readonly along: number;
  readonly across: number;
  readonly spread: number;
  readonly stretch?: number;
  readonly fade: number;
}> = [
  { along: 0, across: 0, spread: 1, fade: 1 },
  { along: -0.75, across: 0.08, spread: 1.15, stretch: 2.2, fade: 0.55 },
  { along: 0.45, across: -0.1, spread: 1.05, stretch: 1.8, fade: 0.5 },
  { along: -1.55, across: -0.06, spread: 1.2, stretch: 2.4, fade: 0.45 },
];

/** The oil material's opacity (`YardWearMarks.tsx`); each stain's own opacity multiplies it. */
export const YARD_OIL_OPACITY = 0.55;

/**
 * The shipping yard's paving: the 60 x 60 m yard plane in `TruckBay.tsx`
 * (group z 50, plane at local z 30), which the dock apron lies inside.
 */
export const YARD_WEAR_PAVING = { minX: -30, maxX: 30, minZ: 50, maxZ: 110 } as const;
/**
 * The forklift channel slab at the dock (`TruckBay.tsx`, 4 x 5.8 m at local
 * z 1.2, 2 cm proud). The docked trailer's rear tandem stands on it, so its
 * tracks stop at the slab's edge rather than running under it.
 */
export const DOCK_CHANNEL_SLAB = { halfWidth: 2, maxZ: 50 + 1.2 + 2.9 } as const;
/** Marks fade out over this distance from the paving's open edges, metres. */
const EDGE_FADE = 5;
const SAMPLE_SPACING = 0.5;
const TRACE_STEP = 1 / 30;

export interface YardWearSample {
  readonly x: number;
  readonly z: number;
  /** 0-1 wear: multiplies the material's opacity at this sample. */
  readonly weight: number;
}

export interface YardTyreTrack {
  readonly id: string;
  readonly width: number;
  /** True for a single tyre; the texture's second tyre is not drawn. */
  readonly single: boolean;
  readonly samples: readonly YardWearSample[];
}

export interface YardOilStain {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Ellipse aspect, >= 1, along `rotation`. */
  readonly stretch: number;
  readonly rotation: number;
  readonly opacity: number;
}

export interface YardWearLayout {
  readonly tracks: readonly YardTyreTrack[];
  readonly stains: readonly YardOilStain[];
}

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const pavingEdgeDistance = (x: number, z: number): number =>
  // The dock side (minZ) is closed by the building; nothing fades there.
  Math.min(x - YARD_WEAR_PAVING.minX, YARD_WEAR_PAVING.maxX - x, YARD_WEAR_PAVING.maxZ - z);

const onChannelSlab = (x: number, z: number, halfBand: number): boolean =>
  Math.abs(x) <= DOCK_CHANNEL_SLAB.halfWidth + halfBand && z <= DOCK_CHANNEL_SLAB.maxZ + 0.3;

interface TracePoint {
  readonly x: number;
  readonly z: number;
  readonly speed: number;
}

/** One shipping visit, from the road to the road, at the controller's own step. */
const traceShippingVisit = (): { poses: TruckAnimState[]; speeds: number[] } => {
  let state = createTruckController('shipping', true, 'slowing');
  const poses: TruckAnimState[] = [];
  const speeds: number[] = [];
  for (let frame = 0; frame < 240 / TRACE_STEP; frame += 1) {
    const result = stepTruckController(state, {
      deltaSeconds: TRACE_STEP,
      arrivalReady: false,
      safetyHold: false,
      serviceComplete: true,
      speedMultiplier: 1,
    });
    state = result.state;
    if (state.phase === 'accelerating' && result.pose.z > YARD_WEAR_PAVING.maxZ + 12) break;
    if (!state.active || state.phase === 'leaving') break;
    poses.push(result.pose);
    speeds.push(state.motion.speed);
  }
  return { poses, speeds };
};

/**
 * Wear at one sample. Reversing an articulated rig (the back-in) and slow
 * manoeuvring scrub hardest; arcs scrub with their curvature; straight running
 * leaves a faint trace.
 */
const wearAt = (curvature: number, speed: number): number => {
  const turning = 0.3 + 0.4 * Math.min(1, Math.abs(curvature) * 14);
  const manoeuvring = speed < -0.05 ? 1 : Math.abs(speed) < 2 ? 0.8 : 0;
  return Math.max(turning, manoeuvring);
};

const finishTrack = (
  line: TruckWheelLine,
  points: readonly TracePoint[],
  part: number
): YardTyreTrack | null => {
  if (points.length < 3) return null;
  const samples: YardWearSample[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const point = points[index];
    const headingIn = Math.atan2(point.x - previous.x, point.z - previous.z);
    const headingOut = Math.atan2(next.x - point.x, next.z - point.z);
    const run = Math.hypot(next.x - previous.x, next.z - previous.z);
    const turn = Math.atan2(Math.sin(headingOut - headingIn), Math.cos(headingOut - headingIn));
    const curvature = index > 0 && index < points.length - 1 && run > 1e-6 ? turn / (run / 2) : 0;
    const weight =
      wearAt(curvature, point.speed) *
      smoothstep(0, EDGE_FADE, pavingEdgeDistance(point.x, point.z));
    samples.push({ x: point.x, z: point.z, weight: Math.min(1, weight) });
  }
  return {
    id: `${line.id}:${part}`,
    width: line.width,
    single: line.width <= TRUCK_TYRE_WIDTH + 1e-6,
    samples,
  };
};

const buildShippingLayout = (): YardWearLayout => {
  const { poses, speeds } = traceShippingVisit();
  const tracks: YardTyreTrack[] = [];

  for (const line of TRUCK_WHEEL_LINES) {
    let points: TracePoint[] = [];
    let part = 0;
    let direction = 0;
    const flush = (): void => {
      const track = finishTrack(line, points, part);
      if (track) {
        tracks.push(track);
        part += 1;
      }
      points = [];
    };
    poses.forEach((pose, index) => {
      const speed = speeds[index];
      if (Math.abs(speed) < 0.01) return;
      const contact = wheelLineContact(pose, line);
      const usable =
        pavingEdgeDistance(contact.x, contact.z) > 0.05 &&
        contact.z >= YARD_WEAR_PAVING.minZ &&
        !onChannelSlab(contact.x, contact.z, line.width / 2);
      // A reversal folds a ribbon back on itself; start a fresh one instead.
      const travelling = Math.sign(speed);
      if (!usable || (direction !== 0 && travelling !== direction)) flush();
      direction = travelling;
      if (!usable) return;
      const last = points[points.length - 1];
      if (!last || Math.hypot(contact.x - last.x, contact.z - last.z) >= SAMPLE_SPACING) {
        points.push({ x: contact.x, z: contact.z, speed });
      }
    });
    flush();
  }

  // Oil: under every distinct pose where the truck stands on the paving.
  const standing: TruckAnimState[] = [];
  poses.forEach((pose, index) => {
    if (Math.abs(speeds[index]) >= 0.01) return;
    if (standing.some((other) => Math.hypot(other.x - pose.x, other.z - pose.z) < 0.5)) return;
    standing.push(pose);
  });
  const stains: YardOilStain[] = [];
  standing.forEach((pose, poseIndex) => {
    TRUCK_OIL_DRIP_POINTS.forEach((drip, dripIndex) => {
      // The fresh drip, then the bay's streak: older, wider, fainter drips
      // from tractors that stopped a little short of or past this one, drawn
      // out along the bay (a tractor creeps on the bumper). Scattered round
      // drips turned at random read as nothing at the review cameras' grazing
      // angle (final7 med-12): the streak down the bay centre is what does.
      OIL_DRIP_AGES.forEach((age, ageIndex) => {
        const point = wheelLineContact(pose, {
          isTrailer: false,
          axleZ: drip.z + age.along,
          centreX: drip.x + age.across,
        });
        if (pavingEdgeDistance(point.x, point.z) < 0.5) return;
        const seed = poseIndex * 7 + dripIndex * 3 + ageIndex;
        const jitter = (seed * 0.618) % 1;
        stains.push({
          x: point.x,
          z: point.z,
          radius: drip.radius * age.spread,
          stretch: age.stretch ?? 1.15 + jitter * 0.45,
          rotation:
            age.stretch === undefined
              ? pose.rotation + seed * 1.37
              : pose.rotation + (jitter - 0.5) * 0.12,
          opacity: drip.opacity * age.fade,
        });
      });
    });
  });

  return { tracks, stains };
};

const turnHalfRevolution = (layout: YardWearLayout): YardWearLayout => ({
  tracks: layout.tracks.map((track) => ({
    ...track,
    samples: track.samples.map((sample) => ({ ...sample, x: -sample.x, z: -sample.z })),
  })),
  stains: layout.stains.map((stain) => ({
    ...stain,
    x: -stain.x,
    z: -stain.z,
    rotation: stain.rotation + Math.PI,
  })),
});

let shippingLayout: YardWearLayout | null = null;

/** The wear layout for one yard, in world metres. Traced once, on first use. */
export function buildYardWearLayout(dock: 'shipping' | 'receiving'): YardWearLayout {
  shippingLayout ??= buildShippingLayout();
  return dock === 'shipping' ? shippingLayout : turnHalfRevolution(shippingLayout);
}
