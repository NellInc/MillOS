/**
 * Offline (SCADA off or its link down, and workplace replay), a unit restarted
 * hot from a trip drops to 'warning' and comes back to 'running' once it cools
 * below the recovery limit. That limit was a flat 55 C, but a roller mill runs
 * at 58 C on a nominal line (42 C base plus 20 C at 80% load), so a repaired
 * mill could never cool below it and stayed in warning (+10% energy, amber in
 * every panel) until its wear earned a service. Working if a mill restarted
 * hot settles back to running at its own running temperature, while a mill
 * that is still hot stays in warning.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { updateOfflineMachineMetrics } from './MachineSimulationController';

const repairedMill = (): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  // Just returned to service from a breakdown: still at the tripped readings.
  status: 'running',
  metrics: { rpm: 1200, temperature: 82, vibration: 7, load: 80, wear: 5, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

const status = () => useProductionStore.getState().machines[0].status;

describe('offline recovery of a roller mill restarted hot', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines: [repairedMill()], productionSpeed: 1 });
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines: saved });
  });

  it('drops to warning while hot and returns to running as it settles', () => {
    updateOfflineMachineMetrics(2);
    expect(status()).toBe('warning');
    // Ten plant minutes: the mill settles at its running temperature.
    for (let i = 0; i < 300; i++) updateOfflineMachineMetrics(2);
    const mill = useProductionStore.getState().machines[0];
    expect(mill.metrics.temperature).toBeLessThan(60);
    expect(status()).toBe('running');
  });

  it('stays in warning while it is still well above its running temperature', () => {
    updateOfflineMachineMetrics(2);
    for (let i = 0; i < 5; i++) updateOfflineMachineMetrics(2);
    expect(useProductionStore.getState().machines[0].metrics.temperature).toBeGreaterThan(70);
    expect(status()).toBe('warning');
  });
});
