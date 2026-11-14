/**
 * Plan item 7.3 (D19): the quiz asks about the player's own record where it
 * has something to ask, falls back to the history notes when it is thin, deals
 * each question's options in a seeded order, and pays only a first attempt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import {
  answerQuizQuestion,
  createInitialState,
  knowHowOf,
  signCharter,
  type ChronicleState,
} from '../engine';
import { EVENT_DECK, getEventDeck } from '../eventDeck';
import {
  dealQuizRound,
  getQuizQuestions,
  presentQuizQuestion,
  quizPool,
  recordQuizQuestions,
} from '../quiz';
import { emptyTrialProgress, getTrials, TRIALS } from '../trials';
import { getImprovements } from '../plans';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const SEED = 4242;
const signed = (): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, SEED, baseline).state;

/** An authored event with at least two plain choices whose results differ. */
const EVENT = EVENT_DECK.find((event) => {
  const plain = event.choices.filter(
    (choice) => !choice.variants?.length && !choice.effect.resolveChain?.length && !choice.delegates
  );
  return plain.length >= 2 && new Set(plain.map((c) => c.effect.result)).size === plain.length;
})!;
const CHOICE = EVENT.choices.find((c) => !c.variants?.length && !c.effect.resolveChain?.length)!;
const TRIAL = TRIALS.find(
  (trial) => trial.goal.kind === 'dispatch' && trial.goal.noQualityFailure
)!;

/** A record with one ruling, one installed plan and one failed trial. */
function withRecord(): ChronicleState {
  const state = signed();
  return {
    ...state,
    shift: 9,
    eventHistory: [
      { eventId: EVENT.id, shift: 4, choiceId: CHOICE.id, actor: 'player' },
      // The partner's rulings and lapses are not the player's choices.
      { eventId: EVENT.id, shift: 6, choiceId: CHOICE.id, actor: 'ai-partner' },
    ],
    improvements: [
      {
        id: 'drainage-works',
        phase: 'installed',
        contractorId: null,
        startedShift: 2,
        completesShift: 4,
        paidFund: 0,
        effectScale: 1,
        initiatedBy: 'player',
      },
    ],
    trials: [
      {
        ...emptyTrialProgress(TRIAL.id),
        phase: 'failed',
        startedShift: 5,
        shiftsUsed: 2,
        dispatchedKg: 900,
        qualityFailureKg: 40,
        failureReason: '40 kg failed its recipe quality threshold.',
      },
    ],
  };
}

afterEach(() => setLocale('en'));

