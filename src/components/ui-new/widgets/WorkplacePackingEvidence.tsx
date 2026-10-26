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
import { STANDARD_GAME_SPEED } from '../../../simulation/pace';
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
import { displayEventDetail } from '../../../simulation/bilateralWorkplace';
import { formatFixed, translate, useT } from '../../../i18n';
import { workplacePackingEvidenceMessages } from './WorkplacePackingEvidence.messages';

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
  const t = useT(workplacePackingEvidenceMessages);
  const store = useWorkplaceControls();
  const [selectedActor, setActor] = useState('quality');
  const actor =
    store.participationMode === 'separate-turns' ? (store.turn?.actorId ?? '') : selectedActor;
  const separateTurns = store.participationMode === 'separate-turns';
  const selected = HANDOFF_EPISODES.find((e) => e.id === state.improvement?.episode?.id);
  // Paused owner changes can invalidate a retained stock claim without changing
  // workplace state. Observe the same direct facts as the matched rehearsal.
  useMaterialFlowStore();
  useOperationsCampaignStore();
  useProductionStore();
  useQCLabStore();
  useTruckScheduleStore();
  useGameSimulationStore((s) => s.gameSpeed);
  const advice = state.improvement?.advice;
  const outcome = improvementEpisodeOutcome(
    state,
    advice &&
      !advice.reasonToAbstain &&
      advice.fingerprint === captureCurrentPackingPlant(state).fingerprint
      ? advice.evidence.releasedPackedKg
      : null
  );
  return (
    <section aria-label={t('handoffLabel')} className="space-y-3 border-b border-slate-700 pb-4">
      <h5 className="font-semibold text-white">{t('handoffHeading')}</h5>
      <p className="text-xs text-slate-300">{t('handoffIntro')}</p>
      <label className="block">
        {t('pressureEpisode')}
        <select
          aria-label={t('pressureEpisode')}
          disabled={separateTurns && !!store.turn}
          className={input}
          value={selected?.id ?? ''}
          onChange={(e) =>
            report(
              store.setImprovementEpisode((e.target.value || null) as ImprovementEpisodeId | null)
            )
          }
        >
          <option value="">{t('ordinaryHandoff')}</option>
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
            {t('responseAuthor')}
            <select
              aria-label={t('responseAuthor')}
              disabled={separateTurns}
              className={input}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            >
              <option value="" disabled>
                {t('beginMemberTurn')}
              </option>
              {actor === 'mind' && (
                <option value="mind" disabled>
                  {t('adviserNoResponse')}
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
          <p className="text-xs text-slate-300">{t('actInPlant')}</p>
        </>
      )}
    </section>
  );
}

