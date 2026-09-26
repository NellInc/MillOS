/**
 * Incident Replay Store - Incident Recording and Playback
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { CURRENT_RELEASE_VERSION } from '../config/releaseVersions';

export interface ReplayFrame {
  timestamp: number;
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

    setReplayMode: (mode: boolean) => set({ replayMode: mode }),

    recordReplayFrame: (frame: ReplayFrame) =>
      set((state) => {
        // Don't record while in replay mode
        if (state.replayMode) return state;

        return {
          replayFrames: [...state.replayFrames.slice(-(MAX_REPLAY_FRAMES - 1)), frame],
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
