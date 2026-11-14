/**
 * The `dispatch` proposal (plan item 3.4, D6): a truck is at the dock for the
 * active order, and flour that would have gone to it is under its minimum.
 * That flour is never loaded for it; the question is the truck's.
 *
 * - send (the partner's choice): the truck leaves with what the other open
 *   order takes, the off-spec flour among it; the active order waits for the
 *   next truck.
 * - hold: the truck waits at the dock, up to DISPATCH_HOLD_MINUTES, for flour
 *   that meets the active order's minimum to be packed and tested, then
 *   leaves; the flour aboard waits with it.
 *
 * Both are priced in the minutes the active order waits and whether that
 * makes it late (a grade risk). No retest is offered: the stamp a test reads
 * is the stamp the batch was packed at, so a second test could not differ.
 *
 * Pure and registered in partnerProposals.ts PROPOSAL_KINDS; this file
 * imports only types from there, so the registry may import it.
 */
import type {
  OptionPrice,
  PartnerProposal,
  PlantWorld,
  ProposalKindDefinition,
  ProposalReason,
} from './partnerProposals';

/** A dispatch proposal waits 10 game minutes; the truck holds while it is open. */
export const DISPATCH_WINDOW_MINUTES = 10;
/** The longest a held truck waits for in-spec flour. */
export const DISPATCH_HOLD_MINUTES = 45;
/**
 * Game minutes from one shipping departure to the next truck's loading, as
 * measured: about 5.9 departures in a 480-minute shift at pace 30 (plan,
 * "What would make the line matter"), so about 80.
 */
export const NEXT_TRUCK_MINUTES = 80;

export interface DispatchFacts {
  /** The shipping cycle the truck is on (the campaign's dispatchLoad.cycleId). */
  cycleId: string;
  orderId: string;
  customer: string;
  recipeId: string;
  minimumQuality: number;
  /** What the active order still owes, kg. */
  owedKg: number;
  /** Game minutes to its due time; negative once overdue. */
  dueInMinutes: number;
  /** Tested flour of its product under its minimum that the other order takes, kg. */
  heldKg: number;
  toOrderId: string;
  toCustomer: string;
  toRecipeId: string;
  /** The quality the line packs now: flour packed meanwhile is stamped with it. */
  qualityNow: number;
  /** Game minutes for in-spec flour to be packed and tested, at the line's rate. */
  inSpecMinutes: number;
  nextTruckMinutes: number;
  holdMinutes: number;
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

/** Minutes the active order waits under each answer. */
export function dispatchWaitMinutes(facts: DispatchFacts, optionId: string): number {
  const nextTruck = Math.max(0, finite(facts.nextTruckMinutes));
  if (optionId !== 'hold') return nextTruck;
  const hold = Math.max(0, finite(facts.holdMinutes));
  const coming =
    facts.qualityNow >= facts.minimumQuality - 1e-6 &&
    finite(facts.inSpecMinutes, Infinity) <= hold;
  // In spec within the hold: it leaves on this truck. Otherwise the hold is
  // spent and the order still waits for the next one.
  return coming ? Math.max(0, finite(facts.inSpecMinutes)) : hold + nextTruck;
}

export const dispatchKind: ProposalKindDefinition<'dispatch'> = {
  kind: 'dispatch',
  windowMinutes: DISPATCH_WINDOW_MINUTES,
  optionIds: ['send', 'hold'],
  defaultOptionId: 'send',
  raise(world: PlantWorld) {
    const offer = world.dispatch;
    if (!offer) return [];
    return [
      {
        subject: `dispatch-${offer.orderId}-${offer.cycleId}`,
        facts: { ...offer, holdMinutes: DISPATCH_HOLD_MINUTES },
      },
    ];
  },
  price(optionId, facts) {
    const minutes = dispatchWaitMinutes(facts, optionId);
    const owed = Math.max(0, finite(facts.owedKg));
    return {
      ...ZERO,
      // Send: what the active order still owes waits for the next truck.
      // Hold: the other order's flour waits at the dock with the truck.
      kg: Math.round(optionId === 'hold' ? Math.max(0, finite(facts.heldKg)) : owed),
      minutes,
      quality: facts.qualityNow,
      gradeRisk: owed > 0 && finite(facts.dueInMinutes) < minutes,
    };
  },
  effect() {
    // The hold is read from the resolved proposal itself by the tick
    // (dispatchHoldsTruck); neither answer writes anything else.
    return { type: 'none' };
  },
  settle(proposal: PartnerProposal<'dispatch'>, world: PlantWorld) {
    // The truck left, or the question went away (the order was met, or the
    // off-spec flour shipped or was recalled): nothing is left to decide.
    const now = world.dispatch;
    if (world.dispatchCycleId !== proposal.facts.cycleId) return { type: 'withdrawn' };
    if (!now || now.orderId !== proposal.facts.orderId) return { type: 'withdrawn' };
    return null;
  },
  outcome(proposal: PartnerProposal<'dispatch'>, world: PlantWorld) {
    // An hour on: the quality the line then packed says whether in-spec flour
    // could have come within the hold.
    return {
      ...proposal.facts,
      qualityNow:
        typeof world.lineQuality === 'number' && Number.isFinite(world.lineQuality)
          ? world.lineQuality
          : proposal.facts.qualityNow,
    };
  },
  reason(facts): ProposalReason {
    return {
      key: 'reasonDispatch',
      params: { customer: facts.customer, minimum: facts.minimumQuality, kg: facts.heldKg },
    };
  },
};

/**
 * Whether a resolved `hold` keeps the truck on `cycleId` at the dock now: an
 * open dispatch proposal for that cycle holds it until answered, and a hold
 * answer holds it for DISPATCH_HOLD_MINUTES from the answer.
 */
export function dispatchHoldsTruck(
  proposals: readonly PartnerProposal[],
  cycleId: string,
  minute: number
): boolean {
  return proposals.some((proposal) => {
    if (proposal.kind !== 'dispatch') return false;
    const facts = proposal.facts as DispatchFacts;
    if (facts.cycleId !== cycleId) return false;
    if (proposal.status === 'open') return true;
    return (
      proposal.status === 'resolved' &&
      proposal.resolution?.optionId === 'hold' &&
      proposal.resolution.ran &&
      minute < proposal.resolution.atMinute + facts.holdMinutes
    );
  });
}

/** Saved facts, re-read field by field; null when this build cannot read them. */
export function sanitizeDispatchFacts(value: Record<string, unknown>): DispatchFacts | null {
  const strings = [
    'cycleId',
    'orderId',
    'customer',
    'recipeId',
    'toOrderId',
    'toCustomer',
    'toRecipeId',
  ] as const;
  const numbers = [
    'minimumQuality',
    'owedKg',
    'dueInMinutes',
    'heldKg',
    'qualityNow',
    'inSpecMinutes',
    'nextTruckMinutes',
    'holdMinutes',
  ] as const;
  if (!strings.every((key) => typeof value[key] === 'string')) return null;
  if (!numbers.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])))
    return null;
  const facts = {} as Record<string, string | number>;
  for (const key of [...strings, ...numbers]) facts[key] = value[key] as string | number;
  return facts as unknown as DispatchFacts;
}
