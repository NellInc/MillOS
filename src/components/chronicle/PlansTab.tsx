import { formatGrouped } from '../../i18n';
import { getEras, getImprovements } from '../../chronicle/plans';
import { getForecasts } from '../../chronicle/forecasts';
import { getCropYears } from '../../chronicle/cropYears';
import { localizedTraitLabel } from '../../chronicle/contractors';
import { useT, createTranslator, getLocale } from '../../i18n';
import { messages } from './PlansTab.messages';
import { useShallow } from 'zustand/react/shallow';
import { HardHat } from 'lucide-react';

import {
  canAfford,
  installBlockReason,
  installPrice,
  installShifts,
  knowHowOf,
  type ChronicleState,
} from '../../chronicle/engine';
import { planAvailability } from '../../chronicle/plans';
import type { ImprovementDefinition, ModifierValues } from '../../chronicle/types';

import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, CHIP, CostTag, FundAmount, plural, Section } from './shared';

export function effectSummary(plan: ImprovementDefinition): string {
  const t = createTranslator(messages, getLocale());
  const parts: string[] = [];
  const e: ModifierValues = plan.effect;
  if (e.production) parts.push(t('p12', { value: formatGrouped(e.production) }));
  if (e.energy) parts.push(t('p13', { value: formatGrouped(e.energy) }));
  if (e.wear) parts.push(t('p14', { value: formatGrouped(e.wear) }));
  if (e.qualityPenalty) parts.push(t('p15', { value: formatGrouped(-e.qualityPenalty) }));
  if (e.upkeep) parts.push(t('p16', { value: formatGrouped(e.upkeep) }));
  for (const [kind, relief] of Object.entries(plan.forecastRelief ?? {}))
    parts.push(
      t('p17', {
        forecast: getForecasts()[kind as keyof ReturnType<typeof getForecasts>].title.toLowerCase(),
        relief: formatGrouped(Math.round((relief ?? 0) * 100)),
      })
    );
  for (const kind of plan.cropRelief ?? []) {
    const left = getCropYears()[kind].treatedPenalty;
    parts.push(
      left > 0
        ? t('p18', { crop: getCropYears()[kind].label.toLowerCase(), value: formatGrouped(left) })
        : t('p19', { crop: getCropYears()[kind].label.toLowerCase() })
    );
  }
  if (plan.knowHowPerShift) parts.push(t('p20', { value: formatGrouped(plan.knowHowPerShift) }));
  parts.push(t('p21', { value: formatGrouped(plan.upkeep) }));
  return parts.join(', ');
}

