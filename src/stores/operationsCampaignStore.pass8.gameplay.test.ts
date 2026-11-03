import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { deriveOperationsPlay } from '../simulation/operationsPlay';
import { createTranslator, setLocale } from '../i18n';

// Eighth-pass campaign defects, reproduced through the store's own paths.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.9,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 0,
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
    openWorkOrders: 1,
    openWorkOrder: { id: 'WO-7', machineId: 'rm-101', machineName: 'RM-101' },
    ...overrides,
  };
}

const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(minutes * 60, context(overrides));

/** What a reload restores: the save is JSON, and no tick has run on the new page. */
const savedConstraints = () =>
  JSON.parse(JSON.stringify(useOperationsCampaignStore.getState().constraints));

const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
const ptConstraints = () => ({
  labels: [
    pt('constraintStorageLabel'),
    pt('constraintFeedLabel'),
    pt('constraintMaintenanceLabel'),
  ],
  details: [
    pt('constraintStorageDetail', { percent: '90' }),
    pt('constraintFeedDetail', { material: pt('materialWheatGrain') }),
    pt('constraintMachineDownDetail', {
      machine: 'RM-101',
      workOrderId: 'WO-7',
      others: 0,
      othersText: '0',
    }),
  ],
});

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

afterEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('restored constraints and the language', () => {
  it('re-words a restored set when the language switches before any tick', () => {
    tick(1);
    const saved = savedConstraints();
    expect(saved.map((constraint: { label: string }) => constraint.label)).toEqual([
      'Storage capacity',
      'Recipe feed unavailable',
      'Machine stopped for repair',
    ]);
    // A reload restores the record; the shift stays held until the player resumes.
    useOperationsCampaignStore.setState({ constraints: saved });
    setLocale('pt-BR');

    const after = useOperationsCampaignStore.getState().constraints;
    const expected = ptConstraints();
    expect(after.map((constraint) => constraint.label)).toEqual(expected.labels);
    expect(after.map((constraint) => constraint.detail)).toEqual(expected.details);
    // The repair next action reads the constraint's detail as its consequence.
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.consequence).toBe(
      expected.details[2]
    );
  });

  it('words a set saved in another language in the language active on restore', () => {
    tick(1);
    const saved = savedConstraints();
    setLocale('pt-BR');
    // The page reloads in Portuguese over a save written in English.
    useOperationsCampaignStore.setState({ constraints: saved });

    const after = useOperationsCampaignStore.getState().constraints;
    expect(after.map((constraint) => constraint.label)).toEqual(ptConstraints().labels);
    expect(after.map((constraint) => constraint.detail)).toEqual(ptConstraints().details);
    expect(after.map(({ id, severity, relatedId }) => ({ id, severity, relatedId }))).toEqual(
      saved.map(({ id, severity, relatedId }: (typeof after)[number]) => ({
        id,
        severity,
        relatedId,
      }))
    );
  });
});

describe('accepting the next programme while the shift is paused', () => {
  it('keeps the live quality hold and the truck being loaded', () => {
    const store = useOperationsCampaignStore;
    store.setState({
      orders: store.getState().orders.map((order) => ({
        ...order,
        shippedKg: order.requiredKg,
        status: 'fulfilled' as const,
        completedAtMinute: 0,
      })),
    });
    // Every commitment is met; a truck is half loaded and QC holds dispatch.
    tick(1, {
      storageUtilization: 0.5,
      sourceInventoryKg: 50000,
      openWorkOrders: 0,
      openWorkOrder: null,
      dispatchReleased: false,
      dispatchLoad: { ...context().dispatchLoad, status: 'loading', loadedKg: 2000 },
    });
    expect(store.getState().execution.qualityReleased).toBe(false);

    // Paused: no tick runs between the click and the card re-rendering.
    expect(store.getState().acceptNextProgramme('operator')).toBe(true);
    const execution = store.getState().execution;
    expect(execution.qualityReleased).toBe(false);
    expect(execution.dispatchLoad.loadedKg).toBe(2000);
    expect(execution.dispatchLoad.status).toBe('loading');
    expect(deriveOperationsPlay(store.getState()).nextAction.kind).toBe('quality');
  });
});

describe('switching commitments during a recovery challenge', () => {
  it('is refused, as the shift card says, whoever asks', () => {
    const store = useOperationsCampaignStore;
    tick(1, {
      storageUtilization: 0.5,
      sourceInventoryKg: 50000,
      openWorkOrders: 0,
      openWorkOrder: null,
    });
    expect(store.getState().startChallenge('power_recovery', 'operator')).toBe(true);
    const logLength = store.getState().logbook.length;

    // The Agent Cockpit and the on-device operator reach the store directly.
    store.getState().activateOrder('order-002', 'agent');

    const state = store.getState();
    expect(state.activeOrderId).toBe('order-001');
    expect(state.execution.orderId).toBe('order-001');
    expect(state.orders.find((order) => order.id === 'order-002')?.status).toBe('planned');
    expect(state.logbook).toHaveLength(logLength);
  });
});
