/**
 * What grain costs the mill (plan item 3.8, "Grain has a price").
 *
 * Grain is bought when a delivery is taken in (the "Grain" ledger line) and
 * held as stock at cost (the "Stock held" line) until the flour or semolina it
 * became leaves on a truck. A shift's net therefore carries the grain in what
 * it shipped, and grain bought for stock not yet sold shows as money spent and
 * not yet earned, never as revenue. Pure: no store reads.
 *
 * SOURCES (raw tables fetched 13 November 2026, both "Updated: November 10, 2026"):
 * - USDA ERS, Wheat Data, wheat-data-all-years.xlsx
 *   (https://www.ers.usda.gov/data-products/wheat-data), Table 32 "Wheat and
 *   flour price relationships, Kansas City, MO" and Table 33 (Minneapolis),
 *   dollars per cwt of flour. "Cost of wheat to produce flour: ... Cost of 2.28
 *   bushels based on a 73-percent extraction rate"; flour is "bakers' standard
 *   patent, bulk basis"; byproducts are millfeed (bran, shorts, middlings).
 *   Marketing years Jun-May:
 *                          wheat    flour   byproducts  (wheat - byproducts) / flour
 *     KC   2023/24        18.519   18.517     2.507       86.5%
 *     KC   2024/25        15.230   16.096     2.189       81.0%
 *     KC   2025/26        15.238   15.400     2.393       83.4%
 *     Mpls 2023/24        20.556   19.725     2.536       91.4%
 *     Mpls 2024/25        18.592   18.479     2.143       89.0%
 *     Mpls 2025/26        16.920   16.613     2.321       87.9%
 *   The game sells no bran or middlings, so the basis is wheat net of the
 *   byproduct credit, over the flour price: 81% to 91% of flour revenue.
 * - USDA ERS, Feed Grains Database, feed-grains-yearbook-tables-all-years.xlsx
 *   (https://www.ers.usda.gov/data-products/feed-grains-database/feed-grains-yearbook-tables),
 *   Table 12 "Corn: Cash prices", No. 2 yellow, Central Illinois, $/bu (56 lb),
 *   and Table 17 "Processed corn products", corn meal, yellow, Chicago, $/cwt.
 *   Sep-Aug years: corn 4.391, 4.324, 4.375 $/bu (7.84, 7.72, 7.81 $/cwt);
 *   meal 23.95, 22.64, 21.57 $/cwt (2023/24, 2024/25, 2025/26). At the game's
 *   corn yield (below), corn / (yield x meal) is 53.0%, 55.2% and 58.7%. The
 *   game's "fine semolina" is milled from corn (D17 asks whether it should be
 *   durum); it is priced as corn meal is.
 *
 * THE GAME'S YIELDS (materialFlowStore.ts conversion ratios): a mill passes
 * 72% of wheat as flour, or 65% of corn as semolina; the sifter passes 95%. So
 * a kg of flour takes 1 / 0.684 kg of wheat and a kg of semolina 1 / 0.6175 kg
 * of corn. ERS's own basis is a 73% extraction, so the game mills a little
 * less efficiently than the reference mill.
 *
 * ARITHMETIC. The game's wheat flour sells at 0.82 (strong white) and 0.68
 * (community flour) a kg, semolina at 0.94 (operationsCampaignStore order
 * templates). Each programme (simulation/programmes.ts) is a 2,500 kg rush at
 * 30% more, 3,000 kg standard and 6,000 or 8,000 kg bulk, the customers
 * rotating through the three slots, so a fifth of each customer's kilograms
 * (2,500 of about 12,170) carries the premium: x1.06 on average. Sold, wheat
 * flour fetches 0.796 a kg on average (0.870 strong white, 0.722 community),
 * semolina 0.998.
 * - Wheat at 0.46 a kg: 0.46 / (0.796 x 0.684) = 84.5% of flour revenue as
 *   sold, inside 81-91%; 89.7% at list prices (0.46 / (0.75 x 0.684)).
 * - Corn at 0.33 a kg: 0.33 / (0.998 x 0.6175) = 53.5% of semolina revenue as
 *   sold, inside 53-59%; 56.9% at its list price.
 * The ten-shift harness (plantMeasure.playtest.test.ts, MILLOS_PLANT_MAINTENANCE_OUT)
 * reports the grain share a run actually pays over both products.
 */
