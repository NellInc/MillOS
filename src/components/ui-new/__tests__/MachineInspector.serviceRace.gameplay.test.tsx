/**
 * Maintain runs a service. A unit with a booked service can also be serviced
 * from the planner's Start in Mill Overview. A Complete that landed during the
 * Inspector's old 1.2 s delay serviced the unit and closed the booking; the
 * Inspector then found no booking, fell back to a spare part, and serviced the
 * unit a second time: two services, two charges. The service now runs on the
 * game clock from the booking itself (D7), so whichever control starts it, the
 * other finds it under way: the planner shows the minutes left instead of a
 * button, and beginUnitService refuses a second start as busy.
 * Working if one press of Maintain and one Start service the unit once.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { PredictiveMaintenancePanel } from '../../ui/PredictiveMaintenancePanel';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { beginUnitService, resetUnitWork, stepUnitWork } from '../../../systems/unitService';

const SERVICE_MINUTES = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;

const mill: MachineData = {
  id: 'rm-race',
  name: 'RM-RACE',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  // Roller mill: minimum service wear 30, a service takes off 50. A second
  // service from 85 -> 35 is still allowed, so nothing else refuses it.
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 85, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  useProductionStore.setState({ machines: [mill] });
  useBreakdownStore.getState().resetBreakdownStore();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useUIStore.setState({ alerts: [] });
  useBreakdownStore.getState().scheduleMaintenanceTask({
    machineId: mill.id,
    machineName: mill.name,
    scheduledTime: 12,
    type: 'predictive',
    priority: 'high',
    partsNeeded: ['bearings', 'belts'],
  });
});

afterEach(() => {
  cleanup();
  resetUnitWork();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

const live = () => useProductionStore.getState().machines.find((m) => m.id === mill.id)!;

const expectServicedOnce = (before: Record<string, number>) => {
  expect(live().maintenanceHistory ?? []).toHaveLength(1);
  expect(live().metrics.wear).toBeCloseTo(35, 5);
  // One service, at one part (the booking's listed parts are not charged).
  expect(useBreakdownStore.getState().partsInventory).toEqual({
    ...before,
    filters: before.filters - 1,
  });
};

describe('MachineInspector Maintain racing the planner Start', () => {
  it('services the unit once when the planner is opened during the Inspector service', () => {
    const before = { ...useBreakdownStore.getState().partsInventory };
    const inspector = render(<MachineInspector machine={mill} />);
    fireEvent.click(screen.getByRole('button', { name: /^Perform Maintenance/ }));
    act(() => stepUnitWork(60));
    // The player opens Mill Overview (the sidebar swaps the Inspector out):
    // the booking is the service under way, with no Start to press.
    inspector.unmount();
    render(<PredictiveMaintenancePanel />);
    expect(screen.queryByRole('button', { name: /Start maintenance on RM-RACE/i })).toBeNull();
    expect(
      screen.getByText(`Offline for service · ${SERVICE_MINUTES - 1} min left`)
    ).toBeInTheDocument();
    // A second start, from any control, is refused.
    expect(beginUnitService(mill.id)).toEqual({ started: false, reason: 'busy' });

    act(() => stepUnitWork(SERVICE_MINUTES * 60));
    expectServicedOnce(before);
  });

  it('services the unit once when Maintain is pressed during the planner service', () => {
    const before = { ...useBreakdownStore.getState().partsInventory };
    const planner = render(<PredictiveMaintenancePanel />);
    fireEvent.click(screen.getByRole('button', { name: /Start maintenance on RM-RACE/i }));
    act(() => stepUnitWork(60));
    planner.unmount();
    render(<MachineInspector machine={mill} />);
    const maintain = screen.getByRole('button', {
      name: `Offline for service · ${SERVICE_MINUTES - 1} min left`,
    });
    expect(maintain).toBeDisabled();
    fireEvent.click(maintain);

    act(() => stepUnitWork(SERVICE_MINUTES * 60));
    expectServicedOnce(before);
  });
});
