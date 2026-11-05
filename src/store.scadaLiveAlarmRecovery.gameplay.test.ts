import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm, TagValue } from './scada/types';

/**
 * Live SCADA (a REST or MQTT link) may escalate a running unit from its own
 * alarms, and the offline machine model is off while it is live. Nothing ever
 * lifted that escalation: once a CRITICAL alarm returned to normal the unit
 * stayed stopped until someone maintained it, and a HIGH alarm's warning (a
 * quality penalty) stood for good. Working if, once no standing alarm on the
 * unit justifies its status and the readings are cool, 'critical' steps back
 * to 'warning' and 'warning' then follows the plant's warning-to-running rule,
 * while a wear breakdown, an open repair or a facility stop still holds it.
 */
const valueCallbacks: Array<(values: TagValue[]) => void> = [];
let activeAlarms: Alarm[] = [];
let lastConnectTime: number | undefined;
const fakeService = {
  subscribeToValues: (callback: (values: TagValue[]) => void) => {
    valueCallbacks.push(callback);
    return () => undefined;
  },
  subscribeToAlarms: () => () => undefined,
  getActiveAlarms: () => activeAlarms,
  getState: () => ({ mode: 'rest', connected: true }),
  getConnectionStatus: () => ({ connected: true, reconnectAttempts: 0, lastConnectTime }),
  updateMachineStates: () => undefined,
  updateOperationalValues: () => undefined,
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
import { ALARM_STARTUP_WARMUP_MS } from './scada/AlarmManager';
import { useProductionStore } from './stores/productionStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { useBreakdownStore } from './stores/breakdownStore';
import { MachineType, type MachineData } from './types';

const mill = (status: MachineData['status'], wear = 10) =>
  ({
    id: 'rm-101',
    name: 'R.M. 101',
    type: MachineType.ROLLER_MILL,
    status,
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    lastMaintenance: '',
    nextMaintenance: '',
    metrics: { rpm: 1200, temperature: 40, vibration: 1.5, load: 80, wear },
  }) as unknown as MachineData;

const alarm = (priority: Alarm['priority'], state: Alarm['state'] = 'UNACK'): Alarm => ({
  id: `RM101.TT001.PV-${priority}`,
  tagId: 'RM101.TT001.PV',
  tagName: 'RM101 bearing',
  type: priority === 'CRITICAL' ? 'HIHI' : 'HI',
  state,
  priority,
  value: 80,
  threshold: 75,
  timestamp: 1,
  machineId: 'rm-101',
});

const sample = (temperature: number, vibration: number, feed = 24) =>
  valueCallbacks[valueCallbacks.length - 1]([
    { tagId: 'RM101.ST001.PV', value: 1200, quality: 'GOOD', timestamp: 1 },
    { tagId: 'RM101.TT001.PV', value: temperature, quality: 'GOOD', timestamp: 1 },
    { tagId: 'RM101.VT001.PV', value: vibration, quality: 'GOOD', timestamp: 1 },
    { tagId: 'RM101.FT001.PV', value: feed, quality: 'GOOD', timestamp: 1 },
  ]);

const status = () => useProductionStore.getState().machines[0].status;

let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;
let breakdownBefore: ReturnType<typeof useBreakdownStore.getState>;
let cleanup: (() => void) | null = null;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  valueCallbacks.length = 0;
  activeAlarms = [];
  lastConnectTime = undefined;
  gameBefore = useGameSimulationStore.getState();
  breakdownBefore = useBreakdownStore.getState();
  useProductionStore.setState({
    machines: [mill('running')],
    productionSpeed: 1,
    scadaLive: false,
  });
  cleanup = initializeSCADASync();
  await vi.advanceTimersByTimeAsync(0);
  // Past the AlarmManager warm-up (and the bridge's spare sample).
  await vi.advanceTimersByTimeAsync(ALARM_STARTUP_WARMUP_MS + 2000);
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
  useGameSimulationStore.setState(gameBefore, true);
  useBreakdownStore.setState(breakdownBefore, true);
});

