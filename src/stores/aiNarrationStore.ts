/** Quiet autonomous-system narration used by the MillOS interface. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { CURRENT_RELEASE_VERSION } from '../config/releaseVersions';

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

export const AI_NARRATIONS: NarrationEntry[] = [
  {
    id: 'welcome-autonomous-mill',
    trigger: 'first-play',
    oneTime: true,
    priority: 100,
    unlocksEntry: 'unified-digital-twin',
    content: `Welcome to MillOS ${CURRENT_RELEASE_VERSION}.\n\nThis is a fully uncrewed grain-mill digital twin. The factory floor, loading yard, garage, village, farm, stream, mountains, sky, and celestial cycle form one continuous world.\n\nI coordinate process state, logistics, safety interlocks, quality genealogy, maintenance, and SCADA evidence. Open Datalinks for concise explanations of how each subsystem fits together.`,
  },
  {
    id: 'library-autonomous-mill',
    trigger: 'library-opened',
    oneTime: true,
    priority: 80,
    content: `Datalinks now documents the operating contracts behind this mill: material genealogy, alarm lifecycle, autonomous logistics, controlled maintenance, environment continuity, depth policy, and decision provenance.`,
  },
  {
    id: 'extended-autonomous-session',
    trigger: 'extended-play',
    oneTime: true,
    minPlayTime: 60,
    content: `The simulation has been running for an hour. This is a useful point to review alarm history, maintenance wear, genealogy balance, and graphics performance before increasing the time scale.`,
  },
  {
    id: 'autonomous-emergency-active',
    trigger: 'emergency-active',
    content: `A fail-safe stop is active. Production and mobile equipment remain interlocked until the recovery state is verified.`,
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
