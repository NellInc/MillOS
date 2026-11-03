import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  fundOf,
  hireContractor,
  resolveShortfall,
  treatCropDirectly,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { CHRONICLE_SHIFTS, CROP_YEARS_PER_CHRONICLE } from '../cropYears';
import type { Charter, ForecastState } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

function signed(overrides: Partial<Omit<Charter, 'seed'>> = {}, seed = 11): ChronicleState {
  return signCharter(createInitialState(), { ...DEFAULT_CHARTER, ...overrides }, seed, baseline)
    .state;
}

function evidence(
  index: number,
  overrides: Partial<ShiftCloseEvidence> = {},
  net = 0
): ShiftCloseEvidence {
  return {
    report: {
      id: `gameplay-report-${index}`,
      grade: 'C',
      endedAtMinute: index * 480,
      metrics: {
        revenue: net,
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
    ...overrides,
  };
}

/** A chronicle one close from its end with an empty fund. */
function lastShift(overrides: Partial<Omit<Charter, 'seed'>> = {}): ChronicleState {
  const state = signed(overrides);
  return {
    ...state,
    shift: CHRONICLE_SHIFTS - 1,
    lastReportEndedAt: (CHRONICLE_SHIFTS - 1) * 480,
    crop: { index: CROP_YEARS_PER_CHRONICLE - 1, kind: 'typical', treated: false },
    ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 0 } },
  };
}

describe('chronicle gameplay', () => {
  it('forced maintenance pays the upkeep due, never the whole fund', () => {
    // The fund can grow after a shortfall is declared: a cancelled install or a
    // reversed initiative refunds into it before the player answers.
    const state: ChronicleState = { ...signed(), upkeepShortfall: 50 };
    expect(fundOf(state)).toBe(300);
    const forced = resolveShortfall(state, 'forced').state;
    expect(forced.upkeepShortfall).toBeNull();
    expect(fundOf(forced)).toBe(250);
  });

  it('closes the chronicle with no shortfall left to answer', () => {
    const ended = closeShift(lastShift({ mode: 'sandbox' }), evidence(CHRONICLE_SHIFTS), []).state;
    expect(ended.status).toBe('ended');
    expect(ended.upkeepShortfall).toBeNull();
  });

  it('closes the chronicle with no forecast still pending', () => {
    const state = lastShift({ mode: 'no_trials' });
    const forecast: ForecastState = {
      id: 'forecast-last',
      kind: 'severe_rain',
      issuedShift: CHRONICLE_SHIFTS - 3,
      dueShift: CHRONICLE_SHIFTS,
      chance: 0.5,
      mitigated: false,
      mitigatedBy: null,
      paidFund: 0,
      status: 'pending',
    };
    // A recovery challenge running at the last close defers the forecast past the end.
    const ended = closeShift(
      { ...state, forecasts: [forecast] },
      evidence(CHRONICLE_SHIFTS, { challengeActive: true }),
      []
    ).state;
    expect(ended.status).toBe('ended');
    expect(ended.forecasts.filter((f) => f.status === 'pending')).toEqual([]);
  });

  it('does not begin a crop year after the last one', () => {
    const ended = closeShift(lastShift({ mode: 'sandbox' }), evidence(CHRONICLE_SHIFTS), []).state;
    expect(ended.status).toBe('ended');
    expect(ended.crop?.index).toBe(CROP_YEARS_PER_CHRONICLE - 1);
    expect(
      ended.notices.some((n) => n.title.startsWith(`Crop year ${CROP_YEARS_PER_CHRONICLE + 1}`))
    ).toBe(false);
  });

  it('takes no fund for a contractor or a crop treatment once the chronicle has ended', () => {
    const state = lastShift({ mode: 'sandbox' });
    const ended: ChronicleState = {
      ...closeShift(state, evidence(CHRONICLE_SHIFTS), []).state,
      ledger: state.ledger,
      crop: { index: CROP_YEARS_PER_CHRONICLE - 1, kind: 'wet', treated: false },
    };
    const funded: ChronicleState = {
      ...ended,
      ledger: { ...ended.ledger, fund: { ...ended.ledger.fund, charter: 1000 } },
    };
    expect(funded.status).toBe('ended');
    const offer = funded.contractorOffers[0];
    expect(hireContractor(funded, offer.id).state).toBe(funded);
    expect(treatCropDirectly(funded).state).toBe(funded);
  });
});
