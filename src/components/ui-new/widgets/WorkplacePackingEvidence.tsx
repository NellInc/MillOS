import { useRef, useState } from 'react';
import { useCameraStore, CAMERA_PRESETS } from '../../CameraController';
import type {
  WorkplaceState,
  WorkplaceTransitionResult,
  ImprovementEpisodeId,
  ImprovementEpisodeChoice,
} from '../../../types/workplace';
import type { PackingAdvice, PackingRehearsals } from '../../../types/workplaceAdvice';
import {
  captureCurrentPackingPlant,
  useWorkplaceStore,
  useWorkplaceControls,
} from '../../../stores/workplaceStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../../stores/truckScheduleStore';
import {
  runPackingRehearsals,
  rehearseWithheldDispatch,
  packingInspectionPrompts,
  PACKING_PREDICTIONS,
  packingPredictionReview,
  type PackingPrediction,
} from '../../../simulation/workplaceAdvice';
import {
  HANDOFF_EPISODES,
  HANDOFF_EPISODE_CHOICES,
  improvementEpisodeOutcome,
  improvementConduct,
} from '../../../simulation/workplaceImprovement';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';

export function HandoffEpisodes({
  state,
  report,
}: {
  state: WorkplaceState;
  report: (result: WorkplaceTransitionResult) => void;
}) {
  const store = useWorkplaceControls();
  const [selectedActor, setActor] = useState('quality');
  const actor =
    store.participationMode === 'separate-turns' ? (store.turn?.actorId ?? '') : selectedActor;
  const separateTurns = store.participationMode === 'separate-turns';
  const selected = HANDOFF_EPISODES.find((e) => e.id === state.improvement?.episode?.id);
  const outcome = improvementEpisodeOutcome(
    state,
    state.improvement?.advice && !state.improvement.advice.reasonToAbstain
      ? state.improvement.advice.evidence.releasedPackedKg
      : null
  );
  return (
    <section
      aria-label="Handoff pressure rehearsals"
      className="space-y-3 border-b border-slate-700 pb-4"
    >
      <h5 className="font-semibold text-white">Try an agreement under pressure</h5>
      <p className="text-xs text-slate-300">
        Optional planning episodes. Their assumptions leave live trucks, stock, quality, cash and
        customer commitments unchanged.
      </p>
      <label className="block">
        Pressure episode
        <select
          aria-label="Pressure episode"
          disabled={separateTurns && !!store.turn}
          className={input}
          value={selected?.id ?? ''}
          onChange={(e) =>
            report(
              store.setImprovementEpisode((e.target.value || null) as ImprovementEpisodeId | null)
            )
          }
        >
          <option value="">Ordinary handoff</option>
          {HANDOFF_EPISODES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p>{selected.premise}</p>
          <p className="text-cyan-100">{selected.recommendation}</p>
          <label className="block">
            Rehearsal response author
            <select
              aria-label="Rehearsal response author"
              disabled={separateTurns}
              className={input}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              <option value="" disabled>
                Begin a member turn
              </option>
              {actor === 'mind' && (
                <option value="mind" disabled>
                  Adviser, no member response
                </option>
              )}
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {HANDOFF_EPISODE_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={button}
                aria-pressed={state.improvement?.episode?.choice === choice.id}
                disabled={!state.members.some((member) => member.id === actor)}
                onClick={() =>
                  report(
                    store.respondImprovementEpisode(actor, choice.id as ImprovementEpisodeChoice)
                  )
                }
              >
                {choice.label}
              </button>
            ))}
          </div>
          {outcome && (
            <p role="status" className="text-cyan-100">
              {outcome}
            </p>
          )}
          <p className="text-xs text-slate-300">
            To act in the plant, choose the real proposal below and make fresh role decisions. This
            rehearsal records no live permission.
          </p>
        </>
      )}
    </section>
  );
}

