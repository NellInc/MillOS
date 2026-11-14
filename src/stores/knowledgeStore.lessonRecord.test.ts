/**
 * A finished cutaway lesson is recorded in the knowledge store, once, and the
 * record is saved (plan 7.2 leftover). Before, only the inspection store kept
 * it, for the session.
 */
import { describe, expect, it } from 'vitest';
import { useKnowledgeStore } from './knowledgeStore';
import { useProcessInspectionStore } from './processInspectionStore';

const finish = (id: string) => {
  const store = useProcessInspectionStore.getState();
  store.start(id);
  useProcessInspectionStore.getState().answer('a');
  useProcessInspectionStore.getState().next();
  useProcessInspectionStore.getState().next();
  useProcessInspectionStore.getState().answer('b');
  useProcessInspectionStore.getState().next();
  useProcessInspectionStore.getState().next();
};

describe('the lesson record', () => {
  it('records a finished lesson once and saves it', () => {
    const release = useProcessInspectionStore
      .getState()
      .register({ id: 'rm-101', kind: 'mill', name: 'R.M. 101' });
    finish('rm-101');
    finish('rm-101');
    expect(useProcessInspectionStore.getState().completed).toEqual(['rm-101']);
    expect([...useKnowledgeStore.getState().completedLessons]).toEqual(['rm-101']);
    const saved = useKnowledgeStore.persist.getOptions().partialize!(
      useKnowledgeStore.getState()
    ) as { completedLessons?: string[] };
    expect(saved.completedLessons).toEqual(['rm-101']);
    release();
  });

  it('restores the record from a save, and a save from before it has none', () => {
    const merge = useKnowledgeStore.persist.getOptions().merge!;
    const current = useKnowledgeStore.getState();
    const restored = merge(
      { completedLessons: ['silo-1'], readEntries: [] },
      current
    ) as typeof current;
    expect([...restored.completedLessons]).toEqual(['silo-1']);
    const before = merge({ readEntries: [] }, current) as typeof current;
    expect(before.completedLessons.size).toBe(0);
  });
});
