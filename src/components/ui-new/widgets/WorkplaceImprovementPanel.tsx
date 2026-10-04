import { useRef, useState } from 'react';
import { TeachingPace } from '../onboarding/PlayableShift';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useCameraStore, CAMERA_PRESETS } from '../../CameraController';
import {
  HANDOFF_ARRANGEMENTS,
  IMPROVEMENT_CHALLENGES,
  improvementSummary,
  improvementReviewWinner,
  improvementObligations,
} from '../../../simulation/workplaceImprovement';
import { workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import {
  HandoffEpisodes,
  FrozenPackingAdvice,
  MatchedPackingRehearsal,
  HandoffConduct,
} from './WorkplacePackingEvidence';
import type {
  ImprovementChallenge,
  ImprovementVerdict,
  WorkplaceProfile,
  WorkplaceMode,
  WorkplaceTransitionResult,
} from '../../../types/workplace';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
export function WorkplaceImprovementPanel({
  profile,
  setProfile,
  mode,
  setMode,
  activate,
  busy,
  report,
}: {
  profile: WorkplaceProfile;
  setProfile?: (value: WorkplaceProfile) => void;
  mode?: WorkplaceMode;
  setMode?: (value: WorkplaceMode) => void;
  activate: () => Promise<void>;
  busy: boolean;
  report: (result: WorkplaceTransitionResult) => void;
}) {
  const store = useWorkplaceStore();
  const s = store.workplace;
  const i = s.improvement;
  const summary = improvementSummary(s);
  const [actor, setActor] = useState('quality');
  const [challenge, setChallenge] = useState<ImprovementChallenge>('forecast');
  const panelRef = useRef<HTMLElement>(null);
  const deliberating = s.phase === 'deliberating';
  const readiness = workplaceReadiness(s);
  const perform = (result: WorkplaceTransitionResult, pause = false) => {
    report(result);
    if (result.changed && pause) {
      if (s.mode === 'game') useGameSimulationStore.getState().setGameSpeed(0);
      // Opening a shift replaces the entry form. Put its decision heading and
      // optional episode control together in view, beyond the lab navigation.
      if (s.phase === 'idle' || s.phase === 'review')
        requestAnimationFrame(() => {
          panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
          panelRef.current?.focus({ preventScroll: true });
        });
    }
  };
  if (!i || !summary)
    return (
      <section ref={panelRef} tabIndex={-1} aria-label="Handoff experiment" className="space-y-4">
        <h4 className="text-base font-semibold text-white">The handoff experiment</h4>
        <p>Try a member’s idea on the packing floor, then decide what stays.</p>
        <p className="text-slate-300">
          One 90-minute trial. Pay, qualified work and refusal stay protected.
        </p>
        {s.phase === 'idle' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              Handoff mode
              <select
                aria-label="Handoff mode"
                className={input}
                value={mode ?? s.mode}
                onChange={(e) => setMode?.(e.target.value as WorkplaceMode)}
              >
                <option value="game">Game</option>
                <option value="workshop">Workshop</option>
                <option value="pilot">Pilot preparation</option>
              </select>
            </label>
            <label>
              Handoff governance
              <select
                aria-label="Handoff governance"
                className={input}
                value={profile}
                onChange={(e) => setProfile?.(e.target.value as WorkplaceProfile)}
              >
                <option value="toe-dip">Coordinator-led</option>
                <option value="team">Team agreement</option>
                <option value="cooperative">Member governance</option>
              </select>
            </label>
          </div>
        )}
        <button
          type="button"
          className={button}
          disabled={(mode ?? s.mode) === 'pilot' || !['idle', 'review'].includes(s.phase)}
          onClick={() =>
            perform(store.beginImprovement(profile, s.revision, undefined, mode ?? s.mode), true)
          }
        >
          Open the handoff experiment
        </button>
        {s.mode === 'pilot' && (
          <p>
            Pilot preparation remains planning-only. Use Game or Workshop for a local experiment.
          </p>
        )}
      </section>
    );
  const arrangement = HANDOFF_ARRANGEMENTS.find((a) => a.id === i.proposalId);
  const advice = i.advice;
  const winner = improvementReviewWinner(s);
  return (
    <section ref={panelRef} tabIndex={-1} aria-label="Handoff experiment" className="space-y-4">
      <div className="space-y-2 border-b border-slate-700 pb-4">
        <h4 className="text-base font-semibold text-white">
          The handoff experiment, shift {summary.cycle}
        </h4>
        <p className="text-cyan-100" aria-live="polite">
          {summary.next}
        </p>
        <p className="text-xs text-slate-300">
          Synthetic role-play. Everyone can challenge or stop an arrangement. No private reason,
          extra duty or lost pay is required.
        </p>
      </div>
      {deliberating && <HandoffEpisodes state={s} report={report} />}
      {deliberating && (
        <div className="space-y-3">
          <h5 className="font-semibold text-white">Which idea should the team try?</h5>
          {HANDOFF_ARRANGEMENTS.map((a) => (
            <div key={a.id} className="space-y-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                className={`${button} ${i.proposalId === a.id ? 'bg-cyan-900/50' : ''}`}
                aria-pressed={i.proposalId === a.id}
                onClick={() => perform(store.proposeImprovement(a.id, a.author))}
              >
                {a.title}
              </button>
              {i.proposalId === a.id && (
                <p className="font-medium text-cyan-100">Selected for this trial.</p>
              )}
              <p>{a.detail}</p>
              <p className="text-xs tabular-nums text-slate-300">
                {a.cost} credits for a new arrangement;{' '}
                {a.briefingMinutes ? `${a.briefingMinutes} paid minutes of pacing hold; ` : ''}
                {a.capacity.toFixed(2)}× modeled pace. An adopted arrangement has no repeat
                purchase.
              </p>
            </div>
          ))}
        </div>
      )}
      {arrangement && (
        <div className="space-y-2">
          <h5 className="font-semibold text-white">{arrangement.title}</h5>
          <p className="tabular-nums">
            Reserve 108 credits for wages first. This shift’s purchase: {summary.cost.toFixed(2)}{' '}
            credits. Cash before reservations: {s.finance.cash.toFixed(2)}.
          </p>
          {advice ? (
            <FrozenPackingAdvice advice={advice} />
          ) : (
            <p className="text-xs text-slate-300">
              {s.mode === 'game'
                ? 'Hear the adviser response to capture the current plant facts. Missing evidence will cause an explicit abstention.'
                : 'Facilitated workshop: no physical packing or departure forecast.'}{' '}
              Governance grants no capacity bonus.
            </p>
          )}
          {deliberating && (
            <MatchedPackingRehearsal
              key={`${summary.cycle}-${i.proposalId}-${i.episode?.id ?? ''}`}
              state={s}
              report={report}
            />
          )}
          {deliberating && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  Challenge author
                  <select
                    aria-label="Challenge author"
                    className={input}
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                  >
                    {[...s.members.map((m) => [m.id, m.role]), ['mind', 'Adviser']].map(
                      ([id, role]) => (
                        <option key={id} value={id}>
                          {role}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label>
                  Challenge subject
                  <select
                    aria-label="Challenge subject"
                    className={input}
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value as ImprovementChallenge)}
                  >
                    {IMPROVEMENT_CHALLENGES.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  onClick={() => perform(store.challengeImprovement(actor, challenge))}
                >
                  Challenge this proposal
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => perform(store.acknowledgeImprovement())}
                >
                  Hear the adviser response
                </button>
              </div>
            </>
          )}
          {i.challenges.length > 0 && (
            <ul className="list-inside list-disc text-xs text-slate-300">
              {i.challenges.map((c) => (
                <li key={`${c.actorId}-${c.kind}`}>
                  {s.members.find((m) => m.id === c.actorId)?.role ?? 'Adviser'} challenged {c.kind}
                  ;{' '}
                  {i.acknowledged
                    ? 'response recorded, individual objection rights retained'
                    : 'response pending'}
                  .
                </li>
              ))}
            </ul>
          )}
          {i.acknowledged && (
            <p className="text-cyan-100">
              Adviser: “These are uncertain operational assumptions. Spending stays bounded, work
              stays qualified, and any role can return the line to steady pacing. I cannot waive a
              boundary or close someone else’s objection.”
            </p>
          )}
        </div>
      )}
      {deliberating && i.proposalId && (
        <div className="space-y-3">
          <h5 className="font-semibold text-white">Fresh role decisions</h5>
          <p className="text-xs text-slate-300">
            A policy ballot grants no optional-duty consent. Team agreement requires all approvals;
            member governance requires three; coordinator-led work hears every role before the
            coordinator decides.
          </p>
          {s.members.map((m) => (
            <fieldset key={m.id} className="space-y-2 border-t border-slate-800 pt-3">
              <legend className="font-medium text-white">{m.role}</legend>
              <p className="text-xs text-slate-300">{m.publicBoundary}</p>
              <p className="text-cyan-100" aria-live="polite">
                Policy ballot: {m.ballot === null ? 'pending' : m.ballot ? 'approved' : 'declined'}.
                {m.ballot === false && ' Ordinary pay is unchanged.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={!i.acknowledged || m.understood}
                  onClick={() => perform(store.understand(m.id))}
                >
                  Confirm handoff understanding: {m.role}
                </button>
                <button
                  type="button"
                  className={`${button} ${m.ballot === true ? 'bg-cyan-900/50' : ''}`}
                  disabled={!m.understood}
                  aria-pressed={m.ballot === true}
                  onClick={() => perform(store.vote(m.id, true))}
                >
                  Approve handoff: {m.role}
                </button>
                <button
                  type="button"
                  className={`${button} ${m.ballot === false ? 'bg-cyan-900/50' : ''}`}
                  disabled={!m.understood}
                  aria-pressed={m.ballot === false}
                  onClick={() => perform(store.vote(m.id, false))}
                >
                  Decline handoff: {m.role}
                </button>
              </div>
            </fieldset>
          ))}
          {!readiness.allowed && (
            <ul className="list-inside list-disc text-xs text-amber-100">
              {readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={button}
            disabled={!readiness.allowed || busy}
            onClick={async () => {
              await activate();
              if (useWorkplaceStore.getState().workplace.phase === 'active' && s.mode === 'game')
                useGameSimulationStore.getState().setGameSpeed(30);
            }}
          >
            {busy
              ? 'Checking current agreement…'
              : s.mode === 'workshop'
                ? 'Record handoff workshop agreement'
                : 'Approve and run handoff trial'}
          </button>
        </div>
      )}
      {s.phase === 'active' && s.mode === 'game' && <TeachingPace />}
      {s.phase === 'active' && (
        <div className="space-y-3">
          <p className="tabular-nums">
            {i.stopped
              ? 'Arrangement stopped: steady 0.78× pacing for the remaining agreed shift.'
              : `Arrangement expires at minute 90. ${arrangement?.briefingMinutes && s.minute < 5 ? 'Paid briefing in progress; line pacing held.' : 'Watch the line and customer dispatch.'}`}
          </p>
          <label>
            Stopping role
            <select
              aria-label="Stopping role"
              className={input}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              {[...s.members.map((m) => [m.id, m.role]), ['mind', 'Adviser']].map(([id, role]) => (
                <option key={id} value={id}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={i.stopped}
              onClick={() => perform(store.stopImprovement(actor))}
            >
              Stop arrangement and keep steady work
            </button>
            <button type="button" className={button} onClick={() => perform(store.stop(), true)}>
              End handoff shift now
            </button>
            {s.mode === 'workshop' && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  store.tick(5, 0, false);
                }}
              >
                Advance handoff rehearsal by 5 minutes
              </button>
            )}
          </div>
        </div>
      )}
      {s.mode === 'game' && (
        <button
          type="button"
          className={button}
          onClick={() =>
            useCameraStore
              .getState()
              .setPreset(CAMERA_PRESETS.findIndex((p) => p.name === 'Packing'))
          }
        >
          Watch the packing handoff
        </button>
      )}
      <dl className="space-y-1 border-t border-slate-700 pt-3 text-xs tabular-nums">
        <div>
          <dt className="inline text-slate-300">This shift’s actual dispatch: </dt>
          <dd className="inline">
            {s.shippedKg.toFixed(0)} kg
            {s.mode === 'workshop' && ' (workshop has no plant shipment)'}
          </dd>
        </div>
        {summary.remainingKg !== null && (
          <div>
            <dt className="inline text-slate-300">Full customer commitment remaining: </dt>
            <dd className="inline">
              {summary.remainingKg.toFixed(0)} kg; {summary.mission?.evidence} evidence
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-slate-300">Paid this shift: </dt>
          <dd className="inline">
            {s.finance.wagesPaid.toFixed(2)} credits; purchase{' '}
            {s.finance.improvementSpend.toFixed(2)}; closing cash {s.finance.cash.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-300">Retained earned pay: </dt>
          <dd className="inline">
            {summary.lifetimeWages.toFixed(2)} credits; compensation{' '}
            {summary.lifetimeCompensation.toFixed(2)}
          </dd>
        </div>
      </dl>
      {s.phase === 'review' && (
        <div className="space-y-3 border-t border-slate-700 pt-4">
          <h5 className="font-semibold text-white">What should carry into the next shift?</h5>
          <p className="tabular-nums">
            {advice
              ? advice.reasonToAbstain
                ? 'No forecast was made because evidence was unavailable. '
                : `Conditional departure bound 0 to ${advice.dispatchUpperKg.toFixed(0)} kg. `
              : `Historical illustrative forecast ${summary.forecast.kg.toFixed(0)} kg. `}
            Actual qualifying dispatch {s.shippedKg.toFixed(0)} kg. Packing potential, truck
            departure and the arrangement’s causal effect remain separate.
          </p>
          <button
            type="button"
            className={button}
            disabled={i.reviewAcknowledged}
            onClick={() => perform(store.acknowledgeImprovementReview())}
          >
            Hear the adviser review its forecast
          </button>
          {i.reviewAcknowledged && (
            <p className="text-cyan-100">
              Adviser: “
              {advice
                ? advice.reasonToAbstain
                  ? 'I had insufficient evidence to forecast. This outcome does not turn missing facts into a prior prediction.'
                  : `I assumed fixed machinery, quality and ${advice.evidence.gameSpeed}× clock pace. Actual dispatch ${s.shippedKg.toFixed(0)} kg ${s.shippedKg <= advice.dispatchUpperKg ? 'fell within' : 'exceeded'} my conditional bound. Changed inputs or collection timing require a new explanation, never a retroactively edited forecast.`
                : 'That retained teaching forecast was illustrative. New game trials capture plant-grounded facts.'}{' '}
              Customer work, earned pay and individual remedies remain intact.”
            </p>
          )}
          {improvementObligations(s).map((reason) => (
            <p key={reason} className="text-amber-100">
              {reason}
            </p>
          ))}
          {!i.verdict &&
            s.members.map((m) => (
              <label key={m.id} className="block">
                {m.role} review decision
                <select
                  aria-label={`${m.role} review decision`}
                  className={input}
                  disabled={!i.reviewAcknowledged}
                  value={i.ballots[m.id] ?? ''}
                  onChange={(e) =>
                    perform(store.voteImprovementReview(m.id, e.target.value as ImprovementVerdict))
                  }
                >
                  <option value="" disabled>
                    Choose a review decision
                  </option>
                  <option value="adopt" disabled={i.stopped || !i.funded || s.minute !== 90}>
                    Adopt, retain the purchase with fresh agreement
                  </option>
                  <option value="amend">Amend, try the alternative next shift</option>
                  <option value="stop">Stop, return to ordinary pacing</option>
                </select>
              </label>
            ))}
          {!i.verdict ? (
            <button
              type="button"
              className={button}
              disabled={!winner || !i.reviewAcknowledged}
              onClick={() => perform(store.finishImprovementReview(s.revision))}
            >
              Finalise handoff review
            </button>
          ) : (
            <>
              <p className="font-medium text-white">
                Review recorded: {i.verdict}. Every ending preserves the learning and earned
                obligations.
              </p>
              <button
                type="button"
                className={button}
                onClick={() => perform(store.continueImprovement(s.revision), true)}
              >
                Open next handoff shift
              </button>
            </>
          )}
        </div>
      )}
      {s.phase === 'review' && <HandoffConduct state={s} />}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          Earlier decisions and retained receipts
        </summary>
        <p className="text-xs text-slate-300">
          Origin closing cash: {i.origin.finance.cash.toFixed(2)} credits. Earlier earned pay and
          any campaign review remain retained; old consent supplies no current permission.
        </p>
        {summary.history.map((h) => (
          <p key={h.cycle} className="mt-2 text-xs tabular-nums">
            Shift {h.cycle}: {h.proposalId}, {h.verdict}; dispatched {h.shippedKg.toFixed(0)} kg,
            wages {h.wages.toFixed(2)}, purchase {h.spend.toFixed(2)}, closing cash{' '}
            {h.closingCash.toFixed(2)}.
          </p>
        ))}
      </details>
    </section>
  );
}
