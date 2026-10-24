/**
 * Site charter: the start options (Predynastic Egypt's four columns of perks,
 * Old Kingdom's game parameters). Harder choices add to the final score.
 */
import type {
  Charter,
  CharterTier,
  ChronicleMode,
  CropKind,
  CustomerTemper,
  Fortune,
  GrainSupply,
  PlantCondition,
} from './types';

export interface CharterOption<T extends string> {
  id: T;
  label: string;
  tier: CharterTier;
  effect: string;
  score: number;
}

export interface CharterColumn<T extends string> {
  key: keyof Omit<Charter, 'seed'>;
  label: string;
  options: readonly CharterOption<T>[];
}

export const GRAIN_OPTIONS: readonly CharterOption<GrainSupply>[] = [
  {
    id: 'cooperative',
    label: 'Cooperative growers',
    tier: 'beginner',
    effect: 'steady crop years',
    score: 0,
  },
  {
    id: 'open_market',
    label: 'Open market',
    tier: 'historical',
    effect: 'crop years vary',
    score: 1,
  },
  {
    id: 'marginal',
    label: 'Marginal harvests',
    tier: 'hard',
    effect: 'poor years are common',
    score: 2,
  },
];

export const PLANT_OPTIONS: readonly CharterOption<PlantCondition>[] = [
  {
    id: 'overhauled',
    label: 'Recently overhauled',
    tier: 'beginner',
    effect: 'wear x0.85, fund 300',
    score: 0,
  },
  {
    id: 'working',
    label: 'Working plant',
    tier: 'historical',
    effect: 'wear x1.00, fund 240',
    score: 1,
  },
  { id: 'tired', label: 'Tired machinery', tier: 'hard', effect: 'wear x1.25, fund 180', score: 2 },
];

export const CUSTOMER_OPTIONS: readonly CharterOption<CustomerTemper>[] = [
  {
    id: 'loyal',
    label: 'Loyal locals',
    tier: 'beginner',
    effect: 'customers start warm',
    score: 0,
  },
  {
    id: 'mixed',
    label: 'Mixed book',
    tier: 'historical',
    effect: 'customers start neutral',
    score: 1,
  },
  {
    id: 'demanding',
    label: 'Demanding buyers',
    tier: 'hard',
    effect: 'customers start cool',
    score: 2,
  },
];

export const FORTUNE_OPTIONS: readonly CharterOption<Fortune>[] = [
  {
    id: 'kind',
    label: 'Kind fortune',
    tier: 'beginner',
    effect: 'good events more often; never two bad in a row',
    score: 0,
  },
  { id: 'even', label: 'Even fortune', tier: 'historical', effect: 'events balanced', score: 1 },
  {
    id: 'hard',
    label: 'Hard fortune',
    tier: 'hard',
    effect: 'bad events more often',
    score: 3,
  },
];

export const MODE_OPTIONS: readonly CharterOption<ChronicleMode>[] = [
  {
    id: 'historical',
    label: 'Historical chronicle',
    tier: 'historical',
    effect: 'trials, events and forecasts',
    score: 0,
  },
  {
    id: 'no_trials',
    label: 'No trials',
    tier: 'beginner',
    effect: 'events and forecasts only',
    score: 0,
  },
  { id: 'sandbox', label: 'Sandbox', tier: 'beginner', effect: 'no events or trials', score: 0 },
];

export const CHARTER_COLUMNS = [
  { key: 'grain', label: 'Grain supply', options: GRAIN_OPTIONS },
  { key: 'plant', label: 'Plant condition', options: PLANT_OPTIONS },
  { key: 'customers', label: 'Customers', options: CUSTOMER_OPTIONS },
  { key: 'fortune', label: 'Fortune', options: FORTUNE_OPTIONS },
  { key: 'mode', label: 'Chronicle', options: MODE_OPTIONS },
] as const;

export const DEFAULT_CHARTER: Omit<Charter, 'seed'> = {
  grain: 'cooperative',
  plant: 'overhauled',
  customers: 'loyal',
  fortune: 'kind',
  mode: 'historical',
};

export function charterScore(charter: Omit<Charter, 'seed'>): number {
  return (
    (GRAIN_OPTIONS.find((o) => o.id === charter.grain)?.score ?? 0) +
    (PLANT_OPTIONS.find((o) => o.id === charter.plant)?.score ?? 0) +
    (CUSTOMER_OPTIONS.find((o) => o.id === charter.customers)?.score ?? 0) +
    (FORTUNE_OPTIONS.find((o) => o.id === charter.fortune)?.score ?? 0)
  );
}

export function charterWearMultiplier(plant: PlantCondition): number {
  return plant === 'overhauled' ? 0.85 : plant === 'tired' ? 1.25 : 1;
}

export function charterStartingRelationship(customers: CustomerTemper): number {
  return customers === 'loyal' ? 72 : customers === 'demanding' ? 30 : 50;
}

/** Base fund units at signing. */
export function charterStartingFund(charter: Omit<Charter, 'seed'>): number {
  return charter.plant === 'tired' ? 180 : charter.plant === 'working' ? 240 : 300;
}

/** Crop-year weights by grain supply. */
export function cropWeights(grain: GrainSupply): Record<CropKind, number> {
  if (grain === 'cooperative') return { typical: 6, bountiful: 2, dry: 1, wet: 1, sprouted: 0 };
  if (grain === 'open_market') return { typical: 4, bountiful: 2, dry: 2, wet: 2, sprouted: 1 };
  return { typical: 3, bountiful: 1, dry: 2, wet: 3, sprouted: 2 };
}

/** Weight multiplier applied to events of each polarity. */
export function fortuneWeights(fortune: Fortune): {
  positive: number;
  negative: number;
  neutral: number;
} {
  if (fortune === 'kind') return { positive: 1.6, negative: 0.7, neutral: 1 };
  if (fortune === 'hard') return { positive: 0.7, negative: 1.6, neutral: 1 };
  return { positive: 1, negative: 1, neutral: 1 };
}

export function fortuneForecastShift(fortune: Fortune): number {
  return fortune === 'kind' ? -0.1 : fortune === 'hard' ? 0.1 : 0;
}

export const TRAINING_MODE = {
  costMultiplier: 0.75,
  forecastShift: -0.25,
  scorePenalty: 2,
} as const;
