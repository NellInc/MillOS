/**
 * The overlay's Release takes itself away with the stop, and focus fell to
 * <body>, where the next Space is the forklift stop again. It goes back to the
 * control that had focus when the stop came on, else to the Safety dock button.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { setLocale } from '../../i18n';

vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playEmergencyStop: vi.fn(),
    startEmergencyStopAlarm: vi.fn(),
    stopEmergencyStopAlarm: vi.fn(),
  },
}));

const resetStop = () => {
  useGameSimulationStore.setState((state) => ({
    emergencyActive: false,
    emergencyDrillMode: false,
    emergencyMachineId: null,
    crisisState: { ...state.crisisState, active: false },
  }));
  useSafetyStore.setState({ forkliftEmergencyStop: false });
};

beforeEach(() => {
  setLocale('en');
  resetStop();
});
afterEach(() => {
  cleanup();
  resetStop();
});

describe('focus after the overlay releases the forklift stop', () => {
  it('returns to the control that had focus when the stop came on', () => {
    render(
      <>
        <button type="button">Somewhere</button>
        <EmergencyOverlay />
      </>
    );
    const before = screen.getByRole('button', { name: 'Somewhere' });
    before.focus();
    act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
    const release = screen.getByRole('button', { name: 'Release forklift stop' });
    release.focus();
    fireEvent.click(release);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it('goes to the Safety dock button when nothing had focus', () => {
    render(
      <>
        <button type="button" data-dock-mode="safety">
          Safety
        </button>
        <EmergencyOverlay />
      </>
    );
    act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
    const release = screen.getByRole('button', { name: 'Release forklift stop' });
    release.focus();
    fireEvent.click(release);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Safety' }));
  });
});
