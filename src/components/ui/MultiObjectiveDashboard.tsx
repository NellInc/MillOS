/**
 * MultiObjectiveDashboard Component
 *
 * The running programme's shipped kilograms, the stamp packed now against the
 * line order's minimum, and site demand against the tariff and the line rate
 * the bill penalises above (plan item 7.9).
 * Toggle: Y key (default OFF)
 */

import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { Activity, Gauge, Zap, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { openProgramme } from '../../stores/programmeCommitment';
import { useChronicleStore } from '../../stores/chronicleStore';
import {
  energyTariffPerKwh,
  getSiteDemandKw,
  isPeakTariffMinute,
  lineEnergyFactor,
  OVERDRIVE_THRESHOLD_RATE,
} from '../../utils/energyCalculations';

import { formatFixed, formatGrouped, useT } from '../../i18n';
import { multiObjectiveDashboardMessages } from './MultiObjectiveDashboard.messages';

// `label` is the objective's identity (compared below); the visible name comes from the catalog.
type ObjectiveLabel = 'Production' | 'Quality' | 'Energy';
const OBJECTIVE_LABEL_KEYS = {
  Production: 'labelProduction',
  Quality: 'labelQuality',
  Energy: 'labelEnergy',
} as const satisfies Record<ObjectiveLabel, string>;

/**
 * Each objective's target is one a rule reads (plan item 7.9, owner's choice):
 * the programme's committed kilograms, the minimum of the order the line works
 * (dispatch reads it, meetsMinimum), and for energy the tariff the bill charges
 * now with the line rate above which it bills the overdrive penalty. The
 * 250 kW, carbon and 98% targets, and the blended score, were read by nothing.
 * Working if every objective named off target is one a rule would act on.
 */
interface ObjectiveMetric {
  label: ObjectiveLabel;
  value: number;
  unit: string;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down' | 'stable';
  /** Whether the rule behind the target is satisfied. */
  met: boolean;
  /** Bar fill, 0-100. */
  progress: number;
  /** The target, worded from the rule's own figures. */
  targetLines: string[];
}

// Static class lookup so Tailwind's JIT scanner sees full literal class strings.
// Interpolated classes (text-${color}-400) are not detectable and silently break.
const OBJECTIVE_COLORS: Record<string, { text: string; bar: string }> = {
  cyan: { text: 'text-cyan-400', bar: 'bg-cyan-500' },
  green: { text: 'text-green-400', bar: 'bg-green-500' },
  amber: { text: 'text-amber-400', bar: 'bg-amber-500' },
};
const DEFAULT_OBJECTIVE_COLOR = { text: 'text-cyan-400', bar: 'bg-cyan-500' };

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const MultiObjectiveDashboard: React.FC = () => {
  const showMultiObjective = useAIConfigStore((state) => state.showMultiObjective);
  // Open together, the two dashboards sit side by side right of the left column.
  const energyOpen = useAIConfigStore((state) => state.showEnergyDashboard);
  const metrics = useProductionStore((state) => state.metrics);
  const machines = useProductionStore((state) => state.machines);
  const lineRate = useProductionStore((state) => state.productionSpeed);
  // The production goal is the running programme's committed kilograms (D11).
  const programme = useOperationsCampaignStore(useShallow((state) => openProgramme(state.orders)));
  // The minimum of the order the line works: the figure dispatch holds flour to.
  const orderMinimum = useOperationsCampaignStore((state) => {
    const order = state.orders.find(
      (candidate) =>
        candidate.id === (state.execution.lineOrderId ?? state.activeOrderId) &&
        candidate.status !== 'fulfilled' &&
        candidate.status !== 'cancelled'
    );
    return order ? order.recipe.minimumQuality : null;
  });
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  // The multipliers the campaign bills at and the Energy dashboard shows.
  const incidentEnergy = useOperationsCampaignStore(
    (state) => state.getIncidentEffect().energyMultiplier
  );
  const wheatRecipe = useOperationsCampaignStore(
    (state) => state.getActiveProductionPlan()?.sourceMaterial === 'wheat_grain'
  );
  const chronicleEnergy = useChronicleStore(
    (state) => state.getEffect(wheatRecipe).energyMultiplier
  );
  const t = useT(multiObjectiveDashboardMessages);

  // Side by side with the sidebar open, the two dashboards reach under it at
  // 1280 px. So one closes: the sidebar opening closes this one, and opening
  // this one with the sidebar open closes the energy dashboard.
  // Working if the sidebar and two open dashboards never overlap.
  useEffect(() => {
    if (!showMultiObjective) return;
    const root = document.querySelector('[data-sidebar-visible]');
    if (!root) return;
    const sidebarOpen = () => root.getAttribute('data-sidebar-visible') === 'true';
    if (sidebarOpen() && useAIConfigStore.getState().showEnergyDashboard)
      useAIConfigStore.getState().setShowEnergyDashboard(false);
    const observer = new MutationObserver(() => {
      if (sidebarOpen() && useAIConfigStore.getState().showEnergyDashboard)
        useAIConfigStore.getState().setShowMultiObjective(false);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-sidebar-visible'] });
    return () => observer.disconnect();
  }, [showMultiObjective]);

  const objectives = useMemo<ObjectiveMetric[]>(() => {
    // Quality is the stamp packed now (metrics.quality), and a FAIL scores 0:
    // only a missing reading falls back, never a failed one.
    const quality = Number.isFinite(metrics.quality) ? metrics.quality : 95;
    const hour = Number.isFinite(gameTime) ? ((gameTime % 24) + 24) % 24 : 0;

    // The site's instantaneous demand (kW), the figure the Energy dashboard
    // shows and the campaign bills: machines at the line rate, standby and
    // facility load, times the incident and Chronicle energy multipliers.
    const energyKw =
      getSiteDemandKw(
        machines,
        Number.isFinite(gameTime) ? gameTime : 0,
        emergencyActive,
        lineRate
      ) *
      incidentEnergy *
      chronicleEnergy;
    const overdrive = lineEnergyFactor(lineRate);
    const energyMet = overdrive <= 1;

    // The production goal is the running programme: kilograms shipped of the
    // kilograms its customers committed (D11). On pace while no order of it is
    // late, the campaign's own word. With no programme open it is not shown.
    const production: ObjectiveMetric[] = programme
      ? [
          {
            label: 'Production',
            // Whole kilograms, rounded down: a part-shipped kilogram is not in.
            value: Math.floor(programme.shippedKg),
            unit: 'kg',
            icon: <Activity className="w-4 h-4" />,
            color: 'cyan',
            trend: programme.late ? 'down' : 'up',
            met: !programme.late,
            progress: clampPercent(
              (programme.shippedKg / Math.max(1, programme.committedKg)) * 100
            ),
            targetLines: [
              t('target', { target: formatGrouped(programme.committedKg), unit: 'kg' }),
            ],
          },
        ]
      : [];
    // With no order on the line there is no minimum to meet.
    const qualityObjective: ObjectiveMetric[] =
      orderMinimum !== null
        ? [
            {
              label: 'Quality',
              value: quality,
              unit: '',
              icon: <Gauge className="w-4 h-4" />,
              color: 'green',
              trend: quality >= orderMinimum ? 'up' : 'down',
              met: quality >= orderMinimum,
              progress: clampPercent((quality / Math.max(1, orderMinimum)) * 100),
              targetLines: [t('orderMinimum', { minimum: formatFixed(orderMinimum, 0) })],
            },
          ]
        : [];

    return [
      ...production,
      ...qualityObjective,
      {
        label: 'Energy',
        value: Math.round(energyKw * 10) / 10,
        unit: 'kW',
        icon: <Zap className="w-4 h-4" />,
        color: 'amber',
        trend: energyMet ? 'up' : 'down',
        met: energyMet,
        progress: clampPercent(100 / overdrive),
        targetLines: [
          t(isPeakTariffMinute(hour * 60) ? 'tariffPeak' : 'tariffOffPeak', {
            rate: formatFixed(energyTariffPerKwh(hour * 60), 2),
          }),
          t('overdriveLine', {
            threshold: formatFixed(OVERDRIVE_THRESHOLD_RATE * 100, 0),
            rate: formatFixed(lineRate * 100, 0),
            factor: formatFixed(overdrive, 2),
          }),
        ],
      },
    ];
  }, [
    metrics,
    machines,
    programme,
    orderMinimum,
    gameTime,
    emergencyActive,
    incidentEnergy,
    chronicleEnergy,
    lineRate,
    t,
  ]);

  // The summary names the objectives whose rule is not met, and only those.
  const offTarget = objectives.filter((obj) => !obj.met);

  if (!showMultiObjective) return null;

  return (
    <motion.div
      role="region"
      aria-label={t('regionLabel')}
      // Escape closes this before the tour or delivery guide behind it.
      data-escape-layer=""
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      // At 1280 x 720 it sat over the production tracker and the soundtrack
      // bar. Right of that column, below the HUD and any banner under it, and
      // above the dock, scrolling in itself; right of the energy dashboard
      // when that is open too. Working if it overlaps neither at 1280 x 720.
      className={`fixed left-4 top-20 z-40 max-h-[calc(100dvh-12.5rem)] w-64 overflow-y-auto rounded-xl border-purple-500/30 millos-glass millos-glass-thick millos-glass-scroll lg:top-28 lg:max-h-[calc(100dvh-14.5rem)] ${
        energyOpen ? 'lg:left-[43.5rem]' : 'lg:left-[22rem]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-sm font-medium text-white">{t('title')}</span>
        </div>
      </div>

      {/* Objectives Grid */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {objectives.map((obj) => {
          const colorClasses = OBJECTIVE_COLORS[obj.color] ?? DEFAULT_OBJECTIVE_COLOR;
          return (
            <div
              key={obj.label}
              className="bg-slate-800/50 rounded-lg p-2"
              data-progress={Math.round(obj.progress)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={colorClasses.text}>{obj.icon}</div>
                {obj.trend === 'up' ? (
                  <TrendingUp className="w-3 h-3 text-green-400" />
                ) : obj.trend === 'down' ? (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                ) : null}
              </div>
              <p className="text-[10px] text-slate-400 uppercase">
                {t(OBJECTIVE_LABEL_KEYS[obj.label])}
              </p>
              <p className={`text-sm font-mono font-bold ${colorClasses.text}`}>
                {formatGrouped(obj.value)}
                {obj.unit && (
                  <span className="text-[9px] font-normal text-slate-500 ml-0.5">{obj.unit}</span>
                )}
              </p>
              {/* Progress bar */}
              <div className="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${obj.progress}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-full ${colorClasses.bar} rounded-full`}
                />
              </div>
              {obj.targetLines.map((line) => (
                <p key={line} className="text-[8px] text-slate-500 mt-0.5">
                  {line}
                </p>
              ))}
            </div>
          );
        })}
      </div>

      {/* Trade-off Indicator */}
      <div className="px-3 pb-3">
        <div
          aria-live="polite"
          className={`p-2 rounded-lg text-[10px] ${
            offTarget.length === 0
              ? 'bg-green-500/10 text-green-300 border border-green-500/20'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
          }`}
        >
          {offTarget.length === 0
            ? t('onTarget')
            : t('offTarget', {
                objectives: offTarget.map((obj) => t(OBJECTIVE_LABEL_KEYS[obj.label])).join(', '),
              })}
        </div>
      </div>
    </motion.div>
  );
};
