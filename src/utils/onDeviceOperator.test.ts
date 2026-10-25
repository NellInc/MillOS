import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestJevAdvice: vi.fn(),
  executeAgentCommand: vi.fn(),
  isConnected: vi.fn(() => true),
}));
vi.mock('./jevClient', () => ({ requestJevAdvice: mocks.requestJevAdvice }));
vi.mock('../agent/client/executeAgentCommand', () => ({
  executeAgentCommand: mocks.executeAgentCommand,
}));
vi.mock('./webgpuClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webgpuClient')>()),
  webgpuClient: { isConnected: mocks.isConnected },
}));

import {
  createDefaultGrants,
  ON_DEVICE_OPERATOR_GRANT_ID,
  ON_DEVICE_OPERATOR_URI,
} from '../agent/command/authority';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useIncidentReplayStore } from '../stores/incidentReplayStore';
import {
  INCIDENT_QUEUE,
  initializeOnDeviceOperator,
  onDeviceOperatorRecords,
} from './onDeviceOperator';

const committed = { receipt: { status: 'committed', problems: [] }, preview: { status: 'ready' } };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function raise(
  kind: Parameters<ReturnType<typeof useOperationsCampaignStore.getState>['triggerIncident']>[0]
) {
  const incident = useOperationsCampaignStore.getState().triggerIncident(kind);
  for (let i = 0; i < 5; i++) await settle();
  return incident!;
}
const calls = () => mocks.executeAgentCommand.mock.calls.map(([request]) => request.capabilityId);
const lastAlert = () => useUIStore.getState().alerts[0];

