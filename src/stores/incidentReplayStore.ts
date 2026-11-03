/**
 * Incident Replay Store - Incident Recording and Playback
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { CURRENT_RELEASE_VERSION } from '../config/releaseVersions';
// Read only inside recordReplayFrame, never at module evaluation, so the
// import cycle through productionStore is inert (as productionStore's own is).
import { useGameSimulationStore } from './gameSimulationStore';
import { useUIStore } from './uiStore';
import type { AlertData } from '../types';

export interface ReplayFrame {
  /** Wall-clock capture time; the diagnostic export keys on it. */
  timestamp: number;
  /** The plant clock at capture (gameDay, gameTime hours); what the player reads. */
  gameClock?: { day: number; hour: number };
  machineStates: Array<{
    id: string;
    status: string;
    metrics: Record<string, number>;
  }>;
  mobileEquipmentPositions: Array<{
    id: string;
    position: [number, number, number];
    task: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    message: string;
    /** The notice's keyed copy (src/i18n/alertCopy.ts), so the replay reads as the bell does. */
    copy?: AlertData['copy'];
  }>;
}

export type DiagnosticCommandCategory = 'control' | 'safety' | 'alarm' | 'vehicle' | 'ai';

export interface DiagnosticCommand {
  timestamp: number;
  category: DiagnosticCommandCategory;
  action: string;
  targetId?: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface DiagnosticReplayExport {
  schemaVersion: 1;
  buildId: string;
  exportedAt: number;
  sessionStartedAt: number;
  simulationSeed: string;
  privacy: {
    credentialsIncluded: false;
    personalDataIncluded: false;
    bounded: true;
  };
  commands: DiagnosticCommand[];
  frames: ReplayFrame[];
}

export interface IncidentReplayStore {
  replayMode: boolean;
  replayFrames: ReplayFrame[];
  currentReplayIndex: number;
  sessionStartedAt: number;
  simulationSeed: string;
  commands: DiagnosticCommand[];
  setReplayMode: (mode: boolean) => void;
  recordReplayFrame: (frame: ReplayFrame) => void;
  recordCommand: (command: DiagnosticCommand) => void;
  setReplayIndex: (index: number) => void;
  clearReplayFrames: () => void;
  clearDiagnostics: () => void;
  createDiagnosticExport: () => DiagnosticReplayExport;
  getCurrentFrame: () => ReplayFrame | null;
  getFrameCount: () => number;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
}

const DEFAULT_SIMULATION_SEED = `millos-${CURRENT_RELEASE_VERSION}-default`;
const MAX_REPLAY_FRAMES = 600; // 10 minutes at 1 frame/second
const MAX_DIAGNOSTIC_COMMANDS = 1000;
const BUILD_ID = typeof __MILLOS_BUILD_ID__ === 'string' ? __MILLOS_BUILD_ID__ : 'development';

/** The plant clock now, or undefined where it cannot be read (a partial test mock). */
function readPlantClock(): ReplayFrame['gameClock'] {
  try {
    const { gameDay, gameTime } = useGameSimulationStore.getState();
    return Number.isFinite(gameDay) && Number.isFinite(gameTime)
      ? { day: gameDay, hour: gameTime }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The frame's alerts with the bell's keyed copy attached. The recorder sends
 * each notice's stored text, in the language it was filed in; the bell renders
 * the keys in the language active now, and so must the replay of it.
 */
function withAlertCopy(alerts: ReplayFrame['alerts']): ReplayFrame['alerts'] {
  if (alerts.length === 0) return alerts;
  let filed: AlertData[];
  try {
    filed = useUIStore.getState().alerts ?? [];
  } catch {
    return alerts;
  }
  const copyById = new Map<string, NonNullable<AlertData['copy']>>();
  for (const alert of filed) if (alert.copy) copyById.set(alert.id, alert.copy);
  if (copyById.size === 0) return alerts;
  return alerts.map((alert) => {
    const copy = alert.copy ?? copyById.get(alert.id);
    return copy && copy !== alert.copy ? { ...alert, copy } : alert;
  });
}

/** The plant clock is stopped (P, the pace menu, any clock hold). */
function isPlantPaused(): boolean {
  try {
    return useGameSimulationStore.getState().gameSpeed === 0;
  } catch {
    return false;
  }
}

/** Same machine statuses and the same standing alerts as the frame before. */
function sameScene(frame: ReplayFrame, previous: ReplayFrame | undefined): boolean {
  if (!previous) return false;
  const statuses = (f: ReplayFrame) => f.machineStates.map((m) => `${m.id}:${m.status}`).join('|');
  const alertIds = (f: ReplayFrame) => f.alerts.map((a) => a.id).join('|');
  return statuses(frame) === statuses(previous) && alertIds(frame) === alertIds(previous);
}

function getSimulationSeed(): string {
  if (typeof window === 'undefined') return DEFAULT_SIMULATION_SEED;
  const requested = new URLSearchParams(window.location.search).get('seed');
  const sanitized = requested
    ?.trim()
    .replace(/[^a-zA-Z0-9_.:]/g, '')
    .slice(0, 64);
  return sanitized || DEFAULT_SIMULATION_SEED;
}

export const useIncidentReplayStore = create<IncidentReplayStore>()(
  subscribeWithSelector((set, get) => ({
    replayMode: false,
    replayFrames: [],
    currentReplayIndex: 0,
    sessionStartedAt: Date.now(),
    simulationSeed: getSimulationSeed(),
    commands: [],

    // Entering opens at the start of the recording. The window keeps sliding
    // while out of replay, so a kept index pointed at an arbitrary frame.
    setReplayMode: (mode: boolean) =>
      set((state) =>
        mode && !state.replayMode
          ? { replayMode: true, currentReplayIndex: 0 }
          : { replayMode: mode }
      ),

    recordReplayFrame: (frame: ReplayFrame) =>
      set((state) => {
        // Don't record while in replay mode
        if (state.replayMode) return state;
        // The recorder samples once a wall second. Paused, the plant does not
        // move, and copies of it pushed the incident being looked into out of
        // the 600-frame window within ten minutes. A change still records.
        if (isPlantPaused() && sameScene(frame, state.replayFrames.at(-1))) return state;

        // The recorder sends wall time; the player reads the plant clock.
        const gameClock = frame.gameClock ?? readPlantClock();
        const alerts = withAlertCopy(frame.alerts ?? []);
        const recorded = alerts === frame.alerts ? frame : { ...frame, alerts };
        return {
          replayFrames: [
            ...state.replayFrames.slice(-(MAX_REPLAY_FRAMES - 1)),
            gameClock ? { ...recorded, gameClock } : recorded,
          ],
        };
      }),

    recordCommand: (command: DiagnosticCommand) =>
      set((state) => ({
        commands: [...state.commands.slice(-(MAX_DIAGNOSTIC_COMMANDS - 1)), command],
      })),

    setReplayIndex: (index: number) =>
      set((state) => ({
        currentReplayIndex: Math.max(0, Math.min(index, state.replayFrames.length - 1)),
      })),

    clearReplayFrames: () => set({ replayFrames: [], currentReplayIndex: 0 }),

    clearDiagnostics: () =>
      set({
        replayFrames: [],
        currentReplayIndex: 0,
        commands: [],
        sessionStartedAt: Date.now(),
        simulationSeed: getSimulationSeed(),
      }),

    createDiagnosticExport: () => {
      const state = get();
      return {
        schemaVersion: 1,
        buildId: BUILD_ID,
        exportedAt: Date.now(),
        sessionStartedAt: state.sessionStartedAt,
        simulationSeed: state.simulationSeed,
        privacy: {
          credentialsIncluded: false,
          personalDataIncluded: false,
          bounded: true,
        },
        commands: [...state.commands],
        frames: [...state.replayFrames],
      };
    },

    getCurrentFrame: () => {
      const { replayFrames, currentReplayIndex } = get();
      return replayFrames[currentReplayIndex] || null;
    },

    getFrameCount: () => get().replayFrames.length,

    stepForward: () =>
      set((state) => ({
        currentReplayIndex: Math.min(state.currentReplayIndex + 1, state.replayFrames.length - 1),
      })),

    stepBackward: () =>
      set((state) => ({
        currentReplayIndex: Math.max(state.currentReplayIndex - 1, 0),
      })),

    jumpToStart: () => set({ currentReplayIndex: 0 }),

    jumpToEnd: () =>
      set((state) => ({
        currentReplayIndex: Math.max(0, state.replayFrames.length - 1),
      })),
  }))
);
