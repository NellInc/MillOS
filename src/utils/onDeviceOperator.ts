/**
 * Lights-out play: the browser's own model handles each raised campaign incident.
 *
 * It routes the incident's title and description (never its kind) through the
 * same five-way rubric as Jev, then acts through the checked agent command path
 * as the on-device operator, whose grant covers acknowledging and mitigating
 * incidents and nothing else. A route that matches the queue the incident
 * belongs to is acknowledged and mitigated; a misroute is acknowledged and left
 * for the player; "No current incident" and "Insufficient evidence" change
 * nothing. Every outcome is filed as a notice naming the AI and its route.
 *
 * Only the on-device model is ever called here: cloud providers bill the player
 * and stay behind their explicit Send buttons.
 */
import { ON_DEVICE_OPERATOR_GRANT_ID, ON_DEVICE_OPERATOR_URI } from '../agent/command/authority';
import { executeAgentCommand } from '../agent/client/executeAgentCommand';
import { createTranslator, defineMessages, translate, type Locale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import {
  useOperationsCampaignStore,
  type IncidentKind,
  type OperationalIncident,
} from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useIncidentReplayStore } from '../stores/incidentReplayStore';
import { incidentTitle } from '../stores/incidentText';
import { peekSCADAService } from '../scada/SCADAService';
import { isWorkplaceReplayActive } from '../simulation/workplaceReplayRuntime';
import { requestJevAdvice, type JevAdvice } from './jevClient';
import { jevQueueLabel } from './jevClient.messages';
import { logger } from './logger';
import { onDeviceOperatorMessages as msg } from './onDeviceOperator.messages';
import { agentCockpitMessages } from '../components/ui-new/widgets/AgentCockpit.messages';
import { webgpuClient } from './webgpuClient';

type Queue = JevAdvice['queue'];

/**
 * The queue each incident kind belongs to, fixed before any run (2026-10-25) and
 * never shown to the router. Power and controls are site equipment; packaging
 * consumables and rain-slowed vehicles are logistics.
 */
export const INCIDENT_QUEUE: Record<IncidentKind, Queue> = {
  bearing_overheat: 'Equipment maintenance',
  dust_filter_pressure: 'Equipment maintenance',
  power_sag: 'Equipment maintenance',
  delayed_truck: 'Logistics coordination',
  supplier_contamination: 'Product quality',
  packaging_shortage: 'Logistics coordination',
  severe_rain: 'Logistics coordination',
  control_network_degraded: 'Equipment maintenance',
};

export type OperatorOutcome =
  | 'handled'
  | 'misrouted'
  | 'heldBack'
  | 'unrouted'
  | 'refused'
  | 'stoodDown';

export interface OperatorRecord {
  incidentId: string;
  kind: IncidentKind;
  title: string;
  /** Campaign minute when the operator settled it. */
  minute: number;
  queue: Queue | null;
  outcome: OperatorOutcome;
}

