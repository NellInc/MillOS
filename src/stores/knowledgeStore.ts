/** Technical Datalinks for the autonomous MillOS digital twin. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { sanitizeKnowledgeState } from './persistenceMigrations';
import { HISTORY_NOTES, getHistoryNote } from '../chronicle/history';
import { formatFixed, translate } from '../i18n';
import { knowledgeStoreMessages } from './knowledgeStore.messages';
import {
  BREAK_ROLL_DIFFERENTIAL,
  BREAK_ROLL_DIFFERENTIAL_RANGE,
  MILLING_ENTRY_SOURCES,
  MILLING_SOURCES,
  REDUCTION_ROLL_DIFFERENTIAL_RANGE,
  type MillingSourceId,
} from './millingSources';
import { useWindmillLearningStore } from './windmillLearningStore';
import { useProcessInspectionStore } from './processInspectionStore';

export type KnowledgeCategory = 'milling' | 'principles' | 'pioneers' | 'systems' | 'case-studies';
export type KnowledgeIcon =
  | 'handshake'
  | 'heart-handshake'
  | 'vote'
  | 'flower-2'
  | 'sparkles'
  | 'user'
  | 'settings'
  | 'sliders'
  | 'chart-bar'
  | 'refresh-cw'
  | 'network'
  | 'heart'
  | 'factory'
  | 'book-open'
  | 'scale'
  | 'brain'
  | 'gamepad-2'
  | 'sprout'
  | 'users'
  | 'cog'
  | 'library'
  | 'wheat'
  | 'wind'
  | 'flame'
  | 'croissant';

export interface KnowledgeQuote {
  text: string;
  author: string;
}

/** A one-line milling fact for the loading cover, with the body that published it. */
export interface LoadingFact {
  readonly text: string;
  readonly source: MillingSourceId;
  readonly publisher: string;
}

export interface UnlockCondition {
  type: 'achievement' | 'feature-use' | 'time-played' | 'always';
  requirement?: string;
  description: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  icon: KnowledgeIcon;
  tooltip: string;
  brief: string;
  article: string;
  relatedEntries: string[];
  seeInAction: string[];
  unlockCondition: UnlockCondition;
  audience?: 'player' | 'developer';
  quote?: KnowledgeQuote;
  /** The sources the entry was written from (milling entries; millingSources.ts). */
  sources?: { title: string; publisher: string; url: string }[];
}

export interface UnlockContext {
  minutesPlayed?: number;
}

export interface KnowledgeState {
  unlockedEntries: Set<string>;
  readEntries: Set<string>;
  newEntries: Set<string>;
  /** Cutaway lessons the player has finished, each recorded once and kept across reloads. */
  completedLessons: Set<string>;
  showTooltips: boolean;
  showLoadingQuotes: boolean;
  showUnlockNotifications: boolean;
  unlockEntry: (entryId: string) => void;
  markAsRead: (entryId: string) => void;
  recordLessonCompleted: (lessonId: string) => void;
  clearNewBadge: (entryId: string) => void;
  checkUnlockConditions: (context: UnlockContext) => void;
  setShowTooltips: (show: boolean) => void;
  setShowLoadingQuotes: (show: boolean) => void;
  setShowUnlockNotifications: (show: boolean) => void;
  getEntry: (id: string) => KnowledgeEntry | undefined;
  getEntriesByCategory: (category: KnowledgeCategory) => KnowledgeEntry[];
  isUnlocked: (id: string) => boolean;
  isNew: (id: string) => boolean;
  getUnlockedCount: () => number;
  getTotalCount: () => number;
}

type KnowledgeMessageKey = keyof typeof knowledgeStoreMessages.en;
type KnowledgeEntryKey =
  | 'unifiedDigitalTwin'
  | 'autonomousMaterialFlow'
  | 'scadaAlarmLifecycle'
  | 'predictiveMaintenance'
  | 'batchQuality'
  | 'autonomousLogistics'
  | 'environmentCycle'
  | 'bottlenecksAndBuffers'
  | 'resourceTradeoffs'
  | 'communityCommitments'
  | 'depthAndMaterialPolicy'
  | 'autonomousEvidence'
  | 'farmHenhouse'
  | 'millingCleaningTempering'
  | 'millingBreakReduction'
  | 'millingPurifiers'
  | 'millingExtractionAsh'
  | 'millingBakerNeeds'
  | 'millingDustExplosions';
