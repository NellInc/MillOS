import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Datalinks } from './Datalinks';
import { setLocale } from '../../i18n';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

afterEach(() => {
  cleanup();
  setLocale('en');
});

// D-012: no subtitle under the DATALINKS heading, and the empty pane carries
// no tagline, quote or blurb.
describe('Datalinks without helper text', () => {
  it.each([
    [
      'en',
      [
        'Mill field guide',
        'Bilateral Alignment',
        'Field notes on how this mill',
        'Select an entry',
      ],
    ],
    [
      'pt-BR',
      [
        'Guia de campo do moinho',
        'Alinhamento Bilateral',
        'Notas de campo',
        'Selecione um verbete',
      ],
    ],
  ] as const)('renders no subtitle, quote, blurb or prompt in %s', (locale, cut) => {
    // The welcome heading stays, so the empty pane is not blank.
    setLocale(locale);
    render(<Datalinks isOpen onClose={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'DATALINKS' })).toBeInTheDocument();
    for (const text of cut) {
      expect(screen.queryByText(new RegExp(text))).not.toBeInTheDocument();
    }
  });
});
