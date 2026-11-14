import { SITE_LAYOUT } from '../constants/siteLayout';
import { PERSONNEL_DOORS } from '../constants/accessibilityLayout';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { audioManager } from '../utils/audioManager';
import { useProductionStore } from './productionStore';
import { useSafetyStore } from './safetyStore';
import { sanitizeGameSimulationState, sanitizeGameSpeed } from './persistenceMigrations';
import { migrateLegacyGameSpeed, STANDARD_GAME_SPEED } from '../simulation/pace';
import { translate } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { gameSimulationStoreMessages } from './gameSimulationStore.messages';
// Both are read only inside actions and the deferred weather lock, never at
// module evaluation, so the import cycles through them stay inert.
import { useUIStore } from './uiStore';
import { useOperationsCampaignStore, type OperationalIncident } from './operationsCampaignStore';

const GAME_SIMULATION_ALERT_CATALOG = 'gameSimulationStore';
registerAlertCatalog(GAME_SIMULATION_ALERT_CATALOG, gameSimulationStoreMessages);
/** The bell's one entry for a line left idle by a cleared stop. */
export const LINE_RESTART_ALERT_ID = 'line-restart-pending';

/**
 * 'order_fulfilled' (a customer's order delivered) and 'shift_complete' (a
 * graded shift) are the results the HUD shows; 'milestone' is an achievement
 * unlock. 'target_met' and 'zero_incident' are no longer raised (the daily bag
 * target was replaced by the programme's commitment, D11) and stay only so a
 * queue saved by an older build still reads.
 */
export type CelebrationType =
  | 'milestone'
  | 'zero_incident'
  | 'target_met'
  | 'shift_complete'
  | 'order_fulfilled';
export type CrisisType = 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SafetyEventKind = 'facility_stop' | 'fire_drill' | 'crisis';
export type SafetyEventStage = 'active' | 'acknowledged' | 'cleared';
export type RunWindow = 'morning' | 'afternoon' | 'night';

export interface CelebrationEvent {
  type: CelebrationType;
  value?: number;
  timestamp: number;
  position?: [number, number, number];
  message?: string;
  /** order_fulfilled: the customer, a proper name shown as it is. */
  customer?: string;
  /** order_fulfilled: whole minutes past its due time; 0 is on time. */
  lateMinutes?: number;
  /** order_fulfilled: kilograms shipped below the recipe's quality minimum. */
  offSpecKg?: number;
  /** shift_complete: the grade, A to F. */
  grade?: string;
  /** shift_complete: the window key ('day-0-morning'), named at read time. */
  shiftKey?: string;
}

export interface CrisisState {
  active: boolean;
  type: CrisisType | null;
  severity: CrisisSeverity;
  startTime: number;
  affectedMachineId?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyEventRecord {
  id: string;
  kind: SafetyEventKind;
  cause: string;
  severity: CrisisSeverity;
  simulated: boolean;
  stage: SafetyEventStage;
  startedAt: number;
  response: string;
  acknowledgedAt?: number;
  acknowledgementNote?: string;
  clearedAt?: number;
  recovery: string;
  /**
   * Catalogue keys behind cause, response and recovery, so the record reads in
   * the current language (safetyEventCopy). Absent on records saved before them.
   */
  copy?: Partial<Record<SafetyEventCopyField, SafetyEventCopyRef>>;
  /** A drill's plant clock at START. Absent on stops and on older drills. */
  drillStartClock?: DrillClock;
  /**
   * A drill's record: one entry per zone in the drill, in egress order, kept
   * after the drill ends. Absent on stops and on drills saved before it.
   */
  drillZones?: DrillZoneRecord[];
}

/** The plant clock: game day and fractional hour, as the logs stamp it. */
export interface DrillClock {
  day: number;
  hour: number;
}

/**
 * How a zone came out: verified on its own step-free route, verified on its
 * agreed alternative, held because both were blocked, or never reached.
 */
export type DrillZoneResult = 'clear' | 'alternative' | 'blocked' | 'unverified';

export interface DrillZoneRecord {
  zoneId: string;
  result: DrillZoneResult;
  /** The level exit whose route verified the zone ('alternative' only). */
  alternative?: string;
  /** Fleet tags of the stopped forklifts on its route (and, blocked, on the alternative's). */
  blockedBy?: string[];
  /** When it was verified, or first found blocked, on the plant clock. */
  clock?: DrillClock;
}

type SafetyEventCopyField = 'cause' | 'response' | 'recovery';
type SafetyEventCopyRef = {
  key: keyof (typeof gameSimulationStoreMessages)['en'];
  params?: Record<string, string>;
};

/** A safety event's text in the current language; stored text for older records. */
export function safetyEventCopy(
  event: Pick<SafetyEventRecord, SafetyEventCopyField | 'copy'>,
  field: SafetyEventCopyField
): string {
  const ref = event.copy?.[field];
  return ref ? translate(gameSimulationStoreMessages, ref.key, ref.params) : event[field];
}

/** Text plus its catalogue key, for a new or updated safety event. */
function eventCopy(
  key: SafetyEventCopyRef['key'],
  params?: Record<string, string>
): { text: string; ref: SafetyEventCopyRef } {
  return { text: translate(gameSimulationStoreMessages, key, params), ref: { key, params } };
}

export interface DrillMetrics {
  active: boolean;
  startTime: number;
  verifiedZoneIds: string[];
  totalZones: number;
  verificationComplete: boolean;
  /** Game seconds from START to the last zone verified, on the plant clock. */
  finalTimeSeconds: number | null;
}

// `label` is a getter so it reads in the active language whenever it is used.
// Front and back are marked outside the level personnel doors beside the docks
// (PERSONNEL_DOORS, 2026-11-07); they were at x 0, in the dock channels.
const personnelDoorMarker = (id: 'front' | 'back') => {
  const [x, z] = PERSONNEL_DOORS.find((door) => door.id === id)!.marker;
  return { x, z };
};
export const SERVICE_EGRESS_POINTS = [
  {
    id: 'front',
    position: personnelDoorMarker('front'),
    get label() {
      return translate(gameSimulationStoreMessages, 'egressFront');
    },
  },
  {
    id: 'back',
    position: personnelDoorMarker('back'),
    get label() {
      return translate(gameSimulationStoreMessages, 'egressBack');
    },
  },
  {
    id: 'west',
    position: {
      x: SITE_LAYOUT.portals.westService.centre[0] - 2,
      z: SITE_LAYOUT.portals.westService.centre[2],
    },
    get label() {
      return translate(gameSimulationStoreMessages, 'egressWest');
    },
  },
  {
    id: 'east',
    position: {
      x: SITE_LAYOUT.portals.eastService.centre[0] + 2,
      z: SITE_LAYOUT.portals.eastService.centre[2],
    },
    get label() {
      return translate(gameSimulationStoreMessages, 'egressEast');
    },
  },
] as const;

/**
 * Who is holding the shift clock at 0. 'player' is an explicit pause choice;
 * every other holder pauses for its own reason and releases only its own hold.
 */
export type ClockHolder =
  | 'player'
  | 'shortcut'
  | 'tour'
  | 'restore'
  | 'restoreFailed'
  | 'workplace'
  | 'handoff'
  | 'layout'
  | 'scada'
  /** The phone is upright and the rotate-device overlay blocks play. */
  | 'orientation';

/**
 * Holds derived from game state rather than from a control: the state that
 * creates them also ends them, so a pace choice cannot. A positive pace made
 * under one becomes the pace it resumes at instead of starting the clock.
 * Working if choosing a pace during a handoff decision leaves the clock held
 * and the plant resumes at that pace once the decision ends.
 */
const DERIVED_HOLDERS: readonly ClockHolder[] = ['handoff'];

/** The player's own pauses: P ('shortcut') and a chosen Paused ('player'). */
const PLAYER_HOLDERS: readonly ClockHolder[] = ['player', 'shortcut'];

/**
 * Holds the pace hold note carries an exit for (D21), as a pace choice no
 * longer lifts them. 'restoreFailed' has no other release; the tick also ends
 * 'scada' itself once control is back with the simulation (UnifiedGameTick
 * releaseScadaHoldWhenLocal).
 */
export type NoticeHolder = Extract<ClockHolder, 'restoreFailed' | 'scada'>;
export const NOTICE_HOLDERS: readonly NoticeHolder[] = ['restoreFailed', 'scada'];

export interface ClockHold {
  readonly holder: ClockHolder;
  /** The pace to return to when this hold is released; 0 stays paused. */
  readonly resumeSpeed: number;
}

export interface GameSimulationStore {
  isTabVisible: boolean;
  setTabVisible: (visible: boolean) => void;

