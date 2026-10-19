import type { Object3D } from 'three';
import type { RuntimeWeather } from '../runtime/runtimeMode';
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import { CAMPAIGN_MASS_EPSILON_KG } from './operationsPlay';
import type { MaintenanceWorkOrder } from '../stores/breakdownStore';
import type { ProductionBatch } from '../stores/materialFlowStore';
import type { MachineData } from '../types';
import { COMMUNITY_ANCHORS as A, getCommunityHours } from '../constants/communityLayout';
import type { Vec3Tuple } from '../constants/siteLayout';
import type { WorkplaceState } from '../types/workplace';
import { improvementArrangement } from './workplaceImprovement';
import { translate } from '../i18n';
import { communityAgreementMessages } from './communityLife.messages';
import { STANDARD_GAME_SPEED } from './pace';

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
  /** Cosmetic support cue; route positions and dwell times are unchanged. */
  seat?: { amount: number; support: number; position: Vec3Tuple; rotation: number };
}

export const createCommunityGreeting = () => ({ targetId: null as string | null, yaw: 0 });

/** Resolve actual company after every resident has its current pose. No camera
 * impersonation or periodic waves into empty space. Working if only visible,
 * nearby people in the shopkeeper's forward view can receive the authored hello.
 */
export function sampleCommunityGreeting(
  person: CommunityPerson,
  pose: CommunityPose,
  actors: readonly { person: CommunityPerson; pose: CommunityPose }[],
  out: ReturnType<typeof createCommunityGreeting>
) {
  const previousTarget = out.targetId;
  out.targetId = null;
  out.yaw = 0;
  if (
    person.role !== 'Shopkeeper' ||
    !pose.visible ||
    pose.seated ||
    pose.activity !== 'idle' ||
    pose.task !== 'Greeting a neighbour'
  )
    return out;
  let closest = 36,
    heldDistance = Infinity,
    heldYaw = 0;
  for (const actor of actors) {
    if (actor.person.id === person.id || !actor.pose.visible) continue;
    const dx = actor.pose.position[0] - pose.position[0],
      dz = actor.pose.position[2] - pose.position[2];
    const distance = dx * dx + dz * dz;
    const bearing = Math.atan2(dx, dz) - pose.rotation;
    const yaw = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    if (distance < 0.16 || distance >= 36 || Math.abs(yaw) > 0.9) continue;
    if (actor.person.id === previousTarget) {
      heldDistance = distance;
      heldYaw = yaw;
    }
    if (distance < closest) {
      closest = distance;
      out.targetId = actor.person.id;
      out.yaw = Math.max(-0.3, Math.min(0.3, yaw));
    }
  }
  // A meaningful distance advantage can change the recipient; centimetre
  // jitter cannot repeatedly restart the existing one-shot wave.
  // Working if current eligible company survives a1.2 distance-ratio tie.
  if (previousTarget && heldDistance <= closest * 1.44) {
    out.targetId = previousTarget;
    out.yaw = Math.max(-0.3, Math.min(0.3, heldYaw));
  }
  return out;
}

/** A waiting passenger acknowledges the actual approaching shuttle, with a
 * bounded head turn only. Working if distant/hidden buses, walking/boarding,
 * seats and non-passenger work never receive this cosmetic attention.
 */
export function communityPassengerAttention(
  person: CommunityPerson,
  pose: CommunityPose,
  bus: { x: number; z: number; phase: number; visible: boolean }
) {
  if (
    person.district !== 'bus' ||
    person.role !== 'Passenger' ||
    !pose.visible ||
    pose.seated ||
    pose.activity !== 'idle' ||
    !bus.visible ||
    bus.phase >= 1.9
  )
    return 0;
  const dx = bus.x - pose.position[0],
    dz = bus.z - pose.position[2];
  if (Math.hypot(dx, dz) > 22) return 0;
  const angle = Math.atan2(dx, dz) - pose.rotation;
  const yaw = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Math.abs(yaw) <= 1.4 ? Math.max(-0.26, Math.min(0.26, yaw)) : 0;
}

