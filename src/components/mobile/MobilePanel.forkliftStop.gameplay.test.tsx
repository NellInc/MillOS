/**
 * A phone has no X key, so the forklift-only stop was out of its reach (report
 * 04 F8). The phone's Safety sheet hosts the same Safety panel, which now sets
 * and releases it.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useSafetyStore } from '../../stores/safetyStore';
import { audioManager } from '../../utils/audioManager';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

beforeEach(() => {
  vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
  vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

it('sets and releases the forklift stop from the phone’s Safety sheet', async () => {
  render(<MobilePanel isVisible content="safety" onClose={vi.fn()} />);
  const panel = screen.getByRole('dialog', { name: 'Safety & Emergency mobile panel' });
  await waitFor(() => expect(panel).toBeVisible());
  fireEvent.click(within(panel).getByRole('button', { name: 'STOP FORKLIFTS' }));
  expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  fireEvent.click(within(panel).getByRole('button', { name: 'RELEASE FORKLIFT STOP' }));
  expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
});
