/**
 * Rule 4 for the members' assembly: a policy step that crosses a red line or
 * raises a standing condition must never be one the assembly can carry the
 * mill onto and then not off (report 08, defect 1).
 *
 * Every crew is enumerated: two profiles for each of six roles, 64 crews. Each
 * risky step is entered through the real engine (`proposePolicy`, `meetNeed`),
 * once for every way of meeting needs on the way in, and then once more for
 * every set of the objections that entry raised being met afterwards. From
 * each, the way back is searched over every proposal off the step and every
 * concession on offer, with the warning running, after it has acted, and with
 * the step's condition standing.
 *
 * That covers every state the assembly can reach on the step. A vote on a
 * ladder reads only the crew, the proposal and the standing objections. An
 * objection on another ladder makes its member vote against, and it can always
 * be met, which the exit search tries. An objection on this ladder can only
 * come from the move onto this step (a move off a step lifts every objection
 * held on it), and the search takes it both standing and met.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  concessionFor,
  createInitialState,
  meetNeed,
  policyBlockReason,
  proposalStanding,
  proposePolicy,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import {
  assessConditions,
  CONDITION_POLICY_STEPS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  crewForSeed,
  MIDDLE_POLICIES,
  POLICY_KNOW_HOW,
  POLICY_LADDER_IDS,
  RED_LINES,
  redLineKey,
  tieCarries,
} from '../governance';
import type {
  CrewMember,
  CrewRoleId,
  PolicyLadder,
  PolicyRung,
  StandingConditionId,
} from '../types';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const signed = (seed = 11): ChronicleState =>
  signCharter(
    createInitialState(),
    { ...DEFAULT_CHARTER, plant: 'overhauled', mode: 'no_trials' },
    seed,
    baseline
  ).state;

/** Money and know-how to spare, and every ladder's lock run out: only the vote decides. */
function prepared(state: ChronicleState): ChronicleState {
  return {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 100_000 },
      knowHow: { ...state.ledger.knowHow, grades: 10_000 },
    },
    governance: {
      ...state.governance,
      changedShift: { maintenance: null, intake: null, stock: null, orders: null },
    },
  };
}

const crewOf = (mask: number): CrewMember[] =>
  CREW_ROLE_IDS.map((id, index) => CREW_PROFILES[id][(mask >> index) & 1]);
const profileName = (mask: number) =>
  CREW_ROLE_IDS.map((id, index) => `${id} ${(mask >> index) & 1}`).join(', ');

const neighbours = (rung: PolicyRung): PolicyRung[] => (rung === 1 ? [0, 2] : [1]);

/** Nonempty subsets, in a fixed order. */
function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let bits = 1; bits < 1 << items.length; bits++)
    out.push(items.filter((_, index) => bits & (1 << index)));
  return out;
}

/** The conditions a step raises, read from the plant's own assessment, every streak run long. */
function conditionsRaisedOn(ladder: PolicyLadder, rung: PolicyRung): StandingConditionId[] {
  return assessConditions({
    shift: 20,
    conditions: [],
    streaks: { outOfAusterity: 20, runToFailure: 20, offRunToFailure: 0, stockedUp: 0 },
    policies: { ...MIDDLE_POLICIES, [ladder]: rung },
    austerity: { active: false, shifts: 0 },
    installed: [],
    delayedTruckStruck: true,
    machineryRenewed: false,
  }).raised;
}

interface RiskyStep {
  ladder: PolicyLadder;
  rung: PolicyRung;
  redLine: boolean;
  conditions: StandingConditionId[];
}

const RISKY: RiskyStep[] = POLICY_LADDER_IDS.flatMap((ladder) =>
  ([0, 1, 2] as PolicyRung[]).map((rung) => ({
    ladder,
    rung,
    redLine: RED_LINES.some((line) => line.ladder === ladder && line.rung === rung),
    conditions: conditionsRaisedOn(ladder, rung),
  }))
).filter((step) => step.redLine || step.conditions.length > 0);

