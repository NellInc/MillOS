/**
 * Which order a docked shipping truck serves, which product it carries, how
 * many kilograms it loads and when it is ready to leave (plan item 3.0a).
 *
 * The dock is the mill's constraint (proposed D22): the trucks set what ships
 * and when, so their load decision is the thing a floor choice can change.
 * This module makes that decision a pure function of what the tick already
 * reads, so another rule can be chosen and measured. It reads no store, no
 * clock and no randomness, and holds no state: the tick's saved fields
 * (`captureUnifiedTickState`) do not change.
 *
 * The 'default' policy is the rule the central tick held inline until
 * 12 November 2026 (UnifiedGameTick.ts, the shipping-load block):
 * - Product: an empty truck takes the active order's product; a truck with
 *   anything aboard keeps its own (a mid-load switch to another product's
 *   order never sheds what it holds).
 * - Kilograms: max(loaded, min(capacity, owed, max(loaded, released))), where
 *   owed is the active order's remainder when it is the truck's product, the
 *   remainder of every open order of the truck's product when it is not, and
 *   the capacity when no order is active.
 * - Ready: at capacity or at what is owed, or when released stock of its
 *   product runs out with something aboard.
 * - Order: the one dispatch credits first, the open order of the product by
 *   priority, then due time. That is not always the active order: the active
 *   order SIZES the load while the dispatch queue is CREDITED with it.
 *
 * Two more policies. Both still leave when loadable stock runs out with
 * something aboard.
 * - 'fill': load up to capacity across every open order of the product, and
 *   serve the earliest due first. The game's policy since plan item 3.4:
 *   measured over ten shifts it ships more and delivers more on time than
 *   'default', with no order late (plan, wave log 3.0a).
 * - 'partial': leave as soon as the active order's remainder (as owed above)
 *   or PARTIAL_LOAD_KG is aboard, whichever is less, and serve the active order.
 *   Measured only.
 *
 * Dispatch by grade (plan item 3.4, D6). Every policy loads a batch for an
 * order only when the batch's stamp meets that order's recipe minimum, and
 * only tested, released stock: `allocateStock` decides which batch goes to
 * which order, and the same allocation is what the truck carries and what the
 * campaign credits. Flour under an order's minimum is held for it and goes to
 * an open order whose minimum it meets.
 */

export type ShipmentProduct = 'flour' | 'semolina';
export type ShipmentPolicy = 'default' | 'fill' | 'partial';

export const DEFAULT_SHIPMENT_POLICY: ShipmentPolicy = 'fill';
/** The 'partial' policy's departure load, half a truck. */
export const PARTIAL_LOAD_KG = 2500;
/** Kilograms below which a load or a remainder counts as reached. */
const READY_TOLERANCE_KG = 1e-6;

export interface ShipmentOrder {
  id: string;
  product: ShipmentProduct;
  /** requiredKg less shippedKg, unclamped; the plan clamps it at zero. */
  remainingKg: number;
  priority: 'normal' | 'high' | 'critical';
  dueAtMinute: number;
  /** The recipe's minimum quality: a batch is loaded for the order only at or above it. */
  minimumQuality: number;
}

/** A packed batch as the material store holds it. Only tested, released stock is loaded. */
export interface ShipmentStockBatch {
  /** The batch id; absent in hand-built cases, where its index names it. */
  id?: string;
  /** The packer it was packed at: the store drains packer by packer. */
  packerId?: string;
  materialType: string;
  availableKg: number;
  disposition: string;
  /** The quality stamped at packing, read against each order's minimum. */
  qualityScore?: number;
  /** Packed but not yet through the lab's bench (plan item 3.2): not loadable. */
  awaitingTest?: boolean;
}

/** One part of a load: so many kg of one batch, for one order. */
export interface ShipmentLoad {
  batchId: string;
  orderId: string;
  kg: number;
}

/** Below this a stamp counts as reaching a minimum (mass-weighted averages drift). */
const STAMP_TOLERANCE = 1e-6;

/**
 * Whether a batch's stamp meets an order's minimum. A batch packed before
 * stamps were recorded reads as conforming, as the lab has always read it.
 */
export function meetsMinimum(qualityScore: number | undefined, minimum: number): boolean {
  return (
    qualityScore === undefined ||
    !Number.isFinite(qualityScore) ||
    qualityScore >= minimum - STAMP_TOLERANCE
  );
}

/**
 * Stock shared out among `orders`, in the order given: each order takes the
 * eligible batches of its product whose stamp meets its minimum. Batches that
 * meet fewer of the listed minimums go first, so flour only the stricter
 * order can take is kept for it; among equals, the store's drain order (by
 * packer, then as packed), so a plant whose flour meets every minimum ships
 * the batches it always shipped. Pure.
 */
