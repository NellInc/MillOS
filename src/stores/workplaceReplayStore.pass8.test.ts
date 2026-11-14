import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceReplayStore } from './workplaceReplayStore';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { safeJSONStorage } from './storage';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
  isWorkplaceReplayActive,
  registerReplayParticipant,
} from '../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../test/firstDelivery';

const KEY = 'millos-workplace-laboratory';
let unregister: Array<() => void> = [];
beforeEach(async () => {
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
  useGameSimulationStore.getState().setGameSpeed(0);
  await safeJSONStorage.removeItem(KEY);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
  const actor = { at: 1 };
  unregister = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, {
      capture: () => ({ ...actor }),
      restore: (saved) => Object.assign(actor, saved),
    })
  );
});
afterEach(() => {
  unregister.forEach((fn) => fn());
  unregister = [];
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
});

const persistedWorkplace = async () =>
  ((await safeJSONStorage.getItem(KEY)) as { state: { workplace: { campaign: unknown } } } | null)
    ?.state.workplace;

describe('Workplace lane, eighth pass: a reload during a matched replay', () => {
  // The physical session never saves while a replay runs, so a reload brings
  // back the pre-replay plant. The workplace must come back with it, not as the
  // replay's season bound to a plant it never ran on.
  it('keeps the pre-replay workplace on disk while the replay runs', async () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    expect(isWorkplaceReplayActive()).toBe(true);
    expect(useWorkplaceStore.getState().workplace.campaign).toBeTruthy();
    expect(await persistedWorkplace()).toMatchObject({ campaign: null });
    await useWorkplaceStore.persist.rehydrate();
    expect(useWorkplaceStore.getState().workplace.campaign).toBeNull();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  });

  // Forgetting the replay keeps its plant (the physical session saves again),
  // so the season the replay left is what a later reload must find.
  it('saves the replay season once the replay is forgotten', async () => {
    useWorkplaceReplayStore.getState().capture(17);
    useWorkplaceReplayStore.getState().begin('toe-dip');
    expect(useWorkplaceReplayStore.getState().forget().changed).toBe(true);
    expect(isWorkplaceReplayActive()).toBe(false);
    expect(await persistedWorkplace()).toMatchObject({ campaign: { profile: 'toe-dip' } });
  });
});
