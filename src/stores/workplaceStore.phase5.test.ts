import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import type { WorkplaceState } from '../types/workplace';

beforeEach(() => {
  endReplayClock();
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

describe('5.3 the solo player is Packing (D5)', () => {
  it('refuses to cast an authored role’s understanding, ballot or cover', () => {
    const store = useWorkplaceStore.getState();
    expect(store.startCampaign('cooperative', 17).changed).toBe(true);
    for (const result of [
      store.understand('quality'),
      store.vote('coordinator', true),
      store.consentToCover('maintenance', true),
    ]) {
      expect(result.changed).toBe(false);
      expect(result.reasonCopy?.key).toBe('authoredRoleAnswers');
    }
  });

  it('keeps every role’s own input outside a solo season', () => {
    const store = useWorkplaceStore.getState();
    expect(store.start('game', 17).changed).toBe(true);
    expect(store.understand('quality').changed).toBe(true);
    expect(store.vote('quality', true).changed).toBe(true);
  });
});

describe('5.9 the reserve brought forward', () => {
  /** A finished season whose books carry a reserve forward. */
  const season = (seed: number, reserve: number): WorkplaceState => {
    const state = createWorkplace('game', seed);
    return {
      ...state,
      phase: 'review',
      campaign: {
        version: 1,
        profile: 'cooperative',
        shift: 2,
        history: [],
        checks: {},
        decision: null,
        inspectionUntilMinute: null,
        inspectionComplete: false,
        adviserAcknowledged: false,
        repairs: 0,
        agreementProved: false,
        reserveBrought: reserve,
      },
    };
  };

  it('opens a new season with the latest season’s reserve, never one already brought', () => {
    // A was archived with 50 in reserve; B, started later, was left with 20.
    // Seasons saved before they were numbered (review 2): read by seed, once.
    useWorkplaceStore.setState({
      completedCampaigns: [season(10, 50)],
      leftCampaigns: [season(20, 20)],
      seasonsBegun: 0,
    });
    expect(useWorkplaceStore.getState().startMission('cooperative', 30).changed).toBe(true);
    expect(useWorkplaceStore.getState().workplace.campaign?.reserveBrought).toBe(20);
    expect(useWorkplaceStore.getState().workplace.finance.cash).toBe(420);
  });
});
