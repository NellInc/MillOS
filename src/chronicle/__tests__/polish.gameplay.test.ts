import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  acceptTraining,
  closeShift,
  createInitialState,
  currentForecastChance,
  FIRE_HAND_CLEAN_MINUTES,
  FIRE_SUPPRESSION_COST,
  fundOf,
  setAusterity,
  setDelegation,
  signCharter,
  tickMinute,
  treatCropDirectly,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { epilogue } from '../epilogue';
import { CHRONICLE_SHIFTS, CROP_YEARS_PER_CHRONICLE } from '../cropYears';
import type { Charter, ForecastState, ImprovementProgress } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(overrides: Partial<Omit<Charter, 'seed'>> = {}, seed = 11): ChronicleState {
  return signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...overrides }, seed, baseline)
    .state;
}

function withFund(state: ChronicleState, fund: number): ChronicleState {
  return {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: fund - fundOf(state) + state.ledger.fund.charter },
    },
  };
}

function evidence(index: number): ShiftCloseEvidence {
  return {
    report: {
      id: `polish-report-${index}`,
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

function ended(): ChronicleState {
  return { ...signed(), status: 'ended', shift: CHRONICLE_SHIFTS, trainingOffered: true };
}

describe('the AI partner keeps to its grant', () => {
  const burning = (fund: number): ChronicleState => ({
    ...withFund(signed(), fund),
    delegation: 2,
    fire: { active: true, suppressing: false, resolveAtMinute: null },
  });

  // Suppression is exempt from the 15% share (delegation level 2); only a fund
  // that cannot cover it sends the duct to be cleaned by hand.
  it('cleans a duct fire by hand when the fund cannot cover suppression', () => {
    const state = burning(FIRE_SUPPRESSION_COST - 1);
    const next = tickMinute(state, 1000).state;
    expect(next.fire.suppressing).toBe(true);
    expect(next.ledger.fund.suppression).toBe(0);
    expect(next.fire.resolveAtMinute).toBe(1000 + FIRE_HAND_CLEAN_MINUTES);
    const entry = next.initiatives.at(-1);
    expect(entry?.summary).not.toMatch(/Funded/);
    expect(entry?.reason).not.toMatch(/fund could cover/);
  });

  it('pays for suppression within its budget and counts the spend', () => {
    const state = burning(1000);
    const next = tickMinute(state, 1000).state;
    expect(next.ledger.fund.suppression).toBe(-FIRE_SUPPRESSION_COST);
    expect(next.aiSpentThisShift).toBe(FIRE_SUPPRESSION_COST);
  });

  it('quotes the chance it acted on, not the chance the forecast was issued at', () => {
    const forecast: ForecastState = {
      id: 'forecast-polish',
      kind: 'severe_rain',
      issuedShift: 0,
      dueShift: 5,
      chance: 0.3,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending',
    };
    const state: ChronicleState = {
      ...withFund(signed({ mode: 'sandbox' }), 2000),
      delegation: 2,
      forecasts: [forecast],
      lastReportEndedAt: 0,
    };
    const live = Math.round(currentForecastChance(state, forecast) * 100);
    expect(live).toBeGreaterThanOrEqual(40);
    const next = closeShift(state, evidence(1), []).state;
    const entry = next.initiatives.find((i) => i.kind === 'mitigation');
    expect(entry?.reason).toContain(`stood at ${live}%`);
  });
});

describe('an ended chronicle takes no more policy', () => {
  it('does not switch austerity, training or delegation, so no notice claims an effect', () => {
    const state = ended();
    expect(setAusterity(state, true)).toBe(state);
    expect(acceptTraining(state)).toBe(state);
    expect(setDelegation(state, 2).state).toBe(state);
  });

  it('settles an install the closing shift could not commission', () => {
    const state = signed({ mode: 'sandbox' });
    const install: ImprovementProgress = {
      id: 'members-library',
      phase: 'installing',
      contractorId: null,
      startedShift: CHRONICLE_SHIFTS - 3,
      completesShift: CHRONICLE_SHIFTS + 1,
      paidFund: 70,
      effectScale: 1,
      initiatedBy: 'player',
    };
    const last: ChronicleState = {
      ...state,
      shift: CHRONICLE_SHIFTS - 1,
      lastReportEndedAt: (CHRONICLE_SHIFTS - 1) * 480,
      crop: { index: CROP_YEARS_PER_CHRONICLE - 1, kind: 'typical', treated: false },
      improvements: [install],
    };
    const closed = closeShift(last, evidence(CHRONICLE_SHIFTS), []).state;
    expect(closed.status).toBe('ended');
    expect(closed.improvements.filter((p) => p.phase === 'installing')).toEqual([]);
    expect(closed.ledger.fund.refunds).toBe(70);
  });
});

describe('the ledger names where the fund went', () => {
  it('books a crop treatment from the Overview as treatment, not as an event', () => {
    const state: ChronicleState = {
      ...withFund(signed(), 1000),
      crop: { index: 1, kind: 'wet', treated: false },
    };
    const next = treatCropDirectly(state).state;
    expect(next.crop?.treated).toBe(true);
    expect(next.ledger.fund.events).toBe(0);
    expect(next.ledger.fund.treatment).toBeLessThan(0);
  });
});

describe('the epilogue reads as English', () => {
  it('names a single AI decision without "every one of the 1"', () => {
    const state: ChronicleState = {
      ...signed(),
      marks: {
        'cover-floor': {
          id: 'cover-floor',
          shift: 4,
          eventId: 'evt-x',
          choiceId: 'partner',
          actor: 'ai-partner',
        },
      },
    };
    const partner = epilogue(state).find((entry) => entry.id === 'partner');
    expect(partner?.text).toBe('The AI partner made the one decision in the record.');
  });
});
