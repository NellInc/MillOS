import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { setLocale } from '../../../i18n';

afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14 (D-012): no help line under a Settings control, no joke after an empty
// state, and no switch for the AI narration cards, which no longer show.
// Working if each control stands on its own label in both languages.
describe('Settings without helper text', () => {
  it.each([
    [
      'en',
      [
        'Controls the depth of bilateral alignment',
        'Makes controls and text larger',
        'Follow system uses your device setting',
        'The last ten minutes of the simulation are buffered',
        'very new or very quiet',
      ],
      'AI Reflections',
      'Loading screen facts',
      'Nothing announced yet.',
    ],
    [
      'pt-BR',
      [
        'Controla a profundidade',
        'Aumenta controles e textos',
        'Seguir o sistema usa',
        'Os últimos dez minutos',
        'muito novo ou está muito quieto',
      ],
      'Reflexões da IA',
      'Fatos na tela de carregamento',
      'Nenhum aviso ainda.',
    ],
  ] as const)('in %s', (locale, cut, narrationSwitch, factsSwitch, empty) => {
    setLocale(locale);
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    for (const text of cut) expect(screen.queryByText(new RegExp(text))).toBeNull();
    expect(screen.queryByRole('button', { name: narrationSwitch })).toBeNull();
    expect(screen.getByRole('button', { name: factsSwitch })).toBeInTheDocument();
    expect(screen.getByText(empty)).toBeInTheDocument();
    expect(document.getElementById('reduce-motion-help')).toBeNull();
  });
});
