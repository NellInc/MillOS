import { formatFixed, formatGrouped } from '../../i18n';
import { translate, useT } from '../../i18n';
import { messages } from './shared.messages';
import type { ReactNode } from 'react';
import { Coins, Lightbulb } from 'lucide-react';
import type { ChronicleState } from '../../chronicle/engine';
import { fundOf, knowHowOf, price } from '../../chronicle/engine';
import type { Cost } from '../../chronicle/types';

export const BUTTON =
  'min-h-11 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:opacity-60';
export const BUTTON_PRIMARY =
  'min-h-11 rounded-lg border border-cyan-300/60 bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:border-slate-700 disabled:opacity-60';
export const CARD =
  'rounded-xl border border-cyan-400/20 bg-slate-900/90 p-3 text-sm text-slate-200';
export const CHIP =
  'inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200';

export function whole(value: number): string {
  return formatGrouped(Math.round(value));
}

/**
 * A balance as it is, to a tenth. Know-how the AI partner earns comes in halves,
 * and rounding 7.5 to 8 showed an 8 know-how plan as affordable when it was not.
 */
export function amount(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  return Number.isInteger(tenths) ? whole(tenths) : formatFixed(tenths, 1);
}

export function FundAmount({ value }: { value: number }) {
  const t = useT(messages);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Coins className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
      <span className="sr-only">{t('m0')}</span>
      {whole(value)}
    </span>
  );
}

export function KnowHowAmount({ value }: { value: number }) {
  const t = useT(messages);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Lightbulb className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
      <span className="sr-only">{t('m1')}</span>
      {amount(value)}
    </span>
  );
}

/**
 * A cost rendered on its button: fund after training mode, then know-how.
 * Whatever the mill is short of turns rose, so a disabled button says why.
 */
export function CostTag({
  state,
  cost,
  transfer = false,
}: {
  state: ChronicleState;
  cost?: Cost;
  /** A transfer (a reserve deposit) moves its face value; training mode prices purchases only. */
  transfer?: boolean;
}) {
  if (!cost || (!cost.fund && !cost.knowHow)) return null;
  const fund = cost.fund ? (transfer ? cost.fund : price(state, cost.fund)) : 0;
  return (
    <span className="ml-2 inline-flex items-center gap-2 text-slate-300">
      {cost.fund ? (
        <span className={fundOf(state) < fund ? 'text-rose-200' : ''}>
          <FundAmount value={fund} />
        </span>
      ) : null}
      {cost.knowHow ? (
        <span className={knowHowOf(state) < cost.knowHow ? 'text-rose-200' : ''}>
          <KnowHowAmount value={cost.knowHow} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Why a control is held, in the refusal's own words, shown where it is held
 * and named by the control's aria-describedby. Only while it holds: never a
 * standing caption (D-012).
 */
export function HeldReason({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs text-amber-200">
      {children}
    </p>
  );
}

/** The reason every control holds once the chronicle has stopped. */
export function useStoppedReason(): string {
  return useT(messages)('heldStopped');
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{title}</h3>
        {action}
      </div>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
    >
      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  const unit =
    one === 'shift' ? translate(messages, count === 1 ? 'm3' : 'm4') : count === 1 ? one : many;
  return `${formatGrouped(count)} ${unit}`;
}

/**
 * Arrow, Home and End movement for a tablist or radiogroup, as their roles
 * promise. Returns the next value, or null when the key is not a move.
 */
export function rovingNext<T>(key: string, values: readonly T[], current: T): T | null {
  const index = values.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return values[(index + 1) % values.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp')
    return values[(index - 1 + values.length) % values.length];
  if (key === 'Home') return values[0];
  if (key === 'End') return values[values.length - 1];
  return null;
}
