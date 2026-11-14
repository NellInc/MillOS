/**
 * Combines every active Chronicle modifier into the one effect the central
 * tick applies: charter, eras reached, installed plans (scaled by their
 * contractor), timed event modifiers, austerity and the crop year.
 */
import { charterWearMultiplier } from './charter';
import { cropWheatPenalty } from './cropYears';
import { conditionValues, policyValues } from './governance';
import { ERAS, eraById, improvementById } from './plans';
import type {
  Charter,
  ChronicleEffect,
  CropKind,
  CropYearState,
  EraId,
  ImprovementProgress,
  ModifierValues,
  Policies,
  StandingCondition,
  TimedModifier,
} from './types';

export const NEUTRAL_EFFECT: Readonly<ChronicleEffect> = Object.freeze({
  productionMultiplier: 1,
  energyMultiplier: 1,
  wearMultiplier: 1,
  qualityPenalty: 0,
  dryingEnergyMultiplier: 1,
});

export const AUSTERITY_EFFECT = {
  production: 0.92,
  wear: 1.2,
  upkeep: 0.5,
} as const;

export interface EffectInput {
  charter: Charter | null;
  era: EraId;
  improvements: readonly ImprovementProgress[];
  modifiers: readonly TimedModifier[];
  austerity: boolean;
  crop: CropYearState | null;
  /** Part three (docs/CHRONICLE.md, systems 25-27). Absent reads as none. */
  policies?: Policies;
  conditions?: readonly StandingCondition[];
  /** The charter's tired machinery has been renewed: its wear no longer applies. */
  machineryRenewed?: boolean;
}

interface Totals {
  production: number;
  energy: number;
  wear: number;
  qualityPenalty: number;
  reinvestment: number;
  forecastChance: number;
  upkeep: number;
  /** Multiplier on the temper card's drying energy (plan item 7.7). */
  dryingEnergy: number;
  /** The lowest production ceiling any standing condition sets. */
  productionCeiling: number;
}

function scaled(value: number | undefined, scale: number): number | undefined {
  return value === undefined ? undefined : 1 + (value - 1) * scale;
}

function apply(totals: Totals, values: ModifierValues, scale = 1): void {
  const production = scaled(values.production, scale);
  const energy = scaled(values.energy, scale);
  const wear = scaled(values.wear, scale);
  const upkeep = scaled(values.upkeep, scale);
  const drying = scaled(values.dryingEnergy, scale);
  if (production !== undefined) totals.production *= production;
  if (energy !== undefined) totals.energy *= energy;
  if (wear !== undefined) totals.wear *= wear;
  if (upkeep !== undefined) totals.upkeep *= upkeep;
  if (drying !== undefined) totals.dryingEnergy *= drying;
  totals.qualityPenalty += (values.qualityPenalty ?? 0) * scale;
  totals.reinvestment += (values.reinvestment ?? 0) * scale;
  totals.forecastChance += (values.forecastChance ?? 0) * scale;
  if (values.productionCeiling !== undefined)
    totals.productionCeiling = Math.min(totals.productionCeiling, values.productionCeiling);
}

/** Every modifier summed, before the plant-facing clamp. */
export function chronicleTotals(input: EffectInput): Totals {
  const totals: Totals = {
    production: 1,
    energy: 1,
    wear: 1,
    qualityPenalty: 0,
    reinvestment: 0,
    forecastChance: 0,
    upkeep: 1,
    dryingEnergy: 1,
    productionCeiling: Infinity,
  };
  if (!input.charter) return totals;
  if (!(input.machineryRenewed && input.charter.plant === 'tired'))
    totals.wear *= charterWearMultiplier(input.charter.plant);
  const reached = eraById(input.era).order;
  for (const era of ERAS) if (era.order <= reached) apply(totals, era.bonus);
  for (const progress of input.improvements) {
    if (progress.phase !== 'installed') continue;
    const plan = improvementById(progress.id);
    if (plan) apply(totals, plan.effect, progress.effectScale);
  }
  for (const modifier of input.modifiers) apply(totals, modifier);
  if (input.policies) for (const values of policyValues(input.policies)) apply(totals, values);
  if (input.conditions)
    for (const values of conditionValues(input.conditions)) apply(totals, values);
  if (input.austerity) {
    totals.production *= AUSTERITY_EFFECT.production;
    totals.wear *= AUSTERITY_EFFECT.wear;
    totals.upkeep *= AUSTERITY_EFFECT.upkeep;
  }
  return totals;
}

/** Crop kinds whose penalty an installed plan removes. */
export function relievedCropKinds(improvements: readonly ImprovementProgress[]): CropKind[] {
  const kinds = new Set<CropKind>();
  for (const progress of improvements) {
    if (progress.phase !== 'installed') continue;
    for (const kind of improvementById(progress.id)?.cropRelief ?? []) kinds.add(kind);
  }
  return [...kinds];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 1));
}

/**
 * The plant-facing effect. `wheatRecipe` is whether the active production plan
 * mills wheat; the crop-year penalty applies only then.
 */
export function chronicleEffect(input: EffectInput, wheatRecipe: boolean): ChronicleEffect {
  if (!input.charter) return NEUTRAL_EFFECT;
  const totals = chronicleTotals(input);
  const crop = wheatRecipe
    ? cropWheatPenalty(input.crop, relievedCropKinds(input.improvements))
    : 0;
  return {
    productionMultiplier: clamp(Math.min(totals.production, totals.productionCeiling), 0.7, 1.15),
    energyMultiplier: clamp(totals.energy, 0.8, 1.2),
    wearMultiplier: clamp(totals.wear, 0.6, 1.6),
    qualityPenalty: clamp(totals.qualityPenalty + crop, 0, 12),
    // Nothing the Chronicle does makes drying dearer, and it cannot be paid for.
    dryingEnergyMultiplier: clamp(totals.dryingEnergy, 0, 1),
  };
}