describe('questions from the record', () => {
  it('builds three kinds of question from a record: a ruling, a plan and a failed trial', () => {
    const questions = recordQuizQuestions(withRecord());
    const kinds = questions.map((q) => q.id.split(':')[2]);
    expect(kinds.sort()).toEqual(['event', 'plan', 'trial']);

    const event = questions.find((q) => q.id.includes(':event:'))!;
    expect(event.id).toBe(`r:${SEED}:event:${EVENT.id}:4`);
    expect(event.prompt).toContain(EVENT.title);
    expect(event.prompt).toContain(CHOICE.label);
    expect(event.options[event.correctIndex]).toBe(CHOICE.effect.result);
    expect(event.options.length).toBeGreaterThanOrEqual(2);

    const plan = questions.find((q) => q.id.includes(':plan:'))!;
    // Quoted, as the ruling and trial prompts quote theirs: bare, it read
    // "You installed Wind turbine." in a capture.
    expect(plan.prompt).toContain('You installed “Yard drainage works”.');
    // Drainage takes 25 points off the storm forecast (plans.ts forecastRelief).
    expect(plan.options[plan.correctIndex]).toBe('Storm front -25 points');
    expect(new Set(plan.options).size).toBe(plan.options.length);
    expect(plan.options).toHaveLength(4);

    const trial = questions.find((q) => q.id.includes(':trial:'))!;
    expect(trial.prompt).toContain(TRIAL.title);
    expect(trial.options[trial.correctIndex]).toMatch(/quality/i);
  });

  it('asks nothing of a thin record, and the round falls back to the history notes', () => {
    const state = signed();
    expect(recordQuizQuestions(state)).toEqual([]);
    const round = dealQuizRound(state, 0);
    expect(round.length).toBeGreaterThan(0);
    expect(round.every((id) => id.startsWith('q-'))).toBe(true);
  });

  it('deals record questions first when the record has them', () => {
    const state = withRecord();
    const round = dealQuizRound(state, 0);
    expect(round.slice(0, 3).every((id) => id.startsWith('r:'))).toBe(true);
    expect(round.length).toBeLessThanOrEqual(10);
    // Every dealt id resolves in the pool the Notes tab reads.
    const pool = new Set(quizPool(state).map((q) => q.id));
    expect(round.every((id) => pool.has(id))).toBe(true);
  });

  it('reads in Portuguese at display, from the same saved record', () => {
    const english = recordQuizQuestions(withRecord());
    setLocale('pt-BR');
    const portuguese = recordQuizQuestions(withRecord());
    expect(portuguese.map((q) => q.id)).toEqual(english.map((q) => q.id));
    const event = portuguese.find((q) => q.id.includes(':event:'))!;
    const localized = getEventDeck().find((e) => e.id === EVENT.id)!;
    expect(event.prompt).toContain(localized.title);
    expect(event.options[event.correctIndex]).toBe(
      localized.choices.find((c) => c.id === CHOICE.id)!.effect.result
    );
    const trial = portuguese.find((q) => q.id.includes(':trial:'))!;
    expect(trial.prompt).toContain(getTrials().find((t) => t.id === TRIAL.id)!.title);
    expect(trial.prompt).not.toBe(english.find((q) => q.id.includes(':trial:'))!.prompt);
    const plan = portuguese.find((q) => q.id.includes(':plan:'))!;
    expect(plan.prompt).toContain(getImprovements().find((p) => p.id === 'drainage-works')!.label);
  });
});

describe('seeded option order', () => {
  const questions = getQuizQuestions();

  it('is stable for a seed and keeps the right answer right', () => {
    for (const question of questions) {
      const a = presentQuizQuestion(question, 77);
      const b = presentQuizQuestion(question, 77);
      expect(a.options).toEqual(b.options);
      expect(a.options[a.correctIndex]).toBe(question.options[question.correctIndex]);
      expect([...a.options].sort()).toEqual([...question.options].sort());
    }
  });

  it('differs across seeds, and the answer is not always in its authored place', () => {
    const differing = questions.filter(
      (q) =>
        presentQuizQuestion(q, 11).options.join('|') !==
        presentQuizQuestion(q, 12).options.join('|')
    );
    expect(differing.length).toBeGreaterThan(questions.length / 2);
    const moved = questions.filter(
      (q) => presentQuizQuestion(q, 11).correctIndex !== q.correctIndex
    );
    expect(moved.length).toBeGreaterThan(questions.length / 2);
  });
});

describe('only the first attempt earns', () => {
  it('a wrong pick spends the question, so a later right answer earns nothing', () => {
    const state = signed();
    const start = knowHowOf(state);
    const wrong = answerQuizQuestion(state, 'q-first-grain-1', false);
    expect(wrong.quizAttempted).toContain('q-first-grain-1');
    const right = answerQuizQuestion(wrong, 'q-first-grain-1', true);
    expect(knowHowOf(right)).toBe(start);
    expect(right.quizAnswered).not.toContain('q-first-grain-1');
  });

  it('a right first pick earns once', () => {
    const state = signed();
    const start = knowHowOf(state);
    const right = answerQuizQuestion(state, 'q-first-grain-2', true);
    expect(knowHowOf(right)).toBe(start + 1);
    expect(knowHowOf(answerQuizQuestion(right, 'q-first-grain-2', true))).toBe(start + 1);
  });
});
