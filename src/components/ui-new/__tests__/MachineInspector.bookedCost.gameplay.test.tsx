import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { PredictiveMaintenancePanel } from '../../ui/PredictiveMaintenancePanel';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';
import { stepUnitWork } from '../../../systems/unitService';

// A service runs its minutes on the game clock (D7); stepUnitWork is the tick's call.
const SERVICE_MINUTES = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;

const unit = (id: string, name: string): MachineData => ({
  id,
  name,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 80, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});
const booked = unit('booked-mill', 'Booked mill');
const unbooked = unit('plain-mill', 'Plain mill');

// The wear crossing's prediction, booked from the planner as a player does.
const bookFromPlanner = () => {
  useBreakdownStore
    .getState()
    .addPredictiveAlert(
      booked.id,
      booked.name,
      { vibration: 2, temperature: 57, load: 74 },
      120,
      'mechanical'
    );
  const planner = render(<PredictiveMaintenancePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Schedule maintenance for Booked mill' }));
  planner.unmount();
};

const maintain = (machine: MachineData) => {
  const inspector = render(<MachineInspector machine={machine} />);
  fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
  act(() => stepUnitWork(SERVICE_MINUTES * 60));
  inspector.unmount();
};

// The service started on an unbooked unit files its own booking, so find by unit.
const bookingOf = (machineId: string) =>
  useBreakdownStore.getState().maintenanceSchedule.find((task) => task.machineId === machineId);

// Schedule booked the predicted failure's two parts and Complete, or Maintain
// on the booked unit, charged both; Maintain on an unbooked unit took one.
// Working if a booked service costs what Maintain costs, whichever control
// performs it, and the Inspector names that one part.
describe('MachineInspector cost of a booked service', () => {
  let savedMachines: MachineData[];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    useProductionStore.setState({ machines: [booked, unbooked] });
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useProductionStore.setState({ machines: savedMachines });
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useUIStore.setState({ alerts: [] });
  });

  it('costs one part, as Maintain on an unbooked unit does', () => {
    const start = { ...useBreakdownStore.getState().partsInventory };
    maintain(unbooked);
    const afterPlain = { ...useBreakdownStore.getState().partsInventory };
    const maintainCost = { ...start, filters: start.filters - 1 };
    expect(afterPlain).toEqual(maintainCost);

    bookFromPlanner();
    expect(bookingOf(booked.id)?.completed).toBe(false);
    render(<MachineInspector machine={booked} />);
    expect(
      screen.getByText(
        'Uses 1 spare part: filters (14 in stock), returned if a fault ends the service.'
      )
    ).toBeInTheDocument();
    cleanup();
    maintain(booked);

    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...afterPlain,
      filters: afterPlain.filters - 1,
    });
    expect(bookingOf(booked.id)?.completed).toBe(true);
  });

  // The planner's control now starts the service (Start), taking the part at once;
  // the booking closes when the service minutes have run.
  it('costs one part from the planner Start', () => {
    bookFromPlanner();
    const before = { ...useBreakdownStore.getState().partsInventory };
    render(<PredictiveMaintenancePanel />);
    const start = screen.getByRole('button', { name: 'Start maintenance on Booked mill' });
    expect(start).toHaveTextContent(`Start · ${SERVICE_MINUTES} min offline`);
    fireEvent.click(start);

    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
    expect(bookingOf(booked.id)?.completed).toBe(false);
    act(() => stepUnitWork(SERVICE_MINUTES * 60));
    expect(bookingOf(booked.id)?.completed).toBe(true);
    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
  });

  it('takes one part for a booking saved with two listed parts', () => {
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: booked.id,
      machineName: booked.name,
      scheduledTime: 12,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['bearings', 'belts'],
    });
    const before = { ...useBreakdownStore.getState().partsInventory };
    maintain(booked);

    expect(useBreakdownStore.getState().partsInventory).toEqual({
      ...before,
      filters: before.filters - 1,
    });
  });

  it('reads the cost in Portuguese after a switch', () => {
    bookFromPlanner();
    render(<MachineInspector machine={booked} />);
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Usa 1 peça de reposição/)).toBeInTheDocument();
  });
});
