import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADA_SETPOINT_STORAGE_KEY, SimulationAdapter } from '../adapters/SimulationAdapter';
import { safeJSONStorage } from '../../stores/storage';
import type { TagDefinition } from '../types';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';

/**
 * The simulated transmitters are plant readings, and in SCADA mode (the
 * default) they are what the Machine Inspector shows. They sampled on wall
 * time: under P a mill's speed and bearing temperature kept wandering, a new
 * setpoint was approached while the clock was held, and at 4x a drive took four
 * times the game minutes to reach its setpoint. Working if a held clock holds
 * every reading and a setpoint is reached in the same plant time at any pace.
 */
const tags: TagDefinition[] = [
  {
    id: 'T.ST001.PV',
    name: 'Speed',
    description: 'Speed',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: 'mill-1',
    group: 'SPEED',
    simulation: {
      baseValue: 1200,
      noiseAmplitude: 50,
      driftRate: 0,
      setpointTagId: 'T.SP001.SP',
    },
  },
  {
    id: 'T.SP001.SP',
    name: 'Setpoint',
    description: 'Setpoint',
    dataType: 'FLOAT32',
    accessMode: 'READ_WRITE',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: 'mill-1',
    group: 'SETPOINT',
    simulation: { baseValue: 1200, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: 'T.TT001.PV',
    name: 'Temp',
    description: 'Temp',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: 'mill-2',
    group: 'TEMPERATURE',
    simulation: { baseValue: 60, noiseAmplitude: 0, driftRate: 0, statusDependent: true },
  },
];

const reading = async (adapter: SimulationAdapter, id: string) =>
  (await adapter.readTag(id)).value as number;

describe('SimulationAdapter on the plant clock', () => {
  let adapter: SimulationAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    // Written setpoints survive a reload; each run starts from the authored ones.
    safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
    adapter = new SimulationAdapter(tags);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
  });

  it('holds every reading while the clock is held', async () => {
    adapter.updateMachineStates([
      { id: 'mill-1', status: 'running', metrics: { load: 80, rpm: 1200 } },
      { id: 'mill-2', status: 'idle', metrics: { load: 0, rpm: 0 } },
    ]);
    await adapter.connect();
    vi.advanceTimersByTime(3000);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    await adapter.writeTag('T.SP001.SP', 1600);
    vi.advanceTimersByTime(1000);
    const speed = await reading(adapter, 'T.ST001.PV');
    const temperature = await reading(adapter, 'T.TT001.PV');

    vi.advanceTimersByTime(5000);
    expect(await reading(adapter, 'T.ST001.PV')).toBe(speed);
    expect(await reading(adapter, 'T.TT001.PV')).toBe(temperature);
  });

  it('holds an injected drift fault while the clock is held', async () => {
    adapter.updateMachineStates([
      { id: 'mill-2', status: 'running', metrics: { load: 50, rpm: 1200 } },
    ]);
    await adapter.connect();
    adapter.injectFault({ tagId: 'T.TT001.PV', faultType: 'drift', severity: 1 });
    vi.advanceTimersByTime(3000);
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(1000);
    const held = await reading(adapter, 'T.TT001.PV');

    vi.advanceTimersByTime(10_000);
    expect(await reading(adapter, 'T.TT001.PV')).toBe(held);
  });

  it('runs a timed fault for its span of plant time, not wall time', async () => {
    await adapter.connect();
    useGameSimulationStore.setState({ gameSpeed: 0 });
    adapter.injectFault({ tagId: 'T.TT001.PV', faultType: 'spike', duration: 10_000 });
    // Paused: no plant time passes, so the fault is still running.
    vi.advanceTimersByTime(15_000);
    expect(adapter.getActiveFaults()).toHaveLength(1);

    // At 4x, ten plant seconds take two and a half real ones.
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED * 4 });
    vi.advanceTimersByTime(2000);
    expect(adapter.getActiveFaults()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(adapter.getActiveFaults()).toHaveLength(0);
  });

  it('closes the same share of a setpoint step per plant second at 1x and 4x', async () => {
    const quiet = tags.map((tag) =>
      tag.simulation ? { ...tag, simulation: { ...tag.simulation, noiseAmplitude: 0 } } : tag
    );
    const run = async (gameSpeed: number, realSeconds: number) => {
      safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
      const subject = new SimulationAdapter(quiet);
      subject.updateMachineStates([
        { id: 'mill-1', status: 'running', metrics: { load: 50, rpm: 1200 } },
      ]);
      useGameSimulationStore.setState({ gameSpeed });
      await subject.connect();
      await subject.writeTag('T.SP001.SP', 1600);
      vi.advanceTimersByTime(realSeconds * 1000);
      const value = await reading(subject, 'T.ST001.PV');
      await subject.disconnect();
      return value;
    };
    // Eight plant seconds either way: 8 real seconds at 1x, 2 at 4x.
    const standard = await run(STANDARD_GAME_SPEED, 8);
    const fast = await run(STANDARD_GAME_SPEED * 4, 2);
    expect(standard).toBeGreaterThan(1200);
    expect(fast).toBeCloseTo(standard, 6);
  });
});
