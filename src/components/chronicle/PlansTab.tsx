import { useShallow } from 'zustand/react/shallow';
import { HardHat } from 'lucide-react';
import { traitLabel } from '../../chronicle/contractors';
import {
  canAfford,
  installBlockReason,
  installPrice,
  installShifts,
  knowHowOf,
  type ChronicleState,
} from '../../chronicle/engine';
import { ERAS, IMPROVEMENTS, planAvailability } from '../../chronicle/plans';
import type { ImprovementDefinition, ModifierValues } from '../../chronicle/types';
import { FORECASTS } from '../../chronicle/forecasts';
import { CROP_YEARS } from '../../chronicle/cropYears';
import { useChronicleStore } from '../../stores/chronicleStore';
import { BUTTON, CHIP, CostTag, FundAmount, plural, Section } from './shared';

export function effectSummary(plan: ImprovementDefinition): string {
  const parts: string[] = [];
  const e: ModifierValues = plan.effect;
  if (e.production) parts.push(`production x${e.production}`);
  if (e.energy) parts.push(`energy x${e.energy}`);
  if (e.wear) parts.push(`wear x${e.wear}`);
  if (e.qualityPenalty) parts.push(`quality +${-e.qualityPenalty}`);
  if (e.upkeep) parts.push(`upkeep x${e.upkeep}`);
  for (const [kind, relief] of Object.entries(plan.forecastRelief ?? {}))
    parts.push(
      `${FORECASTS[kind as keyof typeof FORECASTS].title.toLowerCase()} -${Math.round((relief ?? 0) * 100)}%`
    );
  for (const kind of plan.cropRelief ?? []) {
    const left = CROP_YEARS[kind].treatedPenalty;
    parts.push(
      left > 0
        ? `${CROP_YEARS[kind].label.toLowerCase()} penalty down to ${left}`
        : `no ${CROP_YEARS[kind].label.toLowerCase()} penalty`
    );
  }
  if (plan.knowHowPerShift) parts.push(`+${plan.knowHowPerShift} know-how per shift`);
  parts.push(`upkeep ${plan.upkeep} a shift`);
  return parts.join(', ');
}

export function PlansTab({ state }: { state: ChronicleState }) {
  const actions = useChronicleStore(
    useShallow((s) => ({ plan: s.plan, install: s.install, cancel: s.cancel, hire: s.hire }))
  );
  const installing = state.improvements.some((p) => p.phase === 'installing');
  return (
    <div className="space-y-3">
      <Section
        title="Contractor"
        action={
          <span className={CHIP}>
            <HardHat className="h-3.5 w-3.5" aria-hidden="true" />
            {state.contractor?.name ?? 'In-house crew'}
          </span>
        }
      >
        {state.contractor && (
          <ul className="text-xs">
            <li className="text-emerald-300">{traitLabel(state.contractor.strength)}</li>
            <li className="text-rose-300">{traitLabel(state.contractor.weakness)}</li>
          </ul>
        )}
        {installing && (
          <p role="status" className="text-[11px] text-amber-200">
            Firms can be retained once the current install finishes.
          </p>
        )}
        <div className="grid gap-2">
          {state.contractorOffers
            .filter((offer) => offer.id !== state.contractor?.id)
            .map((offer) => (
              <div key={offer.id} className="rounded-lg border border-slate-700 p-2">
                <div className="font-medium text-white">{offer.name}</div>
                <ul className="text-xs">
                  <li className="text-emerald-300">{traitLabel(offer.strength)}</li>
                  <li className="text-rose-300">{traitLabel(offer.weakness)}</li>
                </ul>
                <button
                  className={`${BUTTON} mt-2`}
                  disabled={installing || !canAfford(state, { fund: offer.retainer })}
                  title={installing ? 'An install is under way' : undefined}
                  onClick={() => actions.hire(offer.id)}
                >
                  Retain
                  <CostTag state={state} cost={{ fund: offer.retainer }} />
                </button>
              </div>
            ))}
        </div>
      </Section>

      {ERAS.map((era) => {
        const plans = IMPROVEMENTS.filter((plan) => plan.column === era.order);
        if (!plans.length) return null;
        return (
          <Section key={era.id} title={era.label}>
            {plans.map((plan) => {
              const availability = planAvailability(plan, state.era, state.improvements);
              const progress = state.improvements.find((p) => p.id === plan.id);
              const block = availability === 'planned' ? installBlockReason(state, plan.id) : null;
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
                        ? 'Installed'
                        : availability === 'installing' && progress?.completesShift !== null
                          ? `Installing, ${plural(Math.max(0, (progress?.completesShift ?? 0) - state.shift), 'shift')}`
                          : availability === 'planned'
                            ? 'Planned'
                            : availability === 'locked_era'
                              ? era.label
                              : availability === 'locked_requires'
                                ? `Needs ${plan.requires.map((r) => IMPROVEMENTS.find((p) => p.id === r)?.label ?? r).join(', ')}`
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
                        Draw up the plan
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
                        Install, {plural(installShifts(state, plan.id), 'shift')}
                        <span className="ml-2">
                          <FundAmount value={installPrice(state, plan.id)} />
                        </span>
                      </button>
                    )}
                    {availability === 'installing' && (
                      <button className={BUTTON} onClick={() => actions.cancel(plan.id)}>
                        Cancel and refund
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
