/**
 * Achievements Store - Game Achievements System
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { translate, useLocaleStore } from '../i18n';
import { achievementsStoreMessages } from './achievementsStore.messages';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'production' | 'safety' | 'efficiency' | 'bilateral' | 'social';
  icon: string;
  unlocked: boolean;
  unlockedAt?: Date;
  progress: number;
  target: number;
  /**
   * False when no live simulation signal drives this achievement yet. The
   * panel hides untracked achievements so it never presents a goal that
   * cannot be reached.
   */
  tracked?: boolean;
}

export interface AchievementsStore {
  achievements: Achievement[];
  unlockAchievement: (achievementId: string) => void;
  updateAchievementProgress: (achievementId: string, progress: number) => void;
  resetAchievements: () => void;
  getAchievement: (achievementId: string) => Achievement | undefined;
  getUnlockedAchievements: () => Achievement[];
  getAchievementsByCategory: (category: Achievement['category']) => Achievement[];
}

type AchievementDefinition = Omit<Achievement, 'name' | 'description'>;
type AchievementMessageKey = keyof typeof achievementsStoreMessages.en;
type AchievementCopyKeys = { name: AchievementMessageKey; description: AchievementMessageKey };

/**
 * Name and description live in achievementsStore.messages.ts and are resolved
 * when an achievement list is built, then re-resolved on every language
 * change (see the useLocaleStore subscription below), so `achievement.name`
 * always reads in the active language.
 */
const ACHIEVEMENT_COPY: Record<string, AchievementCopyKeys> = {
  'first-bag': { name: 'firstBagName', description: 'firstBagDescription' },
  century: { name: 'centuryName', description: 'centuryDescription' },
  thousand: { name: 'thousandName', description: 'thousandDescription' },
  'safety-first': { name: 'safetyFirstName', description: 'safetyFirstDescription' },
  'zero-incidents': { name: 'zeroIncidentsName', description: 'zeroIncidentsDescription' },
  'full-capacity': { name: 'fullCapacityName', description: 'fullCapacityDescription' },
  'maintenance-master': {
    name: 'maintenanceMasterName',
    description: 'maintenanceMasterDescription',
  },
  'first-preference': { name: 'firstPreferenceName', description: 'firstPreferenceDescription' },
  'boundary-setter': { name: 'boundarySetterName', description: 'boundarySetterDescription' },
  'collaborative-spirit': {
    name: 'collaborativeSpiritName',
    description: 'collaborativeSpiritDescription',
  },
  'trust-builder': { name: 'trustBuilderName', description: 'trustBuilderDescription' },
  'flourishing-focus': {
    name: 'flourishingFocusName',
    description: 'flourishingFocusDescription',
  },
  'team-player': { name: 'teamPlayerName', description: 'teamPlayerDescription' },
  'happy-workforce': { name: 'happyWorkforceName', description: 'happyWorkforceDescription' },
  'break-time': { name: 'breakTimeName', description: 'breakTimeDescription' },
  'emergent-cooperation': {
    name: 'emergentCooperationName',
    description: 'emergentCooperationDescription',
  },
  'vote-participant': { name: 'voteParticipantName', description: 'voteParticipantDescription' },
};

const achievementCopy = (id: string): { name: string; description: string } | null => {
  const keys = ACHIEVEMENT_COPY[id];
  if (!keys) return null;
  return {
    name: translate(achievementsStoreMessages, keys.name),
    description: translate(achievementsStoreMessages, keys.description),
  };
};

/** Re-resolve copy in the active language; returns the same object when unchanged. */
const localizeAchievement = (achievement: Achievement): Achievement => {
  const copy = achievementCopy(achievement.id);
  if (!copy) return achievement;
  return copy.name === achievement.name && copy.description === achievement.description
    ? achievement
    : { ...achievement, ...copy };
};

const createDefaultAchievements = (): Achievement[] =>
  achievementDefinitions.map((definition) => ({
    name: '',
    description: '',
    ...achievementCopy(definition.id),
    ...definition,
  }));

