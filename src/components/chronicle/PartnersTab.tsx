import { formatFixed, formatGrouped } from '../../i18n';
import { getDelegationLevels } from '../../chronicle/delegation';
import { customerDisplayName } from '../../stores/customerNames';
import {
  localizedStakeholderName,
  localizedStakeholderStanding,
} from '../../chronicle/stakeholders';
import { localizedInitiative } from '../../chronicle/presentation';
import { useT } from '../../i18n';
import { messages } from './PartnersTab.messages';
import { useShallow } from 'zustand/react/shallow';
import { Bot, ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react';
import { CERTIFIER_NAME, standingOf } from '../../chronicle/certifier';
import { relationshipTier } from '../../chronicle/customers';
import {
  answerablePending,
  canReverse,
  partnerChoice,
  recentPartyChanges,
  type ChronicleState,
} from '../../chronicle/engine';
import { EVENT_DECK, getEventDeck, localizedEventText } from '../../chronicle/eventDeck';
import { getBriefs, getPolicyLadders } from '../../chronicle/governance';
import type { PartyChangeCause } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, HeldReason, ProgressBar, rovingNext, Section, useStoppedReason } from './shared';
import { useId } from 'react';

const TIER_CLASS = {
  cool: 'text-sky-300',
  neutral: 'text-slate-200',
  warm: 'text-amber-300',
} as const;

/** Where neutral and warm begin, read from `relationshipTier` so the marks cannot drift. */
const TIER_LINES = (['neutral', 'warm'] as const).map(
  (tier) =>
    Array.from({ length: 101 }, (_, value) => value).find(
      (value) => relationshipTier(value) === tier
    )!
);

