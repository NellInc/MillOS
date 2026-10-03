import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  active: true,
  participants: new Map<
    string,
    {
      capture: () => { frameCount: number; replayTicks: number };
      restore: (state: { frameCount: number; replayTicks: number }) => void;
    }
  >(),
}));

// Use the vehicleReplay hook pattern: run the real controller's registration
// effects without mounting its renderer. Stores and priority ordering stay real.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));
vi.mock('../../simulation/workplaceReplayRuntime', () => ({
  isWorkplaceReplayActive: () => harness.active,
  registerReplayParticipant: (
    id: string,
    participant: typeof harness.participants extends Map<string, infer T> ? T : never
  ) => {
    harness.participants.set(id, participant);
    return () => harness.participants.delete(id);
  },
}));

import { MachineSimulationController } from './MachineSimulationController';
import { centralTick } from '../../systems/CentralTickSystem';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { MachineType, type MachineData } from '../../types';

const makeMachine = (): MachineData => ({
  id: 'replay-boundary-mill',
  name: 'Boundary mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 20, vibration: 0, load: 0, wear: 0, efficiency: 100 },
  lastMaintenance: '',
  nextMaintenance: '',
});

let productionBefore: ReturnType<typeof useProductionStore.getState>;
let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;
const participant = () => harness.participants.get('machine-metrics')!;
const tick = (index: number, speed = 180) =>
  expect(centralTick.tick(index * centralTick.getStats().tickInterval, 12, speed)).toBe(true);

beforeEach(() => {
  productionBefore = useProductionStore.getState();
  gameBefore = useGameSimulationStore.getState();
  centralTick.reset();
  harness.active = true;
  harness.effects.length = 0;
  harness.participants.clear();
  useProductionStore.setState({ machines: [makeMachine()], productionSpeed: 1, scadaLive: false });
  useGameSimulationStore.setState({ gameSpeed: 180 });
  MachineSimulationController();
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  expect(harness.participants.has('machine-metrics')).toBe(true);
});

afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  centralTick.reset();
  vi.restoreAllMocks();
  useProductionStore.setState(productionBefore, true);
  useGameSimulationStore.setState(gameBefore, true);
});

describe('machine metrics replay pause boundary', () => {
  it('leaves cadence and offline metrics untouched when live pause invalidates a running context', () => {
    participant().restore({ frameCount: 17, replayTicks: 3 });
    const machines = structuredClone(useProductionStore.getState().machines);
    const update = vi.spyOn(useProductionStore.getState(), 'batchUpdateMachineMetrics');
    useGameSimulationStore.setState({ gameSpeed: 0 });

    tick(1); // The central context still carries 180, as at an end-clamp boundary.
    tick(2);

    expect(participant().capture()).toEqual({ frameCount: 17, replayTicks: 3 });
    expect(useProductionStore.getState().machines).toEqual(machines);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates offline metrics once per four running replay ticks and resumes the saved cadence', () => {
    const machines = structuredClone(useProductionStore.getState().machines);
    const update = vi.spyOn(useProductionStore.getState(), 'batchUpdateMachineMetrics');
    for (let index = 1; index <= 3; index++) tick(index);
    expect(participant().capture().replayTicks).toBe(3);
    expect(useProductionStore.getState().machines).toEqual(machines);
    expect(update).not.toHaveBeenCalled();

    useGameSimulationStore.setState({ gameSpeed: 0 });
    tick(4);
    expect(participant().capture().replayTicks).toBe(3);
    expect(update).not.toHaveBeenCalled();

    useGameSimulationStore.setState({ gameSpeed: 180 });
    tick(5);
    expect(participant().capture().replayTicks).toBe(4);
    expect(update).toHaveBeenCalledTimes(1);
    expect(useProductionStore.getState().machines[0].metrics).toMatchObject({
      load: 8,
      temperature: 21.2,
      vibration: 0.1,
    });
  });

  it('honours a priority-zero pause before the registered priority-one metric callback', () => {
    participant().restore({ frameCount: 0, replayTicks: 3 });
    const machines = structuredClone(useProductionStore.getState().machines);
    const update = vi.spyOn(useProductionStore.getState(), 'batchUpdateMachineMetrics');
    const pause = vi.fn((ctx: { gameSpeed: number }) => {
      expect(ctx.gameSpeed).toBe(180);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(180);
      useGameSimulationStore.setState({ gameSpeed: 0 });
    });
    // Register after the controller to ensure insertion order cannot satisfy
    // the assertion: the real scheduler must sort priority 0 ahead of 1.
    centralTick.register('replay-end-boundary', pause, 0);

    tick(1);

    expect(pause).toHaveBeenCalledTimes(1);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(participant().capture().replayTicks).toBe(3);
    expect(useProductionStore.getState().machines).toEqual(machines);
    expect(update).not.toHaveBeenCalled();
  });
});
