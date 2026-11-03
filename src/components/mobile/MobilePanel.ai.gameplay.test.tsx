import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

const decision = (id: string, status: AIDecision['status'], action: string): AIDecision =>
  ({
    id,
    timestamp: new Date(),
    type: 'optimization',
    action,
    reasoning: `Because ${action}`,
    confidence: 80,
    impact: 'Small gain',
    status,
    priority: 'medium',
  }) as AIDecision;

const initialDecisions = useProductionStore.getState().aiDecisions;
beforeEach(() => useProductionStore.setState({ aiDecisions: [] }));
afterEach(() => {
  cleanup();
  setLocale('en');
  useProductionStore.setState({ aiDecisions: initialDecisions });
});

// Under 768 px this sheet is the AI workspace. Its cards could not be answered
// and nothing opened AI settings, so a phone player could neither pick a model
// nor accept, defer or reject a recommendation.
it('opens AI settings from the phone AI sheet', () => {
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI settings' }));
  expect(screen.getByRole('dialog', { name: 'AI Settings' })).toBeInTheDocument();
});

it('names AI settings in Brazilian Portuguese', () => {
  setLocale('pt-BR');
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Configurações de IA' })).toBeInTheDocument();
});

it('closes AI settings on Escape without closing the sheet behind it', () => {
  const onClose = vi.fn();
  render(<MobilePanel isVisible content="ai" onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI settings' }));
  const dialog = screen.getByRole('dialog', { name: 'AI Settings' });
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'AI Settings' })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('accepts a pending card from the phone sheet and keeps focus in the sheet', () => {
  useProductionStore.setState({ aiDecisions: [decision('d1', 'pending', 'Raise roll gap')] });
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const accept = screen.getByRole('button', { name: 'Accept' });
  accept.focus();
  fireEvent.click(accept);
  const answered = useProductionStore.getState().aiDecisions[0];
  expect(answered.response?.disposition).toBe('accepted');
  expect(answered.status).not.toBe('pending');
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect(document.activeElement).not.toBe(document.body);
  expect(
    screen.getByRole('dialog', { name: 'AI Partner mobile panel' }).contains(document.activeElement)
  ).toBe(true);
});

it('defers a card once and rejects one from the phone sheet', () => {
  useProductionStore.setState({
    aiDecisions: [
      decision('d1', 'pending', 'Raise roll gap'),
      decision('d2', 'pending', 'Slow line'),
    ],
  });
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  const first = screen.getByText('Raise roll gap').closest('li') as HTMLElement;
  fireEvent.click(within(first).getByRole('button', { name: 'Defer' }));
  expect(useProductionStore.getState().aiDecisions[0].response?.disposition).toBe('deferred');
  // A card is deferred once; it can still be accepted or rejected.
  const deferred = screen.getByText('Raise roll gap').closest('li') as HTMLElement;
  expect(within(deferred).queryByRole('button', { name: 'Defer' })).not.toBeInTheDocument();
  expect(within(deferred).getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  const second = screen.getByText('Slow line').closest('li') as HTMLElement;
  fireEvent.click(within(second).getByRole('button', { name: 'Reject' }));
  expect(useProductionStore.getState().aiDecisions[1].status).toBe('superseded');
});

it('lists a card still waiting for an answer ahead of newer settled ones', () => {
  useProductionStore.setState({
    aiDecisions: [
      ...Array.from({ length: 6 }, (_, i) => decision(`c${i}`, 'completed', `Done ${i}`)),
      decision('old', 'pending', 'Inspect sifter B'),
    ],
  });
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  expect(screen.getByText('Inspect sifter B')).toBeInTheDocument();
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  });
  expect(useProductionStore.getState().aiDecisions.at(-1)?.response?.disposition).toBe('accepted');
});

// The Overview sheet now carries the play card, the debrief, maintenance and
// the KPIs, and kept the 33vh of a small summary sheet.
it('gives the Overview sheet the tall height', () => {
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  const sheet = screen.getByRole('dialog', { name: 'Mill Overview mobile panel' });
  expect(sheet.style.maxHeight).not.toBe('33vh');
  expect(sheet.firstElementChild).toHaveClass(
    'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]'
  );
  expect(sheet.firstElementChild).not.toHaveClass('max-h-[33vh]');
});

// The desktop card now follows the language through its keyed copy; the phone
// sheet, where pending cards are answered under 768 px, still printed the
// filing language. Working if a card filed in English reads in Portuguese.
it('shows a keyed pending card in the language active now', async () => {
  const { decisionCardText } = await import('../../utils/aiEngine');
  const keyed = {
    ...decision('k1', 'pending', 'Coordinate R.M. 101'),
    copy: { action: { key: 'coordinationAction', params: { machine: 'R.M. 101' } } },
  } as AIDecision;
  useProductionStore.setState({ aiDecisions: [keyed] });
  setLocale('pt-BR');
  const portuguese = decisionCardText(keyed, 'pt-BR').action;
  expect(portuguese).not.toBe('Coordinate R.M. 101');
  render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
  expect(screen.getByText(portuguese)).toBeInTheDocument();
  expect(screen.queryByText('Coordinate R.M. 101')).toBeNull();
});
