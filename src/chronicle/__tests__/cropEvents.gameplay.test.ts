/**
 * Crop-year events the crop has overtaken. Once a year's grain is treated (by
 * an event, by hand or by an installed plan) or the year has passed, a dryer,
 * a blend or a "mill it as it comes" answer would do nothing true: it must not
 * be offered, charged for or lapsed into.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  chooseEventOption,
  closeShift,
  createInitialState,
  fundOf,
  signCharter,
  treatCropDirectly,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { EVENT_DECK } from '../eventDeck';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import { REFERENCE_DRYING_COST } from '../temper';
import type { CropKind, ImprovementProgress } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function evidence(index: number): ShiftCloseEvidence {
  return {
    report: {
      id: `crop-event-report-${index}`,
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

const eventById = (id: string) => EVENT_DECK.find((event) => event.id === id)!;

/** The first shift of the second crop year, with the given grain and a full fund. */
function inYear(kind: CropKind, treated: boolean, seed = 11): ChronicleState {
  const state = signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, mode: 'no_trials' },
    seed,
    baseline
  ).state;
  return {
    ...state,
    shift: SHIFTS_PER_CROP_YEAR,
    lastReportEndedAt: SHIFTS_PER_CROP_YEAR * 480,
    crop: { index: 1, kind, treated },
    ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 2000 } },
  };
}

function pend(state: ChronicleState, ...eventIds: string[]): ChronicleState {
  return {
    ...state,
    pendingEvents: [
      ...state.pendingEvents,
      ...eventIds.map((eventId) => ({
        instanceId: `pending-${eventId}`,
        eventId,
        appearedShift: state.shift,
        lapsesShift: state.shift + 2,
      })),
    ],
  };
}

/** Closes within the crop year with only these events in the deck; the ids drawn. */
function drawn(state: ChronicleState, deck: string[]): string[] {
  const events = deck.map(eventById);
  let next = state;
  const seen: string[] = [];
  for (let i = 1; i < SHIFTS_PER_CROP_YEAR; i++) {
    next = closeShift(next, evidence(SHIFTS_PER_CROP_YEAR + i), events).state;
    for (const pending of next.pendingEvents)
      if (!seen.includes(pending.instanceId)) seen.push(pending.instanceId);
    // Answer at once, so the same event may be drawn again later in the year.
    next = { ...next, pendingEvents: [] };
  }
  return seen;
}

const installed = (id: string): ImprovementProgress => ({
  id,
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 0,
  paidFund: 0,
  effectScale: 1,
  initiatedBy: 'player',
});

describe('crop-year events the crop has overtaken', () => {
  it('stops drawing the dryer once the wet year is treated', () => {
    // Control: untreated, the wet-intake event is drawn in this year.
    expect(drawn(inYear('wet', false), ['evt-wet-intake']).length).toBeGreaterThan(0);
    expect(drawn(inYear('wet', true), ['evt-wet-intake'])).toEqual([]);
  });

  // Plan item 7.7: a wet year is dried on the temper card a shift at a time,
  // so its event's answers treat nothing; the dryer makes that drying free.
  it('treats nothing with a wet-year answer: the hired dryer makes the card’s drying free', () => {
    const state = pend(inYear('wet', false), 'evt-wet-intake');
    const after = chooseEventOption(
      state,
      'pending-evt-wet-intake',
      'dryer',
      'player',
      EVENT_DECK
    ).state;
    expect(after.crop?.treated).toBe(false);
    expect(after.modifiers.find((m) => m.label === 'Mobile dryer')).toMatchObject({
      dryingEnergy: 0,
    });
    // One shift of drying for three (review 2, finding 2).
    expect(fundOf(state) - fundOf(after)).toBe(Math.round(REFERENCE_DRYING_COST));
    expect(after.pendingEvents).toEqual([]);
  });

  it('retires a falling-number decision left from a wet year, which it no longer answers', () => {
    const state = pend(inYear('wet', false), 'evt-low-falling-number');
    const after = closeShift(state, evidence(SHIFTS_PER_CROP_YEAR + 1), [
      eventById('evt-low-falling-number'),
    ]).state;
    expect(after.pendingEvents.map((p) => p.eventId)).toEqual([]);
    expect(after.crop?.treated).toBe(false);
    // Nothing paid for a blend: the close's own upkeep is all that left the fund.
    expect(after.ledger.fund.events).toBe(state.ledger.fund.events);
  });

  it('retires a wet-year decision when the year turns, rather than lapsing it into damp stock', () => {
    const state = {
      ...pend(inYear('wet', false), 'evt-wet-intake'),
      shift: 2 * SHIFTS_PER_CROP_YEAR - 1,
      lastReportEndedAt: (2 * SHIFTS_PER_CROP_YEAR - 1) * 480,
    };
    const after = closeShift(state, evidence(2 * SHIFTS_PER_CROP_YEAR), [
      eventById('evt-wet-intake'),
    ]).state;
    expect(after.crop?.kind).not.toBe('wet');
    expect(after.pendingEvents).toEqual([]);
    expect(after.modifiers.some((m) => m.label === 'Damp stock')).toBe(false);
  });

  it('takes a crop decision off the desk when the grain is blended from the Overview', () => {
    const state = pend(inYear('sprouted', false), 'evt-low-falling-number');
    const after = treatCropDirectly(state, EVENT_DECK).state;
    expect(after.crop?.treated).toBe(true);
    // At once, as when an event treats it, not as a stale notice at the next close.
    expect(after.pendingEvents).toEqual([]);
    expect(after.notices.at(-1)?.title).toMatch(/no longer needed/);
    const closed = closeShift(after, evidence(SHIFTS_PER_CROP_YEAR + 1), [
      eventById('evt-low-falling-number'),
    ]).state;
    expect(closed.notices.filter((n) => /no longer needed/.test(n.title))).toHaveLength(1);
  });

  it('takes no fund to blend a sprouted year the blending bins already relieve', () => {
    const state = { ...inYear('sprouted', false), improvements: [installed('blending-bins')] };
    const after = treatCropDirectly(state).state;
    expect(fundOf(after)).toBe(fundOf(state));
  });
});
