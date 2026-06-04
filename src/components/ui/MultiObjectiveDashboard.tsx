/**
 * MultiObjectiveDashboard Component
 *
 * Displays competing production objectives as a radar-style visualization.
 * Tracks production rate, quality %, energy consumption, and carbon footprint.
 * Toggle: Y key (default OFF)
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Gauge, Zap, Leaf, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';

import { BAG_WEIGHT_KG } from '../../types';

interface ObjectiveMetric {
  label: string;
  value: number;
  target: number;
  unit: string;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down' | 'stable';
}

// Static class lookup so Tailwind's JIT scanner sees full literal class strings.
// Interpolated classes (text-${color}-400) are not detectable and silently break.
const OBJECTIVE_COLORS: Record<string, { text: string; bar: string }> = {
  cyan: { text: 'text-cyan-400', bar: 'bg-cyan-500' },
  green: { text: 'text-green-400', bar: 'bg-green-500' },
  amber: { text: 'text-amber-400', bar: 'bg-amber-500' },
  emerald: { text: 'text-emerald-400', bar: 'bg-emerald-500' },
};
const DEFAULT_OBJECTIVE_COLOR = { text: 'text-cyan-400', bar: 'bg-cyan-500' };

export const MultiObjectiveDashboard: React.FC = () => {
  const showMultiObjective = useAIConfigStore((state) => state.showMultiObjective);
  const metrics = useProductionStore((state) => state.metrics);
  const machines = useProductionStore((state) => state.machines);

  // Calculate metrics
  const objectives = useMemo<ObjectiveMetric[]>(() => {
    // Production rate (metrics.throughput is bags/hr)
    const productionRate = (metrics.throughput || 0) * BAG_WEIGHT_KG; // kg/hr
    const productionTarget = 30000; // Average for 2-3 packers (1200-1500 bags/hr * 25)

    // Quality (from metrics)
    const quality = metrics.quality || 95;
    const qualityTarget = 98;

    // Energy estimation (from machines)
    const MACHINE_ENERGY: Record<string, number> = {
      silo: 0.5,
      'roller-mill': 45,
      plansifter: 30,
      packer: 15,
    };

    let energyKwh = 0;
    for (const machine of machines) {
      if (machine.status === 'running') {
        const type = machine.id.includes('silo')
          ? 'silo'
          : machine.id.includes('rm-')
            ? 'roller-mill'
            : machine.id.includes('sifter')
              ? 'plansifter'
              : 'packer';
        const loadFactor = machine.metrics.load / 100;
        energyKwh += (MACHINE_ENERGY[type] || 20) * (0.3 + 0.7 * loadFactor);
      }
    }
    const energyTarget = 150; // kWh target

    // Carbon (derived from energy)
    const carbonKg = energyKwh * 0.4;
    const carbonTarget = 60; // kg CO₂/hr target

    return [
      {
        label: 'Production',
        value: productionRate,
        target: productionTarget,
        unit: 'kg/hr',
        icon: <Activity className="w-4 h-4" />,
        color: 'cyan',
        trend: productionRate >= productionTarget * 0.95 ? 'up' : 'down',
      },
      {
        label: 'Quality',
        value: quality,
        target: qualityTarget,
        unit: '%',
        icon: <Gauge className="w-4 h-4" />,
        color: 'green',
        trend: quality >= qualityTarget ? 'up' : quality >= 90 ? 'stable' : 'down',
      },
      {
        label: 'Energy',
        value: Math.round(energyKwh * 10) / 10,
        target: energyTarget,
        unit: 'kWh',
        icon: <Zap className="w-4 h-4" />,
        color: 'amber',
        trend: energyKwh <= energyTarget ? 'up' : 'down',
      },
      {
        label: 'Carbon',
        value: Math.round(carbonKg * 10) / 10,
        target: carbonTarget,
        unit: 'kg CO₂',
        icon: <Leaf className="w-4 h-4" />,
        color: 'emerald',
        trend: carbonKg <= carbonTarget ? 'up' : 'down',
      },
    ];
  }, [metrics, machines]);

  // Calculate overall score (weighted average)
  const overallScore = useMemo(() => {
    let score = 0;
    objectives.forEach((obj) => {
      const ratio =
        obj.label === 'Energy' || obj.label === 'Carbon'
          ? obj.target / Math.max(obj.value, 1) // Lower is better
          : obj.value / obj.target; // Higher is better
      score += Math.min(1, ratio) * 25; // 25% each
    });
    return Math.round(score);
  }, [objectives]);

  if (!showMultiObjective) return null;

  return (
    <motion.div
      role="region"
      aria-label="Multi-objective dashboard"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="fixed left-4 top-20 w-64 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-purple-500/30 shadow-xl z-40"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-sm font-medium text-white">Multi-Objective</span>
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-label={`Overall objective score ${overallScore} percent`}
          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            overallScore >= 80
              ? 'bg-green-500/20 text-green-400'
              : overallScore >= 60
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-red-500/20 text-red-400'
          }`}
        >
          {overallScore}%
        </div>
      </div>

      {/* Objectives Grid */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {objectives.map((obj) => {
          const percentage =
            obj.label === 'Energy' || obj.label === 'Carbon'
              ? Math.max(0, Math.min(100, 100 - ((obj.value - obj.target) / obj.target) * 100))
              : Math.min(100, (obj.value / obj.target) * 100);

          const colorClasses = OBJECTIVE_COLORS[obj.color] ?? DEFAULT_OBJECTIVE_COLOR;

          return (
            <div key={obj.label} className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className={colorClasses.text}>{obj.icon}</div>
                {obj.trend === 'up' ? (
                  <TrendingUp className="w-3 h-3 text-green-400" />
                ) : obj.trend === 'down' ? (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                ) : null}
              </div>
              <p className="text-[10px] text-slate-400 uppercase">{obj.label}</p>
              <p className={`text-sm font-mono font-bold ${colorClasses.text}`}>
                {obj.value.toLocaleString()}
                <span className="text-[9px] font-normal text-slate-500 ml-0.5">{obj.unit}</span>
              </p>
              {/* Progress bar */}
              <div className="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-full ${colorClasses.bar} rounded-full`}
                />
              </div>
              <p className="text-[8px] text-slate-500 mt-0.5">
                Target: {obj.target} {obj.unit}
              </p>
            </div>
          );
        })}
      </div>

      {/* Trade-off Indicator */}
      <div className="px-3 pb-3">
        <div
          aria-live="polite"
          className={`p-2 rounded-lg text-[10px] ${
            overallScore >= 80
              ? 'bg-green-500/10 text-green-300 border border-green-500/20'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
          }`}
        >
          {overallScore >= 80
            ? 'All objectives balanced optimally.'
            : 'Trade-off detected. Some objectives need attention.'}
        </div>
      </div>
    </motion.div>
  );
};
