import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_ENGINE_TIMING,
  generateContextAwareDecision,
  getImpactStats,
  initializeAIEngine,
  isDeferralReturned,
} from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { mockMachines } from '../test/fixtures/mockMachines';

vi.mock('./onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));

// A deferred card stayed 'pending' for the rest of the session: it blocked a
// fresh card for its machine and condition and held one of the tactical
// layer's 40 unresolved places, and only Accept or Reject could ever end it.
// Working if a deferred card comes back to the player once after a plant hour
// and is superseded, with that history in its outcome, two plant hours later.

const card = (id: string) => useProductionStore.getState().aiDecisions.find((d) => d.id === id);
const setClock = (gameDay: number, gameTime: number) =>
  useGameSimulationStore.setState({ gameDay, gameTime });
const loop = () => vi.advanceTimersByTime(AI_ENGINE_TIMING.loopInterval);

describe('a deferred AI card on the plant clock', () => {
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

  const deferOne = () => {
    const filed = generateContextAwareDecision();
    expect(filed).not.toBeNull();
    useProductionStore.getState().recordDecisionResponse(filed!.id, 'deferred');
    return filed!;
  };

  it('returns once after a plant hour, then is superseded and frees its place', () => {
    release = initializeAIEngine();
    const deferred = deferOne();
    loop();

    setClock(0, 10.9);
    loop();
    expect(card(deferred.id)?.response?.note).toBeUndefined();

    setClock(0, 11.05);
    loop();
    expect(card(deferred.id)?.status).toBe('pending');
    expect(card(deferred.id)?.response).toMatchObject({ disposition: 'deferred' });
    expect(card(deferred.id)?.response?.note).toMatch(/back/i);
    expect(isDeferralReturned(deferred.id)).toBe(true);

    setClock(0, 12.9);
    loop();
    expect(card(deferred.id)?.status).toBe('pending');

    // Across midnight: day 1, 01:05 is 15 plant hours on, well past the lapse.
    const triedBefore = getImpactStats().totalDecisions;
    setClock(1, 1.05);
    loop();
    expect(card(deferred.id)?.status).toBe('superseded');
    expect(card(deferred.id)?.outcome).toMatch(/deferred/i);
    // The note that said when it would lapse is replaced by the lapse itself.
    expect(card(deferred.id)?.response?.note).toBe(card(deferred.id)?.outcome);
    expect(card(deferred.id)?.response?.disposition).toBe('deferred');
    // Never tried, so the outcome statistics are not told it failed.
    expect(getImpactStats().totalDecisions).toBe(triedBefore);

    // The machine and condition can be raised again.
    const fresh = generateContextAwareDecision(deferred.type);
    expect(fresh?.machineId).toBe(deferred.machineId);
  });

  it('restarts the wait when Reset to 10 AM winds the clock back', () => {
    setClock(0, 20);
    release = initializeAIEngine();
    const deferred = deferOne();
    loop();

    // Reset to 10 AM: day 0, 10:00 is "before" the deferral.
    setClock(0, 10);
    loop();
    setClock(0, 12.5);
    loop();
    expect(card(deferred.id)?.status).toBe('pending');
    setClock(0, 13.05);
    loop();
    expect(card(deferred.id)?.status).toBe('superseded');
  });

  it('holds while the clock is held: a paused plant spends no deferral time', () => {
    release = initializeAIEngine();
    const deferred = deferOne();
    loop();
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(card(deferred.id)?.status).toBe('pending');
    expect(card(deferred.id)?.response?.note).toBeUndefined();
  });
});
