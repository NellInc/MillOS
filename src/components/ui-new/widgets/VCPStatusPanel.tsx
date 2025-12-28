/**
 * VCP Status Panel - Value Coordination Protocol Monitor
 *
 * Displays the current state of VCP 2.0 for debugging and observability:
 * - Encoded VCP state (compact view)
 * - Reasoning scaffolds (focus, recommendations)
 * - Learning memory (patterns, hypotheses)
 * - Healing signals (anomalies, health)
 * - Decision tracking
 */

import React, { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  HeartPulse,
  Lightbulb,
  BookOpen,
  Shield,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  Eye,
  Code,
  Sparkles,
  Target,
  Clock,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  encodeVCPMessage,
  usePatternStore,
  useOutcomeTracker,
  useHypothesisEngine,
  useHealingStore,
  calculateSystemHealth,
} from '../../../protocols/vcp';
import { generateVCPMessage } from '../../../protocols/vcp/integration';

// =============================================================================
// SECTION COMPONENTS
// =============================================================================

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value?: string | number;
  color?: string;
  expanded: boolean;
  onToggle: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = memo(
  ({ icon: Icon, title, value, color = 'text-blue-400', expanded, onToggle }) => (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded-lg hover:bg-slate-800/80 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-medium text-slate-200">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {value !== undefined && <span className={`text-sm font-mono ${color}`}>{value}</span>}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </div>
    </button>
  )
);
SectionHeader.displayName = 'SectionHeader';

// =============================================================================
// ENCODED STATE SECTION
// =============================================================================

const EncodedStateSection: React.FC<{ encoded: string }> = memo(({ encoded }) => (
  <div className="px-3 py-2 bg-slate-900/50 rounded-lg mt-1 mb-2">
    <div className="font-mono text-xs text-green-400 break-all leading-relaxed">{encoded}</div>
    <div className="mt-2 flex gap-2 text-xs text-slate-500">
      <span>Length: {encoded.length} chars</span>
      <span>|</span>
      <span>Layers: 6</span>
    </div>
  </div>
));
EncodedStateSection.displayName = 'EncodedStateSection';

// =============================================================================
// REASONING SECTION
// =============================================================================

interface ReasoningSectionProps {
  primaryFocus: string;
  recommendation: string;
  confidence: number;
  ethicalFrame: string;
}