/** A relationship bar with the cool and warm lines drawn and numbered on it. */
function TierBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="relative">
        <ProgressBar value={value / 100} label={label} />
        {TIER_LINES.map((line) => (
          <span
            key={line}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-slate-300/70"
            style={{ left: `${line}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="relative h-3 text-[10px] leading-3 text-slate-400">
        {TIER_LINES.map((line) => (
          <span key={line} className="absolute -translate-x-1/2" style={{ left: `${line}%` }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PartnersTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const stopped = useStoppedReason();
  const heldId = useId();
  const actions = useChronicleStore(
    useShallow((s) => ({
      setDelegation: s.setDelegation,
      reverse: s.reverse,
      setBrief: s.setBrief,
    }))
  );
  const routine = answerablePending(state, EVENT_DECK).filter(({ event }) => event.routine);
  // The federation's administrator keeps the partner at Forecasts or above, and the
  // engine refuses anything lower: those levels are not offered while it stays.
  const lowestLevel = state.governance.administration ? 2 : 0;
  const ladders = getPolicyLadders();
  /** A change made outside a ruling, named by what made it. */
  const causeText = (cause: PartyChangeCause): string => {
    if (cause.kind === 'quota')
      return t(cause.met ? 'c0' : 'c1', { year: formatGrouped(cause.year + 1) });
    const ladder = ladders.find((entry) => entry.id === cause.ladder);
    const rung = ladder?.rungs[cause.rung]?.label ?? '';
    const name = ladder?.label ?? cause.ladder;
    return cause.kind === 'policy'
      ? t('c2', { ladder: name, rung })
      : t('c3', { ladder: name, rung: rung.toLowerCase() });
  };
  const openLevels = getDelegationLevels()
    .map((entry) => entry.level)
    .filter((level) => level >= lowestLevel);
  return (
    <div className="space-y-3">
      <Section title={t('m0')}>
        {state.customers.map((customer) => {
          const tier = relationshipTier(customer.value);
          return (
            <div key={customer.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-white">{customerDisplayName(customer.name)}</span>
                <span className={`text-xs capitalize ${TIER_CLASS[tier]}`}>
                  {{ cool: t('p16'), neutral: t('p17'), warm: t('p18') }[tier]} {customer.value}
                </span>
              </div>
              <ProgressBar
                value={customer.value / 100}
                label={t('p13', { name: customerDisplayName(customer.name) })}
              />
            </div>
          );
        })}
      </Section>

      <Section title={t('m1')}>
        {state.stakeholders.map((party) => {
          const tier = relationshipTier(party.value);
          const standing = localizedStakeholderStanding(state.stakeholders, party.id);
          const changes = recentPartyChanges(state, party.id, EVENT_DECK);
          return (
            <div
              key={party.id}
              role="group"
              aria-label={localizedStakeholderName(party.id)}
              className="space-y-1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="shrink-0 text-white">{localizedStakeholderName(party.id)}</span>
                <span className={`text-xs capitalize ${TIER_CLASS[tier]}`}>
                  {{ cool: t('p16'), neutral: t('p17'), warm: t('p18') }[tier]} {party.value}
                  {standing ? <span className="normal-case"> · {standing}</span> : null}
                </span>
              </div>
              <TierBar
                value={party.value}
                label={t('p13', { name: localizedStakeholderName(party.id) })}
              />
              {changes.length > 0 && (
                <ul className="space-y-0.5 text-xs text-slate-300">
                  {changes.map((change, index) => {
                    let key: string;
                    let cause: string;
                    if ('cause' in change) {
                      key = `${index}-${change.cause.kind}-${change.shift}`;
                      cause = causeText(change.cause);
                    } else {
                      const event = getEventDeck().find((item) => item.id === change.eventId);
                      const choice = event?.choices.find((item) => item.id === change.choiceId);
                      key = `${index}-${change.eventId}-${change.choiceId}-${change.shift}`;
                      cause = `${event?.title ?? ''}${choice ? `: ${choice.label}` : ''}`;
                    }
                    return (
                      <li key={key} className="flex items-baseline justify-between gap-2">
                        <span>{cause}</span>
                        <span
                          className={`shrink-0 tabular-nums ${change.delta > 0 ? 'text-amber-300' : 'text-sky-300'}`}
                        >
                          {change.delta > 0 ? '+' : ''}
                          {formatGrouped(change.delta)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </Section>

      <Section title={CERTIFIER_NAME}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-white">
            {state.certifier.suspended ? (
              <ShieldAlert className="h-4 w-4 text-rose-300" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            )}
            {state.certifier.suspended
              ? t('m2')
              : t('p14', { standing: standingOf(state.certifier) })}
          </span>
          {!state.certifier.suspended && (
            <span className="text-xs tabular-nums text-slate-300">
              {formatFixed(state.certifier.score / 100, 2)}
            </span>
          )}
        </div>
        <ProgressBar
          value={state.certifier.suspended ? 0 : (state.certifier.score - 100) / 899}
          label={t('p15', { name: CERTIFIER_NAME })}
        />
      </Section>

      <Section title={t('m3')}>
        <div
          role="radiogroup"
          aria-label={t('m4')}
          className="grid grid-cols-2 gap-2"
          onKeyDown={(event) => {
            const next = rovingNext(event.key, openLevels, state.delegation);
            if (next === null) return;
            event.preventDefault();
            actions.setDelegation(next);
            document.getElementById(`delegation-level-${next}`)?.focus();
          }}
        >
          {getDelegationLevels().map((level) => (
            <button
              key={level.level}
              role="radio"
              id={`delegation-level-${level.level}`}
              aria-checked={state.delegation === level.level}
              disabled={state.status !== 'active' || level.level < lowestLevel}
              aria-describedby={
                state.status !== 'active'
                  ? `${heldId}-level`
                  : level.level < lowestLevel
                    ? `${heldId}-admin`
                    : undefined
              }
              tabIndex={state.delegation === level.level ? 0 : -1}
              onClick={() => actions.setDelegation(level.level)}
              className={`min-h-11 rounded-lg border px-2 py-2 text-left text-xs ${
                state.delegation === level.level
                  ? 'border-cyan-300/70 bg-cyan-400/10 text-white'
                  : 'border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              <span className="font-semibold">
                {level.level} {level.label}:
              </span>{' '}
              {level.grants}
            </button>
          ))}
        </div>
        {state.status !== 'active' ? (
          <HeldReason id={`${heldId}-level`}>{stopped}</HeldReason>
        ) : (
          lowestLevel > 0 && (
            <HeldReason id={`${heldId}-admin`}>{t('heldAdministrator')}</HeldReason>
          )
        )}
      </Section>

      <Section title={t('b0')}>
        <div
          role="radiogroup"
          aria-label={t('b0')}
          className="grid gap-2"
          onKeyDown={(event) => {
            const next = rovingNext(
              event.key,
              getBriefs().map((entry) => entry.id),
              state.governance.brief
            );
            if (next === null) return;
            event.preventDefault();
            actions.setBrief(next);
            document.getElementById(`partner-brief-${next}`)?.focus();
          }}
        >
          {getBriefs().map((brief) => (
            <button
              key={brief.id}
              role="radio"
              id={`partner-brief-${brief.id}`}
              aria-checked={state.governance.brief === brief.id}
              disabled={state.status !== 'active'}
              aria-describedby={state.status !== 'active' ? `${heldId}-brief` : undefined}
              tabIndex={state.governance.brief === brief.id ? 0 : -1}
              onClick={() => actions.setBrief(brief.id)}
              className={`min-h-11 rounded-lg border px-2 py-2 text-left text-xs ${
                state.governance.brief === brief.id
                  ? 'border-cyan-300/70 bg-cyan-400/10 text-white'
                  : 'border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              <span className="font-semibold">{brief.label}:</span> {brief.rule}
            </button>
          ))}
        </div>
        {state.status !== 'active' && <HeldReason id={`${heldId}-brief`}>{stopped}</HeldReason>}
        {routine.length > 0 && (
          <ul className="space-y-1 text-xs" aria-label={t('b1')}>
            {routine.map(({ pending, event }) => {
              const choice = partnerChoice(state, event);
              return (
                <li key={pending.instanceId} className="flex items-start gap-2 text-slate-200">
                  <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  <span>
                    <span className="text-white">{localizedEventText(event.id, event.title)}</span>:{' '}
                    {choice ? localizedEventText(event.id, choice.label) : t('b2')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('m9')}>
        {state.initiatives.length === 0 ? (
          <p className="text-xs text-slate-300">{t('m5')}</p>
        ) : (
          <ul className="space-y-2">
            {[...state.initiatives].reverse().map((savedEntry) => {
              const entry = localizedInitiative(savedEntry);
              return (
                <li key={entry.id} className="rounded-lg border border-slate-700 p-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                    <div className="flex-1">
                      <div className="text-white">
                        {t('m6')} {entry.shift}: {entry.summary}
                        {entry.reversed && <span className="text-slate-300"> {t('m7')}</span>}
                      </div>
                      <div className="text-slate-300">{entry.reason}</div>
                    </div>
                  </div>
                  {canReverse(state, entry) && (
                    <button className={`${BUTTON} mt-2`} onClick={() => actions.reverse(entry.id)}>
                      <Undo2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      {t('m8')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
