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
import { alertText } from '../i18n/alertCopy';

beforeEach(() => {
  setLocale('en');
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
  setLocale('en');
});

const notice = (title: string) => {
  const found = useUIStore.getState().alerts.find((a) => a.title === title);
  expect(found).toBeDefined();
  return found!;
};

// The bell renders notices through alertText, so a keyed notice reads in the
// language active now. Working if the season's held and stopped notices filed
// in English read in Portuguese after a switch, and so does the panel status.
describe('automatic season notices follow a language switch (pass ten)', () => {
  it('the held notice', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    useGameSimulationStore.setState({ emergencyActive: true });
    vi.advanceTimersByTime(500);
    const held = notice('Automatic cooperative season held');
    setLocale('pt-BR');
    expect(alertText(held)).toEqual({
      title: 'Temporada cooperativa automática retida',
      message: 'O limite de segurança ou de modo de controle retém a demonstração automática.',
    });
  });

  it('a stop on the runner’s own reason', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(1200);
    useWorkplaceStore.getState().object('quality', 'privacy');
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(500);
    const stopped = notice('Automatic cooperative season stopped');
    expect(stopped.message).toMatch(/^An open objection remains.*To run it again/);
    setLocale('pt-BR');
    const text = alertText(stopped);
    expect(text.title).toBe('Temporada cooperativa automática interrompida');
    expect(text.message).toMatch(/^Uma objeção em aberto continua.*Para rodá-la de novo/);
  });

  it('a stop on a workplace store refusal, in the bell and the panel', () => {
    vi.useFakeTimers();
    // No open commitment for the season to link.
    useOperationsCampaignStore.setState({ activeOrderId: null });
    render(<WorkplaceAutomaticDemo profile="team" />);
    act(() => {
      useWorkplaceAutoplay.getState().start('team');
      vi.advanceTimersByTime(500);
    });
    const stopped = notice('Automatic cooperative season stopped');
    expect(stopped.message).toMatch(/^Choose an open, quality-qualified customer commitment/);
    expect(screen.getByRole('status')).toHaveTextContent(/^Choose an open/);
    act(() => setLocale('pt-BR'));
    expect(alertText(stopped).message).toMatch(
      /^Escolha um compromisso de cliente em aberto.*Para rodá-la de novo/
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^Escolha um compromisso de cliente/);
  });
});
