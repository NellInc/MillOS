import { useShallow } from 'zustand/react/shallow';
import { fundOf, type ChronicleState } from '../../chronicle/engine';
import {
  POLICY_LADDERS,
  RESERVE_AUTOFILL_SHARE,
  RESERVE_DEPOSIT,
  STANDING_CONDITIONS,
} from '../../chronicle/governance';
import { SHIFTS_PER_CROP_YEAR } from '../../chronicle/cropYears';
import type { CropYearReturn } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { formatFixed } from '../../i18n';
import { amount, BUTTON, CostTag, FundAmount, ProgressBar, Section, whole } from './shared';

const GRADE_LETTERS = ['F', 'D', 'C', 'B', 'A'];

function grade(points: number | null): string {
  if (points === null) return 'none';
  return `${GRADE_LETTERS[Math.round(points)] ?? '?'} (${formatFixed(points, 1, 'en')})`;
}

function delta(value: number, previous: number | undefined): string {
  if (previous === undefined) return '';
  const change = Math.round(value - previous);
  if (change === 0) return ' (no change)';
  return ` (${change > 0 ? '+' : '-'}${whole(Math.abs(change))})`;
}

/** One filed return as the federation reads it: every figure from the record. */
function ReturnRow({ filed, previous }: { filed: CropYearReturn; previous?: CropYearReturn }) {
  return (
    <li className="rounded-lg border border-slate-700 p-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-white">Crop year {filed.year + 1}</span>
        <span
          className={
            filed.met === true
              ? 'text-emerald-300'
              : filed.met === false
                ? 'text-rose-300'
                : 'text-slate-300'
          }
        >
          {filed.met === true
            ? 'Quota met'
            : filed.met === false
              ? 'Quota missed'
              : 'Baseline year'}
        </span>
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-slate-300">Dispatched</dt>
        <dd className="text-right text-white">
          {whole(filed.dispatchedKg)} kg{delta(filed.dispatchedKg, previous?.dispatchedKg)}
        </dd>
        <dt className="text-slate-300">Quota</dt>
        <dd className="text-right text-white">
          {filed.quotaKg === null ? 'none' : `${whole(filed.quotaKg)} kg`}
        </dd>
        <dt className="text-slate-300">Next quota</dt>
        <dd className="text-right text-white">
          {filed.nextQuotaKg === null ? 'none' : `${whole(filed.nextQuotaKg)} kg`}
        </dd>
        <dt className="text-slate-300">Quality failures</dt>
        <dd className="text-right text-white">
          {whole(filed.qualityFailureKg)} kg
          {delta(filed.qualityFailureKg, previous?.qualityFailureKg)}
        </dd>
        <dt className="text-slate-300">Energy cost</dt>
        <dd className="text-right text-white">
          {whole(filed.energyCost)}
          {delta(filed.energyCost, previous?.energyCost)}
        </dd>
        <dt className="text-slate-300">Average grade</dt>
        <dd className="text-right text-white">{grade(filed.averageGrade)}</dd>
        <dt className="text-slate-300">Reinvested</dt>
        <dd className="text-right text-white">
          {whole(filed.fundReinvested)}
          {delta(filed.fundReinvested, previous?.fundReinvested)}
        </dd>
        <dt className="text-slate-300">Know-how earned</dt>
        <dd className="text-right text-white">{amount(filed.knowHowEarned)}</dd>
        <dt className="text-slate-300">Shifts</dt>
        <dd className="text-right text-white">{filed.shifts}</dd>
      </dl>
      <div className="mt-1 text-slate-300">
        {POLICY_LADDERS.map(
          (ladder) =>
            `${ladder.label}: ${ladder.rungs[filed.policies[ladder.id]].label.toLowerCase()}`
        ).join('; ')}
        {filed.conditions.length
          ? `. Standing: ${filed.conditions.map((id) => STANDING_CONDITIONS[id]?.label.toLowerCase() ?? id).join(', ')}`
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
          title={`Crop year ${tally.year + 1} so far`}
          action={
            <span
              className={`text-xs ${
                quota === null ? 'text-slate-300' : onPace ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {quota === null ? 'baseline year' : onPace ? 'on pace' : 'behind pace'}
            </span>
          }
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
            <span className="whitespace-nowrap text-white">
              {quota !== null
                ? `${whole(tally.dispatchedKg)} of ${whole(quota)} kg`
                : `${whole(tally.dispatchedKg)} kg`}
            </span>
            <span className="whitespace-nowrap text-slate-300">
              shift {tally.shifts} of {SHIFTS_PER_CROP_YEAR}
            </span>
          </div>
          {quota !== null && (
            <div className="relative">
              <ProgressBar
                value={quota > 0 ? tally.dispatchedKg / quota : 1}
                label="Dispatched against the quota"
              />
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

      <Section title="Co-op reserve">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <FundAmount value={gov.reserve.balance} />
          <span className="text-slate-300">drawn {whole(gov.reserve.drawn)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={BUTTON}
            role="switch"
            aria-checked={gov.reserve.autofill}
            disabled={!active}
            onClick={() => actions.setReserveAutofill(!gov.reserve.autofill)}
          >
            Autofill {Math.round(RESERVE_AUTOFILL_SHARE * 100)}% of reinvestment:{' '}
            {gov.reserve.autofill ? 'on' : 'off'}
          </button>
          <button
            className={BUTTON}
            disabled={!active || fundOf(state) < RESERVE_DEPOSIT}
            onClick={actions.depositReserve}
          >
            Deposit
            <CostTag state={state} cost={{ fund: RESERVE_DEPOSIT }} />
          </button>
        </div>
      </Section>

      <Section title="Returns to the federation">
        {returns.length === 0 ? (
          <p className="text-xs text-slate-300">None filed yet</p>
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
