import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../stores/operationsCampaignStore';
import type { MaterialManifest, ProductionBatch } from '../stores/materialFlowStore';
import { setLocale } from '../i18n';
import { deriveOperationsPlay } from './operationsPlay';
import { operationsPlayMessages } from './operationsPlay.messages';
import { messages as chronicleOverviewMessages } from '../components/chronicle/ChronicleOverview.messages';
import { contextSidebarMessages } from '../components/ui-new/sidebar/ContextSidebar.messages';

/*
 * Plan item 1.15 (report 02, defect 5): with a Chronicle-raised incident still
 * open and a programme ready, the shift card's next action names the
 * Chronicle's Restore controls, not "remaining incident effects in SCADA". An
 * incident the Chronicle does not own keeps its route.
 */

const store = () => useOperationsCampaignStore.getState();

const flourBatch: ProductionBatch = {
  id: 'batch-0001',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 14000,
  availableKg: 0,
  simulationTime: 10,
  sourceContributions: [{ lotId: 'lot-0001', amount: 14000, path: ['silo-0', 'packer-0'] }],
  disposition: 'shipped',
  dispositionReason: 'Fully dispatched',
  qcTestIds: ['qc-1'],
  dispatchManifestIds: ['shipping-0001'],
  sealed: true,
};
/** The whole first programme: 14,000 kg of flour and 4,000 kg of semolina. */
const programmeManifest: MaterialManifest = {
  id: 'shipping-0001',
  kind: 'shipping',
  dock: 'shipping',
  requestedKg: 18000,
  actualKg: 18000,
  materials: [
    { type: 'flour', amount: 14000 },
    { type: 'semolina', amount: 4000 },
  ],
  sourceLots: [{ lotId: 'lot-0001', amount: 18000, path: ['silo-0', 'packer-0'] }],
  productBatches: [
    { batchId: 'batch-0001', amount: 14000 },
    { batchId: 'batch-0002', amount: 4000 },
  ],
  simulationTime: 20,
};
const departed: CampaignTickContext['dispatchLoad'] = {
  cycleId: 'shipping-0',
  status: 'away',
  loadedKg: 0,
  capacityKg: 5000,
  materialType: 'flour',
  blockReason: null,
  lastDispatchKg: 0,
};
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
    dispatchLoad: { ...departed },
    openWorkOrders: 0,
    ...overrides,
  };
}
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  store().tickCampaign(minutes * 60, context(overrides));

/** A power sag mitigated and taking effect, with every order fulfilled. */
function mitigatedWithProgrammeReady(effectApplied = true) {
  const incident = store().triggerIncident('power_sag')!;
  store().acknowledgeIncident(incident.id);
  store().mitigateIncident(incident.id);
  if (effectApplied) store().markIncidentEffectApplied(incident.id);
  const state = store();
  return {
    incident,
    snapshot: {
      ...state,
      orders: state.orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
    },
  };
}

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
});
afterEach(() => setLocale('en'));

describe('the card leads a Chronicle-raised incident to the Chronicle restore (1.15)', () => {
  it('names Restore controls in the Mill Chronicle, in both languages', () => {
    const { incident, snapshot } = mitigatedWithProgrammeReady();
    const play = deriveOperationsPlay(snapshot, [incident.id]);
    expect(play.nextAction.kind).toBe('chronicle');
    expect(play.nextAction.targetId).toBe(incident.id);
    expect(play.nextAction.label).not.toContain('SCADA');
    expect(play.nextAction.label).toContain(chronicleOverviewMessages.en.m26);
    expect(play.nextAction.label).toContain(contextSidebarMessages.en.chronicle);
    expect(play.nextAction.consequence).toContain(chronicleOverviewMessages.en.m23);

    setLocale('pt-BR');
    const pt = deriveOperationsPlay(snapshot, [incident.id]).nextAction;
    expect(pt.label).toContain(chronicleOverviewMessages['pt-BR'].m26);
    expect(pt.label).toContain(contextSidebarMessages['pt-BR'].chronicle);
    expect(pt.consequence).toContain(chronicleOverviewMessages['pt-BR'].m23);
  });

  it('says the restore waits on the mitigation before it takes effect', () => {
    const { incident, snapshot } = mitigatedWithProgrammeReady(false);
    const action = deriveOperationsPlay(snapshot, [incident.id]).nextAction;
    expect(action.kind).toBe('chronicle');
    expect(action.consequence).not.toContain(chronicleOverviewMessages.en.m23);
  });

  it('holds on the real path: the programme shipped by tickCampaign, its truck departed', () => {
    const batches: ProductionBatch[] = [
      { ...flourBatch },
      {
        ...flourBatch,
        id: 'batch-0002',
        materialType: 'semolina',
        producedKg: 4000,
        sourceContributions: [{ lotId: 'lot-0001', amount: 4000, path: ['silo-0', 'packer-0'] }],
      },
    ];
    tick(1, { manifests: [programmeManifest], productionBatches: batches });
    const incident = store().triggerIncident('power_sag')!;
    store().acknowledgeIncident(incident.id);
    store().mitigateIncident(incident.id);
    tick(1, {
      sourceInventoryKg: 0,
      dispatchLoad: { ...departed, status: 'departed', lastDispatchKg: 5000 },
    });
    tick(1, { sourceInventoryKg: 0, dispatchLoad: { ...departed, status: 'away' } });
    const state = store();
    expect(state.orders.every((order) => order.status === 'fulfilled')).toBe(true);
    expect(state.incidents.find((item) => item.id === incident.id)?.phase).toBe('mitigated');
    expect(deriveOperationsPlay(state).nextAction.label).toBe(
      operationsPlayMessages.en.residualLabel
    );
    expect(deriveOperationsPlay(state, [incident.id]).nextAction.kind).toBe('chronicle');
    // Still true straight after the departure, before the bay clears.
    tick(1, {
      sourceInventoryKg: 0,
      dispatchLoad: { ...departed, status: 'departed', lastDispatchKg: 5000 },
    });
    expect(deriveOperationsPlay(store(), [incident.id]).nextAction.kind).toBe('chronicle');
  });

  it('keeps the existing route for an incident the Chronicle does not own', () => {
    const { snapshot } = mitigatedWithProgrammeReady();
    const action = deriveOperationsPlay(snapshot).nextAction;
    expect(action.kind).toBe('production');
    expect(action.label).toBe(operationsPlayMessages.en.residualLabel);
  });
});
