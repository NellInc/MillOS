import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { formatFixed, useT } from '../../../i18n';
import {
  inspectionChoiceOrder,
  useProcessInspectionStore,
  type ProcessInspectionKind,
} from '../../../stores/processInspectionStore';
import {
  BREAK_ROLL_DIFFERENTIAL,
  BREAK_ROLL_DIFFERENTIAL_RANGE,
  REDUCTION_ROLL_DIFFERENTIAL_RANGE,
} from '../../../stores/millingSources';
import { LearningNote } from '../../knowledge/LearningNote';
import {
  processInspectionLessons,
  processInspectionMessages,
} from './ProcessInspectionCard.messages';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

/** The milling entry each machine's cutaway explains, offered at its last stage. */
const MILLING_ENTRY: Partial<Record<ProcessInspectionKind, string>> = {
  mill: 'milling-break-reduction',
  sifter: 'milling-purifiers',
  silo: 'milling-cleaning-tempering',
  packer: 'milling-baker-needs',
};

function closeSubject(id: string) {
  const state = useProcessInspectionStore.getState();
  if (state.active?.id === id) state.close();
}

export function ProcessInspectionCard({ subjectId }: { subjectId?: string }) {
  const {
    available,
    active,
    stage,
    feedback,
    seed,
    run,
    completed,
    liveFillPercent,
    start,
    answer,
    next,
    back,
  } = useProcessInspectionStore();
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
  // The silo question reads the level its cutaway draws; the wrong choice is
  // half a silo away, so the two can be told apart at a glance.
  const fill = liveFillPercent ?? 0;
  const params = {
    breakLow: formatFixed(BREAK_ROLL_DIFFERENTIAL_RANGE[0], 1),
    breakHigh: formatFixed(BREAK_ROLL_DIFFERENTIAL_RANGE[1], 1),
    breakBest: formatFixed(BREAK_ROLL_DIFFERENTIAL, 1),
    reductionLow: formatFixed(REDUCTION_ROLL_DIFFERENTIAL_RANGE[0], 1),
    reductionHigh: formatFixed(REDUCTION_ROLL_DIFFERENTIAL_RANGE[1], 1),
    right: formatFixed(fill, 0),
    wrong: formatFixed(fill >= 50 ? fill - 50 : fill + 50, 0),
  };
  const choices = inspectionChoiceOrder(seed, id, run, stage);
  const millingEntry = subject ? MILLING_ENTRY[subject.kind] : undefined;

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
        {subject && completed.includes(id) && (
          <CircleCheck
            className="h-4 w-4 text-emerald-300"
            role="img"
            aria-label={t('completed')}
          />
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
          <p className="text-xs leading-relaxed">{lesson(`text${stage}`, params)}</p>
          {question && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">{lesson(`question${stage}`)}</legend>
              <div className="flex flex-wrap gap-2">
                {choices.map((choice) => (
                  <button key={choice} className={buttonClass} onClick={() => answer(choice)}>
                    {lesson(`${choice}${stage}`, params)}
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
          {stage === 3 && millingEntry && <LearningNote entryId={millingEntry} />}
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