  gameTime: number;
  gameDay: number;
  gameSpeed: number;
  setGameTime: (time: number) => void;
  /**
   * An explicit pace choice: a positive pace clears every hold except a derived
   * one (DERIVED_HOLDERS), whose resume pace it sets instead; 0 is a player pause.
   */
  setGameSpeed: (speed: number) => void;
  /**
   * The player's pace choice (the pace buttons and Shift pace), on P's rule
   * (D21): it ends the player's own pauses, then sets the pace, or, while a
   * feature still holds the clock, leaves that hold in place and returns its
   * holder for the control to name. Under a derived hold the pace waits as its
   * resume pace (null). `releases` names the feature whose own panel hosts
   * this control, so the control is that hold's exit (the cooperative review's
   * owed-recovery resume). Feature code that ends its own hold keeps setGameSpeed.
   */
  choosePace: (speed: number, releases?: Exclude<ClockHolder, 'player'>) => ClockHolder | null;
  /**
   * The exit for a hold nothing else releases (NOTICE_HOLDERS): releases it,
   * and for a failed restore the restore hold it was stacked on.
   */
  releaseNoticeHold: (holder: NoticeHolder) => void;
  /** Holds stacked over the clock, oldest first. Never persisted. */
  clockHolds: ClockHold[];
  /** Pause the clock for `holder`, remembering the pace to return to. */
  holdClock: (holder: Exclude<ClockHolder, 'player'>) => void;
  /**
   * Release `holder`'s hold. Only the newest hold resumes the clock; releasing
   * an older one passes its resume pace up. An acquisition restricts release to
   * that exact live entry. Working if same-holder reentry keeps its newer hold.
   * Returns false if it held nothing matching.
   */
  releaseClock: (holder: ClockHolder, acquisition?: ClockHold) => boolean;
  /**
   * An explicit "run" from a holder's own control: release its hold and, if the
   * clock is still stopped underneath, start it at standard pace.
   */
  resumeClockFrom: (holder: Exclude<ClockHolder, 'player'>) => void;
  /**
   * Capture mode: the time of day (and so the sun, sky and lighting) stands
   * still while the simulation keeps its pace. Set by the benchmark route; a
   * page flag, never persisted.
   */
  timeOfDayHeld: boolean;
  setTimeOfDayHeld: (held: boolean) => void;
  tickGameTime: (deltaSeconds: number) => void;
  resetGameState: () => void;
  clearPersistedState: () => void;

  weather: 'clear' | 'cloudy' | 'rain' | 'storm';
  setWeather: (weather: GameSimulationStore['weather']) => void;

  currentShift: RunWindow;
  shiftStartTime: number;
  shiftChangeActive: boolean;
  setShift: (shift: RunWindow) => void;

  emergencyActive: boolean;
  /** The active stop applied the forklift hold (not the player before it). */
  stopHeldForklifts: boolean;
  emergencyMachineId: string | null;
  emergencyDrillMode: boolean;
  preEmergencyMachineStatuses: Map<string, string>;
  safetyEvents: SafetyEventRecord[];
  activeSafetyEventId: string | null;
  triggerEmergency: (machineId: string) => void;
  /**
   * Clear a facility stop: release the interlock and the forklifts it held.
   * The machines stay idle (D13); `preEmergencyMachineStatuses` keeps what
   * they were until `restartLine`.
   */
  resolveEmergency: () => void;
  /**
   * The deliberate restart after a cleared stop or an ended drill: returns
   * every unit the stop idled to its recorded status. Nothing while a stop,
   * drill or crisis holds.
   */
  restartLine: () => void;
  /** Record one zone's check on the running drill's safety event (one entry per zone). */
  recordDrillZoneCheck: (entry: DrillZoneRecord) => void;
  /**
   * While a stop holds, record the status a unit returns to on its release
   * (a unit serviced or cleared during the stop). No effect when no stop holds.
   */
  setReleaseStatus: (machineId: string, status: 'running' | 'warning' | 'idle') => void;
  startEmergencyDrill: (totalZones?: number) => void;
  endEmergencyDrill: () => void;
  acknowledgeSafetyEvent: (eventId: string, note?: string) => void;
  drillMetrics: DrillMetrics;
  /** Mark a zone verified; `record` is its entry in the drill's record. */
  markZoneVerified: (zoneId: string, record?: DrillZoneRecord) => void;

