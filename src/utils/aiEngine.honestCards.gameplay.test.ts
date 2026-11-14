import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_ENGINE_TIMING,
  applyDecisionEffects,
  generateContextAwareDecision,
  initializeAIEngine,
  initializeDecisionOutcomeTracking,
} from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AIDecision, MachineData } from '../types';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// The rules layer's cards taught the wrong things about AI (review 10, F3).
// "Confidence" rose when the player accepted and fell when they rejected, so it
// measured agreement. The CPU and MEM tiles were numbers made from the card
// count. And "Queue condition-based maintenance" queued nothing: accepting only
// eases a critical unit back to warning. Working if confidence ignores the
// player's answers, the engine reports no CPU or MEM reading, and each card's
// text says what accepting it does.

const card = (id: string) => useProductionStore.getState().aiDecisions.find((d) => d.id === id);
const machine = (id: string) => useProductionStore.getState().machines.find((m) => m.id === id);

describe('confidence does not follow the player', () => {
  let release: (() => void) | null = null;

  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30, gameDay: 0, gameTime: 10 });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [], productionSpeed: 1 });
    useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
    release = initializeDecisionOutcomeTracking();
  });

  afterEach(() => {
    release?.();
    release = null;
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  const fileOptimization = (): AIDecision => {
    const filed = generateContextAwareDecision('optimization');
    expect(filed).not.toBeNull();
    return filed!;
  };

  it('is unchanged by ten rejections', () => {
    const first = fileOptimization();
    useProductionStore.getState().recordDecisionResponse(first.id, 'rejected');
    for (let i = 0; i < 10; i++) {
      const filed = fileOptimization();
      useProductionStore.getState().recordDecisionResponse(filed.id, 'rejected');
      expect(card(filed.id)?.status).toBe('superseded');
    }
    expect(fileOptimization().confidence).toBe(first.confidence);
  });

  it('is unchanged by ten acceptances', () => {
    const first = fileOptimization();
    applyDecisionEffects(first, 'accepted');
    for (let i = 0; i < 10; i++) {
      const filed = fileOptimization();
      applyDecisionEffects(filed, 'accepted');
      expect(card(filed.id)?.status).toBe('completed');
    }
    expect(fileOptimization().confidence).toBe(first.confidence);
  });
});

describe('the engine reports no CPU or MEM reading', () => {
  let release: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    // Held clock: no tactical card is filed, so only the status sample runs.
    useGameSimulationStore.setState({ gameSpeed: 0, gameDay: 0, gameTime: 10 });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines(mockMachines.map((m) => ({ ...m })));
  });

  afterEach(() => {
    release?.();
    release = null;
    vi.useRealTimers();
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  const pendingCards = (count: number): AIDecision[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `tile-card-${count}-${i}`,
      timestamp: new Date(),
      type: 'prediction',
      action: 'Recorded action',
      reasoning: 'Recorded reasoning',
      confidence: 70,
      impact: 'Recorded impact',
      status: 'pending',
      priority: 'medium',
    }));

  const sample = (cards: AIDecision[]) => {
    useProductionStore.setState({ aiDecisions: cards });
    vi.advanceTimersByTime(AI_ENGINE_TIMING.metricsUpdateInterval + AI_ENGINE_TIMING.loopInterval);
    return { ...useAIConfigStore.getState().systemStatus };
  };

  // The status carries no CPU or MEM field at all, so no card count can be
  // dressed up as one; only the count itself moves with the cards.
  it('samples the card count and no CPU or MEM reading, with 2 cards as with 20', () => {
    release = initializeAIEngine();
    const two = sample(pendingCards(2));
    const twenty = sample(pendingCards(20));
    expect(Object.keys(two).sort()).toEqual(['decisions', 'successRate']);
    expect(two.decisions).toBe(2);
    expect(twenty.decisions).toBe(20);
    expect(twenty.successRate).toBe(two.successRate);
  });
});

