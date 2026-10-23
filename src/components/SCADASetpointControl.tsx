/**
 * Operator setpoint control for one writable SCADA tag.
 *
 * The write goes through useSCADA().writeSetpoint, so it is logged in the
 * campaign logbook as the operator's decision. Like the agent capability
 * scada.write-setpoint, it is enabled only while SCADA is connected to the
 * local simulation; live and hybrid external writes stay denied. The helper
 * text says what the write really changes: the simulated reading that follows
 * the setpoint (SimulationAdapter), not production throughput, which the
 * campaign's order plan sets.
 *
 * Working if a value inside engLow..engHigh applied here appears in "your
 * decisions" with its tag and value, an out-of-range value is refused with a
 * message and no write, and the control is disabled with its reason outside
 * simulation.
 */
import React, { useId, useState } from 'react';
import { formatGrouped, useLocale, useT } from '../i18n';
import type { SCADAMode, TagDefinition, TagValue } from '../scada/types';
import { scadaSetpointMessages } from './SCADASetpointControl.messages';

export interface SCADASetpointControlProps {
  /** The writable setpoint tag (accessMode READ_WRITE). */
  tag: TagDefinition;
  /** Current value of the setpoint tag. */
  setpoint?: TagValue;
  /** The process-value tag that follows this setpoint, if any. */
  readingTag?: TagDefinition;
  /** Current value of the following tag. */
  reading?: TagValue;
  mode: SCADAMode;
  isConnected: boolean;
  writeSetpoint: (tagId: string, value: number) => Promise<boolean>;
}

type Feedback = { kind: 'applied' | 'refused'; text: string } | null;

export const SCADASetpointControl: React.FC<SCADASetpointControlProps> = ({
  tag,
  setpoint,
  readingTag,
  reading,
  mode,
  isConnected,
  writeSetpoint,
}) => {
  const t = useT(scadaSetpointMessages);
  const locale = useLocale();
  const ids = useId();
  const inputId = `${ids}-input`;
  const helperId = `${ids}-helper`;
  const errorId = `${ids}-error`;
  const reasonId = `${ids}-reason`;

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  const unit = tag.engUnit;
  const format = (value: number) => formatGrouped(value, { maximumFractionDigits: 1 }, locale);
  const withUnit = (value: number) => (unit ? `${format(value)} ${unit}` : format(value));
  const numeric = (value?: TagValue) =>
    typeof value?.value === 'number' && Number.isFinite(value.value) ? value.value : undefined;

  const currentSetpoint = numeric(setpoint);
  const currentReading = numeric(reading);

  const disabledReason = !isConnected
    ? t('disabledNotConnected')
    : mode !== 'simulation'
      ? t('disabledMode', { mode })
      : null;
  const disabled = disabledReason !== null || busy;

  const inputValue = draft ?? (currentSetpoint !== undefined ? String(currentSetpoint) : '');

  const helper = readingTag
    ? [
        t('helperFollows', { tag: readingTag.name }),
        readingTag.alarmLo !== undefined && readingTag.alarmHi !== undefined
          ? t('helperAlarmBand', {
              low: format(readingTag.alarmLo),
              high: format(readingTag.alarmHi),
              unit: readingTag.engUnit,
            })
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : t('helperNoFollower');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const text = inputValue.trim();
    const value = text === '' ? Number.NaN : Number(text);
    if (!Number.isFinite(value)) {
      setError(t('invalidNumber'));
      setFeedback(null);
      return;
    }
    if (value < tag.engLow || value > tag.engHigh) {
      setError(t('outOfRange', { low: format(tag.engLow), high: format(tag.engHigh), unit }));
      setFeedback(null);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ok = await writeSetpoint(tag.id, value);
      if (ok) {
        setDraft(null);
        setFeedback({ kind: 'applied', text: t('applied', { reading: withUnit(value) }) });
      } else {
        setFeedback({ kind: 'refused', text: t('refused') });
      }
    } catch {
      setFeedback({ kind: 'refused', text: t('refused') });
    } finally {
      setBusy(false);
    }
  };

  const describedBy = [helperId, error ? errorId : null, disabledReason ? reasonId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-1 rounded border border-slate-700/60 bg-slate-900/40 px-2 py-2 text-xs"
      aria-label={t('legend')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-slate-300">
        <span>
          {currentSetpoint !== undefined
            ? t('currentSetpoint', { reading: withUnit(currentSetpoint) })
            : t('noReading')}
        </span>
        {readingTag && (
          <span className="text-slate-400">
            {currentReading !== undefined
              ? t('currentReading', {
                  tag: readingTag.name,
                  reading:
                    readingTag.engUnit !== undefined
                      ? `${format(currentReading)} ${readingTag.engUnit}`
                      : format(currentReading),
                })
              : t('noReading')}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('inputLabel', { tag: tag.name, unit })}
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={tag.engLow}
          max={tag.engHigh}
          step="any"
          value={inputValue}
          disabled={disabledReason !== null}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
            setFeedback(null);
          }}
          className="w-28 rounded border border-slate-600/70 bg-slate-800/70 px-2 py-1 text-sm text-white focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-400/80"
        />
        <span className="text-slate-400" aria-hidden="true">
          {unit}
        </span>
        <button
          type="submit"
          disabled={disabled}
          aria-describedby={disabledReason ? reasonId : undefined}
          className="ml-auto rounded bg-cyan-600/80 px-3 py-1 text-sm font-medium text-white hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700/60 disabled:text-slate-400"
        >
          {busy ? t('applying') : t('apply')}
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-red-300">
          {error}
        </p>
      )}
      {disabledReason && (
        <p id={reasonId} className="mt-1 text-amber-300">
          {disabledReason}
        </p>
      )}
      <p id={helperId} className="mt-1 text-slate-400">
        {helper}
      </p>
      <p
        role="status"
        aria-live="polite"
        className={feedback?.kind === 'refused' ? 'mt-1 text-amber-300' : 'mt-1 text-emerald-300'}
      >
        {feedback?.text ?? ''}
      </p>
    </form>
  );
};