  crisisState: CrisisState;
  triggerCrisis: (
    type: CrisisType,
    severity: CrisisSeverity,
    metadata?: Record<string, unknown>
  ) => void;
  resolveCrisis: () => void;

  celebrations: {
    lastMilestone: number;
    milestoneQueue: CelebrationEvent[];
    zeroIncidentStreak: number;
    celebrationActive: boolean;
    packerBellEnabled: boolean;
  };
  triggerCelebration: (type: CelebrationType, data?: Partial<CelebrationEvent>) => void;
  clearCelebration: () => void;
  /** Drop every queued celebration: what was queued before the HUD could show it is not news. */
  discardCelebrations: () => void;
  updateZeroIncidentStreak: (days: number) => void;
  setPackerBellEnabled: (enabled: boolean) => void;
}

const MAX_SAFETY_EVENTS = 50;
const MAX_DIRECT_TICK_DELTA_SECONDS = 1;
const MAX_PERSISTED_CELEBRATION_SCAN = 50;

export const getShiftForHour = (hour: number): RunWindow => {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized >= 6 && normalized < 14) return 'morning';
  if (normalized >= 14 && normalized < 22) return 'afternoon';
  return 'night';
};

/** When each shift window closes and its report is written (24-hour clock). */
export const SHIFT_CLOSING_TIME: Record<RunWindow, string> = {
  morning: '14:00',
  afternoon: '22:00',
  night: '06:00',
};

/**
 * The key of the shift window the clock is in. Night runs 22:00 to 06:00 across
 * midnight, so its hours after midnight belong to the day on which it started;
 * keying by the current day split every night into a 2 h and a 6 h report.
 * Working if 22:00 to 06:00 closes exactly one Night report.
 */
export function getShiftWindowKey(gameDay: number, gameTime: number, shift: RunWindow): string {
  const day = shift === 'night' && gameTime < 6 ? Math.max(0, gameDay - 1) : gameDay;
  return `day-${day}-${shift}`;
}

const defaultCrisis = (): CrisisState => ({
  active: false,
  type: null,
  severity: 'medium',
  startTime: 0,
  metadata: {},
});

const defaultDrill = (): DrillMetrics => ({
  active: false,
  startTime: 0,
  verifiedZoneIds: [],
  totalZones: 0,
  verificationComplete: false,
  finalTimeSeconds: null,
});

const defaultCelebrations = (): GameSimulationStore['celebrations'] => ({
  lastMilestone: 0,
  milestoneQueue: [],
  zeroIncidentStreak: 0,
  celebrationActive: false,
  packerBellEnabled: true,
});

const CELEBRATION_TYPES = new Set<CelebrationType>([
  'milestone',
  'zero_incident',
  'target_met',
  'shift_complete',
  'order_fulfilled',
]);

/**
 * A celebration as the queue keeps it. The physical-session restore writes the
 * saved game domain without this, so a reader validates each entry with it too.
 * Results keep their facts, not their words, so they read in the language
 * active when shown.
 */
export const sanitizeCelebrationEvent = (value: unknown): CelebrationEvent | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<CelebrationEvent>;
  if (!source.type || !CELEBRATION_TYPES.has(source.type) || !Number.isFinite(source.timestamp)) {
    return null;
  }
  const event: CelebrationEvent = { type: source.type, timestamp: source.timestamp as number };
  if (typeof source.value === 'number' && Number.isFinite(source.value)) event.value = source.value;
  if (typeof source.message === 'string') event.message = source.message.slice(0, 500);
  if (typeof source.customer === 'string' && source.customer.trim())
    event.customer = source.customer.slice(0, 120);
  if (typeof source.lateMinutes === 'number' && Number.isFinite(source.lateMinutes))
    event.lateMinutes = Math.max(0, Math.ceil(source.lateMinutes));
  if (typeof source.offSpecKg === 'number' && Number.isFinite(source.offSpecKg))
    event.offSpecKg = Math.max(0, Math.round(source.offSpecKg));
  if (typeof source.grade === 'string' && /^[A-F]$/.test(source.grade)) event.grade = source.grade;
  if (typeof source.shiftKey === 'string') event.shiftKey = source.shiftKey.slice(0, 40);
  if (
    Array.isArray(source.position) &&
    source.position.length === 3 &&
    source.position.every((coordinate) => Number.isFinite(coordinate))
  ) {
    event.position = [...source.position] as [number, number, number];
  }
  return event;
};

const sanitizeCelebrations = (value: unknown): GameSimulationStore['celebrations'] => {
  const defaults = defaultCelebrations();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const source = value as Partial<GameSimulationStore['celebrations']>;
  const milestoneQueue: CelebrationEvent[] = [];
  if (Array.isArray(source.milestoneQueue)) {
    const lowerBound = Math.max(0, source.milestoneQueue.length - MAX_PERSISTED_CELEBRATION_SCAN);
    for (
      let index = source.milestoneQueue.length - 1;
      index >= lowerBound && milestoneQueue.length < 5;
      index -= 1
    ) {
      const event = sanitizeCelebrationEvent(source.milestoneQueue[index]);
      if (event) milestoneQueue.push(event);
    }
    milestoneQueue.reverse();
  }
  return {
    lastMilestone:
      typeof source.lastMilestone === 'number' && Number.isFinite(source.lastMilestone)
        ? Math.min(100, Math.max(0, source.lastMilestone))
        : defaults.lastMilestone,
    milestoneQueue,
    zeroIncidentStreak:
      typeof source.zeroIncidentStreak === 'number' && Number.isFinite(source.zeroIncidentStreak)
        ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(source.zeroIncidentStreak)))
        : defaults.zeroIncidentStreak,
    celebrationActive: milestoneQueue.length > 0,
    packerBellEnabled:
      typeof source.packerBellEnabled === 'boolean'
        ? source.packerBellEnabled
        : defaults.packerBellEnabled,
  };
};

const restartable = (status: string | undefined): boolean =>
  status === 'running' || status === 'warning';

/**
 * Idle every running unit and record what each was. `pending` is the record of
 * an earlier stop still awaiting its restart: a unit it idled is recorded as
 * what it was before that stop, not as the idle the stop left, so a second
 * stop (or a drill) before the restart cannot lose the line.
 */
const stopProduction = (pending: ReadonlyMap<string, string>): Map<string, string> => {
  const production = useProductionStore.getState();
  const statuses = new Map<string, string>();
  production.machines.forEach((machine) => {
    const earlier = pending.get(machine.id);
    statuses.set(
      machine.id,
      machine.status === 'idle' && restartable(earlier) ? (earlier as string) : machine.status
    );
    if (machine.status === 'running' || machine.status === 'warning') {
      production.updateMachineStatus(machine.id, 'idle');
    }
  });
  return statuses;
};

