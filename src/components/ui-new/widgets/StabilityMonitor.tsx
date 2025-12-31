/**
 * Stability Monitor - Wallace Metrics Visualization
 *
 * Displays the stability metrics from Wallace's Rate Distortion Control Theory.
 * Key insight: System stability requires ατ < e⁻¹ ≈ 0.368
 *
 * Where:
 *   α = Friction coefficient (resistance to change)
 *   τ = Delay (feedback loop latency)
 *
 * This component provides:
 * - Real-time stability product visualization
 * - Phase state indicator
 * - Trend analysis
 * - Actionable recommendations
 * - Engagement influence on friction
 * - Educational tooltips for key concepts
 */

import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Gauge,
  Timer,
  Zap,
  Info,
  Shield,
  Gamepad2,
  ArrowDown,
  ArrowUp,
  Minus,
} from 'lucide-react';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useEngagementStore } from '../../../stores/engagementStore';
import { useShallow } from 'zustand/react/shallow';
import { STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../../../types/bas';
import { ConceptTooltip } from './ConceptTooltip';

// =============================================================================
// STATIC CONSTANTS - Defined outside component to prevent recreation
// =============================================================================

const PHASE_CONFIG: Record<
  string,
  {
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  stable: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: CheckCircle,
    label: 'Stable',
  },
  approaching: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    icon: Activity,
    label: 'Approaching',
  },
  critical: {
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    icon: AlertTriangle,
    label: 'Critical',
  },
  transitioning: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    icon: Zap,
    label: 'Transitioning',
  },
  unstable: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: AlertTriangle,
    label: 'Unstable',
  },
};

// =============================================================================
// PHASE INDICATOR COMPONENT
// =============================================================================

interface PhaseIndicatorProps {
  phase: string;
  product: number;
  threshold: number;
}

