import React, { useState, useMemo } from 'react';
import { MachineData, MaintenanceRecord, MachineType } from '../../../types';
import { RotateCcw, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';

/**
 * Generates deterministic maintenance logs based on machine data.
 * Uses machine.id as a seed for consistent results across re-renders.
 * Logs are generated relative to the machine's lastMaintenance date.
 */
function generateMaintenanceLogs(machine: MachineData): MaintenanceRecord[] {
  // If machine has actual history, use it
  if (machine.maintenanceHistory && machine.maintenanceHistory.length > 0) {
    return machine.maintenanceHistory;
  }

  // Simple hash function for deterministic "randomness" based on machine ID
  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  const seed = hashCode(machine.id);
  const seededRandom = (index: number): number => {
    const x = Math.sin(seed + index) * 10000;
    return x - Math.floor(x);
  };

  // Technician pool - deterministically select based on machine
  const technicians = ['J. Smith', 'M. Chen', 'R. Davis', 'A. Kumar', 'S. Wilson'];

  // Maintenance types by machine type
  const maintenanceTasksByType: Record<MachineType, string[]> = {
    [MachineType.SILO]: [
      'Level sensor calibration',
      'Aeration fan inspection',
      'Discharge valve service',
      'Moisture probe check',
      'Structural inspection',
    ],
    [MachineType.ROLLER_MILL]: [
      'Roll gap adjustment',
      'Bearing lubrication',
      'Belt tension check',
      'Vibration analysis',
      'Feed roller service',
    ],
    [MachineType.PLANSIFTER]: [
      'Sieve inspection',
      'Drive mechanism service',
      'Frame alignment check',
      'Brush replacement',
      'Gasket inspection',
    ],
    [MachineType.PACKER]: [
      'Bag clamp adjustment',
      'Weighing system calibration',
      'Conveyor belt check',
      'Seal heater service',
      'Dust extraction clean',
    ],
    [MachineType.CONTROL_ROOM]: [
      'System backup verification',
      'Sensor calibration',
      'Network diagnostics',
      'UPS battery check',
      'Display panel cleaning',
    ],
  };

  const tasks = maintenanceTasksByType[machine.type] || [
    'General inspection',
    'Lubrication service',
    'Safety check',
    'Cleaning service',
    'Component check',
  ];

  // Parse lastMaintenance date or use a default
  let baseDate: Date;
  try {
    baseDate = new Date(machine.lastMaintenance);
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }
  } catch {
    baseDate = new Date();
  }

  // Generate 4 maintenance records going back in time
  const logs: MaintenanceRecord[] = [];
  const maintenanceTypes: Array<'preventive' | 'corrective' | 'emergency'> = [
    'preventive',
    'preventive',
    'corrective',
    'preventive',
  ];

  for (let i = 0; i < 4; i++) {
    // Each log is 5-15 days before the previous
    const daysBack = i === 0 ? 0 : Math.floor(seededRandom(i * 3) * 10) + 5;
    const logDate = new Date(baseDate);
    logDate.setDate(logDate.getDate() - (i * 7 + daysBack));

    const taskIndex = Math.floor(seededRandom(i * 7) * tasks.length);
    const techIndex = Math.floor(seededRandom(i * 11) * technicians.length);

    // Vary maintenance type based on machine status for realism
    let type = maintenanceTypes[i];
    if (i === 0 && (machine.status === 'warning' || machine.status === 'critical')) {
      type = 'corrective';
    }

    logs.push({
      id: `${machine.id}-maint-${i}`,
      date: logDate.toISOString().split('T')[0],
      type,
      technician: technicians[techIndex],
      notes: tasks[taskIndex],
      duration: Math.floor(seededRandom(i * 13) * 60) + 30, // 30-90 minutes
    });
  }

  return logs;
}

export const MachineInspector: React.FC<{ machine: MachineData }> = ({ machine }) => {
  const metrics = machine.metrics || { rpm: 0, temperature: 0, vibration: 0, load: 0 };
  const [isRestarting, setIsRestarting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const updateMachineStatus = useProductionStore((state) => state.updateMachineStatus);
  const updateMachineMetrics = useProductionStore((state) => state.updateMachineMetrics);
  const addAlert = useUIStore((state) => state.addAlert);

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

  // Generate maintenance logs based on machine data
  // Uses actual maintenanceHistory if available, otherwise generates plausible logs
  const maintenanceLogs = useMemo(
    () => generateMaintenanceLogs(machine),
    [machine.id, machine.lastMaintenance, machine.status, machine.maintenanceHistory]
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full custom-scrollbar">
      {/* Status Card */}
      <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              machine.status === 'running'
                ? 'bg-green-500/20 text-green-400'
                : machine.status === 'warning'
                  ? 'bg-orange-500/20 text-orange-400'
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
                ? 'Unit is idle. No faults detected in the last 24 hours.'
                : 'Operating normally. No faults detected in the last 24 hours.'}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="RPM" value={metrics.rpm?.toFixed(0) || '0'} unit="r/min" color="blue" />
        <MetricCard
          label="Temp"
          value={metrics.temperature?.toFixed(1) || '0'}
          unit="°C"
          color="orange"
        />
        <MetricCard label="Load" value={metrics.load?.toFixed(1) || '0'} unit="%" color="green" />
        <MetricCard
          label="Vibration"
          value={metrics.vibration?.toFixed(2) || '0'}
          unit="mm/s"
          color="purple"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <button
          onClick={() => setShowLogs(!showLogs)}
          aria-expanded={showLogs}
          aria-controls="machine-maintenance-logs"
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded-lg font-medium text-xs transition-colors shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
        >
          <FileText size={14} />
          {showLogs ? 'Hide Maintenance Logs' : 'View Maintenance Logs'}
        </button>
        <button
          onClick={handleRestart}
          disabled={isRestarting || machine.status === 'critical'}
          title={
            machine.status === 'critical'
              ? 'Critical faults must be cleared via Safety controls before this unit can be restarted.'
              : undefined
          }
          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
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
          {maintenanceLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0"
            >
              <CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white font-medium capitalize">{log.type}</span>
                  <span className="text-[10px] text-slate-500">{log.date}</span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">{log.notes}</p>
                <p className="text-[10px] text-slate-500">Tech: {log.technician}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; unit: string; color: string }> = ({
  label,
  value,
  unit,
  color,
}) => {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 border-blue-500/20',
    orange: 'text-orange-400 border-orange-500/20',
    purple: 'text-purple-400 border-purple-500/20',
    green: 'text-green-400 border-green-500/20',
  };

  return (
    <div className={`bg-slate-800/30 border ${colors[color]} rounded-lg p-3`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-mono font-bold ${colors[color].split(' ')[0]}`}>
          {value}
        </span>
        <span className="text-[10px] text-slate-600">{unit}</span>
      </div>
    </div>
  );
};
