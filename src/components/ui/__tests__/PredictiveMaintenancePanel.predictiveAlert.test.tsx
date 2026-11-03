import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';

const worn: MachineData = {
  id: 'task-mill',
  name: 'Task mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 70, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
};

describe('PredictiveMaintenancePanel completed task and the open prediction', () => {
  const machines = useProductionStore.getState().machines;
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ machines: [worn] });
  });
  afterEach(() => {
    cleanup();
    act(() => {
      useProductionStore.setState({ machines });
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ alerts: [] });
    });
  });

  // A prediction raised after the task was booked (the first one is
  // acknowledged by Schedule) still names a failure window that the completed
  // service has removed.
  it('stops listing the machine prediction once the task is completed', () => {
    const store = useBreakdownStore.getState;
    store().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['bearings'],
    });
    store().addPredictiveAlert(worn.id, worn.name, { vibration: 5, temperature: 60, load: 70 }, 60);
    render(<PredictiveMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: 'Acknowledge prediction for Task mill' })
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Complete maintenance on Task mill' }));

    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(20);
    expect(
      screen.queryByRole('button', { name: 'Acknowledge prediction for Task mill' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('No predicted failures')).toBeVisible();
  });
});
