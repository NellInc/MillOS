/**
 * Wherever the forklift-only stop shows as on, its release is visible. The
 * overlay is on screen over every panel while the stop holds, but it named the
 * way out only in words ("Press X or release it from the Safety panel"), and a
 * phone has no X key. It now carries the release itself; a facility stop or a
 * drill owns the forklifts' release, and the overlay names that owner instead.
 * Working if one press on the overlay releases the forklifts, in either language.
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

beforeEach(resetStop);
afterEach(() => {
  cleanup();
  resetStop();
  setLocale('en');
});

describe('the forklift stop overlay carries its release', () => {
  it('releases the forklifts from the overlay', () => {
    render(<EmergencyOverlay />);
    expect(screen.queryByRole('button', { name: 'Release forklift stop' })).toBeNull();
    act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
    const release = screen.getByRole('button', { name: 'Release forklift stop' });
    // Not hidden from the accessibility tree, and it takes a pointer through
    // the overlay (jsdom does not run framer's fade-in, so no visibility check).
    expect(release.closest('[aria-hidden="true"]')).toBeNull();
    expect(release.className).toMatch(/\bpointer-events-auto\b/);
    expect(release).toBeEnabled();
    fireEvent.click(release);
    // The overlay then fades out (framer's exit, which jsdom does not finish).
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });

  it('offers no release a facility stop owns; it names that owner', () => {
    render(<EmergencyOverlay />);
    act(() => {
      useGameSimulationStore.setState({ emergencyActive: true, emergencyMachineId: 'E-STOP' });
      useSafetyStore.setState({ forkliftEmergencyStop: true });
    });
    expect(screen.queryByRole('button', { name: 'Release forklift stop' })).toBeNull();
    expect(screen.getByRole('alert', { name: 'Facility emergency stop' })).toHaveTextContent(
      'Clear the interlock from the Safety panel'
    );
  });

  it('speaks Brazilian Portuguese', () => {
    setLocale('pt-BR');
    render(<EmergencyOverlay />);
    act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Liberar parada das empilhadeiras' }));
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });
});
