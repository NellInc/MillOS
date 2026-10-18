import type { WorkplaceState } from '../../../types/workplace';
import { WorkplaceNegotiation } from './WorkplaceNegotiation';
import { WORKPLACE_PLANS, workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  campaignOutcomes,
  campaignTotals,
} from '../../../simulation/workplaceCampaign';
import { formatFixed, translate, useT } from '../../../i18n';
import { workplacePressureChapterMessages } from './WorkplacePressureChapter.messages';

type Destination = 'Shift' | 'Agreement / Voices' | 'Review';

/** Current-state guidance only; no consent, time or plant mutation. */
export function deriveWorkplaceGuidance(state: WorkplaceState) {
  const campaign = state.campaign;
  const pressure = campaign ? CAMPAIGN_PRESSURES[campaign.shift] : undefined;
  const readiness = workplaceReadiness(state);
  const totals = campaignTotals(state);
  const outcomes = campaignOutcomes(state);
  const protectedTerms =
    !!pressure &&
    state.events.some(
      (event) => event.kind === 'pressure-protected' && event.detail.startsWith(`${pressure.id}: `)
    );
  const challenge = pressure
    ? state.objections.find((item) => item.statement === pressure.objection)
    : undefined;
  const openObjections = state.objections.filter((item) => item.status === 'open');
  const termsNeeded = challenge?.status === 'open' && !protectedTerms;
  const needsRemedy = openObjections.length > 0;
  const reviewing = state.phase === 'review';
  const running = state.phase === 'active';
  const inspectionHeld =
    running && campaign?.shift === 1 && state.minute >= 25 && !campaign.inspectionComplete;
  const inspectionPending = inspectionHeld && campaign.inspectionUntilMinute === null;
  const needsEpisodeResponse = !!campaign && campaign.shift !== 1 && campaign.decision === null;
  const packing = state.members.find((member) => member.id === 'packing');
  const needsRevisedOffer =
    !running &&
    !reviewing &&
    campaign?.shift === 2 &&
    ((packing?.ballot === false && state.governance === 'team-consent') ||
      (state.planId === 'cover' && packing?.coverConsent === false));
  const msg = workplacePressureChapterMessages;
  const beat = termsNeeded
    ? translate(msg, 'beatRestate')
    : needsRemedy
      ? translate(msg, 'beatRemedy')
      : inspectionHeld
        ? inspectionPending
          ? translate(msg, 'beatQualityReviews')
          : translate(msg, 'beatCompleteInspection')
        : reviewing
          ? translate(msg, 'beatAccount')
          : running
            ? translate(msg, 'beatDeliver')
            : translate(msg, 'beatEarn');
  const destination: Destination =
    termsNeeded ||
    inspectionHeld ||
    (!needsRemedy && !running && !reviewing && (needsEpisodeResponse || needsRevisedOffer))
      ? 'Shift'
      : needsRemedy || (!running && !reviewing && !readiness.allowed)
        ? 'Agreement / Voices'
        : running || reviewing
          ? 'Review'
          : 'Agreement / Voices';
  const next = termsNeeded
    ? translate(msg, 'nextRestate')
    : needsRemedy
      ? translate(msg, 'nextRemedy')
      : inspectionHeld
        ? inspectionPending
          ? translate(msg, 'nextInspect')
          : translate(msg, 'nextInspecting', {
              minute: formatFixed(Math.ceil(campaign?.inspectionUntilMinute ?? 0), 0),
            })
        : reviewing
          ? translate(msg, 'nextReviewing')
          : running
            ? translate(msg, 'nextRunning')
            : needsRevisedOffer
              ? translate(msg, 'nextRevised')
              : readiness.allowed
                ? translate(msg, 'nextReady')
                : campaign
                  ? translate(msg, 'nextCampaign')
                  : translate(msg, 'nextPlan');
  return {
    readiness,
    totals,
    outcomes,
    protectedTerms,
    challenge,
    openObjections,
    termsNeeded,
    needsRemedy,
    reviewing,
    running,
    beat,
    destination,
    next,
  };
}

