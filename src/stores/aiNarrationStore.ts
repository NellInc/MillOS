/** Quiet autonomous-system narration used by the MillOS interface. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { CURRENT_RELEASE_VERSION } from '../config/releaseVersions';
import { translate } from '../i18n';
import { aiNarrationStoreMessages as msg } from './aiNarrationStore.messages';

export type NarrationTrigger =
  | 'first-play'
  | 'extended-play'
  | 'library-opened'
  | 'emergency-active'
  | 'stability-high'
  | 'stability-critical';

export interface NarrationEntry {
  id: string;
  trigger: NarrationTrigger;
  content: string;
  oneTime?: boolean;
  minPlayTime?: number;
  unlocksEntry?: string;
  priority?: number;
}

export interface AINarrationState {
  shownNarrations: Set<string>;
  enabled: boolean;
  markShown: (id: string) => void;
  setEnabled: (enabled: boolean) => void;
  hasBeenShown: (id: string) => boolean;
  getNarration: (trigger: NarrationTrigger, minutesPlayed?: number) => NarrationEntry | null;
  getAllForTrigger: (trigger: NarrationTrigger) => NarrationEntry[];
}

// `content` is a getter, so every read resolves in the active language.
export const AI_NARRATIONS: NarrationEntry[] = [
  {
    id: 'welcome-autonomous-mill',
    trigger: 'first-play',
    oneTime: true,
    priority: 100,
    unlocksEntry: 'unified-digital-twin',
    get content() {
      return translate(msg, 'welcome', { version: CURRENT_RELEASE_VERSION });
    },
  },
  {
    id: 'library-autonomous-mill',
    trigger: 'library-opened',
    oneTime: true,
    priority: 80,
    get content() {
      return translate(msg, 'library');
    },
  },
  {
    id: 'extended-autonomous-session',
    trigger: 'extended-play',
    oneTime: true,
    minPlayTime: 60,
    get content() {
      return translate(msg, 'extendedSession');
    },
  },
  {
    id: 'autonomous-emergency-active',
    trigger: 'emergency-active',
    get content() {
      return translate(msg, 'emergencyActive');
    },
  },
];

export function parseNarrationContent(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export const useAINarrationStore = create<AINarrationState>()(
  persist(
    (set, get) => ({
      shownNarrations: new Set(),
      enabled: true,
      markShown: (id) =>
        set((state) => ({ shownNarrations: new Set([...state.shownNarrations, id]) })),
      setEnabled: (enabled) => set({ enabled }),
      hasBeenShown: (id) => get().shownNarrations.has(id),
      getNarration: (trigger, minutesPlayed = 0) =>
        AI_NARRATIONS.filter(
          (entry) =>
            entry.trigger === trigger &&
            (entry.minPlayTime ?? 0) <= minutesPlayed &&
            (!entry.oneTime || !get().shownNarrations.has(entry.id))
        ).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null,
      getAllForTrigger: (trigger) => AI_NARRATIONS.filter((entry) => entry.trigger === trigger),
    }),
    {
      name: 'millos-autonomous-narration',
      storage: safeJSONStorage,
      version: 2,
      partialize: (state) => ({
        shownNarrations: [...state.shownNarrations],
        enabled: state.enabled,
      }),
      merge: (persisted, current) => {
        const state = persisted as
          | Partial<{ shownNarrations: string[]; enabled: boolean }>
          | undefined;
        return {
          ...current,
          shownNarrations: new Set(state?.shownNarrations ?? []),
          enabled: state?.enabled ?? true,
        };
      },
    }
  )
);
