import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { audioManager } from '../../../utils/audioManager';
import { setLocale } from '../../../i18n';
import { SafetyPanel } from './SafetyPanel';

beforeEach(() => {
  vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
  const game = useGameSimulationStore.getState();
  game.endEmergencyDrill();
  if (useGameSimulationStore.getState().emergencyActive) {
    useGameSimulationStore.getState().resolveEmergency();
  }
  useGameSimulationStore.setState({ safetyEvents: [], activeSafetyEventId: null });
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Safety > Analytics showed "Incident log (1)" for the Space-bar stop only; a
// facility E-stop never reached it. Working if the confirmed facility stop is
// logged once and the Last Event follows it, while a drill (a planned exercise,
// not an incident) leaves the log alone.
describe('SafetyPanel incident logging', () => {
  it('logs a confirmed facility emergency stop in the incident log', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));

    expect(useGameSimulationStore.getState().emergencyMachineId).toBe('E-STOP');
    const { safetyIncidents, safetyMetrics } = useSafetyStore.getState();
    expect(safetyIncidents).toHaveLength(1);
    expect(safetyIncidents[0]).toMatchObject({
      type: 'emergency',
      description: 'Facility emergency stop triggered from the Safety panel',
    });
    expect(safetyMetrics.lastIncidentTime).toBe(safetyIncidents[0].timestamp);
  });

  it('logs nothing when a drill took the interlock while the dialog was open', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(useSafetyStore.getState().safetyIncidents).toHaveLength(0);
  });
});

// The recovery card rendered the stored English text, so a language switch
// after a drill left it in English beside a translated panel.
describe('SafetyPanel recovered-state card language', () => {
  it('renders the cleared event in the language active now', () => {
    act(() => {
      useGameSimulationStore.getState().startEmergencyDrill();
      useGameSimulationStore.getState().endEmergencyDrill();
    });
    act(() => setLocale('pt-BR'));
    render(<SafetyPanel />);
    const recovery = screen.getByRole('status', { name: 'Estado de segurança restabelecido' });
    expect(recovery).toHaveTextContent('Verificação automatizada das rotas de saída de emergência');
    expect(recovery).not.toHaveTextContent('Automated emergency egress verification');
  });
});

// The drill ends itself once every egress checks in, and START DRILL takes END
// DRILL's place. A click aimed at END DRILL that landed just after the end
// started a fresh drill. Working if START is not actionable for a moment after
// any drill ends, then is.
describe('SafetyPanel drill restart guard', () => {
  it('does not start a new drill from a click that lands just after the drill ended', () => {
    vi.useFakeTimers();
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    render(<SafetyPanel />);
    expect(screen.getByRole('button', { name: 'END DRILL' })).toBeInTheDocument();

    act(() => useGameSimulationStore.getState().endEmergencyDrill());
    fireEvent.click(screen.getByRole('button', { name: 'START DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'START DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
  });

  it('starts a drill at once when none has just ended', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'START DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
  });
});
