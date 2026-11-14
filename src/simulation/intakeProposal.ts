/**
 * The `intake` proposal (plan item 3.1): a grain truck has docked under a
 * signed Chronicle charter and its wheat lot has readings (moisture, protein,
 * falling number). The lot waits at the intake until it is answered.
 *
 * - accept: into the silo the partner names (the emptiest wheat silo, where
 *   every lot went before intake).
 * - blend: into the wheat silo whose grain, mixed with this lot, stamps the
 *   best flour; a silo mixes what it holds, so the blend's readings are the
 *   mass-weighted mean (simulation/lotQuality.ts).
 * - refuse: the truck takes the lot back, at REFUSAL_FEE_HOURS of the
 *   demurrage rate, and with a seeded chance the supplier's next truck comes
 *   REFUSAL_DELAY_MINUTES late.
 *
 * Each answer is priced in what this plant responds to: the stamp flour from
 * that grain would carry against each open flour order's minimum, the fee, and
 * for a refusal whether the wheat left on site covers the flour still owed
 * before the next truck. Grain bought is held as stock at cost until it ships
 * (grainPrice.ts), so accepting costs no net and is not priced in money.
 *
 * Without a charter lots carry no readings and no intake proposal is raised:
 * every delivery goes to the emptiest silo as before. Pure; registered in
 * partnerProposals.ts PROPOSAL_KINDS.
 */
import type { CropAttributes, CropKind } from '../chronicle/types';
import type {
  OptionPrice,
  PartnerProposal,
  PlantWorld,
  PricedOption,
  ProposalKindDefinition,
  ProposalReason,
} from './partnerProposals';

/** A lot waits 10 game minutes at the intake (20 real seconds at the standard pace). */
export const INTAKE_WINDOW_MINUTES = 10;
/** A refusal costs one hour of the yard's demurrage rate (a game price). */
export const REFUSAL_FEE_HOURS = 1;
/** A refused supplier's next truck may come this much later (the delayed-truck incident's delay). */
export const REFUSAL_DELAY_MINUTES = 45;
/** The seeded chance that it does. */
export const REFUSAL_DELAY_CHANCE = 0.5;

export interface IntakeFacts {
  /** The Chronicle's delivery counter for this lot: one proposal per delivery. */
  deliveryIndex: number;
  amountKg: number;
  supplier: string | null;
  cropYear: number;
  cropKind: CropKind;
  moisturePct: number;
  proteinPct: number;
  fallingNumberS: number;
  /** The partner's silo: the emptiest wheat silo. */
  siloId: string;
  /** The wheat silo whose mix stamps best with this lot; null when no other silo has room. */
  blendSiloId: string | null;
  /** The product path's stamp before the grain's term (path quality less incidents). */
  base: number;
  /** Chronicle points flour from each answer's grain would lose. */
  straightPenalty: number;
  blendPenalty: number | null;
  /** Refused: the best wheat already on site. */
  refusePenalty: number;
  /** The open flour orders' minimums, strictest first. */
  openMinimums: number[];
  refusalFee: number;
  /**
   * Refused, the game minutes until the next grain truck when the wheat left
   * on site cannot make the flour still owed; 0 when it can.
   */
  shortMinutes: number;
}

const ZERO: OptionPrice = {
  currency: 0,
  parts: {},
  kg: 0,
  minutes: null,
  quality: null,
  gradeRisk: false,
};

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round1 = (value: number) => Math.round(finite(value) * 10) / 10;

/** The minimums a stamp falls below, strictest first. */
const below = (stamp: number, minimums: readonly number[]) =>
  [...new Set(minimums)].filter((minimum) => stamp < minimum - 1e-6).sort((x, y) => y - x);

export function intakeStamp(facts: IntakeFacts, optionId: string): number {
  const penalty =
    optionId === 'blend'
      ? (facts.blendPenalty ?? facts.straightPenalty)
      : optionId === 'refuse'
        ? facts.refusePenalty
        : facts.straightPenalty;
  return round1(Math.max(0, finite(facts.base) - finite(penalty)));
}

