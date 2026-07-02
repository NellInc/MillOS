/**
 * Achievement Tracker Hook
 *
 * Bridges live simulation stores to the achievements store, which previously
 * had zero producers. Subscribes to production, safety, drill, and worker-mood
 * state and drives useAchievementsStore progress/unlocks for:
 *
 * - first-bag / century / thousand  (productionStore.totalBagsProduced)
 * - safety-first                    (fire drill evacuation complete)
 * - zero-incidents                  (24 game hours without a safety incident)
 * - full-capacity                   (all machines running at 90%+ load)
 * - happy-workforce                 (90%+ average worker satisfaction)
 * - break-time                      (50 granted break preference requests)
 *
 * Also watches the achievements store itself and fires a success toast +
 * celebration whenever ANY achievement unlocks (including ones driven from
 * elsewhere, e.g. the bilateral achievements updated by aiEngine).
 *
 * NOTE: vote-participant is driven elsewhere (voting integration) - not here.
 */

import { useEffect, useRef } from 'react';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useUIStore } from '../stores/uiStore';

/** Polling cadence for aggregate checks (full-capacity, satisfaction, streaks) */
const POLL_INTERVAL_MS = 5000;

export const useAchievementTracker = (): void => {
  // Game-hours elapsed without a safety incident (for zero-incidents)
  const incidentFreeHoursRef = useRef(0);
  const lastGameTimeRef = useRef<number | null>(null);
  const lastIncidentCountRef = useRef<number | null>(null);
  // Preference-request IDs already counted toward break-time
  const countedBreakRequestIdsRef = useRef<Set<string>>(new Set());

  // --- Unlock notifications (toast + celebration) for ALL achievements ------
  useEffect(() => {
    const initiallyUnlocked = new Set(
      useAchievementsStore
        .getState()
        .achievements.filter((a) => a.unlocked)
        .map((a) => a.id)
    );

    const unsubscribe = useAchievementsStore.subscribe(
      (state) => state.achievements,
      (achievements) => {
        achievements.forEach((a) => {
          if (!a.unlocked || initiallyUnlocked.has(a.id)) return;
          initiallyUnlocked.add(a.id);

          useUIStore.getState().addAlert({
            id: `achievement-${a.id}-${Date.now()}`,
            type: 'success',
            title: 'Achievement Unlocked',
            message: `${a.name} - ${a.description}`,
            timestamp: new Date(),
            acknowledged: false,
          });

          useGameSimulationStore.getState().triggerCelebration('milestone', {
            message: `Achievement unlocked: ${a.name}`,
          });
        });
      }
    );

    return unsubscribe;
  }, []);

  // --- Production milestones (first-bag / century / thousand) ---------------
  useEffect(() => {
    const applyBagProgress = (total: number) => {
      if (!Number.isFinite(total) || total <= 0) return;
      const store = useAchievementsStore.getState();
      store.updateAchievementProgress('first-bag', total);
      store.updateAchievementProgress('century', total);
      store.updateAchievementProgress('thousand', total);
    };

    applyBagProgress(useProductionStore.getState().totalBagsProduced);

    const unsubscribe = useProductionStore.subscribe(
      (state) => state.totalBagsProduced,
      applyBagProgress
    );
    return unsubscribe;
  }, []);

  // --- Fire drill completed (safety-first) -----------------------------------
  // gameSimulationStore does not use subscribeWithSelector, so use the vanilla
  // (state, prevState) listener signature.
  useEffect(() => {
    const unsubscribe = useGameSimulationStore.subscribe((state, prevState) => {
      if (state.drillMetrics.evacuationComplete && !prevState.drillMetrics.evacuationComplete) {
        useAchievementsStore.getState().unlockAchievement('safety-first');
      }
    });
    return unsubscribe;
  }, []);

  // --- Break grants (break-time) ---------------------------------------------
  useEffect(() => {
    const countBreakGrants = (
      workerMoods: ReturnType<typeof useWorkerMoodStore.getState>['workerMoods'],
      seed: boolean
    ) => {
      let newGrants = 0;
      Object.values(workerMoods).forEach((mood) => {
        const request = mood?.preferences?.activeRequest;
        if (!request || request.status !== 'granted' || request.type !== 'break') return;
        if (countedBreakRequestIdsRef.current.has(request.id)) return;
        countedBreakRequestIdsRef.current.add(request.id);
        newGrants += 1;
      });

      // On the initial seed, record existing grants without awarding progress
      // twice (achievement progress already persisted in the store, if any).
      if (seed || newGrants === 0) return;

      const store = useAchievementsStore.getState();
      const current = store.getAchievement('break-time')?.progress ?? 0;
      store.updateAchievementProgress('break-time', current + newGrants);
    };

    countBreakGrants(useWorkerMoodStore.getState().workerMoods, true);

    // workerMoodStore does not use subscribeWithSelector - vanilla listener.
    const unsubscribe = useWorkerMoodStore.subscribe((state, prevState) => {
      if (state.workerMoods !== prevState.workerMoods) {
        countBreakGrants(state.workerMoods, false);
      }
    });
    return unsubscribe;
  }, []);

  // --- Polled aggregates: zero-incidents, full-capacity, happy-workforce ----
  useEffect(() => {
    const intervalId = setInterval(() => {
      const achievements = useAchievementsStore.getState();

      // zero-incidents: accumulate game hours without a new safety incident
      const gameTime = useGameSimulationStore.getState().gameTime;
      const incidentCount = useSafetyStore.getState().safetyIncidents.length;

      if (lastIncidentCountRef.current === null) {
        lastIncidentCountRef.current = incidentCount;
      } else if (incidentCount > lastIncidentCountRef.current) {
        // New incident - reset the streak
        incidentFreeHoursRef.current = 0;
        lastIncidentCountRef.current = incidentCount;
        achievements.updateAchievementProgress('zero-incidents', 0);
      }

      if (lastGameTimeRef.current !== null) {
        let deltaHours = gameTime - lastGameTimeRef.current;
        if (deltaHours < 0) deltaHours += 24; // gameTime wraps at midnight
        if (Number.isFinite(deltaHours) && deltaHours > 0 && deltaHours < 24) {
          incidentFreeHoursRef.current += deltaHours;
          achievements.updateAchievementProgress(
            'zero-incidents',
            Math.floor(incidentFreeHoursRef.current)
          );
        }
      }
      lastGameTimeRef.current = gameTime;

      // full-capacity: all machines running at 90%+ load
      const machines = useProductionStore.getState().machines;
      if (machines.length > 0 && machines.every((m) => m.status === 'running')) {
        const minLoad = machines.reduce(
          (min, m) => Math.min(min, m.metrics?.load ?? 0),
          Number.POSITIVE_INFINITY
        );
        if (Number.isFinite(minLoad)) {
          achievements.updateAchievementProgress('full-capacity', Math.floor(minLoad));
        }
      }

      // happy-workforce: 90%+ average worker satisfaction
      const avgSatisfaction = useWorkerMoodStore.getState().getAverageWorkerSatisfaction();
      if (Number.isFinite(avgSatisfaction) && avgSatisfaction > 0) {
        achievements.updateAchievementProgress('happy-workforce', Math.floor(avgSatisfaction));
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
};

/**
 * Tiny always-rendered mount point for the tracker.
 * Render once anywhere in the React tree (DOM or R3F).
 */
export const AchievementTracker = (): null => {
  useAchievementTracker();
  return null;
};
