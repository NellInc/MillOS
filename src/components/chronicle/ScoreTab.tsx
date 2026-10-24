import { useState } from 'react';
import { Medal as MedalIcon } from 'lucide-react';
import { currentScore, type ChronicleState } from '../../chronicle/engine';
import { epilogue } from '../../chronicle/epilogue';
import { millCharacter } from '../../chronicle/record';
import { TRIALS } from '../../chronicle/trials';
import type { Medal } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, CHIP, Section } from './shared';

const MEDAL_CLASS: Record<Medal, string> = {
  gold: 'text-amber-300',
  silver: 'text-slate-200',
  bronze: 'text-orange-300',
};

export function ScoreTab({ state }: { state: ChronicleState }) {
  const abandon = useChronicleStore((s) => s.abandon);
  const [confirming, setConfirming] = useState(false);
  const score = state.finalScore ?? currentScore(state);
  const lines: Array<[string, number]> = [
    ['Trials', score.trials],
    ['Recovery challenges', score.challenges],
    ['Era', score.era],
    ['Shift grades', score.grades],
    ['Charter', score.charter],
    ['Standing', score.standing ?? 0],
    ['The long night', score.longNight ?? 0],
    ['Training mode', score.training],
  ];
  const character = millCharacter(state);
  return (
    <div className="space-y-3">
      <Section title={state.status === 'ended' ? 'Final score' : 'Score so far'}>
        <p className="text-lg font-semibold text-white">{score.total}</p>
        <p className="text-sm text-cyan-200">You are as wise as {score.rank}.</p>
        {state.status !== 'ended' && (
          <p className="text-sm text-violet-200">The valley calls it {character.title}.</p>
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
        <Section title="Epilogue">
          <ol className="space-y-2 text-xs leading-5">
            {epilogue(state).map((entry) => (
              <li key={entry.id}>
                <span className="font-semibold text-white">{entry.title}. </span>
                <span className="text-slate-200">{entry.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {state.trials.length > 0 && (
        <Section title="Trials">
          <ul className="space-y-1 text-xs">
            {TRIALS.map((trial) => {
              const progress = state.trials.find((t) => t.id === trial.id);
              return (
                <li key={trial.id} className="flex items-center justify-between gap-2">
                  <span className="text-white">{trial.title}</span>
                  {progress?.medal ? (
                    <span
                      className={`inline-flex items-center gap-1 capitalize ${MEDAL_CLASS[progress.medal]}`}
                    >
                      <MedalIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {progress.medal}
                    </span>
                  ) : (
                    <span className="text-slate-300">
                      {progress?.phase === 'failed'
                        ? 'Failed'
                        : progress?.phase === 'active'
                          ? 'Under way'
                          : `Shift ${trial.startShift}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {state.challengeMedals.length > 0 && (
        <Section title="Recovery challenge medals">
          <div className="flex flex-wrap gap-2">
            {state.challengeMedals.map((entry) => (
              <span key={entry.runId} className={`${CHIP} capitalize ${MEDAL_CLASS[entry.medal]}`}>
                {entry.medal}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Charter">
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} onClick={abandon}>
              {state.status === 'ended' ? 'Yes, begin anew' : 'Yes, abandon it'}
            </button>
            <button className={BUTTON} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button className={BUTTON} onClick={() => setConfirming(true)}>
            {state.status === 'ended' ? 'Begin a new chronicle' : 'Abandon this chronicle'}
          </button>
        )}
      </Section>
    </div>
  );
}