export function allocateStock(
  orders: ReadonlyArray<Pick<ShipmentOrder, 'id' | 'product' | 'remainingKg' | 'minimumQuality'>>,
  stock: ReadonlyArray<ShipmentStockBatch>,
  product: ShipmentProduct,
  eligible: (batch: ShipmentStockBatch) => boolean
): { loads: ShipmentLoad[]; coveredKg: Map<string, number>; eligibleKg: number } {
  const left: number[] = stock.map((batch) =>
    batch.materialType === product && batch.availableKg > 0 && eligible(batch)
      ? batch.availableKg
      : 0
  );
  const eligibleKg = left.reduce((sum, kg) => sum + kg, 0);
  const minimums = [
    ...new Set(
      orders.filter((order) => order.product === product).map((order) => order.minimumQuality)
    ),
  ];
  const tier = (batch: ShipmentStockBatch) =>
    minimums.filter((minimum) => meetsMinimum(batch.qualityScore, minimum)).length;
  const packer = (batch: ShipmentStockBatch) => batch.packerId ?? '';
  const byStamp = stock
    .map((_, index) => index)
    .filter((index) => left[index] > 0)
    .sort(
      (a, b) =>
        tier(stock[a]) - tier(stock[b]) ||
        (packer(stock[a]) < packer(stock[b]) ? -1 : packer(stock[a]) > packer(stock[b]) ? 1 : 0) ||
        a - b
    );
  const loads: ShipmentLoad[] = [];
  const coveredKg = new Map<string, number>();
  for (const order of orders) {
    if (order.product !== product) continue;
    let need = Math.max(0, order.remainingKg);
    for (const index of byStamp) {
      if (need <= READY_TOLERANCE_KG) break;
      if (left[index] <= 0) continue;
      if (!meetsMinimum(stock[index].qualityScore, order.minimumQuality)) continue;
      const kg = Math.min(need, left[index]);
      left[index] -= kg;
      need -= kg;
      loads.push({ batchId: stock[index].id ?? String(index), orderId: order.id, kg });
      coveredKg.set(order.id, (coveredKg.get(order.id) ?? 0) + kg);
    }
  }
  return { loads, coveredKg, eligibleKg };
}

/** Packed stock the line counts as made: anything not recalled or shipped. */
const packedStock = (batch: ShipmentStockBatch) =>
  batch.disposition !== 'recalled' && batch.disposition !== 'shipped';
/** Stock a truck may load: released, and through the lab. */
export const loadableStock = (batch: ShipmentStockBatch) =>
  batch.disposition === 'released' && !batch.awaitingTest;

/**
 * Packed stock of `product` as the line's plan reads it, by grade (plan item
 * 3.4). The line walks its commitments in `orders`' order with one pooled
 * figure per product (operationsCampaignStore getLineProductionPlan); this
 * returns the pool that covers exactly the orders the graded allocation
 * covers, so 93 flour never reads as the 95 order packed. `strandedKg` is the
 * stock no listed order can take, which the line must not count against what
 * it still has to make. With no open order of the product, the plain totals.
 */
export function gradedStock(
  orders: ReadonlyArray<Pick<ShipmentOrder, 'id' | 'product' | 'remainingKg' | 'minimumQuality'>>,
  stock: ReadonlyArray<ShipmentStockBatch>,
  product: ShipmentProduct
): { availableKg: number; releasedKg: number; strandedKg: number } {
  const ofProduct = orders.filter((order) => order.product === product);
  const pooled = (eligible: (batch: ShipmentStockBatch) => boolean) => {
    const { coveredKg, eligibleKg } = allocateStock(ofProduct, stock, product, eligible);
    if (ofProduct.length === 0) return { pool: eligibleKg, stranded: 0 };
    let pool = 0;
    let covered = 0;
    let open = true;
    for (const order of ofProduct) {
      const kg = coveredKg.get(order.id) ?? 0;
      covered += kg;
      if (!open) continue;
      pool += kg;
      if (kg + READY_TOLERANCE_KG < Math.max(0, order.remainingKg)) open = false;
    }
    return { pool, stranded: Math.max(0, eligibleKg - covered) };
  };
  const packed = pooled(packedStock);
  return {
    availableKg: packed.pool,
    releasedKg: pooled(loadableStock).pool,
    strandedKg: packed.stranded,
  };
}

export interface ShipmentTruck {
  materialType: ShipmentProduct;
  loadedKg: number;
  capacityKg: number;
}

export interface ShipmentPlanInput {
  /** The open orders, in the store's order (sums add in that order). */
  orders: ReadonlyArray<ShipmentOrder>;
  activeOrderId: string | null;
  truck: ShipmentTruck;
  /** Packed batches, in the store's order. */
  stock: ReadonlyArray<ShipmentStockBatch>;
  policy?: ShipmentPolicy;
}

