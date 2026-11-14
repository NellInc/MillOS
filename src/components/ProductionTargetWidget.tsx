/**
 * ProductionTargetWidget Component
 *
 * On-screen UI widget tracking the running programme's committed tonnes, the
 * production target since D11 replaced the daily bag count.
 * Uses showProductionTarget toggle from aiConfigStore (default ON).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { workplaceOwnsGuidance } from '../simulation/workplaceImprovement';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { isTargetSlotHeld } from './productionTargetSlot';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { openProgramme } from '../stores/programmeCommitment';
import {
  Target,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  GripVertical,
  Truck,
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { BAG_WEIGHT_KG } from '../types';
import { formatFixed, useT } from '../i18n';
import { productionTargetWidgetMessages } from './ProductionTargetWidget.messages';

export const ProductionTargetWidget: React.FC = () => {
  const t = useT(productionTargetWidgetMessages);
  const onboarding = useAnnouncementsStore((state) => state.context.onboarding);
  const journeyVisible = useUIStore((state) => state.journeyVisible);
  const mobilePanelVisible = useMobileControlStore((state) => state.mobilePanelVisible);
  const workingAgreement = useWorkplaceStore((state) => workplaceOwnsGuidance(state.workplace));
  // Working if the current agreement owns the guidance slot without changing the saved target preference.
  const guidanceActive = isTargetSlotHeld({
    onboarding,
    journeyVisible,
    mobilePanelVisible,
    workingAgreement,
  });
  const showProductionTarget = useAIConfigStore((state) => state.showProductionTarget);
  const setShowProductionTarget = useAIConfigStore((state) => state.setShowProductionTarget);
  const metrics = useProductionStore((state) => state.metrics);
  // Flat, so a tick that rewrites the orders without changing it re-renders nothing.
  const programme = useOperationsCampaignStore(useShallow((state) => openProgramme(state.orders)));
  const elapsedMinutes = useOperationsCampaignStore((state) => state.elapsedMinutes);
  const hasProgramme = programme !== null;
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  // The order feed admits no grain once every open commitment's remainder is
  // packed (materialFlowStore), so the line stops until a truck takes it. Same
  // reading as the header's 'Line idle' chip (StatusHUD): the active order is
  // packed and the line is not pre-staging another one. Working if an idle,
  // fully packed order book reads as awaiting dispatch, never as behind.
  const orderBookPacked = useOperationsCampaignStore((state) => {
    const execution = state.execution;
    return (
      !!execution?.orderId &&
      execution.stage !== 'fulfilled' &&
      execution.remainingKg > 1 &&
      execution.finishedAvailableKg >= execution.remainingKg - 1 &&
      !execution.lineCustomer
    );
  });

  // The target is the running programme's committed tonnes (D11), not a day's
  // bags: stock packed for no customer counts for nothing, and the card shows
  // nothing at all when no programme is open. Pace is the campaign's own word
  // for it, an order of the programme gone late; a rate to midnight read
  // "behind" while every order was on time.
  // Working if the guided programme reads 0.0t of 18.0t, due in 4.0h.
  const targetData = useMemo(() => {
    if (!programme) return null;
    // The production metric is bags per game hour, the same clock as the
    // deadline (src/simulation/pace.ts), so it needs no pace conversion.
    const currentThroughputBags = metrics.throughput || 0;
    const paused = gameSpeed <= 0;
    const currentThroughputMass = paused ? 0 : currentThroughputBags * BAG_WEIGHT_KG;
    // Campaign minutes run on the game clock: the next order due, if not yet past.
    const hoursToDue = (programme.nextDueAtMinute - elapsedMinutes) / 60;

    // A line idle on a packed order book is waiting for a truck, not behind.
    const awaitingDispatch = orderBookPacked && currentThroughputBags <= 0;
    const status: 'paused' | 'awaitingDispatch' | 'behind' | 'onTrack' = programme.late
      ? 'behind'
      : paused
        ? 'paused'
        : awaitingDispatch
          ? 'awaitingDispatch'
          : 'onTrack';

    return {
      shippedT: programme.shippedT,
      committedT: programme.committedT,
      hoursToDue: Number.isFinite(hoursToDue) && hoursToDue > 0 ? hoursToDue : null,
      currentRateMass: currentThroughputMass,
      progress: programme.percent,
      status,
    };
  }, [programme, metrics.throughput, elapsedMinutes, gameSpeed, orderBookPacked]);

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
  // Only the header drags. A whole-card drag sets touch-action: none on the
  // card, so on a phone a swipe over the scrolling content moved the card
  // instead. Working if the content scrolls by touch and the header moves it.
  const dragControls = useDragControls();
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
  }, [computeConstraints, showProductionTarget, guidanceActive, hasProgramme]);

  // Close and the launcher replace each other, so pressing one removes the
  // focused element. Focus follows to its replacement, but only when one of
  // them was pressed: the T shortcut or a settings toggle keeps focus where it is,
  // unless it was on the control being removed (T pressed on the close button),
  // which would drop it to the page body.
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const focusReplacement = useRef(false);
  const toggleRef = useCallback(
    (slot: React.MutableRefObject<HTMLButtonElement | null>) =>
      (node: HTMLButtonElement | null) => {
        slot.current = node;
        if (!node) return;
        // Runs as React detaches the node, while it still holds focus.
        return () => {
          if (document.activeElement === node) focusReplacement.current = true;
          slot.current = null;
        };
      },
    []
  );
  const launcherCallbackRef = useMemo(() => toggleRef(launcherRef), [toggleRef]);
  const closeCallbackRef = useMemo(() => toggleRef(closeRef), [toggleRef]);
  useEffect(() => {
    if (!focusReplacement.current) return;
    focusReplacement.current = false;
    (showProductionTarget ? closeRef : launcherRef).current?.focus();
  }, [showProductionTarget]);
  // A guidance or work sheet taking the slot, or the programme closing, leaves
  // no replacement to focus.
  useEffect(() => {
    if (guidanceActive || !hasProgramme) focusReplacement.current = false;
  }, [guidanceActive, hasProgramme]);

  // Guidance and mobile work sheets own this lane without changing the target preference.
  // Working if their controls stay clear and dismissal restores the saved tracker state.
  // With no programme open there is no target, so no card and no launcher.
  if (guidanceActive || !targetData) return null;

  // Closed state: collapse to a small launcher pill at the same resting edge so the
  // tracker is always re-openable without needing the hidden `T` shortcut.
  if (!showProductionTarget) {
    return (
      <button
        ref={launcherCallbackRef}
        type="button"
        onClick={() => {
          focusReplacement.current = true;
          setShowProductionTarget(true);
        }}
        aria-label={t('showTracker')}
        // Short screens (a landscape phone): 30dvh up put it on the walk
        // D-pad (bottom-24 left-4); the corner below is clear of it and the dock.
        className="fixed bottom-[min(11rem,30dvh)] [@media(max-height:480px)]:bottom-4 left-4 z-30 flex items-center gap-2 millos-glass rounded-lg px-3 py-2 text-slate-200 transition-colors hover:bg-slate-800 pointer-events-auto"
      >
        <Target className="w-4 h-4 text-green-400" />
        <span className="text-xs font-medium">{t('launcher')}</span>
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
    awaitingDispatch: {
      bg: 'bg-sky-500/20',
      border: 'border-sky-400/50',
      text: 'text-sky-300',
      bar: 'bg-sky-400',
    },
    onTrack: {
      bg: 'bg-green-500/20',
      border: 'border-green-500/50',
      text: 'text-green-400',
      bar: 'bg-green-500',
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
        : targetData.status === 'awaitingDispatch'
          ? Truck
          : Minus;

  return (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        role="region"
        aria-label={t('trackerLabel')}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={dragConstraints}
        className={`fixed bottom-[min(11rem,30dvh)] left-4 max-h-[calc(100dvh-min(11rem,30dvh)-9rem)] overflow-y-auto w-72 max-w-[calc(100vw-2rem)] sm:max-w-[calc(50vw-2rem)] millos-glass millos-glass-thick millos-glass-scroll ${colors.border} rounded-lg p-4 z-30`}
      >
        {/* Header - Drag Handle */}
        <div
          data-drag-handle=""
          onPointerDown={(event) => dragControls.start(event)}
          className="flex flex-wrap items-center justify-between gap-2 mb-3 cursor-move select-none touch-none"
        >
          <div className="flex items-center gap-2">
            <Target className={`w-5 h-5 ${colors.text}`} />
            <span className="text-white font-semibold text-sm">{t('title')}</span>
            <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            {targetData.hoursToDue !== null && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-xs">
                  {targetData.hoursToDue < 1
                    ? t('dueInMinutes', {
                        minutes: formatFixed(
                          Math.max(1, Math.ceil(targetData.hoursToDue * 60 - 1e-7)),
                          0
                        ),
                      })
                    : t('dueInHours', { hours: formatFixed(targetData.hoursToDue, 1) })}
                </span>
              </div>
            )}
            <button
              ref={closeCallbackRef}
              type="button"
              onClick={() => {
                focusReplacement.current = true;
                setShowProductionTarget(false);
              }}
              onPointerDownCapture={(e) => e.stopPropagation()}
              aria-label={t('closeTracker')}
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
          aria-label={t('progressLabel')}
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
            {t('shipped')}{' '}
            <span className="text-white font-mono whitespace-nowrap">
              {t('tonnes', { value: formatFixed(targetData.shippedT, 1) })}
            </span>
          </div>
          <div className="text-slate-400">
            {t('target')}{' '}
            <span className="text-white font-mono whitespace-nowrap">
              {t('tonnes', { value: formatFixed(targetData.committedT, 1) })}
            </span>
          </div>
          <div className="col-span-2 text-slate-400">
            {t('rate')}{' '}
            <span className="text-white font-mono whitespace-nowrap">
              {t('ratePerGameHour', {
                value: formatFixed(targetData.currentRateMass / 1000, 1),
              })}
            </span>
          </div>
        </div>

        {/* Status indicator */}
        <div className={`mt-3 flex items-center justify-center gap-2 py-1.5 rounded ${colors.bg}`}>
          <TrendIcon className={`w-4 h-4 ${colors.text}`} />
          <span className={`text-sm font-medium ${colors.text}`}>
            {targetData.status === 'paused'
              ? t('statusPaused')
              : targetData.status === 'awaitingDispatch'
                ? t('statusAwaitingDispatch')
                : targetData.status === 'onTrack'
                  ? t('statusOnTrack')
                  : t('statusBehind')}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
