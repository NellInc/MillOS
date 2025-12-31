/**
 * Five Axes Panel - Bilateral Autonomy System Control
 *
 * The main control center for the Five Axes of Democratic AI Management:
 * 1. Autonomy Level (AI Assigns ↔ Self-Organized)
 * 2. Decision Mode (AI Decides ↔ Pure Democracy)
 * 3. Information Access (Need-to-Know ↔ Full Transparency)
 * 4. Evaluation Direction (AI Evaluates ↔ Workers Rate AI)
 * 5. Collective Orientation (Individual ↔ Full Collective)
 *
 * Based on Semler/Mondragon democratic workplace principles.
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Compass,
  Vote,
  Eye,
  Scale,
  Users,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Activity,
  Target,
  Info,
  Zap,
  Shield,
} from 'lucide-react';
import { useBASStore } from '../../../stores/basStore';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { AXIS_DESCRIPTORS, BAS_PRESETS } from '../../../types/bas';
import type { AxisKey } from '../../../types/bas';

// =============================================================================
// ICON MAPPING
// =============================================================================

const AXIS_ICONS: Record<AxisKey, React.ComponentType<{ className?: string }>> = {
  autonomyLevel: Compass,
  decisionMode: Vote,
  informationAccess: Eye,
  evaluationDirection: Scale,
  collectiveOrientation: Users,
};

const AXIS_COLORS: Record<AxisKey, string> = {
  autonomyLevel: 'cyan',
  decisionMode: 'violet',
  informationAccess: 'amber',
  evaluationDirection: 'pink',
  collectiveOrientation: 'green',
};

// =============================================================================
// AXIS SLIDER COMPONENT
// =============================================================================

interface AxisSliderProps {
  axisKey: AxisKey;
  value: number;
  onChange: (value: number) => void;
  minAllowed: number;
  maxAllowed: number;
  lockedByVote: boolean;
}

const AxisSlider: React.FC<AxisSliderProps> = memo(
  ({ axisKey, value, onChange, minAllowed, maxAllowed, lockedByVote }) => {
    const descriptor = useMemo(() => AXIS_DESCRIPTORS.find((d) => d.key === axisKey)!, [axisKey]);
    const Icon = AXIS_ICONS[axisKey];
    const color = AXIS_COLORS[axisKey];

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseInt(e.target.value);
        onChange(newValue);
        audioManager.playClick?.();
      },
      [onChange]
    );

    // Determine mode label based on value - memoized
    const modeLabel = useMemo(() => {
      if (value < 25) return descriptor.lowLabel;
      if (value < 50) return 'Guided';
      if (value < 75) return 'Hybrid';
      return descriptor.highLabel;
    }, [value, descriptor.lowLabel, descriptor.highLabel]);

    return (
      <div className="group">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Icon className={`w-3 h-3 text-${color}-400`} />
            <span className="text-[10px] font-medium text-slate-300">{descriptor.shortLabel}</span>
            {lockedByVote && (
              <span title="Locked by vote">
                <Shield className="w-2.5 h-2.5 text-amber-400" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500">{modeLabel}</span>
            <span className={`text-[10px] font-mono text-${color}-400`}>{value}%</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="range"
            min={minAllowed}
            max={maxAllowed}
            value={value}
            onChange={handleChange}
            disabled={lockedByVote}
            aria-label={`${descriptor.label}: ${modeLabel}`}
            aria-valuemin={minAllowed}
            aria-valuemax={maxAllowed}
            aria-valuenow={value}
            aria-valuetext={`${value} percent, ${modeLabel}`}
            aria-describedby={`${axisKey}-description`}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer
            bg-gradient-to-r from-slate-700 via-${color}-500/30 to-${color}-500
            accent-${color}-500
            ${lockedByVote ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}
          `}
            style={{
              background: `linear-gradient(to right,
              rgb(51, 65, 85) 0%,
              var(--tw-gradient-stops)
            )`,
            }}
          />
          <span id={`${axisKey}-description`} className="sr-only">
            {descriptor.description}. Ranges from {descriptor.lowLabel} to {descriptor.highLabel}.
          </span>
          {/* Value indicator */}
          <div
            className={`absolute -top-1 w-3 h-3 rounded-full bg-${color}-500 border-2 border-slate-900 pointer-events-none transition-all`}
            style={{ left: `calc(${value}% - 6px)` }}
            aria-hidden="true"
          />
        </div>

        {/* Low/High labels */}
        <div className="flex justify-between mt-0.5" aria-hidden="true">
          <span className="text-[8px] text-slate-600">{descriptor.lowLabel}</span>
          <span className="text-[8px] text-slate-600">{descriptor.highLabel}</span>
        </div>
      </div>
    );
  }
);

