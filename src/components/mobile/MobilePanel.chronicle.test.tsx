import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useChronicleStore } from '../../stores/chronicleStore';
import { createInitialState } from '../../chronicle/engine';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

beforeEach(() => useChronicleStore.setState({ chronicle: createInitialState() }));
afterEach(cleanup);

// The Chronicle sheet carries the whole workspace (charter, tabs, plans) and,
// like Settings, kept the 33vh of the small summary sheets with a p-4 around a
// panel that pads itself.
it('gives the Chronicle sheet the tall height and a single padding', () => {
  render(<MobilePanel isVisible content="chronicle" onClose={vi.fn()} />);
  const sheet = screen.getByRole('dialog', { name: 'Mill Chronicle mobile panel' });
  // jsdom drops the env() value it cannot parse, so the inline limit can only
  // be checked for no longer being the short one.
  expect(sheet.style.maxHeight).not.toBe('33vh');
  expect(sheet.firstElementChild).toHaveClass(
    'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]'
  );
  const panelRoot = screen.getByTestId('chronicle-panel');
  expect(panelRoot).toHaveClass('p-3');
  expect(panelRoot.parentElement).not.toHaveClass('p-4');
});