const tick = (temperature = 40, vibration = 1.5, feed = 24) => {
  sample(temperature, vibration, feed);
  vi.advanceTimersByTime(1000);
};

const tripOnCriticalAlarm = () => {
  activeAlarms = [alarm('CRITICAL')];
  tick(80, 1.5);
  expect(status()).toBe('critical');
};

describe('live SCADA alarm escalation lifts once the alarm has returned', () => {
  it('steps a returned CRITICAL alarm back to warning, then to running', () => {
    tripOnCriticalAlarm();
    activeAlarms = [];
    tick();
    expect(status()).toBe('warning');
    tick();
    expect(status()).toBe('running');
  });

  it('treats a returned-to-normal alarm awaiting acknowledgement as returned', () => {
    tripOnCriticalAlarm();
    activeAlarms = [alarm('CRITICAL', 'RTN_UNACK')];
    tick();
    expect(status()).toBe('warning');
  });

  it('keeps the unit critical while the CRITICAL alarm still stands', () => {
    tripOnCriticalAlarm();
    tick();
    tick();
    expect(status()).toBe('critical');
  });

  it('keeps the unit critical while it still reads hot', () => {
    tripOnCriticalAlarm();
    activeAlarms = [];
    tick(70, 1.5);
    expect(status()).toBe('critical');
  });

  it('steps to warning and holds there while a HIGH alarm still stands', () => {
    tripOnCriticalAlarm();
    activeAlarms = [alarm('HIGH')];
    tick();
    expect(status()).toBe('warning');
    tick();
    expect(status()).toBe('warning');
  });

  it('lifts a returned HIGH alarm warning to running', () => {
    activeAlarms = [alarm('HIGH')];
    tick();
    expect(status()).toBe('warning');
    activeAlarms = [];
    tick();
    expect(status()).toBe('running');
  });

  it('keeps a wear breakdown critical however cool it reads', () => {
    useProductionStore.setState({ machines: [mill('critical', 99)] });
    tick();
    tick();
    expect(status()).toBe('critical');
  });

  it('keeps a unit with an open repair critical', () => {
    tripOnCriticalAlarm();
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'overheating');
    activeAlarms = [];
    tick();
    expect(status()).toBe('critical');
  });

  it('keeps a tripped unit critical while a facility stop holds', () => {
    tripOnCriticalAlarm();
    useGameSimulationStore.setState({ emergencyActive: true });
    activeAlarms = [];
    tick();
    expect(status()).toBe('critical');
  });

  it('keeps a wear warning however quiet SCADA is', () => {
    useProductionStore.setState({ machines: [mill('warning', 85)] });
    tick();
    expect(status()).toBe('warning');
  });

  it('lifts a returned warning on a mill running warm at full feed, under its own alarm', () => {
    activeAlarms = [alarm('HIGH')];
    tick(60, 1.5, 30);
    expect(status()).toBe('warning');
    activeAlarms = [];
    tick(60, 1.5, 30);
    expect(status()).toBe('running');
  });

  it('holds a restored critical through the alarm warm-up after a reload', async () => {
    cleanup?.();
    useProductionStore.setState({ machines: [mill('critical')], scadaLive: false });
    vi.setSystemTime(2_000_000);
    cleanup = initializeSCADASync();
    await vi.advanceTimersByTimeAsync(0);
    // A fresh AlarmManager raises nothing yet: an empty list is not a return.
    tick();
    tick();
    tick();
    expect(status()).toBe('critical');
    await vi.advanceTimersByTimeAsync(ALARM_STARTUP_WARMUP_MS);
    tick();
    expect(status()).toBe('warning');
  });

  it('holds a trip through the fresh warm-up after a connection Apply reconnects', async () => {
    tripOnCriticalAlarm();
    // Apply stops the service (AlarmManager.reset) and connects again.
    activeAlarms = [];
    lastConnectTime = Date.now();
    tick();
    tick();
    tick();
    expect(status()).toBe('critical');
    await vi.advanceTimersByTimeAsync(ALARM_STARTUP_WARMUP_MS);
    tick();
    expect(status()).toBe('warning');
  });
});
