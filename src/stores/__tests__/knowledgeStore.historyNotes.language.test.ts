import { afterEach, describe, expect, it } from 'vitest';
import { HISTORY_ENTRY_UNLOCK, KNOWLEDGE_ENTRIES } from '../knowledgeStore';
import { setLocale } from '../../i18n';

// The history notes' own text is Chronicle copy (English only so far), but
// "Where to see it" names a workspace in an already translated surface. It
// must read as the dock and sidebar name it: "Crônica do moinho" in pt-BR.
describe('Chronicle history notes in Datalinks', () => {
  afterEach(() => setLocale('en'));

  it('point to the Chronicle workspace by its name in the active language', () => {
    const note = KNOWLEDGE_ENTRIES.find((entry) => entry.unlockCondition === HISTORY_ENTRY_UNLOCK);
    expect(note).toBeDefined();
    setLocale('en');
    expect(note?.seeInAction).toEqual(['Mill Chronicle']);
    setLocale('pt-BR');
    expect(note?.seeInAction).toEqual(['Crônica do moinho']);
  });
});
