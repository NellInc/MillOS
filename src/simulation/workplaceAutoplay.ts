import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from '../stores/storage';
import {
  registerAutomaticWorkplaceInterrupt,
  isAutomaticWorkplaceStep,
  withAutomaticWorkplaceStep,
} from './workplaceParticipation';
import { peekSCADAService } from '../scada/SCADAService';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { isWorkplaceReplayActive } from './workplaceReplayRuntime';
import { CAMPAIGN_PRESSURES, WORKPLACE_CHECKS, requiredChecks } from './workplaceCampaign';
import type { WorkplaceProfile, WorkplaceTransitionResult } from '../types/workplace';

/** Explicit synthetic solo demonstration, using the supported game actions.
 * Working if facilitated turns, replay and pilot preparation never receive
 * automatic ballots, disclosure, authority or artificial output from this path.
 */
export function autoplayWorkplaceStep(profile: WorkplaceProfile): WorkplaceTransitionResult {
  const store = useWorkplaceStore.getState();
  const s = store.workplace;
  const blocked = (reason: string) => ({ changed: false, reason });
  if (store.participationMode !== 'solo' || isWorkplaceReplayActive() || s.mode !== 'game')
    return blocked(
      'Automatic role decisions are available only in synthetic solo Game mode, outside replay.'
    );
  const safety = useGameSimulationStore.getState();
  const controlMode = peekSCADAService()?.getState().mode;
  if (
    safety.emergencyActive ||
    safety.emergencyDrillMode ||
    (controlMode !== undefined && controlMode !== 'simulation')
  )
    return blocked('The safety or control-mode boundary holds the automatic demonstration.');
  if (s.phase === 'idle') return store.startMission(profile, s.seed);
  if (!s.campaign || s.improvement)
    return blocked(
      'Automatic season demonstration needs its own cooperative campaign. Existing handoff decisions remain manual.'
    );
  if (s.objections.some((o) => o.status === 'open'))
    return blocked(
      'An open objection remains with its original raiser. Automatic demonstration paused.'
    );
  const c = s.campaign;
  if (s.phase === 'deliberating') {
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
    if (result.changed) useGameSimulationStore.getState().setGameSpeed(30);
    return result;
  }
  if (s.phase === 'active') {
    if (c.shift === 1 && s.minute >= 25 && c.decision === null)
      return store.campaignDecision('inspect', 'quality');
    return { changed: false, reason: null }; // Actual plant tick owns time and dispatch.
  }
  if (s.members.some((m) => m.recoveryOwedMinutes > 0)) return { changed: false, reason: null };
  if (c.shift < 2) return store.nextCampaignShift();
  return blocked(
    'Automatic three-shift season complete. Read the individual receipts and rehearse safe reload.'
  );
}

let demonstrationInterval: ReturnType<typeof setInterval> | null = null;
export const useWorkplaceAutoplay = create<{
  manual: boolean;
  running: boolean;
  message: string | null;
  start: (profile: WorkplaceProfile) => void;
  pause: (preserveClock?: boolean) => void;
}>()(
  persist(
    (set, get) => ({
      manual: false,
      running: false,
      message: null,
      start: (profile) => {
        if (get().running) return;
        if (useWorkplaceStore.getState().participationMode !== 'solo') {
          set({ message: 'Separate participant turns stay manual.' });
          return;
        }
        set({
          manual: true,
          running: true,
          message: 'Fictional solo role decisions are running. Pause whenever you want.',
        });
        demonstrationInterval = setInterval(() => {
          const result = withAutomaticWorkplaceStep(() => autoplayWorkplaceStep(profile));
          if (result.reason && !result.changed) {
            get().pause();
            set({ message: result.reason });
          }
        }, 400);
      },
      pause: (preserveClock = false) => {
        if (demonstrationInterval !== null) clearInterval(demonstrationInterval);
        demonstrationInterval = null;
        const wasRunning = get().running;
        set({
          running: false,
          manual: true,
          message: 'Automatic decisions paused. Your choices take priority.',
        });
        if (wasRunning && !preserveClock) useGameSimulationStore.getState().setGameSpeed(0);
      },
    }),
    {
      name: 'millos-workplace-demo-preference',
      version: 1,
      storage: safeJSONStorage,
      partialize: (state) => ({ manual: state.manual }),
      merge: (saved, current) => ({
        ...current,
        manual: !!(saved && typeof saved === 'object' && 'manual' in saved && saved.manual),
        running: false,
        message: null,
      }),
    }
  )
);

registerAutomaticWorkplaceInterrupt(() => {
  if (useWorkplaceAutoplay.getState().running) useWorkplaceAutoplay.getState().pause();
});
useGameSimulationStore.subscribe((current, previous) => {
  if (
    current.gameSpeed !== previous.gameSpeed &&
    useWorkplaceAutoplay.getState().running &&
    !isAutomaticWorkplaceStep()
  )
    // The human has already chosen the new pace. Stop automatic decisions
    // without replacing that choice, including the onboarding clock release.
    // Working if manual pace changes stop the runner and retain their speed.
    useWorkplaceAutoplay.getState().pause(true);
});