/** Every way the assembly can carry the mill onto a step, by the needs met on the way in. */
function enter(
  start: ChronicleState,
  ladder: PolicyLadder,
  rung: PolicyRung
): { paid: CrewRoleId[]; state: ChronicleState }[] {
  const opened = proposePolicy(start, ladder, rung).state;
  if (opened.governance.policies[ladder] === rung) return [{ paid: [], state: opened }];
  if (!opened.governance.proposal) return [];
  const offered = CREW_ROLE_IDS.filter((id) => concessionFor(opened, id)?.kind === 'proposal');
  const entered: { paid: CrewRoleId[]; state: ChronicleState }[] = [];
  for (const subset of subsets(offered)) {
    let state = opened;
    const paid: CrewRoleId[] = [];
    for (const id of subset) {
      state = meetNeed(state, id).state;
      paid.push(id);
      if (state.governance.policies[ladder] === rung) break;
    }
    if (state.governance.policies[ladder] === rung) entered.push({ paid, state });
  }
  return entered;
}

/** An entry as it stands, and with each set of the objections it raised met afterwards. */
function metAfter(entry: { paid: string[]; state: ChronicleState }) {
  const objectors = CREW_ROLE_IDS.filter(
    (id) => concessionFor(entry.state, id)?.kind === 'objection'
  );
  return [
    entry,
    ...subsets(objectors).map((subset) => ({
      paid: [...entry.paid, ...subset.map((id) => `${id} objection`)],
      state: subset.reduce((state, id) => meetNeed(prepared(state), id).state, entry.state),
    })),
  ];
}

/** Whether any proposal off the step, with any concessions on offer, carries. */
function leave(state: ChronicleState, ladder: PolicyLadder): { left: boolean; tally: string } {
  const from = state.governance.policies[ladder];
  const tallies: string[] = [];
  for (const to of neighbours(from)) {
    const ready = prepared(state);
    if (policyBlockReason(ready, ladder, to) !== null) continue;
    const proposed = proposePolicy(ready, ladder, to).state;
    if (proposed.governance.policies[ladder] === to) return { left: true, tally: '' };
    const standing = proposalStanding(proposed);
    tallies.push(`${from}->${to} ${standing?.for} to ${standing?.against}`);
    const offered = CREW_ROLE_IDS.filter((id) => concessionFor(proposed, id) !== null);
    for (const subset of subsets(offered)) {
      let next = proposed;
      for (const id of subset) {
        next = meetNeed(next, id).state;
        if (next.governance.policies[ladder] === to) return { left: true, tally: '' };
      }
      const after = proposalStanding(next);
      if (after)
        tallies.push(`${from}->${to} met ${subset.join('+')}: ${after.for} to ${after.against}`);
    }
  }
  return { left: false, tally: tallies.join('; ') };
}

interface Trap {
  crew: string;
  step: string;
  situation: string;
  paidOnEntry: string;
  tally: string;
  tie: boolean;
}

function enumerateTraps(): { traps: Trap[]; entries: number } {
  const base = signed();
  const traps: Trap[] = [];
  let entries = 0;
  for (let mask = 0; mask < 64; mask++) {
    for (const step of RISKY) {
      for (const from of neighbours(step.rung)) {
        const start = prepared({
          ...base,
          governance: {
            ...base.governance,
            crew: crewOf(mask),
            policies: { ...MIDDLE_POLICIES, [step.ladder]: from },
          },
        });
        for (const { paid, state } of enter(start, step.ladder, step.rung).flatMap(metAfter)) {
          entries++;
          const situations: [string, ChronicleState][] = [];
          if (step.redLine) {
            situations.push(['warning running', state]);
            const lines = RED_LINES.filter(
              (line) => line.ladder === step.ladder && line.rung === step.rung
            );
            situations.push([
              'warning acted on',
              {
                ...state,
                governance: {
                  ...state.governance,
                  countdowns: [],
                  brokenOff: lines.map(redLineKey),
                },
              },
            ]);
          } else {
            situations.push(['no condition yet', state]);
          }
          for (const id of step.conditions) {
            const [, last] = situations[situations.length - 1];
            situations.push([
              `${id} standing`,
              {
                ...last,
                governance: {
                  ...last.governance,
                  conditions: [...last.governance.conditions, { id, sinceShift: last.shift }],
                },
              },
            ]);
          }
          for (const [situation, at] of situations) {
            // A step with no red line and no condition standing is no trap: nothing raised is held.
            if (situation === 'no condition yet') continue;
            const result = leave(at, step.ladder);
            if (result.left) continue;
            traps.push({
              crew: profileName(mask),
              step: `${step.ladder} ${step.rung}`,
              situation,
              paidOnEntry: paid.join('+') || 'none',
              tally: result.tally,
              tie: /(\d+) to \1(?!\d)/.test(result.tally),
            });
          }
        }
      }
    }
  }
  return { traps, entries };
}