export function PlansTab({ state }: { state: ChronicleState }) {
  const t = useT(messages);
  const actions = useChronicleStore(
    useShallow((s) => ({ plan: s.plan, install: s.install, cancel: s.cancel, hire: s.hire }))
  );
  const installing = state.improvements.some((p) => p.phase === 'installing');
  return (
    <div className="space-y-3">
      <Section
        title={t('m7')}
        action={
          <span className={CHIP}>
            <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
            {state.contractor?.name ?? t('m0')}
          </span>
        }
      >
        {state.contractor && (
          <ul className="text-xs">
            <li className="text-emerald-300">{localizedTraitLabel(state.contractor.strength)}</li>
            <li className="text-rose-300">{localizedTraitLabel(state.contractor.weakness)}</li>
          </ul>
        )}
        {installing && (
          <p role="status" className="text-[11px] text-amber-200">
            {t('m1')}
          </p>
        )}
        <div className="grid gap-2">
          {state.contractorOffers
            .filter((offer) => offer.id !== state.contractor?.id)
            .map((offer) => (
              <div key={offer.id} className="rounded-lg border border-slate-700 p-2">
                <div className="font-medium text-white">{offer.name}</div>
                <ul className="text-xs">
                  <li className="text-emerald-300">{localizedTraitLabel(offer.strength)}</li>
                  <li className="text-rose-300">{localizedTraitLabel(offer.weakness)}</li>
                </ul>
                <button
                  className={`${BUTTON} mt-2`}
                  disabled={installing || !canAfford(state, { fund: offer.retainer })}
                  title={installing ? t('m2') : undefined}
                  onClick={() => actions.hire(offer.id)}
                >
                  {t('m3')}
                  <CostTag state={state} cost={{ fund: offer.retainer }} />
                </button>
              </div>
            ))}
        </div>
      </Section>

      {getEras().map((era) => {
        const plans = getImprovements().filter((plan) => plan.column === era.order);
        if (!plans.length) return null;
        return (
          <Section key={era.id} title={era.label}>
            {plans.map((plan) => {
              const availability = planAvailability(plan, state.era, state.improvements);
              const progress = state.improvements.find((p) => p.id === plan.id);
              const block =
                availability === 'planned' ? localizedInstallBlockReason(state, plan.id) : null;
              return (
                <article
                  key={plan.id}
                  aria-label={plan.label}
                  className={`rounded-lg border p-2 ${
                    availability === 'installed'
                      ? 'border-emerald-400/40'
                      : availability.startsWith('locked')
                        ? 'border-slate-800 opacity-60'
                        : 'border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-medium text-white">
                      {plan.label}
                      <span className="font-normal text-slate-300">: {effectSummary(plan)}</span>
                    </h4>
                    <span className="text-[11px] text-slate-300">
                      {availability === 'installed'
                        ? t('m8')
                        : availability === 'installing' && progress?.completesShift !== null
                          ? t('p10', {
                              shifts: plural(
                                Math.max(0, (progress?.completesShift ?? 0) - state.shift),
                                'shift'
                              ),
                            })
                          : availability === 'planned'
                            ? t('m9')
                            : availability === 'locked_era'
                              ? era.label
                              : availability === 'locked_requires'
                                ? t('p11', {
                                    plans: plan.requires
                                      .map(
                                        (r) => getImprovements().find((p) => p.id === r)?.label ?? r
                                      )
                                      .join(', '),
                                  })
                                : ''}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availability === 'available' && (
                      <button
                        className={BUTTON}
                        disabled={knowHowOf(state) < plan.planCost}
                        onClick={() => actions.plan(plan.id)}
                      >
                        {t('m4')}
                        <CostTag state={state} cost={{ knowHow: plan.planCost }} />
                      </button>
                    )}
                    {availability === 'planned' && (
                      <button
                        className={BUTTON}
                        disabled={block !== null}
                        title={block ?? undefined}
                        onClick={() => actions.install(plan.id)}
                      >
                        {t('m5')} {plural(installShifts(state, plan.id), 'shift')}
                        <span className="ml-2">
                          <FundAmount value={installPrice(state, plan.id)} />
                        </span>
                      </button>
                    )}
                    {availability === 'installing' && (
                      <button className={BUTTON} onClick={() => actions.cancel(plan.id)}>
                        {t('m6')}
                      </button>
                    )}
                  </div>
                  {block && availability === 'planned' && (
                    <p role="status" className="mt-1 text-[11px] text-amber-200">
                      {block}
                    </p>
                  )}
                </article>
              );
            })}
          </Section>
        );
      })}
    </div>
  );
}

function localizedInstallBlockReason(state: ChronicleState, id: string): string | null {
  const t = createTranslator(messages, getLocale());
  const reason = installBlockReason(state, id);
  if (reason === null) return null;
  const fixed: Record<string, string> = {
    'Plan it first.': t('x22'),
    'Installing.': t('x23'),
    'Installed.': t('x24'),
    'The in-house crew is busy.': t('x25'),
    'Too late to finish before the chronicle ends.': t('x26'),
    'Not enough fund.': t('x27'),
  };
  if (fixed[reason]) return fixed[reason];
  if (state.contractor && reason === state.contractor.name + ' is busy.')
    return t('x28', { name: state.contractor.name });
  const plan = getImprovements().find((p) => p.id === id);
  if (plan && reason.startsWith('Needs ')) {
    const missing = plan.requires.filter(
      (r) => !state.improvements.some((p) => p.id === r && p.phase === 'installed')
    );
    return t('x29', {
      plans: missing.map((r) => getImprovements().find((p) => p.id === r)?.label ?? r).join(', '),
    });
  }
  return reason;
}
