import { useProcessInspectionStore } from '../../../stores/processInspectionStore';
import { useEffect, useId, useRef } from 'react';
import { useT } from '../../../i18n';
import { useWindmillLearningStore } from '../../../stores/windmillLearningStore';
import { windmillLearningMessages as messages } from './WindmillLearningCard.messages';

const buttonClass =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

export function WindmillLearningCard() {
  const t = useT(messages);
  const { ready, open, stage, feedback, start, close, answer, next, back } =
    useWindmillLearningStore();
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, stage]);
  useEffect(() => () => useWindmillLearningStore.getState().close(), []);
  const question = stage === 'power' || stage === 'grind';
  const startLesson = () => {
    if (!ready) return;
    useProcessInspectionStore.getState().close();
    start();
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-slate-200">
      <details
        open={open}
        onToggle={(event) => {
          if (!event.currentTarget.open) close();
        }}
      >
        <summary
          className="cursor-pointer text-sm font-semibold"
          onClick={(event) => {
            event.preventDefault();
            if (open) close();
            else startLesson();
          }}
        >
          {t('title')}
        </summary>
        {open && (
          <section className="mt-3 space-y-3" aria-labelledby={headingId}>
            <h3 id={headingId} ref={heading} tabIndex={-1} className="text-sm font-semibold">
              {t('follow')}: {t(`${stage}Title`)}
            </h3>
            <p className="text-xs leading-relaxed">{t(stage)}</p>
            {stage === 'feed' && <p className="text-xs text-cyan-200">{t('path')}</p>}
            {question && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">{t(`${stage}Question`)}</legend>
                <div className="flex flex-wrap gap-2">
                  {(stage === 'power'
                    ? (['sails', 'runner'] as const)
                    : (['runner', 'bed'] as const)
                  ).map((choice) => (
                    <button key={choice} className={buttonClass} onClick={() => answer(choice)}>
                      {t(choice)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <p role="status" className="text-xs text-cyan-200">
              {feedback === 'correct'
                ? t('correct')
                : feedback === 'retry' && question
                  ? t(`${stage}Retry`)
                  : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} disabled={stage === 'power'} onClick={back}>
                {t('back')}
              </button>
              <button
                className={buttonClass}
                disabled={question && feedback !== 'correct'}
                onClick={next}
              >
                {t(stage === 'collect' ? 'finish' : 'next')}
              </button>
              <button className={buttonClass} onClick={close}>
                {t('close')}
              </button>
            </div>
          </section>
        )}
      </details>
      {!open && (
        <button className={`${buttonClass} mt-2`} disabled={!ready} onClick={startLesson}>
          {t('start')}
        </button>
      )}
    </div>
  );
}
