import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A mill's feed tag averages the last few plant seconds of the material model.
 * When production stops, the material store writes once (its flow rates drop
 * to zero) and then stays silent, so the telemetry bridge published the window
 * as it stood on that first stopped tick, about nine tenths of the running
 * rate, and the Machine Inspector read a stopped mill as still being fed for as
 * long as the stop lasted. Working if a stopped line's feed tags reach zero.
 */
const published: Array<Readonly<Record<string, number>>> = [];
const fakeService = {
  subscribeToValues: () => () => undefined,
  subscribeToAlarms: () => () => undefined,
  getActiveAlarms: () => [],
  getState: () => ({ mode: 'simulation', connected: true }),
  updateMachineStates: () => undefined,
  updateOperationalValues: (values: Readonly<Record<string, number>>) => {
    published.push({ ...values });
  },
  stop: async () => undefined,
};

vi.mock('./scada/SCADAService', () => ({
  initializeSCADA: async () => fakeService,
  shutdownSCADA: () => undefined,
  getSCADAService: () => fakeService,
  peekSCADAService: () => fakeService,
}));

import { initializeSCADASync } from './store';
import { useMaterialFlowStore } from './stores/materialFlowStore';

const lastFeed = (tagId: string) => published[published.length - 1]?.[tagId];

describe('mill feed tags when production stops', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    published.length = 0;
    useMaterialFlowStore.getState().resetMaterialFlow();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes zero feed once the stop has outlasted the feed window', async () => {
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);

    for (let i = 0; i < 20; i += 1) useMaterialFlowStore.getState().tickMaterialFlow(0.5, 1);
    expect(lastFeed('RM102.FT001.PV')).toBeGreaterThan(0);

    // Production stopped: the central tick keeps calling with speed 0.
    for (let i = 0; i < 40; i += 1) {
      useMaterialFlowStore.getState().tickMaterialFlow(0.5, 0);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(lastFeed('RM102.FT001.PV')).toBe(0);
    expect(lastFeed('UTILITY.FT002.PV')).toBe(0);

    cleanup();
  });
});
