import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DecisionHistoryPanel } from './DecisionHistoryPanel';
import { useProductionStore } from '../../stores/productionStore';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';

// The history is newest first, five to a page, and the engine files a card
// every few seconds while the plant runs. A player reading the evidence for the
// fifth card on a page lost the dialog (and focus, to <body>) the moment the
// next card pushed that one onto the following page.
// Working if the dialog stays open across a new card, and closing it leaves
// focus inside the panel.

const card = (index: number): AIDecision => ({
  id: `history-${index}`,
  timestamp: new Date(Date.UTC(2026, 10, 4, 10, index)),
  type: 'optimization',
  action: `Card number ${index}`,
  reasoning: 'Steady flow',
  confidence: 80,
  impact: 'Smoother flow',
  status: 'completed',
  priority: 'medium',
});

describe('decision history evidence dialog', () => {
  const previous = useProductionStore.getState().aiDecisions;
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ aiDecisions: previous });
  });

  it('stays open when a new card pushes the inspected one onto the next page', () => {
    // Six cards: page one shows 6..2, newest first.
    useProductionStore.setState({ aiDecisions: [6, 5, 4, 3, 2, 1].map(card) });
    render(<DecisionHistoryPanel />);
    const opener = screen.getByRole('button', { name: 'View details: Card number 2' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The engine files card 7; card 2 moves to page two.
    act(() => {
      useProductionStore.setState((state) => ({ aiDecisions: [card(7), ...state.aiDecisions] }));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('returns focus to the panel when the opener has left the page', () => {
    useProductionStore.setState({ aiDecisions: [6, 5, 4, 3, 2, 1].map(card) });
    render(<DecisionHistoryPanel />);
    const opener = screen.getByRole('button', { name: 'View details: Card number 2' });
    opener.focus();
    fireEvent.click(opener);
    act(() => {
      useProductionStore.setState((state) => ({ aiDecisions: [card(7), ...state.aiDecisions] }));
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('returns focus to the card that opened it while that card is still shown', () => {
    useProductionStore.setState({ aiDecisions: [6, 5, 4, 3, 2, 1].map(card) });
    render(<DecisionHistoryPanel />);
    const opener = screen.getByRole('button', { name: 'View details: Card number 4' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'View details: Card number 4' })
    );
  });
});
