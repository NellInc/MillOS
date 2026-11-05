import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DecisionHistoryPanel } from './DecisionHistoryPanel';
import { useProductionStore } from '../../stores/productionStore';
import type { AIDecision } from '../../types';

// Next page disables itself on the last page, and Previous on the first, so a
// keyboard player paging through the history was left on a dead control (a
// browser drops focus from a disabled button to <body>). Working if focus moves
// to the other page button when the pressed one runs out of pages.
describe('decision history paging keeps the keyboard place', () => {
  const previous = useProductionStore.getState().aiDecisions;
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ aiDecisions: previous });
  });

  const card = (index: number): AIDecision => ({
    id: `history-page-${index}`,
    timestamp: new Date(Date.UTC(2026, 0, 1, 8, index)),
    type: 'coordination',
    action: `Coordinate flow ${index}`,
    reasoning: 'Load high',
    confidence: 80,
    impact: 'Smoother flow',
    status: 'completed',
    priority: 'medium',
  });

  it('hands focus to the other page button at either end', () => {
    useProductionStore.setState({ aiDecisions: Array.from({ length: 7 }, (_, i) => card(i)) });
    render(<DecisionHistoryPanel />);
    const next = screen.getByRole('button', { name: 'Next page' });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(next).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous page' }));

    const back = screen.getByRole('button', { name: 'Previous page' });
    fireEvent.click(back);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next page' }));
  });
});
