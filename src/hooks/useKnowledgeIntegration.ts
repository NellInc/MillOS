import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useKnowledgeStore } from '../stores/knowledgeStore';
import {
  useAINarrationStore,
  type NarrationEntry,
  type NarrationTrigger,
} from '../stores/aiNarrationStore';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

/** How often running time is sampled; also the most one sample may add. */
const RUN_SAMPLE_MS = 5000;

export function useKnowledgeIntegration(onNarration?: (narration: NarrationEntry) => void) {
  // Minutes the simulation has actually run: a paused plant or a hidden tab
  // does not count, because the hour-long note says "has been running".
  const runningMs = useRef(0);
  const lastRunSample = useRef(Date.now());
  const firstPlayTriggered = useRef(false);
  // Select the four fields rather than the whole store: this hook lives in
  // GameInterface, and a whole-store subscription re-rendered the HUD host on
  // every knowledge or narration write.
  const unlockEntry = useKnowledgeStore((state) => state.unlockEntry);
  const { getNarration, hasBeenShown, enabled } = useAINarrationStore(
    useShallow((state) => ({
      getNarration: state.getNarration,
      hasBeenShown: state.hasBeenShown,
      enabled: state.enabled,
    }))
  );
  const extendedPlayTriggered = useRef(false);

  const triggerNarration = useCallback(
    (trigger: NarrationTrigger) => {
      if (!FEATURE_FLAGS.AI_NARRATION_ENABLED || !enabled) return;
      // Read the session clock now. A minute counter kept in state reached this
      // callback one tick late, so the hour-long note was asked for at 59 min,
      // refused, and never asked for again.
      const minutesPlayed = runningMs.current / 60000;
      const narration = getNarration(trigger, minutesPlayed);
      if (!narration) return;
      // Not marked shown here: GameInterface queues the card behind the tour,
      // a sidebar or a safety state, and the card marks itself as it mounts.
      // Marked at delivery, a reload while it waited lost a one-time note.
      if (narration.unlocksEntry) unlockEntry(narration.unlocksEntry);
      onNarration?.(narration);
    },
    [enabled, getNarration, onNarration, unlockEntry]
  );

  useEffect(() => {
    if (firstPlayTriggered.current || hasBeenShown('welcome-autonomous-mill') || !enabled) return;
    firstPlayTriggered.current = true;
    const timer = window.setTimeout(() => triggerNarration('first-play'), 1800);
    return () => window.clearTimeout(timer);
  }, [enabled, hasBeenShown, triggerNarration]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      // Capped: a throttled background tab wakes with a long gap it did not run.
      const elapsed = Math.min(Math.max(0, now - lastRunSample.current), 2 * RUN_SAMPLE_MS);
      lastRunSample.current = now;
      const running =
        useGameSimulationStore.getState().gameSpeed > 0 &&
        !(typeof document !== 'undefined' && document.hidden);
      if (running) runningMs.current += elapsed;
      if (runningMs.current >= 60 * 60000 && !extendedPlayTriggered.current) {
        extendedPlayTriggered.current = true;
        triggerNarration('extended-play');
      }
    }, RUN_SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [triggerNarration]);

  return { triggerNarration };
}
