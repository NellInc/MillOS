/**
 * A compact sheet makes the HUD root aria-hidden and inert. A live region
 * inside that subtree leaves the accessibility tree, so nothing it receives is
 * announced, and nothing re-reads it when the sheet closes. These regions are
 * rendered at document.body instead.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlertSystem } from '../AlertSystem';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { PAAnnouncementSystem } from '../game/PAAnnouncementSystem';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

vi.mock('../../utils/audioManager', () => ({
  audioManager: { muted: false, playAlert: vi.fn() },
}));
vi.mock('../game/shared', () => ({
  usePAScheduler: vi.fn(),
  useEventAnnouncementScheduler: vi.fn(),
}));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: true }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => false }));

const LIVE = '[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]';
const HIDDEN = '[aria-hidden="true"], [inert]';

beforeEach(() => {
  vi.useFakeTimers();
  useUIStore.setState({ alerts: [] });
  useAnnouncementsStore.setState({
    announcements: [],
    lastAnnouncementTime: {},
    mode: 'focused',
    captionsEnabled: true,
  });
  useGameSimulationStore.setState((state) => ({
    emergencyActive: false,
    emergencyDrillMode: false,
    crisisState: { ...state.crisisState, active: false },
  }));
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderInsideOpenSheetHud = () =>
  render(
    <div data-testid="hud" aria-hidden="true" inert>
      <EmergencyOverlay />
      <AlertSystem />
      <PAAnnouncementSystem />
    </div>
  );

it('keeps every HUD live region outside the aria-hidden, inert root of an open sheet', async () => {
  renderInsideOpenSheetHud();
  act(() => useGameSimulationStore.setState({ emergencyActive: true }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  const regions = Array.from(document.querySelectorAll(LIVE));
  // Alert (assertive), alert (polite), PA, emergency.
  expect(regions.length).toBeGreaterThanOrEqual(4);
  for (const region of regions) expect(region.closest(HIDDEN)).toBeNull();
});

it('announces an emergency from outside the hidden root, and only once', async () => {
  renderInsideOpenSheetHud();
  act(() => useGameSimulationStore.setState({ emergencyActive: true }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  const spoken = Array.from(document.querySelectorAll(LIVE)).filter(
    (region) => !region.closest(HIDDEN) && /Facility emergency stop/.test(region.textContent ?? '')
  );
  expect(spoken).toHaveLength(1);
  // Still found by the name the e2e and capture scripts use for the banner.
  expect(screen.getByRole('alert', { name: 'Facility emergency stop' })).toBe(spoken[0]);
  expect(spoken[0]).toHaveTextContent(
    'Facility emergency stop. Everything is stopped. Find the cause, fix it, then clear the interlock from the Safety panel.'
  );
  // The visible banner is still drawn, but it is not a second announcement.
  const banner = document.querySelector('[data-testid="hud"] .fixed.inset-0');
  expect(banner).toBeInTheDocument();
  expect(banner?.closest(LIVE)).toBeNull();
});
