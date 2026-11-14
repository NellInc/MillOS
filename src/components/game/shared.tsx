import { createContext, useContext, useEffect } from 'react';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { programmeKey, runningProgramme } from '../../stores/programmeCommitment';
import { useUIStore } from '../../stores/uiStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore, type AnnouncementInput } from '../../stores/announcementsStore';
import { translate } from '../../i18n';
import { registerAlertCatalog, type KeyedLine } from '../../i18n/alertCopy';
import { sharedMessages } from './shared.messages';
import { audioManager } from '../../utils/audioManager';

type SharedMessageKey = keyof typeof sharedMessages.en;

// PA lines are filed with their key, so a line queued before a language
// switch, or restored from the transcript, reads in the language active now.
export const SHARED_PA_CATALOG = 'gameSharedPA';
registerAlertCatalog(SHARED_PA_CATALOG, sharedMessages);
const keyed = (key: SharedMessageKey, params?: KeyedLine['params']): KeyedLine => ({
  catalog: SHARED_PA_CATALOG,
  key,
  ...(params ? { params } : {}),
});

// Notice text is a getter so it resolves in the language active when spoken;
// a plain string here would freeze the language at import time.
const say = (key: SharedMessageKey): string => translate(sharedMessages, key);

export interface CameraFeedContextType {
  feedRefs: Map<string, React.RefObject<HTMLDivElement>>;
  registerFeedRef: (id: string, ref: React.RefObject<HTMLDivElement>) => void;
}

export const CameraFeedContext = createContext<CameraFeedContextType | null>(null);

export const useCameraFeedRefs = () => useContext(CameraFeedContext);

/*
 * The PA speaks only when something is wrong or worth acting on (D-054): a
 * machine fault and its recovery, a drill or stop, the programme delivered. The
 * timed corpus of all-is-well notices ('The mill is calm', 'Silo inventory
 * reconciled') and the 25-90% target readouts are gone; a plant running as it
 * should is the silence.
 */
type NoticeType = 'general' | 'production' | 'safety' | 'emergency';
type NoticePriority = 'low' | 'medium' | 'high' | 'critical';

interface EventAnnouncementConfig {
  /** The catalogue key, filed as the line's keyed copy. */
  key: SharedMessageKey;
  message: string;
  type: NoticeType;
  priority: NoticePriority;
  duration: number;
}

const MACHINE_STATUS_NOTICES = {
  warning: {
    messageKey: 'machineWarning' as const,
    // Maps to a 'warning' line. 'production' filed it as 'success' (the
    // packed-bag icon) for a machine that has just gone wrong.
    type: 'safety' as const,
    priority: 'high' as const,
  },
  critical: {
    messageKey: 'machineCritical' as const,
    type: 'emergency' as const,
    priority: 'critical' as const,
  },
  running: {
    messageKey: 'machineRecovered' as const,
    type: 'production' as const,
    priority: 'medium' as const,
  },
};

