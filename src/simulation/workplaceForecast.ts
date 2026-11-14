/**
 * Plan item 5.6: a season plan's forecast from the real plant.
 *
 * The seeded teaching figures (`compareWorkplacePlans`) stay for workshops and
 * the pilot export. In a game season the forecast shown before a vote reads
 * the plant as it stands:
 * - what the line packs in the shift's 90 minutes, from the adviser's own
 *   simulation of the real material flow (`derivePackingAdvice`, the steady
 *   arm: every plan runs the line at the plant's rate since D4, so one
 *   rehearsal serves all three);
 * - what can leave in those minutes for the order the adviser rehearses (the
 *   active one): at most its remainder, and at most what of its product is
 *   loadable now or packed for it in them (a physical bound; nothing below is
 *   promised); and what the dock projection expects across every order, its
 *   trucks departing on `DOCK_PROJECTION`'s turn from where the next truck
 *   is, of what is owed. Each plan says whether it changes dispatch: pacing
 * never does (the line is not the constraint, plan "Which levers bind"); a
 * resequence changes which order leaves first.
 * - Review 2: what each plan ships for the season, the kilograms of the orders
 *   it credits (the season's own, and under resequence the order it makes
 *   active) that the dock projection has leaving in the shift. A resequence
 *   can change how much the season ships, so the arms differ there. Pure.
 */
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import type { PackingAdvice } from '../types/workplaceAdvice';
import type { WorkplacePlanId } from '../types/workplace';
import { resequenceTarget, type ResequenceDock } from './workplaceResequence';
import { projectDock } from './partnerProposals';

/** The shift a forecast covers, in game minutes (a season shift). */
export const FORECAST_MINUTES = 90;

export interface PlanForecast {
  planId: WorkplacePlanId;
  /** Kilograms the adviser's simulation packs in the shift; null when it abstains. */
  packedLowKg: number | null;
  packedHighKg: number | null;
  /** The order the shipped bound is for: the one the adviser rehearsed. */
  boundOrderId: string | null;
  /**
   * What of that order leaves in the shift: none is promised; at most its
   * remainder and its product's loadable and packed stock (null when the
   * adviser abstains).
   */
  shippedLowKg: number;
  shippedHighKg: number | null;
  /** What the dock projection expects to leave: its trucks, of what is owed now. */
  expectedKg: number;
  /** Trucks the dock projection has leaving in the shift. */
  departures: number;
  /** Whether the plan changes what the trucks carry or in which order. */
  changesDispatch: boolean;
  /** The order the next empty truck serves under the plan. */
  firstOrderId: string | null;
  /**
   * Review 2: kilograms of the orders this plan credits the season with that
   * the dock projection has leaving in the shift; null with no season orders.
   */
  seasonKg: number | null;
  /**
   * Review 2: game minutes this shift no new lab test starts, and that
   * Maintenance's services wait, under the plan (bilateralWorkplace
   * `planCrewWaits`); 0 on a shift no one is away.
   */
  benchWaitMinutes: number;
  serviceWaitMinutes: number;
  /** Why the adviser abstains on packing (its missing facts); null when it does not. */
  abstain: string | null;
}

export interface ForecastInput {
  /** The adviser's steady rehearsal of the current plant. */
  advice: Pick<PackingAdvice, 'reasonToAbstain' | 'packedLowKg' | 'packedHighKg' | 'evidence'>;
  dock: ResequenceDock;
  orders: readonly CustomerOrder[];
  activeOrderId: string | null;
  /** The orders the season credits whatever the plan: its commitment and any follow-on. */
  seasonOrderIds?: readonly string[];
  /** The plant's minute now (the campaign clock), from which the shift is projected. */
  minute?: number;
  /** What each plan leaves waiting this shift (absent: nothing waits). */
  waits?: Partial<Record<WorkplacePlanId, { bench: number; service: number }>>;
}

