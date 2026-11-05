import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { deriveOperationsPlay } from './operationsPlay';

describe('the shift card next action with two incidents open', () => {
  beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());

  it('asks to acknowledge a newly raised incident behind an earlier mitigated one', () => {
    const store = useOperationsCampaignStore.getState();
    // An incident the Chronicle raised and the player has already mitigated:
    // it waits for its own restore, and stays unresolved meanwhile.
    const first = store.triggerIncident('severe_rain')!;
    store.acknowledgeIncident(first.id, 'operator');
    store.mitigateIncident(first.id, 'operator');
    store.markIncidentEffectApplied(first.id);
    // A second, different incident is raised.
    const second = useOperationsCampaignStore.getState().triggerIncident('power_sag')!;

    const play = deriveOperationsPlay(useOperationsCampaignStore.getState());
    expect(play.nextAction.kind).toBe('acknowledge');
    expect(play.nextAction.targetId).toBe(second.id);

    useOperationsCampaignStore.getState().acknowledgeIncident(second.id, 'operator');
    const next = deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction;
    expect(next.kind).toBe('mitigate');
    expect(next.targetId).toBe(second.id);
  });
});
