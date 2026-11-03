import React, { useEffect, useState } from 'react';
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
import { CLOUD_MODELS } from '../utils/cloudAIClient';
import { useShallow } from 'zustand/react/shallow';
import { applyDecisionEffects, decisionCardText, isDeferralReturned } from '../utils/aiEngine';
import { AISettingsModal } from './AISettingsModal';
import { JevAdvisoryPanel } from './ui/JevAdvisoryPanel';
import { OnDeviceOperatorRecord } from './ui/OnDeviceOperatorRecord';
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
import { capitalizeIn, formatFixed, useLocale, useT } from '../i18n';
import { alertText } from '../i18n/alertCopy';
import { aiCommandCenterMessages } from './AICommandCenter.messages';

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
  const t = useT(aiCommandCenterMessages);
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<'decisions' | 'strategic' | 'advisory'>('decisions');
  const [selectedDecision, setSelectedDecision] = useState<AIDecision | null>(null);

  const [systemStatus, setSystemStatus] = useState({
    cpu: 15,
    memory: 35,
    decisions: 0,
  });
  // Subscribed, not read imperatively, so the readout follows BYOK usage settlement.
  const formattedSessionCost = useAIConfigStore((state) => state.getFormattedCost());
  // Paid advisories bill the player's key whatever strategy runs on, so any
  // billed request this session shows the estimate instead of "no API cost".
  const billedThisSession = useAIConfigStore(
    (state) =>
      state.costTracking.requestCount > 0 ||
      state.costTracking.reservedCost > 0 ||
      state.costTracking.uncertainCost > 0
  );

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

  // AI backend configuration (cloud BYOK or local WebGPU neural core)
  const { aiMode, connectedProviders, llmBackend, webgpuModelReady, chatgptStatus } =
    useAIConfigStore(
      useShallow((state) => ({
        aiMode: state.aiMode,
        connectedProviders: state.connectedProviders,
        llmBackend: state.llmBackend,
        webgpuModelReady: state.webgpuModelReady,
        chatgptStatus: state.chatgptStatus,
      }))
    );
  // The ACTIVE backend's readiness drives the badges — not "either backend".
  // A key for a different cloud backend must not read as ready.
  const isLocalBackend = llmBackend === 'webgpu';
  const cloudLabel =
    llmBackend === 'webgpu'
      ? null
      : llmBackend === 'chatgpt'
        ? t('chatgptPlan')
        : CLOUD_MODELS[llmBackend].label;
  const llmReady =
    llmBackend === 'webgpu'
      ? webgpuModelReady
      : llmBackend === 'chatgpt'
        ? Boolean(
            chatgptStatus?.accounts.some(
              (account) =>
                account.id === chatgptStatus.activeId && account.signedIn && account.model
            )
          )
        : (connectedProviders?.[llmBackend] ?? false);
  // Mirrors the badge text below so the settings button's name contains it.
  const modeLabel =
    aiMode === 'gemini' && llmReady
      ? isLocalBackend
        ? t('modeLocal')
        : cloudLabel
      : aiMode === 'hybrid' && llmReady
        ? t('modeHybrid')
        : t('modeHeuristic');
  const [showAISettings, setShowAISettings] = useState(false);

  // Accept and Reject remove the pressed button with the card's pending state.
  // Focus then moves to that card's Inspect button instead of the page body,
  // unless the player has already moved it somewhere else.
  const [refocusDecisionId, setRefocusDecisionId] = useState<string | null>(null);
  useEffect(() => {
    if (!refocusDecisionId) return;
    const decision = aiDecisions.find((item) => item.id === refocusDecisionId);
    // Defer leaves the card pending but takes its own button away.
    if (decision?.status === 'pending' && decision.response?.disposition !== 'deferred') return;
    setRefocusDecisionId(null);
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    (
      document.getElementById(`ai-inspect-${refocusDecisionId}`) ??
      document.getElementById('ai-command-tabpanel')
    )?.focus();
  }, [aiDecisions, refocusDecisionId]);

  // Alert reactions run in the engine (aiEngine initializeAlertReactions), panel
  // open or not, so opening or closing this panel never adds or cancels one.

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

  // Cards still waiting for an answer are listed first (a deferred card the
  // engine has handed back ahead of the rest), as on the phone sheet: nothing
  // else offers an answer, so newer settled cards must not push one off the 15.
  const returnedDeferrals = aiDecisions.filter(
    (decision) =>
      decision.status === 'pending' &&
      decision.response?.disposition === 'deferred' &&
      isDeferralReturned(decision.id)
  );
  const listedDecisions = [
    ...returnedDeferrals,
    ...aiDecisions.filter(
      (decision) => decision.status === 'pending' && !returnedDeferrals.includes(decision)
    ),
    ...aiDecisions.filter((decision) => decision.status !== 'pending'),
  ].slice(0, 15);

  // `locale` re-renders this on a switch, so keyed copy is resolved afresh.
  const latestAlert = alerts[0] ? alertText(alerts[0]) : null;

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
              <span className="font-bold text-sm">{t('title')}</span>
              {/* Fixed width container prevents layout jitter */}
              <span
                className={`text-xs ml-1 w-16 ${isThinking ? 'motion-safe:animate-pulse' : 'invisible'}`}
              >
                {t('reviewing')}
              </span>
              {/* AI Settings Button */}
              <button
                onClick={() => setShowAISettings(true)}
                aria-label={t('settingsLabel', { mode: String(modeLabel) })}
                className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
                title={
                  aiMode === 'gemini'
                    ? isLocalBackend
                      ? t('settingsTitleLocal')
                      : t('settingsTitleCloud', { label: String(cloudLabel) })
                    : aiMode === 'hybrid'
                      ? t('settingsTitleHybrid')
                      : t('settingsTitleHeuristic')
                }
              >
                {aiMode === 'gemini' && llmReady ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-green-400 font-medium">
                      {isLocalBackend ? t('modeLocal') : cloudLabel}
                    </span>
                  </>
                ) : aiMode === 'hybrid' && llmReady ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-[10px] text-purple-400 font-medium">
                      {t('modeHybrid')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] text-amber-400 font-medium">
                      {t('modeHeuristic')}
                    </span>
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
                  {formatFixed(systemStatus.cpu, 0)}%
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-400">MEM</span>
                <span className="text-green-400 ml-1" data-testid="ai-memory-value">
                  {formatFixed(systemStatus.memory, 0)}%
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                <span className="text-slate-400">DEC</span>
                <span className="text-purple-400 ml-1" data-testid="ai-decisions-count">
                  {formatFixed(systemStatus.decisions, 0)}
                </span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-1">
                {billedThisSession ||
                ((aiMode === 'gemini' || aiMode === 'hybrid') && !isLocalBackend && llmReady) ? (
                  <>
                    <span className="text-emerald-400">
                      {t('sessionCost', { cost: formattedSessionCost })}
                    </span>
                  </>
                ) : (
                  <>
                    {/* Nothing billed this session: local or rules-only strategy, no paid advisory. */}
                    <span className="text-emerald-400">{t('noApiCost')}</span>
                  </>
                )}
              </div>
            </div>
            {/* Emergency Drill Banner */}
            {emergencyDrillMode && (
              <div className="mt-2 px-2 py-1.5 bg-red-500/20 rounded-lg border border-red-500/30 motion-safe:animate-pulse">
                <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold">
                  <Shield className="w-3 h-3" aria-hidden="true" />
                  {t('egressDrill')}
                </div>
              </div>
            )}
            {/* Context: Weather & Shift */}
            <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400">
              <span className={capitalizeIn(locale)}>
                {t('weather', { value: weather })} | {t('runWindow', { value: currentShift })}
              </span>
              <span>{t('efficiency', { value: formatFixed(metrics.efficiency, 0) })}</span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div
            role="tablist"
            aria-label={t('tabsLabel')}
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
              {t('tabDecisions', { count: formatFixed(aiDecisions.length, 0) })}
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
              {t('tabStrategic')}
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
              {t('tabAdvisory')}
            </button>
          </div>

          {/* Screen-reader-only live region announcing the newest AI decision */}
          <div className="sr-only" role="status" aria-live="polite">
            {aiDecisions[0]?.action
              ? t('newDecision', { action: decisionCardText(aiDecisions[0], locale).action })
              : ''}
          </div>

          {/* Content Area */}
          <div
            id="ai-command-tabpanel"
            role="tabpanel"
            // Focus lands here when the control a player pressed leaves the panel.
            tabIndex={-1}
            aria-labelledby={`ai-${activeTab}-tab`}
            className="flex-1 overflow-y-auto p-3 space-y-2"
          >
            {activeTab === 'advisory' ? (
              <>
                <JevAdvisoryPanel
                  // Worded as the bell shows it now, not in the language it was filed in.
                  latestAlert={
                    latestAlert ? `${latestAlert.title}\n${latestAlert.message}` : undefined
                  }
                />
                <OnDeviceOperatorRecord />
              </>
            ) : activeTab === 'decisions' ? (
              <>
                {listedDecisions.map((decision: AIDecision) => {
                  // A card the engine filed reads in the language active now.
                  const text = decisionCardText(decision, locale);
                  return (
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
                              {t('decisionType', { value: decision.type })}
                            </span>
                            <span
                              className={`text-[9px] px-1 py-0.5 rounded border ${getDecisionPriorityBadge(decision.priority)}`}
                            >
                              {t('priority', { value: decision.priority })}
                            </span>
                            <div className="flex items-center gap-1 ml-auto">
                              {getDecisionStatusIcon(decision.status, 'xs')}
                            </div>
                          </div>
                          <p className="text-xs text-white font-medium">{text.action}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{text.reasoning}</p>
                          <div className="flex items-center gap-2 text-[9px] text-green-400 mt-1">
                            <TrendingUp className="w-2.5 h-2.5" />
                            <span>{text.impact}</span>
                          </div>
                          {decision.response && (
                            <p className={`mt-1 text-[9px] ${capitalizeIn(locale)} text-slate-400`}>
                              {t('response', { value: decision.response.disposition })}
                            </p>
                          )}
                          {/* A lapsed deferral reads by its outcome: its note said when it would lapse. */}
                          {decision.status === 'superseded' &&
                          decision.response?.disposition === 'deferred'
                            ? text.outcome && (
                                <p className="mt-0.5 text-[9px] text-slate-400">{text.outcome}</p>
                              )
                            : text.note && (
                                <p className="mt-0.5 text-[9px] text-slate-400">{text.note}</p>
                              )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button
                              type="button"
                              id={`ai-inspect-${decision.id}`}
                              onClick={() => setSelectedDecision(decision)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-md bg-slate-900/70 px-2 text-[9px] text-cyan-300 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                            >
                              <Eye className="h-3 w-3" aria-hidden="true" />
                              {t('inspectEvidence')}
                            </button>
                            {decision.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRefocusDecisionId(decision.id);
                                    applyDecisionEffects(decision, 'accepted');
                                  }}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-[9px] text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                                >
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  {t('accept')}
                                </button>
                                {/* A card is deferred once; the engine brings it back. */}
                                {decision.response?.disposition !== 'deferred' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRefocusDecisionId(decision.id);
                                      recordDecisionResponse(decision.id, 'deferred');
                                    }}
                                    className="inline-flex min-h-8 items-center gap-1 rounded-md bg-amber-500/15 px-2 text-[9px] text-amber-300 transition-colors hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                                  >
                                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                                    {t('defer')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRefocusDecisionId(decision.id);
                                    recordDecisionResponse(decision.id, 'rejected');
                                  }}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-md bg-red-500/15 px-2 text-[9px] text-red-300 transition-colors hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                >
                                  <XCircle className="h-3 w-3" aria-hidden="true" />
                                  {t('reject')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {aiDecisions.length > 15 && (
                  <p className="text-center text-[10px] text-slate-500 py-1" role="status">
                    {t('showingDecisions', { count: formatFixed(aiDecisions.length, 0) })}
                  </p>
                )}
                {aiDecisions.length === 0 && (
                  <div className="text-center py-6 text-slate-500">
                    <Bot className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-xs">{t('noRecommendations')}</p>
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
        {/* AI Settings Modal */}
        <AISettingsModal isOpen={showAISettings} onClose={() => setShowAISettings(false)} />
        <DecisionReplay decision={selectedDecision} onClose={() => setSelectedDecision(null)} />
      </>
    );
  }

  // NOTE: Standalone mode removed - all access is via embedded mode in ContextSidebar
  // The embedded={true} prop is always passed, so we never reach here
  return null;
};
