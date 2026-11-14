import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceReplayStore } from './workplaceReplayStore';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
  registerReplayParticipant,
} from '../simulation/workplaceReplayRuntime';
import { setLocale } from '../i18n';
import { fulfilFirstDelivery } from '../test/firstDelivery';

let unregister: Array<() => void> = [];
beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
  useGameSimulationStore.getState().setGameSpeed(0);
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

// A retained run is recorded and its season is ordinary play. Once that season
// is left (or archived), the discussion is untouched again, so a fresh capture
// must be possible; the refusal said "Complete and record this run first" of a
// run already recorded, and only Forget (which discards the runs) got past it.
// Working if Capture works after a retained run's season ends, and the runs the
// player retained stay for comparison.
describe('capturing again after a retained replay run (pass nineteen)', () => {
  it('captures a fresh checkpoint once the retained season has been left', () => {
    const replay = useWorkplaceReplayStore.getState();
    expect(replay.capture(17).changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().record().changed).toBe(true);
    const retained = structuredClone(useWorkplaceReplayStore.getState().runs);
    expect(retained).toHaveLength(1);

    // The retained season is left: the workplace is idle at minute zero.
    const left = useWorkplaceStore
      .getState()
      .leaveCampaign(useWorkplaceStore.getState().workplace.revision);
    expect(left.changed).toBe(true);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');

    const again = useWorkplaceReplayStore.getState().capture(18);
    expect(again.reason).toBeNull();
    expect(again.changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().checkpoint?.seed).toBe(18);
    // Nothing the player retained is silently thrown away by a new capture.
    expect(useWorkplaceReplayStore.getState().runs).toEqual(retained);
    // And a charter can be replayed from the new checkpoint.
    expect(useWorkplaceReplayStore.getState().begin('team').changed).toBe(true);
  });

  it('still refuses a capture while a run is live', () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    const again = useWorkplaceReplayStore.getState().capture(18);
    expect(again.changed).toBe(false);
  });
});
