import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceReplayStore } from './workplaceReplayStore';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { safeJSONStorage } from './storage';
import { useAnnouncementsStore } from './announcementsStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
  isWorkplaceReplayActive,
  registerReplayParticipant,
} from '../simulation/workplaceReplayRuntime';

const KEY = 'millos-workplace-laboratory';
let unregister: Array<() => void> = [];
beforeEach(async () => {
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
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
  (
    (await safeJSONStorage.getItem(KEY)) as {
      state: { workplace: { campaign: { profile: string } | null } };
    } | null
  )?.state.workplace;

/** A replay run brought to its review: stopped during deliberation, nothing owed. */
function reviewedRun(profile: 'toe-dip' | 'team' = 'toe-dip') {
  expect(useWorkplaceReplayStore.getState().begin(profile).changed).toBe(true);
  expect(useWorkplaceStore.getState().stop().changed).toBe(true);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
}

describe('Workplace lane, ninth pass: retaining a matched replay review', () => {
  // A retained review keeps the replay's plant, so the physical session and the
  // workplace must save again; otherwise a reload returns to the pre-replay
  // plant and every later action is lost until the checkpoint is forgotten.
  it('ends the replay clock and writes the season it retained', async () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    reviewedRun();
    expect(useWorkplaceReplayStore.getState().record()).toEqual({ changed: true, reason: null });
    expect(isWorkplaceReplayActive()).toBe(false);
    expect(await persistedWorkplace()).toMatchObject({ campaign: { profile: 'toe-dip' } });
    // The checkpoint stays, so another charter can still rewind to it.
    expect(useWorkplaceReplayStore.getState().checkpoint).not.toBeNull();
    expect(useWorkplaceReplayStore.getState().begin('team').changed).toBe(true);
    expect(isWorkplaceReplayActive()).toBe(true);
    expect(useWorkplaceReplayStore.getState().runs).toHaveLength(1);
  });

  // The run is fixed when retained. Retaining it again, or rewinding after the
  // plant played on, must not overwrite it with later plant numbers.
  it('keeps a retained run as it was retained', () => {
    useWorkplaceReplayStore.getState().capture(17);
    reviewedRun();
    useWorkplaceReplayStore.getState().record();
    const retained = structuredClone(useWorkplaceReplayStore.getState().runs);
    const again = useWorkplaceReplayStore.getState().record();
    expect(again.changed).toBe(false);
    expect(again.reason).toMatch(/already retained/);
    // The plant played on after the retain.
    useOperationsCampaignStore.setState({
      elapsedMinutes: useOperationsCampaignStore.getState().elapsedMinutes + 30,
    });
    expect(useWorkplaceReplayStore.getState().begin('team').changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().runs).toEqual(retained);
  });

  // Once retained, the season is real and saved; a rewind mid-shift would throw
  // away paid work the player has since done in it.
  it('refuses to rewind over a shift begun after the retain', () => {
    useWorkplaceReplayStore.getState().capture(17);
    reviewedRun();
    useWorkplaceReplayStore.getState().record();
    useWorkplaceStore.setState({
      workplace: { ...useWorkplaceStore.getState().workplace, phase: 'active' },
    });
    const result = useWorkplaceReplayStore.getState().begin('team');
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/Finish and record the current shift/);
  });

  // Rewinding straight from a review retains it on the way, but the clock never
  // stops, so the disk keeps the pre-replay pair rather than the run's season
  // bound to a plant the physical session never saved.
  it('does not write the season it retains on the way to another charter', async () => {
    useWorkplaceReplayStore.getState().capture(17);
    reviewedRun();
    expect(useWorkplaceReplayStore.getState().begin('team').changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().runs).toHaveLength(1);
    expect(isWorkplaceReplayActive()).toBe(true);
    expect(await persistedWorkplace()).toMatchObject({ campaign: null });
  });
});

// The checkpoint held the whole PA store, so Begin put the player's PA mode
// and caption setting back to their capture-time values (and, persisted, kept
// them across reload) and revived captions about the plant at capture.
// Working if the player's PA preferences survive Begin and old captions stay down.
describe("starting a replay and the player's PA settings", () => {
  it('keeps the PA mode and captions setting chosen after the checkpoint', () => {
    useAnnouncementsStore.setState({ mode: 'focused', captionsEnabled: true });
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Captured caption',
      priority: 3,
    });
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    useAnnouncementsStore.setState({ mode: 'off', captionsEnabled: false });
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    const pa = useAnnouncementsStore.getState();
    expect(pa.mode).toBe('off');
    expect(pa.captionsEnabled).toBe(false);
    expect(pa.announcements.filter((entry) => !entry.dismissed)).toHaveLength(0);
  });
});
