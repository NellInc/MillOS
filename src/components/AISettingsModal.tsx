/**
 * AI Settings Modal for MillOS
 *
 * Configure the strategic AI backend:
 * - Claude Haiku 5.5 High or GPT-6 Luna High: direct or OpenRouter browser BYOK.
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
import { cloudAIClient, CLOUD_MODELS, type CloudBackend } from '../utils/cloudAIClient';
import { chatgptClient, type ChatGPTModel } from '../utils/chatgptClient';
import {
  WebGPUClient,
  checkWebGPUSupport,
  DEFAULT_WEBGPU_MODEL_LABEL,
} from '../utils/webgpuClient';
import { useFocusTrap } from '../hooks/useFocusTrap';

// Visualization Toggles Component
const VisualizationToggles: React.FC = () => {
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
      label: 'Cascade Visualization',
      key: 'K',
      enabled: showCascadeVisualization,
      setEnabled: setShowCascadeVisualization,
    },
    {
      label: 'Strategic Overlay',
      key: 'J',
      enabled: showStrategicOverlay,
      setEnabled: setShowStrategicOverlay,
    },
    {
      label: 'Production Target',
      key: 'T',
      enabled: showProductionTarget,
      setEnabled: setShowProductionTarget,
    },
    {
      label: 'Energy Dashboard',
      key: 'U',
      enabled: showEnergyDashboard,
      setEnabled: setShowEnergyDashboard,
    },
    {
      label: 'Multi-Objective',
      key: 'Y',
      enabled: showMultiObjective,
      setEnabled: setShowMultiObjective,
    },
    {
      label: 'API Cost Tracker',
      key: '$',
      enabled: showCostOverlay,
      setEnabled: setShowCostOverlay,
    },
    // No keyboard handler registered: button-only toggle.
    { label: 'VCL Context', enabled: showVCLDebug, setEnabled: setShowVCLDebug },
  ];

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 space-y-2">
      <label className="block text-sm font-medium text-slate-300 mb-2">
        AI Visualization Overlays
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
      <p className="text-[10px] text-slate-500 mt-1">
        Toggle overlays with keyboard shortcuts or buttons above
      </p>
    </div>
  );
};

/**
 * Local WebGPU neural core panel — download/compile progress, ready/error
 * state, and model-cache management. Mirrors the CABAL ModelLoader UX, but
 * non-blocking (MillOS's local AI is optional, not a hard app gate).
 */
