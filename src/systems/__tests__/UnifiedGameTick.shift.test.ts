import { beforeEach, describe, expect, it } from 'vitest';
import { unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { MAX_GAME_SPEED, PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { getSmoothedGameTime } from '../DisplaySmoothing';
import { readFileSync } from 'node:fs';

const ctx = (over: Partial<TickContext> = {}): TickContext => ({
  deltaSeconds: 1.0,
  gameTime: 0,
  gameSpeed: STANDARD_GAME_SPEED,
  elapsedTime: 0,
  tickCount: 0,
  ...over,
});

describe('UnifiedGameTick run-window reconciliation', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('advances the run window with the clock across a boundary', () => {
    // Regression: the unified tick advanced gameTime but left the run window
    // frozen, so the HUD showed e.g. "afternoon" at 23:59.
    const store = useGameSimulationStore.getState();
    store.setGameTime(21.99); // late afternoon, just before the 22:00 -> night boundary
    expect(useGameSimulationStore.getState().currentShift).toBe('afternoon');

    unifiedGameTick(ctx({ gameSpeed: MAX_GAME_SPEED }));

    const s = useGameSimulationStore.getState();
    expect(s.gameTime).toBeGreaterThanOrEqual(22);
    expect(s.currentShift).toBe('night');
  });

  it.each(PACE_GAME_SPEEDS.filter((pace) => pace > 0))(
    'advances the canonical clock at advertised pace %i',
    (gameSpeed) => {
      useGameSimulationStore.getState().setGameTime(10);

      unifiedGameTick(ctx({ gameSpeed }));

      expect(useGameSimulationStore.getState().gameTime).toBeCloseTo(10 + gameSpeed / 3600);
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'ignores malformed tick delta %s without corrupting canonical time',
    (deltaSeconds) => {
      useGameSimulationStore.getState().setGameTime(10);

      unifiedGameTick(ctx({ deltaSeconds }));

      expect(useGameSimulationStore.getState().gameTime).toBe(10);
    }
  );

  it('saturates the canonical day counter at the safe integer boundary', () => {
    useGameSimulationStore.setState({
      gameTime: 23.99,
      gameDay: Number.MAX_SAFE_INTEGER,
    });

    unifiedGameTick(ctx({ gameSpeed: MAX_GAME_SPEED }));

    expect(useGameSimulationStore.getState()).toMatchObject({
      gameDay: Number.MAX_SAFE_INTEGER,
      currentShift: 'night',
    });
    expect(useGameSimulationStore.getState().gameTime).toBeCloseTo(
      23.99 + MAX_GAME_SPEED / 3600 - 24
    );
  });

  it('leaves the run window unchanged inside its clock range', () => {
    const store = useGameSimulationStore.getState();
    store.setGameTime(15); // mid-afternoon
    unifiedGameTick(ctx({ gameSpeed: STANDARD_GAME_SPEED })); // tiny advance, stays inside afternoon
    expect(useGameSimulationStore.getState().currentShift).toBe('afternoon');
  });
});

describe('setGameTime run-window reconciliation', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('keeps the run window in sync when the clock is set directly', () => {
    // Direct clock sets must not leave the run window stale.
    const store = useGameSimulationStore.getState();
    store.setShift('morning');
    store.setGameTime(23); // night
    const s = useGameSimulationStore.getState();
    expect(s.currentShift).toBe('night');
  });
});

// Art and benchmark captures labelled 12:00 ran the clock at STANDARD_GAME_SPEED
// under --motion: two packing shots 14 s apart were 7 game-minutes apart and
// the skylight sun patches moved about 40 px (final4-med-12 rubric). A capture
// holds the time of day while vehicles, machines and material keep moving.
describe('held time of day (capture mode)', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.getState().setTimeOfDayHeld(false);
  });

  it('keeps the clock and sky still while the simulation runs at pace', () => {
    const store = useGameSimulationStore.getState();
    store.setGameTime(12);
    store.setGameSpeed(STANDARD_GAME_SPEED);
    store.setTimeOfDayHeld(true);
    const materialBefore = useMaterialFlowStore.getState().simulationTime;
    for (let i = 0; i < 14; i += 1) unifiedGameTick(ctx({ gameSpeed: STANDARD_GAME_SPEED }));
    useGameSimulationStore.getState().tickGameTime(1);
    const held = useGameSimulationStore.getState();
    expect(held.gameTime).toBe(12);
    expect(held.gameSpeed).toBe(STANDARD_GAME_SPEED);
    expect(useMaterialFlowStore.getState().simulationTime).toBeGreaterThan(materialBefore);
    // Released, the same tick advances the clock again.
    held.setTimeOfDayHeld(false);
    unifiedGameTick(ctx({ gameSpeed: STANDARD_GAME_SPEED }));
    expect(useGameSimulationStore.getState().gameTime).toBeCloseTo(12 + STANDARD_GAME_SPEED / 3600);
  });

  it('is never persisted, and the benchmark route holds and restores it', () => {
    useGameSimulationStore.getState().setTimeOfDayHeld(true);
    const persist = useGameSimulationStore.persist.getOptions().partialize!;
    expect(persist(useGameSimulationStore.getState())).not.toHaveProperty('timeOfDayHeld');
    const controller = readFileSync('src/components/RuntimeController.tsx', 'utf8');
    expect(controller).toContain('game.setTimeOfDayHeld(true);');
    expect(controller).toContain('currentGame.setTimeOfDayHeld(previousGameInputs.timeOfDayHeld);');
    const sky = readFileSync('src/components/environment/OptimizedSkySystem.tsx', 'utf8');
    expect(sky).toContain('timeOfDayHeld ? 0 : gameSpeed');
    // The display extrapolation does not lead a held clock.
    expect(getSmoothedGameTime(12, 0.4, 0)).toBe(12);
  });
});
