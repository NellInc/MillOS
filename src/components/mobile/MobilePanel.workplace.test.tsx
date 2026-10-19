import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: 'div',
    aside: ({
      initial,
      variants,
      animate,
      exit,
      ...props
    }: React.ComponentProps<'aside'> & {
      initial: unknown;
      variants: unknown;
      animate: unknown;
      exit: unknown;
    }) => {
      motionState.initial = initial;
      motionState.variants = variants;
      void animate;
      void exit;
      return <aside {...props} />;
    },
  },
}));
const motionState = vi.hoisted(() => ({
  reduced: false,
  initial: null as unknown,
  variants: null as unknown,
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => motionState.reduced }));
beforeEach(() => {
  motionState.reduced = false;
  useWorkplaceStore.setState({ workplace: createWorkplace() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('mounts the real workplace laboratory in a tall, bounded mobile workspace', () => {
  render(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog', { name: 'Bilateral Autonomy mobile panel' });
  // jsdom drops min()/env() styles. The browser capture checks the actual
  // height; here retain the shipped class contract rather than fake CSS support.
  expect(dialog.firstElementChild?.className).toContain(
    'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]'
  );
  expect(screen.getByRole('region', { name: 'Workplace laboratory' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Start playable shift at teaching pace (1/2x)' })
  ).toBeInTheDocument();
});

it('keeps the authored spring for the ordinary motion preference', () => {
  render(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
  expect(motionState.initial).toBe('hidden');
  expect(motionState.variants).toMatchObject({
    hidden: { y: '100%', scale: 0.95 },
    visible: { transition: { type: 'spring' } },
  });
});

it('removes initial and exit transforms after a live reduced-motion change', () => {
  const view = render(<MobilePanel isVisible={false} content="management" onClose={vi.fn()} />);
  motionState.reduced = true;
  view.rerender(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
  expect(motionState.initial).toBe(false);
  expect(motionState.variants).toEqual({
    hidden: { opacity: 0, y: 0, scale: 1 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0 } },
    exit: { opacity: 0, y: 0, scale: 1, transition: { duration: 0 } },
  });
});

it('wraps both Tab directions through the visible disclosure, ignoring its collapsed controls', () => {
  // Model Chromium's retained layout boxes for collapsed details; native browser
  // evidence still supplies the actual sequential-focus verification.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 24 },
  ] as unknown as DOMRectList);
  render(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog', { name: 'Bilateral Autonomy mobile panel' });
  const close = screen.getByRole('button', { name: 'Close panel' });
  const summary = screen.getByText('AI: why this response?', { selector: 'summary' });
  const details = summary.closest('details')!;
  const challenge = details.querySelector('button')!;
  expect(details.open).toBe(false);
  expect(challenge).toBeTruthy();
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(summary).toHaveFocus();
  fireEvent.keyDown(summary, { key: 'Tab' });
  expect(close).toHaveFocus();
  details.open = true;
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(challenge).toHaveFocus();
  fireEvent.keyDown(challenge, { key: 'Tab' });
  expect(close).toHaveFocus();
});

// Take over removes itself as it opens this sheet, so the control focused
// before the sheet opened is gone (or never was) by the time it closes.
// Working if focus lands on the dock, the stable place to continue from,
// and a control that still exists keeps getting focus back as before.
it('returns focus to the dock when the control that opened the sheet is gone', () => {
  const dock = document.createElement('div');
  const [overview, scada] = ['overview', 'scada'].map((mode) => {
    const item = document.createElement('button');
    item.dataset.dockMode = mode;
    item.textContent = mode;
    return dock.appendChild(item);
  });
  document.body.append(dock);
  try {
    // Take over is still focused when the sheet opens, then unmounts.
    const takeOver = document.createElement('button');
    document.body.append(takeOver);
    takeOver.focus();
    const view = render(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
    takeOver.remove();
    view.rerender(<MobilePanel isVisible={false} content="management" onClose={vi.fn()} />);
    expect(overview).toHaveFocus();

    // Take over had already unmounted: nothing but the page was focused.
    (document.activeElement as HTMLElement | null)?.blur();
    view.rerender(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
    view.rerender(<MobilePanel isVisible={false} content="management" onClose={vi.fn()} />);
    expect(overview).toHaveFocus();

    // A dock item that opened the sheet gets focus back.
    scada.focus();
    view.rerender(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus();
    view.rerender(<MobilePanel isVisible={false} content="management" onClose={vi.fn()} />);
    expect(scada).toHaveFocus();
  } finally {
    dock.remove();
  }
});