export function FrozenPackingAdvice({ advice }: { advice: PackingAdvice }) {
  const e = advice.evidence;
  const inspections = packingInspectionPrompts(advice);
  return (
    <div className="space-y-2" aria-label="Plant-grounded adviser evidence">
      <p className="font-medium text-white">
        {advice.reasonToAbstain
          ? 'The adviser abstains from a forecast'
          : 'Conditional packing and departure bounds'}
      </p>
      {advice.reasonToAbstain ? (
        <p className="text-amber-100">{advice.reasonToAbstain} Unknown evidence remains unknown.</p>
      ) : (
        <>
          <p className="tabular-nums">
            Additional modeled packing: {advice.packedLowKg.toFixed(0)} to{' '}
            {advice.packedHighKg.toFixed(0)} kg of {e.finishedMaterial}. Conditional departure: 0 to{' '}
            {advice.dispatchUpperKg.toFixed(0)} kg.
          </p>
          <p className="text-xs text-slate-300">
            These are scenario bounds. No departure is simulated or guaranteed. Held stock supplies
            no eligible dispatch.
          </p>
        </>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          Known facts, age and assumptions
        </summary>
        {advice.reasonToAbstain ? (
          <p className="text-xs text-slate-300">
            Numeric plant facts are unavailable for this forecast. Resolve the missing evidence
            above, then hear a fresh response before deciding.
          </p>
        ) : (
          <dl className="space-y-1 text-xs tabular-nums">
            <div>
              <dt className="inline text-slate-300">Order and recipe: </dt>
              <dd className="inline">
                {e.orderId ?? 'unknown'}; {e.recipeId ?? 'unknown'}. Remaining{' '}
                {e.remainingOrderKg === null ? 'unknown' : `${e.remainingOrderKg.toFixed(0)} kg`}.
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">Captured material clock: </dt>
              <dd className="inline">{e.materialClockSeconds.toFixed(2)} seconds.</dd>
            </div>
            <div>
              <dt className="inline text-slate-300">Intended pace: </dt>
              <dd className="inline">
                {e.gameSpeed}×, 90 workplace minutes in {advice.physicalSeconds.toFixed(1)} physical
                seconds.
              </dd>
            </div>
          </dl>
        )}
        <div role="group" aria-label="Inspect evidence together" className="space-y-3 pt-2">
          <p className="text-xs text-slate-300">
            Facts are frozen at the adviser’s capture. These views inspect the current plant;
            changed facts need a fresh adviser response before another agreement. Looking records no
            understanding, ballot or permission.
          </p>
          {inspections.map((item) => (
            <div key={item.role} className="space-y-2 border-t border-slate-800 pt-3">
              <h6 className="font-semibold text-white">{item.role}</h6>
              <p className="text-xs tabular-nums text-slate-300">{item.fact}</p>
              <p className="text-xs text-slate-300">{item.question}</p>
              <button
                type="button"
                className={button}
                onClick={() =>
                  useCameraStore
                    .getState()
                    .setPreset(CAMERA_PRESETS.findIndex((preset) => preset.name === item.view))
                }
              >
                {item.action}
              </button>
            </div>
          ))}
        </div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-300">
          {advice.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-2 break-all text-xs text-slate-300">
          Input receipt: {advice.fingerprint}; material session {e.materialSessionId}.
        </p>
      </details>
    </div>
  );
}

export function MatchedPackingRehearsal({
  state,
  report,
}: {
  state: WorkplaceState;
  report: (result: WorkplaceTransitionResult) => void;
}) {
  const [result, setResult] = useState<PackingRehearsals | null>(null);
  const [prediction, setPrediction] = useState<PackingPrediction | ''>('');
  const [retainedPrediction, setRetainedPrediction] = useState<PackingPrediction | null>(null);
  const predictionRef = useRef<HTMLSelectElement>(null);
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [qualityPrediction, setQualityPrediction] = useState('');
  const [retainedQualityPrediction, setRetainedQualityPrediction] = useState('');
  const [qualityResult, setQualityResult] = useState<ReturnType<
    typeof rehearseWithheldDispatch
  > | null>(null);
  const [qualityRunning, setQualityRunning] = useState(false);
  const qualityPredictionRef = useRef<HTMLSelectElement>(null);
  const qualityChoices = [
    { id: 'override', label: 'Higher pacing can replace the withheld release' },
    { id: 'held', label: 'Departure remains blocked at every pace' },
    { id: 'unsure', label: 'We are unsure, compare the boundaries' },
  ];
  // These selectors observe changes while the comparison is open. They grant
  // no plant authority, and the model is only run after an explicit click.
  const pace = useGameSimulationStore((s) => s.gameSpeed);
  // Capture hashes all material data and reads direct order, incident, quality,
  // setpoint and dock facts. Observe each owner while a result is displayed so
  // paused changes cannot leave a comparison looking current. Stable snapshot
  // getters also catch an owner update before the result's passive effects.
  // Hashing still short-circuits without a result; the model stays click-only.
  useMaterialFlowStore();
  useOperationsCampaignStore();
  useProductionStore();
  useQCLabStore();
  useTruckScheduleStore();
  const outdated =
    stale || (!!result && captureCurrentPackingPlant(state).fingerprint !== result.fingerprint);
  const run = async () => {
    if (useGameSimulationStore.getState().gameSpeed !== 0) {
      report({
        changed: false,
        reason: 'Pause the plant before capturing matched packing inputs.',
      });
      return;
    }
    const committedPrediction = prediction || null;
    setQualityResult(null);
    setQualityPrediction('');
    setRetainedQualityPrediction('');
    setRunning(true);
    try {
      // Let the loading state paint before the bounded synchronous local model.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const current = useWorkplaceStore.getState().workplace;
      const capture = captureCurrentPackingPlant(current);
      const matched = runPackingRehearsals(capture);
      if (
        captureCurrentPackingPlant(useWorkplaceStore.getState().workplace).fingerprint !==
        matched.fingerprint
      ) {
        setStale(true);
        setResult(null);
        report({
          changed: false,
          reason: 'Plant inputs changed during rehearsal. Pause and capture again.',
        });
      } else {
        setResult(matched);
        setRetainedPrediction(committedPrediction);
        setStale(false);
      }
    } catch {
      setResult(null);
      report({
        changed: false,
        reason: 'The local packing rehearsal could not complete. No live plant state was changed.',
      });
    } finally {
      setRunning(false);
    }
  };
  const rehearseQuality = async () => {
    if (
      !result ||
      useGameSimulationStore.getState().gameSpeed !== 0 ||
      captureCurrentPackingPlant(useWorkplaceStore.getState().workplace).fingerprint !==
        result.fingerprint
    ) {
      setStale(true);
      return;
    }
    const selected = qualityPrediction;
    setQualityRunning(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const capture = captureCurrentPackingPlant(useWorkplaceStore.getState().workplace);
      const held = rehearseWithheldDispatch(capture);
      if (
        capture.fingerprint !== result.fingerprint ||
        captureCurrentPackingPlant(useWorkplaceStore.getState().workplace).fingerprint !==
          result.fingerprint ||
        useGameSimulationStore.getState().gameSpeed !== 0
      ) {
        setStale(true);
        setQualityResult(null);
      } else {
        setRetainedQualityPrediction(selected);
        setQualityResult(held);
      }
    } catch {
      setQualityResult(null);
      report({
        changed: false,
        reason: 'The quality-boundary rehearsal could not complete. No live state changed.',
      });
    } finally {
      setQualityRunning(false);
    }
  };
  const learning = result ? packingPredictionReview(result, retainedPrediction) : null;
  if (state.mode !== 'game') return null;
  return (
    <details className="space-y-2">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
        Compare matched packing alternatives
      </summary>
      <p className="text-xs text-slate-300">
        Three isolated copies of one plant input, using the real flow engine. No live inventory,
        shipping receipt, pay, customer credit or consent is changed. Pressure episodes remain
        separate planning assumptions.
      </p>
      <label className="block space-y-1">
        <span className="font-medium text-white">Our packing prediction (optional)</span>
        <select
          ref={predictionRef}
          aria-label="Our packing prediction (optional)"
          className={input}
          value={prediction}
          disabled={running || result !== null}
          onChange={(event) => setPrediction(event.target.value as PackingPrediction | '')}
        >
          <option value="">Discuss before revealing the ranges</option>
          {PACKING_PREDICTIONS.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-300">
        Compare ideas first and keep any disagreements. This optional prediction stays in this open
        comparison; it records no role ballot or permission.
      </p>
      <button
        type="button"
        className={button}
        disabled={running || qualityRunning}
        onClick={() => void run()}
      >
        {running ? 'Rehearsing packing…' : 'Run matched packing rehearsal'}
      </button>
      {result && (
        <>
          <p className="break-all text-xs text-slate-300">
            Matched input: {result.fingerprint}. Fixed machinery and dispositions; no collection,
            wear or maintenance simulation.
          </p>
          <button
            type="button"
            className={button}
            onClick={() =>
              setStale(
                captureCurrentPackingPlant(useWorkplaceStore.getState().workplace).fingerprint !==
                  result.fingerprint
              )
            }
          >
            Check rehearsal freshness
          </button>
          {outdated || pace !== 0 ? (
            <p role="status" className="text-amber-100">
              Inputs changed. This comparison is stale; capture again before using it.
            </p>
          ) : (
            <div aria-label="Matched packing results" className="space-y-2">
              {result.arms.map((a) => (
                <p
                  key={a.arrangement}
                  className="border-t border-slate-800 pt-2 text-xs tabular-nums"
                >
                  <strong className="text-white">
                    {a.arrangement === 'steady'
                      ? 'Ordinary work'
                      : a.arrangement === 'briefing'
                        ? 'Paid briefing'
                        : 'Buffer pacing'}
                  </strong>
                  :{' '}
                  {a.reasonToAbstain
                    ? `abstained, ${a.reasonToAbstain}`
                    : `${a.packedLowKg.toFixed(0)} to ${a.packedHighKg.toFixed(0)} kg additionally packed; conditional departure 0 to ${a.dispatchUpperKg.toFixed(0)} kg.`}
                </p>
              ))}
              <details className="space-y-3 border-t border-slate-700 pt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
                  When did packing first appear?
                </summary>
                <p className="text-xs text-slate-300">
                  Each value marks the completed simulation tick that first recorded additional
                  packed stock. These are workplace minutes from the same captured start. Discrete
                  samples can differ with the physical step size.
                </p>
                {result.firstPacking.length ? (
                  <div role="group" aria-label="Packing time observations" className="space-y-3">
                    <dl className="space-y-3 text-xs tabular-nums">
                      {result.firstPacking.map((observation) => (
                        <div key={observation.arrangement}>
                          <dt className="font-semibold text-white">
                            {observation.arrangement === 'steady'
                              ? 'Ordinary work'
                              : observation.arrangement === 'briefing'
                                ? 'Paid briefing'
                                : 'Buffer pacing'}
                          </dt>
                          <dd className="text-slate-300">
                            0.5-second steps:{' '}
                            {observation.coarseFirstMinute === null
                              ? 'no additional packing observed'
                              : `${observation.coarseFirstMinute.toFixed(2)} min`}
                            .
                          </dd>
                          <dd className="text-slate-300">
                            0.25-second steps:{' '}
                            {observation.fineFirstMinute === null
                              ? 'no additional packing observed'
                              : `${observation.fineFirstMinute.toFixed(2)} min`}
                            .
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs text-slate-300">
                      The briefing retains its five paid minutes of pacing hold. Compare the sample
                      times with the 90-minute totals above; an earlier first sample supplies no
                      collection receipt.
                    </p>
                    <p className="text-cyan-100">
                      If the final totals match, which timing difference would you investigate
                      together before changing the handoff?
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-100">
                    Timing is unavailable for this comparison. Resolve the missing facts or model
                    warning above before interpreting it.
                  </p>
                )}
              </details>
              <details className="space-y-2 border-t border-slate-700 pt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
                  Can pacing replace a release?
                </summary>
                <p className="text-xs text-slate-300">
                  Assume dispatch release is withheld in isolated copies of these same inputs. The
                  real flow engine still models packing; source and batch dispositions stay
                  unchanged. This creates no live hold, release or departure.
                </p>
                <label className="block space-y-1">
                  <span className="font-medium text-white">Our quality prediction (optional)</span>
                  <select
                    ref={qualityPredictionRef}
                    aria-label="Our quality prediction (optional)"
                    className={input}
                    value={qualityPrediction}
                    disabled={qualityRunning || qualityResult !== null}
                    onChange={(event) => setQualityPrediction(event.target.value)}
                  >
                    <option value="">Discuss with Quality and the coordinator</option>
                    {qualityChoices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                {result.arms.some((arm) => arm.reasonToAbstain) && (
                  <p className="text-xs text-amber-100">
                    Resolve missing captured facts before this exercise. Unknown inputs cannot
                    establish a zero-output result.
                  </p>
                )}
                <button
                  type="button"
                  className={button}
                  disabled={
                    running || qualityRunning || result.arms.some((arm) => !!arm.reasonToAbstain)
                  }
                  onClick={() => void rehearseQuality()}
                >
                  {qualityRunning
                    ? 'Rehearsing withheld release…'
                    : 'Rehearse withheld dispatch release'}
                </button>
                {qualityResult && (
                  <section aria-label="Quality boundary results" className="space-y-2">
                    <h5 className="font-semibold text-white">
                      Packing and permission answer different questions
                    </h5>
                    <p className="text-xs">
                      Recorded idea:{' '}
                      {qualityChoices.find((choice) => choice.id === retainedQualityPrediction)
                        ?.label ?? 'none recorded for this run'}
                      .
                    </p>
                    {qualityResult.reasonToAbstain ? (
                      <p className="text-amber-100">
                        {qualityResult.reasonToAbstain} Keep the question open.
                      </p>
                    ) : (
                      <>
                        {qualityResult.arms.map((arm) => (
                          <p key={arm.arrangement} className="text-xs tabular-nums">
                            {arm.arrangement === 'steady'
                              ? 'Ordinary work'
                              : arm.arrangement === 'briefing'
                                ? 'Paid briefing'
                                : 'Buffer pacing'}{' '}
                            with withheld release: {arm.packedLowKg.toFixed(0)} to{' '}
                            {arm.packedHighKg.toFixed(0)} kg additionally packed; conditional
                            departure {arm.dispatchLowerKg.toFixed(0)} to{' '}
                            {arm.dispatchUpperKg.toFixed(0)} kg.
                          </p>
                        ))}
                        {qualityResult.releaseAtCapture === false && (
                          <p className="text-xs text-slate-300">
                            Release was already held in the captured facts. This rehearsal grants no
                            new permission.
                          </p>
                        )}
                        {result.arms.every((arm) => arm.dispatchUpperKg === 0) && (
                          <p className="text-xs text-slate-300">
                            The original departure bounds were already zero. This comparison cannot
                            attribute that original zero to quality alone.
                          </p>
                        )}
                        <p className="text-cyan-100">
                          Which independent evidence would Quality and the coordinator need before
                          an actual departure? More packing supplies no missing release or
                          collection receipt.
                        </p>
                      </>
                    )}
                    <button
                      type="button"
                      className={button}
                      disabled={qualityRunning}
                      onClick={() => {
                        setQualityResult(null);
                        setQualityPrediction('');
                        setRetainedQualityPrediction('');
                        requestAnimationFrame(() => qualityPredictionRef.current?.focus());
                      }}
                    >
                      Reset quality prediction
                    </button>
                  </section>
                )}
              </details>
              {learning && (
                <section
                  aria-label="Packing prediction review"
                  className="space-y-2 border-t border-slate-700 pt-3"
                >
                  <h5 className="font-semibold text-white">What did the rehearsal show?</h5>
                  <p>
                    Our prediction:{' '}
                    {PACKING_PREDICTIONS.find((choice) => choice.id === retainedPrediction)
                      ?.label ?? 'none recorded for this run'}
                    .
                  </p>
                  <p>{learning.evidence}</p>
                  {learning.reflection && <p>{learning.reflection}</p>}
                  <p className="text-cyan-100">{learning.question}</p>
                  <p className="text-xs text-slate-300">
                    More packed stock does not establish a truck departure. Collection, qualified
                    release and actual dispatch receipts still need their own evidence.
                  </p>
                </section>
              )}
            </div>
          )}
          <button
            type="button"
            className={button}
            disabled={running || qualityRunning}
            onClick={() => {
              setQualityResult(null);
              setQualityPrediction('');
              setRetainedQualityPrediction('');
              setResult(null);
              setRetainedPrediction(null);
              setPrediction('');
              setStale(false);
              requestAnimationFrame(() => predictionRef.current?.focus());
            }}
          >
            Prepare another prediction
          </button>
        </>
      )}
    </details>
  );
}

export function HandoffConduct({ state }: { state: WorkplaceState }) {
  const conduct = improvementConduct(state);
  return (
    <section
      aria-label="Handoff conduct debrief"
      className="space-y-2 border-t border-slate-700 pt-4"
    >
      <h5 className="font-semibold text-white">How did we treat each other?</h5>
      <p>
        {conduct.challenges} public {conduct.challenges === 1 ? 'challenge' : 'challenges'};{' '}
        {conduct.adviceChanges} evidence-driven advice updates.{' '}
        {conduct.declined.length
          ? `${conduct.declined.length} ${conduct.declined.length === 1 ? 'role' : 'roles'} recorded a declined policy ballot without a pay penalty.`
          : 'No declined policy ballot was recorded.'}
      </p>
      <p className="text-xs text-slate-300">
        A declined policy ballot grants no extra-duty permission. Coordinated or majority ordinary
        work can proceed under the selected governance rule. Private explanations stay optional.
      </p>
      {conduct.roles.map((m) => (
        <p key={m.id} className="text-xs tabular-nums">
          <strong className="text-white">{m.role}</strong>: earned {m.earnedPay.toFixed(2)} credits;
          rest {m.restMinutes.toFixed(1)} min; extra duty {m.extraMinutes.toFixed(1)} min;
          compensation paid {m.compensationPaid.toFixed(2)}; recovery delivered{' '}
          {m.recoveryMinutes.toFixed(1)} min, owed {m.recoveryOwedMinutes.toFixed(1)} min.
        </p>
      ))}
      <p className={conduct.openObjections.length ? 'text-amber-100' : 'text-slate-300'}>
        {conduct.openObjections.length} unresolved{' '}
        {conduct.openObjections.length === 1 ? 'objection' : 'objections'}. Each remedy belongs to
        its original raiser; a promise supplies no delivered recovery.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          Public conduct receipts
        </summary>
        <ol className="space-y-2 text-xs text-slate-300">
          {conduct.receipts.map((e) => (
            <li key={e.id}>
              {e.minute.toFixed(1)} min, {e.actorId}: {e.detail}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
