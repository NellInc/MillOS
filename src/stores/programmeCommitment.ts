import type { CustomerOrder } from './operationsCampaignStore';

/**
 * The programme an order belongs to. Accepted programmes are built with ids
 * `programme-<n>-order-<k>` (acceptNextProgramme); the guided first programme's
 * orders carry none.
 */
export const programmeKey = (orderId: string): string =>
  /^(programme-\d+)-order-\d+$/.exec(orderId)?.[1] ?? 'guided';

export interface ProgrammeCommitment {
  key: string;
  /** Every non-cancelled order of the programme, required. */
  committedKg: number;
  /** Shipped against those orders, never more than each requires. */
  shippedKg: number;
  /** An order of it is still open. */
  open: boolean;
}

/**
 * The running programme: the customers' committed kilograms, which replace the
 * daily bag target as the goal (D11). The campaign keeps earlier programmes'
 * orders (the last 30), and a programme's orders are appended together, so it
 * is the newest order's programme. Null with no orders.
 * Working if the guided programme reads 18 t, an accepted one only its own
 * three orders, and stock packed for no order counts for nothing.
 */
export function runningProgramme(
  orders: readonly Pick<CustomerOrder, 'id' | 'status' | 'requiredKg' | 'shippedKg'>[]
): ProgrammeCommitment | null {
  const last = orders.at(-1);
  if (!last) return null;
  const key = programmeKey(last.id);
  let committedKg = 0;
  let shippedKg = 0;
  let open = false;
  for (const order of orders) {
    if (order.status === 'cancelled' || programmeKey(order.id) !== key) continue;
    const required = Math.max(0, order.requiredKg);
    committedKg += required;
    shippedKg += Math.min(required, Math.max(0, order.shippedKg));
    if (order.status !== 'fulfilled') open = true;
  }
  return committedKg > 0 ? { key, committedKg, shippedKg, open } : null;
}

export interface OpenProgramme extends ProgrammeCommitment {
  /** Tonnes as the HUD shows them, to 0.1 t: shipped rounded down, committed rounded. */
  shippedT: number;
  committedT: number;
  /** Percent shipped, rounded down to 0.1, so an unfinished programme never reads 100. */
  percent: number;
  /** The earliest due minute among its open orders (campaign minutes). */
  nextDueAtMinute: number;
  /** An open order of it is past due (status 'late'). */
  late: boolean;
}

/**
 * The running programme while an order of it is open, for every surface that
 * shows the goal (D11): null with no programme accepted or once all of it is
 * delivered, so no surface shows a placeholder or a zero target. Lateness is
 * the campaign's own order status, not a rate guessed from the clock.
 * Working if the guided programme reads 0.0 / 18.0 t at 0.0%, and a programme
 * one kilogram short reads 99.9%.
 */
export function openProgramme(
  orders: readonly Pick<
    CustomerOrder,
    'id' | 'status' | 'requiredKg' | 'shippedKg' | 'dueAtMinute'
  >[]
): OpenProgramme | null {
  const running = runningProgramme(orders);
  if (!running?.open) return null;
  let nextDueAtMinute = Infinity;
  let late = false;
  for (const order of orders) {
    if (programmeKey(order.id) !== running.key) continue;
    if (order.status === 'cancelled' || order.status === 'fulfilled') continue;
    nextDueAtMinute = Math.min(nextDueAtMinute, order.dueAtMinute);
    if (order.status === 'late') late = true;
  }
  return {
    ...running,
    shippedT: Math.floor(running.shippedKg / 100) / 10,
    committedT: Math.round(running.committedKg / 100) / 10,
    // The epsilon keeps a ratio such as 0.29 (289.999... per mille) at 29.0.
    percent: Math.min(
      100,
      Math.floor((running.shippedKg / running.committedKg) * 1000 + 1e-9) / 10
    ),
    nextDueAtMinute,
    late,
  };
}
