import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useChronicleStore } from '../../stores/chronicleStore';

const resetStop = () => {
  useGameSimulationStore.setState((state) => ({
    emergencyActive: false,
    emergencyDrillMode: false,
    emergencyMachineId: null,
    crisisState: { ...state.crisisState, active: false },
  }));
  useSafetyStore.setState({ forkliftEmergencyStop: false });
};

beforeEach(resetStop);
afterEach(() => {
  cleanup();
  resetStop();
});

describe('EmergencyOverlay copy', () => {
  // The Safety panel and the PA call it an egress verification drill; the
  // banner said "Simulated fire drill". Working if all three use one name.
  it('names the drill as the Safety panel does', () => {
    render(<EmergencyOverlay />);
    act(() =>
      useGameSimulationStore.setState({
        emergencyActive: true,
        emergencyDrillMode: true,
        emergencyMachineId: 'DRILL',
      })
    );
    expect(screen.getByRole('alert', { name: 'Egress verification drill' })).toBeInTheDocument();
  });

  // A stop the player triggered from the Safety panel has no cause to find.
  it('tells the operator who stopped the facility how to restart it', () => {
    render(<EmergencyOverlay />);
    act(() => {
      useGameSimulationStore.setState({ emergencyActive: true, emergencyMachineId: 'E-STOP' });
      useSafetyStore.setState({ forkliftEmergencyStop: true });
    });
    const alert = screen.getByRole('alert', { name: 'Facility emergency stop' });
    expect(alert).not.toHaveTextContent('Find the cause');
    expect(alert).toHaveTextContent(
      'You stopped the facility. Clear the interlock from the Safety panel when you are ready to restart.'
    );
  });

  it('keeps the find-the-cause guidance for an interlock the plant raised', () => {
    render(<EmergencyOverlay />);
    act(() => {
      useGameSimulationStore.setState({ emergencyActive: true, emergencyMachineId: 'CRISIS-fire' });
    });
    expect(screen.getByRole('alert', { name: 'Facility emergency stop' })).toHaveTextContent(
      'Find the cause, fix it'
    );
  });

  // Once a duct clean is under way the Chronicle has no fire prompt left, yet the
  // banner kept telling the player to answer one. Working if it says the plant
  // restarts when the duct is clean.
  it('stops asking for a Chronicle answer once the duct is being cleaned', () => {
    const before = useChronicleStore.getState().chronicle;
    render(<EmergencyOverlay />);
    act(() => {
      useGameSimulationStore.setState({
        emergencyActive: true,
        emergencyMachineId: 'CRISIS-fire',
        crisisState: {
          active: true,
          type: 'fire',
          severity: 'high',
          startTime: 0,
          metadata: { source: 'chronicle' },
        },
      });
      useChronicleStore.setState({
        chronicle: { ...before, fire: { active: true, suppressing: false, resolveAtMinute: null } },
      });
    });
    const alert = screen.getByRole('alert', { name: 'Facility emergency stop' });
    expect(alert).toHaveTextContent('Answer its prompt in the Mill Chronicle');
    act(() =>
      useChronicleStore.setState({
        chronicle: { ...before, fire: { active: true, suppressing: true, resolveAtMinute: 600 } },
      })
    );
    expect(alert).not.toHaveTextContent('Answer its prompt');
    expect(alert).toHaveTextContent('Production restarts when it is clean.');
    act(() => useChronicleStore.setState({ chronicle: before }));
  });
});
