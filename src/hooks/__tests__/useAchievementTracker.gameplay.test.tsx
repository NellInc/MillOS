import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { AchievementsPanel } from '../../components/game/AchievementsPanel';
import { storeOwnedLoad } from '../../simulation/machineLoad';
import type { MachineData } from '../../types';

const achievement = (id: string) => useAchievementsStore.getState().getAchievement(id);
const setTotal = (totalBagsProduced: number) => useProductionStore.setState({ totalBagsProduced });

describe('Reset all achievements counts bags from the reset', () => {
  beforeEach(() => {
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [], machines: [], totalBagsProduced: 0 });
  });

  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
  });

  it('does not re-unlock century and thousand on the first bag after the panel Reset', () => {
    const hook = renderHook(() => useAchievementTracker());
    setTotal(1500);
    expect(achievement('thousand')?.unlocked).toBe(true);

    const panel = render(<AchievementsPanel onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(achievement('century')?.unlocked).toBe(false);

    setTotal(1501);
    // One bag since the reset: the first bag is earned again, the counts are not.
    expect(achievement('first-bag')?.unlocked).toBe(true);
    expect(achievement('century')?.unlocked).toBe(false);
    expect(achievement('century')?.progress).toBe(1);
    expect(achievement('thousand')?.progress).toBe(1);

    setTotal(1600);
    expect(achievement('century')?.unlocked).toBe(true);
    panel.unmount();
    hook.unmount();
  });

  it('keeps counting lifetime bags for a store with no reset baseline (older saves)', () => {
    const hook = renderHook(() => useAchievementTracker());
    setTotal(120);
    expect(achievement('century')?.unlocked).toBe(true);
    expect(achievement('thousand')?.progress).toBe(120);
    hook.unmount();
  });
});

// F6: full-capacity reads the live load model. The line reaches 90% load at
// 135% rated pace and above, and stays below it at the 80% boot pace.
describe('full-capacity is reachable through the live load model', () => {
  const machine = (id: string, load: number): MachineData =>
    ({ id, name: id, status: 'running', lastMaintenance: 'x', metrics: { load } }) as never;

  const settle = (speed: number) => {
    let machines = ['silo-a', 'rm-101', 'sifter-a', 'packer-1'].map((id, i) =>
      machine(id, 60 + i * 10)
    );
    // The offline controller's own step: storeOwnedLoad, stored at 0.1 resolution.
    for (let step = 0; step < 200; step++) {
      machines = machines.map((m) => ({
        ...m,
        metrics: { ...m.metrics, load: Math.round(storeOwnedLoad(m, speed) * 10) / 10 },
      }));
    }
    return machines;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });

  it('unlocks at 135% line speed and not at the 80% boot pace', () => {
    useProductionStore.setState({ aiDecisions: [], machines: settle(0.8) });
    const hook = renderHook(() => useAchievementTracker());
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.unlocked).toBe(false);
    expect(achievement('full-capacity')?.progress).toBeLessThan(90);

    useProductionStore.setState({ machines: settle(1.35) });
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.unlocked).toBe(true);
    hook.unmount();
  });

  // The panel draws progress as a bar toward 90; it fell from 85 to 60 when
  // the line eased off. Working if the bar keeps the best reading reached.
  it('keeps the best load reached rather than moving the bar backwards', () => {
    useProductionStore.setState({ aiDecisions: [], machines: [machine('rm-101', 85)] });
    const hook = renderHook(() => useAchievementTracker());
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.progress).toBe(85);
    useProductionStore.setState({ machines: [machine('rm-101', 60)] });
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.progress).toBe(85);
    hook.unmount();
  });
});
