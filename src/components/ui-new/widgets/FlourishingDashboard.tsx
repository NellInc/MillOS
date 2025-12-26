/**
 * Flourishing Dashboard
 *
 * Compact dashboard showing the six dimensions of human flourishing (eudaimonia)
 * for the factory workforce. Part of the Bilateral Autonomy System Phase 4.
 *
 * Displays:
 * - Overall flourishing score (geometric mean of 6 dimensions)
 * - Mini visualization for the 6 dimensions
 * - Count of flourishing (>70) vs struggling (<40) workers
 * - Weekly trend indicator
 * - Expandable section with dimension descriptions
 * - Engagement signature summary in Joy section
 */

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Star,
  Users,
  Smile,
  Trophy,
  Compass,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';
import {
  useFlourishingStore,
  FLOURISHING_DIMENSIONS,
} from '../../../stores/flourishingStore';
import {
  useEngagementStore,
  getStatusColor,
  getStatusLabel,
} from '../../../stores/engagementStore';
import { useShallow } from 'zustand/react/shallow';
import type { FlourishingDimensionKey } from '../../../types/bas';

// =============================================================================
// ICON MAPPING
// =============================================================================

const DIMENSION_ICONS: Record<FlourishingDimensionKey, LucideIcon> = {
  meaning: Compass,
  mastery: Trophy,
  connection: Users,
  joy: Smile,
  wholeness: Heart,
  agency: Zap,
};

const DIMENSION_COLORS: Record<FlourishingDimensionKey, string> = {
  meaning: 'text-violet-400',
  mastery: 'text-amber-400',
  connection: 'text-cyan-400',
  joy: 'text-green-400',
  wholeness: 'text-pink-400',
  agency: 'text-orange-400',
};

