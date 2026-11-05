import { ProcessInspectionCard } from '../widgets/ProcessInspectionCard';
import { formatPlantStamp } from '../../../utils/timeFormatting';
import { WindmillLearningCard } from '../widgets/WindmillLearningCard';
import React, { useState, useCallback, useEffect, Suspense, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatPaceRatio, PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { useRunningThroughput } from '../../../hooks/useRunningThroughput';
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
import {
  selectChosenPace,
  selectPaceUnderPause,
  useGameSimulationStore,
} from '../../../stores/gameSimulationStore';
import { useAchievementsStore } from '../../../stores/achievementsStore';
import { recordOperatorAction } from '../../../stores/operationsCampaignStore';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { saveScenePng } from '../../../utils/sceneCapture';
import { useUIStore } from '../../../stores/uiStore';
import { useHistoricalPlaybackStore } from '../../../stores/historicalPlaybackStore';
import {
  useMaterialFlowStore,
  type DispositionReasonKey,
  type MaterialManifest,
  type SourceLot,
} from '../../../stores/materialFlowStore';
import { materialFlowStoreMessages } from '../../../stores/materialFlowStore.messages';
import { useQCLabStore, type QCGrade, type QCTestType } from '../../../stores/qcLabStore';
import { qcLabStoreMessages } from '../../../stores/qcLabStore.messages';
import { useShallow } from 'zustand/react/shallow';
import { AchievementsPanel } from '../../GameFeatures';
import { TimelinePlayback } from '../../ui/TimelinePlayback';
import { recoverableLazy } from '../../../utils/recoverableLazy';
import { RecoverableFeatureBoundary } from '../../ErrorBoundary';
import {
  capitalizeIn,
  formatFixed,
  formatGrouped,
  translate,
  useLocale,
  useT,
} from '../../../i18n';
import { overviewPanelMessages } from './OverviewPanel.messages';
import { screenshotButtonMessages } from '../../game/ScreenshotButton.messages';
import { registerAlertCatalog } from '../../../i18n/alertCopy';

const SCREENSHOT_ALERT_CATALOG = 'overviewPanel.screenshot';
registerAlertCatalog(SCREENSHOT_ALERT_CATALOG, screenshotButtonMessages);

import { OperationsPlayCard, PaceHoldNote, ShiftDebrief } from '../onboarding/PlayableShift';
import { qcReadingsForLots } from '../../../chronicle/cropYears';

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
  const speedLabel = gameSpeed === 0 ? t('paused') : formatPaceRatio(gameSpeed);

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
export const GameSpeedControls: React.FC = React.memo(() => {
  // The same chosen pace and hold note as Shift pace (TeachingPace).
  const gameSpeed = useGameSimulationStore(selectChosenPace);
  const setGameSpeed = useGameSimulationStore((state) => state.setGameSpeed);
  const pace = useT(paceMessages);

  return (
    <>
      <div className="flex gap-1" role="group" aria-label={pace('paceTitle')}>
        {PACE_GAME_SPEEDS.map((value) => (
          <button
            key={value}
            onClick={() => {
              // A new running pace is the player's decision; a pause to inspect is not.
              const before = selectPaceUnderPause(useGameSimulationStore.getState());
              setGameSpeed(value);
              if (value > 0 && value !== before)
                recordOperatorAction({ kind: 'pace', gameSpeed: value });
            }}
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
      <PaceHoldNote />
    </>
  );
});

// Isolated Shift Display
const ShiftDisplay: React.FC = React.memo(() => {
  const currentShift = useGameSimulationStore((state) => state.currentShift);
  const t = useT(overviewPanelMessages);
  const locale = useLocale();

  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t('runWindow')}</div>
      <div className={`text-sm font-bold text-white ${capitalizeIn(locale)}`}>
        {t('runWindowValue', { value: currentShift })}
      </div>
    </div>
  );
});

/** A manifest's stamp: the plant clock it was made at, else its material time. */
export const manifestStamp = (manifest: Pick<MaterialManifest, 'simulationTime' | 'gameClock'>) =>
  formatPlantStamp(manifest.gameClock) ?? formatManifestTime(manifest.simulationTime);

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
          <dt className="text-[10px] uppercase tracking-wider text-slate-400">{t('received')}</dt>
          <dd className="text-sm font-mono font-bold text-cyan-300">{formatKg(receivedKg)} kg</dd>
        </div>
        <div className="rounded-lg bg-slate-900/45 p-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-400">{t('shipped')}</dt>
          <dd className="text-sm font-mono font-bold text-emerald-300">{formatKg(shippedKg)} kg</dd>
        </div>
      </dl>
      {latestManifests.length === 0 ? (
        <p className="text-xs text-slate-400 py-1">{t('awaitingFirstTransfer')}</p>
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
              <time className="mt-1 block text-[9px] font-mono text-slate-400">
                {manifestStamp(manifest)}
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
// `+ 0` folds a negative zero (a tiny negative error rounded away), which
// pt-BR would print as "+-0,00"; a NaN still shows as a fault.
const readGenealogyErrorKg = () =>
  Math.round(useMaterialFlowStore.getState().getGenealogyBalance().errorKg * 100) / 100 + 0;

/** A batch mass to the tenth, grouped like every other mass ("1,250.0", "1.250,0"). */
const formatKgTenths = (kg: number) =>
  formatGrouped(kg, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Lab grade bands over the 0-100 product quality score stamped on a batch. */
function labGradeForQuality(score: number | undefined): QCGrade {
  if (score === undefined || !Number.isFinite(score) || score >= 95) return 'A';
  if (score >= 85) return 'B';
  if (score >= 70) return 'C';
  return 'FAIL';
}

const REASON_CATALOGS = {
  materialFlow: materialFlowStoreMessages,
  qcLab: qcLabStoreMessages,
  overview: overviewPanelMessages,
} as const;

/** A canned Overview note as a reason key, so the batch reason follows the language. */
const overviewNoteKey = (key: keyof typeof overviewPanelMessages.en): DispositionReasonKey => ({
  catalog: 'overview',
  key,
});

/**
 * A disposition reason in the current language. A keyed (canned) reason is
 * translated now; free text, an unknown key and a record saved before reasons
 * carried a key all show the text stored with it.
 */
export function dispositionReasonText(
  storedText: string,
  reasonKey: DispositionReasonKey | undefined
): string {
  const resolve = (reason: DispositionReasonKey): string | null => {
    const catalog = REASON_CATALOGS[reason.catalog];
    if (!catalog || !Object.prototype.hasOwnProperty.call(catalog.en, reason.key)) return null;
    const params: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(reason.params ?? {})) {
      if (typeof value === 'object') {
        const nested = resolve(value);
        if (nested === null) return null;
        params[name] = nested;
      } else {
        params[name] = value;
      }
    }
    return translate(catalog as typeof overviewPanelMessages, reason.key as 'noteHold', params);
  };
  return (reasonKey && resolve(reasonKey)) ?? storedText;
}

/** A lot's supplier in the current language; a named supplier stays as written. */
function lotSupplierText(lot: SourceLot): string {
  if (lot.origin === 'opening_stock')
    return translate(materialFlowStoreMessages, 'openingInventory');
  if (lot.supplierKey) return translate(materialFlowStoreMessages, lot.supplierKey);
  return lot.supplier;
}

export const BatchGenealogySection: React.FC = React.memo(() => {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  // A recall is terminal and scraps the mass, so it is asked once before acting.
  const [confirmRecallId, setConfirmRecallId] = useState<string | null>(null);
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
    // A recalled batch stays listed: it is the record of what was scrapped.
    const needsAttention = (batch: (typeof productionBatches)[number]) =>
      batch.disposition === 'hold' ||
      batch.disposition === 'recalled' ||
      investigationBatchIds.has(batch.id);
    // Quality recovery stays reachable as newer production arrives. Final
    // dispositions keep their existing trace-only controls even during an alert.
    return [
      ...newestFirst.filter(needsAttention),
      ...newestFirst.filter((batch) => !needsAttention(batch)).slice(0, 4),
    ];
  }, [productionBatches, qcLab.contaminationAlerts]);
  // A trace whose batch has left the list has no Hide trace button; close it.
  const selectedListed =
    selectedBatchId !== null && displayedBatches.some((batch) => batch.id === selectedBatchId);
  useEffect(() => {
    if (selectedBatchId !== null && !selectedListed) setSelectedBatchId(null);
  }, [selectedBatchId, selectedListed]);
  const selectedTrace = selectedListed
    ? useMaterialFlowStore.getState().getBatchTrace(selectedBatchId)
    : null;
  // A recall ask left unanswered while its batch left hold (a retest released
  // it) is dropped, so holding the batch again later does not ask unbidden.
  const confirmStillHeld =
    confirmRecallId !== null &&
    productionBatches.some((batch) => batch.id === confirmRecallId && batch.disposition === 'hold');
  useEffect(() => {
    if (confirmRecallId !== null && !confirmStillHeld) setConfirmRecallId(null);
  }, [confirmRecallId, confirmStillHeld]);

  // An action that removes the control it was pressed on hands focus to the
  // next sensible one: Confirm when a recall is asked, Recall batch when it is
  // cancelled, otherwise that batch's Trace button, else the section.
  // Working if a keyboard user never lands back at the top of the page.
  const sectionRef = useRef<HTMLElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    batchId: string;
    control: 'confirm' | 'recall' | 'trace';
  } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    setFocusRequest(null);
    const section = sectionRef.current;
    if (!section) return;
    const active = document.activeElement;
    // A Trace landing is only a fallback: a control that survived keeps focus.
    if (
      focusRequest.control === 'trace' &&
      active instanceof HTMLElement &&
      active !== document.body &&
      section.contains(active)
    )
      return;
    const find = (control: string) =>
      Array.from(section.querySelectorAll<HTMLElement>('[data-batch-focus]')).find(
        (element) => element.dataset.batchFocus === `${control}:${focusRequest.batchId}`
      );
    (find(focusRequest.control) ?? find('trace') ?? section).focus();
  }, [focusRequest]);

  const runConformingTest = (batchId: string, testType: QCTestType) => {
    const batch = useMaterialFlowStore
      .getState()
      .productionBatches.find((candidate) => candidate.id === batchId);
    if (!batch) return;
    const sourceLotIds = [...new Set(batch.sourceContributions.map((source) => source.lotId))];
    // The lab reports the quality the batch was made at; a batch saved before
    // that was recorded reads as conforming, as every test did before.
    const grade = labGradeForQuality(batch.qualityScore);
    // The physical readings come from the stamped crop attributes of the lots
    // under test; unstamped lots (no signed chronicle) give the long-standing
    // readings.
    const lots = useMaterialFlowStore.getState().sourceLots;
    const readings = qcReadingsForLots(
      batch.sourceContributions.map((source) => ({
        crop: lots.get(source.lotId)?.crop,
        amountKg: source.amount,
      }))
    );
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
      // A failed retest takes the lab's own held note rather than "conforming".
      controlNote:
        testType !== 'retest'
          ? translate(overviewPanelMessages, 'noteRoutineTest')
          : grade === 'FAIL'
            ? undefined
            : translate(overviewPanelMessages, 'noteRetest'),
      grade,
      moistureContent: readings.moistureContent,
      proteinLevel: readings.proteinLevel,
      ashContent: readings.ashContent,
      particleSize: readings.particleSize,
      passed: grade !== 'FAIL',
    });
    // A failed retest leaves the batch on hold and its investigation open, so
    // the player can recall it; only a conforming retest releases the scope.
    if (testType === 'retest' && grade !== 'FAIL') {
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
            translate(overviewPanelMessages, 'noteRetestReleased'),
            undefined,
            overviewNoteKey('noteRetestReleased')
          )
        );
    }
  };

  // The confirmation writes off "this batch": a recall pressed on one batch of
  // a multi-batch investigation scraps that batch alone, and settles every open
  // investigation that named it. Working if the other batches stay on hold.
  const recallBatch = (batchId: string) => {
    const open = useQCLabStore
      .getState()
      .qcLab.contaminationAlerts.filter(
        (alert) => !alert.resolved && alert.batchIds.includes(batchId)
      )
      .map((alert) => alert.id);
    const alertIds = open.length
      ? open
      : [
          triggerContaminationAlert({
            batchIds: [batchId],
            severity: 'high',
            controlSource: 'Autonomous QC controller',
            controlNote: translate(overviewPanelMessages, 'noteRecallInvestigation'),
            controlNoteKey: overviewNoteKey('noteRecallInvestigation'),
          }),
        ];
    alertIds.forEach((alertId) =>
      resolveContaminationAlert(
        alertId,
        'recalled',
        'Autonomous QC controller',
        translate(overviewPanelMessages, 'noteRecalled'),
        [batchId],
        overviewNoteKey('noteRecalled')
      )
    );
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="rounded-xl border border-white/5 bg-slate-800/50 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Link2 size={14} className="text-cyan-400" aria-hidden="true" />
            {t('batchGenealogy')}
          </h3>
          <p className="mt-1 text-[10px] text-slate-400">
            {t('lotSummary', {
              lots: formatFixed(sourceLotCount, 0),
              lotCount: sourceLotCount,
              batches: formatFixed(productionBatches.length, 0),
              batchCount: productionBatches.length,
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
        <p className="py-2 text-xs text-slate-400">{t('firstBatch')}</p>
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
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {t('batchAvailable', {
                        material: t('material', { value: batch.materialType }),
                        kg: formatKgTenths(batch.availableKg),
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
                  <p className="mt-1 text-[10px] text-slate-400">
                    {dispositionReasonText(batch.dispositionReason, batch.dispositionReasonKey)}
                  </p>
                )}
                {batch.disposition === 'recalled' && (batch.writtenOffKg ?? 0) > 0 && (
                  <p className="mt-1 text-[10px] text-red-300">
                    {t('writtenOff', { kg: formatKgTenths(batch.writtenOffKg ?? 0) })}
                  </p>
                )}
                {confirmRecallId === batch.id && batch.disposition === 'hold' && (
                  <div
                    role="alert"
                    className="mt-2 rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-100"
                  >
                    <p>
                      {t('recallConfirm', {
                        kg: formatKgTenths(batch.availableKg),
                        material: t('material', { value: batch.materialType }),
                      })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-batch-focus={`confirm:${batch.id}`}
                        onClick={() => {
                          setConfirmRecallId(null);
                          recallBatch(batch.id);
                          recordOperatorAction({ kind: 'batchRecall', batch: batch.id });
                          setFocusRequest({ batchId: batch.id, control: 'trace' });
                        }}
                        className="min-h-11 rounded bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                      >
                        {t('confirmRecall')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRecallId(null);
                          setFocusRequest({ batchId: batch.id, control: 'recall' });
                        }}
                        className="min-h-11 rounded bg-slate-700 px-3 text-xs font-semibold text-white hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      >
                        {t('cancelRecall')}
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-batch-focus={`trace:${batch.id}`}
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
                        onClick={() => {
                          runConformingTest(batch.id, 'initial');
                          recordOperatorAction({ kind: 'batchTest', batch: batch.id });
                          setFocusRequest({ batchId: batch.id, control: 'trace' });
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded bg-cyan-700 px-3 text-xs font-semibold text-white hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                      >
                        <FlaskConical size={14} aria-hidden="true" />
                        {t('testBatch')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerContaminationAlert({
                            batchIds: [batch.id],
                            severity: 'medium',
                            controlSource: 'Autonomous QC controller',
                            controlNote: translate(overviewPanelMessages, 'noteHold'),
                            controlNoteKey: overviewNoteKey('noteHold'),
                          });
                          recordOperatorAction({ kind: 'batchHold', batch: batch.id });
                          setFocusRequest({ batchId: batch.id, control: 'trace' });
                        }}
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
                        onClick={() => {
                          runConformingTest(batch.id, 'retest');
                          recordOperatorAction({ kind: 'batchRetest', batch: batch.id });
                          setFocusRequest({ batchId: batch.id, control: 'trace' });
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                      >
                        <ShieldCheck size={14} aria-hidden="true" />
                        {t('retestAndRelease')}
                      </button>
                      <button
                        type="button"
                        data-batch-focus={`recall:${batch.id}`}
                        aria-expanded={confirmRecallId === batch.id}
                        onClick={() => {
                          setConfirmRecallId(batch.id);
                          setFocusRequest({ batchId: batch.id, control: 'confirm' });
                        }}
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
                  <span>{formatKgTenths(amount)} kg</span>
                </div>
                <div className="mt-0.5 text-slate-400">
                  {lotSupplierText(lot)}, {t('disposition', { value: lot.disposition })}.{' '}
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

/**
 * Maintenance (breakdowns, predictive alerts, parts, schedule). The wrapper is
 * always mounted, so a repair request from the shift card is consumed here even
 * while the lazy panel inside is still loading. Working if Repair lands the
 * player on the work orders, not at the top of Overview.
 */
export const MaintenanceSection: React.FC = () => {
  const t = useT(overviewPanelMessages);
  const requested = useUIStore((state) => state.maintenanceFocusRequested);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!requested) return;
    const frame = requestAnimationFrame(() => {
      if (!useUIStore.getState().maintenanceFocusRequested) return;
      useUIStore.getState().clearMaintenanceFocus();
      if (useUIStore.getState().fpsMode) return;
      sectionRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      sectionRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requested]);
  return (
    <section
      ref={sectionRef}
      id="overview-maintenance"
      tabIndex={-1}
      aria-label={t('maintenanceSection')}
      className="scroll-mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
    >
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
  );
};

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
  const locale = useLocale();

  // Calculate machine status counts
  const machineStats = {
    running: machines.filter((m) => m.status === 'running').length,
    warning: machines.filter((m) => m.status === 'warning').length,
    critical: machines.filter((m) => m.status === 'critical').length,
    idle: machines.filter((m) => m.status === 'idle').length,
  };

  // Shared formula with StatusHUD so both surfaces show the same number.
  const safetyScore = computeSafetyScore(safetyMetrics);

  // 0 while the clock is held: a paused plant packs nothing.
  const shownThroughput = useRunningThroughput();

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
      <WindmillLearningCard />
      <ProcessInspectionCard />
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
            value={formatGrouped(shownThroughput)}
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
          <div className="text-right text-[10px] text-slate-400 mt-1">
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
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            {t('weather')}
          </div>
          <div className={`text-sm font-bold text-white ${capitalizeIn(locale)}`}>
            {t('weatherValue', { value: weather })}
          </div>
        </div>
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
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
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.safetyStops ?? 0}
            </div>
            <div className="text-[10px] text-slate-400">{t('safetyStops')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-300">
              {safetyMetrics?.daysSinceIncident ?? 0}
            </div>
            <div className="text-[10px] text-slate-400">{t('daysSafe')}</div>
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

      <MaintenanceSection />

      {/* Total Production */}
      <div className="text-center py-3 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-xl border border-cyan-500/20">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider">
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
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider mb-1">
        <span className={colorClasses[color].split(' ')[0]}>{icon}</span>
        {label}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
        <span className={`text-lg font-mono font-bold ${colorClasses[color].split(' ')[0]}`}>
          {value}
        </span>
        <span className="text-[10px] text-slate-400">{unit}</span>
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
      {/* Full strength: at opacity-70 the critical and idle labels fell to 3.5-3.8:1. */}
      <div className="text-[10px] uppercase tracking-wider">{label}</div>
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
  const locale = useLocale();

  return (
    <div className={`${colors.bg} border border-white/5 rounded-lg p-3`}>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold ${capitalizeIn(locale)} ${colors.text}`}>
        {receiving && status === 'loading' ? t('unloading') : t('dockState', { value: status })}
      </div>
      {status === 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-400">
          {t('nextTruck', { minutes: formatFixed(eta, 0) })}
        </div>
      )}
      {status !== 'clear' && eta > 0 && (
        <div className="text-[10px] text-slate-400">
          {t('eta', { minutes: formatFixed(eta, 0) })}
        </div>
      )}
    </div>
  );
};

// Quick Actions Section with Gamification Controls
export const QuickActionsSection: React.FC = () => {
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
    // No frame (hidden tab, lost context) is said, as the HUD button says it.
    let message: 'surfaceUnavailable' | 'captureFailed' | null = null;
    try {
      if (!(await saveScenePng(`millos-${new Date().toISOString().split('T')[0]}.png`)))
        message = 'surfaceUnavailable';
    } catch {
      message = 'captureFailed';
    }
    if (message)
      useUIStore.getState().addAlert({
        id: `screenshot-fail-${Date.now()}`,
        type: 'warning',
        title: translate(screenshotButtonMessages, 'failedTitle'),
        message: translate(screenshotButtonMessages, message),
        timestamp: new Date(),
        acknowledged: false,
        // Keyed, so the bell words it in the language active now.
        copy: { catalog: SCREENSHOT_ALERT_CATALOG, title: 'failedTitle', message },
      });
  }, []);

  const handleExport = useCallback(() => {
    const store = useProductionStore.getState();
    // Nothing writes the target's throughput fields (1500 and 0 from load);
    // the measured rate is metrics.throughput, so the report leaves them out.
    let productionTarget: Partial<NonNullable<typeof store.productionTarget>> | null = null;
    if (store.productionTarget) {
      productionTarget = { ...store.productionTarget };
      delete productionTarget.targetThroughput;
      delete productionTarget.actualThroughput;
    }
    const report = {
      timestamp: new Date().toISOString(),
      metrics: store.metrics,
      productionTarget,
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
