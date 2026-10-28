import { localizedEventText } from '../../chronicle/eventDeck';
import { formatGrouped } from '../../i18n';
import { getCropYears } from '../../chronicle/cropYears';
import { getEras } from '../../chronicle/plans';
import { getEventDeck } from '../../chronicle/eventDeck';
import { getForecasts } from '../../chronicle/forecasts';
import { getFronts, localizedFrontSources } from '../../chronicle/longNight';
import {
  localizedTrialById,
  localizedTrialGoalText,
  localizedTrialGoalConditions,
} from '../../chronicle/trials';
import { useT, createTranslator, getLocale } from '../../i18n';
import { messages } from './ChronicleOverview.messages';
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
import { CHRONICLE_SHIFTS } from '../../chronicle/cropYears';
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
  frontPreparation,
  LONG_NIGHT_EVENT_ID,
  LONG_NIGHT_SHIFT,
} from '../../chronicle/longNight';
import { hasMark } from '../../chronicle/record';

import { knowHowEarned } from '../../chronicle/ledger';
import { eraKnowHowTarget } from '../../chronicle/plans';
import { nextMedalTarget, trialFraction } from '../../chronicle/trials';

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
  const t = useT(messages);
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
  const era = getEras().find((entry) => entry.id === state.era)!;
  const crop = state.crop ? getCropYears()[state.crop.kind] : null;
  const penalty = cropWheatPenalty(state.crop, relievedCropKinds(state.improvements));
  const treatCost = treatmentPrice(state);
  const owned = state.ownedIncidents
    .map((o) => incidents.find((i) => i.id === o.incidentId))
    .filter((i): i is NonNullable<typeof i> => !!i && i.phase !== 'resolved');
  const rawFollowing = nextEra(state);
  const following = rawFollowing ? getEras().find((entry) => entry.id === rawFollowing.id)! : null;
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
      <section aria-label={t('m0')} className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">{t('m1')}</div>
          <div className="font-semibold text-white">{era.label}</div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">
            {t('m2')} {(state.crop?.index ?? 0) + 1}
          </div>
          <div className="flex items-center gap-1 font-semibold text-white">
            <Wheat className="h-4 w-4 text-amber-200" aria-hidden="true" />
            {crop?.label ?? t('m50')}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">{t('m3')}</div>
          <div className="font-semibold text-white">
            <FundAmount value={fundOf(state)} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">{t('m4')}</div>
          <div className="font-semibold text-white">
            <KnowHowAmount value={knowHowOf(state)} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">{t('m5')}</div>
          <div className="flex items-center gap-1 font-semibold text-white">
            {state.certifier.suspended ? (
              <ShieldAlert className="h-4 w-4 text-rose-300" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            )}
            {state.certifier.suspended
              ? t('m49')
              : t('p53', { standing: standingOf(state.certifier) })}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/80 p-2">
          <div className="text-[11px] text-slate-300">{t('m6')}</div>
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
              {t('m7')} {Math.min(state.shift, CHRONICLE_SHIFTS)} {t('m8')} {CHRONICLE_SHIFTS}
            </span>
            <span className="inline-flex items-center gap-1">
              {t('m9')} <FundAmount value={upkeepPerShift(state)} />
            </span>
          </div>
          <ProgressBar value={state.shift / CHRONICLE_SHIFTS} label={t('m10')} />
        </div>
      </section>

      {state.fire.active && (
        <Section title={t('m11')}>
          <p className="flex items-center gap-2 text-rose-200">
            <Flame className="h-4 w-4" aria-hidden="true" />
            {state.fire.suppressing ? t('m12') : t('m13')}
          </p>
          {!state.fire.suppressing && (
            <div className="flex flex-wrap gap-2">
              <button
                className={BUTTON_PRIMARY}
                disabled={!canAfford(state, { fund: FIRE_SUPPRESSION_COST })}
                onClick={() => actions.suppress('suppress')}
              >
                {t('m14')}
                <CostTag state={state} cost={{ fund: FIRE_SUPPRESSION_COST }} />
              </button>
              <button className={BUTTON} onClick={() => actions.suppress('by_hand')}>
                {t('m15')} {FIRE_HAND_CLEAN_MINUTES} {t('m16')}
              </button>
            </div>
          )}
        </Section>
      )}

      {state.upkeepShortfall !== null && (
        <Section title={t('m17')}>
          <p>
            {t('m18')} <FundAmount value={state.upkeepShortfall} />
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={BUTTON} onClick={() => actions.answerShortfall('conserve')}>
              {t('m19')}
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
              {t('m20')}
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
        <Section title={t('m21')}>
          <button className={BUTTON} onClick={actions.acceptTraining}>
            {t('m22')}
          </button>
        </Section>
      )}

      {owned.length > 0 && (
        <Section title={t('m23')}>
          {owned.map((incident) => (
            <div key={incident.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {incident.title}{' '}
                <span className="text-xs text-slate-300">
                  (
                  {
                    {
                      raised: t('r70'),
                      acknowledged: t('r71'),
                      mitigated: t('r72'),
                      resolved: t('r73'),
                    }[incident.phase]
                  }
                  )
                </span>
              </span>
              {incident.phase === 'raised' ? (
                <button
                  className={BUTTON}
                  onClick={() => campaign.acknowledgeIncident(incident.id)}
                >
                  {t('m24')}
                </button>
              ) : incident.phase === 'acknowledged' ? (
                <button className={BUTTON} onClick={() => campaign.mitigateIncident(incident.id)}>
                  {t('m25')}
                </button>
              ) : (
                <button
                  className={BUTTON}
                  disabled={!incident.effectApplied}
                  onClick={() => actions.restore(incident.id)}
                >
                  {incident.effectApplied ? t('m26') : t('m27')}
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
        <Section title={crop?.label ?? t('m2')}>
          <p className="flex items-center gap-2 text-amber-200">
            <Sprout className="h-4 w-4" aria-hidden="true" />
            {t('m28')}
            {penalty}
          </p>
          {!state.crop?.treated && treatCost > 0 && (
            <button
              className={BUTTON}
              disabled={!canAfford(state, { fund: treatCost })}
              onClick={actions.treatCrop}
            >
              {state.crop?.kind === 'sprouted' ? t('m29') : t('m30')}
              <CostTag state={state} cost={{ fund: treatCost }} />
            </button>
          )}
        </Section>
      )}

      {state.pendingEvents.length > 0 && (
        <Section title={t('m31')}>
          {state.pendingEvents.map((pending) => {
            const event = getEventDeck().find((e) => e.id === pending.eventId);
            return (
              <div
                key={pending.instanceId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {event?.title ?? pending.eventId}{' '}
                  <span className="text-xs text-slate-300">
                    {pending.lapsesShift - state.shift <= 1
                      ? t('m32')
                      : t('p54', { shifts: plural(pending.lapsesShift - state.shift, 'shift') })}
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
                  {t('m33')}
                </button>
              </div>
            );
          })}
        </Section>
      )}

      {state.forecasts.some((f) => f.status === 'pending') && (
        <Section title={t('m51')}>
          {state.forecasts
            .filter((f) => f.status === 'pending')
            .map((forecast) => {
              const definition = getForecasts()[forecast.kind];
              const due = Math.max(0, forecast.dueShift - state.shift);
              return (
                <div key={forecast.id} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-white">{definition.title}</span>
                    <span className="text-xs text-slate-300">
                      {Math.round(currentForecastChance(state, forecast) * 100)}
                      {t('m34')} {plural(due, 'shift')}
                    </span>
                  </div>
                  {forecast.mitigated ? (
                    <span className={CHIP}>
                      {definition.mitigationLabel}
                      {t('p61')}
                    </span>
                  ) : (
                    <button
                      className={BUTTON}
                      disabled={!canAfford(state, { fund: definition.mitigationCost })}
                      onClick={() => actions.mitigate(forecast.id)}
                    >
                      {definition.mitigationLabel}: -{Math.round(definition.mitigationRelief * 100)}{' '}
                      {t('m35')}
                      <CostTag state={state} cost={{ fund: definition.mitigationCost }} />
                    </button>
                  )}
                </div>
              );
            })}
        </Section>
      )}

      {state.modifiers.length > 0 && (
        <Section title={t('m36')}>
          <div className="flex flex-wrap gap-2">
            {state.modifiers.map((modifier) => (
              <span key={modifier.id} className={CHIP}>
                {localizedEventText(modifier.sourceId, modifier.label)} ·{' '}
                {plural(modifier.remainingShifts, 'shift')}
              </span>
            ))}
          </div>
        </Section>
      )}

      {following && (
        <Section title={t('p55', { era: following.label })}>
          <ul className="space-y-1 text-xs">
            <li className={installed >= following.requires.improvements ? 'text-emerald-300' : ''}>
              <Hammer className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t('m37')} {installed} / {following.requires.improvements}
            </li>
            <li className={earned >= knowHowTarget ? 'text-emerald-300' : ''}>
              <KnowHowAmount value={earned} /> {t('m38')} {knowHowTarget}
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
                {CERTIFIER_NAME} {t('m39')}{' '}
                {state.certifier.suspended ? t('r69') : standingOf(state.certifier)} /{' '}
                {following.minStanding}
              </li>
            )}
            {following.requires.trialsPassed > 0 && state.charter?.mode === 'historical' && (
              <li className={passed >= following.requires.trialsPassed ? 'text-emerald-300' : ''}>
                <Trophy className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {t('m40')} {passed} / {following.requires.trialsPassed}
              </li>
            )}
            <li className="text-slate-300">{localizedEraBonusText(following.id)}</li>
          </ul>
        </Section>
      )}

      <Section title={t('m41')}>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {t('m19')}
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
  const t = useT(messages);
  const progress = state.trials.find((t) => t.id === trialId)!;
  const definition = localizedTrialById(progress.id);
  const startsIn = Math.max(0, definition.startShift - state.shift);
  const remaining = definition.durationShifts - progress.shiftsUsed;
  const silver = nextMedalTarget(definition, 'bronze');
  const gold = nextMedalTarget(definition, 'silver');
  return (
    <Section title={definition.title}>
      {progress.phase === 'telegraphed' ? (
        <p className="text-amber-200">
          {t('m42')} {plural(startsIn, 'shift')}: {localizedTrialGoalText(definition)}
        </p>
      ) : (
        <>
          <ProgressBar
            value={trialFraction(definition, progress)}
            label={t('p56', { title: definition.title })}
          />
          <p className="text-xs text-slate-300">
            {definition.goal.kind === 'clean_closes'
              ? t('p57', { done: progress.cleanCloses, total: definition.goal.closes })
              : t('p58', {
                  done: formatGrouped(Math.round(progress.dispatchedKg)),
                  total: formatGrouped(definition.goal.kg),
                })}{' '}
            {localizedTrialGoalConditions(definition)
              ? ` · ${localizedTrialGoalConditions(definition)}`
              : ''}{' '}
            · {plural(remaining, 'shift')} {t('m43')}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {gold && (
          <span className={CHIP}>
            {t('m44')} {plural(gold.shiftsUsed, 'shift')}
          </span>
        )}
        {silver && (
          <span className={CHIP}>
            {t('m45')} {plural(silver.shiftsUsed, 'shift')}
          </span>
        )}
      </div>
    </Section>
  );
}

function LongNightCard({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const pending = state.pendingEvents.find((p) => p.eventId === LONG_NIGHT_EVENT_ID);
  const startsIn = Math.max(0, LONG_NIGHT_SHIFT - state.shift);
  return (
    <Section title={t('m46')}>
      <p className="flex items-center gap-2 text-amber-200">
        <Moon className="h-4 w-4" aria-hidden="true" />
        {pending ? t('p60') : t('p59', { shifts: plural(startsIn, 'shift') })}
      </p>
      {(['intake', 'floor'] as const).map((front) => {
        const prepared = frontPreparation(state, front);
        return (
          <div key={front} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-white">{getFronts()[front].label}</span>
              <span
                className={`text-xs ${prepared >= FRONT_HOLD_THRESHOLD ? 'text-emerald-300' : 'text-slate-300'}`}
              >
                {prepared} / {FRONT_HOLD_THRESHOLD}
              </span>
            </div>
            <ul className="space-y-0.5 text-xs">
              {localizedFrontSources(state, front).map((source) => (
                <li
                  key={source.id}
                  className={`flex items-center gap-1 ${source.met ? 'text-emerald-300' : 'text-slate-300'}`}
                >
                  {source.met ? (
                    <CheckCircle className="h-3.5 w-3.5" role="img" aria-label={t('m48')} />
                  ) : (
                    <Circle className="h-3.5 w-3.5" role="img" aria-label={t('m47')} />
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
          {t('m33')}
        </button>
      )}
    </Section>
  );
}

function localizedEraBonusText(id: Parameters<typeof eraBonusText>[0]): string {
  const t = createTranslator(messages, getLocale());
  const bonus = getEras().find((era) => era.id === id)!.bonus;
  const parts: string[] = [];
  if (bonus.reinvestment)
    parts.push(t('x62', { value: formatGrouped(Math.round(bonus.reinvestment * 100)) }));
  if (bonus.wear) parts.push(t('x63', { value: formatGrouped(bonus.wear) }));
  if (bonus.energy) parts.push(t('x64', { value: formatGrouped(bonus.energy) }));
  if (bonus.production) parts.push(t('x65', { value: formatGrouped(bonus.production) }));
  if (bonus.qualityPenalty) parts.push(t('x66', { value: formatGrouped(-bonus.qualityPenalty) }));
  return parts.length ? t('x67', { parts: parts.join(', ') }) : t('x68');
}
