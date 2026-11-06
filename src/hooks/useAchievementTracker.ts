/**
 * Achievement Tracker Hook
 *
 * Bridges live simulation stores to the achievements store. Subscribes to
 * production, equipment-safety, drill and decision state and drives
 * useAchievementsStore progress/unlocks for:
 *
 * - first-bag / century / thousand  (productionStore.totalBagsProduced, since the last Reset)
 * - zero-incidents                  (24 game hours without a blocked-route stop or near miss)
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
import { BAG_ACHIEVEMENT_IDS, useAchievementsStore } from '../stores/achievementsStore';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useUIStore } from '../stores/uiStore';
import type { AIDecision } from '../types';
import { translate } from '../i18n';
import { achievementTrackerMessages } from './useAchievementTracker.messages';
import { registerAlertCatalog } from '../i18n/alertCopy';

const ACHIEVEMENT_ALERT_CATALOG = 'achievementTracker';
registerAlertCatalog(ACHIEVEMENT_ALERT_CATALOG, achievementTrackerMessages);

/** Polling cadence for aggregate checks (full-capacity and safety streaks). */
const POLL_INTERVAL_MS = 5000;
/** Makes each unlock notice's id unique within a millisecond. */
let unlockSerial = 0;

/**
 * The incidents that break the zero-incidents streak: the same two lapses that
 * reset Days Safe (a blocked-route stop and a near miss). The operator's own
 * E-STOP and a crisis stop are logged as 'emergency' but are not lapses;
 * counting them taught the player that pressing the stop costs an achievement.
 */
const STREAK_BREAKING_INCIDENTS: ReadonlySet<string> = new Set(['stop', 'near_miss']);

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
            // The serial keeps two unlocks in one millisecond (a re-earn after a
            // reset) as two notices: the bell keeps one row per id.
            id: `achievement-${a.id}-${Date.now()}-${++unlockSerial}`,
            type: 'success',
            title: translate(achievementTrackerMessages, 'unlockedTitle'),
            message: translate(achievementTrackerMessages, 'unlockedMessage', {
              name: a.name,
              description: a.description,
            }),
            timestamp: new Date(),
            acknowledged: false,
            // Keyed so the bell follows a language switch (a restored session keeps it).
            copy: {
              catalog: ACHIEVEMENT_ALERT_CATALOG,
              title: 'unlockedTitle',
              message: 'unlockedNoticeMessage',
              params: { id: a.id },
            },
          });

          useGameSimulationStore.getState().triggerCelebration('milestone', {
            message: translate(achievementTrackerMessages, 'unlockedCelebration', { name: a.name }),
          });
        });
      }
    )
  );

  // --- Production milestones (first-bag / century / thousand) ---------------
  // Counted from each achievement's reset baseline, so a Reset does not hand
  // back every bag achievement on the next bag.
  const applyBagProgress = (total: number) => {
    if (!Number.isFinite(total) || total <= 0) return;
    const store = useAchievementsStore.getState();
    for (const id of BAG_ACHIEVEMENT_IDS) {
      const baseline = store.getAchievement(id)?.countedFromBags ?? 0;
      // A total below the baseline means the counter itself restarted.
      const sinceReset = total >= baseline ? total - baseline : total;
      if (sinceReset > 0) store.updateAchievementProgress(id, sinceReset);
    }
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
          // A replay checkpoint restores an OLDER record: time going back is
          // not a service. Working if a restore leaves the count unchanged.
          const servicedAt = Date.parse(machine.lastMaintenance);
          const seenAt = Date.parse(seen);
          if (Number.isFinite(servicedAt) && Number.isFinite(seenAt) && servicedAt <= seenAt) {
            continue;
          }
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
          // Only a replay checkpoint restore takes a person's answer away (a
          // lapsed deferral keeps its 'deferred'): the restored achievements no
          // longer hold it, so the next answer counts again.
          if (!disposition && !decision.response) respondedDecisionIds.delete(decision.id);
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
  // Game hours without a safety incident. Whole hours live in the achievement's
  // progress (restored by a reload, cleared by Reset), so only the fraction of
  // an hour not yet credited is kept here.
  let incidentFreeCarry = 0;
  // Absolute game hours (day x 24 + time). Read from the time of day alone, a
  // reset from 14:00 to 10:00 looked like a 20-hour wrap past midnight.
  let lastGameHours: number | null = null;
  // Newest incident id, not the count: the list is capped at 50 and can be
  // cleared, so a count stops rising while incidents keep happening.
  let lastIncidentId: string | null | undefined = undefined;
  // Its log time. When that incident is gone from the log (a replay checkpoint
  // restored an older one), only entries logged after it are new: the older
  // ones are already behind the streak the restore brought back.
  let lastIncidentAt = Number.NEGATIVE_INFINITY;

  const intervalId = setInterval(() => {
    const achievements = useAchievementsStore.getState();

    // zero-incidents: accumulate game hours without a new safety incident
    const { gameTime, gameDay } = useGameSimulationStore.getState();
    const gameHours = gameDay * 24 + gameTime;
    const incidents = useSafetyStore.getState().safetyIncidents;
    const newestIncidentId = incidents[0]?.id ?? null;
    // Every entry logged since the last poll (newest first), so an operator
    // stop logged after a near miss cannot hide it.
    const seenAt = incidents.findIndex((incident) => incident.id === lastIncidentId);
    const sinceLastPoll =
      lastIncidentId === undefined
        ? []
        : seenAt >= 0
          ? incidents.slice(0, seenAt)
          : incidents.filter((incident) => incident.timestamp > lastIncidentAt);

    // A plant-stopping crisis (a duct fire) logs an 'emergency' with its type;
    // it resets Days Safe, so it breaks the streak too.
    if (
      sinceLastPoll.some(
        (incident) => STREAK_BREAKING_INCIDENTS.has(incident.type) || Boolean(incident.crisisType)
      )
    ) {
      // New incident - reset the streak
      incidentFreeCarry = 0;
      achievements.updateAchievementProgress('zero-incidents', 0);
    }
    lastIncidentId = newestIncidentId;
    lastIncidentAt = incidents[0]?.timestamp ?? Number.NEGATIVE_INFINITY;

    if (lastGameHours !== null) {
      // A backwards step is a reset or restore, not elapsed time: re-baseline.
      const deltaHours = gameHours - lastGameHours;
      if (Number.isFinite(deltaHours) && deltaHours > 0 && deltaHours < 24) {
        incidentFreeCarry += deltaHours;
        const wholeHours = Math.floor(incidentFreeCarry);
        const streak = achievements.getAchievement('zero-incidents');
        if (wholeHours > 0 && streak && !streak.unlocked) {
          incidentFreeCarry -= wholeHours;
          achievements.updateAchievementProgress('zero-incidents', streak.progress + wholeHours);
        }
      }
    }
    lastGameHours = Number.isFinite(gameHours) ? gameHours : null;

    // full-capacity: all machines running at 90%+ load
    const machines = useProductionStore.getState().machines;
    if (machines.length > 0 && machines.every((m) => m.status === 'running')) {
      const minLoad = machines.reduce(
        (min, m) => Math.min(min, m.metrics?.load ?? 0),
        Number.POSITIVE_INFINITY
      );
      // Drawn as a bar toward 90: keep the best reading, so it never runs back.
      const best = achievements.getAchievement('full-capacity')?.progress ?? 0;
      if (Number.isFinite(minLoad) && Math.floor(minLoad) > best) {
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
