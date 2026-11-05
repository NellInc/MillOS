import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AINarration } from './AINarration';
import type { NarrationEntry } from '../../stores/aiNarrationStore';

const narration: NarrationEntry = {
  id: 'focus-narration',
  trigger: 'library-opened',
  content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.',
};

// "Continue reading" removes itself as the rest of the note appears. Focus left
// on it fell to <body>, and the next Tab started again at the top of the page.
describe('AINarration continue reading', () => {
  afterEach(cleanup);

  it('moves focus to the first paragraph it reveals', () => {
    render(<AINarration narration={narration} />);
    const more = screen.getByRole('button', { name: 'Continue reading...' });
    more.focus();
    fireEvent.click(more);
    expect(screen.queryByRole('button', { name: 'Continue reading...' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText('Third paragraph.'));
  });
});

// The card is queued behind safety states: a critical alert, a drill, an opened
// sidebar all unmount it while it is being read. Focus inside it fell to <body>,
// where the next Space stops every forklift.
describe('AINarration hidden while focused', () => {
  afterEach(cleanup);

  it('hands focus to the dock when the card unmounts with focus inside it', () => {
    const view = render(
      <div>
        <button type="button" data-dock-mode="overview">
          Overview
        </button>
        <AINarration narration={narration} />
      </div>
    );
    const more = screen.getByRole('button', { name: 'Continue reading...' });
    more.focus();
    view.rerender(
      <div>
        <button type="button" data-dock-mode="overview">
          Overview
        </button>
      </div>
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overview' }));
  });

  it('leaves focus alone when it was elsewhere', () => {
    const view = render(
      <div>
        <button type="button" data-dock-mode="overview">
          Overview
        </button>
        <input aria-label="Elsewhere" />
        <AINarration narration={narration} />
      </div>
    );
    const elsewhere = screen.getByRole('textbox', { name: 'Elsewhere' });
    elsewhere.focus();
    view.rerender(
      <div>
        <button type="button" data-dock-mode="overview">
          Overview
        </button>
        <input aria-label="Elsewhere" />
      </div>
    );
    expect(document.activeElement).toBe(elsewhere);
  });
});
