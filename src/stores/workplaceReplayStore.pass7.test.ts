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

let unregister: Array<() => void> = [];
beforeEach(() => {
  endReplayClock();
  useReplayReset();
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
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
  useReplayReset();
  setLocale('en');
});
function useReplayReset() {
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
}

describe('Workplace lane, seventh pass: matched replay under separate turns', () => {
  it('a solo capture is still accepted', () => {
    expect(useWorkplaceReplayStore.getState().capture(17)).toEqual({
      changed: true,
      reason: null,
    });
  });

  // Turns, checks and role commands all refuse while a replay runs, so a
  // replay started under separate turns could never be agreed or run.
  it('refuses to capture a checkpoint no participant turn could act in', () => {
    expect(useWorkplaceStore.getState().setParticipationMode('separate-turns').changed).toBe(true);
    const result = useWorkplaceReplayStore.getState().capture(17);
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/Solo/);
    expect(useWorkplaceReplayStore.getState().checkpoint).toBeNull();
  });

  it('refuses to begin a captured replay after switching to separate turns', () => {
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    expect(useWorkplaceStore.getState().setParticipationMode('separate-turns').changed).toBe(true);
    const result = useWorkplaceReplayStore.getState().begin('toe-dip');
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/Solo/);
    expect(useWorkplaceReplayStore.getState().activeRunId).toBeNull();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  });

  it('says so in Portuguese', () => {
    useWorkplaceStore.getState().setParticipationMode('separate-turns');
    setLocale('pt-BR');
    expect(useWorkplaceReplayStore.getState().capture(17).reason).toMatch(/Encenação individual/);
  });
});
