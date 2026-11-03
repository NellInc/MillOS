import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { DecisionHistoryPanel } from './ui/DecisionHistoryPanel';
import {
  generateContextAwareDecision,
  initializeAIEngine,
  AI_ENGINE_TIMING,
} from '../utils/aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { setLocale } from '../i18n';
import { mockMachines } from '../test/fixtures/mockMachines';

vi.mock('../utils/onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));
vi.mock('./ui/ActionPlanTimeline', () => ({ ActionPlanTimeline: () => null }));
vi.mock('./ui/StrategicPriorityCards', () => ({ StrategicPriorityCards: () => null }));
vi.mock('./ui/VCLDebugPanel', () => ({ VCLDebugPanel: () => null }));
vi.mock('./ui/VCLDiffPanel', () => ({ VCLDiffPanel: () => null }));
vi.mock('./ui/DecisionReplay', () => ({
  DecisionReplay: () => null,
  DecisionReplayTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// A card the engine filed in English kept its English text after the player
// switched to Portuguese, including a pending card they still had to answer.
// Working if a card's text follows the language, and a card recorded before
// keys were kept (or an operator's modified action) shows its stored text.

describe('AI decision cards follow the interface language', () => {
  beforeEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30, gameDay: 0, gameTime: 10 });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    // One unit clearly the riskiest, so the card names it with these readings.
    useProductionStore.getState().setMachines(
      mockMachines.map((machine) =>
        machine.id === mockMachines[0].id
          ? {
              ...machine,
              status: 'critical' as const,
              metrics: { ...machine.metrics, temperature: 99.5, vibration: 9.25, wear: 90 },
            }
          : { ...machine }
      )
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    act(() => setLocale('en'));
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  it('shows a pending card filed in English in Portuguese after the switch', () => {
    const filed = generateContextAwareDecision('maintenance');
    expect(filed).not.toBeNull();
    expect(filed!.action).toMatch(/^Queue condition-based maintenance/);

    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    expect(screen.getByText(/^Queue condition-based maintenance/)).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    expect(screen.queryByText(/^Queue condition-based maintenance/)).toBeNull();
    expect(screen.getByText(/^Programar manutenção baseada em condição para/)).toBeInTheDocument();
    // Numbers in the reasoning read in the new language too.
    expect(
      screen.getByText('A telemetria indica 99,5 °C, vibração de 9,25 mm/s e 90% de desgaste.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^Reduz o risco de pane/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeInTheDocument();
  });

  it('shows a returned deferral note in the language active now', () => {
    vi.useFakeTimers();
    const release = initializeAIEngine();
    try {
      const filed = generateContextAwareDecision('maintenance')!;
      useProductionStore.getState().recordDecisionResponse(filed.id, 'deferred');
      vi.advanceTimersByTime(AI_ENGINE_TIMING.loopInterval);
      useGameSimulationStore.setState({ gameTime: 11.05 });
      vi.advanceTimersByTime(AI_ENGINE_TIMING.loopInterval);
      expect(
        useProductionStore.getState().aiDecisions.find((d) => d.id === filed.id)?.response?.note
      ).toMatch(/back for a decision/);

      render(<AICommandCenter isOpen onClose={() => {}} embedded />);
      act(() => setLocale('pt-BR'));
      expect(screen.queryByText(/back for a decision/)).toBeNull();
      expect(screen.getByText(/de volta para decisão/)).toBeInTheDocument();
    } finally {
      release();
    }
  });

  it('keeps an operator-modified action and an older card as recorded', () => {
    const filed = generateContextAwareDecision('maintenance')!;
    useProductionStore.getState().recordDecisionResponse(filed.id, 'modified', {
      modifiedAction: 'Hold R.M. 101 at 80 percent',
    });
    useProductionStore.getState().addAIDecision({
      id: 'legacy-card',
      timestamp: new Date(),
      type: 'prediction',
      action: 'Legacy recorded action',
      reasoning: 'Legacy recorded reasoning',
      confidence: 70,
      impact: 'Legacy recorded impact',
      status: 'pending',
      priority: 'medium',
    });

    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    act(() => setLocale('pt-BR'));
    expect(screen.getByText('Hold R.M. 101 at 80 percent')).toBeInTheDocument();
    expect(screen.getByText('Legacy recorded action')).toBeInTheDocument();
    expect(screen.getByText('Legacy recorded reasoning')).toBeInTheDocument();
  });

  it('lists the card in the decision history in the language active now', () => {
    generateContextAwareDecision('maintenance');
    render(<DecisionHistoryPanel />);
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/^Programar manutenção baseada em condição para/)).toBeInTheDocument();
  });
});
