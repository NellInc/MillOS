import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useProductionStore } from '../../stores/productionStore';
import { updateOfflineMachineMetrics } from './MachineSimulationController';

const silo = (wear: number): MachineData => ({
  id: 'silo-0',
  name: 'Silo Alpha',
  type: MachineType.SILO,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 0, temperature: 22, vibration: 1, load: 60, wear, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

describe('offline machine metrics and wear warnings', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
  });
  afterEach(() => useProductionStore.setState({ machines: saved }));

  it('keeps a wear warning while wear stays above the warning threshold', () => {
    // A cool, quiet silo used to be flipped back to running every two seconds,
    // and the wear tick then re-raised the warning and its predictive alert.
    useProductionStore.setState({ machines: [silo(75)], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('warning');
  });

  it('still clears a metric-only warning once temperature and vibration settle', () => {
    useProductionStore.setState({ machines: [silo(10)], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('running');
  });
});
