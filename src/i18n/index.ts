import { create } from 'zustand';

/**
 * MillOS interface language: English and Brazilian Portuguese.
 *
 * Each component owns its copy in a co-located `*.messages.ts` module built
 * with defineMessages(), so translations stay beside the text they replace and
 * no shared dictionary collects merge conflicts. The type of defineMessages()
 * requires every English key in pt-BR, so a missing translation fails tsc.
 *
 * English is the source language and its rendered text is unchanged from the
 * hard-coded copy it replaced. Numbers interpolated into copy go through
 * formatFixed()/formatGrouped(): pt-BR reads "6,000" as six, so it needs
 * "6.000" and "2,5".
 *
 * Working if a pt-BR visitor sees Portuguese without touching anything, a
 * choice survives reload and Reset Simulation, and English output is
 * byte-identical to the original copy.
 */

export const LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
/** Excluded from Reset Simulation's millos-* sweep: language is a person, not a shift. */
export const LOCALE_STORAGE_KEY = 'millos-locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Accepts 'pt', 'pt-BR', 'pt_br', 'PT-PT'... as Portuguese; anything else is English. */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase().replace('_', '-');
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

function readSavedLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

function writeSavedLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/**
 * `?lang=` (a shared link) wins, then a saved choice, then the browser's own
 * language list. Only Portuguese is ever inferred; every other language, and
 * every environment without a window, is English.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  let fromUrl: Locale | null = null;
  try {
    fromUrl = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
  } catch {
    fromUrl = null;
  }
  if (fromUrl) return fromUrl;
  const saved = readSavedLocale();
  if (saved) return saved;
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

function applyDocumentLanguage(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const initialLocale = detectLocale();
applyDocumentLanguage(initialLocale);

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    if (!isLocale(locale)) return;
    writeSavedLocale(locale);
    applyDocumentLanguage(locale);
    set({ locale });
  },
}));

export const getLocale = (): Locale => useLocaleStore.getState().locale;
export const setLocale = (locale: Locale): void => useLocaleStore.getState().setLocale(locale);
export const useLocale = (): Locale => useLocaleStore((state) => state.locale);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type MessageParams = Record<string, string | number>;
/** A string with `{name}` placeholders, or a function for plurals and logic. */
// `never` keeps function messages assignable whatever their parameter type.
export type Message = string | ((params: never) => string);
export type MessageTable = Record<string, Message>;

type Translation<E extends MessageTable> = { [K in keyof E]: E[K] extends string ? string : E[K] };

export interface MessageCatalog<E extends MessageTable> {
  en: E;
  'pt-BR': Translation<E>;
}

/** Declare a component's copy. pt-BR must define every English key. */
export function defineMessages<E extends MessageTable>(
  catalog: MessageCatalog<E>
): MessageCatalog<E> {
  return catalog;
}

type ParamsOf<M> = M extends (params: infer P) => string ? P : MessageParams | undefined;

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

function resolve<E extends MessageTable, K extends keyof E & string>(
  catalog: MessageCatalog<E>,
  locale: Locale,
  key: K,
  params?: unknown
): string {
  const message = (catalog[locale] as MessageTable)[key] ?? catalog.en[key];
  if (typeof message === 'function') return (message as (p: unknown) => string)(params);
  if (typeof message === 'string') return interpolate(message, params as MessageParams);
  return key;
}

/** For stores, simulation text and alerts: resolves in the language active now. */
export function translate<E extends MessageTable, K extends keyof E & string>(
  catalog: MessageCatalog<E>,
  key: K,
  ...params: E[K] extends string ? [MessageParams?] : [ParamsOf<E[K]>]
): string {
  return resolve(catalog, getLocale(), key, params[0]);
}

export type Translator<E extends MessageTable> = <K extends keyof E & string>(
  key: K,
  ...params: E[K] extends string ? [MessageParams?] : [ParamsOf<E[K]>]
) => string;

export function createTranslator<E extends MessageTable>(
  catalog: MessageCatalog<E>,
  locale: Locale
): Translator<E> {
  return (key, ...params) => resolve(catalog, locale, key, params[0]);
}

/** React components: re-renders when the language changes. */
export function useT<E extends MessageTable>(catalog: MessageCatalog<E>): Translator<E> {
  const locale = useLocale();
  return createTranslator(catalog, locale);
}

// ---------------------------------------------------------------------------
// Casing
// ---------------------------------------------------------------------------

/** Sentence case for a label that starts a line: "moinho de rolos" -> "Moinho de rolos". */
export const upperFirst = (text: string): string =>
  text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;

/**
 * CSS `capitalize` title-cases every word whatever the language, so Portuguese
 * reads "Moinho De Rolos". English labels built from raw enum values rely on
 * it; pt-BR copy carries its own sentence case from the catalog instead.
 */
export const capitalizeIn = (locale: Locale): string => (locale === 'en' ? 'capitalize' : '');

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const fixedFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Drop-in for value.toFixed(digits) in copy. English returns exactly what
 * toFixed returned (no grouping), so existing English text is unchanged;
 * pt-BR groups thousands with '.' and uses ',' for decimals.
 */
export function formatFixed(value: number, digits = 0, locale: Locale = getLocale()): string {
  if (locale === 'en' || !Number.isFinite(value)) return value.toFixed(digits);
  const id = `${locale}:${digits}`;
  let formatter = fixedFormatters.get(id);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    fixedFormatters.set(id, formatter);
  }
  return formatter.format(value);
}

/** Drop-in for value.toLocaleString(undefined | 'en-US', options) in copy. */
export function formatGrouped(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: Locale = getLocale()
): string {
  return value.toLocaleString(locale === 'en' ? 'en-US' : locale, options);
}
