import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Brain,
  Activity,
  Users,
  Shield,
  Settings,
  Play,
  Pause,
  AlertTriangle,
  Zap,
  TrendingUp,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff,
  UserPlus,
  Copy,
  Gauge,
  Package,
  FastForward,
  Siren,
  Heart,
} from 'lucide-react';
import type { DockMode } from '../ui-new/dock/Dock';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useWorkerMoodStore } from '../../stores/workerMoodStore';

interface MobilePanelProps {
  isVisible: boolean;
  content: DockMode | null;
  onClose: () => void;
}

// Animation variants for the panel
const panelVariants = {
  hidden: {
    opacity: 0,
    y: '100%',
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    y: '50%',
    transition: { duration: 0.2 },
  },
};

// Get icon for panel header
const getPanelIcon = (mode: DockMode) => {
  const iconClass = 'w-5 h-5';
  switch (mode) {
    case 'overview':
      return <Home className={iconClass} />;
    case 'ai':
      return <Brain className={iconClass} />;
    case 'scada':
      return <Activity className={iconClass} />;
    case 'workforce':
      return <Users className={iconClass} />;
    case 'safety':
      return <Shield className={iconClass} />;
    case 'settings':
      return <Settings className={iconClass} />;
    case 'management':
      return <Heart className={iconClass} />;
    default:
      return <Home className={iconClass} />;
  }
};

// Get title for panel header
const getPanelTitle = (mode: DockMode) => {
  switch (mode) {
    case 'overview':
      return 'Overview';
    case 'ai':
      return 'AI Command';
    case 'scada':
      return 'SCADA System';
    case 'workforce':
      return 'Workforce';
    case 'safety':
      return 'Safety';
    case 'settings':
      return 'Settings';
    case 'management':
      return 'Management';
    case 'multiplayer':
      return 'Multiplayer';
    default:
      return 'Panel';
  }
};