type KnowledgeEntryField = 'Title' | 'Tooltip' | 'Brief' | 'Article' | 'SeeInAction';
type KnowledgeEntryData = Omit<
  KnowledgeEntry,
  'title' | 'tooltip' | 'brief' | 'article' | 'seeInAction'
>;

/** Decimals in the milling copy, written the way the active language reads them. */
const millingNumbers = () => ({
  breakLow: formatFixed(BREAK_ROLL_DIFFERENTIAL_RANGE[0], 1),
  breakHigh: formatFixed(BREAK_ROLL_DIFFERENTIAL_RANGE[1], 1),
  breakBest: formatFixed(BREAK_ROLL_DIFFERENTIAL, 1),
  reductionLow: formatFixed(REDUCTION_ROLL_DIFFERENTIAL_RANGE[0], 1),
  reductionHigh: formatFixed(REDUCTION_ROLL_DIFFERENTIAL_RANGE[1], 1),
  wheatAsh: formatFixed(1.58, 2),
  flourAsh: formatFixed(0.52, 2),
});

const entryText = (entry: KnowledgeEntryKey, field: KnowledgeEntryField): string => {
  const key: `${KnowledgeEntryKey}${KnowledgeEntryField}` = `${entry}${field}`;
  return translate(knowledgeStoreMessages, key, millingNumbers());
};

/** A milling entry's sources, in the order millingSources.ts lists them. */
const millingSources = (id: string) =>
  (MILLING_ENTRY_SOURCES[id] ?? []).map(({ id: source }) => MILLING_SOURCES[source]);

/**
 * Library copy is read through getters, so every importer of KNOWLEDGE_ENTRIES
 * and LOADING_FACTS sees the active language instead of an import-time copy.
 * Working if switching language re-renders Datalinks in Portuguese with the
 * same entry objects.
 */
function localizedEntry(entry: KnowledgeEntryKey, data: KnowledgeEntryData): KnowledgeEntry {
  return {
    ...data,
    get title() {
      return entryText(entry, 'Title');
    },
    get tooltip() {
      return entryText(entry, 'Tooltip');
    },
    get brief() {
      return entryText(entry, 'Brief');
    },
    get article() {
      return entryText(entry, 'Article');
    },
    get seeInAction() {
      return entryText(entry, 'SeeInAction').split('\n');
    },
  };
}

function localizedFact(textKey: KnowledgeMessageKey, source: MillingSourceId): LoadingFact {
  return {
    get text() {
      return translate(knowledgeStoreMessages, textKey);
    },
    source,
    publisher: MILLING_SOURCES[source].publisher,
  };
}

const always: UnlockCondition = {
  type: 'always',
  get description() {
    return translate(knowledgeStoreMessages, 'alwaysAvailable');
  },
};

// D14: the loading cover showed nine invented slogans credited to "MillOS
// principles". It shows these instead: each is a claim millingSources.ts
// records its source supporting, worded as the Datalinks article that cites
// it, hedge included. Working if every line names a real source.
export const LOADING_FACTS: LoadingFact[] = [
  localizedFact('factExplosibleDust', 'hseDust'),
  localizedFact('factStaticSpark', 'hseDust'),
  localizedFact('factSecondaryBlast', 'csbDust'),
  localizedFact('factExtraction', 'ksuMiddlings'),
  localizedFact('factTempering', 'ksuMiddlings'),
  localizedFact('factRolls', 'wmcMethods'),
  localizedFact('factStreams', 'ukfmProcess'),
  localizedFact('factFallingNumber', 'wmcMethods'),
  localizedFact('factIntake', 'ukfmIntake'),
];

/**
 * How a flour mill works (report 10 P3). Each is linked from the delivery
 * stage or the machine cutaway it explains; every fact is in millingSources.ts.
 */
