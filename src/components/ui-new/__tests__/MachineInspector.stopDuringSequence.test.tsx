import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';
import {
  RESTART_GAME_SECONDS,
  resetUnitWork,
  stepUnitWork,
  unitInService,
} from '../../../systems/unitService';

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
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  savedParts = useBreakdownStore.getState().partsInventory;
  useBreakdownStore.setState({
    activeBreakdowns: [],
    workOrders: [],
    partsInventory: { filters: 3, bearings: 3, belts: 3, sensors: 3, motors: 3 },
    maintenanceSchedule: [],
  });
  useGameSimulationStore.setState({ preEmergencyMachineStatuses: new Map() });
  useUIStore.setState({ alerts: [] });
});

afterEach(() => {
  resetUnitWork();
  const game = useGameSimulationStore.getState();
  if (game.emergencyActive) game.resolveEmergency();
  useGameSimulationStore.setState({ preEmergencyMachineStatuses: new Map() });
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.setState({
    activeBreakdowns: [],
    workOrders: [],
    partsInventory: savedParts,
    maintenanceSchedule: [],
  });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

// Restart idles the unit for its sequence (75 game seconds). A stop that lands
// inside that window records the unit as idle, the restart then stands down,
// and the stop's release used to leave it idle: a running unit the player only
// asked to restart sat stopped after the E-stop cleared.
// Working if the release returns the unit to service, as a queued work-order
// restart does.
describe('MachineInspector Restart when a facility stop lands mid-sequence', () => {
  it('returns the unit to service when the stop clears', () => {
    useProductionStore.setState({ machines: [running] });
    render(<MachineInspector machine={running} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    act(() => stepUnitWork(15));
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    // The tick stands the restart down while the stop holds.
    act(() => stepUnitWork(RESTART_GAME_SECONDS));
    // Nothing runs inside the stop.
    expect(useProductionStore.getState().machines.find((m) => m.id === running.id)?.status).toBe(
      'idle'
    );
    act(() => useGameSimulationStore.getState().resolveEmergency());
    // Clearing the stop leaves the line idle; the restart starts it (D13).
    expect(useProductionStore.getState().machines.find((m) => m.id === running.id)?.status).toBe(
      'idle'
    );
    act(() => useGameSimulationStore.getState().restartLine());
    expect(useProductionStore.getState().machines.find((m) => m.id === running.id)?.status).toBe(
      'running'
    );
  });
});

// A fault can open on the unit during Maintain's service. The service then
// ends without being performed (the repair's work order takes over), and the
// Inspector once reported that as "Maintenance Not Needed" on a broken-down
// unit. The service used to wait 1.2 s and charge at the end; it now runs its
// game minutes and takes its one part at the start (D7). A fault that ends the
// service means nothing was serviced, so that part goes back to stock and the
// bell says so (unitService.stepUnitWork; unitService.faultRefund.test.ts).
// A facility stop is not a fault: it holds the service, which keeps its part.
// Working if a fault opened mid-service leaves the unit's wear and fault alone,
// returns the part, and raises no alert that says the service was not needed.
describe('MachineInspector Maintain when a fault opens mid-service', () => {
  it('stands down without claiming the service was not needed', () => {
    const worn: MachineData = {
      ...running,
      status: 'warning',
      metrics: { ...running.metrics, wear: 80, efficiency: 60 },
    };
    useProductionStore.setState({ machines: [worn] });
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    // The part is taken at the start.
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(2);
    act(() => stepUnitWork(10 * 60));
    act(() => {
      useProductionStore.getState().updateMachineStatus(worn.id, 'critical');
      useBreakdownStore.getState().triggerBreakdown(worn.id, worn.name, 'mechanical');
    });
    act(() => stepUnitWork(getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60));
    const live = useProductionStore.getState().machines.find((m) => m.id === worn.id);
    expect(unitInService(worn.id)).toBe(false);
    expect(live?.status).toBe('critical');
    expect(live?.metrics.wear).toBe(80);
    expect(live?.maintenanceHistory ?? []).toHaveLength(0);
    // Nothing was serviced: the part is back in stock, and none more was taken.
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(3);
    const titles = useUIStore.getState().alerts.map((alert) => alert.title);
    expect(titles).toContain('Service ended by a fault');
    expect(titles).not.toContain('Maintenance Not Needed');
  });

  it('keeps the part when a facility stop, not a fault, lands mid-service', () => {
    const worn: MachineData = {
      ...running,
      status: 'warning',
      metrics: { ...running.metrics, wear: 80, efficiency: 60 },
    };
    useProductionStore.setState({ machines: [worn] });
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    act(() => stepUnitWork(10 * 60));
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    act(() => stepUnitWork(getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60));
    // The stop holds the service; its part stays spent on it.
    expect(unitInService(worn.id)).toBe(true);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(2);
    expect(
      useUIStore.getState().alerts.some((alert) => alert.title === 'Service ended by a fault')
    ).toBe(false);
  });
});
