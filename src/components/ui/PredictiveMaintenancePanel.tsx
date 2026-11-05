/**
 * PredictiveMaintenancePanel Component
 *
 * UI panel showing:
 * - Active predictions (machines predicted to fail)
 * - Parts inventory status
 * - Maintenance schedule
 */

import React, { useEffect, useRef } from 'react';
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
import {
  breakdownDescription,
  freePartsInventory,
  missingParts,
  missingPartsForOrder,
  predictionMinutesLeft,
  useBreakdownStore,
  type PredictiveAlert,
} from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { minimumServiceWear, useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { recordOperatorAction } from '../../stores/operationsCampaignStore';
import { capitalizeIn, formatFixed, translate, useLocale, useT } from '../../i18n';
import { predictiveMaintenancePanelMessages } from './PredictiveMaintenancePanel.messages';

const messages = predictiveMaintenancePanelMessages;

const formatDowntime = (downtimeSeconds: number): string => {
  const s = Math.round(downtimeSeconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Each action here removes or replaces the control that was pressed. This
 * moves focus, after the commit that does so, to whatever `resolve` returns,
 * so a keyboard user is never dropped on <body>. Call it only for an action
 * that changed state: a call with no re-render would fire on a later one.
 * Working if focus stays in the section the player was working in.
 */
const useFocusAfterAction = () => {
  const pending = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    resolve()?.focus();
  });
  return (resolve: () => HTMLElement | null | undefined) => {
    pending.current = resolve;
  };
};

/**
 * The plant also removes controls: the tick closes a restarted work order, a
 * breakdown closes the open prediction, a service elsewhere closes a booking.
 * When the control a keyboard user rests on goes that way, focus moves to
 * `fallback` instead of <body>. Spread the handlers on the section's root.
 * Working if focus stays in the panel when the plant changes it.
 */
const useFocusRescue = (fallback: () => HTMLElement | null | undefined) => {
  const within = useRef(false);
  useEffect(() => {
    if (!within.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    within.current = false;
    fallback()?.focus();
  });
  return {
    onFocus: () => {
      within.current = true;
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) within.current = false;
    },
  };
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
      {/* Tiles wrap rather than truncate, so every part name stays readable
          in the narrow sidebar and in pt-BR. Working if no label is clipped. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
        {parts.map(({ key, label }) => {
          const count = partsInventory[key];
          const isLow = count < 3;
          return (
            <div
              key={key}
              className={`text-center px-1 py-2 rounded ${
                isLow ? 'bg-red-500/20 border border-red-500/30' : 'bg-slate-700/50'
              }`}
            >
              <div className={`text-lg font-bold ${isLow ? 'text-red-400' : 'text-slate-200'}`}>
                {count}
              </div>
              <div className="text-xs leading-tight text-slate-400 break-words">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * A prediction's window as what is left of it on the plant clock. Only this
 * line follows the clock, and only when its whole minute changes, so the list
 * is not re-rendered on every tick.
 */
const PredictionWindow: React.FC<{ alert: PredictiveAlert }> = ({ alert }) => {
  const t = useT(messages);
  const minutesLeft = useGameSimulationStore((state) =>
    Math.max(
      0,
      Math.ceil(predictionMinutesLeft(alert, { day: state.gameDay, hour: state.gameTime }) - 1e-6)
    )
  );
  return (
    <span>
      {minutesLeft <= 0
        ? t('windowPassed')
        : t('estimatedWindow', {
            window:
              minutesLeft >= 120
                ? t('windowHours', { hours: formatFixed(minutesLeft / 60, 1) })
                : t('windowMinutes', { minutes: formatFixed(minutesLeft, 0) }),
          })}
    </span>
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rescue = useFocusRescue(() => headingRef.current);
  const focusAfter = useFocusAfterAction();
  const focusHeading = () => focusAfter(() => headingRef.current);

  const unacknowledgedAlerts = predictiveAlerts.filter((a) => !a.acknowledged);
  const scheduledMachineIds = new Set(
    maintenanceSchedule.filter((task) => !task.completed).map((task) => task.machineId)
  );
  const schedulePrediction = (alert: PredictiveAlert) => {
    // Read on click: subscribing would re-render this list on every game tick.
    const { gameDay, gameTime } = useGameSimulationStore.getState();
    // Half of the window that is left, as the panel shows it.
    const minutesLeft = predictionMinutesLeft(alert, { day: gameDay, hour: gameTime });
    const leadTimeHours = Math.max(5, minutesLeft * 0.5) / 60;
    scheduleMaintenanceTask({
      machineId: alert.machineId,
      machineName: alert.machineName,
      scheduledTime: (gameTime + leadTimeHours) % 24,
      type: 'predictive',
      priority: alert.confidence >= 85 ? 'high' : alert.confidence >= 70 ? 'medium' : 'low',
      partsNeeded: getPartsForBreakdown(alert.predictedFailureType),
    });
    acknowledgePredictiveAlert(alert.id);
    focusHeading();
  };

  if (unacknowledgedAlerts.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3" {...rescue}>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h4
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-slate-200 focus:outline-none"
          >
            {t('predictiveAlerts')}
          </h4>
        </div>
        <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
          <CheckCircle className="w-4 h-4" />
          <span>{t('noPredictedFailures')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3" {...rescue}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h4
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-slate-200 focus:outline-none"
        >
          {t('predictiveAlerts')}
        </h4>
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
                  <PredictionWindow alert={alert} />
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
                    onClick={() => {
                      acknowledgePredictiveAlert(alert.id);
                      focusHeading();
                    }}
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
const ActiveBreakdownsSection: React.FC<{
  fallbackRef: React.RefObject<HTMLElement | null>;
}> = ({ fallbackRef }) => {
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);
  const workOrders = useBreakdownStore((state) => state.workOrders);
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const startRepair = useBreakdownStore((state) => state.startRepair);
  const verifyRepair = useBreakdownStore((state) => state.verifyRepair);
  const requestMachineRestart = useBreakdownStore((state) => state.requestMachineRestart);
  // The tick holds a requested restart until a facility stop clears.
  const facilityStopped = useGameSimulationStore((state) => state.emergencyActive);
  const t = useT(messages);
  const locale = useLocale();
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The section goes when its last order closes; the panel title takes focus then.
  const rescue = useFocusRescue(() => headingRef.current ?? fallbackRef.current);
  const focusAfter = useFocusAfterAction();
  // A step that took lands on the next step's button, or on the work order.
  const focusWorkOrder = (breakdownId: string) =>
    focusAfter(() => {
      const card = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-breakdown-id]') ?? []
      ).find((element) => element.dataset.breakdownId === breakdownId);
      return card?.querySelector<HTMLElement>('button:not([disabled])') ?? card;
    });
  const listParts = (parts: readonly string[]) =>
    parts.map((part) => t('part', { part })).join(', ');

  if (activeBreakdowns.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-900/30 rounded-lg p-3 border border-red-500/30" {...rescue}>
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-4 h-4 text-red-400" />
        <h4
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-red-300 focus:outline-none"
        >
          {t('activeFaults')}
        </h4>
        <span className="text-xs bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded">
          {activeBreakdowns.length}
        </span>
      </div>
      <div ref={listRef} className="space-y-2">
        {activeBreakdowns.map((breakdown) => {
          const workOrder = workOrders.find((candidate) => candidate.id === breakdown.workOrderId);
          if (!workOrder) return null;
          // What startRepair would refuse on, stock reserved for an order
          // ahead counted as gone; only an order not yet dispatched waits.
          const unavailableParts =
            workOrder.phase === 'diagnosed' || workOrder.phase === 'awaiting_parts'
              ? missingPartsForOrder(workOrders, partsInventory, workOrder)
              : [];
          const phaseLabel = t('phase', { phase: workOrder.phase });
          return (
            <div
              key={breakdown.id}
              data-breakdown-id={breakdown.id}
              tabIndex={-1}
              role="group"
              aria-label={breakdown.machineName}
              className="bg-slate-800/50 rounded p-3 focus:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-200">{breakdown.machineName}</div>
                  <div className="text-[11px] text-slate-500">{workOrder.id}</div>
                </div>
                <span
                  className={`rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 ${capitalizeIn(locale)}`}
                >
                  {phaseLabel}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-2">{breakdownDescription(breakdown)}</div>
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
                    onClick={() => {
                      if (startRepair(breakdown.id).started) focusWorkOrder(breakdown.id);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:bg-slate-600 disabled:text-white/90"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {t('dispatchServiceUnit')}
                  </button>
                )}
                {/* The repair runs on the shift clock (breakdownStore.tickDowntime);
                    there is nothing to click until it reaches verification. */}
                {workOrder.phase === 'repairing' && (
                  <div
                    role="status"
                    className="flex min-h-11 items-center gap-2 text-xs text-emerald-300"
                  >
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {t('repairRemaining', {
                      minutes: formatFixed(
                        Math.max(
                          0,
                          Math.ceil(
                            ((100 - breakdown.repairProgress) / 100) *
                              breakdown.estimatedRepairTime -
                              1e-6
                          )
                        ),
                        0
                      ),
                    })}
                  </div>
                )}
                {workOrder.phase === 'verification' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (verifyRepair(breakdown.id)) focusWorkOrder(breakdown.id);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-cyan-800 px-3 text-xs font-semibold text-white hover:bg-cyan-700"
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    {t('verifyRepair')}
                  </button>
                )}
                {workOrder.phase === 'ready_to_restart' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (requestMachineRestart(breakdown.id)) {
                        recordOperatorAction({ kind: 'restart', machine: breakdown.machineName });
                        focusWorkOrder(breakdown.id);
                      }
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded bg-purple-800 px-3 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('restartMachine')}
                  </button>
                )}
                {workOrder.phase === 'restart_requested' && (
                  <div role="status" className="flex min-h-11 items-center text-xs text-purple-300">
                    {facilityStopped ? t('restartHeldByStop') : t('restartQueued')}
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
  const workOrders = useBreakdownStore((state) => state.workOrders);
  // Parts held for a diagnosed repair are not stock a booked service may use.
  const freeParts = freePartsInventory(workOrders, partsInventory);
  // performMaintenance returns a critical unit to service whatever the
  // facility state, so Complete is locked for the stop, as Maintain is.
  const facilityStopped = useGameSimulationStore((state) => state.emergencyActive);
  // `id=minimum` for each unit performMaintenance would refuse as still new.
  // A string keeps the selector stable while wear creeps up every tick.
  const belowMinimum = useProductionStore((state) =>
    state.machines
      .filter((m) => m.status !== 'critical' && (m.metrics.wear ?? 0) < minimumServiceWear(m.type))
      .map((m) => `${m.id}=${minimumServiceWear(m.type)}`)
      .join('|')
  );
  const minimumWearFor = new Map(
    belowMinimum
      .split('|')
      .filter(Boolean)
      .map((entry) => [entry.split('=')[0], Number(entry.split('=')[1])] as const)
  );
  const t = useT(messages);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rescue = useFocusRescue(() => headingRef.current);
  const focusAfter = useFocusAfterAction();
  const pendingTasks = maintenanceSchedule.filter((task) => !task.completed);
  const formatScheduledTime = (time: number): string => {
    const normalized = ((time % 24) + 24) % 24;
    const hours = Math.floor(normalized);
    const minutes = Math.floor((normalized - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Completing a task services the machine: wear is reduced, then the parts
  // are consumed. The service runs first because performMaintenance can refuse
  // it, and a refused service must leave the stock untouched. A machine with an
  // active fault must go through its work order (repair, verify, controlled
  // restart) instead.
  const completeTask = (taskId: string, machineId: string, machineName: string) => {
    if (useGameSimulationStore.getState().emergencyActive) return;
    const maintenance = useBreakdownStore.getState();
    if (maintenance.getBreakdownForMachine(machineId)) return;
    const task = maintenance.maintenanceSchedule.find((candidate) => candidate.id === taskId);
    if (!task || task.completed) return;
    const free = freePartsInventory(maintenance.workOrders, maintenance.partsInventory);
    if (missingParts(free, task.partsNeeded).length > 0) return;
    const result = useProductionStore.getState().performMaintenance(machineId);
    if (!result.success) {
      useUIStore.getState().addAlert({
        id: `maintenance-skip-${machineId}-${Date.now()}`,
        type: 'info',
        title: translate(messages, 'maintenanceNotPerformed'),
        message: `${machineName}: ${result.message}`,
        timestamp: new Date(),
        machineId,
        acknowledged: false,
      });
      return;
    }
    // The service ran, so it is the player's decision whatever the task does.
    recordOperatorAction({ kind: 'maintenance', machine: machineName });
    if (completeMaintenanceTask(taskId)) focusAfter(() => headingRef.current);
    // Service took wear below the warning threshold: the prediction is spent.
    useBreakdownStore.getState().acknowledgeMachinePredictiveAlerts(machineId);
  };

  if (pendingTasks.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-3" {...rescue}>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h4
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-slate-200 focus:outline-none"
          >
            {t('scheduledMaintenance')}
          </h4>
        </div>
        <div className="text-sm text-slate-400 py-2">{t('noScheduledMaintenance')}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-3" {...rescue}>
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-purple-400" />
        <h4
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-slate-200 focus:outline-none"
        >
          {t('scheduledMaintenance')}
        </h4>
      </div>
      <div className="space-y-2 max-h-[150px] overflow-y-auto">
        {pendingTasks.map((task) => {
          const shortParts = missingParts(freeParts, task.partsNeeded);
          const partsAvailable = shortParts.length === 0;
          const underRepair = activeBreakdowns.some(
            (breakdown) => breakdown.machineId === task.machineId
          );
          const minimumWear = minimumWearFor.get(task.machineId);
          const notNeededYet =
            minimumWear !== undefined
              ? t('belowMinimumHint', { minimum: formatFixed(minimumWear, 1) })
              : null;
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
                {/* A title is no reason on a phone: every lock on Complete is
                    named on the card, in the title's order. */}
                {underRepair ? (
                  <div className="text-[11px] leading-4 text-slate-300">{t('underRepairHint')}</div>
                ) : facilityStopped ? (
                  <div className="text-[11px] leading-4 text-slate-300">
                    {t('facilityStopHint')}
                  </div>
                ) : null}
                {notNeededYet && !underRepair && !facilityStopped && (
                  <div className="text-[11px] leading-4 text-slate-300">{notNeededYet}</div>
                )}
                {/* Short or held parts are named as a work order names them. */}
                {!partsAvailable && !underRepair && !facilityStopped && !notNeededYet && (
                  <div role="status" className="text-[11px] leading-4 text-red-300">
                    {t('awaitingStock', {
                      parts: shortParts.map((part) => t('part', { part })).join(', '),
                    })}
                  </div>
                )}
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
                  disabled={
                    underRepair || facilityStopped || !partsAvailable || notNeededYet !== null
                  }
                  aria-label={t('completeMaintenanceOn', { machine: task.machineName })}
                  title={
                    underRepair
                      ? t('underRepairHint')
                      : facilityStopped
                        ? t('facilityStopHint')
                        : notNeededYet
                          ? notNeededYet
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 p-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
        <Wrench className="w-5 h-5 text-blue-400" />
        <h3
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-slate-100 focus:outline-none"
        >
          {t('title')}
        </h3>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <ActiveBreakdownsSection fallbackRef={titleRef} />
        <PredictionsSection />
        <PartsInventorySection />
        <ScheduleSection />
      </div>
    </div>
  );
};

export default PredictiveMaintenancePanel;