/** Describe the mounted service, never predict an arrival from a different clock.
 * Working if a held bus keeps the same notice and the quiet phase between runs
 * is still an operating service rather than a false closed sign.
 */
export function communityBusNotice(
  pose: { serviceOpen?: boolean; doorsOpen?: boolean | number } | null
) {
  if (pose?.serviceOpen === undefined) return 'ROUTE INFORMATION';
  if (!pose.serviceOpen) return 'SERVICE HOURS\n06:00 TO 22:00';
  return pose.doorsOpen ? 'BUS AT THE STOP' : 'BUS ON ROUTE';
}

// The west operator represents coordination; the east operator remains unbound.
export const COMMUNITY_AGREEMENT_MEMBERS: Readonly<Record<string, string>> = {
  'mill-packer': 'packing',
  'mill-quality': 'quality',
  'mill-engineer': 'maintenance',
  'mill-operator-west': 'coordinator',
};
export interface CommunityAgreementCue {
  memberId: string;
  state: 'duty' | 'cover' | 'rest' | 'recovery' | 'briefing';
  label: string;
  task: string;
  offDuty: boolean;
}

/** Fictional agreement presentation, never evidence of a repair or QC release.
 * Working if only four mapped residents respond to an engaged game agreement,
 * qualified choices remain observational, and review without debt releases them.
 */
export function communityAgreementCue(
  personId: string,
  workplace: WorkplaceState
): CommunityAgreementCue | null {
  if ((!workplace.campaign && !workplace.improvement) || workplace.mode !== 'game') return null;
  const member = workplace.members.find((m) => m.id === COMMUNITY_AGREEMENT_MEMBERS[personId]);
  if (!member || !['active', 'review'].includes(workplace.phase)) return null;
  const covering =
    workplace.phase === 'active' &&
    workplace.activeCoverMemberId === member.id &&
    member.coverConsent === true &&
    workplace.coverRemainingMinutes > 0 &&
    workplace.coverRemainingMinutes <= 10 &&
    member.eligibleTasks.some((task) => task === 'Packing' || task === 'Pallet checks');
  const recovering = !covering && member.recoveryOwedMinutes > 0;
  if (workplace.phase === 'review' && !recovering) return null;
  const resting = workplace.phase === 'active' && workplace.minute >= 75;
  const briefing =
    workplace.phase === 'active' &&
    workplace.improvement?.funded &&
    !workplace.improvement.stopped &&
    workplace.minute < (improvementArrangement(workplace)?.briefingMinutes ?? 0);
  const state = recovering
    ? 'recovery'
    : resting
      ? 'rest'
      : covering
        ? 'cover'
        : briefing
          ? 'briefing'
          : 'duty';
  const qualifiedTask = member.eligibleTasks.includes(member.chosenTask)
    ? member.chosenTask
    : 'Awaiting a qualified assignment';
  const label =
    state === 'recovery'
      ? 'Protected recovery'
      : state === 'rest'
        ? 'Protected rest'
        : state === 'cover'
          ? 'Voluntary cover'
          : state === 'briefing'
            ? 'Paid handoff briefing'
            : `Agreed: ${qualifiedTask}`;
  // The billboard label resolves in the active language; `task` stays English
  // diagnostic data read by scene inspection.
  const displayTask = member.eligibleTasks.includes(member.chosenTask)
    ? translate(communityAgreementMessages, 'task', { value: member.chosenTask })
    : translate(communityAgreementMessages, 'awaitingAssignment');
  const displayLabel =
    state === 'recovery'
      ? translate(communityAgreementMessages, 'protectedRecovery')
      : state === 'rest'
        ? translate(communityAgreementMessages, 'protectedRest')
        : state === 'cover'
          ? translate(communityAgreementMessages, 'voluntaryCover')
          : state === 'briefing'
            ? translate(communityAgreementMessages, 'paidBriefing')
            : translate(communityAgreementMessages, 'agreed', { task: displayTask });
  const displayRole = translate(communityAgreementMessages, 'role', { value: member.role });
  return {
    memberId: member.id,
    state,
    label: `${displayRole}\n${displayLabel}`,
    task:
      state === 'briefing'
        ? 'Attending a paid handoff briefing at the existing safe observation post'
        : state === 'duty'
          ? `Representing the qualified ${qualifiedTask} agreement at a safe observation post`
          : `${label} under the fictional shift agreement`,
    offDuty: state === 'rest' || state === 'recovery',
  };
}