describe('no policy step the assembly cannot leave (rule 4)', () => {
  it('reads the risky steps from the code: three red lines, worn rolls and thin stocks', () => {
    expect(conditionsRaisedOn('maintenance', 1)).toEqual([]);
    expect(conditionsRaisedOn('stock', 1)).toEqual([]);
    expect(RISKY.map((s) => `${s.ladder} ${s.rung} ${s.conditions.join(',')}`)).toEqual([
      'maintenance 0 worn-rolls',
      'intake 0 ',
      'stock 0 thin-stocks',
      'orders 0 ',
    ]);
  });

  it('every crew can leave every red-line step and every condition-raising step it can enter', () => {
    const { traps, entries } = enumerateTraps();
    expect(entries).toBeGreaterThan(64);
    expect(
      traps.map(
        (t) =>
          `${t.crew} | ${t.step} | ${t.situation} | paid ${t.paidOnEntry} | ${t.tie ? 'tie' : 'lost'} | ${t.tally}`
      )
    ).toEqual([]);
  });

  it('the reported crew, drawn by a real seed, can vote Lean in and back out', () => {
    let state = prepared(signed(namedSeed()));
    state = proposePolicy(state, 'stock', 0).state;
    expect(state.governance.policies.stock).toBe(0);
    expect(state.governance.countdowns.map((c) => c.party)).toEqual(['village']);
    // The way back ties 1 to 1: the yard hand prefers Lean, the roll fitter backs any change.
    state = proposePolicy(prepared(state), 'stock', 1).state;
    expect(state.governance.policies.stock).toBe(1);
    expect(state.governance.countdowns).toEqual([]);
  });

  it('the same crew can still leave Lean after the village has acted on its warning', () => {
    let state = prepared(signed(namedSeed()));
    state = proposePolicy(state, 'stock', 0).state;
    for (let i = 0; i < 3; i++) state = closeShift(state, evidence(), []).state;
    expect(state.governance.brokenOff).toContain('village:stock:0');
    expect(state.governance.policies.stock).toBe(0);
    state = proposePolicy(prepared(state), 'stock', 1).state;
    expect(state.governance.policies.stock).toBe(1);
  });
});

