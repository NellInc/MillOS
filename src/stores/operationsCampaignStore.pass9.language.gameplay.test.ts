import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  recordOperatorAction,
  useOperationsCampaignStore,
  type CampaignTickContext,
} from './operationsCampaignStore';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';
import { paceMessages } from '../simulation/pace.messages';
import { createTranslator, setLocale } from '../i18n';

// Ninth pass: the logbook, and the choices and narration a shift review keeps,
// follow the language a player switches to, and a save written in one language
// reads in the language of the page that restores it.

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
    sourceInventoryKg: 4000,
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

const pt = createTranslator(operationsCampaignMessages, 'pt-BR');
const ptPace = createTranslator(paceMessages, 'pt-BR');

/** A window with an operator choice, an agent choice and plant narration, then closed. */
function playWindow() {
  const store = useOperationsCampaignStore.getState();
  store.initializeCampaign();
  store.activateOrder('order-003', 'operator');
  const incident = store.triggerIncident('bearing_overheat')!;
  useOperationsCampaignStore.getState().acknowledgeIncident(incident.id, 'agent');
  recordOperatorAction({ kind: 'pace', gameSpeed: 60 });
  tick(1);
  tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
}

const expectedPt = () => {
  const order = useOperationsCampaignStore.getState().orders.find((o) => o.id === 'order-003')!;
  return {
    activated: pt('logOrderActivated', {
      customer: order.customer,
      recipe: pt('recipeCommunityFlour'),
    }),
    raised: pt('bearingOverheatTitle'),
    acknowledged: pt('logIncidentAcknowledged', { title: pt('bearingOverheatTitle') }),
    pace: pt('logOperatorPace', { pace: ptPace('pace60') }),
    initialized: pt('logProgrammeInitialized'),
    processing: pt('execProcessing', { material: pt('materialWheatGrain') }),
  };
};

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});
afterEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('stored campaign copy after a language switch', () => {
  it('re-words the logbook, its sources and the closed review lines', () => {
    playWindow();
    const english = useOperationsCampaignStore.getState();
    expect(english.logbook.map((entry) => entry.message)).toContain(
      'Set the shift pace to Fast, 2x.'
    );
    setLocale('pt-BR');
    const state = useOperationsCampaignStore.getState();
    const messages = state.logbook.map((entry) => entry.message);
    const want = expectedPt();
    for (const line of [
      want.initialized,
      want.activated,
      want.raised,
      want.acknowledged,
      want.pace,
      want.processing,
    ])
      expect(messages).toContain(line);
    expect(state.logbook.map((entry) => entry.source)).toEqual(
      expect.arrayContaining([
        pt('sourceAutonomousExecution'),
        pt('sourceOrderScheduler'),
        pt('sourceIncidentController'),
        pt('sourceOperator'),
        pt('sourceProductionExecution'),
      ])
    );
    const report = state.reports.at(-1)!;
    expect(report.choices?.map((choice) => choice.message)).toEqual([
      want.activated,
      want.acknowledged,
      want.pace,
    ]);
    expect(report.narration).toEqual(expect.arrayContaining([want.raised, want.processing]));
    // Back again: nothing is lost in the round trip.
    setLocale('en');
    expect(useOperationsCampaignStore.getState().logbook.map((entry) => entry.message)).toEqual(
      english.logbook.map((entry) => entry.message)
    );
    expect(useOperationsCampaignStore.getState().reports.at(-1)!.choices).toEqual(
      english.reports.at(-1)!.choices
    );
  });

  it('words a logbook and reviews saved in English in the language of the page that restores them', () => {
    playWindow();
    const saved = JSON.parse(
      JSON.stringify({
        logbook: useOperationsCampaignStore.getState().logbook,
        reports: useOperationsCampaignStore.getState().reports,
      })
    );
    useOperationsCampaignStore.getState().resetCampaign();
    setLocale('pt-BR');
    useOperationsCampaignStore.setState(saved);
    const state = useOperationsCampaignStore.getState();
    const want = expectedPt();
    expect(state.logbook.map((entry) => entry.message)).toEqual(
      expect.arrayContaining([want.activated, want.acknowledged, want.pace])
    );
    expect(state.reports.at(-1)!.choices?.map((choice) => choice.message)).toEqual([
      want.activated,
      want.acknowledged,
      want.pace,
    ]);
  });

  it('keeps the stored text of an entry written before it carried its wording', () => {
    useOperationsCampaignStore
      .getState()
      .addLogEntry('Shift lead', 'operation', 'Checked the sifters.');
    setLocale('pt-BR');
    const entry = useOperationsCampaignStore.getState().logbook.at(-1)!;
    expect(entry.message).toBe('Checked the sifters.');
    expect(entry.source).toBe('Shift lead');
  });
});
