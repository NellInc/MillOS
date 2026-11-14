/**
 * A 27-shift chronicle (plan item 4.2, D3): signed with the short length, it
 * runs from signing to the epilogue and meets every trial, every crop year, the
 * scheduled events and the long night, in order, at the same share of the way
 * through as the full one.
 */
import { GOLD_PACE, MEASURED_PLANT, SHORT_GOLD_PACE, trialKg } from '../measuredPlant';
import { describe, expect, it } from 'vitest';
import { CHRONICLE_SHIFTS, SHIFTS_PER_CROP_YEAR } from '../cropYears';
import { DEFAULT_CHARTER } from '../charter';
import { createInitialState, signCharter, type ChronicleState } from '../engine';
import { emptyFunnelLog, stepFunnel } from '../funnel';
import { EVENT_DECK } from '../eventDeck';
import { LONG_NIGHT_EVENT_ID, LONG_NIGHT_SHIFT } from '../longNight';
import { cropYearShifts, onSchedule, SHORT_CHRONICLE_SHIFTS } from '../schedule';
import { medalFor, SHORT_TRIALS, TRIALS } from '../trials';
import { playChronicle, type PinPlayer } from './chronicleRun';

const SHORT = { length: 'short' as const };

/** What a run met: each scheduled event's first appearance, each trial's start, each crop year. */
function observe(seed: number, player: PinPlayer, charter = {}, kg = 3000) {
  const appeared = new Map<string, number>();
  const trialStarts = new Map<string, number>();
  // Year one begins at signing.
  const cropTurns: number[] = [0];
  let lastCrop = 0;
  const { state } = playChronicle(seed, player, charter, kg, (s: ChronicleState) => {
    for (const pending of s.pendingEvents)
      if (!appeared.has(pending.eventId)) appeared.set(pending.eventId, pending.appearedShift);
    for (const progress of s.trials)
      if (progress.startedShift !== null && !trialStarts.has(progress.id))
        trialStarts.set(progress.id, progress.startedShift);
    if (s.crop && s.crop.index !== lastCrop && s.status === 'active') {
      lastCrop = s.crop.index;
      cropTurns.push(s.shift);
    }
  });
  return { state, appeared, trialStarts, cropTurns };
}

const SCHEDULED = EVENT_DECK.filter((event) => event.scheduled);

