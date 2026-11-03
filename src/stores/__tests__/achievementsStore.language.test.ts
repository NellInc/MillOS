import { afterEach, describe, expect, it } from 'vitest';
import { useAchievementsStore } from '../achievementsStore';
import { setLocale } from '../../i18n';

// A physical save and a workplace replay checkpoint both carry achievements
// with the copy resolved when they were captured, and restore them with a plain
// setState. Working if a session saved in English reloads in Portuguese.
describe('restored achievement copy', () => {
  afterEach(() => {
    setLocale('en');
    useAchievementsStore.getState().resetAchievements();
  });

  it('reads in the active language after a restore captured in another', () => {
    setLocale('en');
    useAchievementsStore.getState().unlockAchievement('first-bag');
    const savedInEnglish = structuredClone(useAchievementsStore.getState().achievements);

    setLocale('pt-BR');
    useAchievementsStore.setState({ achievements: savedInEnglish });

    const firstBag = useAchievementsStore.getState().getAchievement('first-bag');
    expect(firstBag?.name).toBe('Primeiro saco');
    expect(firstBag?.unlocked).toBe(true);
  });
});
