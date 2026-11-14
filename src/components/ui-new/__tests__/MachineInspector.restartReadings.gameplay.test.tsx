import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { RESTART_GAME_SECONDS, resetUnitWork, stepUnitWork } from '../../../systems/unitService';

// Restart wrote its post-restart temperature, vibration and load from
// Math.random, so two runs of one session diverged at the first restart.
// Working if a restart writes the same readings every time, inside the healthy
// ranges it always used, and draws no chance.
const hot: MachineData = {
  id: 'hot-mill',
  name: 'Hot mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'idle',
  metrics: { rpm: 0, temperature: 69, vibration: 5, load: 95, wear: 5, efficiency: 100 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

let savedMachines: MachineData[];

beforeEach(() => {
  resetUnitWork();
  savedMachines = useProductionStore.getState().machines;
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

afterEach(() => {
  cleanup();
  resetUnitWork();
  vi.restoreAllMocks();
  useProductionStore.setState({ machines: savedMachines });
  useBreakdownStore.getState().resetBreakdownStore();
  useUIStore.setState({ alerts: [] });
});

const restartOnce = () => {
  useProductionStore.setState({ machines: [hot] });
  render(<MachineInspector machine={hot} />);
  fireEvent.click(screen.getByText('Inspect'));
  fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
  act(() => stepUnitWork(RESTART_GAME_SECONDS));
  const live = useProductionStore.getState().machines[0];
  cleanup();
  return {
    status: live.status,
    temperature: live.metrics.temperature,
    vibration: live.metrics.vibration,
    load: live.metrics.load,
  };
};

describe('MachineInspector Restart readings', () => {
  it('writes the same healthy readings every time, whatever Math.random returns', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const first = restartOnce();
    random.mockReturnValue(0.95);
    const second = restartOnce();

    expect(first.status).toBe('running');
    expect(second).toEqual(first);
    expect(first.temperature).toBeGreaterThanOrEqual(45);
    expect(first.temperature).toBeLessThanOrEqual(55);
    expect(first.vibration).toBeGreaterThanOrEqual(1.5);
    expect(first.vibration).toBeLessThanOrEqual(3);
    expect(first.load).toBeGreaterThanOrEqual(60);
    expect(first.load).toBeLessThanOrEqual(80);
  });
});
