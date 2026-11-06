import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAchievementTracker } from '../useAchievementTracker';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import { setLocale } from '../../i18n';
import { alertText } from '../../i18n/alertCopy';

// The bell is restored with the physical session, so an unlock filed in English
// outlives a language switch. Working if it reads in the language active now.
describe('achievement unlock notice after a language switch', () => {
  beforeEach(() => {
    setLocale('en');
    useAchievementsStore.getState().resetAchievements();
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    setLocale('en');
    useAchievementsStore.getState().resetAchievements();
    useGameSimulationStore.getState().resetGameState();
  });

  it('reads in Portuguese when filed in English and the player switches language', () => {
    const { unmount } = renderHook(() => useAchievementTracker());
    useAchievementsStore.getState().unlockAchievement('first-bag');
    const notice = useUIStore
      .getState()
      .alerts.find((a) => a.id.startsWith('achievement-first-bag'));
    expect(notice).toBeDefined();
    expect(alertText(notice!).title).toBe('Achievement Unlocked');
    expect(alertText(notice!).message).toBe('First Bag - The first bag is always the hardest.');

    setLocale('pt-BR');
    const text = alertText(notice!);
    expect(text.title).toBe('Conquista desbloqueada');
    expect(text.message.startsWith('Primeiro saco - ')).toBe(true);
    unmount();
  });
});
