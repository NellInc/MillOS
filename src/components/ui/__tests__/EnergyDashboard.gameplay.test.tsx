import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAIConfigStore } from '../../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  useOperationsCampaignStore,
  type OperationalIncident,
} from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { MachineType, type MachineData } from '../../../types';
import { EnergyDashboard } from '../EnergyDashboard';

const powerSag: OperationalIncident = {
  id: 'incident-power-sag',
  kind: 'power_sag',
  title: 'Power sag',
  description: 'Grid voltage dip',
  phase: 'raised',
  severity: 'medium',
  startedAtMinute: 0,
  acknowledgedAtMinute: null,
  resolvedAtMinute: null,
  affectedMachineId: null,
  effectApplied: true,
};

const mill = (status: MachineData['status'], load: number): MachineData => ({
  id: `rm-${status}`,
  name: `R.M. ${status}`,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status,
  metrics: { rpm: 1200, temperature: 50, vibration: 1.5, load, wear: 0, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

/** The headline demand: the large number above "Current demand". */
const headlineDemand = () =>
  screen.getByText('Current demand').previousElementSibling?.textContent ?? '';

describe('EnergyDashboard shows the demand and tariff the campaign bills', () => {
  const saved = {
    machines: useProductionStore.getState().machines,
    gameTime: useGameSimulationStore.getState().gameTime,
    emergencyActive: useGameSimulationStore.getState().emergencyActive,
    incidents: useOperationsCampaignStore.getState().incidents,
    show: useAIConfigStore.getState().showEnergyDashboard,
  };

  beforeEach(() => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useProductionStore.setState({ machines: [] });
    useGameSimulationStore.setState({ emergencyActive: false });
    useOperationsCampaignStore.setState({ incidents: [] });
  });

  afterEach(() => {
    cleanup();
    useProductionStore.setState({ machines: saved.machines });
    useGameSimulationStore.setState({
      gameTime: saved.gameTime,
      emergencyActive: saved.emergencyActive,
    });
    useOperationsCampaignStore.setState({ incidents: saved.incidents });
    useAIConfigStore.setState({ showEnergyDashboard: saved.show });
  });

  it('applies an active incident energy multiplier to the demand it shows', () => {
    // Noon facility load is 8 + 45 + 15 = 68 kW; a power sag bills 0.7 of it.
    useGameSimulationStore.setState({ gameTime: 12 });
    useOperationsCampaignStore.setState({ incidents: [powerSag] });
    render(<EnergyDashboard />);
    expect(headlineDemand()).toMatch(/^47\.6/);
  });

  it('prices the energy bill in pounds, as every other plant cost reads', () => {
    // The campaign bills this energy into the same shift ledger whose late,
    // repair and dock costs the shift card prices in pounds (PlayableShift).
    useGameSimulationStore.setState({ gameTime: 12 });
    render(<EnergyDashboard />);
    const costLine = screen.getByText('Simulation cost / h').nextElementSibling?.textContent;
    // Noon facility load 68 kW at the 0.15 peak tariff.
    expect(costLine).toBe('£10.20(£0.15/kWh)');
  });

  it('counts a warning machine in the average load factor, as its demand does', () => {
    // Both machines run on the load curve; a warning mill at load 100 is no
    // less loaded than a running one.
    useGameSimulationStore.setState({ gameTime: 12 });
    useProductionStore.setState({ machines: [mill('running', 60), mill('warning', 100)] });
    render(<EnergyDashboard />);
    // Load 60 -> 88%, load 100 -> 100%: the average is 94%.
    expect(screen.getByText('94%')).toBeTruthy();
  });

  it('reports no load factor while no machine is on the load curve', () => {
    // A facility stop idles every unit; the curve's 70% floor applies to none.
    useGameSimulationStore.setState({ gameTime: 12 });
    useProductionStore.setState({ machines: [mill('idle', 0), mill('critical', 80)] });
    render(<EnergyDashboard />);
    expect(screen.getByText('Load Factor').nextElementSibling?.textContent).toBe('None');
    expect(screen.queryByText('70%')).toBeNull();
  });

  it('shows the factor a running mill with no feed is billed at, not the 70% floor', () => {
    // Its load has eased to the idle level; it bills 2 of 45 kW (4%).
    useGameSimulationStore.setState({ gameTime: 12 });
    useProductionStore.setState({ machines: [mill('running', 0)] });
    render(<EnergyDashboard />);
    expect(screen.getByText('Load Factor').nextElementSibling?.textContent).toBe('4%');
  });
});

describe('EnergyDashboard during a facility emergency', () => {
  const saved = {
    machines: useProductionStore.getState().machines,
    gameTime: useGameSimulationStore.getState().gameTime,
    emergencyActive: useGameSimulationStore.getState().emergencyActive,
    show: useAIConfigStore.getState().showEnergyDashboard,
  };

  afterEach(() => {
    cleanup();
    useProductionStore.setState({ machines: saved.machines });
    useGameSimulationStore.setState({
      gameTime: saved.gameTime,
      emergencyActive: saved.emergencyActive,
    });
    useAIConfigStore.setState({ showEnergyDashboard: saved.show });
  });

  it('lists no machine demand that the emergency headline does not bill', () => {
    // getSiteDemandKw bills only emergency facility load while the site is held.
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: true });
    useProductionStore.setState({ machines: [mill('idle', 0)] });
    render(<EnergyDashboard />);
    const millRow = screen.getByText('Roller Mill', { exact: false }).closest('tr')!;
    expect(millRow.lastElementChild?.textContent).toBe('0.0');
  });
});

