import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

const machine: MachineData = {
  id: 'booked-mill',
  name: 'Booked mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 80, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

const book = () =>
  useBreakdownStore.getState().scheduleMaintenanceTask({
    machineId: machine.id,
    machineName: machine.name,
    scheduledTime: 12,
    type: 'predictive',
    priority: 'high',
    partsNeeded: ['bearings', 'belts'],
  });

// Maintain on a booked unit performs the booking, at the booking's parts. The
// line under it and its title named one filter, so the player was told one
// cost and charged another, and a booking short of parts read as ready.
// Working if the Inspector names what Maintain will take, or what it waits for.
describe('MachineInspector cost of a booked service', () => {
  let savedMachines: MachineData[];
  beforeEach(() => {
    savedMachines = useProductionStore.getState().machines;
    useProductionStore.setState({ machines: [machine] });
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setLocale('en');
    useProductionStore.setState({ machines: savedMachines });
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useUIStore.setState({ alerts: [] });
  });

  it('names the booked parts it takes, and takes exactly those', async () => {
    book();
    vi.useFakeTimers();
    render(<MachineInspector machine={machine} />);
    const button = screen.getByRole('button', { name: 'Perform Maintenance' });

    expect(screen.queryByText(/Uses 1 spare part: filters/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Uses the booked service: bearings, belts (10 and 8 in stock).')
    ).toBeInTheDocument();
    expect(button).toHaveAttribute(
      'title',
      'Uses the booked service: bearings, belts (10 and 8 in stock).'
    );

    fireEvent.click(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(useBreakdownStore.getState().partsInventory).toMatchObject({
      bearings: 9,
      belts: 7,
      filters: 15,
    });
  });

  it('says what a booking waits for while a spare filter is free', () => {
    useBreakdownStore.setState({
      partsInventory: { filters: 15, bearings: 0, belts: 8, sensors: 12, motors: 3 },
    });
    book();
    render(<MachineInspector machine={machine} />);

    expect(screen.queryByText(/Uses 1 spare part/)).not.toBeInTheDocument();
    expect(screen.getByText('The booked service waits for parts: bearings.')).toBeInTheDocument();
  });

  it('reads the booked cost in Portuguese after a switch', () => {
    book();
    render(<MachineInspector machine={machine} />);
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText('Usa o serviço agendado: rolamentos, correias (10 e 8 em estoque).')
    ).toBeInTheDocument();
  });
});
