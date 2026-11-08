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
  // onEngineLost: aiConfigStore subscribes to it when it loads.
  webgpuClient: { isConnected: mocks.isConnected, onEngineLost: () => () => undefined },
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
      // The stand-down notice and the outcome are separate alerts: dismissing
      // one must not take the other with it.
      const ids = useUIStore.getState().alerts.map((alert) => alert.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    }
  );

  it('does not act on a route that returns after lights-out was switched off', async () => {
    let route!: (advice: { queue: string; receivedAt: number }) => void;
    mocks.requestJevAdvice.mockImplementation(
      () =>
        new Promise((resolve) => {
          route = resolve;
        })
    );
    const incident = await raise('bearing_overheat');
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(1);
    // The player hands control back while the local model is still routing.
    useAIConfigStore.setState({ lightsOut: false });
    route({ queue: 'Equipment maintenance', receivedAt: 0 });
    for (let i = 0; i < 5; i++) await settle();
    expect(calls()).toEqual([]);
    expect(
      useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id)?.phase
    ).toBe('raised');
  });

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
    // The visible box: the PA caption, spoken word for word, so it says what
    // happened as a sentence, without the bell's queue label; not read twice.
    const pa = useAnnouncementsStore.getState().announcements.at(-1);
    expect(pa?.message).toBe(`${incident.title}. The AI has dealt with it.`);
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

  it('asks the local model once more after an unusable answer, and stops there', async () => {
    mocks.requestJevAdvice
      .mockRejectedValueOnce(new Error('invalid'))
      .mockResolvedValueOnce({ queue: 'Logistics coordination', receivedAt: 0 });
    await raise('severe_rain');
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(2);
    expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);

    mocks.requestJevAdvice.mockReset().mockRejectedValue(new Error('invalid'));
    await raise('delayed_truck');
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(2);
    expect(lastAlert().message).toContain('no route');
  });

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

  // F33: on teardown the abort made the routing call throw, and the operator
  // filed a false "no route" notice for an incident it never got to route.
  it('files nothing for a routing call aborted by its own teardown', async () => {
    mocks.requestJevAdvice.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const incident = await raise('bearing_overheat');
    // A second incident waits its turn behind the first.
    await raise('delayed_truck');
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(1);
    release();
    for (let i = 0; i < 5; i++) await settle();
    // Nor does the queue behind it run after the release.
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().alerts).toHaveLength(0);
    expect(useAnnouncementsStore.getState().announcements).toHaveLength(0);
    expect(onDeviceOperatorRecords().some((r) => r.incidentId === incident.id)).toBe(false);
  });

  // F29: the grant's 500-command budget never renews in a session. Once fewer
  // than the two commands an incident needs are left, the operator stops
  // spending model calls, never half-handles an incident, and says why.
  it('stands down once its command budget cannot cover another incident', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    const spent = (left: number) => ({
      receipt: { status: 'verified', problems: [] },
      preview: { status: 'ready', authority: { commandsRemaining: left } },
    });
    mocks.executeAgentCommand.mockResolvedValueOnce(spent(2)).mockResolvedValueOnce(spent(1));
    await raise('bearing_overheat');
    expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(1);

    const next = await raise('power_sag');
    expect(mocks.requestJevAdvice).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
    expect(lastAlert().message).toBe(
      `${next.title}: left raised because the on-device AI has used its command budget for this session.`
    );
    useOperationsCampaignStore.setState({}); // another campaign tick: no second notice
    expect(useUIStore.getState().alerts.filter((a) => a.id.includes(next.id))).toHaveLength(1);
    expect(
      useOperationsCampaignStore.getState().incidents.find((i) => i.id === next.id)?.phase
    ).toBe('raised');
    // The session record shows it as left raised, not as held at a safety boundary.
    expect(onDeviceOperatorRecords().at(-1)).toMatchObject({
      incidentId: next.id,
      outcome: 'refused',
    });
  });

  // The rest of the AI layer holds while the shift clock is held (P, Paused,
  // the tour, the handoff) or the tab is hidden: the plant is frozen. The
  // operator still routed, acknowledged and mitigated an incident the player
  // had paused to read, in no plant time at all.
  // Working if it waits for the clock and then handles the incident.
  it.each([
    ['the shift clock is held', { gameSpeed: 0 }],
    ['the tab is hidden', { isTabVisible: false }],
  ] as const)('waits while %s and acts once the plant runs again', async (_name, held) => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    const running = useGameSimulationStore.getState();
    const resume = { gameSpeed: running.gameSpeed, isTabVisible: running.isTabVisible };
    useGameSimulationStore.setState(held);
    try {
      const incident = await raise('bearing_overheat');
      expect(mocks.requestJevAdvice).not.toHaveBeenCalled();
      expect(calls()).toEqual([]);
      expect(useUIStore.getState().alerts).toHaveLength(0);
      useGameSimulationStore.setState(resume);
      for (let i = 0; i < 5; i++) await settle();
      expect(calls()).toEqual(['incident.acknowledge', 'incident.mitigate']);
      expect(onDeviceOperatorRecords().at(-1)).toMatchObject({
        incidentId: incident.id,
        outcome: 'handled',
      });
    } finally {
      useGameSimulationStore.setState(resume);
    }
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
