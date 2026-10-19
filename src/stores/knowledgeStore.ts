/** Technical Datalinks for the autonomous MillOS digital twin. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { sanitizeKnowledgeState } from './persistenceMigrations';
import { translate } from '../i18n';
import { knowledgeStoreMessages } from './knowledgeStore.messages';

export type KnowledgeCategory = 'principles' | 'pioneers' | 'systems' | 'case-studies';
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
  | 'library';

export interface KnowledgeQuote {
  text: string;
  author: string;
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
}

export interface UnlockContext {
  minutesPlayed?: number;
}

export interface KnowledgeState {
  unlockedEntries: Set<string>;
  readEntries: Set<string>;
  newEntries: Set<string>;
  showTooltips: boolean;
  showLoadingQuotes: boolean;
  showAINarration: boolean;
  showUnlockNotifications: boolean;
  unlockEntry: (entryId: string) => void;
  markAsRead: (entryId: string) => void;
  clearNewBadge: (entryId: string) => void;
  checkUnlockConditions: (context: UnlockContext) => void;
  setShowTooltips: (show: boolean) => void;
  setShowLoadingQuotes: (show: boolean) => void;
  setShowAINarration: (show: boolean) => void;
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
  | 'autonomousEvidence';
type KnowledgeEntryField = 'Title' | 'Tooltip' | 'Brief' | 'Article' | 'SeeInAction';
type KnowledgeEntryData = Omit<
  KnowledgeEntry,
  'title' | 'tooltip' | 'brief' | 'article' | 'seeInAction'
>;

const entryText = (entry: KnowledgeEntryKey, field: KnowledgeEntryField): string => {
  const key: `${KnowledgeEntryKey}${KnowledgeEntryField}` = `${entry}${field}`;
  return translate(knowledgeStoreMessages, key);
};

/**
 * Library copy is read through getters, so every importer of KNOWLEDGE_ENTRIES
 * and LOADING_QUOTES sees the active language instead of an import-time copy.
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

function localizedQuote(
  textKey: KnowledgeMessageKey,
  authorKey: KnowledgeMessageKey
): KnowledgeQuote {
  return {
    get text() {
      return translate(knowledgeStoreMessages, textKey);
    },
    get author() {
      return translate(knowledgeStoreMessages, authorKey);
    },
  };
}

const always: UnlockCondition = {
  type: 'always',
  get description() {
    return translate(knowledgeStoreMessages, 'alwaysAvailable');
  },
};

export const LOADING_QUOTES: KnowledgeQuote[] = [
  localizedQuote('quoteTraceEveryLot', 'authorControl'),
  localizedQuote('quoteSafeStop', 'authorControl'),
  localizedQuote('quoteMotion', 'authorVisual'),
  localizedQuote('quoteOneWorld', 'authorArchitecture'),
  localizedQuote('quoteAutonomyTrust', 'authorAutonomy'),
  localizedQuote('quoteAlarmNeeds', 'authorScada'),
  localizedQuote('quoteBoringMill', 'authorControl'),
  localizedQuote('quoteCheckMeasurement', 'authorScada'),
  localizedQuote('quoteForklifts', 'authorLogistics'),
];

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  localizedEntry('unifiedDigitalTwin', {
    id: 'unified-digital-twin',
    category: 'principles',
    icon: 'factory',
    relatedEntries: ['autonomous-material-flow', 'environment-cycle'],
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

/** Player explanations remain separate from optional renderer reference notes. */
export function getKnowledgeEntries(audience: 'player' | 'developer' = 'player'): KnowledgeEntry[] {
  return KNOWLEDGE_ENTRIES.filter((entry) => (entry.audience ?? 'player') === audience);
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      unlockedEntries: new Set(KNOWLEDGE_ENTRIES.map((entry) => entry.id)),
      readEntries: new Set(),
      newEntries: new Set(),
      showTooltips: true,
      showLoadingQuotes: true,
      showAINarration: true,
      showUnlockNotifications: true,
      unlockEntry: (entryId) =>
        set((state) => ({
          unlockedEntries: new Set([...state.unlockedEntries, entryId]),
          newEntries: state.unlockedEntries.has(entryId)
            ? state.newEntries
            : new Set([...state.newEntries, entryId]),
        })),
      markAsRead: (entryId) =>
        set((state) => ({ readEntries: new Set([...state.readEntries, entryId]) })),
      clearNewBadge: (entryId) =>
        set((state) => {
          const next = new Set(state.newEntries);
          next.delete(entryId);
          return { newEntries: next };
        }),
      checkUnlockConditions: () => undefined,
      setShowTooltips: (show) => set({ showTooltips: show }),
      setShowLoadingQuotes: (show) => set({ showLoadingQuotes: show }),
      setShowAINarration: (show) => set({ showAINarration: show }),
      setShowUnlockNotifications: (show) => set({ showUnlockNotifications: show }),
      getEntry: (id) => KNOWLEDGE_ENTRIES.find((entry) => entry.id === id),
      getEntriesByCategory: (category) =>
        KNOWLEDGE_ENTRIES.filter((entry) => entry.category === category),
      isUnlocked: (id) => get().unlockedEntries.has(id),
      isNew: (id) => get().newEntries.has(id),
      getUnlockedCount: () => KNOWLEDGE_ENTRIES.length,
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
        showTooltips: state.showTooltips,
        showLoadingQuotes: state.showLoadingQuotes,
        showAINarration: state.showAINarration,
        showUnlockNotifications: state.showUnlockNotifications,
      }),
      merge: (persisted, current) => {
        const state = sanitizeKnowledgeState(persisted);
        return {
          ...current,
          unlockedEntries: new Set(KNOWLEDGE_ENTRIES.map((entry) => entry.id)),
          readEntries: new Set(state.readEntries ?? []),
          newEntries: new Set<string>(),
          showTooltips: state.showTooltips ?? true,
          showLoadingQuotes: state.showLoadingQuotes ?? true,
          showAINarration: state.showAINarration ?? true,
          showUnlockNotifications: state.showUnlockNotifications ?? true,
        };
      },
    }
  )
);

export function getRandomLoadingQuote(): KnowledgeQuote {
  return LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)];
}

export function getCategoryIcon(category: KnowledgeCategory): KnowledgeIcon {
  if (category === 'principles') return 'sprout';
  if (category === 'pioneers') return 'sparkles';
  if (category === 'systems') return 'cog';
  return 'library';
}

export function getCategoryLabel(category: KnowledgeCategory): string {
  if (category === 'principles') return translate(knowledgeStoreMessages, 'categoryPrinciples');
  if (category === 'pioneers') return translate(knowledgeStoreMessages, 'categoryPioneers');
  if (category === 'systems') return translate(knowledgeStoreMessages, 'categorySystems');
  return translate(knowledgeStoreMessages, 'categoryCases');
}