describe('a 27-shift chronicle', () => {
  it('runs from signing to the epilogue', () => {
    const { state } = observe(3, 'answer', SHORT);
    expect(state.charter?.length).toBe('short');
    expect(state.status).toBe('ended');
    expect(state.shift).toBe(SHORT_CHRONICLE_SHIFTS);
    expect(state.finalScore).not.toBeNull();
    expect(state.notices.some((n) => n.title === 'The chronicle is complete')).toBe(true);
  });

  it('meets every trial, in order, each at its full start on the short clock', () => {
    const { state, trialStarts } = observe(3, 'answer', SHORT);
    expect(state.trials.map((t) => t.phase).every((p) => p === 'passed' || p === 'failed')).toBe(
      true
    );
    const starts = TRIALS.map((trial) => trialStarts.get(trial.id));
    expect(starts).toEqual(TRIALS.map((trial) => onSchedule(SHORT, trial.startShift)));
    // No two trial windows overlap, and the last ends before the epilogue.
    SHORT_TRIALS.forEach((trial, i) => {
      const end = trial.startShift + trial.durationShifts;
      expect(end).toBeLessThan(SHORT_CHRONICLE_SHIFTS);
      if (i + 1 < SHORT_TRIALS.length)
        expect(end).toBeLessThanOrEqual(SHORT_TRIALS[i + 1].startShift);
    });
  });

  // Item 4.1: four-shift windows, gold with one spare and silver with none
  // (no bronze), as the Inspection always was.
  it('keeps gold and silver apart in every short trial', () => {
    for (const trial of SHORT_TRIALS) {
      expect(medalFor(trial, 1)).toBe('gold');
      expect(medalFor(trial, trial.durationShifts - trial.goldSpare)).toBe('gold');
      expect(medalFor(trial, trial.durationShifts)).toBe('silver');
    }
  });

  it('sets each tonnage from the measured pace over the shifts gold allows', () => {
    // 1.2 times the pace in 63 shifts; 1.17 in 27, whose windows have one spare
    // shift (measuredPlant.ts SHORT_GOLD_PACE, review 2, stage B).
    for (const [trials, pace] of [
      [TRIALS, GOLD_PACE],
      [SHORT_TRIALS, SHORT_GOLD_PACE],
    ] as const)
      for (const trial of trials) {
        if (trial.goal.kind !== 'dispatch') continue;
        const goldShifts = trial.durationShifts - trial.goldSpare;
        expect(trial.goal.kg, trial.id).toBe(trialKg(goldShifts, undefined, pace));
        expect(trial.goal.kg / goldShifts).toBeCloseTo(pace * MEASURED_PLANT.shiftKg, -3);
      }
  });

  it('turns all seven crop years, the short one first', () => {
    const { cropTurns, state } = observe(3, 'answer', SHORT);
    expect(cropTurns).toEqual([0, 3, 7, 11, 15, 19, 23]);
    expect(cropTurns).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((k) => onSchedule(SHORT, k * SHIFTS_PER_CROP_YEAR))
    );
    expect([0, 1, 2, 3, 4, 5, 6].map((k) => cropYearShifts(SHORT, k))).toEqual([
      3, 4, 4, 4, 4, 4, 4,
    ]);
    expect(state.governance.returns).toHaveLength(7);
  });

  it('misses no quota on steady dispatch', () => {
    const { state } = observe(11, 'lapse', { ...SHORT, mode: 'no_trials' });
    const filed = state.governance.returns.filter((r) => r.met !== null);
    expect(filed.length).toBeGreaterThan(0);
    // The pin evidence varies by a shift's index mod 4; a four-shift year sees each once.
    expect(filed.filter((r) => r.met === false && r.year > 0)).toEqual([]);
  });

  it('places every scheduled event the full chronicle places, on its short shift', () => {
    for (const seed of [3, 7, 29]) {
      const full = observe(seed, 'answer');
      const short = observe(seed, 'answer', SHORT);
      for (const event of SCHEDULED) {
        if (!full.appeared.has(event.id)) continue;
        expect(short.appeared.get(event.id), `${seed} ${event.id}`).toBe(
          onSchedule(SHORT, event.scheduled!.shift)
        );
      }
    }
  });

  it('brings the long night at shift 23, inside the Great Programme', () => {
    const { appeared, state } = observe(3, 'answer', SHORT);
    expect(onSchedule(SHORT, LONG_NIGHT_SHIFT)).toBe(23);
    expect(appeared.get(LONG_NIGHT_EVENT_ID)).toBe(23);
    expect(state.longNightTelegraphed).toBe(true);
    const great = SHORT_TRIALS.find((t) => t.id === 'great_programme')!;
    expect(23).toBeGreaterThan(great.startShift);
    expect(23).toBeLessThanOrEqual(great.startShift + great.durationShifts);
  });

  it('records the length in the local funnel', () => {
    const unsigned = createInitialState();
    for (const [charter, length] of [
      [SHORT, 'short'],
      [{}, 'full'],
    ] as const) {
      const signed = signCharter(unsigned, { ...DEFAULT_CHARTER, ...charter }, 41, {
        reportId: null,
        qcTestIds: [],
        challengeIds: [],
        orders: [],
      }).state;
      const log = stepFunnel(emptyFunnelLog(), unsigned, signed, 1);
      expect(log.charters[0].length).toBe(length);
    }
  });

  it('leaves the full chronicle on its own clock', () => {
    expect(onSchedule({}, LONG_NIGHT_SHIFT)).toBe(LONG_NIGHT_SHIFT);
    expect(onSchedule(null, CHRONICLE_SHIFTS)).toBe(63);
    const { state } = observe(3, 'answer', { length: 'full' });
    expect(state.charter && 'length' in state.charter).toBe(false);
    expect(state.shift).toBe(63);
  });
});
