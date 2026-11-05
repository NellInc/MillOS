import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { WorkplaceAutomaticDemo } from '../components/ui-new/widgets/WorkplaceParticipation';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useUIStore.setState({ alerts: [] });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  act(() => useWorkplaceAutoplay.getState().pause());
  cleanup();
  vi.useRealTimers();
});

const workplaceHold = () =>
  useGameSimulationStore.getState().clockHolds.some((hold) => hold.holder === 'workplace');

describe('a manual action takes the season over without pausing the plant (pass six)', () => {
  it.each(['wrong-answer', 'manual-stop', 'reload', 'objection', 'leave'] as const)(
    'manual %s stops the runner and the plant keeps its pace',
    (action) => {
      vi.useFakeTimers();
      useGameSimulationStore.getState().setGameSpeed(30);
      useWorkplaceAutoplay.getState().start('team');
      vi.advanceTimersByTime(1200);
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
      const store = useWorkplaceStore.getState();
      if (action === 'wrong-answer') store.answerCheck('packing', 'refusal', 'majority');
      else if (action === 'manual-stop') store.stop();
      else if (action === 'reload') store.rehearseReload(store.workplace.revision);
      else if (action === 'objection') store.object('quality', 'privacy');
      else store.leaveCampaign(store.workplace.revision);
      expect(useWorkplaceAutoplay.getState().running).toBe(false);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
      expect(workplaceHold()).toBe(false);
    }
  );

  it('the Lab pause control hands over without freezing the plant either', () => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().setGameSpeed(30);
    render(<WorkplaceAutomaticDemo profile="team" />);
    act(() => useWorkplaceAutoplay.getState().start('team'));
    fireEvent.click(screen.getByRole('button', { name: 'Pause automatic demo' }));
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
    expect(workplaceHold()).toBe(false);
  });

  it('two stops at one revision raise two alerts with distinct ids', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(1200);
    useWorkplaceStore.getState().object('quality', 'privacy');
    for (let i = 0; i < 2; i++) {
      useWorkplaceAutoplay.getState().start('team');
      vi.advanceTimersByTime(500);
      expect(useWorkplaceAutoplay.getState().running).toBe(false);
    }
    const stops = useUIStore
      .getState()
      .alerts.filter((a) => a.title === 'Automatic cooperative season stopped');
    expect(stops).toHaveLength(2);
    expect(new Set(stops.map((a) => a.id)).size).toBe(2);
    // Dismissing one stop notice leaves the other one listed.
    useUIStore.getState().dismissAlert(stops[0].id);
    expect(
      useUIStore.getState().alerts.filter((a) => a.title === 'Automatic cooperative season stopped')
    ).toHaveLength(1);
  });
});
