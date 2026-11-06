import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';

const machine: MachineData = {
  id: 'service-mill',
  name: 'Service mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 80, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

// Maintain takes one spare part. It took it from stock already reserved for a
// diagnosed repair elsewhere, so that repair's card read ready while its
// Dispatch was refused. Working if Maintain only spends parts nothing holds.
describe('MachineInspector maintenance and reserved parts', () => {
  let savedMachines: MachineData[];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    useProductionStore.setState({ machines: [machine] });
    useBreakdownStore.getState().resetBreakdownStore();
    useBreakdownStore.setState({
      partsInventory: { filters: 0, bearings: 0, belts: 0, sensors: 1, motors: 2 },
    });
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useProductionStore.setState({ machines: savedMachines });
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useUIStore.setState({ alerts: [] });
  });

  it('leaves the parts a diagnosed repair holds and spends only free stock', async () => {
    const fault = useBreakdownStore
      .getState()
      .triggerBreakdown('other-mill', 'Other mill', 'electrical')!;
    expect(useBreakdownStore.getState().workOrders[0].phase).toBe('diagnosed');

    vi.useFakeTimers();
    render(<MachineInspector machine={machine} />);
    // The sensor is held; the second motor is free. The count agrees with
    // the Parts panel's tile and names what is held.
    expect(
      screen.getByText('Uses 1 spare part: motors (2 in stock, 1 held for repairs).')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(useBreakdownStore.getState().partsInventory).toMatchObject({ sensors: 1, motors: 1 });
    expect(useBreakdownStore.getState().startRepair(fault.id).started).toBe(true);
  });

  it('says the stock is held, not out, when every part is reserved', () => {
    useBreakdownStore.setState({
      partsInventory: { filters: 0, bearings: 0, belts: 0, sensors: 1, motors: 1 },
    });
    useBreakdownStore.getState().triggerBreakdown('other-mill', 'Other mill', 'electrical');
    render(<MachineInspector machine={machine} />);

    expect(screen.queryByText(/Out of spare parts/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Every spare part in stock is held for a repair; maintenance needs a free one.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    const alert = useUIStore.getState().alerts.find((a) => a.machineId === machine.id);
    expect(alert?.message).toBe(
      'Cannot perform maintenance on Service mill: every part in stock is held for a repair. Wait for a parts delivery.'
    );
  });
});
