import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useProductionStore } from '../../stores/productionStore';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

// The capture pass found the phone's AI cards cut with an ellipsis, without
// the line saying what accepting does, and without the partner's proposal
// cards the desktop panel leads with. Working if the card reads whole, says
// its effect, and the proposals sit at the top of Decisions.

const longAction = 'Lower the line rate by 2% for the load on R.M. 101 until the roll gap is reset';
const card: AIDecision = {
  id: 'd-long',
  timestamp: new Date(),
  type: 'optimization',
  action: longAction,
  reasoning: 'The line is carrying 71 percent load at 100 percent local efficiency on R.M. 101.',
  confidence: 80,
  impact: 'Reduces the whole line rate by 2%, never below 55%.',
  status: 'pending',
  priority: 'medium',
} as AIDecision;

const initialDecisions = useProductionStore.getState().aiDecisions;
beforeEach(() => useProductionStore.setState({ aiDecisions: [card] }));
afterEach(() => {
  cleanup();
  setLocale('en');
  useProductionStore.setState({ aiDecisions: initialDecisions });
});

it('shows a card whole, with what accepting does', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const item = document.getElementById('mobile-ai-card-d-long')!;
  const action = within(item).getByText(longAction);
  const reasoning = within(item).getByText(card.reasoning);
  expect(action.className).not.toMatch(/\btruncate\b/);
  expect(reasoning.className).not.toMatch(/\btruncate\b/);
  expect(within(item).getByText(card.impact)).toBeInTheDocument();
});

it('leads the Decisions tab with the partner proposal cards', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const panel = document.getElementById('mobile-ai-tabpanel')!;
  const proposals = within(panel).getByTestId('partner-proposals');
  const firstCard = document.getElementById('mobile-ai-card-d-long')!;
  expect(
    proposals.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});

it('shows the proposals with no AI decisions yet too', () => {
  useProductionStore.setState({ aiDecisions: [] });
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  expect(screen.getByTestId('partner-proposals')).toBeInTheDocument();
});