/** Kilograms of `credited` the projection has leaving within the shift, `activeId` served first. */
function seasonShipped(
  input: ForecastInput,
  activeId: string | null,
  credited: readonly string[]
): number {
  const minute = Number.isFinite(input.minute) ? (input.minute as number) : 0;
  const owed = input.orders.filter(open);
  const { shipments } = projectDock(
    owed.map((order) => ({
      remainingKg: Math.max(0, order.requiredKg - order.shippedKg),
      dueAtMinute: order.dueAtMinute,
      priority: order.priority,
      product: order.recipe.finishedMaterial as 'flour' | 'semolina',
      reachable: true,
      active: order.id === activeId,
      latePerKgHour: order.latePenaltyPerKgHour,
    })),
    input.dock,
    minute
  );
  return owed.reduce(
    (sum, order, i) =>
      credited.includes(order.id)
        ? sum +
          (shipments[i] ?? [])
            .filter((leg) => leg.at <= minute + FORECAST_MINUTES + 1e-9)
            .reduce((n, leg) => n + leg.kg, 0)
        : sum,
    0
  );
}

const open = (order: CustomerOrder) =>
  order.status !== 'fulfilled' &&
  order.status !== 'cancelled' &&
  order.requiredKg > order.shippedKg;

/** Trucks leaving within `minutes`, from the next one on the dock's turn. */
export function departuresWithin(dock: ResequenceDock, minutes = FORECAST_MINUTES): number {
  const cycle = Math.max(1, Number.isFinite(dock.cycleMinutes) ? dock.cycleMinutes : 81);
  let slot = Math.max(0, Number.isFinite(dock.nextTruckInMinutes) ? dock.nextTruckInMinutes : 0);
  let count = 0;
  while (slot <= minutes && count < 100) {
    count += 1;
    slot += cycle;
  }
  return count;
}

export function forecastPlans(
  input: ForecastInput,
  plans: readonly WorkplacePlanId[] = ['steady', 'resequence', 'cover']
): PlanForecast[] {
  const abstains = !!input.advice.reasonToAbstain;
  const owedKg = input.orders
    .filter(open)
    .reduce((sum, order) => sum + (order.requiredKg - order.shippedKg), 0);
  const departures = departuresWithin(input.dock);
  const capacity = Math.max(1, input.dock.capacityKg);
  const stock = input.dock.stock;
  const evidence = input.advice.evidence;
  const product = evidence.finishedMaterial;
  const loadableKg =
    stock && product ? stock[product].tested + stock[product].bench : Number.POSITIVE_INFINITY;
  // The bound is physical: nothing of the order leaves that is not loadable
  // now or packed for it in the shift. The dock's departures are its
  // projection, not a bound (a yard can turn faster than its measured mean,
  // and a programme taken in the shift adds to what is owed), so they are
  // stated beside it.
  const shippedHighKg =
    abstains || evidence.remainingOrderKg === null
      ? null
      : Math.max(
          0,
          Math.min(evidence.remainingOrderKg, loadableKg + Math.max(0, input.advice.packedHighKg))
        );
  const expectedKg = Math.max(0, Math.min(owedKg, departures * capacity));
  const shippedLowKg = 0;
  const sequence = resequenceTarget(input.orders);
  const seasonIds = input.seasonOrderIds ?? [];
  return plans.map((planId) => {
    const firstOrderId =
      planId === 'resequence' && sequence ? sequence.targetOrderId : input.activeOrderId;
    // A resequence credits the season with the order it makes active too
    // (bilateralWorkplace `sequenced`).
    const credited =
      planId === 'resequence' && sequence ? [...seasonIds, sequence.targetOrderId] : seasonIds;
    return {
      planId,
      packedLowKg: abstains ? null : input.advice.packedLowKg,
      packedHighKg: abstains ? null : input.advice.packedHighKg,
      boundOrderId: evidence.orderId,
      shippedLowKg,
      shippedHighKg,
      expectedKg,
      departures,
      changesDispatch:
        planId === 'resequence' && !!sequence && sequence.targetOrderId !== input.activeOrderId,
      firstOrderId,
      seasonKg: seasonIds.length ? seasonShipped(input, firstOrderId, credited) : null,
      benchWaitMinutes: input.waits?.[planId]?.bench ?? 0,
      serviceWaitMinutes: input.waits?.[planId]?.service ?? 0,
      abstain: input.advice.reasonToAbstain,
    };
  });
}