export const intakeKind: ProposalKindDefinition<'intake'> = {
  kind: 'intake',
  windowMinutes: INTAKE_WINDOW_MINUTES,
  optionIds: ['accept', 'blend', 'refuse'],
  defaultOptionId: 'accept',
  raise(world: PlantWorld) {
    const lot = world.intake;
    if (!lot) return [];
    return [{ subject: `intake-${lot.deliveryIndex}`, facts: lot }];
  },
  available(optionId, facts) {
    if (optionId !== 'blend') return true;
    return facts.blendSiloId !== null && facts.blendSiloId !== facts.siloId;
  },
  price(optionId, facts) {
    const stamp = intakeStamp(facts, optionId);
    if (optionId === 'refuse') {
      const short = finite(facts.shortMinutes) > 0;
      // The line's stamp without the lot, and short of wheat for the flour
      // owed, no open flour order is made on time.
      const misses = short
        ? [...new Set(facts.openMinimums)].sort((x, y) => y - x)
        : below(stamp, facts.openMinimums);
      // Part of the price (refuseLot): an even chance, seeded, that the
      // supplier's next truck comes REFUSAL_DELAY_MINUTES late. Short of
      // wheat until that truck, its expected minutes are minutes short.
      const expectedDelay = REFUSAL_DELAY_CHANCE * REFUSAL_DELAY_MINUTES;
      return {
        ...ZERO,
        currency: Math.max(0, Math.round(finite(facts.refusalFee) * 100) / 100),
        kg: Math.round(Math.max(0, finite(facts.amountKg))),
        minutes: short ? Math.round(finite(facts.shortMinutes) + expectedDelay) : null,
        quality: stamp,
        gradeRisk: misses.length > 0,
        belowMinimums: misses,
        truckDelay: { chance: REFUSAL_DELAY_CHANCE, minutes: REFUSAL_DELAY_MINUTES },
      };
    }
    const misses = below(stamp, facts.openMinimums);
    return { ...ZERO, quality: stamp, gradeRisk: misses.length > 0, belowMinimums: misses };
  },
  effect(optionId, facts) {
    if (optionId === 'refuse')
      return {
        type: 'refuse-lot',
        deliveryIndex: facts.deliveryIndex,
        fee: Math.max(0, finite(facts.refusalFee)),
      };
    return {
      type: 'receive-lot',
      siloId: optionId === 'blend' && facts.blendSiloId ? facts.blendSiloId : facts.siloId,
      amountKg: facts.amountKg,
      supplier: facts.supplier,
      crop: lotCrop(facts),
    };
  },
  settle() {
    // The lot waits at the intake until answered; a reset plant drops it.
    return null;
  },
  outcome(proposal: PartnerProposal<'intake'>, world: PlantWorld) {
    // From the branch point (the silos as they stood when the lot docked),
    // with what the hour measured: the line's own stamp and the orders then open.
    const now = world.intakeOutcome;
    if (!now) return proposal.facts;
    return { ...proposal.facts, base: now.base, openMinimums: [...now.openMinimums] };
  },
  reason(facts): ProposalReason {
    return {
      key: 'reasonIntake',
      params: { fallingNumber: facts.fallingNumberS, moisture: facts.moisturePct },
    };
  },
  rank(_optionId, price) {
    return [
      price.gradeRisk ? 1 : 0,
      price.belowMinimums?.length ?? 0,
      Math.round(price.currency * 100) / 100,
      // Minutes short of wheat, the next truck's expected delay in them.
      price.minutes ?? 0,
      price.kg,
    ];
  },
  chooseDefault(options: readonly PricedOption[]) {
    // The partner takes the answer its own prices rank best; on a tie, the
    // first shown (accept, then blend, then refuse).
    let best: PricedOption | null = null;
    for (const option of options)
      if (
        !best ||
        compareRank(
          intakeKind.rank!(option.id, option.price),
          intakeKind.rank!(best.id, best.price)
        ) < 0
      )
        best = option;
    return best?.id ?? 'accept';
  },
};

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** The lot's readings as the material store stamps them. */
export function lotCrop(facts: IntakeFacts): CropAttributes {
  return {
    cropYear: facts.cropYear,
    kind: facts.cropKind,
    moisturePct: facts.moisturePct,
    proteinPct: facts.proteinPct,
    fallingNumberS: facts.fallingNumberS,
  };
}

/**
 * Whether a refused supplier's next truck comes late: seeded by the charter's
 * seed and the refused delivery's index, never Math.random.
 */
export function refusalDelays(
  seed: number,
  deliveryIndex: number,
  unit: (s: number, i: number) => number
) {
  return unit(seed, deliveryIndex) < REFUSAL_DELAY_CHANCE;
}

const CROP_KINDS: readonly CropKind[] = ['typical', 'bountiful', 'dry', 'wet', 'sprouted'];

/** Saved facts, re-read field by field; null when this build cannot read them. */
export function sanitizeIntakeFacts(value: Record<string, unknown>): IntakeFacts | null {
  const num = (key: string) => typeof value[key] === 'number' && Number.isFinite(value[key]);
  const numbers = [
    'deliveryIndex',
    'amountKg',
    'cropYear',
    'moisturePct',
    'proteinPct',
    'fallingNumberS',
    'base',
    'straightPenalty',
    'refusePenalty',
    'refusalFee',
    'shortMinutes',
  ];
  if (!numbers.every(num)) return null;
  if (typeof value.siloId !== 'string') return null;
  if (!CROP_KINDS.includes(value.cropKind as CropKind)) return null;
  if (!Array.isArray(value.openMinimums) || !value.openMinimums.every((m) => typeof m === 'number'))
    return null;
  return {
    deliveryIndex: value.deliveryIndex as number,
    amountKg: value.amountKg as number,
    supplier: typeof value.supplier === 'string' ? value.supplier : null,
    cropYear: value.cropYear as number,
    cropKind: value.cropKind as CropKind,
    moisturePct: value.moisturePct as number,
    proteinPct: value.proteinPct as number,
    fallingNumberS: value.fallingNumberS as number,
    siloId: value.siloId,
    blendSiloId: typeof value.blendSiloId === 'string' ? value.blendSiloId : null,
    base: value.base as number,
    straightPenalty: value.straightPenalty as number,
    blendPenalty: num('blendPenalty') ? (value.blendPenalty as number) : null,
    refusePenalty: value.refusePenalty as number,
    openMinimums: [...(value.openMinimums as number[])],
    refusalFee: value.refusalFee as number,
    shortMinutes: value.shortMinutes as number,
  };
}
