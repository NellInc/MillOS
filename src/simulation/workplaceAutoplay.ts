import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from '../stores/storage';
import {
  registerAutomaticWorkplaceInterrupt,
  withAutomaticWorkplaceStep,
} from './workplaceParticipation';
import { peekSCADAService } from '../scada/SCADAService';
import { useWorkplaceStore, workplaceReasonText } from '../stores/workplaceStore';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { selectClockHolder, useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { isWorkplaceReplayActive } from './workplaceReplayRuntime';
import {
  CAMPAIGN_PRESSURES,
  WORKPLACE_CHECKS,
  requiredChecks,
  shiftResumable,
} from './workplaceCampaign';
import type {
  WorkplaceProfile,
  WorkplaceReasonCopy,
  WorkplaceTransitionResult,
} from '../types/workplace';
import { defineMessages, translate } from '../i18n';
import { workplaceAutoplayMessages as msg } from './workplaceAutoplay.messages';

export type WorkplaceAutoplayMessageKey = keyof typeof msg.en;

// Bell notices are keyed (alertText), so they read in the language active now.
// A stop names its reason, the runner's own or a workplace refusal, and then
// where to restart; both are resolved when the bell renders.
// Working if a held or stopped notice filed in English reads in Portuguese.
const AUTOPLAY_ALERTS = 'workplaceAutoplay';
const AUTOPLAY_STOP_ALERTS = 'workplaceAutoplayStop';
// A workplace reason's own params ride beside as `p.<name>` (an activation
// refused on readiness carries its reason keys that way).
type StopParams = { source: string; key: string; hint: number } & Record<string, string | number>;
const REASON_PARAM = 'p.';
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
  return !reason ? '' : hint ? `${reason} ${translate(msg, stopHintKey(hint))}` : reason;
};
/** Where to go after a stop: 1 runs it again, 2 changes the agreement or leaves; 0 says nothing. */
const stopHintKey = (hint: number): WorkplaceAutoplayMessageKey =>
  hint === 2 ? 'readinessHint' : 'restartHint';
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

/** An E-stop or a drill: transient, so a running season waits it out. */
const safetyStopActive = () => {
  const safety = useGameSimulationStore.getState();
  return safety.emergencyActive || safety.emergencyDrillMode;
};

/** Explicit synthetic solo demonstration, using the supported game actions.
 * Working if facilitated turns, replay and pilot preparation never receive
 * automatic ballots, disclosure, authority or artificial output from this path.
 */
export function autoplayWorkplaceStep(profile: WorkplaceProfile): WorkplaceAutoplayStepResult {
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
  // A shift a reload paused resumes first, before any sobras or a next shift:
  // its fictional members then consent afresh through the steps below.
  // Working if a reload mid-season still lets the default season be honoured.
  if (shiftResumable(s)) return store.resumeShift(s.revision);
  if (s.objections.some((o) => o.status === 'open')) return blocked('openObjection');
  const c = s.campaign;
  if (s.phase === 'deliberating') {
    // A commitment whose evidence went bad (a failed load, a cancelled order, a
    // plant reset) refuses every later approval; say so, rather than walking
    // the roles through consent to a refusal. Working if the stop names it.
    if (c.mission && c.mission.evidence !== 'current') return blocked('missionEvidence');
    const pressure = CAMPAIGN_PRESSURES[c.shift];
    if (!s.events.some((e) => e.kind === 'pressure-protected'))
      return store.respondToPressure(pressure.id, 'protect-boundary');
    if (c.shift !== 1 && c.decision === null)
      return store.campaignDecision(
        c.shift === 0 ? 'renegotiate' : 'protect-refusal',
        'coordinator'
      );
    if (s.planId !== 'cover' && !s.members.some((m) => m.understood))
      return store.selectPlan('cover');
    // Optional fictional sharing is demonstrated once, then revoked. No reason
    // enters the public receipt, and the qualified Quality role never shares.
    const privacy = s.events.filter((e) => e.kind === 'privacy-consent' && e.actorId === 'packing');
    if (c.shift === 0 && privacy.length < 2)
      return store.sharePreference('packing', privacy.length === 0);
    for (const actor of [...s.members.map((m) => m.id), 'mind']) {
      for (const id of requiredChecks(actor)) {
        const q = WORKPLACE_CHECKS.find((q) => q.id === id)!;
        if (c.checks[actor]?.[id] !== q.correct) return store.answerCheck(actor, id, q.correct);
      }
      const m = s.members.find((m) => m.id === actor);
      if (!m) continue;
      if (!m.understood) return store.understand(actor);
      if (m.ballot === null) return store.vote(actor, true);
      if (m.coverConsent === null)
        return store.consentToCover(
          actor,
          actor === 'maintenance' || (actor === 'packing' && c.shift !== 2)
        );
    }
    const result = store.activate(s.revision);
    // Release only a workplace hold. A pause the player made stays theirs.
    if (result.changed) useGameSimulationStore.getState().releaseClock('workplace');
    return result;
  }
  if (s.phase === 'active') {
    if (c.shift === 1 && s.minute >= 25 && c.decision === null)
      return store.campaignDecision('inspect', 'quality');
    return { changed: false, reason: null }; // Actual plant tick owns time and dispatch.
  }
  if (s.members.some((m) => m.recoveryOwedMinutes > 0)) return { changed: false, reason: null };
  // Sobras: once a reviewed shift owes nothing, the fictional members vote to
  // share a positive surplus among themselves, then the allocation runs.
  // Working if the default season shows a real rateio whenever it earned one.
  const f = s.finance;
  const surplus =
    f.operatingRevenue - f.operatingCost - f.wagesPaid - f.compensationPaid - f.improvementSpend;
  if (
    s.practices.includes('gainsharing') &&
    !s.distributionComplete &&
    surplus > 1e-8 &&
    f.cash > 1e-8 &&
    f.wageReserve === 0 &&
    f.compensationReserve === 0
  ) {
    const voter = s.members.find((m) => s.surplusBallots[m.id] !== 'members');
    return voter ? store.voteSurplus(voter.id, 'members') : store.distributeSurplus();
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
            });
            // Nothing else restarts a stopped season, so say where to; but not
            // where running it again would stop the same way (no season of its
            // own to run: a standalone exercise or a handoff is on the table),
            // nor where its commitment is bound to a material session a plant
            // reset has replaced, which refuses every approval for good. Where
            // activation refused on readiness (unpaid wages) the runner had
            // already walked every consent step, so a rerun stops the same way:
            // that notice names the player's own ways on instead.
            const hint =
              result.reasonCopy?.catalog === 'engine' &&
              result.reasonCopy.key === 'readinessRefused'
                ? 2
                : result.reasonKey === 'seasonComplete' ||
                    result.reasonKey === 'needsCampaign' ||
                    result.reasonKey === 'missionEvidence' ||
                    (result.reasonCopy?.catalog === 'store' &&
                      result.reasonCopy.key === 'materialSessionChanged')
                  ? 0
                  : 1;
            const reason = hint
              ? `${result.reason} ${translate(msg, stopHintKey(hint))}`
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
