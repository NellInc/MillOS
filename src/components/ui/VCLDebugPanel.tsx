/**
 * VCLDebugPanel Component
 *
 * Beautiful showcase of the VCP (Value Context Protocol) encoding system.
 * Shows side-by-side comparison of verbose text vs compact emoji encoding.
 * Demonstrates the 95%+ token savings when communicating factory state to Gemini.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Copy,
  Check,
  Zap,
  FileText,
  ArrowRight,
  Sparkles,
  Brain,
  AlertTriangle,
} from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore, useUIStore } from '../../stores';
import { encodeFactoryContextVCL } from '../../utils/vclEncoder';

// Example verbose text that VCL replaces
const VERBOSE_EXAMPLE = `Current Time: 2:30 PM, Afternoon Shift
Weather: Clear skies, good conditions
Production Line Status:
- Silos: 5 of 5 running at 65% average load
- Roller Mills: 6 of 6 operational, 78% avg load
- Plansifters: 3 of 3 active, 71% load
- Packers: 3 of 3 running at 82% load
Workforce: 8 workers on shift
- 2 Supervisors (both active)
- 3 Operators (2 working, 1 idle)
- 2 Technicians (both working)
- 1 QC Inspector (active)
Fatigue Level: Moderate (65% into shift)
Active Alerts: None`;

export const VCLDebugPanel: React.FC = () => {
  const showVCLDebug = useAIConfigStore((state) => state.showVCLDebug);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const workers = useProductionStore((state) => state.workers);
  const machines = useProductionStore((state) => state.machines);
  const alerts = useUIStore((state) => state.alerts);
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const weather = useGameSimulationStore((state) => state.weather);
  const currentShift = useGameSimulationStore((state) => state.currentShift);

  // Calculate shift progress (0-1 based on 8-hour shift)
  const shiftProgress = useMemo(() => {
    const shiftStart: Record<string, number> = { morning: 6, afternoon: 14, night: 22 };
    const start = shiftStart[currentShift] || 6;
    const elapsed = (gameTime - start + 24) % 24;
    return Math.min(1, Math.max(0, elapsed / 8));
  }, [gameTime, currentShift]);

  // Generate VCL encoding
  const vclEncoding = useMemo(() => {
    try {
      return encodeFactoryContextVCL(
        machines,
        workers,
        currentShift,
        weather,
        gameTime,
        shiftProgress,
        alerts.map((a) => ({ type: a.type }))
      );
    } catch {
      return 'Error encoding VCL';
    }
  }, [machines, workers, currentShift, weather, gameTime, shiftProgress, alerts]);

  // Calculate savings
  const verboseLength = VERBOSE_EXAMPLE.length;
  const vclLength = vclEncoding.length;
  const savingsPercent = Math.round((1 - vclLength / verboseLength) * 100);
  const tokensSaved = Math.round((verboseLength - vclLength) / 4); // ~4 chars per token

  const handleCopy = async () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      // No optional chaining: in an insecure/unsupported context navigator.clipboard
      // is undefined, and `await undefined` would resolve — falsely showing "Copied!".
      // Let the missing API throw so the catch shows "Copy failed".
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(vclEncoding);
      setCopyFailed(false);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      copyTimerRef.current = setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  if (!showVCLDebug) return null;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-purple-950/50 to-slate-900 rounded-xl border-2 border-cyan-400/40 overflow-hidden shadow-2xl shadow-cyan-500/10">
      {/* Premium Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between p-4 hover:bg-cyan-500/5 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-1 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 overflow-hidden">
            <img
              src={`${import.meta.env.BASE_URL}vcp-logo.png`}
              alt="VCP"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Value Context Protocol</span>
              <span className="text-[9px] px-2 py-0.5 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 text-emerald-300 rounded-full font-semibold text-center">
                {savingsPercent}% SAVED
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Compact emoji encoding for AI context
            </p>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-5 h-5 text-cyan-400" />
        </motion.div>
      </button>

      {/* Collapsed Preview - Always Show VCL */}
      {!expanded && (
        <div className="px-4 pb-4">
          <div className="bg-slate-950/80 rounded-xl p-4 border border-cyan-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-cyan-300 font-medium">Live Factory State</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400">{vclLength} chars</span>
            </div>
            <div className="font-mono text-lg text-white tracking-widest text-center py-2 select-all">
              {vclEncoding}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Hero Section */}
            <div className="px-4 py-3 bg-gradient-to-r from-cyan-950/50 to-purple-950/50 border-t border-b border-cyan-500/20">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    How It Works
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    VCP compresses factory context into semantic emoji strings, reducing API token
                    usage by <span className="text-emerald-400 font-bold">{savingsPercent}%</span>{' '}
                    while preserving full meaning for Gemini AI.
                  </p>
                </div>
                <button
                  onClick={() => setShowComparison(!showComparison)}
                  className={`flex-shrink-0 px-4 py-2 text-[10px] font-medium rounded-lg transition-all whitespace-nowrap ${
                    showComparison
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                  }`}
                >
                  {showComparison ? 'Hide' : 'Show'} Comparison
                </button>
              </div>
            </div>

            {/* Side-by-Side Comparison */}
            {showComparison && (
              <div className="px-4 py-3 grid grid-cols-2 gap-3">
                {/* Verbose Text */}
                <div className="bg-red-950/30 rounded-xl border border-red-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-950/50 border-b border-red-500/20">
                    <FileText className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-medium text-red-300">Traditional Text</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded ml-auto font-mono">
                      {verboseLength} chars
                    </span>
                  </div>
                  <pre className="p-3 text-[8px] font-mono text-red-200/70 leading-tight whitespace-pre-wrap break-words">
                    {VERBOSE_EXAMPLE}
                  </pre>
                </div>

                {/* VCP Encoded */}
                <div className="bg-emerald-950/30 rounded-xl border border-emerald-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/50 border-b border-emerald-500/20">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-300">VCP Encoded</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded ml-auto font-mono">
                      {vclLength} chars
                    </span>
                  </div>
                  <div className="p-3 flex flex-col items-center justify-center min-h-28">
                    <div className="font-mono text-xl text-white tracking-widest text-center">
                      {vclEncoding}
                    </div>
                    <p className="text-[9px] text-emerald-400/70 mt-2 text-center">
                      Same information, {savingsPercent}% fewer tokens
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Savings Stats */}
            <div className="px-4 py-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-slate-700/50 overflow-hidden">
                  <div className="text-xl font-bold text-emerald-400 truncate">
                    {savingsPercent}%
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">Size Reduction</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-slate-700/50 overflow-hidden">
                  <div className="text-xl font-bold text-cyan-400 truncate">~{tokensSaved}</div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">Tokens Saved</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-slate-700/50 overflow-hidden">
                  <div className="text-lg font-bold text-purple-400 truncate">
                    ${(((tokensSaved * 1000) / 1000000) * 0.075).toFixed(2)}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">Per 1K Requests</div>
                </div>
              </div>
            </div>

            {/* Live VCL Encoding */}
            <div className="px-4 pb-3">
              <div className="bg-slate-950/80 rounded-xl p-4 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-cyan-300 font-medium">Live Factory State</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 hover:bg-slate-600/50 rounded text-[10px] text-slate-300 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : copyFailed ? (
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-xl text-white tracking-widest text-center py-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  {vclEncoding}
                </div>
              </div>
            </div>

            {/* Emoji Legend */}
            <div className="px-4 pb-4">
              <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-bold text-white">Emoji Dictionary</span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px]">
                  {/* Time & Environment */}
                  <div>
                    <div className="text-cyan-400 font-semibold mb-1">Time & Environment</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>🌅 Morning | ☀️ Afternoon | 🌆 Evening | 🌙 Night</div>
                      <div>☀️ Clear | ☁️ Cloudy | 🌧️ Rain | ⛈️ Storm</div>
                    </div>
                  </div>

                  {/* Machines */}
                  <div>
                    <div className="text-purple-400 font-semibold mb-1">Machines & Status</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>🏛️ Silo | ⚙️ Mill | 🔀 Sifter | 📦 Packer</div>
                      <div>✅ Running | ⏸️ Idle | ⚠️ Warning | 🔴 Critical</div>
                    </div>
                  </div>

                  {/* Load Levels */}
                  <div>
                    <div className="text-emerald-400 font-semibold mb-1">Load Levels</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>🟢 &lt;50% | 🟡 50-80% | 🟠 80-90% | 🔴 &gt;90%</div>
                    </div>
                  </div>

                  {/* Workers */}
                  <div>
                    <div className="text-amber-400 font-semibold mb-1">Workers & Fatigue</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>👑 Supervisor | 🔧 Engineer | 👷 Operator | 🛠️ Tech</div>
                      <div>😊 Fresh | 😐 Moderate | 😴 Tired | 😵 Exhausted</div>
                    </div>
                  </div>
                </div>

                {/* Format Explanation */}
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="text-[10px] text-slate-400">
                    <span className="text-cyan-400 font-semibold">Format: </span>
                    <span className="font-mono bg-slate-900/50 px-1.5 py-0.5 rounded">
                      TIME|SHIFT|WEATHER | ZONE1→ZONE2→ZONE3→ZONE4 | WORKERS FATIGUE
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
