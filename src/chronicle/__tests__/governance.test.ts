/**
 * Part three of the Chronicle (docs/CHRONICLE.md, systems 25-32): policy
 * ladders, the crew and the members' assembly, standing conditions with their
 * way out, red-line countdowns, the partner's brief, the crop-year return and
 * its ratchet, the co-op reserve and the federation's administrator.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import { CHRONICLE_SHIFTS, SHIFTS_PER_CROP_YEAR } from '../cropYears';
import { chronicleEffect, chronicleTotals } from '../effects';
import {
  chooseEventOption,
  closeShift,
  currentForecastChance,
  IMPROVEMENTS,
  concessionBlockReason,
  concessionFor,
  createInitialState,
  depositReserve,
  effectInput,
  fundOf,
  meetNeed,
  partnerChoice,
  policyBlockReason,
  proposalStanding,
  proposePolicy,
  setBrief,
  setDelegation,
  setReserveAutofill,
  signCharter,
  withdrawProposal,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { GOVERNANCE_EPILOGUE_SECTIONS, epilogue } from '../epilogue';
import { EVENT_DECK } from '../eventDeck';
import { FEDERATION_ADMINISTRATOR_EVENT_ID } from '../stewardDeck';
import {
  ADMINISTRATION_SHIFTS,
  briefInstallRank,
  briefMitigationThreshold,
  assemblyBallots,
  assemblyCount,
  BREAK_OFF_DELTA,
  COUNTDOWN_SHIFTS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  crewBallot,
  crewForSeed,
  FEDERATION_PREMIUM,
  FIRST_QUOTA_SHARE,
  GOVERNANCE_MARKS,
  nextQuota,
  POLICY_KNOW_HOW,
  RED_LINES,
  STANDING_CONDITIONS,
} from '../governance';
import { HISTORY_NOTES } from '../history';
import { QUIZ_QUESTIONS } from '../quiz';
import { conditionMet, MARKS } from '../record';
import { chronicleChance } from '../rng';
import type { CrewMember, PolicyLadder, PolicyRung } from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11, plant: 'overhauled' | 'working' | 'tired' = 'overhauled') =>
  signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, plant, mode: 'no_trials' },
    seed,
    baseline
  ).state;

let minute = 0;
function evidence(dispatchedKg = 3000, revenue = 2000): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `governance-report-${minute}`,
      grade: 'B',
      endedAtMinute: minute,
      metrics: {
        revenue,
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

/**
 * Shift closes with only part three's own event, the federation's offer of its
 * administrator (item 4.11), so nothing but part three acts. Left alone, the
 * offer lapses to acceptance two closes after it is made.
 */
const PART_THREE_DECK = EVENT_DECK.filter(
  (event) => event.id === FEDERATION_ADMINISTRATOR_EVENT_ID
);
function run(state: ChronicleState, shifts: number, kg = 3000, revenue = 2000): ChronicleState {
  let next = state;
  for (let i = 0; i < shifts && next.status === 'active'; i++)
    next = closeShift(next, evidence(kg, revenue), PART_THREE_DECK).state;
  return next;
}

const rich = (state: ChronicleState): ChronicleState => ({
  ...state,
  ledger: {
    ...state.ledger,
    fund: { ...state.ledger.fund, charter: 5000 },
    knowHow: { ...state.ledger.knowHow, grades: 500 },
  },
});

/** A crew of one profile per role, chosen by index, for predictable votes. */
function withCrew(state: ChronicleState, pick: 0 | 1): ChronicleState {
  return {
    ...state,
    governance: { ...state.governance, crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][pick]) },
  };
}

const member = (overrides: Partial<CrewMember>): CrewMember => ({
  ...CREW_PROFILES['head-miller'][1],
  ...overrides,
});

