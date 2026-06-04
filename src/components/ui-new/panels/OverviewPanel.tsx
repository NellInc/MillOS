import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Activity,
  Package,
  Thermometer,
  TrendingUp,
  Clock,
  Truck,
  AlertTriangle,
  Pause,
  Play,
  FastForward,
  Trophy,
  History,
  Map,
  Image,
  Download,
} from 'lucide-react';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useUIStore } from '../../../stores/uiStore';
import { useHistoricalPlaybackStore } from '../../../stores/historicalPlaybackStore';
import { useShallow } from 'zustand/react/shallow';
import { AchievementsPanel, WorkerLeaderboard } from '../../GameFeatures';
import { TimelinePlayback } from '../../ui/TimelinePlayback';

// Isolated Clock component to prevent full panel re-renders
const GameClock: React.FC = React.memo(() => {
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);

  const formatGameTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    <div className="text-right">
      <div className="text-xl font-mono font-bold text-white">{formatGameTime(gameTime)}</div>
      <div
        className={`text-[10px] font-bold ${gameSpeed === 0 ? 'text-red-400' : 'text-green-400'}`}
      >
        {gameSpeed === 0 ? 'PAUSED' : gameSpeed === 180 ? '1x' : gameSpeed === 1800 ? '10x' : '60x'}
      </div>
    </div>
  );
});

// Isolated Speed Controls
const GameSpeedControls: React.FC = React.memo(() => {
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const setGameSpeed = useGameSimulationStore((state) => state.setGameSpeed);

  return (
    <div className="flex gap-1">
      <button
        onClick={() => setGameSpeed(0)}
        aria-label="Pause"
        aria-pressed={gameSpeed === 0}
        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
          gameSpeed === 0
            ? 'bg-orange-600 text-white'
            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
        }`}
        title="Pause"
      >
        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setGameSpeed(180)}
        aria-pressed={gameSpeed === 180}
        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
          gameSpeed === 180
            ? 'bg-orange-600 text-white'
            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
        }`}
        title="Normal (1x - 24hrs in 8min)"
      >
        <Play className="w-3.5 h-3.5" aria-hidden="true" />
        1x
      </button>
      <button
        onClick={() => setGameSpeed(1800)}
        aria-pressed={gameSpeed === 1800}
        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
          gameSpeed === 1800
            ? 'bg-orange-600 text-white'
            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
        }`}
        title="Fast (10x)"
      >
        <FastForward className="w-3.5 h-3.5" aria-hidden="true" />
        10x
      </button>
      <button
        onClick={() => setGameSpeed(10800)}
        aria-pressed={gameSpeed === 10800}
        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
          gameSpeed === 10800
            ? 'bg-orange-600 text-white'
            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
        }`}
        title="Ultra (60x)"
      >
        <FastForward className="w-3.5 h-3.5" aria-hidden="true" />
        60x
      </button>
    </div>
  );
});

// Isolated Shift Display
const ShiftDisplay: React.FC = React.memo(() => {
  const currentShift = useGameSimulationStore((state) => state.currentShift);

  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Current Shift</div>
      <div className="text-sm font-bold text-white capitalize">{currentShift}</div>
    </div>
  );
});

