/**
 * Achievements Store - Game Achievements System
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { translate, useLocaleStore } from '../i18n';
import { achievementsStoreMessages } from './achievementsStore.messages';

/**
 * Full Capacity's mark: the line rate, in percent, of the line at its rated
 * pace. It read the least-loaded unit once, against 90 and then 80; a session
 * boots at 80 % (App.tsx), where no unit can pass 74, and the whole line
 * measured 72 at best there and 77 at the rated pace
 * (achievementsStore.fullCapacity.session test). Its progress is now the line
 * rate held while every machine runs.
 */
export const FULL_CAPACITY_LINE_RATE_PERCENT = 100;

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
  /**
   * Bag achievements only: the lifetime bag total when counting began, set by
   * a Reset. Absent (older saves, a fresh game) means counting from zero. It
   * lives on the achievement, not the store, because a save is rejected when
   * a store-level field it lacks is added.
   */
  countedFromBags?: number;
  /**
   * What `progress` counts, for an achievement whose rule changed: a locked
   * one saved under another basis restarts from 0 (see localizeAchievement).
   * Absent means the original rule.
   */
  basis?: AchievementBasis;
}

/** The rules that replaced an achievement's original count (plan 1.14). */
export type AchievementBasis = 'line-rate' | 'deferrals';

/** Achievements whose progress is the number of bags produced. */
export const BAG_ACHIEVEMENT_IDS: readonly string[] = ['first-bag', 'century', 'thousand'];

export interface AchievementsStore {
  achievements: Achievement[];
  unlockAchievement: (achievementId: string) => void;
  updateAchievementProgress: (achievementId: string, progress: number) => void;
  /** `bagsProducedSoFar` is where bag achievements start counting again. */
  resetAchievements: (bagsProducedSoFar?: number) => void;
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
  'first-on-time-delivery': {
    name: 'firstOnTimeDeliveryName',
    description: 'firstOnTimeDeliveryDescription',
  },
  'first-a-shift': { name: 'firstAShiftName', description: 'firstAShiftDescription' },
  'first-programme': { name: 'firstProgrammeName', description: 'firstProgrammeDescription' },
  'first-challenge': { name: 'firstChallengeName', description: 'firstChallengeDescription' },
  'first-hold-resolved': {
    name: 'firstHoldResolvedName',
    description: 'firstHoldResolvedDescription',
  },
  'first-season': { name: 'firstSeasonName', description: 'firstSeasonDescription' },
  'charter-signed': { name: 'charterSignedName', description: 'charterSignedDescription' },
};

const achievementCopy = (id: string): { name: string; description: string } | null => {
  const keys = ACHIEVEMENT_COPY[id];
  if (!keys) return null;
  return {
    name: translate(achievementsStoreMessages, keys.name),
    description: translate(achievementsStoreMessages, keys.description),
  };
};

/**
 * An achievement's name and description in the language active now, or null
 * for an unknown id. Keyed bell notices (useAchievementTracker) read it so an
 * unlock filed in one language reads in the next.
 */
export const achievementCopyNow = (id: string): { name: string; description: string } | null =>
  achievementCopy(id);

/**
 * Re-resolve copy in the active language, and give a locked achievement its
 * current mark: a save keeps the target it was written with (Full Capacity's
 * old 90). A locked achievement saved under another rule (`basis`) restarts
 * from 0, since its bar counted something else; an earned one stays earned.
 * A bar already at the new mark is earned. Returns the same object when
 * nothing changed.
 */
const localizeAchievement = (achievement: Achievement): Achievement => {
  const copy = achievementCopy(achievement.id);
  const definition = achievementDefinitions.find((entry) => entry.id === achievement.id);
  const target = achievement.unlocked
    ? achievement.target
    : (definition?.target ?? achievement.target);
  const rebased = !achievement.unlocked && !!definition && definition.basis !== achievement.basis;
  const sameCopy =
    !copy || (copy.name === achievement.name && copy.description === achievement.description);
  if (sameCopy && target === achievement.target && !rebased) return achievement;
  const progress = rebased ? 0 : Math.min(achievement.progress, target);
  const earned = !achievement.unlocked && progress >= target;
  const next: Achievement = {
    ...achievement,
    ...copy,
    target,
    progress,
    ...(earned ? { unlocked: true, unlockedAt: new Date() } : {}),
  };
  if (rebased) {
    if (definition.basis) next.basis = definition.basis;
    else delete next.basis;
  }
  return next;
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
    target: FULL_CAPACITY_LINE_RATE_PERCENT,
    basis: 'line-rate',
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
    basis: 'deferrals',
  },

  // The game's own milestones (plan 2.3): each is earned by the event in its
  // store, in useAchievementTracker. A saved list from before them gains them
  // locked (appendMissingAchievements).
  {
    id: 'first-on-time-delivery',
    category: 'production',
    icon: 'Truck',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'first-a-shift',
    category: 'efficiency',
    icon: 'Award',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'first-programme',
    category: 'production',
    icon: 'ClipboardList',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'first-challenge',
    category: 'efficiency',
    icon: 'Flag',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'first-hold-resolved',
    category: 'safety',
    icon: 'FlaskConical',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'first-season',
    category: 'social',
    icon: 'CalendarRange',
    unlocked: false,
    progress: 0,
    target: 1,
  },
  {
    id: 'charter-signed',
    category: 'social',
    icon: 'ScrollText',
    unlocked: false,
    progress: 0,
    target: 1,
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

    resetAchievements: (bagsProducedSoFar = 0) => {
      const baseline =
        Number.isFinite(bagsProducedSoFar) && bagsProducedSoFar > 0 ? bagsProducedSoFar : 0;
      set({
        achievements: createDefaultAchievements().map((a) =>
          baseline > 0 && BAG_ACHIEVEMENT_IDS.includes(a.id)
            ? { ...a, countedFromBags: baseline }
            : a
        ),
      });
    },

    getAchievement: (achievementId: string) =>
      get().achievements.find((a) => a.id === achievementId),

    getUnlockedAchievements: () => get().achievements.filter((a) => a.unlocked),

    getAchievementsByCategory: (category: Achievement['category']) =>
      get().achievements.filter((a) => a.category === category),
  }))
);

// Achievements are stored with resolved copy so every reader of `a.name` works
// unchanged; a language switch re-resolves it in place, keeping progress.
// A list saved before an achievement existed gains it, locked, at the end;
// every saved entry keeps its place and state.
const relocalizeAchievements = (): void =>
  useAchievementsStore.setState((current) => {
    let changed = false;
    const achievements = current.achievements.map((achievement) => {
      const localized = localizeAchievement(achievement);
      if (localized !== achievement) changed = true;
      return localized;
    });
    const present = new Set(achievements.map((achievement) => achievement.id));
    const missing = createDefaultAchievements().filter(
      (achievement) => !present.has(achievement.id)
    );
    if (missing.length > 0) {
      achievements.push(...missing);
      changed = true;
    }
    return changed ? { achievements } : current;
  });

useLocaleStore.subscribe((state, previous) => {
  if (state.locale === previous.locale) return;
  relocalizeAchievements();
});

// A physical save or a replay checkpoint restores the whole list with the copy
// and the marks it was captured with. Re-resolve both on arrival; an already-current list is
// returned unchanged, so this settles after one pass.
useAchievementsStore.subscribe((state) => state.achievements, relocalizeAchievements);