describe('the crew and the members’ assembly', () => {
  it('draws a seeded crew of six anonymous roles, the same for the same seed', () => {
    expect(crewForSeed(5)).toEqual(crewForSeed(5));
    expect(crewForSeed(5).map((m) => m.id)).toEqual([...CREW_ROLE_IDS]);
    const profiles = new Set<string>();
    for (let seed = 1; seed <= 40; seed++)
      for (const m of crewForSeed(seed)) profiles.add(`${m.id}:${m.value}`);
    expect(profiles.size).toBe(12);
  });

  it('votes from declared values: a need, a preference, then temperament', () => {
    const proposal = {
      ladder: 'intake' as const,
      from: 1 as const,
      to: 0 as const,
      concessions: [],
    };
    const needy = member({ need: { ...member({}).need, ladder: 'intake', rung: 0 } });
    expect(crewBallot(needy, proposal, []).vote).toBe('against');
    expect(crewBallot(needy, { ...proposal, concessions: [needy.id] }, []).vote).toBe('abstain');
    const toward = member({
      prefers: { ladder: 'intake', rung: 0 },
      need: { ...member({}).need, ladder: 'orders', rung: 0 },
    });
    expect(crewBallot(toward, proposal, []).vote).toBe('for');
    const away = member({
      prefers: { ladder: 'intake', rung: 2 },
      need: { ...member({}).need, ladder: 'orders', rung: 0 },
    });
    expect(crewBallot(away, proposal, []).vote).toBe('against');
    const untouched = {
      prefers: { ladder: 'stock' as const, rung: 1 as const },
      need: { ...member({}).need, ladder: 'stock' as const, rung: 0 as const },
    };
    expect(crewBallot(member({ ...untouched, temperament: 'eager' }), proposal, []).vote).toBe(
      'for'
    );
    expect(crewBallot(member({ ...untouched, temperament: 'cautious' }), proposal, []).vote).toBe(
      'against'
    );
    expect(
      crewBallot(
        member({ ...untouched, temperament: 'cautious' }),
        { ...proposal, from: 0, to: 1 },
        []
      ).vote
    ).toBe('abstain');
    expect(crewBallot(member({ ...untouched, temperament: 'even' }), proposal, []).vote).toBe(
      'abstain'
    );
  });

  it('counts one member, one vote, and does not carry a tie', () => {
    const ballot = (vote: 'for' | 'against' | 'abstain') => ({
      memberId: 'lab' as const,
      vote,
      reason: '',
    });
    expect(assemblyCount([ballot('for'), ballot('against')]).carried).toBe(false);
    expect(assemblyCount([ballot('for'), ballot('abstain')]).carried).toBe(true);
  });

  it('a standing objection makes its member vote against every change until it is met', () => {
    const m = member({});
    const objection = {
      memberId: m.id,
      ladder: 'orders' as const,
      rung: 2 as const,
      raisedShift: 1,
    };
    expect(
      crewBallot(m, { ladder: 'stock', from: 1, to: 2, concessions: [] }, [objection]).vote
    ).toBe('against');
  });
});

