import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AchievementsPanel } from './AchievementsPanel';
import { useAchievementsStore } from '../../stores/achievementsStore';

// The reset control swaps itself for Confirm/Cancel and back. The focus trap
// listens on the panel, so focus dropped to <body> also drops Tab and Escape.
describe('AchievementsPanel reset confirmation focus', () => {
  afterEach(() => {
    cleanup();
    useAchievementsStore.getState().resetAchievements();
  });

  it('keeps keyboard focus inside the panel through reset, cancel and confirm', () => {
    render(<AchievementsPanel onClose={() => undefined} />);
    const reset = screen.getByRole('button', { name: 'Reset' });
    reset.focus();
    fireEvent.click(reset);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.click(cancel);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset' }));
  });
});
