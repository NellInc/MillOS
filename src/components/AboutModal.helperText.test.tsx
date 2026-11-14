import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { AboutModal } from './AboutModal';

// D14: About keeps one line, and it is the one disclaimer the game needs
// (the roles, ballots and credits are illustrative, and no real worker data
// is used), in place of a tagline and the disclaimers that sat under the
// workplace controls. The licence credits stay.
describe('About dialog one line', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it.each([
    ['en', /opinionated about how humans and machines/, /no real worker data/],
    ['pt-BR', /com opinião própria/, /nenhum dado real de trabalhador/],
  ] as const)('is the disclaimer, not a tagline, in %s', (locale, tagline, disclaimer) => {
    setLocale(locale);
    render(<AboutModal isOpen onClose={vi.fn()} theme="dark" />);
    expect(screen.queryByText(tagline)).toBeNull();
    expect(screen.getByText(disclaimer)).toBeInTheDocument();
    expect(screen.getByText(/Phonon 40M/)).toBeInTheDocument();
  });
});
