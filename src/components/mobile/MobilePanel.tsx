import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Brain,
  Activity,
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
  Gauge,
  Package,
  FastForward,
  Heart,
  Truck,
} from 'lucide-react';
import type { DockMode } from '../ui-new/dock/Dock';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { EmergencyStopButton } from '../ui/EmergencyStopButton';
import { JevAdvisoryPanel } from '../ui/JevAdvisoryPanel';

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
    case 'production':
    case 'overview':
      return <Home className={iconClass} />;
    case 'ai':
      return <Brain className={iconClass} />;
    case 'scada':
      return <Activity className={iconClass} />;
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
    case 'production':
      return 'Production';
    case 'overview':
      return 'Mill Overview';
    case 'ai':
      return 'AI Partner';
    case 'scada':
      return 'Simulated SCADA';
    case 'safety':
      return 'Safety & Emergency';
    case 'settings':
      return 'Settings';
    case 'management':
      return 'Bilateral Autonomy';
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
  const campaignOrders = useOperationsCampaignStore((s) => s.orders);
  const campaignIncidents = useOperationsCampaignStore((s) => s.incidents);
  const campaignConstraints = useOperationsCampaignStore((s) => s.constraints);
  const campaignEconomics = useOperationsCampaignStore((s) => s.economics);
  const campaignExecution = useOperationsCampaignStore((s) => s.execution);

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
      100 - (safetyMetrics?.nearMisses ?? 0) * 5 - (safetyMetrics?.safetyStops ?? 0) * 2
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
            {gameSpeed === 0 ? 'PAUSED' : `${Number((gameSpeed / 180).toFixed(1))}x`}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setGameSpeed(0)}
            aria-label="Pause simulation"
            aria-pressed={gameSpeed === 0}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 0 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-white/70'
            }`}
          >
            <Pause className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            onClick={() => setGameSpeed(180)}
            aria-pressed={gameSpeed === 180}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 180 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-white/70'
            }`}
          >
            <Play className="w-3 h-3" aria-hidden="true" />
            1x
          </button>
          <button
            onClick={() => setGameSpeed(1800)}
            aria-pressed={gameSpeed === 1800}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 1800 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-white/70'
            }`}
          >
            <FastForward className="w-3 h-3" aria-hidden="true" />
            10x
          </button>
          <button
            onClick={() => setGameSpeed(10800)}
            aria-pressed={gameSpeed === 10800}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
              gameSpeed === 10800 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-white/70'
            }`}
          >
            <FastForward className="w-3 h-3" aria-hidden="true" />
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
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            Operations campaign
          </span>
          <span className="font-mono text-[10px] text-slate-300">
            {campaignOrders.filter((order) => order.status === 'fulfilled').length}/
            {campaignOrders.length} orders
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[9px]">
          <div className="text-slate-400">
            Active incidents:{' '}
            <span className="font-semibold text-amber-300">
              {campaignIncidents.filter((incident) => incident.phase !== 'resolved').length}
            </span>
          </div>
          <div className="text-slate-400">
            Revenue:{' '}
            <span className="font-semibold text-emerald-300">
              £{campaignEconomics.revenue.toFixed(0)}
            </span>
          </div>
        </div>
        <div className="mt-1.5 rounded bg-slate-950/35 p-1.5 text-[9px]">
          <div className="flex items-center justify-between gap-2">
            <span className="capitalize text-cyan-200">
              {campaignExecution.stage.replaceAll('_', ' ')}
            </span>
            <span className="font-mono text-slate-300">
              {campaignExecution.lineSetpointPercent.toFixed(0)}% setpoint
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-slate-400">
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" aria-hidden="true" /> Outbound
            </span>
            <span className="font-mono">
              {campaignExecution.dispatchLoad.loadedKg.toFixed(0)} /{' '}
              {campaignExecution.dispatchLoad.capacityKg.toFixed(0)} kg
            </span>
          </div>
        </div>
        {campaignConstraints[0] && (
          <p className="mt-1.5 text-[9px] text-amber-100">
            {campaignConstraints[0].label}: {campaignConstraints[0].detail}
          </p>
        )}
      </div>

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

