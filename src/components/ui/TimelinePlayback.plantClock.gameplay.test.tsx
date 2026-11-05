import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelinePlayback } from './TimelinePlayback';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';

const START = 1_700_000_000_000;
const END = START + 30 * 60 * 1000;

// The real hook opens IndexedDB; drive the playback store directly instead.
vi.mock('../../hooks/useHistoricalMode', async () => {
  const { useHistoricalPlaybackStore: store } =
    await import('../../stores/historicalPlaybackStore');
  return {
    useHistoricalMode: () => {
      const state = store();
      return {
        isReplaying: state.isReplaying,
        playbackTime: state.isReplaying ? state.playbackTime : null,
        availableRange: { start: START - 5 * 60_000, end: END },
        rangeLoaded: true,
        enterReplay: state.enterReplayMode,
        exitReplay: state.exitReplayMode,
        scrubTo: state.setPlaybackTime,
        getDecisionsAt: (ts: number) => state.getDecisionsAt(ts, 60000),
        loadTagHistory: async () => [],
        getTagValueAt: async () => null,
      };
    },
  };
});

const stampedDecision = (): AIDecision => ({
  id: 'stamped-1',
  timestamp: new Date(START + 60_000),
  type: 'maintenance',
  action: 'Service R.M. 101',
  reasoning: '',
  confidence: 80,
  impact: '',
  status: 'completed',
  priority: 'medium',
  gameClock: { day: 2, hour: 14.5 },
});

// Every other surface (Decision Replay, the decision log, alerts, incidents,
// PA lines) stamps the plant's events "Day N, HH:MM" on the plant clock; the
// history replay read the browser's wall clock for the same decisions.
describe('History replay reads the plant clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    setLocale('en');
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 10 });
    useHistoricalPlaybackStore.setState({ decisionHistory: [] });
    useHistoricalPlaybackStore.getState().setAvailableRange(START - 5 * 60_000, END);
  });
  afterEach(() => {
    cleanup();
    useHistoricalPlaybackStore.getState().exitReplayMode();
    setLocale('en');
    vi.useRealTimers();
  });

  it('stamps a recorded decision on the plant clock, in the current language', () => {
    useHistoricalPlaybackStore.getState().logDecision(stampedDecision());
    useHistoricalPlaybackStore.getState().enterReplayMode(START + 60_000);
    render(<TimelinePlayback />);
    expect(screen.getByText(/Day 3, 14:30/)).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(screen.getByText(/Dia 3, 14:30/)).toBeInTheDocument();
  });

  it('shows the scrub position on the plant clock, holding through a pause', () => {
    // One minute of play at the standard pace: half a plant hour.
    for (let second = 1; second <= 60; second += 1) {
      vi.setSystemTime(START + second * 1000);
      useGameSimulationStore.setState({ gameTime: 10 + (second * 30) / 3600 });
    }
    // Ten wall minutes paused (nothing moves), then play resumes and the plant
    // reaches 10:36 (the first update after a pause is the only one seen).
    vi.setSystemTime(START + 11 * 60_000);
    useGameSimulationStore.setState({ gameTime: 10.6 });

    useHistoricalPlaybackStore.getState().enterReplayMode(START + 30_000);
    render(<TimelinePlayback />);
    expect(screen.getByText('Day 3, 10:15')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Playback timeline' })).toHaveAttribute(
      'aria-valuetext',
      'Day 3, 10:15'
    );
    // Plant time behind the live plant clock, not wall time behind now.
    expect(screen.getByText('21m ago')).toBeInTheDocument();

    // Five wall minutes into the pause the plant still read 10:30, not a
    // value smeared across the pause (10:32).
    act(() => useHistoricalPlaybackStore.getState().setPlaybackTime(START + 5 * 60_000));
    expect(screen.getByRole('slider', { name: 'Playback timeline' })).toHaveAttribute(
      'aria-valuetext',
      'Day 3, 10:30'
    );
  });

  it('keeps the wall clock for a moment recorded before the plant clock was kept', () => {
    useHistoricalPlaybackStore.getState().enterReplayMode(START - 2 * 60_000);
    render(<TimelinePlayback />);
    const slider = screen.getByRole('slider', { name: 'Playback timeline' });
    expect(slider.getAttribute('aria-valuetext')).not.toMatch(/Day/);
    expect(slider.getAttribute('aria-valuetext')).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('reads both ends of the timeline on one clock when only one has a plant stamp', () => {
    useHistoricalPlaybackStore.getState().enterReplayMode(START + 60_000);
    render(<TimelinePlayback />);
    // The range starts before the plant clock was sampled; its end does not.
    const slider = screen.getByRole('slider', { name: 'Playback timeline' });
    const ends = [...(slider.parentElement?.querySelectorAll('span') ?? [])].map(
      (span) => span.textContent ?? ''
    );
    expect(ends).toHaveLength(2);
    expect(ends.filter((label) => label.startsWith('Day'))).toEqual([]);
  });
});
