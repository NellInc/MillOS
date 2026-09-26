/**
 * Achievement Tracker Hook
 *
 * Bridges live simulation stores to the achievements store. Subscribes to
 * production, equipment-safety, drill and decision state and drives
 * useAchievementsStore progress/unlocks for:
 *
 * - first-bag / century / thousand  (productionStore.totalBagsProduced)
 * - zero-incidents                  (24 game hours without a safety incident)
 * - full-capacity                   (all machines running at 90%+ load)
 * - safety-first                    (an egress verification drill completes)
 * - maintenance-master              (service on a machine with no active breakdown)
 * - first-preference / boundary-setter / collaborative-spirit / vote-participant
 *                                   (responses recorded against AI decisions)
 *
 * Achievements with no live signal carry `tracked: false` and are hidden by
 * the panel rather than shown as unreachable goals.
 *
 * Also watches the achievements store itself and fires a success toast +
 * celebration whenever ANY achievement unlocks.
 *
 * Tracking is reference-counted: every mount shares one set of subscriptions,
 * so mounting the tracker in more than one place never doubles a toast or a
 * progress increment.
 */

import { useEffect } from 'react';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useUIStore } from '../stores/uiStore';
import type { AIDecision } from '../types';

/** Polling cadence for aggregate checks (full-capacity and safety streaks). */
const POLL_INTERVAL_MS = 5000;

/**
 * Adds `delta` to an achievement's CURRENT progress. Counting from the store
 * rather than a local tally keeps "Reset all achievements" honest.
 */
const addProgress = (achievementId: string, delta: number): void => {
  if (delta <= 0) return;
  const store = useAchievementsStore.getState();
  const achievement = store.getAchievement(achievementId);
  if (!achievement || achievement.unlocked) return;
  store.updateAchievementProgress(achievementId, achievement.progress + delta);
};

/** A response a person made, as opposed to the engine's own auto-execution. */
const humanDisposition = (decision: AIDecision) => {
  const disposition = decision.response?.disposition;
  return disposition && disposition !== 'automatic' ? disposition : null;
};

