import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { WorkplaceAutomaticDemo } from '../components/ui-new/widgets/WorkplaceParticipation';
import { setLocale } from '../i18n';
import { shiftResumable } from './workplaceCampaign';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useUIStore.setState({ alerts: [] });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
});
afterEach(() => {
  act(() => useWorkplaceAutoplay.getState().pause());
  cleanup();
  setLocale('en');
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  vi.useRealTimers();
});

describe('automatic season status, fourth pass', () => {
  it('shows its status in the language chosen after the status was set', () => {
    useWorkplaceAutoplay.getState().pause();
    setLocale('pt-BR');
    render(<WorkplaceAutomaticDemo profile="team" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Decisões automáticas pausadas. Suas escolhas têm prioridade.'
    );
  });

  it.each(['emergencyActive', 'emergencyDrillMode'] as const)(
    'a %s safety stop holds the season and it continues once the stop clears',
    (field) => {
      vi.useFakeTimers();
      useGameSimulationStore.getState().setGameSpeed(30);
      useWorkplaceAutoplay.getState().start('team');
      vi.advanceTimersByTime(1200);
      useGameSimulationStore.setState({ [field]: true });
      vi.advanceTimersByTime(2000);
      const held = useWorkplaceStore.getState().workplace;
      // The runner waits with the plant: Take over stays offered, nothing changes.
      expect(useWorkplaceAutoplay.getState().running).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(useWorkplaceStore.getState().workplace).toBe(held);
      const holdAlerts = useUIStore
        .getState()
        .alerts.filter((a) => a.title === 'Automatic cooperative season held');
      expect(holdAlerts).toHaveLength(1);
      useGameSimulationStore.setState({ [field]: false });
      vi.advanceTimersByTime(2000);
      expect(useWorkplaceAutoplay.getState().running).toBe(true);
      expect(useWorkplaceStore.getState().workplace).not.toBe(held);
    }
  );

  it('a held season says so in the language chosen', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    useGameSimulationStore.setState({ emergencyActive: true });
    vi.advanceTimersByTime(500);
    setLocale('pt-BR');
    render(<WorkplaceAutomaticDemo profile="team" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'O limite de segurança ou de modo de controle retém a demonstração automática.'
    );
  });

  // D14: the notice is the stop's reason alone; the hand-back control sits
  // beside the same reason in Autonomy's facilitator tools.
  it('a season that stops by itself names its reason, with no restart hint', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(1200);
    // Packing's own voice (5b: in a solo season the player raises only Packing's).
    useWorkplaceStore.getState().object('packing', 'privacy');
    // The objection interrupt paused it; a fresh run then stops on the objection.
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(500);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    const alert = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(alert?.message).toBe(
      'An open objection remains with its original raiser. Automatic demonstration paused.'
    );
  });

  it('an E-stop mid-shift pauses that shift; it resumes, runs its full ninety minutes, and the season goes on', () => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().setGameSpeed(30);
    useWorkplaceAutoplay.getState().start('team');
    for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.phase !== 'active'; i++)
      vi.advanceTimersByTime(400);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(0);
    useWorkplaceStore.getState().tick(30, 0, false);
    // The plant tick under an E-stop pauses the active shift (UnifiedGameTick).
    useGameSimulationStore.setState({ emergencyActive: true });
    useWorkplaceStore.getState().tick(5, 0, true);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(shiftResumable(useWorkplaceStore.getState().workplace)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
    useGameSimulationStore.setState({ emergencyActive: false });
    let resumed = false;
    for (let i = 0; i < 400 && useWorkplaceStore.getState().workplace.campaign?.shift === 0; i++) {
      vi.advanceTimersByTime(400);
      const s = useWorkplaceStore.getState().workplace;
      if (s.events.some((e) => e.kind === 'shift-resumed')) resumed = true;
      // The plant's own ticks run the resumed shift and deliver owed recovery.
      if (s.phase === 'active' || s.phase === 'review')
        useWorkplaceStore.getState().tick(5, 0, false);
    }
    expect(resumed).toBe(true);
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
    const next = useWorkplaceStore.getState().workplace;
    expect(next.campaign?.shift).toBe(1);
    expect(next.campaign?.history[0].minute).toBe(90);
    expect(next.campaign?.history[0].members.every((m) => m.restMinutes === 15)).toBe(true);
  });
});