/**
 * Releasing a stop never restarts the machinery (D13). The Machinery Directive,
 * 2006/42/EC Annex I 1.2.4.3 (Emergency stop), as published on EUR-Lex
 * (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32006L0042),
 * read 2026-11-13: "it must be possible to disengage the device only by an
 * appropriate operation, and disengaging the device must not restart the
 * machinery but only permit restarting." So CLEAR and the drill's end release
 * the interlock and leave the units idle; restartLine is the separate,
 * deliberate restart.
 */
export const selectRestartPending = (
  state: Pick<GameSimulationStore, 'emergencyActive' | 'preEmergencyMachineStatuses'>
): boolean => {
  if (state.emergencyActive) return false;
  for (const status of state.preEmergencyMachineStatuses.values())
    if (restartable(status)) return true;
  return false;
};

const raiseRestartAlert = (): void => {
  const title = translate(gameSimulationStoreMessages, 'lineRestartTitle');
  const message = translate(gameSimulationStoreMessages, 'lineRestartMessage');
  useUIStore.getState().addAlert({
    id: LINE_RESTART_ALERT_ID,
    type: 'warning',
    title,
    message,
    timestamp: new Date(),
    acknowledged: false,
    announce: 'polite',
    copy: {
      catalog: GAME_SIMULATION_ALERT_CATALOG,
      title: 'lineRestartTitle',
      message: 'lineRestartMessage',
    },
  });
};
const retireRestartAlert = (): void => {
  const ui = useUIStore.getState();
  if (ui.alerts?.some((alert) => alert.id === LINE_RESTART_ALERT_ID))
    ui.dismissAlert(LINE_RESTART_ALERT_ID);
};

const drillClockOf = (state: Pick<GameSimulationStore, 'gameDay' | 'gameTime'>): DrillClock => ({
  day: Number.isFinite(state.gameDay) ? state.gameDay : 0,
  hour: Number.isFinite(state.gameTime) ? state.gameTime : 0,
});
const clockSeconds = (clock: DrillClock): number => (clock.day * 24 + clock.hour) * 3600;

/** A drill record entry, or the same entry when nothing in it changed. */
const sameZoneRecord = (a: DrillZoneRecord, b: DrillZoneRecord): boolean =>
  a.result === b.result &&
  a.alternative === b.alternative &&
  (a.blockedBy ?? []).join('|') === (b.blockedBy ?? []).join('|');

/** The drill event with `entry` upserted, keeping egress order. */
const withZoneRecord = (
  event: SafetyEventRecord,
  entry: DrillZoneRecord
): SafetyEventRecord | null => {
  const zones = event.drillZones ?? [];
  const index = zones.findIndex((zone) => zone.zoneId === entry.zoneId);
  if (index >= 0 && sameZoneRecord(zones[index], entry)) return null;
  const next =
    index >= 0 ? zones.map((zone, i) => (i === index ? entry : zone)) : [...zones, entry];
  const order = (id: string) => SERVICE_EGRESS_POINTS.findIndex((point) => point.id === id);
  next.sort((a, b) => order(a.zoneId) - order(b.zoneId));
  return { ...event, drillZones: next };
};

const SEVERE_RAIN: OperationalIncident['kind'] = 'severe_rain';
const severeRainOpen = (incidents: readonly OperationalIncident[] | undefined): boolean =>
  Array.isArray(incidents) &&
  incidents.some((incident) => incident.kind === SEVERE_RAIN && incident.phase !== 'resolved');
/** The campaign's incidents now; none where a test mocks the campaign store away. */
const openCampaignIncidents = (): readonly OperationalIncident[] | undefined => {
  try {
    return useOperationsCampaignStore.getState()?.incidents;
  } catch {
    return undefined;
  }
};

const restoreProduction = (statuses: Map<string, string>): void => {
  const production = useProductionStore.getState();
  statuses.forEach((status, machineId) => {
    const machine = production.machines.find((candidate) => candidate.id === machineId);
    if (machine?.status !== 'idle') return;
    production.updateMachineStatus(
      machineId,
      status as 'running' | 'idle' | 'warning' | 'critical'
    );
  });
};

// A drill, crisis or facility stop holds the forklifts; it releases only a hold
// it applied, so a X-key stop the player set before survives the release.
// Store state, so the physical session carries it with the stop across a
// reload; localStorage never does (merge clears it with the stop).
const holdForkliftsForStop = (): void => {
  const safety = useSafetyStore.getState();
  useGameSimulationStore.setState({ stopHeldForklifts: !safety.forkliftEmergencyStop });
  safety.setForkliftEmergencyStop(true);
};
const releaseForkliftsAfterStop = (): void => {
  // A monitored crisis never held them; a hold set before the stop is the player's.
  if (useGameSimulationStore.getState().stopHeldForklifts)
    useSafetyStore.getState().setForkliftEmergencyStop(false);
  useGameSimulationStore.setState({ stopHeldForklifts: false });
};
// The player's own forklift stop outlives the release, and so does its alarm.
const silenceAlarmUnlessForkliftStop = (): void => {
  if (!useSafetyStore.getState().forkliftEmergencyStop) audioManager.stopEmergencyStopAlarm();
};

