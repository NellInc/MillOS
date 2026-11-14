import { EVENT_DECK, localizedEventText } from '../../chronicle/eventDeck';
import { formatFixed, formatGrouped } from '../../i18n';
import { qualityMargins, restorers } from '../../chronicle/margins';
import { grainPenalties } from '../../chronicle/grainStamp';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { productPathQuality } from '../../systems/UnifiedGameTick';
import { getCropYears } from '../../chronicle/cropYears';
import { getEras, getImprovements } from '../../chronicle/plans';
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
import type { ReactNode } from 'react';
import {
  CheckCircle,
  Circle,
  Clock,
  Flame,
  Hammer,
  Moon,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Thermometer,
  Trophy,
  Users,
  Wheat,
} from 'lucide-react';
import { CERTIFIER_NAME, standingOf } from '../../chronicle/certifier';
import { chronicleShifts, trialsFor } from '../../chronicle/schedule';
import { cropWheatPenalty } from '../../chronicle/cropYears';
import { relievedCropKinds } from '../../chronicle/effects';
import {
  answerablePending,
  canAfford,
  cropTreatmentMoot,
  currentForecastChance,
  eraBonusText,
  fundOf,
  FIRE_HAND_CLEAN_MINUTES,
  FIRE_SUPPRESSION_COST,
  FORCED_FUND_PER_KNOW_HOW,
  knowHowOf,
  mitigationRelief,
  nextEra,
  proposalStanding,
  treatmentPrice,
  upkeepPerShift,
  type ChronicleState,
} from '../../chronicle/engine';
import {
  FRONT_HOLD_THRESHOLD,
  FRONTS,
  frontPreparation,
  LONG_NIGHT_EVENT_ID,
  longNightCardShift,
  longNightShift,
} from '../../chronicle/longNight';
import { hasMark } from '../../chronicle/record';
import { relationshipTier } from '../../chronicle/customers';
import { getLadder, getRung } from '../../chronicle/governance';
import { localizedStakeholderName } from '../../chronicle/stakeholders';

import { knowHowEarned } from '../../chronicle/ledger';
import { eraKnowHowTarget } from '../../chronicle/plans';
import { nextMedalTarget, trialFraction } from '../../chronicle/trials';

import { useChronicleStore } from '../../stores/chronicleStore';
import { useProductionStore } from '../../stores/productionStore';
import {
  INCIDENT_DEFINITIONS,
  useOperationsCampaignStore,
} from '../../stores/operationsCampaignStore';
import { incidentTitle } from '../../stores/incidentText';
import {
  BUTTON,
  BUTTON_PRIMARY,
  CHIP,
  CostTag,
  FundAmount,
  KnowHowAmount,
  plural,
  ProgressBar,
  Section,
} from './shared';

export const OPEN_EVENT = 'millos:open-chronicle-event';

/** An organisation this close to cool is listed under Needs you (report 08, P5). */
const NEAR_COOL = 5;

