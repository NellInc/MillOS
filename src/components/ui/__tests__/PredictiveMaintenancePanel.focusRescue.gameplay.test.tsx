import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';

const metrics = { vibration: 5, temperature: 60, load: 70 };

// The plant, not the player, removes these controls: the shift tick confirms a
// queued restart and closes its work order, and a breakdown closes the open
// prediction. A keyboard user resting on that control fell to <body>.
// Working if focus stays in the maintenance panel.
describe('PredictiveMaintenancePanel focus when the plant removes the focused control', () => {
  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ emergencyActive: false });
  });
  afterEach(() => {
    cleanup();
    act(() => {
      useBreakdownStore.getState().resetBreakdownStore();
      useUIStore.setState({ alerts: [] });
    });
  });

  it('keeps focus in the panel when the tick confirms the restart and closes the order', () => {
    const store = useBreakdownStore.getState;
    const breakdown = store().triggerBreakdown('rescue-mill', 'Rescue mill', 'mechanical')!;
    store().startRepair(breakdown.id);
    store().updateRepairProgress(breakdown.id, 100);
    store().verifyRepair(breakdown.id);
    render(<PredictiveMaintenancePanel />);
    const restart = screen.getByRole('button', { name: 'Restart machine' });
    restart.focus();
    fireEvent.click(restart);
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Rescue mill' }));

    act(() => {
      store().confirmMachineRestart(breakdown.id);
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Predictive Maintenance' })
    );
  });

  it('keeps focus in Predictive Alerts when a breakdown closes the focused prediction', () => {
    const store = useBreakdownStore.getState;
    store().addPredictiveAlert('rescue-mill', 'Rescue mill', metrics, 60);
    render(<PredictiveMaintenancePanel />);
    screen.getByRole('button', { name: 'Schedule maintenance for Rescue mill' }).focus();

    act(() => {
      store().triggerBreakdown('rescue-mill', 'Rescue mill', 'vibration_failure');
    });

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Predictive Alerts' }));
  });

  it('keeps focus in Scheduled Maintenance when a repair closes the focused booking', () => {
    const store = useBreakdownStore.getState;
    store().scheduleMaintenanceTask({
      machineId: 'rescue-mill',
      machineName: 'Rescue mill',
      scheduledTime: 12,
      type: 'preventive',
      priority: 'low',
      partsNeeded: ['filters'],
    });
    render(<PredictiveMaintenancePanel />);
    screen.getByRole('button', { name: 'Start maintenance on Rescue mill' }).focus();

    // The unit is serviced elsewhere (the Inspector), which closes the booking.
    act(() => {
      store().acknowledgeMachinePredictiveAlerts('rescue-mill');
    });

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Scheduled Maintenance' })
    );
  });
});
