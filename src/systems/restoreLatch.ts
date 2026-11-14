import { useGameSimulationStore } from '../stores/gameSimulationStore';

/**
 * Whether this page restored a saved shift. The physical session holds the
 * clock as 'restore' from the stores' restore until the scene's owners have
 * theirs, then releases it. The operational UI loads later, as a deferred
 * chunk revealed on the first frame, and may mount after that release, so it
 * cannot see the restore itself: this module is on the static path from
 * main.tsx (physicalSession, UnifiedGameTick, campaignResults), loaded before
 * the restore begins, and remembers it.
 * Working if a reorientation mounted after the restore still knows one happened.
 */
type ClockHolds = ReturnType<typeof useGameSimulationStore.getState>['clockHolds'];
const holdsRestore = (holds: ClockHolds | undefined) =>
  Array.isArray(holds) && holds.some((hold) => hold.holder === 'restore');

let held = holdsRestore(useGameSimulationStore.getState().clockHolds);
let finished = false;
const listeners = new Set<() => void>();

useGameSimulationStore.subscribe((state) => {
  const now = holdsRestore(state.clockHolds);
  const released = held && !now;
  held = now;
  if (!released) return;
  finished = true;
  listeners.forEach((listener) => listener());
});

/** A saved shift was restored on this page and has finished restoring. */
export const restoreFinishedThisPage = (): boolean => finished;

/** Called once when the restore finishes; returns the unsubscribe. */
export function onRestoreFinished(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: a new page. */
export function resetRestoreLatch(): void {
  held = holdsRestore(useGameSimulationStore.getState().clockHolds);
  finished = false;
}
