import { useShallow } from 'zustand/react/shallow';
import {
  CheckCircle,
  Circle,
  Flame,
  Hammer,
  Moon,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Trophy,
  Wheat,
} from 'lucide-react';
import { CERTIFIER_NAME, standingOf } from '../../chronicle/certifier';
import { CROP_YEARS, CHRONICLE_SHIFTS } from '../../chronicle/cropYears';
import { DESKS } from '../../chronicle/desks';
import { cropWheatPenalty } from '../../chronicle/cropYears';
import { relievedCropKinds } from '../../chronicle/effects';
import {
  canAfford,
  currentForecastChance,
  eraBonusText,
  fundOf,
  FIRE_HAND_CLEAN_MINUTES,
  FIRE_SUPPRESSION_COST,
  FORCED_FUND_PER_KNOW_HOW,
  knowHowOf,
  nextEra,
  treatmentPrice,
  upkeepPerShift,
  type ChronicleState,
} from '../../chronicle/engine';
import {
  FRONT_HOLD_THRESHOLD,
  FRONTS,
  frontPreparation,
  frontSources,
  LONG_NIGHT_EVENT_ID,
  LONG_NIGHT_SHIFT,
} from '../../chronicle/longNight';
import { hasMark } from '../../chronicle/record';
import { FORECASTS } from '../../chronicle/forecasts';
import { knowHowEarned } from '../../chronicle/ledger';
import { eraById, eraKnowHowTarget } from '../../chronicle/plans';
import {
  nextMedalTarget,
  trialById,
  trialFraction,
  trialGoalConditions,
  trialGoalText,
} from '../../chronicle/trials';
import { EVENT_DECK } from '../../chronicle/eventDeck';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  BUTTON,
  BUTTON_PRIMARY,
  CHIP,
  CostTag,
  DeskAmount,
  FundAmount,
  KnowHowAmount,
  plural,
  ProgressBar,
  Section,
} from './shared';

export const OPEN_EVENT = 'millos:open-chronicle-event';

