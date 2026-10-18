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

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50';
export function WorkplaceParticipation({
  report,
}: {
  report: (result: WorkplaceTransitionResult) => void;
}) {
  const store = useWorkplaceStore();
  const s = store.workplace;
  const [role, setRole] = useState('packing');
  const current = store.turn;
  const turnInstructions = useRef<HTMLParagraphElement>(null);
  const handover = useRef<HTMLSelectElement>(null);
  const checks = turnChecks(s);
  const completedChecks = checks.filter((q) => current?.answers[q.id] === q.correct).length;
  return (
    <section aria-label="Decision ownership" className="space-y-3 border-b border-slate-700 pb-4">
      <details open={store.participationMode === 'separate-turns'}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
          Decision ownership:{' '}
          {store.participationMode === 'solo'
            ? 'solo role-play'
            : current
              ? `${s.members.find((m) => m.id === current.actorId)?.role ?? 'Adviser'} turn`
              : 'facilitator handover'}
        </summary>
        <p className="mb-3 text-slate-300">
          Shared-device synthetic rehearsal. Separate turns limit local role actions. They provide
          no identity authentication or proof of freedom from coercion. Real worker sessions need
          separate authentication and agreed safeguards.
        </p>
        <label className="block">
          Interaction mode
          <select
            aria-label="Interaction mode"
            className={input}
            disabled={s.phase !== 'idle'}
            value={store.participationMode}
            onChange={(e) =>
              report(store.setParticipationMode(e.target.value as 'solo' | 'separate-turns'))
            }
          >
            <option value="solo">Solo role-play</option>
            <option value="separate-turns">Facilitated separate turns</option>
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
                  Only {s.members.find((m) => m.id === current.actorId)?.role ?? 'Adviser'} may
                  record this turn’s role decisions. Changed terms end the turn. End this turn
                  before facilitator activation or settlement.
                </p>
                {s.phase === 'deliberating' && (
                  <fieldset className="space-y-2">
                    <legend className="font-semibold text-white">Current mandate checks</legend>
                    <p role="status" className="text-cyan-100">
                      Mandate checks: {completedChecks} of {checks.length} match the current
                      agreement. Confirming understanding remains a separate choice.
                    </p>
                    {checks.map((q) => (
                      <label key={q.id} className="block">
                        {q.prompt}
                        <select
                          className={input}
                          aria-label={`Turn check: ${q.id}`}
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
                            Select an answer
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
                                  ? 'Matches the current terms. '
                                  : 'Needs another look. '}
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
                  End participant turn
                </button>
              </>
            ) : (
              <>
                <label className="block">
                  Hand over to fictional role
                  <select
                    className={input}
                    aria-label="Hand over to fictional role"
                    ref={handover}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {s.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.role}
                      </option>
                    ))}
                    <option value="mind">Adviser</option>
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
                  Begin participant turn
                </button>
                <p className="text-slate-300">
                  Hand the device over before beginning. The facilitator may prepare terms and
                  explain facts, and cannot record role decisions.
                </p>
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
  const store = useWorkplaceStore();
  if (store.workplace.phase !== 'idle') return null;
  return (
    <details className="space-y-3 border-t border-slate-700 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
        Play a three-shift cooperative season
      </summary>
      <p>
        Friday: agree an urgent delivery. Monday: inspect under pressure. Thursday: renegotiate
        repeated burden. Cash, pay and workload carry forward; each shift needs fresh consent.
      </p>
      <label className="block">
        Season adoption route
        <select
          aria-label="Season adoption route"
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
        {MANAGEMENT_APPROACHES.find((a) => a.id === profile)?.detail} Keep this degree of adoption
        throughout; escalation is optional in a future exercise.
      </p>
      <button
        className={button}
        onClick={() => {
          const r = store.startMission(profile, store.workplace.seed);
          report(r);
          if (r.changed) onStart();
        }}
      >
        Start season with current customer commitment
      </button>
      <p className="text-slate-300">
        Requires an open, qualified customer commitment. Real dispatch earns delivery; a defensible
        shortfall is a valid ending.
      </p>
    </details>
  );
}
export function WorkplaceFairness() {
  const store = useWorkplaceStore();
  const s = store.workplace;
  return (
    <details className="border-t border-slate-700 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-white">
        Individual fairness receipts
      </summary>
      <p className="mb-3">
        Illustrative credits and modeled minutes. Earned pay includes member distributions;
        extra-duty compensation is separate. Current reservations are earmarked funds, awaiting
        work.
      </p>
      {fairnessReceipt(s).map((r) => (
        <section
          key={r.id}
          aria-label={`Fairness: ${r.role}`}
          className="space-y-1 border-t border-slate-800 py-3"
        >
          <h5 className="font-semibold text-white">{r.role}</h5>
          <p>
            Qualified tasks: {r.qualifiedTasks.join(', ')}. Current task: {r.currentTask}.
          </p>
          <p>
            Current optional duty:{' '}
            {r.currentCoverConsent === null
              ? 'no decision'
              : r.currentCoverConsent
                ? 'volunteered'
                : 'declined'}
            . {r.extraMinutes.toFixed(1)} extra minutes across {r.shiftsWithExtraDuty} shifts;{' '}
            {r.earlierExtraMinutes.toFixed(1)} earlier minutes.
          </p>
          <p className="tabular-nums">
            Earned pay and member distributions: {r.earnedPayAndMemberDistributions.toFixed(2)}.
            Compensation paid: {r.compensationPaid.toFixed(2)}. Wages reserved:{' '}
            {r.wagesReserved.toFixed(2)}. Compensation reserved: {r.compensationReserved.toFixed(2)}
            .
          </p>
          <p className="tabular-nums">
            Rest delivered: {r.restMinutes.toFixed(1)} min. Recovery delivered:{' '}
            {r.recoveryDelivered.toFixed(1)} min. Recovery owed: {r.recoveryOwed.toFixed(1)} min.
          </p>
          <p>
            {r.openObjections.length} retained open objections. {r.historicalObjectionDetail}
          </p>
          {r.openObjections.map((o, n) => (
            <p key={n} className="text-amber-100">
              {o.kind}: {o.statement}
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
  const store = useWorkplaceStore();
  const [enabled, setEnabled] = useState(false);
  const beats = demonstrationBeats(store.workplace);
  return (
    <section aria-label="Guided bilateral demonstration" className="space-y-2">
      <button className={button} aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
        {enabled ? 'Close ten-minute guide' : 'Open ten-minute guide'}
      </button>
      {enabled && (
        <div className="space-y-3">
          <p>
            About ten minutes of discussion, with plant time controlled separately. Evidence marks
            observed choices; a skipped optional choice stays available. The guide never makes
            decisions for you.
          </p>
          {beats.map((b) => (
            <div key={b.title} className="space-y-1 border-t border-slate-800 pt-3">
              <h5 className="font-semibold text-white">{b.title}</h5>
              <p>{b.detail}</p>
              <p className="text-cyan-100">
                {b.observed ? 'Evidence present' : 'Available to explore'}
              </p>
              <button className={button} onClick={() => navigate(b.section)}>
                Go to {b.section}
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
            Download public cooperative receipt
          </button>
          <button
            className={button}
            onClick={() => report(store.rehearseReload(store.workplace.revision))}
          >
            Save and safely reload workplace
          </button>
        </div>
      )}
    </section>
  );
}

/** Idle/skip automation is visible, interruptible and restricted to fictional solo roles. */
export function WorkplaceAutomaticDemo({ profile }: { profile: WorkplaceProfile }) {
  const store = useWorkplaceStore();
  const automatic = useWorkplaceAutoplay();
  const running = automatic.running;

  const eligible =
    store.participationMode === 'solo' &&
    store.workplace.mode === 'game' &&
    !store.workplace.improvement;
  if (!eligible) return null;
  return (
    <section
      aria-label="Automatic fictional demonstration"
      className="space-y-2 border-b border-slate-700 pb-3"
    >
      <p className="text-slate-300">
        {running
          ? 'Automatic solo demonstration: fictional roles choose, refuse and revoke sharing. Real simulated plant departures earn delivery.'
          : store.workplace.phase === 'idle' && !automatic.manual
            ? 'The cooperative season runs autonomously by default. Take over whenever you want. Separate participant turns always stay manual.'
            : 'You can let fictional solo roles demonstrate the season, or keep making the choices yourself.'}
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
          Skip guide and run fictional demo
        </button>
        <button
          className={button}
          onClick={() => {
            automatic.pause();
          }}
        >
          {' '}
          {running ? 'Pause automatic demo' : 'Keep decisions manual'}{' '}
        </button>
      </div>
    </section>
  );
}

export function WorkplaceAutoplayStatus() {
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
  useEffect(() => {
    if (
      automatic.manual ||
      automatic.running ||
      !orderId ||
      store.participationMode !== 'solo' ||
      store.workplace.mode !== 'game' ||
      store.workplace.phase !== 'idle'
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
        automatic.start('toe-dip');
    };
    admit();
    const timer = window.setInterval(admit, 1000);
    return () => window.clearInterval(timer);
  }, [
    automatic.manual,
    automatic.running,
    automatic.start,
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
      aria-label="Fictional demo running"
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
      <p className={compact ? 'sr-only' : undefined}>Autonomous cooperative season</p>
      <button
        aria-label="Take over cooperative season"
        className={`${button} ${compact ? 'max-w-full bg-slate-950 shadow-lg' : 'mt-2'}`}
        onClick={() => automatic.pause()}
      >
        {compact ? 'Autonomous season: take over' : 'Take over cooperative season'}
      </button>
    </aside>
  );
}