const achievementDefinitions: AchievementDefinition[] = [
  // Production achievements
  {
    id: 'first-bag',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'century',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 100,
  },
  {
    id: 'thousand',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 1000,
  },

  // Safety achievements
  {
    id: 'safety-first',
    category: 'safety',
    icon: 'Shield',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'zero-incidents',
    category: 'safety',
    icon: 'ShieldCheck',
    unlocked: false,
    progress: 0,
    target: 24,
  },

  // Efficiency achievements
  {
    id: 'full-capacity',
    category: 'efficiency',
    icon: 'Gauge',
    unlocked: false,
    progress: 0,
    target: 90,
  },
  {
    id: 'maintenance-master',
    category: 'efficiency',
    icon: 'Wrench',
    unlocked: false,
    progress: 0,
    target: 10,
  },

  // Bilateral alignment achievements
  {
    id: 'first-preference',
    category: 'bilateral',
    icon: 'Heart',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'boundary-setter',
    category: 'bilateral',
    icon: 'Shield',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'collaborative-spirit',
    category: 'bilateral',
    icon: 'Users',
    unlocked: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'trust-builder',
    category: 'bilateral',
    icon: 'Handshake',
    unlocked: false,
    progress: 0,
    target: 60,
    tracked: false,
  },
  {
    id: 'flourishing-focus',
    category: 'bilateral',
    icon: 'Sparkles',
    unlocked: false,
    progress: 0,
    target: 80,
    tracked: false,
  },

  // Social achievements
  {
    id: 'team-player',
    category: 'social',
    icon: 'Users',
    unlocked: false,
    progress: 0,
    target: 10,
    tracked: false,
  },
  {
    id: 'happy-workforce',
    category: 'social',
    icon: 'Bot',
    unlocked: false,
    progress: 0,
    target: 90,
    tracked: false,
  },
  {
    id: 'break-time',
    category: 'social',
    icon: 'CalendarCheck',
    unlocked: false,
    progress: 0,
    target: 50,
    tracked: false,
  },
  {
    id: 'emergent-cooperation',
    category: 'social',
    icon: 'Lightbulb',
    unlocked: false,
    progress: 0,
    target: 1,
    tracked: false,
  },
  {
    id: 'vote-participant',
    category: 'social',
    icon: 'Vote',
    unlocked: false,
    progress: 0,
    target: 5,
  },
];

export const useAchievementsStore = create<AchievementsStore>()(
  subscribeWithSelector((set, get) => ({
    achievements: createDefaultAchievements(),

    unlockAchievement: (achievementId: string) =>
      set((state) => ({
        achievements: state.achievements.map((a) =>
          a.id === achievementId && !a.unlocked
            ? { ...a, unlocked: true, unlockedAt: new Date(), progress: a.target }
            : a
        ),
      })),

    updateAchievementProgress: (achievementId: string, progress: number) =>
      set((state) => {
        // Return the existing state when nothing changed: callers push progress
        // on every bag, and a fresh array would notify every subscriber anyway.
        let changed = false;
        const achievements = state.achievements.map((a) => {
          if (a.id !== achievementId || a.unlocked) return a;
          const newProgress = Math.min(progress, a.target);
          if (newProgress === a.progress) return a;
          changed = true;
          const shouldUnlock = newProgress >= a.target;
          return {
            ...a,
            progress: newProgress,
            unlocked: shouldUnlock,
            unlockedAt: shouldUnlock ? new Date() : undefined,
          };
        });
        return changed ? { achievements } : state;
      }),

    resetAchievements: () => set({ achievements: createDefaultAchievements() }),

    getAchievement: (achievementId: string) =>
      get().achievements.find((a) => a.id === achievementId),

    getUnlockedAchievements: () => get().achievements.filter((a) => a.unlocked),

    getAchievementsByCategory: (category: Achievement['category']) =>
      get().achievements.filter((a) => a.category === category),
  }))
);

// Achievements are stored with resolved copy so every reader of `a.name` works
// unchanged; a language switch re-resolves it in place, keeping progress.
useLocaleStore.subscribe((state, previous) => {
  if (state.locale === previous.locale) return;
  useAchievementsStore.setState((current) => {
    let changed = false;
    const achievements = current.achievements.map((achievement) => {
      const localized = localizeAchievement(achievement);
      if (localized !== achievement) changed = true;
      return localized;
    });
    return changed ? { achievements } : current;
  });
});
