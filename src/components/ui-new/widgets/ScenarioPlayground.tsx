/**
 * Scenario Playground - Bilateral Autonomy System Exploration
 *
 * Interactive component for exploring different workplace configurations
 * through guided scenarios. Users can learn about democratic management
 * principles by experiencing different organizational dynamics.
 *
 * Features:
 * - Scenario selection with descriptions and objectives
 * - Real-time playback with timeline visualization
 * - Speed controls (1x, 2x, 4x)
 * - Live metrics during playback
 * - Results summary with grades and learnings
 * - Phase-based scenarios with engagement metrics
 */

import React, { useEffect, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  FastForward,
  Building2,
  ArrowRightCircle,
  AlertTriangle,
  TrendingUp,
  Moon,
  Clock,
  Target,
  Activity,
  Zap,
  CheckCircle,
  XCircle,
  ChevronRight,
  RotateCcw,
  Award,
  BookOpen,
  Gauge,
  Gamepad2,
  Sparkles,
  Eye,
  Compass,
} from 'lucide-react';
import { useScenarioStore, getCategoryColor, formatTime } from '../../../stores/scenarioStore';
import type { Scenario, ScenarioEvent, ScenarioPhase } from '../../../stores/scenarioStore';
import { useBASStore } from '../../../stores/basStore';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';

// =============================================================================
// ICON MAPPING
// =============================================================================

const SCENARIO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  ArrowRightCircle,
  AlertTriangle,
  TrendingUp,
  Moon,
  Gamepad2,
};

// =============================================================================
// SCENARIO CARD COMPONENT
// =============================================================================

interface ScenarioCardProps {
  scenario: Scenario;
  isCompleted: boolean;
  onSelect: () => void;
}

