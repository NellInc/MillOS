import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { PredictiveMaintenancePanel } from '../../ui/PredictiveMaintenancePanel';
import { MachineType, type MachineData } from '../../../types';
import { getWearConfig, useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { resetUnitWork, stepUnitWork, unitInService } from '../../../systems/unitService';

// PLAYTEST-6: Perform Maintenance and Restart are the player's decisions, so
// the shift review lists them instead of "No choices were recorded this shift".
// A press the guards refuse is not a decision and is not logged.

const worn: MachineData = {
  id: 'decision-mill',
  name: 'Decision mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 40, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

const operatorLines = () =>
  useOperationsCampaignStore
    .getState()
    .logbook.filter((entry) => entry.actor === 'operator')
    .map((entry) => entry.message);

const machines = useProductionStore.getState().machines;
// A service runs its minutes on the game clock (D7); stepUnitWork is the tick's call.
const SERVICE_SECONDS = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes * 60;
const MAINTAIN = /^Perform Maintenance/;

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
  useMaterialFlowStore.setState({ machineBuffers: new Map() });
  useGameSimulationStore.setState({
    emergencyActive: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useProductionStore.setState({ machines: [worn] });
});

afterEach(() => {
  cleanup();
  act(() => {
    resetUnitWork();
    useProductionStore.setState({ machines });
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ emergencyActive: false });
  });
});

describe('MachineInspector records the service it performs', () => {
  // The press is the decision and is logged when the service starts; the
  // service finishing on the game clock does not log it a second time.
  it('logs Perform Maintenance once, and the service is done when its minutes run', () => {
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: MAINTAIN }));
    expect(operatorLines()).toEqual(['Performed maintenance on Decision mill.']);
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(0);
    expect(operatorLines()).toEqual(['Performed maintenance on Decision mill.']);
  });

  // There is no wall-clock delay for a stop to land in any more: a press the
  // guards refuse (a stop holds, or no part is free) logs nothing.
  it('logs nothing when a stop or a missing part refuses the service', () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: MAINTAIN }));
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    act(() =>
      useBreakdownStore.setState({
        partsInventory: { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: MAINTAIN }));
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(40);
    expect(operatorLines()).toEqual([]);
  });

  // A stop that lands during the service minutes holds the unit offline; the
  // press stays one decision, logged once.
  it('keeps one log line when a stop lands during the service', () => {
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByRole('button', { name: MAINTAIN }));
    act(() => useGameSimulationStore.setState({ emergencyActive: true }));
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(unitInService(worn.id)).toBe(true);
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(40);
    act(() => useGameSimulationStore.setState({ emergencyActive: false }));
    act(() => stepUnitWork(1));
    expect(useProductionStore.getState().machines[0].metrics.wear).toBe(0);
    expect(operatorLines()).toEqual(['Performed maintenance on Decision mill.']);
  });

  it('logs Restart Unit on the press', () => {
    render(<MachineInspector machine={worn} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(operatorLines()).toEqual(['Restarted Decision mill.']);
  });
});

describe('PredictiveMaintenancePanel records the service it performs', () => {
  // Start begins the service and logs it; the task completes when its minutes run.
  it('logs a started scheduled task as maintenance, once', () => {
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'predictive',
      priority: 'high',
      partsNeeded: ['bearings'],
    });
    render(<PredictiveMaintenancePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Start maintenance on Decision mill' }));
    expect(operatorLines()).toEqual(['Performed maintenance on Decision mill.']);
    act(() => stepUnitWork(SERVICE_SECONDS));
    expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(true);
    expect(operatorLines()).toEqual(['Performed maintenance on Decision mill.']);
  });

  it('logs nothing when performMaintenance refuses a unit below its service minimum', () => {
    useProductionStore.setState({
      machines: [{ ...worn, status: 'running', metrics: { ...worn.metrics, wear: 5 } }],
    });
    useBreakdownStore.getState().scheduleMaintenanceTask({
      machineId: worn.id,
      machineName: worn.name,
      scheduledTime: 10,
      type: 'preventive',
      priority: 'medium',
      partsNeeded: ['bearings'],
    });
    render(<PredictiveMaintenancePanel />);
    const complete = screen.getByRole('button', { name: 'Start maintenance on Decision mill' });
    fireEvent.click(complete);
    expect(operatorLines()).toEqual([]);
  });

  it('logs the work-order Restart machine step', () => {
    const store = useBreakdownStore.getState;
    const breakdown = store().triggerBreakdown(worn.id, worn.name, 'mechanical')!;
    store().startRepair(breakdown.id);
    store().updateRepairProgress(breakdown.id, 100);
    expect(store().verifyRepair(breakdown.id)).toBe(true);
    render(<PredictiveMaintenancePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart machine' }));
    expect(store().workOrders[0].phase).toBe('restart_requested');
    expect(operatorLines()).toEqual(['Restarted Decision mill.']);
  });
});