const DIMENSION_BG_COLORS: Record<FlourishingDimensionKey, string> = {
  meaning: 'bg-violet-500',
  mastery: 'bg-amber-500',
  connection: 'bg-cyan-500',
  joy: 'bg-green-500',
  wholeness: 'bg-pink-500',
  agency: 'bg-orange-500',
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface DimensionBarProps {
  dimension: FlourishingDimensionKey;
  score: number;
  compact?: boolean;
}

const DimensionBar: React.FC<DimensionBarProps> = memo(({
  dimension,
  score,
  compact = false,
}) => {
  const Icon = DIMENSION_ICONS[dimension];
  const colorClass = DIMENSION_COLORS[dimension];
  const bgColorClass = DIMENSION_BG_COLORS[dimension];

  // Memoize descriptor lookup and status calculations
  const { label, statusLabel } = useMemo(() => {
    const desc = FLOURISHING_DIMENSIONS.find((d) => d.key === dimension);
    const lbl = desc?.label || dimension;
    const status = score >= 70 ? 'Flourishing' : score >= 40 ? 'Neutral' : 'Struggling';
    return { label: lbl, statusLabel: status };
  }, [dimension, score]);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Icon className={`w-3 h-3 ${colorClass}`} aria-hidden="true" />
        <div
          role="meter"
          aria-label={`${label} dimension`}
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${score.toFixed(0)}%, ${statusLabel}`}
          className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-full rounded-full ${bgColorClass}`}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-400 w-6 text-right" aria-hidden="true">
          {score.toFixed(0)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon className={`w-3 h-3 ${colorClass}`} aria-hidden="true" />
          <span className="text-[10px] font-medium text-white">
            {label}
          </span>
        </div>
        <span className={`text-[10px] font-mono ${colorClass}`} aria-hidden="true">
          {score.toFixed(0)}%
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} dimension`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${score.toFixed(0)}%, ${statusLabel}`}
        className="h-2 bg-slate-700 rounded-full overflow-hidden"
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${bgColorClass}`}
        />
      </div>
    </div>
  );
});

DimensionBar.displayName = 'DimensionBar';

// Static dimension keys to prevent recreation
const DIMENSION_KEYS: FlourishingDimensionKey[] = [
  'meaning',
  'mastery',
  'connection',
  'joy',
  'wholeness',
  'agency',
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FlourishingDashboard: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);

  // Subscribe to the underlying state that affects factory flourishing
  // This ensures re-renders when data changes without causing infinite loops
  const workerFlourishing = useFlourishingStore((state) => state.workerFlourishing);
  const weeklyBaseline = useFlourishingStore((state) => state.weeklyBaseline);
  const getFactoryFlourishing = useFlourishingStore((state) => state.getFactoryFlourishing);

  // Get engagement data for the Joy section summary
  const { engagementScore, engagementStatus } = useEngagementStore(
    useShallow((state) => ({
      engagementScore: state.overallScore,
      engagementStatus: state.diagnosticStatus,
    }))
  );

  // Compute factory-level stats using the subscribed state as dependencies
  const factoryFlourishing = useMemo(
    () => getFactoryFlourishing(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workerFlourishing, weeklyBaseline]
  );

  const dimensionDescriptors = useMemo(() => {
    return FLOURISHING_DIMENSIONS;
  }, []);

  const {
    overallScore,
    dimensionScores,
    flourishingWorkers,
    neutralWorkers,
    strugglingWorkers,
    weeklyTrend,
    biggestGain,
    biggestConcern,
  } = factoryFlourishing;

  // Memoize trend indicator values
  const { TrendIcon, trendColor, trendLabel } = useMemo(() => {
    const icon =
      weeklyTrend === 'improving'
        ? TrendingUp
        : weeklyTrend === 'declining'
          ? TrendingDown
          : Minus;
    const color =
      weeklyTrend === 'improving'
        ? 'text-green-400'
        : weeklyTrend === 'declining'
          ? 'text-red-400'
          : 'text-slate-400';
    const label =
      weeklyTrend === 'improving'
        ? 'Improving'
        : weeklyTrend === 'declining'
          ? 'Declining'
          : 'Stable';
    return { TrendIcon: icon, trendColor: color, trendLabel: label };
  }, [weeklyTrend]);

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

  const totalWorkers = useMemo(
    () => flourishingWorkers + neutralWorkers + strugglingWorkers,
    [flourishingWorkers, neutralWorkers, strugglingWorkers]
  );

  // Engagement status for Joy section
  const engagementStatusColor = getStatusColor(engagementStatus);
  const engagementStatusLabel = getStatusLabel(engagementStatus);
  const needsAttention = engagementStatus !== 'healthy';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">
            Flourishing (Eudaimonia)
          </span>
          <div className={`ml-auto flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            <span className="text-[10px] font-medium">{trendLabel}</span>
          </div>
        </div>
        <p className="text-[9px] text-slate-400 mt-1">
          Six dimensions of human wellbeing in work
        </p>
      </div>

      {/* Overall Score */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-3">
          {/* Score Circle */}
          <div
            className={`relative w-14 h-14 rounded-full ${scoreBg} flex items-center justify-center`}
          >
            <div className="absolute inset-1 rounded-full border-2 border-current opacity-30" />
            <span className={`text-lg font-bold ${scoreColor}`}>
              {overallScore.toFixed(0)}
            </span>
          </div>

          {/* Worker Counts */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-slate-300">
                  {flourishingWorkers} flourishing
                </span>
              </div>
              <span className="text-[9px] text-slate-500">(&gt;70)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Minus className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-300">
                  {neutralWorkers} neutral
                </span>
              </div>
              <span className="text-[9px] text-slate-500">(40-70)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-slate-300">
                  {strugglingWorkers} struggling
                </span>
              </div>
              <span className="text-[9px] text-slate-500">(&lt;40)</span>
            </div>
          </div>
        </div>

        {/* Progress bar showing distribution */}
        <div
          role="img"
          aria-label={`Worker wellbeing distribution: ${flourishingWorkers} flourishing, ${neutralWorkers} neutral, ${strugglingWorkers} struggling out of ${totalWorkers} total workers`}
          className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden flex"
        >
          {flourishingWorkers > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${(flourishingWorkers / totalWorkers) * 100}%`,
              }}
              className="h-full bg-green-500"
            />
          )}
          {neutralWorkers > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${(neutralWorkers / totalWorkers) * 100}%`,
              }}
              className="h-full bg-slate-500"
            />
          )}
          {strugglingWorkers > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${(strugglingWorkers / totalWorkers) * 100}%`,
              }}
              className="h-full bg-red-500"
            />
          )}
        </div>
      </div>

      {/* Six Dimensions Mini Chart */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Heart className="w-3 h-3 text-pink-400" />
          <span className="text-xs font-medium text-white">
            Six Dimensions
          </span>
        </div>
        <div className="space-y-1.5">
          {DIMENSION_KEYS.map((dim) => (
            <DimensionBar
              key={dim}
              dimension={dim}
              score={dimensionScores[dim]}
              compact
            />
          ))}
        </div>
      </div>

      {/* Engagement Signature Summary (in Joy section context) */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Gamepad2 className="w-3 h-3 text-cyan-400" />
          <span className="text-xs font-medium text-white">
            Engagement Signature
          </span>
        </div>
        <div className="bg-slate-800/30 rounded p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gamepad2 className={`w-4 h-4 ${engagementStatusColor}`} />
              <span className={`text-[11px] font-medium ${engagementStatusColor}`}>
                {needsAttention ? 'Needs Attention' : 'Healthy'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {engagementScore.toFixed(0)}%
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
            Work should feel like a game that produces something real.
            {needsAttention
              ? ` Current status: ${engagementStatusLabel}.`
              : ' Workers are engaged and productive.'}
          </p>
        </div>
      </div>

      {/* Highlights */}
      {(biggestGain || biggestConcern) && (
        <div className="p-3 border-b border-slate-700/30">
          <div className="grid grid-cols-2 gap-2">
            {biggestGain && (
              <div className="bg-green-500/10 rounded p-2">
                <div className="flex items-center gap-1 text-[9px] text-green-400 mb-1">
                  <TrendingUp className="w-3 h-3" />
                  <span>Biggest Gain</span>
                </div>
                <div className="flex items-center gap-1">
                  {React.createElement(DIMENSION_ICONS[biggestGain], {
                    className: `w-3 h-3 ${DIMENSION_COLORS[biggestGain]}`,
                  })}
                  <span className="text-[10px] font-medium text-white capitalize">
                    {biggestGain}
                  </span>
                </div>
              </div>
            )}
            {biggestConcern && (
              <div className="bg-red-500/10 rounded p-2">
                <div className="flex items-center gap-1 text-[9px] text-red-400 mb-1">
                  <TrendingDown className="w-3 h-3" />
                  <span>Concern</span>
                </div>
                <div className="flex items-center gap-1">
                  {React.createElement(DIMENSION_ICONS[biggestConcern], {
                    className: `w-3 h-3 ${DIMENSION_COLORS[biggestConcern]}`,
                  })}
                  <span className="text-[10px] font-medium text-white capitalize">
                    {biggestConcern}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandable Dimension Details */}
      <div className="p-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="flourishing-dimension-details"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Compass className="w-3 h-3" aria-hidden="true" />
            About the Six Dimensions
          </span>
          {showDetails ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              id="flourishing-dimension-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                {dimensionDescriptors.map((dim) => {
                  const Icon = DIMENSION_ICONS[dim.key];
                  const colorClass = DIMENSION_COLORS[dim.key];

                  return (
                    <div
                      key={dim.key}
                      className="bg-slate-800/30 rounded p-2"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3 h-3 ${colorClass}`} />
                        <span className="text-[10px] font-bold text-white">
                          {dim.label}
                        </span>
                        <span
                          className={`ml-auto text-[9px] font-mono ${colorClass}`}
                        >
                          {dimensionScores[dim.key].toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-relaxed">
                        {dim.description}
                      </p>
                    </div>
                  );
                })}

                {/* Geometric Mean Explanation */}
                <div className="bg-slate-800/50 rounded p-2 mt-2">
                  <p className="text-[9px] text-slate-400 leading-relaxed">
                    <strong className="text-amber-400">
                      Geometric Mean:
                    </strong>{' '}
                    The overall score uses geometric mean, not arithmetic
                    mean. This means one low dimension significantly impacts
                    the total - true flourishing requires balance across all
                    six dimensions.
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

export default FlourishingDashboard;