/** Hold the existing safe pose, rather than teleporting to a distant seat.
 * Paid briefings also hold position, without counting as protected rest.
 * Working if rest/briefings stop the route clock, keep seated false in transit, and
 * resumption advances from that same point without changing the work ledger.
 */
export function advanceCommunityAgreementClock(
  hour: number,
  elapsed: number,
  cue: CommunityAgreementCue | null
): number {
  return cue?.offDuty || cue?.state === 'briefing' || !Number.isFinite(elapsed)
    ? hour
    : hour + elapsed;
}

export function communityAgreementResponse(
  cue: CommunityAgreementCue | null,
  pose: CommunityPose,
  response: Pick<CommunityPose, 'activity' | 'task'>
): void {
  if (!cue) return;
  if (cue.state === 'briefing') {
    response.activity = 'idle';
    response.task = cue.task;
  } else if (cue.offDuty) {
    response.activity = 'break';
    response.task = cue.task;
  } else if (pose.activity === 'walking') {
    response.task = `Walking the safe route; ${cue.task}`;
  } else if (pose.activity === 'working') {
    response.task = cue.task;
  }
}
/** A cosmetic signal of a verified local customer's completed flour order.
 * It never allocates flour or marks an order complete. Working if clocks alone
 * cannot stock the counter, and the signal expires after one campaign day.
 */
export function hasCommunityBakerySupply(orders: readonly CustomerOrder[], elapsedMinutes: number) {
  return (
    Number.isFinite(elapsedMinutes) &&
    orders.some((order) => {
      const completed = order.completedAtMinute;
      return (
        order.customer === "Riverside Bakers' Cooperative" &&
        order.recipe.finishedMaterial === 'flour' &&
        order.status === 'fulfilled' &&
        Number.isFinite(order.requiredKg) &&
        order.requiredKg > 0 &&
        Number.isFinite(order.shippedKg) &&
        order.shippedKg + CAMPAIGN_MASS_EPSILON_KG >= order.requiredKg &&
        order.qualityFailureKg === 0 &&
        order.manifestIds.length > 0 &&
        completed !== null &&
        Number.isFinite(completed) &&
        completed >= 0 &&
        elapsedMinutes >= completed &&
        elapsedMinutes - completed < 1440
      );
    })
  );
}

/** A safety stop wins over art-directed time jumps; paused clock changes may
 * intentionally reframe the world, ordinary paused frames retain their pose.
 */
export function advanceCommunityPeopleClock(
  hour: number,
  worldHour: number,
  elapsed: number,
  moving: boolean,
  emergency: boolean
) {
  if (emergency || !Number.isFinite(worldHour) || !Number.isFinite(elapsed)) return hour;
  if (Math.abs(elapsed) > 0.5 || (!moving && elapsed !== 0)) return worldHour;
  return moving ? hour + elapsed : hour;
}

/** Consume only time already admitted by the simulation, on the authored routes.
 * The cursor is a display anchor, not a second plant clock. Holds rebase its anchor
 * without advancing people; pause preserves an unfinished segment. Working if
 * half-second ticks become continuous motion without extrapolation or catch-up.
 */
