import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  Zap,
  CloudRain,
  ClipboardCheck,
  TruckIcon,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import {
  SmokeParticles,
  EmergencyLighting,
  RainParticles,
  CrisisScreenOverlay,
  PowerOutageFlicker,
} from './CrisisEffects';

// Crisis type definitions
export type CrisisType = 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather';
export type CrisisSeverity = 'low' | 'medium' | 'high' | 'critical';

interface CrisisConfig {
  id: string;
  type: CrisisType;
  name: string;
  description: string;
  duration: number; // seconds
  icon: typeof Flame;
  color: string;
  probability: number; // 0-1, chance per hour
}

// Define crisis scenarios
const CRISIS_SCENARIOS: CrisisConfig[] = [
  {
    id: 'fire_mill',
    type: 'fire',
    name: 'Equipment Fire',
    description: 'Fire detected in milling equipment. Emergency response activated.',
    duration: 180, // 3 minutes
    icon: Flame,
    color: 'red',
    probability: 0.02,
  },
  {
    id: 'power_main',
    type: 'power_outage',
    name: 'Power Outage',
    description: 'Main power grid failure. Backup generator engaging.',
    duration: 120, // 2 minutes
    icon: Zap,
    color: 'amber',
    probability: 0.03,
  },
  {
    id: 'supply_delay',
    type: 'supply_emergency',
    name: 'Supply Delay',
    description: 'Incoming grain shipment delayed. Adjusting production schedule.',
    duration: 300, // 5 minutes
    icon: TruckIcon,
    color: 'yellow',
    probability: 0.05,
  },
  {
    id: 'inspection_safety',
    type: 'inspection',
    name: 'Safety Inspection',
    description: 'Regulatory inspector on-site. Compliance review in progress.',
    duration: 240, // 4 minutes
    icon: ClipboardCheck,
    color: 'purple',
    probability: 0.04,
  },
  {
    id: 'weather_storm',
    type: 'weather',
    name: 'Severe Weather',
    description: 'Storm approaching. Securing outdoor operations and equipment.',
    duration: 200, // 3.3 minutes
    icon: CloudRain,
    color: 'blue',
    probability: 0.04,
  },
];

// Crisis event timer/progress display
const CrisisTimer: React.FC = () => {
  const crisisState = useGameSimulationStore((state) => state.crisisState);
  const resolveCrisis = useGameSimulationStore((state) => state.resolveCrisis);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!crisisState.active) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        // Auto-resolve after duration
        if (next >= ((crisisState.metadata?.duration as number) || 120)) {
          resolveCrisis();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [crisisState.active, crisisState.metadata?.duration, resolveCrisis]);

  if (!crisisState.active || !crisisState.type) return null;

  const duration = (crisisState.metadata?.duration as number) || 120;
  const progress = (elapsed / duration) * 100;

  const getColorClass = () => {
    switch (crisisState.type) {
      case 'fire':
        return 'bg-red-500';
      case 'power_outage':
        return 'bg-amber-500';
      case 'weather':
        return 'bg-blue-500';
      case 'inspection':
        return 'bg-purple-500';
      case 'supply_emergency':
        return 'bg-yellow-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 px-6 py-4 shadow-2xl min-w-[300px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-white font-medium text-sm">Crisis Timer</span>
          </div>
          <span className="text-slate-400 text-xs">
            {elapsed}s / {duration}s
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className={`h-full ${getColorClass()}`}
          />
        </div>

        <div className="mt-2 text-xs text-slate-400 text-center">
          {(crisisState.metadata?.description as string) || 'Crisis in progress...'}
        </div>

        {/* Manual resolve button */}
        <button
          onClick={resolveCrisis}
          className="mt-3 w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Resolve Crisis
        </button>
      </div>
    </motion.div>
  );
};

