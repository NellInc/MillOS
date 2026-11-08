/**
 * THE FACTORY AI'S AGREED ADJUSTMENTS (D-058).
 *
 * The plant decision engine (aiEngine.ts) is limited to equipment and process
 * state. This module gives it one more duty, and only one: carrying out the
 * adjustments colleagues asked for (src/simulation/agreedAdjustments.ts), and
 * saying in its decision feed what it did and why. It acts on agreements and
 * schedules it was given, never on anything it infers about a person: it does
 * not watch where anyone is, and it keeps no number about anyone.
 *
 * - When an alarm starts (a live emergency, the egress drill or the forklift
 *   emergency stop), it confirms the alarm also went out as light and
 *   vibration to the colleague who asked for that.
 * - The egress drill verifies a zone only with a clear step-free way out;
 *   the sequencer files each zone's check here (accessibleEgress.ts).
 * - It moves the loud air-line purge out of the quiet room's booked breaks,
 *   and runs it when the booking ends.
 *
 * Every card is filed `completed` with keyed copy, so it reads in the active
 * language and never waits in the queue for a decision.
 */
import type { AIDecision } from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { createTranslator, getLocale, translate } from '../i18n';
import { aiEngineMessages as msg } from './aiEngine.messages';
import { aiAccommodationMessages as provenance } from './aiAccommodation.messages';
import { SERVICE_EGRESS_POINTS } from '../stores/gameSimulationStore';
import { QUIET_ROOM_BOOKINGS, type QuietRoomBooking } from '../simulation/agreedAdjustments';
import type { EgressZoneId, StepFreeEgressResult } from '../systems/accessibleEgress';
import { audioManager } from './audioManager';
import { logger } from './logger';

type MessageKey = keyof (typeof msg)['en'] & string;
interface CopyEntry {
  key: MessageKey;
  params?: Record<string, string>;
}

let sequence = 0;

/** Build a completed, keyed decision card in the active language. */
export function accommodationCard(
  kind: 'alert' | 'egress' | 'quiet-room',
  copy: { action: CopyEntry; reasoning: CopyEntry; impact: CopyEntry },
  options: {
    type: AIDecision['type'];
    priority: AIDecision['priority'];
    triggeredBy: NonNullable<AIDecision['triggeredBy']>;
    affectedSystems: string[];
    observations: { label: string; value: string }[];
  }
): AIDecision {
  const t = createTranslator(msg, getLocale());
  const now = Date.now();
  sequence += 1;
  return {
    id: `access-${kind}-${now}-${sequence}`,
    timestamp: new Date(now),
    type: options.type,
    status: 'completed',
    priority: options.priority,
    triggeredBy: options.triggeredBy,
    // About the decision, not about anyone: the agreement and the check are known.
    confidence: 99,
    action: t(copy.action.key, copy.action.params),
    reasoning: t(copy.reasoning.key, copy.reasoning.params),
    impact: t(copy.impact.key, copy.impact.params),
    copy,
    provenance: {
      capturedAt: now,
      observations: options.observations.map(({ label, value }) => ({
        label,
        value,
        source: 'schedule',
        quality: 'good',
        capturedAt: now,
      })),
      assumptions: [translate(provenance, 'assumption')],
      affectedSystems: options.affectedSystems,
      affectedEquipment: [],
      expectedEffect: t(copy.impact.key, copy.impact.params),
      alternatives: [],
      inputSnapshot: {},
    },
  };
}