const MAX_RECORDS = 200;
// Replaced, never mutated, so a subscriber's snapshot changes with it.
let records: readonly OperatorRecord[] = [];
const listeners = new Set<() => void>();
function addRecord(incident: OperationalIncident, queue: Queue | null, outcome: OperatorOutcome) {
  const minute = useOperationsCampaignStore.getState().elapsedMinutes;
  records = [
    ...records,
    { incidentId: incident.id, kind: incident.kind, title: incident.title, minute, queue, outcome },
  ].slice(-MAX_RECORDS);
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: the record changes whenever the operator settles an incident. */
export function subscribeOnDeviceOperator(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const seen = new Set<string>();
let chain: Promise<void> = Promise.resolve();
let users = 0;
/** Bumped on the last release, so incidents queued under an ended lease are dropped. */
let lease = 0;
let unsubscribers: Array<() => void> = [];
let controller: AbortController | null = null;
/**
 * Commands left on the operator's grant, read from the kernel's own previews
 * (null until the first). The budget is the authority's bound and never renews
 * in a session: nothing in the authority design can renew a grant with a
 * receipt, and a bound the bounded party renews is no bound.
 */
let commandsLeft: number | null = null;
/** Acknowledge and mitigate: what one correctly routed incident needs. */
const COMMANDS_PER_INCIDENT = 2;

/** What the operator has done this session, newest last. */
export function onDeviceOperatorRecords(): readonly OperatorRecord[] {
  return records;
}

function active(): boolean {
  const config = useAIConfigStore.getState();
  return config.lightsOut && config.webgpuModelReady && webgpuClient.isConnected();
}

/**
 * When the operator stands down, as workplaceAutoplay does: an emergency stop,
 * the egress drill, a control mode other than simulation, or a replay. It acts
 * again once the boundary clears, and each held incident is reported once.
 */
export type StandDown = 'emergency' | 'drill' | 'control' | 'replay' | 'budget';
export function operatorStandDown(): StandDown | null {
  const safety = useGameSimulationStore.getState();
  if (safety.emergencyActive) return 'emergency';
  if (safety.emergencyDrillMode) return 'drill';
  const controlMode = peekSCADAService()?.getState().mode;
  if (controlMode !== undefined && controlMode !== 'simulation') return 'control';
  if (useIncidentReplayStore.getState().replayMode || isWorkplaceReplayActive()) return 'replay';
  // Too few commands left to handle an incident: stand down before spending a
  // model call, and never acknowledge one it cannot then mitigate.
  if (commandsLeft !== null && commandsLeft < COMMANDS_PER_INCIDENT) return 'budget';
  return null;
}

/**
 * The shift clock is held (P, Paused, the tour, the handoff) or the tab is
 * hidden: the plant is frozen, so the operator waits, as the rest of the AI
 * layer does (aiEngine), and acts when the clock runs again. Not a boundary to
 * report: the player chose to stop time.
 */
function clockHeld(): boolean {
  const clock = useGameSimulationStore.getState();
  return clock.gameSpeed === 0 || clock.isTabVisible === false;
}

/** A recovery challenge's incident is the player's to handle. */
function playersChallenge(incidentId: string): boolean {
  return useOperationsCampaignStore.getState().activeChallenge?.incidentId === incidentId;
}

const heldNoticed = new Set<string>();
function noticeHeld(incident: OperationalIncident, reason: StandDown) {
  if (heldNoticed.has(incident.id)) return;
  heldNoticed.add(incident.id);
  // The record's 'stoodDown' reads "held at a safety boundary"; a spent budget is not one.
  addRecord(incident, null, reason === 'budget' ? 'refused' : 'stoodDown');
  notify(incident, null, 'stoodDown', { reason });
}

/** A notice's raw facts; the bell words them in the language active when it renders. */
type NoticeParams = {
  kind: string;
  title: string;
  queue: string;
  outcome: string;
  reason: string;
  problem: string;
};
const NOTICE_CATALOG = 'onDeviceOperator';
const noticeCopy = (locale: Locale) => {
  const t = createTranslator(msg, locale);
  const agent = createTranslator(agentCockpitMessages, locale);
  const copy = {
    // The route is stored as the English queue name; it is worded on screen.
    noticeTitle: (p: NoticeParams) => t('noticeTitle', { queue: jevQueueLabel(p.queue, locale) }),
    noticeMessage: (p: NoticeParams) => {
      const kind = p.kind as IncidentKind;
      // The kernel writes English; the cockpit's agentText words it for the reader.
      const problem = p.reason
        ? t(`standDown_${p.reason as StandDown}`)
        : p.problem
          ? agent('agentText', { text: p.problem })
          : '';
      return t(p.outcome as OperatorOutcome, {
        // The incident's stored title is in the language active when it fired.
        incident: incidentTitle({ kind, title: p.title }, locale),
        expected: INCIDENT_QUEUE[kind] ? jevQueueLabel(INCIDENT_QUEUE[kind], locale) : '',
        problem,
      });
    },
    // The PA line, spoken word for word: the incident and what happens next,
    // without the bell's queue name or outcome label. The key keeps its name,
    // so a line restored from the transcript still resolves.
    paMessage: (p: NoticeParams) => {
      const incident = incidentTitle({ kind: p.kind as IncidentKind, title: p.title }, locale);
      const outcome = p.outcome as OperatorOutcome;
      const reason = p.reason as StandDown | '';
      const key =
        outcome === 'handled'
          ? 'paHandled'
          : outcome === 'misrouted'
            ? 'paLeftForYou'
            : outcome === 'stoodDown' && reason === 'emergency'
              ? 'paAfterStop'
              : outcome === 'stoodDown' && reason === 'drill'
                ? 'paAfterDrill'
                : outcome === 'stoodDown' && reason !== 'budget'
                  ? 'paStandingBy'
                  : 'paOpen';
      return t(key, { incident });
    },
  };
  return copy;
};
// Keyed, so a notice the bell keeps (and a reload restores) reads in the
// language active now; the stored text is the fallback.
const noticeText = defineMessages({ en: noticeCopy('en'), 'pt-BR': noticeCopy('pt-BR') });
registerAlertCatalog(NOTICE_CATALOG, noticeText);

function notify(
  incident: OperationalIncident,
  queue: Queue | null,
  outcome: OperatorOutcome,
  detail: { reason?: StandDown; problem?: string } = {}
) {
  const params: NoticeParams = {
    kind: incident.kind,
    title: incident.title,
    queue: queue ?? '—',
    outcome,
    reason: detail.reason ?? '',
    problem: detail.problem ?? '',
  };
  const title = translate(noticeText, 'noticeTitle', params);
  const message = translate(noticeText, 'noticeMessage', params);
  // The bell keeps the record and screen readers hear it once (announce).
  useUIStore.getState().addAlert({
    // One alert per outcome: a stand-down notice is followed by the outcome
    // once the boundary clears, and a shared id would dismiss both together.
    id: `on-device-${incident.id}-${outcome}`,
    type: outcome === 'handled' ? 'info' : 'warning',
    title,
    message,
    machineId: incident.affectedMachineId ?? undefined,
    timestamp: new Date(),
    acknowledged: false,
    announce: 'polite',
    copy: { catalog: NOTICE_CATALOG, title: 'noticeTitle', message: 'noticeMessage', params },
  });
  // The PA box is what the player sees; it honours their PA mode and is not
  // read a second time.
  useAnnouncementsStore.getState().addAnnouncement({
    type: outcome === 'handled' ? 'success' : 'warning',
    message: translate(noticeText, 'paMessage', params),
    source: title,
    priority: 2,
    channel: 'operational',
    captionOnly: true,
    // Keyed, so a queued or restored caption reads in the language active now.
    copy: { catalog: NOTICE_CATALOG, key: 'paMessage', params },
  });
}

async function command(
  capabilityId: 'incident.acknowledge' | 'incident.mitigate',
  incident: OperationalIncident,
  queue: Queue
): Promise<string | null> {
  const targetUri = `millos://incident/${incident.id}`;
  const { receipt, preview } = await executeAgentCommand({
    capabilityId,
    targetUri,
    parameters: { incidentUri: targetUri },
    reason: translate(msg, 'commandReason', { queue }),
    actorUri: ON_DEVICE_OPERATOR_URI,
    grantId: ON_DEVICE_OPERATOR_GRANT_ID,
    idempotencyKey: `on-device-${capabilityId}-${incident.id}`,
  });
  const left = preview.authority?.commandsRemaining;
  if (typeof left === 'number') {
    // The kernel spends one command on every executed commit, verified or failed.
    const spent = receipt?.status === 'verified' || receipt?.status === 'failed';
    commandsLeft = Math.max(0, spent ? left - 1 : left);
  }
  if (receipt && (receipt.status === 'committed' || receipt.status === 'verified')) return null;
  // Not executed: say why, from the kernel's own problem text (English; the
  // notice words it in the reader's language as the agent cockpit shows it).
  return receipt?.problems?.[0]?.message ?? preview.problems?.[0]?.message ?? preview.status;
}

async function handle(incident: OperationalIncident, queuedUnder: number): Promise<void> {
  if (queuedUnder !== lease) return;
  // Rechecked at the moment of acting: a challenge or a boundary can start
  // between the sweep and this call. Either way, try again later.
  const boundary = operatorStandDown();
  if (!active() || boundary || playersChallenge(incident.id) || clockHeld()) {
    seen.delete(incident.id);
    if (boundary) noticeHeld(incident, boundary);
    return;
  }
  const signal = (controller ??= new AbortController()).signal;
  let queue: Queue | null = null;
  // One retry: a local call costs nothing, and about 1 in 100 score sets came
  // back unusable once and valid when asked again (Chrome, 2026-10-25).
  for (let attempt = 0; attempt < 2 && !queue && !signal.aborted; attempt++) {
    try {
      queue = (
        await requestJevAdvice({
          text: `${incident.title}\n${incident.description}`,
          apiKey: '',
          consent: false,
          signal,
          provider: 'local',
        })
      ).queue;
    } catch (error) {
      logger.warn('[OnDeviceOperator] Routing failed:', error);
    }
  }
  // Aborted by the operator's own teardown: it never got to route, so it says nothing.
  if (signal.aborted) return;
  const record = (outcome: OperatorOutcome, problem?: string) => {
    addRecord(incident, queue, outcome);
    notify(incident, queue, outcome, { problem });
  };
  if (!queue) return record('unrouted');
  if (queue === 'No current incident' || queue === 'Insufficient evidence')
    return record('heldBack');

  const live = useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id);
  if (!live || live.phase !== 'raised') return; // the player got there first
  // Routing takes seconds: a boundary or a challenge may have begun meanwhile,
  // or the player may have switched lights-out off or unloaded the model.
  const late = operatorStandDown();
  if (!active() || late || playersChallenge(incident.id) || clockHeld()) {
    seen.delete(incident.id);
    if (late) noticeHeld(incident, late);
    return;
  }
  const acknowledged = await command('incident.acknowledge', incident, queue);
  if (acknowledged) return record('refused', acknowledged);
  if (queue !== INCIDENT_QUEUE[incident.kind]) return record('misrouted');
  const mitigated = await command('incident.mitigate', incident, queue);
  return record(mitigated ? 'refused' : 'handled', mitigated ?? undefined);
}

function sweep(): void {
  if (!active() || clockHeld()) return;
  const boundary = operatorStandDown();
  const queuedUnder = lease;
  for (const incident of useOperationsCampaignStore.getState().incidents) {
    if (incident.phase !== 'raised' || seen.has(incident.id)) continue;
    if (playersChallenge(incident.id)) continue;
    if (boundary) {
      noticeHeld(incident, boundary);
      continue;
    }
    seen.add(incident.id);
    // One at a time, in the order raised: the fast lane serves one call at a time too.
    chain = chain
      .then(() => handle(incident, queuedUnder))
      .catch((error) => {
        logger.warn('[OnDeviceOperator] Incident handling failed:', error);
      });
  }
}

/** Start watching for raised incidents. Leased like initializeAIEngine; returns its release. */
export function initializeOnDeviceOperator(): () => void {
  users += 1;
  if (users === 1) {
    unsubscribers = [
      useOperationsCampaignStore.subscribe(sweep),
      // Incidents raised before the model was ready, or while lights-out was off.
      useAIConfigStore.subscribe((state, previous) => {
        if (
          state.webgpuModelReady !== previous.webgpuModelReady ||
          state.lightsOut !== previous.lightsOut
        )
          sweep();
      }),
      // A cleared boundary resumes the operator at once, not at the next campaign tick.
      useGameSimulationStore.subscribe((state, previous) => {
        if (
          state.emergencyActive !== previous.emergencyActive ||
          state.emergencyDrillMode !== previous.emergencyDrillMode ||
          // A held clock or hidden tab releasing resumes it too.
          (state.gameSpeed === 0) !== (previous.gameSpeed === 0) ||
          state.isTabVisible !== previous.isTabVisible
        )
          sweep();
      }),
      useIncidentReplayStore.subscribe((state, previous) => {
        if (state.replayMode !== previous.replayMode) sweep();
      }),
    ];
    sweep();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users = Math.max(0, users - 1);
    if (users > 0) return;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
    lease += 1;
    controller?.abort();
    controller = null;
    commandsLeft = null;
    seen.clear();
    heldNoticed.clear();
  };
}
