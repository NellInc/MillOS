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
  Route,
  ScrollText,
} from 'lucide-react';
import { ChroniclePanel } from '../chronicle/ChroniclePanel';
import type { DockMode } from '../ui-new/dock/Dock';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { selectChosenPace, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { SafetyPanel } from '../ui-new/panels/SafetyPanel';
import { JevAdvisoryPanel } from '../ui/JevAdvisoryPanel';
import { OnDeviceOperatorRecord } from '../ui/OnDeviceOperatorRecord';
import { WorkplaceLab } from '../ui-new/widgets/WorkplaceLab';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  capitalizeIn,
  formatFixed,
  formatGrouped,
  useLocale,
  useT,
  type Translator,
} from '../../i18n';
import { mobilePanelMessages } from './MobilePanel.messages';
import { PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { paceMessages } from '../../simulation/pace.messages';

import { OperationsPlayCard, PaceHoldNote, ShiftDebrief } from '../ui-new/onboarding/PlayableShift';
import { BatchGenealogySection, MaintenanceSection } from '../ui-new/panels/OverviewPanel';

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

// Working if reduced-motion panels have no translated or scaled first paint,
// including when the OS preference changes while the app is already open.
const reducedPanelVariants = {
  hidden: { opacity: 0, y: 0, scale: 1 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0 } },
  exit: { opacity: 0, y: 0, scale: 1, transition: { duration: 0 } },
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
    case 'chronicle':
      return <ScrollText className={iconClass} />;
    default:
      return <Home className={iconClass} />;
  }
};

type PanelT = Translator<(typeof mobilePanelMessages)['en']>;

// Get title for panel header
const getPanelTitle = (mode: DockMode, t: PanelT) => {
  switch (mode) {
    case 'production':
      return t('titleProduction');
    case 'overview':
      return t('titleOverview');
    case 'ai':
      return t('titleAi');
    case 'scada':
      return t('titleScada');
    case 'safety':
      return t('titleSafety');
    case 'settings':
      return t('titleSettings');
    case 'management':
      return t('titleManagement');
    case 'chronicle':
      return t('titleChronicle');
    default:
      return t('titlePanel');
  }
};

// Store enums rendered as copy; an unknown value falls back to its old raw form.
const SHIFT_KEYS = {
  morning: 'shiftMorning',
  afternoon: 'shiftAfternoon',
  night: 'shiftNight',
} as const;

const STAGE_KEYS = {
  planning: 'stagePlanning',
  milling: 'stageMilling',
  quality_hold: 'stageQualityHold',
  ready_to_load: 'stageReadyToLoad',
  loading: 'stageLoading',
  ready_to_dispatch: 'stageReadyToDispatch',
  dispatched: 'stageDispatched',
  fulfilled: 'stageFulfilled',
} as const;

const MATERIAL_KEYS = {
  wheat_grain: 'materialWheatGrain',
  corn_grain: 'materialCornGrain',
  flour: 'materialFlour',
  semolina: 'materialSemolina',
} as const;

const formatShift = (shift: string, t: PanelT) => {
  const key = (SHIFT_KEYS as Record<string, (typeof SHIFT_KEYS)[keyof typeof SHIFT_KEYS]>)[shift];
  return key ? t(key) : shift;
};

const formatStage = (stage: string, t: PanelT) => {
  const key = (STAGE_KEYS as Record<string, (typeof STAGE_KEYS)[keyof typeof STAGE_KEYS]>)[stage];
  return key ? t(key) : stage.replaceAll('_', ' ');
};

const formatMaterial = (material: string, t: PanelT) => {
  const key = (MATERIAL_KEYS as Record<string, (typeof MATERIAL_KEYS)[keyof typeof MATERIAL_KEYS]>)[
    material
  ];
  return key ? t(key) : material.replaceAll('_', ' ');
};

