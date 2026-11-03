import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';

const machine: MachineData = {
  id: 'hold-mill',
  name: 'Hold mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'idle',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 5, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

describe('MachineInspector restart under a facility stop', () => {
  let savedMachines: MachineData[];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    useProductionStore.setState({ machines: [machine] });
  });
  afterEach(() => {
    useProductionStore.setState({ machines: savedMachines });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  });

  // handleRestart refuses while the facility is stopped; the button must say
  // so rather than accept a click that does nothing.
  it('locks Restart while the facility is stopped and releases it when the stop clears', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<MachineInspector machine={machine} />);
    fireEvent.click(screen.getByText('Inspect'));
    const restart = screen.getByRole('button', { name: 'Restart Unit' });
    expect(restart).toBeDisabled();
    expect(restart).toHaveAttribute(
      'title',
      'The facility is stopped. Clear the stop before restarting a unit.'
    );
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeEnabled();
  });
});

// performMaintenance returns a critical unit to 'running' whatever the facility
// state, and stopProduction only idles running and warning units. Maintain
// during a stop would start a machine inside the E-stop, drill or interlock, so
// it is locked with the same guidance as Restart, including a stop that begins
// during the service delay.
// Working if no Maintain click starts a unit while the facility is stopped.
describe('MachineInspector maintenance under a facility stop', () => {
  const critical: MachineData = {
    ...machine,
    status: 'critical',
    metrics: { ...machine.metrics, wear: 92, efficiency: 0 },
  };
  let savedMachines: MachineData[];
  let savedParts: ReturnType<typeof useBreakdownStore.getState>['partsInventory'];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    savedParts = useBreakdownStore.getState().partsInventory;
    useProductionStore.setState({ machines: [critical] });
    useBreakdownStore.setState({
      partsInventory: { filters: 3, bearings: 3, belts: 3, sensors: 3, motors: 3 },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    useProductionStore.setState({ machines: savedMachines });
    useBreakdownStore.setState({ partsInventory: savedParts });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  });

  it('locks Maintain while the facility is stopped and releases it when the stop clears', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<MachineInspector machine={critical} />);
    const maintain = screen.getByRole('button', { name: 'Perform Maintenance' });
    expect(maintain).toBeDisabled();
    expect(maintain).toHaveAttribute(
      'title',
      'The facility is stopped. Clear the stop before servicing a unit.'
    );
    expect(
      screen.getByText('The facility is stopped. Clear the stop before servicing a unit.', {
        selector: 'p',
      })
    ).toBeInTheDocument();
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('button', { name: 'Perform Maintenance' })).toBeEnabled();
  });

  it('does not start the unit when a stop begins during the service delay', async () => {
    vi.useFakeTimers();
    render(<MachineInspector machine={critical} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const live = useProductionStore.getState().machines.find((m) => m.id === critical.id);
    expect(live?.status).toBe('critical');
    expect(live?.metrics.wear).toBe(92);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(3);
  });
});