describe('policy ladders', () => {
  it('carries a change the assembly backs, charges for it, applies it and locks the ladder', () => {
    // Profile 0 crew on stock 1 -> 2: packing (for, toward), yard (against, need), the
    // eager roll fitter (for), cautious head miller and grader (against): 2 to 3... so meet the yard's need.
    let state = withCrew(rich(signed()), 0);
    const knowHow = state.ledger.knowHow.policies;
    const standing = assemblyCount(
      assemblyBallots(state.governance, { ladder: 'orders', from: 1, to: 2, concessions: [] })
    );
    expect(standing.carried).toBe(true);
    state = proposePolicy(state, 'orders', 2).state;
    expect(state.governance.policies.orders).toBe(2);
    expect(state.governance.proposal).toBeNull();
    expect(state.ledger.knowHow.policies).toBe(knowHow - POLICY_KNOW_HOW);
    expect(state.ledger.sinceCloseKnowHow.policies).toBe(-POLICY_KNOW_HOW);
    expect(state.ledger.sinceCloseKnowHow.event_costs).toBeUndefined();
    expect(chronicleTotals(effectInput(state)).reinvestment).toBeCloseTo(-0.02, 5);
    expect(policyBlockReason(state, 'orders', 1)).toMatch(/changed lately/);
    state = run(state, 3);
    expect(policyBlockReason(state, 'orders', 1)).toBeNull();
  });

  it('moves one step at a time, and condition-based maintenance needs vibration monitoring', () => {
    const state = rich(signed());
    expect(policyBlockReason(state, 'orders', 1)).toBe('one step at a time');
    expect(policyBlockReason(state, 'maintenance', 2)).toMatch(/Vibration monitoring/i);
    const fitted: ChronicleState = {
      ...state,
      improvements: [
        {
          id: 'vibration-monitoring',
          phase: 'installed',
          contractorId: null,
          startedShift: 0,
          completesShift: 0,
          paidFund: 0,
          effectScale: 1,
          initiatedBy: 'player',
        },
      ],
    };
    expect(policyBlockReason(fitted, 'maintenance', 2)).toBeNull();
  });

  it('leaves a falling proposal open, and refuses a concession that could not carry it', () => {
    // Profile 0 on stock 1 -> 2: the packing lead (toward) and the eager roll fitter
    // for; both cautious members and the yard hand (room to turn a forklift) against.
    let state = withCrew(rich(signed()), 0);
    state = proposePolicy(state, 'stock', 2).state;
    expect(state.governance.policies.stock).toBe(1);
    expect(proposalStanding(state)).toMatchObject({ for: 2, against: 3, carried: false });
    expect(concessionFor(state, 'yard')).toMatchObject({ kind: 'proposal', fund: 30 });
    // Meeting the yard hand's need would leave a 2 to 2 tie, which does not carry:
    // it is refused before the money is spent (item 4.10; report 08, defect 2).
    expect(concessionBlockReason(state, 'yard')).toMatch(/would still not carry/);
    const fund = fundOf(state);
    expect(meetNeed(state, 'yard').state).toBe(state);
    expect(fundOf(state)).toBe(fund);
    expect(state.marks['crew-concession']).toBeUndefined();
    // A second proposal cannot replace the open one.
    expect(policyBlockReason(state, 'stock', 0)).toMatch(/already before the assembly/);
    expect(proposePolicy(state, 'stock', 0).state).toBe(state);
    state = withdrawProposal(state);
    expect(state.governance.proposal).toBeNull();
    expect(state.governance.policies.stock).toBe(1);
  });

  it('carries a change over an outvoted need, records the objection, and lifts it when met', () => {
    const eager = (id: CrewMember['id']): CrewMember => ({
      ...CREW_PROFILES[id][0],
      temperament: 'eager',
      prefers: { ladder: 'maintenance', rung: 1 },
      need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance', rung: 0 },
    });
    const needy: CrewMember = { ...CREW_PROFILES.yard[0] };
    let state = rich(signed());
    state = {
      ...state,
      governance: {
        ...state.governance,
        crew: [eager('head-miller'), eager('roll-fitter'), eager('lab'), eager('packing'), needy],
      },
    };
    state = proposePolicy(state, 'stock', 2).state;
    expect(state.governance.policies.stock).toBe(2);
    expect(state.governance.objections.map((o) => o.memberId)).toEqual(['yard']);
    expect(state.marks['crew-overruled']).toBeDefined();
    expect(state.unlockedNotes).toContain('history-assembly');
    // The objector now votes against everything until the need is met.
    expect(
      assemblyCount(
        assemblyBallots(state.governance, { ladder: 'orders', from: 1, to: 2, concessions: [] })
      ).against
    ).toBe(1);
    state = meetNeed(state, 'yard').state;
    expect(state.governance.objections).toEqual([]);
    expect(state.marks['crew-concession']).toBeDefined();
  });

  it('moving the ladder off the step lifts the objection without a concession', () => {
    const eager = (id: CrewMember['id']): CrewMember => ({
      ...CREW_PROFILES[id][0],
      temperament: 'eager',
      prefers: { ladder: 'maintenance', rung: 1 },
      need: { ...CREW_PROFILES[id][0].need, ladder: 'maintenance', rung: 0 },
    });
    let state = rich(signed());
    state = {
      ...state,
      governance: {
        ...state.governance,
        crew: [
          eager('head-miller'),
          eager('roll-fitter'),
          eager('lab'),
          eager('packing'),
          CREW_PROFILES.yard[0],
        ],
      },
    };
    state = proposePolicy(state, 'stock', 2).state;
    state = run(state, 3);
    // Moving off the step lifts the objection, so the objector votes for it.
    const ballots = assemblyBallots(state.governance, {
      ladder: 'stock',
      from: 2,
      to: 1,
      concessions: [],
    });
    expect(ballots.find((b) => b.memberId === 'yard')).toMatchObject({ vote: 'for' });
    state = proposePolicy(state, 'stock', 1).state;
    expect(state.governance.policies.stock).toBe(1);
    expect(state.governance.objections).toEqual([]);
  });
});

