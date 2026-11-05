import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDecisionEffects, initializeAIEngine } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AIDecision } from '../types';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// A safety card moves its machine to a safe state by idling it. Every
// breakdown raises a critical alert naming the machine, and with alert
// reactions always on the rules layer answered each one with a safety card
// that turned the broken unit from 'critical' to 'idle'. A worn-out unit then
// read as an ordinary stopped machine and Restart was offered past its lockout.
// Working if a safety card idles a running unit and leaves a stopped one as it is.
const safety: AIDecision = {
  id: 'ai-safety-1',
  type: 'safety',
  status: 'pending',
  machineId: 'rm-101',
} as AIDecision;

const status = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')?.status;
const setRm101 = (patch: { status: 'running' | 'critical'; wear: number }) =>
  useProductionStore
    .getState()
    .setMachines(
      mockMachines.map((m) =>
        m.id === 'rm-101'
          ? { ...m, status: patch.status, metrics: { ...m.metrics, wear: patch.wear } }
          : { ...m }
      )
    );

describe('a safety card on a machine that has already stopped', () => {
  let release: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30 });
    useBreakdownStore.getState().resetBreakdownStore();
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
  });

  afterEach(() => {
    release?.();
    release = null;
    vi.useRealTimers();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
    useBreakdownStore.getState().resetBreakdownStore();
  });

  it('idles a running machine', () => {
    setRm101({ status: 'running', wear: 20 });
    applyDecisionEffects(safety);
    expect(status()).toBe('idle');
  });

  it('leaves a worn-out unit locked out', () => {
    setRm101({ status: 'critical', wear: 99 });
    applyDecisionEffects(safety);
    expect(status()).toBe('critical');
  });

  it('leaves a broken-down unit locked out when the rules layer answers its alert', () => {
    setRm101({ status: 'critical', wear: 20 });
    release = initializeAIEngine();
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical');
    useUIStore.getState().addAlert({
      id: 'breakdown-rm-101-1',
      type: 'critical',
      title: 'Breakdown',
      message: 'Roller Mill 101 has broken down',
      machineId: 'rm-101',
      timestamp: new Date(),
      acknowledged: false,
    });
    vi.advanceTimersByTime(1500);
    // The card is still filed, so the record shows the layer saw the alarm.
    expect(
      useProductionStore
        .getState()
        .aiDecisions.some((d) => d.relatedAlertId === 'breakdown-rm-101-1')
    ).toBe(true);
    expect(status()).toBe('critical');
  });
});
