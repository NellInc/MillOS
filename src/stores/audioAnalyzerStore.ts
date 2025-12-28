import { create } from 'zustand';

/**
 * Audio Analyzer Store
 *
 * Zustand store exposing reactive FFT frequency band data for audio-reactive visuals.
 * Updated at 30fps by the useAudioReactive hook.
 */

export interface AudioAnalyzerState {
  /** Bass level (0-1): 20-250Hz normalized amplitude */
  bassLevel: number;
  /** Mid level (0-1): 250Hz-2kHz normalized amplitude */
  midLevel: number;
  /** Treble level (0-1): 2-16kHz normalized amplitude */
  trebleLevel: number;
  /** Overall level (0-1): Weighted average of all bands */
  overallLevel: number;
  /** True when audio muted (uses simulated values) */
  isFallbackMode: boolean;
  /** Last update timestamp for fallback animation */
  lastUpdateTime: number;
}

interface AudioAnalyzerActions {
  /** Update from FFT data (called by analyzer at 30fps) */
  updateFromFFT: (bass: number, mid: number, treble: number) => void;
  /** Update with simulated fallback values */
  updateFallback: (time: number) => void;
  /** Set fallback mode state */
  setFallbackMode: (enabled: boolean) => void;
  /** Reset all levels to zero */
  reset: () => void;
}

const INITIAL_STATE: AudioAnalyzerState = {
  bassLevel: 0,
  midLevel: 0,
  trebleLevel: 0,
  overallLevel: 0,
  isFallbackMode: false,
  lastUpdateTime: 0,
};

export const useAudioAnalyzerStore = create<AudioAnalyzerState & AudioAnalyzerActions>((set) => ({
  ...INITIAL_STATE,

  updateFromFFT: (bass, mid, treble) => {
    // Weighted average: bass contributes more to "energy" feel
    const overall = bass * 0.5 + mid * 0.35 + treble * 0.15;
    set({
      bassLevel: bass,
      midLevel: mid,
      trebleLevel: treble,
      overallLevel: overall,
      lastUpdateTime: performance.now(),
    });
  },

  updateFallback: (time) => {
    // Generate smooth sinusoidal values for fallback mode
    // Different frequencies for each band create varied animation
    const bass = 0.3 + 0.2 * Math.sin(time * 0.001); // Slow pulse
    const mid = 0.25 + 0.15 * Math.sin(time * 0.002 + 1); // Medium pulse
    const treble = 0.1 + 0.1 * Math.sin(time * 0.003 + 2); // Fast subtle pulse
    const overall = bass * 0.5 + mid * 0.35 + treble * 0.15;

    set({
      bassLevel: bass,
      midLevel: mid,
      trebleLevel: treble,
      overallLevel: overall,
      lastUpdateTime: time,
    });
  },

  setFallbackMode: (enabled) => set({ isFallbackMode: enabled }),

  reset: () => set(INITIAL_STATE),
}));

// Selector hooks for optimal re-render performance
export const useBassLevel = () => useAudioAnalyzerStore((state) => state.bassLevel);
export const useMidLevel = () => useAudioAnalyzerStore((state) => state.midLevel);
export const useTrebleLevel = () => useAudioAnalyzerStore((state) => state.trebleLevel);
export const useOverallLevel = () => useAudioAnalyzerStore((state) => state.overallLevel);
export const useIsFallbackMode = () => useAudioAnalyzerStore((state) => state.isFallbackMode);