// Optimized OverviewPanel - No longer subscribes to high-frequency gameTime
export const OverviewPanel: React.FC = React.memo(() => {
  const metrics = useProductionStore((state) => state.metrics);
  const totalBagsProduced = useProductionStore((state) => state.totalBagsProduced);
  const productionTarget = useProductionStore((state) => state.productionTarget);
  const machines = useProductionStore((state) => state.machines);
  const workers = useProductionStore((state) => state.workers);
  const dockStatus = useProductionStore((state) => state.dockStatus);

  const weather = useGameSimulationStore((state) => state.weather);
  // Removed direct gameTime/gameSpeed/currentShift subscriptions from main panel!

  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);

  // Calculate machine status counts
  const machineStats = {
    running: machines.filter((m) => m.status === 'running').length,
    warning: machines.filter((m) => m.status === 'warning').length,
    critical: machines.filter((m) => m.status === 'critical').length,
    idle: machines.filter((m) => m.status === 'idle').length,
  };

  // Calculate safety score
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

  // Progress to target
  const targetProgress = productionTarget
    ? Math.min(100, (productionTarget.producedBags / productionTarget.targetBags) * 100)
    : 0;

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto custom-scrollbar">
      {/* Production Summary */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          Production Summary
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Throughput"
            value={`${metrics.throughput}`}
            unit="bags/hr"
            icon={<Package size={14} />}
            color="cyan"
          />
          <StatCard
            label="Efficiency"
            value={`${metrics.efficiency.toFixed(1)}`}
            unit="%"
            icon={<TrendingUp size={14} />}
            color="green"
          />
          <StatCard
            label="Uptime"
            value={`${metrics.uptime.toFixed(1)}`}
            unit="%"
            icon={<Clock size={14} />}
            color="blue"
          />
          <StatCard
            label="Quality"
            value={`${metrics.quality.toFixed(1)}`}
            unit="%"
            icon={<Thermometer size={14} />}
            color="purple"
          />
        </div>
      </section>

      {/* Daily Target */}
      {productionTarget && (
        <section className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-400">Daily Target</span>
            <span className="text-xs font-mono text-cyan-400">
              {productionTarget.producedBags.toLocaleString()} /{' '}
              {productionTarget.targetBags.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                targetProgress >= 100 ? 'bg-green-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${targetProgress}%` }}
            />
          </div>
          <div className="text-right text-[10px] text-slate-500 mt-1">
            {targetProgress.toFixed(1)}% complete
          </div>
        </section>
      )}

      {/* Machine Status */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} className="text-orange-400" />
          Machine Status
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <MiniStat label="Running" value={machineStats.running} color="green" />
          <MiniStat label="Warning" value={machineStats.warning} color="yellow" />
          <MiniStat label="Critical" value={machineStats.critical} color="red" />
          <MiniStat label="Idle" value={machineStats.idle} color="slate" />
        </div>
      </section>

      {/* Shift & Time Control */}
      <section className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <ShiftDisplay />
          <GameClock />
        </div>
        <GameSpeedControls />
      </section>

      {/* Weather & Workers */}
      <section className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Weather</div>
          <div className="text-sm font-bold text-white capitalize">{weather}</div>
        </div>
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Workers</div>
          <div className="text-sm font-bold text-white">{workers.length} on shift</div>
        </div>
      </section>

      {/* Safety Overview */}
      <section className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={14}
              className={
                safetyScore > 90
                  ? 'text-green-400'
                  : safetyScore > 70
                    ? 'text-yellow-400'
                    : 'text-red-500'
              }
            />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Safety Score
            </span>
          </div>
          <span
            className={`text-lg font-bold font-mono ${safetyScore > 90 ? 'text-green-400' : safetyScore > 70 ? 'text-yellow-400' : 'text-red-500'}`}
          >
            {safetyScore}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-slate-300">{safetyMetrics?.nearMisses ?? 0}</div>
            <div className="text-[10px] text-slate-500">Near Misses</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.safetyStops ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">Safety Stops</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.daysSinceIncident ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">Days Safe</div>
          </div>
        </div>
      </section>

      {/* Dock Status */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Truck size={14} className="text-amber-400" />
          Dock Status
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <DockCard
            label="Receiving"
            status={dockStatus.receiving.status}
            eta={dockStatus.receiving.etaMinutes}
          />
          <DockCard
            label="Shipping"
            status={dockStatus.shipping.status}
            eta={dockStatus.shipping.etaMinutes}
          />
        </div>
      </section>

      {/* Total Production */}
      <div className="text-center py-3 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-xl border border-cyan-500/20">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
          Total Bags Produced
        </div>
        <div className="text-2xl font-bold font-mono text-cyan-400">
          {totalBagsProduced.toLocaleString()}
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActionsSection />
    </div>
  );
});

// Sub-components
const StatCard: React.FC<{
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, unit, icon, color }) => {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/20',
    green: 'text-green-400 border-green-500/20',
    blue: 'text-blue-400 border-blue-500/20',
    purple: 'text-purple-400 border-purple-500/20',
    orange: 'text-orange-400 border-orange-500/20',
  };

  return (
    <div className={`bg-slate-800/30 border ${colorClasses[color]} rounded-lg p-3`}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
        <span className={colorClasses[color].split(' ')[0]}>{icon}</span>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-mono font-bold ${colorClasses[color].split(' ')[0]}`}>
          {value}
        </span>
        <span className="text-[10px] text-slate-600">{unit}</span>
      </div>
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => {
  const colorClasses: Record<string, string> = {
    green: 'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red: 'text-red-400 bg-red-500/10',
    slate: 'text-slate-400 bg-slate-500/10',
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg p-2 text-center`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
};

