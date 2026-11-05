import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

afterEach(cleanup);

const TALL = 'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]';

// Phones play in landscape only (the rotate notice holds portrait), so 33vh of
// a 390 px viewport is about 129 px, the 68 px header included: the SCADA sheet
// the guided delivery opens at most of its steps showed some 60 px of four
// metric cards, the route and five vessels. The AI sheet's bare 70vh is the
// large-viewport unit and skips the sheet's 100 px bottom offset, so with the
// browser bar showing its header (and its close button) ran off the top.
it.each([
  ['scada', 'Simulated SCADA mobile panel'],
  ['ai', 'AI Partner mobile panel'],
] as const)('gives the %s sheet the capped tall height', (content, name) => {
  render(<MobilePanel isVisible content={content} onClose={vi.fn()} />);
  const sheet = screen.getByRole('dialog', { name });
  expect(sheet.style.maxHeight).not.toBe('33vh');
  expect(sheet.style.maxHeight).not.toBe('70vh');
  expect(sheet.firstElementChild).toHaveClass(TALL);
  expect(sheet.firstElementChild).not.toHaveClass('max-h-[33vh]');
  expect(sheet.firstElementChild).not.toHaveClass('max-h-[70vh]');
});
