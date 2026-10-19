import type { Object3D } from 'three';
import type { RuntimeWeather } from '../runtime/runtimeMode';
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import { CAMPAIGN_MASS_EPSILON_KG } from './operationsPlay';
import type { MaintenanceWorkOrder } from '../stores/breakdownStore';
import type { ProductionBatch } from '../stores/materialFlowStore';
import type { MachineData } from '../types';
import {
  COMMUNITY_ACTIVITY_HOURS,
  COMMUNITY_ANCHORS as A,
  COMMUNITY_OPENING_HOURS,
  getCommunityHours,
} from '../constants/communityLayout';
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
  /** A village day: out of `door` at `open`, along `approach` to stops[0], whole
   * loops of the routine, then back in at `close`. Nobody appears mid-street. */
  day?: {
    readonly open: number;
    readonly close: number;
    readonly door: Vec3Tuple;
    readonly approach: readonly Vec3Tuple[];
  };
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

/** A resident body's yaw this frame. Moving bodies ease into the route's heading;
 * a held body (paused, safety stop, hidden tab) keeps whatever heading it had
 * reached; a cut (a clock jump or reframe, or reduced motion) and a coupled prop
 * take the heading exactly. Working if pausing mid-turn never snaps the body. */
export function communityRootYaw(
  current: number,
  target: number,
  delta: number,
  state: { moving: boolean; cut?: boolean; coupled?: boolean }
): number {
  if (state.cut || state.coupled) return target;
  if (!state.moving) return current;
  const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + turn * (1 - Math.exp(-delta * 8));
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
/** Every mill routine repeats on this one period, so routes that cross stay
 * apart in time for ever instead of drifting into each other days later. */
export const MILL_ROUTINE_HOURS = 4;
/** Lengthen or shorten the first (working) stop so the loop takes `period`. */
function fitPeriod(stops: CommunityStop[], period = MILL_ROUTINE_HOURS): CommunityStop[] {
  const walking = stops.reduce((total, node, i) => {
    const next = stops[(i + 1) % stops.length].position;
    return (
      total +
      node.hours +
      Math.hypot(node.position[0] - next[0], node.position[2] - next[2]) * WALK_HOURS_PER_METRE
    );
  }, 0);
  return [{ ...stops[0], hours: stops[0].hours + period - walking }, ...stops.slice(1)];
}
const millLoop = (
  work: Vec3Tuple,
  aisle: number,
  lane: number,
  seat: Vec3Tuple,
  job: string
): CommunityStop[] =>
  fitPeriod([
    stop(work, PI, 0, job),
    via([work[0], 0, aisle]),
    via([lane, 0, aisle]),
    via([lane, 0, seat[2]]),
    rest(seat, PI / 2),
    via([lane, 0, seat[2]]),
    via([lane, 0, aisle]),
    via([work[0], 0, aisle]),
  ]);

/** Closed, authored pedestrian circuits stay on the mill side of conveyors.
 * Working if sampled segments clear machine/belt footprints and vehicle lanes.
 *
 * Every mill resident has a lane of their own, 0.7 m from the next, so nobody
 * shares a line with anyone or stands on anyone else's route. The order is what
 * makes that possible: the roller-mill aisles step north (34.2, 34.9, 35.6) as
 * their west lanes step west (-30.9, -31.6, -32.3) and their seats step north,
 * and the supervisor keeps the westmost lane (-33) to the northmost seat. The two
 * packing routes come in from the east, packer (-6.4) south of quality (-5.2),
 * each to the seat on its own side. What is left are square crossings of an east
 * route with a west lane; one shared period and the phases keep those apart in time.
 * Working if the pairwise separation test finds every pair at least 0.6 m apart.
 */
export const COMMUNITY_ROSTER: readonly CommunityPerson[] = [
  {
    id: 'mill-operator-west',
    role: 'Operator',
    district: 'mill',
    phase: 0,
    machineId: 'rm-101',
    stops: millLoop([-24, 0, 33.5], 34.2, -30.9, [-34, 0, -12.45], 'Checking the roller mill'),
  },
  {
    id: 'mill-operator-east',
    role: 'Operator',
    district: 'mill',
    phase: 2.3,
    machineId: 'rm-104',
    stops: millLoop([18, 0, 33.5], 35.6, -32.3, [-34, 0, -8.45], 'Adjusting the milling controls'),
  },
  {
    id: 'mill-engineer',
    role: 'Engineer',
    district: 'mill',
    phase: 4.2,
    machineId: 'rm-102',
    stops: millLoop([-10, 0, 33.5], 34.9, -31.6, [-34, 0, -11.55], 'Equipment inspection'),
  },
  {
    id: 'mill-quality',
    role: 'Quality',
    district: 'mill',
    phase: 0.4,
    machineId: 'packer-2',
    stops: fitPeriod([
      stop(A.millInspection.position, PI, 0, 'Taking a flour sample'),
      via([8, 0, -5.2]),
      via([-33, 0, -5.2]),
      rest([-34, 0, -4.45], PI / 2),
      via([-33, 0, -5.2]),
      via([8, 0, -5.2]),
    ]),
  },
  {
    id: 'mill-packer',
    role: 'Operator',
    district: 'mill',
    phase: 1.8,
    machineId: 'packer-0',
    stops: fitPeriod([
      stop(A.millPacking.position, PI, 0, 'Checking the packing line'),
      via([-8, 0, -6.4]),
      via([-33, 0, -6.4]),
      rest([-34, 0, -7.55], PI / 2),
      via([-33, 0, -6.4]),
      via([-8, 0, -6.4]),
    ]),
  },
  {
    id: 'mill-supervisor',
    role: 'Supervisor',
    district: 'mill',
    phase: 0.7,
    stops: fitPeriod([
      stop([-33, 0, 8], PI / 2, 0, 'Reviewing the shift'),
      // Overlooks the floor from its own lane rather than stepping across the others.
      stop([-33, 0, 25], PI / 2, 1.1, 'Inspecting the milling floor'),
      via([-33, 0, -3.55]),
      rest([-34, 0, -3.55], PI / 2),
      via([-33, 0, -3.55]),
    ]),
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
    day: {
      ...COMMUNITY_OPENING_HOURS.shops,
      door: A.bakeryDoor.position,
      approach: [[-175.1, 0, 5]],
    },
  },
  {
    id: 'village-shopkeeper',
    role: 'Shopkeeper',
    district: 'village',
    phase: 1.2,
    stops: [
      stop(A.shopCustomer.position, -PI / 2, 1.4, 'Tending the village shop'),
      stop([-204.4, 0, 31.6], -PI / 2, 0.6, 'Checking the delivery crates'),
      // Clear of the courier's parked cart (body z 31.1 to 32.1), looking up the street.
      stop([-202.7, 0, 30.4], 0, 0.4, 'Greeting a neighbour', 'idle'),
      via([-202.7, 0, 30]),
    ],
    day: { ...COMMUNITY_OPENING_HOURS.shops, door: A.shopDoor.position, approach: [] },
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
    // Out of the tool shed, between it and the beds, onto the central path.
    day: {
      ...COMMUNITY_ACTIVITY_HOURS.gardening,
      door: A.allotmentShedDoor.position,
      approach: [
        [-217.5, 0, 9],
        [-215.35, 0, 9],
      ],
    },
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
    // Out of the pub door, between the two outdoor seats, to the south one.
    day: { ...COMMUNITY_OPENING_HOURS.pub, door: A.pubDoor.position, approach: [[-208.1, 0, -15]] },
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
/** Root height of a commuter seated on the shelter bench. */
const BENCH_ROOT_Y = A.busSeat.seatHeight! - 0.46;
const PLATFORM_Y = 0.11;
/** Each commuter's own place on the shelter bench, and the kerb spot in front of it. */
const COMMUTERS: Readonly<Record<string, { seat: CommunityStop; kerb: Vec3Tuple }>> = {
  'bus-arriving': {
    seat: stop([29.55, BENCH_ROOT_Y, 140.5], -PI / 2, 0, 'Resting at the shelter', 'break', true),
    kerb: [28.4, PLATFORM_Y, 140.5],
  },
  'bus-departing': {
    seat: stop([29.55, BENCH_ROOT_Y, 139], -PI / 2, 0, 'Resting at the shelter', 'break', true),
    kerb: [28.4, PLATFORM_Y, 139],
  },
};
/** Bus phases: the alighting commuter steps off once the doors have opened; the
 * boarding one stands up as the shuttle comes out of the tunnel, and boards
 * after the other has stepped clear. */
const ALIGHT_AT = 1.16;
const BOARD_AT = 1.52;
const STAND_AT = BUS_APPROACH_START;
// Short acceleration/braking ramps preserve the path and timing with a bounded steady walk.
// Working if endpoints have zero velocity and the middle remains a steady walk.
const PASSENGER_RAMP = 0.12;
const easedWalkHours = (from: Vec3Tuple, to: Vec3Tuple) =>
  (distance(from, to) * WALK_HOURS_PER_METRE) / (1 - PASSENGER_RAMP);
/** Game hours a commuter takes from the bus door to the bench, or from the kerb
 * to the door. The steady middle of the eased walk runs at 1 / (1 - ramp) of
 * the mean pace, which is the walking speed. */
export function communityPassengerWalkHours(id: string, leg: 'alight' | 'board') {
  const commuter = COMMUTERS[id] ?? COMMUTERS['bus-arriving'];
  return leg === 'alight'
    ? easedWalkHours(PASSENGER_DOOR, commuter.seat.position)
    : easedWalkHours(commuter.kerb, PASSENGER_DOOR);
}
function easePassenger(t: number) {
  const ramp = PASSENGER_RAMP;
  return t < ramp
    ? (t * t) / (2 * ramp * (1 - ramp))
    : t > 1 - ramp
      ? 1 - ((1 - t) * (1 - t)) / (2 * ramp * (1 - ramp))
      : (t - ramp / 2) / (1 - ramp);
}
/** Which way a commuter uses this run. Two commuters share the rota: the first run
 * of the day only brings one in, the last only takes one away, and between them
 * whoever came in on the previous run waits on the bench for the next one. */
function commuterRole(id: string, hour: number): 'alight' | 'board' | 'away' {
  const h = communityHour(hour);
  if (h < 6 || h >= 22) return 'away';
  const run = Math.floor((h - 6) / 4),
    index = id === 'bus-arriving' ? 0 : 1;
  if (run <= 2 && run % 2 === index) return 'alight';
  if (run >= 1 && (run - 1) % 2 === index) return 'board';
  return 'away';
}
/** Two commuters: each steps off one run, sits on the bench with the same seat
 * ramps as the mill rests, and boards the next. Working if they only appear or
 * disappear in the open bus doorway and never pop between standing and seated. */
function samplePassenger(
  id: string,
  hour: number,
  out: CommunityPose,
  previousSeat: CommunityPose['seat']
) {
  const commuter = COMMUTERS[id] ?? COMMUTERS['bus-arriving'];
  const { seat, kerb } = commuter;
  const p = sampleCommunityBus(hour).phase,
    role = commuterRole(id, hour);
  let from: Vec3Tuple = PASSENGER_DOOR,
    to: Vec3Tuple = seat.position,
    t = 0,
    support = 0;
  out.visible = true;
  out.seated = false;
  out.rotation = seat.rotation;
  out.activity = 'idle';
  out.task = 'Waiting for Route 42';
  const walk = (a: Vec3Tuple, b: Vec3Tuple, start: number) => {
    from = a;
    to = b;
    t = Math.max(0, Math.min(1, (p - start) / easedWalkHours(a, b)));
    out.rotation = Math.atan2(b[0] - a[0], b[2] - a[2]);
    out.activity = 'walking';
  };
  const seated = (amount: number) => {
    from = to = seat.position;
    out.seated = true;
    out.rotation = seat.rotation;
    out.activity = 'break';
    out.task = seat.task;
    support = 1;
    setSeatCue(out, previousSeat, seat, amount, 1);
  };
  const riseEnd = STAND_AT + COMMUNITY_SEAT_RAMP.up + COMMUNITY_SEAT_RAMP.standing;
  if (role === 'away' || (role === 'alight' && p < ALIGHT_AT)) {
    // Riding, or still on the bus: held in its doorway, out of sight.
    from = to = PASSENGER_DOOR;
    out.visible = false;
    out.rotation = Math.atan2(seat.position[0] - from[0], seat.position[2] - from[2]);
    out.task = 'Riding Route 42';
  } else if (role === 'alight') {
    walk(PASSENGER_DOOR, seat.position, ALIGHT_AT);
    out.task = 'Leaving the bus';
    if (t >= 1)
      seated(smoothSeat((p - ALIGHT_AT - easedWalkHours(from, to)) / COMMUNITY_SEAT_RAMP.down));
    else {
      const segment = distance(from, to),
        window = Math.min(0.6, segment * 0.45),
        remaining = segment * (1 - easePassenger(t));
      if (remaining < window) {
        support = smoothSeat((window - remaining) / (window * 0.75));
        setSeatCue(out, previousSeat, seat, 0, support);
      }
    }
  } else if (p < STAND_AT) seated(1);
  else if (p < riseEnd) seated(1 - smoothSeat((p - STAND_AT) / COMMUNITY_SEAT_RAMP.up));
  else if (p < BOARD_AT) {
    walk(seat.position, kerb, riseEnd);
    out.task = 'Waiting for Route 42';
    if (t >= 1) {
      out.activity = 'idle';
      out.rotation = seat.rotation;
    } else {
      const segment = distance(from, to),
        window = Math.min(0.55, segment * 0.45),
        travelled = segment * easePassenger(t);
      if (travelled < window) {
        support = 1 - smoothSeat((travelled - window * 0.4) / (window * 0.6));
        setSeatCue(out, previousSeat, seat, 0, support);
      }
    }
  } else {
    walk(kerb, PASSENGER_DOOR, BOARD_AT);
    out.task = 'Boarding the bus';
    // Through the doorway and on board.
    if (t >= 1) {
      out.visible = false;
      out.activity = 'idle';
      out.task = 'Riding Route 42';
    }
  }
  const eased = easePassenger(t);
  for (let i = 0; i < 3; i++) out.position[i] = from[i] + (to[i] - from[i]) * eased;
  const x = out.position[0];
  const busStep = 0.36 * Math.max(0, Math.min(1, (24.7 - x) / 0.6));
  const platform = PLATFORM_Y * Math.max(0, Math.min(1, (x - 27.25) / 0.2));
  // Seat support settles the root onto the bench height (WorkerModel adds the
  // bus floor offset back to the soles).
  out.position[1] = Math.max(busStep, platform) - (PLATFORM_Y - BENCH_ROOT_Y) * support;
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
    samplePassenger(person.id, hour, out, previousSeat);
    return out;
  }
  const h = communityHour(hour);
  if (person.day) {
    const { open, close } = person.day;
    out.visible = h >= open && h < close;
    sampleRoute(
      villageDay(person),
      Math.max(0, Math.min(close - open, h - open)),
      false,
      out,
      previousSeat
    );
    if (!out.visible) {
      out.activity = 'idle';
      out.task = 'At home';
    }
    return out;
  }
  const hours = getCommunityHours(h);
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
  const elapsed =
    ((((Number.isFinite(hour) ? hour : 12) + person.phase) % period) + period) % period;
  sampleRoute(person.stops, elapsed, true, out, previousSeat);
  return out;
}

const villageDays = new WeakMap<CommunityPerson, readonly CommunityStop[]>();
/** Door, approach, as many whole loops of the routine as fit, the first stop
 * stretched to fill the rest, and back along the approach to arrive at the door
 * exactly at closing. Working if a resident only ever appears or leaves at a door. */
function villageDay(person: CommunityPerson): readonly CommunityStop[] {
  const cached = villageDays.get(person);
  if (cached) return cached;
  const { open, close, door, approach } = person.day!;
  const first = person.stops[0];
  const path = [door, ...approach, first.position];
  let legs = 0;
  for (let i = 1; i < path.length; i++) legs += distance(path[i - 1], path[i]);
  legs *= WALK_HOURS_PER_METRE;
  const period = routineDuration(person),
    available = close - open - 2 * legs;
  const loops = Math.max(0, Math.floor((available - first.hours) / period));
  const day = [
    stop(door, 0, 0, 'Heading out', 'walking'),
    ...approach.map(via),
    ...Array.from({ length: loops }, () => person.stops).flat(),
    { ...first, hours: available - loops * period },
    ...[...approach].reverse().map(via),
    stop(door, 0, Infinity, 'Heading home', 'idle'),
  ];
  villageDays.set(person, day);
  return day;
}

/** Walk `stops` at `elapsed` game hours in; `loop` routes wrap, others hold the last stop. */
function sampleRoute(
  stops: readonly CommunityStop[],
  elapsed: number,
  loop: boolean,
  out: CommunityPose,
  previousSeat: CommunityPose['seat']
) {
  let trip = 0,
    afterDwell = false;
  for (let i = 0; i < stops.length; i++) {
    const node = stops[i],
      next = loop ? stops[(i + 1) % stops.length] : stops[i + 1];
    if (elapsed < node.hours || !next) {
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
    if (node.hours > 0) {
      trip = 0;
      afterDwell = true;
    }
    const travel = distance(node.position, next.position) * WALK_HOURS_PER_METRE;
    if (elapsed < travel) {
      routeTrip.into = trip + elapsed;
      routeTrip.afterDwell = afterDwell;
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
    trip += travel;
  }
  return out;
}

/** How far into its current trip the last walking route sample was, in game
 * hours, and whether that trip began at the end of a dwell. Waypoints with no
 * dwell (`via`) continue the same trip. */
const routeTrip = { into: 0, afterDwell: false };
/** A shown moment just inside the dwell a trip leaves from. */
const STILL_EPSILON = 1e-7;
const stillScratch = createCommunityPose();

/** The hour to show a resident at under reduced motion: the moment their current
 * trip began, until they arrive, so the body cuts from stop to stop instead of
 * gliding along a route with frozen limbs. A trip from a dwell shows the end of
 * that dwell; a trip from a doorway (village door, bus door) or the street end
 * shows its first instant there. The cyclist waits at the street end. Vehicles
 * are not people and keep their own clocks.
 * Working if every value is at most `hour` and is constant through a trip. */
export function communityStillHour(person: CommunityPerson, hour: number): number {
  if (!Number.isFinite(hour)) return hour;
  const h = communityHour(hour);
  if (person.role === 'Cyclist') {
    const { open, close } = COMMUNITY_ACTIVITY_HOURS.cycling;
    return h >= open && h < close ? hour - (h - open) : hour;
  }
  stillScratch.seat = undefined;
  const pose = sampleCommunityPerson(person, hour, stillScratch);
  if (pose.activity !== 'walking') return hour;
  if (person.id === 'village-courier') {
    const s = COMMUNITY_COURIER_SCHEDULE;
    const [start, fromDwell] =
      h < s.parked
        ? [s.start, false]
        : h < s.inspect
          ? [s.stepAround, true]
          : h < s.turn
            ? [s.returning, true]
            : [s.pull, true];
    return hour - (h - start) - (fromDwell ? STILL_EPSILON : 0);
  }
  if (person.district === 'bus') {
    const p = sampleCommunityBus(hour).phase;
    const start =
      pose.task === 'Leaving the bus'
        ? ALIGHT_AT
        : pose.task === 'Boarding the bus'
          ? BOARD_AT
          : STAND_AT + COMMUNITY_SEAT_RAMP.up + COMMUNITY_SEAT_RAMP.standing;
    return hour - (p - start) - (start === ALIGHT_AT ? 0 : STILL_EPSILON);
  }
  return hour - routeTrip.into - (routeTrip.afterDwell ? STILL_EPSILON : 0);
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
/** Where the west village street leaves the paved village to the north. The
 * courier and the cyclist come and go here rather than appearing mid-street. */
export const COMMUNITY_STREET_END_Z = 62;
const COURIER_X = -202.8;
/** The cart's handle trails its body by this much; the cart always points south. */
const CART_HANDLE = 1.4;
/** Handle positions: just outside the street end with the cart at it, and parked. */
const COURIER_ENTRY_Z = COMMUNITY_STREET_END_Z + CART_HANDLE;
const COURIER_PARK_Z = 33;
const COURIER_HAUL_HOURS = (COURIER_ENTRY_Z - COURIER_PARK_Z) * WALK_HOURS_PER_METRE;
/** The step around the cart's left side: 1 m west, then 1.4 m south beside it. */
const COURIER_SIDE: Vec3Tuple = [COURIER_X - 1, 0, COURIER_PARK_Z];
const COURIER_INSPECT: Vec3Tuple = [COURIER_X - 1, 0, COURIER_PARK_Z - CART_HANDLE];
const COURIER_STEP_HOURS = (1 + CART_HANDLE) * WALK_HOURS_PER_METRE;
/** The courier's morning, in game hours. Every leg walks forwards at walking pace;
 * the cart is gripped only while the body already faces the way it will haul.
 * Working if the courier never backs up or crabs and never turns while coupled. */
export const COMMUNITY_COURIER_SCHEDULE = (() => {
  const start = 9;
  const parked = start + COURIER_HAUL_HOURS;
  const stepAround = parked + standardSeconds(1);
  const inspect = stepAround + COURIER_STEP_HOURS;
  const returning = 10.4;
  const turn = returning + COURIER_STEP_HOURS;
  const pull = turn + standardSeconds(0.9);
  return Object.freeze({
    start,
    parked,
    stepAround,
    inspect,
    returning,
    turn,
    pull,
    gone: pull + COURIER_HAUL_HOURS,
  });
})();

/** Walk a two-leg path (corner at `via`) over `hours`; returns the heading too. */
function walkCorner(from: Vec3Tuple, via: Vec3Tuple, to: Vec3Tuple, t: number) {
  const first = distance(from, via),
    total = first + distance(via, to);
  const s = Math.max(0, Math.min(1, t)) * total;
  const [a, b, u] = s < first ? [from, via, s / first] : [via, to, (s - first) / (total - first)];
  return {
    x: a[0] + (b[0] - a[0]) * u,
    z: a[2] + (b[2] - a[2]) * u,
    rotation: Math.atan2(b[0] - a[0], b[2] - a[2]),
  };
}

export function sampleCommunityDelivery(hour: number) {
  const h = communityHour(hour),
    s = COMMUNITY_COURIER_SCHEDULE;
  let handleZ = COURIER_PARK_Z,
    x = COURIER_X,
    z = COURIER_PARK_Z,
    rotation = Math.PI,
    moving = false,
    cartGrip: 'push' | 'pull' | undefined;
  if (h < s.start || h >= s.gone) {
    // Out of the village: both held beyond the street end, as they left or will arrive.
    handleZ = z = COURIER_ENTRY_Z;
    rotation = h < s.start ? Math.PI : 0;
    cartGrip = h < s.start ? 'push' : 'pull';
  } else if (h < s.parked) {
    handleZ = z = COURIER_ENTRY_Z - (h - s.start) / WALK_HOURS_PER_METRE;
    moving = h > s.start;
    cartGrip = 'push';
  } else if (h < s.stepAround) {
    cartGrip = 'push';
  } else if (h < s.inspect) {
    ({ x, z, rotation } = walkCorner(
      [COURIER_X, 0, COURIER_PARK_Z],
      COURIER_SIDE,
      COURIER_INSPECT,
      (h - s.stepAround) / COURIER_STEP_HOURS
    ));
    moving = true;
  } else if (h < s.returning) {
    [x, , z] = COURIER_INSPECT;
    rotation = Math.PI / 2;
  } else if (h < s.turn) {
    ({ x, z, rotation } = walkCorner(
      COURIER_INSPECT,
      COURIER_SIDE,
      [COURIER_X, 0, COURIER_PARK_Z],
      (h - s.returning) / COURIER_STEP_HOURS
    ));
    moving = true;
  } else if (h < s.pull) {
    // Turn on the spot to face the street end before taking the handle.
    rotation = 0;
  } else {
    handleZ = z = COURIER_PARK_Z + (h - s.pull) / WALK_HOURS_PER_METRE;
    rotation = 0;
    moving = true;
    cartGrip = 'pull';
  }
  const cartZ = handleZ - CART_HANDLE;
  const window = h >= s.start && h < s.gone;
  return {
    x,
    z,
    rotation,
    cartX: COURIER_X,
    cartZ,
    visible: window && z <= COMMUNITY_STREET_END_Z,
    cartVisible: window && cartZ <= COMMUNITY_STREET_END_Z,
    moving,
    delivered: false,
    loaded: false,
    cartGrip,
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

const CYCLE_RADIUS = 1.2,
  CYCLE_STRAIGHT = 21;
const CYCLE_LOOP = 2 * CYCLE_STRAIGHT + 2 * Math.PI * CYCLE_RADIUS;
/** In along the southbound lane from the street end to the loop's top (z 55),
 * joining where the southbound straight begins, and out the same way on the
 * northbound lane; both legs run straight on, with no turn to make. */
const CYCLE_LEG = COMMUNITY_STREET_END_Z - 55;
const CYCLE_JOIN = CYCLE_STRAIGHT + Math.PI * CYCLE_RADIUS;
const CYCLE_LEAVE = CYCLE_STRAIGHT;
const CYCLE_LAPS = 40;
const CYCLE_ROUTE = 2 * CYCLE_LEG + CYCLE_LAPS * CYCLE_LOOP - (CYCLE_JOIN - CYCLE_LEAVE);
/** A leisurely ride of about 8.5 km/h at standard pace, gentle enough for 1.2 m
 * turns, set so whole laps fill cycling hours exactly. */
export const COMMUNITY_CYCLE_SPEED_MPS =
  (CYCLE_ROUTE * STANDARD_HOURS_PER_REAL_SECOND) /
  (COMMUNITY_ACTIVITY_HOURS.cycling.close - COMMUNITY_ACTIVITY_HOURS.cycling.open);

/** Both lanes and both turn arcs fit the existing west village cobbled street.
 * The courier's morning cart stop ends before cycling hours begin. The rider
 * comes in from the street end at opening and leaves by it at closing.
 */
export function sampleCommunityCyclist(hour: number) {
  const h = communityHour(hour),
    radius = CYCLE_RADIUS,
    straight = CYCLE_STRAIGHT,
    { open, close } = COMMUNITY_ACTIVITY_HOURS.cycling;
  const travelled =
    (Math.max(0, Math.min(close - open, h - open)) * COMMUNITY_CYCLE_SPEED_MPS) /
    STANDARD_HOURS_PER_REAL_SECOND;
  let d = (CYCLE_JOIN + travelled - CYCLE_LEG) % CYCLE_LOOP;
  let x = -203.2,
    z = 34,
    rotation = 0;
  if (travelled < CYCLE_LEG) {
    x = -200.8;
    z = COMMUNITY_STREET_END_Z - travelled;
    rotation = Math.PI;
  } else if (travelled > CYCLE_ROUTE - CYCLE_LEG) {
    z = 55 + travelled - (CYCLE_ROUTE - CYCLE_LEG);
  } else if (d < straight) z += d;
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
    visible: h >= open && h < close,
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
