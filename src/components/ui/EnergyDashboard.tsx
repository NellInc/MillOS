/**
 * EnergyDashboard Component
 *
 * Comprehensive real-time energy usage display with:
 * - Machine energy breakdown by type (Running/Idle)
 * - Energy modifiers (Load Factor, Warning, Maintenance penalties)
 * - Facility base load with time-of-day transitions
 * - Emergency mode indicator
 *
 * Toggle: U key (default OFF)
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import {
  MACHINE_ENERGY_CONSUMPTION,
  MACHINE_TYPE_LABELS,
  getMachineEnergyByType,
  getFacilityBaseLoad,
  getEmergencyLoad,
  getMachineEnergy,
} from '../../utils/energyCalculations';
import { MachineType } from '../../types';

export const EnergyDashboard: React.FC = () => {
  const showEnergyDashboard = useAIConfigStore((state) => state.showEnergyDashboard);
  const machines = useProductionStore((state) => state.machines);
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);

  // Calculate comprehensive energy metrics
  const metrics = useMemo(() => {
    const machineStats = getMachineEnergyByType(machines);
    const facilityLoad = getFacilityBaseLoad(gameTime);
    const emergencyLoad = getEmergencyLoad(facilityLoad);

    // Calculate totals
    const totalMachineEnergy = machines.reduce((sum, m) => sum + getMachineEnergy(m), 0);

    // Count machines with modifiers
    const warningCount = machines.filter((m) => m.status === 'warning').length;
    const overdueCount = machines.filter(
      (m) => m.maintenanceCountdown !== undefined && m.maintenanceCountdown <= 0
    ).length;
    const maintenanceDueCount = machines.filter(
      (m) =>
        m.maintenanceCountdown !== undefined &&
        m.maintenanceCountdown > 0 &&
        m.maintenanceCountdown < 24
    ).length;

    // Average load factor for running machines
    const runningMachines = machines.filter((m) => m.status === 'running');
    const avgLoadFactor =
      runningMachines.length > 0
        ? runningMachines.reduce((sum, m) => sum + m.metrics.load, 0) / runningMachines.length
        : 0;

    // Total energy calculation
    const totalEnergy = emergencyActive
      ? emergencyLoad.total
      : Math.round(totalMachineEnergy + facilityLoad.total);

    // Peak hours: 9 AM - 9 PM
    const hour = ((gameTime % 24) + 24) % 24;
    const isPeakHours = hour >= 9 && hour <= 21;

    // Cost: Peak = $0.15/kWh, Off-peak = $0.08/kWh
    const rate = isPeakHours ? 0.15 : 0.08;
    const estimatedCostPerHour = totalEnergy * rate;

    // Carbon footprint: ~0.4 kg CO2 per kWh (UK grid average)
    const carbonKg = totalEnergy * 0.4;

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
      isPeakHours,
      estimatedCostPerHour,
      carbonKg,
      hour,
    };
  }, [machines, gameTime, emergencyActive]);

  if (!showEnergyDashboard) return null;

  const formatNumber = (n: number, decimals = 1) => n.toFixed(decimals);
  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      className="fixed left-4 bottom-20 w-80 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-emerald-500/30 shadow-xl z-40 max-h-[80vh] overflow-y-auto"
    >
      {/* Header - Drag Handle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 cursor-move select-none sticky top-0 bg-slate-900/95 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-sm font-medium text-white">Energy Dashboard</span>
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
                <Sun className="w-3 h-3" /> Peak
              </>
            ) : (
              <>
                <Moon className="w-3 h-3" /> Off-Peak
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Emergency Mode Banner */}
        {emergencyActive && (
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/40">
            <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
              <Shield className="w-4 h-4" />
              Emergency Mode Active
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.lighting)}
                </div>
                <div className="text-slate-500">Lighting (30%)</div>
              </div>
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.hvac)}
                </div>
                <div className="text-slate-500">HVAC (50%)</div>
              </div>
              <div className="text-center">
                <div className="text-red-300 font-mono">
                  {formatNumber(metrics.emergencyLoad.baseSystems)}
                </div>
                <div className="text-slate-500">Base Systems</div>
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
            <span className="text-sm font-normal text-slate-400 ml-1">kWh</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {emergencyActive ? 'Emergency consumption' : 'Current consumption'}
          </div>
        </div>

        {/* Machine Energy by Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Factory className="w-3.5 h-3.5 text-cyan-400" />
            Machine Energy (kWh)
          </div>
          <div className="bg-slate-800/50 rounded-lg overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th scope="col" className="text-left py-1.5 px-2 text-slate-400 font-normal">
                    Type
                  </th>
                  <th scope="col" className="text-center py-1.5 px-1 text-green-400 font-normal">
                    Running
                  </th>
                  <th scope="col" className="text-center py-1.5 px-1 text-slate-500 font-normal">
                    Idle
                  </th>
                  <th scope="col" className="text-right py-1.5 px-2 text-cyan-400 font-normal">
                    Now
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
                        {consumption.running}
                      </td>
                      <td className="py-1.5 px-1 text-center font-mono text-slate-500">
                        {consumption.idle}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-cyan-400">
                        {stat ? formatNumber(stat.totalEnergy) : '0.0'}
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
            Energy Modifiers
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Load Factor */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400">Load Factor</span>
                <span className="text-[10px] font-mono text-blue-400">
                  {Math.round(70 + (metrics.avgLoadFactor / 100) * 30)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                  style={{ width: `${metrics.avgLoadFactor}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-500 mt-1">70-100% of base energy</div>
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
                <span className="text-[10px] text-slate-400">Warning Status</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.warningCount > 0 ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                {metrics.warningCount > 0 ? `+10% (${metrics.warningCount})` : 'None'}
              </div>
              <div className="text-[9px] text-slate-500">Inefficient operation</div>
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
                <span className="text-[10px] text-slate-400">Maintenance Due</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.maintenanceDueCount > 0 ? 'text-yellow-400' : 'text-slate-500'
                }`}
              >
                {metrics.maintenanceDueCount > 0
                  ? `+5-25% (${metrics.maintenanceDueCount})`
                  : 'None'}
              </div>
              <div className="text-[9px] text-slate-500">Within 24hrs</div>
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
                <span className="text-[10px] text-slate-400">Overdue</span>
              </div>
              <div
                className={`text-sm font-mono ${
                  metrics.overdueCount > 0 ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {metrics.overdueCount > 0 ? `+25% (${metrics.overdueCount})` : 'None'}
              </div>
              <div className="text-[9px] text-slate-500">Max penalty</div>
            </div>
          </div>
        </div>

        {/* Facility Base Load */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Server className="w-3.5 h-3.5 text-orange-400" />
            Facility Base Load
          </div>
          <div className="space-y-2">
            {/* Lighting */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                <div>
                  <span className="text-slate-300">Lighting</span>
                  <div className="text-[9px] text-slate-500">8 kWh day → 35 kWh night</div>
                </div>
              </div>
              <span className="text-yellow-400 font-mono">
                {formatNumber(metrics.facilityLoad.lighting)} kWh
              </span>
            </div>

            {/* HVAC */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <ThermometerSun className="w-3.5 h-3.5 text-orange-400" />
                <div>
                  <span className="text-slate-300">HVAC</span>
                  <div className="text-[9px] text-slate-500">20→30→45→35 kWh curve</div>
                </div>
              </div>
              <span className="text-orange-400 font-mono">
                {formatNumber(metrics.facilityLoad.hvac)} kWh
              </span>
            </div>

            {/* Other */}
            <div className="flex items-center justify-between text-xs bg-slate-800/30 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <span className="text-slate-300">Other</span>
                  <div className="text-[9px] text-slate-500">Security, IT, fire systems</div>
                </div>
              </div>
              <span className="text-slate-400 font-mono">{metrics.facilityLoad.other} kWh</span>
            </div>
          </div>
        </div>

        {/* Cost & Carbon */}
        <div className="pt-2 border-t border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Est. Cost/hr</span>
            <span
              className={`font-mono ${metrics.isPeakHours ? 'text-amber-400' : 'text-emerald-400'}`}
            >
              ${formatNumber(metrics.estimatedCostPerHour, 2)}
              <span className="text-[9px] text-slate-500 ml-1">
                ({metrics.isPeakHours ? '$0.15' : '$0.08'}/kWh)
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Leaf className="w-3 h-3 text-green-400" />
              <span className="text-slate-400">Carbon/hr</span>
            </div>
            <span className="text-green-400 font-mono">
              {formatNumber(metrics.carbonKg)} kg CO₂
            </span>
          </div>
        </div>

        {/* Sustainability Tip */}
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-start gap-2">
            <Wind className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-emerald-300">
              {emergencyActive
                ? 'Emergency mode: Only essential systems active. Resume normal operations when safe.'
                : metrics.isPeakHours
                  ? 'Peak hours active. Consider deferring heavy operations to off-peak (9 PM - 9 AM) for 47% cost savings.'
                  : 'Off-peak rates active! Optimal time for energy-intensive operations.'}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
