/**
 * EnergyDashboard Component
 *
 * Comprehensive real-time energy usage display with:
 * - Machine energy breakdown by type (Running/Idle)
 * - Energy modifiers (Load Factor, Warning) and service need from wear
 * - Facility base load with time-of-day transitions
 * - Emergency mode indicator
 *
 * Toggle: U key (default OFF)
 */

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import {
  Zap,
  Sun,
  Moon,
  Wind,
  ThermometerSun,
  Lightbulb,
  Factory,
  Leaf,
  AlertTriangle,
  Wrench,
  Gauge,
  Server,
  Shield,
  GripVertical,
  X,
} from 'lucide-react';
import {
  getWearConfig,
  minimumServiceWear,
  useProductionStore,
} from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  MACHINE_ENERGY_CONSUMPTION,
  MACHINE_TYPE_LABELS,
  getMachineEnergyByType,
  getFacilityBaseLoad,
  getEmergencyLoad,
  getMachineEnergy,
  getSiteDemandKw,
  SIMULATED_GRID_INTENSITY_KG_PER_KWH,
} from '../../utils/energyCalculations';
import { MachineType } from '../../types';
import { formatFixed, formatGrouped, useT } from '../../i18n';
import { energyDashboardMessages } from './EnergyDashboard.messages';

