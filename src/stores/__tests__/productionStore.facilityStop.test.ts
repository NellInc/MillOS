/**
 * Routine maintenance during a facility stop (F20). The stop idles what was
 * running and records it; a unit serviced while the stop holds must stay idle
 * and come back with the stop's release, in the status its new wear earns.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProductionStore } from '../productionStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useBreakdownStore } from '../breakdownStore';
import { useUIStore } from '../uiStore';
import { MachineType, type MachineData } from '../../types';

const mill = (id: string, status: MachineData['status'], wear: number): MachineData => ({
  id,
  name: id,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status,
  metrics: { rpm: 0, temperature: 45, vibration: 1, load: 60, wear, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
});

const statusOf = (id: string) =>
  useProductionStore.getState().machines.find((machine) => machine.id === id)?.status;

describe('performMaintenance during a facility stop', () => {
  let machines: MachineData[];
  let alerts: ReturnType<typeof useUIStore.getState>['alerts'];

  beforeEach(() => {
    machines = useProductionStore.getState().machines;
    alerts = useUIStore.getState().alerts;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
  });

  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines });
    useUIStore.setState({ alerts });
  });

  it('keeps a repaired critical unit idle while the stop holds and starts it on release', () => {
    useProductionStore.getState().setMachines([mill('stop-critical', 'critical', 20)]);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(statusOf('stop-critical')).toBe('critical');

    expect(useProductionStore.getState().performMaintenance('stop-critical').success).toBe(true);
    expect(statusOf('stop-critical')).toBe('idle');

    useGameSimulationStore.getState().resolveEmergency();
    expect(statusOf('stop-critical')).toBe('running');
  });

  it('returns a unit serviced out of warning during the stop as running, not warning', () => {
    useProductionStore.getState().setMachines([mill('stop-warning', 'warning', 80)]);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(statusOf('stop-warning')).toBe('idle');

    expect(useProductionStore.getState().performMaintenance('stop-warning').success).toBe(true);
    expect(statusOf('stop-warning')).toBe('idle');

    useGameSimulationStore.getState().resolveEmergency();
    // Wear 80 -> 30 is below the 60 warning threshold.
    expect(statusOf('stop-warning')).toBe('running');
  });

  it('leaves a unit that was idle before the stop idle after release', () => {
    useProductionStore.getState().setMachines([mill('stop-idle', 'idle', 70)]);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(useProductionStore.getState().performMaintenance('stop-idle').success).toBe(true);
    useGameSimulationStore.getState().resolveEmergency();
    expect(statusOf('stop-idle')).toBe('idle');
  });

  it('holds a repaired unit through a drill until the drill ends', () => {
    useProductionStore.getState().setMachines([mill('drill-critical', 'critical', 20)]);
    useGameSimulationStore.getState().startEmergencyDrill();
    expect(useProductionStore.getState().performMaintenance('drill-critical').success).toBe(true);
    expect(statusOf('drill-critical')).toBe('idle');
    useGameSimulationStore.getState().endEmergencyDrill();
    expect(statusOf('drill-critical')).toBe('running');
  });

  it('still starts a repaired critical unit at once when no stop holds', () => {
    useProductionStore.getState().setMachines([mill('free-critical', 'critical', 20)]);
    expect(useProductionStore.getState().performMaintenance('free-critical').success).toBe(true);
    expect(statusOf('free-critical')).toBe('running');
  });
});
