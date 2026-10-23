import { useEffect, useRef } from 'react';
import { useSafetyStore } from '../stores/safetyStore';

const SAMPLE_INTERVAL_MS = 1000;

/**
 * 1 Hz utilisation sample for Safety Analytics, taken only while the forklift
 * simulation runs: not while the clock is held, and not while the tab is
 * hidden, when nothing moves. The store books wall-clock deltas, so on resume
 * the sample clock is rebased first; otherwise the first sample would book the
 * whole held span as moving or stopped. On stop, the partial second up to that
 * moment is booked.
 * Working if a held or hidden span adds nothing to either total
 * (useForkliftMetricsSampler.test.ts).
 */
export function useForkliftMetricsSampler(
  forkliftId: string,
  running: boolean,
  isMoving: () => boolean
): void {
  const isMovingRef = useRef(isMoving);
  isMovingRef.current = isMoving;

  useEffect(() => {
    if (!running) return undefined;
    const store = useSafetyStore.getState;
    store().resumeForkliftMetrics(forkliftId);
    const id = setInterval(
      () => store().updateForkliftMetrics(forkliftId, isMovingRef.current()),
      SAMPLE_INTERVAL_MS
    );
    return () => {
      clearInterval(id);
      store().updateForkliftMetrics(forkliftId, isMovingRef.current());
    };
  }, [forkliftId, running]);
}
