import { getCharterColumns, realHoursForShifts } from '../../chronicle/charter';
import { chronicleShifts, trialsFor } from '../../chronicle/schedule';
import { formatFixed, formatGrouped, useT } from '../../i18n';
import { formatPaceRatio, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { messages } from './CharterScreen.messages';
import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { charterScore, DEFAULT_CHARTER, fortuneCounts } from '../../chronicle/charter';
import type { Charter, CharterTier } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON_PRIMARY, CARD, plural } from './shared';

type CharterChoice = Omit<Charter, 'seed'>;

const TIER_LABEL: Record<CharterTier, keyof typeof messages.en> = {
  beginner: 'm0',
  historical: 'm1',
  hard: 'm2',
};

const TIER_CLASS: Record<CharterTier, string> = {
  beginner: 'text-emerald-300',
  historical: 'text-amber-200',
  hard: 'text-rose-300',
};

export function CharterScreen() {
  const t = useT(messages);
  const [choice, setChoice] = useState<CharterChoice>({ ...DEFAULT_CHARTER, length: 'full' });
  const shifts = chronicleShifts(choice);
  const sign = useChronicleStore((s) => s.sign);
  const bonus = charterScore(choice);
  // The pace the clock runs at; a paused clock is read at the pace it resumes at.
  const pace = useGameSimulationStore((s) =>
    s.gameSpeed > 0
      ? s.gameSpeed
      : (s.clockHolds.find((hold) => hold.resumeSpeed > 0)?.resumeSpeed ?? STANDARD_GAME_SPEED)
  );
  const hours = Math.round(realHoursForShifts(shifts, pace) * 10) / 10;
  // Only a historical chronicle runs trials (engine.ts, signCharter).
  const firstTrial =
    choice.mode === 'historical'
      ? Math.min(...trialsFor(choice).map((trial) => trial.startShift))
      : null;
  return (
    <section aria-label={t('m3')} className="space-y-3">
      {getCharterColumns().map((column) => (
        <fieldset key={column.key} className={CARD}>
          <legend className="px-1 font-semibold text-white">{column.label}</legend>
          <div className="mt-1 grid gap-2">
            {column.options.map((option) => {
              const selected = choice[column.key] === option.id;
              // A sandbox meets no fortune, so its fortune earns nothing (charterScore).
              const score =
                column.key === 'fortune' && !fortuneCounts(choice.mode) ? 0 : option.score;
              return (
                <label
                  key={option.id}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                    selected
                      ? 'border-cyan-300/70 bg-cyan-400/10'
                      : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name={`charter-${column.key}`}
                    value={option.id}
                    checked={selected}
                    onChange={() =>
                      setChoice((current) => ({ ...current, [column.key]: option.id }))
                    }
                    className="mt-1"
                  />
                  <span className="flex-1 text-sm">
                    <span className="font-medium text-white">{option.label}</span>
                    <span className="text-slate-200">: {option.effect}. </span>
                    <span className={TIER_CLASS[option.tier]}>
                      {t(TIER_LABEL[option.tier])}
                      {score > 0 ? ` +${score}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button className={`${BUTTON_PRIMARY} w-full`} onClick={() => sign(choice)}>
        <ScrollText className="mr-2 inline h-4 w-4" aria-hidden="true" />
        {t('m4')}
        {t('commitment', {
          shifts: plural(shifts, 'shift'),
          hours: formatFixed(hours, Number.isInteger(hours) ? 0 : 1),
          pace: formatPaceRatio(pace),
        })}
        {firstTrial !== null ? t('firstTrial', { shift: formatGrouped(firstTrial) }) : ''}
        {bonus > 0 ? t('m5', { bonus }) : ''}
      </button>
    </section>
  );
}
