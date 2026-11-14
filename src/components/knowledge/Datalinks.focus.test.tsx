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

  // Seen in a headless capture: at z-50 the facility stop's banner and guidance
  // (z-[60]) drew over the open dialog's header and entry list. Modals in this
  // app (About, confirm, shortcuts, AI settings) sit at z-[1000], above it.
  it('layers above the emergency overlay, as the other modals do', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const backdrop = screen.getByRole('dialog').parentElement!;
    expect(backdrop).toHaveClass('z-[1000]');
    expect(backdrop).not.toHaveClass('z-50');
  });

  // Seen on a landscape phone (844 x 390): the wrapped category chips filled
  // the list column and left no room for a single entry. On a short screen the
  // whole column scrolls (search, chips, entries) instead of only the list.
  it('scrolls the whole list column on a short screen', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const list = screen
      .getByText(twin.title, { selector: 'button span' })
      .closest('.flex-1.overflow-y-auto');
    expect(list).not.toBeNull();
    expect(list).toHaveClass('[@media(max-height:480px)]:flex-none');
    expect(list!.parentElement).toHaveClass('[@media(max-height:480px)]:overflow-y-auto');
  });

  // Seen in a Portuguese capture: "O que um padeiro precisa da ..." was cut by
  // an ellipsis in the entry list. Titles wrap instead.
  it('wraps an entry title rather than cutting it', () => {
    render(<Datalinks isOpen onClose={() => undefined} />);
    const title = screen.getByText(twin.title, { selector: 'button span' });
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveClass('break-words');
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