const WebGPUModelPanel: React.FC = () => {
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
        <span className="text-sm font-medium text-slate-300">Local Neural Core</span>
        {webgpuModelReady && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Online
          </span>
        )}
      </div>

      {/* Model info */}
      <div className="flex justify-between text-[11px] text-slate-500 font-mono">
        <span>Model: {DEFAULT_WEBGPU_MODEL_LABEL}</span>
        <span>Backend: WebGPU</span>
      </div>

      {/* Unsupported */}
      {!supported && (
        <div role="alert" className="flex items-start gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            WebGPU is unavailable in this browser. Use a WebGPU-capable browser (recent Chrome,
            Edge, or Safari 17+) or select a cloud BYOK model.
          </span>
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
              {webgpuStatus === 'compiling' ? 'Compiling shaders' : 'Downloading weights'}
            </span>
            <span className="text-emerald-400/80">{percent}%</span>
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
            Cancel download
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
                ? 'Try again'
                : cacheInfo.cached
                  ? 'Load model'
                  : 'Download & load model'}
            </button>
          )}

          {webgpuModelReady && (
            <button
              onClick={handleUnload}
              disabled={busy}
              className="w-full py-2 px-4 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-300 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Unload model (free GPU memory)
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
              {busy ? 'Deleting...' : 'Delete downloaded model'}
            </button>
          )}

          <p className="text-[10px] text-slate-500 font-mono">
            {cacheInfo.cached
              ? `Cached in this browser${cacheInfo.size ? ` (~${cacheInfo.size} used)` : ''}`
              : 'Not downloaded yet'}
          </p>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed">
        The model ({DEFAULT_WEBGPU_MODEL_LABEL}, ~2.7GB) downloads automatically when you select
        this backend, once, from the Hugging Face CDN, and is cached in your browser. After that all
        inference runs on your GPU and your simulation data never leaves your device — no API key,
        no cost. Use “Delete downloaded model” any time to remove it and free the space.
      </p>
    </div>
  );
};

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ChatGPTPanel() {
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
        setError(cause instanceof Error ? cause.message : 'Model catalog unavailable.');
      });
  }, [active?.id, active?.signedIn]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ChatGPT operation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-800/50 space-y-3">
      <p className="text-sm font-medium text-slate-200">ChatGPT plan login</p>
      <p className="text-xs text-slate-400">
        Available in the local MillOS companion. Run <code>npm run play:chatgpt</code> and open its
        127.0.0.1 address. Public-site ChatGPT plan access requires OpenAI approval. This plan route
        is separate from the dollar cap on BYOK calls.
      </p>
      {local && active?.signedIn ? (
        <>
          <p className="text-xs text-green-400">Connected as {active.email || 'ChatGPT account'}</p>
          {status && status.accounts.length > 1 && (
            <select
              aria-label="ChatGPT account"
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
            aria-label="ChatGPT plan model"
            value={active.model || ''}
            disabled={busy}
            onChange={(event) => void run(() => chatgptClient.selectModel(event.target.value))}
            className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-white text-xs"
          >
            <option value="">Select a plan model</option>
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
                  setError(
                    'Signed out locally; remote revocation was not confirmed. Disconnect MillOS in ChatGPT Settings.'
                  );
                }
              })
            }
            className="text-xs text-slate-300 underline disabled:opacity-50"
          >
            Sign out locally
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
            Add another ChatGPT account
          </button>
        </>
      ) : local ? (
        <>
          {status && status.accounts.length > 0 && (
            <>
              <select
                aria-label="Reconnect ChatGPT account"
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
                Reconnect ChatGPT account
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
            {status?.accounts.length ? 'Add another ChatGPT account' : 'Continue with ChatGPT'}
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
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showLLMConfirmation, setShowLLMConfirmation] = useState(false);
  const [capInput, setCapInput] = useState(spendCapUsd?.toString() ?? '');
  const [capError, setCapError] = useState<string | null>(null);
  useEffect(() => setCapInput(spendCapUsd?.toString() ?? ''), [spendCapUsd]);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const handleClose = useCallback(() => {
    setInputKey('');
    setTestResult(null);
    setShowLLMConfirmation(false);
    onClose();
  }, [onClose]);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, handleClose);

  // The ACTIVE backend's readiness unlocks the operating-mode controls.
  const isLocal = llmBackend === 'webgpu';
  const isChatGPT = llmBackend === 'chatgpt';
  const cloudBackend = !isLocal && !isChatGPT ? (llmBackend as CloudBackend) : null;
  const modelLabel = cloudBackend
    ? CLOUD_MODELS[cloudBackend].label
    : isChatGPT
      ? 'ChatGPT'
      : 'Local';
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
    setTestResult(null);
    setLLMBackend(backend);
  };

  const handleTestConnection = useCallback(async () => {
    if (!cloudBackend || !inputKey.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      await cloudAIClient.testKey(cloudBackend, inputKey.trim());
      if (useAIConfigStore.getState().llmBackend === cloudBackend) {
        setTestResult({
          success: true,
          message: 'Key and model access verified for this session.',
        });
      }
    } catch (error) {
      if (useAIConfigStore.getState().llmBackend === cloudBackend) {
        setTestResult({
          success: false,
          message: error instanceof Error ? error.message : 'Connection failed.',
        });
      }
    } finally {
      setIsTesting(false);
    }
  }, [cloudBackend, inputKey]);

  const handleSave = useCallback(async () => {
    if (!cloudBackend || !inputKey.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    const success = await setCloudApiKey(cloudBackend, inputKey.trim());
    if (useAIConfigStore.getState().llmBackend === cloudBackend) {
      if (success) {
        setTestResult({ success: true, message: 'Connected for this page session.' });
        setInputKey('');
      } else {
        setTestResult({
          success: false,
          message: useAIConfigStore.getState().connectionError || 'Connection failed.',
        });
      }
    }
    setIsTesting(false);
  }, [cloudBackend, inputKey, setCloudApiKey]);

  const handleClear = useCallback(() => {
    if (!cloudBackend) return;
    clearCloudApiKey(cloudBackend);
    setInputKey('');
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
                AI Settings
              </h2>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close settings"
              className="p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {/* Backend Selector */}
            <div className="p-3 rounded-lg bg-slate-800/50 space-y-2">
              <label className="block text-sm font-medium text-slate-300">AI Backend</label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="AI Backend">
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
                  disabled={!['127.0.0.1', 'localhost'].includes(window.location.hostname)}
                  onClick={() => selectBackend('chatgpt')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'chatgpt'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500 disabled:opacity-50'
                  }`}
                >
                  <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">ChatGPT plan</div>
                  <div className="text-[9px] opacity-70">Local companion</div>
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
                  <div className="text-xs font-medium">Local (WebGPU)</div>
                  <div className="text-[9px] opacity-70">On-device • free</div>
                </button>
              </div>
            </div>

            {/* Browser-session BYOK admission limit. No key or cap is stored on a server. */}
            <form
              className="p-3 rounded-lg bg-slate-800/50 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  setSpendCap(capInput.trim() ? Number(capInput) : null);
                  setCapError(null);
                } catch (error) {
                  setCapError(error instanceof Error ? error.message : 'Invalid cost cap.');
                }
              }}
            >
              <label htmlFor="ai-cost-cap" className="block text-sm font-medium text-slate-300">
                BYOK session cost cap (USD)
              </label>
              <div className="flex gap-2">
                <input
                  id="ai-cost-cap"
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  placeholder="Off"
                  value={capInput}
                  onChange={(event) => setCapInput(event.target.value)}
                  className="min-w-0 flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs"
                >
                  Apply
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Used {`$${costTracking.sessionCost.toFixed(4)}`}; in flight or uncertain{' '}
                {`$${(costTracking.reservedCost + costTracking.uncertainCost).toFixed(4)}`}.
                {spendCapUsd === null ? ' No cap set.' : ` Cap: $${spendCapUsd.toFixed(2)}.`}
              </p>
              <p className="text-[10px] text-slate-400">
                This tab blocks new paid requests using a conservative estimate, including key
                tests. It is not a provider billing limit; actual charges can differ. Set a
                provider-side limit where available for a stronger guard. OpenRouter upstream BYOK
                charges are included when OpenRouter reports them; verify charges in your provider
                account.
              </p>
              {capError && (
                <p role="alert" className="text-xs text-red-400">
                  {capError}
                </p>
              )}
            </form>

            {/* Current Status */}
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Current Mode:</span>
                <div className="flex items-center gap-2">
                  {aiMode === 'gemini' && (
                    <>
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium text-cyan-400">
                        {isLocal ? 'Local Only' : `${modelLabel} Only`}
                      </span>
                    </>
                  )}
                  {aiMode === 'hybrid' && (
                    <>
                      <Zap className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">Hybrid Mode</span>
                    </>
                  )}
                  {aiMode === 'heuristic' && (
                    <>
                      <Brain className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-400">Heuristic</span>
                    </>
                  )}
                </div>
              </div>

              {cloudBackend && llmReady && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Connected • {modelLabel} • key held in memory</span>
                </div>
              )}

              {isLocal && webgpuModelReady && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Local neural core online • {DEFAULT_WEBGPU_MODEL_LABEL}</span>
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
                  {CLOUD_MODELS[cloudBackend!].provider} API Key
                </label>
                <div className="relative">
                  <Key
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="cloud-api-key"
                    type="password"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={
                      llmReady
                        ? 'Enter new key to update...'
                        : `Enter your ${CLOUD_MODELS[cloudBackend!].provider} API key...`
                    }
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Get your API key from{' '}
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
                    {CLOUD_MODELS[cloudBackend!].provider} Console
                  </a>
                </p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Your key stays in this page&rsquo;s memory and is sent directly to
                  {` ${CLOUD_MODELS[cloudBackend!].provider}`} with plant telemetry. Reloading
                  clears it. MillOS has no server-side key vault; page scripts and browser
                  extensions can access a key while this page is open. Tests and strategic requests
                  are billable by your provider.
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
                  AI Operating Mode
                </label>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-label="AI Operating Mode"
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
                    <div className="text-xs font-medium">Heuristic</div>
                    <div className="text-[9px] opacity-70">Fast rules</div>
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
                    <div className="text-xs font-medium">Hybrid</div>
                    <div className="text-[9px] opacity-70">Best of both</div>
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
                    <div className="text-[9px] opacity-70">LLM only</div>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {aiMode === 'heuristic' && 'Fast rule-based decisions. No API cost.'}
                  {aiMode === 'gemini' &&
                    (isLocal
                      ? 'Strategic decisions from the local model only (every 45s); the fast rules layer is paused.'
                      : `Strategic decisions from ${modelLabel} only (every 45s); the fast rules layer is paused.`)}
                  {aiMode === 'hybrid' &&
                    (isLocal
                      ? 'Tactical (heuristic 6s) + Strategic (local model 45s).'
                      : `Tactical (heuristic 6s) + Strategic (${modelLabel} 45s).`)}
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
                    <h3 className="text-sm font-semibold text-white mb-1">Consider Hybrid Mode?</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-purple-400">Hybrid Mode</strong> combines fast
                      heuristic decisions (every 6s) with strategic insights (every 45s), giving you
                      the best of both worlds.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      <strong className="text-cyan-400">
                        {isLocal ? 'Local Only' : `${modelLabel} Only`}
                      </strong>{' '}
                      runs only the strategic LLM layer and pauses the fast rules layer, so the
                      plant responds to changes more slowly.
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
                    Use Hybrid
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
                    {isLocal ? 'Use Local Only' : `Use ${modelLabel} Only`}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLLMConfirmation(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Cancel
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
                  Disconnect Key
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={!inputKey.trim() || isTesting}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!inputKey.trim() || isTesting}
                  className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect for Session'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
