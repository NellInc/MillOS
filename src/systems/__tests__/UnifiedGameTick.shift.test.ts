import { beforeEach, describe, expect, it } from 'vitest';
import { unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// The unified tick reads gameTime from the store and deltaSeconds/gameSpeed from
// the context. gameSpeed is clamped to 1000; deltaSeconds is capped at 1.0. So
// the max advance per tick is 1000 / 3600 ≈ 0.278h — enough to cross a boundary
// that sits within ~0.25h of the current time.
const ctx = (over: Partial<TickContext> = {}): TickContext => ({
  deltaSeconds: 1.0,
  gameTime: 0,
  gameSpeed: 1000,
  elapsedTime: 0,
  tickCount: 0,
  ...over,
});

describe('UnifiedGameTick shift reconciliation (regression)', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('advances currentShift with the clock across a shift boundary', () => {
    // Regression: the unified tick advanced gameTime but left currentShift
    // frozen, so the HUD showed e.g. "afternoon" at 23:59.
    const store = useGameSimulationStore.getState();
    store.setGameTime(21.9); // late afternoon, just before the 22:00 -> night boundary
    expect(useGameSimulationStore.getState().currentShift).toBe('afternoon');

    unifiedGameTick(ctx()); // ~+0.278h -> ~22.18, crosses 22:00

    const s = useGameSimulationStore.getState();
    expect(s.gameTime).toBeGreaterThanOrEqual(22);
    expect(s.currentShift).toBe('night');
    expect(s.shiftData.currentShift).toBe('night');
  });

  it('leaves the shift unchanged within a shift window', () => {
    const store = useGameSimulationStore.getState();
    store.setGameTime(15); // mid-afternoon
    unifiedGameTick(ctx({ gameSpeed: 180 })); // tiny advance, stays inside afternoon
    expect(useGameSimulationStore.getState().currentShift).toBe('afternoon');
  });
});

describe('setGameTime shift reconciliation (regression)', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('keeps currentShift in sync when the clock is set directly', () => {
    // Direct clock sets (e.g. multiplayer sync) must not leave the shift stale.
    const store = useGameSimulationStore.getState();
    store.setShift('morning');
    store.setGameTime(23); // night
    const s = useGameSimulationStore.getState();
    expect(s.currentShift).toBe('night');
    expect(s.shiftData.currentShift).toBe('night');
  });
});
