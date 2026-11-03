import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  frame: null as null | ((state: { clock: { elapsedTime: number } }, delta: number) => void),
}));

// Call the real controller outside React: refs are plain boxes, effects are
// skipped (they only wire the replay path), and useFrame hands us its callback.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => undefined,
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof harness.frame) => {
    harness.frame = callback;
  },
}));

import { MachineSimulationController } from './MachineSimulationController';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { MachineType, type MachineData } from '../../types';

const mill = (): MachineData => ({
  id: 'pace-mill',
  name: 'Pace mill',
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

beforeEach(() => {
  productionBefore = useProductionStore.getState();
  gameBefore = useGameSimulationStore.getState();
});
afterEach(() => {
  useProductionStore.setState(productionBefore, true);
  useGameSimulationStore.setState(gameBefore, true);
  harness.frame = null;
});

/** Run the controller at 60 fps for `gameSeconds` of game time at `gameSpeed`. */
function runFor(gameSpeed: number, gameSeconds: number) {
  useProductionStore.setState({ machines: [mill()], productionSpeed: 1, scadaLive: false });
  useGameSimulationStore.setState({ gameSpeed });
  MachineSimulationController();
  const frames = Math.round((gameSeconds / gameSpeed) * 60);
  for (let i = 1; i <= frames; i++) harness.frame!({ clock: { elapsedTime: i / 60 } }, 1 / 60);
  return useProductionStore.getState().machines[0].metrics;
}

describe('offline machine metrics advance on plant time', () => {
  it('heats a running mill the same over the same game time at every pace', () => {
    // Eight game minutes. At 4x that used to be a quarter of the updates, so a
    // trip took four times as many game minutes; at 1/2x it came twice as fast.
    const half = runFor(15, 480);
    const standard = runFor(30, 480);
    const quadruple = runFor(120, 480);
    expect(standard.temperature).toBeGreaterThan(22);
    expect(Math.abs(quadruple.temperature - standard.temperature)).toBeLessThan(0.3);
    expect(Math.abs(half.temperature - standard.temperature)).toBeLessThan(0.3);
    expect(Math.abs(quadruple.vibration - standard.vibration)).toBeLessThan(0.05);
    expect(Math.abs(quadruple.load - standard.load)).toBeLessThan(0.5);
  });

  it('stays frozen while paused', () => {
    useProductionStore.setState({ machines: [mill()], productionSpeed: 1, scadaLive: false });
    useGameSimulationStore.setState({ gameSpeed: 0 });
    MachineSimulationController();
    for (let i = 1; i <= 600; i++) harness.frame!({ clock: { elapsedTime: i / 60 } }, 1 / 60);
    expect(useProductionStore.getState().machines[0].metrics.temperature).toBe(20);
    // Resuming does not dump the paused span into one big step.
    useGameSimulationStore.setState({ gameSpeed: 30 });
    for (let i = 601; i <= 720; i++) harness.frame!({ clock: { elapsedTime: i / 60 } }, 1 / 60);
    expect(useProductionStore.getState().machines[0].metrics.temperature).toBeLessThan(21.5);
  });
});