export interface ShipmentPlan {
  /** The product the truck carries. */
  materialType: ShipmentProduct;
  /** The order credited first with this load; null when none of its product is owed. */
  orderId: string | null;
  /** The most the truck holds once loading reaches it; never below what it holds. */
  targetKg: number;
  /** A loading truck is ready once it holds this much (within 1e-6 kg). */
  readyAtKg: number;
  /**
   * Tested, released stock of the truck's product that its open orders can
   * take, each by its own minimum (all such stock when none is owed).
   */
  releasedKg: number;
  /** Which batch goes to which order, up to targetKg, in loading order (plan item 3.4). */
  loads: ShipmentLoad[];
  /** True when an open order of the product is owed, so `loads` is what may leave. */
  graded: boolean;
  /**
   * Packed flour on the lab's bench or in its queue that the owed orders
   * would take once tested (plan item 3.2). While there is any, a truck that
   * has loaded all tested stock waits for it rather than leaving short.
   */
  awaitingTestKg: number;
  /**
   * Whether the truck as given may leave: released stock of its product has
   * run out with something aboard, or, while stock remains, it holds
   * readyAtKg. The tick tests the kg it holds after a tick of loading against
   * readyAtKg, and the stock-out against the kg before it, as it always has.
   */
  ready: boolean;
}

const PRIORITY_RANK: Record<ShipmentOrder['priority'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

/**
 * The dispatch queue's order: priority, then due time. Crediting, order
 * activation and the line's pre-staging all sort by it.
 */
export function compareDispatchOrder(
  a: { priority: ShipmentOrder['priority']; dueAtMinute: number },
  b: { priority: ShipmentOrder['priority']; dueAtMinute: number }
): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueAtMinute - b.dueAtMinute;
}

/**
 * The open order dispatch credits first for `product`: the queue's first with
 * anything still owed. The OverviewPanel's batch list names it.
 */
export function firstOrderOwed<
  T extends {
    id: string;
    status: string;
    requiredKg: number;
    shippedKg: number;
    priority: ShipmentOrder['priority'];
    dueAtMinute: number;
    recipe: { finishedMaterial: string };
  },
>(orders: ReadonlyArray<T>, product: ShipmentProduct): T | null {
  return (
    orders
      .filter(
        (order) =>
          order.status !== 'fulfilled' &&
          order.status !== 'cancelled' &&
          order.recipe.finishedMaterial === product &&
          order.requiredKg - order.shippedKg > 0
      )
      .sort(compareDispatchOrder)[0] ?? null
  );
}

/** The campaign's open orders, in store order, as the plan reads them. */
export function shipmentOrdersFrom(
  orders: ReadonlyArray<{
    id: string;
    status: string;
    requiredKg: number;
    shippedKg: number;
    priority: ShipmentOrder['priority'];
    dueAtMinute: number;
    recipe: { finishedMaterial: ShipmentProduct; minimumQuality: number };
  }>
): ShipmentOrder[] {
  const open: ShipmentOrder[] = [];
  for (const order of orders) {
    if (order.status === 'fulfilled' || order.status === 'cancelled') continue;
    open.push({
      id: order.id,
      product: order.recipe.finishedMaterial,
      remainingKg: order.requiredKg - order.shippedKg,
      priority: order.priority,
      dueAtMinute: order.dueAtMinute,
      minimumQuality: order.recipe.minimumQuality,
    });
  }
  return open;
}

/** The allocation's order of orders, per policy. */
function allocationOrder(
  orders: ReadonlyArray<ShipmentOrder>,
  activeId: string | null,
  policy: ShipmentPolicy
): ShipmentOrder[] {
  const owed = orders.filter((order) => order.remainingKg > READY_TOLERANCE_KG);
  if (policy === 'fill') return owed.sort(compareDue);
  const queue = owed.sort(compareDispatchOrder);
  if (policy !== 'partial' || activeId === null) return queue;
  const at = queue.findIndex((order) => order.id === activeId);
  if (at > 0) queue.unshift(...queue.splice(at, 1));
  return queue;
}

/** The first `kg` of an allocation, in its order. */
export function trimLoads(loads: readonly ShipmentLoad[], kg: number): ShipmentLoad[] {
  const trimmed: ShipmentLoad[] = [];
  let left = kg;
  for (const load of loads) {
    if (left <= READY_TOLERANCE_KG) break;
    const take = Math.min(load.kg, left);
    trimmed.push({ ...load, kg: take });
    left -= take;
  }
  return trimmed;
}

