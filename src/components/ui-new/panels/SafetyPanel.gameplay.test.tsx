import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { audioManager } from '../../../utils/audioManager';
import { SafetyPanel } from './SafetyPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const game = useGameSimulationStore.getState();
  game.endEmergencyDrill();
  if (game.emergencyActive) useGameSimulationStore.getState().resolveEmergency();
  useGameSimulationStore.setState({ safetyEvents: [], activeSafetyEventId: null });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

// The confirm dialog stays open while the agent starts a drill or a Chronicle
// fire lands. triggerEmergency then refuses, but the alarm used to start
// anyway and sound through a drill that by design has none.
// Working if the alarm sounds only when the confirm actually stopped the plant.
describe('SafetyPanel emergency-stop confirmation', () => {
  it('does not sound the alarm when a drill took the interlock while the dialog was open', () => {
    const startAlarm = vi
      .spyOn(audioManager, 'startEmergencyStopAlarm')
      .mockImplementation(() => {});
    const playStop = vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(useGameSimulationStore.getState().emergencyMachineId).toBe('DRILL');
    expect(startAlarm).not.toHaveBeenCalled();
    expect(playStop).not.toHaveBeenCalled();
  });

  it('sounds the alarm when the confirm stops the plant', () => {
    const startAlarm = vi
      .spyOn(audioManager, 'startEmergencyStopAlarm')
      .mockImplementation(() => {});
    vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(useGameSimulationStore.getState().emergencyMachineId).toBe('E-STOP');
    expect(startAlarm).toHaveBeenCalledTimes(1);
  });
});

// Acknowledge and Release remove the control that was pressed. Focus used to
// fall to <body>, so a keyboard or screen-reader user was thrown to the top of
// the page. Working if focus lands on the Emergency Response heading.
describe('SafetyPanel focus after a control removes itself', () => {
  it('keeps focus in the panel after acknowledging the active event', () => {
    vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    render(<SafetyPanel />);
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge event' });
    acknowledge.focus();
    fireEvent.click(acknowledge);
    expect(screen.queryByRole('button', { name: 'Acknowledge event' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Emergency Response' })
    );
  });

  it('keeps focus in the panel after releasing a forklift-only stop', () => {
    vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
    useSafetyStore.setState({ forkliftEmergencyStop: true });
    render(<SafetyPanel />);
    const release = screen.getByRole('button', { name: 'RELEASE FORKLIFT STOP' });
    release.focus();
    fireEvent.click(release);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Emergency Response' })
    );
  });
});

// The egress sequencer ends the drill on its own once every zone is verified,
// which removes the drill event card and its Acknowledge button under a
// keyboard user's focus. Working if focus stays on Emergency Response.
describe('SafetyPanel focus when the drill ends itself', () => {
  it('keeps focus in the panel when the focused Acknowledge goes with the drill', () => {
    vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
    useGameSimulationStore.getState().startEmergencyDrill();
    render(<SafetyPanel />);
    screen.getByRole('button', { name: 'Acknowledge event' }).focus();

    // What egressDrillSequencer does once the last zone verifies.
    act(() => useGameSimulationStore.getState().endEmergencyDrill());

    expect(screen.queryByRole('button', { name: 'Acknowledge event' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Emergency Response' })
    );
  });
});
