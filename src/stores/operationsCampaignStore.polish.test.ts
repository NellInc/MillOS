import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { createTranslator, setLocale } from '../i18n';

// Third-pass campaign defects, reproduced through the real tick.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
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

const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(minutes * 60, context(overrides));

const feedConstraint = () =>
  useOperationsCampaignStore
    .getState()
    .constraints.find((constraint) => constraint.id.startsWith('recipe-feed-'));

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

afterEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('recipe feed constraint', () => {
  it('is not raised when the dispatch order remainder is already packed', () => {
    // order-001 needs 6,000 kg; all of it is packed, the wheat route is empty
    // and the line has nothing left to make for any order.
    tick(1, {
      sourceInventoryKg: 0,
      finishedAvailableKg: 6000,
      releasedFinishedKg: 6000,
      lineOrderId: 'order-001',
    });
    expect(useOperationsCampaignStore.getState().execution.stage).toBe('ready_to_load');
    expect(feedConstraint()).toBeUndefined();
  });

  it('is not raised while the line pre-stages an order on another grain', () => {
    // order-002 is semolina from corn; the empty wheat route does not stop it.
    tick(1, {
      sourceInventoryKg: 0,
      finishedAvailableKg: 6000,
      releasedFinishedKg: 6000,
      lineOrderId: 'order-002',
      lineCustomer: 'Community Pasta Works',
    });
    expect(feedConstraint()).toBeUndefined();
  });

  it('is still raised when the remainder is not packed', () => {
    tick(1, { sourceInventoryKg: 0, finishedAvailableKg: 1200, lineOrderId: 'order-001' });
    expect(feedConstraint()?.severity).toBe('critical');
  });

  it('is still raised when the pre-staged order needs the same empty grain', () => {
    // order-003 is community flour from wheat, the grain that has run out.
    tick(1, {
      sourceInventoryKg: 0,
      finishedAvailableKg: 6000,
      lineOrderId: 'order-003',
      lineCustomer: 'County School Meals',
    });
    expect(feedConstraint()?.severity).toBe('critical');
  });
});

describe('constraints after a language switch', () => {
  it('re-words the open constraints without waiting for a tick', () => {
    tick(1, { sourceInventoryKg: 0, storageUtilization: 0.9 });
    const before = useOperationsCampaignStore.getState().constraints;
    expect(before.map((constraint) => constraint.label)).toEqual([
      'Storage capacity',
      'Recipe feed unavailable',
    ]);

    // Paused: no tick runs, so only the switch itself can re-word them.
    setLocale('pt-BR');

    const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
    const after = useOperationsCampaignStore.getState().constraints;
    expect(after.map((constraint) => constraint.label)).toEqual([
      pt('constraintStorageLabel'),
      pt('constraintFeedLabel'),
    ]);
    expect(after[0].detail).toBe(pt('constraintStorageDetail', { percent: '90' }));
    // The same constraints, worded again: ids, severities and targets hold.
    expect(after.map(({ id, severity, relatedId }) => ({ id, severity, relatedId }))).toEqual(
      before.map(({ id, severity, relatedId }) => ({ id, severity, relatedId }))
    );
  });

  it('leaves restored constraints alone when they are not the ones the tick wrote', () => {
    tick(1, { sourceInventoryKg: 0 });
    const restored = [
      {
        id: 'storage-high',
        severity: 'warning' as const,
        label: 'Restored label',
        detail: 'Restored detail',
        relatedId: null,
      },
    ];
    useOperationsCampaignStore.setState({ constraints: restored });
    setLocale('pt-BR');
    expect(useOperationsCampaignStore.getState().constraints).toBe(restored);
  });
});