describe('standing conditions print their way out', () => {
  it('every condition has an effect and a way out on its card', () => {
    for (const definition of Object.values(STANDING_CONDITIONS)) {
      expect(definition.effectText.length).toBeGreaterThan(0);
      expect(definition.clearText.length).toBeGreaterThan(0);
    }
  });

  it('deferred maintenance caps production and clears after three shifts out of austerity', () => {
    let state = rich(signed());
    state = { ...state, austerity: { active: true, shifts: 0 } };
    state = run(state, 2);
    expect(state.governance.conditions.map((c) => c.id)).toContain('deferred-maintenance');
    const effect = chronicleEffect(
      {
        ...effectInput(state),
        austerity: false,
        modifiers: [{ id: 'm', sourceId: 's', label: 'x', remainingShifts: 9, production: 1.1 }],
      },
      false
    );
    expect(effect.productionMultiplier).toBeCloseTo(0.94, 5);
    state = { ...state, austerity: { active: false, shifts: 0 } };
    state = run(state, 3);
    expect(state.governance.conditions.map((c) => c.id)).not.toContain('deferred-maintenance');
  });

  it('a ceiling costs nothing below it', () => {
    // Austerity runs the plant at x0.92, under thin stocks' x0.97 ceiling.
    const state = { ...rich(signed()), austerity: { active: true, shifts: 0 } };
    const input = {
      ...effectInput(state),
      conditions: [{ id: 'thin-stocks' as const, sinceShift: 0 }],
    };
    expect(chronicleEffect(input, false).productionMultiplier).toBeCloseTo(0.92, 5);
    expect(chronicleEffect(effectInput(state), false).productionMultiplier).toBeCloseTo(0.92, 5);
  });

  it('tired machinery stands from signing and lifts its wear once three plans are installed', () => {
    const state = signed(11, 'tired');
    expect(state.governance.conditions.map((c) => c.id)).toEqual(['tired-machinery']);
    const wear = chronicleTotals(effectInput(state)).wear;
    const installed = (id: string) => ({
      id,
      phase: 'installed' as const,
      contractorId: null,
      startedShift: 0,
      completesShift: 0,
      paidFund: 0,
      effectScale: 0,
      initiatedBy: 'player' as const,
    });
    let renewed: ChronicleState = {
      ...state,
      improvements: ['moisture-meters', 'spare-parts-store', 'members-library'].map(installed),
    };
    renewed = run(renewed, 1);
    expect(renewed.governance.machineryRenewed).toBe(true);
    expect(renewed.governance.conditions.map((c) => c.id)).not.toContain('tired-machinery');
    expect(chronicleTotals(effectInput(renewed)).wear).toBeCloseTo(wear / 1.25, 5);
  });

  it('run-to-failure wears the rolls after four shifts, and four shifts off it clear them', () => {
    let state = rich(signed());
    state = {
      ...state,
      governance: {
        ...state.governance,
        policies: { ...state.governance.policies, maintenance: 0 },
      },
    };
    state = run(state, 4);
    expect(state.governance.conditions.map((c) => c.id)).toContain('worn-rolls');
    state = {
      ...state,
      governance: {
        ...state.governance,
        policies: { ...state.governance.policies, maintenance: 1 },
      },
    };
    state = run(state, 4);
    expect(state.governance.conditions.map((c) => c.id)).not.toContain('worn-rolls');
  });
});

