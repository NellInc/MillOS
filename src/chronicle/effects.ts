/**
 * Combines every active Chronicle modifier into the one effect the central
 * tick applies: charter, eras reached, installed plans (scaled by their
 * contractor), timed event modifiers, austerity and the crop year.
 */
import { charterWearMultiplier } from './charter';
import { cropWheatPenalty } from './cropYears';
import { ERAS, eraById, improvementById } from './plans';
import type {
  Charter,
  ChronicleEffect,
  CropKind,
  CropYearState,
  EraId,
  ImprovementProgress,
  ModifierValues,
  TimedModifier,
} from './types';

export const NEUTRAL_EFFECT: Readonly<ChronicleEffect> = Object.freeze({
  productionMultiplier: 1,
  energyMultiplier: 1,
  wearMultiplier: 1,
  qualityPenalty: 0,
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
}

interface Totals {
  production: number;
  energy: number;
  wear: number;
  qualityPenalty: number;
  reinvestment: number;
  forecastChance: number;
  upkeep: number;
}

function scaled(value: number | undefined, scale: number): number | undefined {
  return value === undefined ? undefined : 1 + (value - 1) * scale;
}

function apply(totals: Totals, values: ModifierValues, scale = 1): void {
  const production = scaled(values.production, scale);
  const energy = scaled(values.energy, scale);
  const wear = scaled(values.wear, scale);
  const upkeep = scaled(values.upkeep, scale);
  if (production !== undefined) totals.production *= production;
  if (energy !== undefined) totals.energy *= energy;
  if (wear !== undefined) totals.wear *= wear;
  if (upkeep !== undefined) totals.upkeep *= upkeep;
  totals.qualityPenalty += (values.qualityPenalty ?? 0) * scale;
  totals.reinvestment += (values.reinvestment ?? 0) * scale;
  totals.forecastChance += (values.forecastChance ?? 0) * scale;
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
  };
  if (!input.charter) return totals;
  totals.wear *= charterWearMultiplier(input.charter.plant);
  const reached = eraById(input.era).order;
  for (const era of ERAS) if (era.order <= reached) apply(totals, era.bonus);
  for (const progress of input.improvements) {
    if (progress.phase !== 'installed') continue;
    const plan = improvementById(progress.id);
    if (plan) apply(totals, plan.effect, progress.effectScale);
  }
  for (const modifier of input.modifiers) apply(totals, modifier);
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
    productionMultiplier: clamp(totals.production, 0.7, 1.15),
    energyMultiplier: clamp(totals.energy, 0.8, 1.2),
    wearMultiplier: clamp(totals.wear, 0.6, 1.6),
    qualityPenalty: clamp(totals.qualityPenalty + crop, 0, 12),
  };
}
