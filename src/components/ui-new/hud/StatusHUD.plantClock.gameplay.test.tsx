import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';
import type { AlertData } from '../../../types';

const alert = (id: string): AlertData => ({
  id,
  type: 'warning',
  title: `Alert ${id}`,
  message: 'message',
  timestamp: new Date(),
  acknowledged: false,
});

// Plant events read on the plant clock, as the maintenance log does: game day
// 2 at 14:30 is "Day 3, 14:30" whatever the wall clock or pace.
describe('notification times on the plant clock', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 14.5 });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.getState().resetGameState();
  });

  it('stamps a new alert with the plant clock and shows it in the list', () => {
    useUIStore.getState().addAlert(alert('a'));
    expect(useUIStore.getState().alerts[0].gameClock).toEqual({ day: 2, hour: 14.5 });
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    expect(screen.getByText('Day 3, 14:30')).toBeInTheDocument();
  });

  it('reads the stamp in Portuguese', () => {
    useUIStore.getState().addAlert(alert('a'));
    setLocale('pt-BR');
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /^Notifica/ }));
    expect(screen.getByText('Dia 3, 14:30')).toBeInTheDocument();
  });

  it('restamps an alert whose condition comes back', () => {
    useUIStore.getState().addAlert(alert('a'));
    useUIStore.getState().setAlertReturnedToNormal('a', true);
    useGameSimulationStore.setState({ gameDay: 3, gameTime: 6.25 });
    useUIStore.getState().setAlertReturnedToNormal('a', false);
    expect(useUIStore.getState().alerts[0].gameClock).toEqual({ day: 3, hour: 6.25 });
  });
});