const ScenarioCard: React.FC<ScenarioCardProps> = memo(({ scenario, isCompleted, onSelect }) => {
  const categoryColors = useMemo(() => getCategoryColor(scenario.category), [scenario.category]);
  const Icon = SCENARIO_ICONS[scenario.icon] || Target;

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left p-3 rounded-lg border transition-all ${categoryColors.border} ${categoryColors.bg} hover:brightness-110`}
    >
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded ${categoryColors.bg}`}>
          <Icon className={`w-4 h-4 ${categoryColors.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{scenario.name}</span>
            {isCompleted && <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />}
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-2">{scenario.description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`text-[8px] px-1.5 py-0.5 rounded ${categoryColors.bg} ${categoryColors.text}`}
            >
              {scenario.category}
            </span>
            {scenario.difficulty && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                {scenario.difficulty}
              </span>
            )}
            <span className="text-[8px] text-slate-500 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {scenario.durationDisplay || formatTime(scenario.duration)}
            </span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
      </div>
    </motion.button>
  );
});

ScenarioCard.displayName = 'ScenarioCard';

// =============================================================================
// PLAYBACK CONTROLS COMPONENT
// =============================================================================

interface PlaybackControlsProps {
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
}

const PlaybackControls: React.FC<PlaybackControlsProps> = memo(
  ({ isPlaying, speed, onPlay, onPause, onStop, onSpeedChange }) => (
    <div className="flex items-center gap-2">
      {/* Play/Pause */}
      <button
        onClick={() => {
          if (isPlaying) {
            onPause();
          } else {
            onPlay();
          }
          audioManager.playClick?.();
        }}
        className={`p-2 rounded-lg transition-all ${
          isPlaying
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
        }`}
        aria-label={isPlaying ? 'Pause scenario' : 'Play scenario'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      {/* Stop */}
      <button
        onClick={() => {
          onStop();
          audioManager.playClick?.();
        }}
        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
        aria-label="Stop scenario"
      >
        <Square className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Speed controls */}
      <div className="flex items-center gap-1 ml-2">
        <FastForward className="w-3 h-3 text-slate-500" />
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => {
              onSpeedChange(s);
              audioManager.playClick?.();
            }}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
              speed === s
                ? 'bg-cyan-500/30 text-cyan-300 ring-1 ring-cyan-500/50'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
);

PlaybackControls.displayName = 'PlaybackControls';

// =============================================================================
// PHASE INDICATOR COMPONENT
// =============================================================================

interface PhaseIndicatorProps {
  phases: ScenarioPhase[];
  currentPhase: number;
  currentTime: number;
}

const PhaseIndicator: React.FC<PhaseIndicatorProps> = memo(
  ({ phases, currentPhase, currentTime }) => {
    // Memoize phase progress calculation
    const phaseProgress = useMemo(() => {
      let elapsedInPhase = currentTime;
      for (let i = 0; i < currentPhase; i++) {
        elapsedInPhase -= phases[i].durationSeconds;
      }
      const currentPhaseDuration = phases[currentPhase]?.durationSeconds || 1;
      return Math.min(100, (elapsedInPhase / currentPhaseDuration) * 100);
    }, [currentTime, currentPhase, phases]);

    return (
      <div className="bg-slate-800/50 rounded-lg p-2 mb-3">
        {/* Phase steps */}
        <div className="flex items-center gap-1 mb-2">
          {phases.map((phase, index) => (
            <React.Fragment key={phase.id}>
              <div
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  index < currentPhase
                    ? 'bg-green-500'
                    : index === currentPhase
                      ? 'bg-cyan-500'
                      : 'bg-slate-600'
                }`}
              >
                {index === currentPhase && (
                  <motion.div
                    className="h-full bg-cyan-400 rounded-full"
                    animate={{ width: `${phaseProgress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                )}
              </div>
              {index < phases.length - 1 && <div className="w-1 h-1 rounded-full bg-slate-600" />}
            </React.Fragment>
          ))}
        </div>

        {/* Current phase info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-cyan-400">
              Phase {currentPhase + 1}/{phases.length}
            </span>
          </div>
          <span className="text-[10px] font-medium text-white">{phases[currentPhase]?.name}</span>
        </div>

        {/* Phase instruction */}
        {phases[currentPhase]?.instruction && (
          <div className="mt-2 p-2 bg-cyan-500/10 rounded border border-cyan-500/20">
            <div className="flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
              <p className="text-[9px] text-cyan-300">{phases[currentPhase].instruction}</p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

PhaseIndicator.displayName = 'PhaseIndicator';

// =============================================================================
// ENGAGEMENT METRICS COMPONENT
// =============================================================================

interface EngagementMetricsDisplayProps {
  stability: number;
  autonomy: number;
  transparency: number;
  isEngagementScenario: boolean;
}

const EngagementMetricsDisplay: React.FC<EngagementMetricsDisplayProps> = ({
  stability,
  autonomy,
  transparency,
  isEngagementScenario,
}) => {
  // Calculate engagement score (simplified heuristic)
  const engagementScore = Math.round(autonomy * 0.4 + transparency * 0.3 + stability * 0.3);

  const getEngagementColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getEngagementLabel = (score: number) => {
    if (score >= 70) return 'Strong';
    if (score >= 50) return 'Emerging';
    return 'Weak';
  };

  if (!isEngagementScenario) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Gauge className="w-3 h-3 text-green-400" />
            <span className="text-[9px] text-slate-400">Stability</span>
          </div>
          <div
            className={`text-lg font-mono font-bold ${
              stability >= 70
                ? 'text-green-400'
                : stability >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {stability.toFixed(0)}%
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] text-slate-400">Autonomy</span>
          </div>
          <div className="text-lg font-mono font-bold text-cyan-400">{autonomy}%</div>
        </div>
      </div>
    );
  }

  // Engagement scenario: show engagement-specific metrics
  return (
    <div className="space-y-2">
      {/* Engagement Signature */}
      <div className="bg-slate-800/50 rounded p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <Gamepad2 className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] text-slate-400">Engagement Signature</span>
          </div>
          <span className={`text-[10px] font-medium ${getEngagementColor(engagementScore)}`}>
            {getEngagementLabel(engagementScore)}
          </span>
        </div>
        <div className="relative h-3 bg-slate-700/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              engagementScore >= 70
                ? 'bg-gradient-to-r from-green-500 to-cyan-500'
                : engagementScore >= 50
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
                  : 'bg-gradient-to-r from-red-500 to-orange-500'
            }`}
            animate={{ width: `${engagementScore}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-slate-500">
          <span>Forcing</span>
          <span>Flow</span>
        </div>
      </div>

      {/* Key levers */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-slate-800/50 rounded p-1.5 text-center">
          <Compass className="w-3 h-3 mx-auto mb-0.5 text-cyan-400" />
          <div className="text-[8px] text-slate-400">Autonomy</div>
          <div className="text-[11px] font-mono font-bold text-cyan-400">{autonomy}%</div>
        </div>
        <div className="bg-slate-800/50 rounded p-1.5 text-center">
          <Eye className="w-3 h-3 mx-auto mb-0.5 text-amber-400" />
          <div className="text-[8px] text-slate-400">Transparency</div>
          <div className="text-[11px] font-mono font-bold text-amber-400">{transparency}%</div>
        </div>
        <div className="bg-slate-800/50 rounded p-1.5 text-center">
          <Gauge className="w-3 h-3 mx-auto mb-0.5 text-green-400" />
          <div className="text-[8px] text-slate-400">Stability</div>
          <div
            className={`text-[11px] font-mono font-bold ${
              stability >= 70
                ? 'text-green-400'
                : stability >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
            }`}
          >
            {stability.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Engagement insight */}
      <div className="bg-slate-800/30 rounded p-1.5">
        <p className="text-[8px] text-slate-400 text-center">
          {engagementScore >= 70
            ? 'Work feels like a game that produces something real'
            : engagementScore >= 50
              ? 'Engagement emerging - consider increasing autonomy or transparency'
              : 'Work feels forced - BAMS configuration needs adjustment'}
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// TIMELINE COMPONENT
// =============================================================================

interface TimelineProps {
  scenario: Scenario;
  currentTime: number;
  triggeredEvents: string[];
}

const Timeline: React.FC<TimelineProps> = ({ scenario, currentTime, triggeredEvents }) => {
  const progress = (currentTime / scenario.duration) * 100;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden">
        {/* Event markers */}
        {scenario.events.map((event, index) => {
          const position = (event.time / scenario.duration) * 100;
          const isTriggered = triggeredEvents.includes(`${scenario.id}-${index}`);
          const eventColor =
            event.type === 'friction_spike'
              ? 'bg-orange-500'
              : event.type === 'delay_increase'
                ? 'bg-blue-500'
                : event.type === 'resource_drop'
                  ? 'bg-red-500'
                  : event.type === 'mood_shift'
                    ? 'bg-pink-500'
                    : event.type === 'engagement_change'
                      ? 'bg-cyan-500'
                      : 'bg-yellow-500';

          return (
            <div
              key={index}
              role="img"
              aria-label={event.description}
              className={`absolute top-0 bottom-0 w-1 ${eventColor} ${
                isTriggered ? 'opacity-100' : 'opacity-40'
              }`}
              style={{ left: `${position}%` }}
              title={event.description}
            />
          );
        })}

        {/* Progress fill */}
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />

        {/* Current position indicator */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-cyan-500 shadow-lg"
          animate={{ left: `calc(${progress}% - 6px)` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Time display */}
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(scenario.duration)}</span>
      </div>
    </div>
  );
};

// =============================================================================
// EVENT LOG COMPONENT
// =============================================================================

interface EventLogProps {
  events: ScenarioEvent[];
  triggeredEvents: string[];
  scenarioId: string;
}

const EventLog: React.FC<EventLogProps> = ({ events, triggeredEvents, scenarioId }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [triggeredEvents.length]);

  const recentEvents = events
    .map((event, index) => ({
      ...event,
      index,
      isTriggered: triggeredEvents.includes(`${scenarioId}-${index}`),
    }))
    .filter((e) => e.isTriggered)
    .slice(-4);

  if (recentEvents.length === 0) {
    return (
      <div className="text-[9px] text-slate-500 italic text-center py-2">
        No events triggered yet...
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-1 max-h-24 overflow-y-auto">
      {recentEvents.map((event) => {
        const eventColor =
          event.type === 'friction_spike'
            ? 'text-orange-400 bg-orange-500/10'
            : event.type === 'delay_increase'
              ? 'text-blue-400 bg-blue-500/10'
              : event.type === 'resource_drop'
                ? 'text-red-400 bg-red-500/10'
                : event.type === 'mood_shift'
                  ? 'text-pink-400 bg-pink-500/10'
                  : event.type === 'engagement_change'
                    ? 'text-cyan-400 bg-cyan-500/10'
                    : 'text-yellow-400 bg-yellow-500/10';

        return (
          <motion.div
            key={event.index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`text-[9px] p-1.5 rounded ${eventColor}`}
          >
            <div className="flex items-center gap-1">
              <span className="font-mono text-[8px] opacity-60">{formatTime(event.time)}</span>
              <span>{event.description}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// =============================================================================
// RESULTS DISPLAY COMPONENT
// =============================================================================

interface ResultsDisplayProps {
  results: NonNullable<ReturnType<typeof useScenarioStore.getState>['results']>;
  onRestart: () => void;
  onExit: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results, onRestart, onExit }) => {
  const gradeColors = {
    A: 'text-green-400 bg-green-500/20',
    B: 'text-cyan-400 bg-cyan-500/20',
    C: 'text-amber-400 bg-amber-500/20',
    D: 'text-orange-400 bg-orange-500/20',
    F: 'text-red-400 bg-red-500/20',
  };

  const hasEngagementMetrics = !!results.engagementMetrics;

  return (
    <div className="space-y-3">
      {/* Grade */}
      <div className="text-center">
        <div
          className={`inline-block text-4xl font-bold px-6 py-3 rounded-lg ${gradeColors[results.grade]}`}
        >
          {results.grade}
        </div>
        <p className="text-sm text-white mt-2">{results.summary}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <Gauge className="w-4 h-4 mx-auto mb-1 text-green-400" />
          <div className="text-[10px] text-slate-400">Avg Stability</div>
          <div className="text-sm font-bold text-white">{results.averageStability.toFixed(0)}%</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <Activity className="w-4 h-4 mx-auto mb-1 text-amber-400" />
          <div className="text-[10px] text-slate-400">Lowest Point</div>
          <div className="text-sm font-bold text-white">{results.lowestStability.toFixed(0)}%</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <Zap className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
          <div className="text-[10px] text-slate-400">Adjustments</div>
          <div className="text-sm font-bold text-white">{results.axisChanges}</div>
        </div>
      </div>

      {/* Engagement-specific results */}
      {hasEngagementMetrics && results.engagementMetrics && (
        <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
          <div className="flex items-center gap-1 mb-2">
            <Gamepad2 className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] font-medium text-cyan-400">
              Engagement Signature Results
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[9px] text-slate-400">Avg Engagement</div>
              <div className="text-sm font-bold text-cyan-400">
                {results.engagementMetrics.averageEngagement.toFixed(0)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-slate-400">Improvement</div>
              <div
                className={`text-sm font-bold ${
                  results.engagementMetrics.engagementImprovement > 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {results.engagementMetrics.engagementImprovement > 0 ? '+' : ''}
                {results.engagementMetrics.engagementImprovement.toFixed(0)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-slate-400">Friction Cut</div>
              <div className="text-sm font-bold text-green-400">
                -{results.engagementMetrics.frictionReduction.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Learnings */}
      {results.learningsUnlocked.length > 0 && (
        <div className="bg-slate-800/30 rounded p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <BookOpen className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-medium text-white">Learnings Unlocked</span>
          </div>
          <div className="space-y-1">
            {results.learningsUnlocked.map((learning, i) => (
              <div key={i} className="text-[9px] text-slate-300 flex items-start gap-1">
                <CheckCircle className="w-2.5 h-2.5 text-green-400 mt-0.5 flex-shrink-0" />
                {learning}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all text-sm"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
        <button
          onClick={onExit}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-all text-sm"
        >
          <XCircle className="w-3 h-3" />
          Exit
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ScenarioPlayground: React.FC = () => {
  const {
    availableScenarios,
    activeScenario,
    isPlaying,
    currentTime,
    speed,
    currentPhase,
    results,
    completedScenarios,
    triggeredEvents,
    startScenario,
    pauseScenario,
    resumeScenario,
    stopScenario,
    setSpeed,
    tick,
    recordStability,
    recordEngagement,
    recordAxisChange,
    markEventTriggered,
    calculateResults,
    getPendingEvents,
  } = useScenarioStore(
    // Subscribe to the used slice only — the bare useScenarioStore() form
    // re-rendered this 1000+ line widget on EVERY store mutation.
    useShallow((state) => ({
      availableScenarios: state.availableScenarios,
      activeScenario: state.activeScenario,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      speed: state.speed,
      currentPhase: state.currentPhase,
      results: state.results,
      completedScenarios: state.completedScenarios,
      triggeredEvents: state.triggeredEvents,
      startScenario: state.startScenario,
      pauseScenario: state.pauseScenario,
      resumeScenario: state.resumeScenario,
      stopScenario: state.stopScenario,
      setSpeed: state.setSpeed,
      tick: state.tick,
      recordStability: state.recordStability,
      recordEngagement: state.recordEngagement,
      recordAxisChange: state.recordAxisChange,
      markEventTriggered: state.markEventTriggered,
      calculateResults: state.calculateResults,
      getPendingEvents: state.getPendingEvents,
    }))
  );

  // BAS Store for applying scenario axes
  const { axes, setAxis } = useBASStore(
    useShallow((state) => ({
      axes: state.axes,
      setAxis: state.setAxis,
    }))
  );

  // Stability Store for metrics
  const { getStabilityPercentage, updateFriction, updateDelay, updateResourceRates } =
    useStabilityStore(
      useShallow((state) => ({
        getStabilityPercentage: state.getStabilityPercentage,
        updateFriction: state.updateFriction,
        updateDelay: state.updateDelay,
        updateResourceRates: state.updateResourceRates,
      }))
    );

  const lastTickRef = useRef<number>(Date.now());
  const lastAxisRef = useRef<string>(JSON.stringify(axes));

  // Tick loop
  useEffect(() => {
    if (!isPlaying || !activeScenario) return;

    // Reset the tick reference when (re)starting: lastTickRef is initialized
    // at MOUNT, so without this the first tick's delta included the whole
    // mount-to-start browsing time (and pause durations on resume), making the
    // scenario timeline jump forward - short scenarios could complete on their
    // very first tick.
    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      tick(delta);
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, activeScenario, tick]);

  // Apply scenario initial axes when starting
  useEffect(() => {
    if (activeScenario && currentTime === 0) {
      // Apply initial axes
      Object.entries(activeScenario.initialAxes).forEach(([key, value]) => {
        setAxis(key as keyof typeof axes, value);
      });
    }
  }, [activeScenario?.id, currentTime, setAxis]);

  // Track axis changes
  useEffect(() => {
    const currentAxesStr = JSON.stringify(axes);
    if (activeScenario && currentAxesStr !== lastAxisRef.current) {
      recordAxisChange();
      lastAxisRef.current = currentAxesStr;
    }
  }, [axes, activeScenario, recordAxisChange]);

  // Record stability and process events
  useEffect(() => {
    if (!activeScenario || !isPlaying) return;

    const stability = getStabilityPercentage();
    recordStability(stability);

    // Record engagement for engagement scenarios
    if (activeScenario.category === 'engagement') {
      // Calculate engagement as a function of autonomy + transparency + stability
      const engagement = Math.round(
        axes.autonomyLevel * 0.4 + axes.informationAccess * 0.3 + stability * 0.3
      );
      recordEngagement(engagement);
    }

    // Process pending events
    const pendingEvents = getPendingEvents();
    pendingEvents.forEach((event) => {
      const eventIndex = activeScenario.events.indexOf(event);
      if (eventIndex >= 0) {
        markEventTriggered(eventIndex);

        // Apply event effects
        switch (event.type) {
          case 'friction_spike':
            updateFriction('scenario-event', event.magnitude * 0.5);
            break;
          case 'delay_increase':
            updateDelay('scenario-event', event.magnitude * 0.4);
            break;
          case 'resource_drop':
            updateResourceRates({
              materialRate: Math.max(30, 70 - event.magnitude * 30),
            });
            break;
          case 'mood_shift':
            // Mood shift affects friction indirectly
            if (event.magnitude < 0) {
              updateFriction('mood-friction', Math.abs(event.magnitude) * 0.2);
            } else {
              updateFriction('mood-friction', -event.magnitude * 0.1);
            }
            break;
          case 'demand_surge':
            updateDelay('demand-pressure', event.magnitude * 0.3);
            break;
          case 'engagement_change':
            // Engagement changes affect friction based on whether positive or negative
            if (event.magnitude > 0) {
              // Positive engagement reduces friction
              updateFriction('engagement-friction', -event.magnitude * 0.3);
            } else {
              // Negative engagement increases friction
              updateFriction('engagement-friction', Math.abs(event.magnitude) * 0.3);
            }
            break;
        }
      }
    });
  }, [
    currentTime,
    activeScenario,
    isPlaying,
    axes,
    getStabilityPercentage,
    recordStability,
    recordEngagement,
    getPendingEvents,
    markEventTriggered,
    updateFriction,
    updateDelay,
    updateResourceRates,
  ]);

  // Scenario completion - deliberately NOT gated on isPlaying: the store's
  // tick() clamps currentTime to duration AND flips isPlaying to false in one
  // atomic set() (scenarioStore.ts ~1511), so there is never a render where
  // currentTime >= duration while isPlaying is still true. Keeping the
  // completion check inside the isPlaying-gated effect above made
  // calculateResults unreachable - the results/grade screen never appeared.
  useEffect(() => {
    if (activeScenario && !results && currentTime >= activeScenario.duration) {
      calculateResults(axes, getStabilityPercentage());
    }
  }, [activeScenario, results, currentTime, axes, calculateResults, getStabilityPercentage]);

  const handleStartScenario = (id: string) => {
    startScenario(id);
    audioManager.playClick?.();
  };

  const handleRestart = () => {
    if (activeScenario) {
      stopScenario();
      setTimeout(() => {
        startScenario(activeScenario.id);
      }, 100);
    }
    audioManager.playClick?.();
  };

  const handleExit = () => {
    stopScenario();
    audioManager.playClick?.();
  };

  const stability = getStabilityPercentage();
  const isEngagementScenario = activeScenario?.category === 'engagement';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold text-white">Scenario Playground</span>
          {activeScenario && (
            <span className="ml-auto text-[10px] text-slate-400">{activeScenario.name}</span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Explore workplace configurations through guided scenarios
        </p>
      </div>

      {/* Content */}
      <div className="p-3">
        <AnimatePresence mode="wait">
          {/* Scenario Selection */}
          {!activeScenario && (
            <motion.div
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {availableScenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  isCompleted={completedScenarios.includes(scenario.id)}
                  onSelect={() => handleStartScenario(scenario.id)}
                />
              ))}
            </motion.div>
          )}

          {/* Active Scenario - Playing or Paused */}
          {activeScenario && !results && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Phase Indicator (for phase-based scenarios) */}
              {activeScenario.phases && activeScenario.phases.length > 0 && (
                <PhaseIndicator
                  phases={activeScenario.phases}
                  currentPhase={currentPhase}
                  currentTime={currentTime}
                />
              )}

              {/* Learning Objectives (for non-phase scenarios) */}
              {!activeScenario.phases && (
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Award className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] font-medium text-white">Learning Objectives</span>
                  </div>
                  <div className="space-y-0.5">
                    {activeScenario.learningObjectives.map((obj, i) => (
                      <div key={i} className="text-[9px] text-slate-400 flex items-start gap-1">
                        <span className="text-amber-400">*</span>
                        {obj}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <Timeline
                scenario={activeScenario}
                currentTime={currentTime}
                triggeredEvents={triggeredEvents}
              />

              {/* Live Metrics */}
              <EngagementMetricsDisplay
                stability={stability}
                autonomy={axes.autonomyLevel}
                transparency={axes.informationAccess}
                isEngagementScenario={isEngagementScenario}
              />

              {/* Event Log */}
              <div className="bg-slate-800/30 rounded p-2">
                <div className="flex items-center gap-1 mb-1.5">
                  <Zap className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] font-medium text-white">Event Log</span>
                </div>
                <EventLog
                  events={activeScenario.events}
                  triggeredEvents={triggeredEvents}
                  scenarioId={activeScenario.id}
                />
              </div>

              {/* Playback Controls */}
              <div className="flex justify-center">
                <PlaybackControls
                  isPlaying={isPlaying}
                  speed={speed}
                  onPlay={resumeScenario}
                  onPause={pauseScenario}
                  onStop={stopScenario}
                  onSpeedChange={setSpeed}
                />
              </div>

              {/* Hint */}
              <p className="text-[8px] text-slate-500 text-center">
                {isEngagementScenario
                  ? 'Adjust Autonomy or Information Access to strengthen the engagement signature'
                  : 'Adjust the Five Axes in the BAMS panel to respond to events'}
              </p>
            </motion.div>
          )}

          {/* Results */}
          {activeScenario && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ResultsDisplay results={results} onRestart={handleRestart} onExit={handleExit} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ScenarioPlayground;
