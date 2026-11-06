import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAIEngine } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AlertData } from '../types';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// A hidden tab stops the frames that run the plant, and the engine's loop and
// the on-device operator hold for it, as they do for a held clock. An alert
// reaction waited for a held clock but not for a hidden tab: a safety card
// idled its machine while the player was away and the plant was frozen.
// Working if a reaction due while the tab is hidden waits for the tab to return.
describe('alert reactions hold while the tab is hidden', () => {
  let release: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30, isTabVisible: true });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines(mockMachines.map((machine) => ({ ...machine })));
  });

  afterEach(() => {
    release?.();
    release = null;
    vi.useRealTimers();
    useGameSimulationStore.setState({ isTabVisible: true });
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  it('waits for the tab to come back before answering', () => {
    release = initializeAIEngine();
    const machine = useProductionStore.getState().machines.find((m) => m.status === 'running')!;
    const alert: AlertData = {
      id: 'alert-hidden-tab',
      type: 'critical',
      title: 'Overheat',
      message: 'Bearing hot',
      machineId: machine.id,
      timestamp: new Date(),
      acknowledged: false,
    };
    useUIStore.getState().addAlert(alert);
    useGameSimulationStore.setState({ isTabVisible: false });
    vi.advanceTimersByTime(5000);
    expect(
      useProductionStore.getState().aiDecisions.filter((d) => d.triggeredBy === 'alert')
    ).toHaveLength(0);
    expect(useProductionStore.getState().machines.find((m) => m.id === machine.id)?.status).toBe(
      'running'
    );

    useGameSimulationStore.setState({ isTabVisible: true });
    vi.advanceTimersByTime(1500);
    expect(
      useProductionStore.getState().aiDecisions.filter((d) => d.triggeredBy === 'alert')
    ).toHaveLength(1);
  });
});
