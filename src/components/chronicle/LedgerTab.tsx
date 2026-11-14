import { localizedSourceLabels, localizedEconomicsLines } from '../../chronicle/ledger';
import { useT } from '../../i18n';
import { messages } from './LedgerTab.messages';
import {
  FUND_SOURCE_LABELS,
  KNOW_HOW_SOURCE_LABELS,
  netContribution,
  sourceLines,
  type SourceLine,
} from '../../chronicle/ledger';
import { fundOf, knowHowOf, type ChronicleState } from '../../chronicle/engine';
import { getImprovements } from '../../chronicle/plans';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { amount, Section, whole } from './shared';

function Lines({
  lines,
  total,
  unit,
  totalLabel,
  format = whole,
}: {
  lines: SourceLine[];
  total: number;
  unit: string;
  /** Defaults to "Balance". */
  totalLabel?: string;
  /** Know-how comes in halves; it is shown to a tenth, not rounded past a price. */
  format?: (value: number) => string;
}) {
  const t = useT(messages);
  const largest = Math.max(1, ...lines.map((line) => Math.abs(line.value)));
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">{t('m8', { unit })}</caption>
      <tbody>
        {lines.map((line) => (
          <tr key={line.key}>
            <th scope="row" className="py-1 pr-2 text-left font-normal text-slate-200">
              {line.label}
              <div className="mt-0.5 h-1 w-full rounded bg-slate-800" aria-hidden="true">
                <div
                  className={`h-1 rounded ${line.value >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                  style={{ width: `${(Math.abs(line.value) / largest) * 100}%` }}
                />
              </div>
            </th>
            <td
              className={`py-1 text-right tabular-nums ${line.value >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {line.value >= 0 ? '+' : ''}
              {format(line.value)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-slate-700">
          <th scope="row" className="py-1 text-left font-semibold text-white">
            {totalLabel ?? t('m0')}
          </th>
          <td className="py-1 text-right font-semibold tabular-nums text-white">{format(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Plan item 4.3 (D8): each installed plan's upkeep beside the cost it kept off
 * the plant's books at the last close and since it was installed, in fund.
 */
function PlanSavingsTable({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const plans = getImprovements();
  const installed = state.improvements
    .filter((progress) => progress.phase === 'installed')
    .flatMap((progress) => {
      const plan = plans.find((candidate) => candidate.id === progress.id);
      return plan ? [plan] : [];
    });
  if (!installed.length) return null;
  const saved = state.planSavings ?? {};
  return (
    <Section title={t('m11')}>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-slate-400">
            <th scope="col" className="py-1 text-left font-normal">
              {t('m12')}
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              {t('m13')}
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              {t('m14')}
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              {t('m15')}
            </th>
          </tr>
        </thead>
        <tbody>
          {installed.map((plan) => (
            <tr key={plan.id}>
              <th scope="row" className="py-1 pr-2 text-left font-normal text-slate-200">
                {plan.label}
              </th>
              <td className="py-1 text-right text-rose-300">-{whole(plan.upkeep)}</td>
              <td className="py-1 text-right text-emerald-300">
                +{amount(saved[plan.id]?.last ?? 0)}
              </td>
              <td className="py-1 text-right text-emerald-300">
                +{amount(saved[plan.id]?.total ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function LedgerTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const economics = useOperationsCampaignStore((s) => s.economics);
  const labels = localizedSourceLabels(FUND_SOURCE_LABELS);
  const lastClose = sourceLines(state.ledger.lastShiftFund, labels);
  const sinceClose = sourceLines(state.ledger.sinceCloseFund, labels);
  // Before the first close there is no close to count from.
  const sinceTitle = state.shift > 0 ? t('m4') : t('m9');
  const net = (lines: SourceLine[]) => lines.reduce((sum, line) => sum + line.value, 0);
  return (
    <div className="space-y-3">
      <Section title={t('m1')}>
        <Lines
          lines={sourceLines(state.ledger.fund, labels)}
          total={fundOf(state)}
          unit={t('m2')}
        />
      </Section>
      {lastClose.length > 0 && (
        <Section title={t('m3')}>
          <Lines lines={lastClose} total={net(lastClose)} unit={t('m3')} totalLabel={t('m10')} />
        </Section>
      )}
      {sinceClose.length > 0 && (
        <Section title={sinceTitle}>
          <Lines
            lines={sinceClose}
            total={net(sinceClose)}
            unit={sinceTitle}
            totalLabel={t('m10')}
          />
        </Section>
      )}
      <PlanSavingsTable state={state} />
      <Section title={t('m5')}>
        <Lines
          lines={sourceLines(state.ledger.knowHow, localizedSourceLabels(KNOW_HOW_SOURCE_LABELS))}
          total={knowHowOf(state)}
          unit={t('m5')}
          format={amount}
        />
      </Section>
      <Section title={t('m6')}>
        <Lines
          lines={localizedEconomicsLines(economics)}
          total={netContribution(economics)}
          unit={t('m7')}
        />
      </Section>
    </div>
  );
}
