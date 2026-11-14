/**
 * The `temper` proposal (plan item 7.7): under a signed Chronicle charter,
 * once a shift, when the wheat the line will be fed reads wet (any wheat
 * silo's grain, simulation/lotQuality.ts WET_MOISTURE_PCT, read as the stamp
 * reads it: systems/temperRuntime.ts temperWorld), the partner asks how the
 * shift's wheat is tempered (chronicle/temper.ts):
 *
 * - standard: tempered as it comes; flour from it carries the wet year's
 *   points (cropYears.ts).
 * - dry-first: dried first, then tempered; flour from it carries none, at the
 *   energy the drying books (the drying energy at the tariff now, less what a
 *   hired dryer saves).
 *
 * An answer reaches the rolls after the plant's 2-hour rest; an answer that
 * changes the temper at the rolls says so on its button. Each answer is priced
 * in what this plant responds to: the stamp its worst flour would carry at the
 * end of the wheat it covers against every open flour order's minimum, and the
 * money the drying books.
 *
 * Once a shift, not once a lot: a lot is taken in about every two game hours,
 * and the intake card already asks about each one, so a card per lot would
 * double the cards for one decision the plant takes per shift's wheat. Without
 * a charter no temper proposal is raised. Pure; registered in
 * partnerProposals.ts PROPOSAL_KINDS.
 */
import { TEMPER_OPTION_IDS, TEMPER_REST_MINUTES } from '../chronicle/temper';
import type { TemperOptionId } from '../chronicle/types';
import type {
  OptionPrice,
  PartnerProposal,
  PlantWorld,
  PricedOption,
  ProposalKindDefinition,
  ProposalReason,
} from './partnerProposals';

/** A temper card waits 20 game minutes (40 real seconds at the standard pace). */
export const TEMPER_WINDOW_MINUTES = 20;

export interface TemperFacts {
  /** The Chronicle's closed shifts when raised: one card per shift. */
  shiftIndex: number;
  cropYear: number;
  /** The moisture of the wettest silo's wheat that drying would help (%). */
  moisturePct: number;
  /**
   * The product path's stamp before the grain's term (path quality less
   * incidents), brought forward to the end of the wheat an answer covers
   * (systems/temperRuntime.ts temperWorld).
   */
  base: number;
  /** The Chronicle's penalty on the worst silo's flour, tempered as it comes. */
  standardPenalty: number;
  /** The same, dried first. */
  driedPenalty: number;
  /** The open flour orders' minimums, strictest first. */
  openMinimums: number[];
  /** What drying the shift's wheat books, in the ledger's money. */
  dryingCost: number;
  /** The energy it takes (kWh). */
  dryingKwh: number;
  /** The temper at the rolls when raised. */
  inForce: TemperOptionId;
}

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round1 = (value: number) => Math.round(finite(value) * 10) / 10;
const round2 = (value: number) => Math.round(finite(value) * 100) / 100;

/** The minimums a stamp falls below, strictest first. */
const below = (stamp: number, minimums: readonly number[]) =>
  [...new Set(minimums)].filter((minimum) => stamp < minimum - 1e-6).sort((x, y) => y - x);

/** The stamp an answer's flour carries, unrounded: what an order's minimum is checked against. */
function rawStamp(facts: TemperFacts, optionId: string): number {
  const penalty = optionId === 'dry-first' ? facts.driedPenalty : facts.standardPenalty;
  return Math.max(0, finite(facts.base) - finite(penalty));
}

/** The stamp an answer's flour carries, as the card shows it (one decimal). */
export function temperStamp(facts: TemperFacts, optionId: string): number {
  return round1(rawStamp(facts, optionId));
}

