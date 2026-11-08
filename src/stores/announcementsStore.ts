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
import { readPlantClock, sanitizePlantClock, type PlantClock } from '../utils/timeFormatting';
import { sanitizeKeyedLine, type KeyedLine } from '../i18n/alertCopy';
import { LOCALES, type Locale } from '../i18n';
import { isPAVoiceFor } from '../audio/paVoiceCatalog';

export type PAMode = 'focused' | 'characterful' | 'off';
export type PAChannel = 'operational' | 'safety' | 'logistics' | 'flavor';
export type PATone = 'literal' | 'reassuring' | 'characterful';

export interface PAContext {
  onboarding: boolean;
  scadaFocus: boolean;
  userInput: boolean;
  /** GameInterface's hold: a standing critical alert, or a drill, stop or crisis. */
  safetyCritical: boolean;
  /**
   * The PA's own hold: a drill, facility or forklift stop, or crisis. A key of
   * its own, because each writer re-marks only its own terms, and on a shared
   * key the last to write cleared the other's hold.
   */
  safetyHold?: boolean;
  /** The plant clock is paused: routine cycle bells would say it is running. */
  plantPaused?: boolean;
}

/** Routine PA traffic is held: either writer has a safety state standing. */
export const isPASafetyHeld = (context: PAContext): boolean =>
  context.safetyCritical || context.safetyHold === true;

export interface Announcement {
  id: string;
  type: 'info' | 'warning' | 'success' | 'emergency';
  message: string;
  timestamp: Date;
  /** The plant clock when the line was made, which the transcript shows. */
  gameClock?: PlantClock;
  dismissed: boolean;
  source?: string;
  priority: number;
  channel: PAChannel;
  tone: PATone;
  audience: 'all' | 'control' | 'logistics' | 'maintenance';
  cooldownMs: number;
  /**
   * A caption for the eye only: the alert it accompanies is what screen
   * readers hear, so the PA live region does not read it a second time.
   */
  captionOnly?: boolean;
  /**
   * The plant state this line describes ('plant-stop', 'forklift-stop',
   * 'machine:<id>'). A newer line on the same topic retires the older ones,
   * and the producer retires the topic when the state ends, so a queued
   * caption can never describe a state the plant has already left.
   */
  topic?: string;
  /**
   * Keyed copy (src/i18n/alertCopy.ts keyedText): the caption and the spoken
   * line read in the language active now; `message` is the fallback.
   */
  copy?: KeyedLine;
}

export type AnnouncementInput = Omit<
  Announcement,
  'id' | 'timestamp' | 'gameClock' | 'dismissed' | 'channel' | 'tone' | 'audience' | 'cooldownMs'
> &
  Partial<Pick<Announcement, 'channel' | 'tone' | 'audience' | 'cooldownMs'>>;

export interface AnnouncementsStore {
  announcements: Announcement[];
  lastAnnouncementTime: Record<string, number>;
  mode: PAMode;
  captionsEnabled: boolean;
  /** Lines are spoken by the on-device PA voice (src/audio/paVoice.ts). */
  voiceEnabled: boolean;
  /** The player's PA voice per language, a catalogue name (src/audio/paVoiceCatalog.ts). */
  voiceNames: Partial<Record<Locale, string>>;
  context: PAContext;
  addAnnouncement: (announcement: AnnouncementInput) => void;
  dismissAnnouncement: (announcementId: string) => void;
  /** Retire every queued or showing line that matches; the transcript keeps them. */
  dismissMatching: (predicate: (announcement: Announcement) => boolean) => void;
  clearOldAnnouncements: () => void;
  clearTranscript: () => void;
  setMode: (mode: PAMode) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setVoiceName: (locale: Locale, name: string) => void;
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
  return context.onboarding || context.scadaFocus || context.userInput || isPASafetyHeld(context);
}

function inferChannel(announcement: AnnouncementInput): PAChannel {
  if (announcement.channel) return announcement.channel;
  if (announcement.type === 'emergency' || announcement.type === 'warning') return 'safety';
  if (/truck|forklift|dock|delivery|shipment/i.test(announcement.source ?? announcement.message)) {
    return 'logistics';
  }
  return 'operational';
}

