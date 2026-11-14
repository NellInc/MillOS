import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle, ArrowRight, Check, Clock, Minus, Users, X } from 'lucide-react';
import {
  concessionBlockReason,
  concessionFor,
  policyBlockReason,
  POLICY_COST,
  proposalStanding,
  type ChronicleState,
} from '../../chronicle/engine';
import {
  BREAK_OFF_DELTA,
  conditionProgress,
  COUNTDOWN_SHIFTS,
  getLadder,
  getPolicyLadders,
  getRung,
  getStandingConditions,
  getTemperaments,
  localizedCrewMember,
  localizedRulingObjection,
  projectedVote,
  rungConsequences,
} from '../../chronicle/governance';
import { getForecasts } from '../../chronicle/forecasts';
import {
  localizedBallotReason,
  localizedBlockReason,
  localizedConcession,
} from '../../chronicle/presentation';
import { localizedStakeholderName } from '../../chronicle/stakeholders';
import { formatGrouped, useT } from '../../i18n';
import { messages } from './PolicyTab.messages';
import type { CrewVote, PolicyLadder, PolicyRung } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, BUTTON_PRIMARY, CostTag, plural, ProgressBar, Section } from './shared';

const VOTE_ICON: Record<CrewVote, typeof Check> = { for: Check, against: X, abstain: Minus };
const VOTE_LABEL: Record<CrewVote, keyof typeof messages.en> = {
  for: 'm5',
  against: 'm6',
  abstain: 'm7',
};
const VOTE_CLASS: Record<CrewVote, string> = {
  for: 'text-emerald-300',
  against: 'text-rose-300',
  abstain: 'text-slate-400',
};

/**
 * Part three's standing orders (docs/CHRONICLE.md, systems 25-28): the policy
 * ladders, the members' assembly, the crew, standing conditions and warnings.
 */
