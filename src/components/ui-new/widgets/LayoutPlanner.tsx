import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, Undo2, Redo2, X, Route, RefreshCw, Pause, Play } from 'lucide-react';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { useProductionStore } from '../../../stores/productionStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { spoutMachineKey } from '../../flow/spoutRoutes';
import { positionRegistry } from '../../../utils/positionRegistry';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import {
  logisticsControlHold,
  useLogisticsLayoutStore,
  type LogisticsObservation,
} from '../../../stores/logisticsLayoutStore';
import {
  capturedPlanningObstacles,
  logisticsLoadingRate,
  DEFAULT_PLANNING_ASSUMPTIONS,
  isEditableRoutePoint,
  optimizeLogisticsLayout,
  PLANNING_DOCKS,
  planningQueueSummary,
  scoreLogisticsLayout,
  type Dock,
  type LayoutSnapshot,
  type LogisticsProposal,
  type PlanningAssumptions,
} from '../../../simulation/layoutPlanning';
import {
  layoutPlanDxf,
  layoutPlanSvg,
  layoutProposalJson,
} from '../../../simulation/layoutPlanningExport';
import { MATERIAL_TRANSPORT_SPEEDS } from '../../../simulation/materialTransport';
import { formatFixed, formatGrouped, translate, useT } from '../../../i18n';
import { layoutPlannerMessages } from './LayoutPlanner.messages';

function captureLayout(): LayoutSnapshot {
  const flow = useMaterialFlowStore.getState();
  const machines = useProductionStore
    .getState()
    .machines.map(({ id, type, position, size }) => ({ id, type, position, size }));
  const obstacles = capturedPlanningObstacles(machines, positionRegistry.getAllObstacles());
  return structuredClone({
    capturedAt: new Date().toISOString(),
    layoutRevision: useLogisticsLayoutStore.getState().revision,
    simulationTime: flow.simulationTime,
    machines,
    segments: flow.network.segments.map((segment) => ({ ...segment, inTransit: [] })),
    buffers: [...flow.machineBuffers.values()].map((buffer) => ({
      ...buffer,
      inputBuffer: buffer.inputBuffer.map(({ type, amount }) => ({ type, amount })),
      outputBuffer: buffer.outputBuffer.map(({ type, amount }) => ({ type, amount })),
    })),
    obstacles,
    packerKgPerSecond: flow.currentPackerFlowRate,
  });
}

