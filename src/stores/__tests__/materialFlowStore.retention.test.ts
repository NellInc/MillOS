/**
 * The genealogy retention rule (plan wave 3d, retainGenealogy): a released lot
 * received more than three game days ago is merged into its grain's
 * earlier-stock lot everywhere it is on record; held lots, held batches and
 * batches that have begun to ship keep their own lots. Mass, paths and both
 * balances are unchanged by a merge.
 */
import { describe, expect, it } from 'vitest';
import {
  createMaterialFlowStore,
  EARLIER_STOCK_LOT_IDS,
  GENEALOGY_RETENTION_MINUTES,
  retainGenealogy,
  type MaterialFlowState,
  type SourceContribution,
} from '../materialFlowStore';

const plan = {
  sourceMaterial: 'wheat_grain',
  finishedMaterial: 'flour',
  remainingFinishedKg: 6000,
} as const;
/** The live plant's tick asks for the check (planFeed); a benchmark or a sandbox does not. */
const live = { planFeed: true } as const;
const clock = (day: number, hour = 10) => ({ day, hour });

/** Every lot id the record's contributions name, anywhere. */
function namedLots(state: MaterialFlowState): Set<string> {
  const ids = new Set<string>();
  const add = (list: readonly SourceContribution[] | undefined) =>
    list?.forEach((c) => ids.add(c.lotId));
  state.machineBuffers.forEach((buffer) =>
    [...buffer.inputBuffer, ...buffer.outputBuffer].forEach((m) => add(m.sourceContributions))
  );
  state.network.segments.forEach((s) => s.inTransit.forEach((p) => add(p.sourceContributions)));
  state.productionBatches.forEach((b) => add(b.sourceContributions));
  state.manifests.forEach((m) => add(m.sourceLots));
  add(state.shippedSourceContributions);
  add(state.wasteSourceContributions);
  add(state.byproductSourceContributions);
  return ids;
}

/** Kilograms by path, summed over lots: what a merge must leave as it was. */
function kgByPath(state: MaterialFlowState): Map<string, number> {
  const out = new Map<string, number>();
  const add = (list: readonly SourceContribution[] | undefined) =>
    list?.forEach((c) => out.set(c.path.join('>'), (out.get(c.path.join('>')) ?? 0) + c.amount));
  state.machineBuffers.forEach((buffer) =>
    [...buffer.inputBuffer, ...buffer.outputBuffer].forEach((m) => add(m.sourceContributions))
  );
  state.network.segments.forEach((s) => s.inTransit.forEach((p) => add(p.sourceContributions)));
  add(state.shippedSourceContributions);
  add(state.wasteSourceContributions);
  add(state.byproductSourceContributions);
  return out;
}

/** Three wheat deliveries on day 1 (one to each wheat silo), milled and packed. */
function plantWithDayOneLots() {
  const store = createMaterialFlowStore();
  for (let i = 0; i < 3; i++)
    store
      .getState()
      .receiveGrainDelivery(15000, { materialType: 'wheat_grain', gameClock: clock(1) });
  const dayOne = [...store.getState().sourceLots.values()]
    .filter((lot) => lot.origin === 'receiving')
    .map((lot) => lot.id);
  // Not the live tick: nothing is merged while the line packs.
  for (let tick = 0; tick < 240; tick++) store.getState().tickMaterialFlow(0.5, 1, plan);
  return { store, dayOne };
}