export const temperKind: ProposalKindDefinition<'temper'> = {
  kind: 'temper',
  windowMinutes: TEMPER_WINDOW_MINUTES,
  optionIds: TEMPER_OPTION_IDS,
  defaultOptionId: 'standard',
  raise(world: PlantWorld) {
    const facts = world.temper?.raise;
    if (!facts) return [];
    return [{ subject: `temper-${facts.cropYear}-${facts.shiftIndex}`, facts }];
  },
  price(optionId, facts): OptionPrice {
    const stamp = temperStamp(facts, optionId);
    // Judged unrounded, as the plant checks a batch against an order: 94.96
    // shows as 95.0 and still misses 95.
    const misses = below(rawStamp(facts, optionId), facts.openMinimums);
    return {
      currency: optionId === 'dry-first' ? Math.max(0, round2(facts.dryingCost)) : 0,
      parts: {},
      kg: 0,
      minutes: null,
      quality: stamp,
      gradeRisk: misses.length > 0,
      belowMinimums: misses,
      // A change of temper reaches the rolls after the rest.
      waitMinutes: optionId === facts.inForce ? 0 : TEMPER_REST_MINUTES,
    };
  },
  effect(optionId, facts) {
    const option: TemperOptionId = optionId === 'dry-first' ? 'dry-first' : 'standard';
    return {
      type: 'temper',
      option,
      kwh: option === 'dry-first' ? Math.max(0, finite(facts.dryingKwh)) : 0,
      cost: option === 'dry-first' ? Math.max(0, round2(facts.dryingCost)) : 0,
      // The card, so a second answer after a reload books nothing twice.
      key: `temper-${facts.cropYear}-${facts.shiftIndex}`,
    };
  },
  settle(_proposal, world) {
    // The charter ended or the plant reset: nothing is left to temper for it.
    return world.temper === null ? { type: 'withdrawn' } : null;
  },
  outcome(proposal: PartnerProposal<'temper'>, world: PlantWorld) {
    // From the branch point (the grain as it read when raised), with what the
    // hour measured: the line's own stamp and the orders then open.
    const now = world.temper?.outcome;
    if (!now) return proposal.facts;
    return { ...proposal.facts, base: now.base, openMinimums: [...now.openMinimums] };
  },
  reason(facts): ProposalReason {
    return { key: 'reasonTemper', params: { moisture: facts.moisturePct } };
  },
  rank(_optionId, price) {
    return [
      price.gradeRisk ? 1 : 0,
      price.belowMinimums?.length ?? 0,
      round2(price.currency),
      price.waitMinutes ?? 0,
    ];
  },
  chooseDefault(options: readonly PricedOption[]) {
    // The partner takes the answer its own prices rank best; on a tie, the
    // first shown (the standard temper).
    let best: PricedOption | null = null;
    for (const option of options)
      if (
        !best ||
        compareRank(
          temperKind.rank!(option.id, option.price),
          temperKind.rank!(best.id, best.price)
        ) < 0
      )
        best = option;
    return best?.id ?? 'standard';
  },
};

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** Saved facts, re-read field by field; null when this build cannot read them. */
export function sanitizeTemperFacts(value: Record<string, unknown>): TemperFacts | null {
  const num = (key: string) => typeof value[key] === 'number' && Number.isFinite(value[key]);
  const numbers = [
    'shiftIndex',
    'cropYear',
    'moisturePct',
    'base',
    'standardPenalty',
    'driedPenalty',
    'dryingCost',
    'dryingKwh',
  ];
  if (!numbers.every(num)) return null;
  if (!(TEMPER_OPTION_IDS as readonly unknown[]).includes(value.inForce)) return null;
  if (!Array.isArray(value.openMinimums) || !value.openMinimums.every((m) => typeof m === 'number'))
    return null;
  return {
    shiftIndex: value.shiftIndex as number,
    cropYear: value.cropYear as number,
    moisturePct: value.moisturePct as number,
    base: value.base as number,
    standardPenalty: value.standardPenalty as number,
    driedPenalty: value.driedPenalty as number,
    openMinimums: [...(value.openMinimums as number[])],
    dryingCost: value.dryingCost as number,
    dryingKwh: value.dryingKwh as number,
    inForce: value.inForce as TemperOptionId,
  };
}
