import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plan item 7.4, the wiring: the campaign's control-network incident reaches
 * the SCADA simulation, which serves a seeded subset of tags UNCERTAIN while it
 * is open, and lets go when it is resolved. Before this, nothing in scada/ read
 * the incident, so its history note's "your SCADA view may be stale" was false.
 */
const { degradation, fakeService } = vi.hoisted(() => {
  const degradation: Array<string | null> = [];
  const fakeService = {
    subscribeToValues: () => () => undefined,
    subscribeToAlarms: () => () => undefined,
    getActiveAlarms: () => [],
    getState: () => ({ mode: 'simulation', connected: true }),
    updateMachineStates: () => undefined,
    updateOperationalValues: () => undefined,
    // The bridge binds the mills' roll-speed setpoints to the line rate.
    writeSetpoint: async () => true,
    setNetworkDegradation: (key: string | null) => {
      degradation.push(key);
    },
    stop: async () => undefined,
  };
  return { degradation, fakeService };
});

vi.mock('./scada/SCADAService', () => ({
  initializeSCADA: async () => fakeService,
  shutdownSCADA: () => undefined,
  getSCADAService: () => fakeService,
  peekSCADAService: () => fakeService,
}));

import { initializeSCADASync } from './store';
import { useOperationsCampaignStore } from './stores/operationsCampaignStore';

describe('the control-network incident reaches SCADA', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    degradation.length = 0;
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => vi.useRealTimers());

  it('degrades the network while the incident is open, keyed by the incident, and restores it on resolve', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    expect(degradation.at(-1) ?? null).toBeNull();

    const incident = useOperationsCampaignStore
      .getState()
      .triggerIncident('control_network_degraded');
    expect(incident).toBeTruthy();
    await vi.advanceTimersByTimeAsync(0);
    const id = useOperationsCampaignStore
      .getState()
      .incidents.find((i) => i.kind === 'control_network_degraded')!.id;
    expect(degradation.at(-1)).toBe(id);

    useOperationsCampaignStore.getState().resolveIncident(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(degradation.at(-1)).toBeNull();
    cleanup();
  });

  it('degrades nothing for another kind of incident', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    await vi.advanceTimersByTimeAsync(0);
    expect(degradation.filter((key) => key !== null)).toEqual([]);
    cleanup();
  });
});