describe('red lines count down', () => {
  /** A crew of eager members whose needs sit on maintenance, so every other change carries. */
  const agreeable = (state: ChronicleState): ChronicleState => ({
    ...rich(state),
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

  it('warns, then acts after the countdown if the policy stays', () => {
    const line = RED_LINES.find((l) => l.party === 'growers')!;
    let state = proposePolicy(agreeable(signed()), line.ladder, line.rung).state;
    expect(state.governance.policies[line.ladder]).toBe(line.rung);
    expect(state.governance.countdowns.map((c) => c.party)).toEqual(['growers']);
    const growers = state.stakeholders.find((s) => s.id === 'growers')!.value;
    state = run(state, COUNTDOWN_SHIFTS);
    expect(state.stakeholders.find((s) => s.id === 'growers')!.value).toBe(
      Math.max(0, growers + BREAK_OFF_DELTA)
    );
    expect(state.marks['growers-broke-off']).toBeDefined();
    expect(state.governance.countdowns).toEqual([]);
    // A red line is acted on once: the policy staying there raises no new warning.
    state = run(state, COUNTDOWN_SHIFTS + 1);
    expect(state.governance.countdowns).toEqual([]);
  });

  it('withdraws the warning when the policy moves off in time', () => {
    let state = proposePolicy(agreeable(signed()), 'intake', 0).state;
    expect(state.governance.countdowns).toHaveLength(1);
    state = run(state, COUNTDOWN_SHIFTS - 1);
    // Still locked for one more shift after two closes? The lock is three shifts.
    state = run(state, 1);
    expect(state.marks['growers-broke-off']).toBeDefined();
    let early = proposePolicy(agreeable(signed(12)), 'intake', 0).state;
    early = {
      ...early,
      governance: {
        ...early.governance,
        changedShift: { ...early.governance.changedShift, intake: -10 },
      },
    };
    early = proposePolicy(early, 'intake', 1).state;
    expect(early.governance.policies.intake).toBe(1);
    expect(early.governance.countdowns).toEqual([]);
    early = run(early, COUNTDOWN_SHIFTS + 1);
    expect(early.marks['growers-broke-off']).toBeUndefined();
  });
});

describe('the partner’s brief', () => {
  const workshop = EVENT_DECK.find((event) => event.id === 'evt-millwrights-workshop')!;

  it('the conventional brief takes the recommended answer; thrift keeps the fund', () => {
    const state = rich(signed());
    expect(partnerChoice(state, workshop)?.id).toBe('host');
    const thrifty = setBrief(state, 'thrift').state;
    expect(partnerChoice(thrifty, workshop)?.id).toBe('notes');
  });

  it('a brief with no view falls back to the conventional answer', () => {
    const state = setBrief(rich(signed()), 'standards').state;
    expect(partnerChoice(state, workshop)?.id).toBe('host');
  });

  it('a brief never prefers an answer it counts against over one it has no view of', () => {
    const event = {
      ...workshop,
      id: 'evt-test-brief',
      choices: [
        {
          id: 'shortcut',
          label: 'Take the shortcut',
          aiRecommended: true,
          effect: {
            standing: -25,
            relationship: { customer: 'village' as const, delta: -6 },
            result: '',
          },
        },
        { id: 'plain', label: 'Do it plainly', effect: { result: '' } },
      ],
      defaultChoiceId: 'plain',
    };
    const state = rich(signed());
    // Conventional takes the recommended answer; the briefs that weigh standing
    // or the valley turn away from it, and none picks it over the neutral one.
    expect(partnerChoice(state, event)?.id).toBe('shortcut');
    expect(partnerChoice(setBrief(state, 'standards').state, event)?.id).toBe('plain');
    expect(partnerChoice(setBrief(state, 'neighbour').state, event)?.id).toBe('plain');
  });

  it('each brief changes what the partner guards and builds, on the real forecasts and plans', () => {
    // Measured on the authored deck: the recommended answers to routine events
    // already favour standards, so the standards brief shows in forecasts and installs.
    const kinds = ['severe_rain', 'power_sag', 'dust_filter_pressure', 'delayed_truck'] as const;
    for (const brief of ['standards', 'thrift', 'neighbour'] as const) {
      const thresholds = kinds.map((kind) => briefMitigationThreshold(brief, kind));
      const conventional = kinds.map((kind) => briefMitigationThreshold('conventional', kind));
      expect(thresholds, brief).not.toEqual(conventional);
      const first = (b: typeof brief | 'conventional') =>
        [...IMPROVEMENTS].sort(
          (x, y) => briefInstallRank(b, x) - briefInstallRank(b, y) || x.installCost - y.installCost
        )[0].id;
      expect(first(brief), brief).not.toBe(first('conventional'));
    }
    expect(briefMitigationThreshold('standards', 'dust_filter_pressure')).toBe(0.25);
    expect(briefMitigationThreshold('neighbour', 'severe_rain')).toBe(0.25);
    expect(briefMitigationThreshold('thrift', 'power_sag')).toBe(0.55);
  });

  it('the partner acts on its brief at delegation level 2', () => {
    // A dust-load forecast at 30%: below the conventional 40%, above standards' 25%.
    const pending = (state: ChronicleState): ChronicleState => ({
      ...state,
      delegation: 2,
      // Base 55%, kind fortune -10, this relief -15: 30%.
      modifiers: [
        {
          id: 'm',
          sourceId: 'test',
          label: 'Clean filters',
          remainingShifts: 9,
          forecastChance: -0.15,
        },
      ],
      forecasts: [
        {
          id: 'forecast-dust',
          kind: 'dust_filter_pressure',
          issuedShift: state.shift,
          dueShift: state.shift + 5,
          chance: 0.3,
          mitigated: false,
          mitigatedBy: null,
          paidFund: 0,
          status: 'pending',
        },
      ],
    });
    const at = (brief: 'conventional' | 'standards') => {
      let state = setBrief(rich(signed()), brief).state;
      state = pending(state);
      // Pin the chance at 30% whatever the fortune and organisations add.
      const base = currentForecastChance(state, state.forecasts[0]);
      expect(base).toBeGreaterThanOrEqual(0.25);
      expect(base).toBeLessThan(0.4);
      return closeShift(state, evidence(), []).state.forecasts.find(
        (f) => f.id === 'forecast-dust'
      );
    };
    expect(at('conventional')?.mitigated).toBe(false);
    expect(at('standards')?.mitigated).toBe(true);
    expect(at('standards')?.mitigatedBy).toBe('ai-partner');
  });

  it('says in the epilogue which brief the partner worked to', () => {
    let state = setBrief(signed(), 'thrift').state;
    state = {
      ...state,
      marks: { x: { id: 'x', shift: 1, eventId: 'e', choiceId: 'c', actor: 'ai-partner' } },
    };
    expect(epilogue(state).find((e) => e.id === 'partner')?.text).toMatch(/thrift brief/);
  });
});

describe('the crop-year return and the ratchet', () => {
  it('files a return at the year’s turn from the recorded evidence, and sets the first quota', () => {
    const state = run(rich(signed()), SHIFTS_PER_CROP_YEAR, 2000);
    const [filed] = state.governance.returns;
    expect(filed.dispatchedKg).toBe(2000 * SHIFTS_PER_CROP_YEAR);
    expect(filed.quotaKg).toBeNull();
    expect(state.governance.quotaKg).toBe(nextQuota(null, 2000 * SHIFTS_PER_CROP_YEAR));
    expect(state.governance.quotaKg).toBe(Math.round((18000 * FIRST_QUOTA_SHARE) / 100) * 100);
    expect(state.unlockedNotes).toContain('history-ogas');
  });

  it('beating the quota pays the premium and ratchets it up; missing it puts the mill behind the plan', () => {
    let state = run(rich(signed()), SHIFTS_PER_CROP_YEAR, 2000);
    const fund = state.ledger.fund.federation;
    state = run(state, SHIFTS_PER_CROP_YEAR, 2500);
    expect(state.ledger.fund.federation).toBe(fund + FEDERATION_PREMIUM);
    expect(state.governance.quotaKg).toBe(2500 * SHIFTS_PER_CROP_YEAR);
    expect(state.marks['quota-raised']).toBeDefined();
    expect(state.unlockedNotes).toContain('history-ratchet');
    state = run(state, SHIFTS_PER_CROP_YEAR, 1000);
    expect(state.governance.returns.at(-1)?.met).toBe(false);
    expect(state.governance.conditions.map((c) => c.id)).toContain('behind-plan');
    expect(state.marks['quota-missed']).toBeDefined();
    // The ratchet never lowers the quota.
    expect(state.governance.quotaKg).toBe(2500 * SHIFTS_PER_CROP_YEAR);
  });

  it('two missed quotas bring the administrator, who locks policies, holds delegation up and leaves', () => {
    let state = run(rich(signed()), SHIFTS_PER_CROP_YEAR, 3000);
    state = run(state, SHIFTS_PER_CROP_YEAR * 2, 500);
    // The federation offers; left alone, the offer lapses to acceptance (4.11).
    expect(state.governance.administration).toBeNull();
    state = run(state, 2, 500);
    expect(state.marks.administered).toBeDefined();
    expect(state.governance.administration).not.toBeNull();
    expect(state.delegation).toBeGreaterThanOrEqual(2);
    expect(policyBlockReason(state, 'orders', 2)).toMatch(/administrator/);
    expect(setDelegation(state, 0).state.delegation).toBe(state.delegation);
    state = run(state, ADMINISTRATION_SHIFTS);
    expect(state.governance.administration).toBeNull();
    expect(state.delegation).toBe(0);
    expect(state.governance.conditions.map((c) => c.id)).not.toContain('administration');
  });

  it('the sandbox sets no quota and brings no administrator', () => {
    let state = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, mode: 'sandbox' },
      11,
      baseline
    ).state;
    state = {
      ...rich(state),
      stakeholders: state.stakeholders.map((party) => ({ ...party, value: 10 })),
    };
    state = run(state, SHIFTS_PER_CROP_YEAR * 3, 500);
    expect(state.governance.quotaKg).toBeNull();
    expect(state.marks.administered).toBeUndefined();
  });

  it('counts a year’s know-how from the year’s start, once', () => {
    const state = run(rich(signed()), SHIFTS_PER_CROP_YEAR * 2);
    const [first, second] = state.governance.returns;
    expect(first.knowHowEarned).toBeGreaterThan(0);
    expect(first.knowHowEarned + second.knowHowEarned).toBeLessThanOrEqual(
      state.governance.tally.knowHowStart
    );
  });

  it('files the last return with the close and runs to the end', () => {
    const state = run(rich(signed()), CHRONICLE_SHIFTS);
    expect(state.status).toBe('ended');
    expect(state.governance.returns.length).toBe(CHRONICLE_SHIFTS / SHIFTS_PER_CROP_YEAR);
  });
});

