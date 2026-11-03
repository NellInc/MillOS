import { useShallow } from 'zustand/react/shallow';
import { fundOf, type ChronicleState } from '../../chronicle/engine';
import {
  getPolicyLadders,
  getStandingConditions,
  RESERVE_AUTOFILL_SHARE,
  RESERVE_DEPOSIT,
} from '../../chronicle/governance';
import { SHIFTS_PER_CROP_YEAR } from '../../chronicle/cropYears';
import type { CropYearReturn } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { formatFixed, formatGrouped, useT, type Translator } from '../../i18n';
import { messages } from './ReturnsTab.messages';
import { amount, BUTTON, CostTag, FundAmount, ProgressBar, Section, whole } from './shared';

type T = Translator<typeof messages.en>;

const GRADE_LETTERS = ['F', 'D', 'C', 'B', 'A'];

function grade(t: T, points: number | null): string {
  if (points === null) return t('m0');
  return `${GRADE_LETTERS[Math.round(points)] ?? '?'} (${formatFixed(points, 1)})`;
}

function delta(t: T, value: number, previous: number | undefined): string {
  if (previous === undefined) return '';
  const change = Math.round(value - previous);
  if (change === 0) return t('m1');
  return ` (${change > 0 ? '+' : '-'}${whole(Math.abs(change))})`;
}

/** One filed return as the federation reads it: every figure from the record. */
function ReturnRow({ filed, previous }: { filed: CropYearReturn; previous?: CropYearReturn }) {
  const t = useT(messages);
  return (
    <li className="rounded-lg border border-slate-700 p-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-white">
          {t('p2', { year: formatGrouped(filed.year + 1) })}
        </span>
        <span
          className={
            filed.met === true
              ? 'text-emerald-300'
              : filed.met === false
                ? 'text-rose-300'
                : 'text-slate-300'
          }
        >
          {filed.met === true ? t('m3') : filed.met === false ? t('m4') : t('m5')}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-slate-300">{t('m6')}</dt>
        <dd className="text-right text-white">
          {whole(filed.dispatchedKg)} kg{delta(t, filed.dispatchedKg, previous?.dispatchedKg)}
        </dd>
        <dt className="text-slate-300">{t('m7')}</dt>
        <dd className="text-right text-white">
          {filed.quotaKg === null ? t('m0') : `${whole(filed.quotaKg)} kg`}
        </dd>
        <dt className="text-slate-300">{t('m8')}</dt>
        <dd className="text-right text-white">
          {filed.nextQuotaKg === null ? t('m0') : `${whole(filed.nextQuotaKg)} kg`}
        </dd>
        <dt className="text-slate-300">{t('m9')}</dt>
        <dd className="text-right text-white">
          {whole(filed.qualityFailureKg)} kg
          {delta(t, filed.qualityFailureKg, previous?.qualityFailureKg)}
        </dd>
        <dt className="text-slate-300">{t('m10')}</dt>
        <dd className="text-right text-white">
          {whole(filed.energyCost)}
          {delta(t, filed.energyCost, previous?.energyCost)}
        </dd>
        <dt className="text-slate-300">{t('m11')}</dt>
        <dd className="text-right text-white">{grade(t, filed.averageGrade)}</dd>
        <dt className="text-slate-300">{t('m12')}</dt>
        <dd className="text-right text-white">
          {whole(filed.fundReinvested)}
          {delta(t, filed.fundReinvested, previous?.fundReinvested)}
        </dd>
        <dt className="text-slate-300">{t('m13')}</dt>
        <dd className="text-right text-white">{amount(filed.knowHowEarned)}</dd>
        <dt className="text-slate-300">{t('m14')}</dt>
        <dd className="text-right text-white">{whole(filed.shifts)}</dd>
      </dl>
      <div className="mt-1 text-slate-300">
        {getPolicyLadders()
          .map(
            (ladder) =>
              `${ladder.label}: ${ladder.rungs[filed.policies[ladder.id]].label.toLowerCase()}`
          )
          .join('; ')}
        {filed.conditions.length
          ? t('p15', {
              conditions: filed.conditions
                .map((id) => getStandingConditions()[id]?.label.toLowerCase() ?? id)
                .join(', '),
            })
          : ''}
      </div>
    </li>
  );
}

/**
 * Part three's returns and reserve (docs/CHRONICLE.md, systems 30-31): the
 * running crop year against its quota, each filed return, and the co-op reserve.
 */
export function ReturnsTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const actions = useChronicleStore(
    useShallow((s) => ({
      setReserveAutofill: s.setReserveAutofill,
      depositReserve: s.depositReserve,
    }))
  );
  const gov = state.governance;
  const tally = gov.tally;
  const quota = gov.quotaKg;
  // An even pace: the share of the year's shifts already closed.
  const paceShare = tally.shifts / SHIFTS_PER_CROP_YEAR;
  const onPace = quota === null || tally.dispatchedKg >= quota * paceShare;
  const active = state.status === 'active';
  const returns = gov.returns;
  return (
    <div className="space-y-3">
      {active && (
        <Section
          title={t('p16', { year: formatGrouped(tally.year + 1) })}
          action={
            <span
              className={`text-xs ${
                quota === null ? 'text-slate-300' : onPace ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {quota === null ? t('m17') : onPace ? t('m18') : t('m19')}
            </span>
          }
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
            <span className="whitespace-nowrap text-white">
              {quota !== null
                ? t('p20', { done: whole(tally.dispatchedKg), total: whole(quota) })
                : `${whole(tally.dispatchedKg)} kg`}
            </span>
            <span className="whitespace-nowrap text-slate-300">
              {t('p21', {
                shift: formatGrouped(tally.shifts),
                total: formatGrouped(SHIFTS_PER_CROP_YEAR),
              })}
            </span>
          </div>
          {quota !== null && (
            <div className="relative">
              <ProgressBar value={quota > 0 ? tally.dispatchedKg / quota : 1} label={t('m22')} />
              {/* Where the year's dispatch would stand if it kept an even pace. */}
              <div
                aria-hidden="true"
                className="absolute -top-0.5 h-3 w-0.5 rounded bg-amber-300"
                style={{ left: `${Math.min(100, paceShare * 100)}%` }}
              />
            </div>
          )}
        </Section>
      )}

      <Section title={t('m23')}>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <FundAmount value={gov.reserve.balance} />
          <span className="text-slate-300">{t('p24', { value: whole(gov.reserve.drawn) })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={BUTTON}
            role="switch"
            aria-checked={gov.reserve.autofill}
            disabled={!active}
            onClick={() => actions.setReserveAutofill(!gov.reserve.autofill)}
          >
            {t('p25', {
              share: formatGrouped(Math.round(RESERVE_AUTOFILL_SHARE * 100)),
              state: gov.reserve.autofill ? t('m26') : t('m27'),
            })}
          </button>
          <button
            className={BUTTON}
            disabled={!active || fundOf(state) < RESERVE_DEPOSIT}
            onClick={actions.depositReserve}
          >
            {t('m28')}
            <CostTag state={state} cost={{ fund: RESERVE_DEPOSIT }} />
          </button>
        </div>
      </Section>

      <Section title={t('m29')}>
        {returns.length === 0 ? (
          <p className="text-xs text-slate-300">{t('m30')}</p>
        ) : (
          <ul className="space-y-2">
            {[...returns]
              .map((filed, index) => ({ filed, previous: returns[index - 1] }))
              .reverse()
              .map(({ filed, previous }) => (
                <ReturnRow key={filed.year} filed={filed} previous={previous} />
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
