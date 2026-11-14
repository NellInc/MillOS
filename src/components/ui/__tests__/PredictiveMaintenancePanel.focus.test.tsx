import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';
import { stepUnitWork } from '../../../systems/unitService';

const worn: MachineData = {
  id: 'focus-mill',
  name: 'Focus mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 70, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
};

const press = (name: string) => {
  const button = screen.getByRole('button', { name });
  button.focus();
  fireEvent.click(button);
};

// Every action in this panel removes or replaces the control that was pressed:
// Acknowledge and Schedule remove the prediction, each work-order step swaps
// its button for the next, and Start swaps the task's button for its minutes
// left (D7; it was Complete, which removed the task). Focus used to fall
// to <body>, throwing a keyboard user to the top of the page at every step.
// Working if focus stays in the section the player was working in, on the
// next step's button when there is one.
describe('PredictiveMaintenancePanel focus after an action', () => {
  const machines = useProductionStore.getState().machines;
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ machines: [worn] });
    useGameSimulationStore.setState({ emergencyActive: false });
  });
  afterEach(() => {
    cleanup();
    act(() => {
      useProductionStore.setState({ machines });
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ alerts: [] });
    });
  });

  it('keeps focus in Predictive Alerts after acknowledging the last prediction', () => {
    useBreakdownStore
      .getState()
      .addPredictiveAlert(worn.id, worn.name, { vibration: 5, temperature: 60, load: 70 }, 60);
    render(<PredictiveMaintenancePanel />);
    press('Acknowledge prediction for Focus mill');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Predictive Alerts' }));
  });

  it('moves focus from Verify repair to the Restart machine step it reveals', () => {
    const store = useBreakdownStore.getState;
    const breakdown = store().triggerBreakdown(worn.id, worn.name, 'mechanical');
    store().startRepair(breakdown!.id);
    store().updateRepairProgress(breakdown!.id, 100);
    render(<PredictiveMaintenancePanel />);
    press('Verify repair');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restart machine' }));
  });

  it('keeps focus on the work order after dispatching the service unit', () => {
    const breakdown = useBreakdownStore
      .getState()
      .triggerBreakdown(worn.id, worn.name, 'mechanical');
    render(<PredictiveMaintenancePanel />);
    press('Dispatch service unit');
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('repairing');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveAttribute('data-breakdown-id', breakdown!.id);
  });

  it('keeps focus in Scheduled Maintenance after starting the last task', () => {
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['bearings'],
    });
    render(<PredictiveMaintenancePanel />);
    press('Start maintenance on Focus mill');
    expect(useBreakdownStore.getState().maintenanceSchedule[0].serviceMinutesLeft).toBe(
      getWearConfig(MachineType.ROLLER_MILL).serviceMinutes
    );
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Scheduled Maintenance' })
    );
    // The service finishing closes the task; focus stays in the section.
    act(() => stepUnitWork(getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60));
    expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Scheduled Maintenance' })
    );
  });
});