export function advanceCommunityPresentationClock(
  hour: number,
  worldHour: number,
  observedElapsed: number,
  deltaSeconds: number,
  speed: number,
  tabVisible: boolean,
  emergency: boolean
) {
  if (!Number.isFinite(worldHour) || !Number.isFinite(observedElapsed)) return hour;
  // A non-finite presentation clock never recovers by stepping; reframe it.
  if (emergency || !tabVisible || !Number.isFinite(hour)) return worldHour;
  // Preserve the existing explicit art-time reframe contract.
  if (
    observedElapsed < 0 ||
    Math.abs(observedElapsed) > 0.5 ||
    (speed <= 0 && observedElapsed !== 0)
  )
    return worldHour;
  if (!Number.isFinite(deltaSeconds) || !Number.isFinite(speed) || deltaSeconds <= 0 || speed <= 0)
    return hour;
  const authorizedGap = Math.max(0, worldHour - hour);
  return hour + Math.min(authorizedGap, (speed * Math.min(deltaSeconds, 0.075)) / 3600);
}

export interface CommunityOperationsSnapshot {
  machines: readonly Pick<MachineData, 'id' | 'status'>[];
  workOrders: readonly Pick<MaintenanceWorkOrder, 'machineId' | 'phase'>[];
  batches: readonly Pick<ProductionBatch, 'packerId' | 'availableKg' | 'disposition'>[];
  /** Recalled-lot material still in the plant (getRecalledStock); absent reads as none. */
  recalledStockKg?: number;
  bakeryStocked: boolean;
  weather?: RuntimeWeather;
}

const MAINTENANCE_TASKS: Record<MaintenanceWorkOrder['phase'], string> = {
  diagnosed: 'Reviewing the diagnosed fault from the safe inspection post',
  awaiting_parts: 'Waiting for maintenance parts',
  repairing: 'Monitoring maintenance work from the safe inspection post',
  verification: 'Reviewing post-repair verification',
  ready_to_restart: 'Waiting for the authorized line restart',
  restart_requested: 'Monitoring the requested line restart',
  returned_to_service: 'Checking the restored line',
};

const sampleStock = (batch: CommunityOperationsSnapshot['batches'][number]) =>
  Number.isFinite(batch.availableKg) && batch.availableKg > 0;

/** Responses are observations at authored safe posts, never physical repairs.
 * Working if open work orders and held batches alter work cues without stealing
 * tea breaks, changing pedestrian routes or consuming production inventory.
 * Wet weather pauses the existing gardener's work pose at the current post.
 */