export function FrozenPackingAdvice({ advice }: { advice: PackingAdvice }) {
  const t = useT(workplacePackingEvidenceMessages);
  const e = advice.evidence;
  const inspections = packingInspectionPrompts(advice);
  return (
    <div className="space-y-2" aria-label={t('evidenceLabel')}>
      <p className="font-medium text-white">
        {advice.reasonToAbstain ? t('adviserAbstains') : t('conditionalBounds')}
      </p>
      {advice.reasonToAbstain ? (
        <p className="text-amber-100">{t('abstainReason', { reason: advice.reasonToAbstain })}</p>
      ) : (
        <>
          <p className="tabular-nums">
            {t('modeledPacking', {
              low: formatFixed(advice.packedLowKg, 0),
              high: formatFixed(advice.packedHighKg, 0),
              material:
                e.finishedMaterial === 'flour'
                  ? t('materialFlour')
                  : e.finishedMaterial === 'semolina'
                    ? t('materialSemolina')
                    : '',
              upper: formatFixed(advice.dispatchUpperKg, 0),
            })}
          </p>
          <p className="text-xs text-slate-300">{t('scenarioBounds')}</p>
        </>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          {t('factsSummary')}
        </summary>
        {advice.reasonToAbstain ? (
          <p className="text-xs text-slate-300">{t('factsUnavailable')}</p>
        ) : (
          <dl className="space-y-1 text-xs tabular-nums">
            <div>
              <dt className="inline text-slate-300">{t('orderAndRecipe')}</dt>
              <dd className="inline">
                {t('orderRecipeValue', {
                  order: e.orderId ?? t('unknown'),
                  recipe: e.recipeId ?? t('unknown'),
                  remaining:
                    e.remainingOrderKg === null
                      ? t('unknown')
                      : t('kg', { value: formatFixed(e.remainingOrderKg, 0) }),
                })}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">{t('materialClock')}</dt>
              <dd className="inline">
                {t('secondsValue', { value: formatFixed(e.materialClockSeconds, 2) })}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-300">{t('intendedPace')}</dt>
              <dd className="inline">
                {t('paceValue', {
                  speed: formatFixed(e.gameSpeed / STANDARD_GAME_SPEED, 1),
                  seconds: formatFixed(advice.physicalSeconds, 1),
                })}
              </dd>
            </div>
          </dl>
        )}
        <div role="group" aria-label={t('inspectTogether')} className="space-y-3 pt-2">
          <p className="text-xs text-slate-300">{t('frozenFacts')}</p>
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
          {t('inputReceipt', { fingerprint: advice.fingerprint, session: e.materialSessionId })}
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
  const t = useT(workplacePackingEvidenceMessages);
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
    { id: 'override', label: t('qualityOverride') },
    { id: 'held', label: t('qualityHeld') },
    { id: 'unsure', label: t('qualityUnsure') },
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
        reason: translate(workplacePackingEvidenceMessages, 'pauseFirst'),
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
          reason: translate(workplacePackingEvidenceMessages, 'inputsChangedDuring'),
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
        reason: translate(workplacePackingEvidenceMessages, 'rehearsalFailed'),
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
        reason: translate(workplacePackingEvidenceMessages, 'qualityFailed'),
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
        {t('compareSummary')}
      </summary>
      <p className="text-xs text-slate-300">{t('isolatedCopies')}</p>
      <label className="block space-y-1">
        <span className="font-medium text-white">{t('packingPrediction')}</span>
        <select
          ref={predictionRef}
          aria-label={t('packingPrediction')}
          className={input}
          value={prediction}
          disabled={running || result !== null}
          onChange={(event) => setPrediction(event.target.value as PackingPrediction | '')}
        >
          <option value="">{t('discussFirst')}</option>
          {PACKING_PREDICTIONS.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-300">{t('compareIdeas')}</p>
      <button
        type="button"
        className={button}
        disabled={running || qualityRunning}
        onClick={() => void run()}
      >
        {running ? t('rehearsingPacking') : t('runRehearsal')}
      </button>
      {result && (
        <>
          <p className="break-all text-xs text-slate-300">
            {t('matchedInput', { fingerprint: result.fingerprint })}
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
            {t('checkFreshness')}
          </button>
          {outdated || pace !== 0 ? (
            <p role="status" className="text-amber-100">
              {t('staleComparison')}
            </p>
          ) : (
            <div aria-label={t('resultsLabel')} className="space-y-2">
              {result.arms.map((a) => (
                <p
                  key={a.arrangement}
                  className="border-t border-slate-800 pt-2 text-xs tabular-nums"
                >
                  <strong className="text-white">
                    {a.arrangement === 'steady'
                      ? t('arrangementSteady')
                      : a.arrangement === 'briefing'
                        ? t('arrangementBriefing')
                        : t('arrangementBuffer')}
                  </strong>
                  :{' '}
                  {a.reasonToAbstain
                    ? t('armAbstained', { reason: a.reasonToAbstain })
                    : t('armRange', {
                        low: formatFixed(a.packedLowKg, 0),
                        high: formatFixed(a.packedHighKg, 0),
                        upper: formatFixed(a.dispatchUpperKg, 0),
                      })}
                </p>
              ))}
              <details className="space-y-3 border-t border-slate-700 pt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
                  {t('firstPackingSummary')}
                </summary>
                <p className="text-xs text-slate-300">{t('firstPackingExplain')}</p>
                {result.firstPacking.length ? (
                  <div role="group" aria-label={t('timingLabel')} className="space-y-3">
                    <dl className="space-y-3 text-xs tabular-nums">
                      {result.firstPacking.map((observation) => (
                        <div key={observation.arrangement}>
                          <dt className="font-semibold text-white">
                            {observation.arrangement === 'steady'
                              ? t('arrangementSteady')
                              : observation.arrangement === 'briefing'
                                ? t('arrangementBriefing')
                                : t('arrangementBuffer')}
                          </dt>
                          <dd className="text-slate-300">
                            {t('coarseSteps', {
                              value:
                                observation.coarseFirstMinute === null
                                  ? t('noPackingObserved')
                                  : t('minutesValue', {
                                      value: formatFixed(observation.coarseFirstMinute, 2),
                                    }),
                            })}
                          </dd>
                          <dd className="text-slate-300">
                            {t('fineSteps', {
                              value:
                                observation.fineFirstMinute === null
                                  ? t('noPackingObserved')
                                  : t('minutesValue', {
                                      value: formatFixed(observation.fineFirstMinute, 2),
                                    }),
                            })}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs text-slate-300">{t('briefingRetains')}</p>
                    <p className="text-cyan-100">{t('timingQuestion')}</p>
                  </div>
                ) : (
                  <p className="text-xs text-amber-100">{t('timingUnavailable')}</p>
                )}
              </details>
              <details className="space-y-2 border-t border-slate-700 pt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
                  {t('releaseSummary')}
                </summary>
                <p className="text-xs text-slate-300">{t('assumeWithheld')}</p>
                <label className="block space-y-1">
                  <span className="font-medium text-white">{t('qualityPrediction')}</span>
                  <select
                    ref={qualityPredictionRef}
                    aria-label={t('qualityPrediction')}
                    className={input}
                    value={qualityPrediction}
                    disabled={qualityRunning || qualityResult !== null}
                    onChange={(event) => setQualityPrediction(event.target.value)}
                  >
                    <option value="">{t('discussQuality')}</option>
                    {qualityChoices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                {result.arms.some((arm) => arm.reasonToAbstain) && (
                  <p className="text-xs text-amber-100">{t('resolveMissing')}</p>
                )}
                <button
                  type="button"
                  className={button}
                  disabled={
                    running || qualityRunning || result.arms.some((arm) => !!arm.reasonToAbstain)
                  }
                  onClick={() => void rehearseQuality()}
                >
                  {qualityRunning ? t('rehearsingWithheld') : t('rehearseWithheld')}
                </button>
                {qualityResult && (
                  <section aria-label={t('qualityResultsLabel')} className="space-y-2">
                    <h5 className="font-semibold text-white">{t('differentQuestions')}</h5>
                    <p className="text-xs">
                      {t('recordedIdea', {
                        idea:
                          qualityChoices.find((choice) => choice.id === retainedQualityPrediction)
                            ?.label ?? t('noneRecorded'),
                      })}
                    </p>
                    {qualityResult.reasonToAbstain ? (
                      <p className="text-amber-100">
                        {t('keepOpen', { reason: qualityResult.reasonToAbstain })}
                      </p>
                    ) : (
                      <>
                        {qualityResult.arms.map((arm) => (
                          <p key={arm.arrangement} className="text-xs tabular-nums">
                            {t('withheldArm', {
                              arrangement:
                                arm.arrangement === 'steady'
                                  ? t('arrangementSteady')
                                  : arm.arrangement === 'briefing'
                                    ? t('arrangementBriefing')
                                    : t('arrangementBuffer'),
                              low: formatFixed(arm.packedLowKg, 0),
                              high: formatFixed(arm.packedHighKg, 0),
                              lower: formatFixed(arm.dispatchLowerKg, 0),
                              upper: formatFixed(arm.dispatchUpperKg, 0),
                            })}
                          </p>
                        ))}
                        {qualityResult.releaseAtCapture === false && (
                          <p className="text-xs text-slate-300">{t('alreadyHeld')}</p>
                        )}
                        {result.arms.every((arm) => arm.dispatchUpperKg === 0) && (
                          <p className="text-xs text-slate-300">{t('alreadyZero')}</p>
                        )}
                        <p className="text-cyan-100">{t('independentEvidence')}</p>
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
                      {t('resetQuality')}
                    </button>
                  </section>
                )}
              </details>
              {learning && (
                <section
                  aria-label={t('reviewLabel')}
                  className="space-y-2 border-t border-slate-700 pt-3"
                >
                  <h5 className="font-semibold text-white">{t('rehearsalShowed')}</h5>
                  <p>
                    {t('ourPrediction', {
                      prediction:
                        PACKING_PREDICTIONS.find((choice) => choice.id === retainedPrediction)
                          ?.label ?? t('noneRecorded'),
                    })}
                  </p>
                  <p>{learning.evidence}</p>
                  {learning.reflection && <p>{learning.reflection}</p>}
                  <p className="text-cyan-100">{learning.question}</p>
                  <p className="text-xs text-slate-300">{t('moreStock')}</p>
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
            {t('anotherPrediction')}
          </button>
        </>
      )}
    </details>
  );
}

export function HandoffConduct({ state }: { state: WorkplaceState }) {
  const t = useT(workplacePackingEvidenceMessages);
  const conduct = improvementConduct(state);
  return (
    <section aria-label={t('conductLabel')} className="space-y-2 border-t border-slate-700 pt-4">
      <h5 className="font-semibold text-white">{t('treatEachOther')}</h5>
      <p>
        {t('challenges', {
          count: conduct.challenges,
          countText: formatFixed(conduct.challenges, 0),
        })}{' '}
        {t('adviceUpdates', { count: formatFixed(conduct.adviceChanges, 0) })}{' '}
        {t('declined', {
          count: conduct.declined.length,
          countText: formatFixed(conduct.declined.length, 0),
        })}
      </p>
      <p className="text-xs text-slate-300">{t('declinedNoPermission')}</p>
      {conduct.roles.map((m) => (
        <p key={m.id} className="text-xs tabular-nums">
          <strong className="text-white">{m.role}</strong>
          {t('roleLedger', {
            pay: formatFixed(m.earnedPay, 2),
            rest: formatFixed(m.restMinutes, 1),
            extra: formatFixed(m.extraMinutes, 1),
            compensation: formatFixed(m.compensationPaid, 2),
            recovery: formatFixed(m.recoveryMinutes, 1),
            owed: formatFixed(m.recoveryOwedMinutes, 1),
          })}
        </p>
      ))}
      <p className={conduct.openObjections.length ? 'text-amber-100' : 'text-slate-300'}>
        {t('objections', {
          count: conduct.openObjections.length,
          countText: formatFixed(conduct.openObjections.length, 0),
        })}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-cyan-100">
          {t('receiptsSummary')}
        </summary>
        <ol className="space-y-2 text-xs text-slate-300">
          {conduct.receipts.map((e) => (
            <li key={e.id}>
              {t('receipt', {
                minute: formatFixed(e.minute, 1),
                actor: e.actorId,
                detail: displayEventDetail(e.detail),
              })}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
