import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { resetUnitWork, stepUnitWork, unitInService } from '../../../systems/unitService';

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
    // D14: the reason is on the panel and describes the button; no tooltip.
    expect(restart).not.toHaveAttribute('title');
    expect(restart).toHaveAccessibleDescription(
      'The facility is stopped. Clear the stop before restarting a unit.'
    );
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeEnabled();
  });
});

// Maintain during a stop would start a machine inside the E-stop, drill or
// interlock, so it is locked with the same guidance as Restart. The service now
// runs its minutes on the game clock (D7), so a stop can land during them: the
// unit then stays offline, and is serviced and started only once the stop has
// cleared and the line is restarted (D13).
// Working if no Maintain click starts a unit while the facility is stopped.
describe('MachineInspector maintenance under a facility stop', () => {
  // A worn unit a press would really service. (A critical unit with no work
  // order is now refused by beginUnitService, so it would prove nothing here.)
  const worn: MachineData = {
    ...machine,
    status: 'warning',
    metrics: { ...machine.metrics, wear: 70, efficiency: 70 },
  };
  // A second unit, running, so the stop leaves a line waiting for its restart.
  const neighbour: MachineData = { ...machine, id: 'hold-neighbour', status: 'running' };
  let savedMachines: MachineData[];
  let savedParts: ReturnType<typeof useBreakdownStore.getState>['partsInventory'];
  beforeEach(() => {
    resetUnitWork();
    savedMachines = useProductionStore.getState().machines;
    savedParts = useBreakdownStore.getState().partsInventory;
    useProductionStore.setState({ machines: [worn, neighbour] });
    useBreakdownStore.setState({
      partsInventory: { filters: 3, bearings: 3, belts: 3, sensors: 3, motors: 3 },
      maintenanceSchedule: [],
    });
    useGameSimulationStore.setState({ preEmergencyMachineStatuses: new Map() });
  });
  afterEach(() => {
    resetUnitWork();
    const game = useGameSimulationStore.getState();
    if (game.emergencyActive) game.resolveEmergency();
    useProductionStore.setState({ machines: savedMachines });
    useBreakdownStore.setState({ partsInventory: savedParts, maintenanceSchedule: [] });
    useGameSimulationStore.setState({
      emergencyActive: false,
      emergencyDrillMode: false,
      preEmergencyMachineStatuses: new Map(),
    });
    useSafetyStore.setState({ forkliftEmergencyStop: false });
  });

  const live = () => useProductionStore.getState().machines.find((m) => m.id === worn.id);

  it('locks Maintain while the facility is stopped and releases it when the stop clears', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<MachineInspector machine={worn} />);
    const maintain = screen.getByRole('button', { name: /^Perform Maintenance/ });
    expect(maintain).toBeDisabled();
    expect(maintain).not.toHaveAttribute('title');
    expect(
      screen.getByText('The facility is stopped. Clear the stop before servicing a unit.', {
        selector: 'p',
      })
    ).toBeInTheDocument();
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    expect(screen.getByRole('button', { name: /^Perform Maintenance/ })).toBeEnabled();
  });

  // Was "a stop during the 1.2 s delay": the service now has game minutes, and
  // the part is taken at the start, so the fact is that the stop holds it offline.
  it('does not start the unit when a stop begins during the service', () => {
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    expect(live()?.status).toBe('idle');
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(2);
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    act(() => stepUnitWork(getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60));
    expect(live()?.status).toBe('idle');
    expect(live()?.metrics.wear).toBe(70);
    expect(unitInService(worn.id)).toBe(true);

    // Clearing the stop leaves the line waiting for its restart; nothing starts.
    act(() => useGameSimulationStore.getState().resolveEmergency());
    act(() => stepUnitWork(60));
    expect(live()?.status).toBe('idle');
    expect(live()?.metrics.wear).toBe(70);

    act(() => useGameSimulationStore.getState().restartLine());
    act(() => stepUnitWork(1));
    expect(unitInService(worn.id)).toBe(false);
    expect(live()?.metrics.wear).toBe(20);
    expect(live()?.status).toBe('running');
    // One part, taken at the start.
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(2);
  });
});