const startTracking = (): (() => void) => {
  const cleanups: Array<() => void> = [];

  // --- Unlock notifications (toast + celebration) for ALL achievements ------
  const announcedUnlocks = new Set(
    useAchievementsStore
      .getState()
      .achievements.filter((a) => a.unlocked)
      .map((a) => a.id)
  );
  cleanups.push(
    useAchievementsStore.subscribe(
      (state) => state.achievements,
      (achievements) => {
        achievements.forEach((a) => {
          if (!a.unlocked) {
            // Forget it after a reset so a re-earned unlock toasts again.
            announcedUnlocks.delete(a.id);
            return;
          }
          if (announcedUnlocks.has(a.id)) return;
          announcedUnlocks.add(a.id);

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
    )
  );

  // --- Production milestones (first-bag / century / thousand) ---------------
  const applyBagProgress = (total: number) => {
    if (!Number.isFinite(total) || total <= 0) return;
    const store = useAchievementsStore.getState();
    store.updateAchievementProgress('first-bag', total);
    store.updateAchievementProgress('century', total);
    store.updateAchievementProgress('thousand', total);
  };
  applyBagProgress(useProductionStore.getState().totalBagsProduced);
  cleanups.push(useProductionStore.subscribe((state) => state.totalBagsProduced, applyBagProgress));

  // --- safety-first: an egress verification drill runs to completion --------
  cleanups.push(
    useGameSimulationStore.subscribe((state, previous) => {
      if (state.drillMetrics.verificationComplete && !previous.drillMetrics.verificationComplete) {
        useAchievementsStore.getState().unlockAchievement('safety-first');
      }
    })
  );

  // --- maintenance-master: preventive service ---------------------------------
  // performMaintenance is the only writer of lastMaintenance. The post-breakdown
  // restart also calls it, but its breakdown is still active at that moment, so
  // only service on a machine with no active breakdown counts as preventive.
  const lastServiceById = new Map(
    useProductionStore.getState().machines.map((m) => [m.id, m.lastMaintenance])
  );
  cleanups.push(
    useProductionStore.subscribe(
      (state) => state.machines,
      (machines) => {
        let preventive = 0;
        for (const machine of machines) {
          const seen = lastServiceById.get(machine.id);
          if (seen === machine.lastMaintenance) continue;
          lastServiceById.set(machine.id, machine.lastMaintenance);
          if (seen === undefined) continue; // first sighting, not a service
          const brokenDown = useBreakdownStore
            .getState()
            .activeBreakdowns.some((breakdown) => breakdown.machineId === machine.id);
          if (!brokenDown) preventive += 1;
        }
        addProgress('maintenance-master', preventive);
      }
    )
  );

  // --- Decision responses (bilateral achievements) ---------------------------
  // Count each decision id once. Ids persist here after the decision is evicted
  // from the bounded aiDecisions list, so eviction cannot recount it.
  const respondedDecisionIds = new Set(
    useProductionStore
      .getState()
      .aiDecisions.filter((decision) => humanDisposition(decision) !== null)
      .map((decision) => decision.id)
  );
  cleanups.push(
    useProductionStore.subscribe(
      (state) => state.aiDecisions,
      (decisions) => {
        for (const decision of decisions) {
          const disposition = humanDisposition(decision);
          if (!disposition || respondedDecisionIds.has(decision.id)) continue;
          respondedDecisionIds.add(decision.id);
          addProgress('first-preference', 1);
          addProgress('vote-participant', 1);
          if (disposition === 'rejected') addProgress('boundary-setter', 1);
          if (disposition === 'accepted' || disposition === 'modified') {
            addProgress('collaborative-spirit', 1);
          }
        }
      }
    )
  );

  // --- Polled aggregates: zero-incidents and full-capacity -------------------
  // Game-hours elapsed without a safety incident (for zero-incidents)
  let incidentFreeHours = 0;
  let lastGameTime: number | null = null;
  // Newest incident id, not the count: the list is capped at 50 and can be
  // cleared, so a count stops rising while incidents keep happening.
  let lastIncidentId: string | null | undefined = undefined;

  const intervalId = setInterval(() => {
    const achievements = useAchievementsStore.getState();

    // zero-incidents: accumulate game hours without a new safety incident
    const gameTime = useGameSimulationStore.getState().gameTime;
    const newestIncidentId = useSafetyStore.getState().safetyIncidents[0]?.id ?? null;

    if (
      lastIncidentId !== undefined &&
      newestIncidentId !== null &&
      newestIncidentId !== lastIncidentId
    ) {
      // New incident - reset the streak
      incidentFreeHours = 0;
      achievements.updateAchievementProgress('zero-incidents', 0);
    }
    lastIncidentId = newestIncidentId;

    if (lastGameTime !== null) {
      let deltaHours = gameTime - lastGameTime;
      if (deltaHours < 0) deltaHours += 24; // gameTime wraps at midnight
      if (Number.isFinite(deltaHours) && deltaHours > 0 && deltaHours < 24) {
        incidentFreeHours += deltaHours;
        achievements.updateAchievementProgress('zero-incidents', Math.floor(incidentFreeHours));
      }
    }
    lastGameTime = gameTime;

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
  }, POLL_INTERVAL_MS);
  cleanups.push(() => clearInterval(intervalId));

  return () => cleanups.forEach((cleanup) => cleanup());
};

let trackerMounts = 0;
let stopTracking: (() => void) | null = null;

export const useAchievementTracker = (): void => {
  useEffect(() => {
    trackerMounts += 1;
    if (trackerMounts === 1) stopTracking = startTracking();
    return () => {
      trackerMounts -= 1;
      if (trackerMounts === 0) {
        stopTracking?.();
        stopTracking = null;
      }
    };
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
