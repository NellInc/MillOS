import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagValue } from './scada/types';

/**
 * scadaLive tells the offline machine model (MachineSimulationController) that
 * SCADA is feeding the store. A connection Apply whose adapter cannot connect
 * (a REST URL that does not answer) stops every sample; the flag must drop so
 * the plant's metrics keep moving instead of freezing for the session. A
 * healthy link that is merely quiet keeps it.
 */
const valueCallbacks: Array<(values: TagValue[]) => void> = [];
let linkUp = true;
const fakeService = {
  subscribeToValues: (callback: (values: TagValue[]) => void) => {
    valueCallbacks.push(callback);
    return () => undefined;
  },
  subscribeToAlarms: () => () => undefined,
  getActiveAlarms: () => [],
  getState: () => ({ mode: 'live', connected: linkUp }),
  updateMachineStates: () => undefined,
  updateOperationalValues: () => undefined,
  stop: async () => undefined,
};

vi.mock('./scada/SCADAService', () => ({
  initializeSCADA: async () => fakeService,
  shutdownSCADA: () => undefined,
  getSCADAService: () => fakeService,
  peekSCADAService: () => fakeService,
}));

import { initializeSCADASync } from './store';
import { useProductionStore } from './stores/productionStore';
import { MachineType, type MachineData } from './types';

const mill = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  status: 'running',
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  lastMaintenance: '',
  nextMaintenance: '',
  metrics: { rpm: 1200, temperature: 50, vibration: 1.6, load: 80 },
} as unknown as MachineData;

describe('initializeSCADASync scadaLive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    valueCallbacks.length = 0;
    linkUp = true;
    useProductionStore.setState({ machines: [mill], scadaLive: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops scadaLive when the adapter link is down', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    expect(valueCallbacks).toHaveLength(1);

    valueCallbacks[0]([{ tagId: 'RM101.ST001.PV', value: 1200, quality: 'GOOD', timestamp: 1 }]);
    expect(useProductionStore.getState().scadaLive).toBe(true);

    // The Apply's adapter failed to connect: no further samples.
    linkUp = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(useProductionStore.getState().scadaLive).toBe(false);

    cleanup();
  });

  it('stays live through a quiet minute on a healthy link', async () => {
    // A REST poll interval may be up to 60 s; an on-change broker can be silent.
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);

    valueCallbacks[0]([{ tagId: 'RM101.ST001.PV', value: 1200, quality: 'GOOD', timestamp: 1 }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useProductionStore.getState().scadaLive).toBe(true);

    cleanup();
  });
});
