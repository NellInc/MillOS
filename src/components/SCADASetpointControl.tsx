/**
 * Operator setpoint control for one writable SCADA tag.
 *
 * The write goes through useSCADA().writeSetpoint, so it is logged in the
 * campaign logbook as the operator's decision. Like the agent capability
 * scada.write-setpoint, it is enabled only while SCADA is connected to the
 * local simulation; live and hybrid external writes stay denied. There is no
 * helper line (D-012): the alarm band sits beside the reading it limits, and
 * the result of a write says what it really changed. A mill's roll speed is
 * the line rate (lineRateSetpoint.ts, plan item 7.5): the result states the
 * new rate and its wear and energy per tonne against 100%.
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
import {
  isRollSpeedSetpoint,
  lineRateForRollSpeed,
  lineRatePerTonne,
} from '../scada/lineRateSetpoint';

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

// Results are kept as data and worded at render, so a language switch
// re-reads them instead of leaving the line in the language it was written in.
type Feedback = { kind: 'applied'; value: number } | { kind: 'refused' } | null;
type InputError = 'invalidNumber' | 'outOfRange' | null;

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
  const errorId = `${ids}-error`;
  const reasonId = `${ids}-reason`;

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<InputError>(null);
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

  const readingText = (tagName: string, value: number) => {
    const reading =
      readingTag?.engUnit !== undefined ? `${format(value)} ${readingTag.engUnit}` : format(value);
    return readingTag?.alarmLo !== undefined && readingTag.alarmHi !== undefined
      ? t('currentReadingBand', {
          tag: tagName,
          reading,
          low: format(readingTag.alarmLo),
          high: format(readingTag.alarmHi),
          unit: readingTag.engUnit,
        })
      : t('currentReading', { tag: tagName, reading });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const text = inputValue.trim();
    const value = text === '' ? Number.NaN : Number(text);
    if (!Number.isFinite(value)) {
      setError('invalidNumber');
      setFeedback(null);
      return;
    }
    if (value < tag.engLow || value > tag.engHigh) {
      setError('outOfRange');
      setFeedback(null);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ok = await writeSetpoint(tag.id, value);
      if (ok) {
        setDraft(null);
        setFeedback({ kind: 'applied', value });
      } else {
        setFeedback({ kind: 'refused' });
      }
    } catch {
      setFeedback({ kind: 'refused' });
    } finally {
      setBusy(false);
    }
  };

  const errorText =
    error === 'outOfRange'
      ? t('outOfRange', { low: format(tag.engLow), high: format(tag.engHigh), unit })
      : error === 'invalidNumber'
        ? t('invalidNumber')
        : null;
  const rateText = (rpm: number) => {
    const rate = lineRateForRollSpeed(rpm);
    const perTonne = lineRatePerTonne(rate);
    return rate > 0
      ? t('appliedRate', {
          rate: formatGrouped(rate * 100, { maximumFractionDigits: 0 }, locale),
          wear: formatGrouped(
            perTonne.wear,
            { minimumFractionDigits: 2, maximumFractionDigits: 2 },
            locale
          ),
          energy: formatGrouped(
            perTonne.energy,
            { minimumFractionDigits: 2, maximumFractionDigits: 2 },
            locale
          ),
        })
      : t('appliedStopped');
  };
  const appliedText = (value: number) =>
    readingTag
      ? t('appliedFollows', { reading: withUnit(value), tag: readingTag.name })
      : t('applied', { reading: withUnit(value) });
  const feedbackText =
    feedback?.kind === 'applied'
      ? isRollSpeedSetpoint(tag.id)
        ? `${appliedText(feedback.value)} ${rateText(feedback.value)}`
        : appliedText(feedback.value)
      : feedback?.kind === 'refused'
        ? t('refused')
        : '';

  const describedBy =
    [error ? errorId : null, disabledReason ? reasonId : null].filter(Boolean).join(' ') ||
    undefined;

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
              ? readingText(readingTag.name, currentReading)
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
        {/* A pending write marks Apply busy rather than disabling it: a browser
            moves focus off a focused control that becomes disabled, so the
            keyboard user who pressed it landed on the page body. submit()
            ignores a press while busy. */}
        <button
          type="submit"
          disabled={disabledReason !== null}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          aria-describedby={disabledReason ? reasonId : undefined}
          className="ml-auto rounded bg-cyan-600/80 px-3 py-1 text-sm font-medium text-white hover:bg-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700/60 disabled:text-slate-400"
        >
          {busy ? t('applying') : t('apply')}
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1 text-red-300">
          {errorText}
        </p>
      )}
      {disabledReason && (
        <p id={reasonId} className="mt-1 text-amber-300">
          {disabledReason}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className={feedback?.kind === 'refused' ? 'mt-1 text-amber-300' : 'mt-1 text-emerald-300'}
      >
        {feedbackText}
      </p>
    </form>
  );
};
