import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingQuote } from './LoadingQuote';
import { LOADING_FACTS } from '../../stores/knowledgeStore';
import { MILLING_SOURCES } from '../../stores/millingSources';
import { setLocale } from '../../i18n';

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('loading cover fact', () => {
  // The fact mounts with the slow-load recovery controls (the same 30 s
  // timer), so a fade-in from opacity 0 put both lines at 0.46 opacity exactly
  // when the recovery state is first read: 3.57:1 and 2.44:1 on the cover.
  // Working if the first fact is drawn at its resting colours at once and
  // only later rotations crossfade.
  it('draws the first fact at full opacity, not mid-fade', () => {
    render(<LoadingQuote />);
    const texts = LOADING_FACTS.map((fact) => fact.text);
    const line = screen.getByText((content) => texts.includes(content));
    const wrapper = line.parentElement!;
    expect(['', '1']).toContain(wrapper.style.opacity);
    expect(line).toHaveClass('text-slate-300');
  });

  // D14: the nine slogans credited to "MillOS control principle" were
  // invented. Each line is now a milling fact from millingSources.ts, shown
  // with the body that published it. Working if every fact names a real
  // source and the cover shows no quotation and no invented author.
  it('shows a sourced fact with its publisher, never a quotation', () => {
    expect(LOADING_FACTS).toHaveLength(9);
    for (const fact of LOADING_FACTS) {
      expect(MILLING_SOURCES[fact.source]).toBeDefined();
      expect(fact.publisher).toBe(MILLING_SOURCES[fact.source].publisher);
      expect(fact.text).not.toMatch(/["“”]/);
    }
    render(<LoadingQuote />);
    const shown = LOADING_FACTS.find((fact) => screen.queryByText(fact.text));
    expect(shown).toBeDefined();
    expect(screen.getByText(shown!.publisher)).toBeInTheDocument();
    expect(screen.queryByText(/principle|princípio/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/["“”—]/);
  });

  it('reads in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    const pt = LOADING_FACTS.map((fact) => fact.text);
    expect(pt.some((text) => /farinha|trigo|poeira/.test(text))).toBe(true);
    render(<LoadingQuote />);
    expect(screen.getByText((content) => pt.includes(content))).toBeInTheDocument();
  });
});
