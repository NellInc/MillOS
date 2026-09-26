import React, { useEffect, useState, useRef } from 'react';
import {
  Bot,
  Brain,
  TrendingUp,
  Target,
  Settings,
  Shield,
  Activity,
  Eye,
  CheckCircle2,
  Clock3,
  XCircle,
} from 'lucide-react';
import { AIDecision } from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useShallow } from 'zustand/react/shallow';
import { applyDecisionEffects, reactToAlert } from '../utils/aiEngine';
import { GeminiSettingsModal } from './GeminiSettingsModal';
import { JevAdvisoryPanel } from './ui/JevAdvisoryPanel';
import { ActionPlanTimeline } from './ui/ActionPlanTimeline';
import { DecisionHistoryPanel } from './ui/DecisionHistoryPanel';
import { StrategicPriorityCards } from './ui/StrategicPriorityCards';
import { VCLDebugPanel } from './ui/VCLDebugPanel';
import { VCLDiffPanel } from './ui/VCLDiffPanel';
import { DecisionReplay } from './ui/DecisionReplay';
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
  const [activeTab, setActiveTab] = useState<'decisions' | 'strategic' | 'advisory'>('decisions');
  const [selectedDecision, setSelectedDecision] = useState<AIDecision | null>(null);

  const [systemStatus, setSystemStatus] = useState({
    cpu: 15,
    memory: 35,
    decisions: 0,
  });
  // Subscribed, not read imperatively, so the readout follows trackAPICost.
  const formattedSessionCost = useAIConfigStore((state) => state.getFormattedCost());

  // Alert ids already accounted for. Tracking ids rather than the list length
  // keeps reactions firing once uiStore's alert list reaches its 10-item cap,
  // and dismissing the newest alert never re-triggers an older one.
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const alertReactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get state from stores using useShallow to prevent unnecessary re-renders
  const {
    aiDecisions,
    machines: _machines,
    metrics,
    recordDecisionResponse,
  } = useProductionStore(
    useShallow((state) => ({
      aiDecisions: state.aiDecisions,
      machines: state.machines,
      metrics: state.metrics,
      recordDecisionResponse: state.recordDecisionResponse,
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

  // AI backend configuration (Gemini API or local WebGPU neural core)
  const { aiMode, isGeminiConnected, llmBackend, webgpuModelReady } = useAIConfigStore(
    useShallow((state) => ({
      aiMode: state.aiMode,
      isGeminiConnected: state.isGeminiConnected,
      llmBackend: state.llmBackend,
      webgpuModelReady: state.webgpuModelReady,
    }))
  );
  // The ACTIVE backend's readiness drives the badges — not "either backend".
  // (Gemini connected while backend=webgpu-not-loaded must NOT read as ready.)
  const isLocalBackend = llmBackend === 'webgpu';
  const llmReady = isLocalBackend ? webgpuModelReady : isGeminiConnected;
  // Mirrors the badge text below so the settings button's name contains it.
  const modeLabel =
    aiMode === 'gemini' && llmReady
      ? isLocalBackend
        ? 'Local'
        : 'Gemini'
      : aiMode === 'hybrid' && llmReady
        ? 'Hybrid'
        : 'Heuristic';
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);

  // React to new alerts
  useEffect(() => {
    if (!isOpen) return;

    const newAlert = alerts[0];
    if (newAlert?.machineId && !seenAlertIdsRef.current.has(newAlert.id)) {
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
    seenAlertIdsRef.current = new Set(alerts.map((alert) => alert.id));

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

  // The tactical pass flips its flag within one synchronous task, so on its own
  // it never renders; the slow async strategic call is what the player waits on.
  const isTacticalThinking = useAIConfigStore((state) => state.isTacticalThinking);
  const isStrategicThinking = useAIConfigStore((state) => state.strategic?.isThinking ?? false);
  const isThinking = isTacticalThinking || isStrategicThinking;

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

  // Decision icon/color functions now imported from utils/decisionIcons

  // Weather icon helper - kept for future UI expansion

  // Time formatter - kept for future UI expansion

  if (!isOpen) return null;

  // Embedded mode: render content without fixed wrapper for use inside ContextSidebar
  if (embedded) {
    return (
      <>
        <div className="h-full flex flex-col bg-transparent" data-testid="ai-command-center">
          {/* Compact Header for embedded mode */}
          <div className="p-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 mb-2">
              <Brain className="w-5 h-5" aria-hidden="true" />
              <span className="font-bold text-sm">AI Partner</span>
              {/* Fixed width container prevents layout jitter */}
              <span
                className={`text-xs ml-1 w-16 ${isThinking ? 'motion-safe:animate-pulse' : 'invisible'}`}
              >
                reviewing...
              </span>
              {/* Gemini Settings Button */}
              <button
                onClick={() => setShowGeminiSettings(true)}
                aria-label={`AI settings, current mode: ${modeLabel}`}
                className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
                title={
                  aiMode === 'gemini'
                    ? `${isLocalBackend ? 'Local AI' : 'Gemini AI'} Active - Click to configure`
                    : aiMode === 'hybrid'
                      ? 'Hybrid Mode Active - Click to configure'
                      : 'Heuristic Mode - Click to configure AI backend'
                }
              >
                {aiMode === 'gemini' && llmReady ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-green-400 font-medium">
                      {isLocalBackend ? 'Local' : 'Gemini'}
                    </span>
                  </>
                ) : aiMode === 'hybrid' && llmReady ? (
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
                <Settings className="w-3 h-3 text-slate-400" aria-hidden="true" />
              </button>
            </div>
            {/* System Status - compact */}
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-400">CPU</span>
                <span className="text-cyan-400 ml-1" data-testid="ai-cpu-value">
                  {systemStatus.cpu.toFixed(0)}%
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-400">MEM</span>
                <span className="text-green-400 ml-1" data-testid="ai-memory-value">
                  {systemStatus.memory.toFixed(0)}%
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-400">DEC</span>
                <span className="text-purple-400 ml-1" data-testid="ai-decisions-count">
                  {systemStatus.decisions}
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                {(aiMode === 'gemini' || aiMode === 'hybrid') &&
                !isLocalBackend &&
                isGeminiConnected ? (
                  <>
                    <span className="text-slate-400">$</span>
                    <span className="text-emerald-400 ml-1">{formattedSessionCost}</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-400">$</span>
                    {/* Local WebGPU inference and heuristic mode are both free. */}
                    <span className="text-emerald-400 ml-1">FREE</span>
                  </>
                )}
              </div>
            </div>
            {/* Emergency Drill Banner */}
            {emergencyDrillMode && (
              <div className="mt-2 px-2 py-1.5 bg-red-500/20 rounded-lg border border-red-500/30 motion-safe:animate-pulse">
                <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold">
                  <Shield className="w-3 h-3" aria-hidden="true" />
                  EGRESS DRILL IN PROGRESS
                </div>
              </div>
            )}
            {/* Context: Weather & Shift */}
            <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400">
              <span className="capitalize">
                {weather} | {currentShift} run window
              </span>
              <span>Eff: {metrics.efficiency.toFixed(0)}%</span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div
            role="tablist"
            aria-label="AI Partner views"
            className="px-3 py-2 border-b border-slate-800 flex gap-2"
          >
            <button
              role="tab"
              id="ai-decisions-tab"
              aria-selected={activeTab === 'decisions'}
              aria-controls="ai-command-tabpanel"
              onClick={() => setActiveTab('decisions')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'decisions'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Decisions ({aiDecisions.length})
            </button>

            <button
              role="tab"
              id="ai-strategic-tab"
              aria-selected={activeTab === 'strategic'}
              aria-controls="ai-command-tabpanel"
              onClick={() => setActiveTab('strategic')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'strategic'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Target className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Strategic
            </button>
            <button
              role="tab"
              id="ai-advisory-tab"
              aria-selected={activeTab === 'advisory'}
              aria-controls="ai-command-tabpanel"
              onClick={() => setActiveTab('advisory')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'advisory'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Shield className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Advisory
            </button>
          </div>

          {/* Screen-reader-only live region announcing the newest AI decision */}
          <div className="sr-only" role="status" aria-live="polite">
            {aiDecisions[0]?.action ? `New AI decision: ${aiDecisions[0].action}` : ''}
          </div>

          {/* Content Area */}
          <div
            id="ai-command-tabpanel"
            role="tabpanel"
            aria-labelledby={`ai-${activeTab}-tab`}
            className="flex-1 overflow-y-auto p-3 space-y-2"
          >
            {activeTab === 'advisory' ? (
              <JevAdvisoryPanel
                latestAlert={alerts[0] ? `${alerts[0].title}\n${alerts[0].message}` : undefined}
              />
            ) : activeTab === 'decisions' ? (
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
                        {decision.response && (
                          <p className="mt-1 text-[9px] capitalize text-slate-400">
                            Response: {decision.response.disposition}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedDecision(decision)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-md bg-slate-900/70 px-2 text-[9px] text-cyan-300 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            Inspect evidence
                          </button>
                          {decision.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => applyDecisionEffects(decision, 'accepted')}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-[9px] text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                              >
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => recordDecisionResponse(decision.id, 'deferred')}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md bg-amber-500/15 px-2 text-[9px] text-amber-300 transition-colors hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                              >
                                <Clock3 className="h-3 w-3" aria-hidden="true" />
                                Defer
                              </button>
                              <button
                                type="button"
                                onClick={() => recordDecisionResponse(decision.id, 'rejected')}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md bg-red-500/15 px-2 text-[9px] text-red-300 transition-colors hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                              >
                                <XCircle className="h-3 w-3" aria-hidden="true" />
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {aiDecisions.length > 15 && (
                  <p className="text-center text-[10px] text-slate-500 py-1" role="status">
                    Showing 15 of {aiDecisions.length} decisions
                  </p>
                )}
                {aiDecisions.length === 0 && (
                  <div className="text-center py-6 text-slate-500">
                    <Bot className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-xs">No recommendations have been recorded.</p>
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
        <DecisionReplay decision={selectedDecision} onClose={() => setSelectedDecision(null)} />
      </>
    );
  }

  // NOTE: Standalone mode removed - all access is via embedded mode in ContextSidebar
  // The embedded={true} prop is always passed, so we never reach here
  return null;
};
