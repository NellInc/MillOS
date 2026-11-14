/**
 * Layout fixes from the wave-2 captures: the long night's "0 / 2" broke over
 * three lines beside a long label, and the Portuguese tab strip broke
 * "Livro-caixa" inside the word.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { ChroniclePanel } from './ChroniclePanel';
import { useChronicleStore } from '../../stores/chronicleStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter } from '../../chronicle/engine';
import { setLocale } from '../../i18n';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = () => signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;

describe('Chronicle layout (wave 2 captures)', () => {
  beforeEach(() => {
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('keeps each front’s preparation count on one line, and lets the label wrap', () => {
    render(<ChronicleOverview state={{ ...signed(), shift: 3 }} />);
    for (const front of ['intake', 'floor']) {
      const count = screen.getByTestId(`night-count-${front}`);
      expect(count).toHaveClass('whitespace-nowrap', 'shrink-0');
      expect(count.previousElementSibling).toHaveClass('min-w-0');
    }
  });

  it('wraps the tab strip by whole labels, never inside a word, in pt-BR', () => {
    setLocale('pt-BR');
    useChronicleStore.setState({ chronicle: signed() });
    render(<ChroniclePanel />);
    const strip = screen.getByRole('tablist');
    expect(strip).toHaveClass('flex', 'flex-wrap');
    const tabs = within(strip).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toContain('Livro-caixa');
    for (const tab of tabs) expect(tab).toHaveClass('whitespace-nowrap', 'px-3');
  });
});
