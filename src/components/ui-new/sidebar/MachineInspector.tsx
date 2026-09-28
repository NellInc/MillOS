import React, { useState, useRef, useEffect } from 'react';
import { MachineData } from '../../../types';
import { RotateCcw, FileText, CheckCircle, Loader2, Wrench, Focus } from 'lucide-react';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore, PartsInventory } from '../../../stores/breakdownStore';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { getMachineOperationalState } from '../../../simulation/machineMotion';

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
}> = ({ machine, onFocusMachine }) => {
  const metrics = machine.metrics;
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
    setIsMaintaining(false);
  };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // force a machine back to running after the facility has been stopped.
    if (!mountedRef.current) return;
    if (useGameSimulationStore.getState().emergencyActive) {
      setIsRestarting(false);
      return;
    }

    // Set back to running with clean state
    updateMachineStatus(machine.id, 'running');
    setIsRestarting(false);

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
    <div className="p-4 space-y-4 overflow-y-auto h-full custom-scrollbar">
      {/* Status Card */}
      <div className="border-b border-white/10 pb-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[12px] text-slate-400 font-medium">Status</span>
          <span
            className={`px-2 py-0.5 rounded text-[12px] font-medium capitalize ${
              machine.status === 'running'
                ? 'bg-green-500/20 text-green-400'
                : machine.status === 'warning'
                  ? 'bg-orange-500/20 text-orange-400'
                  : machine.status === 'idle'
                    ? 'bg-slate-500/20 text-slate-300'
                    : 'bg-red-500/20 text-red-400'
            }`}
          >
            {machine.status}
          </span>
        </div>
        <div className="text-sm text-slate-300">
          {machine.status === 'critical'
            ? 'Critical fault detected. Immediate attention required - review metrics below.'
            : machine.status === 'warning'
              ? 'Fault detected. Inspect the metrics and maintenance logs below.'
              : machine.status === 'idle'
                ? 'Unit is idle.'
                : 'Running.'}
        </div>
      </div>

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

      {/* Metrics Grid */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {/* An absent reading shows as a dash, not as a measured zero. */}
        <MetricCard label="RPM" value={formatReading(metrics?.rpm, 0)} unit="r/min" />
        <MetricCard label="Temperature" value={formatReading(metrics?.temperature, 1)} unit="°C" />
        <MetricCard label="Load" value={formatReading(metrics?.load, 1)} unit="%" />
        <MetricCard label="Vibration" value={formatReading(metrics?.vibration, 2)} unit="mm/s" />
      </dl>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        {onFocusMachine && (
          <button
            onClick={() => onFocusMachine(machine.id)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/50 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-300/20"
          >
            <Focus size={16} aria-hidden="true" />
            Focus machine
          </button>
        )}
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
              ? 'No spare parts in inventory - maintenance requires one part.'
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
          title={
            machine.status === 'critical'
              ? 'Critical faults must be cleared via Safety controls before this unit can be restarted.'
              : undefined
          }
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
            <p className="text-sm leading-6 text-slate-300">No maintenance records.</p>
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
  );
};

function formatReading(value: number | undefined, digits: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

const MetricCard: React.FC<{ label: string; value: string; unit: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="min-w-0 border-b border-white/10 py-3">
    <dt className="mb-2 text-[12px] text-slate-400">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-2xl font-mono font-medium tabular-nums text-slate-100">{value}</span>
      <span className="text-[12px] text-slate-400">{unit}</span>
    </dd>
  </div>
);
