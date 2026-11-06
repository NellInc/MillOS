/**
 * Pass 20, chronicle lane: defects a player meets.
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
import { localizedDescribeEffect } from '../describe';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 20) =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass20-report-${minute}`,
      grade: null,
      endedAtMinute: minute,
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

describe('a decision left to lapse pays what its default button says', () => {
  it.each([
    ['evt-millwrights-workshop', 'notes'],
    ['evt-college-test-milling', 'lab'],
  ])('%s lapsing to %s credits its full know-how', (eventId, choiceId) => {
    const event = EVENT_DECK.find((candidate) => candidate.id === eventId)!;
    const fallback = event.choices.find((choice) => choice.id === event.defaultChoiceId)!;
    expect(fallback.id).toBe(choiceId);
    // The button the player saw promised this much.
    expect(localizedDescribeEffect(fallback.effect)).toContain(`+${fallback.effect.knowHow}`);
    const start = signed();
    const state: ChronicleState = {
      ...start,
      delegation: 0,
      pendingEvents: [
        {
          instanceId: 'event-pass20',
          eventId,
          appearedShift: start.shift,
          lapsesShift: start.shift + 1,
        },
      ],
    };
    // The deck holds only this event, so nothing else moves know-how from events.
    const closed = closeShift(state, evidence(), [event]).state;
    expect(closed.pendingEvents.some((p) => p.instanceId === 'event-pass20')).toBe(false);
    expect(closed.eventHistory.at(-1)).toMatchObject({ eventId, choiceId, actor: 'chronicle' });
    expect(closed.ledger.knowHow.events).toBe(fallback.effect.knowHow);
  });
});
