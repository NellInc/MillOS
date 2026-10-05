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
      image.onerror = () => reject(new Error('The drawing could not be rendered. Try SVG export.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 920;
    canvas.height = 1400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export is unavailable in this browser. Try SVG export.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed. Try SVG export.'))),
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
  const [message, setMessage] = useState('Edit a proposal or search for a lower-cost arrangement.');
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
  const currentSvg = useMemo(
    () => layoutPlanSvg(snapshot, baseline, 'Current layout'),
    [snapshot, baseline]
  );
  const proposedSvg = useMemo(
    () => layoutPlanSvg(snapshot, proposal, 'Proposed layout'),
    [snapshot, proposal]
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
    setMessage('Proposal updated. The running mill is unchanged.');
  };
  const refresh = () => {
    const current = structuredClone(useLogisticsLayoutStore.getState().layout);
    setSnapshot(captureLayout());
    setBaseline(current);
    setHistory([structuredClone(current)]);
    setHistoryIndex(0);
    setStale(false);
    setMessage('Current layout captured; the proposal has been reset.');
  };
  const pause = () => {
    if (logisticsControlHold()) return;
    if (productionSpeed > 0) resumeSpeeds.current.production = productionSpeed;
    if (gameSpeed > 0) resumeSpeeds.current.game = gameSpeed;
    useProductionStore.getState().setProductionSpeed(0);
    useGameSimulationStore.getState().setGameSpeed(0);
    setMessage('Mill paused. Apply a clear proposal, then run production to measure it.');
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
          ? 'Previous geometry restored. Stock, shipments and vehicle progress are retained.'
          : 'Layout applied to the mill. Run production, then return here to compare observed results.'
      );
    } else {
      setMessage(result.reason ?? 'The layout could not be applied.');
      if (layoutChangedNow()) setStale(true);
    }
  };
  const optimize = () => {
    if (layoutChangedNow()) {
      setStale(true);
      return;
    }
    setBusy(true);
    setMessage('Comparing bounded route and staging alternatives…');
    window.setTimeout(() => {
      if (!mounted.current) return;
      try {
        const result = optimizeLogisticsLayout(proposal, assumptions, snapshot.obstacles);
        if (result.improved) change(result.proposal);
        setMessage(
          `${result.evaluations.toLocaleString()} alternatives checked. ${result.improved ? 'A lower-cost proposal is ready to compare.' : 'No lower-cost clearance-feasible alternative was found.'}`
        );
      } catch {
        setMessage('The search could not finish. Check the proposal coordinates and try again.');
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
      if (mounted.current) setMessage(`${format.toUpperCase()} download started.`);
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : 'Export failed. Try SVG or JSON.');
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
              Logistics planning
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Plan, pause, apply and run the mill. Compare observed results and undo the applied
              geometry.
            </p>
          </div>
          <button className={buttonClass} onClick={onClose} aria-label="Close logistics planning">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {snapshot.machines.length === 0 ? (
            <p role="status" className="mb-4 text-amber-200">
              The scene has not registered its machines yet. Close this view and reopen it after the
              mill loads.
            </p>
          ) : null}
          {stale && (
            <p role="alert" className="mb-4 text-amber-200">
              The live process layout changed. Capture current again before exporting this proposal.
            </p>
          )}
          <section
            className="mb-5 border-b border-slate-700 pb-4"
            aria-label="Operate planned layout"
          >
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} disabled={paused || !!hold} onClick={pause}>
                <Pause size={16} className="mr-1 inline" aria-hidden="true" />
                Pause mill
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
                Apply to mill
              </button>
              <button
                className={buttonClass}
                disabled={busy || !paused || !!hold || stale || !applied.previous}
                onClick={() => install(true)}
              >
                Undo applied layout
              </button>
              <button className={buttonClass} disabled={!!hold} onClick={run}>
                <Play size={16} className="mr-1 inline" aria-hidden="true" />
                Run production
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {hold ??
                (paused
                  ? 'Mill paused. Apply changes while both clocks are stopped.'
                  : 'Mill running. Pause before applying or undoing geometry.')}{' '}
              Layout revision {applied.revision}.
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Dock loading capacity uses a geometry-based handling assumption:{' '}
              {logisticsLoadingRate(applied.layout).toFixed(0)} kg/s, calibrated to 400 kg/s for the
              authored layout. Vehicle travel and staging distance affect this capacity. Released
              stock, quality interlocks and truck capacity still limit each load. Planning weights
              never change gameplay.
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
              Find lower-cost layout
            </button>
            <button
              className={buttonClass}
              disabled={busy || historyIndex === 0}
              onClick={() => {
                setHistoryIndex(historyIndex - 1);
                setMessage('Proposal edit undone.');
              }}
            >
              <Undo2 size={16} className="inline mr-1" aria-hidden="true" />
              Undo
            </button>
            <button
              className={buttonClass}
              disabled={busy || historyIndex === history.length - 1}
              onClick={() => {
                setHistoryIndex(historyIndex + 1);
                setMessage('Proposal edit restored.');
              }}
            >
              <Redo2 size={16} className="inline mr-1" aria-hidden="true" />
              Redo
            </button>
            <button className={buttonClass} disabled={busy} onClick={() => change(baseline)}>
              <RotateCcw size={16} className="inline mr-1" aria-hidden="true" />
              Reset proposal
            </button>
            <button className={buttonClass} disabled={busy} onClick={refresh}>
              <RefreshCw size={16} className="inline mr-1" aria-hidden="true" />
              Capture current again
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2" data-testid="layout-plan-comparison">
            {(['current', 'proposed'] as const).map((name) => (
              <div key={name} className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold capitalize">{name} layout</h3>
                  <button
                    className={buttonClass}
                    aria-pressed={zoomedPlans[name]}
                    onClick={() => setZoomedPlans({ ...zoomedPlans, [name]: !zoomedPlans[name] })}
                  >
                    {zoomedPlans[name] ? 'Fit' : 'Enlarge'} {name} plan
                  </button>
                </div>
                <div
                  className="max-h-[32rem] overflow-auto overscroll-contain"
                  tabIndex={0}
                  role="region"
                  aria-label={`${name} drawing, scroll to inspect enlarged details`}
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
              Estimated comparison
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-slate-300">
                  <tr>
                    <th className="py-2 pr-3">Measure</th>
                    <th className="py-2 pr-3">Current</th>
                    <th className="py-2">Proposal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  <ComparisonRow
                    label="Vehicle travel (m/hr)"
                    current={currentScore.travelMetresPerHour}
                    proposed={proposalScore.travelMetresPerHour}
                  />
                  <ComparisonRow
                    label="Staging handling (m/hr)"
                    current={currentScore.handlingMetresPerHour}
                    proposed={proposalScore.handlingMetresPerHour}
                  />
                  <ComparisonRow
                    label="Slow-zone visits/hr"
                    current={currentScore.crossingsPerHour}
                    proposed={proposalScore.crossingsPerHour}
                  />
                  <ComparisonRow
                    label="Weighted cost (equivalent m/hr)"
                    current={currentScore.weightedCost}
                    proposed={proposalScore.weightedCost}
                  />
                  {PLANNING_DOCKS.map((name) => (
                    <ComparisonRow
                      key={name}
                      label={`${name === 'shipping' ? 'Shipping' : 'Receiving'} cycle (s)`}
                      current={currentScore.routes[name].cycleSeconds}
                      proposed={proposalScore.routes[name].cycleSeconds}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {saving !== null && (
              <p className="mt-3 text-sm text-cyan-200">
                {Math.abs(saving).toFixed(1)}% {saving >= 0 ? 'lower' : 'higher'} weighted cost with
                the same assumptions.
              </p>
            )}
            <p className="mt-2 text-sm text-slate-300">
              Travel estimates use the rounded route, a conservative 1.8 m/s average and 13 seconds
              for loading/unloading. Staging handling uses rectilinear distance. Acceleration,
              traffic waits and production gains are outside this estimate.
            </p>
          </section>
          <ObservedComparison
            before={applied.before}
            after={applied.retainedAfter ?? applied.observation}
          />
          <fieldset disabled={busy} className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
            <section aria-labelledby="proposal-controls-heading">
              <h3 id="proposal-controls-heading" className="text-base font-semibold">
                Proposal controls
              </h3>
              <div className="mt-3 flex gap-2">
                {PLANNING_DOCKS.map((name) => (
                  <button
                    key={name}
                    className={`${buttonClass} capitalize ${dock === name ? 'bg-slate-700 text-white' : ''}`}
                    aria-pressed={dock === name}
                    onClick={() => setDock(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-300">
                {dock === 'shipping'
                  ? 'Reserve all 50 pallet spaces.'
                  : 'Position the two stacks of empty return pallets.'}{' '}
                Process machines, elevated sifters and pipe endpoints remain fixed.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberField
                  label={`${dock} staging X (m)`}
                  value={proposal.staging[dock][0]}
                  onChange={(v) => updateStaging(0, v)}
                  max={100}
                />
                <NumberField
                  label={`${dock} staging Z (m)`}
                  value={proposal.staging[dock][2]}
                  onChange={(v) => updateStaging(2, v)}
                  max={100}
                />
              </div>
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-cyan-200">
                  Travel waypoints
                </summary>
                <p className="my-2 text-sm text-slate-300">
                  Pickup, dropoff and approach legs are locked. Corners use the controller’s
                  rounding model and may not tighten its existing turning envelope. Apply also
                  checks each vehicle can keep its current pose and next action.
                </p>
                {proposal.routes[dock].map((point, index) =>
                  isEditableRoutePoint(dock, index) ? (
                    <div key={index} className="mb-3 grid grid-cols-2 gap-3">
                      <NumberField
                        label={`Waypoint ${index + 1} X (m)`}
                        value={point[0]}
                        onChange={(v) => updateWaypoint(index, 0, v)}
                        max={100}
                      />
                      <NumberField
                        label={`Waypoint ${index + 1} Z (m)`}
                        value={point[2]}
                        onChange={(v) => updateWaypoint(index, 2, v)}
                        max={100}
                      />
                    </div>
                  ) : (
                    <p key={index} className="py-1 text-sm text-slate-300">
                      Waypoint {index + 1}: {point[0]}, {point[2]} m (locked)
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
                  {proposalScore.feasible
                    ? 'Proposal clears the modeled footprints and protected pedestrian approaches.'
                    : 'Resolve these clearance conflicts before applying or exporting:'}
                </p>
                {!proposalScore.feasible && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-200">
                    {proposalScore.violations.map((violation) => (
                      <li key={violation}>{violation}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-sm text-slate-300">
                  Swept checks use the controller’s 2.7 m corridor plus a 0.1 m sampling margin.
                  Dock pedestrian approaches reserve 3 m. Vehicle crossings may still require a
                  stop; this view makes no evacuation certification.
                </p>
              </div>
            </section>
            <section aria-labelledby="planning-assumptions-heading">
              <h3 id="planning-assumptions-heading" className="text-base font-semibold">
                Planning assumptions
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {PLANNING_DOCKS.map((name) => (
                  <NumberField
                    key={name}
                    label={`${name} trips/hr`}
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
                    label={`${key} weight`}
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
                  label="Slow-zone delay (s)"
                  value={assumptions.crossingDelaySeconds}
                  min={0}
                  max={120}
                  onChange={(value) =>
                    setAssumptions({ ...assumptions, crossingDelaySeconds: value })
                  }
                />
              </div>
              <h3 className="mt-6 text-base font-semibold">Observed material queues</h3>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={liveQueues}
                  onChange={(event) => setLiveQueues(event.target.checked)}
                />
                Update queue telemetry every second
              </label>
              <p className="mt-1 text-sm text-slate-300">
                Material clock {snapshot.simulationTime.toFixed(1)} s; packing output{' '}
                {snapshot.packerKgPerSecond.toFixed(1)} kg/s. Both drawings show this same
                observation, not forecast queues.
              </p>
              <ul className="mt-3 divide-y divide-slate-700 text-sm">
                {queues.slice(0, 4).map((queue) => (
                  <li key={queue.id} className="flex justify-between gap-3 py-2">
                    <span>{queue.id}</span>
                    <span className="text-right font-mono">
                      {queue.inputKg.toFixed(0)} kg in / {queue.outputKg.toFixed(0)} kg out
                      <br />
                      {(queue.utilization * 100).toFixed(0)}% buffer use
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-slate-300">
                Transport timing follows service-route arc length. Assumed speeds: intake{' '}
                {MATERIAL_TRANSPORT_SPEEDS.intake}, pneumatic {MATERIAL_TRANSPORT_SPEEDS.pneumatic},
                finished {MATERIAL_TRANSPORT_SPEEDS.finished} m/s.{' '}
                {snapshot.segments.filter((s) => s.routeProvenance === 'modeled').length}{' '}
                connections use modeled paths; arrivals already in flight keep their timestamps.
              </p>
            </section>
          </fieldset>
          <section
            className="mt-6 border-t border-slate-700 pt-4"
            aria-label="Export logistics proposal"
          >
            <div className="flex flex-wrap gap-2">
              {(['svg', 'png', 'dxf', 'json'] as const).map((format) => (
                <button
                  key={format}
                  className={buttonClass}
                  disabled={busy || stale || !proposalScore.feasible || !snapshot.machines.length}
                  onClick={() => void exportPlan(format)}
                >
                  <Download size={16} className="mr-1 inline" aria-hidden="true" />
                  {format === 'json' ? 'Save proposal JSON' : `Export ${format.toUpperCase()}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Files download locally. DXF uses metre units and semantic layers; SVG and PNG include
              dimensions and a scale bar.
            </p>
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
  const format = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : Number.isNaN(value)
        ? 'Pending'
        : 'Clearance conflict';
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
        Observed operating results
      </h3>
      <p className="mt-2 text-sm text-slate-300">
        {before
          ? 'Before is sealed when a layout is applied. After measures the subsequent run.'
          : 'Run the current mill to collect a baseline, then apply a proposal.'}{' '}
        Active seconds are admitted central-tick time; material seconds follow the production clock.
        Undo retains the completed after window. Reload and replay clear these comparisons.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-slate-300">
            <tr>
              <th className="py-2 pr-3">Measure</th>
              <th className="py-2 pr-3">Before apply</th>
              <th className="py-2">{before ? 'After apply' : 'Current run'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            <ComparisonRow
              label="Active seconds"
              current={before?.activeSeconds ?? NaN}
              proposed={after.activeSeconds}
            />
            <ComparisonRow
              label="Material seconds"
              current={before?.materialSeconds ?? NaN}
              proposed={after.materialSeconds}
            />
            <ComparisonRow
              label="Packed kg / active minute"
              current={rate(before, before?.packedKg)}
              proposed={rate(after, after.packedKg)}
            />
            <ComparisonRow
              label="Shipped kg / active minute"
              current={rate(before, before?.shippedKg)}
              proposed={rate(after, after.shippedKg)}
            />
            <ComparisonRow
              label="Vehicle metres / active minute"
              current={rate(before, before?.vehicleMetres)}
              proposed={rate(after, after.vehicleMetres)}
            />
            <ComparisonRow
              label="Completed vehicle unloads"
              current={before?.completedUnloads ?? NaN}
              proposed={after.completedUnloads}
            />
          </tbody>
        </table>
      </div>
      {before && (
        <p className="mt-2 text-sm text-amber-200">
          {matched
            ? 'Recorded operating controls match. Stock, traffic and truck timing can still affect results; this is an observed comparison.'
            : 'Operating controls changed or measurement is pending. These windows do not establish a layout-only production gain.'}
        </p>
      )}
    </section>
  );
}
