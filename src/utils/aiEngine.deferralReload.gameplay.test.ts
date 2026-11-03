import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_ENGINE_TIMING,
  generateContextAwareDecision,
  initializeAIEngine,
  isDeferralReturned,
} from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// The physical session restores the cards, but the engine's deferral ledger was
// module memory: after a reload a card already back ("lapses in 2 h") started
// its wait again, came back a second time an hour later and lapsed three plant
// hours after the reload. Working if a reload keeps the deferral's plant time.
const card = (id: string) => useProductionStore.getState().aiDecisions.find((d) => d.id === id);
const setClock = (gameDay: number, gameTime: number) =>
  useGameSimulationStore.setState({ gameDay, gameTime });
const loop = () => vi.advanceTimersByTime(AI_ENGINE_TIMING.loopInterval);

describe('a deferred AI card across a reload', () => {
  let release: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameSpeed: 30 });
    useAIConfigStore.getState().setAIMode('heuristic');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines(mockMachines.map((machine) => ({ ...machine })));
    setClock(0, 10);
  });
  afterEach(() => {
    release?.();
    release = null;
    vi.useRealTimers();
    useProductionStore.setState({ aiDecisions: [] });
    useProductionStore.getState().setMachines([]);
  });

  it('lapses when its returned note said, not three plant hours after the reload', () => {
    release = initializeAIEngine();
    const filed = generateContextAwareDecision();
    useProductionStore.getState().recordDecisionResponse(filed!.id, 'deferred');
    loop();
    setClock(0, 11.05);
    loop();
    expect(isDeferralReturned(filed!.id)).toBe(true);

    // A fresh page: the stores come back, the engine's module state does not.
    release();
    setClock(0, 12.5);
    release = initializeAIEngine();
    loop();
    expect(isDeferralReturned(filed!.id)).toBe(true);

    setClock(0, 13.05);
    loop();
    expect(card(filed!.id)?.status).toBe('superseded');
  });
});
