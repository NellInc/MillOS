import { useEffect } from 'react';
import { ArrowRight, Check, ChevronLeft, Factory, Gauge, MousePointer2, X } from 'lucide-react';

export interface OnboardingStep {
  readonly title: string;
  readonly content: string;
  readonly icon: 'factory' | 'goal' | 'controls';
}

interface OnboardingGuideProps {
  readonly step: OnboardingStep;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly onClose: () => void;
}

const ICONS = {
  factory: Factory,
  goal: Gauge,
  controls: MousePointer2,
} as const;

export function OnboardingGuide({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
  onClose,
}: OnboardingGuideProps) {
  const StepIcon = ICONS[step.icon];
  const isLastStep = stepIndex === stepCount - 1;

  // Escape closes the tour for this session, unless a dialog (modal or the HUD
  // notifications popover) or an open menu above it owns the key. Capture
  // phase so panels underneath do not also close.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <section
      aria-label={`Getting started, step ${stepIndex + 1} of ${stepCount}`}
      className="pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-15.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-cyan-400/40 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md sm:left-5 sm:right-auto sm:w-[360px]"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
          <StepIcon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Getting started {stepIndex + 1}/{stepCount}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close getting started for this session"
              className="-m-2.5 rounded p-3.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {/* Only the step's words are live; the controls are not re-read. */}
          <h2 aria-live="polite" className="text-base font-semibold text-white">
            {step.title}
          </h2>
        </div>
      </div>

      <p aria-live="polite" className="text-sm leading-6 text-slate-200">
        {step.content}
      </p>

      <details className="mt-2 text-xs text-slate-300">
        <summary className="min-h-10 cursor-pointer rounded-lg py-3 font-medium text-cyan-300">
          Camera controls
        </summary>
        <p className="pb-2 leading-5">
          Drag to orbit; scroll or pinch to zoom. Use W A S D to move and Q or E to change height.
        </p>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: stepCount }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-[width,background-color] ${
                index === stepIndex ? 'w-6 bg-cyan-300' : 'w-2 bg-slate-600'
              }`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={stepIndex === 0}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-10 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-teal-600"
          >
            {isLastStep ? 'Start operating' : 'Next'}
            {isLastStep ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
