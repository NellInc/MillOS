import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
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
  });

  it('disables the facility stop control while a drill owns the safety interlock', () => {
    useGameSimulationStore.setState({ emergencyActive: true, emergencyDrillMode: true });

    render(<SafetyPanel />);

    const interlock = screen.getByRole('button', { name: 'DRILL INTERLOCK ACTIVE' });
    expect(interlock).toBeDisabled();
    expect(interlock).toHaveAttribute(
      'title',
      'End the active fire drill before using the emergency stop'
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
