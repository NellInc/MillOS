import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';

beforeAll(() => {
  // jsdom has no matchMedia; framer's reduced-motion hook reads it.
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});

beforeEach(() => {
  useAnnouncementsStore.setState({ mode: 'characterful', announcements: [] });
  useAnnouncementsStore.getState().setContext({ safetyCritical: false });
});

afterEach(() => {
  cleanup();
  act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));
  useGameSimulationStore.getState().resetGameState();
  useAnnouncementsStore.setState({ mode: 'focused', announcements: [] });
});

/** A characterful routine line, which the PA holds while a safety state stands. */
const offerFlavourLine = (message: string) => {
  useAnnouncementsStore.getState().addAnnouncement({
    type: 'info',
    message,
    priority: 2,
    tone: 'characterful',
    cooldownMs: 0,
  });
  return useAnnouncementsStore.getState().announcements.some((entry) => entry.message === message);
};

// GameInterface marks a standing critical alert (and drills, stops, crises) on
// the PA context; the PA marks its own safety states, the forklift stop among
// them. Both wrote the same key, so whichever wrote last cleared the other's
// hold. Working if neither writer can lift a hold the other still has.
describe('the PA safety hold has two independent writers', () => {
  it('keeps routine PA held for a standing critical alert after a forklift stop is released', () => {
    render(<PAAnnouncementSystem />);
    // GameInterface: an unacknowledged critical alert stands.
    act(() => useAnnouncementsStore.getState().setContext({ safetyCritical: true }));
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));

    expect(offerFlavourLine('Flavour over a standing critical alert')).toBe(false);
  });

  it('keeps routine PA held during a forklift stop when GameInterface re-marks its own state', () => {
    render(<PAAnnouncementSystem />);
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
    // GameInterface's effect re-runs (a mode switch, an acknowledged alert)
    // with no critical alert and no facility safety state of its own.
    act(() => useAnnouncementsStore.getState().setContext({ safetyCritical: false }));

    expect(offerFlavourLine('Flavour during a forklift stop')).toBe(false);
  });

  it('lets routine PA through once both holds have ended', () => {
    render(<PAAnnouncementSystem />);
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(true));
    act(() => useSafetyStore.getState().setForkliftEmergencyStop(false));

    expect(offerFlavourLine('Flavour on a quiet plant')).toBe(true);
  });
});