const eventId = (kind: SafetyEventKind): string =>
  `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * The pace to persist: the pace running underneath any pause or hold, never 0.
 * Nell, 2026-11-07 (D-049): the sim starts with the clock ticking, so a pause
 * (P, the pace menu or a session hold) lasts for its page and a reload resumes
 * at the pace that was running before it.
 */
export function persistedGameSpeed(state: Pick<GameSimulationStore, 'gameSpeed' | 'clockHolds'>) {
  return selectPaceUnderPause(state) || STANDARD_GAME_SPEED;
}

/** Who holds the clock at 0, or null while it runs. Unrecorded holds read as the player's. */
export function selectClockHolder(
  state: Pick<GameSimulationStore, 'gameSpeed' | 'clockHolds'>
): ClockHolder | null {
  return state.gameSpeed > 0 ? null : (state.clockHolds.at(-1)?.holder ?? 'player');
}

/**
 * The pace a pace control shows as chosen. Under a derived hold a chosen pace
 * waits as the resume pace, so it is shown rather than 'Paused'.
 * Working if every pace control agrees and a choice never appears to snap back.
 */
export function selectChosenPace(
  state: Pick<GameSimulationStore, 'gameSpeed' | 'clockHolds'>
): number {
  const top = state.gameSpeed > 0 ? undefined : state.clockHolds.at(-1);
  return top && DERIVED_HOLDERS.includes(top.holder) ? top.resumeSpeed : state.gameSpeed;
}

/**
 * The pace running underneath any pause: the live pace, or the pace the newest
 * hold returns to. A pace choice is a decision only when it differs from this,
 * so resuming at the same pace reads alike from Resume, P and the pace buttons.
 */
export function selectPaceUnderPause(
  state: Pick<GameSimulationStore, 'gameSpeed' | 'clockHolds'>
): number {
  if (state.gameSpeed > 0) return state.gameSpeed;
  // A hold stacked over another pause returns to 0; the pace is further down.
  for (let i = state.clockHolds.length - 1; i >= 0; i--)
    if (state.clockHolds[i].resumeSpeed > 0) return state.clockHolds[i].resumeSpeed;
  return 0;
}

export const selectSafetyHoldActive = (
  state: Pick<GameSimulationStore, 'emergencyActive' | 'emergencyDrillMode'>
): boolean => state.emergencyActive || state.emergencyDrillMode;

export const useGameSimulationStore = create<GameSimulationStore>()(
  persist(
    (set, get) => ({
      isTabVisible: true,
      setTabVisible: (visible) => set({ isTabVisible: visible }),

      gameTime: 10,
      gameDay: 0,
      gameSpeed: STANDARD_GAME_SPEED,
      setGameTime: (time) => {
        if (!Number.isFinite(time)) return;
        const gameTime = ((time % 24) + 24) % 24;
        const currentShift = getShiftForHour(gameTime);
        set((state) => ({
          gameTime,
          currentShift,
          shiftStartTime: state.currentShift === currentShift ? state.shiftStartTime : Date.now(),
        }));
      },
      setGameSpeed: (speed) => {
        const gameSpeed = sanitizeGameSpeed(speed);
        const { gameSpeed: current, clockHolds } = get();
        if (gameSpeed > 0) {
          const derived =
            current === 0 ? clockHolds.filter((hold) => DERIVED_HOLDERS.includes(hold.holder)) : [];
          set(
            derived.length
              ? { clockHolds: [{ ...derived[0], resumeSpeed: gameSpeed }, ...derived.slice(1)] }
              : { gameSpeed, clockHolds: [] }
          );
          return;
        }
        if (current === 0 && clockHolds.at(-1)?.holder === 'player') return;
        set({
          gameSpeed: 0,
          clockHolds: [
            ...(current > 0 ? [] : clockHolds),
            { holder: 'player', resumeSpeed: current > 0 ? current : 0 },
          ],
        });
      },
      choosePace: (speed, releases) => {
        const gameSpeed = sanitizeGameSpeed(speed);
        if (releases && gameSpeed > 0)
          while (get().releaseClock(releases)) {
            /* every acquisition by the hosting feature */
          }
        const { gameSpeed: current, clockHolds } = get();
        const foreign = clockHolds.filter((hold) => !PLAYER_HOLDERS.includes(hold.holder));
        // A pause, a running clock (any recorded hold is stale) or only the
        // player's own holds: the choice is the player's to make.
        if (gameSpeed === 0 || current > 0 || foreign.length === 0) {
          get().setGameSpeed(gameSpeed);
          return null;
        }
        if (foreign.every((hold) => DERIVED_HOLDERS.includes(hold.holder))) {
          get().setGameSpeed(gameSpeed);
          return null;
        }
        // Refused: the player's own pauses go, newest first, as P releases
        // them; the feature's hold stays, with the pace it returns to.
        for (let i = clockHolds.length - 1; i >= 0; i--)
          if (PLAYER_HOLDERS.includes(clockHolds[i].holder))
            get().releaseClock(clockHolds[i].holder, clockHolds[i]);
        return selectClockHolder(get());
      },
      releaseNoticeHold: (holder) => {
        const release = (name: ClockHolder) => {
          while (get().releaseClock(name)) {
            /* every acquisition by this holder */
          }
        };
        release(holder);
        // A failed restore stacks on the restore hold finishRestore never
        // reached; leaving the failure leaves both.
        if (holder === 'restoreFailed') release('restore');
      },
      clockHolds: [],
      timeOfDayHeld: false,
      setTimeOfDayHeld: (held) => set({ timeOfDayHeld: held }),
      holdClock: (holder) => {
        const { gameSpeed: current, clockHolds } = get();
        if (current === 0 && clockHolds.at(-1)?.holder === holder) return;
        // A positive pace means any recorded hold is stale (a direct setState).
        const holds = current > 0 ? [] : clockHolds;
        set({ gameSpeed: 0, clockHolds: [...holds, { holder, resumeSpeed: current }] });
      },
      releaseClock: (holder, acquisition) => {
        const { gameSpeed: current, clockHolds } = get();
        let index = -1;
        for (let i = clockHolds.length - 1; i >= 0; i--)
          if (
            clockHolds[i].holder === holder &&
            (acquisition === undefined || clockHolds[i] === acquisition)
          ) {
            index = i;
            break;
          }
        if (index < 0) return false;
        const released = clockHolds[index];
        if (index < clockHolds.length - 1) {
          const holds = clockHolds.slice();
          holds[index + 1] = { ...holds[index + 1], resumeSpeed: released.resumeSpeed };
          holds.splice(index, 1);
          set({ clockHolds: holds });
          return true;
        }
        const holds = clockHolds.slice(0, -1);
        set(
          current === 0
            ? { gameSpeed: sanitizeGameSpeed(released.resumeSpeed), clockHolds: holds }
            : { clockHolds: holds }
        );
        return true;
      },
      resumeClockFrom: (holder) => {
        get().releaseClock(holder);
        if (get().gameSpeed === 0) get().setGameSpeed(STANDARD_GAME_SPEED);
      },
      tickGameTime: (deltaSeconds) =>
        set((state) => {
          if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return {};
          if (state.timeOfDayHeld) return {};
          const gameSpeed = sanitizeGameSpeed(state.gameSpeed);
          if (gameSpeed === 0) return {};
          const safeDeltaSeconds = Math.min(deltaSeconds, MAX_DIRECT_TICK_DELTA_SECONDS);
          const elapsedHours = (safeDeltaSeconds * gameSpeed) / 3600;
          const currentGameTime = Number.isFinite(state.gameTime)
            ? ((state.gameTime % 24) + 24) % 24
            : 0;
          const currentGameDay = Number.isFinite(state.gameDay)
            ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(state.gameDay)))
            : 0;
          const unwrapped = currentGameTime + elapsedHours;
          const gameTime = ((unwrapped % 24) + 24) % 24;
          const dayIncrement = Math.max(0, Math.floor(unwrapped / 24));
          const currentShift = getShiftForHour(gameTime);
          return {
            gameTime,
            gameDay: Math.min(Number.MAX_SAFE_INTEGER, currentGameDay + dayIncrement),
            currentShift,
            shiftStartTime: state.currentShift === currentShift ? state.shiftStartTime : Date.now(),
          };
        }),
      resetGameState: () => {
        // A drill, crisis or facility stop idled the line and held the
        // forklifts; end it through its own teardown first, or the reset clears
        // the record of the stop and leaves the plant stopped with nothing to end.
        // Working if a reset during any stop restores the machines it stopped.
        get().endEmergencyDrill();
        get().resolveCrisis();
        if (get().emergencyActive) get().resolveEmergency();
        // A reset is the operator's own restart: the line the stop idled
        // comes back, as it did before releases stopped restarting it (D13).
        get().restartLine();
        set({
          gameTime: 10,
          gameDay: 0,
          gameSpeed: STANDARD_GAME_SPEED,
          clockHolds: [],
          currentShift: 'morning',
          shiftStartTime: Date.now(),
          shiftChangeActive: false,
          // The campaign keeps its incidents through a clock reset (6.8).
          weather: severeRainOpen(openCampaignIncidents()) ? 'storm' : 'clear',
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          preEmergencyMachineStatuses: new Map(),
          safetyEvents: [],
          activeSafetyEventId: null,
          drillMetrics: defaultDrill(),
          crisisState: defaultCrisis(),
          celebrations: defaultCelebrations(),
        });
      },
      // 'Reset to 10 AM'. Customer orders keep their own campaign clock, as the
      // confirm copy says. Working if the clock returns to 10:00 at the pace the
      // operator chose: a paused (or save-halted) shift stays paused.
      clearPersistedState: () => {
        const { gameSpeed, clockHolds } = get();
        // Through the guarded storage: a blocked localStorage throws on access.
        safeJSONStorage.removeItem('millos-autonomous-simulation');
        get().resetGameState();
        set({ gameSpeed, clockHolds });
      },

      weather: 'clear',
      // 6.8: the sky cannot contradict an open severe-rain incident. While one
      // is open the weather is a storm and no other value is taken; the lock
      // below lifts the storm when the last one closes.
      setWeather: (weather) => {
        if (weather !== 'storm' && severeRainOpen(openCampaignIncidents())) return;
        set({ weather });
      },

      currentShift: 'morning',
      shiftStartTime: Date.now(),
      shiftChangeActive: false,
      setShift: (currentShift) =>
        set((state) => ({
          currentShift,
          shiftStartTime: currentShift === state.currentShift ? state.shiftStartTime : Date.now(),
          shiftChangeActive: false,
        })),

      emergencyActive: false,
      stopHeldForklifts: false,
      emergencyMachineId: null,
      emergencyDrillMode: false,
      preEmergencyMachineStatuses: new Map(),
      safetyEvents: [],
      activeSafetyEventId: null,
      triggerEmergency: (machineId) => {
        const state = get();
        if (state.emergencyActive || state.crisisState.active) return;
        const id = eventId('facility_stop');
        const cause =
          machineId === 'E-STOP'
            ? eventCopy('facilityStopCause')
            : eventCopy('interlockCause', { machineId });
        const response = eventCopy('facilityStopResponse');
        const recovery = eventCopy('facilityStopRecovery');
        const event: SafetyEventRecord = {
          id,
          kind: 'facility_stop',
          cause: cause.text,
          severity: 'critical',
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: response.text,
          recovery: recovery.text,
          copy: { cause: cause.ref, response: response.ref, recovery: recovery.ref },
        };
        // A line awaiting restart is stopped again: the bell's "cleared" is
        // no longer true. The clear raises it again.
        retireRestartAlert();
        set({
          emergencyActive: true,
          emergencyMachineId: machineId,
          preEmergencyMachineStatuses: stopProduction(state.preEmergencyMachineStatuses),
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        holdForkliftsForStop();
      },
      resolveEmergency: () => {
        const state = get();
        // A drill is torn down only by endEmergencyDrill; resolving here would
        // release the forklifts while drill mode and metrics stay active.
        if (state.crisisState.active || state.emergencyDrillMode) return;
        // The machines stay idle and keep their record for restartLine (D13).
        set({
          emergencyActive: false,
          emergencyMachineId: null,
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === state.activeSafetyEventId
              ? {
                  ...event,
                  stage: 'cleared' as const,
                  clearedAt: Date.now(),
                  recovery: translate(gameSimulationStoreMessages, 'facilityStopCleared'),
                  copy: { ...event.copy, recovery: { key: 'facilityStopCleared' as const } },
                }
              : event
          ),
        });
        releaseForkliftsAfterStop();
        silenceAlarmUnlessForkliftStop();
        if (selectRestartPending(get())) raiseRestartAlert();
      },
      restartLine: () => {
        const state = get();
        // An interlocked crisis holds emergencyActive; a monitored one stops
        // nothing, so the line may restart under it.
        if (state.emergencyActive || state.emergencyDrillMode) return;
        restoreProduction(state.preEmergencyMachineStatuses);
        if (state.preEmergencyMachineStatuses.size > 0)
          set({ preEmergencyMachineStatuses: new Map() });
        retireRestartAlert();
      },
      recordDrillZoneCheck: (entry) =>
        set((state) => {
          if (!state.emergencyDrillMode || !state.activeSafetyEventId) return {};
          let changed = false;
          const safetyEvents = state.safetyEvents.map((event) => {
            if (event.id !== state.activeSafetyEventId || event.kind !== 'fire_drill') return event;
            const next = withZoneRecord(event, entry);
            if (!next) return event;
            changed = true;
            return next;
          });
          return changed ? { safetyEvents } : {};
        }),
      setReleaseStatus: (machineId, status) =>
        set((state) =>
          state.emergencyActive
            ? {
                preEmergencyMachineStatuses: new Map(state.preEmergencyMachineStatuses).set(
                  machineId,
                  status
                ),
              }
            : {}
        ),
      startEmergencyDrill: (totalZones = SERVICE_EGRESS_POINTS.length) => {
        const state = get();
        if (state.emergencyActive || state.crisisState.active) return;
        // The sequencer can only verify the egress points that exist, so a larger
        // count could never complete and a zero count would complete unverified.
        const zones = Math.min(
          Math.max(
            1,
            Number.isFinite(totalZones) ? Math.floor(totalZones) : SERVICE_EGRESS_POINTS.length
          ),
          SERVICE_EGRESS_POINTS.length
        );
        const id = eventId('fire_drill');
        const cause = eventCopy('drillCause');
        const response = eventCopy('drillResponse');
        const recovery = eventCopy('drillRecovery');
        const event: SafetyEventRecord = {
          id,
          kind: 'fire_drill',
          cause: cause.text,
          severity: 'medium',
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: response.text,
          recovery: recovery.text,
          copy: { cause: cause.ref, response: response.ref, recovery: recovery.ref },
          drillStartClock: drillClockOf(state),
          drillZones: [],
        };
        retireRestartAlert();
        set({
          emergencyActive: true,
          emergencyMachineId: 'DRILL',
          emergencyDrillMode: true,
          preEmergencyMachineStatuses: stopProduction(state.preEmergencyMachineStatuses),
          drillMetrics: {
            active: true,
            startTime: Date.now(),
            verifiedZoneIds: [],
            totalZones: zones,
            verificationComplete: false,
            finalTimeSeconds: null,
          },
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        holdForkliftsForStop();
      },
      endEmergencyDrill: () => {
        const state = get();
        if (!state.emergencyDrillMode) return;
        // The line stays idle for restartLine (D13). The record names every
        // zone in the drill: one never reached when it ended is 'unverified'.
        // A zone verified without an entry (a drill restored from an older
        // save) is left out rather than called unverified.
        const drillZoneIds = SERVICE_EGRESS_POINTS.slice(0, state.drillMetrics.totalZones)
          .map((point) => point.id as string)
          .filter((id) => !state.drillMetrics.verifiedZoneIds.includes(id));
        set({
          emergencyActive: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          drillMetrics: defaultDrill(),
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) => {
            if (event.id !== state.activeSafetyEventId) return event;
            let closed: SafetyEventRecord = event;
            if (event.kind === 'fire_drill')
              for (const zoneId of drillZoneIds)
                if (!closed.drillZones?.some((zone) => zone.zoneId === zoneId))
                  closed = withZoneRecord(closed, { zoneId, result: 'unverified' }) ?? closed;
            return {
              ...closed,
              stage: 'cleared' as const,
              clearedAt: Date.now(),
              recovery: translate(gameSimulationStoreMessages, 'drillCleared'),
              copy: { ...event.copy, recovery: { key: 'drillCleared' as const } },
            };
          }),
        });
        releaseForkliftsAfterStop();
        silenceAlarmUnlessForkliftStop();
        if (selectRestartPending(get())) raiseRestartAlert();
      },
      acknowledgeSafetyEvent: (id, note) =>
        set((state) => ({
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === id && event.stage === 'active'
              ? {
                  ...event,
                  stage: 'acknowledged' as const,
                  acknowledgedAt: Date.now(),
                  acknowledgementNote: note,
                }
              : event
          ),
        })),
      drillMetrics: defaultDrill(),
      markZoneVerified: (zoneId, record) => {
        if (record && get().drillMetrics.active) get().recordDrillZoneCheck(record);
        set((state) => {
          if (!state.drillMetrics.active || state.drillMetrics.verifiedZoneIds.includes(zoneId)) {
            return {};
          }
          const verifiedZoneIds = [...state.drillMetrics.verifiedZoneIds, zoneId];
          const verificationComplete = verifiedZoneIds.length >= state.drillMetrics.totalZones;
          // On the plant clock the drill runs on, not wall time.
          const started = state.safetyEvents.find(
            (event) => event.id === state.activeSafetyEventId
          )?.drillStartClock;
          return {
            drillMetrics: {
              ...state.drillMetrics,
              verifiedZoneIds,
              verificationComplete,
              finalTimeSeconds:
                verificationComplete && started
                  ? Math.max(0, clockSeconds(drillClockOf(state)) - clockSeconds(started))
                  : null,
            },
          };
        });
      },

      crisisState: defaultCrisis(),
      triggerCrisis: (type, severity, metadata = {}) => {
        const state = get();
        if (state.crisisState.active || state.emergencyActive) return;
        const id = eventId('crisis');
        const machineId = typeof metadata.machineId === 'string' ? metadata.machineId : undefined;
        const interlocked = severity === 'high' || severity === 'critical';
        const cause = eventCopy('crisisCause', { type });
        const response = eventCopy(
          interlocked ? 'crisisInterlockedResponse' : 'crisisMonitoredResponse'
        );
        const recovery = eventCopy('crisisRecovery');
        const event: SafetyEventRecord = {
          id,
          kind: 'crisis',
          cause: cause.text,
          severity,
          simulated: true,
          stage: 'active',
          startedAt: Date.now(),
          response: response.text,
          recovery: recovery.text,
          copy: { cause: cause.ref, response: response.ref, recovery: recovery.ref },
        };
        if (interlocked) retireRestartAlert();
        set({
          crisisState: {
            active: true,
            type,
            severity,
            startTime: Date.now(),
            affectedMachineId: machineId,
            metadata,
          },
          emergencyActive: interlocked,
          emergencyMachineId: interlocked ? (machineId ?? `CRISIS-${type}`) : null,
          // A monitored crisis stops nothing; a line awaiting its restart keeps its record.
          preEmergencyMachineStatuses: interlocked
            ? stopProduction(state.preEmergencyMachineStatuses)
            : state.preEmergencyMachineStatuses,
          safetyEvents: [...state.safetyEvents, event].slice(-MAX_SAFETY_EVENTS),
          activeSafetyEventId: id,
        });
        if (interlocked) {
          holdForkliftsForStop();
          // A crisis that stops the plant is an incident; a drill is a planned
          // exercise and stays out of the log.
          useSafetyStore
            .getState()
            .addSafetyIncident({ type: 'emergency', description: cause.text, crisisType: type });
        }
      },
      resolveCrisis: () => {
        const state = get();
        if (!state.crisisState.active) return;
        // A crisis's own interlock still restores the line on its resolution
        // (the Chronicle's duct fire hands the plant back this way). A
        // monitored crisis stopped nothing, so a line idle from an earlier
        // cleared stop keeps waiting for its deliberate restart.
        const interlocked = state.emergencyActive;
        if (interlocked) {
          restoreProduction(state.preEmergencyMachineStatuses);
          retireRestartAlert();
        }
        set({
          crisisState: defaultCrisis(),
          emergencyActive: false,
          emergencyMachineId: null,
          preEmergencyMachineStatuses: interlocked ? new Map() : state.preEmergencyMachineStatuses,
          activeSafetyEventId: null,
          safetyEvents: state.safetyEvents.map((event) =>
            event.id === state.activeSafetyEventId
              ? {
                  ...event,
                  stage: 'cleared' as const,
                  clearedAt: Date.now(),
                  recovery: translate(gameSimulationStoreMessages, 'crisisCleared'),
                  copy: { ...event.copy, recovery: { key: 'crisisCleared' as const } },
                }
              : event
          ),
        });
        releaseForkliftsAfterStop();
        silenceAlarmUnlessForkliftStop();
      },

      celebrations: defaultCelebrations(),
      triggerCelebration: (type, data = {}) =>
        set((state) => {
          const event = sanitizeCelebrationEvent({ ...data, type, timestamp: Date.now() });
          if (!event) return {};
          return {
            celebrations: {
              ...state.celebrations,
              lastMilestone:
                type === 'milestone' && typeof event.value === 'number'
                  ? Math.min(100, Math.max(0, event.value))
                  : state.celebrations.lastMilestone,
              milestoneQueue: [
                ...(Array.isArray(state.celebrations.milestoneQueue)
                  ? state.celebrations.milestoneQueue
                  : []),
                event,
              ].slice(-5),
              celebrationActive: true,
            },
          };
        }),
      clearCelebration: () =>
        set((state) => ({
          celebrations: {
            ...state.celebrations,
            milestoneQueue: state.celebrations.milestoneQueue.slice(1),
            celebrationActive: state.celebrations.milestoneQueue.length > 1,
          },
        })),
      discardCelebrations: () =>
        set((state) =>
          state.celebrations.milestoneQueue?.length
            ? {
                celebrations: {
                  ...state.celebrations,
                  milestoneQueue: [],
                  celebrationActive: false,
                },
              }
            : {}
        ),
      updateZeroIncidentStreak: (days) =>
        set((state) => {
          if (!Number.isFinite(days)) return {};
          return {
            celebrations: {
              ...state.celebrations,
              zeroIncidentStreak: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(days))),
            },
          };
        }),
      setPackerBellEnabled: (enabled) =>
        set((state) => ({
          celebrations: { ...state.celebrations, packerBellEnabled: enabled },
        })),
    }),
    {
      name: 'millos-autonomous-simulation',
      // v2: one time model. Version 1 saves wrote 180 as "Standard, 1x".
      version: 2,
      storage: safeJSONStorage,
      migrate: (persisted, version) => {
        const record =
          persisted !== null && typeof persisted === 'object' && !Array.isArray(persisted)
            ? (persisted as Record<string, unknown>)
            : {};
        return version < 2 && typeof record.gameSpeed === 'number'
          ? { ...record, gameSpeed: migrateLegacyGameSpeed(record.gameSpeed) }
          : record;
      },
      partialize: (state) => ({
        gameTime: state.gameTime,
        gameDay: state.gameDay,
        // A hold belongs to this page; persist the pace the player had chosen
        // underneath it, so a reload never inherits a tour or restore pause.
        gameSpeed: persistedGameSpeed(state),
        weather: state.weather,
        currentShift: state.currentShift,
        celebrations: state.celebrations,
      }),
      merge: (persisted, current) => {
        const persistedRecord =
          persisted !== null && typeof persisted === 'object' && !Array.isArray(persisted)
            ? (persisted as Partial<GameSimulationStore>)
            : undefined;
        const state = sanitizeGameSimulationState(persistedRecord);
        const gameTime = state.gameTime ?? current.gameTime;
        return {
          ...current,
          ...state,
          // Saves written before D-049 may hold a pause; the clock still starts.
          gameSpeed:
            typeof state.gameSpeed === 'number' && state.gameSpeed > 0
              ? state.gameSpeed
              : STANDARD_GAME_SPEED,
          currentShift: getShiftForHour(gameTime),
          celebrations: sanitizeCelebrations(persistedRecord?.celebrations),
          preEmergencyMachineStatuses: new Map(),
          emergencyActive: false,
          stopHeldForklifts: false,
          emergencyMachineId: null,
          emergencyDrillMode: false,
          activeSafetyEventId: null,
          drillMetrics: defaultDrill(),
          crisisState: defaultCrisis(),
        };
      },
    }
  )
);

/**
 * At start-up, a saved sky against the incidents: a storm saved with no
 * incident open is one whose incident closed when nothing lifted it, and the
 * Safety panel no longer offers a way to; an open incident brings its storm.
 * Any other saved sky is kept. The benchmark route sets its sky later.
 */
export function reconcileSavedWeather(): void {
  const game = useGameSimulationStore.getState();
  const open = severeRainOpen(openCampaignIncidents());
  if (open && game.weather !== 'storm') useGameSimulationStore.setState({ weather: 'storm' });
  else if (!open && game.weather === 'storm') useGameSimulationStore.setState({ weather: 'clear' });
}

/**
 * The weather's side of 6.8: an open severe-rain incident brings the storm
 * (a restored save or a sky set before the incident), and the storm it brought
 * lifts when the last one closes. Only an incident's own change acts, so a
 * storm set with no incident (the benchmark weather route) is left alone.
 * Installed after module evaluation: the stores import each other, and the
 * campaign store may not exist yet while this module evaluates.
 * Working if the sky never contradicts an open severe-rain incident.
 */
queueMicrotask(() => {
  // A test that mocks the campaign store away has no incidents to follow.
  let subscribe: typeof useOperationsCampaignStore.subscribe;
  try {
    subscribe = useOperationsCampaignStore.subscribe;
  } catch {
    return;
  }
  if (typeof subscribe !== 'function') return;
  subscribe((state, previous) => {
    if (state.incidents === previous.incidents) return;
    const open = severeRainOpen(state.incidents);
    const game = useGameSimulationStore.getState();
    if (open && game.weather !== 'storm') useGameSimulationStore.setState({ weather: 'storm' });
    else if (!open && severeRainOpen(previous.incidents) && game.weather === 'storm')
      useGameSimulationStore.setState({ weather: 'clear' });
  });
  // A sky written over an open incident by a direct write (the physical
  // session restores the game after the campaign) goes back to the storm.
  useGameSimulationStore.subscribe((state, previous) => {
    if (state.weather === previous.weather || state.weather === 'storm') return;
    if (severeRainOpen(openCampaignIncidents()))
      useGameSimulationStore.setState({ weather: 'storm' });
  });
  reconcileSavedWeather();
});
