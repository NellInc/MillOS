/**
 * Value Dashboard - BAS Value Formula Visualization
 *
 * Displays the value formula: V = Z x S x E x F
 * Where:
 *   Z = Resource Index (C x H x M) - from stabilityStore
 *   S = Stability Coefficient (1 - product/threshold) - from stabilityStore
 *   E = Equity Index - derived from BAS axes
 *   F = Flourishing Coefficient - placeholder (Phase 4)
 *
 * This component visualizes how bilateral alignment affects overall value.
 */

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  Scale,
  Heart,
  Info,
  Minus,
} from 'lucide-react';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useBASStore } from '../../../stores/basStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { useSocialMissionStore } from '../../../stores/socialMissionStore';
import { useShallow } from 'zustand/react/shallow';
import { STABILITY_THRESHOLD } from '../../../types/bas';
import {
  calculateSocialMissionEquityContribution,
  calculateSocialMissionFlourishingBoost,
  type SocialMissionMetrics,
} from '../../../systems/bas/valueCalculator';

// =============================================================================
// COEFFICIENT BAR COMPONENT
// =============================================================================

interface CoefficientBarProps {
  label: string;
  symbol: string;
  value: number;
  maxValue?: number;
  color: string;
  icon: React.ReactNode;
  description?: string;
}

const CoefficientBar: React.FC<CoefficientBarProps> = memo(
  ({ label, symbol, value, maxValue = 1, color, icon, description }) => {
    // Memoize percentage calculation
    const percentage = useMemo(
      () => Math.max(0, Math.min(100, (value / maxValue) * 100)),
      [value, maxValue]
    );

    // Memoize color and status label calculations
    const { barColor, statusLabel } = useMemo(() => {
      const bColor =
        percentage >= 70 ? 'bg-green-500' : percentage >= 40 ? 'bg-amber-500' : 'bg-red-500';
      const sLabel = percentage >= 70 ? 'Good' : percentage >= 40 ? 'Moderate' : 'Low';
      return { barColor: bColor, statusLabel: sLabel };
    }, [percentage]);

    return (
      <div className="bg-slate-800/50 rounded p-2">
        <div className="flex items-center gap-1 mb-1">
          <span aria-hidden="true">{icon}</span>
          <span className="text-[9px] text-slate-400">{label}</span>
          <span className="text-[9px] text-slate-500 ml-auto">({symbol})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-mono font-bold text-white">{value.toFixed(2)}</div>
          <div
            role="meter"
            aria-label={`${label} coefficient`}
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${value.toFixed(2)} out of ${maxValue}, ${statusLabel}`}
            className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full ${color || barColor}`}
            />
          </div>
        </div>
        {description && <div className="text-[8px] text-slate-500 mt-1">{description}</div>}
      </div>
    );
  }
);