describe('the co-op reserve', () => {
  it('autofill moves a tenth of the reinvestment; a deposit moves 25', () => {
    let state = setReserveAutofill(rich(signed()), true);
    state = run(state, 1);
    const reinvested = state.ledger.lastShiftFund.reinvestment ?? 0;
    expect(state.governance.reserve.balance).toBe(Math.floor(reinvested * 0.1));
    const balance = state.governance.reserve.balance;
    state = depositReserve(state);
    expect(state.governance.reserve.balance).toBe(balance + 25);
  });

  it('covers an upkeep shortfall it can cover whole, before austerity is asked for', () => {
    let state = signed();
    state = {
      ...state,
      ledger: { ...state.ledger, fund: { ...state.ledger.fund, charter: 0 } },
      governance: { ...state.governance, reserve: { balance: 200, autofill: false, drawn: 0 } },
    };
    state = run(state, 1, 0, 0);
    expect(state.upkeepShortfall).toBeNull();
    expect(state.governance.reserve.drawn).toBeGreaterThan(0);
    expect(state.marks['reserve-drawn']).toBeDefined();
  });
});

describe('history and the record', () => {
  it('every part-three note has quiz questions, and every mark is registered', () => {
    for (const id of ['history-ogas', 'history-cybersyn', 'history-ratchet', 'history-assembly']) {
      expect(
        HISTORY_NOTES.some((note) => note.id === id),
        id
      ).toBe(true);
      expect(
        QUIZ_QUESTIONS.some((q) => q.noteId === id),
        id
      ).toBe(true);
    }
    for (const id of GOVERNANCE_MARKS) expect(MARKS[id], id).toBeDefined();
  });
});

