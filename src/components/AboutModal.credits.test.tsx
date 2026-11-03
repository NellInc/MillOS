import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { AboutModal } from './AboutModal';

// Commit 849f51e0 credits the MillOS soundtrack to Nell Watson alone, in the
// catalogue and the lyric files; the About dialog said so too late.
describe('About dialog soundtrack credit', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it.each([
    ['en', 'Original MillOS soundtrack by Nell Watson'],
    ['pt-BR', 'Trilha sonora original do MillOS por Nell Watson'],
  ] as const)('credits Nell Watson alone in %s', (locale, credit) => {
    setLocale(locale);
    render(<AboutModal isOpen onClose={vi.fn()} theme="dark" />);
    const line = screen.getByText(credit, { exact: false });
    expect(line.textContent?.trim()).toBe(credit);
    expect(screen.queryByText(/Suno/)).toBeNull();
    expect(document.querySelector('a[href*="suno.com"]')).toBeNull();
  });
});
