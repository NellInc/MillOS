import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutModal } from '../AboutModal';

describe('AboutModal', () => {
  afterEach(() => {
    cleanup();
    document.getElementById('root')?.remove();
  });

  it('isolates the application while open and restores focus and attributes on close', async () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    appRoot.setAttribute('aria-hidden', 'false');
    const opener = document.createElement('button');
    opener.textContent = 'Open about';
    appRoot.append(opener);
    document.body.append(appRoot);
    opener.focus();

    const { rerender } = render(<AboutModal isOpen onClose={vi.fn()} theme="dark" />);

    const dialog = screen.getByRole('dialog', { name: 'About MillOS' });
    expect(dialog.parentElement).toBe(document.body);
    expect(appRoot).toHaveAttribute('inert');
    expect(appRoot).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close about dialog' })).toHaveFocus()
    );

    rerender(<AboutModal isOpen={false} onClose={vi.fn()} theme="dark" />);

    await waitFor(() => expect(opener).toHaveFocus());
    expect(appRoot).not.toHaveAttribute('inert');
    expect(appRoot).toHaveAttribute('aria-hidden', 'false');
  });
});
