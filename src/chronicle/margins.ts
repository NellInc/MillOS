/**
 * Quality margins as numbers (plan item 4.6, report 07 P4): for each recipe,
 * the stamp the plant puts on its flour now against the recipe's minimum, for
 * example "strong white 93.9 / 95" in a wet year. The stamp is the line's own
 * (`productPathQuality` of the running units, as the tick stamps it: 99.5 on
 * an unworn line, 97.6 to 99.2 on a serviced one; the caller passes it in so
 * this module does not load the tick) less what the chronicle takes off for
 * that recipe’s grain and what open incidents take off (fix-up b of 4c: it was
 * read from the 99.5 ceiling, so the card could show green on flour that would
 * not load).
 */
import { MILL_RECIPES } from '../stores/operationsCampaignStore';
import { chronicleEffect } from './effects';
import { cropTreatmentMoot, effectInput, type ChronicleState } from './engine';
import { IMPROVEMENTS } from './plans';
import type { ImprovementId, ImprovementProgress } from './types';

export interface QualityMargin {
  recipe: 'strong_white' | 'community_flour' | 'fine_semolina';
  best: number;
  minimum: number;
}

/** Strictest first. */
const RECIPES = ['strong_white', 'community_flour', 'fine_semolina'] as const;

/** What would lift an out-of-reach recipe back over its minimum this year. */
export type Restorer =
  | { kind: 'incident' }
  // Wear alone keeps it short: servicing the line lifts the stamp to the ceiling.
  | { kind: 'service' }
  | { kind: 'treatment' }
  // A wet year's wheat dried before it is tempered (the temper card, plan item 7.7).
  | { kind: 'temper' }
  | { kind: 'plan'; id: ImprovementId };

/**
 * Chronicle rule 4 for the crop year: a recipe the year puts out of reach
 * names the ways back the game offers. Each is tried on the state and kept only
 * if, alone, it brings every out-of-reach recipe's best stamp to its minimum:
 * treating this year's grain (the treat button, a sprouted year's), drying a
 * wet year's wheat first on the temper card, or installing a plan not yet
 * installed (moisture meters, the grain dryer, the blending bins).
 */
export function restorers(
  state: ChronicleState,
  stamp: number,
  incidentPenalty = 0,
  /** The unworn line's stamp; above `stamp`, servicing is a way back. */
  ceiling = stamp,
  wheatPenalty?: WheatPenalty
): Restorer[] {
  const short = qualityMargins(state, stamp, incidentPenalty, wheatPenalty).filter(
    (margin) => margin.best < margin.minimum
  );
  if (!short.length || !state.crop) return [];
  const lifts = (next: ChronicleState, at = stamp) => {
    const after = qualityMargins(next, at, incidentPenalty, wheatPenalty);
    return short.every((margin) => {
      const now = after.find((m) => m.recipe === margin.recipe)!;
      return now.best >= now.minimum;
    });
  };
  const found: Restorer[] = [];
  // An incident's points last until it is recovered, which restores them.
  if (incidentPenalty > 0) {
    const clear = qualityMargins(state, stamp, 0, wheatPenalty);
    if (short.every((m) => clear.find((c) => c.recipe === m.recipe)!.best >= m.minimum))
      found.push({ kind: 'incident' });
  }
  if (ceiling > stamp && lifts(state, ceiling)) found.push({ kind: 'service' });
  if (!cropTreatmentMoot(state) && lifts({ ...state, crop: { ...state.crop, treated: true } }))
    found.push({ kind: 'treatment' });
  if (
    state.crop.kind === 'wet' &&
    !state.crop.treated &&
    state.crop.temper?.inForce !== 'dry-first' &&
    lifts({ ...state, crop: { ...state.crop, temper: { inForce: 'dry-first', schedule: [] } } })
  )
    found.push({ kind: 'temper' });
  for (const plan of IMPROVEMENTS) {
    if (state.improvements.some((p) => p.id === plan.id && p.phase === 'installed')) continue;
    if (!(plan.effect.qualityPenalty && plan.effect.qualityPenalty < 0) && !plan.cropRelief)
      continue;
    const installed: ImprovementProgress = {
      id: plan.id,
      phase: 'installed',
      contractorId: null,
      startedShift: state.shift,
      completesShift: state.shift,
      paidFund: 0,
      effectScale: 1,
      initiatedBy: 'player',
    };
    const others = state.improvements.filter((p) => p.id !== plan.id);
    if (lifts({ ...state, improvements: [...others, installed] }))
      found.push({ kind: 'plan', id: plan.id });
  }
  return found;
}

/**
 * The Chronicle's penalty on wheat flour for a state. Under a charter the
 * plant stamps each portion from the grain it was milled from
 * (simulation/lotQuality.ts), so the caller passes a reader of that grain;
 * absent, the year in force's plant-wide figure.
 */
export type WheatPenalty = (state: ChronicleState) => number;

export function qualityMargins(
  state: ChronicleState,
  stamp: number,
  incidentPenalty = 0,
  wheatPenalty?: WheatPenalty
): QualityMargin[] {
  const input = effectInput(state);
  return RECIPES.map((recipe) => {
    const definition = MILL_RECIPES[recipe];
    const wheat = definition.sourceMaterial === 'wheat_grain';
    const chronicle =
      wheat && wheatPenalty ? wheatPenalty(state) : chronicleEffect(input, wheat).qualityPenalty;
    const penalty = chronicle + Math.max(0, incidentPenalty);
    return {
      recipe,
      best: Math.round(Math.max(0, stamp - penalty) * 10) / 10,
      minimum: definition.minimumQuality,
    };
  });
}
