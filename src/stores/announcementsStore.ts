/**
 * PA announcement queue, preference, and transcript store.
 *
 * The default Focused Operations mode keeps routine notices literal and sparse.
 * Characterful Simulation unlocks the full comic corpus. Safety-critical
 * announcements remain available in every mode.
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

export type PAMode = 'focused' | 'characterful' | 'off';
export type PAChannel = 'operational' | 'safety' | 'logistics' | 'flavor';
export type PATone = 'literal' | 'reassuring' | 'characterful';

export interface PAContext {
  onboarding: boolean;
  scadaFocus: boolean;
  userInput: boolean;
  safetyCritical: boolean;
}

export interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'success' | 'emergency';
  message: string;
  timestamp: Date;
  dismissed: boolean;
  source?: string;
  priority: number;
  channel: PAChannel;
  tone: PATone;
  audience: 'all' | 'control' | 'logistics' | 'maintenance';
  cooldownMs: number;
}

export type AnnouncementInput = Omit<
  Announcement,
  'id' | 'timestamp' | 'dismissed' | 'channel' | 'tone' | 'audience' | 'cooldownMs'
> &
  Partial<Pick<Announcement, 'channel' | 'tone' | 'audience' | 'cooldownMs'>>;

export interface AnnouncementsStore {
  announcements: Announcement[];
  lastAnnouncementTime: Record<string, number>;
  mode: PAMode;
  captionsEnabled: boolean;
  context: PAContext;
  addAnnouncement: (announcement: AnnouncementInput) => void;
  dismissAnnouncement: (announcementId: string) => void;
  clearOldAnnouncements: () => void;
  clearTranscript: () => void;
  setMode: (mode: PAMode) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  setContext: (context: Partial<PAContext>) => void;
  getActiveAnnouncements: () => Announcement[];
  getAnnouncementsByPriority: (minPriority: number) => Announcement[];
}

const ANNOUNCEMENT_COOLDOWN_MS = 15000;
const MAX_ANNOUNCEMENTS = 50;
const DEFAULT_CONTEXT: PAContext = {
  onboarding: false,
  scadaFocus: false,
  userInput: false,
  safetyCritical: false,
};

function isFlavorSuppressed(context: PAContext): boolean {
  return context.onboarding || context.scadaFocus || context.userInput || context.safetyCritical;
}

function inferChannel(announcement: AnnouncementInput): PAChannel {
  if (announcement.channel) return announcement.channel;
  if (announcement.type === 'emergency' || announcement.type === 'warning') return 'safety';
  if (/truck|forklift|dock|delivery|shipment/i.test(announcement.source ?? announcement.message)) {
    return 'logistics';
  }
  return 'operational';
}

function sanitizePersistedAnnouncements(value: unknown): Announcement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && typeof entry.message === 'string'
    )
    .slice(-MAX_ANNOUNCEMENTS)
    .map((entry, index) => {
      const parsedTimestamp = new Date(String(entry.timestamp ?? Date.now()));
      const timestamp = Number.isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp;
      const type =
        entry.type === 'warning' ||
        entry.type === 'success' ||
        entry.type === 'emergency' ||
        entry.type === 'info'
          ? entry.type
          : 'info';
      const channel =
        entry.channel === 'safety' ||
        entry.channel === 'logistics' ||
        entry.channel === 'flavor' ||
        entry.channel === 'operational'
          ? entry.channel
          : 'operational';
      const tone =
        entry.tone === 'reassuring' || entry.tone === 'characterful' || entry.tone === 'literal'
          ? entry.tone
          : 'literal';
      return {
        id:
          typeof entry.id === 'string'
            ? entry.id
            : `restored-announcement-${timestamp.getTime()}-${index}`,
        type,
        message: String(entry.message),
        timestamp,
        // Restored entries are transcript history, not live captions: replaying
        // a queued 'Emergency stop activated' from a previous session misleads.
        dismissed: true,
        source: typeof entry.source === 'string' ? entry.source : undefined,
        priority:
          typeof entry.priority === 'number' && Number.isFinite(entry.priority)
            ? Math.min(4, Math.max(1, entry.priority))
            : 1,
        channel,
        tone,
        audience:
          entry.audience === 'control' ||
          entry.audience === 'logistics' ||
          entry.audience === 'maintenance' ||
          entry.audience === 'all'
            ? entry.audience
            : 'all',
        cooldownMs:
          typeof entry.cooldownMs === 'number' && Number.isFinite(entry.cooldownMs)
            ? Math.max(0, entry.cooldownMs)
            : ANNOUNCEMENT_COOLDOWN_MS,
      };
    });
}

export const useAnnouncementsStore = create<AnnouncementsStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        announcements: [],
        lastAnnouncementTime: {},
        mode: 'focused',
        captionsEnabled: true,
        context: { ...DEFAULT_CONTEXT },

        addAnnouncement: (announcement) => {
          const state = get();
          const channel = inferChannel(announcement);
          const tone = announcement.tone ?? (channel === 'flavor' ? 'characterful' : 'literal');
          const priority = Math.min(4, Math.max(1, announcement.priority));
          const isSafetyCritical = announcement.type === 'emergency' || priority >= 4;

          if (state.mode === 'off' && !isSafetyCritical) return;
          if (state.mode === 'focused' && channel === 'flavor') return;
          if (
            isFlavorSuppressed(state.context) &&
            (channel === 'flavor' || tone === 'characterful')
          ) {
            return;
          }

          const now = Date.now();
          const cooldownMs = Math.max(0, announcement.cooldownMs ?? ANNOUNCEMENT_COOLDOWN_MS);
          const messageKey = `${announcement.type}-${announcement.message}`;
          const lastTime = state.lastAnnouncementTime[messageKey] || 0;
          if (now - lastTime < cooldownMs) return;

          set((current) => ({
            announcements: [
              ...current.announcements.slice(-(MAX_ANNOUNCEMENTS - 1)),
              {
                ...announcement,
                priority,
                channel,
                tone,
                audience: announcement.audience ?? 'all',
                cooldownMs,
                id: `ann-${now}-${Math.random().toString(36).slice(2, 7)}`,
                timestamp: new Date(now),
                dismissed: false,
              },
            ],
            lastAnnouncementTime: {
              ...current.lastAnnouncementTime,
              [messageKey]: now,
            },
          }));
        },

        dismissAnnouncement: (announcementId) =>
          set((state) => ({
            announcements: state.announcements.map((announcement) =>
              announcement.id === announcementId
                ? { ...announcement, dismissed: true }
                : announcement
            ),
          })),

        clearOldAnnouncements: () => {
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          set((state) => ({
            announcements: state.announcements.filter(
              (announcement) =>
                !announcement.dismissed && announcement.timestamp.getTime() > fiveMinutesAgo
            ),
          }));
        },

        clearTranscript: () => set({ announcements: [], lastAnnouncementTime: {} }),
        setMode: (mode) => set({ mode }),
        setCaptionsEnabled: (captionsEnabled) => set({ captionsEnabled }),
        setContext: (context) => set((state) => ({ context: { ...state.context, ...context } })),

        getActiveAnnouncements: () =>
          get().announcements.filter((announcement) => !announcement.dismissed),

        getAnnouncementsByPriority: (minPriority) =>
          get().announcements.filter(
            (announcement) => !announcement.dismissed && announcement.priority >= minPriority
          ),
      }),
      {
        name: 'millos-pa',
        storage: safeJSONStorage,
        version: 1,
        partialize: (state) => ({
          announcements: state.announcements,
          mode: state.mode,
          captionsEnabled: state.captionsEnabled,
        }),
        merge: (persisted, current) => {
          const restored =
            persisted && typeof persisted === 'object'
              ? (persisted as Partial<AnnouncementsStore>)
              : {};
          return {
            ...current,
            announcements: sanitizePersistedAnnouncements(restored.announcements),
            mode:
              restored.mode === 'off' ||
              restored.mode === 'focused' ||
              restored.mode === 'characterful'
                ? restored.mode
                : current.mode,
            captionsEnabled:
              typeof restored.captionsEnabled === 'boolean'
                ? restored.captionsEnabled
                : current.captionsEnabled,
            context: { ...DEFAULT_CONTEXT },
            lastAnnouncementTime: {},
          };
        },
      }
    )
  )
);
