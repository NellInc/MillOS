import type { WorkplaceState } from '../../../types/workplace';
import { exportPracticeProposal, WORKPLACE_PLANS } from '../../../simulation/bilateralWorkplace';
import { thursdayNegotiation } from '../../../simulation/workplaceCampaign';

/** Public, read-only staging of the real Thursday transitions. */
export function WorkplaceNegotiation({ state }: { state: WorkplaceState }) {
  const moment = thursdayNegotiation(state);
  if (!moment) return null;
  const offer = WORKPLACE_PLANS.find((plan) => plan.id === state.planId)!;
  const open = state.objections.filter((item) => item.status === 'open');
  const adviser = open.length
    ? 'I recommend holding execution until each raiser reviews the remedy. I cannot close their objection.'
    : offer.illegalReason
      ? 'I cannot recommend this offer: it breaches protected rest. A unanimous vote cannot waive that boundary.'
      : !moment.correction
        ? 'My earlier offer reused consent. It needs an explicit correction before a fresh agreement.'
        : state.planId === 'cover'
          ? 'I recommend offering cover only to a currently consenting qualified volunteer. A policy yes grants no extra duty.'
          : `I recommend the current ${offer.title.toLowerCase()} offer for review. It keeps extra duty at zero and preserves protected rest.`;
  const stages = [
    ['Offer', `${offer.title}. Earlier willingness grants no new duty.`],
    [
      'Challenge',
      moment.challenge === 'prevented'
        ? 'Boundary protected before any challenge; no objection was resolved.'
        : moment.challenge === 'not raised'
          ? 'No challenge recorded. You can protect the boundary directly.'
          : `Challenge status: ${moment.challenge}. Packing retains remedy review.`,
    ],
    [
      'Revised terms',
      moment.correction
        ? 'The adviser corrected reused consent. This receipt grants no new permission.'
        : 'Adviser correction still pending. Past agreement cannot supply today’s choices.',
    ],
    [
      'Fresh decisions',
      `Understanding ${moment.understanding}; policy ${moment.policy}; optional cover ${moment.cover}.`,
    ],
    [
      'Physical work',
      `Dispatch ${moment.delivery.deliveredKg.toFixed(0)} / ${moment.delivery.targetKg.toFixed(0)} kg; ${moment.delivery.status}. Changed promises never create delivery.`,
    ],
    [
      'Repayment',
      `${moment.paid.toFixed(2)} credits paid; recovery ${moment.delivered.toFixed(1)} min delivered, ${moment.owed.toFixed(1)} min owed.`,
    ],
  ];
  return (
    <section aria-label="Thursday negotiation" className="space-y-3 border-t border-slate-700 pt-4">
      <h5 className="font-semibold text-white">Your choices, this shift</h5>
      <p className="text-cyan-100">{moment.next}</p>
      <dl className="grid grid-cols-1 gap-2 text-xs leading-5 min-[400px]:grid-cols-3 min-[400px]:gap-3">
        {[
          ['Understanding', moment.understanding],
          ['Policy vote', moment.policy],
          ['Optional cover', moment.cover],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 min-[400px]:block">
            <dt className="text-slate-300">{label}</dt>
            <dd className="font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-5 text-slate-300">
        Packing has carried {moment.retainedPacking.extraMinutes.toFixed(1)} min of extra duty. This
        offer permits at most {offer.optionalCoverMinutes} min, with{' '}
        {offer.compensationPerMinute.toFixed(2)} credits/min and {offer.recoveryMinutes} min
        recovery. These are terms offered, separate from actual payment and recovery.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          Offer, choices and receipts
        </summary>
        <ol className="space-y-3 pb-2" aria-label="Negotiation sequence">
          {stages.map(([label, detail]) => (
            <li key={label}>
              <strong className="text-white">{label}</strong>
              <p className="mt-1 text-slate-300">{detail}</p>
            </li>
          ))}
        </ol>
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <h6 className="font-semibold text-white">Adviser proposal</h6>
          <p>{adviser}</p>
          <p className="text-slate-300">
            Dispatch remains uncertain until quality-qualified manifests arrive. Supply, inspection
            and logistics can limit the result. You can challenge my authority in Agreement /
            Voices; I can raise the same boundary there.
          </p>
          <p className="tabular-nums text-slate-300">
            This shift: wages paid {state.finance.wagesPaid.toFixed(2)} credits; handoff spending{' '}
            {state.finance.improvementSpend.toFixed(2)} credits; compensation paid{' '}
            {state.finance.compensationPaid.toFixed(2)} credits. Closing cash{' '}
            {state.finance.cash.toFixed(2)} credits. Full commitment remaining{' '}
            {moment.delivery.remainingKg.toFixed(0)} kg.
          </p>
          {state.phase === 'review' && (
            <p>
              This charter's practices remain a valid experiment. Review the actual shortfall and
              obligations before deciding whether to extend them.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

/** Export a reversible planning draft, never this exercise's live decisions. */
export function WorkplacePracticeProposal({ state }: { state: WorkplaceState }) {
  const proposal = exportPracticeProposal(state);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `millos-practice-draft-r${state.revision}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      aria-label="Reversible practice proposal"
      className="space-y-3 border-t border-slate-700 pt-4 text-sm leading-relaxed"
    >
      <h4 className="font-semibold text-white">A small practice to try</h4>
      <p>{proposal.scope} Keep understanding, the policy vote and optional duty separate.</p>
      <p className="text-slate-300">
        Planning draft only. Local approvals are unfilled; this download grants no live authority.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          Boundaries, repayment and rollback
        </summary>
        <div className="space-y-3 pb-3">
          <p>{proposal.authority}</p>
          <p>{proposal.data}</p>
          <p>
            {proposal.repayment.funding} {proposal.repayment.withdrawal}
          </p>
          <p>Stop on: {proposal.stopConditions.join('; ')}.</p>
          <p>{proposal.rollback}</p>
          <ul className="list-disc space-y-1 pl-5">
            {proposal.review.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      </details>
      <button
        type="button"
        onClick={download}
        className="min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        Download planning-only practice proposal
      </button>
    </section>
  );
}