/** One kind of need inside the Needs you list, named so its controls stay findable. */
function NeedGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="space-y-1 border-t border-slate-800 pt-2 first:border-t-0 first:pt-0"
    >
      <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
      {children}
    </section>
  );
}

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
  const awaiting = answerablePending(state, EVENT_DECK);
  const owned = state.ownedIncidents
    .map((o) => incidents.find((i) => i.id === o.incidentId))
    .filter((i): i is NonNullable<typeof i> => !!i && i.phase !== 'resolved');
  // A finished chronicle reaches no further era, so it shows nothing to work toward.
  const rawFollowing = state.status === 'active' ? nextEra(state) : null;
  const following = rawFollowing ? getEras().find((entry) => entry.id === rawFollowing.id)! : null;
  const knowHowTarget = following
    ? eraKnowHowTarget(following, state.charter?.mode ?? 'historical')
    : 0;
  const installed = state.improvements.filter((p) => p.phase === 'installed').length;
  const earned = knowHowEarned(state.ledger);
  const passed = state.trials.filter((t) => t.phase === 'passed').length;
  // The running trial, then any announced: Grid Winter is announced while the
  // Bakers' Rush still runs, so both cards show.
  const trialCards = [
    ...state.trials.filter((t) => t.phase === 'active'),
    ...state.trials.filter((t) => t.phase === 'telegraphed'),
  ];
  const totalShifts = chronicleShifts(state.charter);
  const gov = state.governance;
  const standing = proposalStanding(state);
  // Within NEAR_COOL of the cool tier, read from the tier rule itself.
  const cooling =
    state.status === 'active'
      ? state.stakeholders.filter(
          (s) =>
            relationshipTier(s.value) !== 'cool' && relationshipTier(s.value - NEAR_COOL) === 'cool'
        )
      : [];
  const needs =
    state.fire.active ||
    state.upkeepShortfall !== null ||
    awaiting.length > 0 ||
    gov.countdowns.length > 0 ||
    standing !== null ||
    owned.length > 0 ||
    cooling.length > 0;

  return (
    <div className="space-y-3">
      {/* One answer to "what needs me now", first on the overview (report 08, P5). */}
      {needs && (
        <Section title={t('needsYou')}>
          {state.fire.active && (
            <NeedGroup title={t('m11')}>
              <p className="flex items-center gap-2 text-rose-200">
                <Flame className="h-4 w-4" aria-hidden="true" />
                {/* Paid suppression and a clean by hand both end in a clean duct. */}
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
            </NeedGroup>
          )}

          {state.upkeepShortfall !== null && (
            <NeedGroup title={t('m17')}>
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
            </NeedGroup>
          )}

          {awaiting.length > 0 && (
            <NeedGroup title={t('m31')}>
              {awaiting.map(({ pending, event }) => {
                const title = localizedEventText(event.id, event.title);
                return (
                  <div
                    key={pending.instanceId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {title}{' '}
                      <span className="text-xs text-slate-300">
                        {pending.lapsesShift - state.shift <= 1
                          ? t('m32')
                          : t('p54', {
                              shifts: plural(pending.lapsesShift - state.shift, 'shift'),
                            })}
                      </span>
                    </span>
                    {/* Several can stand at once: each is named for the decision it opens. */}
                    <button
                      className={BUTTON}
                      aria-label={t('p74', { title })}
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
            </NeedGroup>
          )}

          {gov.countdowns.length > 0 && (
            <NeedGroup title={t('needsWarnings')}>
              {gov.countdowns.map((countdown) => (
                <p key={countdown.id} className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                  {t('needsCountdown', {
                    party: localizedStakeholderName(countdown.party),
                    shifts: plural(Math.max(0, countdown.dueShift - state.shift), 'shift'),
                    ladder: getLadder(countdown.ladder).label.toLowerCase(),
                    rung: getRung(countdown.ladder, countdown.rung).label.toLowerCase(),
                  })}
                </p>
              ))}
            </NeedGroup>
          )}
          {standing && (
            <NeedGroup title={t('needsAssembly')}>
              <p className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                {t('needsProposal', {
                  ladder: getLadder(standing.proposal.ladder).label,
                  from: getRung(
                    standing.proposal.ladder,
                    standing.proposal.from
                  ).label.toLowerCase(),
                  to: getRung(standing.proposal.ladder, standing.proposal.to).label.toLowerCase(),
                })}
              </p>
            </NeedGroup>
          )}
          {owned.length > 0 && (
            <NeedGroup title={t('m23')}>
              {owned.map((incident) => (
                <div
                  key={incident.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {/* The record keeps the title in the language it was raised in. */}
                    {incidentTitle(incident)}{' '}
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
                      onClick={() => campaign.acknowledgeIncident(incident.id, 'operator')}
                    >
                      {t('m24')}
                    </button>
                  ) : incident.phase === 'acknowledged' ? (
                    <button
                      className={BUTTON}
                      onClick={() => campaign.mitigateIncident(incident.id, 'operator')}
                    >
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
            </NeedGroup>
          )}

          {cooling.length > 0 && (
            <NeedGroup title={t('needsOrganisations')}>
              {cooling.map((party) => (
                <p key={party.id} className="flex items-start gap-2">
                  <Thermometer
                    className="mt-0.5 h-4 w-4 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                  {t('needsCooling', { party: localizedStakeholderName(party.id) })}
                </p>
              ))}
            </NeedGroup>
          )}
        </Section>
      )}

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
        <div className="col-span-2 rounded-lg bg-slate-800/80 p-2">
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
        <div className="col-span-2">
          <div className="mb-1 flex justify-between text-[11px] text-slate-300">
            <span>
              {t('m7')} {Math.min(state.shift, totalShifts)} {t('m8')} {totalShifts}
            </span>
            {/* A finished chronicle charges no more upkeep. */}
            {state.status === 'active' && (
              <span className="inline-flex items-center gap-1">
                {t('m9')} <FundAmount value={upkeepPerShift(state)} />
              </span>
            )}
          </div>
          <ProgressBar value={state.shift / totalShifts} label={t('m10')} />
        </div>
      </section>

      {state.status === 'active' && state.trainingOffered && !state.trainingMode && (
        <Section title={t('m21')}>
          <button className={BUTTON} onClick={actions.acceptTraining}>
            {t('m22')}
          </button>
        </Section>
      )}

      {trialCards.map((trial) => (
        <TrialCard key={trial.id} state={state} trialId={trial.id} />
      ))}

      {/* From the first errand that prepares for it, so the climax is a plan (report 08, P1). */}
      {(state.longNightTelegraphed ||
        (state.status === 'active' &&
          state.charter?.mode !== 'sandbox' &&
          state.shift >= longNightCardShift(EVENT_DECK, state.charter))) &&
        !hasMark(state, 'held-intake') &&
        !hasMark(state, 'held-floor') && <LongNightCard state={state} />}

      {/* A finished chronicle applies no effect to the plant, so it claims none. */}
      {state.status === 'active' && penalty > 0 && (
        <Section title={crop?.label ?? t('m2')}>
          <p className="flex items-center gap-2 text-amber-200">
            <Sprout className="h-4 w-4" aria-hidden="true" />
            {t('m28')}
            {penalty}
          </p>
          <QualityMarginsLine state={state} />
          {!cropTreatmentMoot(state) && treatCost > 0 && (
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

      {state.forecasts.some((f) => f.status === 'pending') && (
        <Section title={t('m51')}>
          {state.forecasts
            .filter((f) => f.status === 'pending')
            .map((forecast) => {
              const definition = getForecasts()[forecast.kind];
              const due = Math.max(0, forecast.dueShift - state.shift);
              // What paying still buys: the floor can leave less than the full relief, or none.
              const relief = Math.round(mitigationRelief(state, forecast) * 100);
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
                      disabled={
                        relief <= 0 || !canAfford(state, { fund: definition.mitigationCost })
                      }
                      onClick={() => actions.mitigate(forecast.id)}
                    >
                      {relief > 0 ? (
                        <>
                          {definition.mitigationLabel}: -{relief} {t('m35')}
                          <CostTag state={state} cost={{ fund: definition.mitigationCost }} />
                        </>
                      ) : (
                        `${definition.mitigationLabel}: ${t('m76')}`
                      )}
                    </button>
                  )}
                </div>
              );
            })}
        </Section>
      )}

      {state.status === 'active' && state.modifiers.length > 0 && (
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
            {/* A suspension holds the mill in its era whatever the era asks of standing. */}
            {following.minStanding === undefined && state.certifier.suspended && (
              <li>
                <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-rose-300" aria-hidden="true" />
                {t('p75', { name: CERTIFIER_NAME })}
              </li>
            )}
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
            disabled={state.status !== 'active'}
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
  const definition = localizedTrialById(progress.id, trialsFor(state.charter));
  const startsIn = Math.max(0, definition.startShift - state.shift);
  const remaining = definition.durationShifts - progress.shiftsUsed;
  // A medal needs completion by its shift; once that many shifts are used without
  // completing, it can no longer be won and is not offered.
  const reachable = (target: ReturnType<typeof nextMedalTarget>) =>
    target && progress.shiftsUsed < target.shiftsUsed ? target : null;
  const silver = reachable(nextMedalTarget(definition, 'bronze'));
  const gold = reachable(nextMedalTarget(definition, 'silver'));
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
      {/* For a quality goal, each recipe's margin (4.6). */}
      {(definition.goal.kind === 'clean_closes' || definition.goal.noQualityFailure) && (
        <QualityMarginsLine state={state} />
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

/** The plant's stamp on an unworn line: the most any recipe can read. */
const QUALITY_CEILING = productPathQuality([]);
/** The stamp the tick puts on flour now: the running line's (fix-up b). */
const lineStamp = (state: ReturnType<typeof useProductionStore.getState>) =>
  productPathQuality(state.machines);
const RECIPE_KEY = {
  strong_white: 'recipe_strong_white',
  community_flour: 'recipe_community_flour',
  fine_semolina: 'recipe_fine_semolina',
} as const;

/** Item 4.6: each recipe's best stamp now against its minimum ("Strong white 94.5 / 95"). */
function QualityMarginsLine({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const incident = useOperationsCampaignStore((s) => s.getIncidentEffect().qualityPenalty);
  const stamp = useProductionStore(lineStamp);
  // Under a charter the plant stamps flour from the grain it was milled from
  // (lotQuality.ts): the card reads that grain, now and at best (grainStamp.ts).
  // The selector keeps the card current as the grain changes.
  useMaterialFlowStore((flow) => grainPenalties(flow).now(state));
  useMaterialFlowStore((flow) => grainPenalties(flow).best(state));
  const grain = grainPenalties(useMaterialFlowStore.getState());
  const margins = qualityMargins(state, stamp, incident, grain.now);
  const short = margins.filter((margin) => margin.best < margin.minimum);
  // Out of reach only if a serviced line on the silos' grain, the incident
  // recovered, still cannot make it: good grain in store is a way back.
  const reach = qualityMargins(state, QUALITY_CEILING, 0, grain.best);
  const unreachable = short.filter(
    (margin) => reach.find((m) => m.recipe === margin.recipe)!.best < margin.minimum
  );
  const reachable = short.filter((margin) => !unreachable.includes(margin));
  const label = (way: ReturnType<typeof restorers>[number]) =>
    way.kind === 'incident'
      ? t('restoreIncident')
      : way.kind === 'service'
        ? t('restoreService')
        : way.kind === 'treatment'
          ? t(state.crop?.kind === 'sprouted' ? 'restoreBlend' : 'restoreDry')
          : way.kind === 'temper'
            ? t('restoreDry')
            : (getImprovements().find((plan) => plan.id === way.id)?.label ?? way.id);
  // Rule 4: a recipe out of reach says what brings it back (margins.ts, `restorers`).
  const ways = unreachable.length
    ? restorers(state, QUALITY_CEILING, 0, QUALITY_CEILING, grain.best).map(label)
    : [];
  // Short now and reachable: what lifts it from here.
  const nowWays = reachable.length
    ? [
        ...restorers(state, stamp, incident, QUALITY_CEILING, grain.now)
          .filter((way) => way.kind === 'incident' || way.kind === 'service')
          .map(label),
        ...(grain.best(state) < grain.now(state) ? [t('restoreSilos')] : []),
      ]
    : [];
  const recipes = unreachable.map((margin) => t(RECIPE_KEY[margin.recipe])).join(', ');
  const recipesNow = reachable.map((margin) => t(RECIPE_KEY[margin.recipe])).join(', ');
  return (
    <>
      <ul
        aria-label={t('marginsLabel')}
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums"
      >
        {margins.map((margin) => (
          <li
            key={margin.recipe}
            className={margin.best >= margin.minimum ? 'text-emerald-300' : 'text-rose-300'}
          >
            {t('margin', {
              recipe: t(RECIPE_KEY[margin.recipe]),
              best: formatFixed(margin.best, 1),
              minimum: formatGrouped(margin.minimum),
            })}
          </li>
        ))}
      </ul>
      {unreachable.length > 0 && (
        <p className="text-xs text-rose-200">
          {ways.length
            ? t('outOfReach', { recipes, ways: ways.join(', ') })
            : t('outOfReachYear', { recipes })}
        </p>
      )}
      {reachable.length > 0 && nowWays.length > 0 && (
        <p className="text-xs text-rose-200">
          {t('shortNow', { recipes: recipesNow, ways: nowWays.join(', ') })}
        </p>
      )}
    </>
  );
}

function LongNightCard({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const pending = state.pendingEvents.find((p) => p.eventId === LONG_NIGHT_EVENT_ID);
  const startsIn = Math.max(0, longNightShift(state.charter) - state.shift);
  return (
    <Section title={t('m46')}>
      <p className="flex items-center gap-2 text-amber-200">
        <Moon className="h-4 w-4" aria-hidden="true" />
        {pending
          ? t('p60')
          : startsIn > 0
            ? t('p59', { shifts: plural(startsIn, 'shift') })
            : t('m77')}
      </p>
      {(['intake', 'floor'] as const).map((front) => {
        const prepared = frontPreparation(state, front);
        // What the front costs if it falls: the incident the resolution raises.
        const stake = INCIDENT_DEFINITIONS[FRONTS[front].hazard];
        return (
          <div key={front} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium text-white">{getFronts()[front].label}</span>{' '}
                <span className="text-xs text-rose-200">
                  {t('nightStake', {
                    incident: stake.title.toLowerCase(),
                    value: formatGrouped(stake.effect.productionMultiplier),
                  })}
                </span>
              </span>
              <span
                data-testid={`night-count-${front}`}
                className={`shrink-0 whitespace-nowrap text-xs ${prepared >= FRONT_HOLD_THRESHOLD ? 'text-emerald-300' : 'text-slate-300'}`}
              >
                {/* Spread cover prepares by halves: 1,5 in pt-BR. */}
                {formatGrouped(prepared)} / {formatGrouped(FRONT_HOLD_THRESHOLD)}
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
                  {source.weight !== 1 ? ` (${formatGrouped(source.weight)})` : ''}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {pending && (
        <button
          className={BUTTON_PRIMARY}
          aria-label={t('p74', { title: t('m46') })}
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
