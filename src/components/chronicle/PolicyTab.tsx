import { useShallow } from 'zustand/react/shallow';
import { AlertTriangle, ArrowRight, Check, Clock, Minus, Users, X } from 'lucide-react';
import {
  concessionFor,
  policyBlockReason,
  POLICY_COST,
  proposalStanding,
  type ChronicleState,
} from '../../chronicle/engine';
import {
  conditionProgress,
  ladderById,
  POLICY_LADDERS,
  rungOf,
  STANDING_CONDITIONS,
  TEMPERAMENTS,
} from '../../chronicle/governance';
import { stakeholderName } from '../../chronicle/stakeholders';
import type { CrewVote, PolicyLadder, PolicyRung } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, BUTTON_PRIMARY, CostTag, plural, ProgressBar, Section } from './shared';

const VOTE_ICON: Record<CrewVote, typeof Check> = { for: Check, against: X, abstain: Minus };
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
  const actions = useChronicleStore(
    useShallow((s) => ({ propose: s.propose, withdraw: s.withdraw, meetNeed: s.meetNeed }))
  );
  const gov = state.governance;
  const standing = proposalStanding(state);
  const installed = state.improvements.filter((p) => p.phase === 'installed').length;
  const active = state.status === 'active';

  return (
    <div className="space-y-3">
      {standing && (
        <Section title={`Before the assembly: ${ladderById(standing.proposal.ladder).label}`}>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-white">
            <span>{rungOf(standing.proposal.ladder, standing.proposal.from).label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="sr-only">to</span>
            <span>{rungOf(standing.proposal.ladder, standing.proposal.to).label}:</span>
            <span className="tabular-nums">
              {standing.for} for, {standing.against} against
              {standing.abstain ? `, ${standing.abstain} abstaining` : ''}
            </span>
          </p>
          <ul className="space-y-1.5" aria-label="Votes">
            {standing.ballots.map((ballot) => {
              const member = gov.crew.find((m) => m.id === ballot.memberId);
              const Icon = VOTE_ICON[ballot.vote];
              const concession = concessionFor(state, ballot.memberId);
              return (
                <li key={ballot.memberId} className="text-xs">
                  <div className="flex items-start gap-2">
                    <Icon
                      role="img"
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${VOTE_CLASS[ballot.vote]}`}
                      aria-label={ballot.vote}
                    />
                    <span className="text-slate-200">
                      <span className="text-white">{member?.role}</span>: {ballot.reason}
                    </span>
                  </div>
                  {concession && ballot.vote === 'against' && (
                    <button
                      className={`${BUTTON} mt-1`}
                      disabled={!active}
                      onClick={() => actions.meetNeed(ballot.memberId)}
                    >
                      Meet the need: {concession.text}
                      <CostTag state={state} cost={{ fund: concession.fund }} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button className={BUTTON} onClick={actions.withdraw}>
            Withdraw the change
          </button>
        </Section>
      )}

      {POLICY_LADDERS.map((ladder) => (
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
                    <span className="block text-amber-200">before the assembly</span>
                  </div>
                );
              const blocked = policyBlockReason(state, ladder.id, step);
              const adjacent = Math.abs(step - gov.policies[ladder.id]) === 1;
              // The open proposal is shown once, at the top; it is not repeated on every step.
              const reason = blocked !== null && !gov.proposal ? blocked : null;
              return (
                <button
                  key={rung.label}
                  className={`${BUTTON} text-left`}
                  disabled={blocked !== null}
                  onClick={() => actions.propose(ladder.id as PolicyLadder, step)}
                >
                  <span className="font-semibold">{rung.label}</span>: {rung.effectText}
                  {adjacent && blocked === null && <CostTag state={state} cost={POLICY_COST} />}
                  {adjacent && reason !== null && (
                    <span className="block text-rose-200">{reason}</span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title={active ? 'Standing conditions' : 'Standing at the close'}>
        {gov.conditions.length === 0 ? (
          <p className="text-xs text-slate-300">None</p>
        ) : (
          gov.conditions.map((condition) => {
            const definition = STANDING_CONDITIONS[condition.id];
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
                      ? `. To clear: ${definition.clearText}${progress ? ` (${progress.done} of ${progress.of})` : ''}.`
                      : ''}
                  </span>
                </div>
                {progress && (
                  <ProgressBar
                    value={progress.of ? progress.done / progress.of : 0}
                    label={`${definition.label}: way out`}
                  />
                )}
              </div>
            );
          })
        )}
      </Section>

      {gov.countdowns.length > 0 && (
        <Section title="Warnings">
          {gov.countdowns.map((countdown) => {
            const left = Math.max(0, countdown.dueShift - state.shift);
            return (
              <div key={countdown.id} className="flex items-start gap-2 text-xs">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
                <span>
                  <span className="text-white">{stakeholderName(countdown.party)}</span>:{' '}
                  {plural(left, 'shift')} unless {ladderById(countdown.ladder).label.toLowerCase()}{' '}
                  moves off {rungOf(countdown.ladder, countdown.rung).label.toLowerCase()}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      <Section title="The crew">
        <ul className="space-y-2">
          {gov.crew.map((member) => {
            const objection = gov.objections.find((o) => o.memberId === member.id);
            const concession = concessionFor(state, member.id);
            return (
              <li key={member.id} className="rounded-lg border border-slate-700 p-2 text-xs">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                  <div className="space-y-0.5 text-slate-200">
                    <div className="font-semibold text-white">{member.role}</div>
                    <div>Values {member.value}</div>
                    <div>
                      {TEMPERAMENTS[member.temperament].label}:{' '}
                      {TEMPERAMENTS[member.temperament].rule}
                    </div>
                    <div>
                      Prefers {ladderById(member.prefers.ladder).label.toLowerCase()}:{' '}
                      {rungOf(member.prefers.ladder, member.prefers.rung).label.toLowerCase()}
                    </div>
                    <div>
                      Needs {member.need.text}; against{' '}
                      {ladderById(member.need.ladder).label.toLowerCase()}:{' '}
                      {rungOf(member.need.ladder, member.need.rung).label.toLowerCase()}
                    </div>
                    {objection && (
                      <div className="text-rose-200">
                        Objection standing since shift {objection.raisedShift}
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
                    Meet the need: {concession.text}
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
