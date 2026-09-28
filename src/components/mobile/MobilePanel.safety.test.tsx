import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';

const resetSafety = () => {
  useGameSimulationStore.setState((state) => ({
    emergencyActive: false,
    emergencyDrillMode: false,
    crisisState: { ...state.crisisState, active: false },
    safetyEvents: [],
    activeSafetyEventId: null,
  }));
  useSafetyStore.setState({ forkliftEmergencyStop: false });
};

beforeEach(resetSafety);
afterEach(() => {
  cleanup();
  if (useGameSimulationStore.getState().emergencyDrillMode) {
    useGameSimulationStore.getState().endEmergencyDrill();
  }
  resetSafety();
});

describe('compact safety workspace', () => {
  it('starts and ends the same real verification drill as the desktop controls', async () => {
    render(<MobilePanel isVisible content="safety" onClose={vi.fn()} />);
    const panel = screen.getByRole('dialog', { name: 'Safety & Emergency mobile panel' });
    await waitFor(() => expect(panel).toBeVisible());
    fireEvent.click(within(panel).getByRole('button', { name: 'START DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(within(panel).getByText('0/4 zones verified')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'DRILL INTERLOCK ACTIVE' })).toBeDisabled();
    fireEvent.click(within(panel).getByRole('button', { name: 'END DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
    expect(within(panel).getByRole('button', { name: 'START DRILL' })).toBeVisible();
  });

  it('lets the confirmation own Escape without closing the underlying compact panel', () => {
    const onClose = vi.fn();
    render(<MobilePanel isVisible content="safety" onClose={onClose} />);
    const panel = screen.getByRole('dialog', { name: 'Safety & Emergency mobile panel' });
    fireEvent.click(within(panel).getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    const confirmation = screen.getByRole('dialog', { name: 'Trigger facility emergency stop?' });
    fireEvent.keyDown(within(confirmation).getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    fireEvent.keyDown(within(panel).getByRole('button', { name: 'Close panel' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
