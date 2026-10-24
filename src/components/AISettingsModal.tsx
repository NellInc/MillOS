/**
 * AI Settings Modal for MillOS
 *
 * Configure the strategic AI backend:
 * - Public: OpenRouter BYOK for Haiku 5.5 High or Luna 6 High.
 * - Localhost: direct Anthropic/OpenAI BYOK, plus ChatGPT companion sign-in.
 * - Local (WebGPU): on-device Qwen3-4B neural core via @mlc-ai/web-llm — no
 *   API key, no cost, no data leaving the device after the one-time weight
 *   download. Mirrors the CABAL workspace WebGPU brain.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Key,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Brain,
  Trash2,
  Cpu,
  Cloud,
  Download,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAIConfigStore } from '../stores/aiConfigStore';
import {
  cloudAIClient,
  CLOUD_MODELS,
  isLocalCompanionHost,
  type CloudBackend,
} from '../utils/cloudAIClient';
import { chatgptClient, type ChatGPTModel } from '../utils/chatgptClient';
import {
  WebGPUClient,
  checkWebGPUSupport,
  DEFAULT_WEBGPU_MODEL_LABEL,
} from '../utils/webgpuClient';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatFixed, translate, useT } from '../i18n';
import { aiSettingsModalMessages } from './AISettingsModal.messages';

// Visualization Toggles Component
const VisualizationToggles: React.FC = () => {
  const t = useT(aiSettingsModalMessages);
  const showCascadeVisualization = useAIConfigStore((s) => s.showCascadeVisualization);
  const showProductionTarget = useAIConfigStore((s) => s.showProductionTarget);
  const showStrategicOverlay = useAIConfigStore((s) => s.showStrategicOverlay);
  const showVCLDebug = useAIConfigStore((s) => s.showVCLDebug);
  const showEnergyDashboard = useAIConfigStore((s) => s.showEnergyDashboard);
  const showMultiObjective = useAIConfigStore((s) => s.showMultiObjective);
  const showCostOverlay = useAIConfigStore((s) => s.showCostOverlay);
  const setShowCascadeVisualization = useAIConfigStore((s) => s.setShowCascadeVisualization);
  const setShowProductionTarget = useAIConfigStore((s) => s.setShowProductionTarget);
  const setShowStrategicOverlay = useAIConfigStore((s) => s.setShowStrategicOverlay);
  const setShowVCLDebug = useAIConfigStore((s) => s.setShowVCLDebug);
  const setShowEnergyDashboard = useAIConfigStore((s) => s.setShowEnergyDashboard);
  const setShowMultiObjective = useAIConfigStore((s) => s.setShowMultiObjective);
  const setShowCostOverlay = useAIConfigStore((s) => s.setShowCostOverlay);

  // `key` is the actual keyboard shortcut wired in useKeyboardShortcuts.ts.
  // Toggles without a registered key handler omit `key` (button-only).
  const toggles: Array<{
    label: string;
    key?: string;
    enabled: boolean;
    setEnabled: (v: boolean) => void;
  }> = [
    {
      label: t('toggleCascade'),
      key: 'K',
      enabled: showCascadeVisualization,
      setEnabled: setShowCascadeVisualization,
    },
    {
      label: t('toggleStrategic'),
      key: 'J',
      enabled: showStrategicOverlay,
      setEnabled: setShowStrategicOverlay,
    },
    {
      label: t('toggleTarget'),
      key: 'T',
      enabled: showProductionTarget,
      setEnabled: setShowProductionTarget,
    },
    {
      label: t('toggleEnergy'),
      key: 'U',
      enabled: showEnergyDashboard,
      setEnabled: setShowEnergyDashboard,
    },
    {
      label: t('toggleMultiObjective'),
      key: 'Y',
      enabled: showMultiObjective,
      setEnabled: setShowMultiObjective,
    },
    {
      label: t('toggleCost'),
      key: '$',
      enabled: showCostOverlay,
      setEnabled: setShowCostOverlay,
    },
    // No keyboard handler registered: button-only toggle.
    { label: t('toggleVcl'), enabled: showVCLDebug, setEnabled: setShowVCLDebug },
  ];

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 space-y-2">
      <label className="block text-sm font-medium text-slate-300 mb-2">
        {t('overlaysHeading')}
      </label>
      <div className="grid grid-cols-2 gap-2">
        {toggles.map((toggle) => (
          <button
            key={toggle.label}
            onClick={() => toggle.setEnabled(!toggle.enabled)}
            aria-pressed={toggle.enabled}
            className={`p-2 rounded-lg border text-left transition-all ${
              toggle.enabled
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{toggle.label}</span>
              {toggle.key && (
                <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-600 rounded">{toggle.key}</kbd>
              )}
            </div>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{t('overlaysHint')}</p>
    </div>
  );
};

/**
 * Local WebGPU neural core panel — download/compile progress, ready/error
 * state, and model-cache management. Mirrors the CABAL ModelLoader UX, but
 * non-blocking (MillOS's local AI is optional, not a hard app gate).
 */
