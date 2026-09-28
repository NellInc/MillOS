import type { Object3D } from 'three';
import { COMMUNITY_ANCHORS as A, getCommunityHours } from '../constants/communityLayout';
import type { Vec3Tuple } from '../constants/siteLayout';

export type CommunityActivity = 'working' | 'walking' | 'break' | 'idle';
export interface CommunityStop {
  position: Vec3Tuple;
  rotation: number;
  hours: number;
  activity: CommunityActivity;
  task: string;
  seated?: boolean;
}
export interface CommunityPerson {
  id: string;
  role: string;
  district: 'mill' | 'village' | 'bus';
  phase: number;
  machineId?: string;
  stops: readonly CommunityStop[];
}
export interface CommunityPose {
  position: [number, number, number];
  rotation: number;
  activity: CommunityActivity;
  task: string;
  seated: boolean;
  visible: boolean;
}
const stop = (
  position: Vec3Tuple,
  rotation: number,
  hours: number,
  task: string,
  activity: CommunityActivity = 'working',
  seated = false
): CommunityStop => ({ position, rotation, hours, task, activity, seated });
const via = (position: Vec3Tuple) => stop(position, 0, 0, 'Walking between duties', 'walking');
const rest = (position: Vec3Tuple, rotation: number, hours = 0.8) =>
  stop(position, rotation, hours, 'Tea break', 'break', true);
const PI = Math.PI;
// Time is accelerated 180x by default. One metre takes about one real second,
// rather than multiplying a walking animation by 180 and sliding across the site.
export const WALK_HOURS_PER_METRE = 180 / (3600 * 1.1);
const millLoop = (
  work: Vec3Tuple,
  lane: number,
  seat: Vec3Tuple,
  job: string,
  workHours = 2.4
): CommunityStop[] => [
  stop(work, PI, workHours, job),
  via([work[0], 0, 35.2]),
  via([lane, 0, 35.2]),
  via([lane, 0, seat[2]]),
  rest(seat, PI / 2),
  via([lane, 0, seat[2]]),
  via([lane, 0, 35.2]),
  via([work[0], 0, 35.2]),
];

/** Closed, authored pedestrian circuits stay on the mill side of conveyors.
 * Working if sampled segments clear machine/belt footprints and vehicle lanes.
 */
