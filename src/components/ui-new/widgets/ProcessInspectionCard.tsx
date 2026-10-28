import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import { useProcessInspectionStore } from '../../../stores/processInspectionStore';
import {
  processInspectionLessons,
  processInspectionMessages,
} from './ProcessInspectionCard.messages';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

function closeSubject(id: string) {
  const state = useProcessInspectionStore.getState();
  if (state.active?.id === id) state.close();
}

export function ProcessInspectionCard({ subjectId }: { subjectId?: string }) {
  const { available, active, stage, feedback, start, answer, next, back } =
    useProcessInspectionStore();
  const [selectedId, setSelectedId] = useState('');
  const subjects = Object.values(available);
  const id =
    subjectId ?? active?.id ?? (available[selectedId] ? selectedId : subjects[0]?.id) ?? '';
  const subject = available[id];
  const open = Boolean(subject && active?.id === id);
  const t = useT(processInspectionMessages);
  const lesson = useT(processInspectionLessons[subject?.kind ?? 'mill']);
  const headingId = useId();
  const selectId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => closeSubject(id), [id]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, id, stage]);
  const question = stage === 0 || stage === 2;

  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        {subjectId === undefined ? (
          <>
            <label htmlFor={selectId} className="text-sm font-semibold">
              {t('inspect')}
            </label>
            <select
              id={selectId}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-900 px-2 text-sm"
              value={id}
              disabled={subjects.length === 0}
              onChange={(event) => {
                closeSubject(id);
                setSelectedId(event.target.value);
              }}
            >
              {subjects.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <h3 className="text-sm font-semibold">{subject?.name ?? t('inspect')}</h3>
        )}
        {!open && (
          <button className={buttonClass} disabled={!subject} onClick={() => start(id)}>
            {t('view')}
          </button>
        )}
      </div>
      {open && (
        <section className="mt-3 space-y-3" aria-labelledby={headingId}>
          <h3 id={headingId} ref={heading} tabIndex={-1} className="text-sm font-semibold">
            {subject?.name}: {lesson(`title${stage}`)}
          </h3>
          <p className="text-xs leading-relaxed">{lesson(`text${stage}`)}</p>
          {question && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">{lesson(`question${stage}`)}</legend>
              <div className="flex flex-wrap gap-2">
                {(['a', 'b'] as const).map((choice) => (
                  <button key={choice} className={buttonClass} onClick={() => answer(choice)}>
                    {lesson(`${choice}${stage}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <p role="status" className="text-xs text-cyan-200">
            {feedback === 'correct'
              ? t('correct')
              : feedback === 'retry' && question
                ? lesson(`retry${stage}`)
                : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} disabled={stage === 0} onClick={back}>
              {t('back')}
            </button>
            <button
              className={buttonClass}
              disabled={question && feedback !== 'correct'}
              onClick={next}
            >
              {t(stage === 3 ? 'finish' : 'next')}
            </button>
            <button className={buttonClass} onClick={() => closeSubject(id)}>
              {t('close')}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
