/**
 * The ledger's opening stock (review 2). The plant opens with grain and flour
 * on site that no delivery bought; its shipments debit stock held all the
 * same. Booked as bought and held on a material session's first tick, it nets
 * nothing that day, and stock held stays the grain cost of what is on site.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { grainValueOnSite, GRAIN_PRICE_PER_KG, FINISHED_YIELD } from '../simulation/grainPrice';
import { shiftMargin } from '../simulation/shiftReview';

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 0,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.5,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
    ...overrides,
  };
}
const campaign = () => useOperationsCampaignStore.getState();

beforeEach(() => {
  campaign().resetCampaign();
  useMaterialFlowStore.getState().resetMaterialFlow();
});

describe('the opening stock is bought on day one', () => {
  it('values every grain-bearing kilogram on site as a shipment will take it out', () => {
    const value = grainValueOnSite(useMaterialFlowStore.getState());
    expect(value).toBeGreaterThan(0);
    // A packed kilogram of flour carries its grain over the whole line's yield,
    // a kilogram still to be sifted over the mill's alone, bran none.
    const flow = (machineType: string, input: string, output: string) => ({
      machineBuffers: new Map([
        [
          'x',
          {
            machineType,
            inputBuffer: [{ type: input, amount: 100 }],
            outputBuffer: [{ type: output, amount: 100 }],
          },
        ],
      ]),
      network: { segments: [] },
    });
    expect(grainValueOnSite(flow('packer', 'flour', 'flour'))).toBeCloseTo(
      ((200 / FINISHED_YIELD.flour) * GRAIN_PRICE_PER_KG.wheat_grain * 100) / 100,
      2
    );
    expect(grainValueOnSite(flow('roller_mill', 'wheat_grain', 'bran'))).toBeCloseTo(
      100 * GRAIN_PRICE_PER_KG.wheat_grain,
      2
    );
    expect(grainValueOnSite(flow('plansifter', 'flour', 'flour'))).toBeCloseTo(
      (100 / 0.72 + 100 / FINISHED_YIELD.flour) * GRAIN_PRICE_PER_KG.wheat_grain,
      2
    );
  });

  it('books it as grain bought and stock held, once a session, netting nothing', () => {
    const value = grainValueOnSite(useMaterialFlowStore.getState());
    const sessionId = useMaterialFlowStore.getState().sessionId;
    campaign().tickCampaign(
      60,
      context({ materialSessionId: sessionId, openingStockValue: value })
    );
    const e = campaign().economics;
    expect(e.grainCost).toBeCloseTo(value, 2);
    expect(e.stockHeld).toBeCloseTo(value, 2);
    // Bought and held at once: the net does not move for it.
    expect((e.grainCost ?? 0) - (e.stockHeld ?? 0)).toBeCloseTo(0, 6);
    expect(shiftMargin(e)).toBeCloseTo(
      e.revenue -
        e.energyCost -
        e.automationCost -
        e.wasteCost -
        e.maintenanceCost -
        e.demurrageCost -
        e.latePenalties,
      6
    );
    // The same session's next tick books nothing more.
    campaign().tickCampaign(
      60,
      context({ materialSessionId: sessionId, openingStockValue: value })
    );
    expect(campaign().economics.grainCost).toBeCloseTo(value, 2);
    // A new session (a reset plant) opens with its own stock.
    campaign().tickCampaign(60, context({ materialSessionId: 'another', openingStockValue: 100 }));
    expect(campaign().economics.stockHeld).toBeCloseTo(value + 100, 2);
  });
});
