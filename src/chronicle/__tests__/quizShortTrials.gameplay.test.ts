/**
 * Fix-up a (plan item 4c): the quiz asks why a failed trial failed, reading
 * the trial's goal. It read the full chronicle's goals, so a short chronicle's
 * trial that met its own tonnage and failed on energy was quizzed as failed on
 * tonnage. It reads the charter's own trials.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { createInitialState, signCharter, type ChronicleState } from '../engine';
import { recordQuizQuestions } from '../quiz';
import { quizRecordMessages } from '../quiz.messages';
import { trialsFor } from '../schedule';
import { emptyTrialProgress, TRIALS } from '../trials';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

describe('the quiz reads the charter’s own trials', () => {
  it('a short Grid Winter that met its tonnage and failed on energy is asked as energy', () => {
    const signed: ChronicleState = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, length: 'short' },
      77,
      baseline
    ).state;
    const short = trialsFor(signed.charter).find((t) => t.id === 'grid_winter')!;
    const full = TRIALS.find((t) => t.id === 'grid_winter')!;
    if (short.goal.kind !== 'dispatch' || full.goal.kind !== 'dispatch') throw new Error('goal');
    const kg = short.goal.kg + 100;
    // The case only says something while the short goal is below the full one.
    expect(kg).toBeLessThan(full.goal.kg);
    const cap = short.goal.maxEnergyPerKg!;
    const state: ChronicleState = {
      ...signed,
      shift: short.startShift + short.durationShifts,
      trials: [
        {
          ...emptyTrialProgress('grid_winter'),
          phase: 'failed',
          startedShift: short.startShift,
          shiftsUsed: short.durationShifts,
          dispatchedKg: kg,
          energyCost: kg * (cap + 0.01),
          failureReason: 'Energy broke it.',
        },
      ],
    };
    const question = recordQuizQuestions(state).find((q) => q.id.includes(':trial:grid_winter'));
    expect(question).toBeDefined();
    expect(question!.options[question!.correctIndex]).toBe(quizRecordMessages.en.trialEnergy);
    expect(question!.options).toContain(quizRecordMessages.en.trialTonnage);
  });
});
