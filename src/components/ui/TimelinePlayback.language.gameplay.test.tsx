import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelinePlayback } from './TimelinePlayback';
import { useHistoricalPlaybackStore } from '../../stores/historicalPlaybackStore';
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
        availableRange: { start: START, end: END },
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

const engineDecision = (): AIDecision => ({
  id: 'plant-maintenance-1',
  timestamp: new Date(START + 60_000),
  type: 'maintenance',
  action: 'Queue condition-based maintenance for R.M. 101',
  reasoning: '',
  confidence: 80,
  impact: '',
  status: 'pending',
  priority: 'medium',
  copy: { action: { key: 'maintenanceAction', params: { machine: 'R.M. 101' } } },
});

// The engine files its cards with keyed copy so they follow the language; the
// history replay copied only the stored English action.
describe('History replay decision list after a language switch', () => {
  beforeEach(() => {
    setLocale('en');
    useHistoricalPlaybackStore.setState({ decisionHistory: [] });
    useHistoricalPlaybackStore.getState().setAvailableRange(START, END);
  });
  afterEach(() => {
    cleanup();
    useHistoricalPlaybackStore.getState().exitReplayMode();
    setLocale('en');
  });

  it('shows an engine decision recorded in English in Portuguese', () => {
    useHistoricalPlaybackStore.getState().logDecision(engineDecision());
    useHistoricalPlaybackStore.getState().enterReplayMode(START + 60_000);
    render(<TimelinePlayback />);
    expect(screen.getByText('Return R.M. 101 to warning if it is critical')).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText('Voltar R.M. 101 para alerta se estiver em estado crítico')
    ).toBeInTheDocument();
  });
});
