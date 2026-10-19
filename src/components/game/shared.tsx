import { createContext, useContext, useEffect, useRef } from 'react';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useAnnouncementsStore, type AnnouncementInput } from '../../stores/announcementsStore';
import { audioManager } from '../../utils/audioManager';
import { peekSCADAService } from '../../scada/SCADAService';
import { isStandingCriticalAlarm } from '../../scada/SCADABridge';
import { translate } from '../../i18n';
import { sharedMessages } from './shared.messages';

type SharedMessageKey = keyof typeof sharedMessages.en;

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
  message: string;
  type: NoticeType;
  category: AnnouncementCategory;
  stressWeight: number;
  /** Claims the whole plant is fine; false while any critical condition stands. */
  reassuring?: true;
}

interface EventAnnouncementConfig {
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
    get message() {
      return say('processPathVerified');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.1,
    reassuring: true,
  },
  {
    get message() {
      return say('siloInventoryReconciled');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.15,
  },
  {
    get message() {
      return say('rollerGapStable');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.2,
  },
  {
    get message() {
      return say('plansifterPressureNominal');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.2,
  },
  {
    get message() {
      return say('packingLineVerified');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.2,
  },
  {
    get message() {
      return say('dockSequencingCleared');
    },
    type: 'general',
    category: 'logistics',
    stressWeight: 0.25,
  },
  {
    get message() {
      return say('forkliftRoutesDeconflicted');
    },
    type: 'safety',
    category: 'logistics',
    stressWeight: 0.35,
  },
  {
    get message() {
      return say('geofencesMatch');
    },
    type: 'safety',
    category: 'safety',
    stressWeight: 0.3,
  },
  {
    get message() {
      return say('dustExtractionStable');
    },
    type: 'general',
    category: 'safety',
    stressWeight: 0.25,
  },
  {
    get message() {
      return say('waterwayHealthy');
    },
    type: 'general',
    category: 'environment',
    stressWeight: 0.1,
  },
  {
    get message() {
      return say('weatherFeedChecked');
    },
    type: 'general',
    category: 'environment',
    stressWeight: 0.2,
  },
  {
    get message() {
      return say('millIsCalm');
    },
    type: 'general',
    category: 'operations',
    stressWeight: 0.05,
    reassuring: true,
  },
  {
    get message() {
      return say('vibrationTrendReviewed');
    },
    type: 'general',
    category: 'operations',
    stressWeight: 0.45,
  },
  {
    get message() {
      return say('constraintAnalysisUpdated');
    },
    type: 'production',
    category: 'production',
    stressWeight: 0.45,
  },
  {
    get message() {
      return say('cycleTimeVarianceCorrected');
    },
    type: 'production',
    category: 'operations',
    stressWeight: 0.55,
  },
  {
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
      get message() {
        return say('daylightControlActive');
      },
      type: 'general',
      category: 'environment',
      stressWeight: 0.1,
    },
    {
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
      get message() {
        return say('nightProfileActive');
      },
      type: 'safety',
      category: 'environment',
      stressWeight: 0.25,
    },
    {
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
    type: 'production' as const,
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
    get message() {
      return say('safetyInterlockLogged');
    },
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
    get message() {
      return say('nearMissTriggered');
    },
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
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
    get message() {
      return say('drillStarted');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    get message() {
      return say('drillSensorsUnderTest');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
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
    get message() {
      return say('emergencyStopActivated');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    get message() {
      return say('facilityStopEngaged');
    },
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
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
  const criticalAlerts = alerts.filter(
    (alert) => alert.type === 'critical' && !alert.acknowledged
  ).length;
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
  if (alerts.some((alert) => alert.type === 'critical' && !alert.acknowledged)) return true;
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
const lastMachineStatuses: Record<string, string> = {};
const lastMachineStatusAnnouncementTime: Record<string, number> = {};
const MACHINE_STATUS_COOLDOWN_MS = 30000;
const DRILL_CAPTION_COOLDOWN_MS = 15000;

type DrillSnapshot = { active: boolean; verificationComplete: boolean };

// Driven by a store subscription rather than the 5 s poll: the sequencer holds
// a completed drill for only ~5 s before ending it and resetting its metrics.
const announceDrillTransition = (
  drill: DrillSnapshot,
  previous: DrillSnapshot,
  addAnnouncement: (input: AnnouncementInput) => void
): void => {
  if (audioManager.muted) return;
  let message: string | null = null;
  let priority = 3;
  if (drill.active && !previous.active) {
    message = FIRE_DRILL_ANNOUNCEMENTS[0].message;
    priority = 4;
  } else if (drill.verificationComplete && !previous.verificationComplete) {
    message = FIRE_DRILL_ANNOUNCEMENTS[2].message;
  } else if (previous.active && !drill.active && !previous.verificationComplete) {
    message = say('drillEndedEarly');
  }
  if (!message) return;
  // Emergency items are allowed in every PA mode, so there is no mode gate.
  addAnnouncement({
    type: 'emergency',
    message,
    priority,
    source: 'Safety controller',
    channel: 'safety',
    tone: 'literal',
    audience: 'control',
    cooldownMs: DRILL_CAPTION_COOLDOWN_MS,
  });
};

const checkEventAnnouncements = (addAnnouncement: (input: AnnouncementInput) => void): void => {
  if (useAnnouncementsStore.getState().mode === 'off') return;
  const state = useProductionStore.getState();
  const target = state.productionTarget;

  if (target && target.targetBags > 0) {
    const progress = Math.floor((target.producedBags / target.targetBags) * 100);
    // Announce only the highest milestone newly crossed: a fast game speed or a
    // reload part-way through the day would otherwise queue several at once.
    const reached = [25, 50, 75, 90, 100]
      .filter((milestone) => progress >= milestone && lastMilestoneReached < milestone)
      .pop();
    if (reached !== undefined) {
      lastMilestoneReached = reached;
      addAnnouncement({
        type: 'success',
        message: say(MILESTONE_MESSAGES[reached]),
        priority: reached === 100 ? 4 : reached >= 50 ? 3 : 2,
        source: 'Production controller',
        channel: 'operational',
        tone: 'literal',
        audience: 'control',
        cooldownMs: 90000,
      });
    }
    if (progress < 10 && lastMilestoneReached > 0) lastMilestoneReached = 0;
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
          priority: mapPriority(notice.priority),
          source: 'Asset diagnostics',
          channel: 'operational',
          tone: 'literal',
          audience: 'control',
          cooldownMs: 90000,
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
    const interval = setInterval(() => {
      if (!audioManager.muted) checkEventAnnouncements(addAnnouncement);
    }, 5000);
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
        });
      }
    });
    return () => {
      clearInterval(interval);
      unsubscribeDrill();
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
          // Ambient notices such as 'The mill is calm' are false during a hold.
          // Skip them, but keep the timer running.
          const game = useGameSimulationStore.getState();
          const safetyHold =
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
