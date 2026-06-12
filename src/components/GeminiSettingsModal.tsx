/**
 * AI Settings Modal for MillOS
 *
 * Configure the strategic AI backend:
 * - Gemini API: cloud inference with a Google API key (Gemini Flash model chain).
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
import { useAIConfigStore } from '../stores/aiConfigStore';
import { geminiClient } from '../utils/geminiClient';
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
  const showCostOverlay = useAIConfigStore((s) => s.showCostOverlay);
  const showShiftHandover = useAIConfigStore((s) => s.showShiftHandover);
  const setShowCascadeVisualization = useAIConfigStore((s) => s.setShowCascadeVisualization);
  const setShowProductionTarget = useAIConfigStore((s) => s.setShowProductionTarget);
  const setShowStrategicOverlay = useAIConfigStore((s) => s.setShowStrategicOverlay);
  const setShowVCLDebug = useAIConfigStore((s) => s.setShowVCLDebug);
  const setShowEnergyDashboard = useAIConfigStore((s) => s.setShowEnergyDashboard);
  const setShowCostOverlay = useAIConfigStore((s) => s.setShowCostOverlay);
  const setShowShiftHandover = useAIConfigStore((s) => s.setShowShiftHandover);

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
      label: 'API Cost Tracker',
      key: '$',
      enabled: showCostOverlay,
      setEnabled: setShowCostOverlay,
    },
    // No keyboard handler registered: button-only toggle.
    { label: 'VCL Context', enabled: showVCLDebug, setEnabled: setShowVCLDebug },
    {
      label: 'Shift Handover',
      enabled: showShiftHandover,
      setEnabled: setShowShiftHandover,
    },
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
            Edge, or Safari 17+) or switch to the Gemini API backend.
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

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GeminiSettingsModal({ isOpen, onClose }: GeminiSettingsModalProps) {
  const {
    aiMode,
    setAIMode,
    isGeminiConnected,
    connectionError,
    setGeminiApiKey,
    clearGeminiConfig,
    llmBackend,
    setLLMBackend,
    webgpuModelReady,
  } = useAIConfigStore();

  const [inputKey, setInputKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGeminiConfirmation, setShowGeminiConfirmation] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onClose);

  // The ACTIVE backend's readiness unlocks the operating-mode controls.
  const isLocal = llmBackend === 'webgpu';
  const llmReady = isLocal ? webgpuModelReady : isGeminiConnected;

  const handleTestConnection = useCallback(async () => {
    if (!inputKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    // Temporarily initialize to test
    const success = geminiClient.initialize(inputKey.trim());
    if (!success) {
      setTestResult({ success: false, message: 'Failed to initialize client' });
      setIsTesting(false);
      return;
    }

    const result = await geminiClient.testConnection();
    setTestResult(result);
    setIsTesting(false);

    // Don't keep the test connection if not saving
    if (!result.success) {
      geminiClient.disconnect();
    }
  }, [inputKey]);

  const handleSave = useCallback(async () => {
    if (!inputKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    const success = await setGeminiApiKey(inputKey.trim());

    if (success) {
      setTestResult({ success: true, message: 'API key saved and connected!' });
      setInputKey('');
      // Close modal after short delay on success
      setTimeout(() => onClose(), 1500);
    } else {
      setTestResult({ success: false, message: connectionError || 'Failed to connect' });
    }

    setIsTesting(false);
  }, [inputKey, setGeminiApiKey, connectionError, onClose]);

  const handleClear = useCallback(() => {
    clearGeminiConfig();
    setInputKey('');
    setTestResult(null);
  }, [clearGeminiConfig]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
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
              onClick={onClose}
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  aria-pressed={llmBackend === 'gemini'}
                  onClick={() => setLLMBackend('gemini')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    llmBackend === 'gemini'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Cloud className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                  <div className="text-xs font-medium">Gemini API</div>
                  <div className="text-[9px] opacity-70">Cloud • API key</div>
                </button>
                <button
                  aria-pressed={llmBackend === 'webgpu'}
                  onClick={() => setLLMBackend('webgpu')}
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

            {/* Current Status */}
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Current Mode:</span>
                <div className="flex items-center gap-2">
                  {aiMode === 'gemini' && (
                    <>
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium text-cyan-400">
                        {isLocal ? 'Local Only' : 'Gemini Only'}
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

              {!isLocal && isGeminiConnected && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>
                    Connected • {geminiClient.getActiveModelId()} •{' '}
                    {geminiClient.getMaskedApiKey()}
                  </span>
                </div>
              )}

              {isLocal && webgpuModelReady && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Local neural core online • {DEFAULT_WEBGPU_MODEL_LABEL}</span>
                </div>
              )}

              {!isLocal && connectionError && (
                <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span>{connectionError}</span>
                </div>
              )}
            </div>

            {/* Gemini API key flow */}
            {!isLocal && (
              <div className="space-y-2">
                <label
                  htmlFor="gemini-api-key"
                  className="block text-sm font-medium text-slate-300"
                >
                  Google API Key
                </label>
                <div className="relative">
                  <Key
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    id="gemini-api-key"
                    type="password"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={
                      isGeminiConnected
                        ? 'Enter new key to update...'
                        : 'Enter your Gemini API key...'
                    }
                    className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Get your API key from{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Your API key is stored only in this browser (localStorage) and is never sent to a
                  MillOS server. In Gemini and Hybrid modes, your key and simulation state are sent
                  directly to Google&rsquo;s Gemini API, where they are handled under{' '}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    Google&rsquo;s Privacy Policy
                  </a>
                  . Heuristic mode runs locally and sends nothing to Google.
                </p>
              </div>
            )}

            {/* Local WebGPU model flow */}
            {isLocal && <WebGPUModelPanel />}

            {/* Test Result (Gemini path) */}
            {!isLocal && testResult && (
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
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAIMode('heuristic')}
                    aria-pressed={aiMode === 'heuristic'}
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
                    aria-pressed={aiMode === 'hybrid'}
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
                        setShowGeminiConfirmation(true);
                      }
                    }}
                    aria-pressed={aiMode === 'gemini'}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'gemini'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" aria-hidden="true" />
                    <div className="text-xs font-medium">{isLocal ? 'Local' : 'Gemini'}</div>
                    <div className="text-[9px] opacity-70">LLM only</div>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {aiMode === 'heuristic' && 'Fast rule-based decisions. No API cost.'}
                  {aiMode === 'gemini' &&
                    (isLocal
                      ? 'All decisions powered by the local WebGPU model.'
                      : 'All decisions powered by Gemini AI.')}
                  {aiMode === 'hybrid' &&
                    (isLocal
                      ? 'Tactical (heuristic 6s) + Strategic (local model 45s).'
                      : 'Tactical (heuristic 6s) + Strategic (Gemini 45s).')}
                </p>
              </div>
            )}

            {/* Gemini Mode Confirmation */}
            {showGeminiConfirmation && (
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
                      the best of both worlds{isLocal ? '.' : ' at lower API cost.'}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      <strong className="text-cyan-400">
                        {isLocal ? 'Local Only' : 'Gemini Only'}
                      </strong>{' '}
                      routes all decisions through the LLM, which may be slower
                      {isLocal ? ' and heavier on your GPU.' : ' and more expensive.'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAIMode('hybrid');
                      setShowGeminiConfirmation(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                  >
                    Use Hybrid
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Close first, then set mode to avoid React state batching issues
                      setShowGeminiConfirmation(false);
                      // Use requestAnimationFrame to ensure state update happens after render
                      requestAnimationFrame(() => {
                        setAIMode('gemini');
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {isLocal ? 'Use Local Only' : 'Use Gemini Only'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowGeminiConfirmation(false);
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

          {/* Footer (Gemini API actions only) */}
          {!isLocal && (
            <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/50">
              {isGeminiConnected ? (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Config
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
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Connect'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
