import {
  economicsLines,
  FUND_SOURCE_LABELS,
  KNOW_HOW_SOURCE_LABELS,
  netContribution,
  sourceLines,
  type SourceLine,
} from '../../chronicle/ledger';
import { fundOf, knowHowOf, type ChronicleState } from '../../chronicle/engine';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { amount, Section, whole } from './shared';

function Lines({
  lines,
  total,
  unit,
  totalLabel = 'Balance',
  format = whole,
}: {
  lines: SourceLine[];
  total: number;
  unit: string;
  totalLabel?: string;
  /** Know-how comes in halves; it is shown to a tenth, not rounded past a price. */
  format?: (value: number) => string;
}) {
  const largest = Math.max(1, ...lines.map((line) => Math.abs(line.value)));
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">{unit} by source</caption>
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
            {totalLabel}
          </th>
          <td className="py-1 text-right font-semibold tabular-nums text-white">{format(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function LedgerTab({ state }: { state: ChronicleState }) {
  const economics = useOperationsCampaignStore((s) => s.economics);
  const lastClose = sourceLines(state.ledger.lastShiftFund, FUND_SOURCE_LABELS);
  const sinceClose = sourceLines(state.ledger.sinceCloseFund, FUND_SOURCE_LABELS);
  // Before the first close there is no close to count from.
  const sinceTitle =
    state.shift > 0 ? 'Fund since the last shift close' : 'Fund since the charter was signed';
  const net = (lines: SourceLine[]) => lines.reduce((sum, line) => sum + line.value, 0);
  return (
    <div className="space-y-3">
      <Section title="Co-op fund">
        <Lines
          lines={sourceLines(state.ledger.fund, FUND_SOURCE_LABELS)}
          total={fundOf(state)}
          unit="Fund"
        />
      </Section>
      {lastClose.length > 0 && (
        <Section title="Fund at the last shift close">
          <Lines
            lines={lastClose}
            total={net(lastClose)}
            unit="Fund at the last shift close"
            totalLabel="Net change"
          />
        </Section>
      )}
      {sinceClose.length > 0 && (
        <Section title={sinceTitle}>
          <Lines
            lines={sinceClose}
            total={net(sinceClose)}
            unit={sinceTitle}
            totalLabel="Net change"
          />
        </Section>
      )}
      <Section title="Know-how">
        <Lines
          lines={sourceLines(state.ledger.knowHow, KNOW_HOW_SOURCE_LABELS)}
          total={knowHowOf(state)}
          unit="Know-how"
          format={amount}
        />
      </Section>
      <Section title="Plant ledger">
        <Lines
          lines={economicsLines(economics)}
          total={netContribution(economics)}
          unit="Plant contribution"
        />
      </Section>
    </div>
  );
}
