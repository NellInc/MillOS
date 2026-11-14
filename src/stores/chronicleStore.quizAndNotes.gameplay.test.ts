/**
 * Plan item 7.3 (D19), the store's side: only the first attempt at a quiz
 * question can earn, the round says when an answer earned nothing, and a
 * history note read in Datalinks counts once, as one read in the Chronicle.
 */
import { describe, expect, it, vi } from 'vitest';

async function freshPage(persisted: unknown = null) {
  vi.resetModules();
  const chronicle = await import('./chronicleStore');
  const knowledge = await import('./knowledgeStore');
  const campaign = await import('./operationsCampaignStore');
  const store = chronicle.useChronicleStore;
  const merge = store.persist.getOptions().merge!;
  store.setState(merge(persisted, store.getState()) as ReturnType<typeof store.getState>);
  campaign.useOperationsCampaignStore.getState().resetCampaign();
  const { DEFAULT_CHARTER } = await import('../chronicle/charter');
  return {
    useChronicleStore: store,
    useKnowledgeStore: knowledge.useKnowledgeStore,
    sign: () => store.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 31),
  };
}

const quizKnowHow = (state: { chronicle: { ledger: { knowHow: Record<string, number> } } }) =>
  state.chronicle.ledger.knowHow.quiz ?? 0;
const noteKnowHow = (state: { chronicle: { ledger: { knowHow: Record<string, number> } } }) =>
  state.chronicle.ledger.knowHow.notes ?? 0;

describe('quiz credit in the store', () => {
  it('a wrong first pick spends the question: a right answer later earns nothing and says so', async () => {
    const page = await freshPage();
    page.sign();
    const store = page.useChronicleStore;
    const questionId = 'q-first-grain-1';
    store.getState().startQuiz([questionId]);
    store.getState().pickQuizAnswer(0, false);
    expect(store.getState().quiz?.earned).toBe(false);
    store.getState().nextQuizQuestion();
    // A second round deals the same question; this time the pick is right.
    store.getState().startQuiz([questionId]);
    store.getState().pickQuizAnswer(1, true);
    expect(quizKnowHow(store.getState())).toBe(0);
    expect(store.getState().quiz?.earned).toBe(false);
    expect(store.getState().quiz?.repeat).toBe(true);
  });

  it('a right first pick earns once, and the round says it earned', async () => {
    const page = await freshPage();
    page.sign();
    const store = page.useChronicleStore;
    store.getState().startQuiz(['q-first-grain-2']);
    store.getState().pickQuizAnswer(3, true);
    expect(store.getState().quiz?.earned).toBe(true);
    expect(store.getState().quiz?.repeat).toBe(false);
    expect(quizKnowHow(store.getState())).toBe(1);
  });

  it('first attempts survive abandoning and re-signing a charter', async () => {
    const page = await freshPage();
    page.sign();
    const store = page.useChronicleStore;
    store.getState().startQuiz(['q-first-grain-1']);
    store.getState().pickQuizAnswer(0, false);
    store.getState().abandon();
    page.sign();
    store.getState().startQuiz(['q-first-grain-1']);
    store.getState().pickQuizAnswer(1, true);
    expect(quizKnowHow(store.getState())).toBe(0);
  });

  it('restores a save from before attempts were kept: its answered questions count as attempted', async () => {
    const page = await freshPage();
    page.sign();
    const saved = JSON.parse(
      JSON.stringify({ chronicle: page.useChronicleStore.getState().chronicle })
    );
    delete saved.chronicle.quizAttempted;
    saved.chronicle.quizAnswered = ['q-first-grain-1'];
    const reloaded = await freshPage(saved);
    const store = reloaded.useChronicleStore;
    expect(store.getState().chronicle.status).toBe('active');
    store.getState().startQuiz(['q-first-grain-1']);
    store.getState().pickQuizAnswer(1, true);
    expect(quizKnowHow(store.getState())).toBe(0);
    // A malformed list is dropped, not trusted.
    const malformed = JSON.parse(JSON.stringify(saved));
    malformed.chronicle.quizAttempted = ['q-first-grain-2', 7, null];
    const again = await freshPage(malformed);
    expect(again.useChronicleStore.getState().chronicle.quizAttempted).toEqual(['q-first-grain-2']);
  });
});

describe('a history note read in Datalinks', () => {
  it('counts once, as reading it in the Chronicle does', async () => {
    const page = await freshPage();
    page.sign();
    const store = page.useChronicleStore;
    expect(store.getState().chronicle.unlockedNotes).toContain('history-first-grain');
    const before = noteKnowHow(store.getState());
    page.useKnowledgeStore.getState().markAsRead('history-first-grain');
    expect(store.getState().chronicle.readNotes).toContain('history-first-grain');
    expect(noteKnowHow(store.getState())).toBe(before + 2);
    store.getState().readNote('history-first-grain');
    page.useKnowledgeStore.getState().markAsRead('history-first-grain');
    expect(noteKnowHow(store.getState())).toBe(before + 2);
  });

  it('read in Datalinks before the Chronicle unlocked it, is read when the Chronicle unlocks it', async () => {
    const page = await freshPage();
    const knowledge = page.useKnowledgeStore.getState();
    knowledge.unlockEntry('history-first-grain');
    knowledge.markAsRead('history-first-grain');
    page.sign();
    const state = page.useChronicleStore.getState();
    expect(state.chronicle.unlockedNotes).toContain('history-first-grain');
    expect(state.chronicle.readNotes).toContain('history-first-grain');
    expect(noteKnowHow(state)).toBe(2);
    // ...and reading it again in the Chronicle earns nothing more.
    page.useChronicleStore.getState().readNote('history-first-grain');
    expect(noteKnowHow(page.useChronicleStore.getState())).toBe(2);
  });
});
