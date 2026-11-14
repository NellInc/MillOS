/**
 * Achievement Tracker Hook
 *
 * Bridges live simulation stores to the achievements store. Subscribes to
 * production, equipment-safety, drill and decision state and drives
 * useAchievementsStore progress/unlocks for:
 *
 * - first-bag / century / thousand  (productionStore.totalBagsProduced, since the last Reset)
 * - zero-incidents                  (24 game hours without a blocked-route stop or near miss)
 * - full-capacity                   (the line rate held while every machine runs clear)
 * - safety-first                    (an egress verification drill completes)
 * - maintenance-master              (service on a machine with no active breakdown)
 * - first-preference / boundary-setter / collaborative-spirit
 *                                   (answers recorded against AI decisions)
 * - vote-participant                (decisions deferred for another look)
 * - first-on-time-delivery / first-a-shift / first-programme / first-challenge
 *                                   (operationsCampaignStore: an order fulfilled by its
 *                                   due time, an A report, a programme accepted, a
 *                                   recovery challenge completed)
 * - first-hold-resolved             (qcLabStore: a contamination alert settled)
 * - first-season                    (workplaceStore: a season reaches its final review)
 * - charter-signed                  (chronicleStore: a charter signed)
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
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useQCLabStore } from '../stores/qcLabStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { useChronicleStore } from '../stores/chronicleStore';
import type { AIDecision } from '../types';
import type { WorkplaceState } from '../types/workplace';
import { translate } from '../i18n';
import { achievementTrackerMessages } from './useAchievementTracker.messages';
import { registerAlertCatalog } from '../i18n/alertCopy';

const ACHIEVEMENT_ALERT_CATALOG = 'achievementTracker';
registerAlertCatalog(ACHIEVEMENT_ALERT_CATALOG, achievementTrackerMessages);

/**
 * Campaign state that moved backwards, or jumped further than a tick ever
 * moves the plant clock, was replaced (a reset, a checkpoint restore or its
 * rollback), and is not an event.
 */
const MAX_EVENT_STEP_MINUTES = 60;
/** The shift review's on-time rule (describeOrderOutcome). */
const ON_TIME_EPSILON_MINUTES = 1e-6;

/**
 * The entries `next` appended after the newest entry of `previous`, by id.
 * A list that no longer holds that entry was replaced rather than appended to,
 * and yields nothing. Read by id, never by length: these lists are capped.
 */
const appendedSince = <T extends { id: string }>(
  previous: readonly T[],
  next: readonly T[]
): readonly T[] => {
  if (next === previous) return [];
  const last = previous.at(-1);
  if (!last) return next;
  const at = next.findIndex((entry) => entry.id === last.id);
  return at < 0 ? [] : next.slice(at + 1);
};

