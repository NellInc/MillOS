import { useState } from 'react';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { exportWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import type { WorkplaceState } from '../../../types/workplace';
import { formatFixed, useT } from '../../../i18n';
import { workplaceCampaignArchiveMessages } from './WorkplaceCampaignArchive.messages';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

function ReviewRecord({ state }: { state: WorkplaceState }) {
  const t = useT(workplaceCampaignArchiveMessages);
  const outcome = campaignOutcomes(state);
  const totals = campaignTotals(state);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportWorkplace(state), null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `millos-completed-campaign-${state.seed}-r${state.revision}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="border-t border-slate-700 py-2">
      <summary className="min-h-11 cursor-pointer py-2 text-cyan-100">
        {t('reviewSummary', {
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

/** Retained reviews carry evidence only, never votes or authority for a new exercise. */
export function WorkplaceCampaignArchive({ onFreshExercise }: { onFreshExercise: () => void }) {
  const t = useT(workplaceCampaignArchiveMessages);
  const state = useWorkplaceStore((store) => store.workplace);
  const reviews = useWorkplaceStore((store) => store.completedCampaigns);
  const archive = useWorkplaceStore((store) => store.archiveCampaign);
  const replayActive = useWorkplaceReplayStore((store) => store.activeRunId !== null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const finalReview = state.phase === 'review' && state.campaign?.shift === 2;
  if (!finalReview && reviews.length === 0) return null;
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
