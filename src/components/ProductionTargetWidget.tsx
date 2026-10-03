/**
 * ProductionTargetWidget Component
 *
 * On-screen UI widget showing countdown to daily production target.
 * Uses showProductionTarget toggle from aiConfigStore (default ON).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useProductionStore, DAILY_TARGET_BAGS } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import {
  Target,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  GripVertical,
  CheckCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BAG_WEIGHT_KG } from '../types';

const DAILY_TARGET_MASS = DAILY_TARGET_BAGS * BAG_WEIGHT_KG; // 30,000 kg = 30 t

export const ProductionTargetWidget: React.FC = () => {
  const onboarding = useAnnouncementsStore((state) => state.context.onboarding);
  const journeyVisible = useUIStore((state) => state.journeyVisible);
  const mobilePanelVisible = useMobileControlStore((state) => state.mobilePanelVisible);
  const workingAgreement = useWorkplaceStore(
    (state) => state.workplace.mode === 'game' && state.workplace.phase !== 'idle'
  );
  // Working if the current agreement owns the guidance slot without changing the saved target preference.
  const guidanceActive = onboarding || journeyVisible || mobilePanelVisible || workingAgreement;
  const showProductionTarget = useAIConfigStore((state) => state.showProductionTarget);
  const setShowProductionTarget = useAIConfigStore((state) => state.setShowProductionTarget);
  const metrics = useProductionStore((state) => state.metrics);
  const dailyBagsProduced = useProductionStore((state) => state.dailyBagsProduced);
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);

  const targetData = useMemo(() => {
    // The production metric is bags per real hour. The deadline follows the
    // game clock, so both rates here must use game hours, including at pause.
    const currentThroughputBags = metrics.throughput || 0;
    const paused = gameSpeed <= 0;
    const currentThroughputMass = paused ? 0 : (currentThroughputBags * BAG_WEIGHT_KG) / gameSpeed;

    // Today's production only - the counter resets at day rollover, so the
    // widget never locks at 100% after the first day.
    const currentMass = dailyBagsProduced * BAG_WEIGHT_KG;

    const remainingMass = Math.max(0, DAILY_TARGET_MASS - currentMass);
    // Hours until end-of-day (midnight rollover), when the daily counter
    // resets - not a fixed shift-end clamp that reads BEHIND all evening.
    const hoursRemaining = Math.max(1 / 3600, 24 - gameTime);
    const requiredRateMass = remainingMass / hoursRemaining;

    const progress = Math.min(100, (currentMass / DAILY_TARGET_MASS) * 100);

    // Check if our current rate is enough to finish
    const rateCoverage = requiredRateMass > 0 ? currentThroughputMass / requiredRateMass : 1;
    // Subtracting a fractional hour at 23:59 must not move the exact 80%
    // boundary across categories through floating-point roundoff.
    const isOnTrack = rateCoverage >= 0.95 - 1e-9;
    const isBehind = rateCoverage < 0.8 - 1e-9;

    // A met target needs 0 t/hr, which would otherwise read as merely ON TRACK.
    const status: 'met' | 'paused' | 'behind' | 'onTrack' | 'atRisk' =
      progress >= 100
        ? 'met'
        : paused
          ? 'paused'
          : isBehind
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
  }, [metrics.throughput, dailyBagsProduced, gameTime, gameSpeed]);

  // This background tracker stays below z-40 narration and playback.
  // Working if an overlapping reflection can be read and dismissed on mobile.
  // Keep the initial header/music lane clear at every width, reserving nine
  // rem above the card. Clamp its lower dock clearance on short viewports.
  // Working if playback stays clickable beside an expanded mobile tracker,
  // including 150% interface scale; measured drag bounds use the same anchor.
  const cardRef = useRef<HTMLDivElement>(null);
  const computeConstraints = useCallback(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 768;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const rem =
      typeof document === 'undefined'
        ? 16
        : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const rect = cardRef.current?.getBoundingClientRect();
    const narrow = vw < 640;
    const width = rect?.width || Math.min(18 * rem, (narrow ? vw : vw / 2) - 2 * rem);
    const rest = Math.min(11 * rem, vh * 0.3);
    const height = rect?.height || Math.min(280, Math.max(0, vh - rest - 9 * rem));
    const verticalTravel = Math.max(0, vh - rest - height - rem);
    return {
      left: -rem,
      bottom: rest - rem,
      right: Math.max(0, vw - width - rem),
      top: -verticalTravel,
    };
  }, []);
  const [dragConstraints, setDragConstraints] = useState(computeConstraints);
  useEffect(() => {
    const handleResize = () => setDragConstraints(computeConstraints());
    handleResize();
    window.addEventListener('resize', handleResize);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleResize);
    if (cardRef.current) observer?.observe(cardRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [computeConstraints, showProductionTarget, guidanceActive]);

  // Guidance and mobile work sheets own this lane without changing the target preference.
  // Working if their controls stay clear and dismissal restores the saved tracker state.
  if (guidanceActive) return null;

  // Closed state: collapse to a small launcher pill at the same resting edge so the
  // tracker is always re-openable without needing the hidden `T` shortcut.
  if (!showProductionTarget) {
    return (
      <button
        type="button"
        onClick={() => setShowProductionTarget(true)}
        aria-label="Show production target tracker"
        className="fixed bottom-[min(11rem,30dvh)] left-4 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-slate-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-800 pointer-events-auto"
      >
        <Target className="w-4 h-4 text-green-400" />
        <span className="text-xs font-medium">Target</span>
      </button>
    );
  }

  const statusColors = {
    paused: {
      bg: 'bg-slate-500/20',
      border: 'border-slate-400/50',
      text: 'text-slate-300',
      bar: 'bg-slate-400',
    },
    met: {
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-400/60',
      text: 'text-emerald-300',
      bar: 'bg-emerald-400',
    },
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
    targetData.status === 'met'
      ? CheckCircle
      : targetData.status === 'onTrack'
        ? TrendingUp
        : targetData.status === 'behind'
          ? TrendingDown
          : Minus;

  return (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        role="region"
        aria-label="Production target tracker"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={dragConstraints}
        className={`fixed bottom-[min(11rem,30dvh)] left-4 max-h-[calc(100dvh-min(11rem,30dvh)-9rem)] overflow-y-auto w-72 max-w-[calc(100vw-2rem)] sm:max-w-[calc(50vw-2rem)] bg-[#071722]/95 ${colors.border} border rounded-lg p-4 backdrop-blur-sm z-30`}
      >
        {/* Header - Drag Handle */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 cursor-move select-none">
          <div className="flex items-center gap-2">
            <Target className={`w-5 h-5 ${colors.text}`} />
            <span className="text-white font-semibold text-sm">Production Target</span>
            <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 text-xs">
                {targetData.hoursRemaining < 1
                  ? `${Math.max(1, Math.ceil(targetData.hoursRemaining * 60 - 1e-7))}m left`
                  : `${targetData.hoursRemaining.toFixed(1)}h left`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowProductionTarget(false)}
              onPointerDownCapture={(e) => e.stopPropagation()}
              aria-label="Close production target tracker"
              className="-m-2.5 -mr-3.5 p-3.5 rounded text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
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
            <span className="text-white font-mono whitespace-nowrap">
              {(targetData.producedMass / 1000).toFixed(1)}t
            </span>
          </div>
          <div className="text-slate-400">
            Target:{' '}
            <span className="text-white font-mono whitespace-nowrap">
              {(DAILY_TARGET_MASS / 1000).toFixed(0)}t
            </span>
          </div>
          <div className="col-span-2 text-slate-400">
            Rate:{' '}
            <span className="text-white font-mono whitespace-nowrap">
              {(targetData.currentRateMass / 1000).toFixed(1)} t/game h
            </span>
          </div>
          {targetData.status !== 'met' && (
            <div className="col-span-2 text-slate-400">
              Req:{' '}
              <span className={`font-mono whitespace-nowrap ${colors.text}`}>
                {(targetData.requiredRateMass / 1000).toFixed(1)} t/game h
              </span>
            </div>
          )}
        </div>

        {/* Status indicator */}
        <div className={`mt-3 flex items-center justify-center gap-2 py-1.5 rounded ${colors.bg}`}>
          <TrendIcon className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-medium ${colors.text}`}>
            {targetData.status === 'met'
              ? 'TARGET MET'
              : targetData.status === 'paused'
                ? 'PAUSED'
                : targetData.status === 'onTrack'
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