describe('EnergyDashboard maintenance cards read machine wear', () => {
  const saved = {
    machines: useProductionStore.getState().machines,
    gameTime: useGameSimulationStore.getState().gameTime,
    emergencyActive: useGameSimulationStore.getState().emergencyActive,
    show: useAIConfigStore.getState().showEnergyDashboard,
  };

  afterEach(() => {
    cleanup();
    useProductionStore.setState({ machines: saved.machines });
    useGameSimulationStore.setState({
      gameTime: saved.gameTime,
      emergencyActive: saved.emergencyActive,
    });
    useAIConfigStore.setState({ showEnergyDashboard: saved.show });
  });

  const worn = (id: string, wear: number): MachineData => ({
    ...mill('running', 50),
    id,
    metrics: { rpm: 1200, temperature: 50, vibration: 1.5, load: 50, wear, efficiency: 100 },
  });
  const cardValue = (label: string) =>
    screen.getByText(label).parentElement?.nextElementSibling?.textContent ?? '';

  it('counts machines past the service point as due and past the warning wear as overdue', () => {
    // Roller mill: service point 30 (half its warning 60), warning 60.
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
    useProductionStore.setState({
      machines: [
        worn('rm-new', 10),
        worn('rm-due-1', 30),
        worn('rm-due-2', 45),
        worn('rm-over', 72),
      ],
    });
    render(<EnergyDashboard />);
    expect(cardValue('Maintenance Due')).toBe('2');
    expect(cardValue('Overdue')).toBe('1');
  });

  it('claims no energy penalty the bill does not charge', () => {
    useAIConfigStore.setState({ showEnergyDashboard: true });
    useGameSimulationStore.setState({ gameTime: 12, emergencyActive: false });
    useProductionStore.setState({ machines: [worn('rm-due', 40), worn('rm-over', 70)] });
    render(<EnergyDashboard />);
    expect(screen.queryByText(/\+5-25%/)).toBeNull();
    expect(screen.queryByText(/\+25%/)).toBeNull();
  });
});

describe('EnergyDashboard close keeps keyboard focus', () => {
  const show = useAIConfigStore.getState().showEnergyDashboard;
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showEnergyDashboard: show });
  });

  it('returns focus to the control that opened it when its close button is pressed', () => {
    useAIConfigStore.setState({ showEnergyDashboard: false });
    render(
      <>
        <button type="button">opener</button>
        <EnergyDashboard />
      </>
    );
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    act(() => useAIConfigStore.setState({ showEnergyDashboard: true }));
    const close = screen.getByRole('button', { name: 'Close energy dashboard' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole('region', { name: 'Energy dashboard' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