const DockCard: React.FC<{ label: string; status: string; eta: number }> = ({
  label,
  status,
  eta,
}) => {
  const statusColors: Record<string, { bg: string; text: string }> = {
    clear: { bg: 'bg-slate-600/20', text: 'text-slate-400' },
    arriving: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    loading: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
    departing: { bg: 'bg-green-500/20', text: 'text-green-400' },
  };

  const colors = statusColors[status] || statusColors.clear;

  return (
    <div className={`${colors.bg} border border-white/5 rounded-lg p-3`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold capitalize ${colors.text}`}>{status}</div>
      {status !== 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-500">ETA: {eta} min</div>
      )}
    </div>
  );
};

// Quick Actions Section with Gamification Controls
const QuickActionsSection: React.FC = () => {
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const achievements = useProductionStore((state) => state.achievements);
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const isReplaying = useHistoricalPlaybackStore((state) => state.isReplaying);

  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `millos-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }, []);

  const handleExport = useCallback(() => {
    const store = useProductionStore.getState();
    const report = {
      timestamp: new Date().toISOString(),
      metrics: store.metrics,
      productionTarget: store.productionTarget,
      totalBagsProduced: store.totalBagsProduced,
      achievements: store.achievements.filter((a) => a.unlockedAt),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }, []);

  const handleToggleReplay = useCallback(() => {
    const playbackStore = useHistoricalPlaybackStore.getState();
    if (playbackStore.isReplaying) {
      playbackStore.exitReplayMode();
    } else {
      playbackStore.enterReplayMode();
    }
  }, []);

  return (
    <>
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} className="text-purple-400" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {/* Achievements */}
          <button
            onClick={() => setShowAchievements(!showAchievements)}
            className={`py-2.5 px-3 rounded-lg flex items-center gap-2 transition-colors relative ${
              showAchievements
                ? 'bg-yellow-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
            title="Achievements"
          >
            <Trophy size={16} className={showAchievements ? 'text-white' : 'text-yellow-400'} />
            <span className="text-xs font-medium">Achievements</span>
            {unlockedCount > 0 && (
              <span className="ml-auto w-5 h-5 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {unlockedCount}
              </span>
            )}
          </button>

          {/* Leaderboard */}
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className={`py-2.5 px-3 rounded-lg flex items-center gap-2 transition-colors ${
              showLeaderboard
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
            title="Leaderboard"
          >
            <TrendingUp size={16} className={showLeaderboard ? 'text-white' : 'text-cyan-400'} />
            <span className="text-xs font-medium">Leaderboard</span>
          </button>

          {/* Replay History */}
          <button
            onClick={handleToggleReplay}
            className={`py-2.5 px-3 rounded-lg flex items-center gap-2 transition-colors ${
              isReplaying
                ? 'bg-red-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
            title="Replay History"
          >
            <History size={16} className={isReplaying ? 'text-white' : 'text-red-400'} />
            <span className="text-xs font-medium">Replay</span>
          </button>

          {/* GPS Map */}
          <button
            onClick={() => setShowMiniMap(!showMiniMap)}
            className={`py-2.5 px-3 rounded-lg flex items-center gap-2 transition-colors ${
              showMiniMap
                ? 'bg-green-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
            title="GPS Map"
          >
            <Map size={16} className={showMiniMap ? 'text-white' : 'text-green-400'} />
            <span className="text-xs font-medium">GPS Map</span>
          </button>
        </div>

        {/* Screenshot/Export row */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleScreenshot}
            className="flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title="Screenshot"
          >
            <Image size={12} />
            Screenshot
          </button>
          <button
            onClick={handleExport}
            className="flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title="Export Report"
          >
            <Download size={12} />
            Export
          </button>
        </div>
      </section>

      {/* Timeline Playback - shows when replaying */}
      {isReplaying && (
        <section className="mt-4">
          <TimelinePlayback className="w-full" />
        </section>
      )}

      {/* Panels */}
      <AnimatePresence>
        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showLeaderboard && <WorkerLeaderboard onClose={() => setShowLeaderboard(false)} />}
      </AnimatePresence>
    </>
  );
};