export function PolicyTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const heldId = useId();
  const actions = useChronicleStore(
    useShallow((s) => ({ propose: s.propose, withdraw: s.withdraw, meetNeed: s.meetNeed }))
  );
  const gov = state.governance;
  const standing = proposalStanding(state);
  const installed = state.improvements.filter((p) => p.phase === 'installed').length;
  const active = state.status === 'active';
  // A concession that could not carry the change is refused before it is paid (4.10).
  const refused = (memberId: (typeof gov.crew)[number]['id']) =>
    concessionBlockReason(state, memberId) !== null;
  // Presentation copies in the current language; the engine keeps reading the English.
  const ladders = getPolicyLadders();
  const conditions = getStandingConditions();
  const temperaments = getTemperaments();
  const installedIds = state.improvements.filter((p) => p.phase === 'installed').map((p) => p.id);

  // What a step sets off, on its button: the red line it crosses, the condition
  // it raises and, for the next step, how the assembly would vote (report 08, P4).
  const setsOff = (ladder: PolicyLadder, step: PolicyRung, adjacent: boolean): string => {
    const { redLines, conditions: raised } = rungConsequences(gov, ladder, step, installedIds);
    const parts = [
      ...redLines.map((line) =>
        t('rungRedLine', {
          party: localizedStakeholderName(line.party),
          delta: formatGrouped(BREAK_OFF_DELTA),
          shifts: plural(COUNTDOWN_SHIFTS, 'shift'),
        })
      ),
      ...raised.map((condition) =>
        condition.afterShifts !== undefined
          ? t('rungConditionAfter', {
              condition: conditions[condition.id].label,
              shifts: plural(condition.afterShifts, 'shift'),
            })
          : t('rungConditionForecast', {
              condition: conditions[condition.id].label,
              forecast: condition.forecast
                ? getForecasts()[condition.forecast].title.toLowerCase()
                : '',
            })
      ),
    ];
    // A tally of the assembly, never a person's (Chronicle rule 8).
    if (adjacent && !gov.proposal && !gov.administration) {
      const vote = projectedVote(gov, ladder, step);
      parts.push(
        t('rungVote', {
          for: formatGrouped(vote.for),
          against: formatGrouped(vote.against),
          abstain: vote.abstain ? t('p3', { abstain: formatGrouped(vote.abstain) }) : '',
          outcome: vote.carried ? t('rungCarries') : t('rungFalls'),
        })
      );
    }
    return parts.join('; ');
  };

  return (
    <div className="space-y-3">
      {standing && (
        <Section title={t('p0', { ladder: getLadder(standing.proposal.ladder).label })}>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-white">
            <span>{getRung(standing.proposal.ladder, standing.proposal.from).label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="sr-only">{t('m1')}</span>
            <span>{getRung(standing.proposal.ladder, standing.proposal.to).label}:</span>
            <span className="tabular-nums">
              {t('p2', {
                for: formatGrouped(standing.for),
                against: formatGrouped(standing.against),
              })}
              {standing.abstain ? t('p3', { abstain: formatGrouped(standing.abstain) }) : ''}
            </span>
          </p>
          <ul className="space-y-1.5" aria-label={t('m4')}>
            {standing.ballots.map((ballot) => {
              const member = gov.crew.find((m) => m.id === ballot.memberId);
              const shown = member ? localizedCrewMember(member) : undefined;
              const Icon = VOTE_ICON[ballot.vote];
              const concession = concessionFor(state, ballot.memberId);
              return (
                <li key={ballot.memberId} className="text-xs">
                  <div className="flex items-start gap-2">
                    <Icon
                      role="img"
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${VOTE_CLASS[ballot.vote]}`}
                      aria-label={t(VOTE_LABEL[ballot.vote])}
                    />
                    <span className="text-slate-200">
                      <span className="text-white">{shown?.role}</span>:{' '}
                      {localizedBallotReason(ballot.reason, member)}
                    </span>
                  </div>
                  {concession && ballot.vote === 'against' && (
                    <>
                      <button
                        className={`${BUTTON} mt-1`}
                        disabled={!active || refused(ballot.memberId)}
                        onClick={() => actions.meetNeed(ballot.memberId)}
                      >
                        {t('p8', { need: localizedConcession(concession.text, member) })}
                        <CostTag state={state} cost={{ fund: concession.fund }} />
                      </button>
                      {refused(ballot.memberId) && <p className="mt-1 text-rose-200">{t('p25')}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <button className={BUTTON} onClick={actions.withdraw}>
            {t('m9')}
          </button>
        </Section>
      )}

      {ladders.map((ladder) => (
        <Section key={ladder.id} title={ladder.label}>
          <div className="grid gap-2">
            {ladder.rungs.map((rung, index) => {
              const step = index as PolicyRung;
              // A closed chronicle is a record: only the step each ladder closed on.
              if (!active && gov.policies[ladder.id] !== step) return null;
              const current = gov.policies[ladder.id] === step;
              if (current)
                return (
                  <div
                    key={rung.label}
                    aria-current="true"
                    className="rounded-lg border border-cyan-300/70 bg-cyan-400/10 px-3 py-2 text-xs text-white"
                  >
                    <span className="font-semibold">{rung.label}</span>: {rung.effectText}
                  </div>
                );
              if (gov.proposal?.ladder === ladder.id && gov.proposal.to === step)
                return (
                  <div
                    key={rung.label}
                    className="rounded-lg border border-dashed border-amber-300/60 px-3 py-2 text-xs text-white"
                  >
                    <span className="font-semibold">{rung.label}</span>: {rung.effectText}
                    <span className="block text-amber-200">{t('m10')}</span>
                  </div>
                );
              const blocked = policyBlockReason(state, ladder.id, step);
              const adjacent = Math.abs(step - gov.policies[ladder.id]) === 1;
              // The open proposal is shown once, at the top; it is not repeated on every step.
              const reason =
                blocked !== null && !gov.proposal ? localizedBlockReason(blocked) : null;
              const consequences = setsOff(ladder.id as PolicyLadder, step, adjacent);
              return (
                <button
                  key={rung.label}
                  className={`${BUTTON} text-left`}
                  disabled={blocked !== null}
                  aria-describedby={reason !== null ? `${heldId}-${ladder.id}-${step}` : undefined}
                  onClick={() => actions.propose(ladder.id as PolicyLadder, step)}
                >
                  <span className="font-semibold">{rung.label}</span>: {rung.effectText}
                  {adjacent && blocked === null && <CostTag state={state} cost={POLICY_COST} />}
                  {consequences && <span className="block text-amber-200">{consequences}</span>}
                  {/* Every held step says why, a far one too ("one step at a time"). */}
                  {reason !== null && (
                    <span id={`${heldId}-${ladder.id}-${step}`} className="block text-rose-200">
                      {reason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title={active ? t('m11') : t('m12')}>
        {gov.conditions.length === 0 ? (
          <p className="text-xs text-slate-300">{t('m13')}</p>
        ) : (
          gov.conditions.map((condition) => {
            const definition = conditions[condition.id];
            const progress = active
              ? conditionProgress(gov, condition.id, installed, state.shift)
              : null;
            return (
              <div key={condition.id} className="space-y-1 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold text-white">{definition.label}</span>:{' '}
                    {definition.effectText}
                    {active
                      ? t('p14', {
                          clear: definition.clearText,
                          progress: progress
                            ? t('p15', {
                                done: formatGrouped(progress.done),
                                of: formatGrouped(progress.of),
                              })
                            : '',
                        })
                      : ''}
                  </span>
                </div>
                {progress && (
                  <ProgressBar
                    value={progress.of ? progress.done / progress.of : 0}
                    label={t('p16', { label: definition.label })}
                  />
                )}
              </div>
            );
          })
        )}
      </Section>

      {gov.countdowns.length > 0 && (
        <Section title={t('m17')}>
          {gov.countdowns.map((countdown) => {
            const left = Math.max(0, countdown.dueShift - state.shift);
            return (
              <div key={countdown.id} className="flex items-start gap-2 text-xs">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
                <span>
                  <span className="text-white">{localizedStakeholderName(countdown.party)}</span>:{' '}
                  {t('p18', {
                    shifts: plural(left, 'shift'),
                    ladder: getLadder(countdown.ladder).label.toLowerCase(),
                    rung: getRung(countdown.ladder, countdown.rung).label.toLowerCase(),
                  })}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      <Section title={t('m19')}>
        <ul className="space-y-2">
          {gov.crew.map((saved) => {
            const member = localizedCrewMember(saved);
            const objection = gov.objections.find((o) => o.memberId === member.id);
            const concession = concessionFor(state, member.id);
            return (
              <li key={member.id} className="rounded-lg border border-slate-700 p-2 text-xs">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                  <div className="space-y-0.5 text-slate-200">
                    <div className="font-semibold text-white">{member.role}</div>
                    <div>{t('p20', { value: member.value })}</div>
                    <div>
                      {temperaments[member.temperament].label}:{' '}
                      {temperaments[member.temperament].rule}
                    </div>
                    <div>
                      {t('p21', {
                        ladder: getLadder(member.prefers.ladder).label.toLowerCase(),
                        rung: getRung(
                          member.prefers.ladder,
                          member.prefers.rung
                        ).label.toLowerCase(),
                      })}
                    </div>
                    <div>
                      {t('p22', {
                        need: member.need.text,
                        ladder: getLadder(member.need.ladder).label.toLowerCase(),
                        rung: getRung(member.need.ladder, member.need.rung).label.toLowerCase(),
                      })}
                    </div>
                    {objection && (
                      <div className="text-rose-200">
                        {t('p23', { shift: formatGrouped(objection.raisedShift) })}
                        {'ruling' in objection && objection.ruling
                          ? ` ${t('p24', { ruling: localizedRulingObjection(objection.ruling) })}`
                          : ''}
                      </div>
                    )}
                  </div>
                </div>
                {active && objection && concession?.kind === 'objection' && (
                  <button
                    className={`${BUTTON_PRIMARY} mt-2`}
                    disabled={!active}
                    onClick={() => actions.meetNeed(member.id)}
                  >
                    {t('p8', { need: localizedConcession(concession.text, saved) })}
                    <CostTag state={state} cost={{ fund: concession.fund }} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
