import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagValue } from './scada/types';

/**
 * In SCADA simulation mode (the default) the bridge eases each machine's load.
 * A mill that is running with no feed (order packed and waiting on dispatch,
 * or silos dry) kept working load, 80%, while its feed tag read 0. Working if
 * the bridge eases it to the idle level, as the offline model does.
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
import { useMaterialFlowStore } from './stores/materialFlowStore';
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

const sample = () =>
  valueCallbacks[0]([{ tagId: 'RM101.ST001.PV', value: 1200, quality: 'GOOD', timestamp: 1 }]);

let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  valueCallbacks.length = 0;
  gameBefore = useGameSimulationStore.getState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useProductionStore.setState({ machines: [mill], productionSpeed: 1, scadaLive: false });
});

afterEach(() => {
  vi.useRealTimers();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useGameSimulationStore.setState(gameBefore, true);
});

describe('SCADA bridge load of a starved mill', () => {
  it('eases a running mill with no feed to the idle level', async () => {
    const flow = useMaterialFlowStore.getState();
    const buffers = new Map(flow.machineBuffers);
    buffers.set('rm-101', { ...buffers.get('rm-101')!, inputBuffer: [] });
    useMaterialFlowStore.setState({ machineBuffers: buffers });
    for (let second = 0; second < 12; second++) {
      useMaterialFlowStore.getState().tickMaterialFlow(1, 1, {
        sourceMaterial: 'wheat_grain',
        finishedMaterial: 'flour',
        remainingFinishedKg: 0,
      });
    }
    expect(useMaterialFlowStore.getState().getMachineFeedRate('rm-101')).toBe(0);

    useGameSimulationStore.setState({ gameSpeed: 30 });
    const cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    sample();
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000);
      sample();
    }
    cleanup();
    expect(useProductionStore.getState().machines[0].metrics.load).toBeLessThan(5);
  });
});
