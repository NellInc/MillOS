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
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { Section, whole } from './shared';

function Lines({ lines, total, unit }: { lines: SourceLine[]; total: number; unit: string }) {
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
              {whole(line.value)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-slate-700">
          <th scope="row" className="py-1 text-left font-semibold text-white">
            {t('m0')}
          </th>
          <td className="py-1 text-right font-semibold tabular-nums text-white">{whole(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function LedgerTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const economics = useOperationsCampaignStore((s) => s.economics);
  const lastShiftFund = sourceLines(
    state.ledger.lastShiftFund,
    localizedSourceLabels(FUND_SOURCE_LABELS)
  );
  return (
    <div className="space-y-3">
      <Section title={t('m1')}>
        <Lines
          lines={sourceLines(state.ledger.fund, localizedSourceLabels(FUND_SOURCE_LABELS))}
          total={fundOf(state)}
          unit={t('m2')}
        />
      </Section>
      {lastShiftFund.length > 0 && (
        <Section title={t('m3')}>
          <Lines
            lines={lastShiftFund}
            total={lastShiftFund.reduce((sum, line) => sum + line.value, 0)}
            unit={t('m4')}
          />
        </Section>
      )}
      <Section title={t('m5')}>
        <Lines
          lines={sourceLines(state.ledger.knowHow, localizedSourceLabels(KNOW_HOW_SOURCE_LABELS))}
          total={knowHowOf(state)}
          unit={t('m5')}
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
