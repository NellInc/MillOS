import { afterEach, describe, expect, it } from 'vitest';
import {
  capitalizeIn,
  createTranslator,
  defineMessages,
  detectLocale,
  formatFixed,
  formatGrouped,
  getLocale,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  setLocale,
  translate,
  upperFirst,
} from '../index';

const catalog = defineMessages({
  en: {
    due: 'Due in {hours}h {minutes}m',
    bags: (p: { count: number }) => (p.count === 1 ? '1 bag' : `${p.count} bags`),
  },
  'pt-BR': {
    due: 'Prazo em {hours}h {minutes}min',
    bags: (p: { count: number }) => (p.count === 1 ? '1 saco' : `${p.count} sacos`),
  },
});

afterEach(() => {
  setLocale('en');
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  window.history.replaceState(null, '', '/');
});

describe('locale detection', () => {
  it('treats every Portuguese tag as pt-BR and everything else as English', () => {
    expect(normalizeLocale('pt')).toBe('pt-BR');
    expect(normalizeLocale('pt-BR')).toBe('pt-BR');
    expect(normalizeLocale('pt_br')).toBe('pt-BR');
    expect(normalizeLocale('PT-PT')).toBe('pt-BR');
    expect(normalizeLocale('en-GB')).toBe('en');
    expect(normalizeLocale('es-AR')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
  });

  it('prefers a shared ?lang= link, then a saved choice, then English for jsdom', () => {
    expect(detectLocale()).toBe('en');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'pt-BR');
    expect(detectLocale()).toBe('pt-BR');
    window.history.replaceState(null, '', '/?quality=low&lang=en');
    expect(detectLocale()).toBe('en');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    window.history.replaceState(null, '', '/');
    expect(detectLocale()).toBe('en');
  });

  it('saves the choice and labels the document', () => {
    setLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');
  });
});

describe('messages', () => {
  it('interpolates placeholders and calls function messages in the active language', () => {
    expect(translate(catalog, 'due', { hours: 3, minutes: 43 })).toBe('Due in 3h 43m');
    expect(translate(catalog, 'bags', { count: 2 })).toBe('2 bags');
    setLocale('pt-BR');
    expect(translate(catalog, 'due', { hours: 3, minutes: 43 })).toBe('Prazo em 3h 43min');
    expect(translate(catalog, 'bags', { count: 1 })).toBe('1 saco');
    expect(createTranslator(catalog, 'en')('due', { hours: 1, minutes: 0 })).toBe('Due in 1h 0m');
  });

  it('refuses a pt-BR table that misses an English key at compile time', () => {
    // @ts-expect-error pt-BR must define every English key
    defineMessages({ en: { a: 'A', b: 'B' }, 'pt-BR': { a: 'A' } });
  });

  it('leaves unknown placeholders visible instead of printing undefined', () => {
    expect(translate(catalog, 'due', { hours: 1 })).toBe('Due in 1h {minutes}m');
  });
});

describe('numbers', () => {
  it('keeps English exactly as toFixed wrote it and groups pt-BR correctly', () => {
    expect(formatFixed(6000, 0, 'en')).toBe('6000');
    expect(formatFixed(2.5, 1, 'en')).toBe('2.5');
    expect(formatFixed(6000, 0, 'pt-BR')).toBe('6.000');
    expect(formatFixed(1871.25, 2, 'pt-BR')).toBe('1.871,25');
    expect(formatFixed(Number.NaN, 1, 'pt-BR')).toBe('NaN');
    expect(formatGrouped(8640, undefined, 'en')).toBe('8,640');
    expect(formatGrouped(8640, undefined, 'pt-BR')).toBe('8.640');
  });
});

describe('casing', () => {
  it('upper-cases only the first letter, as Portuguese sentence case needs', () => {
    expect(upperFirst('moinho de rolos')).toBe('Moinho de rolos');
    expect(upperFirst('em estado crítico')).toBe('Em estado crítico');
    expect(upperFirst('')).toBe('');
  });

  it('keeps CSS capitalize for English only', () => {
    expect(capitalizeIn('en')).toBe('capitalize');
    expect(capitalizeIn('pt-BR')).toBe('');
  });
});