const MILLING_ENTRIES: KnowledgeEntry[] = [
  localizedEntry('millingCleaningTempering', {
    id: 'milling-cleaning-tempering',
    category: 'milling',
    icon: 'wheat',
    relatedEntries: ['milling-break-reduction', 'milling-extraction-ash'],
    unlockCondition: always,
    sources: millingSources('milling-cleaning-tempering'),
  }),
  localizedEntry('millingBreakReduction', {
    id: 'milling-break-reduction',
    category: 'milling',
    icon: 'cog',
    relatedEntries: ['milling-cleaning-tempering', 'milling-purifiers'],
    unlockCondition: always,
    sources: millingSources('milling-break-reduction'),
  }),
  localizedEntry('millingPurifiers', {
    id: 'milling-purifiers',
    category: 'milling',
    icon: 'wind',
    relatedEntries: ['milling-break-reduction', 'milling-extraction-ash'],
    unlockCondition: always,
    sources: millingSources('milling-purifiers'),
  }),
  localizedEntry('millingExtractionAsh', {
    id: 'milling-extraction-ash',
    category: 'milling',
    icon: 'scale',
    relatedEntries: ['milling-purifiers', 'milling-baker-needs', 'batch-quality'],
    unlockCondition: always,
    sources: millingSources('milling-extraction-ash'),
  }),
  localizedEntry('millingBakerNeeds', {
    id: 'milling-baker-needs',
    category: 'milling',
    icon: 'croissant',
    relatedEntries: ['milling-extraction-ash', 'community-commitments'],
    unlockCondition: always,
    sources: millingSources('milling-baker-needs'),
  }),
  localizedEntry('millingDustExplosions', {
    id: 'milling-dust-explosions',
    category: 'milling',
    icon: 'flame',
    relatedEntries: ['milling-cleaning-tempering', 'predictive-maintenance'],
    unlockCondition: always,
    sources: millingSources('milling-dust-explosions'),
  }),
];

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  ...MILLING_ENTRIES,
  localizedEntry('unifiedDigitalTwin', {
    id: 'unified-digital-twin',
    category: 'principles',
    icon: 'factory',
    relatedEntries: ['autonomous-material-flow'],
    unlockCondition: always,
  }),
  localizedEntry('autonomousMaterialFlow', {
    id: 'autonomous-material-flow',
    category: 'systems',
    icon: 'network',
    relatedEntries: ['scada-alarm-lifecycle', 'batch-quality'],
    unlockCondition: always,
  }),
  localizedEntry('scadaAlarmLifecycle', {
    id: 'scada-alarm-lifecycle',
    category: 'systems',
    icon: 'chart-bar',
    relatedEntries: ['predictive-maintenance', 'autonomous-evidence'],
    unlockCondition: always,
  }),
  localizedEntry('predictiveMaintenance', {
    id: 'predictive-maintenance',
    category: 'systems',
    icon: 'settings',
    relatedEntries: ['scada-alarm-lifecycle', 'autonomous-evidence'],
    unlockCondition: always,
  }),
  localizedEntry('batchQuality', {
    id: 'batch-quality',
    category: 'case-studies',
    icon: 'scale',
    relatedEntries: ['autonomous-material-flow', 'scada-alarm-lifecycle'],
    unlockCondition: always,
  }),
  localizedEntry('autonomousLogistics', {
    id: 'autonomous-logistics',
    category: 'case-studies',
    icon: 'refresh-cw',
    relatedEntries: ['autonomous-material-flow', 'unified-digital-twin'],
    unlockCondition: always,
  }),
  localizedEntry('environmentCycle', {
    id: 'environment-cycle',
    category: 'pioneers',
    icon: 'sparkles',
    relatedEntries: ['unified-digital-twin', 'depth-and-material-policy'],
    unlockCondition: always,
    // Its last paragraph is about shader cache keys: a note on the renderer.
    audience: 'developer',
  }),
  localizedEntry('bottlenecksAndBuffers', {
    id: 'bottlenecks-and-buffers',
    category: 'systems',
    icon: 'network',
    relatedEntries: ['autonomous-material-flow', 'batch-quality', 'autonomous-logistics'],
    unlockCondition: always,
  }),
  localizedEntry('resourceTradeoffs', {
    id: 'resource-tradeoffs',
    category: 'case-studies',
    icon: 'scale',
    relatedEntries: ['bottlenecks-and-buffers', 'predictive-maintenance', 'community-commitments'],
    unlockCondition: always,
  }),
  localizedEntry('communityCommitments', {
    id: 'community-commitments',
    category: 'principles',
    icon: 'users',
    relatedEntries: ['autonomous-material-flow', 'batch-quality', 'predictive-maintenance'],
    unlockCondition: always,
  }),
  localizedEntry('depthAndMaterialPolicy', {
    id: 'depth-and-material-policy',
    category: 'principles',
    icon: 'sliders',
    relatedEntries: ['environment-cycle', 'autonomous-evidence'],
    unlockCondition: always,
    audience: 'developer',
  }),
  localizedEntry('autonomousEvidence', {
    id: 'autonomous-evidence',
    category: 'principles',
    icon: 'brain',
    relatedEntries: ['scada-alarm-lifecycle', 'predictive-maintenance'],
    unlockCondition: always,
  }),
];

