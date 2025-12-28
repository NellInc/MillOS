/**
 * Engagement Signature Panel
 *
 * Displays engagement metrics using the "gaming parallel" concept:
 * Work should feel like a good game that produces something real.
 *
 * Key insight: When work is engaging (like a good game), workers naturally
 * reduce system friction because they're intrinsically motivated rather
 * than requiring external controls and oversight.
 *
 * Six dimensions of engagement:
 * - Flow: Optimal challenge-skill balance
 * - Goals: Clear, meaningful objectives
 * - Feedback: Immediate, actionable responses
 * - Challenge: Difficulty that stretches without overwhelming
 * - Mastery: Visible skill development
 * - Entry Friction: Ease of getting started
 */

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2,
  TrendingUp,
  Activity,
  ChevronDown,
  ChevronUp,
  Info,
  Waves,
  Target,
  RefreshCw,
  Mountain,
  DoorOpen,
  CheckCircle,
  AlertTriangle,
  Flame,
  XCircle,
  ArrowDown,
  ArrowUp,
  Minus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  useEngagementStore,
  ENGAGEMENT_DIMENSIONS,
  getStatusColor,
  getStatusBgColor,
  getStatusLabel,
  type EngagementDimensionKey,
  type DiagnosticStatus,
} from '../../../stores/engagementStore';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// ICON MAPPING
// =============================================================================

const DIMENSION_ICONS: Record<EngagementDimensionKey, LucideIcon> = {
  flow: Waves,
  goals: Target,
  feedback: RefreshCw,
  challenge: Mountain,
  mastery: TrendingUp,
  entryFriction: DoorOpen,
};

const DIMENSION_COLORS: Record<EngagementDimensionKey, string> = {
  flow: 'text-cyan-400',
  goals: 'text-violet-400',
  feedback: 'text-amber-400',
  challenge: 'text-orange-400',
  mastery: 'text-green-400',
  entryFriction: 'text-pink-400',
};

const DIMENSION_BG_COLORS: Record<EngagementDimensionKey, string> = {
  flow: 'bg-cyan-500',
  goals: 'bg-violet-500',
  feedback: 'bg-amber-500',
  challenge: 'bg-orange-500',
  mastery: 'bg-green-500',
  entryFriction: 'bg-pink-500',
};

const STATUS_ICONS: Record<DiagnosticStatus, LucideIcon> = {
  healthy: CheckCircle,
  forcing: AlertTriangle,
  burnoutRisk: Flame,
  disengaged: XCircle,
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface DimensionBarProps {
  dimension: EngagementDimensionKey;
  score: number;
}

const DimensionBar: React.FC<DimensionBarProps> = memo(({ dimension, score }) => {
  const Icon = DIMENSION_ICONS[dimension];
  const colorClass = DIMENSION_COLORS[dimension];
  const bgColorClass = DIMENSION_BG_COLORS[dimension];

  // Memoize descriptor lookup
  const descriptor = useMemo(
    () => ENGAGEMENT_DIMENSIONS.find((d) => d.key === dimension),
    [dimension]
  );

  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`w-3 h-3 ${colorClass}`} />
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${bgColorClass}`}
        />
      </div>
      <span className="text-[9px] font-mono text-slate-400 w-8 text-right">
        {score.toFixed(0)}%
      </span>
      <span className="text-[8px] text-slate-500 w-12 truncate">
        {descriptor?.label.split(' ')[0]}
      </span>
    </div>
  );
});

DimensionBar.displayName = 'DimensionBar';

interface StatusBadgeProps {
  status: DiagnosticStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = memo(({ status }) => {
  const Icon = STATUS_ICONS[status];
  const colorClass = getStatusColor(status);
  const bgColorClass = getStatusBgColor(status);
  const label = getStatusLabel(status);

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${bgColorClass}`}>
      <Icon className={`w-3 h-3 ${colorClass}`} />
      <span className={`text-[10px] font-medium ${colorClass}`}>{label}</span>
    </div>
  );
});

StatusBadge.displayName = 'StatusBadge';

