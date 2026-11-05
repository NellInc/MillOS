import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
  type IncidentKind,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Fourteenth-pass campaign defects, reproduced through the store's own paths.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
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
    ...overrides,
  };
}
const store = () => useOperationsCampaignStore.getState();

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});

/*
 * The campaign keeps its last 32 incidents. Over a long Chronicle campaign
 * forecasts raise one after another; the bound dropped the oldest whatever its
 * phase, so an incident the player had mitigated but not yet restored vanished
 * with its residual effect still owed, and the Chronicle forgot the incident
 * it owns (a storm it raised could no longer be cleared).
 */
describe('the incident bound over a long campaign', () => {
  const RECYCLED: IncidentKind[] = ['power_sag', 'packaging_shortage', 'control_network_degraded'];

  it('keeps an incident still open when 32 newer ones have come and gone', () => {
    const open = store().triggerIncident('severe_rain')!;
    store().acknowledgeIncident(open.id);
    store().mitigateIncident(open.id);
    for (let i = 0; i < 32; i++) {
      const incident = store().triggerIncident(RECYCLED[i % RECYCLED.length])!;
      store().resolveIncident(incident.id);
    }
    const kept = store().incidents.find((incident) => incident.id === open.id);
    expect(kept?.phase).toBe('mitigated');
    expect(store().incidents.length).toBeLessThanOrEqual(32);
    // Its residual effect (vehicles slowed by the rain) still applies.
    expect(store().getIncidentEffect().vehicleSpeedMultiplier).toBeLessThan(1);
  });
});

/*
 * Constraints are computed by the tick, and no tick runs while the shift is
 * paused. Mitigating or resolving the incident that isolates dispatch lifts
 * the isolation at once (getIncidentEffect), but the shift card kept reading
 * "Blocked: Dispatch isolated" and "This shift so far" counted it as a risk
 * until the shift was resumed.
 */
describe('dispatch isolation lifted while the shift is paused', () => {
  const isolate = () => {
    const incident = store().triggerIncident('supplier_contamination')!;
    store().markIncidentEffectApplied(incident.id);
    store().tickCampaign(60, context());
    expect(store().constraints.map((constraint) => constraint.id)).toContain('dispatch-isolated');
    return incident;
  };

  it('drops the isolation constraint when the incident is mitigated', () => {
    const incident = isolate();
    store().acknowledgeIncident(incident.id, 'operator');
    store().mitigateIncident(incident.id, 'operator');
    expect(store().getIncidentEffect().dispatchBlocked).toBe(false);
    expect(store().constraints.map((constraint) => constraint.id)).not.toContain(
      'dispatch-isolated'
    );
    expect(selectProvisionalShiftReport(store())?.openRisks).not.toContain('Dispatch isolated');
  });

  it('drops the isolation constraint when the incident is resolved', () => {
    const incident = isolate();
    store().resolveIncident(incident.id, 'operator');
    expect(store().constraints.map((constraint) => constraint.id)).not.toContain(
      'dispatch-isolated'
    );
  });

  it('keeps the other constraints the last tick computed', () => {
    const incident = isolate();
    store().tickCampaign(60, context({ storageUtilization: 0.9 }));
    store().mitigateIncident(incident.id, 'operator');
    expect(store().constraints.map((constraint) => constraint.id)).toEqual(['storage-high']);
  });
});
