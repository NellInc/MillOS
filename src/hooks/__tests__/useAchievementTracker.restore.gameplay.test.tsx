import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useUIStore } from '../../stores/uiStore';
import type { MachineData } from '../../types';

const progress = (id: string) => useAchievementsStore.getState().getAchievement(id)?.progress;
const machine = (id: string, lastMaintenance: string): MachineData =>
  ({ id, name: id, lastMaintenance, status: 'running', metrics: {} }) as unknown as MachineData;

// A workplace replay checkpoint restores the machines as they were captured,
// so a machine serviced since then gets its OLDER lastMaintenance back. That
// is the record going back in time, not a service, and must not count.
describe('maintenance-master across a plant restore', () => {
  beforeEach(() => {
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useBreakdownStore.setState({ activeBreakdowns: [] });
    useProductionStore.setState({
      aiDecisions: [],
      machines: [machine('rm-101', '2026-10-01T09:00:00.000Z')],
    });
  });

  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('counts a service once and not again when a checkpoint rolls the record back', () => {
    const { unmount } = renderHook(() => useAchievementTracker());
    const checkpoint = structuredClone(useAchievementsStore.getState().achievements);

    useProductionStore.setState({ machines: [machine('rm-101', '2026-10-01T11:00:00.000Z')] });
    expect(progress('maintenance-master')).toBe(1);

    // restorePlant: achievements first, then the production store.
    useAchievementsStore.setState({ achievements: checkpoint });
    useProductionStore.setState({ machines: [machine('rm-101', '2026-10-01T09:00:00.000Z')] });
    expect(progress('maintenance-master')).toBe(0);

    // The replayed timeline services the machine again: that one counts.
    useProductionStore.setState({ machines: [machine('rm-101', '2026-10-01T12:00:00.000Z')] });
    expect(progress('maintenance-master')).toBe(1);
    unmount();
  });
});
