import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesTab } from './NotesTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState } from '../../chronicle/engine';
import { HISTORY_NOTES } from '../../chronicle/history';
import { getQuizQuestions } from '../../chronicle/quiz';

// The round counter lives only in the session; the chronicle, with the answers
// the player has already earned, is saved. A reload must not deal the first
// round the player already sat again, question for question.
describe('Quiz rounds across a reload', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null, quizRound: 0 });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: { ...s.chronicle, unlockedNotes: HISTORY_NOTES.slice(0, 8).map((n) => n.id) },
      }))
    );
  });
  afterEach(() => cleanup());

  it('deals a fresh order after a reload once the player has made progress', () => {
    const first = render(<NotesTab state={useChronicleStore.getState().chronicle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    const round1 = useChronicleStore.getState().quiz!.questionIds;
    // Answer the first question correctly: the chronicle records it and is saved.
    const question = getQuizQuestions().find((q) => q.id === round1[0])!;
    fireEvent.click(screen.getByRole('button', { name: question.options[question.correctIndex] }));
    expect(useChronicleStore.getState().chronicle.quizAnswered).toContain(round1[0]);
    first.unmount();
    // Reload: the saved chronicle survives; the session's round and quiz do not.
    act(() => useChronicleStore.setState({ quiz: null, quizRound: 0 }));
    render(<NotesTab state={useChronicleStore.getState().chronicle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    expect(useChronicleStore.getState().quiz!.questionIds).not.toEqual(round1);
  });
});
