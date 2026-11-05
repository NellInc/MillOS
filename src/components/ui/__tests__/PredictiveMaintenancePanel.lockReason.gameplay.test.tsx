import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { MachineType, type MachineData } from '../../../types';

// A booked service's Complete is locked during a facility stop and while the
// unit is under repair, and gave those reasons only as a tooltip: on a phone
// the button was simply grey. The parts reason is already named on the card.
// Working if every lock on Complete is named on the card itself.
const worn: MachineData = {
  id: 'lock-mill',
  name: 'Lock mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 0, temperature: 45, vibration: 1, load: 60, wear: 70, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
};

const card = () =>
  screen.getByRole('button', { name: 'Complete maintenance on Lock mill' }).closest('div.flex')!
    .parentElement!;

describe('PredictiveMaintenancePanel names why a booked Complete is locked', () => {
  const machines = useProductionStore.getState().machines;

  beforeEach(() => {
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ machines: [worn] });
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
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

  it('names a facility stop on the card', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<PredictiveMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: 'Complete maintenance on Lock mill' })
    ).toBeDisabled();
    expect(card()).toHaveTextContent(
      'The facility is stopped. Clear the stop before servicing a unit.'
    );
  });

  it('names a repair under way on the card', () => {
    act(() => {
      useBreakdownStore.getState().triggerBreakdown(worn.id, worn.name, 'mechanical');
    });
    render(<PredictiveMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: 'Complete maintenance on Lock mill' })
    ).toBeDisabled();
    expect(card()).toHaveTextContent('Machine is under repair: complete the work order first');
  });
});
