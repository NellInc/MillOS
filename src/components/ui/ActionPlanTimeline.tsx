/**
 * ActionPlanTimeline Component
 *
 * Visual timeline of the 3-step action plan with countdown timers.
 * Shows immediate, short-term, and preparatory actions from strategic decisions.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { formatFixed, useT } from '../../i18n';
import { actionPlanTimelineMessages } from './ActionPlanTimeline.messages';

interface ActionStep {
  label: string;
  duration: number; // minutes
  action: string;
}

// Labels are message keys, resolved at render so a language change takes effect.
interface StepPreset {
  labelKey: 'immediate' | 'shortTerm' | 'preparation';
  duration: number; // minutes
}

const DEFAULT_STEPS: StepPreset[] = [
  { labelKey: 'immediate', duration: 5 },
  { labelKey: 'shortTerm', duration: 15 },
  { labelKey: 'preparation', duration: 30 },
];

// Where the current plan stood when the timeline last rendered. The Strategic
// tab unmounts it on every tab switch; the same plan resumes from here rather
// than starting over at its first step. Keyed by the plan array itself, which
// setStrategicPriorities replaces with every new plan.
let savedPlace: {
  plan: readonly string[];
  activeStep: number;
  countdown: number;
  isRunning: boolean;
  /** runningMs() when it was saved: the plant time that passes while unmounted counts. */
  savedAt: number;
} | null = null;

// Wall time with the shift clock running and the tab visible, the clock the
// countdown keeps on screen. Kept here so the time the timeline spends
// unmounted (another AI tab, the panel closed) counts, minus any hold.
type ClockState = { gameSpeed: number; isTabVisible?: boolean };
const isHeld = (state: ClockState) => state.gameSpeed === 0 || state.isTabVisible === false;
let heldTotalMs = 0;
let heldSince: number | null = null;
let watchingClock = false;
function runningMs(): number {
  if (!watchingClock) {
    watchingClock = true;
    heldSince = isHeld(useGameSimulationStore.getState()) ? Date.now() : null;
    useGameSimulationStore.subscribe((state) => {
      if (isHeld(state)) heldSince ??= Date.now();
      else if (heldSince !== null) {
        heldTotalMs += Date.now() - heldSince;
        heldSince = null;
      }
    });
  }
  const now = Date.now();
  return now - heldTotalMs - (heldSince === null ? 0 : now - heldSince);
}

const stepMinutes = (index: number) => DEFAULT_STEPS[index]?.duration || 10;

/** The saved place moved on by the running time since it was saved. */
function resumePlace(place: NonNullable<typeof savedPlace>) {
  if (!place.isRunning) return place;
  let activeStep = place.activeStep;
  let countdown = place.countdown - Math.floor(Math.max(0, runningMs() - place.savedAt) / 1000);
  while (countdown <= 0 && activeStep < place.plan.length - 1) {
    activeStep += 1;
    countdown += stepMinutes(activeStep) * 60;
  }
  return countdown > 0
    ? { ...place, activeStep, countdown }
    : { ...place, activeStep, countdown: 0, isRunning: false };
}

