import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAIEngine } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AlertData } from '../types';

// The engine leases the on-device operator too; it has its own tests.
vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// Alert reactions lived in the AI Command Center's effect, so with the panel
// closed (its usual state) an alert got no reaction at all. They now run in the
// engine, which App leases whenever the AI layer runs.
// Working if an alert gets one reaction with no panel mounted, an alert that was
// already listed when the engine started gets none, and LLM-only mode files none.

const alert = (id: string, extra: Partial<AlertData> = {}): AlertData => ({
  id,
  type: 'warning',
  title: 'Bearing warm',
  message: 'RM-101 bearing temperature rising',
  machineId: 'rm-101',
  timestamp: new Date(),
  acknowledged: false,
  ...extra,
});

const alertCards = () =>
  useProductionStore.getState().aiDecisions.filter((decision) => decision.triggeredBy === 'alert');

describe('alert reactions run with the engine, not the panel', () => {
  let release: (() => void) | null = null;
  const isLLMReady = useAIConfigStore.getState().isLLMReady;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30 });
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
    useAIConfigStore.setState({ isLLMReady });
    useAIConfigStore.getState().setAIMode('heuristic');
  });

  it('answers a new machine alert once, 1.5 s after it lands, with no panel open', () => {
    release = initializeAIEngine();
    useUIStore.getState().addAlert(alert('alert-closed-panel'));
    vi.advanceTimersByTime(1499);
    expect(alertCards()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(alertCards().map((card) => card.relatedAlertId)).toEqual(['alert-closed-panel']);
    // Later alert-list updates (another alert, an acknowledgement) do not answer it again.
    useUIStore.getState().acknowledgeAlert('alert-closed-panel');
    useUIStore.getState().addAlert(alert('alert-info', { machineId: undefined, type: 'info' }));
    vi.advanceTimersByTime(3000);
    expect(alertCards()).toHaveLength(1);
  });

  it('answers each of two alerts raised in one burst', () => {
    release = initializeAIEngine();
    useUIStore.getState().addAlert(alert('alert-a'));
    useUIStore.getState().addAlert(alert('alert-b', { machineId: 'rm-102' }));
    vi.advanceTimersByTime(1500);
    expect(
      alertCards()
        .map((card) => card.relatedAlertId)
        .sort()
    ).toEqual(['alert-a', 'alert-b']);
  });

  it('leaves alerts listed before the engine started, and its own operator notices', () => {
    useUIStore.getState().addAlert(alert('alert-before-start'));
    release = initializeAIEngine();
    useUIStore.getState().addAlert(alert('on-device-incident-1-stoodDown'));
    vi.advanceTimersByTime(3000);
    expect(alertCards()).toHaveLength(0);
  });

  // Completed maintenance raises a 'success' alert naming its machine. With
  // reactions always on, every repair the player finished filed an automatic
  // "watch for a protective derate" card about the machine just serviced.
  it('answers alarms only, not a success or info notice that names a machine', () => {
    release = initializeAIEngine();
    useUIStore.getState().addAlert(alert('alert-maintenance-done', { type: 'success' }));
    useUIStore.getState().addAlert(alert('alert-note', { type: 'info' }));
    vi.advanceTimersByTime(3000);
    expect(alertCards()).toHaveLength(0);
  });

  it('files no rules-layer reaction in LLM-only mode', () => {
    release = initializeAIEngine();
    useAIConfigStore.setState({ aiMode: 'gemini', isLLMReady: () => true });
    useUIStore.getState().addAlert(alert('alert-llm-only'));
    vi.advanceTimersByTime(3000);
    expect(alertCards()).toHaveLength(0);
  });

  // The engine files no card while the shift clock is held (P, Paused, tour,
  // handoff, a workplace replay), and a safety reaction idles its machine: the
  // reaction waits for the clock rather than changing a frozen plant.
  it('waits while the shift clock is held and answers once it runs again', () => {
    release = initializeAIEngine();
    useGameSimulationStore.setState({ gameSpeed: 0 });
    useUIStore.getState().addAlert(alert('alert-while-held'));
    vi.advanceTimersByTime(10_000);
    expect(alertCards()).toHaveLength(0);
    useGameSimulationStore.setState({ gameSpeed: 30 });
    vi.advanceTimersByTime(1500);
    expect(alertCards().map((card) => card.relatedAlertId)).toEqual(['alert-while-held']);
  });

  it('cancels a pending reaction when the last engine lease ends', () => {
    release = initializeAIEngine();
    useUIStore.getState().addAlert(alert('alert-then-stop'));
    release();
    release = null;
    vi.advanceTimersByTime(3000);
    expect(alertCards()).toHaveLength(0);
  });
});
