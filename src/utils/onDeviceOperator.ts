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
import { translate } from '../i18n';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import {
  useOperationsCampaignStore,
  type IncidentKind,
  type OperationalIncident,
} from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { requestJevAdvice, type JevAdvice } from './jevClient';
import { logger } from './logger';
import { onDeviceOperatorMessages as msg } from './onDeviceOperator.messages';
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

export type OperatorOutcome = 'handled' | 'misrouted' | 'heldBack' | 'unrouted' | 'refused';

export interface OperatorRecord {
  incidentId: string;
  kind: IncidentKind;
  queue: Queue | null;
  outcome: OperatorOutcome;
}

const MAX_RECORDS = 200;
const records: OperatorRecord[] = [];
const seen = new Set<string>();
let chain: Promise<void> = Promise.resolve();
let users = 0;
let unsubscribers: Array<() => void> = [];
let controller: AbortController | null = null;

/** What the operator has done this session, newest last. */
export function onDeviceOperatorRecords(): readonly OperatorRecord[] {
  return records;
}

function active(): boolean {
  const config = useAIConfigStore.getState();
  return config.lightsOut && config.webgpuModelReady && webgpuClient.isConnected();
}

function notify(
  incident: OperationalIncident,
  queue: Queue | null,
  outcome: OperatorOutcome,
  problem = ''
) {
  const label = { incident: incident.title, expected: INCIDENT_QUEUE[incident.kind], problem };
  const title = translate(msg, 'noticeTitle', { queue: queue ?? '—' });
  const message = translate(msg, outcome, label);
  // The bell keeps the record and screen readers hear it once (announce).
  useUIStore.getState().addAlert({
    id: `on-device-${incident.id}`,
    type: outcome === 'handled' ? 'info' : 'warning',
    title,
    message,
    machineId: incident.affectedMachineId ?? undefined,
    timestamp: new Date(),
    acknowledged: false,
    announce: 'polite',
  });
  // The PA box is what the player sees; it honours their PA mode and is not
  // read a second time.
  useAnnouncementsStore.getState().addAnnouncement({
    type: outcome === 'handled' ? 'success' : 'warning',
    message: translate(msg, 'paMessage', { title, message }),
    source: title,
    priority: 2,
    channel: 'operational',
    captionOnly: true,
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
  if (receipt && (receipt.status === 'committed' || receipt.status === 'verified')) return null;
  // Not executed: say why, from the kernel's own problem text.
  const problem = receipt?.problems?.[0]?.message ?? preview.problems?.[0]?.message;
  return problem ?? preview.status;
}

async function handle(incident: OperationalIncident): Promise<void> {
  if (!active()) {
    seen.delete(incident.id); // try again once the operator can act
    return;
  }
  const signal = (controller ??= new AbortController()).signal;
  let queue: Queue | null = null;
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
  const record = (outcome: OperatorOutcome, problem?: string) => {
    records.push({ incidentId: incident.id, kind: incident.kind, queue, outcome });
    if (records.length > MAX_RECORDS) records.shift();
    notify(incident, queue, outcome, problem);
  };
  if (!queue) return record('unrouted');
  if (queue === 'No current incident' || queue === 'Insufficient evidence')
    return record('heldBack');

  const live = useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id);
  if (!live || live.phase !== 'raised') return; // the player got there first
  const acknowledged = await command('incident.acknowledge', incident, queue);
  if (acknowledged) return record('refused', acknowledged);
  if (queue !== INCIDENT_QUEUE[incident.kind]) return record('misrouted');
  const mitigated = await command('incident.mitigate', incident, queue);
  return record(mitigated ? 'refused' : 'handled', mitigated ?? undefined);
}

function sweep(): void {
  if (!active()) return;
  for (const incident of useOperationsCampaignStore.getState().incidents) {
    if (incident.phase !== 'raised' || seen.has(incident.id)) continue;
    seen.add(incident.id);
    // One at a time, in the order raised: the fast lane serves one call at a time too.
    chain = chain
      .then(() => handle(incident))
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
    controller?.abort();
    controller = null;
    seen.clear();
  };
}
