/**
 * ActionPlanTimeline Component
 *
 * Visual timeline of the 3-step action plan with countdown timers.
 * Shows immediate, short-term, and preparatory actions from strategic decisions.
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';

interface ActionStep {
  label: string;
  duration: number; // minutes
  action: string;
}

const DEFAULT_STEPS: ActionStep[] = [
  { label: 'Immediate', duration: 5, action: '' },
  { label: 'Short-term', duration: 15, action: '' },
  { label: 'Preparation', duration: 30, action: '' },
];

export const ActionPlanTimeline: React.FC = () => {
  const strategic = useAIConfigStore((state) => state.strategic);
  const [activeStep, setActiveStep] = useState(0);
  const [countdown, setCountdown] = useState(5 * 60); // 5 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);

  // Parse action plan from strategic priorities
  const steps: ActionStep[] = strategic.actionPlan?.length
    ? strategic.actionPlan.map((action, i) => ({
        label: DEFAULT_STEPS[i]?.label || `Step ${i + 1}`,
        duration: DEFAULT_STEPS[i]?.duration || 10,
        action,
      }))
    : DEFAULT_STEPS.map((s) => ({ ...s, action: 'Waiting for strategic decision...' }));

  // Countdown timer
  useEffect(() => {
    if (!isRunning || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Move to next step
          if (activeStep < steps.length - 1) {
            setActiveStep(activeStep + 1);
            return steps[activeStep + 1].duration * 60;
          }
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, countdown, activeStep, steps]);

  // Reset when strategic plan changes
  useEffect(() => {
    if (strategic.actionPlan?.length) {
      setActiveStep(0);
      setCountdown(steps[0].duration * 60);
      setIsRunning(true);
    }
  }, [strategic.actionPlan]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStepStatus = (index: number): 'completed' | 'active' | 'pending' => {
    if (index < activeStep) return 'completed';
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

  // Controls are only meaningful once a real action plan is present.
  const hasPlan = !!strategic.actionPlan?.length;

  if (!strategic.actionPlan?.length && !strategic.isThinking) return null;

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-200">Action Plan</span>
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
                aria-label={isRunning ? 'Pause action plan' : 'Resume action plan'}
                title={isRunning ? 'Pause' : 'Resume'}
                className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-colors"
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={restart}
                aria-label="Restart action plan"
                title="Restart"
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
                  <span className="text-[10px] text-slate-600">({step.duration} min)</span>
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
