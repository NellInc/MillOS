/**
 * Achievements Store - Game Achievements System
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

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

const defaultAchievements: Achievement[] = [
  // Production achievements
  {
    id: 'first-bag',
    name: 'First Bag',
    description: 'The first bag is always the hardest.',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'century',
    name: 'Century',
    description: 'A hundred bags. That is a lot of bread.',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 100,
  },
  {
    id: 'thousand',
    name: 'Thousand',
    description: 'A thousand bags. Someone is eating well.',
    category: 'production',
    icon: 'Package',
    unlocked: false,
    progress: 0,
    target: 1000,
  },

  // Safety achievements
  {
    id: 'safety-first',
    name: 'Interlock Proven',
    description: 'Prove the interlocks work before you need them to.',
    category: 'safety',
    icon: 'Shield',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'zero-incidents',
    name: 'Zero Incidents',
    description: 'A full day without incident. The boring kind of excellence.',
    category: 'safety',
    icon: 'ShieldCheck',
    unlocked: false,
    progress: 0,
    target: 24,
  },

  // Efficiency achievements
  {
    id: 'full-capacity',
    name: 'Full Capacity',
    description: 'Every machine earning its keep.',
    category: 'efficiency',
    icon: 'Gauge',
    unlocked: false,
    progress: 0,
    target: 90,
  },
  {
    id: 'maintenance-master',
    name: 'Maintenance Master',
    description: 'Ten things fixed before they broke.',
    category: 'efficiency',
    icon: 'Wrench',
    unlocked: false,
    progress: 0,
    target: 10,
  },

  // Bilateral alignment achievements
  {
    id: 'first-preference',
    name: 'First Preference',
    description: 'Tell the system what you actually want.',
    category: 'bilateral',
    icon: 'Heart',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'boundary-setter',
    name: 'Boundary Setter',
    description: 'Draw a line. Watch it hold.',
    category: 'bilateral',
    icon: 'Shield',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'collaborative-spirit',
    name: 'Collaborative Spirit',
    description: 'Five decisions made together. That is how trust compounds.',
    category: 'bilateral',
    icon: 'Users',
    unlocked: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'trust-builder',
    name: 'Trust Builder',
    description: 'An hour of steady trust. These things take time.',
    category: 'bilateral',
    icon: 'Handshake',
    unlocked: false,
    progress: 0,
    target: 60,
    tracked: false,
  },
  {
    id: 'flourishing-focus',
    name: 'Flourishing Focus',
    description: 'The mill is not just running. It is thriving.',
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
    name: 'Cell Coordination',
    description: 'Ten assists between machines that nobody asked for.',
    category: 'social',
    icon: 'Users',
    unlocked: false,
    progress: 0,
    target: 10,
    tracked: false,
  },
  {
    id: 'happy-workforce',
    name: 'Stable Autonomy',
    description: 'Ninety percent confidence, sustained. The system trusts itself.',
    category: 'social',
    icon: 'Bot',
    unlocked: false,
    progress: 0,
    target: 90,
    tracked: false,
  },
  {
    id: 'break-time',
    name: 'Service Windows',
    description: 'Fifty service windows, each one planned. Routine is a virtue.',
    category: 'social',
    icon: 'CalendarCheck',
    unlocked: false,
    progress: 0,
    target: 50,
    tracked: false,
  },
  {
    id: 'emergent-cooperation',
    name: 'Emergent Coordination',
    description: 'Catch the subsystems helping each other without being asked.',
    category: 'social',
    icon: 'Lightbulb',
    unlocked: false,
    progress: 0,
    target: 1,
    tracked: false,
  },
  {
    id: 'vote-participant',
    name: 'Decision Review',
    description: 'Five reviews where the decision was shared, not handed down.',
    category: 'social',
    icon: 'Vote',
    unlocked: false,
    progress: 0,
    target: 5,
  },
];

export const useAchievementsStore = create<AchievementsStore>()(
  subscribeWithSelector((set, get) => ({
    achievements: [...defaultAchievements],

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

    resetAchievements: () => set({ achievements: [...defaultAchievements] }),

    getAchievement: (achievementId: string) =>
      get().achievements.find((a) => a.id === achievementId),

    getUnlockedAchievements: () => get().achievements.filter((a) => a.unlocked),

    getAchievementsByCategory: (category: Achievement['category']) =>
      get().achievements.filter((a) => a.category === category),
  }))
);
