import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Datalinks } from './Datalinks';
import { setLocale } from '../../i18n';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

// Portuguese titles carry accents a player often leaves out when typing a
// search ("manutencao" for "manutenção"). The library must still find them.
describe('Datalinks search in pt-BR', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('matches an accented title from an unaccented query', () => {
    setLocale('pt-BR');
    render(<Datalinks isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'manutencao' } });
    expect(
      within(dialog).getByRole('button', { name: 'Ciclo de manutenção preditiva' })
    ).toBeInTheDocument();
  });
});
