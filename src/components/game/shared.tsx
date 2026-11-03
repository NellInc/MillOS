import { createContext, useContext, useEffect, useRef } from 'react';
import { DAILY_TARGET_BAGS, useProductionStore } from '../../stores/productionStore';
import { isStandingCriticalAlert, useUIStore } from '../../stores/uiStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore, type AnnouncementInput } from '../../stores/announcementsStore';
import { audioManager } from '../../utils/audioManager';
import { peekSCADAService } from '../../scada/SCADAService';
import { isStandingCriticalAlarm } from '../../scada/SCADABridge';
import { translate } from '../../i18n';
import { registerAlertCatalog, type KeyedLine } from '../../i18n/alertCopy';
import { sharedMessages } from './shared.messages';

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

type AnnouncementCategory = 'operations' | 'production' | 'safety' | 'logistics' | 'environment';
type NoticeType = 'general' | 'production' | 'safety' | 'emergency';
type NoticePriority = 'low' | 'medium' | 'high' | 'critical';

interface AnnouncementConfig {
  /** The catalogue key, filed as the line's keyed copy. */
  key: SharedMessageKey;
  message: string;
  type: NoticeType;
  category: AnnouncementCategory;
  stressWeight: number;
  /** Claims the whole plant is fine; false while any critical condition stands. */
  reassuring?: true;
}

interface EventAnnouncementConfig {
  /** The catalogue key, filed as the line's keyed copy. */
  key: SharedMessageKey;
  message: string;
  type: NoticeType;
  priority: NoticePriority;
  duration: number;
}

const MACHINE_IDS = {
  silos: ['Silo Alpha', 'Silo Beta', 'Silo Gamma', 'Silo Delta', 'Silo Epsilon'],
  mills: ['R.M. 101', 'R.M. 102', 'R.M. 103', 'R.M. 104'],
  sifters: ['Sifter A', 'Sifter B', 'Sifter C'],
  packers: ['Packer Line 1', 'Packer Line 2', 'Packer Line 3'],
} as const;

export const getRandomMachineOfType = (type: keyof typeof MACHINE_IDS): string => {
  const machines = MACHINE_IDS[type];
  return machines[Math.floor(Math.random() * machines.length)];
};