/**
 * A seeded steward who uses part three: dispatch varies, the fund sometimes
 * runs dry, policies are proposed, needs are sometimes met, and the reserve is
 * sometimes filled. Every governance epilogue slide must be reachable.
 */
function seededGovernancePlay(seed: number): ChronicleState {
  const roll = (stream: string, i: number) => chronicleChance(seed, stream, i);
  let state = signed(seed);
  // Some stewards run short of fund for a stretch: losses until a seeded shift.
  const poor = roll('poor', 0) < 0.35;
  const recovers = Math.floor(20 + roll('recovers', 0) * 50);
  if (!poor) state = rich(state);
  if (roll('autofill', 0) < 0.5) state = setReserveAutofill(state, true);
  if (roll('deposit', 0) < 0.6) state = depositReserve(state);
  const concedes = roll('concedes', 0) < 0.5;
  const meetsObjections = roll('meets', 0) < 0.5;
  for (let i = 0; i < CHRONICLE_SHIFTS + 2 && state.status === 'active'; i++) {
    const kg = Math.round(3000 * (0.5 + roll('kg', i)));
    const revenue = poor && i < recovers ? 0 : 2000;
    state = closeShift(state, evidence(kg, revenue), PART_THREE_DECK).state;
    // The assembly answers the federation's offer one way or the other (4.11).
    for (const pending of state.pendingEvents)
      if (pending.eventId === FEDERATION_ADMINISTRATOR_EVENT_ID)
        state = chooseEventOption(
          state,
          pending.instanceId,
          roll('offer', i) < 0.5 ? 'accept' : 'refuse',
          'player',
          PART_THREE_DECK
        ).state;
    if (roll('propose', i) < 0.35) {
      const ladders: PolicyLadder[] = ['maintenance', 'intake', 'stock', 'orders'];
      const ladder = ladders[Math.floor(roll('ladder', i) * 4)];
      const from = state.governance.policies[ladder];
      const to = (from === 1 ? (roll('dir', i) < 0.5 ? 0 : 2) : 1) as PolicyRung;
      state = proposePolicy(state, ladder, to).state;
      if (state.governance.proposal) {
        if (concedes)
          for (const m of state.governance.crew)
            if (state.governance.proposal) state = meetNeed(state, m.id).state;
        if (state.governance.proposal) state = withdrawProposal(state);
      }
    }
    if (meetsObjections)
      for (const objection of state.governance.objections)
        if (roll('meet', i) < 0.3) state = meetNeed(state, objection.memberId).state;
  }
  return state;
}

describe('every part-three epilogue slide is reachable', () => {
  it('reaches each slide in seeded play', () => {
    const shown = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const state = seededGovernancePlay(seed);
      expect(state.status, `seed ${seed}`).toBe('ended');
      for (const section of GOVERNANCE_EPILOGUE_SECTIONS) {
        const index = section.slides.findIndex((slide) => conditionMet(state, slide.when));
        if (index >= 0) shown.add(`${section.id}:${index}`);
      }
    }
    const missing = GOVERNANCE_EPILOGUE_SECTIONS.flatMap((section) =>
      section.slides.map((_, index) => `${section.id}:${index}`)
    ).filter((key) => !shown.has(key));
    expect(missing).toEqual([]);
  });
});