/** Navigation only: every receipt and next beat comes from the current workplace. */
export function WorkplacePressureChapter({
  state,
  navigate,
}: {
  state: WorkplaceState;
  navigate: (section: Destination) => void;
}) {
  const t = useT(workplacePressureChapterMessages);
  const campaign = state.campaign;
  if (!campaign) return null;
  const pressure = CAMPAIGN_PRESSURES[campaign.shift];
  if (!pressure) return null;
  const plan = WORKPLACE_PLANS.find((item) => item.id === state.planId);
  const {
    readiness,
    totals,
    outcomes,
    protectedTerms,
    challenge,
    openObjections,
    termsNeeded,
    needsRemedy,
    reviewing,
    running,
    beat,
    destination,
    next,
  } = deriveWorkplaceGuidance(state);
  const rule =
    state.governance === 'team-consent'
      ? t('ruleConsent')
      : state.governance === 'member-vote'
        ? t('ruleVote')
        : t('ruleConsult');

  return (
    <section
      aria-label={t('regionLabel')}
      className="space-y-2 border-b border-slate-700 pb-4 text-sm leading-relaxed text-slate-200"
    >
      <h4 className="font-semibold text-white">
        {campaign.shift === 2 ? t('headingThursday') : t('headingPressure')}
      </h4>
      {campaign.shift === 2 && <p>{t('willingnessExpired')}</p>}
      <p className="font-medium text-cyan-100">{beat}</p>
      <p>{next}</p>
      <p className={needsRemedy ? 'text-amber-100' : 'text-slate-300'}>
        {challenge
          ? t('challengeLine', {
              role:
                state.members.find((member) => member.id === challenge.actorId)?.role ??
                t('adviser'),
              status: t('objectionStatus', { status: challenge.status }),
              receipt: protectedTerms ? t('protectedRecorded') : t('noProtectedReceipt'),
            })
          : protectedTerms
            ? t('protectedWithoutChallenge')
            : t('noPressureResponse')}
      </p>
      {reviewing && needsRemedy && <p>{t('repairBelongs')}</p>}
      <button
        type="button"
        className="min-h-9 rounded-md border border-cyan-300/25 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        onClick={() => navigate(destination)}
      >
        {t('goToControls', { destination: t('sectionLabel', { section: destination }) })}
      </button>
      <WorkplaceNegotiation state={state} />
      <details>
        <summary className="cursor-pointer text-slate-100">{t('detailsSummary')}</summary>
        <div className="mt-2 space-y-2">
          <ol className="list-decimal space-y-1 pl-5">
            {termsNeeded && <li>{t('stepRestate')}</li>}
            {needsRemedy && <li>{t('stepRemedy')}</li>}
            {!running && !reviewing && <li>{t('stepApprove')}</li>}
            <li>{t('stepReview')}</li>
          </ol>
          <p>
            {rule} {t('extraDutyNote')}
          </p>
          <p>
            {t('offerLine', {
              plan: plan?.title ?? state.planId,
              revision: formatFixed(state.revision, 0),
              ack: campaign.adviserAcknowledged ? t('acknowledged') : t('awaitingAnswers'),
              understood: formatFixed(
                state.members.filter((member) => member.understood).length,
                0
              ),
              members: formatFixed(state.members.length, 0),
              ballots: formatFixed(
                state.members.filter((member) => member.ballot !== null).length,
                0
              ),
              cover:
                state.members
                  .filter((member) => member.coverConsent === true)
                  .map((member) => member.role)
                  .join(', ') || t('none'),
            })}
          </p>
          {!running && !reviewing && readiness.reasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {openObjections.map((item) => (
            <p key={item.id} className="text-amber-100">
              {t('openItem', { statement: item.statement })}
            </p>
          ))}
          {totals.members.map((member) => (
            <p key={member.id} className="tabular-nums">
              {t('memberLine', {
                role: member.role,
                extra: formatFixed(member.extraMinutes, 1),
                paid: formatFixed(member.compensationPaid, 2),
                recovery: formatFixed(member.recoveryMinutes, 1),
                owed: formatFixed(member.recoveryOwedMinutes, 1),
              })}
            </p>
          ))}
          <p className="tabular-nums">
            {t('deliveryLine', {
              status: t('deliveryStatus', { status: outcomes.delivery.status }),
              delivered: formatFixed(outcomes.delivery.deliveredKg, 1),
              target: formatFixed(outcomes.delivery.targetKg, 0),
              agreement: t('agreementStatus', { status: outcomes.agreement.status }),
              wages: formatFixed(outcomes.accounts.wages, 2),
              remaining: formatFixed(outcomes.delivery.remainingKg, 0),
            })}
            {campaign.mission &&
              t('dispatchEvidence', {
                evidence: t('evidenceStatus', { status: campaign.mission.evidence }),
              })}
          </p>
          <p>{t('recoveryNote')}</p>
        </div>
      </details>
    </section>
  );
}