describe('each card says what accepting it does', () => {
  const unit = (id: string, patch: Partial<MachineData>): MachineData => {
    const base = mockMachines.find((m) => m.id === id)!;
    return { ...base, ...patch, metrics: { ...base.metrics, ...(patch.metrics ?? {}) } };
  };

  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30, gameDay: 0, gameTime: 10 });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [], productionSpeed: 1 });
    useBreakdownStore.setState({ activeBreakdowns: [] } as never);
  });

  afterEach(() => {
    useProductionStore.setState({ aiDecisions: [], productionSpeed: 1 });
    useProductionStore.getState().setMachines([]);
  });

  // The riskiest unit is the one the card names: give it the readings.
  const only = (m: MachineData) => useProductionStore.getState().setMachines([m]);

  it('maintenance: says it returns a critical unit to warning and books no maintenance', () => {
    only(unit('rm-101', { status: 'critical', metrics: { wear: 40, temperature: 85 } }));
    const filed = generateContextAwareDecision('maintenance')!;
    expect(filed.action).not.toMatch(/queue/i);
    expect(filed.action).toMatch(/warning if it is critical/i);
    expect(filed.impact).toMatch(/no maintenance/i);
    applyDecisionEffects(filed, 'accepted');
    expect(machine('rm-101')?.status).toBe('warning');
  });

  it('maintenance: a unit that is not critical is left as it is, as the card says', () => {
    only(unit('rm-101', { status: 'running', metrics: { wear: 86 } }));
    const filed = generateContextAwareDecision('maintenance')!;
    expect(filed.action).toMatch(/if it is critical/i);
    applyDecisionEffects(filed, 'accepted');
    expect(machine('rm-101')?.status).toBe('running');
  });

  it('maintenance: a worn-out unit stays stopped, as the card says', () => {
    only(unit('rm-101', { status: 'critical', metrics: { wear: 95 } }));
    const filed = generateContextAwareDecision('maintenance')!;
    expect(filed.impact).toMatch(/worn-out .*stays stopped/i);
    applyDecisionEffects(filed, 'accepted');
    expect(machine('rm-101')?.status).toBe('critical');
  });

  it('maintenance: during an emergency the restart waits for the release, as the card says', () => {
    only(unit('rm-101', { status: 'critical', metrics: { wear: 40 } }));
    useGameSimulationStore.setState({ emergencyActive: true } as never);
    const filed = generateContextAwareDecision('maintenance')!;
    expect(filed.impact).toMatch(/emergency.*release/i);
    applyDecisionEffects(filed, 'accepted');
    expect(machine('rm-101')?.status).toBe('idle');
  });

  it('optimization: says it lowers the whole line rate by 2%, and does', () => {
    only(unit('rm-101', { status: 'running' }));
    const filed = generateContextAwareDecision('optimization')!;
    expect(filed.action).toMatch(/line rate/i);
    expect(filed.action).toMatch(/2%/);
    expect(filed.impact).not.toMatch(/recirculation|downstream/i);
    applyDecisionEffects(filed, 'accepted');
    expect(useProductionStore.getState().productionSpeed).toBeCloseTo(0.98, 6);
  });

  // Re-pinned for plan item 3.0: these two kinds changed nothing when accepted,
  // so they are no longer filed at all (the unit in warning is the partner's
  // service proposal now). Before, this pinned that they said so.
  it('prediction and coordination: no longer filed, by the loop or on request', () => {
    only(unit('rm-101', { status: 'warning', metrics: { temperature: 70 } }));
    expect(generateContextAwareDecision()).toBeNull();
    for (const type of ['prediction', 'coordination'] as const)
      expect(generateContextAwareDecision(type)).toBeNull();
    expect(useProductionStore.getState().aiDecisions).toEqual([]);
  });

  it('safety: says it idles a running unit and nothing more, and does', () => {
    only(unit('rm-101', { status: 'running' }));
    const filed = generateContextAwareDecision('safety')!;
    expect(filed.action).toMatch(/safe state/i);
    expect(filed.impact).toMatch(/idles/i);
    expect(filed.impact).not.toMatch(/routes|evidence/i);
    applyDecisionEffects(filed, 'accepted');
    expect(machine('rm-101')?.status).toBe('idle');
  });
});
