import type { CustomerOrder } from '../stores/operationsCampaignStore';

/**
 * The delivery programmes a player accepts after the first. Pure and
 * deterministic: the same programme number and shift always give the same
 * commitments, so a shift is replayable and its review comparable.
 *
 * Every programme carries the same three customers (there are no others), but
 * not the same day: which customer is the rush rotates with the programme
 * number, a night programme carries a larger bulk order with more time, and
 * each programme has one choice the card names. The rush pays more but is due
 * soon and costs double the usual late penalty; the controller runs it first.
 * When the rush is the only order on its grain, running it first means
 * changing the line over to that grain and back, and choosing another
 * commitment first keeps the line on its grain at the risk of the rush
 * running late.
 *
 * Feasibility: every deadline asks for no more kilograms per minute than the
 * first programme's guided delivery (6,000 kg in 240 min from a cold start,
 * 25 kg/min), which the real-truck journey test meets at standard pace.
 * Working if programmes.test.ts pins that ratio for every programme and shift
 * and UnifiedGameTick.playableJourney.test.ts delivers programmes 2 to 4 on
 * time through real truck travel at pace 30.
 */

export type ProgrammeShift = 'morning' | 'afternoon' | 'night';

/** A one-truck rush: due soon, paid more, late at twice the usual rate. */
export const PROGRAMME_RUSH = {
  kg: 2500,
  windowMinutes: 150,
  premiumPercent: 30,
  latePenaltyFactor: 2,
} as const;
/** The second commitment, at its customer's usual terms. */
export const PROGRAMME_STANDARD = { kg: 3000, windowMinutes: 300 } as const;
/** A two-truck bulk order; larger, with more time, on the night shift. */
export const PROGRAMME_BULK = {
  kg: 6000,
  windowMinutes: 420,
  nightKg: 8000,
  nightWindowMinutes: 540,
} as const;

/** The shift a window key names (`day-N-<shift>`); morning when unknown. */
export function programmeShift(shiftKey: string | null | undefined): ProgrammeShift {
  const shift = shiftKey?.split('-').at(-1);
  return shift === 'afternoon' || shift === 'night' ? shift : 'morning';
}

const roundMoney = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Programme `programmeNumber` (2 for the first one accepted after the guided
 * programme) from the customers' own terms (`templates`, the first
 * programme's orders, one per customer), due relative to `elapsedMinutes`.
 * Orders are returned in the order the controller runs them: rush, standard,
 * bulk. `idPrefix` keeps ids unique across a long session.
 */
export function buildProgramme(
  templates: readonly CustomerOrder[],
  programmeNumber: number,
  shift: ProgrammeShift,
  elapsedMinutes: number,
  idPrefix = `programme-${programmeNumber}`
): CustomerOrder[] {
  const count = templates.length;
  if (count === 0) return [];
  const number = Number.isFinite(programmeNumber) ? Math.max(2, Math.floor(programmeNumber)) : 2;
  // Programme 2 leads with the second customer, so the guided programme's
  // lead is not the first rush.
  const rushIndex = (number - 1) % count;
  const pick = (offset: number) => templates[(rushIndex + offset) % count];
  const night = shift === 'night';
  const fresh = (template: CustomerOrder, index: number): CustomerOrder => ({
    ...template,
    id: `${idPrefix}-order-${index + 1}`,
    shippedKg: 0,
    qualityFailureKg: 0,
    status: index === 0 ? 'active' : 'planned',
    batchIds: [],
    manifestIds: [],
    completedAtMinute: null,
  });
  const rush = pick(0);
  return [
    {
      ...fresh(rush, 0),
      requiredKg: PROGRAMME_RUSH.kg,
      dueAtMinute: elapsedMinutes + PROGRAMME_RUSH.windowMinutes,
      priority: 'critical',
      revenuePerKg: roundMoney(rush.revenuePerKg * (1 + PROGRAMME_RUSH.premiumPercent / 100)),
      latePenaltyPerKgHour: roundMoney(
        rush.latePenaltyPerKgHour * PROGRAMME_RUSH.latePenaltyFactor
      ),
      rushPremiumPercent: PROGRAMME_RUSH.premiumPercent,
    },
    {
      ...fresh(pick(1), 1),
      requiredKg: PROGRAMME_STANDARD.kg,
      dueAtMinute: elapsedMinutes + PROGRAMME_STANDARD.windowMinutes,
      priority: 'high',
    },
    {
      ...fresh(pick(2), 2),
      requiredKg: night ? PROGRAMME_BULK.nightKg : PROGRAMME_BULK.kg,
      dueAtMinute:
        elapsedMinutes + (night ? PROGRAMME_BULK.nightWindowMinutes : PROGRAMME_BULK.windowMinutes),
      priority: 'normal',
    },
  ];
}

/**
 * The open rush order of the running programme, and whether it is the only
 * open order on its grain (so running it first means a changeover each way).
 */
export function openRush(orders: readonly CustomerOrder[]) {
  const open = orders.filter(
    (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
  );
  const rush = open.find((order) => (order.rushPremiumPercent ?? 0) > 0);
  if (!rush) return null;
  const others = open.filter((order) => order.id !== rush.id);
  return {
    order: rush,
    onlyOnItsGrain:
      others.length > 0 &&
      others.every((order) => order.recipe.sourceMaterial !== rush.recipe.sourceMaterial),
  };
}
