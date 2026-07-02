/**
 * Achievements Store Tests
 *
 * Tests for progress thresholds, unlock idempotence, and unknown-id no-ops.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAchievementsStore } from '../achievementsStore';

describe('AchievementsStore', () => {
  beforeEach(() => {
    useAchievementsStore.getState().resetAchievements();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('updateAchievementProgress', () => {
    it('should record progress below the target without unlocking', () => {
      const { updateAchievementProgress, getAchievement } = useAchievementsStore.getState();
      updateAchievementProgress('century', 50); // target 100

      const achievement = getAchievement('century')!;
      expect(achievement.progress).toBe(50);
      expect(achievement.unlocked).toBe(false);
      expect(achievement.unlockedAt).toBeUndefined();
    });

    it('should unlock exactly at the target threshold', () => {
      const { updateAchievementProgress, getAchievement } = useAchievementsStore.getState();
      updateAchievementProgress('century', 99);
      expect(getAchievement('century')!.unlocked).toBe(false);

      updateAchievementProgress('century', 100);
      const achievement = useAchievementsStore.getState().getAchievement('century')!;
      expect(achievement.unlocked).toBe(true);
      expect(achievement.progress).toBe(100);
      expect(achievement.unlockedAt).toBeInstanceOf(Date);
    });

    it('should cap progress at the target when given a larger value', () => {
      const { updateAchievementProgress } = useAchievementsStore.getState();
      updateAchievementProgress('thousand', 5000); // target 1000

      const achievement = useAchievementsStore.getState().getAchievement('thousand')!;
      expect(achievement.progress).toBe(1000);
      expect(achievement.unlocked).toBe(true);
    });

    it('should not modify an already-unlocked achievement (no regression of progress)', () => {
      const { updateAchievementProgress } = useAchievementsStore.getState();
      updateAchievementProgress('first-bag', 1); // target 1 -> unlocks
      const unlockedAt = useAchievementsStore.getState().getAchievement('first-bag')!.unlockedAt;

      vi.advanceTimersByTime(60_000);
      updateAchievementProgress('first-bag', 0); // Lower progress must be ignored

      const achievement = useAchievementsStore.getState().getAchievement('first-bag')!;
      expect(achievement.unlocked).toBe(true);
      expect(achievement.progress).toBe(1);
      expect(achievement.unlockedAt).toBe(unlockedAt); // Same Date instance, untouched
    });

    it('should be a no-op for unknown achievement ids', () => {
      const before = useAchievementsStore.getState().achievements;
      useAchievementsStore.getState().updateAchievementProgress('nonexistent-id', 999);

      const after = useAchievementsStore.getState().achievements;
      expect(after).toEqual(before);
      expect(after.every((a) => !a.unlocked && a.progress === 0)).toBe(true);
    });
  });

  describe('unlockAchievement', () => {
    it('should unlock and set progress to target', () => {
      const { unlockAchievement, getAchievement } = useAchievementsStore.getState();
      unlockAchievement('safety-first');

      const achievement = getAchievement('safety-first')!;
      expect(achievement.unlocked).toBe(true);
      expect(achievement.progress).toBe(achievement.target);
      expect(achievement.unlockedAt).toBeInstanceOf(Date);
    });

    it('should be idempotent: a second unlock does not change unlockedAt', () => {
      const { unlockAchievement } = useAchievementsStore.getState();
      unlockAchievement('safety-first');
      const firstUnlockedAt = useAchievementsStore
        .getState()
        .getAchievement('safety-first')!.unlockedAt;

      vi.advanceTimersByTime(120_000);
      unlockAchievement('safety-first');

      const achievement = useAchievementsStore.getState().getAchievement('safety-first')!;
      expect(achievement.unlockedAt).toBe(firstUnlockedAt);
      expect(useAchievementsStore.getState().getUnlockedAchievements()).toHaveLength(1);
    });

    it('should be a no-op for unknown ids', () => {
      useAchievementsStore.getState().unlockAchievement('does-not-exist');
      expect(useAchievementsStore.getState().getUnlockedAchievements()).toHaveLength(0);
    });
  });

  describe('Queries and Reset', () => {
    it('should filter achievements by category', () => {
      const { getAchievementsByCategory } = useAchievementsStore.getState();
      const production = getAchievementsByCategory('production');

      expect(production.length).toBeGreaterThan(0);
      expect(production.every((a) => a.category === 'production')).toBe(true);
    });

    it('should list only unlocked achievements', () => {
      const { unlockAchievement, getUnlockedAchievements } = useAchievementsStore.getState();
      unlockAchievement('first-bag');
      unlockAchievement('team-player');

      const unlocked = getUnlockedAchievements();
      expect(unlocked.map((a) => a.id).sort()).toEqual(['first-bag', 'team-player']);
    });

    it('should reset all achievements to locked with zero progress', () => {
      const { unlockAchievement, updateAchievementProgress, resetAchievements } =
        useAchievementsStore.getState();
      unlockAchievement('first-bag');
      updateAchievementProgress('century', 42);

      resetAchievements();

      const achievements = useAchievementsStore.getState().achievements;
      expect(achievements.every((a) => !a.unlocked && a.progress === 0)).toBe(true);
    });
  });
});
