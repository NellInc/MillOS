import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';

const context = (): CampaignTickContext => ({
  shiftKey: 'day-0-morning',
  shiftLabel: 'Morning',
  manifests: [],
  productionBatches: [],
  totalEnergyKw: 450,
  averageQuality: 99,
  wasteKg: 0,
  storageUtilization: 0.2,
  shippingDocked: false,
  receivingDocked: false,
  dispatchReleased: true,
  sourceInventoryKg: 50000,
  finishedAvailableKg: 0,
  releasedFinishedKg: 0,
  dispatchLoad: {
    cycleId: 'shipping-1',
    status: 'away',
    loadedKg: 0,
    capacityKg: 5000,
    materialType: 'flour',
    blockReason: null,
    lastDispatchKg: 0,
  },
  openWorkOrders: 0,
});
const store = () => useOperationsCampaignStore.getState();
const fuel = () => store().utilityAssets.find((a) => a.id === 'utility-fuel-oil-01')!;

// Every tick drained the utility vessels and nothing ever refilled them, so a
// long session left FUEL OIL 01 low, then critical, for good: a SCADA alarm
// with no way out. Working if a vessel that falls to its reorder level is
// topped up by a delivery a game half-day later.
describe('utility vessel deliveries', () => {
  beforeEach(() => store().resetCampaign());

  it('tops a vessel back up after it falls to its reorder level', () => {
    useOperationsCampaignStore.setState({
      utilityAssets: store().utilityAssets.map((asset) =>
        asset.id === 'utility-fuel-oil-01' ? { ...asset, levelPercent: 29.5 } : asset
      ),
    });
    store().tickCampaign(60, context());
    expect(fuel().levelPercent).toBeLessThan(30);
    // Thirteen game hours later the delivery has come.
    for (let i = 0; i < 13; i++) store().tickCampaign(3600, context());
    const nominal = UTILITY_ASSET_DEFINITIONS.find(
      (d) => d.id === 'utility-fuel-oil-01'
    )!.nominalLevelPercent;
    expect(fuel().levelPercent).toBeGreaterThan(nominal - 1);
    expect(fuel().status).toBe('normal');
  });
});