export const COMMUNITY_ROSTER: readonly CommunityPerson[] = [
  {
    id: 'mill-operator-west',
    role: 'Operator',
    district: 'mill',
    phase: 0,
    machineId: 'rm-101',
    stops: millLoop([-24, 0, 33.5], -33, [-34, 0, -8.45], 'Checking the roller mill'),
  },
  {
    id: 'mill-operator-east',
    role: 'Operator',
    district: 'mill',
    phase: 2.3,
    machineId: 'rm-104',
    stops: millLoop([18, 0, 33.5], -31.5, [-34, 0, -12.45], 'Adjusting the milling controls', 3.4),
  },
  {
    id: 'mill-engineer',
    role: 'Engineer',
    district: 'mill',
    phase: 4.2,
    machineId: 'rm-102',
    stops: millLoop([-10, 0, 33.5], -32.25, [-34, 0, -11.55], 'Equipment inspection', 1.8),
  },
  {
    id: 'mill-quality',
    role: 'Quality',
    district: 'mill',
    phase: 0.4,
    machineId: 'packer-2',
    stops: [
      stop(A.millInspection.position, PI, 2.4, 'Taking a flour sample'),
      via([8, 0, -6.4]),
      via([-32.3, 0, -6.4]),
      rest([-34, 0, -7.55], PI / 2),
      via([-32.3, 0, -6.4]),
      via([8, 0, -6.4]),
    ],
  },
  {
    id: 'mill-packer',
    role: 'Operator',
    district: 'mill',
    phase: 1.8,
    machineId: 'packer-0',
    stops: [
      stop(A.millPacking.position, PI, 2.2, 'Checking the packing line'),
      via([-8, 0, -5.2]),
      via([-32, 0, -5.2]),
      rest([-34, 0, -4.45], PI / 2),
      via([-32, 0, -5.2]),
      via([-8, 0, -5.2]),
    ],
  },
  {
    id: 'mill-supervisor',
    role: 'Supervisor',
    district: 'mill',
    phase: 0.7,
    stops: [
      stop([-33, 0, 8], PI / 2, 0.7, 'Reviewing the shift'),
      via([-33, 0, 25]),
      stop([-29.5, 0, 25], PI / 2, 1.1, 'Inspecting the milling floor'),
      via([-33, 0, 25]),
      via([-32.7, 0, -3.55]),
      rest([-34, 0, -3.55], PI / 2),
      via([-32.7, 0, -3.55]),
    ],
  },
  {
    id: 'village-baker',
    role: 'Baker',
    district: 'village',
    phase: 0.1,
    stops: [
      stop(A.bakeryCustomer.position, PI / 2, 1.4, 'Setting out fresh bread'),
      stop([-175.1, 0, 5], PI / 2, 0.7, 'Serving at the bakery'),
      stop([-177, 0, 5], PI, 0.3, 'A moment outside', 'idle'),
      via([-175.1, 0, 5]),
    ],
  },
  {
    id: 'village-shopkeeper',
    role: 'Shopkeeper',
    district: 'village',
    phase: 1.2,
    stops: [
      stop(A.shopCustomer.position, -PI / 2, 1.4, 'Tending the village shop'),
      stop([-204.4, 0, 31.6], -PI / 2, 0.6, 'Checking the delivery crates'),
      stop([-202.7, 0, 31.6], PI, 0.4, 'Greeting a neighbour', 'idle'),
      via([-202.7, 0, 30]),
    ],
  },
  {
    id: 'village-gardener',
    role: 'Gardener',
    district: 'village',
    phase: 0.3,
    stops: [
      stop(A.allotmentGardener.position, 0, 1.2, 'Tending the vegetables'),
      via([-215.35, 0, 9]),
      via(A.allotmentGate.position),
      stop([-206, 0, 9], -PI / 2, 0.4, 'Resting beside the allotment', 'idle'),
      via(A.allotmentGate.position),
      via([-215.35, 0, 9]),
    ],
  },
  {
    id: 'village-neighbour',
    role: 'Resident',
    district: 'village',
    phase: 1.3,
    stops: [
      rest(A.pubSeatSouth.position, A.pubSeatSouth.rotation, 1.5),
      via([-208.1, 0, -12.15]),
      stop([-203, 0, -12.15], -PI / 2, 0.7, 'A stroll through the square', 'idle'),
      via([-208.1, 0, -12.15]),
    ],
  },
  {
    id: 'village-courier',
    role: 'Logistics',
    district: 'village',
    phase: 0,
    stops: [],
  },
  { id: 'village-cyclist', role: 'Cyclist', district: 'village', phase: 0, stops: [] },
  { id: 'bus-arriving', role: 'Passenger', district: 'bus', phase: 0, stops: [] },
  { id: 'bus-departing', role: 'Passenger', district: 'bus', phase: 0.4, stops: [] },
];

export const communityHour = (hour: number): number =>
  Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
const distance = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export function routineDuration(person: CommunityPerson): number {
  return person.stops.reduce(
    (duration, node, i) =>
      duration +
      node.hours +
      distance(node.position, person.stops[(i + 1) % person.stops.length].position) *
        WALK_HOURS_PER_METRE,
    0
  );
}
export function createCommunityPose(): CommunityPose {
  return {
    position: [0, 0, 0],
    rotation: 0,
    activity: 'idle',
    task: '',
    seated: false,
    visible: true,
  };
}

/** A four-hour village shuttle: tunnel approach, stop, turnaround, tunnel return.
 * The .8h dwell is sixteen real seconds at the default clock, enough to board.
 */
