import { formatFixed } from '../../i18n';
import { getDelegationLevels } from '../../chronicle/delegation';
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

import { canReverse, type ChronicleState } from '../../chronicle/engine';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, ProgressBar, rovingNext, Section } from './shared';

const TIER_CLASS = {
  cool: 'text-sky-300',
  neutral: 'text-slate-200',
  warm: 'text-amber-300',
} as const;

export function PartnersTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const actions = useChronicleStore(
    useShallow((s) => ({ setDelegation: s.setDelegation, reverse: s.reverse }))
  );
  return (
    <div className="space-y-3">
      <Section title={t('m0')}>
        {state.customers.map((customer) => {
          const tier = relationshipTier(customer.value);
          return (
            <div key={customer.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-white">{customer.name}</span>
                <span className={`text-xs capitalize ${TIER_CLASS[tier]}`}>
                  {{ cool: t('p16'), neutral: t('p17'), warm: t('p18') }[tier]} {customer.value}
                </span>
              </div>
              <ProgressBar value={customer.value / 100} label={t('p13', { name: customer.name })} />
            </div>
          );
        })}
      </Section>

      <Section title={t('m1')}>
        {state.stakeholders.map((party) => {
          const tier = relationshipTier(party.value);
          const standing = localizedStakeholderStanding(state.stakeholders, party.id);
          return (
            <div key={party.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="shrink-0 text-white">{localizedStakeholderName(party.id)}</span>
                <span className={`text-xs capitalize ${TIER_CLASS[tier]}`}>
                  {{ cool: t('p16'), neutral: t('p17'), warm: t('p18') }[tier]} {party.value}
                  {standing ? <span className="normal-case"> · {standing}</span> : null}
                </span>
              </div>
              <ProgressBar
                value={party.value / 100}
                label={t('p13', { name: localizedStakeholderName(party.id) })}
              />
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
            const next = rovingNext(
              event.key,
              getDelegationLevels().map((entry) => entry.level),
              state.delegation
            );
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