/** What identifies a line for cooldowns: its key when it has one, else its text. */
function announcementLineKey(line: Pick<Announcement, 'message' | 'copy'>): string {
  return line.copy
    ? `${line.copy.catalog}:${line.copy.key}:${JSON.stringify(line.copy.params ?? {})}`
    : line.message;
}

/**
 * A line whose text is its own catalogue key ('packingLineVerified'): made
 * while the key did not resolve (a translate miss returns the key), so its
 * stored message is no fallback either. It is never queued, shown or restored.
 * Working if no PA caption or transcript row ever reads as a camelCase key.
 */
export function isUnresolvedPALine(line: { message: string; copy?: KeyedLine }): boolean {
  const text = line.message.trim();
  return text.length === 0 || (line.copy !== undefined && text === line.copy.key);
}

/*
 * The timed all-is-well notices and the 25-90% target readouts were retired
 * (D-054). A transcript row filed under one of these keys is dropped on
 * restore rather than shown in the English it was stored in.
 */
const RETIRED_PA_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  gameSharedPA: new Set([
    'processPathVerified',
    'siloInventoryReconciled',
    'rollerGapStable',
    'plansifterPressureNominal',
    'packingLineVerified',
    'dockSequencingCleared',
    'forkliftRoutesDeconflicted',
    'geofencesMatch',
    'dustExtractionStable',
    'waterwayHealthy',
    'weatherFeedChecked',
    'millIsCalm',
    'vibrationTrendReviewed',
    'constraintAnalysisUpdated',
    'cycleTimeVarianceCorrected',
    'housekeepingComplete',
    'daylightControlActive',
    'solarLoadingApplied',
    'nightProfileActive',
    'lightingTrackingSky',
    'milestone25',
    'milestone50',
    'milestone75',
    'milestone90',
    'safetyInterlockLogged',
    'nearMissTriggered',
    'vehicleProximity',
    'drillSensorsUnderTest',
  ]),
};

const isRetiredPALine = (copy: KeyedLine | undefined): boolean =>
  copy !== undefined && RETIRED_PA_KEYS[copy.catalog]?.has(copy.key) === true;

