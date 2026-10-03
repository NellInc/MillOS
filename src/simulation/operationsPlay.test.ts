import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';

describe('live operations read model', () => {
  beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());
  it('explains empty feed and disables unavailable challenges', () => {
    const model = deriveOperationsPlay(useOperationsCampaignStore.getState());
    expect(model.nextAction.kind).toBe('receiving');
    expect(model.nextAction.consequence).toContain('wheat grain');
    expect(model.challenges.every((challenge) => !challenge.available)).toBe(true);
  });
  it('prioritizes a real quality hold over feed or production advice', () => {
    const state = useOperationsCampaignStore.getState();
    const model = deriveOperationsPlay({
      ...state,
      execution: { ...state.execution, qualityReleased: false },
    });
    expect(model.nextAction.kind).toBe('quality');
  });
  it('cannot start a challenge using stale inventory from a newly selected recipe', () => {
    const state = useOperationsCampaignStore.getState();
    const model = deriveOperationsPlay({
      ...state,
      execution: {
        ...state.execution,
        sourceInventoryKg: 10000,
        qualityReleased: true,
        stage: 'planning',
      },
    });
    expect(model.challenges.every((challenge) => !challenge.available)).toBe(true);
    expect(model.challenges[0].blockedReason).toContain('refresh');
  });
  it('never offers generic physical incident resolution', () => {
    const store = useOperationsCampaignStore.getState();
    const incident = store.triggerIncident('bearing_overheat')!;
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
      'acknowledge'
    );
    store.acknowledgeIncident(incident.id);
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
      'mitigate'
    );
    store.mitigateIncident(incident.id);
    store.markIncidentEffectApplied(incident.id);
    expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).not.toBe(
      'resolve'
    );
  });
  it('offers explicit new commitments only when the existing programme is settled', () => {
    const state = useOperationsCampaignStore.getState();
    const model = deriveOperationsPlay({
      ...state,
      activeOrderId: null,
      orders: state.orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
    });
    expect(model.canAcceptNextProgramme).toBe(true);
    expect(model.nextAction.kind).toBe('programme');
    expect(model.nextAction.consequence).toContain('no goods or revenue are created');
  });
});
