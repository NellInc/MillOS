import { localizedMillCharacter } from '../../chronicle/record';
import { localizedEpilogue } from '../../chronicle/epilogue';
import { getTrials } from '../../chronicle/trials';
import { useT } from '../../i18n';
import { messages } from './ScoreTab.messages';
import { useState } from 'react';
import { Medal as MedalIcon } from 'lucide-react';
import { currentScore, type ChronicleState } from '../../chronicle/engine';

import type { Medal } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, CHIP, Section } from './shared';

const MEDAL_CLASS: Record<Medal, string> = {
  gold: 'text-amber-300',
  silver: 'text-slate-200',
  bronze: 'text-orange-300',
};

export function ScoreTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const abandon = useChronicleStore((s) => s.abandon);
  const [confirming, setConfirming] = useState(false);
  const score = state.finalScore ?? currentScore(state);
  const lines: Array<[string, number]> = [
    [t('m0'), score.trials],
    [t('m1'), score.challenges],
    [t('m2'), score.era],
    [t('m3'), score.grades],
    [t('m4'), score.charter],
    [t('m5'), score.standing ?? 0],
    [t('m6'), score.longNight ?? 0],
    [t('m7'), score.training],
  ];
  const character = localizedMillCharacter(state);
  return (
    <div className="space-y-3">
      <Section title={state.status === 'ended' ? t('m8') : t('m9')}>
        <p className="text-lg font-semibold text-white">{score.total}</p>
        <p className="text-sm text-cyan-200">
          {t('m10', {
            rank:
              (
                {
                  'a sack-carrier': t('x25'),
                  'an apprentice miller': t('x26'),
                  'a journeyman miller': t('x27'),
                  'a master miller': t('x28'),
                  'a millwright of renown': t('x29'),
                  'a steward of the cooperative': t('x30'),
                  'a founder of the federation': t('x31'),
                  'the keeper of the millstream': t('x32'),
                  'the spirit of the millstream': t('x33'),
                } as Record<string, string>
              )[score.rank] ?? score.rank,
          })}
        </p>
        {state.status !== 'ended' && (
          <p className="text-sm text-violet-200">{t('m11', { title: character.title })}</p>
        )}
        <table className="mt-2 w-full text-xs">
          <tbody>
            {lines.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="py-0.5 text-left font-normal text-slate-200">
                  {label}
                </th>
                <td className="py-0.5 text-right tabular-nums text-white">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {state.status === 'ended' && (
        <Section title={t('m12')}>
          <ol className="space-y-2 text-xs leading-5">
            {localizedEpilogue(state).map((entry) => (
              <li key={entry.id}>
                <span className="font-semibold text-white">{entry.title}. </span>
                <span className="text-slate-200">{entry.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {state.trials.length > 0 && (
        <Section title={t('m0')}>
          <ul className="space-y-1 text-xs">
            {getTrials().map((trial) => {
              const progress = state.trials.find((t) => t.id === trial.id);
              return (
                <li key={trial.id} className="flex items-center justify-between gap-2">
                  <span className="text-white">{trial.title}</span>
                  {progress?.medal ? (
                    <span
                      className={`inline-flex items-center gap-1 capitalize ${MEDAL_CLASS[progress.medal]}`}
                    >
                      <MedalIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(({ gold: 'm22', silver: 'm23', bronze: 'm24' } as const)[progress.medal])}
                    </span>
                  ) : (
                    <span className="text-slate-300">
                      {progress?.phase === 'failed'
                        ? t('m13')
                        : progress?.phase === 'active'
                          ? t('m14')
                          : t('m21', { shift: trial.startShift })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {state.challengeMedals.length > 0 && (
        <Section title={t('m15')}>
          <div className="flex flex-wrap gap-2">
            {state.challengeMedals.map((entry) => (
              <span key={entry.runId} className={`${CHIP} capitalize ${MEDAL_CLASS[entry.medal]}`}>
                {t(({ gold: 'm22', silver: 'm23', bronze: 'm24' } as const)[entry.medal])}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('m4')}>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} onClick={abandon}>
              {state.status === 'ended' ? t('m16') : t('m17')}
            </button>
            <button className={BUTTON} onClick={() => setConfirming(false)}>
              {t('m18')}
            </button>
          </div>
        ) : (
          <button className={BUTTON} onClick={() => setConfirming(true)}>
            {state.status === 'ended' ? t('m19') : t('m20')}
          </button>
        )}
      </Section>
    </div>
  );
}