describe('a tie carries a move off a red line or a condition’s step, and nothing else', () => {
  const none = { conditions: [] };
  const worn = { conditions: [{ id: 'worn-rolls' as const, sinceShift: 1 }] };

  it('names each condition’s step as the plant’s own assessment raises and clears it', () => {
    for (const step of RISKY)
      for (const id of step.conditions) {
        expect(CONDITION_POLICY_STEPS[id]).toEqual({ ladder: step.ladder, rung: step.rung });
        for (const to of neighbours(step.rung)) {
          const cleared = assessConditions({
            shift: 20,
            conditions: [{ id, sinceShift: 1 }],
            streaks: { outOfAusterity: 20, runToFailure: 0, offRunToFailure: 20, stockedUp: 20 },
            policies: { ...MIDDLE_POLICIES, [step.ladder]: to },
            austerity: { active: false, shifts: 0 },
            installed: [],
            delayedTruckStruck: false,
            machineryRenewed: false,
          }).cleared;
          expect(cleared).toContain(id);
        }
      }
  });

  it('carries a tie only off a red line or off a standing condition’s step', () => {
    expect(tieCarries(none, { ladder: 'stock', from: 0, to: 1 })).toBe(true);
    expect(tieCarries(none, { ladder: 'intake', from: 0, to: 1 })).toBe(true);
    expect(tieCarries(none, { ladder: 'orders', from: 0, to: 1 })).toBe(true);
    // Onto a red line, or anywhere else, a tie still does not carry.
    expect(tieCarries(none, { ladder: 'stock', from: 1, to: 0 })).toBe(false);
    expect(tieCarries(none, { ladder: 'stock', from: 1, to: 2 })).toBe(false);
    expect(tieCarries(none, { ladder: 'stock', from: 2, to: 1 })).toBe(false);
    expect(tieCarries(none, { ladder: 'maintenance', from: 0, to: 1 })).toBe(false);
    expect(tieCarries(worn, { ladder: 'maintenance', from: 0, to: 1 })).toBe(true);
    expect(tieCarries(worn, { ladder: 'maintenance', from: 1, to: 2 })).toBe(false);
  });

  it('leaves run-to-failure on a tie only while worn rolls stand', () => {
    const base = signed();
    const crew: CrewMember[] = [
      // Prefers run-to-failure: against the way off it.
      { ...CREW_PROFILES.yard[0], prefers: { ladder: 'maintenance', rung: 0 } },
      // Backs any change that leaves them be.
      { ...CREW_PROFILES['intake-grader'][1] },
    ];
    const onRunToFailure = (conditions: ChronicleState['governance']['conditions']) =>
      prepared({
        ...base,
        governance: {
          ...base.governance,
          crew,
          conditions,
          policies: { ...MIDDLE_POLICIES, maintenance: 0 },
        },
      });
    const plain = proposePolicy(onRunToFailure([]), 'maintenance', 1).state;
    expect(proposalStanding(plain)).toMatchObject({ for: 1, against: 1, carried: false });
    expect(plain.governance.policies.maintenance).toBe(0);
    const worn = proposePolicy(
      onRunToFailure([{ id: 'worn-rolls', sinceShift: 0 }]),
      'maintenance',
      1
    ).state;
    expect(worn.governance.policies.maintenance).toBe(1);
  });

  it('adopts, and charges for, a tied move off Lean that an older save left open', () => {
    const base = prepared(signed(namedSeed()));
    const saved: ChronicleState = {
      ...base,
      governance: {
        ...base.governance,
        policies: { ...MIDDLE_POLICIES, stock: 0 },
        proposal: { ladder: 'stock', from: 0, to: 1, proposedShift: base.shift, concessions: [] },
      },
    };
    expect(proposalStanding(saved)).toMatchObject({ for: 1, against: 1, carried: true });
    const knowHow = saved.ledger.knowHow.policies ?? 0;
    const closed = closeShift(saved, evidence(), []).state;
    expect(closed.governance.policies.stock).toBe(1);
    expect(closed.governance.proposal).toBeNull();
    expect(closed.ledger.knowHow.policies).toBe(knowHow - POLICY_KNOW_HOW);
  });
});

/** The seed whose crew is the reported one: yard hand, roll fitter, grader, lab 0; packing, head miller 1. */
function namedSeed(): number {
  const named: Partial<Record<CrewRoleId, 0 | 1>> = {
    yard: 0,
    'roll-fitter': 0,
    'intake-grader': 0,
    lab: 0,
    packing: 1,
    'head-miller': 1,
  };
  for (let seed = 1; seed <= 20_000; seed++)
    if (crewForSeed(seed).every((m) => m === CREW_PROFILES[m.id][named[m.id] ?? 0])) return seed;
  throw new Error('no seed draws the reported crew');
}

/** A close that brings nothing but the shift's own reading. */
let minute = 0;
function evidence(): ShiftCloseEvidence {
  minute += 480;
  return {
    report: {
      id: `no-trap-${minute}`,
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
        dispatchedKg: 3000,
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
