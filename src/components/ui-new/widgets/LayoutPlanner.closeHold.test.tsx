/**
 * Plan item 7.8: closing the planner while its pause is on releases its hold
 * on the clock. Before, only Run did, so a player who closed it was left with
 * a held clock that only reopening the planner could clear.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutPlanner } from './LayoutPlanner';
import { useProductionStore } from '../../../stores/productionStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { canonicalProcessMachines } from '../../../simulation/materialTransport';
import {
  defaultSavedLogisticsLayout,
  useLogisticsLayoutStore,
} from '../../../stores/logisticsLayoutStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import type { MachineData } from '../../../types';

vi.setConfig({ testTimeout: 180_000 });

const priorProduction = useProductionStore.getState();
const layoutHeld = () =>
  useGameSimulationStore.getState().clockHolds.some((hold) => hold.holder === 'layout');

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useProductionStore.setState({
    machines: canonicalProcessMachines().map((m) => ({ ...m, status: 'running' })) as MachineData[],
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useGameSimulationStore.getState().releaseClock('layout');
  useGameSimulationStore.getState().setGameSpeed(30);
});
afterEach(() => {
  cleanup();
  useGameSimulationStore.getState().releaseClock('layout');
  useProductionStore.setState(priorProduction, true);
});

describe("the planner's pause", () => {
  it('is released when the planner closes without Run', () => {
    const view = render(<LayoutPlanner onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause mill', exact: true }));
    expect(layoutHeld()).toBe(true);
    view.unmount();
    expect(layoutHeld()).toBe(false);
  });
});
