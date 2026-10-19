import { beforeEach, describe, expect, it } from 'vitest';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { getShiftWindowKey, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { MAX_GAME_SPEED } from '../../simulation/pace';

let tickCount = 0;
function tickAt(gameSpeed: number, deltaSeconds = 1) {
  unifiedGameTick({
    deltaSeconds,
    gameSpeed,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * deltaSeconds,
    tickCount: ++tickCount,
  });
}

beforeEach(() => {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  tickCount = 0;
});

describe('shift window keys', () => {
  it('keys the night by the day on which it started', () => {
    expect(getShiftWindowKey(3, 23, 'night')).toBe('day-3-night');
    expect(getShiftWindowKey(4, 2, 'night')).toBe('day-3-night');
    expect(getShiftWindowKey(0, 2, 'night')).toBe('day-0-night');
    expect(getShiftWindowKey(4, 7, 'morning')).toBe('day-4-morning');
  });

  it('closes one Night report for 22:00 to 06:00 on the real tick', () => {
    useGameSimulationStore.getState().setGameTime(21.5);
    // The fastest pace, 2 game minutes per tick, across midnight to 06:30.
    for (let i = 0; i < 270; i++) tickAt(MAX_GAME_SPEED);
    expect(useGameSimulationStore.getState().gameDay).toBe(1);
    const nights = useOperationsCampaignStore
      .getState()
      .reports.filter((report) => report.shiftKey.endsWith('night'));
    expect(nights).toHaveLength(1);
    expect(nights[0].shiftKey).toBe('day-0-night');
    expect(nights[0].endedAtMinute - nights[0].startedAtMinute).toBeCloseTo(480, 5);
  });
});
