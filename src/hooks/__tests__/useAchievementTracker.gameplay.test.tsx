import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { AchievementsPanel } from '../../components/game/AchievementsPanel';
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

// full-capacity reads the line rate while every machine runs clear (plan 1.14;
// the load it read once never reached its mark in a default session, see
// achievementsStore.session.gameplay.test.ts). The boot rate shows 80 of 100.
describe('full-capacity reads the line rate with every machine running clear', () => {
  const machine = (id: string, status: MachineData['status'] = 'running'): MachineData =>
    ({ id, name: id, status, lastMaintenance: 'x', metrics: { load: 74 } }) as never;
  const line = ['silo-a', 'rm-101', 'sifter-a', 'packer-1'].map((id) => machine(id));

  beforeEach(() => {
    vi.useFakeTimers();
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameSimulationStore.getState().resetGameState();
  });

  it('unlocks at 100% with every machine running, not at the 80% boot rate or with a warning', () => {
    useProductionStore.setState({ aiDecisions: [], machines: line, productionSpeed: 0.8 });
    const hook = renderHook(() => useAchievementTracker());
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.unlocked).toBe(false);
    expect(achievement('full-capacity')?.progress).toBe(80);

    useProductionStore.setState({
      machines: [...line.slice(1), machine('silo-a', 'warning')],
      productionSpeed: 1,
    });
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.unlocked).toBe(false);

    useProductionStore.setState({ machines: line });
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.unlocked).toBe(true);
    hook.unmount();
  });

  // The panel draws progress as a bar toward its mark. Working if the bar
  // keeps the best rate reached when the line is slowed again.
  it('keeps the best rate reached rather than moving the bar backwards', () => {
    useProductionStore.setState({ aiDecisions: [], machines: line, productionSpeed: 0.9 });
    const hook = renderHook(() => useAchievementTracker());
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.progress).toBe(90);
    useProductionStore.setState({ productionSpeed: 0.6 });
    vi.advanceTimersByTime(5000);
    expect(achievement('full-capacity')?.progress).toBe(90);
    hook.unmount();
  });
});
