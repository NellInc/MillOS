import type { WorkplaceState } from '../../../types/workplace';
import { WorkplaceNegotiation } from './WorkplaceNegotiation';
import { WORKPLACE_PLANS, workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  campaignOutcomes,
  campaignTotals,
} from '../../../simulation/workplaceCampaign';

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
  const beat = termsNeeded
    ? 'Restate the terms'
    : needsRemedy
      ? 'The raiser reviews the remedy'
      : inspectionHeld
        ? inspectionPending
          ? 'Quality reviews the line'
          : 'Complete protected inspection'
        : reviewing
          ? 'Account for what was kept'
          : running
            ? 'Deliver the agreement'
            : 'Earn a fresh agreement';
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
    ? 'Use Restate protected terms in Shift. The challenge remains open afterwards.'
    : needsRemedy
      ? 'In Agreement / Voices, select the resolving author. Only the raiser can confirm resolution.'
      : inspectionHeld
        ? inspectionPending
          ? 'Use Quality initiates five-minute inspection in Shift. The line is held; deadline pressure grants no authority to skip the check.'
          : `Inspection is running until modeled minute ${campaign?.inspectionUntilMinute}. Resume the plant clock when ready to deliver the remaining inspection time. Actual batch certification remains separate.`
        : reviewing
          ? 'Review paid compensation, delivered recovery and customer delivery separately. This shift cannot resume.'
          : running
            ? 'Use the plant clock controls to run or pause real production. An objection during work stops this shift into review.'
            : needsRevisedOffer
              ? 'Your no is recorded. Compare revised offers in Shift. Changing shared terms clears every role decision; each role then chooses afresh.'
              : readiness.allowed
                ? 'Current terms are ready. Use Approve and run agreement in Agreement / Voices only when you choose to proceed.'
                : campaign
                  ? 'Choose the episode response and plan in Shift, then answer the current role checks and record understanding, ballots and any separate cover consent in Agreement / Voices.'
                  : 'Choose the plan in Shift, then record understanding, ballots and any separate cover consent in Agreement / Voices.';
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
      ? 'Every member must approve the shared plan.'
      : state.governance === 'member-vote'
        ? 'A member majority approves the plan; it cannot volunteer an individual.'
        : 'The coordinator hears each role before assigning qualified work.';

  return (
    <section
      aria-label="Pressure chapter"
      className="space-y-2 border-b border-slate-700 pb-4 text-sm leading-relaxed text-slate-200"
    >
      <h4 className="font-semibold text-white">
        {campaign.shift === 2 ? 'Thursday: a fresh offer' : 'A working agreement under pressure'}
      </h4>
      {campaign.shift === 2 && (
        <p>
          Yesterday’s willingness has expired. Retained workload informs a new offer; it grants no
          new consent.
        </p>
      )}
      <p className="font-medium text-cyan-100">{beat}</p>
      <p>{next}</p>
      <p className={needsRemedy ? 'text-amber-100' : 'text-slate-300'}>
        {challenge
          ? `${state.members.find((member) => member.id === challenge.actorId)?.role ?? 'Adviser'} challenge: ${challenge.status}. ${protectedTerms ? 'Protected terms recorded.' : 'No retained protected-terms receipt.'}`
          : protectedTerms
            ? 'Protected terms recorded without a challenge. Prevention does not claim an objection was resolved.'
            : 'No retained pressure response. The pressure card is optional; a protected plan can proceed without trying the demand.'}
      </p>
      {reviewing && needsRemedy && (
        <p>Repair belongs to review. Resolving the objection cannot restart this same shift.</p>
      )}
      <button
        type="button"
        className="min-h-9 rounded-md border border-cyan-300/25 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        onClick={() => navigate(destination)}
      >
        Go to {destination} controls
      </button>
      <WorkplaceNegotiation state={state} />
      <details>
        <summary className="cursor-pointer text-slate-100">
          Terms, retained burden and delivery
        </summary>
        <div className="mt-2 space-y-2">
          <ol className="list-decimal space-y-1 pl-5">
            {termsNeeded && (
              <li>Restate protected terms in Shift; restatement leaves the objection open.</li>
            )}
            {needsRemedy && <li>Let each raiser review the remedy in Agreement / Voices.</li>}
            {!running && !reviewing && (
              <li>
                Answer current role checks, record understanding and ballots, then explicitly
                approve the plan in Agreement / Voices. Cover consent is separate.
              </li>
            )}
            <li>
              Use Review to compare paid obligations, actual recovery and delivery. Promises and
              agreed deferrals remain distinct from delivery.
            </li>
          </ol>
          <p>
            {rule} Extra duty always requires fresh individual consent; a no-extra-duty plan remains
            valid.
          </p>
          <p>
            Current offer: {plan?.title ?? state.planId}, revision {state.revision}. Adviser
            boundaries: {campaign.adviserAcknowledged ? 'acknowledged' : 'awaiting current answers'}
            . Role understanding {state.members.filter((member) => member.understood).length}/
            {state.members.length}; ballots recorded{' '}
            {state.members.filter((member) => member.ballot !== null).length}/{state.members.length}
            . Separate cover consent:{' '}
            {state.members
              .filter((member) => member.coverConsent === true)
              .map((member) => member.role)
              .join(', ') || 'none'}
            .
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
              Open: {item.statement}
            </p>
          ))}
          {totals.members.map((member) => (
            <p key={member.id} className="tabular-nums">
              {member.role}: retained extra duty {member.extraMinutes.toFixed(1)} min; compensation
              paid {member.compensationPaid.toFixed(2)} credits; recovery delivered{' '}
              {member.recoveryMinutes.toFixed(1)} min; recovery owed{' '}
              {member.recoveryOwedMinutes.toFixed(1)} min.
            </p>
          ))}
          <p className="tabular-nums">
            Delivery {outcomes.delivery.status}: {outcomes.delivery.deliveredKg.toFixed(1)} /{' '}
            {outcomes.delivery.targetKg.toFixed(0)} kg. Agreement outcome:{' '}
            {outcomes.agreement.status}. Wages paid: {outcomes.accounts.wages.toFixed(2)} credits.
            Full customer commitment remaining: {outcomes.delivery.remainingKg.toFixed(0)} kg.
            {campaign.mission && ` Dispatch evidence: ${campaign.mission.evidence}.`}
          </p>
          <p>
            Owed recovery needs modeled clock time. Review preserves shortfalls, earned pay and
            prior shifts. Changing terms clears the current role agreement.
          </p>
        </div>
      </details>
    </section>
  );
}
