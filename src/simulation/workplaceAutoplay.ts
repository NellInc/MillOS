import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from '../stores/storage';
import {
  registerAutomaticWorkplaceInterrupt,
  withAutomaticWorkplaceStep,
} from './workplaceParticipation';
import { peekSCADAService } from '../scada/SCADAService';
import {
  firstDeliveryFulfilled,
  useWorkplaceStore,
  workplaceReasonText,
} from '../stores/workplaceStore';
import { registerAlertCatalog } from '../i18n/alertCopy';
import {
  selectClockHolder,
  selectRestartPending,
  useGameSimulationStore,
} from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { isWorkplaceReplayActive } from './workplaceReplayRuntime';
import {
  WORKPLACE_CHECKS,
  campaignPressure,
  qualifiedToCover,
  requiredChecks,
  seasonEnded,
  seasonSobrasPool,
  shiftAbsentee,
  shiftResumable,
} from './workplaceCampaign';
import { authoredResponse, prospectiveCover } from './bilateralWorkplace';
import type {
  SurplusDestination,
  WorkplacePlanId,
  WorkplaceProfile,
  WorkplaceReasonCopy,
  WorkplaceTransitionResult,
} from '../types/workplace';
import { defineMessages, translate } from '../i18n';
import { workplaceAutoplayMessages as msg } from './workplaceAutoplay.messages';

export type WorkplaceAutoplayMessageKey = keyof typeof msg.en;

// Bell notices are keyed (alertText), so they read in the language active now.
// A stop names its reason, the runner's own or a workplace refusal, resolved
// when the bell renders. D14: it no longer says where to restart the demo (its
// control sits beside the reason in Autonomy). An activation refused on
// readiness is a refusal whose ways on are behind the closed facilitator
// tools, so that refusal keeps them (`hint` 2); a notice saved with `hint` 1,
// the cut restart line, reads its reason alone.
// Working if a held or stopped notice filed in English reads in Portuguese.
const AUTOPLAY_ALERTS = 'workplaceAutoplay';
const AUTOPLAY_STOP_ALERTS = 'workplaceAutoplayStop';
// A workplace reason's own params ride beside as `p.<name>` (an activation
// refused on readiness carries its reason keys that way).
type StopParams = { source: string; key: string; hint: number } & Record<string, string | number>;
const REASON_PARAM = 'p.';
const READINESS_WAY_OUT = 2;
const stopMessage = ({ source, key, hint, ...rest }: StopParams) => {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(rest))
    if (name.startsWith(REASON_PARAM)) params[name.slice(REASON_PARAM.length)] = value;
  const reason =
    source === 'autoplay'
      ? Object.prototype.hasOwnProperty.call(msg.en, key)
        ? translate(msg, key as WorkplaceAutoplayMessageKey)
        : ''
      : (workplaceReasonText({
          reason: '',
          reasonCopy: {
            catalog: source as WorkplaceReasonCopy['catalog'],
            key,
            ...(Object.keys(params).length > 0 ? { params } : {}),
          },
        }) ?? '');
  // An unknown reason resolves empty, so the bell keeps the stored text.
  return reason && hint === READINESS_WAY_OUT
    ? `${reason} ${translate(msg, 'readinessRefusedWayOut')}`
    : reason;
};
const stopTitle = () => translate(msg, 'stoppedTitle');
const stopAlertMessages = defineMessages({
  en: { title: stopTitle, stopped: stopMessage },
  'pt-BR': { title: stopTitle, stopped: stopMessage },
});
registerAlertCatalog(AUTOPLAY_ALERTS, msg);
registerAlertCatalog(AUTOPLAY_STOP_ALERTS, stopAlertMessages);
/** A step's result; `reasonKey` names this module's own reason so it can be shown in any language. */
export type WorkplaceAutoplayStepResult = WorkplaceTransitionResult & {
  reasonKey?: WorkplaceAutoplayMessageKey;
};

/**
 * An E-stop or a drill, and the idle line after CLEAR until RESTART LINE:
 * transient, so a running season waits it out and resumes with the line.
 */
const safetyStopActive = () => {
  const safety = useGameSimulationStore.getState();
  return safety.emergencyActive || safety.emergencyDrillMode || selectRestartPending(safety);
};

/** Explicit synthetic solo demonstration, using the supported game actions.
 * Working if facilitated turns, replay and pilot preparation never receive
 * automatic ballots, disclosure, authority or artificial output from this path.
 */
