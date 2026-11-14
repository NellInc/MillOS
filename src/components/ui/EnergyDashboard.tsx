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
  ThermometerSun,
  Lightbulb,
  Factory,
  AlertTriangle,
  Wrench,
  Gauge,
  Server,
  Shield,
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
  getMachineEnergyDetailed,
  getSiteDemandKw,
  energyTariffPerKwh,
  isPeakTariffMinute,
  lineEnergyFactor,
} from '../../utils/energyCalculations';
import { MachineType } from '../../types';
import { formatFixed, formatGrouped, useT } from '../../i18n';
import { energyDashboardMessages } from './EnergyDashboard.messages';

const EnergyDashboardBody: React.FC = () => {
  const t = useT(energyDashboardMessages);
  const machines = useProductionStore((state) => state.machines);
  // The bill's above-100% penalty is keyed on the line rate (machineLoad lineOverdrive).
  const lineRate = useProductionStore((state) => state.productionSpeed);
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
    const machineStats = getMachineEnergyByType(machines, lineRate);
    const facilityLoad = getFacilityBaseLoad(gameTime);
    const emergencyLoad = getEmergencyLoad(facilityLoad);
    // The facility rows list what the headline bills: in an emergency, the
    // emergency share of each (getSiteDemandKw), as the machine rows read 0.
    const facilityRows = emergencyActive
      ? {
          lighting: emergencyLoad.lighting,
          hvac: emergencyLoad.hvac,
          other: emergencyLoad.baseSystems,
        }
      : facilityLoad;

    // Calculate totals
    const totalMachineEnergy = machines.reduce((sum, m) => sum + getMachineEnergy(m, lineRate), 0);

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

    // The machines on the load curve: a warning machine is still running, and
    // its demand follows its load.
    const runningMachines = machines.filter(
      (m) => m.status === 'running' || m.status === 'warning'
    );
    // The share of running demand they bill, from the energy model itself: a
    // unit with no feed falls below the working 70-100% curve toward standby.
    const avgDemandFactor =
      runningMachines.length > 0
        ? runningMachines.reduce(
            (sum, m) => sum + getMachineEnergyDetailed(m, lineRate).loadFactor,
            0
          ) / runningMachines.length
        : 0;

    // Total instantaneous demand: the same figure the campaign bills, with the
    // incident and Chronicle multipliers it is billed at, and unrounded.
    const totalEnergy =
      getSiteDemandKw(machines, gameTime, emergencyActive, lineRate) * energyMultiplier;

    // The tariff tickCampaign bills at this minute of the day (energyCalculations).
    const hour = ((gameTime % 24) + 24) % 24;
    const isPeakHours = isPeakTariffMinute(hour * 60);
    const rate = energyTariffPerKwh(hour * 60);
    const estimatedCostPerHour = totalEnergy * rate;

    return {
      machineStats,
      facilityRows,
      emergencyLoad,
      totalMachineEnergy,
      totalEnergy,
      warningCount,
      overdueCount,
      maintenanceDueCount,
      avgDemandFactor,
      onLoadCurveCount: runningMachines.length,
      isPeakHours,
      estimatedCostPerHour,
      rate,
      hour,
    };
  }, [machines, gameTime, emergencyActive, energyMultiplier, lineRate]);

  const formatNumber = (n: number, decimals = 1) => formatFixed(n, decimals);

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
      // At 1280 x 720 it covered the soundtrack bar and its last tiles went
      // under the dock. On a desktop it sits right of the left column, below
      // the HUD and any banner, and ends above the dock, scrolling in itself.
      // Working if it overlaps none of them at 1280 x 720 in either language.
      className="fixed left-4 bottom-20 z-40 max-h-[80vh] w-[21rem] overflow-y-auto rounded-xl border-emerald-500/30 millos-glass millos-glass-thick millos-glass-scroll lg:bottom-auto lg:left-[22rem] lg:top-28 lg:max-h-[calc(100dvh-14.5rem)]"
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
          {/* One line: the clock the HUD already shows and a grip glyph
              made Portuguese wrap it. The whole header is the handle. */}
          <span className="whitespace-nowrap text-sm font-medium text-white">{t('title')}</span>
        </div>
        <div className="flex items-center gap-2">
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
          {/* The figure's name, for screen readers: on screen the title and
              the emergency banner already say what it is. */}
          <div className="sr-only">
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
                    ? `${Math.round(metrics.avgDemandFactor * 100)}%`
                    : t('none')}
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                  // The figure printed above, not the motor load: 94% beside an 80% bar.
                  style={{ width: `${Math.round(metrics.avgDemandFactor * 100)}%` }}
                />
              </div>
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
            </div>

            {/* The line rate is the lever on this bill: above 100% a working unit
                draws more than its rating (the same factor the bill applies). */}
            <div
              className={`bg-slate-800/50 rounded-lg p-2 ${
                lineEnergyFactor(lineRate) > 1 ? 'border border-amber-500/30' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Gauge
                  className={`w-3 h-3 ${
                    lineEnergyFactor(lineRate) > 1 ? 'text-amber-400' : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-[10px] text-slate-400">{t('lineRate')}</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  lineEnergyFactor(lineRate) > 1 ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {t('lineRateValue', {
                  rate: formatFixed(lineRate * 100, 0),
                  factor: formatFixed(lineEnergyFactor(lineRate), 2),
                })}
              </div>
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
                <span className="text-slate-300">{t('lighting')}</span>
              </div>
              <span className="text-yellow-400 font-mono">
                {formatNumber(metrics.facilityRows.lighting)} kW
              </span>
            </div>

            {/* HVAC */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <ThermometerSun className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-slate-300">{t('hvac')}</span>
              </div>
              <span className="text-orange-400 font-mono">
                {formatNumber(metrics.facilityRows.hvac)} kW
              </span>
            </div>

            {/* Other */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-300">{t('other')}</span>
              </div>
              <span className="text-slate-400 font-mono">
                {formatNumber(metrics.facilityRows.other)} kW
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
                {t('tariff', { rate: formatFixed(metrics.rate, 2) })}
              </span>
            </span>
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
