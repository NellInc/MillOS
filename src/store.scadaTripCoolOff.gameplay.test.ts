import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagValue } from './scada/types';

/**
 * In SCADA simulation mode (the default) the store owns machine status and the
 * offline machine model is off, so nothing lifted a metric-only trip: a unit
 * tripped while SCADA was off (or restored critical from such a session) stayed
 * 'critical' once SCADA came back, cold and still, until someone maintained it.
 * Working if the bridge lifts it to 'warning' once the adapter reads it cooled,
 * as the offline model does, while a wear breakdown, an open repair or a
 * facility stop still holds it.
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
  acknowledgeAlarm: () => undefined,
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
import { useBreakdownStore } from './stores/breakdownStore';
import { MachineType, type MachineData } from './types';

const trippedMill = (wear = 10) =>
  ({
    id: 'rm-101',
    name: 'R.M. 101',
    type: MachineType.ROLLER_MILL,
    status: 'critical',
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    lastMaintenance: '',
    nextMaintenance: '',
    metrics: { rpm: 0, temperature: 85, vibration: 8.5, load: 0, wear },
  }) as unknown as MachineData;

const sample = (temperature: number, vibration: number) =>
  valueCallbacks[0]([
    { tagId: 'RM101.ST001.PV', value: 0, quality: 'UNCERTAIN', timestamp: 1 },
    // A stopped unit's condition transmitters still measure (SimulationAdapter).
    { tagId: 'RM101.TT001.PV', value: temperature, quality: 'GOOD', timestamp: 1 },
    { tagId: 'RM101.VT001.PV', value: vibration, quality: 'GOOD', timestamp: 1 },
  ]);

const status = () => useProductionStore.getState().machines[0].status;

let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;
let breakdownBefore: ReturnType<typeof useBreakdownStore.getState>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  valueCallbacks.length = 0;
  gameBefore = useGameSimulationStore.getState();
  breakdownBefore = useBreakdownStore.getState();
  useProductionStore.setState({ machines: [trippedMill()], productionSpeed: 1, scadaLive: false });
});

afterEach(() => {
  vi.useRealTimers();
  useGameSimulationStore.setState(gameBefore, true);
  useBreakdownStore.setState(breakdownBefore, true);
});

const runSamples = async (temperature: number, vibration: number) => {
  const cleanup = initializeSCADASync();
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 3; i++) {
    sample(temperature, vibration);
    vi.advanceTimersByTime(1000);
  }
  cleanup();
};

describe('SCADA bridge lifts a cooled metric-only trip', () => {
  it('lifts a cold, still mill from critical to warning', async () => {
    await runSamples(24, 0.3);
    expect(status()).toBe('warning');
  });

  it('keeps a mill that still reads hot critical', async () => {
    await runSamples(60, 0.3);
    expect(status()).toBe('critical');
  });

  it('keeps a wear breakdown critical however cold it reads', async () => {
    useProductionStore.setState({ machines: [trippedMill(99)] });
    await runSamples(24, 0.3);
    expect(status()).toBe('critical');
  });

  it('keeps a unit with an open repair critical', async () => {
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'overheating');
    await runSamples(24, 0.3);
    expect(status()).toBe('critical');
  });

  it('keeps a tripped unit critical while a facility stop holds', async () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    await runSamples(24, 0.3);
    expect(status()).toBe('critical');
  });
});
