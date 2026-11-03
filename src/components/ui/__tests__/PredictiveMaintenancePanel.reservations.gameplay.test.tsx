import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useProductionStore } from '../../../stores/productionStore';
import { MachineType, type MachineData } from '../../../types';

const store = useBreakdownStore.getState;
const card = (machineName: string) => screen.getByRole('group', { name: machineName });
const dispatch = (machineName: string) =>
  within(card(machineName)).getByRole('button', { name: /Dispatch/ });

const mill = (id: string, wear: number): MachineData => ({
  id,
  name: `Mill ${id}`,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear, efficiency: 100 },
  lastMaintenance: '',
  nextMaintenance: '',
});

// Dispatch was enabled on any order whose parts had stock, so a newer order
// could take the motor a delivery had reserved for the older one. Working if
// Dispatch agrees with startRepair and a reserved part shows as awaited.
describe('PredictiveMaintenancePanel part reservations', () => {
  const machines = useProductionStore.getState().machines;

  beforeEach(() => {
    store().resetBreakdownStore();
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useProductionStore.setState({ machines });
      store().resetBreakdownStore();
    });
  });

  it('disables Dispatch on the newer order when the free motor is reserved for the older', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 0, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().triggerBreakdown('mill-b', 'Mill B', 'electrical');
    store().restockPart('motors', 1);
    render(<PredictiveMaintenancePanel />);

    expect(dispatch('Mill A')).toBeEnabled();
    expect(dispatch('Mill B')).toBeDisabled();
    expect(within(card('Mill B')).getByText('Awaiting stock: motors')).toBeInTheDocument();
    expect(within(card('Mill A')).queryByText(/Awaiting stock/)).not.toBeInTheDocument();
  });

  it('does not say a repair under way is awaiting the stock it already took', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    const fault = store().triggerBreakdown('mill-a', 'Mill A', 'electrical')!;
    expect(store().startRepair(fault.id).started).toBe(true);
    expect(store().partsInventory.motors).toBe(0);
    render(<PredictiveMaintenancePanel />);

    expect(within(card('Mill A')).queryByText(/Awaiting stock/)).not.toBeInTheDocument();
  });

  it('locks Complete on a booked service whose parts are reserved for a repair', () => {
    useProductionStore.setState({ machines: [mill('mill-c', 60)] });
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().scheduleMaintenanceTask({
      machineId: 'mill-c',
      machineName: 'Mill mill-c',
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['sensors', 'motors'],
    });
    render(<PredictiveMaintenancePanel />);

    expect(screen.getByRole('button', { name: /Mill mill-c/ })).toBeDisabled();
  });
});