/**
 * Milling-history notes from the Mill Chronicle (docs/CHRONICLE.md). They stay
 * locked until a live event in a signed chronicle unlocks them, in the manner
 * of Predynastic Egypt's history notices.
 */
export const HISTORY_ENTRY_UNLOCK: UnlockCondition = {
  type: 'feature-use',
  requirement: 'chronicle',
  get description() {
    return translate(knowledgeStoreMessages, 'historyUnlock');
  },
};

/**
 * The farm lessons (report 04 P9): the henhouse inspection opens its own note,
 * written from the inspection's copy, when it is finished.
 */
export const FARM_LESSON_UNLOCK: UnlockCondition = {
  type: 'feature-use',
  requirement: 'henhouse',
  get description() {
    return translate(knowledgeStoreMessages, 'farmLessonUnlock');
  },
};

/**
 * The post-mill note opens two ways: the Chronicle's wind turbine, or the farm
 * windmill's cutaway in first person (the subscription below).
 */
export const WINDMILL_NOTE_UNLOCK: UnlockCondition = {
  type: 'feature-use',
  requirement: 'chronicle',
  get description() {
    return translate(knowledgeStoreMessages, 'windmillNoteUnlock');
  },
};

KNOWLEDGE_ENTRIES.push(
  localizedEntry('farmHenhouse', {
    id: 'farm-henhouse',
    category: 'case-studies',
    icon: 'sprout',
    relatedEntries: ['community-commitments'],
    unlockCondition: FARM_LESSON_UNLOCK,
  })
);

KNOWLEDGE_ENTRIES.push(
  ...HISTORY_NOTES.map(
    (note): KnowledgeEntry => ({
      id: note.id,
      get title() {
        return getHistoryNote(note.id)?.title ?? note.title;
      },
      category: 'pioneers',
      icon: 'book-open',
      get tooltip() {
        return getHistoryNote(note.id)?.brief ?? note.brief;
      },
      get brief() {
        return getHistoryNote(note.id)?.brief ?? note.brief;
      },
      get article() {
        return getHistoryNote(note.id)?.article ?? note.article;
      },
      relatedEntries: note.relatedEntries,
      // The workspace name, in the language the dock shows it in.
      get seeInAction() {
        return [translate(knowledgeStoreMessages, 'historySeeInAction')];
      },
      unlockCondition:
        note.id === 'history-windmills' ? WINDMILL_NOTE_UNLOCK : HISTORY_ENTRY_UNLOCK,
    })
  )
);

const ALWAYS_UNLOCKED = KNOWLEDGE_ENTRIES.filter(
  (entry) => entry.unlockCondition.type === 'always'
).map((entry) => entry.id);
const KNOWN_ENTRY_IDS = new Set(KNOWLEDGE_ENTRIES.map((entry) => entry.id));