const WebGPUModelPanel: React.FC = () => {
  const t = useT(aiSettingsModalMessages);
  const webgpuStatus = useAIConfigStore((s) => s.webgpuStatus);
  const webgpuProgress = useAIConfigStore((s) => s.webgpuProgress);
  const webgpuMessage = useAIConfigStore((s) => s.webgpuMessage);
  const webgpuError = useAIConfigStore((s) => s.webgpuError);
  const webgpuModelReady = useAIConfigStore((s) => s.webgpuModelReady);
  const webgpuAdapterWarning = useAIConfigStore((s) => s.webgpuAdapterWarning);
  const webgpuModelId = useAIConfigStore((s) => s.webgpuModelId);
  const loadWebGPUModel = useAIConfigStore((s) => s.loadWebGPUModel);
  const cancelWebGPUModelLoad = useAIConfigStore((s) => s.cancelWebGPUModelLoad);
  const unloadWebGPUModel = useAIConfigStore((s) => s.unloadWebGPUModel);
  const deleteWebGPUCache = useAIConfigStore((s) => s.deleteWebGPUCache);

  const supported = checkWebGPUSupport();
  const [cacheInfo, setCacheInfo] = useState<{ cached: boolean; size: string | null }>({
    cached: false,
    size: null,
  });
  const [busy, setBusy] = useState(false);

  const refreshCache = useCallback(async () => {
    try {
      const [cached, storage] = await Promise.all([
        WebGPUClient.isModelCached(webgpuModelId),
        WebGPUClient.getCacheStorageSize(),
      ]);
      setCacheInfo({ cached, size: storage?.formatted ?? null });
    } catch {
      setCacheInfo({ cached: false, size: null });
    }
  }, [webgpuModelId]);

  useEffect(() => {
    refreshCache();
  }, [refreshCache, webgpuModelReady]);

  const isLoadingState =
    webgpuStatus === 'checking' || webgpuStatus === 'loading' || webgpuStatus === 'compiling';
  const percent = Math.round(webgpuProgress * 100);

  const handleLoad = useCallback(async () => {
    await loadWebGPUModel();
    refreshCache();
  }, [loadWebGPUModel, refreshCache]);

  const handleUnload = useCallback(async () => {
    setBusy(true);
    await unloadWebGPUModel();
    setBusy(false);
  }, [unloadWebGPUModel]);

  const handleDeleteCache = useCallback(async () => {
    setBusy(true);
    await deleteWebGPUCache();
    await refreshCache();
    setBusy(false);
  }, [deleteWebGPUCache, refreshCache]);

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 space-y-3">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-300">{t('localCoreTitle')}</span>
        {webgpuModelReady && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
            {t('online')}
          </span>
        )}
      </div>

      {/* Model info */}
      <div className="flex justify-between text-[11px] text-slate-500 font-mono">
        <span>{t('modelInfo', { model: DEFAULT_WEBGPU_MODEL_LABEL })}</span>
        <span>{t('backendInfo')}</span>
      </div>

      {/* Unsupported */}
      {!supported && (
        <div role="alert" className="flex items-start gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t('webgpuUnavailable')}</span>
        </div>
      )}

      {/* Adapter advisory (OOM / perf risk) */}
      {supported && webgpuAdapterWarning && (
        <div className="flex items-start gap-2 text-[11px] text-amber-400 leading-relaxed">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{webgpuAdapterWarning}</span>
        </div>
      )}

      {/* Progress */}
      {isLoadingState && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
            <span className="uppercase tracking-wider">
              {webgpuStatus === 'compiling' ? t('compilingShaders') : t('downloadingWeights')}
            </span>
            <span className="text-emerald-400/80">{formatFixed(percent, 0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
          {webgpuMessage && (
            <p className="text-[10px] text-slate-500 mt-1 truncate">{webgpuMessage}</p>
          )}
          <button
            onClick={() => cancelWebGPUModelLoad()}
            className="mt-2 w-full py-1.5 px-3 bg-slate-700/50 border border-slate-600 rounded text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            {t('cancelDownload')}
          </button>
        </div>
      )}

      {/* Error */}
      {!isLoadingState && webgpuError && (
        <div role="alert" className="flex items-start gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{webgpuError}</span>
        </div>
      )}

      {/* Actions */}
      {supported && (
        <div className="space-y-2">
          {/* Load / retry — normally unnecessary (the model auto-downloads when
              you select this backend); shown as a fallback for the idle/error case. */}
          {!webgpuModelReady && !isLoadingState && (
            <button
              onClick={handleLoad}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600/20 border border-emerald-600/50 rounded-lg text-emerald-400 text-sm font-medium hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {webgpuError
                ? t('tryAgain')
                : cacheInfo.cached
                  ? t('loadModel')
                  : t('downloadAndLoad')}
            </button>
          )}

          {webgpuModelReady && (
            <button
              onClick={handleUnload}
              disabled={busy}
              className="w-full py-2 px-4 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-300 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {t('unloadModel')}
            </button>
          )}

          {/* Easy delete — prominent and available whenever a model is cached,
              loaded or not (unloads first, then clears the browser cache). */}
          {cacheInfo.cached && (
            <button
              onClick={handleDeleteCache}
              disabled={busy || isLoadingState}
              data-testid="delete-webgpu-model"
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-red-900/30 border border-red-700/40 rounded-lg text-red-400 text-sm font-medium hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {busy ? t('deleting') : t('deleteModel')}
            </button>
          )}

          <p className="text-[10px] text-slate-500 font-mono">
            {cacheInfo.cached
              ? cacheInfo.size
                ? t('cachedWithSize', { size: cacheInfo.size })
                : t('cachedInBrowser')
              : t('notDownloaded')}
          </p>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed">
        {t('modelDownloadNote', { model: DEFAULT_WEBGPU_MODEL_LABEL })}
      </p>
    </div>
  );
};

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ChatGPTPanel() {
  const t = useT(aiSettingsModalMessages);
  const status = useAIConfigStore((s) => s.chatgptStatus);
  const statusError = useAIConfigStore((s) => s.chatgptError);
  const refresh = useAIConfigStore((s) => s.refreshChatGPT);
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returningId, setReturningId] = useState('');
  const local = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  const active = status?.accounts.find((account) => account.id === status.activeId);

  useEffect(() => {
    if (!active?.signedIn) return;
    void chatgptClient
      .models()
      .then(setModels)
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : translate(aiSettingsModalMessages, 'modelCatalogUnavailable')
        );
      });
  }, [active?.id, active?.signedIn]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : translate(aiSettingsModalMessages, 'chatgptOperationFailed')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 space-y-3">
      <p className="text-sm font-medium text-slate-200">{t('chatgptTitle')}</p>
      <p className="text-xs text-slate-400">
        {t('chatgptIntroBefore')}
        <code>npm run play:chatgpt</code>
        {t('chatgptIntroAfter')}
      </p>
      {local && active?.signedIn ? (
        <>
          <p className="text-xs text-green-400">
            {t('connectedAs', { account: active.email || t('chatgptAccountFallback') })}
          </p>
          {status && status.accounts.length > 1 && (
            <select
              aria-label={t('chatgptAccountLabel')}
              value={status.activeId || ''}
              disabled={busy}
              onChange={(event) => void run(() => chatgptClient.selectAccount(event.target.value))}
              className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-white text-xs"
            >
              {status.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email || account.id}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={t('planModelLabel')}
            value={active.model || ''}
            disabled={busy}
            onChange={(event) => void run(() => chatgptClient.selectModel(event.target.value))}
            className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-white text-xs"
          >
            <option value="">{t('selectPlanModel')}</option>
            {models.map((model) => (
              <option key={model.slug} value={model.slug}>
                {model.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const confirmed = await chatgptClient.signOut();
                if (!confirmed) {
                  setError(translate(aiSettingsModalMessages, 'signOutUnconfirmed'));
                }
              })
            }
            className="text-xs text-slate-300 underline disabled:opacity-50"
          >
            {t('signOutLocally')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                window.location.assign(await chatgptClient.start());
              })
            }
            className="text-xs text-slate-300 underline disabled:opacity-50 ml-3"
          >
            {t('addAccount')}
          </button>
        </>
      ) : local ? (
        <>
          {status && status.accounts.length > 0 && (
            <>
              <select
                aria-label={t('reconnectAccount')}
                value={returningId || status.accounts[0].id}
                disabled={busy}
                onChange={(event) => setReturningId(event.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-white text-xs"
              >
                {status.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email || account.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    window.location.assign(
                      await chatgptClient.start(returningId || status.accounts[0].id)
                    );
                  })
                }
                className="w-full p-2 bg-cyan-600/20 border border-cyan-500/40 rounded text-cyan-300 text-sm disabled:opacity-50"
              >
                {t('reconnectAccount')}
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                window.location.assign(await chatgptClient.start());
              })
            }
            className="text-xs text-slate-300 underline disabled:opacity-50"
          >
            {status?.accounts.length ? t('addAccount') : t('continueWithChatGPT')}
          </button>
        </>
      ) : null}
      {(error || (local && statusError)) && (
        <p role="alert" className="text-xs text-red-400">
          {error || statusError}
        </p>
      )}
    </div>
  );
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const t = useT(aiSettingsModalMessages);
  // Selected, not the whole store: this modal is always mounted, and a bare
  // useAIConfigStore() would re-render it on every status and cost update.
  const {
    aiMode,
    setAIMode,
    connectedProviders,
    connectionError,
    setCloudApiKey,
    clearCloudApiKey,
    llmBackend,
    setLLMBackend,
    webgpuModelReady,
    chatgptStatus,
    refreshChatGPT,
    spendCapUsd,
    setSpendCap,
    costTracking,
  } = useAIConfigStore(
    useShallow((s) => ({
      aiMode: s.aiMode,
      setAIMode: s.setAIMode,
      connectedProviders: s.connectedProviders,
      connectionError: s.connectionError,
      setCloudApiKey: s.setCloudApiKey,
      clearCloudApiKey: s.clearCloudApiKey,
      llmBackend: s.llmBackend,
      setLLMBackend: s.setLLMBackend,
      webgpuModelReady: s.webgpuModelReady,
      chatgptStatus: s.chatgptStatus,
      refreshChatGPT: s.refreshChatGPT,
      spendCapUsd: s.spendCapUsd,
      setSpendCap: s.setSpendCap,
      costTracking: s.costTracking,
    }))
  );

  const [inputKey, setInputKey] = useState('');
  const [keyEntryOpen, setKeyEntryOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showLLMConfirmation, setShowLLMConfirmation] = useState(false);
  const [capInput, setCapInput] = useState(spendCapUsd?.toString() ?? '');
  const [capError, setCapError] = useState<string | null>(null);
  const [openRouterConsent, setOpenRouterConsent] = useState(false);
  useEffect(() => setCapInput(spendCapUsd?.toString() ?? ''), [spendCapUsd]);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const handleClose = useCallback(() => {
    setInputKey('');
    setKeyEntryOpen(false);
    setOpenRouterConsent(false);
    setTestResult(null);
    setShowLLMConfirmation(false);
    onClose();
  }, [onClose]);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, handleClose);

  // The ACTIVE backend's readiness unlocks the operating-mode controls.
  const isLocal = llmBackend === 'webgpu';
  const isChatGPT = llmBackend === 'chatgpt';
  const cloudBackend = !isLocal && !isChatGPT ? (llmBackend as CloudBackend) : null;
  const needsOpenRouterConsent = cloudBackend?.startsWith('openrouter-') ?? false;
  const modelLabel = cloudBackend
    ? CLOUD_MODELS[cloudBackend].label
    : isChatGPT
      ? 'ChatGPT'
      : t('localModelLabel');
  const chatgptAccount = chatgptStatus?.accounts.find(
    (account) => account.id === chatgptStatus.activeId
  );
  const llmReady = cloudBackend
    ? connectedProviders[cloudBackend]
    : isChatGPT
      ? Boolean(chatgptAccount?.signedIn && chatgptAccount.model)
      : webgpuModelReady;
  useEffect(() => {
    if (isOpen && isChatGPT) void refreshChatGPT();
  }, [isOpen, isChatGPT, refreshChatGPT]);

  const selectBackend = (backend: CloudBackend | 'webgpu' | 'chatgpt') => {
    setInputKey('');
    setKeyEntryOpen(false);
    setOpenRouterConsent(false);
    setTestResult(null);
    setLLMBackend(backend);
  };

  const handleTestConnection = useCallback(async () => {
    if (!cloudBackend || !inputKey.trim() || (needsOpenRouterConsent && !openRouterConsent)) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      await cloudAIClient.testKey(cloudBackend, inputKey.trim());
      if (useAIConfigStore.getState().llmBackend === cloudBackend) {
        setTestResult({
          success: true,
          message: cloudBackend.startsWith('openrouter-')
            ? translate(aiSettingsModalMessages, 'keyVerifiedOpenRouter')
            : translate(aiSettingsModalMessages, 'keyVerified'),
        });
      }
    } catch (error) {
      if (useAIConfigStore.getState().llmBackend === cloudBackend) {
        setTestResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : translate(aiSettingsModalMessages, 'connectionFailed'),
        });
      }
    } finally {
      setIsTesting(false);
    }
  }, [cloudBackend, inputKey, needsOpenRouterConsent, openRouterConsent]);

  const handleSave = useCallback(async () => {
    if (!cloudBackend || !inputKey.trim() || (needsOpenRouterConsent && !openRouterConsent)) return;
    setIsTesting(true);
    setTestResult(null);
    const success = await setCloudApiKey(cloudBackend, inputKey.trim());
    if (useAIConfigStore.getState().llmBackend === cloudBackend) {
      if (success) {
        setTestResult({
          success: true,
          message: translate(aiSettingsModalMessages, 'connectedForSession'),
        });
        setInputKey('');
        setKeyEntryOpen(false);
        setOpenRouterConsent(false);
      } else {
        setTestResult({
          success: false,
          message:
            useAIConfigStore.getState().connectionError ||
            translate(aiSettingsModalMessages, 'connectionFailed'),
        });
      }
    }
    setIsTesting(false);
  }, [cloudBackend, inputKey, needsOpenRouterConsent, openRouterConsent, setCloudApiKey]);

  const handleClear = useCallback(() => {
    if (!cloudBackend) return;
    clearCloudApiKey(cloudBackend);
    setInputKey('');
    setKeyEntryOpen(false);
    setOpenRouterConsent(false);
    setTestResult(null);
  }, [cloudBackend, clearCloudApiKey]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-settings-title"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-md max-h-[85vh] mx-4 my-4 bg-slate-900 rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              <h2 id="ai-settings-title" className="text-lg font-semibold text-white">
                {t('title')}
              </h2>
            </div>
            <button
              onClick={handleClose}
              aria-label={t('closeSettings')}
              className="p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {/* Backend Selector */}
            <div className="p-3 rounded-lg bg-slate-800/50 space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                {t('backendLabel')}
              </label>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label={t('backendLabel')}
              >
                {isLocalCompanionHost() && (
                  <button
                    role="radio"
                    aria-checked={llmBackend === 'haiku'}
                    onClick={() => selectBackend('haiku')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      llmBackend === 'haiku'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">Haiku 5.5 High</div>
                    <div className="text-[9px] opacity-70">Anthropic • BYOK</div>
                  </button>
                )}
                {isLocalCompanionHost() && (
                  <button
                    role="radio"
                    aria-checked={llmBackend === 'luna'}
                    onClick={() => selectBackend('luna')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      llmBackend === 'luna'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">Luna 6 High</div>
                    <div className="text-[9px] opacity-70">OpenAI • BYOK</div>
                  </button>
                )}
                <button
                  role="radio"
                  aria-checked={llmBackend === 'openrouter-haiku'}
                  onClick={() => selectBackend('openrouter-haiku')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'openrouter-haiku'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">Haiku 5.5 High</div>
                  <div className="text-[9px] opacity-70">OpenRouter • BYOK</div>
                </button>
                <button
                  role="radio"
                  aria-checked={llmBackend === 'openrouter-luna'}
                  onClick={() => selectBackend('openrouter-luna')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'openrouter-luna'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">Luna 6 High</div>
                  <div className="text-[9px] opacity-70">OpenRouter • BYOK</div>
                </button>
                <button
                  role="radio"
                  aria-checked={llmBackend === 'chatgpt'}
                  disabled={!isLocalCompanionHost()}
                  onClick={() => selectBackend('chatgpt')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'chatgpt'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500 disabled:opacity-50'
                  }`}
                >
                  <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">{t('chatgptPlan')}</div>
                  <div className="text-[9px] opacity-70">{t('localCompanion')}</div>
                </button>
                <button
                  role="radio"
                  aria-checked={llmBackend === 'webgpu'}
                  onClick={() => selectBackend('webgpu')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'webgpu'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Cpu className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">{t('localWebGPU')}</div>
                  <div className="text-[9px] opacity-70">{t('onDeviceFree')}</div>
                </button>
              </div>
            </div>

            {/* Browser-session BYOK admission limit. No key or cap is stored on a server. */}
            <form
              className="p-3 rounded-lg bg-slate-800/50 space-y-2"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  setSpendCap(capInput.trim() ? Number(capInput) : null);
                  setCapError(null);
                } catch (error) {
                  setCapError(
                    error instanceof Error
                      ? error.message
                      : translate(aiSettingsModalMessages, 'invalidCostCap')
                  );
                }
              }}
            >
              <label htmlFor="ai-cost-cap" className="block text-sm font-medium text-slate-300">
                {t('costCapLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  id="ai-cost-cap"
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  placeholder={t('costCapPlaceholder')}
                  value={capInput}
                  onChange={(event) => setCapInput(event.target.value)}
                  className="min-w-0 flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs"
                >
                  {t('apply')}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {t('costUsage', {
                  used: formatFixed(costTracking.sessionCost, 4),
                  pending: formatFixed(costTracking.reservedCost + costTracking.uncertainCost, 4),
                })}
                {spendCapUsd === null
                  ? t('noCap')
                  : t('capSet', { cap: formatFixed(spendCapUsd, 2) })}
              </p>
              <p className="text-[10px] text-slate-400">{t('costNote')}</p>
              {capError && (
                <p role="alert" className="text-xs text-red-400">
                  {capError}
                </p>
              )}
            </form>

            {/* Current Status */}
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{t('currentMode')}</span>
                <div className="flex items-center gap-2">
                  {aiMode === 'gemini' && (
                    <>
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium text-cyan-400">
                        {isLocal ? t('localOnly') : t('modelOnly', { model: modelLabel })}
                      </span>
                    </>
                  )}
                  {aiMode === 'hybrid' && (
                    <>
                      <Zap className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">{t('hybridMode')}</span>
                    </>
                  )}
                  {aiMode === 'heuristic' && (
                    <>
                      <Brain className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-400">{t('heuristic')}</span>
                    </>
                  )}
                </div>
              </div>

              {cloudBackend && llmReady && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>{t('connectedStatus', { model: modelLabel })}</span>
                </div>
              )}

              {isLocal && webgpuModelReady && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>{t('localCoreOnline', { model: DEFAULT_WEBGPU_MODEL_LABEL })}</span>
                </div>
              )}

              {cloudBackend && connectionError && (
                <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span>{connectionError}</span>
                </div>
              )}
            </div>

            {/* Cloud BYOK key flow */}
            {cloudBackend && (
              <div className="space-y-2">
                <label htmlFor="cloud-api-key" className="block text-sm font-medium text-slate-300">
                  {t('apiKeyLabel', { provider: CLOUD_MODELS[cloudBackend!].provider })}
                </label>
                {/* Keep the password field unmounted until requested: autocomplete=off did not stop browser autofill. */}
                {keyEntryOpen ? (
                  <div className="relative">
                    <Key
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      id="cloud-api-key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={512}
                      value={inputKey}
                      onChange={(e) => setInputKey(e.target.value)}
                      placeholder={
                        llmReady
                          ? t('placeholderUpdate')
                          : t('placeholderEnter', {
                              provider: CLOUD_MODELS[cloudBackend!].provider,
                            })
                      }
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKeyEntryOpen(true)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-left text-sm text-cyan-300 hover:border-cyan-500"
                  >
                    {llmReady
                      ? t('replaceKey', { provider: CLOUD_MODELS[cloudBackend].provider })
                      : t('enterKey', { provider: CLOUD_MODELS[cloudBackend].provider })}
                  </button>
                )}
                <p className="text-xs text-slate-500">
                  {t('getKeyFrom')}{' '}
                  <a
                    href={
                      cloudBackend === 'haiku'
                        ? 'https://platform.claude.com/settings/keys'
                        : cloudBackend === 'luna'
                          ? 'https://platform.openai.com/api-keys'
                          : 'https://openrouter.ai/settings/keys'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {t('providerConsole', { provider: CLOUD_MODELS[cloudBackend!].provider })}
                  </a>
                </p>
                {cloudBackend.startsWith('openrouter-') && (
                  <>
                    <p className="text-xs text-slate-400">{t('openRouterKeyAdvice')}</p>
                    <label className="flex items-start gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={openRouterConsent}
                        onChange={(event) => setOpenRouterConsent(event.target.checked)}
                        className="mt-0.5"
                      />
                      <span>{t('openRouterConsent')}</span>
                    </label>
                  </>
                )}
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {t('keyMemoryNote', { provider: CLOUD_MODELS[cloudBackend!].provider })}{' '}
                  {cloudBackend.startsWith('openrouter-')
                    ? t('keyCheckFree')
                    : t('keyTestsBillable')}
                </p>
              </div>
            )}

            {/* Local WebGPU model flow */}
            {isLocal && <WebGPUModelPanel />}
            {isChatGPT && <ChatGPTPanel />}

            {/* BYOK connection result */}
            {cloudBackend && testResult && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-green-500/20 border border-green-500/30'
                    : 'bg-red-500/20 border border-red-500/30'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                <span
                  className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}
                >
                  {testResult.message}
                </span>
              </motion.div>
            )}

            {/* Mode Selector (shown once a backend is ready) */}
            {llmReady && (
              <div className="p-3 rounded-lg bg-slate-800/50 space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  {t('operatingMode')}
                </label>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label={t('operatingMode')}
                >
                  <button
                    onClick={() => setAIMode('heuristic')}
                    role="radio"
                    aria-checked={aiMode === 'heuristic'}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'heuristic'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Brain className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">{t('heuristic')}</div>
                    <div className="text-[9px] opacity-70">{t('fastRules')}</div>
                  </button>
                  <button
                    onClick={() => setAIMode('hybrid')}
                    role="radio"
                    aria-checked={aiMode === 'hybrid'}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'hybrid'
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">{t('hybrid')}</div>
                    <div className="text-[9px] opacity-70">{t('bestOfBoth')}</div>
                  </button>
                  <button
                    onClick={() => {
                      if (aiMode !== 'gemini') {
                        setShowLLMConfirmation(true);
                      }
                    }}
                    role="radio"
                    aria-checked={aiMode === 'gemini'}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'gemini'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">{modelLabel}</div>
                    <div className="text-[9px] opacity-70">{t('llmOnly')}</div>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {aiMode === 'heuristic' && t('modeHeuristicDesc')}
                  {aiMode === 'gemini' &&
                    (isLocal
                      ? t('modeLocalOnlyDesc')
                      : t('modeModelOnlyDesc', { model: modelLabel }))}
                  {aiMode === 'hybrid' &&
                    (isLocal
                      ? t('modeLocalHybridDesc')
                      : t('modeModelHybridDesc', { model: modelLabel }))}
                </p>
              </div>
            )}

            {/* LLM-only mode confirmation */}
            {showLLMConfirmation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-lg bg-cyan-900/30 border border-cyan-500/40 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Zap className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{t('considerHybrid')}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-purple-400">{t('hybridMode')}</strong>
                      {t('hybridExplanation')}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      <strong className="text-cyan-400">
                        {isLocal ? t('localOnly') : t('modelOnly', { model: modelLabel })}
                      </strong>{' '}
                      {t('llmOnlyExplanation')}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAIMode('hybrid');
                      setShowLLMConfirmation(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                  >
                    {t('useHybrid')}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Close first, then set mode to avoid React state batching issues
                      setShowLLMConfirmation(false);
                      // Use requestAnimationFrame to ensure state update happens after render
                      requestAnimationFrame(() => {
                        setAIMode('gemini');
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {isLocal ? t('useLocalOnly') : t('useModelOnly', { model: modelLabel })}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLLMConfirmation(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </motion.div>
            )}

            {/* AI Visualization Toggles */}
            <VisualizationToggles />
          </div>

          {/* Cloud BYOK actions */}
          {cloudBackend && (
            <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
              {llmReady ? (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('disconnectKey')}
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={
                    !inputKey.trim() || isTesting || (needsOpenRouterConsent && !openRouterConsent)
                  }
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('testConnection')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={
                    !inputKey.trim() || isTesting || (needsOpenRouterConsent && !openRouterConsent)
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('connectForSession')
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