const PhaseIndicator: React.FC<PhaseIndicatorProps> = memo(({ phase, product, threshold }) => {
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.stable;
  const Icon = config.icon;
  const percentage = ((threshold - product) / threshold) * 100;

  return (
    <div className={`rounded-lg p-3 ${config.bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} aria-hidden="true" />
          <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
          <ConceptTooltip conceptId="phase-transition" position="right" />
        </div>
        <span className={`text-lg font-mono font-bold ${config.color}`} aria-hidden="true">
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Stability bar */}
      <div
        role="meter"
        aria-label="System stability"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${percentage.toFixed(0)}% stability, phase: ${config.label}`}
        className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden"
      >
        {/* Warning zone marker */}
        <div
          className="absolute top-0 bottom-0 bg-amber-500/30"
          style={{ left: '80%', right: '0%' }}
          aria-hidden="true"
        />
        {/* Critical zone marker */}
        <div
          className="absolute top-0 bottom-0 bg-red-500/30"
          style={{ left: '95%', right: '0%' }}
          aria-hidden="true"
        />
        {/* Current stability */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${
            phase === 'stable'
              ? 'bg-green-500'
              : phase === 'approaching'
                ? 'bg-amber-500'
                : phase === 'critical'
                  ? 'bg-orange-500'
                  : 'bg-red-500'
          }`}
        />
      </div>

      <div className="flex justify-between mt-1" aria-hidden="true">
        <span className="text-[8px] text-slate-500">Unstable</span>
        <span className="text-[8px] text-slate-500">Warning</span>
        <span className="text-[8px] text-slate-500">Stable</span>
      </div>
    </div>
  );
});

PhaseIndicator.displayName = 'PhaseIndicator';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const StabilityMonitor: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const {
    wallace,
    phase,
    resources,
    frictionSources,
    delaySources,
    getTrendDirection,
    getRecommendations,
  } = useStabilityStore(
    useShallow((state) => ({
      wallace: state.wallace,
      phase: state.phase,
      resources: state.resources,
      frictionSources: state.frictionSources,
      delaySources: state.delaySources,
      getTrendDirection: state.getTrendDirection,
      getRecommendations: state.getRecommendations,
    }))
  );

  // Get engagement effect on friction
  const { frictionMultiplier, getEngagementEffect } = useEngagementStore(
    useShallow((state) => ({
      frictionMultiplier: state.frictionMultiplier,
      getEngagementEffect: state.getEngagementEffect,
    }))
  );

  // Memoize expensive calculations to prevent recalculation on every render
  const engagementEffect = useMemo(
    () => getEngagementEffect(),
    [getEngagementEffect, frictionMultiplier]
  );

  const trend = useMemo(() => getTrendDirection(), [getTrendDirection]);
  const recommendations = useMemo(() => getRecommendations(), [getRecommendations]);

  // Memoize trend icon and color
  const { TrendIcon, trendColor } = useMemo(() => {
    const icon =
      trend === 'improving'
        ? TrendingUp
        : trend === 'degrading' || trend === 'critical'
          ? TrendingDown
          : Activity;
    const color =
      trend === 'improving'
        ? 'text-green-400'
        : trend === 'degrading'
          ? 'text-amber-400'
          : trend === 'critical'
            ? 'text-red-400'
            : 'text-slate-400';
    return { TrendIcon: icon, trendColor: color };
  }, [trend]);

  // Memoize engagement effect icon and color
  const { EngagementIcon, engagementColor } = useMemo(() => {
    const icon =
      engagementEffect.direction === 'reducing'
        ? ArrowDown
        : engagementEffect.direction === 'increasing'
          ? ArrowUp
          : Minus;
    const color =
      engagementEffect.direction === 'reducing'
        ? 'text-green-400'
        : engagementEffect.direction === 'increasing'
          ? 'text-red-400'
          : 'text-slate-400';
    return { EngagementIcon: icon, engagementColor: color };
  }, [engagementEffect.direction]);

  // Memoize friction and delay source entries for iteration
  const frictionEntries = useMemo(() => Object.entries(frictionSources), [frictionSources]);
  const delayEntries = useMemo(() => Object.entries(delaySources), [delaySources]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-green-400" />
          <span className="text-sm font-bold text-white">Stability Monitor</span>
          <ConceptTooltip conceptId="wallace-stability" position="bottom" />
          <TrendIcon className={`w-3 h-3 ml-auto ${trendColor}`} />
          <span className={`text-[10px] ${trendColor}`}>
            {trend.charAt(0).toUpperCase() + trend.slice(1)}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Prof. Dr. Rodrick Wallace&apos;s Stability Metrics (ατ &lt; 0.368)
        </p>
        <p className="text-[9px] text-slate-500">
          <a
            href="https://www.researchgate.net/profile/Rodrick-Wallace"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-400 underline"
          >
            NY State Psychiatric Institute / Columbia
          </a>{' '}
          — Preprint (2025)
        </p>
      </div>

      {/* Phase Indicator */}
      <div className="p-3 border-b border-slate-700/30">
        <PhaseIndicator
          phase={phase}
          product={wallace.stabilityProduct}
          threshold={STABILITY_THRESHOLD}
        />
      </div>

      {/* Key Metrics */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="grid grid-cols-3 gap-2">
          {/* Friction (α) */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <Shield className="w-3 h-3 text-orange-400" />
              <span className="text-[9px] text-slate-400">Friction (α)</span>
            </div>
            <div className="text-sm font-mono font-bold text-white">
              {wallace.friction.toFixed(2)}
            </div>
            <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${wallace.friction * 100}%` }}
              />
            </div>
          </div>

          {/* Delay (τ) */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <Timer className="w-3 h-3 text-blue-400" />
              <span className="text-[9px] text-slate-400">Delay (τ)</span>
            </div>
            <div className="text-sm font-mono font-bold text-white">{wallace.delay.toFixed(2)}</div>
            <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${wallace.delay * 100}%` }}
              />
            </div>
          </div>

          {/* Product (ατ) */}
          <div className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-purple-400" />
              <span className="text-[9px] text-slate-400">Product (ατ)</span>
              <ConceptTooltip conceptId="stability-threshold" position="left" />
            </div>
            <div
              className={`text-sm font-mono font-bold ${
                wallace.stabilityProduct >= STABILITY_THRESHOLD
                  ? 'text-red-400'
                  : wallace.stabilityProduct >= WARNING_THRESHOLD
                    ? 'text-amber-400'
                    : 'text-green-400'
              }`}
            >
              {wallace.stabilityProduct.toFixed(3)}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">
              Threshold: {STABILITY_THRESHOLD.toFixed(3)}
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Influence on Friction */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Gamepad2 className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-white">Engagement Effect on α</span>
          <ConceptTooltip conceptId="engagement-signature" position="right" />
        </div>
        <div className="bg-slate-800/30 rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-300">Friction Multiplier:</span>
            <div className={`flex items-center gap-1 ${engagementColor}`}>
              <EngagementIcon className="w-3 h-3" />
              <span className="text-[11px] font-mono font-bold">
                {frictionMultiplier.toFixed(2)}x
              </span>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 leading-relaxed">
            {engagementEffect.explanation}
          </p>
        </div>
      </div>

      {/* Resource Rates (Z = C × H × M) */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Zap className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-white">Resource Index (Z)</span>
          <span className="ml-auto text-[10px] text-cyan-400 font-mono">
            {resources.compositeZ.toFixed(3)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="bg-slate-800/30 rounded p-1">
            <div className="text-[9px] text-slate-400">C (Comm)</div>
            <div className="text-[10px] font-mono text-white">
              {resources.communicationCapacity}%
            </div>
          </div>
          <div className="bg-slate-800/30 rounded p-1">
            <div className="text-[9px] text-slate-400">H (Info)</div>
            <div className="text-[10px] font-mono text-white">{resources.informationRate}%</div>
          </div>
          <div className="bg-slate-800/30 rounded p-1">
            <div className="text-[9px] text-slate-400">M (Material)</div>
            <div className="text-[10px] font-mono text-white">{resources.materialRate}%</div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="p-3 border-b border-slate-700/30">
          <div className="flex items-center gap-1 mb-2">
            <Info className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-medium text-white">Recommendations</span>
          </div>
          <div className="space-y-1">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className="text-[9px] text-slate-300 flex items-start gap-1">
                <span className="text-amber-400">-</span>
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable: Friction & Delay Sources */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowSources(!showSources)}
          aria-expanded={showSources}
          aria-controls="stability-friction-delay-sources"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" aria-hidden="true" />
            Friction & Delay Sources
          </span>
          {showSources ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
        </button>

        <AnimatePresence>
          {showSources && (
            <motion.div
              id="stability-friction-delay-sources"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
                {/* Friction Sources */}
                <div className="bg-orange-500/10 rounded p-2">
                  <div className="text-[9px] text-orange-400 font-medium mb-1">Friction (α)</div>
                  {frictionEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between text-[8px]">
                      <span className="text-slate-400">{key.replace(/-/g, ' ')}</span>
                      <span className="text-orange-300 font-mono">{value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Delay Sources */}
                <div className="bg-blue-500/10 rounded p-2">
                  <div className="text-[9px] text-blue-400 font-medium mb-1">Delay (τ)</div>
                  {delayEntries.map(([key, value]) => (
                    <div key={key} className="flex justify-between text-[8px]">
                      <span className="text-slate-400">{key.replace(/-/g, ' ')}</span>
                      <span className="text-blue-300 font-mono">{value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Educational Section */}
      <div className="p-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="stability-wallace-details"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" aria-hidden="true" />
            About Wallace Stability
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
              id="stability-wallace-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-green-400">
                    Prof. Dr. Rodrick Wallace&apos;s Stability Theory
                  </strong>{' '}
                  from Rate Distortion Control demonstrates that cognitive systems require
                  regulatory pairing for stability. Dr. Wallace is a Research Scientist at the New
                  York State Psychiatric Institute (Columbia University).
                </p>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1 font-bold text-white mb-1">
                    Critical Insight
                    <ConceptTooltip conceptId="stability-threshold" position="right" />
                  </div>
                  <p className="text-slate-400">
                    For stable operation, the product of friction (α) and delay (τ) must remain
                    below e⁻¹ ≈ 0.368. Exceeding this threshold causes phase transitions - sudden
                    system failures.
                  </p>
                </div>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1 font-bold text-white mb-1">
                    Mission vs Detailed Command
                    <ConceptTooltip conceptId="mission-command" position="right" />
                  </div>
                  <p className="text-slate-400">
                    Higher autonomy (Mission Command) structures are more stable under stress than
                    hierarchical (Detailed Command) structures. AI should enable worker autonomy,
                    not micromanage.
                  </p>
                </div>
                {/* References */}
                <div className="bg-slate-800/30 rounded p-2 mt-2">
                  <div className="font-bold text-white mb-1 text-[9px]">References</div>
                  <p className="text-slate-400 italic leading-relaxed">
                    Wallace, R. (2025). &quot;Fog, Friction, Delay and the Failure of Bounded
                    Rationality Embodied Cognition: A formal study of generalized
                    psychopathology.&quot; Preprint submitted to Elsevier. New York State
                    Psychiatric Institute.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <a
                      href="https://www.researchgate.net/profile/Rodrick-Wallace"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline"
                    >
                      ResearchGate
                    </a>
                    <a
                      href="https://scholar.google.com/citations?user=uI4FInkAAAAJ"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Google Scholar
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default StabilityMonitor;
