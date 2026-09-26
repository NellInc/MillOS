import React, { useState, useRef, useEffect } from 'react';
import { MachineData } from '../../../types';
import { RotateCcw, FileText, CheckCircle, Loader2, Wrench, Focus } from 'lucide-react';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore, PartsInventory } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { useSCADATag } from '../../../scada/useSCADA';
import { getTagsByMachine } from '../../../scada/tagDatabase';
import type { TagHistoryPoint } from '../../../scada/types';
import { getMachineOperationalState } from '../../../simulation/machineMotion';

const CRITICAL_RESTART_GUIDANCE =
  'Critical fault. Restart is locked until maintenance or a repair clears it.';

// Order in which spare parts are consumed by routine maintenance
const MAINTENANCE_PART_PRIORITY: Array<keyof PartsInventory> = [
  'filters',
  'bearings',
  'belts',
  'sensors',
  'motors',
];

export const MachineInspector: React.FC<{
  machine: MachineData;
  onFocusMachine?: (machineId: string) => void;
}> = ({ machine: selected, onFocusMachine }) => {
  // The selection is a click-time snapshot; status and metrics come from the
  // store so the panel follows the machine (including its own Restart and
  // Maintenance). The snapshot stands in when the id is not in the store.
  const machine =
    useProductionStore((state) => state.machines.find((m) => m.id === selected.id)) ?? selected;
  const metrics = machine.metrics;
  const flowTag = getTagsByMachine(machine.id).find((tag) => tag.group === 'FLOW');
  const scadaEnabled = useGraphicsStore((state) => state.graphics.enableSCADA);
  const { value: feedReading, history, loadHistory } = useSCADATag(flowTag?.id ?? '');
  useEffect(() => {
    if (!scadaEnabled || !flowTag) return;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        await loadHistory(5 * 60 * 1000);
      } catch {
        /* No trace is invented when the historian is unavailable. */
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [scadaEnabled, flowTag, loadHistory]);
  const buffer = useMaterialFlowStore((state) => state.machineBuffers.get(machine.id));
  const flowState = buffer ? getMachineOperationalState(machine.status, buffer) : null;
  const flowLabel = !buffer
    ? 'Flow unavailable'
    : buffer.machineType === 'silo'
      ? 'Storage inventory'
      : flowState === 'starved'
        ? 'Waiting for material'
        : flowState === 'blocked'
          ? 'Waiting for output space'
          : flowState === 'stopped' || flowState === 'faulted'
            ? 'Processing stopped'
            : 'Material ready';
  const [isRestarting, setIsRestarting] = useState(false);
  const [isMaintaining, setIsMaintaining] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const updateMachineStatus = useProductionStore((state) => state.updateMachineStatus);
  const updateMachineMetrics = useProductionStore((state) => state.updateMachineMetrics);
  const performMaintenance = useProductionStore((state) => state.performMaintenance);
  const partsInventory = useBreakdownStore((state) => state.partsInventory);
  const consumePart = useBreakdownStore((state) => state.consumePart);
  const addAlert = useUIStore((state) => state.addAlert);

  const availablePart = MAINTENANCE_PART_PRIORITY.find((part) => (partsInventory[part] ?? 0) > 0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleMaintenance = async () => {
    // Maintenance consumes one spare part - block when the store is empty
    if (!availablePart) {
      addAlert({
        id: `maintenance-noparts-${machine.id}-${Date.now()}`,
        type: 'warning',
        title: 'No Spare Parts',
        message: `Cannot perform maintenance on ${machine.name}: parts inventory is empty. Wait for a parts delivery.`,
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
      return;
    }

    setIsMaintaining(true);
    // Brief delay to simulate the maintenance task
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const result = performMaintenance(machine.id);
    if (result.success) {
      // performMaintenance fires its own success alert; consume the part used
      consumePart(availablePart);
    } else {
      addAlert({
        id: `maintenance-skip-${machine.id}-${Date.now()}`,
        type: 'info',
        title: 'Maintenance Not Needed',
        message: `${machine.name}: ${result.message}`,
        timestamp: new Date(),
        machineId: machine.id,
        acknowledged: false,
      });
    }
    if (mountedRef.current) setIsMaintaining(false);
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    const previousStatus = machine.status;

    // Set to idle during restart
    updateMachineStatus(machine.id, 'idle');

    // Simulate restart sequence with staged recovery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Reset metrics to healthy baseline values during restart
    // This simulates the machine cooling down and stabilizing
    updateMachineMetrics(machine.id, {
      temperature: 45 + Math.random() * 10, // 45-55°C (healthy range)
      vibration: 1.5 + Math.random() * 1.5, // 1.5-3.0 mm/s (healthy range)
      load: 60 + Math.random() * 20, // 60-80% (normal operating load)
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The 2.5 s sequence can outlive the panel or an emergency stop. Never
    // force a machine back to running after the facility has been stopped,
    // but always finish the restart when only the panel went away: the
    // machine must not be stranded idle because the sidebar closed.
    if (useGameSimulationStore.getState().emergencyActive) {
      if (mountedRef.current) setIsRestarting(false);
      return;
    }

    // Set back to running with clean state
    updateMachineStatus(machine.id, 'running');
    if (mountedRef.current) setIsRestarting(false);

    const wasWarning = previousStatus === 'warning' || previousStatus === 'critical';
    addAlert({
      id: `restart-${machine.id}-${Date.now()}`,
      type: 'success',
      title: wasWarning ? 'Machine Recovered' : 'Machine Restarted',
      message: wasWarning
        ? `${machine.name} has been restarted and metrics reset to healthy values.`
        : `${machine.name} has been successfully restarted.`,
      timestamp: new Date(),
      machineId: machine.id,
      acknowledged: false,
    });
  };

  // An absent history is unknown, never permission to invent service evidence.
  const maintenanceLogs = machine.maintenanceHistory ?? [];

  return (
    <div className="p-6 space-y-4 overflow-y-auto h-full custom-scrollbar">
      <div className="border-b border-white/10 pb-6">
        <p
          className="flex items-center gap-3 text-lg capitalize text-slate-200"
          role="status"
          aria-label={`Machine status: ${machine.status}`}
        >
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${
              machine.status === 'running'
                ? 'bg-teal-300'
                : machine.status === 'warning'
                  ? 'bg-orange-400'
                  : machine.status === 'idle'
                    ? 'bg-slate-400'
                    : 'bg-red-400'
            }`}
          />
          {machine.status}
        </p>
        {(machine.status === 'critical' || machine.status === 'warning') && (
          <p className="mt-3 text-sm text-slate-300">
            {machine.status === 'critical'
              ? CRITICAL_RESTART_GUIDANCE
              : "Something's off. Check the metrics and maintenance log."}
          </p>
        )}
      </div>

      <dl className="space-y-1">
        {flowTag ? (
          <MetricCard
            label="Feed rate"
            value={formatReading(
              scadaEnabled && feedReading?.quality === 'GOOD'
                ? Number(feedReading.value)
                : undefined,
              1
            )}
            unit={flowTag.engUnit ?? ''}
          />
        ) : (
          <MetricCard label="RPM" value={formatReading(metrics?.rpm, 0)} unit="r/min" />
        )}
        <MetricCard label="Motor load" value={formatReading(metrics?.load, 1)} unit="%" />
        <MetricCard label="Temperature" value={formatReading(metrics?.temperature, 1)} unit="°C" />
      </dl>
      {flowTag && (
        <RecordedFeedTrend history={scadaEnabled ? history : []} unit={flowTag.engUnit ?? ''} />
      )}
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between border border-cyan-300 px-4 text-base text-cyan-200 hover:bg-cyan-300/10">
          Inspect{' '}
          <span aria-hidden="true" className="text-xl group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="space-y-4 pt-5">
          <dl>
            <MetricCard
              label="Vibration"
              value={formatReading(metrics?.vibration, 2)}
              unit="mm/s"
            />
          </dl>
          <section aria-label="Material-flow evidence" className="border-b border-white/10 pb-4">
            <p className="mb-1 text-[12px] font-medium text-slate-300">{flowLabel}</p>
            {buffer && (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-300">
                <div>
                  <dt>Input buffer</dt>
                  <dd className="mt-1 font-mono text-white">
                    {buffer.inputBuffer
                      .reduce((sum, material) => sum + material.amount, 0)
                      .toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                    kg
                  </dd>
                </div>
                <div>
                  <dt>Output buffer</dt>
                  <dd className="mt-1 font-mono text-white">
                    {buffer.outputBuffer
                      .reduce((sum, material) => sum + material.amount, 0)
                      .toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                    kg
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => setShowLogs(!showLogs)}
              aria-expanded={showLogs}
              aria-controls="machine-maintenance-logs"
              className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 py-2 rounded-md font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              <FileText size={14} />
              {showLogs ? 'Hide Maintenance Logs' : 'View Maintenance Logs'}
            </button>
            <button
              onClick={handleMaintenance}
              disabled={isMaintaining || isRestarting}
              title={
                !availablePart
                  ? 'Out of spare parts — maintenance needs one to proceed.'
                  : `Reduces machine wear (consumes 1 spare part: ${availablePart})`
              }
              className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              {isMaintaining ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Performing Maintenance...
                </>
              ) : (
                <>
                  <Wrench size={14} />
                  Perform Maintenance
                </>
              )}
            </button>
            <button
              onClick={handleRestart}
              disabled={isRestarting || isMaintaining || machine.status === 'critical'}
              title={machine.status === 'critical' ? CRITICAL_RESTART_GUIDANCE : undefined}
              className="w-full min-h-11 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              {isRestarting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Restarting...
                </>
              ) : (
                <>
                  <RotateCcw size={14} />
                  Restart Unit
                </>
              )}
            </button>
          </div>

          {/* Maintenance Logs Panel */}
          {showLogs && (
            <div
              id="machine-maintenance-logs"
              className="bg-slate-800/30 border border-white/5 rounded-xl p-3 space-y-2"
            >
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Recent Maintenance
              </h4>
              {maintenanceLogs.length === 0 && (
                <p className="text-sm leading-6 text-slate-300">
                  No maintenance on record. Either it is new, or it has been very lucky.
                </p>
              )}
              {maintenanceLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0"
                >
                  <CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white font-medium capitalize">{log.type}</span>
                      <span className="text-xs text-slate-400">{log.date}</span>
                    </div>
                    <p className="text-xs leading-5 text-slate-300 break-words">{log.notes}</p>
                    <p className="text-xs text-slate-400">Service unit: {log.serviceUnit}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
      {onFocusMachine && (
        <button
          onClick={() => onFocusMachine(machine.id)}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-sm border border-white/20 px-4 text-sm text-slate-200 hover:bg-white/5"
        >
          Focus machine <Focus size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Only recorded, good-quality samples form connected segments. */
export function inspectorTrendPaths(history: readonly TagHistoryPoint[]): string[] {
  const samples = history
    .filter((point) => Number.isFinite(point.timestamp))
    .slice(-240)
    .sort((a, b) => a.timestamp - b.timestamp);
  const good = samples.filter((point) => point.quality === 'GOOD' && Number.isFinite(point.value));
  if (good.length < 2) return [];
  const min = Math.min(...good.map((point) => point.value));
  const max = Math.max(...good.map((point) => point.value));
  const span = Math.max(max - min, 1);
  const start = samples[0].timestamp;
  const duration = Math.max(1000, samples[samples.length - 1].timestamp - start);
  const paths: string[] = [];
  let line: string[] = [];
  const finish = () => {
    if (line.length > 1) paths.push(line.join(' '));
    line = [];
  };
  for (const point of samples) {
    if (point.quality !== 'GOOD' || !Number.isFinite(point.value)) {
      finish();
      continue;
    }
    const x = 8 + ((point.timestamp - start) / duration) * 264;
    const y = 56 - ((point.value - (min + max - span) / 2) / span) * 44;
    line.push(`${line.length ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  finish();
  return paths;
}

function RecordedFeedTrend({
  history,
  unit,
}: {
  history: readonly TagHistoryPoint[];
  unit: string;
}) {
  const paths = inspectorTrendPaths(history);
  return (
    <figure className="border-y border-dashed border-white/15 py-2">
      {paths.length ? (
        <svg
          viewBox="0 0 280 72"
          className="h-20 w-full"
          role="img"
          aria-label={`Recorded feed rate trend in ${unit}`}
        >
          {paths.map((path, index) => (
            <path key={index} d={path} fill="none" stroke="#67e8f9" strokeWidth="1.5" />
          ))}
        </svg>
      ) : (
        <p className="py-6 text-xs text-slate-400">
          Waiting for the historian to collect enough to draw a line.
        </p>
      )}
      <figcaption className="text-[11px] text-slate-400">
        Feed rate ({unit}), recorded samples
      </figcaption>
    </figure>
  );
}

function formatReading(value: number | undefined, digits: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

const MetricCard: React.FC<{ label: string; value: string; unit: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="min-w-0 border-b border-white/10 py-3">
    <dt className="mb-3 text-base text-slate-300">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-4xl font-light tabular-nums text-slate-100">{value}</span>
      <span className="text-sm text-slate-300">{unit}</span>
    </dd>
  </div>
);
