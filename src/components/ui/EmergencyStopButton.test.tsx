import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { EmergencyStopButton } from './EmergencyStopButton';

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
});
