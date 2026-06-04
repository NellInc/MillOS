/**
 * VCLDiffPanel Component
 *
 * Shows side-by-side comparison of VCL encodings to debug
 * what changed between strategic decision contexts.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, RefreshCw, Copy, Check, X, GitCompare } from 'lucide-react';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore, useUIStore } from '../../stores';
import { encodeFactoryContextVCL } from '../../utils/vclEncoder';

export const VCLDiffPanel: React.FC = () => {
  const showVCLDebug = useAIConfigStore((state) => state.showVCLDebug);
  const [previousVCL, setPreviousVCL] = useState<string>('');
  const [currentVCL, setCurrentVCL] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
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

  // Generate current VCL and track changes
  useEffect(() => {
    const shiftStart: Record<string, number> = { morning: 6, afternoon: 14, night: 22 };
    const start = shiftStart[currentShift] || 6;
    const elapsed = (gameTime - start + 24) % 24;
    const shiftProgress = Math.min(1, Math.max(0, elapsed / 8));

    try {
      const newVCL = encodeFactoryContextVCL(
        machines,
        workers,
        currentShift,
        weather,
        gameTime,
        shiftProgress,
        alerts.map((a) => ({ type: a.type }))
      );

      // Only update if VCL changed
      if (newVCL !== currentVCL && currentVCL) {
        setPreviousVCL(currentVCL);
      }
      setCurrentVCL(newVCL);
    } catch {
      // Ignore encoding errors
    }
  }, [machines, workers, currentShift, weather, gameTime, alerts, currentVCL]);

  const handleCopy = async () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(
        `Previous:\n${previousVCL}\n\nCurrent:\n${currentVCL}`
      );
      setCopyFailed(false);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      copyTimerRef.current = setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  // Find differences between VCL strings
  const getDiffHighlights = () => {
    if (!previousVCL || !currentVCL) return { added: [], removed: [] };

    const prevChars = previousVCL.split('');
    const currChars = currentVCL.split('');

    const added: number[] = [];
    const removed: number[] = [];

    // Simple character-level diff
    currChars.forEach((char, i) => {
      if (i >= prevChars.length || char !== prevChars[i]) {
        added.push(i);
      }
    });

    prevChars.forEach((char, i) => {
      if (i >= currChars.length || char !== currChars[i]) {
        removed.push(i);
      }
    });

    return { added, removed };
  };

  if (!showVCLDebug) return null;

  const diff = getDiffHighlights();
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-slate-900/90 rounded-lg border border-indigo-500/30 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-indigo-500/10 border-b border-indigo-500/20">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-medium text-indigo-300">VCP Diff</span>
            {hasChanges && (
              <span className="px-1.5 py-0.5 rounded-full bg-green-500/20 text-[9px] text-green-400">
                {diff.added.length} changes
              </span>
            )}
          </div>
          <button
            onClick={handleCopy}
            aria-label={
              copied
                ? 'Copied VCP diff to clipboard'
                : copyFailed
                  ? 'Failed to copy VCP diff to clipboard'
                  : 'Copy VCP diff to clipboard'
            }
            className="p-1 hover:bg-indigo-500/20 rounded transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
            ) : copyFailed ? (
              <X className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Diff Content */}
        <div className="p-3 space-y-2">
          {previousVCL ? (
            <div className="grid grid-cols-2 gap-2">
              {/* Previous */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] text-red-400 uppercase">Previous</span>
                </div>
                <div className="font-mono text-[10px] text-slate-400 bg-slate-800/50 rounded p-2 break-all">
                  {previousVCL.split('').map((char, i) => (
                    <span
                      key={i}
                      className={diff.removed.includes(i) ? 'bg-red-500/30 text-red-300' : ''}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>

              {/* Current */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] text-green-400 uppercase">Current</span>
                  <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                </div>
                <div className="font-mono text-[10px] text-slate-300 bg-slate-800/50 rounded p-2 break-all">
                  {currentVCL.split('').map((char, i) => (
                    <span
                      key={i}
                      className={diff.added.includes(i) ? 'bg-green-500/30 text-green-300' : ''}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <RefreshCw className="w-5 h-5 text-slate-500 mx-auto mb-2" />
              <p className="text-[10px] text-slate-400">Waiting for VCP change...</p>
              <div className="font-mono text-[10px] text-slate-400 bg-slate-800/50 rounded p-2 mt-2 break-all">
                {currentVCL || 'No VCP yet'}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
