import { useState } from 'react';
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
import { runPackingRehearsals } from '../../../simulation/workplaceAdvice';
import {
  HANDOFF_EPISODES,
  HANDOFF_EPISODE_CHOICES,
  improvementEpisodeOutcome,
  improvementConduct,
} from '../../../simulation/workplaceImprovement';

const button =
  'min-h-11 rounded-md border border-cyan-300/25 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'min-h-11 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';

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
              className={input}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
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
              <dt className="inline text-slate-300">Packed stock: </dt>
              <dd className="inline">
                {e.releasedPackedKg.toFixed(0)} kg released; {e.heldPackedKg.toFixed(0)} kg held or
                recalled.
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">Plant and quality: </dt>
              <dd className="inline">
                {e.processingMachines}/{e.totalMachines} machines processing; release{' '}
                {e.qualityRelease === null ? 'unknown' : e.qualityRelease ? 'open' : 'held'}.
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">Truck evidence: </dt>
              <dd className="inline">
                {e.truckStatus ?? 'unknown'};{' '}
                {e.truckLoadedKg === null ? 'unknown' : e.truckLoadedKg.toFixed(0)} kg loaded;{' '}
                {e.truckCapacityKg === null ? 'unknown' : e.truckCapacityKg.toFixed(0)} kg capacity.
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">Captured material clock: </dt>
              <dd className="inline">
                {e.materialClockSeconds.toFixed(2)} seconds. Frozen before agreement; later plant
                changes require a fresh response.
              </dd>
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
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
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
      <button type="button" className={button} disabled={running} onClick={() => void run()}>
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
            </div>
          )}
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