export function sampleCommunityBus(hour: number) {
  const h = communityHour(hour),
    phase = (((h - 6) % 4) + 4) % 4;
  let x = 23,
    z = 255,
    rotation = PI;
  if (phase < 1.1) z = 255 - 115 * (phase / 1.1);
  else if (phase < 1.9) z = 140;
  else if (phase < 2.1) {
    const t = (phase - 1.9) / 0.2;
    x = 23 + 4 * t;
    z = 140 - 22 * t;
    rotation = Math.atan2(4, -22);
  } else if (phase < 2.5) {
    const angle = (-PI * (phase - 2.1)) / 0.4;
    x = 20 + 7 * Math.cos(angle);
    z = 118 + 7 * Math.sin(angle);
    rotation = PI - angle;
  } else if (phase < 2.7) {
    const t = (phase - 2.5) / 0.2;
    x = 13 + 4 * t;
    z = 118 + 22 * t;
    rotation = Math.atan2(4, 22);
  } else {
    x = 17;
    z = 140 + 115 * Math.min(1, (phase - 2.7) / 1.1);
    rotation = 0;
  }
  return {
    x,
    z,
    rotation,
    phase,
    doorsOpen: phase >= 1.1 && phase < 1.9,
    visible: h >= 6 && h < 22 && phase < 3.8,
  };
}
function samplePassenger(id: string, hour: number, out: CommunityPose) {
  const bus = sampleCommunityBus(hour),
    p = bus.phase;
  const arriving = id === 'bus-arriving';
  const wait: Vec3Tuple = arriving
    ? [29.55, A.busSeat.seatHeight! - 0.46, 140.5]
    : [28.4, 0.11, 139];
  const door: Vec3Tuple = [24.1, 0.36, 137.6];
  const t = arriving
    ? Math.max(0, Math.min(1, (p - 1.16) / 0.3))
    : Math.max(0, Math.min(1, (p - 1.52) / 0.3));
  const from = arriving ? door : wait,
    to = arriving ? wait : door;
  for (let i = 0; i < 3; i++) out.position[i] = from[i] + (to[i] - from[i]) * t;
  out.visible = bus.visible && (arriving ? p >= 1.16 && p < 3.4 : p < 1.82);
  out.seated = arriving && t === 1;
  const x = out.position[0];
  const busStep = 0.36 * Math.max(0, Math.min(1, (24.7 - x) / 0.6));
  const platform = 0.11 * Math.max(0, Math.min(1, (x - 27.25) / 0.2));
  out.position[1] = out.seated ? A.busSeat.seatHeight! - 0.46 : Math.max(busStep, platform);
  out.rotation = out.seated ? -PI / 2 : Math.atan2(to[0] - from[0], to[2] - from[2]);
  out.activity = t > 0 && t < 1 ? 'walking' : out.seated ? 'break' : 'idle';
  out.task =
    out.activity === 'walking'
      ? arriving
        ? 'Leaving the bus'
        : 'Boarding the bus'
      : arriving
        ? 'Resting at the shelter'
        : 'Waiting for Route 42';
}

