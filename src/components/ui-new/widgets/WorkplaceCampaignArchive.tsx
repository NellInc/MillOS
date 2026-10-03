import { useState } from 'react';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { exportWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import type { WorkplaceState } from '../../../types/workplace';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

function ReviewRecord({ state }: { state: WorkplaceState }) {
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
        {state.campaign?.profile}, seed {state.seed}: delivery {outcome.delivery.status}, agreement{' '}
        {outcome.agreement.status}
      </summary>
      <div className="space-y-2 pb-2 tabular-nums">
        <p>
          Dispatched {outcome.delivery.deliveredKg.toFixed(1)} /{' '}
          {outcome.delivery.targetKg.toFixed(0)} kg. Full commitment remaining:{' '}
          {outcome.delivery.remainingKg.toFixed(0)} kg.
        </p>
        <p>
          Illustrative credits: closing cash {outcome.accounts.closingCash.toFixed(2)}; wages paid{' '}
          {outcome.accounts.wages.toFixed(2)}; compensation paid{' '}
          {outcome.accounts.compensation.toFixed(2)}.
        </p>
        {totals.members.map((member) => (
          <p key={member.id}>
            {member.role}: extra duty {member.extraMinutes.toFixed(1)} min; rest{' '}
            {member.restMinutes.toFixed(1)} min; recovery delivered{' '}
            {member.recoveryMinutes.toFixed(1)} min; recovery owed{' '}
            {member.recoveryOwedMinutes.toFixed(1)} min.
          </p>
        ))}
        <p>{state.reviewReason}</p>
        <button type="button" className={buttonClass} onClick={download}>
          Download this redacted review
        </button>
      </div>
    </details>
  );
}

/** Retained reviews carry evidence only, never votes or authority for a new exercise. */
export function WorkplaceCampaignArchive({ onFreshExercise }: { onFreshExercise: () => void }) {
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
    <section
      aria-label="Completed workplace campaigns"
      className="space-y-2 text-sm leading-relaxed"
    >
      {finalReview && (
        <div className="space-y-2 border-t border-slate-700 pt-4">
          <h4 className="font-semibold text-white">Keep the review, try another charter</h4>
          <p>
            Archive these three shifts before opening a fresh exercise. Earned pay, delivered
            recovery and shortfalls stay in the review. New terms need new role understanding,
            ballots and individual consent.
          </p>
          <p>
            Each exercise opens with 400 illustrative credits. Mill inventory, customer commitments
            and physical production continue unchanged.
          </p>
          <button type="button" className={buttonClass} disabled={blocked} onClick={beginFresh}>
            Archive review and open a fresh exercise
          </button>
          {blocked && (
            <p className="text-amber-100">
              {replayActive
                ? 'Finish or forget the matched replay first.'
                : 'Deliver owed recovery and settle open objections and reserved pay first.'}
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
            Retained campaign reviews ({reviews.length})
          </summary>
          <p className="pb-2 text-slate-300">
            The last six reviews stay on this browser, with private preferences redacted. Download
            any review you want to keep longer. A historical review cannot restart an agreement.
          </p>
          {[...reviews].reverse().map((review) => (
            <ReviewRecord key={`${review.seed}-${review.revision}`} state={review} />
          ))}
        </details>
      )}
    </section>
  );
}
