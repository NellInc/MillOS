import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';

// Completing a scheduled task runs performMaintenance, which returns a critical
// unit to 'running' whatever the facility state. During an E-stop, drill or
// interlock that started a machine inside the stop, so Complete is locked with
// the same guidance as the Machine Inspector's Maintain.
// Working if no Complete click starts a unit while the facility is stopped.
const critical: MachineData = {
  id: 'stop-mill',
  name: 'Stop mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'critical',
  metrics: { rpm: 0, temperature: 45, vibration: 1, load: 0, wear: 92, efficiency: 0 },
  lastMaintenance: '',
  nextMaintenance: '',
};

describe('PredictiveMaintenancePanel scheduled maintenance under a facility stop', () => {
  const machines = useProductionStore.getState().machines;

  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ machines: [critical] });
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: critical.id,
      machineName: critical.name,
      scheduledTime: 10,
      type: 'preventive',
      priority: 'high',
      partsNeeded: ['bearings'],
    });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useProductionStore.setState({ machines });
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ alerts: [] });
      useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    });
  });

  it('locks Complete while the facility is stopped and leaves the unit stopped', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<PredictiveMaintenancePanel />);
    const complete = screen.getByRole('button', { name: 'Complete maintenance on Stop mill' });
    expect(complete).toBeDisabled();
    expect(complete).toHaveAttribute(
      'title',
      'The facility is stopped. Clear the stop before servicing a unit.'
    );

    fireEvent.click(complete);
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
    expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(false);

    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('button', { name: 'Complete maintenance on Stop mill' })).toBeEnabled();
  });
});