export const GRAIN_PRICE_PER_KG = {
  wheat_grain: 0.46,
  corn_grain: 0.33,
} as const;

/** Finished kg per kg of grain on the game's line (mill x sifter). */
export const FINISHED_YIELD = {
  flour: 0.72 * 0.95,
  semolina: 0.65 * 0.95,
} as const;

/** The grain each finished product is milled from. */
const SOURCE_GRAIN = { flour: 'wheat_grain', semolina: 'corn_grain' } as const;

/** What a delivery of grain costs. Negative or non-finite kg costs nothing. */
export function grainPurchaseCost(kg: { wheat_grain?: number; corn_grain?: number }): number {
  const wheat = Number.isFinite(kg.wheat_grain) ? Math.max(0, kg.wheat_grain as number) : 0;
  const corn = Number.isFinite(kg.corn_grain) ? Math.max(0, kg.corn_grain as number) : 0;
  return wheat * GRAIN_PRICE_PER_KG.wheat_grain + corn * GRAIN_PRICE_PER_KG.corn_grain;
}

/** Milled kg per kg of grain at the mill, before the sifter (materialFlowStore). */
const MILLED_YIELD = { flour: 0.72, semolina: 0.65 } as const;

type Stage = 'milled' | 'sifted';
/** A material's grain cost where it stands: grain as bought, product at its yield so far. */
function grainValueOf(material: { type: string; amount: number }, stage: Stage): number {
  const amount = Number.isFinite(material.amount) ? Math.max(0, material.amount) : 0;
  if (material.type === 'wheat_grain' || material.type === 'corn_grain')
    return amount * GRAIN_PRICE_PER_KG[material.type];
  if (material.type !== 'flour' && material.type !== 'semolina') return 0;
  const yieldSoFar =
    stage === 'milled' ? MILLED_YIELD[material.type] : FINISHED_YIELD[material.type];
  return (amount / yieldSoFar) * GRAIN_PRICE_PER_KG[SOURCE_GRAIN[material.type]];
}

/**
 * The grain cost of everything on site that will leave as flour or semolina,
 * valued as grainInShipped will take it out of stock held: grain at its
 * price, product at its grain over the yield it has passed (a mill's flour
 * still has the sifter's loss to come). Bran and middlings carry none: their
 * grain is in the flour's yield. The plant's opening stock is booked at this
 * on the first tick of a material session (review 2, the ledger), so stock
 * held never debits grain that was never bought.
 */
export function grainValueOnSite(flow: {
  machineBuffers: ReadonlyMap<
    string,
    {
      machineType: string;
      inputBuffer: readonly { type: string; amount: number }[];
      outputBuffer: readonly { type: string; amount: number }[];
    }
  >;
  network: {
    segments: readonly {
      fromMachineId: string;
      inTransit: readonly { type: string; amount: number }[];
    }[];
  };
}): number {
  // Flour is milled until the sifter has passed it.
  const outputStage = (machineType: string | undefined): Stage =>
    machineType === 'plansifter' || machineType === 'packer' ? 'sifted' : 'milled';
  let value = 0;
  flow.machineBuffers.forEach((buffer) => {
    const inputStage: Stage = buffer.machineType === 'packer' ? 'sifted' : 'milled';
    for (const material of buffer.inputBuffer) value += grainValueOf(material, inputStage);
    for (const material of buffer.outputBuffer)
      value += grainValueOf(material, outputStage(buffer.machineType));
  });
  for (const segment of flow.network.segments) {
    const stage = outputStage(flow.machineBuffers.get(segment.fromMachineId)?.machineType);
    for (const material of segment.inTransit) value += grainValueOf(material, stage);
  }
  return Math.round(value * 100) / 100;
}

/**
 * The grain cost carried by shipped product: each kg of flour or semolina
 * leaving the plant takes its grain, at its yield, out of stock held.
 */
export function grainInShipped(materials: readonly { type: string; amount: number }[]): number {
  let cost = 0;
  for (const material of materials) {
    if (material.type !== 'flour' && material.type !== 'semolina') continue;
    const amount = Number.isFinite(material.amount) ? Math.max(0, material.amount) : 0;
    cost +=
      (amount / FINISHED_YIELD[material.type]) * GRAIN_PRICE_PER_KG[SOURCE_GRAIN[material.type]];
  }
  return cost;
}
