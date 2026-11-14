/**
 * The post-mill note opens two ways: by installing the Chronicle's wind
 * turbine, or by finishing the farm windmill's cutaway in first person, with
 * nothing installed (knowledgeStore.ts, plan 6.5). Its text and its unlock line
 * must be true on both routes, in both languages.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { getHistoryNote } from '../history';
import { getKnowledgeEntries } from '../../stores/knowledgeStore';

afterEach(() => setLocale('en'));

describe('the post-mill note on both of its routes', () => {
  for (const locale of ['en', 'pt-BR'] as const)
    it(`${locale}: claims no installation, and names both ways it opens`, () => {
      setLocale(locale);
      const note = getHistoryNote('history-windmills')!;
      expect(note.article).not.toMatch(/installed|instalou|turbina eólica|wind turbine/i);
      const entry = getKnowledgeEntries().find((e) => e.id === 'history-windmills')!;
      const unlock = entry.unlockCondition.description;
      expect(unlock).toMatch(locale === 'en' ? /windmill/i : /moinho de vento/i);
      expect(unlock).toMatch(locale === 'en' ? /wind turbine/i : /turbina eólica/i);
    });
});
