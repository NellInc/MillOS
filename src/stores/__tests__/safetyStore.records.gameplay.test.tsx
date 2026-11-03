import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSafetyStore } from '../safetyStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import { IncidentHistoryPanel } from '../../components/ui/IncidentHistoryPanel';
import { setLocale } from '../../i18n';

const openLog = () =>
  fireEvent.click(screen.getByRole('button', { name: /Incident Log|Registro/ }));

describe('safety incident records', () => {
  beforeEach(() => {
    setLocale('en');
    useSafetyStore.setState({ safetyIncidents: [] });
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 14.5 });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useSafetyStore.setState({ safetyIncidents: [] });
    useGameSimulationStore.getState().resetGameState();
  });

  // A blocked-route stop is logged where it happened, so the log line can be
  // tied to the hotspot recorded beside it.
  it('logs a blocked-route stop with its location and forklift', () => {
    useSafetyStore.getState().recordSafetyStop({ location: { x: 4, z: -9 }, forkliftId: 'fl-2' });
    const [entry] = useSafetyStore.getState().safetyIncidents;
    expect(entry.type).toBe('stop');
    expect(entry.location).toEqual({ x: 4, z: -9 });
    expect(entry.forkliftId).toBe('fl-2');
  });

  // The log is read in the language active now, not the one at the stop.
  it('reads a stop logged in English in Portuguese after a language switch', () => {
    useSafetyStore.getState().recordSafetyStop();
    setLocale('pt-BR');
    render(<IncidentHistoryPanel />);
    openLog();
    expect(screen.getByText('Empilhadeira parada por rota bloqueada')).toBeInTheDocument();
    expect(screen.queryByText('Forklift stopped for a blocked route')).toBeNull();
  });

  // Plant events read on the plant clock: game day 2 at 14:30 is "Day 3, 14:30".
  it('stamps each incident with the plant clock and shows it in the log', () => {
    useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'E-stop' });
    useSafetyStore.getState().recordSafetyStop();
    for (const entry of useSafetyStore.getState().safetyIncidents)
      expect(entry.gameClock).toEqual({ day: 2, hour: 14.5 });
    render(<IncidentHistoryPanel />);
    openLog();
    expect(screen.getAllByText('Day 3, 14:30')).toHaveLength(2);
  });

  it('keeps the wall time for an incident recorded without a plant clock', () => {
    useSafetyStore.setState({
      safetyIncidents: [
        { id: 'old', type: 'stop', timestamp: Date.now(), description: 'Older entry' },
      ],
    });
    render(<IncidentHistoryPanel />);
    openLog();
    expect(screen.queryByText(/^Day /)).toBeNull();
    expect(screen.getByText('Older entry')).toBeInTheDocument();
  });
});
