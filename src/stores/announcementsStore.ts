/**
 * Announcements Store - PA Announcement System
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'success' | 'emergency';
  message: string;
  timestamp: Date;
  dismissed: boolean;
  source?: string;
  priority: number; // 1 = low, 2 = medium, 3 = high, 4 = critical
}

export interface AnnouncementsStore {
  announcements: Announcement[];
  lastAnnouncementTime: Record<string, number>; // Deduplication tracking
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'timestamp' | 'dismissed'>) => void;
  dismissAnnouncement: (announcementId: string) => void;
  clearOldAnnouncements: () => void;
  getActiveAnnouncements: () => Announcement[];
  getAnnouncementsByPriority: (minPriority: number) => Announcement[];
}

const ANNOUNCEMENT_COOLDOWN_MS = 15000; // 15 seconds between duplicate announcements
const MAX_ANNOUNCEMENTS = 50;

export const useAnnouncementsStore = create<AnnouncementsStore>()(
  subscribeWithSelector((set, get) => ({
    announcements: [],
    lastAnnouncementTime: {},

    addAnnouncement: (announcement) => {
      const state = get();
      const now = Date.now();

      // Deduplication: Check if same message was recently announced
      const messageKey = `${announcement.type}-${announcement.message}`;
      const lastTime = state.lastAnnouncementTime[messageKey] || 0;

      if (now - lastTime < ANNOUNCEMENT_COOLDOWN_MS) {
        return; // Skip duplicate
      }

      set((state) => ({
        announcements: [
          ...state.announcements.slice(-(MAX_ANNOUNCEMENTS - 1)),
          {
            ...announcement,
            id: `ann-${now}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date(),
            dismissed: false,
          },
        ],
        lastAnnouncementTime: {
          ...state.lastAnnouncementTime,
          [messageKey]: now,
        },
      }));
    },

    dismissAnnouncement: (announcementId: string) =>
      set((state) => ({
        announcements: state.announcements.map((a) =>
          a.id === announcementId ? { ...a, dismissed: true } : a
        ),
      })),

    clearOldAnnouncements: () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      set((state) => ({
        announcements: state.announcements.filter(
          (a) => !a.dismissed && a.timestamp.getTime() > fiveMinutesAgo
        ),
      }));
    },

    getActiveAnnouncements: () =>
      get().announcements.filter((a) => !a.dismissed),

    getAnnouncementsByPriority: (minPriority: number) =>
      get().announcements.filter((a) => !a.dismissed && a.priority >= minPriority),
  }))
);
