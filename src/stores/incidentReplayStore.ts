/**
 * Incident Replay Store - Incident Recording and Playback
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ReplayFrame {
  timestamp: number;
  machineStates: Array<{
    id: string;
    status: string;
    metrics: Record<string, number>;
  }>;
  workerPositions: Array<{
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

export interface IncidentReplayStore {
  replayMode: boolean;
  replayFrames: ReplayFrame[];
  currentReplayIndex: number;
  setReplayMode: (mode: boolean) => void;
  recordReplayFrame: (frame: ReplayFrame) => void;
  setReplayIndex: (index: number) => void;
  clearReplayFrames: () => void;
  getCurrentFrame: () => ReplayFrame | null;
  getFrameCount: () => number;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
}

const MAX_REPLAY_FRAMES = 600; // 10 minutes at 1 frame/second

export const useIncidentReplayStore = create<IncidentReplayStore>()(
  subscribeWithSelector((set, get) => ({
    replayMode: false,
    replayFrames: [],
    currentReplayIndex: 0,

    setReplayMode: (mode: boolean) =>
      set({ replayMode: mode }),

    recordReplayFrame: (frame: ReplayFrame) =>
      set((state) => {
        // Don't record while in replay mode
        if (state.replayMode) return state;

        return {
          replayFrames: [...state.replayFrames.slice(-(MAX_REPLAY_FRAMES - 1)), frame],
        };
      }),

    setReplayIndex: (index: number) =>
      set((state) => ({
        currentReplayIndex: Math.max(0, Math.min(index, state.replayFrames.length - 1)),
      })),

    clearReplayFrames: () =>
      set({ replayFrames: [], currentReplayIndex: 0 }),

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

    jumpToStart: () =>
      set({ currentReplayIndex: 0 }),

    jumpToEnd: () =>
      set((state) => ({
        currentReplayIndex: Math.max(0, state.replayFrames.length - 1),
      })),
  }))
);
