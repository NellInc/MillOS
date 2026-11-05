import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import {
  useOperationsCampaignStore,
  type OperationalIncident,
} from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';

// A preview is read by a person before it is committed. Two commands hashed a
// whole live list into the revision the preview observed:
//  - scada.acknowledge-alarm read every active alarm, and the AlarmManager
//    rewrites a standing alarm's value on every evaluation, so the preview went
//    stale while the player read it and Commit was always refused.
//  - incident.acknowledge and incident.mitigate read every incident, so a new
//    incident raised elsewhere refused the player's answer to this one.
// Working if those changes leave the preview committable, while a change to the
// target itself (acknowledged elsewhere) still makes it stale.

const fake = vi.hoisted(() => {
  type FakeAlarm = {
    id: string;
    tagId: string;
    tagName: string;
    type: string;
    state: string;
    priority: string;
    value: number;
    threshold: number;
    timestamp: number;
    acknowledgedAt?: number;
    acknowledgedBy?: string;
  };
  const alarms: FakeAlarm[] = [];
  const service = {
    getState: () => ({ connected: true, mode: 'simulation', lastUpdate: 0, tagCount: 0 }),
    getActiveAlarms: () => alarms,
    getAllTags: () => [],
    getValue: () => undefined,
    getTagDefinition: () => undefined,
    acknowledgeAlarm: (id: string, by: string) => {
      const alarm = alarms.find((candidate) => candidate.id === id);
      if (!alarm || alarm.acknowledgedAt !== undefined) return false;
      alarm.acknowledgedAt = 1_000;
      alarm.acknowledgedBy = by;
      alarm.state = 'ACKED';
      return true;
    },
  };
  return { alarms, service };
});

vi.mock('../../scada/SCADAService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../scada/SCADAService')>()),
  peekSCADAService: () => fake.service,
  getSCADAService: () => fake.service,
}));

const api = () => window.__MILLOS_AGENT__!;

const alarm = (id: string, value: number) => ({
  id,
  tagId: id.replace(/-HI$/, ''),
  tagName: id,
  type: 'HI',
  state: 'UNACK',
  priority: 'HIGH',
  value,
  threshold: 70,
  timestamp: 500,
});

const incident = (id: string): OperationalIncident => ({
  id,
  kind: 'bearing_overheat',
  title: 'Bearing overheat',
  description: 'A bearing is running hot.',
  phase: 'raised',
  severity: 'medium',
  startedAtMinute: 10,
  acknowledgedAtMinute: null,
  resolvedAtMinute: null,
  affectedMachineId: null,
  effectApplied: false,
});

const preview = async (capabilityId: string, targetUri: string, key: string) => {
  const result = await api().preview(
    api().draft({
      capabilityId,
      targetUri,
      parameters: { [key]: targetUri },
      reason: 'Answer this one.',
    })
  );
  expect(result.status).not.toBe('denied');
  return result;
};

describe('a previewed command whose live list moves while the player reads it', () => {
  const removals: Array<() => void> = [];
  beforeEach(() => {
    setLocale('en');
    fake.alarms.splice(0, fake.alarms.length, alarm('TT-101-HI', 80), alarm('PT-201-HI', 5));
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    useOperationsCampaignStore.setState({ incidents: [incident('incident-0901')] });
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('acknowledges an alarm whose standing value moved after the preview', async () => {
    const shown = await preview('scada.acknowledge-alarm', 'millos://alarm/TT-101-HI', 'alarmUri');
    // The AlarmManager's next evaluation of both standing conditions.
    fake.alarms[0].value = 82.4;
    fake.alarms[1].value = 6.1;
    const receipt = await api().commit(shown);
    expect(receipt.problems.map((problem) => problem.code)).not.toContain('STALE_REVISION');
    expect(receipt.status).toBe('verified');
  });

  it('acknowledges an alarm after another alarm was raised', async () => {
    const shown = await preview('scada.acknowledge-alarm', 'millos://alarm/TT-101-HI', 'alarmUri');
    fake.alarms.push(alarm('LT-301-HI', 95));
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('verified');
  });

  it('still refuses an alarm acknowledged elsewhere after the preview', async () => {
    const shown = await preview('scada.acknowledge-alarm', 'millos://alarm/TT-101-HI', 'alarmUri');
    fake.service.acknowledgeAlarm('TT-101-HI', 'millos://actor/human-operator');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('rejected');
    expect(receipt.problems.map((problem) => problem.code)).toContain('STALE_REVISION');
  });

  it.each([
    ['incident.acknowledge', 'verified'],
    ['incident.mitigate', 'verified'],
  ])('%s commits after another incident was raised', async (capabilityId, status) => {
    const shown = await preview(capabilityId, 'millos://incident/incident-0901', 'incidentUri');
    useOperationsCampaignStore.setState((state) => ({
      incidents: [...state.incidents, incident('incident-0902')],
    }));
    const approval =
      shown.status === 'requires-approval'
        ? api().approve(shown.previewId, 'Approved as shown.')
        : undefined;
    const receipt = await api().commit(shown, approval);
    expect(receipt.problems.map((problem) => problem.code)).not.toContain('STALE_REVISION');
    expect(receipt.status).toBe(status);
  });

  // Mitigating or resolving any incident counts up the shift's automatic
  // actions, which mitigate declares it writes; that tally is no reason to
  // refuse the player's mitigation of a different incident.
  it('incident.mitigate commits after another incident was mitigated and resolved', async () => {
    useOperationsCampaignStore.setState((state) => ({
      incidents: [...state.incidents, incident('incident-0902')],
    }));
    const shown = await preview(
      'incident.mitigate',
      'millos://incident/incident-0901',
      'incidentUri'
    );
    useOperationsCampaignStore.getState().mitigateIncident('incident-0902', 'controller');
    useOperationsCampaignStore.getState().resolveIncident('incident-0902', 'controller');
    const receipt = await api().commit(shown, api().approve(shown.previewId, 'Approved as shown.'));
    expect(receipt.problems.map((problem) => problem.code)).not.toContain('STALE_REVISION');
    expect(receipt.status).toBe('verified');
  });

  it('still refuses an incident acknowledged elsewhere after the preview', async () => {
    const shown = await preview(
      'incident.acknowledge',
      'millos://incident/incident-0901',
      'incidentUri'
    );
    useOperationsCampaignStore.getState().acknowledgeIncident('incident-0901', 'operator');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('rejected');
    expect(receipt.problems.map((problem) => problem.code)).toContain('STALE_REVISION');
  });
});