export const EMERGENCY_STOP_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    key: 'emergencyStopActivated',
    get message() {
      return say('emergencyStopActivated');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    key: 'facilityStopEngaged',
    get message() {
      return say('facilityStopEngaged');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    key: 'vehiclesSecure',
    get message() {
      return say('vehiclesSecure');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 22,
  },
];

// The forklift-only stop (Space bar, panel E-STOP button) holds the vehicles
// while production keeps running, so it must not claim the whole site stopped.
export const FORKLIFT_STOP_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    key: 'forkliftStop',
    get message() {
      return say('forkliftStop');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
];

const mapAnnouncementType = (type: NoticeType): AnnouncementInput['type'] => {
  if (type === 'emergency') return 'emergency';
  if (type === 'safety') return 'warning';
  if (type === 'production') return 'success';
  return 'info';
};

const mapPriority = (priority: NoticePriority): number =>
  ({ low: 1, medium: 2, high: 3, critical: 4 })[priority];

/*
 * The goal is the running programme the customers committed to, not a daily
 * bag count (D11), so the one line of good news is that programme delivered:
 * the line the day's target used to have, moved, not a new one. Only the
 * whole programme is news; each order's result is on the HUD, unspoken.
 */
let lastDeliveredProgramme: string | null = null;

/**
 * The running programme's key once every order of it is fulfilled; null while
 * one is open, and null when one was forfeited (closed 'cancelled'): a
 * programme closed short is not delivered, and its forfeit has its own notice.
 */
const deliveredProgramme = (): string | null => {
  const orders = useOperationsCampaignStore.getState().orders;
  const running = runningProgramme(orders);
  if (!running || running.open) return null;
  const forfeited = orders.some(
    (order) => order.status === 'cancelled' && programmeKey(order.id) === running.key
  );
  return forfeited ? null : running.key;
};

/**
 * Treat a programme already delivered when the scheduler starts as announced.
 * A reload restores the orders, and the PA has no saved record of what it
 * said, so without this the first poll captioned a delivery made before it.
 * Working if a reload after delivery stays quiet and the next programme's is
 * still captioned.
 */
const seedDeliveredProgramme = (): void => {
  lastDeliveredProgramme = deliveredProgramme();
};

const lastMachineStatuses: Record<string, string> = {};
const lastMachineStatusAnnouncementTime: Record<string, number> = {};
/*
 * How soon the same machine may say the same thing again. A fault that flaps
 * (warning, running, warning) speaks once per window; a critical alarm is a
 * stop, so it may speak again sooner.
 * Working if a flapping warning is heard once in three minutes.
 */
const MACHINE_STATUS_COOLDOWN_MS: Record<keyof typeof MACHINE_STATUS_NOTICES, number> = {
  warning: 180000,
  running: 180000,
  critical: 30000,
};
const DRILL_CAPTION_COOLDOWN_MS = 15000;

/*
 * A fault left unresolved is said again, more urgently (D-061): "still needs a
 * look" after 3 minutes of running clock, then "right away" after 6. Time only
 * accrues while the clock runs and the sound is on: a paused or muted plant
 * builds no urgency (D-061). Mute silences sound only (D-098), so a muted
 * fault is still captioned, once.
 * Working if a warning nobody attends to is heard three times in six minutes,
 * rising in urgency, a fixed one is heard once, and a muted one is captioned
 * once until the sound is back.
 */
export const FAULT_ESCALATION_AFTER_MS = [180000, 360000] as const;
const FAULT_ESCALATION_KEYS = {
  warning: ['machineWarningStill', 'machineWarningUrgent'],
  critical: ['machineCriticalStill', 'machineCriticalUrgent'],
} as const;
/** The longest a single poll gap may add, so a slept tab cannot leap a level. */
const FAULT_ESCALATION_MAX_STEP_MS = 10000;
const faultEscalation: Record<
  string,
  { status: 'warning' | 'critical'; unresolvedMs: number; level: number }
> = {};
let lastFaultPollAt: number | null = null;

/** Test seam: forget unresolved faults (a new session, or between tests). */
export const resetFaultEscalation = (): void => {
  for (const key of Object.keys(faultEscalation)) delete faultEscalation[key];
  lastFaultPollAt = null;
};
// Drills and facility stops are one state: the plant is held or it is not.
export const PLANT_STOP_TOPIC = 'plant-stop';
export const FORKLIFT_STOP_TOPIC = 'forklift-stop';

type DrillSnapshot = { active: boolean; verificationComplete: boolean };

/** Zones of the running drill verified on their alternative route, from its record. */
const reroutedDrillZones = (): number => {
  const sim = useGameSimulationStore.getState();
  const event = sim.safetyEvents?.find((candidate) => candidate.id === sim.activeSafetyEventId);
  return (event?.drillZones ?? []).filter((zone) => zone.result === 'alternative').length;
};

// Driven by a store subscription rather than the 5 s poll: the sequencer holds
// a completed drill for only ~5 s before ending it and resetting its metrics.
const announceDrillTransition = (
  drill: DrillSnapshot,
  previous: DrillSnapshot,
  addAnnouncement: (input: AnnouncementInput) => void
): void => {
  // Filed whatever the mute (D15): mute silences sound only.
  let key: SharedMessageKey | null = null;
  let priority = 3;
  if (drill.active && !previous.active) {
    key = 'drillStarted';
    priority = 4;
  } else if (drill.verificationComplete && !previous.verificationComplete) {
    // "All exits are clear" only when every zone verified on its own route;
    // the record is written before the last verification completes the drill.
    const rerouted = reroutedDrillZones();
    key =
      rerouted === 0
        ? 'drillComplete'
        : rerouted === 1
          ? 'drillCompleteRerouted'
          : 'drillCompleteReroutedMany';
  } else if (previous.active && !drill.active && !previous.verificationComplete) {
    key = 'drillEndedEarly';
  }
  if (!key) return;
  // Emergency items are allowed in every PA mode, so there is no mode gate.
  // On the plant-stop topic, so this line retires the previous drill or stop
  // line rather than queueing behind it.
  addAnnouncement({
    type: 'emergency',
    message: say(key),
    priority,
    source: 'Safety controller',
    channel: 'safety',
    tone: 'literal',
    audience: 'control',
    cooldownMs: DRILL_CAPTION_COOLDOWN_MS,
    topic: PLANT_STOP_TOPIC,
    copy: keyed(key),
  });
};

/**
 * The forklift-only stop is announced by the Space key and the panel E-STOP;
 * the panel tags no topic, so its corpus is matched too, by key and in every
 * language (the line keeps the words it was filed in, and the player may have
 * switched since), so the line goes when the forklifts are released.
 */
const retireForkliftStopLines = (): void => {
  const keys = new Set<string>(FORKLIFT_STOP_ANNOUNCEMENTS.map((notice) => notice.key));
  const lines = new Set<unknown>(
    FORKLIFT_STOP_ANNOUNCEMENTS.flatMap((notice) =>
      Object.values(sharedMessages).map((table) => (table as Record<string, unknown>)[notice.key])
    )
  );
  useAnnouncementsStore
    .getState()
    .dismissMatching(
      (announcement) =>
        announcement.topic === FORKLIFT_STOP_TOPIC ||
        (announcement.type === 'emergency' &&
          ((announcement.copy !== undefined && keys.has(announcement.copy.key)) ||
            lines.has(announcement.message)))
    );
};

// How long a filed bell alert counts as the screen-reader voice of a status change.
const BELL_ALERT_PAIRING_MS = 60000;

/**
 * Whether the bell has just filed an announced alert for this machine (a
 * breakdown, a wear warning, a campaign incident). AlertSystem reads those to
 * screen readers whatever the PA mode or mute, so the PA status line for the
 * same change is a caption only. A status change with no such alert (a live
 * SCADA escalation) is still read by the PA.
 * Working if an unmuted screen-reader player hears a breakdown once.
 */
const bellReadsMachineAlert = (machineId: string, now: number): boolean =>
  useUIStore
    .getState()
    .alerts.some(
      (alert) =>
        alert.machineId === machineId &&
        alert.announce !== undefined &&
        now - new Date(alert.timestamp).getTime() < BELL_ALERT_PAIRING_MS
    );

const MACHINE_TOPIC_PREFIX = 'machine:';

/**
 * Retire each live fault line whose machine is no longer in a fault. The
 * recovery line also retires it, but that line can be held by its cooldown,
 * and with the PA off the poll files no recovery line (a critical caption
 * still shows with the PA off), so the caption must not depend on it. Working if 'Critical alarm at R.M. 101' never stays on screen
 * after R.M. 101 is running or idle again.
 */
const retireRecoveredFaultLines = (): void => {
  const announcements = useAnnouncementsStore.getState();
  const faultTopics = announcements.announcements.filter(
    (entry) =>
      !entry.dismissed && entry.type !== 'success' && entry.topic?.startsWith(MACHINE_TOPIC_PREFIX)
  );
  if (faultTopics.length === 0) return;
  const machines = useProductionStore.getState().machines ?? [];
  const recovered = new Set<string>();
  for (const entry of faultTopics) {
    const machineId = entry.topic!.slice(MACHINE_TOPIC_PREFIX.length);
    const status = machines.find((machine) => machine.id === machineId)?.status;
    if (status !== 'warning' && status !== 'critical') recovered.add(entry.topic!);
  }
  if (recovered.size === 0) return;
  announcements.dismissMatching(
    (entry) => entry.type !== 'success' && entry.topic !== undefined && recovered.has(entry.topic)
  );
};

const checkEventAnnouncements = (addAnnouncement: (input: AnnouncementInput) => void): void => {
  // With the PA Off, milestones stay quiet (and unsaid, for later), while the
  // machine poll still runs: a critical alarm is safety-critical, which the PA
  // store keeps in every mode, as it does a facility E-STOP; its own Off filter
  // drops the routine status lines.
  const paOff = useAnnouncementsStore.getState().mode === 'off';
  const state = useProductionStore.getState();
  const delivered = paOff ? null : deliveredProgramme();

  if (delivered !== null && delivered !== lastDeliveredProgramme) {
    lastDeliveredProgramme = delivered;
    addAnnouncement({
      type: 'success',
      message: say('programmeDelivered'),
      copy: keyed('programmeDelivered'),
      // Never 4: that tier is the red pulsing alarm, an assertive interrupt
      // and the caption that ignores "PA captions: off". This is good news.
      priority: 3,
      source: 'Production controller',
      channel: 'operational',
      tone: 'literal',
      audience: 'control',
      cooldownMs: 90000,
    });
  }

  const now = Date.now();
  const pollStepMs =
    lastFaultPollAt === null
      ? 0
      : Math.min(FAULT_ESCALATION_MAX_STEP_MS, Math.max(0, now - lastFaultPollAt));
  // D-061: a paused or muted plant builds no urgency. Muted, the fault itself is still filed.
  const clockRunning = useGameSimulationStore.getState().gameSpeed > 0 && !audioManager.muted;
  for (const machine of state.machines ?? []) {
    const previous = lastMachineStatuses[machine.id];
    const current = machine.status;
    // 'running' is only a recovery when it follows a fault; idle-to-running is
    // a routine start or a restore after a hold, and nothing recovered.
    if (
      previous &&
      previous !== current &&
      current in MACHINE_STATUS_NOTICES &&
      (current !== 'running' || previous === 'warning' || previous === 'critical')
    ) {
      // Keyed per machine: a status-only key dropped a second machine's
      // critical alarm raised within the cooldown of the first.
      const cooldownKey = `${machine.id}:${current}`;
      const lastTime = lastMachineStatusAnnouncementTime[cooldownKey] ?? 0;
      const status = current as keyof typeof MACHINE_STATUS_NOTICES;
      if (now - lastTime >= MACHINE_STATUS_COOLDOWN_MS[status]) {
        const notice = MACHINE_STATUS_NOTICES[status];
        addAnnouncement({
          type: mapAnnouncementType(notice.type),
          message: translate(sharedMessages, notice.messageKey, {
            machine: machine.name || machine.id,
          }),
          copy: keyed(notice.messageKey, { machine: machine.name || machine.id }),
          priority: mapPriority(notice.priority),
          source: 'Asset diagnostics',
          channel: 'operational',
          tone: 'literal',
          audience: 'control',
          cooldownMs: 90000,
          // A recovery retires the fault line still queued for this machine.
          topic: `${MACHINE_TOPIC_PREFIX}${machine.id}`,
          ...(current !== 'running' && bellReadsMachineAlert(machine.id, now)
            ? { captionOnly: true }
            : {}),
        });
        lastMachineStatusAnnouncementTime[cooldownKey] = now;
      }
    }
    lastMachineStatuses[machine.id] = current;

    if (current === 'warning' || current === 'critical') {
      const tracked = faultEscalation[machine.id];
      if (!tracked || tracked.status !== current) {
        faultEscalation[machine.id] = { status: current, unresolvedMs: 0, level: 0 };
      } else if (clockRunning && tracked.level < FAULT_ESCALATION_AFTER_MS.length) {
        tracked.unresolvedMs += pollStepMs;
        if (tracked.unresolvedMs >= FAULT_ESCALATION_AFTER_MS[tracked.level]) {
          const messageKey = FAULT_ESCALATION_KEYS[current][tracked.level];
          const name = machine.name || machine.id;
          addAnnouncement({
            type: mapAnnouncementType(current === 'critical' ? 'emergency' : 'safety'),
            message: translate(sharedMessages, messageKey, { machine: name }),
            copy: keyed(messageKey, { machine: name }),
            // The last step of a warning is as urgent as an alarm's first.
            priority: current === 'critical' || tracked.level === 1 ? 4 : 3,
            source: 'Asset diagnostics',
            channel: 'operational',
            tone: 'literal',
            audience: 'control',
            cooldownMs: 90000,
            topic: `${MACHINE_TOPIC_PREFIX}${machine.id}`,
          });
          tracked.level += 1;
        }
      }
    } else {
      delete faultEscalation[machine.id];
    }
  }
  lastFaultPollAt = now;
};

const useEventAnnouncementScheduler = () => {
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);
  useEffect(() => {
    seedDeliveredProgramme();
    const interval = setInterval(() => {
      // Every line is filed while muted too (D15): mute silences sound only.
      checkEventAnnouncements(addAnnouncement);
    }, 5000);
    const unsubscribeDay = useProductionStore.subscribe((state, previous) => {
      if (state.machines !== previous.machines) retireRecoveredFaultLines();
    });
    // An open programme (a new one accepted, or a reset campaign) clears the
    // record, so its delivery is said. Watched by subscription because the
    // poll skips the delivery line with the PA off. Working if a programme
    // delivered with the PA off is captioned once it is on again.
    const unsubscribeProgramme = useOperationsCampaignStore.subscribe((state, previous) => {
      if (state.orders !== previous.orders && deliveredProgramme() === null)
        lastDeliveredProgramme = null;
    });
    const unsubscribeDrill = useGameSimulationStore.subscribe((state, previous) => {
      if (state.drillMetrics !== previous.drillMetrics) {
        announceDrillTransition(state.drillMetrics, previous.drillMetrics, addAnnouncement);
      }
      // A facility emergency (not a drill, which captions itself above) gets
      // one caption on the rising edge.
      if (state.emergencyActive && !previous.emergencyActive && !state.emergencyDrillMode) {
        const notice =
          EMERGENCY_STOP_ANNOUNCEMENTS[
            Math.floor(Math.random() * EMERGENCY_STOP_ANNOUNCEMENTS.length)
          ];
        addAnnouncement({
          type: 'emergency',
          message: notice.message,
          priority: 4,
          source: 'Safety controller',
          channel: 'safety',
          tone: 'literal',
          audience: 'control',
          cooldownMs: DRILL_CAPTION_COOLDOWN_MS,
          topic: PLANT_STOP_TOPIC,
          copy: keyed(notice.key),
        });
      }
      // Its falling edge: the stop lines describe a plant that is running
      // again. The clear gets its own line, so nothing left over from an
      // earlier drill is read as the reason the plant restarted.
      if (previous.emergencyActive && !state.emergencyActive && !previous.emergencyDrillMode) {
        const announcements = useAnnouncementsStore.getState();
        announcements.dismissMatching((announcement) => announcement.topic === PLANT_STOP_TOPIC);
        // The clear releases only the forklift hold the stop applied
        // (stopHeldForklifts, still set here: this runs inside the clear's
        // set, before the release). A stop the player set before it stays.
        const clearKey: SharedMessageKey =
          state.stopHeldForklifts || !useSafetyStore.getState().forkliftEmergencyStop
            ? 'facilityStopCleared'
            : 'facilityStopClearedForkliftsHeld';
        addAnnouncement({
          type: 'emergency',
          message: say(clearKey),
          copy: keyed(clearKey),
          priority: 3,
          source: 'Safety controller',
          channel: 'safety',
          tone: 'literal',
          audience: 'control',
          cooldownMs: DRILL_CAPTION_COOLDOWN_MS,
          topic: PLANT_STOP_TOPIC,
        });
      }
    });
    const unsubscribeForklifts = useSafetyStore.subscribe((state, previous) => {
      if (previous.forkliftEmergencyStop && !state.forkliftEmergencyStop) {
        retireForkliftStopLines();
      }
    });
    return () => {
      clearInterval(interval);
      unsubscribeDrill();
      unsubscribeDay();
      unsubscribeProgramme();
      unsubscribeForklifts();
    };
  }, [addAnnouncement]);
};

export { useEventAnnouncementScheduler };
