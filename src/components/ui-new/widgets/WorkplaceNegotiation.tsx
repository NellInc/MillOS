import type { WorkplaceState } from '../../../types/workplace';
import { exportPracticeProposal, WORKPLACE_PLANS } from '../../../simulation/bilateralWorkplace';
import { thursdayNegotiation } from '../../../simulation/workplaceCampaign';
import { formatFixed, useT } from '../../../i18n';
import { workplaceNegotiationMessages } from './WorkplaceNegotiation.messages';

type StateWordKey =
  | 'wordOpen'
  | 'wordResolved'
  | 'wordConfirmed'
  | 'wordPending'
  | 'wordYes'
  | 'wordNo'
  | 'wordNotOffered'
  | 'wordBlocked'
  | 'wordMet'
  | 'wordShortfall';

/** Raw simulation values stay in logic; only their display is translated. */
const STATE_WORDS: Record<string, StateWordKey> = {
  open: 'wordOpen',
  resolved: 'wordResolved',
  confirmed: 'wordConfirmed',
  pending: 'wordPending',
  yes: 'wordYes',
  no: 'wordNo',
  'not offered': 'wordNotOffered',
  blocked: 'wordBlocked',
  met: 'wordMet',
  shortfall: 'wordShortfall',
};

/** Public, read-only staging of the real Thursday transitions. */
export function WorkplaceNegotiation({ state }: { state: WorkplaceState }) {
  const t = useT(workplaceNegotiationMessages);
  const word = (value: string) => {
    const key = STATE_WORDS[value];
    return key ? t(key) : value;
  };
  const moment = thursdayNegotiation(state);
  if (!moment) return null;
  const offer = WORKPLACE_PLANS.find((plan) => plan.id === state.planId)!;
  const open = state.objections.filter((item) => item.status === 'open');
  const adviser = open.length
    ? t('adviserHoldExecution')
    : offer.illegalReason
      ? t('adviserIllegal')
      : !moment.correction
        ? t('adviserNeedsCorrection')
        : state.planId === 'cover'
          ? t('adviserCover')
          : t('adviserCurrentOffer', { title: offer.title.toLowerCase() });
  const stages = [
    [t('stageOffer'), t('stageOfferDetail', { title: offer.title })],
    [
      t('stageChallenge'),
      moment.challenge === 'prevented'
        ? t('challengePrevented')
        : moment.challenge === 'not raised'
          ? t('challengeNotRaised')
          : t('challengeStatus', { status: word(moment.challenge) }),
    ],
    [t('stageRevisedTerms'), moment.correction ? t('correctionDone') : t('correctionPending')],
    [
      t('stageFreshDecisions'),
      t('freshDecisionsDetail', {
        understanding: word(moment.understanding),
        policy: word(moment.policy),
        cover: word(moment.cover),
      }),
    ],
    [
      t('stagePhysicalWork'),
      t('physicalWorkDetail', {
        delivered: formatFixed(moment.delivery.deliveredKg, 0),
        target: formatFixed(moment.delivery.targetKg, 0),
        status: word(moment.delivery.status),
      }),
    ],
    [
      t('stageRepayment'),
      t('repaymentDetail', {
        paid: formatFixed(moment.paid, 2),
        delivered: formatFixed(moment.delivered, 1),
        owed: formatFixed(moment.owed, 1),
      }),
    ],
  ];
  return (
    <section aria-label={t('sectionLabel')} className="space-y-3 border-t border-slate-700 pt-4">
      <h5 className="font-semibold text-white">{t('heading')}</h5>
      <p className="text-cyan-100">{moment.next}</p>
      <dl className="grid grid-cols-1 gap-2 text-xs leading-5 min-[400px]:grid-cols-3 min-[400px]:gap-3">
        {[
          [t('labelUnderstanding'), word(moment.understanding)],
          [t('labelPolicyVote'), word(moment.policy)],
          [t('labelOptionalCover'), word(moment.cover)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 min-[400px]:block">
            <dt className="text-slate-300">{label}</dt>
            <dd className="font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-5 text-slate-300">
        {t('termsOffered', {
          extra: formatFixed(moment.retainedPacking.extraMinutes, 1),
          cover: formatFixed(offer.optionalCoverMinutes, 0),
          rate: formatFixed(offer.compensationPerMinute, 2),
          recovery: formatFixed(offer.recoveryMinutes, 0),
        })}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          {t('sequenceSummary')}
        </summary>
        <ol className="space-y-3 pb-2" aria-label={t('sequenceLabel')}>
          {stages.map(([label, detail]) => (
            <li key={label}>
              <strong className="text-white">{label}</strong>
              <p className="mt-1 text-slate-300">{detail}</p>
            </li>
          ))}
        </ol>
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <h6 className="font-semibold text-white">{t('adviserProposal')}</h6>
          <p>{adviser}</p>
          <p className="text-slate-300">{t('dispatchUncertain')}</p>
          <p className="tabular-nums text-slate-300">
            {t('shiftFinance', {
              wages: formatFixed(state.finance.wagesPaid, 2),
              handoff: formatFixed(state.finance.improvementSpend, 2),
              compensation: formatFixed(state.finance.compensationPaid, 2),
              cash: formatFixed(state.finance.cash, 2),
              remaining: formatFixed(moment.delivery.remainingKg, 0),
            })}
          </p>
          {state.phase === 'review' && <p>{t('reviewExperiment')}</p>}
        </div>
      </details>
    </section>
  );
}

/** Export a reversible planning draft, never this exercise's live decisions. */
export function WorkplacePracticeProposal({ state }: { state: WorkplaceState }) {
  const t = useT(workplaceNegotiationMessages);
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
      aria-label={t('proposalLabel')}
      className="space-y-3 border-t border-slate-700 pt-4 text-sm leading-relaxed"
    >
      <h4 className="font-semibold text-white">{t('proposalHeading')}</h4>
      <p>{t('proposalScope', { scope: proposal.scope })}</p>
      <p className="text-slate-300">{t('planningOnly')}</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          {t('boundariesSummary')}
        </summary>
        <div className="space-y-3 pb-3">
          <p>{proposal.authority}</p>
          <p>{proposal.data}</p>
          <p>
            {proposal.repayment.funding} {proposal.repayment.withdrawal}
          </p>
          <p>{t('stopOn', { conditions: proposal.stopConditions.join('; ') })}</p>
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
        {t('download')}
      </button>
    </section>
  );
}
