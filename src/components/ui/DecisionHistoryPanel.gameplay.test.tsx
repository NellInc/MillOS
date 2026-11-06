import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DecisionHistoryPanel } from './DecisionHistoryPanel';
import { useProductionStore } from '../../stores/productionStore';
import type { AIDecision } from '../../types';

describe('decision history confidence', () => {
  const previous = useProductionStore.getState().aiDecisions;
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ aiDecisions: previous });
  });

  it('shows a learned confidence as a whole percent', () => {
    // Two accepted cards and one rejected leave a (2/3 - 0.65) * 20 adjustment
    // (aiEngine recordDecisionOutcome), so the next coordination card reads 78.33...
    const confidence = 78 + (2 / 3 - 0.65) * 20;
    expect(Number.isInteger(confidence)).toBe(false);
    const decision: AIDecision = {
      id: 'history-confidence',
      timestamp: new Date(),
      type: 'coordination',
      action: 'Coordinate RM-101 flow',
      reasoning: 'Load high',
      confidence,
      impact: 'Smoother flow',
      status: 'pending',
      priority: 'medium',
    };
    useProductionStore.setState({ aiDecisions: [decision] });
    render(<DecisionHistoryPanel />);
    expect(screen.getByText('78%')).toBeInTheDocument();
  });
});