/** A season's final review: its third shift has ended (the archive's own test). */
const atFinalReview = (workplace: WorkplaceState): boolean =>
  workplace.mode === 'game' &&
  workplace.phase === 'review' &&
  workplace.campaign?.shift === 2 &&
  workplace.campaign.history.length === 2;

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
  // An answer (accept, modify, reject) counts toward first-preference,
  // boundary-setter and collaborative-spirit; a deferral, a decision held back
  // for another look, toward vote-participant (Decision Review). They counted
  // the same response once (report 09 D4). Each decision counts once per kind,
  // so a deferred card answered on its return counts both. Ids persist here
  // after the decision is evicted from the bounded aiDecisions list, so
  // eviction cannot recount it.
  const countedResponses = new Map<string, Set<'deferred' | 'answered'>>();
  for (const decision of useProductionStore.getState().aiDecisions) {
    const disposition = humanDisposition(decision);
    if (!disposition) continue;
    countedResponses.set(
      decision.id,
      new Set(disposition === 'deferred' ? ['deferred'] : ['deferred', 'answered'])
    );
  }
  cleanups.push(
    useProductionStore.subscribe(
      (state) => state.aiDecisions,
      (decisions) => {
        for (const decision of decisions) {
          // Only a replay checkpoint restore takes a person's response away (a
          // lapsed deferral keeps its 'deferred'): the restored achievements no
          // longer hold it, so the next response counts again.
          if (!decision.response) {
            countedResponses.delete(decision.id);
            continue;
          }
          const disposition = humanDisposition(decision);
          if (!disposition) continue;
          const counted = countedResponses.get(decision.id) ?? new Set();
          countedResponses.set(decision.id, counted);
          if (disposition === 'deferred') {
            // Restored back to its deferral: the answer it had is gone with it.
            counted.delete('answered');
            if (counted.has('deferred')) continue;
            counted.add('deferred');
            addProgress('vote-participant', 1);
            continue;
          }
          if (counted.has('answered')) continue;
          counted.add('answered');
          addProgress('first-preference', 1);
          if (disposition === 'rejected') addProgress('boundary-setter', 1);
          if (disposition === 'accepted' || disposition === 'modified') {
            addProgress('collaborative-spirit', 1);
          }
        }
      }
    )
  );

  // --- The game's own milestones (plan 2.3) ----------------------------------
  // Each unlocks on its event as its store records it, never on a count that
  // something else also moves. A state that was already true when tracking
  // began, or that arrives by a wholesale replace, earns nothing.
  const unlock = (id: string) => useAchievementsStore.getState().unlockAchievement(id);
  cleanups.push(
    useOperationsCampaignStore.subscribe((state, previous) => {
      const advanced = state.elapsedMinutes - previous.elapsedMinutes;
      if (!(advanced >= 0 && advanced <= MAX_EVENT_STEP_MINUTES)) return;
      if (state.orders !== previous.orders) {
        const before = new Map(previous.orders.map((order) => [order.id, order.status]));
        const onTime = state.orders.some(
          (order) =>
            order.status === 'fulfilled' &&
            before.has(order.id) &&
            before.get(order.id) !== 'fulfilled' &&
            order.completedAtMinute !== null &&
            order.completedAtMinute <= order.dueAtMinute + ON_TIME_EPSILON_MINUTES
        );
        if (onTime) unlock('first-on-time-delivery');
      }
      if (appendedSince(previous.reports, state.reports).some((report) => report.grade === 'A'))
        unlock('first-a-shift');
      if (
        appendedSince(previous.challengeHistory, state.challengeHistory).some(
          (run) => run.status === 'completed'
        )
      )
        unlock('first-challenge');
      // The player's own acceptance only: the partner (logged as the
      // controller) and an agent also take programmes since wave 3d.
      if (
        appendedSince(previous.logbook, state.logbook).some(
          (entry) => entry.wording?.key === 'logProgrammeAccepted' && entry.actor === 'operator'
        )
      )
        unlock('first-programme');
    })
  );
  // A hold is settled when its investigation closes (release or recall).
  cleanups.push(
    useQCLabStore.subscribe((state, previous) => {
      const alerts = state.qcLab.contaminationAlerts;
      const before = previous.qcLab.contaminationAlerts;
      if (alerts === before) return;
      const open = new Set(before.filter((alert) => !alert.resolved).map((alert) => alert.id));
      if (alerts.some((alert) => alert.resolved && open.has(alert.id)))
        unlock('first-hold-resolved');
    })
  );
  // Run or taken over, a season is through when its third shift ends; archiving
  // the review afterwards is bookkeeping. The same season (seed) must have been
  // in that shift, so a replaced workplace earns nothing.
  cleanups.push(
    useWorkplaceStore.subscribe((state, previous) => {
      const next = state.workplace;
      const before = previous.workplace;
      if (
        next !== before &&
        next.seed === before.seed &&
        before.campaign?.shift === 2 &&
        !atFinalReview(before) &&
        atFinalReview(next)
      )
        unlock('first-season');
    })
  );
  cleanups.push(
    useChronicleStore.subscribe((state, previous) => {
      if (state.chronicle.status === 'active' && previous.chronicle.status !== 'active')
        unlock('charter-signed');
    })
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

    // full-capacity: the line rate (percent) held while every machine runs
    // clear, none in warning. It read the least-loaded unit once, which a
    // session at its 80 % boot rate never brought past 72.
    const { machines, productionSpeed } = useProductionStore.getState();
    if (machines.length > 0 && machines.every((m) => m.status === 'running')) {
      const ratePercent = Math.round(productionSpeed * 100);
      // Drawn as a bar toward its mark: keep the best reading, so it never runs back.
      const best = achievements.getAchievement('full-capacity')?.progress ?? 0;
      if (Number.isFinite(ratePercent) && ratePercent > best) {
        achievements.updateAchievementProgress('full-capacity', ratePercent);
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