/** Player explanations remain separate from optional renderer reference notes. */
export function getKnowledgeEntries(audience: 'player' | 'developer' = 'player'): KnowledgeEntry[] {
  return KNOWLEDGE_ENTRIES.filter((entry) => (entry.audience ?? 'player') === audience);
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      unlockedEntries: new Set(ALWAYS_UNLOCKED),
      readEntries: new Set(),
      newEntries: new Set(),
      completedLessons: new Set(),
      showTooltips: true,
      showLoadingQuotes: true,
      showUnlockNotifications: true,
      unlockEntry: (entryId) =>
        set((state) =>
          state.unlockedEntries.has(entryId) || !KNOWN_ENTRY_IDS.has(entryId)
            ? state
            : {
                unlockedEntries: new Set([...state.unlockedEntries, entryId]),
                newEntries: new Set([...state.newEntries, entryId]),
              }
        ),
      markAsRead: (entryId) =>
        set((state) => ({ readEntries: new Set([...state.readEntries, entryId]) })),
      recordLessonCompleted: (lessonId) =>
        set((state) =>
          state.completedLessons.has(lessonId)
            ? state
            : { completedLessons: new Set([...state.completedLessons, lessonId]) }
        ),
      clearNewBadge: (entryId) =>
        set((state) => {
          const next = new Set(state.newEntries);
          next.delete(entryId);
          return { newEntries: next };
        }),
      checkUnlockConditions: () => undefined,
      setShowTooltips: (show) => set({ showTooltips: show }),
      setShowLoadingQuotes: (show) => set({ showLoadingQuotes: show }),
      setShowUnlockNotifications: (show) => set({ showUnlockNotifications: show }),
      getEntry: (id) => KNOWLEDGE_ENTRIES.find((entry) => entry.id === id),
      getEntriesByCategory: (category) =>
        KNOWLEDGE_ENTRIES.filter((entry) => entry.category === category),
      isUnlocked: (id) => get().unlockedEntries.has(id),
      isNew: (id) => get().newEntries.has(id),
      getUnlockedCount: () => get().unlockedEntries.size,
      getTotalCount: () => KNOWLEDGE_ENTRIES.length,
    }),
    {
      name: 'millos-autonomous-datalinks',
      storage: safeJSONStorage,
      version: 2,
      migrate: (persisted) => sanitizeKnowledgeState(persisted) as unknown as KnowledgeState,
      partialize: (state) => ({
        unlockedEntries: [...state.unlockedEntries],
        readEntries: [...state.readEntries],
        // Optional: a save from before it has none and reads as no lessons finished.
        ...(state.completedLessons.size > 0
          ? { completedLessons: [...state.completedLessons] }
          : {}),
        showTooltips: state.showTooltips,
        showLoadingQuotes: state.showLoadingQuotes,
        showUnlockNotifications: state.showUnlockNotifications,
      }),
      merge: (persisted, current) => {
        const state = sanitizeKnowledgeState(persisted);
        const unlocked = (state.unlockedEntries ?? []).filter((id) => KNOWN_ENTRY_IDS.has(id));
        const read = new Set(state.readEntries ?? []);
        return {
          ...current,
          // Always-available entries plus any history note a chronicle unlocked.
          unlockedEntries: new Set([...ALWAYS_UNLOCKED, ...unlocked]),
          readEntries: read,
          completedLessons: new Set(state.completedLessons ?? []),
          // NEW is "unlocked and not yet opened", so it is rebuilt from the two
          // saved lists rather than lost on a reload.
          newEntries: new Set(
            unlocked.filter((id) => !ALWAYS_UNLOCKED.includes(id) && !read.has(id))
          ),
          showTooltips: state.showTooltips ?? true,
          showLoadingQuotes: state.showLoadingQuotes ?? true,
          // The AI reflection cards and their switch are cut (D14): a saved
          // showAINarration is dropped by sanitizeKnowledgeState.
          showUnlockNotifications: state.showUnlockNotifications ?? true,
        };
      },
    }
  )
);

export function getRandomLoadingFact(): LoadingFact {
  return LOADING_FACTS[Math.floor(Math.random() * LOADING_FACTS.length)];
}

export function getCategoryIcon(category: KnowledgeCategory): KnowledgeIcon {
  if (category === 'milling') return 'wheat';
  if (category === 'principles') return 'sprout';
  if (category === 'pioneers') return 'sparkles';
  if (category === 'systems') return 'cog';
  return 'library';
}

export function getCategoryLabel(category: KnowledgeCategory): string {
  if (category === 'milling') return translate(knowledgeStoreMessages, 'categoryMilling');
  if (category === 'principles') return translate(knowledgeStoreMessages, 'categoryPrinciples');
  if (category === 'pioneers') return translate(knowledgeStoreMessages, 'categoryPioneers');
  if (category === 'systems') return translate(knowledgeStoreMessages, 'categorySystems');
  return translate(knowledgeStoreMessages, 'categoryCases');
}

/**
 * Finishing a farm lesson opens its Datalinks note (report 04 P9): the
 * windmill cutaway the Chronicle's post-mill note, the henhouse inspection its
 * own. Reaching the last stage counts, however the lesson was started.
 */
useWindmillLearningStore.subscribe((state) => {
  if (state.open && state.stage === 'collect')
    useKnowledgeStore.getState().unlockEntry('history-windmills');
});
useProcessInspectionStore.subscribe((state) => {
  if (state.active?.id === 'henhouse' && state.stage === 3)
    useKnowledgeStore.getState().unlockEntry('farm-henhouse');
  // A finished cutaway lesson is recorded once, and kept (the inspection
  // store's own record lasts the session only).
  for (const lessonId of state.completed)
    if (!useKnowledgeStore.getState().completedLessons.has(lessonId))
      useKnowledgeStore.getState().recordLessonCompleted(lessonId);
});
