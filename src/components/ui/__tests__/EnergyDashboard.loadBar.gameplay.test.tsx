import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAIConfigStore } from '../../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { MachineType, type MachineData } from '../../../types';
import { EnergyDashboard } from '../EnergyDashboard';

/**
 * The Load Factor card printed the share of running demand billed (94% for a
 * mill at 80% load) beside a bar filled to the motor load (80%), so its number
 * and its bar disagreed. Working if the bar is filled to the figure it shows.
 */
const mill = (load: number): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 1200, temperature: 50, vibration: 1.5, load, wear: 0, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

const saved = {
  machines: useProductionStore.getState().machines,
  emergencyActive: useGameSimulationStore.getState().emergencyActive,
  show: useAIConfigStore.getState().showEnergyDashboard,
};

beforeEach(() => {
  useAIConfigStore.setState({ showEnergyDashboard: true });
  useGameSimulationStore.setState({ emergencyActive: false });
});

afterEach(() => {
  cleanup();
  useProductionStore.setState({ machines: saved.machines });
  useGameSimulationStore.setState({ emergencyActive: saved.emergencyActive });
  useAIConfigStore.setState({ showEnergyDashboard: saved.show });
});

describe('Energy dashboard load factor card', () => {
  it('fills its bar to the percentage it prints', () => {
    useProductionStore.setState({ machines: [mill(80)] });
    render(<EnergyDashboard />);
    const label = screen.getByText('Load Factor');
    const card = label.parentElement!.parentElement!;
    const printed = label.nextElementSibling?.textContent ?? '';
    expect(printed).toBe('94%');
    const bar = card.querySelector<HTMLElement>('[style*="width"]');
    expect(bar?.style.width).toBe('94%');
  });
});
