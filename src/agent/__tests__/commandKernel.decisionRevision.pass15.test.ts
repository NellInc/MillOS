import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useProductionStore } from '../../stores/productionStore';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';

// ai.respond-to-decision declared the whole decision list, so any new card the
// tactical engine or an alert reaction filed between preview and commit made
// the player's response preview stale. Working if a preview survives a new card
// and still goes stale when the decision it answers changes.

const api = () => window.__MILLOS_AGENT__!;

const card = (id: string): AIDecision =>
  ({
    id,
    timestamp: new Date(0),
    type: 'optimization',
    action: `Recommendation ${id}`,
    reasoning: 'Test.',
    confidence: 80,
    impact: 'Test impact.',
    status: 'pending',
    priority: 'medium',
  }) as AIDecision;

describe('a response preview for one decision card', () => {
  const removals: Array<() => void> = [];
  const before = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useProductionStore.setState({ aiDecisions: [card('decision-1')] });
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useProductionStore.setState({ aiDecisions: before });
  });

  const draft = () =>
    api().draft({
      capabilityId: 'ai.respond-to-decision',
      targetUri: 'millos://decision/decision-1',
      parameters: { decisionUri: 'millos://decision/decision-1', disposition: 'deferred' },
      reason: 'Later.',
    });

  it('keeps its observed revision when another card is filed', () => {
    const first = draft();
    useProductionStore.setState((state) => ({
      aiDecisions: [...state.aiDecisions, card('decision-2')],
    }));
    expect(draft().observedRevision).toBe(first.observedRevision);
  });

  it('goes stale when the card it answers changes', () => {
    const first = draft();
    useProductionStore.setState((state) => ({
      aiDecisions: state.aiDecisions.map((d) =>
        d.id === 'decision-1' ? { ...d, status: 'rejected' as AIDecision['status'] } : d
      ),
    }));
    expect(draft().observedRevision).not.toBe(first.observedRevision);
  });
});
