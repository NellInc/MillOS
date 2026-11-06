/**
 * A metric-only trip cools off into 'warning', which is a running state. While
 * a facility stop holds, that lift would start the unit mid-stop; it waits for
 * the release instead.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { updateOfflineMachineMetrics } from './MachineSimulationController';

const trippedSilo = (): MachineData => ({
  id: 'silo-0',
  name: 'Silo Alpha',
  type: MachineType.SILO,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'critical',
  metrics: { rpm: 0, temperature: 30, vibration: 1, load: 0, wear: 10, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

describe('offline cool-off during a facility stop', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines: saved });
  });

  it('keeps a cooled metric-only trip stopped while the stop holds', () => {
    useProductionStore.setState({ machines: [trippedSilo()], productionSpeed: 1 });
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
  });

  it('still lifts a cooled metric-only trip when no stop holds', () => {
    useProductionStore.setState({ machines: [trippedSilo()], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('warning');
  });
});
