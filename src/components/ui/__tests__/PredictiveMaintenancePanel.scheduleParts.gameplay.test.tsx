import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveMaintenancePanel } from '../PredictiveMaintenancePanel';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useProductionStore } from '../../../stores/productionStore';
import { setLocale } from '../../../i18n';
import { MachineType, type MachineData } from '../../../types';

const store = useBreakdownStore.getState;

const mill: MachineData = {
  id: 'mill-c',
  name: 'Mill C',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 60, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
};

// A booked service whose parts are short, or held for a diagnosed repair, has
// its Complete locked, and the only reason was the button's title: no tooltip
// on a phone, and the stock tiles still read 1 when that one is held. The
// player saw a dead button. Working if the card names the parts it waits on,
// as a work order's card does, in the language active now.
describe('PredictiveMaintenancePanel booked service waiting on parts', () => {
  const machines = useProductionStore.getState().machines;

  beforeEach(() => {
    store().resetBreakdownStore();
    useProductionStore.setState({ machines: [mill] });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      setLocale('en');
      useProductionStore.setState({ machines });
      store().resetBreakdownStore();
    });
  });

  it('shows which parts the locked Complete waits on', () => {
    useBreakdownStore.setState({
      partsInventory: { bearings: 10, belts: 8, filters: 15, motors: 1, sensors: 12 },
    });
    // The one motor in stock is held for this diagnosed repair.
    store().triggerBreakdown('mill-a', 'Mill A', 'electrical');
    store().scheduleMaintenanceTask({
      machineId: mill.id,
      machineName: mill.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['sensors', 'motors'],
    });
    render(<PredictiveMaintenancePanel />);

    expect(screen.getByRole('button', { name: /Mill C/ })).toBeDisabled();
    expect(screen.getAllByText('Awaiting stock: motors')).toHaveLength(1);

    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Aguardando estoque: motores')).toBeInTheDocument();
  });

  it('says nothing about stock when the parts are free', () => {
    store().scheduleMaintenanceTask({
      machineId: mill.id,
      machineName: mill.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['sensors', 'motors'],
    });
    render(<PredictiveMaintenancePanel />);

    expect(screen.getByRole('button', { name: /Mill C/ })).toBeEnabled();
    expect(screen.queryByText(/Awaiting stock/)).not.toBeInTheDocument();
  });
});
