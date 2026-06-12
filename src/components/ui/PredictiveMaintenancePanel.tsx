/**
 * PredictiveMaintenancePanel Component
 *
 * UI panel showing:
 * - Active predictions (machines predicted to fail)
 * - Parts inventory status
 * - Maintenance schedule
 */

import React from 'react';
import {
  AlertTriangle,
  Wrench,
  Package,
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useBreakdownStore } from '../../stores/breakdownStore';

// Parts display with low inventory warning
const PartsInventorySection: React.FC = () => {
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const hasLowInventory = useBreakdownStore((state) => state.hasLowInventory());

  const parts = [
    { key: 'bearings', label: 'Bearings' },
    { key: 'belts', label: 'Belts' },
    { key: 'filters', label: 'Filters' },
    { key: 'motors', label: 'Motors' },
    { key: 'sensors', label: 'Sensors' },
  ] as const;

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-slate-200">Parts Inventory</h4>
        {hasLowInventory && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">LOW</span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {parts.map(({ key, label }) => {
          const count = partsInventory[key];
          const isLow = count < 3;
          return (
            <div
              key={key}
              className={`text-center p-2 rounded ${
                isLow ? 'bg-red-500/20 border border-red-500/30' : 'bg-slate-700/50'
              }`}
            >
              <div className={`text-lg font-bold ${isLow ? 'text-red-400' : 'text-slate-200'}`}>
                {count}
              </div>
              <div className="text-xs text-slate-400 truncate">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Active predictions list
const PredictionsSection: React.FC = () => {
  const predictiveAlerts = useBreakdownStore((state) => state.predictiveAlerts);
  const acknowledgePredictiveAlert = useBreakdownStore((state) => state.acknowledgePredictiveAlert);

  const unacknowledgedAlerts = predictiveAlerts.filter((a) => !a.acknowledged);

  if (unacknowledgedAlerts.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-slate-200">Predictive Alerts</h4>
        </div>
        <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
          <CheckCircle className="w-4 h-4" />
          <span>No predicted failures</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-slate-200">Predictive Alerts</h4>
        <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
          {unacknowledgedAlerts.length}
        </span>
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {unacknowledgedAlerts.map((alert) => (
          <div key={alert.id} className="bg-slate-700/50 rounded p-2 border-l-2 border-amber-500">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">{alert.machineName}</div>
                <div className="text-xs text-slate-400">{alert.predictedFailureType}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-amber-400">{alert.confidence}%</div>
                <div className="text-xs text-slate-500">confidence</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-600">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>~{alert.predictedTimeToFailure} min</span>
              </div>
              <button
                onClick={() => acknowledgePredictiveAlert(alert.id)}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Acknowledge
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Active breakdowns list
const ActiveBreakdownsSection: React.FC = () => {
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);

  if (activeBreakdowns.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-900/30 rounded-lg p-3 border border-red-500/30">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-4 h-4 text-red-400 animate-pulse" />
        <h4 className="text-sm font-semibold text-red-300">Active Faults</h4>
        <span className="text-xs bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded">
          {activeBreakdowns.length}
        </span>
      </div>
      <div className="space-y-2">
        {activeBreakdowns.map((breakdown) => (
          <div key={breakdown.id} className="bg-slate-800/50 rounded p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{breakdown.machineName}</span>
              <span className="text-xs text-slate-400">{breakdown.type}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{breakdown.description}</div>
            {breakdown.assignedWorkerName ? (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-amber-400">
                  Repair by: {breakdown.assignedWorkerName}
                </span>
                <span className="text-xs text-emerald-400">
                  {Math.round(breakdown.repairProgress)}%
                </span>
              </div>
            ) : (
              <div className="text-xs text-amber-400 mt-2 animate-pulse">
                Awaiting technician...
              </div>
            )}
            {/* Progress bar */}
            {breakdown.repairProgress > 0 && (
              <div className="bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${breakdown.repairProgress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Maintenance schedule section
const ScheduleSection: React.FC = () => {
  const maintenanceSchedule = useBreakdownStore((state) => state.maintenanceSchedule);
  const pendingTasks = maintenanceSchedule.filter((t) => !t.completed);

  if (pendingTasks.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h4 className="text-sm font-semibold text-slate-200">Scheduled Maintenance</h4>
        </div>
        <div className="text-sm text-slate-400 py-2">No scheduled maintenance</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-purple-400" />
        <h4 className="text-sm font-semibold text-slate-200">Scheduled Maintenance</h4>
      </div>
      <div className="space-y-2 max-h-[150px] overflow-y-auto">
        {pendingTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between bg-slate-700/50 rounded p-2"
          >
            <div>
              <div className="text-sm text-slate-200">{task.machineName}</div>
              <div className="text-xs text-slate-400">{task.type}</div>
            </div>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                task.priority === 'high'
                  ? 'bg-red-500/20 text-red-400'
                  : task.priority === 'medium'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-600 text-slate-400'
              }`}
            >
              {task.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main panel component
export const PredictiveMaintenancePanel: React.FC = () => {
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 p-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
        <Wrench className="w-5 h-5 text-blue-400" />
        <h3 className="text-base font-semibold text-slate-100">Predictive Maintenance</h3>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <ActiveBreakdownsSection />
        <PredictionsSection />
        <PartsInventorySection />
        <ScheduleSection />
      </div>
    </div>
  );
};

export default PredictiveMaintenancePanel;