export function sampleCommunityPerson(
  person: CommunityPerson,
  hour: number,
  out = createCommunityPose()
): CommunityPose {
  if (person.role === 'Cyclist') {
    const cycle = sampleCommunityCyclist(hour);
    out.position[0] = cycle.x;
    out.position[1] = 0;
    out.position[2] = cycle.z;
    out.rotation = cycle.rotation;
    out.activity = 'walking';
    out.task = 'Cycling along the village street';
    out.seated = false;
    out.visible = cycle.visible;
    return out;
  }
  if (person.id === 'village-courier') {
    const delivery = sampleCommunityDelivery(hour);
    out.position[0] = delivery.x;
    out.position[1] = 0;
    out.position[2] = delivery.z;
    out.rotation = delivery.rotation;
    out.activity = delivery.moving ? 'walking' : 'working';
    out.seated = false;
    out.visible = delivery.visible;
    out.task = delivery.delivered
      ? 'Returning the empty flour cart'
      : delivery.moving
        ? 'Delivering mill flour to the grocer'
        : 'Unloading the flour delivery';
    return out;
  }
  if (person.district === 'bus') {
    samplePassenger(person.id, hour, out);
    return out;
  }
  const h = communityHour(hour),
    hours = getCommunityHours(h);
  out.visible =
    person.district === 'mill' ||
    (person.role === 'Resident'
      ? hours.pubOpen
      : person.role === 'Gardener'
        ? hours.gardeningActive
        : person.role === 'Logistics'
          ? hours.deliveryActive
          : hours.shopsOpen);
  const period = routineDuration(person);
  let elapsed = ((((Number.isFinite(hour) ? hour : 12) + person.phase) % period) + period) % period;
  for (let i = 0; i < person.stops.length; i++) {
    const node = person.stops[i],
      next = person.stops[(i + 1) % person.stops.length];
    if (elapsed < node.hours) {
      out.position[0] = node.position[0];
      out.position[1] = node.position[1];
      out.position[2] = node.position[2];
      out.rotation = node.rotation;
      out.activity = node.activity;
      out.task = node.task;
      out.seated = node.seated ?? false;
      return out;
    }
    elapsed -= node.hours;
    const travel = distance(node.position, next.position) * WALK_HOURS_PER_METRE;
    if (elapsed < travel) {
      const t = elapsed / travel;
      for (let axis = 0; axis < 3; axis++)
        out.position[axis] = node.position[axis] + (next.position[axis] - node.position[axis]) * t;
      out.rotation = Math.atan2(
        next.position[0] - node.position[0],
        next.position[2] - node.position[2]
      );
      out.activity = 'walking';
      out.task = next.task;
      out.seated = false;
      return out;
    }
    elapsed -= travel;
  }
  return out;
}

/** Inspect actual mounted roots, not an empty retired workforce store. */
export function inspectCommunityPresence(scene: Pick<Object3D, 'traverse'>) {
  const people: Array<{
    id: string;
    activity: string;
    task: string;
    visible: boolean;
    position: number[];
    bodyMeshes: number;
  }> = [];
  const prohibited: string[] = [];
  scene.traverse((object) => {
    if (typeof object.userData.communityId === 'string') {
      let visible = object.visible;
      let parent = object.parent;
      while (parent) {
        visible &&= parent.visible;
        parent = parent.parent;
      }
      let bodyMeshes = 0;
      object.traverse((child) => {
        if (child.type === 'SkinnedMesh') bodyMeshes++;
      });
      people.push({
        bodyMeshes,
        id: object.userData.communityId,
        activity: String(object.userData.activity ?? ''),
        task: String(object.userData.task ?? ''),
        visible,
        position: object.position.toArray(),
      });
    }
    if (/^(remote-player|seated-vehicle-operator|dock-spotter)/.test(object.name))
      prohibited.push(object.name);
  });
  const ids = people.map((p) => p.id);
  return {
    passed:
      COMMUNITY_ROSTER.every((p) => ids.includes(p.id)) &&
      new Set(ids).size === COMMUNITY_ROSTER.length &&
      people.length === COMMUNITY_ROSTER.length &&
      people.every(
        (p) => p.position.every(Number.isFinite) && p.activity.length > 0 && p.bodyMeshes > 0
      ) &&
      prohibited.length === 0,
    personCount: people.length,
    sceneObjects: ids.sort(),
    people,
    prohibited,
  };
}

/** The shop's flour handcart comes from the service lane, stops to unload, then
 * returns empty. The stock prop and moving load read this SAME event.
 */
