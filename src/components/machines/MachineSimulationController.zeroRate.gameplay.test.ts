import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateOfflineMachineMetrics } from './MachineSimulationController';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { MachineType, type MachineData } from '../../types';

/**
 * A line set to 0% in Settings (or stepped down with '-') moves no product:
 * the material model processes nothing and the offline model eases the mill's
 * temperature and vibration to rest. Its load used to stay wherever the last
 * line rate left it (80% after a 1x run, 100% after 2x), so the Machine
 * Inspector, the Energy dashboard's load factor and the bill read a working
 * mill beside a resting vibration and a zero feed.
 */
const mill = (load: number): MachineData => ({
  id: 'zero-rate-mill',
  name: 'Zero rate mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 58, vibration: 1.6, load, wear: 0, efficiency: 100 },
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
});

describe('a running mill on a 0% line', () => {
  it('lets its load fall with the rest of its readings instead of freezing it', () => {
    useProductionStore.setState({ machines: [mill(80)], productionSpeed: 0, scadaLive: false });
    useGameSimulationStore.setState({ emergencyActive: false });
    // Ten game minutes of plant time.
    for (let i = 0; i < 10; i++) updateOfflineMachineMetrics(60);
    const metrics = useProductionStore.getState().machines[0].metrics;
    expect(metrics.vibration).toBeLessThan(0.5);
    expect(metrics.load).toBeLessThan(5);
  });

  it('reads the same load whatever rate the line was at before it was set to 0%', () => {
    const settle = (startLoad: number) => {
      useProductionStore.setState({
        machines: [mill(startLoad)],
        productionSpeed: 0,
        scadaLive: false,
      });
      for (let i = 0; i < 10; i++) updateOfflineMachineMetrics(60);
      return useProductionStore.getState().machines[0].metrics.load;
    };
    expect(settle(100)).toBe(settle(65));
  });
});
