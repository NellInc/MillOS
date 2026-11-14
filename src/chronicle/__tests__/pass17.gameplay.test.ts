/**
 * Pass 17, chronicle lane: defects a player meets.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { acceptOffer, OFFER_DECK } from './administratorOffer';
import { setLocale } from '../../i18n';
import { DEFAULT_CHARTER } from '../charter';
import { SHIFTS_PER_CROP_YEAR } from '../cropYears';
import {
  closeShift,
  createInitialState,
  proposePolicy,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import {
  ADMINISTRATION_MISSED_QUOTAS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  RED_LINES,
  nextQuota,
} from '../governance';
import { localizedNotice } from '../presentation';
import { chronicleChance } from '../rng';
import { advanceTrial, emptyTrialProgress, trialById } from '../trials';
import type { TrialProgress } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11) =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'no_trials' }, seed, baseline)
    .state;

let minute = 0;
function evidence(dispatchedKg = 3000): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `pass17-report-${minute}`,
      grade: 'B',
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg,
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

function run(state: ChronicleState, shifts: number, dispatchedKg = 3000): ChronicleState {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = acceptOffer(closeShift(next, evidence(dispatchedKg), OFFER_DECK).state);
  return next;
}

const agreeable = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
  governance: {
    ...state.governance,
    crew: CREW_ROLE_IDS.map((id) => ({
      ...CREW_PROFILES[id][0],
      temperament: 'eager' as const,
      prefers: { ladder: 'maintenance' as const, rung: 1 as const },
      need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance' as const, rung: 0 as const },
    })),
  },
});

afterEach(() => setLocale('en'));

describe('the quota ratchet', () => {
  it('never sets next year’s floor above what the mill actually dispatched', () => {
    for (const [quota, dispatched] of [
      [10_000, 10_051],
      [10_000, 10_099],
      [null, 11_170],
      [24_000, 24_350],
    ] as const) {
      const following = nextQuota(quota, dispatched);
      expect(following, `${quota} -> ${dispatched}`).toBeLessThanOrEqual(dispatched);
      if (quota !== null) expect(following).toBeGreaterThanOrEqual(quota);
    }
  });

  it('judges the quota on the dispatch the return files, never "missed by 0 kg"', () => {
    let state = run(signed(), SHIFTS_PER_CROP_YEAR, 2000);
    const quota = state.governance.quotaKg!;
    expect(quota).toBe(16_200);
    // Dispatch is fractional (shipments allocate by the kilo): 0.4 kg short in all.
    state = run(state, SHIFTS_PER_CROP_YEAR, (quota - 0.4) / SHIFTS_PER_CROP_YEAR);
    const filed = state.governance.returns.at(-1)!;
    expect(filed.dispatchedKg).toBe(quota);
    const notice = state.notices.find((n) => n.title === 'Crop year 2 return filed')!;
    expect(notice.body).not.toMatch(/missed by 0 kg/);
    expect(filed.met).toBe(true);
  });
});

describe('a forecast that comes true over an incident already under way', () => {
  it('does not claim it "did not come to pass", in either language', () => {
    // A seed whose roll strikes the storm forecast at the first close.
    let seed = 1;
    while (chronicleChance(seed, 'forecast:forecast-900', 1) >= 0.3) seed++;
    let state = signed(seed);
    state = {
      ...state,
      forecasts: [
        {
          id: 'forecast-900',
          kind: 'severe_rain',
          issuedShift: 0,
          dueShift: 1,
          chance: 0.6,
          mitigated: false,
          mitigatedBy: null,
          paidFund: 0,
          status: 'pending',
        },
      ],
    };
    const raining: ShiftCloseEvidence = {
      ...evidence(),
      incidents: [
        {
          id: 'storm-1',
          kind: 'severe_rain',
          phase: 'raised',
          severity: 'high',
          effectApplied: true,
        },
      ],
    };
    const step = closeShift(state, raining, []);
    // Nothing more is raised over the storm already blowing.
    expect(step.commands.filter((c) => c.type === 'raise_incident')).toEqual([]);
    const resolved = step.state.notices.find((n) => n.relatedId === 'forecast-900')!;
    expect(resolved.title).not.toBe('Storm front: it passed');
    expect(resolved.body).not.toMatch(/did not come to pass/);
    setLocale('pt-BR');
    const local = localizedNotice(resolved);
    expect(local.title).not.toBe(resolved.title);
    expect(local.body).not.toBe(resolved.body);
    expect(local.body).not.toMatch(/não se concretizou/);
  });
});

describe('a dispatch trial', () => {
  it('never fails with "6,000 of 6,000 kg dispatched"', () => {
    const definition = trialById('wet_harvest');
    let progress: TrialProgress = {
      ...emptyTrialProgress(definition.id),
      phase: 'active',
      startedShift: 11,
    };
    // Shipments allocate fractions of a kilo: 0.4 kg short over the window.
    const kg = definition.goal.kind === 'dispatch' ? definition.goal.kg : 0;
    const perShift = (kg - 0.4) / definition.durationShifts;
    for (let i = 0; i < definition.durationShifts && progress.phase === 'active'; i++)
      progress = advanceTrial(definition, progress, {
        dispatchedKg: perShift,
        qualityFailureKg: 0,
        energyCost: 0,
        grade: 'B',
        qcPassedThisShift: true,
        unresolvedHighIncident: false,
      });
    const english = kg.toLocaleString('en-GB');
    expect(progress.failureReason ?? '').not.toMatch(new RegExp(`^${english} of ${english} kg`));
    expect(progress.phase).toBe('passed');
  });

  it('never fails Grid Winter on "Energy 0.0080 per kg against 0.008"', () => {
    const definition = trialById('grid_winter');
    let progress: TrialProgress = {
      ...emptyTrialProgress(definition.id),
      phase: 'active',
      startedShift: 38,
    };
    // The goal at the cap plus 0.4 of the last decimal printed (four since
    // item 4.1): over the limit only past what the notice can show.
    const kg = definition.goal.kind === 'dispatch' ? definition.goal.kg : 0;
    const cap = definition.goal.kind === 'dispatch' ? definition.goal.maxEnergyPerKg! : 0;
    for (let i = 0; i < definition.durationShifts && progress.phase === 'active'; i++)
      progress = advanceTrial(definition, progress, {
        dispatchedKg: kg / definition.durationShifts,
        qualityFailureKg: 0,
        energyCost: (kg * (cap + 0.00004)) / definition.durationShifts,
        grade: 'B',
        qcPassedThisShift: true,
        unresolvedHighIncident: false,
      });
    expect(progress.failureReason ?? '').not.toMatch(/Energy 0\.0080 per kg against 0\.008/);
    expect(progress.phase).toBe('passed');
  });
});

describe('the administrator’s arrival notice', () => {
  const arrive = () => {
    const line = RED_LINES.find((l) => l.party === 'growers')!;
    let state = proposePolicy(agreeable(signed()), line.ladder, line.rung).state;
    expect(state.governance.countdowns).toHaveLength(1);
    state = {
      ...state,
      governance: { ...state.governance, missedInRow: ADMINISTRATION_MISSED_QUOTAS },
    };
    state = run(state, 1);
    return state.notices.find((n) => n.title === 'The federation sends an administrator')!;
  };

  it('says the running warnings wait for it to leave, in both languages', () => {
    const arrival = arrive();
    expect(arrival.body).toMatch(/Running warnings wait until it leaves\.$/);
    setLocale('pt-BR');
    const local = localizedNotice(arrival);
    expect(local.title).toBe('A federação envia um administrador');
    expect(local.body).toMatch(/^O moinho deixou de cumprir/);
    expect(local.body).toMatch(/Os avisos em andamento aguardam a saída do administrador\.$/);
  });

  it('renders the cooled-organisations arrival with held warnings in pt-BR too', () => {
    const line = RED_LINES.find((l) => l.party === 'growers')!;
    let state = proposePolicy(agreeable(signed()), line.ladder, line.rung).state;
    state = {
      ...state,
      stakeholders: state.stakeholders.map((party) => ({ ...party, value: 10 })),
    };
    state = run(state, 1);
    const arrival = state.notices.find((n) => n.title === 'The federation sends an administrator')!;
    expect(arrival.body).toMatch(
      /have cooled on the mill.*Running warnings wait until it leaves\.$/
    );
    setLocale('pt-BR');
    const local = localizedNotice(arrival).body;
    expect(local).toMatch(/esfriaram a relação com o moinho/);
    expect(local).toMatch(/Os avisos em andamento aguardam a saída do administrador\.$/);
  });

  it('says nothing about warnings when none is running', () => {
    let state = agreeable(signed());
    state = {
      ...state,
      governance: { ...state.governance, missedInRow: ADMINISTRATION_MISSED_QUOTAS },
    };
    state = run(state, 1);
    const arrival = state.notices.find((n) => n.title === 'The federation sends an administrator')!;
    expect(arrival.body).not.toMatch(/warning/);
    setLocale('pt-BR');
    expect(localizedNotice(arrival).body).toMatch(/^O moinho deixou de cumprir/);
  });
});
