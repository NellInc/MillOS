import { WorkplaceSeasonEntry } from './WorkplaceParticipation';
import { useRef, useState } from 'react';
import { TeachingPace } from '../onboarding/PlayableShift';
import { useWorkplaceStore, useWorkplaceControls } from '../../../stores/workplaceStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { useCameraStore, CAMERA_PRESETS } from '../../CameraController';
import {
  HANDOFF_ARRANGEMENTS,
  IMPROVEMENT_CHALLENGES,
  improvementSummary,
  improvementReviewWinner,
  improvementObligations,
  improvementLearningReview,
  handoffHoldsClock,
  MAX_IMPROVEMENT_CYCLES,
} from '../../../simulation/workplaceImprovement';
import { turnChecks } from '../../../simulation/workplaceParticipation';
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
import { formatFixed, translate, useT } from '../../../i18n';
import { workplaceImprovementPanelMessages } from './WorkplaceImprovementPanel.messages';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
export function WorkplaceImprovementPanel({
  profile,
  setProfile,
  mode,
  setMode,
  activate,
  busy,
  report,
  onSeasonStart,
  onReviewObjection,
}: {
  profile: WorkplaceProfile;
  setProfile?: (value: WorkplaceProfile) => void;
  mode?: WorkplaceMode;
  setMode?: (value: WorkplaceMode) => void;
  activate: () => Promise<void>;
  busy: boolean;
  report: (result: WorkplaceTransitionResult) => void;
  onSeasonStart?: () => void;
  onReviewObjection?: (id: string) => void;
}) {
  const t = useT(workplaceImprovementPanelMessages);
  const store = useWorkplaceControls();
  const s = store.workplace;
  const i = s.improvement;
  const summary = improvementSummary(s);
  const learning = improvementLearningReview(s);
  const obligations = improvementObligations(s);
  const openObjections = s.objections.filter((objection) => objection.status === 'open');
  const [selectedActor, setActor] = useState('quality');
  const actor =
    store.participationMode === 'separate-turns' ? (store.turn?.actorId ?? '') : selectedActor;
  const [challenge, setChallenge] = useState<ImprovementChallenge>('forecast');
  const panelRef = useRef<HTMLElement>(null);
  const deliberating = s.phase === 'deliberating';
  const readiness = workplaceReadiness(s);
  const separateTurns = store.participationMode === 'separate-turns';
  const ownsRole = (id: string) => !separateTurns || store.turn?.actorId === id;
  const facilitator = !separateTurns || !store.turn;
  const mandateReady =
    !separateTurns || turnChecks(s).every((q) => store.turn?.answers[q.id] === q.correct);
  // The handoff clock hold is derived from workplace state (workplaceStore),
  // so no button here pushes or pops it. Working if opening, cancelling and
  // finalising hold and release the plant without a control fighting a pace.
  const perform = (result: WorkplaceTransitionResult, reveal = false) => {
    report(result);
    if (result.changed && reveal) {
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
      <section ref={panelRef} tabIndex={-1} aria-label={t('regionLabel')} className="space-y-4">
        <h4 className="text-base font-semibold text-white">{t('introHeading')}</h4>
        <p>{t('introIdea')}</p>
        <p className="text-slate-300">{t('introProtected')}</p>
        {s.phase === 'idle' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              {t('modeLabel')}
              <select
                aria-label={t('modeLabel')}
                className={input}
                value={mode ?? s.mode}
                onChange={(e) => setMode?.(e.target.value as WorkplaceMode)}
              >
                <option value="game">{t('modeGame')}</option>
                <option value="workshop">{t('modeWorkshop')}</option>
                <option value="pilot">{t('modePilot')}</option>
              </select>
            </label>
            <label>
              {t('governanceLabel')}
              <select
                aria-label={t('governanceLabel')}
                className={input}
                value={profile}
                onChange={(e) => setProfile?.(e.target.value as WorkplaceProfile)}
              >
                <option value="toe-dip">{t('profileToeDip')}</option>
                <option value="team">{t('profileTeam')}</option>
                <option value="cooperative">{t('profileCooperative')}</option>
              </select>
            </label>
          </div>
        )}
        <button
          type="button"
          className={button}
          disabled={
            (mode ?? s.mode) === 'pilot' || !['idle', 'review'].includes(s.phase) || !facilitator
          }
          onClick={() =>
            perform(store.beginImprovement(profile, s.revision, undefined, mode ?? s.mode), true)
          }
        >
          {t('openExperiment')}
        </button>
        {(mode ?? s.mode) === 'game' && <p className="text-slate-300">{t('openHoldNote')}</p>}
        {(mode ?? s.mode) === 'game' && setProfile && (
          <WorkplaceSeasonEntry
            profile={profile}
            setProfile={setProfile}
            report={report}
            onStart={() => {
              // A live season runs at standard pace, as from the play card.
              useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
              perform(
                {
                  changed: true,
                  reason: translate(workplaceImprovementPanelMessages, 'seasonOpened'),
                },
                true
              );
              onSeasonStart?.();
            }}
          />
        )}
        {s.mode === 'pilot' && <p>{t('pilotPlanningOnly')}</p>}
      </section>
    );
  const cancellable =
    !i.funded &&
    i.history.length === 0 &&
    obligations.length === 0 &&
    (deliberating || s.phase === 'review');
  const arrangement = HANDOFF_ARRANGEMENTS.find((a) => a.id === i.proposalId);
  const advice = i.advice;
  const winner = improvementReviewWinner(s);
  return (
    <section ref={panelRef} tabIndex={-1} aria-label={t('regionLabel')} className="space-y-4">
      <div className="space-y-2 border-b border-slate-700 pb-4">
        <h4 className="text-base font-semibold text-white">
          {t('shiftHeading', { cycle: formatFixed(summary.cycle, 0) })}
        </h4>
        <p className="text-cyan-100" aria-live="polite">
          {summary.next}
        </p>
        <p className="text-xs text-slate-300">{t('rolePlayNote')}</p>
      </div>
      {handoffHoldsClock(s) && (
        <section
          aria-label={t('holdHeading')}
          className="space-y-2 rounded-md border border-amber-300/30 p-3"
        >
          <h5 className="font-semibold text-amber-100">{t('holdHeading')}</h5>
          <TeachingPace />
          {cancellable ? (
            <>
              <button
                type="button"
                className={button}
                disabled={!facilitator}
                onClick={() => perform(store.cancelImprovement(s.revision), true)}
              >
                {t('cancelExperiment')}
              </button>
              <p className="text-xs text-slate-300">{t('cancelNote')}</p>
            </>
          ) : deliberating ? (
            <>
              <button type="button" className={button} onClick={() => perform(store.stop())}>
                {t('endShiftNow')}
              </button>
              <p className="text-xs text-slate-300">{t('endToReviewNote')}</p>
            </>
          ) : (
            <p className="text-xs text-slate-300">{t('finaliseToReleaseNote')}</p>
          )}
        </section>
      )}
      {openObjections.length > 0 && (
        <section
          aria-label={t('remediesLabel')}
          className="space-y-3 border-b border-slate-700 pb-4"
        >
          <h5 className="font-semibold text-white">{t('remediesHeading')}</h5>
          <p className="text-slate-300">{t('remediesNote')}</p>
          {openObjections.map((objection) => {
            const role =
              s.members.find((member) => member.id === objection.actorId)?.role ?? t('adviser');
            return (
              <div key={objection.id} className="space-y-2">
                <p className="text-amber-100">
                  {t('objectionLine', {
                    role,
                    statement: objection.statement,
                    kind: objection.kind,
                  })}
                </p>
                {onReviewObjection && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => onReviewObjection(objection.id)}
                  >
                    {t('reviewRemedy', { role, kind: objection.kind })}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}
      {deliberating && <HandoffEpisodes state={s} report={report} />}
      {deliberating && (
        <div className="space-y-3">
          <h5 className="font-semibold text-white">{t('whichIdea')}</h5>
          {HANDOFF_ARRANGEMENTS.map((a) => (
            <div key={a.id} className="space-y-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                className={`${button} ${i.proposalId === a.id ? 'bg-cyan-900/50' : ''}`}
                aria-pressed={i.proposalId === a.id}
                disabled={!ownsRole(a.author)}
                onClick={() => perform(store.proposeImprovement(a.id, a.author))}
              >
                {a.title}
              </button>
              {i.proposalId === a.id && (
                <p className="font-medium text-cyan-100">{t('selected')}</p>
              )}
              <p>{a.detail}</p>
              <p className="text-xs tabular-nums text-slate-300">
                {t('costLine', {
                  cost: formatFixed(a.cost, 0),
                  briefingMinutes: a.briefingMinutes ? formatFixed(a.briefingMinutes, 0) : '',
                  capacity: formatFixed(a.capacity, 2),
                })}
              </p>
            </div>
          ))}
        </div>
      )}
      {arrangement && (
        <div className="space-y-2">
          <h5 className="font-semibold text-white">{arrangement.title}</h5>
          <p className="tabular-nums">
            {t('reserveLine', {
              cost: formatFixed(summary.cost, 2),
              cash: formatFixed(s.finance.cash, 2),
            })}
          </p>
          {advice ? (
            <FrozenPackingAdvice advice={advice} />
          ) : (
            <p className="text-xs text-slate-300">
              {s.mode === 'game' ? t('hearAdviserHint') : t('workshopNoForecast')}{' '}
              {t('noCapacityBonus')}
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
                  {t('challengeAuthor')}
                  <select
                    aria-label={t('challengeAuthor')}
                    disabled={separateTurns}
                    className={input}
                    value={actor}
                    onChange={(e) => setActor(e.target.value)}
                  >
                    <option value="" disabled>
                      {t('beginTurn')}
                    </option>
                    {[...s.members.map((m) => [m.id, m.role]), ['mind', t('adviser')]].map(
                      ([id, role]) => (
                        <option key={id} value={id}>
                          {role}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label>
                  {t('challengeSubject')}
                  <select
                    aria-label={t('challengeSubject')}
                    className={input}
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value as ImprovementChallenge)}
                  >
                    {IMPROVEMENT_CHALLENGES.map((kind) => (
                      <option key={kind} value={kind}>
                        {t('challengeKind', { kind })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={!actor || !ownsRole(actor)}
                  onClick={() => perform(store.challengeImprovement(actor, challenge))}
                >
                  {t('challengeProposal')}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={!ownsRole('mind') || !mandateReady}
                  onClick={() => perform(store.acknowledgeImprovement())}
                >
                  {t('hearAdviser')}
                </button>
              </div>
            </>
          )}
          {i.challenges.length > 0 && (
            <ul className="list-inside list-disc text-xs text-slate-300">
              {i.challenges.map((c) => (
                <li key={`${c.actorId}-${c.kind}`}>
                  {t('challengeItem', {
                    role: s.members.find((m) => m.id === c.actorId)?.role ?? t('adviser'),
                    kind: c.kind,
                    acknowledged: i.acknowledged,
                  })}
                </li>
              ))}
            </ul>
          )}
          {i.acknowledged && <p className="text-cyan-100">{t('adviserResponse')}</p>}
        </div>
      )}
      {deliberating && i.proposalId && (
        <div className="space-y-3">
          <h5 className="font-semibold text-white">{t('roleDecisionsHeading')}</h5>
          <p className="text-xs text-slate-300">{t('roleDecisionsNote')}</p>
          {s.members.map((m) => (
            <fieldset
              key={m.id}
              disabled={
                store.participationMode === 'separate-turns' && store.turn?.actorId !== m.id
              }
              className="space-y-2 border-t border-slate-800 pt-3"
            >
              <legend className="font-medium text-white">{m.role}</legend>
              <p className="text-xs text-slate-300">{m.publicBoundary}</p>
              <p className="text-cyan-100" aria-live="polite">
                {t('policyBallot', {
                  status: m.ballot === null ? 'pending' : m.ballot ? 'approved' : 'declined',
                })}
                {m.ballot === false && t('ordinaryPayUnchanged')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={!i.acknowledged || m.understood || !mandateReady}
                  onClick={() => perform(store.understand(m.id))}
                >
                  {t('confirmUnderstanding', { role: m.role })}
                </button>
                <button
                  type="button"
                  className={`${button} ${m.ballot === true ? 'bg-cyan-900/50' : ''}`}
                  disabled={!m.understood}
                  aria-pressed={m.ballot === true}
                  onClick={() => perform(store.vote(m.id, true))}
                >
                  {t('approveHandoff', { role: m.role })}
                </button>
                <button
                  type="button"
                  className={`${button} ${m.ballot === false ? 'bg-cyan-900/50' : ''}`}
                  disabled={!m.understood}
                  aria-pressed={m.ballot === false}
                  onClick={() => perform(store.vote(m.id, false))}
                >
                  {t('declineHandoff', { role: m.role })}
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
            disabled={!readiness.allowed || busy || !facilitator}
            onClick={async () => {
              await activate();
              if (useWorkplaceStore.getState().workplace.phase === 'active' && s.mode === 'game')
                useGameSimulationStore.getState().resumeClockFrom('workplace');
            }}
          >
            {busy
              ? t('checkingAgreement')
              : s.mode === 'workshop'
                ? t('recordWorkshop')
                : t('approveAndRun')}
          </button>
        </div>
      )}
      {s.phase === 'active' && s.mode === 'game' && <TeachingPace />}
      {s.phase === 'active' && (
        <div className="space-y-3">
          <p className="tabular-nums">
            {i.stopped
              ? t('arrangementStopped')
              : t('arrangementExpires', {
                  detail:
                    arrangement?.briefingMinutes && s.minute < 5
                      ? t('briefingInProgress')
                      : t('watchLineDispatch'),
                })}
          </p>
          <label>
            {t('stoppingRole')}
            <select
              aria-label={t('stoppingRole')}
              disabled={separateTurns}
              className={input}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              <option value="" disabled>
                {t('beginTurn')}
              </option>
              {[...s.members.map((m) => [m.id, m.role]), ['mind', t('adviser')]].map(
                ([id, role]) => (
                  <option key={id} value={id}>
                    {role}
                  </option>
                )
              )}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={i.stopped || !actor || !ownsRole(actor)}
              onClick={() => perform(store.stopImprovement(actor))}
            >
              {t('stopArrangement')}
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                const result = store.stop();
                perform(result, true);
                // Owed recovery runs only on an explicit resume, so an early
                // stop that owes it waits here instead of under the derived hold.
                if (
                  result.changed &&
                  s.mode === 'game' &&
                  !handoffHoldsClock(useWorkplaceStore.getState().workplace)
                )
                  useGameSimulationStore.getState().holdClock('workplace');
              }}
            >
              {t('endShiftNow')}
            </button>
            {s.mode === 'workshop' && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  store.tick(5, 0, false);
                }}
              >
                {t('advanceRehearsal')}
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
          {t('watchPackingHandoff')}
        </button>
      )}
      <dl className="space-y-1 border-t border-slate-700 pt-3 text-xs tabular-nums">
        <div>
          <dt className="inline text-slate-300">{t('actualDispatch')}</dt>
          <dd className="inline">
            {t('kgValue', { kg: formatFixed(s.shippedKg, 0) })}
            {s.mode === 'workshop' && t('workshopNoShipment')}
          </dd>
        </div>
        {summary.remainingKg !== null && (
          <div>
            <dt className="inline text-slate-300">{t('commitmentRemaining')}</dt>
            <dd className="inline">
              {t('commitmentValue', {
                kg: formatFixed(summary.remainingKg, 0),
                evidence: summary.mission?.evidence ?? '',
              })}
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-slate-300">{t('paidThisShift')}</dt>
          <dd className="inline">
            {t('paidValue', {
              wages: formatFixed(s.finance.wagesPaid, 2),
              spend: formatFixed(s.finance.improvementSpend, 2),
              cash: formatFixed(s.finance.cash, 2),
            })}
          </dd>
        </div>
        <div>
          <dt className="inline text-slate-300">{t('retainedPay')}</dt>
          <dd className="inline">
            {t('retainedPayValue', {
              wages: formatFixed(summary.lifetimeWages, 2),
              compensation: formatFixed(summary.lifetimeCompensation, 2),
            })}
          </dd>
        </div>
      </dl>
      {s.phase === 'review' && (
        <div className="space-y-3 border-t border-slate-700 pt-4">
          <h5 className="font-semibold text-white">{t('carryHeading')}</h5>
          {learning && (
            <section aria-label={t('learningLabel')} className="space-y-2">
              <h5 className="font-semibold text-white">{t('learningHeading')}</h5>
              <ul className="list-disc space-y-1 pl-4 text-xs tabular-nums text-slate-300">
                {learning.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-300">{learning.limitation}</p>
              <p className="text-cyan-100">{learning.question}</p>
              {s.mode === 'game' && (
                <>
                  <p className="text-xs text-slate-300">{t('comparisonNote')}</p>
                  <MatchedPackingRehearsal state={s} report={report} />
                </>
              )}
            </section>
          )}
          <button
            type="button"
            className={button}
            disabled={i.reviewAcknowledged || !ownsRole('mind')}
            onClick={() => perform(store.acknowledgeImprovementReview())}
          >
            {t('hearForecastReview')}
          </button>
          {i.reviewAcknowledged && (
            <p className="text-cyan-100">
              {t('adviserQuoteOpen')}
              {advice
                ? advice.reasonToAbstain
                  ? t('abstainedReview')
                  : t('forecastReview', {
                      speed: Number.isInteger(advice.evidence.gameSpeed)
                        ? formatFixed(advice.evidence.gameSpeed, 0)
                        : String(advice.evidence.gameSpeed),
                      kg: formatFixed(s.shippedKg, 0),
                      within: s.shippedKg <= advice.dispatchUpperKg,
                    })
                : t('teachingForecastReview')}{' '}
              {t('adviserQuoteClose')}
            </p>
          )}
          {obligations.map((reason) => (
            <p key={reason} className="text-amber-100">
              {reason}
            </p>
          ))}
          {!i.verdict &&
            s.members.map((m) => (
              <label key={m.id} className="block">
                {t('reviewDecision', { role: m.role })}
                <select
                  aria-label={t('reviewDecision', { role: m.role })}
                  className={input}
                  disabled={!i.reviewAcknowledged || !ownsRole(m.id)}
                  value={i.ballots[m.id] ?? ''}
                  onChange={(e) =>
                    perform(store.voteImprovementReview(m.id, e.target.value as ImprovementVerdict))
                  }
                >
                  <option value="" disabled>
                    {t('chooseReviewDecision')}
                  </option>
                  <option value="adopt" disabled={i.stopped || !i.funded || s.minute !== 90}>
                    {t('verdictAdopt')}
                  </option>
                  <option value="amend">{t('verdictAmend')}</option>
                  <option value="stop">{t('verdictStop')}</option>
                </select>
              </label>
            ))}
          {!i.verdict ? (
            <button
              type="button"
              className={button}
              disabled={!winner || !i.reviewAcknowledged || !facilitator || obligations.length > 0}
              onClick={() => perform(store.finishImprovementReview(s.revision))}
            >
              {t('finaliseReview')}
            </button>
          ) : (
            <>
              <p className="font-medium text-white">
                {t('reviewRecorded', { verdict: i.verdict })}
              </p>
              {/* A finalised review releases the plant clock (UnifiedGameTick).
                  Working if the panel says the experiment is over and offers the
                  plant pace here, with another handoff shift left optional. */}
              <p className="text-cyan-100">
                {s.mode === 'game' ? t('completeGame') : t('completeWorkshop')}
              </p>
              {s.mode === 'game' && <TeachingPace />}
              <button
                type="button"
                className={button}
                disabled={!facilitator || i.history.length + 1 >= MAX_IMPROVEMENT_CYCLES}
                onClick={() => perform(store.continueImprovement(s.revision), true)}
              >
                {t('openNextShift')}
              </button>
              {/* Every decided shift can end here, the eighth included. */}
              <button
                type="button"
                className={button}
                disabled={!facilitator || obligations.length > 0}
                onClick={() => perform(store.closeImprovement(s.revision), true)}
              >
                {t('closeExperiment')}
              </button>
              <p className="text-xs text-slate-300">{t('closeNote')}</p>
            </>
          )}
        </div>
      )}
      {s.phase === 'review' && <HandoffConduct state={s} />}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          {t('earlierDecisions')}
        </summary>
        <p className="text-xs text-slate-300">
          {t('originNote', { cash: formatFixed(i.origin.finance.cash, 2) })}
        </p>
        {summary.history.map((h) => (
          <p key={h.cycle} className="mt-2 text-xs tabular-nums">
            {t('historyLine', {
              cycle: formatFixed(h.cycle, 0),
              proposal: h.proposalId ?? '',
              verdict: h.verdict ?? '',
              kg: formatFixed(h.shippedKg, 0),
              wages: formatFixed(h.wages, 2),
              spend: formatFixed(h.spend, 2),
              cash: formatFixed(h.closingCash, 2),
            })}
          </p>
        ))}
      </details>
    </section>
  );
}
