import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingQuote } from './LoadingQuote';

afterEach(cleanup);

describe('loading cover quote', () => {
  // The quote mounts with the slow-load recovery controls (the same 30 s
  // timer), so a fade-in from opacity 0 put both lines at 0.46 opacity exactly
  // when the recovery state is first read: 3.57:1 and 2.44:1 on the cover.
  // Working if the first quote is drawn at its resting colours at once and
  // only later rotations crossfade.
  it('draws the first quote at full opacity, not mid-fade', () => {
    render(<LoadingQuote />);
    const quote = screen.getByText(/^".*"$/);
    const wrapper = quote.parentElement!;
    expect(['', '1']).toContain(wrapper.style.opacity);
    expect(quote).toHaveClass('text-slate-300');
  });
});
