import { useSyncExternalStore } from 'react';
import { Bot } from 'lucide-react';
import { formatFixed, useLocale, useT } from '../../i18n';
import { jevQueueLabel } from '../../utils/jevClient.messages';
import { incidentTitle } from '../../stores/incidentText';
import {
  INCIDENT_QUEUE,
  onDeviceOperatorRecords,
  subscribeOnDeviceOperator,
} from '../../utils/onDeviceOperator';
import { onDeviceOperatorRecordMessages } from './OnDeviceOperatorRecord.messages';

const VISIBLE = 20;

/**
 * What the on-device operator did this session, newest first, with what each
 * action asked of people. Shown once it has settled something.
 */
export function OnDeviceOperatorRecord() {
  const t = useT(onDeviceOperatorRecordMessages);
  const locale = useLocale();
  const records = useSyncExternalStore(subscribeOnDeviceOperator, onDeviceOperatorRecords);
  if (records.length === 0) return null;
  // By incident, from its latest record: one held at a boundary is filed again
  // with its outcome once the boundary clears.
  const latestOutcome = new Map(records.map((record) => [record.incidentId, record.outcome]));
  const handled = [...latestOutcome.values()].filter((outcome) => outcome === 'handled').length;
  const left = latestOutcome.size - handled;
  return (
    <section
      aria-labelledby="on-device-record-heading"
      className="space-y-2 text-xs text-slate-300"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="on-device-record-heading"
          className="flex items-center gap-2 text-sm font-semibold text-cyan-300"
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          {t('heading')}
        </h3>
        <span className="text-slate-400">
          {t('summary', {
            handled: formatFixed(handled, 0),
            left: formatFixed(left, 0),
          })}
        </span>
      </div>
      <ol className="space-y-1.5">
        {records
          .map((record, position) => ({ record, position }))
          .reverse()
          .slice(0, VISIBLE)
          .map(({ record, position }) => (
            <li
              key={`${position}-${record.incidentId}`}
              className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                {/* By kind, in the language chosen now; the stored title is the fallback. */}
                <span className="font-medium text-slate-100">{incidentTitle(record)}</span>
                <span className="text-slate-500">
                  {t('minute', { minute: formatFixed(record.minute, 0) })}
                </span>
              </div>
              <p className="text-slate-300">
                {record.queue ? jevQueueLabel(record.queue, locale) : t('noRoute')} ·{' '}
                {t(record.outcome, {
                  expected: jevQueueLabel(INCIDENT_QUEUE[record.kind], locale),
                })}
              </p>
              <p className={record.outcome === 'handled' ? 'text-emerald-300' : 'text-amber-200'}>
                {record.outcome === 'handled' ? t('peopleHandled') : t('peopleLeft')}
              </p>
            </li>
          ))}
      </ol>
    </section>
  );
}
