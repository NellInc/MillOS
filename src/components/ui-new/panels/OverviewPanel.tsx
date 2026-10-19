import React, { useState, useCallback, useEffect, Suspense, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { paceMessages } from '../../../simulation/pace.messages';
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
  Route,
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
import { formatFixed, formatGrouped, translate, useT } from '../../../i18n';
import { overviewPanelMessages } from './OverviewPanel.messages';

import { OperationsPlayCard, ShiftDebrief } from '../onboarding/PlayableShift';

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
  const t = useT(overviewPanelMessages);

  const formatGameTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Standard pace is 1x (src/simulation/pace.ts); agent commands may set others.
  const speedRatio = gameSpeed / STANDARD_GAME_SPEED;
  // Number(...) drops a trailing .0, so whole ratios print without decimals.
  const roundedRatio = Number(speedRatio.toFixed(1));
  const speedLabel =
    gameSpeed === 0
      ? t('paused')
      : speedRatio < 0.1
        ? `<${formatFixed(0.1, 1)}x`
        : `${formatFixed(roundedRatio, Number.isInteger(roundedRatio) ? 0 : 1)}x`;

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
// One time model: each pace runs the clock, deadlines, production and vehicles
// together, so every button keeps deliveries feasible. Working if the buttons
// and the Shift pace select offer the same paces with the same words.
const PACE_BUTTON_LABELS: Record<number, string> = { 15: '1/2x', 30: '1x', 60: '2x', 120: '4x' };
const GameSpeedControls: React.FC = React.memo(() => {
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const setGameSpeed = useGameSimulationStore((state) => state.setGameSpeed);
  const pace = useT(paceMessages);

  return (
    <div className="flex gap-1" role="group" aria-label={pace('paceTitle')}>
      {PACE_GAME_SPEEDS.map((value) => (
        <button
          key={value}
          onClick={() => setGameSpeed(value)}
          aria-label={pace(`pace${value}`)}
          aria-pressed={gameSpeed === value}
          className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition-all ${
            gameSpeed === value
              ? 'bg-orange-800 text-white'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
          title={pace(`pace${value}`)}
        >
          {value === 0 ? (
            <Pause className="w-3.5 h-3.5" aria-hidden="true" />
          ) : value > STANDARD_GAME_SPEED ? (
            <FastForward className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {value > 0 && <span aria-hidden="true">{PACE_BUTTON_LABELS[value]}</span>}
        </button>
      ))}
    </div>
  );
});

// Isolated Shift Display
const ShiftDisplay: React.FC = React.memo(() => {
  const currentShift = useGameSimulationStore((state) => state.currentShift);
  const t = useT(overviewPanelMessages);

  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('runWindow')}</div>
      <div className="text-sm font-bold text-white capitalize">
        {t('runWindowValue', { value: currentShift })}
      </div>
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
  const t = useT(overviewPanelMessages);
  const formatKg = (value: number): string => formatGrouped(value, { maximumFractionDigits: 1 });

  return (
    <section className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <History size={14} className="text-teal-400" aria-hidden="true" />
        {t('materialTraceability')}
      </h3>
      <dl className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-900/45 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">{t('received')}</dt>
          <dd className="text-sm font-mono font-bold text-cyan-300">{formatKg(receivedKg)} kg</dd>
        </div>
        <div className="rounded-lg bg-slate-900/45 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">{t('shipped')}</dt>
          <dd className="text-sm font-mono font-bold text-emerald-300">{formatKg(shippedKg)} kg</dd>
        </div>
      </dl>
      {latestManifests.length === 0 ? (
        <p className="text-xs text-slate-500 py-1">{t('awaitingFirstTransfer')}</p>
      ) : (
        <ol className="space-y-2" aria-label={t('latestManifests')}>
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
                  {t('manifestKind', { value: manifest.kind })}
                </span>
              </div>
              <div className="mt-1 flex items-end justify-between gap-2 text-[10px] text-slate-400">
                <span className="min-w-0 truncate">
                  {manifest.materials
                    .map((material) => t('material', { value: material.type }))
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

export const BatchGenealogySection: React.FC = React.memo(() => {
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
  const t = useT(overviewPanelMessages);
  const displayedBatches = useMemo(() => {
    const investigationBatchIds = new Set(
      qcLab.contaminationAlerts
        .filter((alert) => !alert.resolved)
        .flatMap((alert) => alert.batchIds)
    );
    const newestFirst = [...productionBatches].reverse();
    const needsAttention = (batch: (typeof productionBatches)[number]) =>
      batch.disposition === 'hold' || investigationBatchIds.has(batch.id);
    // Quality recovery stays reachable as newer production arrives. Final
    // dispositions keep their existing trace-only controls even during an alert.
    return [
      ...newestFirst.filter(needsAttention),
      ...newestFirst.filter((batch) => !needsAttention(batch)).slice(0, 4),
    ];
  }, [productionBatches, qcLab.contaminationAlerts]);
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
          ? translate(overviewPanelMessages, 'noteRetest')
          : translate(overviewPanelMessages, 'noteRoutineTest'),
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
            translate(overviewPanelMessages, 'noteRetestReleased')
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
        controlNote: translate(overviewPanelMessages, 'noteRecallInvestigation'),
      });
    resolveContaminationAlert(
      alertId,
      'recalled',
      'Autonomous QC controller',
      translate(overviewPanelMessages, 'noteRecalled')
    );
  };

  return (
    <section className="rounded-xl border border-white/5 bg-slate-800/50 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Link2 size={14} className="text-cyan-400" aria-hidden="true" />
            {t('batchGenealogy')}
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            {t('lotSummary', {
              lots: formatFixed(sourceLotCount, 0),
              batches: formatFixed(productionBatches.length, 0),
            })}
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
          {t('genealogyBalance', {
            sign: genealogyErrorKg >= 0 ? '+' : '',
            value: formatFixed(genealogyErrorKg, 2),
          })}
        </div>
      </div>
      {displayedBatches.length === 0 ? (
        <p className="py-2 text-xs text-slate-500">{t('firstBatch')}</p>
      ) : (
        <ol className="space-y-2" aria-label={t('batchListLabel')}>
          {displayedBatches.map((batch) => {
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
                      {t('batchAvailable', {
                        material: t('material', { value: batch.materialType }),
                        kg: formatFixed(batch.availableKg, 1),
                      })}
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
                    {t('disposition', { value: batch.disposition })}
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
                    {selectedBatchId === batch.id ? t('hideTrace') : t('traceBatch')}
                  </button>
                  {batch.disposition === 'released' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runConformingTest(batch.id, 'initial')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded bg-cyan-700 px-3 text-xs font-semibold text-white hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      >
                        <FlaskConical size={14} aria-hidden="true" />
                        {t('testBatch')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerContaminationAlert({
                            batchIds: [batch.id],
                            severity: 'medium',
                            controlSource: 'Autonomous QC controller',
                            controlNote: translate(overviewPanelMessages, 'noteHold'),
                          })
                        }
                        className="min-h-11 rounded bg-amber-800 px-3 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                      >
                        {t('placeHold')}
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
                        {t('retestAndRelease')}
                      </button>
                      <button
                        type="button"
                        onClick={() => recallBatch(batch.id)}
                        className="min-h-11 rounded bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                      >
                        {t('recallBatch')}
                      </button>
                    </>
                  )}
                  {unresolvedAlert && (
                    <span
                      role="status"
                      className="flex min-h-11 items-center text-xs text-amber-300"
                    >
                      {t('investigationActive')}
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
          aria-label={t('traceFor', { id: selectedTrace.batch.id })}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
            {t('upstreamProvenance')}
          </div>
          <ul className="mt-2 space-y-2">
            {selectedTrace.sourceLots.map(({ lot, amount, paths }) => (
              <li key={lot.id} className="text-[10px] text-slate-300">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-cyan-200">{lot.id}</span>
                  <span>{formatFixed(amount, 1)} kg</span>
                </div>
                <div className="mt-0.5 text-slate-500">
                  {lot.supplier}, {t('disposition', { value: lot.disposition })}.{' '}
                  {paths.map((path) => path.join(t('pathJoiner'))).join('; ')}
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
  const t = useT(overviewPanelMessages);

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
      <OperationsPlayCard />
      <ShiftDebrief />
      {/* Production Summary */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          {t('productionSummary')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label={t('throughput')}
            value={formatGrouped(metrics.throughput)}
            unit={t('bagsPerHr')}
            icon={<Package size={14} />}
            color="cyan"
          />
          <StatCard
            label={t('efficiency')}
            value={formatFixed(metrics.efficiency, 1)}
            unit="%"
            icon={<TrendingUp size={14} />}
            color="green"
          />
          <StatCard
            label={t('uptime')}
            value={formatFixed(metrics.uptime, 1)}
            unit="%"
            icon={<Clock size={14} />}
            color="blue"
          />
          <StatCard
            label={t('quality')}
            value={formatFixed(metrics.quality, 1)}
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
            <span className="text-xs text-slate-400">{t('dailyTarget')}</span>
            <span className="text-xs font-mono text-cyan-400">
              {formatGrouped(productionTarget.producedBags)} /{' '}
              {formatGrouped(productionTarget.targetBags)}
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
            {t('percentComplete', { value: formatFixed(targetProgress, 1) })}
          </div>
        </section>
      )}

      {/* Machine Status */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Activity size={14} className="text-orange-400" />
          {t('machineStatus')}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <MiniStat label={t('running')} value={machineStats.running} color="green" />
          <MiniStat label={t('warning')} value={machineStats.warning} color="yellow" />
          <MiniStat label={t('critical')} value={machineStats.critical} color="red" />
          <MiniStat label={t('idle')} value={machineStats.idle} color="slate" />
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
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            {t('weather')}
          </div>
          <div className="text-sm font-bold text-white capitalize">
            {t('weatherValue', { value: weather })}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
            {t('siteMode')}
          </div>
          <div className="text-sm font-bold text-white">{t('siteModeValue')}</div>
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
              {t('safetyScore')}
            </span>
          </div>
          <span
            className={`text-lg font-bold font-mono ${safetyScore > 90 ? 'text-green-400' : safetyScore > 70 ? 'text-yellow-400' : 'text-red-500'}`}
          >
            {formatFixed(safetyScore, 0)}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-slate-300">{safetyMetrics?.nearMisses ?? 0}</div>
            <div className="text-[10px] text-slate-500">{t('nearMisses')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.safetyStops ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">{t('safetyStops')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.daysSinceIncident ?? 0}
            </div>
            <div className="text-[10px] text-slate-500">{t('daysSafe')}</div>
          </div>
        </div>
      </section>

      {/* Dock Status */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Truck size={14} className="text-amber-400" />
          {t('dockStatus')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <DockCard
            label={t('receiving')}
            status={dockStatus.receiving.status}
            eta={dockStatus.receiving.etaMinutes}
            receiving
          />
          <DockCard
            label={t('shipping')}
            status={dockStatus.shipping.status}
            eta={dockStatus.shipping.etaMinutes}
          />
        </div>
      </section>

      <MaterialTraceabilitySection />
      <button
        onClick={() => window.dispatchEvent(new Event('millos:open-layout-planner'))}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-cyan-700 bg-cyan-950 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-900"
      >
        <Route size={18} aria-hidden="true" />
        {t('planLogistics')}
      </button>
      <BatchGenealogySection />

      {/* Maintenance (breakdowns, predictive alerts, parts, schedule) */}
      <section>
        <RecoverableFeatureBoundary featureName={t('predictiveMaintenance')}>
          <Suspense
            fallback={
              <div className="h-20 bg-slate-800/30 rounded-lg animate-pulse" role="status">
                <span className="sr-only">{t('loadingMaintenance')}</span>
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
          {t('totalBagsProduced')}
        </div>
        <div className="text-2xl font-bold font-mono text-cyan-400">
          {formatGrouped(totalBagsProduced)}
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
  const t = useT(overviewPanelMessages);

  return (
    <div className={`${colors.bg} border border-white/5 rounded-lg p-3`}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold capitalize ${colors.text}`}>
        {receiving && status === 'loading' ? t('unloading') : t('dockState', { value: status })}
      </div>
      {status === 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-500">
          {t('nextTruck', { minutes: formatFixed(eta, 0) })}
        </div>
      )}
      {status !== 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-500">
          {t('eta', { minutes: formatFixed(eta, 0) })}
        </div>
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
  const t = useT(overviewPanelMessages);

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
          {t('quickActions')}
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
            title={t('achievements')}
          >
            <Trophy size={16} className={showAchievements ? 'text-white' : 'text-yellow-400'} />
            <span className="text-xs font-medium">{t('achievements')}</span>
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
            title={t('replayHistory')}
          >
            <History size={16} className={isReplaying ? 'text-white' : 'text-red-400'} />
            <span className="text-xs font-medium">{t('replay')}</span>
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
            title={t('miniMap')}
          >
            <Map size={16} className={showMiniMap ? 'text-white' : 'text-green-400'} />
            <span className="text-xs font-medium">{t('miniMap')}</span>
          </button>
        </div>

        {/* Screenshot/Export row */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleScreenshot}
            className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title={t('screenshot')}
          >
            <Image size={12} />
            {t('screenshot')}
          </button>
          <button
            onClick={handleExport}
            className="flex-1 min-h-11 rounded-lg flex items-center justify-center gap-1.5 text-xs bg-slate-700/60 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
            title={t('exportReport')}
          >
            <Download size={12} />
            {t('export')}
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