interface FrictionEffectIndicatorProps {
  multiplier: number;
  direction: 'reducing' | 'neutral' | 'increasing';
}

const FrictionEffectIndicator: React.FC<FrictionEffectIndicatorProps> = memo(
  ({ multiplier, direction }) => {
    // Memoize icon and color
    const { Icon, colorClass, percentage } = useMemo(() => {
      const icon =
        direction === 'reducing' ? ArrowDown : direction === 'increasing' ? ArrowUp : Minus;
      const color =
        direction === 'reducing'
          ? 'text-green-400'
          : direction === 'increasing'
            ? 'text-red-400'
            : 'text-slate-400';
      const pct =
        direction === 'reducing'
          ? `-${((1 - multiplier) * 100).toFixed(0)}%`
          : direction === 'increasing'
            ? `+${((multiplier - 1) * 100).toFixed(0)}%`
            : '0%';
      return { Icon: icon, colorClass: color, percentage: pct };
    }, [direction, multiplier]);

    return (
      <div className={`flex items-center gap-1 ${colorClass}`}>
        <Icon className="w-3 h-3" />
        <span className="text-[10px] font-mono">{percentage}</span>
      </div>
    );
  }
);

FrictionEffectIndicator.displayName = 'FrictionEffectIndicator';

// Static dimension keys to prevent recreation
const DIMENSION_KEYS: EngagementDimensionKey[] = [
  'flow',
  'goals',
  'feedback',
  'challenge',
  'mastery',
  'entryFriction',
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const EngagementSignaturePanel: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showEducational, setShowEducational] = useState(false);

  const {
    overallScore,
    dimensionScores,
    diagnosticStatus,
    isGenerative,
    frictionMultiplier,
    engagedCount,
    disengagedCount,
    burnoutRiskCount,
    getEngagementEffect,
  } = useEngagementStore(
    useShallow((state) => ({
      overallScore: state.overallScore,
      dimensionScores: state.dimensionScores,
      diagnosticStatus: state.diagnosticStatus,
      isGenerative: state.isGenerative,
      frictionMultiplier: state.frictionMultiplier,
      engagedCount: state.engagedCount,
      disengagedCount: state.disengagedCount,
      burnoutRiskCount: state.burnoutRiskCount,
      getEngagementEffect: state.getEngagementEffect,
    }))
  );

  // Memoize expensive calculations
  const engagementEffect = useMemo(
    () => getEngagementEffect(),
    [getEngagementEffect, frictionMultiplier]
  );

  const totalWorkers = useMemo(
    () => engagedCount + disengagedCount + burnoutRiskCount,
    [engagedCount, disengagedCount, burnoutRiskCount]
  );

  // Memoize score colors
  const { scoreColor, scoreBg } = useMemo(() => {
    const color =
      overallScore >= 70
        ? 'text-green-400'
        : overallScore >= 50
          ? 'text-amber-400'
          : 'text-red-400';
    const bg =
      overallScore >= 70
        ? 'bg-green-500/20'
        : overallScore >= 50
          ? 'bg-amber-500/20'
          : 'bg-red-500/20';
    return { scoreColor: color, scoreBg: bg };
  }, [overallScore]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white">Engagement Signature</span>
          <div className="ml-auto">
            <StatusBadge status={diagnosticStatus} />
          </div>
        </div>
        <p className="text-[9px] text-slate-400 mt-1">
          Work that feels like a game, produces something real
        </p>
      </div>

      {/* Overall Score and Generative Indicator */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-3">
          {/* Score Circle */}
          <div
            className={`relative w-14 h-14 rounded-full ${scoreBg} flex items-center justify-center`}
          >
            <div className="absolute inset-1 rounded-full border-2 border-current opacity-30" />
            <span className={`text-lg font-bold ${scoreColor}`}>{overallScore.toFixed(0)}</span>
          </div>

          {/* Generative Indicator and Friction Effect */}
          <div className="flex-1 space-y-2">
            {/* Generative Status */}
            <div className="flex items-center gap-2">
              <Sparkles
                className={`w-3 h-3 ${isGenerative ? 'text-amber-400' : 'text-slate-500'}`}
              />
              <span className="text-[10px] text-slate-300">
                {isGenerative ? 'Generative Work' : 'Non-Generative'}
              </span>
              <span className="text-[9px] text-slate-500">
                ({isGenerative ? 'meaningful output' : 'busywork detected'})
              </span>
            </div>

            {/* Friction Effect */}
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] text-slate-300">Effect on alpha:</span>
              <FrictionEffectIndicator
                multiplier={frictionMultiplier}
                direction={engagementEffect.direction}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Six Dimensions */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Gamepad2 className="w-3 h-3 text-cyan-400" />
          <span className="text-xs font-medium text-white">Six Dimensions</span>
        </div>
        <div className="space-y-1.5">
          {DIMENSION_KEYS.map((dim) => (
            <DimensionBar key={dim} dimension={dim} score={dimensionScores[dim]} />
          ))}
        </div>
      </div>

      {/* Worker Distribution */}
      {totalWorkers > 0 && (
        <div className="p-3 border-b border-slate-700/30">
          <div className="flex items-center gap-1 mb-2">
            <Activity className="w-3 h-3 text-slate-400" />
            <span className="text-xs font-medium text-white">Worker Distribution</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-500/10 rounded p-2">
              <div className="text-lg font-bold text-green-400">{engagedCount}</div>
              <div className="text-[9px] text-green-400/70">Engaged</div>
            </div>
            <div className="bg-amber-500/10 rounded p-2">
              <div className="text-lg font-bold text-amber-400">{disengagedCount}</div>
              <div className="text-[9px] text-amber-400/70">Disengaged</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2">
              <div className="text-lg font-bold text-orange-400">{burnoutRiskCount}</div>
              <div className="text-[9px] text-orange-400/70">Burnout Risk</div>
            </div>
          </div>
        </div>
      )}

      {/* Friction Adjustment Explanation */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Info className="w-3 h-3 text-slate-400" />
          <span className="text-xs font-medium text-white">Friction Adjustment</span>
        </div>
        <div className="bg-slate-800/30 rounded p-2">
          <p className="text-[9px] text-slate-400 leading-relaxed">
            {engagementEffect.explanation}
          </p>
        </div>
      </div>

      {/* Expandable Dimension Details */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Gamepad2 className="w-3 h-3" />
            Dimension Details
          </span>
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                {ENGAGEMENT_DIMENSIONS.map((dim) => {
                  const Icon = DIMENSION_ICONS[dim.key];
                  const colorClass = DIMENSION_COLORS[dim.key];

                  return (
                    <div key={dim.key} className="bg-slate-800/30 rounded p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3 h-3 ${colorClass}`} />
                        <span className="text-[10px] font-bold text-white">{dim.label}</span>
                        <span className={`ml-auto text-[9px] font-mono ${colorClass}`}>
                          {dimensionScores[dim.key].toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-relaxed">{dim.description}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Educational Section */}
      <div className="p-3">
        <button
          onClick={() => setShowEducational(!showEducational)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            About the Gaming Parallel
          </span>
          {showEducational ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showEducational && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-cyan-400">The Gaming Parallel:</strong> Good games share
                  key features with engaging work - clear goals, immediate feedback, appropriate
                  challenge, and visible progress.
                </p>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="font-bold text-white mb-1">Why This Matters for Stability</div>
                  <p className="text-slate-400">
                    When work feels like a good game, workers become intrinsically motivated. They
                    cooperate naturally without needing oversight, reducing system friction (alpha).
                    Disengaged workers require more controls, increasing friction and threatening
                    stability (alpha times tau approaching threshold).
                  </p>
                </div>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="font-bold text-white mb-1">Generative vs Non-Generative</div>
                  <p className="text-slate-400">
                    Generative work produces meaningful output - products, decisions, improvements.
                    Non-generative work is busywork that looks productive but creates no real value.
                    True engagement requires both gaming elements AND generative output.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default EngagementSignaturePanel;
