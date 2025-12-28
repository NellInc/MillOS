import React, { useEffect, useState, useRef } from 'react';
import { Bot, Brain, TrendingUp, Target, Settings, Shield, Activity } from 'lucide-react';
import { AIDecision } from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useShallow } from 'zustand/react/shallow';
import { applyDecisionEffects, reactToAlert } from '../utils/aiEngine';
import { GeminiSettingsModal } from './GeminiSettingsModal';
import { ActionPlanTimeline } from './ui/ActionPlanTimeline';
import { DecisionHistoryPanel } from './ui/DecisionHistoryPanel';
import { StrategicPriorityCards } from './ui/StrategicPriorityCards';
import { VCLDebugPanel } from './ui/VCLDebugPanel';
import { VCLDiffPanel } from './ui/VCLDiffPanel';
import {
  getDecisionTypeIcon,
  getDecisionStatusIcon,
  getDecisionTypeColor,
  getDecisionPriorityBadge,
} from '../utils/decisionIcons';

interface AICommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

// Sparkline component for trend visualization
// Note: Currently unused but kept for future feature expansion

// Confidence adjustment indicator component
// Note: Currently unused but kept for future feature expansion

export const AICommandCenter: React.FC<AICommandCenterProps> = ({
  isOpen,
  onClose: _onClose,
  embedded = false,
}) => {
  const [isThinking, setIsThinking] = useState(false);
  const [activeTab, setActiveTab] = useState<'decisions' | 'strategic'>('decisions');

  // Track actual decision outcomes for real success rate calculation
  // Track actual decision outcomes for real success rate calculation
  const decisionOutcomesRef = useRef<{ successful: number; total: number }>({
    successful: 0,
    total: 0,
  });

  const [systemStatus, setSystemStatus] = useState({
    cpu: 15,
    memory: 35,
    decisions: 0,
    successRate: 0, // Start at 0, will be calculated from actual decisions
  });

  const lastAlertCountRef = useRef(0);

  const alertReactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get state from stores using useShallow to prevent unnecessary re-renders
  const {
    aiDecisions,
    machines: _machines,
    metrics,
    workerSatisfaction: _workerSatisfaction,
  } = useProductionStore(
    useShallow((state) => ({
      aiDecisions: state.aiDecisions,
      machines: state.machines,
      metrics: state.metrics,
      workerSatisfaction: state.workerSatisfaction,
    }))
  );

  const alerts = useUIStore((state) => state.alerts);

  const {
    weather,
    currentShift,
    gameTime: _gameTime,
    emergencyDrillMode,
  } = useGameSimulationStore(
    useShallow((state) => ({
      weather: state.weather,
      currentShift: state.currentShift,
      gameTime: state.gameTime,
      emergencyDrillMode: state.emergencyDrillMode,
    }))
  );

  // Gemini AI configuration
  const { aiMode, isGeminiConnected } = useAIConfigStore(
    useShallow((state) => ({
      aiMode: state.aiMode,
      isGeminiConnected: state.isGeminiConnected,
    }))
  );
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);

  // React to new alerts
  useEffect(() => {
    if (!isOpen) return;

    if (alerts.length > lastAlertCountRef.current) {
      const newAlert = alerts[0];
      if (newAlert && newAlert.machineId) {
        if (alertReactionTimeoutRef.current) clearTimeout(alertReactionTimeoutRef.current);
        alertReactionTimeoutRef.current = setTimeout(() => {
          const decision = reactToAlert(newAlert);
          if (decision) {
            applyDecisionEffects(decision);
            setSystemStatus((prev) => ({
              ...prev,
              decisions: prev.decisions + 1,
            }));
          }
        }, 1500);
      }
    }
    lastAlertCountRef.current = alerts.length;

    return () => {
      if (alertReactionTimeoutRef.current) {
        clearTimeout(alertReactionTimeoutRef.current);
        alertReactionTimeoutRef.current = null;
      }
    };
  }, [alerts, isOpen]);

  // Master interval removed - AI logic now runs in background via aiEngine.ts logic
  // This component now strictly visualizes the state

  // Force update when decisions change
  useEffect(() => {
    // Optional: add any side effects needed on decision updates
  }, [aiDecisions]);

  // Sync isThinking state from store
  const isTacticalThinking = useAIConfigStore((state) => state.isTacticalThinking);
  useEffect(() => {
    setIsThinking(isTacticalThinking);
  }, [isTacticalThinking]);

  // Update system status from store instead of local calculation
  const storeSystemStatus = useAIConfigStore((state) => state.systemStatus);
  useEffect(() => {
    // Sync store status to local state for display
    setSystemStatus((prev) => ({
      ...prev,
      cpu: storeSystemStatus.cpu,
      memory: storeSystemStatus.memory,
      decisions: storeSystemStatus.decisions,
    }));
  }, [storeSystemStatus]);

  // Calculate real success rate from actual decision outcomes
  useEffect(() => {
    // Count completed and successful decisions from the store
    const completedDecisions = aiDecisions.filter((d: AIDecision) => d.status === 'completed');

    // Track outcomes - successful if completed with positive outcome
    const successful = completedDecisions.filter(
      (d: AIDecision) =>
        d.outcome?.toLowerCase().includes('success') ||
        d.outcome?.toLowerCase().includes('resolved') ||
        d.outcome?.toLowerCase().includes('completed') ||
        d.outcome?.toLowerCase().includes('improved') ||
        !d.outcome // No outcome recorded = assumed success
    ).length;

    decisionOutcomesRef.current = {
      successful,
      total: completedDecisions.length,
    };
  }, [aiDecisions]);

  // Decision icon/color functions now imported from utils/decisionIcons

  // Weather icon helper - kept for future UI expansion

  // Time formatter - kept for future UI expansion

  if (!isOpen) return null;

  // Embedded mode: render content without fixed wrapper for use inside ContextSidebar
  if (embedded) {
    return (
      <>
        <div className="h-full flex flex-col bg-transparent">
          {/* Compact Header for embedded mode */}
          <div className="p-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-2">
              <Brain className="w-5 h-5" />
              <span className="font-bold text-sm">AI Engine</span>
              {/* Fixed width container prevents layout jitter */}
              <span className={`text-xs ml-1 w-16 ${isThinking ? 'animate-pulse' : 'invisible'}`}>
                analyzing...
              </span>
              {/* Gemini Settings Button */}
              <button
                onClick={() => setShowGeminiSettings(true)}
                className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
                title={
                  aiMode === 'gemini'
                    ? 'Gemini AI Active - Click to configure'
                    : aiMode === 'hybrid'
                      ? 'Hybrid Mode Active - Click to configure'
                      : 'Heuristic Mode - Click to configure Gemini'
                }
              >
                {aiMode === 'gemini' && isGeminiConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-green-400 font-medium">Gemini</span>
                  </>
                ) : aiMode === 'hybrid' && isGeminiConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-[10px] text-purple-400 font-medium">Hybrid</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] text-amber-400 font-medium">Heuristic</span>
                  </>
                )}
                <Settings className="w-3 h-3 text-slate-400" />
              </button>
            </div>
            {/* System Status - compact */}
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-500">CPU</span>
                <span className="text-cyan-400 ml-1">{systemStatus.cpu.toFixed(0)}%</span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-500">MEM</span>
                <span className="text-green-400 ml-1">{systemStatus.memory.toFixed(0)}%</span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-500">DEC</span>
                <span className="text-purple-400 ml-1">{systemStatus.decisions}</span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                {(aiMode === 'gemini' || aiMode === 'hybrid') && isGeminiConnected ? (
                  <>
                    <span className="text-slate-500">$</span>
                    <span className="text-emerald-400 ml-1">
                      {useAIConfigStore.getState().getFormattedCost()}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">$</span>
                    <span className="text-emerald-400 ml-1">FREE</span>
                  </>
                )}
              </div>
            </div>
            {/* Emergency Drill Banner */}
            {emergencyDrillMode && (
              <div className="mt-2 px-2 py-1.5 bg-red-500/20 rounded-lg border border-red-500/30 animate-pulse">
                <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold">
                  <Shield className="w-3 h-3" />
                  EMERGENCY DRILL IN PROGRESS
                </div>
              </div>
            )}
            {/* Context: Weather & Shift */}
            <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
              <span className="capitalize">
                {weather} | {currentShift} shift
              </span>
              <span>Eff: {metrics.efficiency.toFixed(0)}%</span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="px-3 py-2 border-b border-slate-800 flex gap-2">
            <button
              onClick={() => setActiveTab('decisions')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'decisions'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3 h-3 inline mr-1" />
              Decisions ({aiDecisions.length})
            </button>

            <button
              onClick={() => setActiveTab('strategic')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'strategic'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Target className="w-3 h-3 inline mr-1" />
              Strategic
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab === 'decisions' ? (
              <>
                {aiDecisions.slice(0, 15).map((decision: AIDecision) => (
                  <div
                    key={decision.id}
                    className={`bg-slate-800/50 rounded-lg border p-2 ${
                      decision.status === 'completed'
                        ? 'border-green-500/20'
                        : decision.status === 'in_progress'
                          ? 'border-blue-500/30'
                          : 'border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`p-1 rounded bg-gradient-to-br ${getDecisionTypeColor(decision.type)}`}
                      >
                        {getDecisionTypeIcon(decision.type, 'lg')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400 uppercase">
                            {decision.type}
                          </span>
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded border ${getDecisionPriorityBadge(decision.priority)}`}
                          >
                            {decision.priority}
                          </span>
                          <div className="flex items-center gap-1 ml-auto">
                            {getDecisionStatusIcon(decision.status, 'xs')}
                          </div>
                        </div>
                        <p className="text-xs text-white font-medium">{decision.action}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{decision.reasoning}</p>
                        <div className="flex items-center gap-2 text-[9px] text-green-400 mt-1">
                          <TrendingUp className="w-2.5 h-2.5" />
                          <span>{decision.impact}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {aiDecisions.length === 0 && (
                  <div className="text-center py-6 text-slate-500">
                    <Bot className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-xs">AI analyzing factory state...</p>
                  </div>
                )}
              </>
            ) : (
              /* Strategic Tab Content */
              <div className="space-y-3">
                <VCLDebugPanel />
                <StrategicPriorityCards />
                <ActionPlanTimeline />
                <DecisionHistoryPanel />
                <VCLDiffPanel />
              </div>
            )}
          </div>
        </div>
        {/* Gemini Settings Modal - rendered for embedded mode */}
        <GeminiSettingsModal
          isOpen={showGeminiSettings}
          onClose={() => setShowGeminiSettings(false)}
        />
      </>
    );
  }

  // NOTE: Standalone mode removed - all access is via embedded mode in ContextSidebar
  // The embedded={true} prop is always passed, so we never reach here
  return null;
};
