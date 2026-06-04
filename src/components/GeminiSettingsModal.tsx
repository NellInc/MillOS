/**
 * Gemini Settings Modal for MillOS
 *
 * Allows users to configure their Google API key for Gemini-powered
 * plant management decisions.
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Key, CheckCircle, AlertTriangle, Loader2, Zap, Brain, Trash2 } from 'lucide-react';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { geminiClient } from '../utils/geminiClient';
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
  } = useAIConfigStore();

  const [inputKey, setInputKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGeminiConfirmation, setShowGeminiConfirmation] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onClose);

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
          aria-labelledby="gemini-settings-title"
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
              <h2 id="gemini-settings-title" className="text-lg font-semibold text-white">
                Gemini AI Settings
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
            {/* Current Status */}
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Current Mode:</span>
                <div className="flex items-center gap-2">
                  {aiMode === 'gemini' && (
                    <>
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium text-cyan-400">Gemini Only</span>
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

              {isGeminiConnected && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Connected • {geminiClient.getMaskedApiKey()}</span>
                </div>
              )}

              {connectionError && (
                <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span>{connectionError}</span>
                </div>
              )}
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <label htmlFor="gemini-api-key" className="block text-sm font-medium text-slate-300">
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

            {/* Test Result */}
            {testResult && (
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

            {/* Mode Selector (only show when connected) */}
            {isGeminiConnected && (
              <div className="p-3 rounded-lg bg-slate-800/50 space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  AI Operating Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAIMode('heuristic')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'heuristic'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Brain className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs font-medium">Heuristic</div>
                    <div className="text-[9px] opacity-70">Fast rules</div>
                  </button>
                  <button
                    onClick={() => setAIMode('hybrid')}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'hybrid'
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs font-medium">Hybrid</div>
                    <div className="text-[9px] opacity-70">Best of both</div>
                  </button>
                  <button
                    onClick={() => {
                      if (aiMode !== 'gemini') {
                        setShowGeminiConfirmation(true);
                      }
                    }}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      aiMode === 'gemini'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <Zap className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs font-medium">Gemini</div>
                    <div className="text-[9px] opacity-70">LLM only</div>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {aiMode === 'heuristic' && 'Fast rule-based decisions. No API cost.'}
                  {aiMode === 'gemini' && 'All decisions powered by Gemini AI.'}
                  {aiMode === 'hybrid' && 'Tactical (heuristic 6s) + Strategic (Gemini 45s).'}
                </p>
              </div>
            )}

            {/* Gemini Mode Confirmation Modal */}
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
                      heuristic decisions (every 6s) with strategic Gemini insights (every 45s),
                      giving you the best of both worlds at lower API cost.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      <strong className="text-cyan-400">Gemini Only</strong> routes all decisions
                      through the LLM, which may be slower and more expensive.
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
                    Use Gemini Only
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

          {/* Footer */}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