export function sampleCommunityDelivery(hour: number) {
  const h = communityHour(hour);
  const returning = h >= 10.1;
  const travel = returning
    ? Math.max(0, Math.min(1, (h - 10.1) / 0.75))
    : Math.max(0, Math.min(1, (h - 9) / 0.65));
  const handleZ = returning ? 33 + 10 * travel : 43 - 10 * travel;
  let x = -202.8,
    z = handleZ,
    rotation = returning ? 0 : Math.PI;
  // Park the cart. The courier steps around its left side to unload it.
  if (h >= 9.65 && h < 10.1) {
    const approach = h < 9.82 ? Math.min(1, (h - 9.65) / 0.17) : h < 10 ? 1 : 1 - (h - 10) / 0.1;
    x -= Math.min(1, approach * 2);
    z -= Math.max(0, approach * 2 - 1) * 1.4;
    rotation = Math.PI / 2;
  }
  return {
    x,
    z,
    rotation,
    cartX: -202.8,
    cartZ: handleZ - 1.4,
    visible: h >= 9 && h < 10.85,
    moving: (h > 9 && h < 9.82) || (h > 10 && h < 10.85),
    delivered: h >= 9.9 && h < 23,
    loaded: h < 9.9,
    cartGrip: h < 9.65 ? ('push' as const) : h >= 10.1 ? ('pull' as const) : undefined,
  };
}

/** Wait at the shelter until a truck has cleared the turnaround approach. The
 * passenger schedule uses this same delayed clock, so a held bus never leaves
 * its boarding pedestrians behind. An already-started turn is never rewound.
 */
export function advanceCommunityBusClock(
  hour: number,
  elapsed: number,
  trafficBlocked: boolean
): number {
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const next = hour + safeElapsed;
  const phase = sampleCommunityBus(next).phase;
  const previousPhase = sampleCommunityBus(hour).phase;
  if (trafficBlocked && previousPhase <= 1.860001 && phase >= 1.86 && phase < 2.7)
    return next - phase + 1.86;
  return next;
}

/** Both lanes and both turn arcs fit the existing west village cobbled street.
 * The courier's morning unloading window ends before cycling hours begin.
 */
export function sampleCommunityCyclist(hour: number) {
  const h = communityHour(hour),
    radius = 1.2,
    straight = 21;
  const length = 2 * straight + 2 * Math.PI * radius;
  const travelled = (Number.isFinite(hour) ? hour : 12) * 44;
  let d = ((travelled % length) + length) % length;
  let x = -203.2,
    z = 34,
    rotation = 0;
  if (d < straight) z += d;
  else if ((d -= straight) < Math.PI * radius) {
    const angle = Math.PI - d / radius;
    x = -202 + radius * Math.cos(angle);
    z = 55 + radius * Math.sin(angle);
    rotation = Math.PI - angle;
  } else if ((d -= Math.PI * radius) < straight) {
    x = -200.8;
    z = 55 - d;
    rotation = Math.PI;
  } else {
    d -= straight;
    const angle = -d / radius;
    x = -202 + radius * Math.cos(angle);
    z = 34 + radius * Math.sin(angle);
    rotation = Math.PI - angle;
  }
  return {
    x,
    z,
    rotation,
    visible: h >= 11 && h < 18,
    pedalPhase: (travelled / 2.2) * Math.PI * 2,
  };
}

/** Quiet hearth rhythms, staggered per house, without adding particles or lights.
 * Working if home smoke sleeps after bedtime and commercial chimneys follow hours.
 */
export function communityChimneyLevel(
  hour: number,
  offset = 0,
  kind: 'home' | 'pub' | 'forge' = 'home'
) {
  const h = communityHour(hour),
    shift = kind === 'home' ? (offset % 1) * 0.3 : 0;
  const window = (start: number, end: number) => {
    const ramp = (x: number) => {
      const t = Math.max(0, Math.min(1, x / 0.4));
      return t * t * (3 - 2 * t);
    };
    return ramp(h - start - shift) * ramp(end + shift - h);
  };
  return kind === 'pub'
    ? window(11, 23)
    : kind === 'forge'
      ? window(8, 18)
      : Math.max(window(5, 9), window(16, 23));
}