// Overview panel content - comprehensive version matching desktop
const OverviewContent: React.FC = () => {
  const metrics = useProductionStore((s) => s.metrics);
  const machines = useProductionStore((s) => s.machines);
  const totalBagsProduced = useProductionStore((s) => s.totalBagsProduced);
  const productionTarget = useProductionStore((s) => s.productionTarget);

  const gameTime = useGameSimulationStore((s) => s.gameTime);
  const currentShift = useGameSimulationStore((s) => s.currentShift);
  const gameSpeed = useGameSimulationStore((s) => s.gameSpeed);
  const setGameSpeed = useGameSimulationStore((s) => s.setGameSpeed);

  const safetyMetrics = useSafetyStore((s) => s.safetyMetrics);

  // Machine status counts
  const machineStats = {
    running: machines.filter((m) => m.status === 'running').length,
    warning: machines.filter((m) => m.status === 'warning').length,
    critical: machines.filter((m) => m.status === 'critical').length,
    idle: machines.filter((m) => m.status === 'idle').length,
  };

  // Safety score calculation
  const safetyScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        (safetyMetrics?.nearMisses ?? 0) * 5 -
        (safetyMetrics?.safetyStops ?? 0) * 2 -
        (safetyMetrics?.workerEvasions ?? 0)
    )
  );

  // Format game time
  const formatGameTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Target progress
  const targetProgress = productionTarget
    ? Math.min(100, (productionTarget.producedBags / productionTarget.targetBags) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Time & Speed Controls */}
      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-lg font-mono font-bold text-white">
              {formatGameTime(gameTime)}
            </span>
            <span className="text-[10px] text-slate-500 capitalize">{currentShift}</span>
          </div>
          <span
            className={`text-[10px] font-bold ${gameSpeed === 0 ? 'text-red-400' : 'text-green-400'}`}
          >
            {gameSpeed === 0
              ? 'PAUSED'
              : gameSpeed === 180
                ? '1x'
                : gameSpeed === 1800
                  ? '10x'
                  : '60x'}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setGameSpeed(0)}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 0 ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <Pause className="w-3 h-3" />
          </button>
          <button
            onClick={() => setGameSpeed(180)}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 180 ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <Play className="w-3 h-3" />
            1x
          </button>
          <button
            onClick={() => setGameSpeed(1800)}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 1800 ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <FastForward className="w-3 h-3" />
            10x
          </button>
          <button
            onClick={() => setGameSpeed(10800)}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 10800 ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <FastForward className="w-3 h-3" />
            60x
          </button>
        </div>
      </div>

      {/* Production Metrics - 2x2 grid */}
      <div className="grid grid-cols-4 gap-1.5">
        <MiniMetric
          label="Throughput"
          value={metrics.throughput}
          icon={<Package className="w-3 h-3" />}
          color="cyan"
        />
        <MiniMetric
          label="Efficiency"
          value={`${metrics.efficiency.toFixed(0)}%`}
          icon={<TrendingUp className="w-3 h-3" />}
          color="green"
        />
        <MiniMetric
          label="Uptime"
          value={`${metrics.uptime.toFixed(0)}%`}
          icon={<Gauge className="w-3 h-3" />}
          color="blue"
        />
        <MiniMetric
          label="Quality"
          value={`${metrics.quality.toFixed(0)}%`}
          icon={<CheckCircle className="w-3 h-3" />}
          color="purple"
        />
      </div>

      {/* Machine Status */}
      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Machines</div>
        <div className="grid grid-cols-4 gap-1">
          <MachineStatusBadge label="Run" count={machineStats.running} color="green" />
          <MachineStatusBadge label="Warn" count={machineStats.warning} color="yellow" />
          <MachineStatusBadge label="Crit" count={machineStats.critical} color="red" />
          <MachineStatusBadge label="Idle" count={machineStats.idle} color="slate" />
        </div>
      </div>

      {/* Daily Target + Safety Score side by side */}
      <div className="grid grid-cols-2 gap-2">
        {/* Daily Target */}
        {productionTarget && (
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-500">Daily Target</span>
              <span className="text-cyan-400 font-mono">{targetProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full">
              <div
                className={`h-full rounded-full ${targetProgress >= 100 ? 'bg-green-500' : 'bg-cyan-500'}`}
                style={{ width: `${targetProgress}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-500 mt-1">
              {productionTarget.producedBags}/{productionTarget.targetBags}
            </div>
          </div>
        )}

        {/* Safety Score */}
        <div className="bg-slate-800/50 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Safety</span>
            <span
              className={`text-sm font-bold font-mono ${
                safetyScore > 90
                  ? 'text-green-400'
                  : safetyScore > 70
                    ? 'text-yellow-400'
                    : 'text-red-400'
              }`}
            >
              {safetyScore}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[9px]">
            <div className="text-slate-500">
              Misses: <span className="text-slate-300">{safetyMetrics?.nearMisses ?? 0}</span>
            </div>
            <div className="text-slate-500">
              Days: <span className="text-slate-300">{safetyMetrics?.daysSinceIncident ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Total Production */}
      <div className="text-center py-2 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-lg border border-cyan-500/20">
        <div className="text-[10px] text-slate-500">Total Bags</div>
        <div className="text-xl font-bold font-mono text-cyan-400">
          {totalBagsProduced.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

// Mini metric card for 4-column layout
const MiniMetric: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="bg-slate-800/50 rounded p-1.5 text-center">
      <div className={`${colorClasses[color]} flex justify-center mb-0.5`}>{icon}</div>
      <div className={`text-sm font-bold font-mono ${colorClasses[color]}`}>{value}</div>
      <div className="text-[8px] text-slate-500 uppercase">{label}</div>
    </div>
  );
};

// Machine status badge
const MachineStatusBadge: React.FC<{ label: string; count: number; color: string }> = ({
  label,
  count,
  color,
}) => {
  const colorClasses: Record<string, string> = {
    green: 'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red: 'text-red-400 bg-red-500/10',
    slate: 'text-slate-400 bg-slate-500/10',
  };

  return (
    <div className={`${colorClasses[color]} rounded py-1 text-center`}>
      <div className="text-sm font-bold">{count}</div>
      <div className="text-[8px] uppercase">{label}</div>
    </div>
  );
};

// Safety panel content with fire drill
const SafetyContent: React.FC = () => {
  const drillMetrics = useGameSimulationStore((s) => s.drillMetrics);
  const startEmergencyDrill = useGameSimulationStore((s) => s.startEmergencyDrill);
  const endEmergencyDrill = useGameSimulationStore((s) => s.endEmergencyDrill);
  const workers = useProductionStore((s) => s.workers);

  const evacuatedCount = drillMetrics.evacuatedWorkerIds.length;
  const totalWorkers = drillMetrics.totalWorkers || workers.length;
  const evacuationProgress = totalWorkers > 0 ? (evacuatedCount / totalWorkers) * 100 : 0;

  // Calculate elapsed time
  const elapsedSeconds = drillMetrics.active
    ? Math.floor((Date.now() - drillMetrics.startTime) / 1000)
    : (drillMetrics.finalTimeSeconds ?? 0);
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      {/* Emergency Stop */}
      <button className="w-full p-3 bg-red-600 hover:bg-red-500 rounded-lg flex items-center justify-center gap-2 text-white font-bold transition-colors">
        <AlertTriangle className="w-5 h-5" />
        EMERGENCY STOP
      </button>

      {/* Fire Drill Section */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Siren className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-white">Fire Drill</span>
        </div>

        {drillMetrics.active ? (
          <>
            {/* Active drill UI */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Evacuated</span>
                <span className="text-orange-400 font-mono">
                  {evacuatedCount}/{totalWorkers}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${evacuationProgress}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Time: {formatTime(elapsedSeconds)}</span>
                <button
                  onClick={endEmergencyDrill}
                  className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs font-medium text-white transition-colors"
                >
                  END DRILL
                </button>
              </div>
              {drillMetrics.evacuationComplete && (
                <div className="text-center py-1 bg-green-600/20 border border-green-500/30 rounded text-green-400 text-xs font-bold">
                  ALL CLEAR - {formatTime(drillMetrics.finalTimeSeconds ?? elapsedSeconds)}
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={() => startEmergencyDrill(workers.length)}
            className="w-full py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium text-white transition-colors"
          >
            START DRILL
          </button>
        )}
      </div>

      <div className="text-[10px] text-slate-500 text-center">
        Emergency stop halts production. Fire drill tests evacuation.
      </div>
    </div>
  );
};

// Settings panel content
const SettingsContent: React.FC = () => {
  const showZones = useUIStore((s) => s.showZones);
  const setShowZones = useUIStore((s) => s.setShowZones);

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span className="text-sm">Safety Zones</span>
          </div>
          <button
            onClick={() => setShowZones(!showZones)}
            className={`w-12 h-6 rounded-full transition-colors ${
              showZones ? 'bg-cyan-600' : 'bg-slate-600'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                showZones ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

// AI Command panel content
const AIContent: React.FC = () => {
  const aiDecisions = useProductionStore((s) => s.aiDecisions);
  const recentDecisions = aiDecisions.slice(0, 5);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-amber-400 animate-pulse" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-slate-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Brain className="w-4 h-4" />
        <span>Recent AI Decisions</span>
      </div>
      {recentDecisions.length === 0 ? (
        <div className="text-center py-4 text-slate-500 text-sm">No AI decisions yet</div>
      ) : (
        <div className="space-y-2">
          {recentDecisions.map((decision) => (
            <div
              key={decision.id}
              className="bg-slate-800/50 rounded-lg p-2 flex items-start gap-2"
            >
              {getStatusIcon(decision.status)}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{decision.action}</div>
                <div className="text-[10px] text-slate-400 truncate">{decision.reasoning}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// SCADA System panel content
const SCADAContent: React.FC = () => {
  const metrics = useProductionStore((s) => s.metrics);
  const scadaLive = useProductionStore((s) => s.scadaLive);

  const MetricCard: React.FC<{
    label: string;
    value: string | number;
    unit: string;
    icon: React.ReactNode;
  }> = ({ label, value, unit, icon }) => (
    <div className="bg-slate-800/50 rounded-lg p-2">
      <div className="flex items-center gap-1 text-slate-400 mb-1">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">
        {value}
        <span className="text-xs text-slate-400 ml-1">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-4 h-4" />
          <span>System Metrics</span>
        </div>
        <div
          className={`flex items-center gap-1 text-xs ${scadaLive ? 'text-green-400' : 'text-slate-500'}`}
        >
          {scadaLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{scadaLive ? 'Live' : 'Offline'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Throughput"
          value={metrics.throughput}
          unit="bags/hr"
          icon={<Zap className="w-3 h-3" />}
        />
        <MetricCard
          label="Efficiency"
          value={metrics.efficiency.toFixed(1)}
          unit="%"
          icon={<TrendingUp className="w-3 h-3" />}
        />
        <MetricCard
          label="Uptime"
          value={metrics.uptime.toFixed(1)}
          unit="%"
          icon={<Gauge className="w-3 h-3" />}
        />
        <MetricCard
          label="Quality"
          value={metrics.quality.toFixed(1)}
          unit="%"
          icon={<CheckCircle className="w-3 h-3" />}
        />
      </div>
    </div>
  );
};

// Workforce panel content
const WorkforceContent: React.FC = () => {
  const workers = useProductionStore((s) => s.workers);
  const satisfaction = useProductionStore((s) => s.workerSatisfaction);

  const activeWorkers = workers.filter((w) => w.currentTask !== 'idle').length;
  const totalWorkers = workers.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Users className="w-4 h-4" />
        <span>Workforce Status</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {activeWorkers}/{totalWorkers}
          </div>
          <div className="text-[10px] text-slate-400">Active Workers</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">{satisfaction.overallScore}%</div>
          <div className="text-[10px] text-slate-400">Satisfaction</div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">Productivity Bonus</span>
          <span className="text-green-400">+{satisfaction.productivityBonus}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, satisfaction.overallScore)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// Multiplayer panel content
const MultiplayerContent: React.FC = () => {
  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const roomCode = useMultiplayerStore((s) => s.roomCode);
  const isHost = useMultiplayerStore((s) => s.isHost);
  const remotePlayers = useMultiplayerStore((s) => s._remotePlayersArray);
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const leaveRoom = useMultiplayerStore((s) => s.leaveRoom);

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
    }
  };

  if (connectionState === 'disconnected') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Users className="w-4 h-4" />
          <span>Multiplayer</span>
        </div>
        <button
          onClick={createRoom}
          className="w-full p-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg flex items-center justify-center gap-2 text-white font-medium transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Create Room
        </button>
        <div className="text-[10px] text-slate-500 text-center">
          Share the room code with friends to play together
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Users className="w-4 h-4" />
          <span>Room: {roomCode}</span>
        </div>
        <button
          onClick={copyRoomCode}
          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
          aria-label="Copy room code"
        >
          <Copy className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="text-xs text-slate-400 mb-2">
          {isHost ? 'You are the host' : 'Connected as guest'}
        </div>
        <div className="text-sm text-white">
          {remotePlayers.length + 1} player{remotePlayers.length !== 0 ? 's' : ''} in room
        </div>
        {remotePlayers.length > 0 && (
          <div className="mt-2 space-y-1">
            {remotePlayers.slice(0, 3).map((player) => (
              <div key={player.id} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                <span className="text-slate-300">{player.name}</span>
              </div>
            ))}
            {remotePlayers.length > 3 && (
              <div className="text-[10px] text-slate-500">+{remotePlayers.length - 3} more</div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={leaveRoom}
        className="w-full p-2 bg-red-600/80 hover:bg-red-500/80 rounded-lg text-white text-sm font-medium transition-colors"
      >
        Leave Room
      </button>
    </div>
  );
};

// Management Style panel content (simplified for mobile)
const ManagementContent: React.FC = () => {
  const managementGenerosity = useAIConfigStore((s) => s.managementGenerosity);
  const setManagementGenerosity = useAIConfigStore((s) => s.setManagementGenerosity);
  const getGrantRate = useAIConfigStore((s) => s.getGrantRate);
  const averageTrust = useWorkerMoodStore((s) => s.getAverageManagementTrust());
  const averageInitiative = useWorkerMoodStore((s) => s.getAverageInitiative());
  const productivityMultiplier = useWorkerMoodStore((s) => s.getWorkforceProductivityMultiplier());

  const grantRate = getGrantRate();
  const styleLabel =
    managementGenerosity >= 80
      ? 'Generous'
      : managementGenerosity >= 60
        ? 'Kind'
        : managementGenerosity >= 40
          ? 'Balanced'
          : managementGenerosity >= 20
            ? 'Firm'
            : 'Strict';

  const PRESETS = [
    { name: 'Strict', value: 10 },
    { name: 'Balanced', value: 50 },
    { name: 'Kind', value: 75 },
    { name: 'Generous', value: 95 },
  ];

  return (
    <div className="space-y-3">
      {/* Current Style */}
      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Heart
            className={`w-5 h-5 ${managementGenerosity >= 60 ? 'text-green-400' : managementGenerosity >= 40 ? 'text-blue-400' : 'text-amber-400'}`}
          />
          <span className="text-sm font-medium text-white">{styleLabel}</span>
        </div>
        <span className="text-lg font-bold font-mono text-cyan-400">{managementGenerosity}%</span>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => setManagementGenerosity(preset.value)}
            className={`py-2 rounded text-xs font-medium transition-colors ${
              Math.abs(managementGenerosity - preset.value) < 10
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Slider */}
      <input
        id="mobile-management-generosity"
        type="range"
        min="0"
        max="100"
        value={managementGenerosity}
        onChange={(e) => setManagementGenerosity(parseInt(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 bg-gradient-to-r from-red-600 via-blue-500 to-green-500"
        aria-label="Management generosity"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={managementGenerosity}
        aria-valuetext={`${managementGenerosity} percent, ${styleLabel} style`}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-sm font-bold text-cyan-400">{(grantRate * 100).toFixed(0)}%</div>
          <div className="text-[9px] text-slate-500">Grant</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-sm font-bold text-white">{averageTrust.toFixed(0)}%</div>
          <div className="text-[9px] text-slate-500">Trust</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div className="text-sm font-bold text-white">{averageInitiative.toFixed(0)}%</div>
          <div className="text-[9px] text-slate-500">Initiative</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 text-center">
          <div
            className={`text-sm font-bold ${productivityMultiplier >= 1.0 ? 'text-green-400' : 'text-amber-400'}`}
          >
            {(productivityMultiplier * 100).toFixed(0)}%
          </div>
          <div className="text-[9px] text-slate-500">Output</div>
        </div>
      </div>

      {/* Info */}
      <div className="text-[10px] text-slate-500 text-center">
        Higher generosity builds trust → improves productivity
      </div>
    </div>
  );
};

// Placeholder content for other panels
const PlaceholderContent: React.FC<{ mode: DockMode }> = ({ mode }) => {
  return (
    <div className="flex items-center justify-center h-full text-slate-400">
      <div className="text-center">
        <div className="mb-2">{getPanelIcon(mode)}</div>
        <div className="text-sm">{getPanelTitle(mode)} panel</div>
        <div className="text-xs text-slate-500 mt-1">Coming soon</div>
      </div>
    </div>
  );
};

// Get content based on mode
const getPanelContent = (mode: DockMode | null) => {
  switch (mode) {
    case 'overview':
      return <OverviewContent />;
    case 'ai':
      return <AIContent />;
    case 'scada':
      return <SCADAContent />;
    case 'workforce':
      return <WorkforceContent />;
    case 'multiplayer':
      return <MultiplayerContent />;
    case 'safety':
      return <SafetyContent />;
    case 'settings':
      return <SettingsContent />;
    case 'management':
      return <ManagementContent />;
    default:
      return mode ? <PlaceholderContent mode={mode} /> : null;
  }
};

/**
 * Mobile panel component - centered modal at 1/3 screen height
 * Shows simplified versions of sidebar content
 */
export const MobilePanel: React.FC<MobilePanelProps> = ({ isVisible, content, onClose }) => {
  return (
    <AnimatePresence>
      {isVisible && content && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 pointer-events-auto"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed left-4 right-4 z-50 pointer-events-auto"
            style={{
              bottom: 'max(100px, calc(env(safe-area-inset-bottom) + 90px))',
              maxHeight: '33vh',
            }}
            aria-label={`${getPanelTitle(content)} mobile panel`}
            role="complementary"
          >
            <div className="flex flex-col max-h-[33vh] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-200">
                  {getPanelIcon(content)}
                  <span className="font-medium">{getPanelTitle(content)}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 p-4 overflow-y-auto">{getPanelContent(content)}</div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