describe('genealogy retention', () => {
  it('merges released lots over three game days old into earlier stock, mass and balances intact', () => {
    const { store, dayOne } = plantWithDayOneLots();
    // A fourth delivery four days on: the record's clock now reads day 5.
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(5) });
    const fresh = [...store.getState().sourceLots.keys()].find(
      (id) => !dayOne.includes(id) && id.startsWith('lot-0')
    )!;
    const before = store.getState();
    expect(dayOne.every((id) => namedLots(before).has(id))).toBe(true);
    const material = before.getMaterialBalance();
    const genealogy = before.getGenealogyBalance();
    const paths = kgByPath(before);

    store.getState().tickMaterialFlow(1e-6, 1, plan, undefined, live);
    const after = store.getState();
    const earlier = after.sourceLots.get(EARLIER_STOCK_LOT_IDS.wheat_grain)!;
    expect(earlier).toMatchObject({ supplierKey: 'earlierStock', disposition: 'released' });
    // Opening stock is aged on the material clock and is young here; the day-1 lots are not.
    expect(earlier.receivedKg).toBeCloseTo(45000, 6);
    // No batch has begun to ship or is held, so the day-1 lots leave the record.
    for (const id of dayOne) {
      expect(namedLots(after).has(id)).toBe(false);
      expect(after.sourceLots.has(id)).toBe(false);
    }
    expect(after.sourceLots.has(fresh)).toBe(true);
    expect(namedLots(after).has(fresh)).toBe(true);
    // Every lot a contribution names is on record ('Unbound source hold').
    for (const id of namedLots(after)) expect(after.sourceLots.has(id)).toBe(true);
    expect(after.getMaterialBalance().errorKg).toBeCloseTo(material.errorKg, 9);
    expect(after.getGenealogyBalance().errorKg).toBeCloseTo(genealogy.errorKg, 6);
    expect(after.getGenealogyBalance().inventoryKg).toBeCloseTo(genealogy.inventoryKg, 6);
    const pathsAfter = kgByPath(after);
    for (const [path, kg] of paths) expect(pathsAfter.get(path) ?? 0).toBeCloseTo(kg, 6);
  });

  it('keeps a lot received within three game days, and a held lot whatever its age', () => {
    const { store, dayOne } = plantWithDayOneLots();
    store.getState().setLotDisposition([dayOne[0]], 'hold', 'supplier notice');
    // Just inside the window for nothing; past it for the day-1 lots.
    const within = 1 + GENEALOGY_RETENTION_MINUTES / 1440;
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(within, 9) });
    store.getState().tickMaterialFlow(1e-6, 1, plan, undefined, live);
    const lots = store.getState().sourceLots;
    // An hour short of three days: nothing has aged out yet.
    expect(lots.has(EARLIER_STOCK_LOT_IDS.wheat_grain)).toBe(false);
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(within, 11) });
    // The next check is a game hour of material clock on.
    for (let tick = 0; tick < 200; tick++)
      store.getState().tickMaterialFlow(0.5, 1, plan, undefined, live);
    const after = store.getState();
    expect(after.sourceLots.has(EARLIER_STOCK_LOT_IDS.wheat_grain)).toBe(true);
    expect(after.sourceLots.get(dayOne[0])).toMatchObject({ disposition: 'hold' });
    expect(after.sourceLots.get(dayOne[0])?.mergedInto).toBeUndefined();
    expect(namedLots(after).has(dayOne[0])).toBe(true);
    for (const id of dayOne.slice(1))
      expect(namedLots(after).has(id)).toBe(
        after.productionBatches.some(
          (b) =>
            (b.disposition !== 'released' || b.dispatchManifestIds.length > 0) &&
            b.sourceContributions.some((c) => c.lotId === id)
        )
      );
  });

  it('leaves a batch that has begun to ship as it was, and a notice on earlier stock still holds it', () => {
    const { store, dayOne } = plantWithDayOneLots();
    const target = store
      .getState()
      .productionBatches.find(
        (b) =>
          b.materialType === 'flour' &&
          b.disposition === 'released' &&
          b.availableKg >= 300 &&
          b.sourceContributions.some((c) => dayOne.includes(c.lotId))
      )!;
    expect(target).toBeDefined();
    const shipped = store.getState().shipFinishedGoods(300, 'flour', {
      gameClock: clock(5),
      loads: [{ batchId: target.id, orderId: 'order-x', kg: 300 }],
    });
    expect(shipped).toBeCloseTo(300, 6);
    const begun = store.getState().productionBatches.find((b) => b.id === target.id)!;
    expect(begun.dispatchManifestIds.length).toBe(1);
    const contributions = structuredClone(begun.sourceContributions);
    store.getState().tickMaterialFlow(1e-6, 1, plan, undefined, live);
    const after = store.getState();
    const kept = after.productionBatches.find((b) => b.id === begun.id)!;
    expect(kept.sourceContributions).toEqual(contributions);
    const named = contributions.find((c) => dayOne.includes(c.lotId))!.lotId;
    expect(after.sourceLots.get(named)?.mergedInto).toBe(EARLIER_STOCK_LOT_IDS.wheat_grain);
    // A batch that has not begun to ship carries earlier stock in place of the day-1 lots.
    const unshipped = after.productionBatches.filter(
      (b) => b.disposition === 'released' && b.dispatchManifestIds.length === 0
    );
    expect(unshipped.length).toBeGreaterThan(0);
    for (const batch of unshipped)
      expect(batch.sourceContributions.some((c) => dayOne.includes(c.lotId))).toBe(false);
    const held = after.setLotDisposition(
      [EARLIER_STOCK_LOT_IDS.wheat_grain],
      'hold',
      'supplier notice'
    );
    expect(held).toContain(begun.id);
    expect(store.getState().sourceLots.get(named)?.disposition).toBe('hold');
    // Held, its record stays even once no batch names it (an open alert must find it).
    const gone = { ...store.getState(), productionBatches: [] };
    expect((retainGenealogy(gone)?.sourceLots ?? gone.sourceLots).has(named)).toBe(true);
  });

  it('keeps merging once earlier stock is recalled: later lots go to a fresh earlier-stock lot', () => {
    const { store } = plantWithDayOneLots();
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(5) });
    const dayFive = [...store.getState().sourceLots.keys()].at(-1)!;
    store.getState().tickMaterialFlow(1e-6, 1, plan, undefined, live);
    const first = EARLIER_STOCK_LOT_IDS.wheat_grain;
    expect(store.getState().sourceLots.has(first)).toBe(true);
    store.getState().setLotDisposition([first], 'recalled', 'supplier recall');
    expect(store.getState().sourceLots.get(first)?.disposition).toBe('recalled');
    // Four days on, the day-5 lot has aged out too.
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(9) });
    for (let tick = 0; tick < 200; tick++)
      store.getState().tickMaterialFlow(0.5, 1, plan, undefined, live);
    const after = store.getState();
    expect(after.sourceLots.get(first)?.disposition).toBe('recalled');
    expect(after.sourceLots.get(`${first}-2`)).toMatchObject({
      disposition: 'released',
      supplierKey: 'earlierStock',
    });
    expect(namedLots(after).has(dayFive)).toBe(
      after.productionBatches.some(
        (b) =>
          (b.disposition !== 'released' || b.dispatchManifestIds.length > 0) &&
          b.sourceContributions.some((c) => c.lotId === dayFive)
      )
    );
    for (const id of namedLots(after)) expect(after.sourceLots.has(id)).toBe(true);
  });

  it('changes nothing outside the live tick (a benchmark, the advice sandbox)', () => {
    const { store } = plantWithDayOneLots();
    store
      .getState()
      .receiveGrainDelivery(5000, { materialType: 'wheat_grain', gameClock: clock(5) });
    const lots = store.getState().sourceLots;
    for (let tick = 0; tick < 400; tick++) store.getState().tickMaterialFlow(0.5, 1, plan);
    expect(store.getState().sourceLots.has(EARLIER_STOCK_LOT_IDS.wheat_grain)).toBe(false);
    expect([...store.getState().sourceLots.keys()]).toEqual([...lots.keys()]);
  });
});