function owedKgOf(orders: ReadonlyArray<ShipmentOrder>, product: ShipmentProduct): number {
  let owed = 0;
  for (const order of orders) if (order.product === product) owed += Math.max(0, order.remainingKg);
  return owed;
}

/** The first order owed of `product` under `compare`, or null. */
function firstOwed(
  orders: ReadonlyArray<ShipmentOrder>,
  product: ShipmentProduct,
  compare: (a: ShipmentOrder, b: ShipmentOrder) => number
): string | null {
  let first: ShipmentOrder | null = null;
  for (const order of orders) {
    if (order.product !== product || order.remainingKg <= 0) continue;
    if (!first || compare(order, first) < 0) first = order;
  }
  return first?.id ?? null;
}

const compareDue = (a: ShipmentOrder, b: ShipmentOrder) =>
  a.dueAtMinute - b.dueAtMinute || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

export function planShipment(input: ShipmentPlanInput): ShipmentPlan {
  const policy = input.policy ?? DEFAULT_SHIPMENT_POLICY;
  const { truck, orders } = input;
  const active =
    input.activeOrderId === null
      ? undefined
      : orders.find((order) => order.id === input.activeOrderId);
  const materialType =
    active && truck.loadedKg <= READY_TOLERANCE_KG ? active.product : truck.materialType;
  const queue = allocationOrder(
    orders.filter((order) => order.product === materialType),
    input.activeOrderId,
    policy
  );
  const allocation = allocateStock(queue, input.stock, materialType, loadableStock);
  // With nothing of the product owed, or no order active (the tick holds the
  // truck for want of a commitment), there is no minimum to read: every
  // tested, released batch counts, as before.
  const graded = queue.length > 0 && !!active;
  const allocatedKg = allocation.loads.reduce((sum, load) => sum + load.kg, 0);
  const owedAllKg = queue.reduce((sum, order) => sum + Math.max(0, order.remainingKg), 0);
  // Once every owed kg is covered the plan reads, as it always did, all the
  // stock its orders could take (the cap at what is owed is the target's).
  const meetingKg = input.stock.reduce(
    (sum, batch) =>
      batch.materialType === materialType &&
      batch.availableKg > 0 &&
      loadableStock(batch) &&
      queue.some((order) => meetsMinimum(batch.qualityScore, order.minimumQuality))
        ? sum + batch.availableKg
        : sum,
    0
  );
  const releasedKg = !graded
    ? allocation.eligibleKg
    : allocatedKg + READY_TOLERANCE_KG >= owedAllKg
      ? meetingKg
      : allocatedKg;

  // What the truck loads toward under today's rule: the active order's
  // remainder when it is the truck's product; what every open order of the
  // truck's product owes when it is not (a mid-load switch); with no order
  // active, a full truck (it is held for want of a commitment anyway).
  const activeOwedKg = !active
    ? truck.capacityKg
    : active.product === materialType
      ? Math.max(0, active.remainingKg)
      : owedKgOf(orders, materialType);

  let owedKg: number;
  let orderId: string | null;
  if (policy === 'fill') {
    owedKg = active ? owedKgOf(orders, materialType) : truck.capacityKg;
    orderId = firstOwed(orders, materialType, compareDue);
  } else if (policy === 'partial') {
    owedKg = Math.min(activeOwedKg, PARTIAL_LOAD_KG);
    orderId =
      active && active.product === materialType && active.remainingKg > 0
        ? active.id
        : firstOwed(orders, materialType, compareDispatchOrder);
  } else {
    owedKg = activeOwedKg;
    orderId = firstOwed(orders, materialType, compareDispatchOrder);
  }

  const readyAtKg = Math.min(truck.capacityKg, owedKg);
  const targetKg = Math.max(
    truck.loadedKg,
    Math.min(truck.capacityKg, owedKg, Math.max(truck.loadedKg, releasedKg))
  );
  // Stock the bench will release for these orders: the truck waits for it.
  const awaitingTestKg = graded
    ? Math.max(
        0,
        allocateStock(
          queue,
          input.stock,
          materialType,
          (batch) => batch.disposition === 'released'
        ).loads.reduce((sum, load) => sum + load.kg, 0) - allocatedKg
      )
    : 0;
  const stockedOut =
    releasedKg <= truck.loadedKg + READY_TOLERANCE_KG && awaitingTestKg <= READY_TOLERANCE_KG;
  const ready = stockedOut ? truck.loadedKg > 0 : truck.loadedKg >= readyAtKg - READY_TOLERANCE_KG;
  const loads = trimLoads(allocation.loads, targetKg);
  return {
    materialType,
    orderId,
    targetKg,
    readyAtKg,
    releasedKg,
    ready,
    loads,
    graded,
    awaitingTestKg,
  };
}