export function autoplayWorkplaceStep(
  profile: WorkplaceProfile,
  /**
   * Review 2: a headless run may choose Packing's plan and sobras ballot, so
   * a resequenced season and the other destinations are played to their end.
   * The default runner is unchanged (cover or steady; the members).
   */
  choices: { plan?: WorkplacePlanId; sobras?: SurplusDestination } = {}
): WorkplaceAutoplayStepResult {
  const store = useWorkplaceStore.getState();
  const s = store.workplace;
  const blocked = (reasonKey: WorkplaceAutoplayMessageKey) => ({
    changed: false,
    reason: translate(msg, reasonKey),
    reasonKey,
  });
  if (store.participationMode !== 'solo' || isWorkplaceReplayActive() || s.mode !== 'game')
    return blocked('soloOnly');
  const controlMode = peekSCADAService()?.getState().mode;
  if (safetyStopActive() || (controlMode !== undefined && controlMode !== 'simulation'))
    return blocked('safetyBoundary');
  if (s.phase === 'idle') return store.startMission(profile, s.seed);
  if (!s.campaign || s.improvement) return blocked('needsCampaign');
  // A shift a reload, a safety stop or a resolved objection paused resumes
  // first, before any sobras or a next shift: its fictional members then
  // consent afresh through the steps below. Working if a reload or a drill
  // mid-season still lets the default season be honoured.
  if (shiftResumable(s)) return store.resumeShift(s.revision);
  if (s.objections.some((o) => o.status === 'open')) return blocked('openObjection');
  const c = s.campaign;
  if (s.phase === 'deliberating') {
    // A commitment whose evidence went bad (a failed load, a cancelled order, a
    // plant reset) refuses every later approval; say so, rather than walking
    // the roles through consent to a refusal. Working if the stop names it.
    if (c.mission && c.mission.evidence !== 'current') return blocked('missionEvidence');
    const pressure = campaignPressure(s);
    if (pressure && !s.events.some((e) => e.kind === 'pressure-protected'))
      return store.respondToPressure(pressure.id, 'protect-boundary');
    // The Coordinator's Friday and Thursday calls are its own (5b): the store
    // makes them as each shift opens.
    // The runner plays Packing (D5), which offers cover except on Thursday.
    // Cover is asked for only when someone would give it: the authored roles
    // answer from their values, and a member who has covered this season, or
    // the one the season's draw says will not, declines.
    // Review 2: cover only where it does something: on the shift someone is
    // away, when the one who would cover can do that work (an absent
    // Quality's release needs a qualified member); steady otherwise.
    const asCover = { ...s, planId: 'cover' as const };
    const away = shiftAbsentee(s);
    const coverer = away ? prospectiveCover(asCover) : undefined;
    const coverOffered =
      !!coverer &&
      qualifiedToCover(coverer, away) &&
      (coverer.id !== 'packing' || c.shift !== 2) &&
      (coverer.id === 'packing' || authoredResponse(asCover, coverer.id).cover === true);
    const plan = choices.plan ?? (coverOffered ? 'cover' : 'steady');
    if (s.planId !== plan && !s.members.some((m) => m.understood)) return store.selectPlan(plan);
    // Optional fictional sharing is demonstrated once, then revoked. No reason
    // enters the public receipt, and the qualified Quality role never shares.
    const privacy = s.events.filter((e) => e.kind === 'privacy-consent' && e.actorId === 'packing');
    if (c.shift === 0 && privacy.length < 2)
      return store.sharePreference('packing', privacy.length === 0);
    for (const actor of ['packing', 'mind']) {
      for (const id of requiredChecks(actor)) {
        const q = WORKPLACE_CHECKS.find((q) => q.id === id)!;
        if (c.checks[actor]?.[id] !== q.correct) return store.answerCheck(actor, id, q.correct);
      }
      const m = s.members.find((m) => m.id === actor);
      if (!m) continue;
      if (!m.understood) return store.understand(actor);
      if (m.ballot === null) return store.vote(actor, true);
      if (m.coverConsent === null && s.planId === 'cover')
        return store.consentToCover(actor, c.shift !== 2);
    }
    // The other roles answer for themselves, from their values (5.3).
    if (s.members.some((m) => m.id !== 'packing' && (!m.understood || m.ballot === null)))
      return store.simulateResponses();
    const result = store.activate(s.revision);
    // Release only a workplace hold. A pause the player made stays theirs.
    if (result.changed) useGameSimulationStore.getState().releaseClock('workplace');
    return result;
  }
  // Quality starts Monday's inspection itself when the line holds (5b), and
  // the plant tick owns time and dispatch.
  if (s.phase === 'active') return { changed: false, reason: null };
  if (s.members.some((m) => m.recoveryOwedMinutes > 0)) return { changed: false, reason: null };
  // Sobras: once the season's last shift ends and owes nothing, Packing votes
  // to return the season's sobras to the members, after the statutory funds
  // (5.5); the Coordinator and Maintenance agree from their values, and the
  // settlement runs.
  // Working if the default season shows a real rateio whenever it earned one.
  const f = s.finance;
  if (
    s.practices.includes('gainsharing') &&
    !s.distributionComplete &&
    seasonEnded(s) &&
    seasonSobrasPool(s) > 1e-8 &&
    f.wageReserve === 0 &&
    f.compensationReserve === 0
  ) {
    // The runner casts Packing's ballot; the others vote from their values.
    const ballot = choices.sobras ?? 'members';
    return s.surplusBallots.packing !== ballot
      ? store.voteSurplus('packing', ballot)
      : store.distributeSurplus();
  }
  if (c.shift < 2) return store.nextCampaignShift();
  return blocked('seasonComplete');
}

