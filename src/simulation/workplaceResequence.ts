/**
 * Plan item 5.4: what "Resequence together" does to the plant.
 *
 * Under the dock's `fill` rule (shipmentPlan.ts) an empty truck takes the
 * active order's product and serves the earliest-due order of it, so the one
 * lever a sequence has is the active order's product: a commitment for another
 * product made active holds the rush back a truck; the rush made active goes
 * on the next one (programmes.ts `openRush`). Resequencing therefore moves the
 * rush against the dispatch queue's own order (priority, then due time):
 * last when the queue serves it first, first when it does not, by the
 * campaign's own order activation (the call the guide's order picker makes),
 * for the shift. Read from the queue, never from the order active now, so a
 * shift resumed after a reload resequences the same way it began.
 * With no rush, or no open order of another product, it moves no truck.
 *
 * The minutes each open order then has in hand come from the plant's own dock
 * and line projection (`projectDock`, partnerProposals.ts): its due minute
 * less the minute its last kilogram leaves. Pure: reads no store.
 */
import type { CustomerOrder } from '../stores/operationsCampaignStore';
import { openRush } from './programmes';
import { compareDispatchOrder } from './shipmentPlan';
import { projectDock, type DockOrder } from './partnerProposals';

const isOpen = (order: CustomerOrder) =>
  order.status !== 'fulfilled' &&
  order.status !== 'cancelled' &&
  order.requiredKg > order.shippedKg;

export interface ResequenceEffect {
  rushId: string;
  /** The order resequencing makes active: the rush, or the order served before it. */
  targetOrderId: string;
  /** True when resequencing puts the rush first. */
  rushFirst: boolean;
  /** Every open order in the dock's serving order, with its minutes in hand (negative: late). */
  inHand: { orderId: string; customer: string; minutes: number }[];
}

/** The open order the dispatch queue serves first: priority, then due time. */
export function queueFirst(orders: readonly CustomerOrder[]): CustomerOrder | null {
  return orders.filter(isOpen).sort(compareDispatchOrder)[0] ?? null;
}

/** The order resequencing makes active, or null when it would move no truck. */
export function resequenceTarget(
  orders: readonly CustomerOrder[]
): { rushId: string; targetOrderId: string; rushFirst: boolean } | null {
  const rush = openRush(orders);
  if (!rush || !rush.deferrable) return null;
  if (queueFirst(orders)?.id !== rush.order.id)
    return { rushId: rush.order.id, targetOrderId: rush.order.id, rushFirst: true };
  const other = orders
    .filter(isOpen)
    .filter((order) => order.recipe.finishedMaterial !== rush.order.recipe.finishedMaterial)
    .sort(compareDispatchOrder)[0];
  return other ? { rushId: rush.order.id, targetOrderId: other.id, rushFirst: false } : null;
}

/** The dock as the projection reads it (partnerProposals DockState, less its orders). */
export type ResequenceDock = Parameters<typeof projectDock>[1];

/**
 * Minutes in hand for each open order when `activeOrderId` is served first:
 * its due minute less the minute its last kilogram leaves, from the plant's
 * own dock and line projection (`projectDock`). Every order is taken as one
 * the line can make; one it cannot is the forfeit card's business, not the
 * sequence's. An order the projection does not see leave reads as late by its
 * forfeit bound's worth of minutes, never as on time.
 */
export function minutesInHand(
  orders: readonly CustomerOrder[],
  activeOrderId: string | null,
  dock: ResequenceDock,
  minute: number
): ResequenceEffect['inHand'] {
  const open = orders.filter(isOpen);
  const projected: Omit<DockOrder, 'programme'>[] = open.map((order) => ({
    remainingKg: Math.max(0, order.requiredKg - order.shippedKg),
    dueAtMinute: order.dueAtMinute,
    priority: order.priority,
    product: order.recipe.finishedMaterial,
    reachable: true,
    active: order.id === activeOrderId,
    latePerKgHour: order.latePenaltyPerKgHour,
  }));
  const { completesAt } = projectDock(projected, dock, minute);
  const entries = open.map((order, i) => ({
    orderId: order.id,
    customer: order.customer,
    leaves: completesAt[i],
    minutes: Math.round(
      order.dueAtMinute -
        (completesAt[i] ?? order.dueAtMinute + Math.max(0, dock.forfeitAfterMinutes ?? 0))
    ),
  }));
  // In the order they leave: the one served first first.
  return entries
    .sort(
      (a, b) =>
        (a.leaves ?? Number.POSITIVE_INFINITY) - (b.leaves ?? Number.POSITIVE_INFINITY) ||
        Number(b.orderId === activeOrderId) - Number(a.orderId === activeOrderId)
    )
    .map(({ orderId, customer, minutes }) => ({ orderId, customer, minutes }));
}

/** What resequencing would do now, or null when it would move no truck. */
export function resequenceEffect(
  orders: readonly CustomerOrder[],
  dock: ResequenceDock,
  minute: number
): ResequenceEffect | null {
  const target = resequenceTarget(orders);
  if (!target) return null;
  return { ...target, inHand: minutesInHand(orders, target.targetOrderId, dock, minute) };
}
