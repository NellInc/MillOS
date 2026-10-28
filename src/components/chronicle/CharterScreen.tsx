import { getCharterColumns } from '../../chronicle/charter';
import { useT } from '../../i18n';
import { messages } from './CharterScreen.messages';
import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { charterScore, DEFAULT_CHARTER } from '../../chronicle/charter';
import type { Charter, CharterTier } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON_PRIMARY, CARD } from './shared';

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
  const [choice, setChoice] = useState<CharterChoice>(DEFAULT_CHARTER);
  const sign = useChronicleStore((s) => s.sign);
  const bonus = charterScore(choice);
  return (
    <section aria-label={t('m3')} className="space-y-3">
      {getCharterColumns().map((column) => (
        <fieldset key={column.key} className={CARD}>
          <legend className="px-1 font-semibold text-white">{column.label}</legend>
          <div className="mt-1 grid gap-2">
            {column.options.map((option) => {
              const selected = choice[column.key] === option.id;
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
                      {option.score > 0 ? ` +${option.score}` : ''}
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
        {bonus > 0 ? t('m5', { bonus }) : ''}
      </button>
    </section>
  );
}
