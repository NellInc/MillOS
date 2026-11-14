/**
 * The Partners tab's initiative log is the AI partner's account of what it did.
 * An answer that retires another pending decision (treating the crop retires the
 * other crop event) must not leave the partner logging, and counting the spend
 * of, an answer to the decision that was taken off the desk.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import { REFERENCE_DRYING_COST } from '../temper';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const eventById = (id: string) => EVENT_DECK.find((event) => event.id === id)!;

function evidence(index: number): ShiftCloseEvidence {
  return {
    report: {
      id: `initiative-report-${index}`,
      grade: 'C',
      endedAtMinute: index * 480,
      metrics: {
        revenue: 0,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 0,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

describe('the AI partner logs only what it did', () => {
  // Plan item 7.7: the falling-number event answers a sprouted year only, so a
  // copy left pending in a wet year is retired, and the dryer treats nothing.
  it('logs one answer, and spends for one, when the other crop event no longer applies', () => {
    const signed = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, mode: 'no_trials' },
      11,
      baseline
    ).state;
    const state: ChronicleState = {
      ...signed,
      shift: SHIFTS_PER_CROP_YEAR,
      lastReportEndedAt: SHIFTS_PER_CROP_YEAR * 480,
      crop: { index: 1, kind: 'wet', treated: false },
      delegation: 1,
      ledger: { ...signed.ledger, fund: { ...signed.ledger.fund, charter: 20000 } },
      pendingEvents: ['evt-wet-intake', 'evt-low-falling-number'].map((eventId) => ({
        instanceId: `pending-${eventId}`,
        eventId,
        appearedShift: SHIFTS_PER_CROP_YEAR,
        lapsesShift: SHIFTS_PER_CROP_YEAR + 2,
      })),
    };
    const after = closeShift(state, evidence(SHIFTS_PER_CROP_YEAR + 1), [
      eventById('evt-wet-intake'),
      eventById('evt-low-falling-number'),
    ]).state;
    expect(after.crop?.treated).toBe(false);
    const answered = after.initiatives.filter((entry) => entry.kind === 'event');
    expect(answered.map((entry) => entry.targetId)).toEqual(['pending-evt-wet-intake']);
    expect(after.eventHistory.map((entry) => entry.eventId)).toEqual(['evt-wet-intake']);
    // The dryer's price, and nothing for a blend the year does not need.
    expect(after.aiSpentThisShift).toBe(Math.round(REFERENCE_DRYING_COST));
  });
});