function sanitizePersistedAnnouncements(value: unknown): Announcement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && typeof entry.message === 'string'
    )
    .filter((entry) => {
      const copy = sanitizeKeyedLine(entry.copy);
      return (
        !isRetiredPALine(copy) && !isUnresolvedPALine({ message: String(entry.message), copy })
      );
    })
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
      const gameClock = sanitizePlantClock(entry.gameClock);
      const copy = sanitizeKeyedLine(entry.copy);
      return {
        ...(copy ? { copy } : {}),
        id:
          typeof entry.id === 'string'
            ? entry.id
            : `restored-announcement-${timestamp.getTime()}-${index}`,
        type,
        message: String(entry.message),
        timestamp,
        ...(gameClock ? { gameClock } : {}),
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
        voiceEnabled: true,
        voiceNames: {},
        context: { ...DEFAULT_CONTEXT },

        addAnnouncement: (announcement) => {
          const state = get();
          const channel = inferChannel(announcement);
          const tone = announcement.tone ?? (channel === 'flavor' ? 'characterful' : 'literal');
          const priority = Math.min(4, Math.max(1, announcement.priority));
          const isSafetyCritical = announcement.type === 'emergency' || priority >= 4;

          // A line that is only its key has nothing to say; better silence.
          if (isUnresolvedPALine(announcement)) return;

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
          // A keyed line is the same line whatever language it was worded in,
          // so a language switch does not let it repeat inside its cooldown.
          const lineKey = announcementLineKey(announcement);
          const messageKey = `${announcement.type}-${lineKey}`;
          const lastTime = state.lastAnnouncementTime[messageKey] || 0;
          const topic = announcement.topic;
          // A topic line repeats within its cooldown only when the state it
          // describes changed in between (a drill restarted seconds after it
          // ended); a plain repeat of the newest line is still held.
          const previousOnTopic = topic
            ? [...state.announcements].reverse().find((entry) => entry.topic === topic)
            : undefined;
          // A retired line counts too: producers retire a topic when its state
          // ends (a forklift stop released has no line of its own), and they
          // only send a topic line on an edge, so the same line again is a
          // new event. Working if Space, release, Space captions both stops.
          const stateChanged =
            previousOnTopic !== undefined &&
            (previousOnTopic.dismissed || announcementLineKey(previousOnTopic) !== lineKey);
          if (now - lastTime < cooldownMs && !stateChanged) return;

          const gameClock = readPlantClock();
          set((current) => ({
            announcements: [
              ...current.announcements
                .slice(-(MAX_ANNOUNCEMENTS - 1))
                .map((entry) =>
                  topic && entry.topic === topic && !entry.dismissed
                    ? { ...entry, dismissed: true }
                    : entry
                ),
              {
                ...announcement,
                priority,
                channel,
                tone,
                audience: announcement.audience ?? 'all',
                cooldownMs,
                id: `ann-${now}-${Math.random().toString(36).slice(2, 7)}`,
                timestamp: new Date(now),
                ...(gameClock ? { gameClock } : {}),
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

        dismissMatching: (predicate) =>
          set((state) =>
            state.announcements.some((entry) => !entry.dismissed && predicate(entry))
              ? {
                  announcements: state.announcements.map((entry) =>
                    !entry.dismissed && predicate(entry) ? { ...entry, dismissed: true } : entry
                  ),
                }
              : state
          ),

        clearOldAnnouncements: () => {
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          set((state) => ({
            announcements: state.announcements.filter(
              (announcement) =>
                !announcement.dismissed && announcement.timestamp.getTime() > fiveMinutesAgo
            ),
          }));
        },

        // The history goes; a caption still showing or queued (a standing
        // E-STOP, say) and the cooldowns stay, so nothing live vanishes and
        // nothing just held repeats at once.
        // A retired topic line is what marks its repeat as a new state (a stop
        // engaged again), so a cleared one takes its cooldown with it, unless
        // a line on that topic is still live.
        clearTranscript: () =>
          set((state) => {
            const kept = state.announcements.filter((entry) => !entry.dismissed);
            const liveTopics = new Set(kept.map((entry) => entry.topic));
            const lastAnnouncementTime = { ...state.lastAnnouncementTime };
            for (const entry of state.announcements) {
              if (entry.dismissed && entry.topic && !liveTopics.has(entry.topic)) {
                delete lastAnnouncementTime[`${entry.type}-${announcementLineKey(entry)}`];
              }
            }
            return { announcements: kept, lastAnnouncementTime };
          }),
        // Off quiets routine traffic already queued as well as new lines (the
        // same test addAnnouncement applies); the transcript keeps them.
        setMode: (mode) =>
          set((state) => ({
            mode,
            ...(mode === 'off'
              ? {
                  announcements: state.announcements.map((entry) =>
                    !entry.dismissed && entry.type !== 'emergency' && entry.priority < 4
                      ? { ...entry, dismissed: true }
                      : entry
                  ),
                }
              : {}),
          })),
        setCaptionsEnabled: (captionsEnabled) => set({ captionsEnabled }),
        setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
        setVoiceName: (locale, name) => {
          if (!isPAVoiceFor(locale, name)) return;
          set((state) => ({ voiceNames: { ...state.voiceNames, [locale]: name } }));
        },
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
          voiceEnabled: state.voiceEnabled,
          voiceNames: state.voiceNames,
        }),
        merge: (persisted, current) => {
          const restored =
            persisted && typeof persisted === 'object'
              ? (persisted as Partial<AnnouncementsStore>)
              : {};
          return {
            ...current,
            announcements: sanitizePersistedAnnouncements(restored.announcements),
            // 'characterful' only added the timed filler the PA no longer
            // speaks (D-054); Settings now offers on and off, so it reads as on.
            mode:
              restored.mode === 'off' || restored.mode === 'focused'
                ? restored.mode
                : restored.mode === 'characterful'
                  ? 'focused'
                  : current.mode,
            captionsEnabled:
              typeof restored.captionsEnabled === 'boolean'
                ? restored.captionsEnabled
                : current.captionsEnabled,
            voiceEnabled:
              typeof restored.voiceEnabled === 'boolean'
                ? restored.voiceEnabled
                : current.voiceEnabled,
            // Only names the catalogue knows for that language survive a reload.
            voiceNames: Object.fromEntries(
              LOCALES.flatMap((locale) => {
                const name = (restored.voiceNames as Record<string, unknown> | undefined)?.[locale];
                return isPAVoiceFor(locale, name) ? [[locale, name]] : [];
              })
            ),
            context: { ...DEFAULT_CONTEXT },
            lastAnnouncementTime: {},
          };
        },
      }
    )
  )
);