const EnergyDashboardBody: React.FC = () => {
  const t = useT(energyDashboardMessages);
  const machines = useProductionStore((state) => state.machines);
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  // The multipliers UnifiedGameTick and tickCampaign apply before billing.
  const incidentEnergy = useOperationsCampaignStore(
    (state) => state.getIncidentEffect().energyMultiplier
  );
  const wheatRecipe = useOperationsCampaignStore(
    (state) => state.getActiveProductionPlan()?.sourceMaterial === 'wheat_grain'
  );
  const chronicleEnergy = useChronicleStore(
    (state) => state.getEffect(wheatRecipe).energyMultiplier
  );
  const energyMultiplier = incidentEnergy * chronicleEnergy;

  // Closing (its X, Escape, U) unmounts the panel. With focus inside, it would
  // drop to the page body, so it goes back to whatever had it when the panel
  // opened (the settings toggle, a dock button), while that is still there.
  // A layout cleanup runs before the panel leaves the document.
  const regionRef = useRef<HTMLDivElement>(null);
  // Only the header drags: a whole-panel drag sets touch-action: none, so on a
  // phone the panel's scrolling content could not be swiped.
  const dragControls = useDragControls();
  useLayoutEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const region = regionRef.current;
    return () => {
      if (!region?.contains(document.activeElement) || !opener?.isConnected) return;
      if (region.contains(opener)) return;
      opener.focus({ preventScroll: true });
    };
  }, []);

  // Calculate comprehensive energy metrics
  const metrics = useMemo(() => {
    const machineStats = getMachineEnergyByType(machines);
    const facilityLoad = getFacilityBaseLoad(gameTime);
    const emergencyLoad = getEmergencyLoad(facilityLoad);

    // Calculate totals
    const totalMachineEnergy = machines.reduce((sum, m) => sum + getMachineEnergy(m), 0);

    // Count machines with modifiers
    const warningCount = machines.filter((m) => m.status === 'warning').length;
    // Service need from wear, the figure the wear tick writes (nothing writes
    // maintenanceCountdown): due from the service point, where efficiency starts
    // to fall and Maintain is offered; overdue from the warning threshold.
    let overdueCount = 0;
    let maintenanceDueCount = 0;
    for (const m of machines) {
      const wear = m.metrics?.wear;
      if (typeof wear !== 'number' || !Number.isFinite(wear)) continue;
      if (wear >= getWearConfig(m.type).warningThreshold) overdueCount++;
      else if (wear >= minimumServiceWear(m.type)) maintenanceDueCount++;
    }

    // Average load factor for the machines on the load curve: a warning
    // machine is still running, and its demand follows its load.
    const runningMachines = machines.filter(
      (m) => m.status === 'running' || m.status === 'warning'
    );
    const avgLoadFactor =
      runningMachines.length > 0
        ? runningMachines.reduce((sum, m) => sum + m.metrics.load, 0) / runningMachines.length
        : 0;

    // Total instantaneous demand: the same figure the campaign bills, with the
    // incident and Chronicle multipliers it is billed at, and unrounded.
    const totalEnergy = getSiteDemandKw(machines, gameTime, emergencyActive) * energyMultiplier;

    // Peak hours: 9 AM - 9 PM
    const hour = ((gameTime % 24) + 24) % 24;
    const isPeakHours = hour >= 9 && hour <= 21;

    // Cost: Peak = $0.15/kWh, Off-peak = $0.08/kWh
    const rate = isPeakHours ? 0.15 : 0.08;
    const estimatedCostPerHour = totalEnergy * rate;

    // Scenario estimate. This is an explicit simulation factor, not live grid data.
    const carbonKg = totalEnergy * SIMULATED_GRID_INTENSITY_KG_PER_KWH;

    return {
      machineStats,
      facilityLoad,
      emergencyLoad,
      totalMachineEnergy,
      totalEnergy,
      warningCount,
      overdueCount,
      maintenanceDueCount,
      avgLoadFactor,
      onLoadCurveCount: runningMachines.length,
      isPeakHours,
      estimatedCostPerHour,
      carbonKg,
      hour,
    };
  }, [machines, gameTime, emergencyActive, energyMultiplier]);

  const formatNumber = (n: number, decimals = 1) => formatFixed(n, decimals);
  const formatTime = (hour: number) => {
    // Whole minutes, floored: rounding the fraction showed 'HH:60' near the hour.
    const total = Math.floor(hour * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      ref={regionRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.1}
      role="region"
      aria-label={t('regionLabel')}
      // Escape closes this before the tour or delivery guide behind it.
      data-escape-layer=""
      className="fixed left-4 bottom-20 w-80 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-emerald-500/30 shadow-xl z-40 max-h-[80vh] overflow-y-auto"
    >
      {/* Header - Drag Handle */}
      <div
        data-drag-handle=""
        onPointerDown={(event) => dragControls.start(event)}
        className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 cursor-move select-none touch-none sticky top-0 bg-slate-900/95 backdrop-blur-xl z-10"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-sm font-medium text-white">{t('title')}</span>
          <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-mono">{formatTime(metrics.hour)}</span>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
              metrics.isPeakHours
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {metrics.isPeakHours ? (
              <>
                <Sun className="w-3 h-3" /> {t('peak')}
              </>
            ) : (
              <>
                <Moon className="w-3 h-3" /> {t('offPeak')}
              </>
            )}
          </div>
          <button
            type="button"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={() => useAIConfigStore.getState().setShowEnergyDashboard(false)}
            aria-label={t('close')}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/50"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Emergency Mode Banner */}
        {emergencyActive && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/40">
            <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
              <Shield className="w-4 h-4" />
              {t('emergencyActive')}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.lighting)} kW
                </div>
                <div className="text-slate-400">{t('emergencyLighting')}</div>
              </div>
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.hvac)} kW
                </div>
                <div className="text-slate-400">{t('emergencyHvac')}</div>
              </div>
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.baseSystems)} kW
                </div>
                <div className="text-slate-400">{t('baseSystems')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Total Energy */}
        <div className="text-center">
          <div
            className={`text-3xl font-bold ${emergencyActive ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {formatNumber(metrics.totalEnergy)}
            <span className="text-sm font-normal text-slate-400 ml-1">kW</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {emergencyActive ? t('emergencyDemand') : t('currentDemand')}
          </div>
        </div>

        {/* Machine Energy by Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Factory className="w-3.5 h-3.5 text-cyan-400" />
            {t('machineDemand')}
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th scope="col" className="text-left py-1.5 px-2 text-slate-400 font-normal">
                    {t('colType')}
                  </th>
                  <th scope="col" className="text-center py-1.5 px-1 text-green-400 font-normal">
                    {t('colRunning')}
                  </th>
                  <th scope="col" className="text-center py-1.5 px-1 text-slate-500 font-normal">
                    {t('colIdle')}
                  </th>
                  <th scope="col" className="text-right py-1.5 px-2 text-cyan-400 font-normal">
                    {t('colNow')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.values(MachineType).map((type) => {
                  const consumption = MACHINE_ENERGY_CONSUMPTION[type];
                  if (!consumption) return null;
                  const stat = metrics.machineStats.find((s) => s.type === type);
                  const count = stat ? stat.runningCount + stat.idleCount + stat.warningCount : 0;

                  return (
                    <tr key={type} className="border-b border-slate-700/30 last:border-0">
                      <td className="py-1.5 px-2 text-slate-300">
                        {MACHINE_TYPE_LABELS[type]}
                        {count > 0 && <span className="text-slate-500 ml-1">({count})</span>}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-green-400/70">
                        {formatGrouped(consumption.running)}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-slate-500">
                        {formatGrouped(consumption.idle)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-cyan-400">
                        {/* An emergency bills facility load only (getSiteDemandKw). */}
                        {stat && !emergencyActive
                          ? formatNumber(stat.totalEnergy)
                          : formatNumber(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Energy Modifiers */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Gauge className="w-3.5 h-3.5 text-purple-400" />
            {t('energyModifiers')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Load Factor */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">{t('loadFactor')}</span>
                <span className="text-[10px] font-mono text-blue-400">
                  {metrics.onLoadCurveCount > 0
                    ? `${Math.round(70 + (metrics.avgLoadFactor / 100) * 30)}%`
                    : t('none')}
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                  style={{ width: `${metrics.avgLoadFactor}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-400 mt-1">{t('loadFactorRange')}</div>
            </div>

            {/* Warning Status */}
            <div
              className={`bg-slate-800/50 rounded-lg p-2 ${
                metrics.warningCount > 0 ? 'border border-amber-500/30' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle
                  className={`w-3 h-3 ${
                    metrics.warningCount > 0 ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-[10px] text-slate-400">{t('warningStatus')}</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.warningCount > 0 ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                {metrics.warningCount > 0
                  ? t('warningPenalty', { count: formatFixed(metrics.warningCount, 0) })
                  : t('none')}
              </div>
              <div className="text-[9px] text-slate-400">{t('inefficient')}</div>
            </div>

            {/* Maintenance Due */}
            <div
              className={`bg-slate-800/50 rounded-lg p-2 ${
                metrics.maintenanceDueCount > 0 ? 'border border-yellow-500/30' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Wrench
                  className={`w-3 h-3 ${
                    metrics.maintenanceDueCount > 0 ? 'text-yellow-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-[10px] text-slate-400">{t('maintenanceDue')}</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.maintenanceDueCount > 0 ? 'text-yellow-400' : 'text-slate-500'
                }`}
              >
                {/* A count, not a percentage: the bill charges no penalty for wear. */}
                {metrics.maintenanceDueCount > 0
                  ? formatFixed(metrics.maintenanceDueCount, 0)
                  : t('none')}
              </div>
              <div className="text-[9px] text-slate-400">{t('pastServicePoint')}</div>
            </div>

            {/* Overdue Maintenance */}
            <div
              className={`bg-slate-800/50 rounded-lg p-2 ${
                metrics.overdueCount > 0 ? 'border border-red-500/30' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Wrench
                  className={`w-3 h-3 ${
                    metrics.overdueCount > 0 ? 'text-red-400' : 'text-slate-500'
                  }`}
                />
                <span className="text-[10px] text-slate-400">{t('overdue')}</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.overdueCount > 0 ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {metrics.overdueCount > 0 ? formatFixed(metrics.overdueCount, 0) : t('none')}
              </div>
              <div className="text-[9px] text-slate-400">{t('pastWarningWear')}</div>
            </div>

            {/* The incident and Chronicle factor the headline is billed at; without
                it the parts below did not add up to the demand above. */}
            {Math.abs(energyMultiplier - 1) > 1e-6 && (
              <div className="col-span-2 flex items-center justify-between bg-slate-800/50 rounded-lg p-2 border border-sky-500/30">
                <span className="text-[10px] text-slate-400">{t('siteConditions')}</span>
                <span className="text-sm font-mono text-sky-400">
                  {t('siteFactor', { value: formatFixed(energyMultiplier, 2) })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Facility Base Load */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Server className="w-3.5 h-3.5 text-orange-400" />
            {t('facilityBaseLoad')}
          </div>
          <div className="space-y-2">
            {/* Lighting */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                <div>
                  <span className="text-slate-300">{t('lighting')}</span>
                  <div className="text-[9px] text-slate-400">{t('lightingRange')}</div>
                </div>
              </div>
              <span className="text-yellow-400 font-mono">
                {formatNumber(metrics.facilityLoad.lighting)} kW
              </span>
            </div>

            {/* HVAC */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <ThermometerSun className="w-3.5 h-3.5 text-orange-400" />
                <div>
                  <span className="text-slate-300">{t('hvac')}</span>
                  <div className="text-[9px] text-slate-400">{t('hvacCurve')}</div>
                </div>
              </div>
              <span className="text-orange-400 font-mono">
                {formatNumber(metrics.facilityLoad.hvac)} kW
              </span>
            </div>

            {/* Other */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <span className="text-slate-300">{t('other')}</span>
                  <div className="text-[9px] text-slate-400">{t('otherDetail')}</div>
                </div>
              </div>
              <span className="text-slate-400 font-mono">
                {formatNumber(metrics.facilityLoad.other)} kW
              </span>
            </div>
          </div>
        </div>

        {/* Cost & Carbon */}
        <div className="pt-2 border-t border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{t('simulationCost')}</span>
            <span
              className={`font-mono ${metrics.isPeakHours ? 'text-amber-400' : 'text-emerald-400'}`}
            >
              {t('costPerHour', { value: formatNumber(metrics.estimatedCostPerHour, 2) })}
              <span className="text-[9px] text-slate-400 ml-1">
                {t('tariff', { rate: formatFixed(metrics.isPeakHours ? 0.15 : 0.08, 2) })}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Leaf className="w-3 h-3 text-green-400" />
              <span className="text-slate-400">{t('scenarioCarbon')}</span>
            </div>
            <span className="text-green-400 font-mono">
              {formatNumber(metrics.carbonKg)} kg CO₂
            </span>
          </div>
          <div className="text-[9px] text-slate-500 text-right">
            {t('simulationFactor', { value: formatFixed(SIMULATED_GRID_INTENSITY_KG_PER_KWH, 2) })}
          </div>
        </div>

        {/* Sustainability Tip */}
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-start gap-2">
            <Wind className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-emerald-300">
              {emergencyActive
                ? t('tipEmergency')
                : metrics.isPeakHours
                  ? t('tipPeak')
                  : t('tipOffPeak')}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Always mounted (DeferredOperationalUI) but off by default: keep the tick-rate
// subscriptions and metric walks in the body so a hidden dashboard costs nothing.
export const EnergyDashboard: React.FC = () => {
  const show = useAIConfigStore((state) => state.showEnergyDashboard);
  return show ? <EnergyDashboardBody /> : null;
};
