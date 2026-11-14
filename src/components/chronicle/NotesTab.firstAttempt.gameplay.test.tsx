import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesTab } from './NotesTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState } from '../../chronicle/engine';
import { HISTORY_NOTES } from '../../chronicle/history';
import { getQuizQuestions, presentQuizQuestion } from '../../chronicle/quiz';

// D19: only the first attempt at a question earns, and the quiz says so when a
// right answer earns nothing; the options are dealt in the charter's order.
describe('Quiz first attempts in the Notes tab', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null, quizRound: 0 });
    act(() => useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 9));
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: { ...s.chronicle, unlockedNotes: HISTORY_NOTES.slice(0, 4).map((n) => n.id) },
      }))
    );
  });
  afterEach(() => cleanup());

  it('a right answer after a wrong first pick earns nothing and says so', () => {
    const view = render(<NotesTab state={useChronicleStore.getState().chronicle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    const id = useChronicleStore.getState().quiz!.questionIds[0];
    const question = getQuizQuestions().find((q) => q.id === id)!;
    const right = question.options[question.correctIndex];
    const wrong = question.options.find((option) => option !== right)!;
    // The buttons are in the charter's seeded order.
    const shown = presentQuizQuestion(question, 9).options;
    const buttons = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => shown.includes(text ?? ''));
    expect(buttons).toEqual(shown);
    fireEvent.click(screen.getByRole('button', { name: wrong }));
    expect(screen.queryByTestId('quiz-credit')).toBeNull();
    view.unmount();

    // The same question again: the right answer now earns nothing.
    act(() => useChronicleStore.getState().startQuiz([id]));
    render(<NotesTab state={useChronicleStore.getState().chronicle} />);
    const before = useChronicleStore.getState().chronicle.ledger.knowHow.quiz;
    fireEvent.click(screen.getByRole('button', { name: right }));
    expect(useChronicleStore.getState().chronicle.ledger.knowHow.quiz).toBe(before);
    expect(screen.getByTestId('quiz-credit').textContent).toBe('Answered before: earns nothing');
  });

  it('a right first answer says what it earned', () => {
    render(<NotesTab state={useChronicleStore.getState().chronicle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the quiz' }));
    const id = useChronicleStore.getState().quiz!.questionIds[0];
    const question = getQuizQuestions().find((q) => q.id === id)!;
    fireEvent.click(screen.getByRole('button', { name: question.options[question.correctIndex] }));
    expect(screen.getByTestId('quiz-credit').textContent).toBe('+1 know-how');
  });
});
