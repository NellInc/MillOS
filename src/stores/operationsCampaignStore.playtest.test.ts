import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialManifest, ProductionBatch } from './materialFlowStore';
import * as campaign from './operationsCampaignStore';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Fourth-pass playtest findings in the campaign store, through the real
// tickCampaign and real tick contexts.

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
const messages = () => useOperationsCampaignStore.getState().logbook.map((entry) => entry.message);

function flourShipment(id: string, kg: number): [MaterialManifest, ProductionBatch] {
  const batch: ProductionBatch = {
    id: `batch-${id}`,
    packerId: 'packer-0',
    materialType: 'flour',
    producedKg: kg,
    availableKg: 0,
    simulationTime: 10,
    sourceContributions: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    disposition: 'shipped',
    dispositionReason: 'Fully dispatched',
    qcTestIds: [],
    dispatchManifestIds: [id],
    sealed: true,
  };
  return [
    {
      id,
      kind: 'shipping',
      dock: 'shipping',
      requestedKg: kg,
      actualKg: kg,
      materials: [{ type: 'flour', amount: kg }],
      sourceLots: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
      productBatches: [{ batchId: batch.id, amount: kg }],
      simulationTime: 20,
    },
    batch,
  ];
}

beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());
afterEach(() => setLocale('en'));

describe('PLAYTEST-14: kilograms in the campaign narration are grouped', () => {
  it.each([
    [
      'en',
      'Shipping load is 1,200 of 5,000 kg.',
      '5,000 kg left the shipping bay.',
      'allocated 6,000 kg',
    ],
    [
      'pt-BR',
      'A carga de expedição está em 1.200 de 5.000 kg.',
      '5.000 kg saíram da doca de expedição.',
      'alocou 6.000 kg',
    ],
  ] as const)('in %s', (locale, loading, dispatched, allocated) => {
    setLocale(locale);
    tick(1);
    tick(1, { dispatchLoad: { ...context().dispatchLoad, status: 'loading', loadedKg: 1200 } });
    expect(messages()).toContain(loading);
    tick(1, {
      dispatchLoad: {
        ...context().dispatchLoad,
        status: 'departed',
        loadedKg: 5000,
        lastDispatchKg: 5000,
      },
    });
    expect(messages()).toContain(dispatched);
    const [manifest, batch] = flourShipment('shipping-0006', 6000);
    tick(1, { manifests: [manifest], productionBatches: [batch] });
    expect(messages().some((message) => message.includes(allocated))).toBe(true);
  });
});

describe('PLAYTEST-6: a window cut short by Reset to 10 AM is not graded on its own', () => {
  it('carries the cut-short window into the one the reset opens, and grades them once', () => {
    tick(1);
    tick(239);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    expect(useOperationsCampaignStore.getState().reports).toHaveLength(1);
    const afternoonStart = useOperationsCampaignStore.getState().shiftStartedAtMinute;
    // Half an hour into the afternoon one truck leaves, then the clock is reset.
    const [manifest, batch] = flourShipment('shipping-0002', 5000);
    tick(30, {
      shiftKey: 'day-0-afternoon',
      shiftLabel: 'Afternoon',
      manifests: [manifest],
      productionBatches: [batch],
    });
    tick(1, { shiftKey: 'day-0-morning', shiftLabel: 'Morning' });
    // No letter for 31 minutes of an afternoon.
    expect(useOperationsCampaignStore.getState().reports).toHaveLength(1);
    expect(useOperationsCampaignStore.getState().currentShiftKey).toBe('day-0-morning');
    // The window the reset opened closes at 14:00 with all of its evidence.
    tick(239);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const reports = useOperationsCampaignStore.getState().reports;
    expect(reports).toHaveLength(2);
    expect(reports[1]).toMatchObject({
      shiftKey: 'day-0-morning',
      startedAtMinute: afternoonStart,
    });
    expect(reports[1].metrics.dispatchedKg).toBeCloseTo(5000, 6);
  });

  it('still closes a window at every forward boundary, and the old per-day night key', () => {
    tick(1);
    tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    tick(1, { shiftKey: 'day-1-morning', shiftLabel: 'Morning' });
    expect(useOperationsCampaignStore.getState().reports.map((r) => r.shiftKey)).toEqual([
      'day-0-morning',
      'day-0-afternoon',
      'day-0-night',
    ]);
    // A save from before night windows took the previous day's key.
    useOperationsCampaignStore.setState({ currentShiftKey: 'day-2-night' });
    tick(1, { shiftKey: 'day-1-night', shiftLabel: 'Night' });
    expect(useOperationsCampaignStore.getState().reports.at(-1)?.shiftKey).toBe('day-2-night');
  });
});

describe('PLAYTEST-6: the operator actions a player takes are their decisions', () => {
  it.each([
    [{ kind: 'maintenance', machine: 'R.M. 101' }, 'Performed maintenance on R.M. 101.'],
    [{ kind: 'restart', machine: 'R.M. 101' }, 'Restarted R.M. 101.'],
    [{ kind: 'drillStarted' }, 'Started an egress verification drill.'],
    [{ kind: 'drillEnded' }, 'Ended the egress verification drill.'],
    [{ kind: 'emergencyStop' }, 'Pressed the facility emergency stop.'],
    [{ kind: 'emergencyCleared' }, 'Released the facility emergency stop.'],
    [{ kind: 'pace', gameSpeed: 60 }, 'Set the shift pace to Fast, 2x.'],
  ] as const)('records %o in "Your decisions"', (action, message) => {
    tick(1);
    const record = (campaign as Record<string, unknown>).recordOperatorAction as
      | ((action: unknown) => void)
      | undefined;
    expect(record, 'recordOperatorAction is exported').toBeTypeOf('function');
    record!(action);
    tick(1);
    const report = selectProvisionalShiftReport(useOperationsCampaignStore.getState());
    expect(report?.choices).toEqual([expect.objectContaining({ actor: 'operator', message })]);
  });

  it('words the decision in Brazilian Portuguese when that is the language', () => {
    setLocale('pt-BR');
    tick(1);
    const record = (campaign as Record<string, unknown>).recordOperatorAction as
      | ((action: unknown) => void)
      | undefined;
    expect(record).toBeTypeOf('function');
    record!({ kind: 'maintenance', machine: 'R.M. 101' });
    expect(messages().at(-1)).toBe('Manutenção feita em R.M. 101.');
  });
});