// Overview panel content - comprehensive version matching desktop
const MOBILE_PACE_LABELS: Record<number, string> = { 15: '1/2x', 30: '1x', 60: '2x', 120: '4x' };
const OverviewContent: React.FC = () => {
  const t = useT(mobilePanelMessages);
  const pace = useT(paceMessages);
  const locale = useLocale();
  const metrics = useProductionStore((s) => s.metrics);
  const machines = useProductionStore((s) => s.machines);
  const totalBagsProduced = useProductionStore((s) => s.totalBagsProduced);
  const productionTarget = useProductionStore((s) => s.productionTarget);

  const gameTime = useGameSimulationStore((s) => s.gameTime);
  const currentShift = useGameSimulationStore((s) => s.currentShift);
  const gameSpeed = useGameSimulationStore((s) => s.gameSpeed);
  // The same chosen pace and hold note as Shift pace (TeachingPace).
  const chosenPace = useGameSimulationStore(selectChosenPace);
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
      <OperationsPlayCard />
      <ShiftDebrief />
      <button
        onClick={() => window.dispatchEvent(new Event('millos:open-layout-planner'))}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-cyan-700 bg-cyan-950 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-900"
      >
        <Route size={18} aria-hidden="true" /> {t('planLogistics')}
      </button>
      <details className="rounded-xl border border-slate-700 p-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-cyan-200">
          {t('batchTraceability')}
        </summary>
        <BatchGenealogySection />
      </details>
      {/* The repair next action lands here on a phone, as it does in Overview. */}
      <MaintenanceSection />
      {/* Time & Speed Controls */}
      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-lg font-mono font-bold text-white">
              {formatGameTime(gameTime)}
            </span>
            <span className={`text-[10px] text-slate-400 ${capitalizeIn(locale)}`}>
              {formatShift(currentShift, t)}
            </span>
          </div>
          <span
            className={`text-[10px] font-bold ${gameSpeed === 0 ? 'text-red-400' : 'text-green-400'}`}
          >
            {gameSpeed === 0
              ? t('paused')
              : `${formatGrouped(Number((gameSpeed / STANDARD_GAME_SPEED).toFixed(1)), { useGrouping: false })}x`}
          </span>
        </div>
        {/* The same paces and words as Shift pace (src/simulation/pace.ts). */}
        <div className="flex gap-1.5" role="group" aria-label={pace('paceTitle')}>
          {PACE_GAME_SPEEDS.map((value) => (
            <button
              key={value}
              onClick={() => setGameSpeed(value)}
              aria-label={pace(`pace${value}`)}
              aria-pressed={chosenPace === value}
              className={`flex-1 min-w-0 min-h-11 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
                chosenPace === value ? 'bg-orange-700 text-white' : 'bg-slate-700 text-white/70'
              }`}
            >
              {value === 0 ? (
                <Pause className="w-3 h-3" aria-hidden="true" />
              ) : value > STANDARD_GAME_SPEED ? (
                <FastForward className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Play className="w-3 h-3" aria-hidden="true" />
              )}
              {value > 0 && <span aria-hidden="true">{MOBILE_PACE_LABELS[value]}</span>}
            </button>
          ))}
        </div>
        <PaceHoldNote />
      </div>

      {/* Production Metrics - 2x2 grid. At the 10 px label floor, four to a
          row leaves 64.5 px at 390 px and 'THROUGHPUT' needs 70.6 px; from
          640 px four fit at 127 px each. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <MiniMetric
          label={t('throughput')}
          value={formatFixed(metrics.throughput, 0)}
          icon={<Package className="w-3 h-3" />}
          color="cyan"
        />
        <MiniMetric
          label={t('efficiency')}
          value={`${formatFixed(metrics.efficiency, 0)}%`}
          icon={<TrendingUp className="w-3 h-3" />}
          color="green"
        />
        <MiniMetric
          label={t('uptime')}
          value={`${formatFixed(metrics.uptime, 0)}%`}
          icon={<Gauge className="w-3 h-3" />}
          color="blue"
        />
        <MiniMetric
          label={t('quality')}
          value={`${formatFixed(metrics.quality, 0)}%`}
          icon={<CheckCircle className="w-3 h-3" />}
          color="purple"
        />
      </div>

      {/* Machine Status */}
      <div className="bg-slate-800/50 rounded-lg p-2">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
          {t('machines')}
        </div>
        <div className="grid grid-cols-4 gap-1">
          <MachineStatusBadge label={t('statusRun')} count={machineStats.running} color="green" />
          <MachineStatusBadge label={t('statusWarn')} count={machineStats.warning} color="yellow" />
          <MachineStatusBadge label={t('statusCrit')} count={machineStats.critical} color="red" />
          <MachineStatusBadge label={t('statusIdle')} count={machineStats.idle} color="slate" />
        </div>
      </div>

      {/* Daily Target + Safety Score side by side */}
      <div className="grid grid-cols-2 gap-2">
        {/* Daily Target */}
        {productionTarget && (
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-400">{t('dailyTarget')}</span>
              <span className="text-cyan-400 font-mono">{formatFixed(targetProgress, 0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full">
              <div
                className={`h-full rounded-full ${targetProgress >= 100 ? 'bg-green-500' : 'bg-cyan-500'}`}
                style={{ width: `${targetProgress}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {formatFixed(productionTarget.producedBags, 0)}/
              {formatFixed(productionTarget.targetBags, 0)}
            </div>
          </div>
        )}

        {/* Safety Score */}
        <div className="bg-slate-800/50 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400">{t('safety')}</span>
            <span
              className={`text-sm font-bold font-mono ${
                safetyScore > 90
                  ? 'text-green-400'
                  : safetyScore > 70
                    ? 'text-yellow-400'
                    : 'text-red-400'
              }`}
            >
              {formatFixed(safetyScore, 0)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="text-slate-400">
              {t('nearMisses')}{' '}
              <span className="text-slate-300">
                {formatFixed(safetyMetrics?.nearMisses ?? 0, 0)}
              </span>
            </div>
            <div className="text-slate-400">
              {t('daysSinceIncident')}{' '}
              <span className="text-slate-300">
                {formatFixed(safetyMetrics?.daysSinceIncident ?? 0, 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Total Production */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            {t('operationsCampaign')}
          </span>
          <span className="font-mono text-[10px] text-slate-300">
            {t('ordersProgress', {
              done: formatFixed(
                campaignOrders.filter((order) => order.status === 'fulfilled').length,
                0
              ),
              total: formatFixed(campaignOrders.length, 0),
            })}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
          <div className="text-slate-400">
            {t('activeIncidents')}{' '}
            <span className="font-semibold text-amber-300">
              {formatFixed(
                campaignIncidents.filter((incident) => incident.phase !== 'resolved').length,
                0
              )}
            </span>
          </div>
          <div className="text-slate-400">
            {t('revenue')}{' '}
            <span className="font-semibold text-emerald-300">
              £{formatFixed(campaignEconomics.revenue, 0)}
            </span>
          </div>
        </div>
        <div className="mt-1.5 rounded bg-slate-950/35 p-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-2">
            <span className={`${capitalizeIn(locale)} text-cyan-200`}>
              {formatStage(campaignExecution.stage, t)}
            </span>
            <span className="font-mono text-slate-300">
              {t('setpointPercent', {
                value: formatFixed(campaignExecution.lineSetpointPercent, 0),
              })}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-slate-400">
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" aria-hidden="true" /> {t('outbound')}
            </span>
            <span className="font-mono">
              {formatFixed(campaignExecution.dispatchLoad.loadedKg, 0)} /{' '}
              {formatFixed(campaignExecution.dispatchLoad.capacityKg, 0)} kg
            </span>
          </div>
        </div>
        {campaignConstraints[0] && (
          <p className="mt-1.5 text-[10px] text-amber-100">
            {campaignConstraints[0].label}: {campaignConstraints[0].detail}
          </p>
        )}
      </div>

      <div className="text-center py-2 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-lg border border-cyan-500/20">
        <div className="text-[10px] text-slate-400">{t('totalBags')}</div>
        <div className="text-xl font-bold font-mono text-cyan-400">
          {formatGrouped(totalBagsProduced)}
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
      <div className="break-words text-[10px] leading-tight text-slate-400 uppercase">{label}</div>
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
      <div className="text-sm font-bold">{formatFixed(count, 0)}</div>
      <div className="break-words text-[10px] leading-tight uppercase">{label}</div>
    </div>
  );
};

// Settings panel content
const SettingsContent: React.FC = () => {
  const t = useT(mobilePanelMessages);
  const showZones = useUIStore((s) => s.showZones);
  const setShowZones = useUIStore((s) => s.setShowZones);

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span className="text-sm">{t('safetyZones')}</span>
          </div>
          <button
            onClick={() => setShowZones(!showZones)}
            role="switch"
            aria-checked={showZones}
            aria-label={t('safetyZones')}
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
  const t = useT(mobilePanelMessages);
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
      <div role="tablist" aria-label={t('aiViews')} className="flex gap-2">
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
            {tab === 'decisions' ? t('tabDecisions') : t('tabAdvisory')}
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
          <>
            <JevAdvisoryPanel
              latestAlert={latestAlert ? `${latestAlert.title}\n${latestAlert.message}` : undefined}
            />
            <OnDeviceOperatorRecord />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Brain className="w-4 h-4" />
              <span>{t('recentDecisions')}</span>
            </div>
            {recentDecisions.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-sm">{t('noDecisions')}</div>
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
  const t = useT(mobilePanelMessages);
  const locale = useLocale();
  const metrics = useProductionStore((s) => s.metrics);
  const scadaLive = useProductionStore((s) => s.scadaLive);
  const campaignExecution = useOperationsCampaignStore((s) => s.execution);
  const utilityAssets = useOperationsCampaignStore((s) => s.utilityAssets);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-4 h-4" />
          <span>{t('systemMetrics')}</span>
        </div>
        <div
          className={`flex items-center gap-1 text-xs ${scadaLive ? 'text-green-400' : 'text-slate-400'}`}
        >
          {scadaLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{scadaLive ? t('telemetryOn') : t('telemetryOff')}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label={t('throughput')}
          value={formatFixed(metrics.throughput, 0)}
          unit={t('bagsPerHrUnit')}
          icon={<Zap className="w-3 h-3" />}
        />
        <MetricCard
          label={t('efficiency')}
          value={formatFixed(metrics.efficiency, 1)}
          unit="%"
          icon={<TrendingUp className="w-3 h-3" />}
        />
        <MetricCard
          label={t('uptime')}
          value={formatFixed(metrics.uptime, 1)}
          unit="%"
          icon={<Gauge className="w-3 h-3" />}
        />
        <MetricCard
          label={t('quality')}
          value={formatFixed(metrics.quality, 1)}
          unit="%"
          icon={<CheckCircle className="w-3 h-3" />}
        />
      </div>
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="uppercase text-slate-400">{t('executionRoute')}</span>
          <span className={`${capitalizeIn(locale)} text-cyan-200`}>
            {formatStage(campaignExecution.stage, t)}
          </span>
        </div>
        <div className="mt-1 text-xs font-semibold text-white">
          {t('route', {
            source: campaignExecution.sourceMaterial
              ? formatMaterial(campaignExecution.sourceMaterial, t)
              : t('noSource'),
            product: campaignExecution.finishedMaterial
              ? formatMaterial(campaignExecution.finishedMaterial, t)
              : t('noProduct'),
          })}
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          {t('qcStatus', {
            released: Boolean(campaignExecution.qualityReleased),
            kg: formatFixed(campaignExecution.releasedFinishedKg, 0),
          })}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {t('utilityVessels')}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {utilityAssets.map((asset) => (
            <div key={asset.id} className="rounded bg-slate-800/50 p-2">
              <div className="truncate text-[10px] font-semibold text-slate-200">{asset.label}</div>
              <div className="mt-0.5 font-mono text-xs text-cyan-300">
                {formatFixed(asset.levelPercent, 1)}%
              </div>
              <div className="font-mono text-[10px] text-slate-400">
                {formatFixed(asset.temperatureC, 1)} °C · {formatFixed(asset.pressureBar, 2)} bar
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
  const t = useT(mobilePanelMessages);
  const machines = useProductionStore((state) => state.machines);
  const metrics = useProductionStore((state) => state.metrics);
  const incidents = useOperationsCampaignStore((state) => state.incidents);
  const activeAssets = machines.filter((machine) => machine.status === 'running').length;
  const openIncidents = incidents.filter((incident) => incident.phase !== 'resolved').length;
  const readiness = Math.max(0, Math.round(metrics.uptime - openIncidents * 8));

  return (
    <div className="space-y-3">
      <WorkplaceLab />
      <div className="flex items-center justify-between rounded-lg bg-slate-800/50 p-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-cyan-400" />
          <span className="text-sm font-medium text-white">{t('autonomousReadiness')}</span>
        </div>
        <span className="font-mono text-lg font-bold text-cyan-400">
          {formatFixed(readiness, 0)}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div className="text-sm font-bold text-emerald-400">{formatFixed(activeAssets, 0)}</div>
          <div className="text-[10px] text-slate-400">{t('activeAssets')}</div>
        </div>
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div className="text-sm font-bold text-cyan-400">
            {formatFixed(metrics.throughput, 0)}
          </div>
          <div className="text-[10px] text-slate-400">{t('bagsPerHour')}</div>
        </div>
        <div className="rounded bg-slate-800/50 p-2 text-center">
          <div
            className={
              openIncidents
                ? 'text-sm font-bold text-amber-400'
                : 'text-sm font-bold text-emerald-400'
            }
          >
            {formatFixed(openIncidents, 0)}
          </div>
          <div className="text-[10px] text-slate-400">{t('openIncidents')}</div>
        </div>
      </div>
      <div className="text-center text-[10px] text-slate-400">{t('closedLoopNote')}</div>
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
      return <SafetyPanel />;
    case 'settings':
      return <SettingsContent />;
    case 'management':
      return <ManagementContent />;
    case 'chronicle':
      return <ChroniclePanel />;
  }
};

/**
 * Mobile panel component - centered modal at 1/3 screen height
 * Shows simplified versions of sidebar content
 */
export const MobilePanel: React.FC<MobilePanelProps> = ({ isVisible, content, onClose }) => {
  const panelRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const t = useT(mobilePanelMessages);

  // Modal behavior: Escape to dismiss, move focus into the panel on open,
  // and restore focus to the previously-focused element on close.
  React.useEffect(() => {
    if (!isVisible || !content) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // A portalled safety confirmation owns its own keyboard/focus trap.
      const eventDialog = e.target instanceof Element ? e.target.closest('[role="dialog"]') : null;
      if (e.defaultPrevented || (eventDialog && eventDialog !== panelRef.current)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.hidden &&
          element.getClientRects().length > 0 &&
          // Chromium can retain layout boxes in collapsed details. Only the
          // summary is a Tab stop until that disclosure is opened.
          // Working if both Tab directions wrap through the visible summary,
          // never a control hidden inside a collapsed disclosure.
          !element.matches(
            'details:not([open]) > :not(summary), details:not([open]) > :not(summary) *'
          )
      );
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
      // Take over unmounts itself as it opens this sheet, so the control that
      // opened it can be gone (or focus was already on <body>). Land on this
      // sheet's dock item, else Overview, rather than at the top of the page.
      // Working if Tab continues from the dock after Take over's sheet closes.
      const opener =
        previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected
          ? previouslyFocused
          : (document.querySelector<HTMLElement>(`[data-dock-mode="${content}"]`) ??
            document.querySelector<HTMLElement>('[data-dock-mode="overview"]'));
      opener?.focus?.();
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
            variants={reducedMotion ? reducedPanelVariants : panelVariants}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            className="fixed left-4 right-4 z-50 pointer-events-auto"
            style={{
              bottom: 'max(100px, calc(env(safe-area-inset-bottom) + 90px))',
              maxHeight:
                content === 'safety' || content === 'management'
                  ? 'min(70dvh, calc(100dvh - 116px - env(safe-area-inset-bottom)))'
                  : content === 'ai'
                    ? '70vh'
                    : '33vh',
            }}
            aria-label={t('panelAriaLabel', { title: getPanelTitle(content, t) })}
            role="dialog"
            aria-modal="true"
          >
            <div
              className={`flex flex-col ${content === 'safety' || content === 'management' ? 'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]' : content === 'ai' ? 'max-h-[70vh]' : 'max-h-[33vh]'} bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl`}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-200">
                  {getPanelIcon(content)}
                  <span className="font-medium">{getPanelTitle(content, t)}</span>
                </div>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-700/50 transition-colors"
                  aria-label={t('closePanel')}
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div
                className={`flex-1 min-h-0 overflow-y-auto ${content === 'safety' ? '' : 'p-4'}`}
              >
                {getPanelContent(content)}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
