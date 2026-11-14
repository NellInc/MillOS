/**
 * The "AI Reflections" setting left Settings with the narration cards (D14),
 * but a save that had it switched off still held `enabled: false`, and the
 * narration hook gates every narration, and the Datalinks unlock it carries,
 * on that flag. Nothing can switch it back on now. The store reads a saved
 * `enabled` as retired: narration always runs, and the flag is no longer
 * written. Working if a save from before the cut, with reflections off, still
 * delivers the welcome narration and its unlock.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_NARRATIONS, useAINarrationStore, type NarrationEntry } from './aiNarrationStore';
import { KNOWLEDGE_ENTRIES, useKnowledgeStore } from './knowledgeStore';
import { useKnowledgeIntegration } from '../hooks/useKnowledgeIntegration';

const KEY = 'millos-autonomous-narration';
const storage = () => useAINarrationStore.persist.getOptions().storage!;

/** A save written while the setting existed, with reflections switched off. */
async function restoreSaveWithReflectionsOff(shown: string[] = []) {
  await storage().setItem(KEY, { state: { shownNarrations: shown, enabled: false }, version: 2 });
  await useAINarrationStore.persist.rehydrate();
}

beforeEach(async () => {
  await storage().removeItem(KEY);
  useAINarrationStore.setState({ shownNarrations: new Set() });
});
afterEach(async () => {
  vi.useRealTimers();
  await storage().removeItem(KEY);
});

describe('a save with the retired AI Reflections setting off', () => {
  it('reads the old switch as retired and stops writing it', async () => {
    await restoreSaveWithReflectionsOff(['library-autonomous-mill']);
    expect(useAINarrationStore.getState().enabled).toBe(true);
    // What the player has seen is kept.
    expect(useAINarrationStore.getState().hasBeenShown('library-autonomous-mill')).toBe(true);
    act(() => useAINarrationStore.getState().markShown('welcome-autonomous-mill'));
    const written = (await storage().getItem(KEY))?.state as Record<string, unknown> | undefined;
    expect(written?.shownNarrations).toContain('welcome-autonomous-mill');
    expect(written).not.toHaveProperty('enabled');
  });

  it('still delivers the welcome narration and the unlock it carries', async () => {
    await restoreSaveWithReflectionsOff();
    vi.useFakeTimers();
    const delivered: NarrationEntry[] = [];
    const hook = renderHook(() => useKnowledgeIntegration((n) => delivered.push(n)));
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(delivered.map((n) => n.id)).toEqual(['welcome-autonomous-mill']);
    expect(useKnowledgeStore.getState().isUnlocked('unified-digital-twin')).toBe(true);
    hook.unmount();
  });

  // Why no player lost a Datalinks entry: every unlock a narration carries is
  // an entry that is always available.
  it('carries only unlocks that Datalinks always has', () => {
    const unlocks = AI_NARRATIONS.flatMap((n) => (n.unlocksEntry ? [n.unlocksEntry] : []));
    expect(unlocks).toEqual(['unified-digital-twin']);
    for (const id of unlocks)
      expect(KNOWLEDGE_ENTRIES.find((entry) => entry.id === id)?.unlockCondition.type).toBe(
        'always'
      );
  });
});