export function ChronicleOverview({ state }: { state: ChronicleState }) {
  const actions = useChronicleStore(
    useShallow((s) => ({
      suppress: s.suppress,
      answerShortfall: s.answerShortfall,
      acceptTraining: s.acceptTraining,
      restore: s.restore,
      treatCrop: s.treatCrop,
      mitigate: s.mitigate,
      setAusterity: s.setAusterity,
    }))
  );
  const incidents = useOperationsCampaignStore((s) => s.incidents);
  const campaign = useOperationsCampaignStore(
    useShallow((s) => ({
      acknowledgeIncident: s.acknowledgeIncident,
      mitigateIncident: s.mitigateIncident,
    }))
  );
  const era = eraById(state.era);
  const crop = state.crop ? CROP_YEARS[state.crop.kind] : null;
  const penalty = cropWheatPenalty(state.crop, relievedCropKinds(state.improvements));
  const treatCost = treatmentPrice(state);
  const owned = state.ownedIncidents
    .map((o) => incidents.find((i) => i.id === o.incidentId))
    .filter((i): i is NonNullable<typeof i> => !!i && i.phase !== 'resolved');
  const following = nextEra(state);
  const knowHowTarget = following
    ? eraKnowHowTarget(following, state.charter?.mode ?? 'historical')
    : 0;
  const installed = state.improvements.filter((p) => p.phase === 'installed').length;
  const earned = knowHowEarned(state.ledger);
  const passed = state.trials.filter((t) => t.phase === 'passed').length;
  const trial =
    state.trials.find((t) => t.phase === 'active') ??
    state.trials.find((t) => t.phase === 'telegraphed') ??
    null;

  return (
    <div className="space-y-3">
      <section aria-label="Chronicle status" className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Era</div>
          <div className="font-semibold text-white">{era.label}</div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Crop year {(state.crop?.index ?? 0) + 1}</div>
          <div className="flex items-center gap-1 font-semibold text-white">
            <Wheat className="h-4 w-4 text-amber-200" aria-hidden="true" />
            {crop?.label ?? 'None'}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Fund</div>
          <div className="font-semibold text-white">
            <FundAmount value={fundOf(state)} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Know-how</div>
          <div className="font-semibold text-white">
            <KnowHowAmount value={knowHowOf(state)} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Standing</div>
          <div className="flex items-center gap-1 font-semibold text-white">
            {state.certifier.suspended ? (
              <ShieldAlert className="h-4 w-4 text-rose-300" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            )}
            {state.certifier.suspended ? 'Suspended' : `${standingOf(state.certifier)} of 9`}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">Desks</div>
          <div className="flex items-center gap-2 font-semibold text-white">
            {DESKS.map(({ id }) => (
              <DeskAmount
                key={id}
                desk={id}
                value={state.desks[id].points}
                room={state.desks[id].room}
              />
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <div className="mb-1 flex justify-between text-[11px] text-slate-300">
            <span>
              Shift {Math.min(state.shift, CHRONICLE_SHIFTS)} of {CHRONICLE_SHIFTS}
            </span>
            <span className="inline-flex items-center gap-1">
              Upkeep <FundAmount value={upkeepPerShift(state)} />
            </span>
          </div>
          <ProgressBar value={state.shift / CHRONICLE_SHIFTS} label="Chronicle progress" />
        </div>
      </section>

      {state.fire.active && (
        <Section title="Duct fire">
          <p className="flex items-center gap-2 text-rose-200">
            <Flame className="h-4 w-4" aria-hidden="true" />
            {state.fire.suppressing ? 'Suppression under way' : 'Production stopped'}
          </p>
          {!state.fire.suppressing && (
            <div className="flex flex-wrap gap-2">
              <button
                className={BUTTON_PRIMARY}
                disabled={!canAfford(state, { fund: FIRE_SUPPRESSION_COST })}
                onClick={() => actions.suppress('suppress')}
              >
                Suppress and clean
                <CostTag state={state} cost={{ fund: FIRE_SUPPRESSION_COST }} />
              </button>
              <button className={BUTTON} onClick={() => actions.suppress('by_hand')}>
                Clean by hand, {FIRE_HAND_CLEAN_MINUTES} min
              </button>
            </div>
          )}
        </Section>
      )}

      {state.upkeepShortfall !== null && (
        <Section title="Lack of material">
          <p>
            Upkeep due <FundAmount value={state.upkeepShortfall} />
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} onClick={() => actions.answerShortfall('conserve')}>
              Conserve resources
            </button>
            <button
              className={BUTTON}
              disabled={
                knowHowOf(state) <
                Math.ceil(
                  Math.max(0, state.upkeepShortfall - Math.max(0, fundOf(state))) /
                    FORCED_FUND_PER_KNOW_HOW
                )
              }
              onClick={() => actions.answerShortfall('forced')}
            >
              Forced maintenance
              <CostTag
                state={state}
                cost={{
                  knowHow: Math.ceil(
                    Math.max(0, state.upkeepShortfall - Math.max(0, fundOf(state))) /
                      FORCED_FUND_PER_KNOW_HOW
                  ),
                }}
              />
            </button>
          </div>
        </Section>
      )}

      {state.trainingOffered && !state.trainingMode && (
        <Section title="Training mode">
          <button className={BUTTON} onClick={actions.acceptTraining}>
            Enable: costs -25%, forecasts -25%, score -2
          </button>
        </Section>
      )}

      {owned.length > 0 && (
        <Section title="Incidents raised by the chronicle">
          {owned.map((incident) => (
            <div key={incident.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {incident.title} <span className="text-xs text-slate-300">({incident.phase})</span>
              </span>
              {incident.phase === 'raised' ? (
                <button
                  className={BUTTON}
                  onClick={() => campaign.acknowledgeIncident(incident.id)}
                >
                  Acknowledge
                </button>
              ) : incident.phase === 'acknowledged' ? (
                <button className={BUTTON} onClick={() => campaign.mitigateIncident(incident.id)}>
                  Apply mitigation
                </button>
              ) : (
                <button
                  className={BUTTON}
                  disabled={!incident.effectApplied}
                  onClick={() => actions.restore(incident.id)}
                >
                  {incident.effectApplied
                    ? 'Restore controls'
                    : 'Restore controls: needs the mitigation to take effect'}
                </button>
              )}
            </div>
          ))}
        </Section>
      )}

      {trial && <TrialCard state={state} trialId={trial.id} />}

      {state.longNightTelegraphed &&
        !hasMark(state, 'held-intake') &&
        !hasMark(state, 'held-floor') && <LongNightCard state={state} />}

      {penalty > 0 && (
        <Section title={crop?.label ?? 'Crop year'}>
          <p className="flex items-center gap-2 text-amber-200">
            <Sprout className="h-4 w-4" aria-hidden="true" />
            Wheat recipes quality -{penalty}
          </p>
          {!state.crop?.treated && treatCost > 0 && (
            <button
              className={BUTTON}
              disabled={!canAfford(state, { fund: treatCost })}
              onClick={actions.treatCrop}
            >
              {state.crop?.kind === 'sprouted' ? 'Blend with sound grain' : 'Condition the grain'}
              <CostTag state={state} cost={{ fund: treatCost }} />
            </button>
          )}
        </Section>
      )}

      {state.pendingEvents.length > 0 && (
        <Section title="Awaiting a decision">
          {state.pendingEvents.map((pending) => {
            const event = EVENT_DECK.find((e) => e.id === pending.eventId);
            return (
              <div
                key={pending.instanceId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {event?.title ?? pending.eventId}{' '}
                  <span className="text-xs text-slate-300">
                    {pending.lapsesShift - state.shift <= 1
                      ? 'lapses at the next close'
                      : `lapses in ${plural(pending.lapsesShift - state.shift, 'shift')}`}
                  </span>
                </span>
                <button
                  className={BUTTON}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent(OPEN_EVENT, { detail: pending.instanceId })
                    )
                  }
                >
                  Decide
                </button>
              </div>
            );
          })}
        </Section>
      )}

      {state.forecasts.some((f) => f.status === 'pending') && (
        <Section title="Forecasts">
          {state.forecasts
            .filter((f) => f.status === 'pending')
            .map((forecast) => {
              const definition = FORECASTS[forecast.kind];
              const due = Math.max(0, forecast.dueShift - state.shift);
              return (
                <div key={forecast.id} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-white">{definition.title}</span>
                    <span className="text-xs text-slate-300">
                      {Math.round(currentForecastChance(state, forecast) * 100)}% in{' '}
                      {plural(due, 'shift')}
                    </span>
                  </div>
                  {forecast.mitigated ? (
                    <span className={CHIP}>{definition.mitigationLabel}: done</span>
                  ) : (
                    <button
                      className={BUTTON}
                      disabled={!canAfford(state, { fund: definition.mitigationCost })}
                      onClick={() => actions.mitigate(forecast.id)}
                    >
                      {definition.mitigationLabel}: -{Math.round(definition.mitigationRelief * 100)}{' '}
                      points
                      <CostTag state={state} cost={{ fund: definition.mitigationCost }} />
                    </button>
                  )}
                </div>
              );
            })}
        </Section>
      )}

      {state.modifiers.length > 0 && (
        <Section title="Active effects">
          <div className="flex flex-wrap gap-2">
            {state.modifiers.map((modifier) => (
              <span key={modifier.id} className={CHIP}>
                {modifier.label} · {plural(modifier.remainingShifts, 'shift')}
              </span>
            ))}
          </div>
        </Section>
      )}

      {following && (
        <Section title={`Next era: ${following.label}`}>
          <ul className="space-y-1 text-xs">
            <li className={installed >= following.requires.improvements ? 'text-emerald-300' : ''}>
              <Hammer className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Plans installed {installed} / {following.requires.improvements}
            </li>
            <li className={earned >= knowHowTarget ? 'text-emerald-300' : ''}>
              <KnowHowAmount value={earned} /> earned / {knowHowTarget}
            </li>
            {following.minStanding !== undefined && (
              <li
                className={
                  !state.certifier.suspended && standingOf(state.certifier) >= following.minStanding
                    ? 'text-emerald-300'
                    : ''
                }
              >
                {state.certifier.suspended ? (
                  <ShieldAlert
                    className="mr-1 inline h-3.5 w-3.5 text-rose-300"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                )}
                {CERTIFIER_NAME} standing{' '}
                {state.certifier.suspended ? 'suspended' : standingOf(state.certifier)} /{' '}
                {following.minStanding}
              </li>
            )}
            {following.requires.trialsPassed > 0 && state.charter?.mode === 'historical' && (
              <li className={passed >= following.requires.trialsPassed ? 'text-emerald-300' : ''}>
                <Trophy className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Trials passed {passed} / {following.requires.trialsPassed}
              </li>
            )}
            <li className="text-slate-300">{eraBonusText(following.id)}</li>
          </ul>
        </Section>
      )}

      <Section title="Maintenance policy">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <Scale className="h-4 w-4" aria-hidden="true" />
            Conserve resources
          </span>
          <input
            type="checkbox"
            checked={state.austerity.active}
            onChange={(event) => actions.setAusterity(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
      </Section>
    </div>
  );
}

function TrialCard({ state, trialId }: { state: ChronicleState; trialId: string }) {
  const progress = state.trials.find((t) => t.id === trialId)!;
  const definition = trialById(progress.id);
  const startsIn = Math.max(0, definition.startShift - state.shift);
  const remaining = definition.durationShifts - progress.shiftsUsed;
  const silver = nextMedalTarget(definition, 'bronze');
  const gold = nextMedalTarget(definition, 'silver');
  return (
    <Section title={definition.title}>
      {progress.phase === 'telegraphed' ? (
        <p className="text-amber-200">
          Begins in {plural(startsIn, 'shift')}: {trialGoalText(definition)}
        </p>
      ) : (
        <>
          <ProgressBar
            value={trialFraction(definition, progress)}
            label={`${definition.title} progress`}
          />
          <p className="text-xs text-slate-300">
            {definition.goal.kind === 'clean_closes'
              ? `${progress.cleanCloses} of ${definition.goal.closes} clean closes`
              : `${Math.round(progress.dispatchedKg).toLocaleString()} of ${definition.goal.kg.toLocaleString()} kg`}{' '}
            {trialGoalConditions(definition) ? ` · ${trialGoalConditions(definition)}` : ''} ·{' '}
            {plural(remaining, 'shift')} left
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {gold && <span className={CHIP}>Gold within {plural(gold.shiftsUsed, 'shift')}</span>}
        {silver && <span className={CHIP}>Silver within {plural(silver.shiftsUsed, 'shift')}</span>}
      </div>
    </Section>
  );
}

function LongNightCard({ state }: { state: ChronicleState }) {
  const pending = state.pendingEvents.find((p) => p.eventId === LONG_NIGHT_EVENT_ID);
  const startsIn = Math.max(0, LONG_NIGHT_SHIFT - state.shift);
  return (
    <Section title="The long night">
      <p className="flex items-center gap-2 text-amber-200">
        <Moon className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Tonight' : `In ${plural(startsIn, 'shift')}`}
      </p>
      {(['intake', 'floor'] as const).map((front) => {
        const prepared = frontPreparation(state, front);
        return (
          <div key={front} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-white">{FRONTS[front].label}</span>
              <span
                className={`text-xs ${prepared >= FRONT_HOLD_THRESHOLD ? 'text-emerald-300' : 'text-slate-300'}`}
              >
                {prepared} / {FRONT_HOLD_THRESHOLD}
              </span>
            </div>
            <ul className="space-y-0.5 text-xs">
              {frontSources(state, front).map((source) => (
                <li
                  key={source.id}
                  className={`flex items-center gap-1 ${source.met ? 'text-emerald-300' : 'text-slate-300'}`}
                >
                  {source.met ? (
                    <CheckCircle className="h-3.5 w-3.5" role="img" aria-label="Met" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" role="img" aria-label="Not met" />
                  )}
                  {source.label}
                  {source.weight !== 1 ? ` (${source.weight})` : ''}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {pending && (
        <button
          className={BUTTON_PRIMARY}
          onClick={() =>
            window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: pending.instanceId }))
          }
        >
          Decide
        </button>
      )}
    </Section>
  );
}
