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
  Play,
  ClipboardCheck,
  RotateCcw,
} from 'lucide-react';
import { useBreakdownStore, type PredictiveAlert } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { formatFixed, translate, useT } from '../../i18n';
import { predictiveMaintenancePanelMessages } from './PredictiveMaintenancePanel.messages';

const messages = predictiveMaintenancePanelMessages;

const formatDowntime = (downtimeSeconds: number): string => {
  const s = Math.round(downtimeSeconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Parts display with low inventory warning
const PartsInventorySection: React.FC = () => {
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const hasLowInventory = useBreakdownStore((state) => state.hasLowInventory());
  const t = useT(messages);

  const parts = [
    { key: 'bearings', label: t('partBearings') },
    { key: 'belts', label: t('partBelts') },
    { key: 'filters', label: t('partFilters') },
    { key: 'motors', label: t('partMotors') },
    { key: 'sensors', label: t('partSensors') },
  ] as const;

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold text-slate-200">{t('partsInventory')}</h4>
        {hasLowInventory && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
            {t('low')}
          </span>
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
  const maintenanceSchedule = useBreakdownStore((state) => state.maintenanceSchedule);
  const scheduleMaintenanceTask = useBreakdownStore((state) => state.scheduleMaintenanceTask);
  const getPartsForBreakdown = useBreakdownStore((state) => state.getPartsForBreakdown);
  const t = useT(messages);

  const unacknowledgedAlerts = predictiveAlerts.filter((a) => !a.acknowledged);
  const scheduledMachineIds = new Set(
    maintenanceSchedule.filter((task) => !task.completed).map((task) => task.machineId)
  );
  const schedulePrediction = (alert: PredictiveAlert) => {
    const leadTimeHours = Math.max(5, alert.predictedTimeToFailure * 0.5) / 60;
    // Read on click: subscribing would re-render this list on every game tick.
    const gameTime = useGameSimulationStore.getState().gameTime;
    scheduleMaintenanceTask({
      machineId: alert.machineId,
      machineName: alert.machineName,
      scheduledTime: (gameTime + leadTimeHours) % 24,
      type: 'predictive',
      priority: alert.confidence >= 85 ? 'high' : alert.confidence >= 70 ? 'medium' : 'low',
      partsNeeded: getPartsForBreakdown(alert.predictedFailureType),
    });
    acknowledgePredictiveAlert(alert.id);
  };

  if (unacknowledgedAlerts.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-slate-200">{t('predictiveAlerts')}</h4>
        </div>
        <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
          <CheckCircle className="w-4 h-4" />
          <span>{t('noPredictedFailures')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-slate-200">{t('predictiveAlerts')}</h4>
        <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
          {unacknowledgedAlerts.length}
        </span>
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {unacknowledgedAlerts.map((alert) => {
          const alreadyScheduled = scheduledMachineIds.has(alert.machineId);
          return (
            <div key={alert.id} className="rounded border border-amber-500/35 bg-slate-700/50 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">{alert.machineName}</div>
                  <div className="text-xs text-slate-400">
                    {t('failureType', { type: alert.predictedFailureType })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-amber-400">{alert.confidence}%</div>
                  <div className="text-xs text-slate-500">{t('modelConfidence')}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-600">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>
                    {t('estimatedWindow', {
                      window:
                        alert.predictedTimeToFailure >= 120
                          ? t('windowHours', {
                              hours: formatFixed(alert.predictedTimeToFailure / 60, 1),
                            })
                          : t('windowMinutes', {
                              minutes: formatFixed(alert.predictedTimeToFailure, 0),
                            }),
                    })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => schedulePrediction(alert)}
                    disabled={alreadyScheduled}
                    aria-label={
                      alreadyScheduled
                        ? t('alreadyScheduledFor', { machine: alert.machineName })
                        : t('scheduleFor', { machine: alert.machineName })
                    }
                    className="min-h-11 px-3 text-xs bg-emerald-800 hover:bg-emerald-700 disabled:bg-slate-600 disabled:text-white/90 text-white rounded transition-colors"
                  >
                    {alreadyScheduled ? t('scheduled') : t('schedule')}
                  </button>
                  <button
                    onClick={() => acknowledgePredictiveAlert(alert.id)}
                    aria-label={t('acknowledgeFor', { machine: alert.machineName })}
                    className="min-h-11 px-3 text-xs bg-blue-800 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    {t('acknowledge')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Active breakdowns list
const ActiveBreakdownsSection: React.FC = () => {
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);
  const workOrders = useBreakdownStore((state) => state.workOrders);
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const startRepair = useBreakdownStore((state) => state.startRepair);
  const updateRepairProgress = useBreakdownStore((state) => state.updateRepairProgress);
  const verifyRepair = useBreakdownStore((state) => state.verifyRepair);
  const requestMachineRestart = useBreakdownStore((state) => state.requestMachineRestart);
  const t = useT(messages);
  const listParts = (parts: readonly string[]) =>
    parts.map((part) => t('part', { part })).join(', ');

  if (activeBreakdowns.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-900/30 rounded-lg p-3 border border-red-500/30">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-4 h-4 text-red-400" />
        <h4 className="text-sm font-semibold text-red-300">{t('activeFaults')}</h4>
        <span className="text-xs bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded">
          {activeBreakdowns.length}
        </span>
      </div>
      <div className="space-y-2">
        {activeBreakdowns.map((breakdown) => {
          const workOrder = workOrders.find((candidate) => candidate.id === breakdown.workOrderId);
          if (!workOrder) return null;
          const unavailableParts = workOrder.requiredParts.filter(
            (part) => partsInventory[part] <= 0
          );
          const phaseLabel = t('phase', { phase: workOrder.phase });
          return (
            <div key={breakdown.id} className="bg-slate-800/50 rounded p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-200">{breakdown.machineName}</div>
                  <div className="text-[11px] text-slate-500">{workOrder.id}</div>
                </div>
                <span className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 capitalize">
                  {phaseLabel}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-2">{breakdown.description}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-400">
                  {t('service')} <span className="text-amber-300">{t('serviceUnit')}</span>
                </div>
                <div className="text-right text-slate-400">
                  {t('downtime')}{' '}
                  <span className="text-slate-200">
                    {formatDowntime(workOrder.downtimeSeconds)}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {t('parts', { parts: listParts(workOrder.requiredParts) })}
              </div>
              {unavailableParts.length > 0 && (
                <div role="status" className="mt-1 text-xs text-red-300">
                  {t('awaitingStock', { parts: listParts(unavailableParts) })}
                </div>
              )}
              {breakdown.repairProgress > 0 && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('repairProgress')}</span>
                  <span className="text-emerald-300">{Math.round(breakdown.repairProgress)}%</span>
                </div>
              )}
              {breakdown.repairProgress > 0 && (
                <div className="bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${breakdown.repairProgress}%` }}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(workOrder.phase === 'diagnosed' || workOrder.phase === 'awaiting_parts') && (
                  <button
                    type="button"
                    disabled={unavailableParts.length > 0}
                    onClick={() => startRepair(breakdown.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-slate-600 disabled:text-white/90"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {t('dispatchServiceUnit')}
                  </button>
                )}
                {workOrder.phase === 'repairing' && (
                  <button
                    type="button"
                    onClick={() => updateRepairProgress(breakdown.id, 100)}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Wrench className="h-4 w-4" aria-hidden="true" />
                    {t('completeRepair')}
                  </button>
                )}
                {workOrder.phase === 'verification' && (
                  <button
                    type="button"
                    onClick={() => verifyRepair(breakdown.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-cyan-800 px-3 text-xs font-semibold text-white hover:bg-cyan-700"
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    {t('verifyRepair')}
                  </button>
                )}
                {workOrder.phase === 'ready_to_restart' && (
                  <button
                    type="button"
                    onClick={() => requestMachineRestart(breakdown.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-purple-800 px-3 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('restartMachine')}
                  </button>
                )}
                {workOrder.phase === 'restart_requested' && (
                  <div role="status" className="flex min-h-11 items-center text-xs text-purple-300">
                    {t('restartQueued')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Maintenance schedule section
const ScheduleSection: React.FC = () => {
  const maintenanceSchedule = useBreakdownStore((state) => state.maintenanceSchedule);
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const completeMaintenanceTask = useBreakdownStore((state) => state.completeMaintenanceTask);
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);
  const t = useT(messages);
  const pendingTasks = maintenanceSchedule.filter((task) => !task.completed);
  const formatScheduledTime = (time: number): string => {
    const normalized = ((time % 24) + 24) % 24;
    const hours = Math.floor(normalized);
    const minutes = Math.floor((normalized - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Completing a task services the machine: parts are consumed and wear is
  // reduced. A machine with an active fault must go through its work order
  // (repair, verify, controlled restart) instead.
  const completeTask = (taskId: string, machineId: string, machineName: string) => {
    if (useBreakdownStore.getState().getBreakdownForMachine(machineId)) return;
    completeMaintenanceTask(taskId);
    const completed = useBreakdownStore
      .getState()
      .maintenanceSchedule.find((task) => task.id === taskId)?.completed;
    if (!completed) return;
    const result = useProductionStore.getState().performMaintenance(machineId);
    if (!result.success) {
      useUIStore.getState().addAlert({
        id: `maintenance-skip-${machineId}-${Date.now()}`,
        type: 'info',
        title: translate(messages, 'maintenanceNotNeeded'),
        message: `${machineName}: ${result.message}`,
        timestamp: new Date(),
        machineId,
        acknowledged: false,
      });
    }
  };

  if (pendingTasks.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h4 className="text-sm font-semibold text-slate-200">{t('scheduledMaintenance')}</h4>
        </div>
        <div className="text-sm text-slate-400 py-2">{t('noScheduledMaintenance')}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-purple-400" />
        <h4 className="text-sm font-semibold text-slate-200">{t('scheduledMaintenance')}</h4>
      </div>
      <div className="space-y-2 max-h-[150px] overflow-y-auto">
        {pendingTasks.map((task) => {
          const partsAvailable = task.partsNeeded.every((part) => partsInventory[part] > 0);
          const underRepair = activeBreakdowns.some(
            (breakdown) => breakdown.machineId === task.machineId
          );
          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 bg-slate-700/50 rounded p-2"
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-200">{task.machineName}</div>
                <div className="text-xs text-slate-400">
                  {t('taskType', { type: task.type })} · {formatScheduledTime(task.scheduledTime)}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {t('parts', {
                    parts:
                      task.partsNeeded.length > 0
                        ? task.partsNeeded.map((part) => t('part', { part })).join(', ')
                        : t('inspectionOnly'),
                  })}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    task.priority === 'high'
                      ? 'bg-red-500/20 text-red-400'
                      : task.priority === 'medium'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {t('priority', { priority: task.priority })}
                </span>
                <button
                  onClick={() => completeTask(task.id, task.machineId, task.machineName)}
                  disabled={underRepair || !partsAvailable}
                  aria-label={t('completeMaintenanceOn', { machine: task.machineName })}
                  title={
                    underRepair
                      ? t('underRepairHint')
                      : partsAvailable
                        ? t('completeHint')
                        : t('partsUnavailableHint')
                  }
                  className="min-h-11 px-3 rounded bg-purple-800 text-xs font-semibold text-white hover:bg-purple-700 disabled:bg-slate-600 disabled:text-white/90"
                >
                  {t('complete')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Main panel component
export const PredictiveMaintenancePanel: React.FC = () => {
  const t = useT(messages);
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 p-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
        <Wrench className="w-5 h-5 text-blue-400" />
        <h3 className="text-base font-semibold text-slate-100">{t('title')}</h3>
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
