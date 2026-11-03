import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

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

afterEach(() => {
  cleanup();
  useGameSimulationStore.getState().resetGameState();
});

// Routine cycle bells kept ringing while the plant was paused. Working if the
// PA marks a paused plant for the bell scheduler, and clears it on resume.
describe('the PA and a paused plant', () => {
  it('marks the plant paused while the clock is at 0 and clears it on resume', () => {
    render(<PAAnnouncementSystem />);
    act(() => useGameSimulationStore.getState().setGameSpeed(0));
    expect(useAnnouncementsStore.getState().context.plantPaused).toBe(true);
    act(() => useGameSimulationStore.getState().setGameSpeed(30));
    expect(useAnnouncementsStore.getState().context.plantPaused).toBe(false);
  });
});
