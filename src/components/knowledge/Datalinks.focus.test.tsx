import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Datalinks } from './Datalinks';
import { KNOWLEDGE_ENTRIES } from '../../stores/knowledgeStore';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

// The article's Back and Related controls each unmount the control pressed. The
// focus trap listens on the dialog, so focus dropped to <body> lets Tab escape.
describe('Datalinks article focus', () => {
  afterEach(cleanup);

  const twin = KNOWLEDGE_ENTRIES.find((entry) => entry.id === 'unified-digital-twin')!;
  const flow = KNOWLEDGE_ENTRIES.find((entry) => entry.id === 'autonomous-material-flow')!;

  it('returns focus to the entry in the list when the article closes', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: twin.title }));
    const back = screen.getByRole('button', { name: 'Back to list' });
    back.focus();
    fireEvent.click(back);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: twin.title }));
  });

  it('moves focus into the related article it opens', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: twin.title }));
    // The list's button comes first; the article's related link last.
    const related = screen.getAllByRole('button', { name: flow.title }).at(-1)!;
    related.focus();
    fireEvent.click(related);
    expect(screen.getByRole('heading', { level: 3, name: flow.title })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to list' }));
  });

  // 'Clear search' lives in the no-match message it clears, so it unmounts as
  // it is pressed. On <body>, Tab walks out of the modal and Space engages the
  // forklift emergency stop behind it.
  it('returns focus to the search box when Clear search empties it', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const search = screen.getByRole('textbox', { name: 'Search knowledge entries' });
    fireEvent.change(search, { target: { value: 'zzzz-no-such-entry' } });
    const clear = screen.getByRole('button', { name: 'Clear search' });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(search);
  });
});

// On a phone the list is hidden (display: none) while an article is open, so
// the entry button just pressed vanishes with focus on it and focus falls to
// <body>. jsdom applies no CSS, so layout is modelled through getClientRects:
// at phone width an element inside a 'hidden' class has no boxes.
describe('Datalinks picking an entry', () => {
  const twin = KNOWLEDGE_ENTRIES.find((entry) => entry.id === 'unified-digital-twin')!;
  const original = HTMLElement.prototype.getClientRects;
  const layout = (phone: boolean) => {
    HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
      const rendered = !(phone && this.closest('.hidden'));
      return (rendered ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList;
    };
  };

  afterEach(() => {
    cleanup();
    HTMLElement.prototype.getClientRects = original;
  });

  it('moves focus into the article when the list hides at phone width', () => {
    layout(true);
    render(<Datalinks isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    const entry = within(dialog).getByRole('button', { name: twin.title });
    entry.focus();
    fireEvent.click(entry);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to list' }));
  });

  it('keeps focus on the entry when the list stays beside the article', () => {
    layout(false);
    render(<Datalinks isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    const entry = within(dialog).getByRole('button', { name: twin.title });
    entry.focus();
    fireEvent.click(entry);
    expect(document.activeElement).toBe(entry);
  });
});
