import { useRef, useState } from 'react';
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
import {
  exportWorkplaceReplayReport,
  selectReplayRunLive,
  useWorkplaceReplayStore,
} from '../../../stores/workplaceReplayStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore, workplaceReasonText } from '../../../stores/workplaceStore';
import {
  PRACTICES,
  WORKPLACE_PLANS,
  displayEventDetail,
  workplaceActorName,
} from '../../../simulation/bilateralWorkplace';
import { replayLearningReview } from '../../../simulation/workplaceFairness';
import { formatKg } from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile, WorkplaceTransitionResult } from '../../../types/workplace';
import { formatFixed, useT } from '../../../i18n';
import { formatPlantStamp } from '../../../utils/timeFormatting';
import { workplaceReplayMessages } from './WorkplaceReplay.messages';
// Breakdown type labels already live with the maintenance panel's catalogue.
import { predictiveMaintenancePanelMessages } from '../../ui/PredictiveMaintenancePanel.messages';

const buttonClass =
  'min-h-9 rounded-md border border-cyan-300/25 px-2 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const profiles: WorkplaceProfile[] = ['toe-dip', 'team', 'cooperative'];
/** Locale-aware String(n): English prints exactly what String(n) printed. */
const formatPlain = (n: number) => formatFixed(n, (String(n).split('.')[1] ?? '').length);
export type WorkplaceSection =
  | 'Shift'
  | 'Practices'
  | 'Agreement / Voices'
  | 'Review'
  | 'Experiment';

