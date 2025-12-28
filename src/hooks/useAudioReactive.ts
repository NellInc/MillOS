/**
 * useAudioReactive - Audio-reactive visualization hook
 *
 * Provides 30fps 64-bin FFT analysis for visual synchronization.
 * Falls back to simulated values when audio is muted.
 */

import { useEffect, useRef, useCallback } from 'react';
import { audioManager } from '../utils/audioManager';
import { useAudioAnalyzerStore } from '../stores/audioAnalyzerStore';
import { useGraphicsStore } from '../stores/graphicsStore';

// FFT configuration
const FFT_SIZE = 128; // 64 bins (FFT_SIZE / 2)
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Frequency bin ranges (out of 64 bins)
// Assuming 48kHz sample rate: each bin ≈ 375Hz
// Bass: bins 0-3 (0-1.5kHz, weighted toward sub-bass)
// Mid: bins 4-15 (1.5-6kHz)
// Treble: bins 16-63 (6-24kHz)
const BASS_END = 4;
const MID_END = 16;

/**
 * Hook that initializes and runs the audio analyzer
 * @returns Object with current analysis state
 */
export function useAudioReactive() {
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const updateFromFFT = useAudioAnalyzerStore((s) => s.updateFromFFT);
  const updateFallback = useAudioAnalyzerStore((s) => s.updateFallback);
  const setFallbackMode = useAudioAnalyzerStore((s) => s.setFallbackMode);
  const enableAudioReactive = useGraphicsStore((s) => s.graphics.enableAudioReactive);

  // Calculate band levels from FFT data
  const calculateBandLevels = useCallback((dataArray: Uint8Array<ArrayBuffer>) => {
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    // Bass: bins 0-3
    for (let i = 0; i < BASS_END; i++) {
      bassSum += dataArray[i];
    }

    // Mid: bins 4-15
    for (let i = BASS_END; i < MID_END; i++) {
      midSum += dataArray[i];
    }

    // Treble: bins 16-63
    for (let i = MID_END; i < dataArray.length; i++) {
      trebleSum += dataArray[i];
    }

    // Normalize to 0-1 range (max value is 255 per bin)
    const bass = bassSum / (BASS_END * 255);
    const mid = midSum / ((MID_END - BASS_END) * 255);
    const treble = trebleSum / ((dataArray.length - MID_END) * 255);

    return { bass, mid, treble };
  }, []);

  // Animation loop
  const animate = useCallback(
    (time: number) => {
      // Throttle to target FPS
      if (time - lastFrameTimeRef.current < FRAME_INTERVAL) {
        rafIdRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTimeRef.current = time;

      // Check if audio is muted - use fallback mode
      if (audioManager.muted || !analyzerRef.current || !dataArrayRef.current) {
        setFallbackMode(true);
        updateFallback(time);
        rafIdRef.current = requestAnimationFrame(animate);
        return;
      }

      setFallbackMode(false);

      // Get FFT data
      analyzerRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);

      // Calculate and update band levels
      const { bass, mid, treble } = calculateBandLevels(
        dataArrayRef.current as Uint8Array<ArrayBuffer>
      );
      updateFromFFT(bass, mid, treble);

      rafIdRef.current = requestAnimationFrame(animate);
    },
    [calculateBandLevels, updateFromFFT, updateFallback, setFallbackMode]
  );

  // Initialize analyzer
  useEffect(() => {
    if (!enableAudioReactive) {
      // Clean up if disabled
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const context = audioManager.getAudioContext();
    if (!context) {
      // No audio context yet - try fallback mode
      setFallbackMode(true);
      rafIdRef.current = requestAnimationFrame(animate);
      return;
    }

    try {
      // Create analyzer node
      const analyzer = context.createAnalyser();
      analyzer.fftSize = FFT_SIZE;
      analyzer.smoothingTimeConstant = 0.7; // Smooth transitions

      // Connect to master output (for visualization only)
      const masterGain = audioManager.getAnalyzerMasterGain();
      if (masterGain) {
        masterGain.connect(analyzer);
      }

      analyzerRef.current = analyzer;
      dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);

      // Start animation loop
      rafIdRef.current = requestAnimationFrame(animate);
    } catch {
      // AudioReactive analyzer init failed - fallback to simulated mode
      setFallbackMode(true);
      rafIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      analyzerRef.current = null;
      dataArrayRef.current = null;
    };
  }, [enableAudioReactive, animate, setFallbackMode]);

  return {
    isActive: enableAudioReactive,
  };
}
