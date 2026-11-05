import { afterEach, describe, expect, it } from 'vitest';
import { HISTORY_ENTRY_UNLOCK, KNOWLEDGE_ENTRIES, useKnowledgeStore } from '../knowledgeStore';

// A Chronicle event unlocks a milling-history note, and Datalinks marks it NEW
// until the player opens it. The badge was kept in memory only, so a reload
// before the player opened Datalinks took every NEW badge away, and nothing
// said which notes had arrived. Working if an unlocked note the player has not
// read is still NEW after a reload, and one they read is not.
const historyIds = KNOWLEDGE_ENTRIES.filter(
  (entry) => entry.unlockCondition === HISTORY_ENTRY_UNLOCK
).map((entry) => entry.id);

const reloadWith = async (unlockedEntries: string[], readEntries: string[]) => {
  localStorage.setItem(
    'millos-autonomous-datalinks',
    JSON.stringify({ state: { unlockedEntries, readEntries }, version: 2 })
  );
  await useKnowledgeStore.persist.rehydrate();
};

describe('Datalinks NEW badges across a reload', () => {
  afterEach(() => localStorage.removeItem('millos-autonomous-datalinks'));

  it('keeps an unlocked, unread history note NEW and clears a read one', async () => {
    const [unread, read] = historyIds;
    expect(unread).toBeDefined();
    expect(read).toBeDefined();
    useKnowledgeStore.getState().unlockEntry(unread);
    useKnowledgeStore.getState().unlockEntry(read);
    useKnowledgeStore.getState().markAsRead(read);
    useKnowledgeStore.getState().clearNewBadge(read);
    expect(useKnowledgeStore.getState().isNew(unread)).toBe(true);

    await reloadWith([unread, read], [read]);

    expect(useKnowledgeStore.getState().isUnlocked(unread)).toBe(true);
    expect(useKnowledgeStore.getState().isNew(unread)).toBe(true);
    expect(useKnowledgeStore.getState().isNew(read)).toBe(false);
  });

  it('never marks an always-available entry NEW after a reload', async () => {
    await reloadWith([], []);
    const always = KNOWLEDGE_ENTRIES.filter((entry) => entry.unlockCondition.type === 'always');
    expect(always.length).toBeGreaterThan(0);
    for (const entry of always) expect(useKnowledgeStore.getState().isNew(entry.id)).toBe(false);
  });
});