export function WorkplaceReplay({
  seed,
  validSeed,
  navigate,
}: {
  seed: number;
  validSeed: boolean;
  navigate: (section: WorkplaceSection) => void;
}) {
  const t = useT(workplaceReplayMessages);
  const tFault = useT(predictiveMaintenancePanelMessages);
  const replay = useWorkplaceReplayStore();
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  // Kept keyed and resolved at render, so the status line follows a language
  // switch. Working if a refused capture reads in the language chosen after.
  const [feedback, setFeedback] = useState<
    | WorkplaceTransitionResult
    | { key: 'recordedLocally' | 'forgotten' | 'noChange' | 'reportDownloaded' }
    | null
  >(null);
  const feedbackText =
    feedback === null ? null : 'key' in feedback ? t(feedback.key) : workplaceReasonText(feedback);
  const captureRef = useRef<HTMLButtonElement>(null);
  const report = (
    result: WorkplaceTransitionResult,
    success: 'recordedLocally' | 'forgotten' = 'recordedLocally'
  ) => {
    setFeedback(result.reason ? result : { key: result.changed ? success : 'noChange' });
    return result.changed;
  };
  const begin = (profile: WorkplaceProfile) => {
    if (report(replay.begin(profile))) navigate('Shift');
  };
  const guide = () => {
    if (!validSeed) return;
    // The capture needs a paused plant, so the guide holds a running one first.
    // Working if a refused guided replay leaves the clock as it found it.
    const clock = useGameSimulationStore.getState();
    // A pre-existing pause needs no new owner. Failed entry releases only the
    // hold this attempt acquired; newer independent holds keep their place.
    const running = clock.gameSpeed > 0;
    if (running) clock.holdClock('workplace');
    const acquired = running ? useGameSimulationStore.getState().clockHolds.at(-1) : undefined;
    if (!report(replay.capture(seed))) {
      if (acquired) useGameSimulationStore.getState().releaseClock('workplace', acquired);
      return;
    }
    if (!report(useWorkplaceReplayStore.getState().begin('toe-dip'))) {
      if (acquired) useGameSimulationStore.getState().releaseClock('workplace', acquired);
      return;
    }
    useWorkplaceReplayStore.getState().setGuided(true);
    navigate('Shift');
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([exportWorkplaceReplayReport()], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'millos-workplace-replay-report.json';
    link.click();
    URL.revokeObjectURL(url);
    setFeedback({ key: 'reportDownloaded' });
  };
  const learning = replayLearningReview(replay.runs);
  return (
    <section
      aria-label={t('title')}
      className="min-w-0 space-y-3 break-words border-b border-slate-700 pb-4"
    >
      <h4 className="font-semibold text-white">{t('title')}</h4>
      <p>{t('intro')}</p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={gameSpeed === 0}
          onClick={() => {
            useGameSimulationStore.getState().setGameSpeed(0);
            // Pausing disables this control with focus on it, which a browser
            // drops to <body> (Space = forklift emergency stop). Capture is
            // the next step. Working if Tab and Space continue from Capture.
            requestAnimationFrame(() => {
              const active = document.activeElement as HTMLButtonElement | null;
              if (active && active !== document.body && !active.disabled) return;
              captureRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          {t('pauseForCapture')}
        </button>
        <button
          ref={captureRef}
          className={buttonClass}
          disabled={!validSeed}
          onClick={() => report(replay.capture(seed))}
        >
          {t('capturePaused')}
        </button>
        <button className={buttonClass} disabled={!validSeed} onClick={guide}>
          {t('startGuided')}
        </button>
      </div>
      <p>{t('captureRequires')}</p>
      {feedbackText && (
        <p role="status" className="break-words text-amber-100">
          {feedbackText}
        </p>
      )}
      {replay.checkpoint ? (
        <div className="space-y-2">
          <p className="tabular-nums">
            {t('checkpointLine', {
              customer: replay.checkpoint.customer,
              // Grouped like every other kilogram figure in the laboratory.
              remaining: formatKg(replay.checkpoint.remainingKg, 1),
              source: formatKg(replay.checkpoint.sourceKg, 1),
              // The plant clock as every other stamp reads it ("Day 1, 14:30").
              stamp:
                formatPlantStamp({
                  day: replay.checkpoint.gameDay,
                  hour: replay.checkpoint.gameTime,
                }) ?? '',
              seed: String(replay.checkpoint.seed),
              faults:
                replay.checkpoint.faults
                  .map((fault) =>
                    t('faultLine', {
                      machine: fault.machineName,
                      type: tFault('failureType', { type: fault.type }),
                    })
                  )
                  .join(', ') || t('none'),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.map((profile) => (
              <button key={profile} className={buttonClass} onClick={() => begin(profile)}>
                {t('replayCharter', { profile: t('profileLabel', { profile }) })}
              </button>
            ))}
            <button className={buttonClass} onClick={() => report(replay.record())}>
              {t('retainReview')}
            </button>
            <button
              className={buttonClass}
              onClick={() => {
                // Forgetting removes this control with focus on it; Capture stays.
                if (report(replay.forget(), 'forgotten'))
                  requestAnimationFrame(() => {
                    if (document.activeElement === document.body)
                      captureRef.current?.focus({ preventScroll: true });
                  });
              }}
            >
              {t('forget')}
            </button>
          </div>
          <p>{t('replayNote')}</p>
        </div>
      ) : (
        <p>{t('noCheckpoint')}</p>
      )}
      {learning?.horizonsDiffer && <p className="text-amber-100">{t('unequalHorizons')}</p>}
      {learning && (
        <details className="space-y-2">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
            {t('discussEvidence')}
          </summary>
          <div role="group" aria-label={t('learningReview')} className="space-y-3">
            {learning.caveats.length > 0 && (
              <ul className="list-disc space-y-2 pl-4 text-amber-100">
                {learning.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            )}
            <p className="text-cyan-100">{learning.question}</p>
            <p>{t('hearRoles')}</p>
          </div>
        </details>
      )}
      {replay.runs.map((run) => (
        <article
          key={run.id}
          aria-label={t('runLabel', { profile: t('profileLabel', { profile: run.profile }) })}
          className="min-w-0 space-y-2 border-t border-slate-700 pt-3"
        >
          <h5 className="font-semibold text-white">
            {t('profileLabel', { profile: run.profile })}:{' '}
            {WORKPLACE_PLANS.find((plan) => plan.id === run.planId)?.title ?? run.planId}
          </h5>
          <p>
            {t('charterLine', {
              autonomy: t('autonomyLabel', { value: run.charter.workerAutonomy }),
              governance: t('governanceLabel', { value: run.charter.governance }),
              ai: t('aiAuthorityLabel', { value: run.charter.aiAuthority }),
              practices:
                run.charter.practices
                  .map((id) => PRACTICES.find((practice) => practice.id === id)?.title ?? id)
                  .join(', ') || t('none'),
            })}
          </p>
          <p>
            {t('shiftPlans', {
              plans: run.shiftPlans
                .map((shift) =>
                  t('shiftPlanItem', {
                    number: formatFixed(shift.shift + 1, 0),
                    title:
                      WORKPLACE_PLANS.find((plan) => plan.id === shift.planId)?.title ??
                      shift.planId,
                  })
                )
                .join('; '),
            })}
          </p>
          <dl className="space-y-2 tabular-nums">
            <div>
              <dt className="font-medium text-slate-100">{t('dispatchHeading')}</dt>
              <dd>
                {t('dispatchLine', {
                  dispatched: formatKg(run.dispatchedKg, 1),
                  remaining: formatKg(run.remainingKg, 1),
                  target: formatKg(run.targetKg, 1),
                  deferred: formatKg(run.deferredKg, 1),
                  shiftCount: run.shiftCount,
                  shifts: formatPlain(run.shiftCount),
                  elapsed: formatFixed(run.elapsedMinutes, 1),
                  agreement: formatFixed(run.agreementMinutes, 1),
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">{t('plantAccounts')}</dt>
              <dd>
                {t('revenueLine', {
                  revenue: formatFixed(run.financial.plantRevenue, 2),
                  costs: formatFixed(run.financial.plantCosts, 2),
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">{t('workplaceCredits')}</dt>
              <dd>
                {t('creditsLine', {
                  wages: formatFixed(run.financial.workplaceWages, 2),
                  compensation: formatFixed(run.financial.compensation, 2),
                  improvements: formatFixed(run.financial.improvements, 2),
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-100">{t('conservationHeading')}</dt>
              <dd>
                {t('conservationLine', {
                  material: formatFixed(run.materialErrorKg, 3),
                  genealogy: formatFixed(run.genealogyErrorKg, 3),
                  manifestCount: run.manifestIds.length,
                  manifests: formatFixed(run.manifestIds.length, 0),
                })}
              </dd>
            </div>
          </dl>
          <p>
            {t('conductLine', {
              refusals: formatPlain(run.refusalsRespected),
              promises: formatPlain(run.promisesKept),
              resolved: formatPlain(run.objectionsResolved),
              raised: formatPlain(run.objectionsRaised),
              open: formatFixed(run.objections.filter((item) => item.status === 'open').length, 0),
            })}
          </p>
          <details>
            <summary className="cursor-pointer text-cyan-100">{t('burdensSummary')}</summary>
            <div className="mt-2 space-y-2">
              {run.members.map((member) => (
                <p key={member.id} className="tabular-nums">
                  {t('memberLine', {
                    // Stored as text when retained; named now, in the language chosen.
                    role:
                      workplaceActorName(member.id) === member.id
                        ? member.role
                        : workplaceActorName(member.id),
                    extra: formatFixed(member.extraMinutes, 1),
                    rest: formatFixed(member.restMinutes, 1),
                    recovery: formatFixed(member.recoveryMinutes, 1),
                    owed: formatFixed(member.recoveryOwedMinutes, 1),
                    earned: formatFixed(member.earnedPay, 2),
                    compensation: formatFixed(member.compensationPaid, 2),
                    refusal: member.refusalRespected
                      ? t('refusalRespected')
                      : t('refusalNotRecorded'),
                  })}
                </p>
              ))}
              {run.receipts.map((receipt) => (
                <div key={receipt.shift}>
                  <p>{t('shiftNumber', { number: formatFixed(receipt.shift + 1, 0) })}</p>
                  {receipt.events === null ? (
                    <p>{t('noReceipts')}</p>
                  ) : (
                    <ol className="list-disc space-y-1 pl-4">
                      {receipt.events.map((event) => (
                        <li key={event.id} className="break-words">
                          {t('eventLine', {
                            minute: formatFixed(event.minute, 1),
                            actor: workplaceActorName(event.actorId),
                            detail: displayEventDetail(event.detail),
                          })}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
      {replay.runs.length > 0 && (
        <button className={buttonClass} onClick={download}>
          {t('downloadReport')}
        </button>
      )}
      <p>{t('closingNote')}</p>
    </section>
  );
}

export function WorkplaceReplayGuide({
  section,
  navigate,
  onClosed,
}: {
  section: WorkplaceSection;
  navigate: (section: WorkplaceSection) => void;
  /** The guide unmounts with focus inside it; the host gives focus a place. */
  onClosed?: () => void;
}) {
  const t = useT(workplaceReplayMessages);
  const guided = useWorkplaceReplayStore((state) => state.guided);
  const workplace = useWorkplaceStore((state) => state.workplace);
  if (!guided || section === 'Experiment') return null;
  const copy: Record<Exclude<WorkplaceSection, 'Experiment'>, string> = {
    Shift: t('guideShift'),
    Practices: t('guidePractices'),
    'Agreement / Voices': t('guideAgreement'),
    Review: t('guideReview'),
  };
  return (
    <aside aria-label={t('guideLabel')} className="space-y-2 border-y border-slate-700 py-3">
      <h4 className="font-semibold text-white">
        {t('guideHeading', { section: t('sectionLabel', { section }) })}
      </h4>
      <p>{copy[section]}</p>
      {section === 'Shift' && (
        <ul className="list-disc space-y-1 pl-4">
          {WORKPLACE_PLANS.filter((plan) => !plan.illegalReason).map((plan) => (
            <li key={plan.id}>
              {t('planLine', {
                title: plan.title,
                pacing: formatFixed(plan.capacity * 100, 0),
                budget: formatPlain(plan.budgetCost),
                rest: formatPlain(plan.protectedRestMinutes),
              })}
              {plan.optionalCoverMinutes > 0 &&
                t('planCover', {
                  cover: formatPlain(plan.optionalCoverMinutes),
                  rate: formatPlain(plan.compensationPerMinute),
                  recovery: formatPlain(plan.recoveryMinutes),
                })}
            </li>
          ))}
        </ul>
      )}
      {workplace.phase === 'active' && <p>{t('activeNote')}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          onClick={() =>
            navigate(
              section === 'Shift'
                ? 'Practices'
                : section === 'Practices'
                  ? 'Agreement / Voices'
                  : section === 'Agreement / Voices'
                    ? 'Review'
                    : 'Experiment'
            )
          }
        >
          {t('nextSection')}
        </button>
        <button
          className={buttonClass}
          onClick={() => {
            useWorkplaceReplayStore.getState().setGuided(false);
            onClosed?.();
          }}
        >
          {t('endGuide')}
        </button>
      </div>
      <p>{t('optionalNavigation')}</p>
    </aside>
  );
}

export function WorkplaceReplayResume({ onResumed }: { onResumed?: () => void } = {}) {
  const t = useT(workplaceReplayMessages);
  // A retained run's season is ordinary play: its later shifts are not a replay.
  const live = useWorkplaceReplayStore(selectReplayRunLive);
  const phase = useWorkplaceStore((state) => state.workplace.phase);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  if (!live || phase !== 'active' || gameSpeed !== 0) return null;
  return (
    <button
      className={buttonClass}
      onClick={() => {
        if (
          selectReplayRunLive(useWorkplaceReplayStore.getState()) &&
          useWorkplaceStore.getState().workplace.phase === 'active' &&
          useGameSimulationStore.getState().gameSpeed === 0
        ) {
          // The button names its pace, so it sets it: an explicit choice.
          useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
          // The button hides once the plant runs, with focus on it.
          onResumed?.();
        }
      }}
    >
      {t('resume')}
    </button>
  );
}