export function communityWorkResponse(
  person: CommunityPerson,
  pose: CommunityPose,
  operations: CommunityOperationsSnapshot,
  out: Pick<CommunityPose, 'activity' | 'task'> = { activity: pose.activity, task: pose.task }
): Pick<CommunityPose, 'activity' | 'task'> {
  out.activity = pose.activity;
  out.task = pose.task;
  if (pose.activity !== 'working') return out;
  if (
    person.role === 'Gardener' &&
    (operations.weather === 'rain' || operations.weather === 'storm')
  ) {
    out.activity = 'idle';
    out.task =
      operations.weather === 'rain'
        ? 'Pausing garden work in the rain'
        : 'Pausing garden work during the storm';
    return out;
  }
  if (person.role === 'Baker' && !operations.bakeryStocked) {
    out.activity = 'idle';
    out.task = 'Waiting for the cooperative flour order';
    return out;
  }
  // Recalled product is written off as it is recalled or packed, so a recall
  // is still being dealt with while its lot's material remains in the plant.
  if (
    person.role === 'Quality' &&
    ((operations.recalledStockKg ?? 0) > 0 ||
      operations.batches.some((batch) => sampleStock(batch) && batch.disposition === 'recalled'))
  ) {
    out.task = 'Reviewing recalled stock from the quality inspection post';
    return out;
  }
  if (
    person.role === 'Quality' &&
    operations.batches.some((batch) => sampleStock(batch) && batch.disposition === 'hold')
  ) {
    out.task = 'Reviewing flour held for quality investigation';
    return out;
  }
  const workOrder = operations.workOrders.find(
    (order) => order.machineId === person.machineId && order.phase !== 'returned_to_service'
  );
  if (workOrder) {
    out.activity =
      workOrder.phase === 'awaiting_parts' ||
      workOrder.phase === 'ready_to_restart' ||
      workOrder.phase === 'restart_requested'
        ? 'idle'
        : 'working';
    out.task = MAINTENANCE_TASKS[workOrder.phase];
    return out;
  }
  const machine = operations.machines.find((candidate) => candidate.id === person.machineId);
  if (machine?.status === 'critical' || machine?.status === 'warning')
    out.task = 'Inspecting a reported equipment fault';
  else if (
    person.role === 'Quality' &&
    !operations.batches.some((batch) => sampleStock(batch) && batch.disposition === 'released')
  ) {
    out.activity = 'idle';
    out.task = 'Waiting for a production batch to sample';
  } else if (machine?.status === 'idle' && person.role === 'Operator') {
    // A stopped line is observed, never operated by cosmetic personnel.
    // Working if ordinary operators wait, while fault/quality/maintenance and
    // breaks above retain priority, and no production state is written here.
    out.activity = 'idle';
    out.task = 'Line stopped: waiting for production to resume';
  } else if (machine?.status === 'idle') out.task = 'Checking the idle line';
  return out;
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
/** An unhurried adult walk, in metres per REAL second at standard pace. */
export const COMMUNITY_WALK_SPEED_MPS = 1.25;
/** Game hours that pass in one real second at standard pace. */
export const STANDARD_HOURS_PER_REAL_SECOND = STANDARD_GAME_SPEED / 3600;
/** Game hours for a span authored as real seconds at standard pace. */
const standardSeconds = (seconds: number) => seconds * STANDARD_HOURS_PER_REAL_SECOND;
// People live on the one game clock with the trucks and forklifts (pace.ts): at
// standard pace they walk at real speed, and a faster pace is a time-lapse of
// the same routes. Authoring a sub-hour duration as `standardSeconds(n)` keeps
// the number and its on-screen meaning from drifting apart again; these were
// once written for a 180x default and played six times too slowly at 30x.
// Working if every walking segment plays at COMMUNITY_WALK_SPEED_MPS at pace 30.
export const WALK_HOURS_PER_METRE = standardSeconds(1 / COMMUNITY_WALK_SPEED_MPS);
/** Sitting down, standing up and the standing pause before walking away, in game hours. */
export const COMMUNITY_SEAT_RAMP = Object.freeze({
  down: standardSeconds(1.1),
  up: standardSeconds(1.3),
  standing: standardSeconds(0.3),
});
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
      stop([-202.7, 0, 31.6], 0, 0.4, 'Greeting a neighbour', 'idle'),
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

const BUS_DOORS_OPEN = 1.1;
const BUS_DOORS_CLOSE = 1.9;
/** 115 m out of the tunnel, braking evenly from about 12 m/s to the stop. */
const BUS_APPROACH_HOURS = standardSeconds(19);
const BUS_APPROACH_START = BUS_DOORS_OPEN - BUS_APPROACH_HOURS;
const BUS_TURN_LEGS = [Math.hypot(4, 22), 7 * PI, Math.hypot(4, 22)] as const;
const BUS_TURN_METRES = BUS_TURN_LEGS[0] + BUS_TURN_LEGS[1] + BUS_TURN_LEGS[2];
const BUS_DEPARTURE_METRES = BUS_TURN_METRES + 115;
/** Turnaround and return, accelerating evenly from the stop into the tunnel. */
const BUS_DEPARTURE_HOURS = standardSeconds(40);
const BUS_DEPARTURE_END = BUS_DOORS_CLOSE + BUS_DEPARTURE_HOURS;
const BUS_TURN_END =
  BUS_DOORS_CLOSE + BUS_DEPARTURE_HOURS * Math.sqrt(BUS_TURN_METRES / BUS_DEPARTURE_METRES);

/** A four-hour village shuttle: tunnel approach, stop, turnaround, tunnel return.
 * The .8h dwell is about a minute and a half at standard pace, enough to board;
 * the bus waits out of sight in the tunnel for the rest of each cycle.
 * Working if the bus drives at road speed and stops and starts without a jump.
 */
export function sampleCommunityBus(hour: number) {
  const h = communityHour(hour),
    phase = (((h - 6) % 4) + 4) % 4;
  let x = 23,
    z = 255,
    rotation = PI;
  if (phase < BUS_APPROACH_START) z = 255;
  else if (phase < BUS_DOORS_OPEN) {
    const u = (phase - BUS_APPROACH_START) / BUS_APPROACH_HOURS;
    z = 255 - 115 * (1 - (1 - u) * (1 - u));
  } else if (phase < BUS_DOORS_CLOSE) z = 140;
  else {
    const u = Math.min(1, (phase - BUS_DOORS_CLOSE) / BUS_DEPARTURE_HOURS);
    let s = BUS_DEPARTURE_METRES * u * u;
    if (s < BUS_TURN_LEGS[0]) {
      const t = s / BUS_TURN_LEGS[0];
      x = 23 + 4 * t;
      z = 140 - 22 * t;
      rotation = Math.atan2(4, -22);
    } else if ((s -= BUS_TURN_LEGS[0]) < BUS_TURN_LEGS[1]) {
      const angle = -PI * (s / BUS_TURN_LEGS[1]);
      x = 20 + 7 * Math.cos(angle);
      z = 118 + 7 * Math.sin(angle);
      rotation = PI - angle;
    } else if ((s -= BUS_TURN_LEGS[1]) < BUS_TURN_LEGS[2]) {
      const t = s / BUS_TURN_LEGS[2];
      x = 13 + 4 * t;
      z = 118 + 22 * t;
      rotation = Math.atan2(4, 22);
    } else {
      x = 17;
      z = 140 + Math.min(115, s - BUS_TURN_LEGS[2]);
      rotation = 0;
    }
  }
  return {
    x,
    z,
    rotation,
    phase,
    doorsOpen: phase >= BUS_DOORS_OPEN && phase < BUS_DOORS_CLOSE,
    serviceOpen: h >= 6 && h < 22,
    visible: h >= 6 && h < 22 && phase >= BUS_APPROACH_START && phase < BUS_DEPARTURE_END,
  };
}
const PASSENGER_DOOR: Vec3Tuple = [24.1, 0.36, 137.6];
const passengerWait = (arriving: boolean): Vec3Tuple =>
  arriving ? [29.55, A.busSeat.seatHeight! - 0.46, 140.5] : [28.4, 0.11, 139];
// Short acceleration/braking ramps preserve the path and timing with a bounded steady walk.
// Working if endpoints have zero velocity and the middle remains a steady walk.
const PASSENGER_RAMP = 0.12;
/** Game hours a passenger takes between the bus door and the shelter. The steady
 * middle of the eased walk runs at 1 / (1 - ramp) of the mean pace, which is
 * the walking speed. */
export function communityPassengerWalkHours(id: string) {
  return (
    (distance(PASSENGER_DOOR, passengerWait(id === 'bus-arriving')) * WALK_HOURS_PER_METRE) /
    (1 - PASSENGER_RAMP)
  );
}
function samplePassenger(id: string, hour: number, out: CommunityPose) {
  const bus = sampleCommunityBus(hour),
    p = bus.phase;
  const arriving = id === 'bus-arriving';
  const wait = passengerWait(arriving);
  const door = PASSENGER_DOOR;
  const from = arriving ? door : wait,
    to = arriving ? wait : door;
  const ramp = PASSENGER_RAMP;
  const walk = communityPassengerWalkHours(id);
  const t = Math.max(0, Math.min(1, (p - (arriving ? 1.16 : 1.52)) / walk));
  const eased =
    t < ramp
      ? (t * t) / (2 * ramp * (1 - ramp))
      : t > 1 - ramp
        ? 1 - ((1 - t) * (1 - t)) / (2 * ramp * (1 - ramp))
        : (t - ramp / 2) / (1 - ramp);
  for (let i = 0; i < 3; i++) out.position[i] = from[i] + (to[i] - from[i]) * eased;
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

function smoothSeat(value: number) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}
function setSeatCue(
  out: CommunityPose,
  previous: CommunityPose['seat'],
  anchor: CommunityStop,
  amount: number,
  support: number
) {
  const cue = previous ?? {
    amount: 0,
    support: 0,
    position: anchor.position,
    rotation: anchor.rotation,
  };
  cue.amount = amount;
  cue.support = support;
  cue.position = anchor.position;
  cue.rotation = anchor.rotation;
  out.seat = cue;
}

export function sampleCommunityPerson(
  person: CommunityPerson,
  hour: number,
  out = createCommunityPose()
): CommunityPose {
  const previousSeat = out.seat;
  out.seat = undefined;
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
    out.task = delivery.moving ? 'Moving the empty handcart' : 'Checking the empty return cart';
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
      if (node.seated) {
        // At standard pace: 1.1 s down, 1.3 s up and 0.3 s standing before departure.
        // Short authored dwells reserve the same proportions without overlap.
        const down = Math.min(COMMUNITY_SEAT_RAMP.down, node.hours * 0.3);
        const up = Math.min(COMMUNITY_SEAT_RAMP.up, node.hours * 0.35);
        const margin = Math.min(COMMUNITY_SEAT_RAMP.standing, node.hours * 0.1);
        setSeatCue(
          out,
          previousSeat,
          node,
          smoothSeat(elapsed / down) *
            (1 - smoothSeat((elapsed - (node.hours - up - margin)) / up)),
          1
        );
      }
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
      // Keep the original centreline and clock. Support is acquired/released
      // through visible steps around the seat, never a delayed seated slide.
      const segment = distance(node.position, next.position);
      if (next.seated && !node.seated) {
        const window = Math.min(0.6, segment * 0.45);
        const remaining = segment * (1 - t);
        if (remaining < window)
          setSeatCue(
            out,
            previousSeat,
            next,
            0,
            smoothSeat((window - remaining) / (window * 0.75))
          );
      } else if (node.seated && !next.seated) {
        const window = Math.min(0.55, segment * 0.45);
        const travelled = segment * t;
        if (travelled < window)
          setSeatCue(
            out,
            previousSeat,
            node,
            0,
            1 - smoothSeat((travelled - window * 0.4) / (window * 0.6))
          );
      }
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
    agreementMemberId: string | null;
    agreementState: string | null;
    agreementPresentation: string | null;
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
        agreementMemberId: object.userData.agreementMemberId ?? null,
        agreementState: object.userData.agreementState ?? null,
        agreementPresentation: object.userData.agreementPresentation ?? null,
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

/** Independent empty-cart routine. No grocer order exists in the campaign, so
 * a scheduled visit has no authority to create flour or claim a delivery.
 * Working if every clock sample keeps loaded and delivered false.
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
  // Park the empty cart. The courier steps around its left side to inspect it.
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
    delivered: false,
    loaded: false,
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
  if (trafficBlocked && previousPhase <= 1.860001 && phase >= 1.86 && phase < BUS_TURN_END)
    return next - phase + 1.86;
  return next;
}

/** A leisurely 8.6 km/h at standard pace, gentle enough for 1.2 m turns. */
export const COMMUNITY_CYCLE_SPEED_MPS = 2.4;
const CYCLIST_METRES_PER_HOUR = COMMUNITY_CYCLE_SPEED_MPS / STANDARD_HOURS_PER_REAL_SECOND;

/** Both lanes and both turn arcs fit the existing west village cobbled street.
 * The courier's morning cart stop ends before cycling hours begin.
 */
export function sampleCommunityCyclist(hour: number) {
  const h = communityHour(hour),
    radius = 1.2,
    straight = 21;
  const length = 2 * straight + 2 * Math.PI * radius;
  const travelled = (Number.isFinite(hour) ? hour : 12) * CYCLIST_METRES_PER_HOUR;
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