function file(decision: AIDecision): boolean {
  try {
    return useProductionStore.getState().addAIDecision?.(decision) === true;
  } catch (error) {
    logger.ai.warn('Accommodation decision not filed', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alarms as light and vibration
// ---------------------------------------------------------------------------

export type AlarmCause = 'drill' | 'emergency' | 'forklift-stop';

export function alarmCause(): AlarmCause | null {
  const game = useGameSimulationStore.getState();
  if (game.emergencyDrillMode) return 'drill';
  if (game.emergencyActive) return 'emergency';
  if (useSafetyStore.getState().forkliftEmergencyStop === true) return 'forklift-stop';
  return null;
}

export function alertDeliveryDecision(cause: AlarmCause): AIDecision {
  const reasoning: MessageKey =
    cause === 'drill'
      ? 'accessAlertReasoningDrill'
      : cause === 'emergency'
        ? 'accessAlertReasoningEmergency'
        : 'accessAlertReasoningForklift';
  return accommodationCard(
    'alert',
    {
      action: { key: 'accessAlertAction' },
      reasoning: { key: reasoning },
      impact: { key: 'accessAlertImpact' },
    },
    {
      type: 'safety',
      priority: 'high',
      triggeredBy: 'alert',
      affectedSystems: [
        translate(provenance, 'systemVisualAlarms'),
        translate(provenance, 'systemPager'),
      ],
      observations: [
        {
          label: translate(provenance, 'agreedAdjustment'),
          value: translate(provenance, 'visualAlerts'),
        },
        {
          label: translate(provenance, 'pagerDelivery'),
          value: translate(provenance, 'confirmed'),
        },
      ],
    }
  );
}

// ---------------------------------------------------------------------------
// Step-free egress
// ---------------------------------------------------------------------------

const zoneLabel = (zoneId: EgressZoneId) =>
  SERVICE_EGRESS_POINTS.find((point) => point.id === zoneId)?.label ?? zoneId;

const ZONE_KEY: Record<EgressZoneId, { clear: MessageKey; alt: MessageKey; held: MessageKey }> = {
  front: {
    clear: 'accessEgressClearFront',
    alt: 'accessEgressAltFront',
    held: 'accessEgressHeldFront',
  },
  back: {
    clear: 'accessEgressClearBack',
    alt: 'accessEgressAltBack',
    held: 'accessEgressHeldBack',
  },
  west: {
    clear: 'accessEgressClearWest',
    alt: 'accessEgressAltWest',
    held: 'accessEgressHeldWest',
  },
  east: {
    clear: 'accessEgressClearEast',
    alt: 'accessEgressAltEast',
    held: 'accessEgressHeldEast',
  },
};

/** The alternative is always a service door; its name is part of the keyed reasoning. */
function alternativeReasoning(
  result: Extract<StepFreeEgressResult, { status: 'alternative' }>
): MessageKey {
  return result.alternative === 'east'
    ? 'accessEgressAlternativeReasoningEast'
    : 'accessEgressAlternativeReasoningWest';
}

/** The front and back zones say which door they went by: the dock beside it is a metre up. */
const CLEAR_REASONING: Partial<Record<EgressZoneId, MessageKey>> = {
  front: 'accessEgressClearReasoningFront',
  back: 'accessEgressClearReasoningBack',
};

export function egressAccessDecision(result: StepFreeEgressResult): AIDecision | null {
  const keys = ZONE_KEY[result.zoneId];
  if (!keys) return null;
  return accommodationCard(
    'egress',
    {
      action: {
        key:
          result.status === 'blocked'
            ? keys.held
            : result.status === 'alternative'
              ? keys.alt
              : keys.clear,
      },
      reasoning: {
        key:
          result.status === 'clear'
            ? (CLEAR_REASONING[result.zoneId] ?? 'accessEgressClearReasoning')
            : result.status === 'alternative'
              ? alternativeReasoning(result)
              : 'accessEgressBlockedReasoning',
      },
      impact: { key: 'accessEgressImpact' },
    },
    {
      type: 'safety',
      priority: result.status === 'blocked' ? 'high' : 'medium',
      triggeredBy: 'schedule',
      affectedSystems: [translate(provenance, 'systemEgress')],
      observations: [
        { label: translate(provenance, 'zone'), value: zoneLabel(result.zoneId) },
        {
          label: translate(provenance, 'stepFreeRoute'),
          value:
            result.status === 'alternative'
              ? translate(provenance, 'viaAlternative', { zone: zoneLabel(result.alternative) })
              : translate(provenance, result.status === 'clear' ? 'clear' : 'blocked'),
        },
      ],
    }
  );
}

/** One card per zone and result within a drill; repeats of a held zone are not refiled. */
const filedEgress = new Set<string>();
let filedEgressDrill: number | null = null;

/** Called by the egress sequencer for every zone it checks. */
export function fileEgressAccessCheck(drillStartTime: number, result: StepFreeEgressResult): void {
  if (filedEgressDrill !== drillStartTime) {
    filedEgress.clear();
    filedEgressDrill = drillStartTime;
  }
  const key = `${result.zoneId}:${result.status}`;
  if (filedEgress.has(key)) return;
  filedEgress.add(key);
  const decision = egressAccessDecision(result);
  if (decision) file(decision);
}

// ---------------------------------------------------------------------------
// The quiet room and the loud air-line purge
// ---------------------------------------------------------------------------

/** A loud planned task, at its planned plant hour of the day. */
export interface LoudTask {
  readonly id: string;
  readonly plannedStart: number;
  readonly hours: number;
}

/** The compressed-air line's daily purge: a blow-down heard across the hall. */
export const LOUD_TASKS: readonly LoudTask[] = Object.freeze([
  { id: 'air-line-purge-morning', plannedStart: 10, hours: 0.1 },
  { id: 'air-line-purge-afternoon', plannedStart: 14, hours: 0.1 },
]);

export interface PlannedLoudTask {
  readonly task: LoudTask;
  readonly start: number;
  /** The booking it was moved out of, if any. */
  readonly movedFor?: QuietRoomBooking;
}

/**
 * Plan each loud task out of the quiet room's bookings: a task that would
 * overlap a booking starts when the booking ends. Pure; one plan per day.
 */
export function planLoudTasks(
  tasks: readonly LoudTask[] = LOUD_TASKS,
  bookings: readonly QuietRoomBooking[] = QUIET_ROOM_BOOKINGS
): PlannedLoudTask[] {
  return tasks.map((task) => {
    let start = task.plannedStart;
    let movedFor: QuietRoomBooking | undefined;
    for (let guard = 0; guard < bookings.length; guard++) {
      const clash = bookings.find(
        (booking) => start < booking.end && start + task.hours > booking.start
      );
      if (!clash) break;
      start = clash.end;
      movedFor ??= clash;
    }
    return { task, start, movedFor };
  });
}

/** Plant hours as a clock reading, the same in both languages. */
export function clockReading(hour: number): string {
  const minutes = Math.round((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function loudTaskMovedDecision(plan: PlannedLoudTask): AIDecision | null {
  if (!plan.movedFor) return null;
  return accommodationCard(
    'quiet-room',
    {
      action: {
        key: 'accessQuietAction',
        params: { from: clockReading(plan.task.plannedStart), to: clockReading(plan.start) },
      },
      reasoning: {
        key: 'accessQuietReasoning',
        params: { from: clockReading(plan.movedFor.start), to: clockReading(plan.movedFor.end) },
      },
      impact: { key: 'accessQuietImpact' },
    },
    {
      type: 'coordination',
      priority: 'low',
      triggeredBy: 'schedule',
      affectedSystems: [
        translate(provenance, 'systemCompressedAir'),
        translate(provenance, 'systemQuietRoom'),
      ],
      observations: [
        {
          label: translate(provenance, 'quietBooking'),
          value: `${clockReading(plan.movedFor.start)}-${clockReading(plan.movedFor.end)}`,
        },
        {
          label: translate(provenance, 'purgePlanned'),
          value: clockReading(plan.task.plannedStart),
        },
      ],
    }
  );
}

/** Notice is given this long before a moved task's planned hour, in plant hours. */
export const LOUD_TASK_NOTICE_HOURS = 0.5;

/** Plant days and tasks whose move notice is filed: one card a day each, however often asked. */
const noticedMoves = new Set<string>();
function fileMoveNotice(day: number, plan: PlannedLoudTask): boolean {
  const key = `${day}:${plan.task.id}`;
  if (noticedMoves.has(key)) return false;
  const decision = loudTaskMovedDecision(plan);
  if (!decision) return false;
  noticedMoves.add(key);
  if (noticedMoves.size > 64) noticedMoves.delete(noticedMoves.values().next().value!);
  file(decision);
  return true;
}

/**
 * Advance the quiet-room planner across a step of the plant clock (absolute
 * plant hours, day * 24 + hour). Files the move notice once a day for each
 * moved task, and runs each task at its planned start. Returns what happened,
 * for the tests. A clock jump of more than two hours files and runs nothing.
 */
export function stepQuietRoomPlanner(
  from: number,
  to: number,
  run: (task: LoudTask) => void = runLoudTask
): { noticed: string[]; ran: string[] } {
  const noticed: string[] = [],
    ran: string[] = [];
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 2)
    return { noticed, ran };
  const plans = planLoudTasks();
  for (let day = Math.floor(from / 24); day <= Math.floor(to / 24); day++) {
    for (const plan of plans) {
      const notice = day * 24 + plan.task.plannedStart - LOUD_TASK_NOTICE_HOURS;
      if (plan.movedFor && notice > from && notice <= to && fileMoveNotice(day, plan))
        noticed.push(plan.task.id);
      const start = day * 24 + plan.start;
      if (start > from && start <= to) {
        run(plan.task);
        ran.push(plan.task.id);
      }
    }
  }
  return { noticed, ran };
}

/**
 * The moves already in force at a plant hour: a moved task whose notice time
 * has passed and which has not yet run. The engine files these once when it
 * starts, so a session that opens inside a booking (the plant clock starts at
 * 10:00) still says why the purge is not running.
 */
export function movesInForce(hour: number): PlannedLoudTask[] {
  if (!Number.isFinite(hour)) return [];
  const h = ((hour % 24) + 24) % 24;
  return planLoudTasks().filter(
    (plan) =>
      plan.movedFor !== undefined &&
      h >= plan.task.plannedStart - LOUD_TASK_NOTICE_HOURS &&
      h < plan.start
  );
}

/** The purge itself: the compressed-air blow-down, through the plant's audio. */
function runLoudTask(task: LoudTask): void {
  try {
    audioManager.playAirBrake();
  } catch (error) {
    logger.ai.warn(`Loud task ${task.id} could not play`, error);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let lastCause: AlarmCause | null | undefined;
let lastHour: number | undefined;

/**
 * One pass, from the engine's loop (aiEngine.ts aiLoop, every two seconds,
 * held clock or not): file the alert-delivery card when an alarm starts, and
 * step the quiet-room planner across the plant time since the last pass.
 * An alarm already sounding when the engine starts files nothing.
 */
export function stepAccommodationDecisions(): void {
  try {
    const cause = alarmCause();
    if (lastCause !== undefined && cause && !lastCause) file(alertDeliveryDecision(cause));
    lastCause = cause;
    const game = useGameSimulationStore.getState();
    const hour = game.gameDay * 24 + game.gameTime;
    if (!Number.isFinite(hour)) return;
    if (lastHour === undefined)
      for (const plan of movesInForce(hour)) fileMoveNotice(Math.floor(hour / 24), plan);
    else if (hour !== lastHour) stepQuietRoomPlanner(lastHour, hour);
    lastHour = hour;
  } catch (error) {
    logger.ai.warn('Accommodation pass skipped', error);
  }
}

/** Forget the last pass, when the engine's loop stops. */
export function resetAccommodationDecisions(): void {
  lastCause = undefined;
  lastHour = undefined;
}
