/**
 * Datalinks explains milling (report 10 F1, P3): six entries on how flour is
 * made, in both languages, each with the sources it was written from. The
 * shader-cache note is a developer reference, not part of the player guide.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { KNOWLEDGE_ENTRIES, getKnowledgeEntries } from '../knowledgeStore';
import { MILLING_ENTRY_SOURCES, MILLING_SOURCES } from '../millingSources';

const MILLING_IDS = [
  'milling-cleaning-tempering',
  'milling-break-reduction',
  'milling-purifiers',
  'milling-extraction-ash',
  'milling-baker-needs',
  'milling-dust-explosions',
];

afterEach(() => setLocale('en'));

describe('milling in Datalinks', () => {
  it('offers six milling entries in the player guide, sourced, in both languages', () => {
    const player = getKnowledgeEntries();
    for (const id of MILLING_IDS) {
      const entry = player.find((item) => item.id === id);
      expect(entry, id).toBeDefined();
      expect(entry!.category).toBe('milling');
      expect(entry!.unlockCondition.type).toBe('always');
      const sources = MILLING_ENTRY_SOURCES[id];
      expect(sources.length, id).toBeGreaterThan(0);
      for (const source of sources) {
        expect(MILLING_SOURCES[source.id].url).toMatch(/^https:\/\//);
        expect(source.supports.length).toBeGreaterThan(0);
      }
      setLocale('en');
      const english = { title: entry!.title, article: entry!.article, brief: entry!.brief };
      setLocale('pt-BR');
      expect(entry!.title).not.toBe(english.title);
      expect(entry!.article).not.toBe(english.article);
      expect(entry!.brief).not.toBe(english.brief);
      // Every placeholder is filled in both languages.
      expect(entry!.article).not.toMatch(/\{\w+\}/);
      setLocale('en');
      expect(entry!.article).not.toMatch(/\{\w+\}/);
    }
  });

  it('writes decimals the way each language reads them', () => {
    const entry = KNOWLEDGE_ENTRIES.find((item) => item.id === 'milling-extraction-ash')!;
    expect(entry.article).toContain('0.52%');
    setLocale('pt-BR');
    expect(entry.article).toContain('0,52%');
  });

  it('keeps the shader-cache note in the developer reference', () => {
    expect(getKnowledgeEntries().some((entry) => entry.id === 'environment-cycle')).toBe(false);
    expect(getKnowledgeEntries('developer').map((entry) => entry.id)).toContain(
      'environment-cycle'
    );
  });
});
