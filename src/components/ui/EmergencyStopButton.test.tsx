import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { EmergencyStopButton } from './EmergencyStopButton';

vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playEmergencyStop: vi.fn(),
    startEmergencyStopAlarm: vi.fn(),
    stopEmergencyStopAlarm: vi.fn(),
  },
}));

describe('EmergencyStopButton', () => {
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useSafetyStore.setState({ forkliftEmergencyStop: false });
  });

  it('presents a disabled drill interlock instead of a release control during evacuation', () => {
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: true });
    useSafetyStore.setState({ forkliftEmergencyStop: true });

    render(<EmergencyStopButton />);

    expect(
      screen.getByRole('switch', {
        name: 'Fire drill interlock active - emergency stop cannot be changed',
      })
    ).toBeDisabled();
    expect(screen.getByText('DRILL INTERLOCK ACTIVE')).toBeInTheDocument();
    expect(screen.queryByText('RELEASE E-STOP')).not.toBeInTheDocument();
  });

  it('refuses to release the forklifts while a facility emergency owns the interlock', () => {
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: false });
    useSafetyStore.setState({ forkliftEmergencyStop: true });

    render(<EmergencyStopButton />);

    const button = screen.getByRole('switch', {
      name: 'Emergency interlock active - clear it from the Safety panel to release the forklifts',
    });
    expect(button).toBeDisabled();
    expect(screen.getByText('INTERLOCK ACTIVE')).toBeInTheDocument();
    expect(screen.queryByText('RELEASE E-STOP')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });

  it('still engages the forklift stop during a facility emergency', () => {
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: false });

    render(<EmergencyStopButton />);

    fireEvent.click(screen.getByRole('switch', { name: 'Emergency stop - halt all forklifts' }));
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });
});
