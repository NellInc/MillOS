/**
 * D-048: the language comes from `?lang=`, then the saved `millos-locale`,
 * then English; the browser language is never consulted. The pre-React cover
 * in index.html mirrors detectLocale(), and it still read navigator.languages
 * (it predates D-048), so a browser listing Portuguese got a Portuguese cover
 * over an English game. Working if only ?lang= or the saved choice turns the
 * cover Portuguese.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const script =
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((code) => code.includes('millos-locale')) ?? '';

function cover(search: string, languages: readonly string[]) {
  document.documentElement.lang = 'en';
  document.body.innerHTML =
    '<div id="root"><div class="loading-screen" aria-label="Loading MillOS">' +
    '<h1 class="loading-text">MillOS: WARMING UP THE ROLLERS</h1></div></div>';
  window.history.replaceState(null, '', `/${search}`);
  // Own properties shadow jsdom's prototype getters; removed after each test.
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => languages });
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    get: () => languages[0] ?? 'en',
  });
  new Function(script)();
  return {
    lang: document.documentElement.lang,
    text: document.querySelector('.loading-text')?.textContent,
  };
}

beforeEach(() => localStorage.removeItem('millos-locale'));
afterEach(() => {
  delete (navigator as { languages?: unknown }).languages;
  delete (navigator as { language?: unknown }).language;
  localStorage.removeItem('millos-locale');
  window.history.replaceState(null, '', '/');
  document.documentElement.lang = 'en';
});

describe('the pre-React loading cover chooses its language as D-048 says', () => {
  it('finds the language script', () => {
    expect(script).toContain('millos-locale');
  });

  it('never reads the browser language list', () => {
    expect(script).not.toMatch(/navigator\.languages?\b/);
    expect(cover('', ['pt-BR', 'pt'])).toEqual({
      lang: 'en',
      text: 'MillOS: WARMING UP THE ROLLERS',
    });
  });

  it('turns Portuguese for ?lang=pt-BR', () => {
    expect(cover('?lang=pt-BR', ['en-GB'])).toEqual({
      lang: 'pt-BR',
      text: 'MillOS: AQUECENDO OS ROLOS',
    });
  });

  it('turns Portuguese for a saved choice, and ?lang= wins over it', () => {
    localStorage.setItem('millos-locale', 'pt-BR');
    expect(cover('', ['en-GB']).lang).toBe('pt-BR');
    expect(cover('?lang=en', ['en-GB']).lang).toBe('en');
  });
});
