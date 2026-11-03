import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CharterScreen } from './CharterScreen';
import { charterScore, DEFAULT_CHARTER } from '../../chronicle/charter';

describe('A sandbox charter scores no fortune it never meets', () => {
  it('adds nothing for hard fortune when the chronicle draws no events or forecasts', () => {
    expect(charterScore({ ...DEFAULT_CHARTER, fortune: 'hard', mode: 'sandbox' })).toBe(0);
    expect(charterScore({ ...DEFAULT_CHARTER, fortune: 'hard', mode: 'no_trials' })).toBe(3);
  });

  it('offers the sandbox no fortune bonus on the charter screen', () => {
    render(<CharterScreen />);
    fireEvent.click(screen.getByRole('radio', { name: /Hard fortune/ }));
    expect(screen.getByRole('button', { name: /Sign the charter/ }).textContent).toMatch(
      /score \+3/
    );
    fireEvent.click(screen.getByRole('radio', { name: /Sandbox/ }));
    expect(screen.getByRole('button', { name: /Sign the charter/ }).textContent).not.toMatch(
      /score/
    );
    expect(
      screen.getByRole('radio', { name: /Hard fortune/ }).closest('label')!.textContent
    ).not.toMatch(/\+3/);
  });
});
