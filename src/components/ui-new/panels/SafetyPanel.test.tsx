import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { audioManager } from '../../../utils/audioManager';
import { SafetyPanel } from './SafetyPanel';

describe('SafetyPanel', () => {
  afterEach(() => {
    cleanup();
    useGameSimulationStore.setState((state) => ({
      emergencyActive: false,
      emergencyDrillMode: false,
      crisisState: { ...state.crisisState, active: false },
      safetyEvents: [],
      activeSafetyEventId: null,
    }));
    useSafetyStore.setState({ forkliftEmergencyStop: false });
  });

  it('releases a forklift-only stop that the facility E-Stop cannot clear', () => {
    const stopAlarm = vi.spyOn(audioManager, 'stopEmergencyStopAlarm');
    useSafetyStore.setState({ forkliftEmergencyStop: true });

    render(<SafetyPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'RELEASE FORKLIFT STOP' }));
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    // The Space-bar stop starts the alarm; releasing it here must silence it.
    expect(stopAlarm).toHaveBeenCalled();
    stopAlarm.mockRestore();
    expect(screen.queryByRole('button', { name: 'RELEASE FORKLIFT STOP' })).not.toBeInTheDocument();
  });

  it('disables the facility stop control while a drill owns the safety interlock', () => {
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: true });

    render(<SafetyPanel />);

    const interlock = screen.getByRole('button', { name: 'DRILL INTERLOCK ACTIVE' });
    expect(interlock).toBeDisabled();
    expect(interlock).toHaveAttribute(
      'title',
      'End the active egress verification drill before using the emergency stop'
    );
  });

  it('shows the latest recovery state after the safety interlock clears', () => {
    useGameSimulationStore.setState({
      safetyEvents: [
        {
          id: 'safety-facility-stop-test',
          kind: 'facility_stop',
          cause: 'Manual facility emergency stop',
          severity: 'critical',
          simulated: false,
          stage: 'cleared',
          startedAt: 1,
          clearedAt: 2,
          response: 'Machines and mobile equipment stopped',
          recovery: 'Interlock cleared and prior machine states restored',
        },
      ],
      activeSafetyEventId: null,
    });

    render(<SafetyPanel />);

    const recovery = screen.getByRole('status', { name: 'Safety state recovered' });
    expect(recovery).toHaveTextContent('Manual facility emergency stop');
    expect(recovery).toHaveTextContent('Interlock cleared and prior machine states restored');
  });
});
