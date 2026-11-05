import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { WorkplaceAutomaticDemo } from '../components/ui-new/widgets/WorkplaceParticipation';
import { setLocale } from '../i18n';

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

  it('a season that stops by itself says where to run it again', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(1200);
    useWorkplaceStore.getState().object('quality', 'privacy');
    // The objection interrupt paused it; a fresh run then stops on the objection.
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(500);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    const alert = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(alert?.message).toContain('Autonomy');
    expect(alert?.message).toContain('Skip guide and run fictional demo');
  });

  it('an E-stop mid-shift settles that shift, and the season goes on to the next one', () => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().setGameSpeed(30);
    useWorkplaceAutoplay.getState().start('team');
    for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.phase !== 'active'; i++)
      vi.advanceTimersByTime(400);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('active');
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(0);
    // The plant tick under an E-stop settles the active shift (UnifiedGameTick).
    useGameSimulationStore.setState({ emergencyActive: true });
    useWorkplaceStore.getState().tick(5, 0, true);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    vi.advanceTimersByTime(2000);
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
    useGameSimulationStore.setState({ emergencyActive: false });
    for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.campaign?.shift === 0; i++) {
      vi.advanceTimersByTime(400);
      // Owed recovery is delivered by ordinary plant ticks in review.
      if (useWorkplaceStore.getState().workplace.phase === 'review')
        useWorkplaceStore.getState().tick(5, 0, false);
    }
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
    expect(useWorkplaceStore.getState().workplace.campaign?.shift).toBe(1);
  });
});