let demonstrationInterval: ReturnType<typeof setInterval> | null = null;
let heldAlerts = 0;
let stoppedAlerts = 0;
const status = (messageKey: WorkplaceAutoplayMessageKey) => ({
  message: translate(msg, messageKey),
  messageKey,
  reasonCopy: null,
});
export const useWorkplaceAutoplay = create<{
  manual: boolean;
  running: boolean;
  /** The profile a running season resumes with after a reload; null once paused or taken over. */
  resumeProfile: WorkplaceProfile | null;
  /** The last status, resolved when set; shown only when `messageKey` is null. */
  message: string | null;
  /** This module's own status key, resolved at render so it follows the language. */
  messageKey: WorkplaceAutoplayMessageKey | null;
  /** A workplace refusal that stopped the runner, resolved at render (workplaceReasonText). */
  reasonCopy: WorkplaceReasonCopy | null;
  start: (profile: WorkplaceProfile) => void;
  /** Ends the runner and hands the season to the player; the plant keeps its pace. */
  pause: () => void;
}>()(
  persist(
    (set, get) => ({
      manual: false,
      running: false,
      resumeProfile: null,
      message: null,
      messageKey: null,
      reasonCopy: null,
      start: (profile) => {
        if (get().running) return;
        if (useWorkplaceStore.getState().participationMode !== 'solo') {
          set(status('separateTurnsManual'));
          return;
        }
        // A matched replay is never automated: its first step would stop, and
        // the stop notice would say to run it again, which stops the same way
        // until the replay ends. Say so here instead. Working if starting
        // during a replay files no bell notice and the status names why.
        if (isWorkplaceReplayActive()) {
          set(status('soloOnly'));
          return;
        }
        // D4: a new season arrives after the first delivery. Refused here,
        // before the runner is marked manual, so the default season is still
        // offered once that delivery is in. Working if pressing the control
        // during the first delivery starts nothing and says when it can.
        if (useWorkplaceStore.getState().workplace.phase === 'idle' && !firstDeliveryFulfilled()) {
          set(status('firstDeliveryFirst'));
          return;
        }
        set({
          manual: true,
          running: true,
          resumeProfile: profile,
          ...status('running'),
        });
        // An E-stop or drill holds the season instead of ending it: the
        // fictional roles change nothing while it lasts and carry on once it
        // clears, so Take over stays offered and the linked season can still
        // finish. Announced once per stop. Live SCADA control still stops it.
        // Working if a drill mid-season leaves the season running afterwards.
        let held = false;
        demonstrationInterval = setInterval(() => {
          if (safetyStopActive()) {
            if (held) return;
            held = true;
            set(status('safetyBoundary'));
            useUIStore.getState().addAlert({
              // Alerts are listed by id; two stops at one revision need two ids.
              id: `workplace-autoplay-held-${useWorkplaceStore.getState().workplace.revision}-${++heldAlerts}`,
              type: 'info',
              title: translate(msg, 'heldTitle'),
              message: translate(msg, 'safetyBoundary'),
              copy: { catalog: AUTOPLAY_ALERTS, title: 'heldTitle', message: 'safetyBoundary' },
              timestamp: new Date(),
              acknowledged: false,
            });
            return;
          }
          if (held) {
            held = false;
            set(status('running'));
          }
          // A pace is only a speed (src/simulation/pace.ts), so choosing one
          // never ends the season. Any hold that is not the season's own
          // (workplace, handoff) defers its steps: the fictional roles wait with
          // the plant and continue on resume. Live SCADA control is not deferred
          // here; the step itself stops at that safety boundary and says so.
          // Working if Take over stays offered at every pace and a P, tour,
          // restore or layout hold changes no workplace state until it ends.
          const holder = selectClockHolder(useGameSimulationStore.getState());
          if (
            holder !== null &&
            holder !== 'workplace' &&
            holder !== 'handoff' &&
            holder !== 'scada'
          )
            return;
          const result = withAutomaticWorkplaceStep(() => autoplayWorkplaceStep(profile));
          if (result.reason && !result.changed) {
            // Stopping by itself (season complete, a boundary, an objection)
            // never freezes the plant: the shift keeps its pace, and the reason
            // is announced where the player is looking, not only in the panel.
            // Working if the clock keeps running after a completed season and
            // the alert names what stopped and where to read it.
            get().pause();
            set({
              message: result.reason,
              messageKey: result.reasonKey ?? null,
              reasonCopy: result.reasonKey ? null : (result.reasonCopy ?? null),
              // 5.10: a season the runner finished itself is not a take-over:
              // once it is archived, the next season may arrive by itself
              // (after the first delivery, on an open order). Working if a
              // second default season starts with no player action but Archive.
              ...(result.reasonKey === 'seasonComplete' ? { manual: false } : {}),
            });
            // D14: the notice is the stop's reason; the demo's restart sits
            // beside the same reason in Autonomy. Where activation refused on
            // readiness (unpaid wages) the runner had already walked every
            // consent step, so a rerun stops the same way: that refusal names
            // the player's own ways on, which sit in the closed facilitator tools.
            const hint =
              result.reasonCopy?.catalog === 'engine' &&
              result.reasonCopy.key === 'readinessRefused'
                ? READINESS_WAY_OUT
                : 0;
            const reason = hint
              ? `${result.reason} ${translate(msg, 'readinessRefusedWayOut')}`
              : result.reason;
            // A reason with no key keeps its stored text.
            const reasonParams: Record<string, string | number> = {};
            for (const [name, value] of Object.entries(result.reasonCopy?.params ?? {}))
              reasonParams[`${REASON_PARAM}${name}`] = value;
            const source = result.reasonKey
              ? { source: 'autoplay', key: result.reasonKey }
              : result.reasonCopy
                ? { source: result.reasonCopy.catalog, key: result.reasonCopy.key, ...reasonParams }
                : null;
            useUIStore.getState().addAlert({
              // Listed by id: a restart that stops again at one revision needs its own.
              id: `workplace-autoplay-stopped-${useWorkplaceStore.getState().workplace.revision}-${++stoppedAlerts}`,
              type: 'info',
              title: translate(msg, 'stoppedTitle'),
              message: reason,
              ...(source
                ? {
                    copy: {
                      catalog: AUTOPLAY_STOP_ALERTS,
                      title: 'title',
                      message: 'stopped',
                      params: { ...source, hint },
                    },
                  }
                : {}),
              // The season's end is read once to a screen reader as it is
              // filed (never spoken on the PA); the debrief stays on screen.
              ...(result.reasonKey === 'seasonComplete' ? { announce: 'polite' as const } : {}),
              timestamp: new Date(),
              acknowledged: false,
            });
          }
        }, 400);
      },
      // Pausing, taking over and any manual workplace action are the player
      // taking the demonstration over: the runner stops and the plant keeps
      // its pace. Holds the workplace rules need (the derived handoff hold)
      // are kept by their own owners. Working if a manual choice mid-season
      // leaves the clock running at the pace it had.
      pause: () => {
        if (demonstrationInterval !== null) clearInterval(demonstrationInterval);
        demonstrationInterval = null;
        set({
          running: false,
          manual: true,
          resumeProfile: null,
          ...status('paused'),
        });
      },
    }),
    {
      name: 'millos-workplace-demo-preference',
      version: 1,
      storage: safeJSONStorage,
      // The runner itself never survives a reload; the season it was running
      // does. Working if a reload mid-season resumes autonomous decisions with
      // the same profile once startup is ready, and a taken-over season stays
      // the player's.
      partialize: (state) => ({ manual: state.manual, resumeProfile: state.resumeProfile }),
      merge: (saved, current) => {
        const record = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
        const profile = record.resumeProfile;
        return {
          ...current,
          manual: !!record.manual,
          running: false,
          resumeProfile:
            profile === 'toe-dip' || profile === 'team' || profile === 'cooperative'
              ? profile
              : null,
          message: null,
          messageKey: null,
          reasonCopy: null,
        };
      },
    }
  )
);

registerAutomaticWorkplaceInterrupt(() => {
  if (useWorkplaceAutoplay.getState().running) useWorkplaceAutoplay.getState().pause();
});