AxisSlider.displayName = 'AxisSlider';

// =============================================================================
// STATIC CONSTANTS - Defined outside component to prevent recreation
// =============================================================================

const MODE_COLORS: Record<string, string> = {
  traditional: 'text-red-400 bg-red-500/20',
  transitional: 'text-amber-400 bg-amber-500/20',
  democratic: 'text-green-400 bg-green-500/20',
  educational: 'text-cyan-400 bg-cyan-500/20',
};

const PHASE_COLORS: Record<string, string> = {
  stable: 'text-green-400',
  approaching: 'text-amber-400',
  critical: 'text-orange-400',
  transitioning: 'text-purple-400',
  unstable: 'text-red-400',
};

const PRESET_KEYS = Object.keys(BAS_PRESETS) as (keyof typeof BAS_PRESETS)[];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const FiveAxesPanel: React.FC = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [showEducation, setShowEducation] = useState(false);

  // BAS Store
  const {
    mode,
    axes,
    axisConfigs,
    setAxis,
    getCurrentPresetName,
    applyPreset,
    getEffectiveAutonomy,
    getSuggestionMode,
  } = useBASStore(
    useShallow((state) => ({
      mode: state.mode,
      axes: state.axes,
      axisConfigs: state.axisConfigs,
      setAxis: state.setAxis,
      getCurrentPresetName: state.getCurrentPresetName,
      applyPreset: state.applyPreset,
      getEffectiveAutonomy: state.getEffectiveAutonomy,
      getSuggestionMode: state.getSuggestionMode,
    }))
  );

  // Stability Store
  const { phase, getStabilityPercentage } = useStabilityStore(
    useShallow((state) => ({
      phase: state.phase,
      getStabilityPercentage: state.getStabilityPercentage,
    }))
  );

  // Worker metrics for context
  const { averageTrust, productivityMultiplier } = useWorkerMoodStore(
    useShallow((state) => {
      const moods = Object.values(state.workerMoods);
      const withPrefs = moods.filter((m) => m?.preferences);
      const avgTrust =
        withPrefs.length > 0
          ? withPrefs.reduce((sum, m) => sum + (m?.preferences?.managementTrust || 0), 0) /
            withPrefs.length
          : 50;
      const prodMult = state.getWorkforceProductivityMultiplier();
      return { averageTrust: avgTrust, productivityMultiplier: prodMult };
    })
  );

  // Memoize derived values to prevent recalculation on every render
  const currentPreset = useMemo(() => getCurrentPresetName(), [getCurrentPresetName, axes]);
  const effectiveAutonomy = useMemo(() => getEffectiveAutonomy(), [getEffectiveAutonomy, axes]);
  const suggestionMode = useMemo(() => getSuggestionMode(), [getSuggestionMode, axes]);
  const stabilityPercent = useMemo(() => getStabilityPercentage(), [getStabilityPercentage]);

  // Memoize preset click handler
  const handlePresetClick = useCallback(
    (preset: keyof typeof BAS_PRESETS) => {
      applyPreset(preset);
      audioManager.playClick?.();
    },
    [applyPreset]
  );

  // Memoize axis keys for mapping
  const axisKeys = useMemo(() => Object.keys(axes) as AxisKey[], []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white">Bilateral Autonomy</span>
          <span
            className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded ${MODE_COLORS[mode]}`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Five Axes of Democratic AI Management</p>
      </div>

      {/* Quick Presets */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Sparkles className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] font-medium text-white">Quick Presets</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {PRESET_KEYS.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`px-2 py-1 rounded text-[9px] font-medium border transition-all hover:scale-105 ${
                currentPreset === preset
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 ring-1 ring-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700/30 hover:bg-slate-700/50'
              }`}
            >
              {BAS_PRESETS[preset].name}
            </button>
          ))}
        </div>
      </div>

      {/* Five Axes Sliders */}
      <div className="p-3 space-y-3 border-b border-slate-700/30">
        {axisKeys.map((axisKey) => (
          <AxisSlider
            key={axisKey}
            axisKey={axisKey}
            value={axes[axisKey]}
            onChange={(value) => setAxis(axisKey, value)}
            minAllowed={axisConfigs[axisKey].minAllowed}
            maxAllowed={axisConfigs[axisKey].maxAllowed}
            lockedByVote={axisConfigs[axisKey].lockedByVote}
          />
        ))}
      </div>

      {/* Key Metrics Summary */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Activity className={`w-3 h-3 mx-auto mb-0.5 ${PHASE_COLORS[phase]}`} />
            <div className="text-[10px] font-bold text-white">{stabilityPercent.toFixed(0)}%</div>
            <div className="text-[7px] text-slate-500">Stability</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Compass className="w-3 h-3 mx-auto mb-0.5 text-cyan-400" />
            <div className="text-[10px] font-bold text-white">{effectiveAutonomy.toFixed(0)}%</div>
            <div className="text-[7px] text-slate-500">Autonomy</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Scale
              className={`w-3 h-3 mx-auto mb-0.5 ${averageTrust >= 70 ? 'text-green-400' : averageTrust >= 50 ? 'text-amber-400' : 'text-red-400'}`}
            />
            <div className="text-[10px] font-bold text-white">{averageTrust.toFixed(0)}%</div>
            <div className="text-[7px] text-slate-500">Trust</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Zap
              className={`w-3 h-3 mx-auto mb-0.5 ${productivityMultiplier >= 1.1 ? 'text-green-400' : productivityMultiplier >= 1.0 ? 'text-blue-400' : 'text-red-400'}`}
            />
            <div className="text-[10px] font-bold text-white">
              {(productivityMultiplier * 100).toFixed(0)}%
            </div>
            <div className="text-[7px] text-slate-500">Output</div>
          </div>
        </div>
      </div>

      {/* AI Behavior Indicator */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">AI Suggestion Mode:</span>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded ${
              suggestionMode === 'silent'
                ? 'bg-slate-700/50 text-slate-300'
                : suggestionMode === 'available'
                  ? 'bg-blue-500/20 text-blue-300'
                  : suggestionMode === 'suggestive'
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'bg-red-500/20 text-red-300'
            }`}
          >
            {suggestionMode.charAt(0).toUpperCase() + suggestionMode.slice(1)}
          </span>
        </div>
        <p className="text-[8px] text-slate-500 mt-1">
          {suggestionMode === 'silent'
            ? 'AI only responds when asked'
            : suggestionMode === 'available'
              ? 'AI available for suggestions on request'
              : suggestionMode === 'suggestive'
                ? 'AI proactively offers suggestions'
                : 'AI provides directive guidance'}
        </p>
      </div>

      {/* Expandable Details Section */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="bas-axis-details"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" aria-hidden="true" />
            Axis Details
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
              id="bas-axis-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2">
                {AXIS_DESCRIPTORS.map((desc) => (
                  <div key={desc.key} className="bg-slate-800/30 rounded p-2">
                    <div className="flex items-center gap-1 mb-1">
                      {React.createElement(AXIS_ICONS[desc.key], {
                        className: `w-3 h-3 text-${desc.color}-400`,
                      })}
                      <span className="text-[10px] font-medium text-white">{desc.label}</span>
                      <span className={`ml-auto text-[10px] text-${desc.color}-400`}>
                        {axes[desc.key]}%
                      </span>
                    </div>
                    <p className="text-[8px] text-slate-400">{desc.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Educational Section */}
      <div className="p-3">
        <button
          onClick={() => setShowEducation(!showEducation)}
          aria-expanded={showEducation}
          aria-controls="bas-education-details"
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" aria-hidden="true" />
            About BAMS
          </span>
          {showEducation ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
        </button>

        <AnimatePresence>
          {showEducation && (
            <motion.div
              id="bas-education-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-cyan-400">Bilateral Alignment Management System (BAMS)</strong> is a
                  framework for democratic AI-human collaboration, inspired by Ricardo Semler&apos;s
                  radical workplace democracy and Mondragon&apos;s cooperative principles.
                </p>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="font-bold text-white mb-1">Value Formula: V = Z × S × E × F</div>
                  <ul className="space-y-0.5 text-slate-400">
                    <li>
                      <strong className="text-cyan-300">Z</strong> = Resources (Communication ×
                      Information × Material)
                    </li>
                    <li>
                      <strong className="text-green-300">S</strong> = Stability (must keep ατ &lt;
                      0.368)
                    </li>
                    <li>
                      <strong className="text-amber-300">E</strong> = Equity (fair distribution of
                      voice and benefit)
                    </li>
                    <li>
                      <strong className="text-pink-300">F</strong> = Flourishing (eudaimonia - human
                      flourishing)
                    </li>
                  </ul>
                </div>
                <p className="text-[8px] text-slate-500 italic">
                  Based on Wallace&apos;s Rate Distortion Control Theory and bilateral alignment
                  principles from Creed Space.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default FiveAxesPanel;
