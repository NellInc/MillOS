import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { safeJSONStorage } from './storage';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { beginReplayClock, endReplayClock } from '../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../test/firstDelivery';

beforeEach(async () => {
  endReplayClock();
  await safeJSONStorage.removeItem('millos-workplace-laboratory');
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

// A standalone exercise (game, workshop or pilot) started from the setup form
// used to have no way back to that form: 'start' reopens the same mode, and
// every season, mode and participation choice needs an idle workplace.
describe('a settled standalone exercise returns to setup (pass thirteen)', () => {
  it.each(['game', 'workshop', 'pilot'] as const)(
    'a %s exercise ends at an idle game workplace that can open a season',
    (mode) => {
      const store = useWorkplaceStore.getState();
      expect(store.start(mode, 7).changed).toBe(true);
      expect(useWorkplaceStore.getState().stop().changed).toBe(true);
      const review = useWorkplaceStore.getState().workplace;
      expect(review.phase).toBe('review');
      // Nothing else reaches idle from here.
      fulfilFirstDelivery();
      expect(useWorkplaceStore.getState().startCampaign('toe-dip', 7).changed).toBe(false);
      expect(useWorkplaceStore.getState().leaveCampaign(review.revision).changed).toBe(false);

      expect(useWorkplaceStore.getState().endExercise(review.revision - 1).changed).toBe(false);
      expect(useWorkplaceStore.getState().endExercise(review.revision).changed).toBe(true);
      const idle = useWorkplaceStore.getState().workplace;
      expect(idle.phase).toBe('idle');
      expect(idle.mode).toBe('game');
      expect(idle.seed).toBe(7);
      expect(idle.revision).toBe(review.revision + 1);
      expect(idle.events).toHaveLength(0);
      // Nothing is kept as a season: there was none.
      expect(useWorkplaceStore.getState().leftCampaigns).toHaveLength(0);
      expect(useWorkplaceStore.getState().setParticipationMode('solo').changed).toBe(true);
      fulfilFirstDelivery();
      expect(useWorkplaceStore.getState().startCampaign('toe-dip', 7).changed).toBe(true);
    }
  );

  it('refuses a season, a running or deliberating exercise, owed recovery and a live replay', () => {
    const store = useWorkplaceStore.getState();
    fulfilFirstDelivery();
    expect(store.startCampaign('toe-dip', 3).changed).toBe(true);
    let s = useWorkplaceStore.getState().workplace;
    expect(useWorkplaceStore.getState().endExercise(s.revision).changed).toBe(false);

    useWorkplaceStore.setState({ workplace: createWorkplace() });
    expect(useWorkplaceStore.getState().start('workshop', 3).changed).toBe(true);
    s = useWorkplaceStore.getState().workplace;
    expect(s.phase).toBe('deliberating');
    expect(useWorkplaceStore.getState().endExercise(s.revision).changed).toBe(false);

    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    s = useWorkplaceStore.getState().workplace;
    const owed = structuredClone(s);
    owed.members[0].recoveryOwedMinutes = 5;
    useWorkplaceStore.setState({ workplace: owed });
    expect(useWorkplaceStore.getState().endExercise(owed.revision).changed).toBe(false);

    useWorkplaceStore.setState({ workplace: s });
    beginReplayClock(3, 0);
    expect(useWorkplaceStore.getState().endExercise(s.revision).changed).toBe(false);
    endReplayClock();
    expect(useWorkplaceStore.getState().endExercise(s.revision).changed).toBe(true);
  });
});
