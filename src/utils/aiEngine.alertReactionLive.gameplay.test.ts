import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAIEngine } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AlertData } from '../types';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// A reaction due while the clock is held waits for the clock. A player who
// pauses on a critical alert and dismisses it, or whose alarm returns to
// normal before the reaction is due, then resumed into a safety card that
// idled the machine for an alert no longer standing. Only a live alert is a
// reason to act (initializeAlertReactions).
// Working if a dismissed or returned alert gets no reaction, and a standing one still does.
describe('alert reactions act only on a standing alert', () => {
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
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  const raise = (id: string): string => {
    const machine = useProductionStore.getState().machines.find((m) => m.status === 'running')!;
    const alert: AlertData = {
      id,
      type: 'critical',
      title: 'Overheat',
      message: 'Bearing hot',
      machineId: machine.id,
      timestamp: new Date(),
      acknowledged: false,
    };
    useUIStore.getState().addAlert(alert);
    return machine.id;
  };
  const reactions = () =>
    useProductionStore.getState().aiDecisions.filter((d) => d.triggeredBy === 'alert');
  const statusOf = (id: string) =>
    useProductionStore.getState().machines.find((m) => m.id === id)?.status;

  it('does not idle a machine for an alert dismissed while the clock was held', () => {
    release = initializeAIEngine();
    const machineId = raise('alert-dismissed-paused');
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(5000);
    useUIStore.getState().dismissAlert('alert-dismissed-paused');
    useGameSimulationStore.setState({ gameSpeed: 30 });
    vi.advanceTimersByTime(3000);
    expect(reactions()).toHaveLength(0);
    expect(statusOf(machineId)).toBe('running');
  });

  it('does not idle a machine for an alarm that returned to normal before the reaction', () => {
    release = initializeAIEngine();
    const machineId = raise('alert-returned');
    useUIStore.getState().setAlertReturnedToNormal('alert-returned', true);
    vi.advanceTimersByTime(3000);
    expect(reactions()).toHaveLength(0);
    expect(statusOf(machineId)).toBe('running');
  });

  it('still answers a standing alert', () => {
    release = initializeAIEngine();
    const machineId = raise('alert-standing');
    vi.advanceTimersByTime(3000);
    expect(reactions()).toHaveLength(1);
    expect(statusOf(machineId)).toBe('idle');
  });
});