const ReasoningSection: React.FC<ReasoningSectionProps> = memo(
  ({ primaryFocus, recommendation, confidence, ethicalFrame }) => (
    <div className="px-3 py-2 space-y-2 mt-1 mb-2">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-purple-400" />
        <span className="text-xs text-slate-400">Primary Focus:</span>
        <span className="text-sm font-medium text-purple-300 capitalize">{primaryFocus}</span>
      </div>

      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-400" />
        <span className="text-xs text-slate-400">Ethical Frame:</span>
        <span className="text-sm text-blue-300 capitalize">{ethicalFrame}</span>
      </div>

      <div className="bg-slate-900/50 rounded-lg p-2">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-400">Recommendation</span>
          <span className="ml-auto text-xs font-medium text-emerald-400">
            {(confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{recommendation}</p>
      </div>
    </div>
  )
);
ReasoningSection.displayName = 'ReasoningSection';

// =============================================================================
// LEARNING SECTION
// =============================================================================

interface LearningSectionProps {
  patternCount: number;
  currentMatch: string | null;
  hypothesisCount: number;
  learningConfidence: number;
  recentOutcomes: number;
}

const LearningSection: React.FC<LearningSectionProps> = memo(
  ({ patternCount, currentMatch, hypothesisCount, learningConfidence, recentOutcomes }) => (
    <div className="px-3 py-2 space-y-2 mt-1 mb-2">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/50 rounded p-2">
          <div className="text-slate-400">Patterns</div>
          <div className="text-lg font-medium text-cyan-400">{patternCount}</div>
        </div>
        <div className="bg-slate-900/50 rounded p-2">
          <div className="text-slate-400">Hypotheses</div>
          <div className="text-lg font-medium text-purple-400">{hypothesisCount}</div>
        </div>
        <div className="bg-slate-900/50 rounded p-2">
          <div className="text-slate-400">Outcomes</div>
          <div className="text-lg font-medium text-emerald-400">{recentOutcomes}</div>
        </div>
        <div className="bg-slate-900/50 rounded p-2">
          <div className="text-slate-400">Confidence</div>
          <div className="text-lg font-medium text-amber-400">
            {(learningConfidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {currentMatch && (
        <div className="flex items-center gap-2 bg-cyan-900/30 rounded p-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-slate-400">Active Pattern:</span>
          <span className="text-sm text-cyan-300 truncate">{currentMatch}</span>
        </div>
      )}
    </div>
  )
);
LearningSection.displayName = 'LearningSection';

// =============================================================================
// HEALING SECTION
// =============================================================================

interface HealingSectionProps {
  health: number;
  anomalyCount: number;
  activeInterventions: number;
  preventiveAlerts: number;
}

const HealingSection: React.FC<HealingSectionProps> = memo(
  ({ health, anomalyCount, activeInterventions, preventiveAlerts }) => {
    const healthColor =
      health >= 80 ? 'text-emerald-400' : health >= 50 ? 'text-amber-400' : 'text-red-400';
    const healthBg = health >= 80 ? 'bg-emerald-500' : health >= 50 ? 'bg-amber-500' : 'bg-red-500';

    return (
      <div className="px-3 py-2 space-y-2 mt-1 mb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-slate-400 mb-1">System Health</div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${healthBg} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${health}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
          <div className={`text-xl font-bold ${healthColor}`}>{health.toFixed(0)}%</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div
            className={`bg-slate-900/50 rounded p-2 ${anomalyCount > 0 ? 'border border-amber-500/30' : ''}`}
          >
            <div className="flex items-center gap-1 text-slate-400">
              <AlertTriangle className={`w-3 h-3 ${anomalyCount > 0 ? 'text-amber-400' : ''}`} />
              Anomalies
            </div>
            <div
              className={`text-lg font-medium ${anomalyCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}
            >
              {anomalyCount}
            </div>
          </div>
          <div
            className={`bg-slate-900/50 rounded p-2 ${activeInterventions > 0 ? 'border border-cyan-500/30' : ''}`}
          >
            <div className="flex items-center gap-1 text-slate-400">
              <Zap className={`w-3 h-3 ${activeInterventions > 0 ? 'text-cyan-400' : ''}`} />
              Active
            </div>
            <div
              className={`text-lg font-medium ${activeInterventions > 0 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              {activeInterventions}
            </div>
          </div>
          <div
            className={`bg-slate-900/50 rounded p-2 ${preventiveAlerts > 0 ? 'border border-purple-500/30' : ''}`}
          >
            <div className="flex items-center gap-1 text-slate-400">
              <Eye className={`w-3 h-3 ${preventiveAlerts > 0 ? 'text-purple-400' : ''}`} />
              Preventive
            </div>
            <div
              className={`text-lg font-medium ${preventiveAlerts > 0 ? 'text-purple-400' : 'text-slate-500'}`}
            >
              {preventiveAlerts}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
HealingSection.displayName = 'HealingSection';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface VCPStatusPanelProps {
  className?: string;
  compact?: boolean;
}

export const VCPStatusPanel: React.FC<VCPStatusPanelProps> = memo(
  ({ className = '', compact = false }) => {
    // Section expansion state
    const [expandedSections, setExpandedSections] = useState({
      encoded: false,
      reasoning: true,
      learning: false,
      healing: true,
    });

    const toggleSection = useCallback((section: keyof typeof expandedSections) => {
      setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    }, []);

    // Get VCP data
    const vcpMessage = useMemo(() => {
      try {
        return generateVCPMessage();
      } catch {
        return null;
      }
    }, []);

    const encoded = useMemo(() => {
      if (!vcpMessage) return { full: 'VCP not initialized' };
      try {
        return encodeVCPMessage(vcpMessage);
      } catch {
        return { full: 'Encoding error' };
      }
    }, [vcpMessage]);

    // Get store data
    const patternState = usePatternStore(
      useShallow((s) => ({
        patternCount: s.patterns.length,
        currentMatch: s.currentMatch?.patternId || null,
      }))
    );

    const outcomeState = useOutcomeTracker(
      useShallow((s) => ({
        recentOutcomes: s.getRecentOutcomes(10).length,
        learningConfidence: s.getAverageAccuracy(),
      }))
    );

    const hypothesisState = useHypothesisEngine(
      useShallow((s) => ({
        hypothesisCount: s.hypotheses.length,
      }))
    );

    const healingState = useHealingStore(
      useShallow((s) => ({
        anomalyCount: s.signals?.anomalies?.length ?? 0,
        activeInterventions: s.signals?.activeInterventions?.length ?? 0,
        preventiveAlerts: s.signals?.preventiveAlerts?.length ?? 0,
        health: calculateSystemHealth(s.signals),
      }))
    );

    // Derive reasoning data
    const reasoning = useMemo(
      () => ({
        primaryFocus: vcpMessage?.reasoning?.primaryFocus || 'wellbeing',
        recommendation: vcpMessage?.reasoning?.tactical?.immediateGoal || 'Analyzing...',
        confidence: 0.8, // Default confidence score
        ethicalFrame: vcpMessage?.reasoning?.moral?.ethicalFrame || 'care',
      }),
      [vcpMessage]
    );

    if (compact) {
      return (
        <div
          className={`bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-700/50 p-3 ${className}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-slate-200">VCP 2.0</span>
            <span
              className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                healingState.health >= 80
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : healingState.health >= 50
                    ? 'bg-amber-900/50 text-amber-400'
                    : 'bg-red-900/50 text-red-400'
              }`}
            >
              {healingState.health.toFixed(0)}% healthy
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Focus: <span className="text-purple-300 capitalize">{reasoning.primaryFocus}</span>
            {' | '}
            Patterns: <span className="text-cyan-300">{patternState.patternCount}</span>
            {healingState.anomalyCount > 0 && (
              <>
                {' | '}
                <span className="text-amber-400">{healingState.anomalyCount} anomalies</span>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`bg-slate-900/90 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700/50">
          <Brain className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-slate-200">VCP 2.0 Status</span>
          <span className="ml-auto text-xs text-slate-500">Value Coordination Protocol</span>
        </div>

        {/* Content */}
        <div className="p-2 space-y-1">
          {/* Encoded State */}
          <SectionHeader
            icon={Code}
            title="Encoded State"
            value={`${encoded.full.length} chars`}
            color="text-green-400"
            expanded={expandedSections.encoded}
            onToggle={() => toggleSection('encoded')}
          />
          <AnimatePresence>
            {expandedSections.encoded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <EncodedStateSection encoded={encoded.full} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reasoning Scaffolds */}
          <SectionHeader
            icon={Lightbulb}
            title="Reasoning"
            value={reasoning.primaryFocus}
            color="text-purple-400"
            expanded={expandedSections.reasoning}
            onToggle={() => toggleSection('reasoning')}
          />
          <AnimatePresence>
            {expandedSections.reasoning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <ReasoningSection {...reasoning} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Learning Memory */}
          <SectionHeader
            icon={BookOpen}
            title="Learning"
            value={`${patternState.patternCount} patterns`}
            color="text-cyan-400"
            expanded={expandedSections.learning}
            onToggle={() => toggleSection('learning')}
          />
          <AnimatePresence>
            {expandedSections.learning && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <LearningSection
                  patternCount={patternState.patternCount}
                  currentMatch={patternState.currentMatch}
                  hypothesisCount={hypothesisState.hypothesisCount}
                  learningConfidence={outcomeState.learningConfidence}
                  recentOutcomes={outcomeState.recentOutcomes}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Healing Signals */}
          <SectionHeader
            icon={HeartPulse}
            title="System Health"
            value={`${healingState.health.toFixed(0)}%`}
            color={
              healingState.health >= 80
                ? 'text-emerald-400'
                : healingState.health >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
            }
            expanded={expandedSections.healing}
            onToggle={() => toggleSection('healing')}
          />
          <AnimatePresence>
            {expandedSections.healing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <HealingSection
                  health={healingState.health}
                  anomalyCount={healingState.anomalyCount}
                  activeInterventions={healingState.activeInterventions}
                  preventiveAlerts={healingState.preventiveAlerts}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-700/50 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          <span>
            Last update: {new Date(vcpMessage?.generatedAt || Date.now()).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }
);

VCPStatusPanel.displayName = 'VCPStatusPanel';

export default VCPStatusPanel;
