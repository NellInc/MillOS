/**
 * VCLDebugPanel Component
 *
 * Beautiful showcase of the VCP (Value Context Protocol) encoding system.
 * Shows side-by-side comparison of expanded telemetry vs compact glyph encoding.
 * Demonstrates a compact context format. The live strategic prompt currently
 * uses structured telemetry, so this comparison is illustrative.
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
import { formatFixed, useT } from '../../i18n';
import { vclDebugPanelMessages } from './VCLDebugPanel.messages';

export const VCLDebugPanel: React.FC = () => {
  const t = useT(vclDebugPanelMessages);
  // Example verbose text that VCL replaces, resolved in the active language.
  const verboseExample = t('verboseExample');
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

  const machines = useProductionStore((state) => state.machines);
  const alerts = useUIStore((state) => state.alerts);
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const weather = useGameSimulationStore((state) => state.weather);
  const currentShift = useGameSimulationStore((state) => state.currentShift);

  // Generate VCL encoding (null when encoding fails, so the error text follows the language)
  const encodedVCL = useMemo(() => {
    try {
      return encodeFactoryContextVCL(
        machines,
        currentShift,
        weather,
        gameTime,
        alerts.map((a) => ({ type: a.type }))
      );
    } catch {
      return null;
    }
  }, [machines, currentShift, weather, gameTime, alerts]);
  const vclEncoding = encodedVCL ?? t('encodingError');

  // Calculate savings
  const verboseLength = verboseExample.length;
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
                {t('savedBadge', { percent: formatFixed(savingsPercent, 0) })}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{t('subtitle')}</p>
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
              <span className="text-xs text-cyan-300 font-medium">{t('liveFactoryState')}</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400">
                {t('chars', { count: formatFixed(vclLength, 0) })}
              </span>
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
                    {t('howItWorks')}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t('howItWorksBefore')}{' '}
                    <span className="text-emerald-400 font-bold">
                      {formatFixed(savingsPercent, 0)}%
                    </span>{' '}
                    {t('howItWorksAfter')}
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
                  {showComparison ? t('hideComparison') : t('showComparison')}
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
                    <span className="text-xs font-medium text-red-300">{t('traditionalText')}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded ml-auto font-mono">
                      {t('chars', { count: formatFixed(verboseLength, 0) })}
                    </span>
                  </div>
                  <pre className="p-3 text-[8px] font-mono text-red-200/70 leading-tight whitespace-pre-wrap break-words">
                    {verboseExample}
                  </pre>
                </div>

                {/* VCP Encoded */}
                <div className="bg-emerald-950/30 rounded-xl border border-emerald-500/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/50 border-b border-emerald-500/20">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-300">{t('vcpEncoded')}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded ml-auto font-mono">
                      {t('chars', { count: formatFixed(vclLength, 0) })}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col items-center justify-center min-h-28">
                    <div className="font-mono text-xl text-white tracking-widest text-center">
                      {vclEncoding}
                    </div>
                    <p className="text-[9px] text-emerald-400/70 mt-2 text-center">
                      {t('sameInformation', { percent: formatFixed(savingsPercent, 0) })}
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
                    {formatFixed(savingsPercent, 0)}%
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">
                    {t('sizeReduction')}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-slate-700/50 overflow-hidden">
                  <div className="text-xl font-bold text-cyan-400 truncate">
                    ~{formatFixed(tokensSaved, 0)}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">
                    {t('tokensSaved')}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2 text-center border border-slate-700/50 overflow-hidden">
                  <div className="text-lg font-bold text-purple-400 truncate">{t('example')}</div>
                  <div className="text-[8px] text-slate-400 mt-0.5 truncate">
                    {t('notLiveSavings')}
                  </div>
                </div>
              </div>
            </div>

            {/* Live VCL Encoding */}
            <div className="px-4 pb-3">
              <div className="bg-slate-950/80 rounded-xl p-4 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-cyan-300 font-medium">
                      {t('liveFactoryState')}
                    </span>
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
                    {copied ? t('copied') : copyFailed ? t('copyFailed') : t('copy')}
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
                  <span className="text-xs font-bold text-white">{t('emojiDictionary')}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px]">
                  {/* Time & Environment */}
                  <div>
                    <div className="text-cyan-400 font-semibold mb-1">{t('timeEnvironment')}</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>
                        {[
                          `🌅 ${t('morning')}`,
                          `☀️ ${t('afternoon')}`,
                          `🌆 ${t('evening')}`,
                          `🌙 ${t('night')}`,
                        ].join(' | ')}
                      </div>
                      <div>
                        {[
                          `☀️ ${t('clear')}`,
                          `☁️ ${t('cloudy')}`,
                          `🌧️ ${t('rain')}`,
                          `⛈️ ${t('storm')}`,
                        ].join(' | ')}
                      </div>
                    </div>
                  </div>

                  {/* Machines */}
                  <div>
                    <div className="text-purple-400 font-semibold mb-1">{t('machinesStatus')}</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>
                        {[
                          `🏛️ ${t('silo')}`,
                          `⚙️ ${t('mill')}`,
                          `🔀 ${t('sifter')}`,
                          `📦 ${t('packer')}`,
                        ].join(' | ')}
                      </div>
                      <div>
                        {[
                          `✅ ${t('running')}`,
                          `⏸️ ${t('idle')}`,
                          `⚠️ ${t('warning')}`,
                          `🔴 ${t('critical')}`,
                        ].join(' | ')}
                      </div>
                    </div>
                  </div>

                  {/* Load Levels */}
                  <div>
                    <div className="text-emerald-400 font-semibold mb-1">{t('loadLevels')}</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>🟢 &lt;50% | 🟡 50-80% | 🟠 80-90% | 🔴 &gt;90%</div>
                    </div>
                  </div>

                  {/* Control and alarms */}
                  <div>
                    <div className="text-amber-400 font-semibold mb-1">{t('controlAlarms')}</div>
                    <div className="space-y-0.5 text-slate-300">
                      <div>
                        {[
                          `🧠 ${t('control')}`,
                          `✅ ${t('alarmsClear')}`,
                          `🚨 ${t('criticalAlarmCount')}`,
                        ].join(' | ')}
                      </div>
                      <div>
                        {[`WA ${t('morning')}`, `WB ${t('afternoon')}`, `WC ${t('night')}`].join(
                          ' | '
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Format Explanation */}
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="text-[10px] text-slate-400">
                    <span className="text-cyan-400 font-semibold">{t('format')}</span>
                    <span className="font-mono bg-slate-900/50 px-1.5 py-0.5 rounded">
                      {t('formatSpec')}
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