describe('the on-device operator in lights-out play', () => {
  let release: () => void;
  beforeEach(() => {
    useOperationsCampaignStore.setState({ incidents: [] });
    useUIStore.setState({ alerts: [] });
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
    useAIConfigStore.setState({ lightsOut: true, webgpuModelReady: true });
    mocks.requestJevAdvice.mockReset();
    mocks.executeAgentCommand.mockReset().mockResolvedValue(committed);
    mocks.isConnected.mockReturnValue(true);
    release = initializeOnDeviceOperator();
  });
  afterEach(() => {
    release();
    useAIConfigStore.setState({ webgpuModelReady: false });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useIncidentReplayStore.setState({ replayMode: false });
    useOperationsCampaignStore.setState({ activeChallenge: null });
  });

  it.each([
    ['emergency stop', { emergencyActive: true }, 'while the emergency stop is active'],
    ['egress drill', { emergencyDrillMode: true }, 'during the egress verification drill'],
  ] as const)(
    'stands down during the %s, says so once, and resumes when it clears',
    async (_name, boundary, words) => {
      mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
      useGameSimulationStore.setState(boundary);
      const incident = await raise('bearing_overheat');
      expect(mocks.requestJevAdvice).not.toHaveBeenCalled();
      expect(lastAlert().message).toBe(`${incident.title}: left raised ${words}.`);
      useOperationsCampaignStore.setState({}); // another campaign tick: no second notice
      expect(useUIStore.getState().alerts).toHaveLength(1);
      useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
      for (let i = 0; i < 5; i++) await settle();
      expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
    }
  );

  it('stands down during a replay', async () => {
    useIncidentReplayStore.setState({ replayMode: true });
    await raise('delayed_truck');
    expect(mocks.requestJevAdvice).not.toHaveBeenCalled();
    expect(lastAlert().message).toContain('during a replay');
  });

  it("leaves a recovery challenge's incident to the player", async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    const { triggerIncident } = useOperationsCampaignStore.getState();
    // startChallenge raises the incident, then marks it the player's.
    const incident = triggerIncident('dust_filter_pressure')!;
    useOperationsCampaignStore.setState({
      activeChallenge: { incidentId: incident.id } as never,
    });
    for (let i = 0; i < 5; i++) await settle();
    expect(mocks.requestJevAdvice).not.toHaveBeenCalled();
    expect(calls()).toEqual([]);
    expect(useUIStore.getState().alerts).toHaveLength(0);
  });

  it('routes on the text alone with the on-device model, then acknowledges and mitigates a correct route', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    const incident = await raise('bearing_overheat');
    const [request] = mocks.requestJevAdvice.mock.calls[0];
    expect(request.provider).toBe('local');
    expect(request.text).toBe(`${incident.title}\n${incident.description}`);
    expect(request.text).not.toContain('bearing_overheat');
    expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
    for (const [command] of mocks.executeAgentCommand.mock.calls) {
      expect(command).toMatchObject({
        targetUri: `millos://incident/${incident.id}`,
        // The registry requires it; the kernel denies a command without it.
        parameters: { incidentUri: `millos://incident/${incident.id}` },
        actorUri: ON_DEVICE_OPERATOR_URI,
        grantId: ON_DEVICE_OPERATOR_GRANT_ID,
      });
    }
    expect(lastAlert()).toMatchObject({
      title: 'On-device AI · Equipment maintenance',
      type: 'info',
    });
    expect(lastAlert().message).toContain('acknowledged and mitigated');
    // The visible box: the PA caption, naming the AI, not read a second time.
    const pa = useAnnouncementsStore.getState().announcements.at(-1);
    expect(pa?.message).toBe(
      `On-device AI · Equipment maintenance. ${incident.title}: acknowledged and mitigated.`
    );
    expect(pa?.captionOnly).toBe(true);
    expect(onDeviceOperatorRecords().at(-1)).toMatchObject({
      incidentId: incident.id,
      outcome: 'handled',
    });
  });

  it('acknowledges a misroute, leaves it for the player and says where it belongs', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Product quality', receivedAt: 0 });
    await raise('delayed_truck');
    expect(calls()).toEqual(['incident.acknowledge']);
    expect(lastAlert().type).toBe('warning');
    expect(lastAlert().message).toContain(INCIDENT_QUEUE.delayed_truck);
  });

  it.each(['No current incident', 'Insufficient evidence'] as const)(
    'changes nothing when the route is %s',
    async (queue) => {
      mocks.requestJevAdvice.mockResolvedValue({ queue, receivedAt: 0 });
      const incident = await raise('severe_rain');
      expect(calls()).toEqual([]);
      expect(
        useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id)?.phase
      ).toBe('raised');
      expect(lastAlert().message).toContain('left raised');
    }
  );

  it('reports a refused command instead of claiming success', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValueOnce({
      receipt: { status: 'rejected', problems: [{ message: 'Incident must be raised.' }] },
      preview: { status: 'denied' },
    });
    await raise('power_sag');
    expect(calls()).toEqual(['incident.acknowledge']);
    expect(lastAlert().message).toContain('Incident must be raised.');
  });

  it('waits while lights-out is off or the model is not loaded, then handles what was raised', async () => {
    useAIConfigStore.setState({ lightsOut: false });
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Product quality', receivedAt: 0 });
    await raise('supplier_contamination');
    expect(mocks.requestJevAdvice).not.toHaveBeenCalled();
    useAIConfigStore.setState({ lightsOut: true });
    for (let i = 0; i < 5; i++) await settle();
    expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
  });
});

describe('the on-device operator grant', () => {
  const grant = createDefaultGrants(new Date()).find((g) => g.id === ON_DEVICE_OPERATOR_GRANT_ID)!;

  it('covers acknowledging and mitigating simulated incidents and nothing else', () => {
    expect(grant.actorUri).toBe(ON_DEVICE_OPERATOR_URI);
    expect(grant.capabilityIds).toEqual(['incident.acknowledge', 'incident.mitigate']);
    expect(grant.targetUriPrefixes).toEqual(['millos://incident/']);
    expect(grant.modes).toEqual(['simulation']);
    expect(grant.riskCeiling).toBe('high');
    expect(grant.approvalRisks).toEqual(['critical']);
    expect(grant.resourceBudget.maximumExternalCalls).toBe(0);
  });
});
