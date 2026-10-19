import { describe, expect, it } from 'vitest';
import type { MessageCatalog, MessageTable } from '../index';

/*
 * GLOSSARY.md fixes one Portuguese word for each English term. This test holds
 * the pt-BR catalogs to the entries an English loan word could slip past:
 * every catalog in src is loaded, and each pt-BR message (a string, or the
 * source of a function message) is searched for the English word.
 */
const modules = import.meta.glob<Record<string, unknown>>('../../**/*.messages.ts', {
  eager: true,
});

const isCatalog = (value: unknown): value is MessageCatalog<MessageTable> =>
  typeof value === 'object' &&
  value !== null &&
  'en' in value &&
  'pt-BR' in value &&
  typeof (value as Record<string, unknown>)['pt-BR'] === 'object';

/** Text a pt-BR message can show: the string itself, or a function's string literals. */
const shownText = (message: unknown): string => {
  if (typeof message === 'string') return message;
  if (typeof message !== 'function') return '';
  return (String(message).match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) ?? []).join(' ');
};

const ptMessages = Object.entries(modules).flatMap(([file, exports]) =>
  Object.values(exports)
    .filter(isCatalog)
    .flatMap((catalog) =>
      Object.entries(catalog['pt-BR']).map(([key, message]) => ({
        where: `${file.replace('../../', 'src/')} ${key}`,
        text: shownText(message),
      }))
    )
);

describe('pt-BR catalogs follow the glossary', () => {
  it('loads every catalog', () => {
    expect(ptMessages.length).toBeGreaterThan(1000);
  });

  it.each([['replay', 'reprodução', /\breplays?\b/i]])(
    'translates "%s" as "%s"',
    (_term, _word, english) => {
      const offenders = ptMessages.filter(({ text }) => english.test(text)).map((m) => m.where);
      expect(offenders).toEqual([]);
    }
  );
});
