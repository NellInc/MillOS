import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';

const running: MachineData = {
  id: 'sequence-mill',
  name: 'Sequence mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 5, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];
let savedParts: ReturnType<typeof useBreakdownStore.getState>['partsInventory'];

beforeEach(() => {
  vi.useFakeTimers();
  savedMachines = useProductionStore.getState().machines;
  savedParts = useBreakdownStore.getState().partsInventory;
  useBreakdownStore.setState({
    activeBreakdowns: [],
    workOrders: [],
    partsInventory: { filters: 3, bearings: 3, belts: 3, sensors: 3, motors: 3 },
  });
  useUIStore.setState({ alerts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  const game = useGameSimulationStore.getState();
  if (game.emergencyActive) game.resolveEmergency();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.setState({ activeBreakdowns: [], workOrders: [], partsInventory: savedParts });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

// Restart idles the unit for its 2.5 s sequence. A facility stop that lands
// inside that window records the unit as idle, the restart then stands down,
// and the stop's release used to leave it idle: a running unit the player only
// asked to restart sat stopped after the E-stop cleared.
// Working if the release returns the unit to service, as a queued work-order
// restart does.
describe('MachineInspector Restart when a facility stop lands mid-sequence', () => {
  it('returns the unit to service when the stop clears', async () => {
    useProductionStore.setState({ machines: [running] });
    render(<MachineInspector machine={running} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // Nothing runs inside the stop.
    expect(useProductionStore.getState().machines.find((m) => m.id === running.id)?.status).toBe(
      'idle'
    );
    act(() => useGameSimulationStore.getState().resolveEmergency());
    expect(useProductionStore.getState().machines.find((m) => m.id === running.id)?.status).toBe(
      'running'
    );
  });
});

// A fault can open on the unit during Maintain's 1.2 s service delay.
// performMaintenance then refuses with the repair lockout, and the Inspector
// reported that as "Maintenance Not Needed" on a broken-down unit.
// Working if a fault opened mid-delay leaves the unit and the stock alone and
// raises no alert that says the service was not needed.
describe('MachineInspector Maintain when a fault opens mid-delay', () => {
  it('stands down without claiming the service was not needed', async () => {
    const worn: MachineData = {
      ...running,
      status: 'warning',
      metrics: { ...running.metrics, wear: 80, efficiency: 60 },
    };
    useProductionStore.setState({ machines: [worn] });
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perform Maintenance' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => {
      useProductionStore.getState().updateMachineStatus(worn.id, 'critical');
      useBreakdownStore.getState().triggerBreakdown(worn.id, worn.name, 'mechanical');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(3);
    expect(
      useUIStore.getState().alerts.some((alert) => alert.title === 'Maintenance Not Needed')
    ).toBe(false);
  });
});