function downloadBlob(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `millos-logistics-proposal.${extension}`;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

async function planPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(translate(layoutPlannerMessages, 'renderFailed')));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 920;
    canvas.height = 1400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(translate(layoutPlannerMessages, 'pngUnavailable'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error(translate(layoutPlannerMessages, 'pngFailed'))),
        'image/png'
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const buttonClass =
  'min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
const fieldClass =
  'min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100';

function NumberField({
  label,
  value,
  onChange,
  min = -100,
  max = 10000,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        className={fieldClass}
        value={value}
        min={min}
        max={max}
        step="0.25"
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

export const LayoutPlanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT(layoutPlannerMessages);
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog as React.RefObject<HTMLElement>, true, onClose);
  const [snapshot, setSnapshot] = useState(captureLayout);
  const applied = useLogisticsLayoutStore();
  const productionSpeed = useProductionStore((s) => s.productionSpeed);
  const gameSpeed = useGameSimulationStore((s) => s.gameSpeed);
  const resumeSpeeds = useRef({ production: productionSpeed || 1, game: gameSpeed || 180 });
  const paused = productionSpeed === 0 && gameSpeed === 0;
  const hold = logisticsControlHold();
  const [baseline, setBaseline] = useState(() => structuredClone(applied.layout));
  const [history, setHistory] = useState<LogisticsProposal[]>(() => [
    structuredClone(applied.layout),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [assumptions, setAssumptions] = useState<PlanningAssumptions>(() =>
    structuredClone(DEFAULT_PLANNING_ASSUMPTIONS)
  );
  const [dock, setDock] = useState<Dock>('shipping');
  const [message, setMessage] = useState(() => translate(layoutPlannerMessages, 'initialMessage'));
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [liveQueues, setLiveQueues] = useState(true);
  const [zoomedPlans, setZoomedPlans] = useState({ current: false, proposed: false });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const proposal = history[historyIndex];
  const currentScore = useMemo(
    () => scoreLogisticsLayout(baseline, assumptions, snapshot.obstacles),
    [baseline, assumptions, snapshot.obstacles]
  );
  const proposalScore = useMemo(
    () => scoreLogisticsLayout(proposal, assumptions, snapshot.obstacles),
    [proposal, assumptions, snapshot.obstacles]
  );
  const currentTitle = t('svgCurrentTitle');
  const proposedTitle = t('svgProposedTitle');
  const currentSvg = useMemo(
    () => layoutPlanSvg(snapshot, baseline, currentTitle),
    [snapshot, baseline, currentTitle]
  );
  const proposedSvg = useMemo(
    () => layoutPlanSvg(snapshot, proposal, proposedTitle),
    [snapshot, proposal, proposedTitle]
  );
  const queues = useMemo(() => planningQueueSummary(snapshot.buffers), [snapshot.buffers]);
  const layoutChangedNow = () =>
    useLogisticsLayoutStore.getState().revision !== snapshot.layoutRevision ||
    spoutMachineKey(useProductionStore.getState().machines) !== spoutMachineKey(snapshot.machines);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const machines = useProductionStore.getState().machines;
      const layoutChanged =
        useLogisticsLayoutStore.getState().revision !== snapshot.layoutRevision ||
        spoutMachineKey(machines) !== spoutMachineKey(snapshot.machines);
      setStale(layoutChanged);
      if (liveQueues && !layoutChanged) {
        const fresh = captureLayout();
        setSnapshot((prior) => ({
          ...prior,
          segments: fresh.segments,
          buffers: fresh.buffers,
          capturedAt: fresh.capturedAt,
          simulationTime: fresh.simulationTime,
          packerKgPerSecond: fresh.packerKgPerSecond,
        }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [liveQueues, snapshot.machines, snapshot.layoutRevision]);

  const change = (next: LogisticsProposal) => {
    setHistory((prior) => [...prior.slice(0, historyIndex + 1), structuredClone(next)].slice(-40));
    setHistoryIndex(Math.min(historyIndex + 1, 39));
    setMessage(translate(layoutPlannerMessages, 'proposalUpdated'));
  };
  const refresh = () => {
    const current = structuredClone(useLogisticsLayoutStore.getState().layout);
    setSnapshot(captureLayout());
    setBaseline(current);
    setHistory([structuredClone(current)]);
    setHistoryIndex(0);
    setStale(false);
    setMessage(translate(layoutPlannerMessages, 'layoutCaptured'));
  };
  const pause = () => {
    if (logisticsControlHold()) return;
    if (productionSpeed > 0) resumeSpeeds.current.production = productionSpeed;
    if (gameSpeed > 0) resumeSpeeds.current.game = gameSpeed;
    useProductionStore.getState().setProductionSpeed(0);
    useGameSimulationStore.getState().setGameSpeed(0);
    setMessage(translate(layoutPlannerMessages, 'millPausedMessage'));
  };
  const run = () => {
    const reason = logisticsControlHold();
    if (reason) {
      setMessage(reason);
      return;
    }
    useProductionStore.getState().setProductionSpeed(resumeSpeeds.current.production);
    useGameSimulationStore.getState().setGameSpeed(resumeSpeeds.current.game);
    onClose();
  };
  const install = (undo: boolean) => {
    const live = useLogisticsLayoutStore.getState();
    const key = spoutMachineKey(snapshot.machines);
    const result = undo
      ? live.undoApplied(snapshot.layoutRevision ?? -1, key)
      : live.apply(proposal, snapshot.layoutRevision ?? -1, key);
    if (result.changed) {
      refresh();
      setMessage(
        undo
          ? translate(layoutPlannerMessages, 'geometryRestored')
          : translate(layoutPlannerMessages, 'layoutApplied')
      );
    } else {
      setMessage(result.reason ?? translate(layoutPlannerMessages, 'applyFailed'));
      if (layoutChangedNow()) setStale(true);
    }
  };
  const optimize = () => {
    if (layoutChangedNow()) {
      setStale(true);
      return;
    }
    setBusy(true);
    setMessage(translate(layoutPlannerMessages, 'comparing'));
    window.setTimeout(() => {
      if (!mounted.current) return;
      try {
        const result = optimizeLogisticsLayout(proposal, assumptions, snapshot.obstacles);
        if (result.improved) change(result.proposal);
        setMessage(
          translate(layoutPlannerMessages, 'alternativesChecked', {
            count: formatGrouped(result.evaluations),
            improved: result.improved,
          })
        );
      } catch {
        setMessage(translate(layoutPlannerMessages, 'searchFailed'));
      } finally {
        setBusy(false);
      }
    }, 20);
  };
  const exportPlan = async (format: 'svg' | 'png' | 'dxf' | 'json') => {
    if (layoutChangedNow()) {
      setStale(true);
      return;
    }
    setBusy(true);
    try {
      const blob =
        format === 'png'
          ? await planPng(proposedSvg)
          : new Blob(
              [
                format === 'svg'
                  ? proposedSvg
                  : format === 'dxf'
                    ? layoutPlanDxf(snapshot, proposal)
                    : layoutProposalJson(snapshot, baseline, proposal, assumptions),
              ],
              {
                type:
                  format === 'svg'
                    ? 'image/svg+xml'
                    : format === 'json'
                      ? 'application/json'
                      : 'application/dxf',
              }
            );
      downloadBlob(blob, format);
      if (mounted.current)
        setMessage(
          translate(layoutPlannerMessages, 'downloadStarted', { format: format.toUpperCase() })
        );
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof Error ? error.message : translate(layoutPlannerMessages, 'exportFailed')
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const updateStaging = (axis: 0 | 2, value: number) => {
    const next = structuredClone(proposal);
    next.staging[dock] = next.staging[dock].map((v, index) => (index === axis ? value : v)) as [
      number,
      number,
      number,
    ];
    change(next);
  };
  const updateWaypoint = (index: number, axis: 0 | 2, value: number) => {
    const next = structuredClone(proposal);
    next.routes[dock][index] = next.routes[dock][index].map((v, i) => (i === axis ? value : v)) as [
      number,
      number,
      number,
    ];
    change(next);
  };
  const saving =
    currentScore.feasible && proposalScore.feasible && currentScore.weightedCost > 0
      ? (1 - proposalScore.weightedCost / currentScore.weightedCost) * 100
      : null;

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 p-2 sm:p-6 flex items-center justify-center pointer-events-auto">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-planner-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-[#071722] text-slate-100"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-700 p-4 sm:px-6">
          <div>
            <h2 id="layout-planner-title" className="flex items-center gap-2 text-xl font-semibold">
              <Route size={22} aria-hidden="true" />
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-slate-300">{t('subtitle')}</p>
          </div>
          <button className={buttonClass} onClick={onClose} aria-label={t('close')}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {snapshot.machines.length === 0 ? (
            <p role="status" className="mb-4 text-amber-200">
              {t('noMachines')}
            </p>
          ) : null}
          {stale && (
            <p role="alert" className="mb-4 text-amber-200">
              {t('stale')}
            </p>
          )}
          <section className="mb-5 border-b border-slate-700 pb-4" aria-label={t('operateLabel')}>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} disabled={paused || !!hold} onClick={pause}>
                <Pause size={16} className="mr-1 inline" aria-hidden="true" />
                {t('pauseMill')}
              </button>
              <button
                className={`${buttonClass} bg-cyan-900 text-white`}
                disabled={
                  busy ||
                  !paused ||
                  !!hold ||
                  stale ||
                  !proposalScore.feasible ||
                  JSON.stringify(proposal) === JSON.stringify(baseline) ||
                  !snapshot.machines.length
                }
                onClick={() => install(false)}
              >
                {t('applyToMill')}
              </button>
              <button
                className={buttonClass}
                disabled={busy || !paused || !!hold || stale || !applied.previous}
                onClick={() => install(true)}
              >
                {t('undoApplied')}
              </button>
              <button className={buttonClass} disabled={!!hold} onClick={run}>
                <Play size={16} className="mr-1 inline" aria-hidden="true" />
                {t('runProduction')}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {hold ?? (paused ? t('pausedNote') : t('runningNote'))}{' '}
              {t('layoutRevision', { revision: formatFixed(applied.revision, 0) })}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {t('loadingCapacity', { rate: formatFixed(logisticsLoadingRate(applied.layout), 0) })}
            </p>
            <p role="status" className="mt-3 text-sm text-cyan-200">
              {message}
            </p>
          </section>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              className={`${buttonClass} bg-cyan-900 text-white`}
              disabled={busy || stale || !snapshot.machines.length}
              onClick={optimize}
            >
              {t('findLowerCost')}
            </button>
            <button
              className={buttonClass}
              disabled={busy || historyIndex === 0}
              onClick={() => {
                setHistoryIndex(historyIndex - 1);
                setMessage(t('editUndone'));
              }}
            >
              <Undo2 size={16} className="inline mr-1" aria-hidden="true" />
              {t('undo')}
            </button>
            <button
              className={buttonClass}
              disabled={busy || historyIndex === history.length - 1}
              onClick={() => {
                setHistoryIndex(historyIndex + 1);
                setMessage(t('editRestored'));
              }}
            >
              <Redo2 size={16} className="inline mr-1" aria-hidden="true" />
              {t('redo')}
            </button>
            <button className={buttonClass} disabled={busy} onClick={() => change(baseline)}>
              <RotateCcw size={16} className="inline mr-1" aria-hidden="true" />
              {t('resetProposal')}
            </button>
            <button className={buttonClass} disabled={busy} onClick={refresh}>
              <RefreshCw size={16} className="inline mr-1" aria-hidden="true" />
              {t('captureAgain')}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2" data-testid="layout-plan-comparison">
            {(['current', 'proposed'] as const).map((name) => (
              <div key={name} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold capitalize">
                    {t('planHeading', { plan: name })}
                  </h3>
                  <button
                    className={buttonClass}
                    aria-pressed={zoomedPlans[name]}
                    onClick={() => setZoomedPlans({ ...zoomedPlans, [name]: !zoomedPlans[name] })}
                  >
                    {t('zoomPlan', { plan: name, zoomed: zoomedPlans[name] })}
                  </button>
                </div>
                <div
                  className="max-h-[32rem] overflow-auto overscroll-contain"
                  tabIndex={0}
                  role="region"
                  aria-label={t('drawingRegion', { plan: name })}
                >
                  <div
                    style={zoomedPlans[name] ? { width: 920 } : undefined}
                    className={`[&_svg]:w-full [&_svg]:h-auto ${zoomedPlans[name] ? '' : '[&_svg]:max-h-[32rem]'}`}
                    dangerouslySetInnerHTML={{
                      __html: name === 'current' ? currentSvg : proposedSvg,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <section aria-labelledby="layout-comparison-heading" className="mt-5">
            <h3 id="layout-comparison-heading" className="text-base font-semibold">
              {t('estimatedComparison')}
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-slate-300">
                  <tr>
                    <th className="py-2 pr-3">{t('measure')}</th>
                    <th className="py-2 pr-3">{t('current')}</th>
                    <th className="py-2">{t('proposal')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  <ComparisonRow
                    label={t('vehicleTravel')}
                    current={currentScore.travelMetresPerHour}
                    proposed={proposalScore.travelMetresPerHour}
                  />
                  <ComparisonRow
                    label={t('stagingHandling')}
                    current={currentScore.handlingMetresPerHour}
                    proposed={proposalScore.handlingMetresPerHour}
                  />
                  <ComparisonRow
                    label={t('slowZoneVisits')}
                    current={currentScore.crossingsPerHour}
                    proposed={proposalScore.crossingsPerHour}
                  />
                  <ComparisonRow
                    label={t('weightedCost')}
                    current={currentScore.weightedCost}
                    proposed={proposalScore.weightedCost}
                  />
                  {PLANNING_DOCKS.map((name) => (
                    <ComparisonRow
                      key={name}
                      label={name === 'shipping' ? t('shippingCycle') : t('receivingCycle')}
                      current={currentScore.routes[name].cycleSeconds}
                      proposed={proposalScore.routes[name].cycleSeconds}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {saving !== null && (
              <p className="mt-3 text-sm text-cyan-200">
                {t(saving >= 0 ? 'savingLower' : 'savingHigher', {
                  pct: formatFixed(Math.abs(saving), 1),
                })}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-300">{t('travelEstimates')}</p>
          </section>
          <ObservedComparison
            before={applied.before}
            after={applied.retainedAfter ?? applied.observation}
          />
          <fieldset disabled={busy} className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
            <section aria-labelledby="proposal-controls-heading">
              <h3 id="proposal-controls-heading" className="text-base font-semibold">
                {t('proposalControls')}
              </h3>
              <div className="mt-3 flex gap-2">
                {PLANNING_DOCKS.map((name) => (
                  <button
                    key={name}
                    className={`${buttonClass} capitalize ${dock === name ? 'bg-slate-700 text-white' : ''}`}
                    aria-pressed={dock === name}
                    onClick={() => setDock(name)}
                  >
                    {t('dockName', { dock: name })}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-300">
                {dock === 'shipping' ? t('shippingStagingNote') : t('receivingStagingNote')}{' '}
                {t('fixedNote')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberField
                  label={t('stagingX', { dock })}
                  value={proposal.staging[dock][0]}
                  onChange={(v) => updateStaging(0, v)}
                  max={100}
                />
                <NumberField
                  label={t('stagingZ', { dock })}
                  value={proposal.staging[dock][2]}
                  onChange={(v) => updateStaging(2, v)}
                  max={100}
                />
              </div>
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-cyan-200">
                  {t('travelWaypoints')}
                </summary>
                <p className="my-2 text-sm text-slate-300">{t('waypointNote')}</p>
                {proposal.routes[dock].map((point, index) =>
                  isEditableRoutePoint(dock, index) ? (
                    <div key={index} className="mb-3 grid grid-cols-2 gap-3">
                      <NumberField
                        label={t('waypointX', { index: index + 1 })}
                        value={point[0]}
                        onChange={(v) => updateWaypoint(index, 0, v)}
                        max={100}
                      />
                      <NumberField
                        label={t('waypointZ', { index: index + 1 })}
                        value={point[2]}
                        onChange={(v) => updateWaypoint(index, 2, v)}
                        max={100}
                      />
                    </div>
                  ) : (
                    <p key={index} className="py-1 text-sm text-slate-300">
                      {t('waypointLocked', { index: index + 1, x: point[0], z: point[2] })}
                    </p>
                  )
                )}
              </details>
              <div className="mt-4 border-t border-slate-700 pt-4" aria-live="polite">
                <p
                  className={
                    proposalScore.feasible ? 'text-sm text-green-200' : 'text-sm text-amber-200'
                  }
                >
                  {proposalScore.feasible ? t('feasible') : t('resolveConflicts')}
                </p>
                {!proposalScore.feasible && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
                    {proposalScore.violations.map((violation) => (
                      <li key={violation}>{violation}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-sm text-slate-300">{t('sweptNote')}</p>
              </div>
            </section>
            <section aria-labelledby="planning-assumptions-heading">
              <h3 id="planning-assumptions-heading" className="text-base font-semibold">
                {t('planningAssumptions')}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {PLANNING_DOCKS.map((name) => (
                  <NumberField
                    key={name}
                    label={t('tripsPerHour', { dock: name })}
                    value={assumptions.tripsPerHour[name]}
                    min={0}
                    onChange={(value) =>
                      setAssumptions({
                        ...assumptions,
                        tripsPerHour: { ...assumptions.tripsPerHour, [name]: value },
                      })
                    }
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(['travel', 'handling', 'crossing'] as const).map((key) => (
                  <NumberField
                    key={key}
                    label={t('weight', { weight: key })}
                    value={assumptions.weights[key]}
                    min={0}
                    max={5}
                    onChange={(value) =>
                      setAssumptions({
                        ...assumptions,
                        weights: { ...assumptions.weights, [key]: value },
                      })
                    }
                  />
                ))}
                <NumberField
                  label={t('slowZoneDelay')}
                  value={assumptions.crossingDelaySeconds}
                  min={0}
                  max={120}
                  onChange={(value) =>
                    setAssumptions({ ...assumptions, crossingDelaySeconds: value })
                  }
                />
              </div>
              <h3 className="mt-6 text-base font-semibold">{t('observedQueues')}</h3>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={liveQueues}
                  onChange={(event) => setLiveQueues(event.target.checked)}
                />
                {t('liveQueues')}
              </label>
              <p className="mt-1 text-sm text-slate-300">
                {t('materialClock', {
                  clock: formatFixed(snapshot.simulationTime, 1),
                  output: formatFixed(snapshot.packerKgPerSecond, 1),
                })}
              </p>
              <ul className="mt-3 divide-y divide-slate-700 text-sm">
                {queues.slice(0, 4).map((queue) => (
                  <li key={queue.id} className="flex justify-between gap-3 py-2">
                    <span>{queue.id}</span>
                    <span className="text-right font-mono">
                      {t('queueFlow', {
                        input: formatFixed(queue.inputKg, 0),
                        output: formatFixed(queue.outputKg, 0),
                      })}
                      <br />
                      {t('queueUse', { pct: formatFixed(queue.utilization * 100, 0) })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-slate-300">
                {t('transportNote', {
                  intake: MATERIAL_TRANSPORT_SPEEDS.intake,
                  pneumatic: MATERIAL_TRANSPORT_SPEEDS.pneumatic,
                  finished: MATERIAL_TRANSPORT_SPEEDS.finished,
                  modeled: snapshot.segments.filter((s) => s.routeProvenance === 'modeled').length,
                })}
              </p>
            </section>
          </fieldset>
          <section className="mt-6 border-t border-slate-700 pt-4" aria-label={t('exportLabel')}>
            <div className="flex flex-wrap gap-2">
              {(['svg', 'png', 'dxf', 'json'] as const).map((format) => (
                <button
                  key={format}
                  className={buttonClass}
                  disabled={busy || stale || !proposalScore.feasible || !snapshot.machines.length}
                  onClick={() => void exportPlan(format)}
                >
                  <Download size={16} className="mr-1 inline" aria-hidden="true" />
                  {format === 'json'
                    ? t('saveJson')
                    : t('exportFormat', { format: format.toUpperCase() })}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-300">{t('filesNote')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

function ComparisonRow({
  label,
  current,
  proposed,
}: {
  label: string;
  current: number;
  proposed: number;
}) {
  const t = useT(layoutPlannerMessages);
  const format = (value: number) =>
    Number.isFinite(value)
      ? formatGrouped(value, { maximumFractionDigits: 1 })
      : Number.isNaN(value)
        ? t('pending')
        : t('clearanceConflict');
  return (
    <tr>
      <th className="py-2 pr-3 font-normal text-slate-300">{label}</th>
      <td className="py-2 pr-3 font-mono">{format(current)}</td>
      <td className="py-2 font-mono">{format(proposed)}</td>
    </tr>
  );
}

function ObservedComparison({
  before,
  after,
}: {
  before: LogisticsObservation | null;
  after: LogisticsObservation;
}) {
  const t = useT(layoutPlannerMessages);
  const rate = (o: LogisticsObservation | null, n: number | undefined) =>
    o && o.activeSeconds > 0 ? ((n ?? 0) * 60) / o.activeSeconds : NaN;
  const matched =
    before &&
    before.conditions.length === 1 &&
    after.conditions.length === 1 &&
    before.conditions[0] === after.conditions[0];
  return (
    <section className="mt-5" aria-labelledby="layout-observed-heading">
      <h3 id="layout-observed-heading" className="text-base font-semibold">
        {t('observedHeading')}
      </h3>
      <p className="mt-2 text-sm text-slate-300">
        {before ? t('beforeSealed') : t('runBaseline')} {t('observedNote')}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-slate-300">
            <tr>
              <th className="py-2 pr-3">{t('measure')}</th>
              <th className="py-2 pr-3">{t('beforeApply')}</th>
              <th className="py-2">{before ? t('afterApply') : t('currentRun')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            <ComparisonRow
              label={t('activeSeconds')}
              current={before?.activeSeconds ?? NaN}
              proposed={after.activeSeconds}
            />
            <ComparisonRow
              label={t('materialSeconds')}
              current={before?.materialSeconds ?? NaN}
              proposed={after.materialSeconds}
            />
            <ComparisonRow
              label={t('packedPerMinute')}
              current={rate(before, before?.packedKg)}
              proposed={rate(after, after.packedKg)}
            />
            <ComparisonRow
              label={t('shippedPerMinute')}
              current={rate(before, before?.shippedKg)}
              proposed={rate(after, after.shippedKg)}
            />
            <ComparisonRow
              label={t('vehicleMetresPerMinute')}
              current={rate(before, before?.vehicleMetres)}
              proposed={rate(after, after.vehicleMetres)}
            />
            <ComparisonRow
              label={t('completedUnloads')}
              current={before?.completedUnloads ?? NaN}
              proposed={after.completedUnloads}
            />
          </tbody>
        </table>
      </div>
      {before && (
        <p className="mt-2 text-sm text-amber-200">
          {matched ? t('controlsMatched') : t('controlsChanged')}
        </p>
      )}
    </section>
  );
}
