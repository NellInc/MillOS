import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHistoricalPlaybackStore } from '../historicalPlaybackStore';
import { useProductionStore } from '../productionStore';
import type { AIDecision } from '../../types';

const AT = Date.parse('2026-11-01T09:00:00.000Z');

const decision = (id: string, at: number): AIDecision => ({
  id,
  timestamp: new Date(at),
  type: 'maintenance',
  action: `Service ${id}`,
  reasoning: '',
  confidence: 80,
  impact: '',
  status: 'completed',
  priority: 'medium',
});

// A reload restores the plant's decisions (productionStore.aiDecisions, saved
// with the session) and the SCADA history the replay slider spans, but the
// replay's own decision log starts empty, so the decisions made before the
// reload vanished from the History replay that still covers their time.
describe('History replay decisions after a reload', () => {
  beforeEach(() => {
    useHistoricalPlaybackStore.setState(useHistoricalPlaybackStore.getInitialState(), true);
    useProductionStore.setState({ aiDecisions: [] });
  });
  afterEach(() => {
    useHistoricalPlaybackStore.getState().exitReplayMode();
    useProductionStore.setState({ aiDecisions: [] });
  });

  it('lists the restored decisions at their time once replay opens', () => {
    useProductionStore.setState({
      aiDecisions: [decision('after', AT + 30_000), decision('before', AT)],
    });
    useHistoricalPlaybackStore.getState().setAvailableRange(AT - 600_000, AT + 600_000);
    useHistoricalPlaybackStore.getState().enterReplayMode(AT);

    const near = useHistoricalPlaybackStore.getState().getDecisionsAt(AT, 60_000);
    expect(near.map((entry) => entry.id)).toEqual(['before', 'after']);
    expect(useHistoricalPlaybackStore.getState().decisionHistory).toHaveLength(2);
  });

  it('does not list a decision twice when this session already logged it', () => {
    const logged = decision('logged', AT);
    useHistoricalPlaybackStore.getState().logDecision(logged);
    useProductionStore.setState({ aiDecisions: [logged] });
    useHistoricalPlaybackStore.getState().enterReplayMode(AT);
    expect(useHistoricalPlaybackStore.getState().decisionHistory).toHaveLength(1);
  });
});
