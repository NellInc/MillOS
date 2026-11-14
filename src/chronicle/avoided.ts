/**
 * Cost a plan avoided (plan item 4.3, D8): plans pay in what they save.
 *
 * Only where a plan's effect lowers a cost the plant books is anything
 * credited, and only from the closed shift's own ledger:
 * - energy: the Chronicle's energy multiplier scales the kW the tick books
 *   (UnifiedGameTick passes `totalEnergyKw * chronicleEffect.energyMultiplier`
 *   to tickCampaign, which books the energy line from it). The shift's booked
 *   energy without the plans is `energyCost / m`, `m` the plans' product, so
 *   they avoided `energyCost * (1 / m - 1)`.
 * - wear: the wear multiplier scales wear accrual (UnifiedGameTick), and wear
 *   is what calls for a service (one part) or ends in a breakdown (a work
 *   order). The shift's parts and work orders without the plans would have
 *   been `/ w` as large, so they avoided `(maintenanceCost + partsCost) * (1 / w - 1)`.
 * Production, quality and forecast or crop relief lower no booked cost (the
 * dock sets the tonnes; quality and incidents are priced elsewhere), so those
 * plans earn nothing here (docs/CHRONICLE.md, "Plans as investments").
 *
 * The Chronicle creates no goods or revenue (rule 1): this is a cost the plant
 * did not book, credited to the fund at the full rate (`CURRENCY_TO_FUND`,
 * without the reinvestment share), split between the plans that avoided it in
 * proportion to their own effect.
 */
import { improvementById } from './plans';
import type { ImprovementProgress } from './types';

export interface AvoidedLedger {
  energyCost: number;
  maintenanceCost: number;
  partsCost?: number;
}

function scaled(value: number | undefined, scale: number): number {
  return value === undefined ? 1 : 1 + (value - 1) * scale;
}

/** Plant currency each installed plan avoided in one closed shift, by plan id. */
export function avoidedByPlan(
  improvements: readonly ImprovementProgress[],
  ledger: AvoidedLedger
): Record<string, number> {
  const installed = improvements.flatMap((progress) => {
    if (progress.phase !== 'installed') return [];
    const plan = improvementById(progress.id);
    if (!plan) return [];
    const scale = progress.effectScale ?? 1;
    return [
      {
        id: plan.id,
        energy: scaled(plan.effect.energy, scale),
        wear: scaled(plan.effect.wear, scale),
      },
    ];
  });
  const out: Record<string, number> = {};
  const share = (key: 'energy' | 'wear', booked: number) => {
    const savers = installed.filter((plan) => plan[key] > 0 && plan[key] < 1);
    if (!savers.length || !(booked > 0)) return;
    const product = savers.reduce((m, plan) => m * plan[key], 1);
    const total = booked * (1 / product - 1);
    const weights = savers.map((plan) => 1 / plan[key] - 1);
    const sum = weights.reduce((s, w) => s + w, 0);
    savers.forEach((plan, i) => {
      out[plan.id] = (out[plan.id] ?? 0) + (total * weights[i]) / sum;
    });
  };
  share('energy', Math.max(0, ledger.energyCost));
  share('wear', Math.max(0, ledger.maintenanceCost) + Math.max(0, ledger.partsCost ?? 0));
  return out;
}