// Safety panel content for the uncrewed site
const SafetyContent: React.FC = () => {
  return (
    <div className="space-y-3">
      {/* Emergency Stop */}
      <EmergencyStopButton />

      <div className="text-[10px] text-slate-500 text-center">
        Halts every autonomous forklift until released. Production lines keep running.
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
            role="switch"
            aria-checked={showZones}
            aria-label="Safety Zones"
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

// AI Partner panel content
const AIContent: React.FC = () => {
  const aiDecisions = useProductionStore((s) => s.aiDecisions);
  const latestAlert = useUIStore((s) => s.alerts[0]);
  const [activeTab, setActiveTab] = React.useState<'decisions' | 'advisory'>('decisions');
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
      <div role="tablist" aria-label="AI Partner views" className="flex gap-2">
        {(['decisions', 'advisory'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            id={`mobile-ai-${tab}-tab`}
            aria-selected={activeTab === tab}
            aria-controls="mobile-ai-tabpanel"
            onClick={() => setActiveTab(tab)}
            className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              activeTab === tab ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {tab === 'decisions' ? 'Decisions' : 'Advisory'}
          </button>
        ))}
      </div>
      <div
        id="mobile-ai-tabpanel"
        role="tabpanel"
        aria-labelledby={`mobile-ai-${activeTab}-tab`}
        className="space-y-3"
      >
        {activeTab === 'advisory' ? (
          <JevAdvisoryPanel
            latestAlert={latestAlert ? `${latestAlert.title}\n${latestAlert.message}` : undefined}
          />
        ) : (
          <>
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
                      <div className="text-[10px] text-slate-400 truncate">
                        {decision.reasoning}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Declared at module scope: defined inside SCADAContent it was a new component
// type every render, so all four cards remounted on each metrics tick.
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

// Simulated SCADA panel content
const SCADAContent: React.FC = () => {
  const metrics = useProductionStore((s) => s.metrics);
  const scadaLive = useProductionStore((s) => s.scadaLive);
  const campaignExecution = useOperationsCampaignStore((s) => s.execution);
  const utilityAssets = useOperationsCampaignStore((s) => s.utilityAssets);

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
          <span>{scadaLive ? 'Telemetry on' : 'Telemetry off'}</span>
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
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="uppercase text-slate-400">Execution route</span>
          <span className="capitalize text-cyan-200">
            {campaignExecution.stage.replaceAll('_', ' ')}
          </span>
        </div>
        <div className="mt-1 text-xs font-semibold text-white">
          {campaignExecution.sourceMaterial?.replaceAll('_', ' ') ?? 'No source'} to{' '}
          {campaignExecution.finishedMaterial?.replaceAll('_', ' ') ?? 'no product'}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          QC {campaignExecution.qualityReleased ? 'released' : 'held'},{' '}
          {campaignExecution.releasedFinishedKg.toFixed(0)} kg available
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Utility vessels
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {utilityAssets.map((asset) => (
            <div key={asset.id} className="rounded bg-slate-800/50 p-2">
              <div className="truncate text-[9px] font-semibold text-slate-200">{asset.label}</div>
              <div className="mt-0.5 font-mono text-xs text-cyan-300">
                {asset.levelPercent.toFixed(1)}%
              </div>
              <div className="font-mono text-[9px] text-slate-500">
                {asset.temperatureC.toFixed(1)} °C · {asset.pressureBar.toFixed(2)} bar
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Autonomous plant status for compact layouts
const ManagementContent: React.FC = () => {
  const machines = useProductionStore((state) => state.machines);
  const metrics = useProductionStore((state) => state.metrics);
  const incidents = useOperationsCampaignStore((state) => state.incidents);
  const activeAssets = machines.filter((machine) => machine.status === 'running').length;
  const openIncidents = incidents.filter((incident) => incident.phase !== 'resolved').length;
  const readiness = Math.max(0, Math.round(metrics.uptime - openIncidents * 8));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-slate-800/50 p-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-cyan-400" />
          <span className="text-sm font-medium text-white">Autonomous readiness</span>
        </div>
        <span className="font-mono text-lg font-bold text-cyan-400">{readiness}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div className="text-sm font-bold text-emerald-400">{activeAssets}</div>
          <div className="text-[9px] text-slate-500">Active assets</div>
        </div>
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div className="text-sm font-bold text-cyan-400">{metrics.throughput}</div>
          <div className="text-[9px] text-slate-500">Bags per hour</div>
        </div>
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div
            className={
              openIncidents
                ? 'text-sm font-bold text-amber-400'
                : 'text-sm font-bold text-emerald-400'
            }
          >
            {openIncidents}
          </div>
          <div className="text-[9px] text-slate-500">Open incidents</div>
        </div>
      </div>
      <div className="text-center text-[10px] text-slate-500">
        Process, logistics, safety, and dispatch remain under closed-loop control.
      </div>
    </div>
  );
};

// Get content based on mode
const getPanelContent = (mode: DockMode | null) => {
  if (!mode) return null;
  switch (mode) {
    case 'production':
    case 'overview':
      return <OverviewContent />;
    case 'ai':
      return <AIContent />;
    case 'scada':
      return <SCADAContent />;
    case 'safety':
      return <SafetyContent />;
    case 'settings':
      return <SettingsContent />;
    case 'management':
      return <ManagementContent />;
  }
};

/**
 * Mobile panel component - centered modal at 1/3 screen height
 * Shows simplified versions of sidebar content
 */
export const MobilePanel: React.FC<MobilePanelProps> = ({ isVisible, content, onClose }) => {
  const panelRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Modal behavior: Escape to dismiss, move focus into the panel on open,
  // and restore focus to the previously-focused element on close.
  React.useEffect(() => {
    if (!isVisible || !content) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hidden && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        e.preventDefault();
        closeButtonRef.current?.focus();
      } else if (
        e.shiftKey &&
        (document.activeElement === first || !panelRef.current.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isVisible, content, onClose]);

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
            ref={panelRef}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed left-4 right-4 z-50 pointer-events-auto"
            style={{
              bottom: 'max(100px, calc(env(safe-area-inset-bottom) + 90px))',
              maxHeight: content === 'ai' ? '70vh' : '33vh',
            }}
            aria-label={`${getPanelTitle(content)} mobile panel`}
            role="dialog"
            aria-modal="true"
          >
            <div
              className={`flex flex-col ${content === 'ai' ? 'max-h-[70vh]' : 'max-h-[33vh]'} bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl`}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-200">
                  {getPanelIcon(content)}
                  <span className="font-medium">{getPanelTitle(content)}</span>
                </div>
                <button
                  ref={closeButtonRef}
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
