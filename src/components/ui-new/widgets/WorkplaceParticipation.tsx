import { useEffect, useRef, useState } from 'react';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { isBenchmarkRuntime } from '../../../runtime/runtimeMode';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { turnChecks } from '../../../simulation/workplaceParticipation';
import {
  demonstrationBeats,
  fairnessReceipt,
  participationReceipt,
} from '../../../simulation/workplaceFairness';
import { MANAGEMENT_APPROACHES } from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile, WorkplaceTransitionResult } from '../../../types/workplace';
import { formatFixed, useT } from '../../../i18n';
import { workplaceParticipationMessages } from './WorkplaceParticipation.messages';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';
export function WorkplaceParticipation({
  report,
}: {
  report: (result: WorkplaceTransitionResult) => void;
}) {
  const t = useT(workplaceParticipationMessages);
  const store = useWorkplaceStore();
  const s = store.workplace;
  const [role, setRole] = useState('packing');
  const current = store.turn;
  const turnInstructions = useRef<HTMLParagraphElement>(null);
  const handover = useRef<HTMLSelectElement>(null);
  const checks = turnChecks(s);
  const completedChecks = checks.filter((q) => current?.answers[q.id] === q.correct).length;
  return (
    <section aria-label={t('regionLabel')} className="space-y-3 border-b border-slate-700 pb-4">
      <details open={store.participationMode === 'separate-turns'}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
          {t('ownershipPrefix')}{' '}
          {store.participationMode === 'solo'
            ? t('soloRolePlay')
            : current
              ? t('roleTurn', {
                  role: s.members.find((m) => m.id === current.actorId)?.role ?? t('adviser'),
                })
              : t('facilitatorHandover')}
        </summary>
        <p className="mb-3 text-slate-300">{t('rehearsalNotice')}</p>
        <label className="block">
          {t('interactionMode')}
          <select
            aria-label={t('interactionMode')}
            className={input}
            disabled={s.phase !== 'idle'}
            value={store.participationMode}
            onChange={(e) =>
              report(store.setParticipationMode(e.target.value as 'solo' | 'separate-turns'))
            }
          >
            <option value="solo">{t('optionSolo')}</option>
            <option value="separate-turns">{t('optionSeparate')}</option>
          </select>
        </label>
        {store.participationMode === 'separate-turns' && s.phase !== 'idle' && (
          <div className="mt-3 space-y-2">
            {current ? (
              <>
                <p
                  ref={turnInstructions}
                  tabIndex={-1}
                  className="font-medium text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  {t('turnOnly', {
                    role: s.members.find((m) => m.id === current.actorId)?.role ?? t('adviser'),
                  })}
                </p>
                {s.phase === 'deliberating' && (
                  <fieldset className="space-y-2">
                    <legend className="font-semibold text-white">{t('mandateChecksLegend')}</legend>
                    <p role="status" className="text-cyan-100">
                      {t('mandateChecksStatus', {
                        done: formatFixed(completedChecks, 0),
                        total: formatFixed(checks.length, 0),
                      })}
                    </p>
                    {checks.map((q) => (
                      <label key={q.id} className="block">
                        {q.prompt}
                        <select
                          className={input}
                          aria-label={t('turnCheckLabel', { id: q.id })}
                          aria-invalid={
                            current.answers[q.id] ? current.answers[q.id] !== q.correct : undefined
                          }
                          aria-describedby={
                            current.answers[q.id] ? `turn-answer-${q.id}` : undefined
                          }
                          value={current.answers[q.id] ?? ''}
                          onChange={(e) =>
                            report(store.answerTurnCheck(current.token, q.id, e.target.value))
                          }
                        >
                          <option value="" disabled>
                            {t('selectAnswer')}
                          </option>
                          {q.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {current.answers[q.id] && (
                          <span
                            id={`turn-answer-${q.id}`}
                            aria-live="polite"
                            className="mt-1 block whitespace-normal break-words text-slate-300"
                          >
                            {q.options.find((o) => o.value === current.answers[q.id])?.label}
                            <span
                              className={`mt-1 block ${current.answers[q.id] === q.correct ? 'text-cyan-100' : 'text-amber-100'}`}
                            >
                              <strong>
                                {current.answers[q.id] === q.correct
                                  ? t('matchesTerms')
                                  : t('needsAnotherLook')}
                              </strong>
                              {q.clarification}
                            </span>
                          </span>
                        )}
                      </label>
                    ))}
                  </fieldset>
                )}
                <button
                  className={button}
                  onClick={() => {
                    const result = store.endTurn();
                    report(result);
                    if (result.changed) requestAnimationFrame(() => handover.current?.focus());
                  }}
                >
                  {t('endTurn')}
                </button>
              </>
            ) : (
              <>
                <label className="block">
                  {t('handOver')}
                  <select
                    className={input}
                    aria-label={t('handOver')}
                    ref={handover}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {s.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.role}
                      </option>
                    ))}
                    <option value="mind">{t('adviser')}</option>
                  </select>
                </label>
                <button
                  className={button}
                  onClick={() => {
                    const result = store.startTurn(role);
                    report(result);
                    if (result.changed)
                      requestAnimationFrame(() => turnInstructions.current?.focus());
                  }}
                >
                  {t('beginTurn')}
                </button>
                <p className="text-slate-300">{t('handOverNote')}</p>
              </>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
export function WorkplaceSeasonEntry({
  profile,
  setProfile,
  report,
  onStart,
}: {
  profile: WorkplaceProfile;
  setProfile: (p: WorkplaceProfile) => void;
  report: (r: WorkplaceTransitionResult) => void;
  onStart: () => void;
}) {
  const t = useT(workplaceParticipationMessages);
  const store = useWorkplaceStore();
  if (store.workplace.phase !== 'idle') return null;
  return (
    <details className="space-y-3 border-t border-slate-700 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
        {t('seasonSummary')}
      </summary>
      <p>{t('seasonIntro')}</p>
      <label className="block">
        {t('seasonRoute')}
        <select
          aria-label={t('seasonRoute')}
          className={input}
          value={profile}
          onChange={(e) => setProfile(e.target.value as WorkplaceProfile)}
        >
          {MANAGEMENT_APPROACHES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      <p>
        {MANAGEMENT_APPROACHES.find((a) => a.id === profile)?.detail} {t('adoptionNote')}
      </p>
      <button
        className={button}
        onClick={() => {
          const r = store.startMission(profile, store.workplace.seed);
          report(r);
          if (r.changed) onStart();
        }}
      >
        {t('startSeason')}
      </button>
      <p className="text-slate-300">{t('seasonRequires')}</p>
    </details>
  );
}
export function WorkplaceFairness() {
  const t = useT(workplaceParticipationMessages);
  const store = useWorkplaceStore();
  const s = store.workplace;
  return (
    <details className="border-t border-slate-700 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
        {t('fairnessSummary')}
      </summary>
      <p className="mb-3">{t('fairnessIntro')}</p>
      {fairnessReceipt(s).map((r) => (
        <section
          key={r.id}
          aria-label={t('fairnessLabel', { role: r.role })}
          className="space-y-1 border-t border-slate-800 py-3"
        >
          <h5 className="font-semibold text-white">{r.role}</h5>
          <p>{t('qualifiedTasks', { tasks: r.qualifiedTasks.join(', '), task: r.currentTask })}</p>
          <p>
            {t('dutyLine', {
              duty:
                r.currentCoverConsent === null
                  ? t('dutyNoDecision')
                  : r.currentCoverConsent
                    ? t('dutyVolunteered')
                    : t('dutyDeclined'),
              extra: formatFixed(r.extraMinutes, 1),
              shifts: formatFixed(r.shiftsWithExtraDuty, 0),
              earlier: formatFixed(r.earlierExtraMinutes, 1),
            })}
          </p>
          <p className="tabular-nums">
            {t('payLine', {
              earned: formatFixed(r.earnedPayAndMemberDistributions, 2),
              paid: formatFixed(r.compensationPaid, 2),
              wages: formatFixed(r.wagesReserved, 2),
              reserved: formatFixed(r.compensationReserved, 2),
            })}
          </p>
          <p className="tabular-nums">
            {t('restLine', {
              rest: formatFixed(r.restMinutes, 1),
              recovery: formatFixed(r.recoveryDelivered, 1),
              owed: formatFixed(r.recoveryOwed, 1),
            })}
          </p>
          <p>
            {t('openObjections', {
              count: r.openObjections.length,
              formatted: formatFixed(r.openObjections.length, 0),
            })}{' '}
            {r.historicalObjectionDetail}
          </p>
          {r.openObjections.map((o, n) => (
            <p key={n} className="text-amber-100">
              {t('objectionKind', { kind: o.kind })}: {o.statement}
            </p>
          ))}
        </section>
      ))}
    </details>
  );
}
export function WorkplaceDemonstration({
  navigate,
  report,
}: {
  navigate: (section: 'Handoff' | 'Shift' | 'Agreement / Voices' | 'Review') => void;
  report: (r: WorkplaceTransitionResult) => void;
}) {
  const t = useT(workplaceParticipationMessages);
  const store = useWorkplaceStore();
  const [enabled, setEnabled] = useState(false);
  const beats = demonstrationBeats(store.workplace);
  return (
    <section aria-label={t('demoLabel')} className="space-y-2">
      <button className={button} aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
        {enabled ? t('closeGuide') : t('openGuide')}
      </button>
      {enabled && (
        <div className="space-y-3">
          <p>{t('guideIntro')}</p>
          {beats.map((b) => (
            <div key={b.title} className="space-y-1 border-t border-slate-800 pt-3">
              <h5 className="font-semibold text-white">{b.title}</h5>
              <p>{b.detail}</p>
              <p className="text-cyan-100">
                {b.observed ? t('evidencePresent') : t('availableToExplore')}
              </p>
              <button className={button} onClick={() => navigate(b.section)}>
                {t('goTo', { section: t('sectionLabel', { section: b.section }) })}
              </button>
            </div>
          ))}
        </div>
      )}
      {store.workplace.phase !== 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      participationReceipt(store.workplace, store.participationMode),
                      null,
                      2
                    ),
                  ],
                  { type: 'application/json' }
                )
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = `millos-cooperative-receipt-${store.workplace.seed}-r${store.workplace.revision}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('downloadReceipt')}
          </button>
          <button
            className={button}
            onClick={() => report(store.rehearseReload(store.workplace.revision))}
          >
            {t('saveReload')}
          </button>
        </div>
      )}
    </section>
  );
}

/** Idle/skip automation is visible, interruptible and restricted to fictional solo roles. */
export function WorkplaceAutomaticDemo({ profile }: { profile: WorkplaceProfile }) {
  const t = useT(workplaceParticipationMessages);
  const store = useWorkplaceStore();
  const automatic = useWorkplaceAutoplay();
  const running = automatic.running;

  const eligible =
    store.participationMode === 'solo' &&
    store.workplace.mode === 'game' &&
    !store.workplace.improvement;
  if (!eligible) return null;
  return (
    <section aria-label={t('autoLabel')} className="space-y-2 border-b border-slate-700 pb-3">
      <p className="text-slate-300">
        {running
          ? t('autoRunning')
          : store.workplace.phase === 'idle' && !automatic.manual
            ? t('autoIdle')
            : t('autoManual')}
      </p>
      {automatic.message && (
        <p className="text-cyan-100" role="status">
          {automatic.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={running}
          onClick={() => {
            automatic.start(profile);
          }}
        >
          {t('skipGuide')}
        </button>
        <button
          className={button}
          onClick={() => {
            automatic.pause();
          }}
        >
          {' '}
          {running ? t('pauseDemo') : t('keepManual')}{' '}
        </button>
      </div>
    </section>
  );
}

export function WorkplaceAutoplayStatus() {
  const t = useT(workplaceParticipationMessages);
  const { isMobile } = useMobileDetection();
  const automatic = useWorkplaceAutoplay();
  const store = useWorkplaceStore();
  const orderId = useOperationsCampaignStore((s) => s.activeOrderId);
  // GameInterface publishes `introStep !== null` as the PA onboarding context;
  // both stores are leaves, so reading them here adds no import cycle.
  const tourShowing = useAnnouncementsStore((s) => s.context.onboarding);
  const journeyVisible = useUIStore((s) => s.journeyVisible);
  const guideCardShowing = tourShowing || journeyVisible;
  // Closing the tour with X leaves hasSeenIntro unset, so remember that this
  // mount has seen the tour rather than waiting for the persisted flag.
  const tourSeen = useRef(false);
  useEffect(() => {
    if (useAnnouncementsStore.getState().context.onboarding) tourSeen.current = true;
    return useAnnouncementsStore.subscribe((state) => {
      if (state.context.onboarding) tourSeen.current = true;
    });
  }, []);
  // A season that was running when the page reloaded resumes with its own
  // profile; otherwise admission starts a fresh default season once.
  const resumeProfile = automatic.resumeProfile;
  useEffect(() => {
    if (
      automatic.running ||
      !orderId ||
      store.participationMode !== 'solo' ||
      store.workplace.mode !== 'game' ||
      (!resumeProfile && (automatic.manual || store.workplace.phase !== 'idle'))
    )
      return;
    const admit = () => {
      if (isBenchmarkRuntime()) return;
      // The tour holds the shift clock. Admission waits until it is neither
      // pending (first load, before its card appears) nor showing, so the
      // season never restarts the clock under it or binds the order mid-tour.
      // Working if a fresh profile starts autonomous play only after the tour
      // closes, skips or finishes, and the guided first delivery keeps it.
      if (useAnnouncementsStore.getState().context.onboarding) return;
      if (!useUIStore.getState().hasSeenIntro && !tourSeen.current) return;
      if (document.documentElement.dataset.millosStartupReady === 'true')
        automatic.start(resumeProfile ?? 'toe-dip');
    };
    admit();
    const timer = window.setInterval(admit, 1000);
    return () => window.clearInterval(timer);
  }, [
    automatic.manual,
    automatic.running,
    automatic.start,
    resumeProfile,
    orderId,
    store.participationMode,
    store.workplace.mode,
    store.workplace.phase,
  ]);
  if (!automatic.running) return null;
  // The tour and first-delivery cards sit from bottom-[11.5rem] in the same
  // bottom-left column. Beside them the notice collapses to its one 44px
  // takeover control, which ends below the card instead of under it.
  // Working if the takeover control stays fully visible while either card shows.
  const compact = isMobile || guideCardShowing;
  return (
    <aside
      aria-label={t('demoRunningLabel')}
      // The bottom-left touch pad owns movement, including the return route.
      // Working if the season notice leaves every D-pad button hit-testable.
      className={
        isMobile
          ? 'pointer-events-auto fixed top-4 left-3 z-40 max-w-[calc(100vw-6rem)] text-xs text-cyan-100'
          : compact
            ? 'pointer-events-auto fixed bottom-[8rem] left-3 z-40 max-w-[calc(100vw-1.5rem)] text-xs text-cyan-100'
            : 'pointer-events-auto fixed bottom-[8rem] left-3 z-40 max-w-[calc(100vw-1.5rem)] rounded-lg border border-cyan-300/25 bg-slate-950 p-3 text-xs text-cyan-100'
      }
    >
      <p className={compact ? 'sr-only' : undefined}>{t('autonomousSeason')}</p>
      <p className={compact ? 'sr-only' : 'mt-1 max-w-xs text-slate-300'}>
        {t('autonomousSeasonDetail')}
      </p>
      {/* Taking over hands the decisions to the player where they can make
          them, and never freezes the plant: the shift keeps its pace. Running
          the demo again from that panel reverses it. Working if Take over opens
          the BAS season with the clock still running. */}
      <button
        aria-label={t('takeOver')}
        title={t('autonomousSeasonDetail')}
        className={`${button} ${compact ? 'max-w-full bg-slate-950 shadow-lg' : 'mt-2'}`}
        onClick={() => {
          automatic.pause(true);
          window.dispatchEvent(
            new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
          );
        }}
      >
        {compact ? t('takeOverCompact') : t('takeOver')}
      </button>
    </aside>
  );
}