CoefficientBar.displayName = 'CoefficientBar';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ValueDashboard: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);

  // Stability store data
  const { resources, wallace, getEquityIndex } = useStabilityStore(
    useShallow((state) => ({
      resources: state.resources,
      wallace: state.wallace,
      getEquityIndex: state.getEquityIndex,
    }))
  );

  // BAS store data for equity calculation
  const axes = useBASStore((state) => state.axes);

  // Worker mood store for trust/initiative
  const { averageTrust, averageInitiative } = useWorkerMoodStore(
    useShallow((state) => {
      const moods = Object.values(state.workerMoods);
      const withPrefs = moods.filter((m) => m?.preferences);
      const avgTrust =
        withPrefs.length > 0
          ? withPrefs.reduce((sum, m) => sum + (m?.preferences?.managementTrust || 0), 0) /
            withPrefs.length
          : 50;
      const avgInit =
        withPrefs.length > 0
          ? withPrefs.reduce((sum, m) => sum + (m?.preferences?.initiative || 0), 0) /
            withPrefs.length
          : 50;
      return {
        averageTrust: avgTrust,
        averageInitiative: avgInit,
      };
    })
  );

  // Social mission store for V = Z x S x E x F contributions
  const socialMissionMetrics = useSocialMissionStore(
    useShallow(
      (state): SocialMissionMetrics => ({
        socialImpactScore: state.missionMetrics.socialImpactScore,
        workerFlourishingContribution: state.missionMetrics.workerFlourishingContribution,
        communityWelfareContribution: state.missionMetrics.communityWelfareContribution,
        environmentalContribution: state.missionMetrics.environmentalContribution,
        workerSatisfaction: state.stakeholderSatisfaction.workers,
      })
    )
  );

  // Calculate coefficients
  const coefficients = useMemo(() => {
    // Z = Resource Index (already calculated in store as compositeZ)
    const Z = resources.compositeZ;

    // S = Stability Coefficient: 1 - (product / threshold)
    // When product = 0, S = 1 (fully stable)
    // When product = threshold, S = 0 (unstable)
    const S = Math.max(0, 1 - wallace.stabilityProduct / STABILITY_THRESHOLD);

    // E = Equity Index (derived from axes, stability store, and social mission)
    // Uses information access and evaluation direction as key factors
    const infoAccessNorm = axes.informationAccess / 100;
    const evalDirectionNorm = axes.evaluationDirection / 100;
    const baseEquity = getEquityIndex();

    // Social mission contribution to equity (community care, worker focus)
    const socialMissionEquity = calculateSocialMissionEquityContribution(socialMissionMetrics);

    // Combine: base equity (40%), info access (20%), eval direction (15%), social mission (25%)
    const E =
      baseEquity * 0.4 +
      infoAccessNorm * 0.2 +
      evalDirectionNorm * 0.15 +
      socialMissionEquity * 0.25;

    // F = Flourishing (derived from trust, initiative, and social mission)
    const trustNorm = averageTrust / 100;
    const initiativeNorm = averageInitiative / 100;

    // Base flourishing from trust and initiative
    const baseFlourishing = 0.5 + trustNorm * 0.25 + initiativeNorm * 0.15; // Range: 0.5 to 0.9

    // Social mission adds meaning, connection, and wholeness boost (up to 0.15)
    const socialMissionBoost = calculateSocialMissionFlourishingBoost(socialMissionMetrics);

    // Total flourishing capped at 1.0
    const F = Math.min(1.0, baseFlourishing + socialMissionBoost);

    // V = Z x S x E x F
    const V = Z * S * E * F;

    // Baseline value (with all coefficients at 0.5)
    const baseline = 0.5 * 0.5 * 0.5 * 0.75;

    return {
      Z,
      S,
      E,
      F,
      V,
      baseline,
      multiplier: V / baseline,
    };
  }, [
    resources.compositeZ,
    wallace.stabilityProduct,
    axes.informationAccess,
    axes.evaluationDirection,
    getEquityIndex,
    socialMissionMetrics,
    averageTrust,
    averageInitiative,
  ]);

  // Memoize trend calculations
  const { trend, TrendIcon, trendColor } = useMemo(() => {
    const t =
      coefficients.multiplier >= 1.2
        ? 'excellent'
        : coefficients.multiplier >= 1.0
          ? 'good'
          : coefficients.multiplier >= 0.8
            ? 'moderate'
            : 'poor';

    const icon =
      t === 'excellent' || t === 'good' ? TrendingUp : t === 'moderate' ? Minus : TrendingDown;

    const color =
      t === 'excellent'
        ? 'text-green-400'
        : t === 'good'
          ? 'text-cyan-400'
          : t === 'moderate'
            ? 'text-amber-400'
            : 'text-red-400';

    return { trend: t, TrendIcon: icon, trendColor: color };
  }, [coefficients.multiplier]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-bold text-white">Value Dashboard</span>
          <TrendIcon className={`w-3 h-3 ml-auto ${trendColor}`} />
          <span className={`text-[10px] ${trendColor}`}>
            {trend.charAt(0).toUpperCase() + trend.slice(1)}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Value Formula: V = Z x S x E x F</p>
      </div>

      {/* Main Value Display */}
      <div className="p-3 border-b border-slate-700/30">
        <div
          className={`rounded-lg p-4 ${
            trend === 'excellent'
              ? 'bg-green-500/20'
              : trend === 'good'
                ? 'bg-cyan-500/20'
                : trend === 'moderate'
                  ? 'bg-amber-500/20'
                  : 'bg-red-500/20'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-400">Total Value (V)</span>
            <span
              className={`text-[10px] font-medium ${
                coefficients.multiplier >= 1 ? 'text-green-400' : 'text-amber-400'
              }`}
            >
              {coefficients.multiplier >= 1 ? '+' : ''}
              {((coefficients.multiplier - 1) * 100).toFixed(0)}% vs baseline
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-mono font-bold ${
                trend === 'excellent'
                  ? 'text-green-400'
                  : trend === 'good'
                    ? 'text-cyan-400'
                    : trend === 'moderate'
                      ? 'text-amber-400'
                      : 'text-red-400'
              }`}
            >
              {coefficients.V.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-500">
              x{coefficients.multiplier.toFixed(2)} multiplier
            </span>
          </div>

          {/* Value Bar */}
          <div
            role="meter"
            aria-label="Value multiplier"
            aria-valuenow={coefficients.multiplier * 100}
            aria-valuemin={0}
            aria-valuemax={200}
            aria-valuetext={`${coefficients.multiplier.toFixed(2)}x multiplier, ${trend} performance`}
            className="mt-3 h-2 bg-slate-700/50 rounded-full overflow-hidden"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, coefficients.multiplier * 50)}%`,
              }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full ${
                trend === 'excellent'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                  : trend === 'good'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-400'
                    : trend === 'moderate'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      : 'bg-gradient-to-r from-red-500 to-orange-400'
              }`}
            />
          </div>
          <div className="flex justify-between mt-1" aria-hidden="true">
            <span className="text-[8px] text-slate-500">0</span>
            <span className="text-[8px] text-slate-500">1x</span>
            <span className="text-[8px] text-slate-500">2x</span>
          </div>
        </div>
      </div>

      {/* Coefficient Breakdown */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Zap className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-white">Coefficient Breakdown</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CoefficientBar
            label="Resources"
            symbol="Z"
            value={coefficients.Z}
            color="bg-cyan-500"
            icon={<Zap className="w-3 h-3 text-cyan-400" />}
            description="C x H x M capacity"
          />
          <CoefficientBar
            label="Stability"
            symbol="S"
            value={coefficients.S}
            color="bg-green-500"
            icon={<Shield className="w-3 h-3 text-green-400" />}
            description="System resilience"
          />
          <CoefficientBar
            label="Equity"
            symbol="E"
            value={coefficients.E}
            color="bg-pink-500"
            icon={<Scale className="w-3 h-3 text-pink-400" />}
            description="Fair distribution"
          />
          <CoefficientBar
            label="Flourishing"
            symbol="F"
            value={coefficients.F}
            color="bg-purple-500"
            icon={<Heart className="w-3 h-3 text-purple-400" />}
            description="Eudaimonia proxy"
          />
        </div>
      </div>

      {/* Formula Components Detail */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="bg-slate-800/30 rounded p-2">
          <div className="text-[9px] text-slate-400 text-center font-mono">
            V = {coefficients.Z.toFixed(2)} x {coefficients.S.toFixed(2)} x{' '}
            {coefficients.E.toFixed(2)} x {coefficients.F.toFixed(2)} ={' '}
            <span className="text-yellow-400 font-bold">{coefficients.V.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* About Section (Expandable) */}
      <div className="p-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="value-formula-details"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" aria-hidden="true" />
            About Value Formula
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
              id="value-formula-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-yellow-400">V = Z x S x E x F</strong> measures true
                  organizational value by combining resource capacity, system stability, equitable
                  distribution, and human flourishing.
                </p>

                <div className="bg-slate-800/30 rounded p-2 space-y-2">
                  <div>
                    <span className="text-cyan-400 font-bold">Z</span> ={' '}
                    <span className="text-white">Resource Index</span>
                    <p className="text-slate-500 ml-4">
                      C x H x M: Communication, Information, Material capacity
                    </p>
                  </div>
                  <div>
                    <span className="text-green-400 font-bold">S</span> ={' '}
                    <span className="text-white">Stability Coefficient</span>
                    <p className="text-slate-500 ml-4">
                      1 - (friction x delay) / threshold. Resilience to stress.
                    </p>
                  </div>
                  <div>
                    <span className="text-pink-400 font-bold">E</span> ={' '}
                    <span className="text-white">Equity Index</span>
                    <p className="text-slate-500 ml-4">
                      Information access + evaluation direction fairness.
                    </p>
                  </div>
                  <div>
                    <span className="text-purple-400 font-bold">F</span> ={' '}
                    <span className="text-white">Flourishing Coefficient</span>
                    <p className="text-slate-500 ml-4">
                      Eudaimonia - currently approximated from trust/initiative.
                    </p>
                  </div>
                </div>

                <div className="bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                  <div className="font-bold text-yellow-400 mb-1">Key Insight</div>
                  <p className="text-slate-400">
                    Traditional metrics focus only on Z (resources). Bilateral alignment recognizes
                    that S, E, and F are equally important multipliers. Neglecting any coefficient
                    reduces total value.
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

export default ValueDashboard;
