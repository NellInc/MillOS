import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { isKeyboardlessTouch } from '../../../utils/keyboardlessTouch';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Factory,
  Gauge,
  MousePointer2,
  X,
} from 'lucide-react';
import { useT } from '../../../i18n';
import { LanguageSwitcher } from '../../../i18n/LanguageSwitcher';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { onboardingGuideMessages } from './OnboardingGuide.messages';

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
  /** 'escape' when Escape closed the tour; the X passes no reason. */
  readonly onClose: (reason?: 'escape') => void;
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
  const t = useT(onboardingGuideMessages);
  const isLastStep = stepIndex === stepCount - 1;
  // Touch controls are shown exactly when isMobile is (MobileControlsOverlay).
  const { isMobile, isTouchDevice } = useMobileDetection();
  // A large touch screen with no hovering pointer (an iPad without a trackpad)
  // gets the desktop layout but has neither keys nor the D-pad.
  const keyboardlessTouch = isKeyboardlessTouch(isTouchDevice);
  const backRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Back is disabled on the first step; reaching it with Back would leave
  // keyboard focus on that dead control (or, in Firefox, on <body>). The press
  // is recorded rather than read back from activeElement, which Firefox clears
  // as the button disables. Working if Enter then goes on to Next.
  const backPressed = useRef(false);
  useEffect(() => {
    const pressed = backPressed.current;
    backPressed.current = false;
    if (stepIndex !== 0 || !pressed) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === backRef.current) nextRef.current?.focus();
  }, [stepIndex]);

  // Escape closes the tour for this session, unless a dialog (modal or the HUD
  // notifications popover), an open menu or the context sidebar owns the key.
  // The document's bubble phase, after the focused control's own handler (the
  // open playlist collapses on Escape and stops it), and before the window
  // shortcuts, so nothing else also closes on the same press. Working if
  // Escape with #context-sidebar open closes the sidebar and keeps the tour,
  // and Escape in the open playlist collapses it and keeps the tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // First-person owns Escape (it leaves the walk overlay), and the tour
      // is hidden behind that overlay.
      if (useUIStore.getState().fpsMode) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], #context-sidebar, #forklift-inspector, [data-escape-layer]'
        )
      )
        return;
      event.preventDefault();
      // Immediate: another document listener (the sidebar's) must not act too.
      event.stopImmediatePropagation();
      onClose('escape');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The card scrolls under its own pinned footer, so the camera help opens
  // below the fold. At the end of the scroll box the footer sits in flow
  // directly after it. Working if the opened help reads in full above the
  // step dots without scrolling inside the card.
  const cardRef = useRef<HTMLElement>(null);
  // Text that runs on under the pinned footer gives no sign it is there: step
  // 3 read as ending at "Press ? for controls". A cue sits on the footer's top
  // edge while any of the card is still below it. Working if the cue shows at
  // 1280x657 on step 3 and goes once the card is scrolled to its end.
  const [moreBelow, setMoreBelow] = useState(false);
  const measureOverflow = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    setMoreBelow(card.scrollHeight - card.scrollTop - card.clientHeight > 1);
  }, []);
  const revealCameraHelp = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const card = cardRef.current;
    if (event.currentTarget.open && card) card.scrollTop = card.scrollHeight;
    measureOverflow();
  };
  // The card is the same scroll box on every step, so each step starts at its
  // top. Working if Next after opening the help shows the new step's heading.
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
    measureOverflow();
  }, [stepIndex, step.content, measureOverflow]);
  useEffect(() => {
    window.addEventListener('resize', measureOverflow);
    const card = cardRef.current;
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureOverflow);
    // The card stops growing at its max-height, so its rows are watched too:
    // a late web font or a wrapped title changes them, not the card.
    if (card) for (const box of [card, ...Array.from(card.children)]) observer?.observe(box);
    return () => {
      window.removeEventListener('resize', measureOverflow);
      observer?.disconnect();
    };
  }, [measureOverflow]);

  return (
    <section
      ref={cardRef}
      onScroll={measureOverflow}
      aria-label={t('regionLabel', { step: stepIndex + 1, count: stepCount })}
      className="pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-20rem)] [@media(min-width:640px)_and_(min-height:501px)]:max-h-[calc(100dvh-16rem)] overflow-y-auto overscroll-contain millos-glass millos-glass-thick millos-glass-scroll rounded-xl border-cyan-400/40 p-4 sm:left-5 sm:right-auto sm:w-[360px] [@media(min-width:640px)_and_(max-height:500px)]:left-auto [@media(min-width:640px)_and_(max-height:500px)]:right-5 [@media(min-width:640px)_and_(max-height:500px)]:bottom-28 [@media(min-width:640px)_and_(max-height:500px)]:max-h-[calc(100dvh-11rem)] [@media(min-width:800px)_and_(max-height:500px)]:w-[min(30rem,calc(100vw-22rem))]"
    >
      {/* First thing a visitor reads, so the language choice sits above the fold. */}
      {/* On a short landscape screen wide enough for the wider card (800 px and
          up) it shares the header line, so the step's text has room above the
          pinned controls; narrower, the step label needs the line to itself. */}
      <div className="mb-2 flex justify-end [@media(min-width:800px)_and_(max-height:500px)]:absolute [@media(min-width:800px)_and_(max-height:500px)]:right-12 [@media(min-width:800px)_and_(max-height:500px)]:top-3 [@media(min-width:800px)_and_(max-height:500px)]:mb-0">
        <LanguageSwitcher compact />
      </div>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
          <StepIcon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              {t('eyebrow', { step: stepIndex + 1, count: stepCount })}
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              aria-label={t('close')}
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

      <details className="mt-2 text-xs text-slate-300" onToggle={revealCameraHelp}>
        <summary className="min-h-10 cursor-pointer rounded-lg py-3 font-medium text-cyan-300">
          {t('cameraControls')}
        </summary>
        <p className="pb-2 leading-5">
          {isMobile
            ? t('cameraHelpTouch')
            : keyboardlessTouch
              ? t('cameraHelpTablet')
              : t('cameraHelp')}
        </p>
      </details>

      {/* Pinned to the card's own scroll box so a 720p projector never hides
          Start operating. Working if the row stays visible on step 3 at 1280x657.
          -bottom-4 meets the box's p-4: at bottom-0 it stuck 16 px above the
          edge, and the step's text showed through beneath it. */}
      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-4 py-3">
        {moreBelow && (
          <div
            data-testid="onboarding-more-below"
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-full flex h-8 items-end justify-center bg-gradient-to-t from-slate-950 to-transparent"
          >
            <ChevronDown className="h-4 w-4 text-cyan-300" />
          </div>
        )}
        {/* The step label already counts the steps; on a short screen the
            dots would cost the footer a row the step's text needs. */}
        <div
          className="flex gap-1.5 [@media(min-width:640px)_and_(max-height:500px)]:hidden"
          aria-hidden="true"
        >
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
            ref={backRef}
            type="button"
            onClick={() => {
              backPressed.current = true;
              onBack();
            }}
            disabled={stepIndex === 0}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {/* A short, narrow screen keeps the footer on one row: the word is
                read, not shown, so the step's title has room above it. */}
            <span className="[@media(min-width:640px)_and_(max-width:799px)_and_(max-height:500px)]:sr-only">
              {t('back')}
            </span>
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-10 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {t('skip')}
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-teal-600"
          >
            {isLastStep ? t('start') : t('next')}
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