export const ActionPlanTimeline: React.FC = () => {
  const t = useT(actionPlanTimelineMessages);
  const strategic = useAIConfigStore((state) => state.strategic);
  const [resumed] = useState(() =>
    savedPlace && savedPlace.plan === strategic.actionPlan ? resumePlace(savedPlace) : null
  );
  const [activeStep, setActiveStep] = useState(resumed?.activeStep ?? 0);
  const [countdown, setCountdown] = useState(resumed?.countdown ?? 5 * 60); // seconds
  const [isRunning, setIsRunning] = useState(resumed?.isRunning ?? false);
  // The plan is about the plant, so it holds while the shift clock is held (P,
  // Paused, tour, handoff), as aiEngine's cadence does. Otherwise it counts on
  // wall time: on game time a 5-minute step would pass in seconds at 1x. A
  // hidden browser tab stops the frames that run the plant, so it holds too.
  const clockHeld = useGameSimulationStore(
    (state) => state.gameSpeed === 0 || state.isTabVisible === false
  );

  // Parse action plan from strategic priorities
  const steps: ActionStep[] = strategic.actionPlan?.length
    ? strategic.actionPlan.map((action, i) => ({
        label: DEFAULT_STEPS[i]
          ? t(DEFAULT_STEPS[i].labelKey)
          : t('step', { number: formatFixed(i + 1, 0) }),
        duration: stepMinutes(i),
        action,
      }))
    : DEFAULT_STEPS.map((s) => ({
        label: t(s.labelKey),
        duration: s.duration,
        action: t('waiting'),
      }));

  // Countdown timer. The interval lives as long as the plan runs: keyed on the
  // steps array (new every render), it restarted on each re-render of the panel
  // around it, which the plant clock causes every half second, and never fired.
  const planRef = useRef({ activeStep, steps });
  planRef.current = { activeStep, steps };
  const hasTimeLeft = countdown > 0;
  useEffect(() => {
    if (!isRunning || clockHeld || !hasTimeLeft) return;

    const timer = setInterval(() => {
      const { activeStep: step, steps: current } = planRef.current;
      setCountdown((prev) => {
        if (prev <= 1) {
          // Move to next step
          if (step < current.length - 1) {
            setActiveStep(step + 1);
            return current[step + 1].duration * 60;
          }
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, clockHeld, hasTimeLeft]);

  // Reset when strategic plan changes (a remount on the same plan resumes)
  useEffect(() => {
    if (strategic.actionPlan?.length && savedPlace?.plan !== strategic.actionPlan) {
      setActiveStep(0);
      setCountdown(steps[0].duration * 60);
      setIsRunning(true);
    }
  }, [strategic.actionPlan]);

  useEffect(() => {
    savedPlace = strategic.actionPlan?.length
      ? { plan: strategic.actionPlan, activeStep, countdown, isRunning, savedAt: runningMs() }
      : null;
  }, [strategic.actionPlan, activeStep, countdown, isRunning]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Controls are only meaningful once a real action plan is present.
  const hasPlan = !!strategic.actionPlan?.length;
  // The last step's countdown has run out: the whole plan is done, and no step
  // is still the active one.
  const finished = hasPlan && !isRunning && countdown <= 0;

  const getStepStatus = (index: number): 'completed' | 'active' | 'pending' => {
    if (finished || index < activeStep) return 'completed';
    if (index === activeStep) return 'active';
    return 'pending';
  };

  // Restart the plan from the first step (also recovers from the finished state).
  const restart = () => {
    setActiveStep(0);
    setCountdown((steps[0]?.duration ?? DEFAULT_STEPS[0].duration) * 60);
    setIsRunning(true);
  };

  // Pause/resume. If the timer has already finished (countdown hit 0 and
  // isRunning was cleared), resuming would otherwise stall at 0:00 because the
  // countdown effect early-returns on countdown <= 0 — so route to restart.
  const togglePause = () => {
    if (countdown <= 0) {
      restart();
      return;
    }
    setIsRunning((prev) => !prev);
  };

  if (!strategic.actionPlan?.length && !strategic.isThinking) return null;

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-200">{t('title')}</span>
        </div>
        <div className="flex items-center gap-2">
          {(isRunning || (hasPlan && countdown > 0)) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 bg-cyan-500/20 px-2 py-1 rounded-full"
            >
              <div
                className={`w-1.5 h-1.5 bg-cyan-400 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
              />
              <span className="text-[10px] text-cyan-400 font-mono">{formatTime(countdown)}</span>
            </motion.div>
          )}
          {hasPlan && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={togglePause}
                aria-label={isRunning ? t('pausePlan') : t('resumePlan')}
                title={isRunning ? t('pause') : t('resume')}
                className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-colors"
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={restart}
                aria-label={t('restartPlan')}
                title={t('restart')}
                className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const status = getStepStatus(index);

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className="flex items-start gap-3"
            >
              {/* Timeline indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    status === 'completed'
                      ? 'bg-green-500'
                      : status === 'active'
                        ? 'bg-cyan-500 animate-pulse'
                        : 'bg-slate-700'
                  }`}
                >
                  {status === 'completed' ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : status === 'active' ? (
                    <Play className="w-3 h-3 text-white" />
                  ) : (
                    <Circle className="w-3 h-3 text-slate-500" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-0.5 h-8 mt-1 ${
                      status === 'completed' ? 'bg-green-500' : 'bg-slate-700'
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      status === 'active'
                        ? 'text-cyan-400'
                        : status === 'completed'
                          ? 'text-green-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {t('duration', { minutes: formatFixed(step.duration, 0) })}
                  </span>
                </div>
                <p
                  className={`text-[11px] mt-0.5 line-clamp-2 ${
                    status === 'active'
                      ? 'text-slate-200'
                      : status === 'completed'
                        ? 'text-slate-400'
                        : 'text-slate-500'
                  }`}
                >
                  {step.action}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
