import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagValue } from './scada/types';

/**
 * In SCADA simulation mode (the default, enableSCADA is on in every preset)
 * the bridge, not the offline model, eases each machine's load. That load
 * drives wear and the energy bill, both read on game time, so it must ease on
 * plant time: frozen while paused, and the same over the same game time at
 * every pace.
 */
const valueCallbacks: Array<(values: TagValue[]) => void> = [];
const fakeService = {
  subscribeToValues: (callback: (values: TagValue[]) => void) => {
    valueCallbacks.push(callback);
    return () => undefined;
  },
  subscribeToAlarms: () => () => undefined,
  getActiveAlarms: () => [],
  getState: () => ({ mode: 'simulation', connected: true }),
  updateMachineStates: () => undefined,
  updateOperationalValues: () => undefined,
  // The bridge binds the mills' roll-speed setpoints to the line rate.
  writeSetpoint: async () => true,
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
import { useGameSimulationStore } from './stores/gameSimulationStore';
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
  metrics: { rpm: 1200, temperature: 50, vibration: 1.6, load: 0 },
} as unknown as MachineData;

const sample = () =>
  valueCallbacks[0]([{ tagId: 'RM101.ST001.PV', value: 1200, quality: 'GOOD', timestamp: 1 }]);

let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  valueCallbacks.length = 0;
  gameBefore = useGameSimulationStore.getState();
  useProductionStore.setState({ machines: [mill], productionSpeed: 1, scadaLive: false });
});

afterEach(() => {
  vi.useRealTimers();
  useGameSimulationStore.setState(gameBefore, true);
});

/** Load after `gameSeconds` of game time at `gameSpeed`, one SCADA sample per real second. */
async function loadAfter(gameSpeed: number, gameSeconds: number) {
  useProductionStore.setState({ machines: [mill], productionSpeed: 1, scadaLive: false });
  useGameSimulationStore.setState({ gameSpeed });
  valueCallbacks.length = 0;
  const cleanup = initializeSCADASync();
  await vi.advanceTimersByTimeAsync(0);
  sample(); // first sample after connect
  const samples = Math.round(gameSeconds / gameSpeed);
  for (let i = 0; i < samples; i++) {
    vi.advanceTimersByTime(1000);
    sample();
  }
  cleanup();
  return useProductionStore.getState().machines[0].metrics.load;
}

describe('SCADA bridge load easing runs on plant time', () => {
  it('ramps load the same over the same game time at every pace', async () => {
    const standard = await loadAfter(30, 240);
    const quadruple = await loadAfter(120, 240);
    expect(standard).toBeGreaterThan(20);
    expect(standard).toBeLessThan(79);
    expect(Math.abs(quadruple - standard)).toBeLessThan(1);
  });

  it('holds load while paused', async () => {
    const paused = await loadAfter(0, 0);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    valueCallbacks.length = 0;
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000);
      sample();
    }
    cleanup();
    expect(useProductionStore.getState().machines[0].metrics.load).toBe(paused);
  });
});
