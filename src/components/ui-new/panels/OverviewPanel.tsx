import React, { useState, useCallback, useEffect, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Link2,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useAchievementsStore } from '../../../stores/achievementsStore';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { saveScenePng } from '../../../utils/sceneCapture';
import { useUIStore } from '../../../stores/uiStore';
import { useHistoricalPlaybackStore } from '../../../stores/historicalPlaybackStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useQCLabStore, type QCTestType } from '../../../stores/qcLabStore';
import { useShallow } from 'zustand/react/shallow';
import { AchievementsPanel } from '../../GameFeatures';
import { TimelinePlayback } from '../../ui/TimelinePlayback';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';

// Re-homed from ui/ (orphaned after the UIOverlay removal): live breakdown
// mechanics — active breakdowns, predictive alerts, parts inventory, schedule.
const PredictiveMaintenancePanel = recoverableLazy(() =>
  import('../../ui/PredictiveMaintenancePanel').then((m) => ({
    default: m.PredictiveMaintenancePanel,
  }))
);

// Isolated Clock component to prevent full panel re-renders
const GameClock: React.FC = React.memo(() => {
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);

  const formatGameTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // 180 game-seconds per real second is 1x; agent commands may set any speed.
  const speedRatio = gameSpeed / 180;
  const speedLabel =
    gameSpeed === 0 ? 'PAUSED' : speedRatio < 0.1 ? '<0.1x' : `${Number(speedRatio.toFixed(1))}x`;

  return (
    <div className="text-right">
      <div className="text-xl font-mono font-bold text-white">{formatGameTime(gameTime)}</div>
      <div
        className={`text-[10px] font-bold ${gameSpeed === 0 ? 'text-red-400' : 'text-green-400'}`}
      >
        {speedLabel}
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
        className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-all ${
          gameSpeed === 0
            ? 'bg-orange-800 text-white'
            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
        }`}
        title="Pause"
      >
        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        onClick={() => setGameSpeed(180)}
        aria-pressed={gameSpeed === 180}
        className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-all ${
          gameSpeed === 180
            ? 'bg-orange-800 text-white'
            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
        }`}
        title="Normal (1x - 24hrs in 8min)"
      >
        <Play className="w-3.5 h-3.5" aria-hidden="true" />
        1x
      </button>
      <button
        onClick={() => setGameSpeed(1800)}
        aria-pressed={gameSpeed === 1800}
        className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-all ${
          gameSpeed === 1800
            ? 'bg-orange-800 text-white'
            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
        }`}
        title="Fast (10x)"
      >
        <FastForward className="w-3.5 h-3.5" aria-hidden="true" />
        10x
      </button>
      <button
        onClick={() => setGameSpeed(10800)}
        aria-pressed={gameSpeed === 10800}
        className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-all ${
          gameSpeed === 10800
            ? 'bg-orange-800 text-white'
            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
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
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Run window</div>
      <div className="text-sm font-bold text-white capitalize">{currentShift}</div>
    </div>
  );
});

const formatManifestTime = (simulationTime: number): string => {
  const totalSeconds = Math.max(0, Math.floor(simulationTime));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `T+${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const MaterialTraceabilitySection: React.FC = React.memo(() => {
  const { manifests, receivedKg, shippedKg } = useMaterialFlowStore(
    useShallow((state) => ({
      manifests: state.manifests,
      receivedKg: state.receivedKg,
      shippedKg: state.shippedKg,
    }))
  );
  const latestManifests = useMemo(() => manifests.slice(-3).reverse(), [manifests]);
  const formatKg = (value: number): string =>
    value.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <section className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <History size={14} className="text-teal-400" aria-hidden="true" />
        Material Traceability
      </h3>
      <dl className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-900/45 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Received</dt>
          <dd className="text-sm font-mono font-bold text-cyan-300">{formatKg(receivedKg)} kg</dd>
        </div>
        <div className="rounded-lg bg-slate-900/45 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Shipped</dt>
          <dd className="text-sm font-mono font-bold text-emerald-300">{formatKg(shippedKg)} kg</dd>
        </div>
      </dl>
      {latestManifests.length === 0 ? (
        <p className="text-xs text-slate-500 py-1">Awaiting first dock transfer</p>
      ) : (
        <ol className="space-y-2" aria-label="Latest material manifests">
          {latestManifests.map((manifest) => (
            <li
              key={manifest.id}
              className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-slate-200">
                  {manifest.id.toUpperCase()}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    manifest.kind === 'receiving'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {manifest.kind}
                </span>
              </div>
              <div className="mt-1 flex items-end justify-between gap-2 text-[10px] text-slate-400">
                <span className="min-w-0 truncate">
                  {manifest.materials
                    .map((material) => material.type.replaceAll('_', ' '))
                    .join(', ')}
                </span>
                <span className="shrink-0 font-mono text-slate-300">
                  {formatKg(manifest.actualKg)} / {formatKg(manifest.requestedKg)} kg
                </span>
              </div>
              <time className="mt-1 block text-[9px] font-mono text-slate-500">
                {formatManifestTime(manifest.simulationTime)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

// The balance walks every buffer and parcel, so the panel samples it at 1 Hz
// rather than on every material-flow write, rounded to the 0.01 kg it displays.
const readGenealogyErrorKg = () =>
  Math.round(useMaterialFlowStore.getState().getGenealogyBalance().errorKg * 100) / 100;

const BatchGenealogySection: React.FC = React.memo(() => {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const productionBatches = useMaterialFlowStore((state) => state.productionBatches);
  const sourceLotCount = useMaterialFlowStore((state) => state.sourceLots.size);
  // Read once up front so the first paint never shows a false +0.00 kg.
  const [genealogyErrorKg, setGenealogyErrorKg] = useState(readGenealogyErrorKg);
  useEffect(() => {
    const timer = window.setInterval(() => setGenealogyErrorKg(readGenealogyErrorKg()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const qcLab = useQCLabStore((state) => state.qcLab);
  const startQCTest = useQCLabStore((state) => state.startQCTest);
  const completeQCTest = useQCLabStore((state) => state.completeQCTest);
  const triggerContaminationAlert = useQCLabStore((state) => state.triggerContaminationAlert);
  const resolveContaminationAlert = useQCLabStore((state) => state.resolveContaminationAlert);
  const latestBatches = useMemo(() => productionBatches.slice(-4).reverse(), [productionBatches]);
  const selectedTrace = selectedBatchId
    ? useMaterialFlowStore.getState().getBatchTrace(selectedBatchId)
    : null;

  const runConformingTest = (batchId: string, testType: QCTestType) => {
    const batch = useMaterialFlowStore
      .getState()
      .productionBatches.find((candidate) => candidate.id === batchId);
    if (!batch) return;
    const sourceLotIds = [...new Set(batch.sourceContributions.map((source) => source.lotId))];
    startQCTest(batch.packerId, {
      batchId,
      sourceLotIds,
      testType,
      controlSource: 'Autonomous QC controller',
    });
    completeQCTest({
      machineId: batch.packerId,
      batchId,
      sourceLotIds,
      testType,
      controlSource: 'Autonomous QC controller',
      controlNote:
        testType === 'retest'
          ? 'Conforming retest completed after corrective investigation'
          : 'Routine batch release test completed',
      grade: 'A',
      moistureContent: 13.2,
      proteinLevel: 11.8,
      ashContent: 0.52,
      particleSize: 120,
      passed: true,
    });
    if (testType === 'retest') {
      useQCLabStore
        .getState()
        .qcLab.contaminationAlerts.filter(
          (alert) => !alert.resolved && alert.batchIds.includes(batchId)
        )
        .forEach((alert) =>
          resolveContaminationAlert(
            alert.id,
            'released',
            'Autonomous QC controller',
            'Conforming retest released the investigated scope'
          )
        );
    }
  };

  const recallBatch = (batchId: string) => {
    const unresolved = useQCLabStore
      .getState()
      .qcLab.contaminationAlerts.find(
        (alert) => !alert.resolved && alert.batchIds.includes(batchId)
      );
    const alertId =
      unresolved?.id ??
      triggerContaminationAlert({
        batchIds: [batchId],
        severity: 'high',
        controlSource: 'Autonomous QC controller',
        controlNote: 'Targeted batch recall investigation',
      });
    resolveContaminationAlert(
      alertId,
      'recalled',
      'Autonomous QC controller',
      'Affected batch recalled and isolated from dispatch'
    );
  };

  return (
    <section className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Link2 size={14} className="text-cyan-400" aria-hidden="true" />
            Batch genealogy and quality
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            {sourceLotCount} source lots, {productionBatches.length} production batches
          </p>
        </div>
        <div
          role="status"
          className={`rounded border px-2 py-1 font-mono text-[10px] ${
            Math.abs(genealogyErrorKg) <= 0.01
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-amber-500/50 text-amber-300'
          }`}
        >
          Genealogy {genealogyErrorKg >= 0 ? '+' : ''}
          {genealogyErrorKg.toFixed(2)} kg
        </div>
      </div>
      {latestBatches.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">
          Packing is building the first traceable batch.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Latest production batches">
          {latestBatches.map((batch) => {
            const unresolvedAlert = qcLab.contaminationAlerts.some(
              (alert) => !alert.resolved && alert.batchIds.includes(batch.id)
            );
            return (
              <li
                key={batch.id}
                className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-[11px] font-semibold text-slate-200">
                      {batch.id.toUpperCase()}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {batch.materialType.replaceAll('_', ' ')}, {batch.availableKg.toFixed(1)} kg
                      available
                    </div>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                      batch.disposition === 'released'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : batch.disposition === 'hold'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {batch.disposition}
                  </span>
                </div>
                {batch.dispositionReason && (
                  <p className="mt-1 text-[10px] text-slate-400">{batch.dispositionReason}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-expanded={selectedBatchId === batch.id}
                    onClick={() =>
                      setSelectedBatchId((current) => (current === batch.id ? null : batch.id))
                    }
                    className="min-h-11 rounded bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                  >
                    {selectedBatchId === batch.id ? 'Hide trace' : 'Trace batch'}
                  </button>
                  {batch.disposition === 'released' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runConformingTest(batch.id, 'initial')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded bg-cyan-700 px-3 text-xs font-semibold text-white hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      >
                        <FlaskConical size={14} aria-hidden="true" />
                        Test batch
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerContaminationAlert({
                            batchIds: [batch.id],
                            severity: 'medium',
                            controlSource: 'Autonomous QC controller',
                            controlNote: 'Automated targeted quality hold initiated',
                          })
                        }
                        className="min-h-11 rounded bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                      >
                        Place hold
                      </button>
                    </>
                  )}
                  {batch.disposition === 'hold' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runConformingTest(batch.id, 'retest')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                      >
                        <ShieldCheck size={14} aria-hidden="true" />
                        Retest and release
                      </button>
                      <button
                        type="button"
                        onClick={() => recallBatch(batch.id)}
                        className="min-h-11 rounded bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                      >
                        Recall batch
                      </button>
                    </>
                  )}
                  {unresolvedAlert && (
                    <span
                      role="status"
                      className="flex min-h-11 items-center text-xs text-amber-300"
                    >
                      Investigation active
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {selectedTrace && (
        <div
          className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-950/15 p-2.5"
          role="region"
          aria-label={`Trace for ${selectedTrace.batch.id}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            Upstream provenance
          </div>
          <ul className="mt-2 space-y-2">
            {selectedTrace.sourceLots.map(({ lot, amount, paths }) => (
              <li key={lot.id} className="text-[10px] text-slate-300">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-cyan-200">{lot.id}</span>
                  <span>{amount.toFixed(1)} kg</span>
                </div>
                <div className="mt-0.5 text-slate-500">
                  {lot.supplier}, {lot.disposition}.{' '}
                  {paths.map((path) => path.join(' to ')).join('; ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});

// Optimized OverviewPanel - No longer subscribes to high-frequency gameTime
export const OverviewPanel: React.FC = React.memo(() => {
  const metrics = useProductionStore((state) => state.metrics);
  const totalBagsProduced = useProductionStore((state) => state.totalBagsProduced);
  const productionTarget = useProductionStore((state) => state.productionTarget);
  const machines = useProductionStore((state) => state.machines);
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

  // Shared formula with StatusHUD so both surfaces show the same number.
  const safetyScore = computeSafetyScore(safetyMetrics);

  // Progress to target
  const targetProgress = productionTarget
    ? Math.min(
        100,
        (productionTarget.producedBags / Math.max(1, productionTarget.targetBags)) * 100
      )
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
            value={metrics.throughput.toLocaleString()}
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

      {/* Weather & Site Mode */}
      <section className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Weather</div>
          <div className="text-sm font-bold text-white capitalize">{weather}</div>
        </div>
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Site Mode</div>
          <div className="text-sm font-bold text-white">Uncrewed</div>
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
            receiving
          />
          <DockCard
            label="Shipping"
            status={dockStatus.shipping.status}
            eta={dockStatus.shipping.etaMinutes}
          />
        </div>
      </section>

      <MaterialTraceabilitySection />
      <BatchGenealogySection />

      {/* Maintenance (breakdowns, predictive alerts, parts, schedule) */}
      <section>
        <RecoverableFeatureBoundary featureName="Predictive maintenance">
          <Suspense
            fallback={
              <div className="h-20 bg-slate-800/30 rounded-lg animate-pulse" role="status">
                <span className="sr-only">Loading maintenance panel...</span>
              </div>
            }
          >
            <PredictiveMaintenancePanel />
          </Suspense>
        </RecoverableFeatureBoundary>
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
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
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
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
};

const DockCard: React.FC<{ label: string; status: string; eta: number; receiving?: boolean }> = ({
  label,
  status,
  eta,
  receiving = false,
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
      <div className={`text-sm font-bold capitalize ${colors.text}`}>
        {receiving && status === 'loading' ? 'Unloading' : status}
      </div>
      {status === 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-500">Next truck in {eta} min</div>
      )}
      {status !== 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-500">ETA: {eta} min</div>
      )}
    </div>
  );
};

// Quick Actions Section with Gamification Controls
const QuickActionsSection: React.FC = () => {
  // Shared with GamificationBar through uiStore so the two toggles drive one panel.
  const showAchievements = useUIStore((state) => state.showAchievements);
  const setShowAchievements = useUIStore((state) => state.setShowAchievements);
  // When the gamification bar is showing it renders the same panel itself.
  const showGamificationBar = useUIStore((state) => state.showGamificationBar);
  const achievements = useAchievementsStore((state) => state.achievements);
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const isReplaying = useHistoricalPlaybackStore((state) => state.isReplaying);

  // Same visibility rule as AchievementsPanel: untracked goals are not counted.
  const unlockedCount = achievements.filter((a) => a.tracked !== false && a.unlockedAt).length;

  const handleScreenshot = useCallback(async () => {
    // Through the renderer: a direct canvas.toDataURL() reads a cleared buffer.
    await saveScenePng(`millos-${new Date().toISOString().split('T')[0]}.png`);
  }, []);

  const handleExport = useCallback(() => {
    const store = useProductionStore.getState();
    const report = {
      timestamp: new Date().toISOString(),
      metrics: store.metrics,
      productionTarget: store.productionTarget,
      totalBagsProduced: store.totalBagsProduced,
      achievements: useAchievementsStore
        .getState()
        .achievements.filter((a) => a.tracked !== false && a.unlockedAt),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    // Same pattern as the diagnostics export: revoke on the next tick.
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 0);
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
            aria-expanded={showAchievements}
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

          {/* Replay History */}
          <button
            onClick={handleToggleReplay}
            aria-pressed={isReplaying}
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

          {/* Mini-map */}
          <button
            onClick={() => setShowMiniMap(!showMiniMap)}
            aria-pressed={showMiniMap}
            className={`py-2.5 px-3 rounded-lg flex items-center gap-2 transition-colors ${
              showMiniMap
                ? 'bg-green-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
            title="Mini-map"
          >
            <Map size={16} className={showMiniMap ? 'text-white' : 'text-green-400'} />
            <span className="text-xs font-medium">Mini-map</span>
          </button>
        </div>

        {/* Screenshot/Export row */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleScreenshot}
            className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title="Screenshot"
          >
            <Image size={12} />
            Screenshot
          </button>
          <button
            onClick={handleExport}
            className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
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

      {/* Portaled: the sidebar's backdrop-filter would otherwise become the
        containing block for this fixed, draggable panel and clip it. */}
      {!showGamificationBar &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