// Action items panel for crisis response
const CrisisActionItems: React.FC = () => {
  const crisisState = useGameSimulationStore((state) => state.crisisState);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!crisisState.active) {
      setCompletedActions(new Set());
    }
  }, [crisisState.active]);

  if (!crisisState.active || !crisisState.type) return null;

  const getActionItems = (): Array<{ id: string; label: string; critical?: boolean }> => {
    switch (crisisState.type) {
      case 'fire':
        return [
          { id: 'evacuate', label: 'Evacuate affected area', critical: true },
          { id: 'suppress', label: 'Activate fire suppression system', critical: true },
          { id: 'emergency', label: 'Contact emergency services', critical: true },
          { id: 'shutdown', label: 'Shutdown adjacent equipment' },
        ];
      case 'power_outage':
        return [
          { id: 'backup', label: 'Engage backup generator', critical: true },
          { id: 'priority', label: 'Identify priority systems' },
          { id: 'comms', label: 'Establish emergency communications' },
          { id: 'monitor', label: 'Monitor critical equipment' },
        ];
      case 'supply_emergency':
        return [
          { id: 'inventory', label: 'Check current inventory levels', critical: true },
          { id: 'adjust', label: 'Adjust production schedule' },
          { id: 'alternate', label: 'Contact alternate suppliers' },
          { id: 'notify', label: 'Notify affected departments' },
        ];
      case 'inspection':
        return [
          { id: 'clean', label: 'Ensure work areas are clean', critical: true },
          { id: 'ppe', label: 'Verify PPE compliance' },
          { id: 'docs', label: 'Prepare required documentation' },
          { id: 'safety', label: 'Review safety protocols' },
        ];
      case 'weather':
        return [
          { id: 'secure', label: 'Secure outdoor equipment', critical: true },
          { id: 'personnel', label: 'Move personnel to safe areas' },
          { id: 'monitor', label: 'Monitor weather conditions' },
          { id: 'drainage', label: 'Check drainage systems' },
        ];
      default:
        return [];
    }
  };

  const actionItems = getActionItems();

  const toggleAction = (actionId: string) => {
    setCompletedActions((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const completionRate =
    actionItems.length > 0 ? (completedActions.size / actionItems.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      className="fixed right-4 top-32 z-50 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl w-80">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-white font-bold text-sm">Action Items</h3>
            </div>
            <span className="text-xs text-slate-400">
              {completedActions.size}/{actionItems.length}
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              className="h-full bg-green-500"
            />
          </div>
        </div>

        {/* Action list */}
        <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
          {actionItems.map((item) => {
            const isCompleted = completedActions.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleAction(item.id)}
                className={`w-full flex items-start gap-3 p-2 rounded-lg transition-colors ${
                  isCompleted
                    ? 'bg-green-900/30 border border-green-700/50'
                    : 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCompleted ? 'bg-green-600 border-green-500' : 'border-slate-600 bg-slate-900'
                  }`}
                >
                  {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 text-left">
                  <div
                    className={`text-sm ${isCompleted ? 'text-green-400 line-through' : 'text-white'}`}
                  >
                    {item.label}
                  </div>
                  {item.critical && !isCompleted && (
                    <span className="text-[10px] text-red-400 uppercase font-medium">Critical</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

// Main Crisis Event System Component
export const CrisisEventSystem: React.FC = () => {
  const crisisState = useGameSimulationStore((state) => state.crisisState);
  const triggerCrisis = useGameSimulationStore((state) => state.triggerCrisis);
  const addAlert = useUIStore((state) => state.addAlert);

  // Random crisis trigger based on game time
  useEffect(() => {
    // Check for random crisis every 5 minutes of real time
    const checkInterval = setInterval(
      () => {
        // Skip if crisis already active
        if (crisisState.active) return;

        // Roll for each crisis type
        for (const scenario of CRISIS_SCENARIOS) {
          if (Math.random() < scenario.probability / 12) {
            // Divide by 12 for hourly to 5-min conversion
            // Determine severity based on random roll
            let severity: CrisisSeverity = 'medium';
            const severityRoll = Math.random();
            if (severityRoll < 0.1) severity = 'critical';
            else if (severityRoll < 0.3) severity = 'high';
            else if (severityRoll < 0.7) severity = 'medium';
            else severity = 'low';

            // Trigger crisis
            triggerCrisis(scenario.type, severity, {
              name: scenario.name,
              description: scenario.description,
              duration: scenario.duration,
              scenarioId: scenario.id,
            });

            // Add alert
            addAlert({
              id: `crisis-${Date.now()}`,
              type: severity === 'critical' ? 'critical' : 'warning',
              title: scenario.name,
              message: scenario.description,
              timestamp: new Date(Date.now()),
              acknowledged: false,
            });

            // Play alarm sound if available
            // Note: playAlarm method may not exist on audioManager
            // Placeholder for future audio integration

            break; // Only one crisis at a time
          }
        }
      },
      5 * 60 * 1000
    ); // 5 minutes

    return () => clearInterval(checkInterval);
  }, [crisisState.active, triggerCrisis, addAlert]);

  // Cleanup on crisis resolution
  useEffect(() => {
    if (!crisisState.active && crisisState.type) {
      // Crisis just resolved
      addAlert({
        id: `crisis-resolved-${Date.now()}`,
        type: 'info',
        title: 'Crisis Resolved',
        message: `${crisisState.metadata?.name || 'Emergency situation'} has been resolved`,
        timestamp: new Date(Date.now()),
        acknowledged: false,
      });
    }
  }, [crisisState.active, crisisState.type, crisisState.metadata?.name, addAlert]);

  // Get affected machine position for smoke/fire effects
  const getAffectedPosition = (): [number, number, number] | null => {
    // Guard against null crisis type
    if (!crisisState.type || crisisState.type !== 'fire') return null;
    if (!crisisState.affectedMachineId) return null;

    // Map machine IDs to approximate positions (from MillScene zones)
    const machinePositions: Record<string, [number, number, number]> = {
      'RM-101': [-18, 4, -6],
      'RM-102': [-10, 4, -6],
      'RM-103': [-2, 4, -6],
      'RM-104': [6, 4, -6],
      'RM-105': [14, 4, -6],
      'RM-106': [22, 4, -6],
    };
    return machinePositions[crisisState.affectedMachineId] || [0, 4, -6];
  };

  const firePosition = getAffectedPosition();

  return (
    <>
      {/* Screen overlays */}
      <CrisisScreenOverlay />

      {/* Power outage flicker */}
      <PowerOutageFlicker active={crisisState.active && crisisState.type === 'power_outage'} />

      {/* 3D Effects (rendered in Canvas) */}
      {crisisState.active && crisisState.type === 'fire' && firePosition && (
        <SmokeParticles
          position={firePosition}
          intensity={crisisState.severity === 'critical' ? 1.5 : 1}
        />
      )}

      {crisisState.active && crisisState.type === 'power_outage' && (
        <EmergencyLighting active={true} />
      )}

      {crisisState.active && crisisState.type === 'weather' && (
        <RainParticles
          intensity={
            crisisState.severity === 'critical' ? 1.5 : crisisState.severity === 'high' ? 1.2 : 0.8
          }
        />
      )}

      {/* UI Components */}
      <AnimatePresence>
        {crisisState.active && (
          <>
            <CrisisTimer />
            <CrisisActionItems />
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// Manual crisis trigger panel (for testing/demo)
export const CrisisControlPanel: React.FC<{ show: boolean; onClose: () => void }> = ({
  show,
  onClose,
}) => {
  const triggerCrisis = useGameSimulationStore((state) => state.triggerCrisis);

  if (!show) return null;

  const handleTrigger = (scenario: CrisisConfig, severity: CrisisSeverity) => {
    triggerCrisis(scenario.type, severity, {
      name: scenario.name,
      description: scenario.description,
      duration: scenario.duration,
      scenarioId: scenario.id,
      affectedMachineId: scenario.type === 'fire' ? 'RM-103' : undefined,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[500px] bg-slate-900/98 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-[1000] pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white">Crisis Control Panel</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Crisis scenarios */}
      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {CRISIS_SCENARIOS.map((scenario) => {
          const Icon = scenario.icon;
          return (
            <div
              key={scenario.id}
              className="bg-slate-800/50 rounded-lg p-3 border border-slate-700"
            >
              <div className="flex items-start gap-3 mb-2">
                <Icon className={`w-5 h-5 text-${scenario.color}-400 flex-shrink-0`} />
                <div className="flex-1">
                  <h3 className="text-white font-medium text-sm">{scenario.name}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{scenario.description}</p>
                </div>
              </div>
              <div className="flex gap-1">
                {(['low', 'medium', 'high', 'critical'] as CrisisSeverity[]).map((severity) => (
                  <button
                    key={severity}
                    onClick={() => handleTrigger(scenario, severity)}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      severity === 'critical'
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : severity === 'high'
                          ? 'bg-orange-600 hover:bg-orange-500 text-white'
                          : severity === 'medium'
                            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {severity}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
