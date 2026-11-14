import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';
import { RESTART_GAME_SECONDS, resetUnitWork, stepUnitWork } from '../../../systems/unitService';

// Low wear, cool and quiet: the only thing holding this unit in warning is
// the open dust-filter incident raised against it.
const sifter: MachineData = {
  id: 'sifter-b',
  name: 'Plansifter B',
  type: MachineType.PLANSIFTER,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 5, efficiency: 95 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];
let savedIncidents: ReturnType<typeof useOperationsCampaignStore.getState>['incidents'];

beforeEach(() => {
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  savedIncidents = useOperationsCampaignStore.getState().incidents;
  useBreakdownStore.setState({ activeBreakdowns: [], workOrders: [] });
  useUIStore.setState({ alerts: [] });
  useOperationsCampaignStore.setState({
    incidents: [
      {
        ...(savedIncidents[0] ?? {}),
        id: 'incident-dust',
        kind: 'dust_filter_pressure',
        affectedMachineId: 'sifter-b',
        phase: 'raised',
      } as (typeof savedIncidents)[number],
    ],
  });
});

afterEach(() => {
  resetUnitWork();
  const game = useGameSimulationStore.getState();
  if (game.emergencyActive) game.resolveEmergency();
  useGameSimulationStore.setState({ preEmergencyMachineStatuses: new Map() });
  useProductionStore.setState({ machines: savedMachines });
  useOperationsCampaignStore.setState({ incidents: savedIncidents });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

const statusOf = () =>
  useProductionStore.getState().machines.find((m) => m.id === sifter.id)?.status;

// The tick and the machine cool-off both keep a unit in warning while a
// dust-filter incident against it is unmitigated. The Inspector's Restart
// asked only about wear: it put the unit back to 'running', said it had
// "returned to healthy values", and nothing re-imposed the warning, so a
// restart cleared the incident's hold before the fix was applied.
// Working if Restart leaves an incident-held unit in warning and says why.
describe('MachineInspector Restart on a unit an open incident holds in warning', () => {
  it('returns the unit to warning, not running, and does not claim it recovered', () => {
    useProductionStore.setState({ machines: [sifter] });
    render(<MachineInspector machine={sifter} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    act(() => stepUnitWork(RESTART_GAME_SECONDS));
    expect(statusOf()).toBe('warning');
    const titles = useUIStore.getState().alerts.map((alert) => alert.title);
    expect(titles).not.toContain('Machine Recovered');
  });

  it('hands a facility stop that lands mid-sequence the warning, not running', () => {
    useProductionStore.setState({ machines: [sifter] });
    render(<MachineInspector machine={sifter} />);
    fireEvent.click(screen.getByText('Inspect'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
    act(() => stepUnitWork(15));
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    // The tick stands the restart down while the stop holds.
    act(() => stepUnitWork(RESTART_GAME_SECONDS));
    act(() => useGameSimulationStore.getState().resolveEmergency());
    // Clearing the stop leaves the line idle; the restart starts it (D13).
    expect(statusOf()).toBe('idle');
    act(() => useGameSimulationStore.getState().restartLine());
    expect(statusOf()).toBe('warning');
  });
});
