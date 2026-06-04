/**
 * ProductionTargetWidget Component
 *
 * On-screen UI widget showing countdown to daily production target.
 * Uses showProductionTarget toggle from aiConfigStore (default OFF).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { Target, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BAG_WEIGHT_KG } from '../types';

const DAILY_TARGET_BAGS = 5000;
const DAILY_TARGET_MASS = DAILY_TARGET_BAGS * BAG_WEIGHT_KG; // 125,000 kg = 125t
const SHIFT_END_HOUR = 18;

export const ProductionTargetWidget: React.FC = () => {
  const showProductionTarget = useAIConfigStore((state) => state.showProductionTarget);
  const metrics = useProductionStore((state) => state.metrics);
  const totalBagsProduced = useProductionStore((state) => state.totalBagsProduced);
  const gameTime = useGameSimulationStore((state) => state.gameTime);

  const targetData = useMemo(() => {
    // Current throughput is bags/hr
    const currentThroughputBags = metrics.throughput || 0;
    const currentThroughputMass = currentThroughputBags * BAG_WEIGHT_KG; // kg/hr

    // Use actual produced counts if available, otherwise estimate
    const currentMass = totalBagsProduced * BAG_WEIGHT_KG;

    const remainingMass = Math.max(0, DAILY_TARGET_MASS - currentMass);
    const hoursRemaining = Math.max(0.5, SHIFT_END_HOUR - gameTime);
    const requiredRateMass = remainingMass / hoursRemaining;

    const progress = Math.min(100, (currentMass / DAILY_TARGET_MASS) * 100);

    // Check if our current rate is enough to finish
    const isOnTrack = currentThroughputMass >= requiredRateMass * 0.95;
    const isBehind = currentThroughputMass < requiredRateMass * 0.8;

    const status: 'behind' | 'onTrack' | 'atRisk' = isBehind
      ? 'behind'
      : isOnTrack
        ? 'onTrack'
        : 'atRisk';

    return {
      producedMass: currentMass,
      remainingMass,
      hoursRemaining,
      requiredRateMass,
      currentRateMass: currentThroughputMass,
      progress,
      status,
    };
  }, [metrics.throughput, totalBagsProduced, gameTime]);

  // Keep the draggable widget within the viewport so it can never be dragged
  // off-screen (its only re-show path is a hidden keyboard shortcut). The widget
  // rests at bottom-4 right-4 and is w-72 (288px) wide; dragConstraints values
  // are pixel offsets allowed from that rest position. Height is conservatively
  // over-estimated so it can't quite reach the top edge (safe direction).
  const WIDGET_WIDTH = 288; // w-72
  const WIDGET_HEIGHT_ESTIMATE = 280; // conservative over-estimate
  const REST_INSET = 16; // bottom-4 / right-4
  const computeConstraints = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : WIDGET_WIDTH;
    const vh = typeof window !== 'undefined' ? window.innerHeight : WIDGET_HEIGHT_ESTIMATE;
    return {
      right: REST_INSET,
      bottom: REST_INSET,
      left: -Math.max(0, vw - WIDGET_WIDTH - REST_INSET),
      top: -Math.max(0, vh - REST_INSET - WIDGET_HEIGHT_ESTIMATE),
    };
  };
  const [dragConstraints, setDragConstraints] = useState(computeConstraints);
  useEffect(() => {
    const handleResize = () => setDragConstraints(computeConstraints());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!showProductionTarget) return null;

  const statusColors = {
    onTrack: {
      bg: 'bg-green-500/20',
      border: 'border-green-500/50',
      text: 'text-green-400',
      bar: 'bg-green-500',
    },
    atRisk: {
      bg: 'bg-yellow-500/20',
      border: 'border-yellow-500/50',
      text: 'text-yellow-400',
      bar: 'bg-yellow-500',
    },
    behind: {
      bg: 'bg-red-500/20',
      border: 'border-red-500/50',
      text: 'text-red-400',
      bar: 'bg-red-500',
    },
  };

  const colors = statusColors[targetData.status];

  const TrendIcon =
    targetData.status === 'onTrack'
      ? TrendingUp
      : targetData.status === 'behind'
        ? TrendingDown
        : Minus;

  return (
    <AnimatePresence>
      <motion.div
        role="region"
        aria-label="Production target tracker"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={dragConstraints}
        className={`fixed bottom-4 right-4 w-72 ${colors.bg} ${colors.border} border rounded-lg p-4 backdrop-blur-sm z-50`}
      >
        {/* Header - Drag Handle */}
        <div className="flex items-center justify-between mb-3 cursor-move select-none">
          <div className="flex items-center gap-2">
            <Target className={`w-5 h-5 ${colors.text}`} />
            <span className="text-white font-semibold text-sm">Production Target</span>
            <span className="text-[9px] text-slate-500">⋮⋮</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 text-xs">
              {targetData.hoursRemaining.toFixed(1)}h left
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(targetData.progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily production target progress"
          className="h-3 bg-slate-700 rounded-full overflow-hidden mb-3"
        >
          <motion.div
            className={`h-full ${colors.bar} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${targetData.progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-slate-400">
            Produced:{' '}
            <span className="text-white font-mono">
              {(targetData.producedMass / 1000).toFixed(1)}t
            </span>
          </div>
          <div className="text-slate-400">
            Target:{' '}
            <span className="text-white font-mono">{(DAILY_TARGET_MASS / 1000).toFixed(0)}t</span>
          </div>
          <div className="text-slate-400">
            Rate:{' '}
            <span className="text-white font-mono">
              {(targetData.currentRateMass / 1000).toFixed(1)} t/hr
            </span>
          </div>
          <div className="text-slate-400">
            Req:{' '}
            <span className={`font-mono ${colors.text}`}>
              {(targetData.requiredRateMass / 1000).toFixed(1)} t/hr
            </span>
          </div>
        </div>

        {/* Status indicator */}
        <div className={`mt-3 flex items-center justify-center gap-2 py-1.5 rounded ${colors.bg}`}>
          <TrendIcon className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-medium ${colors.text}`}>
            {targetData.status === 'onTrack'
              ? 'ON TRACK'
              : targetData.status === 'behind'
                ? 'BEHIND SCHEDULE'
                : 'AT RISK'}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