const AUTONOMOUS_NOTICES: AnnouncementConfig[] = [
  {
    key: 'processPathVerified',
    get message() {
      return say('processPathVerified');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.1,
    reassuring: true,
  },
  {
    key: 'siloInventoryReconciled',
    get message() {
      return say('siloInventoryReconciled');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.15,
  },
  {
    key: 'rollerGapStable',
    get message() {
      return say('rollerGapStable');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.2,
  },
  {
    key: 'plansifterPressureNominal',
    get message() {
      return say('plansifterPressureNominal');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.2,
  },
  {
    key: 'packingLineVerified',
    get message() {
      return say('packingLineVerified');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.2,
  },
  {
    key: 'dockSequencingCleared',
    get message() {
      return say('dockSequencingCleared');
    },
    type: 'general',
    category: 'logistics',
    stressWeight: 0.25,
  },
  {
    key: 'forkliftRoutesDeconflicted',
    get message() {
      return say('forkliftRoutesDeconflicted');
    },
    type: 'safety',
    category: 'logistics',
    stressWeight: 0.35,
  },
  {
    key: 'geofencesMatch',
    get message() {
      return say('geofencesMatch');
    },
    type: 'safety',
    category: 'safety',
    stressWeight: 0.3,
  },
  {
    key: 'dustExtractionStable',
    get message() {
      return say('dustExtractionStable');
    },
    type: 'general',
    category: 'safety',
    stressWeight: 0.25,
  },
  {
    key: 'waterwayHealthy',
    get message() {
      return say('waterwayHealthy');
    },
    type: 'general',
    category: 'environment',
    stressWeight: 0.1,
  },
  {
    key: 'weatherFeedChecked',
    get message() {
      return say('weatherFeedChecked');
    },
    type: 'general',
    category: 'environment',
    stressWeight: 0.2,
  },
  {
    key: 'millIsCalm',
    get message() {
      return say('millIsCalm');
    },
    type: 'general',
    category: 'operations',
    stressWeight: 0.05,
    reassuring: true,
  },
  {
    key: 'vibrationTrendReviewed',
    get message() {
      return say('vibrationTrendReviewed');
    },
    type: 'general',
    category: 'operations',
    stressWeight: 0.45,
  },
  {
    key: 'constraintAnalysisUpdated',
    get message() {
      return say('constraintAnalysisUpdated');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.45,
  },
  {
    key: 'cycleTimeVarianceCorrected',
    get message() {
      return say('cycleTimeVarianceCorrected');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.55,
  },
  {
    key: 'housekeepingComplete',
    get message() {
      return say('housekeepingComplete');
    },
    type: 'general',
    category: 'safety',
    stressWeight: 0.15,
  },
];

const TIME_NOTICES: Record<'day' | 'night', AnnouncementConfig[]> = {
  day: [
    {
      key: 'daylightControlActive',
      get message() {
        return say('daylightControlActive');
      },
      type: 'general',
      category: 'environment',
      stressWeight: 0.1,
    },
    {
      key: 'solarLoadingApplied',
      get message() {
        return say('solarLoadingApplied');
      },
      type: 'general',
      category: 'environment',
      stressWeight: 0.2,
    },
  ],
  night: [
    {
      key: 'nightProfileActive',
      get message() {
        return say('nightProfileActive');
      },
      type: 'safety',
      category: 'environment',
      stressWeight: 0.25,
    },
    {
      key: 'lightingTrackingSky',
      get message() {
        return say('lightingTrackingSky');
      },
      type: 'general',
      category: 'environment',
      stressWeight: 0.1,
    },
  ],
};

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

const MILESTONE_MESSAGES: Record<number, SharedMessageKey> = {
  25: 'milestone25',
  50: 'milestone50',
  75: 'milestone75',
  90: 'milestone90',
  100: 'milestone100',
};

export const SAFETY_INCIDENT_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    key: 'safetyInterlockLogged',
    get message() {
      return say('safetyInterlockLogged');
    },
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
    key: 'nearMissTriggered',
    get message() {
      return say('nearMissTriggered');
    },
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
    key: 'vehicleProximity',
    get message() {
      return say('vehicleProximity');
    },
    type: 'safety',
    priority: 'high',
    duration: 24,
  },
];

export const FIRE_DRILL_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    key: 'drillStarted',
    get message() {
      return say('drillStarted');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    key: 'drillSensorsUnderTest',
    get message() {
      return say('drillSensorsUnderTest');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    key: 'drillComplete',
    get message() {
      return say('drillComplete');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
];

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

const calculateOperationalStress = (): number => {
  const productionState = useProductionStore.getState();
  const machines = productionState.machines ?? [];
  const critical = machines.filter((machine) => machine.status === 'critical').length;
  const warning = machines.filter((machine) => machine.status === 'warning').length;
  const alerts = useUIStore.getState().alerts ?? [];
  // Acknowledged alerts are handled; they no longer raise PA stress.
  const criticalAlerts = alerts.filter(isStandingCriticalAlert).length;
  const warningAlerts = alerts.filter((alert) => alert.type === 'warning').length;
  const incidents = useSafetyStore.getState().safetyIncidents ?? [];
  const recentIncidents = incidents.filter(
    (incident) => Date.now() - incident.timestamp < 5 * 60 * 1000
  ).length;
  return Math.min(
    1,
    critical * 0.3 +
      warning * 0.1 +
      criticalAlerts * 0.25 +
      warningAlerts * 0.08 +
      recentIncidents * 0.15
  );
};

/**
 * A critical condition is standing: a machine in 'critical', an unacknowledged
 * critical alert, or an active in-service SCADA critical alarm (checked at the
 * source, because the bell alert for it may have been dismissed).
 */
export const isCriticalConditionActive = (): boolean => {
  const machines = useProductionStore.getState().machines ?? [];
  if (machines.some((machine) => machine.status === 'critical')) return true;
  const alerts = useUIStore.getState().alerts ?? [];
  if (alerts.some(isStandingCriticalAlert)) return true;
  // peek, not get: a query must not construct the SCADA service.
  return (peekSCADAService()?.getActiveAlarms() ?? []).some(isStandingCriticalAlarm);
};

export const chooseNotice = (
  gameTime: number,
  criticalActive: boolean = isCriticalConditionActive()
): AnnouncementConfig => {
  const timeBand = gameTime >= 7 && gameTime < 19 ? 'day' : 'night';
  const pool = Math.random() < 0.2 ? TIME_NOTICES[timeBand] : AUTONOMOUS_NOTICES;
  // Working if 'The mill is calm' never plays beside 'Critical alarms active!'.
  // Only the whole-plant reassurances are held; other ambient notices continue.
  const corpus = criticalActive ? pool.filter((notice) => !notice.reassuring) : pool;
  const stress = calculateOperationalStress();
  const ranked = corpus
    .map((announcement) => ({
      announcement,
      weight: 1 - Math.abs(announcement.stressWeight - stress) + Math.random() * 0.2,
    }))
    .sort((left, right) => right.weight - left.weight);
  return ranked[Math.floor(Math.random() * Math.min(4, ranked.length))].announcement;
};

export const PA_ANNOUNCEMENT_COUNT =
  AUTONOMOUS_NOTICES.length + TIME_NOTICES.day.length + TIME_NOTICES.night.length;

let lastMilestoneReached = 0;

const DAILY_MILESTONES = [25, 50, 75, 90, 100] as const;

// The same count and target the tick's milestone celebrations read, so a
// caption and its toast mark the same moment.
const dailyTargetProgress = (): number | null => {
  const produced = useProductionStore.getState().dailyBagsProduced;
  if (!(DAILY_TARGET_BAGS > 0) || !Number.isFinite(produced)) return null;
  return Math.floor((produced / DAILY_TARGET_BAGS) * 100);
};

/**
 * Treat every milestone already passed when the scheduler starts as announced.
 * A reload restores dailyBagsProduced, and the PA has no saved record of what it
 * said, so without this the first poll captioned a milestone crossed before it.
 * Working if a reload at 60% stays quiet and the 75% crossing is still captioned.
 */
const seedMilestones = (): void => {
  const progress = dailyTargetProgress();
  lastMilestoneReached =
    progress === null ? 0 : (DAILY_MILESTONES.filter((m) => progress >= m).pop() ?? 0);
};

const lastMachineStatuses: Record<string, string> = {};
const lastMachineStatusAnnouncementTime: Record<string, number> = {};
const MACHINE_STATUS_COOLDOWN_MS = 30000;
const DRILL_CAPTION_COOLDOWN_MS = 15000;
// Drills and facility stops are one state: the plant is held or it is not.
export const PLANT_STOP_TOPIC = 'plant-stop';
export const FORKLIFT_STOP_TOPIC = 'forklift-stop';

type DrillSnapshot = { active: boolean; verificationComplete: boolean };

// Driven by a store subscription rather than the 5 s poll: the sequencer holds
// a completed drill for only ~5 s before ending it and resetting its metrics.
const announceDrillTransition = (
  drill: DrillSnapshot,
  previous: DrillSnapshot,
  addAnnouncement: (input: AnnouncementInput) => void
): void => {
  if (audioManager.muted) return;
  let key: SharedMessageKey | null = null;
  let priority = 3;
  if (drill.active && !previous.active) {
    key = FIRE_DRILL_ANNOUNCEMENTS[0].key;
    priority = 4;
  } else if (drill.verificationComplete && !previous.verificationComplete) {
    key = FIRE_DRILL_ANNOUNCEMENTS[2].key;
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
 * and the 5 s poll does not run at all while the PA is muted or off (a
 * critical caption still shows with the PA off), so the caption must not
 * depend on it. Working if 'Critical alarm at R.M. 101' never stays on screen
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
  const progress = paOff ? null : dailyTargetProgress();

  if (progress !== null) {
    // Announce only the highest milestone newly crossed: a fast game speed
    // would otherwise queue several at once.
    const reached = DAILY_MILESTONES.filter(
      (milestone) => progress >= milestone && lastMilestoneReached < milestone
    ).pop();
    if (reached !== undefined) {
      lastMilestoneReached = reached;
      addAnnouncement({
        type: 'success',
        message: say(MILESTONE_MESSAGES[reached]),
        copy: keyed(MILESTONE_MESSAGES[reached]),
        // Never 4: that tier is the red pulsing alarm, an assertive interrupt
        // and the caption that ignores "PA captions: off". This is good news.
        priority: reached >= 50 ? 3 : 2,
        source: 'Production controller',
        channel: 'operational',
        tone: 'literal',
        audience: 'control',
        cooldownMs: 90000,
      });
    }
  }

  const now = Date.now();
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
      if (now - lastTime >= MACHINE_STATUS_COOLDOWN_MS) {
        const notice = MACHINE_STATUS_NOTICES[current as keyof typeof MACHINE_STATUS_NOTICES];
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
  }
};

const useEventAnnouncementScheduler = () => {
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);
  useEffect(() => {
    seedMilestones();
    const interval = setInterval(() => {
      if (!audioManager.muted) checkEventAnnouncements(addAnnouncement);
    }, 5000);
    // A fall in the day's count is a new day (or a restore). Watched by
    // subscription because the poll skips while muted or off, and a skipped
    // rollover left yesterday's milestones marked as said all the next day.
    // Working if muting across midnight still captions the next day's 25%.
    const unsubscribeDay = useProductionStore.subscribe((state, previous) => {
      if (state.dailyBagsProduced < previous.dailyBagsProduced) seedMilestones();
      if (state.machines !== previous.machines) retireRecoveredFaultLines();
    });
    const unsubscribeDrill = useGameSimulationStore.subscribe((state, previous) => {
      if (state.drillMetrics !== previous.drillMetrics) {
        announceDrillTransition(state.drillMetrics, previous.drillMetrics, addAnnouncement);
      }
      // A facility emergency (not a drill, which captions itself above) gets
      // one caption on the rising edge.
      if (
        state.emergencyActive &&
        !previous.emergencyActive &&
        !state.emergencyDrillMode &&
        !audioManager.muted
      ) {
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
        if (!audioManager.muted) {
          addAnnouncement({
            type: 'emergency',
            message: say('facilityStopCleared'),
            copy: keyed('facilityStopCleared'),
            priority: 3,
            source: 'Safety controller',
            channel: 'safety',
            tone: 'literal',
            audience: 'control',
            cooldownMs: DRILL_CAPTION_COOLDOWN_MS,
            topic: PLANT_STOP_TOPIC,
          });
        }
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
      unsubscribeForklifts();
    };
  }, [addAnnouncement]);
};

const usePAScheduler = () => {
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);
  const lastAnnouncementRef = useRef('');

  useEffect(() => {
    const scheduleNext = (): ReturnType<typeof setTimeout> => {
      const stress = calculateOperationalStress();
      const minimum = 90000 - stress * 40000;
      const maximum = 180000 - stress * 80000;
      return setTimeout(
        () => {
          const mode = useAnnouncementsStore.getState().mode;
          // Ambient notices such as 'The mill is calm' are false during a hold,
          // and narration over a paused shift (tour, P, a planner, a player
          // pause) talks over a stopped plant. Skip them, but keep the timer.
          const game = useGameSimulationStore.getState();
          const safetyHold =
            game.gameSpeed === 0 ||
            game.emergencyActive ||
            game.emergencyDrillMode ||
            game.crisisState.active ||
            useSafetyStore.getState().forkliftEmergencyStop;
          if (!safetyHold && !audioManager.muted && mode !== 'off') {
            const gameTime = useGameSimulationStore.getState().gameTime;
            let notice = chooseNotice(gameTime);
            for (
              let attempt = 0;
              notice.message === lastAnnouncementRef.current && attempt < 4;
              attempt++
            ) {
              notice = chooseNotice(gameTime);
            }
            lastAnnouncementRef.current = notice.message;
            const stressNow = calculateOperationalStress();
            const priority =
              notice.type === 'emergency'
                ? 4
                : notice.type === 'safety' && stressNow > 0.5
                  ? 3
                  : stressNow > 0.7
                    ? 3
                    : 2;
            addAnnouncement({
              type: mapAnnouncementType(notice.type),
              message: notice.message,
              copy: keyed(notice.key),
              priority,
              source: 'Autonomous plant notice',
              channel:
                notice.category === 'logistics'
                  ? 'logistics'
                  : notice.category === 'safety'
                    ? 'safety'
                    : 'operational',
              tone: mode === 'characterful' ? 'characterful' : 'literal',
              audience: notice.category === 'logistics' ? 'logistics' : 'control',
              cooldownMs: mode === 'focused' ? 180000 : 90000,
            });
          }
          timeoutRef = scheduleNext();
        },
        minimum + Math.random() * (maximum - minimum)
      );
    };

    let timeoutRef = scheduleNext();
    return () => clearTimeout(timeoutRef);
  }, [addAnnouncement]);
};

export { usePAScheduler, useEventAnnouncementScheduler };
