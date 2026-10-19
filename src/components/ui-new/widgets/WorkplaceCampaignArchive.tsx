import { useState } from 'react';
import { pendingFollowOn, useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { exportWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import { improvementObligations } from '../../../simulation/workplaceImprovement';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import type { WorkplaceState } from '../../../types/workplace';
import { formatFixed, useT } from '../../../i18n';
import { workplaceCampaignArchiveMessages } from './WorkplaceCampaignArchive.messages';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

function ReviewRecord({ state, left = false }: { state: WorkplaceState; left?: boolean }) {
  const t = useT(workplaceCampaignArchiveMessages);
  const outcome = campaignOutcomes(state);
  const totals = campaignTotals(state);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportWorkplace(state), null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `millos-${left ? 'left' : 'completed'}-campaign-${state.seed}-r${state.revision}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="border-t border-slate-700 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-cyan-100">
        {left
          ? t('leftSummary', {
              shift: formatFixed((state.campaign?.shift ?? 0) + 1, 0),
              seed: String(state.seed),
            })
          : t('reviewSummary', {
              profile: state.campaign?.profile ?? '',
              seed: String(state.seed),
              delivery: outcome.delivery.status,
              agreement: outcome.agreement.status,
            })}
      </summary>
      <div className="space-y-2 pb-2 tabular-nums">
        <p>
          {t('dispatched', {
            delivered: formatFixed(outcome.delivery.deliveredKg, 1),
            target: formatFixed(outcome.delivery.targetKg, 0),
            remaining: formatFixed(outcome.delivery.remainingKg, 0),
          })}
        </p>
        <p>
          {t('accounts', {
            cash: formatFixed(outcome.accounts.closingCash, 2),
            wages: formatFixed(outcome.accounts.wages, 2),
            compensation: formatFixed(outcome.accounts.compensation, 2),
          })}
        </p>
        {totals.members.map((member) => (
          <p key={member.id}>
            {t('memberLine', {
              role: member.role,
              extra: formatFixed(member.extraMinutes, 1),
              rest: formatFixed(member.restMinutes, 1),
              recovery: formatFixed(member.recoveryMinutes, 1),
              owed: formatFixed(member.recoveryOwedMinutes, 1),
            })}
          </p>
        ))}
        <p>{state.reviewReason}</p>
        <button type="button" className={buttonClass} onClick={download}>
          {t('download')}
        </button>
      </div>
    </details>
  );
}

/**
 * Leaving a season says what it keeps before anyone presses it, and keeps the
 * plant running. Working if a debt-free season ends at idle with its receipts
 * kept as left early, and the customer and programme locks open again.
 */
/**
 * What happens to the season's earning link next. A follow-on order whose
 * evidence went bad stops earning; the next shift links the mill's open
 * active order in its place when there is one (pendingFollowOn).
 * Working if a stopped follow-on says why, and what replaces it or that
 * nothing can yet, in either language.
 */
export function FollowOnNotice({ state }: { state: WorkplaceState }) {
  const t = useT(workplaceCampaignArchiveMessages);
  // Re-read as orders move, so the named replacement is the one the shift links.
  const next = useOperationsCampaignStore(() => pendingFollowOn(state)?.customer ?? null);
  const followOn = state.campaign?.followOn;
  if (!followOn || followOn.evidence === 'current') return null;
  return (
    <p>
      {t('followOnStopped', { customer: followOn.customer, evidence: followOn.evidence })}{' '}
      {next
        ? t('followOnReplacement', { customer: next })
        : t(state.campaign!.shift >= 2 ? 'followOnLastShift' : 'followOnNoReplacement')}
    </p>
  );
}

export function WorkplaceLeaveSeason({ onLeft }: { onLeft?: (message: string) => void }) {
  const t = useT(workplaceCampaignArchiveMessages);
  const state = useWorkplaceStore((store) => store.workplace);
  const leave = useWorkplaceStore((store) => store.leaveCampaign);
  const replayActive = useWorkplaceReplayStore((store) => store.activeRunId !== null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const campaign = state.campaign;
  const status = feedback && (
    <p role="status" className="text-amber-100">
      {feedback}
    </p>
  );
  if (
    state.mode !== 'game' ||
    !campaign ||
    state.improvement ||
    (state.phase === 'review' && campaign.shift === 2)
  )
    return status || null;
  const outcome = campaignOutcomes(state);
  const totals = campaignTotals(state);
  const obligations = improvementObligations(state);
  const waiting =
    state.phase === 'active'
      ? t('leaveWaitActive')
      : replayActive
        ? t('blockedReplay')
        : obligations.length > 0
          ? t('leaveWaitObligations', { reasons: obligations.join(' ') })
          : null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={buttonClass}
        disabled={waiting !== null}
        onClick={() => {
          // The plant keeps its pace: stopping the demo here holds nothing.
          useWorkplaceAutoplay.getState().pause(true);
          const shift = formatFixed(campaign.shift + 1, 0);
          const result = leave(state.revision);
          const message = result.changed ? t('leftFeedback', { shift }) : (result.reason ?? '');
          setFeedback(message);
          if (result.changed) onLeft?.(message);
        }}
      >
        {t('leaveButton')}
      </button>
      <p className="text-slate-300">
        {waiting ??
          t('leaveKept', {
            kg: formatFixed(outcome.delivery.deliveredKg, 0),
            customer: outcome.delivery.customer,
            pay: formatFixed(outcome.accounts.wages + outcome.accounts.compensation, 2),
            recovery: formatFixed(
              totals.members.reduce((sum, member) => sum + member.recoveryMinutes, 0),
              0
            ),
          })}
      </p>
      {status}
    </div>
  );
}

/** Retained reviews carry evidence only, never votes or authority for a new exercise. */
export function WorkplaceCampaignArchive({ onFreshExercise }: { onFreshExercise: () => void }) {
  const t = useT(workplaceCampaignArchiveMessages);
  const state = useWorkplaceStore((store) => store.workplace);
  const reviews = useWorkplaceStore((store) => store.completedCampaigns);
  const left = useWorkplaceStore((store) => store.leftCampaigns);
  const archive = useWorkplaceStore((store) => store.archiveCampaign);
  const replayActive = useWorkplaceReplayStore((store) => store.activeRunId !== null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const finalReview = state.phase === 'review' && state.campaign?.shift === 2;
  if (!finalReview && reviews.length === 0 && left.length === 0) return null;
  const blocked =
    replayActive ||
    state.members.some((member) => member.recoveryOwedMinutes > 0) ||
    state.campaign?.history.some((shift) =>
      shift.members.some((member) => member.recoveryOwedMinutes > 0)
    ) ||
    state.objections.some((objection) => objection.status === 'open') ||
    state.finance.wageReserve > 0 ||
    state.finance.compensationReserve > 0 ||
    state.activeCoverMemberId !== null ||
    state.coverRemainingMinutes > 0;
  const beginFresh = () => {
    const result = archive(state.revision);
    setFeedback(result.reason);
    if (result.changed) onFreshExercise();
  };
  return (
    <section aria-label={t('regionLabel')} className="space-y-2 text-sm leading-relaxed">
      {finalReview && (
        <div className="space-y-2 border-t border-slate-700 pt-4">
          <h4 className="font-semibold text-white">{t('freshHeading')}</h4>
          <p>{t('freshIntro')}</p>
          <p>{t('freshCredits')}</p>
          <button type="button" className={buttonClass} disabled={blocked} onClick={beginFresh}>
            {t('archiveButton')}
          </button>
          {blocked && (
            <p className="text-amber-100">
              {replayActive ? t('blockedReplay') : t('blockedObligations')}
            </p>
          )}
        </div>
      )}
      {feedback && (
        <p role="status" className="text-amber-100">
          {feedback}
        </p>
      )}
      {left.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-cyan-100">
            {t('leftSeasons', { count: formatFixed(left.length, 0) })}
          </summary>
          <p className="pb-2 text-slate-300">{t('leftNote')}</p>
          {[...left].reverse().map((review) => (
            <ReviewRecord key={`${review.seed}-${review.revision}`} state={review} left />
          ))}
        </details>
      )}
      {reviews.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-cyan-100">
            {t('retainedReviews', { count: formatFixed(reviews.length, 0) })}
          </summary>
          <p className="pb-2 text-slate-300">{t('retainedNote')}</p>
          {[...reviews].reverse().map((review) => (
            <ReviewRecord key={`${review.seed}-${review.revision}`} state={review} />
          ))}
        </details>
      )}
    </section>
  );
}
