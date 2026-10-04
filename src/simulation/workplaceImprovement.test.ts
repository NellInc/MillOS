import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  transitionWorkplace,
  workplaceReadiness,
  workplaceCapacity,
  workplaceTickCapacity,
  saveWorkplace,
  restoreWorkplace,
} from './bilateralWorkplace';
import { improvementSummary, improvementForecast } from './workplaceImprovement';
import type { WorkplaceCommand } from './bilateralWorkplace';
import type { WorkplaceProfile, WorkplaceState, ImprovementVerdict } from '../types/workplace';

function exercise(profile: WorkplaceProfile = 'cooperative', mode: 'game' | 'workshop' = 'game') {
  let state = createWorkplace(mode, 17);
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const agree = () => {
    run({ type: 'acknowledgeImprovement', args: [] });
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
  };
  const review = (verdict: ImprovementVerdict) => {
    run({ type: 'acknowledgeImprovementReview', args: [] });
    for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, verdict] });
    return run({ type: 'finishImprovementReview', args: [state.revision] });
  };
  expect(run({ type: 'beginImprovement', args: [profile, state.revision] }).changed).toBe(true);
  return {
    run,
    agree,
    review,
    get state() {
      return state;
    },
    set state(value: WorkplaceState) {
      state = value;
    },
  };
}

describe('worker-led handoff experiment', () => {
  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    'supports every ending and subsequent agreement under %s',
    (profile) => {
      for (const verdict of ['adopt', 'amend', 'stop'] as const) {
        const e = exercise(profile);
        e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
        e.run({ type: 'challengeImprovement', args: ['quality', 'qualification'] });
        e.agree();
        expect(workplaceReadiness(e.state).allowed).toBe(true);
        expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
        expect(e.state.finance.improvementSpend).toBe(32);
        expect(workplaceCapacity(e.state)).toBe(1.02);
        e.run({ type: 'tick', args: [90, 500, false] });
        expect(e.state.phase).toBe('review');
        const forecast = improvementForecast(e.state).kg;
        expect(e.review(verdict).changed).toBe(true);
        const cash = e.state.finance.cash;
        expect(e.run({ type: 'continueImprovement', args: [e.state.revision] }).changed).toBe(true);
        expect(e.state.finance.cash).toBe(cash);
        expect(e.state.improvement?.history[0].snapshot.finance.wagesPaid).toBe(108);
        expect(e.state.improvement?.history[0].snapshot.shippedKg).toBe(500);
        expect(e.state.improvement?.history[0].verdict).toBe(verdict);
        expect(e.state.improvement?.proposalId).toBe(
          verdict === 'adopt' ? 'buffer' : verdict === 'amend' ? 'briefing' : null
        );
        expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(false);
        if (verdict === 'stop')
          e.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
        e.agree();
        expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
        expect(e.state.finance.improvementSpend).toBe(verdict === 'adopt' ? 0 : 8);
        e.run({ type: 'tick', args: [90, 450, false] });
        expect(improvementSummary(e.state)?.lifetimeWages).toBe(216);
        const restored = restoreWorkplace(saveWorkplace(e.state));
        expect(restored.improvement?.history).toHaveLength(1);
        expect(restored.finance).toEqual(e.state.finance);
        expect(
          restored.improvement?.history[0].snapshot.members.every(
            (m) => m.preference === '' && !m.willingToCover
          )
        ).toBe(true);
        expect(forecast).toBeGreaterThan(0);
      }
    }
  );

  it('rejects wrong authors, stale terms, unsupported work and unfunded purchases atomically', () => {
    const e = exercise();
    const before = e.state;
    expect(e.run({ type: 'proposeImprovement', args: ['buffer', 'packing'] }).changed).toBe(false);
    expect(e.state).toBe(before);
    e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    const rev = e.state.revision;
    e.agree();
    e.run({ type: 'challengeImprovement', args: ['mind', 'forecast'] });
    expect(e.run({ type: 'activate', args: [rev] }).changed).toBe(false);
    expect(e.run({ type: 'selectPlan', args: ['cover'] }).changed).toBe(false);
    e.agree();
    e.state = { ...e.state, finance: { ...e.state.finance, cash: 139 } };
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(false);
    expect(e.state.finance.improvementSpend).toBe(0);
  });

  it('stops arrangement pacing immediately while retaining wages, sunk spending and refusal', () => {
    const e = exercise();
    e.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    e.agree();
    e.run({ type: 'vote', args: ['quality', false] });
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
    expect(workplaceCapacity(e.state)).toBe(0);
    expect(workplaceTickCapacity(e.state, 10)).toBeCloseTo(0.45);
    e.run({ type: 'tick', args: [10, 40, false] });
    const wages = e.state.finance.wagesPaid;
    expect(e.run({ type: 'stopImprovement', args: ['quality'] }).changed).toBe(true);
    expect(e.state.phase).toBe('active');
    expect(workplaceCapacity(e.state)).toBe(0.78);
    expect(e.state.finance.wagesPaid).toBe(wages);
    expect(e.state.finance.improvementSpend).toBe(8);
    e.run({ type: 'tick', args: [80, 400, false] });
    expect(e.state.members.find((m) => m.id === 'quality')?.earnedPay).toBe(27);
    expect(e.state.members.every((m) => m.extraMinutes === 0 && m.restMinutes === 15)).toBe(true);
    expect(e.review('adopt').changed).toBe(false);
    expect(e.review('stop').changed).toBe(true);
  });

  it('keeps remedy with its raiser and never advances away from recovery debt', () => {
    const e = exercise();
    e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    e.agree();
    e.run({ type: 'activate', args: [e.state.revision] });
    e.run({ type: 'object', args: ['mind', 'authority'] });
    expect(e.state.phase).toBe('review');
    expect(
      e.run({ type: 'resolveObjection', args: [e.state.objections[0].id, 'coordinator'] }).changed
    ).toBe(false);
    expect(e.review('stop').changed).toBe(false);
    e.run({ type: 'resolveObjection', args: [e.state.objections[0].id, 'mind'] });
    expect(e.review('stop').changed).toBe(true);
    e.state.members[0].recoveryOwedMinutes = 3;
    const before = e.state;
    expect(e.run({ type: 'continueImprovement', args: [e.state.revision] }).changed).toBe(false);
    expect(e.state).toBe(before);
  });

  it('revokes reload authority and rejects forged money or private nested records', () => {
    const e = exercise();
    e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    e.agree();
    e.run({ type: 'activate', args: [e.state.revision] });
    e.run({ type: 'tick', args: [12, 80, false] });
    const saved = saveWorkplace(e.state) as WorkplaceState;
    const restored = restoreWorkplace(saved);
    expect(restored.phase).toBe('review');
    expect(restored.improvement?.stopped).toBe(true);
    expect(workplaceCapacity(restored)).toBe(1);
    expect(restored.finance).toEqual(saved.finance);
    const forged = structuredClone(saved);
    forged.finance.improvementSpend = 1;
    forged.finance.cash += 31;
    expect(restoreWorkplace(forged).phase).toBe('idle');
    const privateHistory = structuredClone(saved);
    privateHistory.improvement!.origin.members[0].preference = 'private';
    expect(restoreWorkplace(privateHistory).phase).toBe('idle');
  });

  it('runs a facilitator-only workshop without a shipment or plant capacity claim', () => {
    const e = exercise('team', 'workshop');
    e.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    e.agree();
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
    e.run({ type: 'tick', args: [90, 9000, false] });
    expect(e.state.shippedKg).toBe(0);
    expect(workplaceCapacity(e.state)).toBe(1);
    expect(e.review('amend').changed).toBe(true);
    const pilot = createWorkplace('pilot');
    expect(
      transitionWorkplace(pilot, { type: 'beginImprovement', args: ['team', pilot.revision] })
        .changed
    ).toBe(false);
  });
});

it('retains the origin campaign, caps eight shifts without discarding receipts and rejects forged history', () => {
  const e = exercise();
  for (let cycle = 0; cycle < 8; cycle++) {
    if (!e.state.improvement?.proposalId)
      e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    e.agree();
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
    e.run({ type: 'tick', args: [90, 600, false] });
    expect(e.review('adopt').changed).toBe(true);
    const before = e.state;
    const next = e.run({ type: 'continueImprovement', args: [e.state.revision] });
    if (cycle < 7) expect(next.changed).toBe(true);
    else {
      expect(next.changed).toBe(false);
      expect(e.state).toBe(before);
    }
  }
  expect(e.state.improvement?.history).toHaveLength(7);
  expect(improvementSummary(e.state)?.lifetimeWages).toBe(864);
  const saved = saveWorkplace(e.state) as WorkplaceState;
  expect(restoreWorkplace(saved).improvement?.history).toHaveLength(7);
  const forged = structuredClone(saved);
  forged.improvement!.history[0].snapshot.finance.improvementSpend = 0;
  forged.improvement!.history[0].snapshot.finance.cash += 32;
  expect(restoreWorkplace(forged).phase).toBe('idle');
  const privateSave = structuredClone(saved);
  privateSave.improvement!.history[0].snapshot.members[0].preference = 'private detail';
  expect(restoreWorkplace(privateSave).phase).toBe('idle');
  expect(e.run({ type: 'start', args: ['game', 17] }).changed).toBe(false);
});

it('freezes the disclosed forecast after stopping and rejects minority-imposed review', () => {
  const e = exercise('team');
  e.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
  const forecast = improvementForecast(e.state).kg;
  e.agree();
  e.run({ type: 'activate', args: [e.state.revision] });
  e.run({ type: 'stopImprovement', args: ['mind'] });
  expect(improvementForecast(e.state).kg).toBe(forecast);
  e.run({ type: 'tick', args: [90, 100, false] });
  e.run({ type: 'acknowledgeImprovementReview', args: [] });
  for (const m of e.state.members)
    e.run({ type: 'voteImprovementReview', args: [m.id, m.id === 'quality' ? 'amend' : 'stop'] });
  expect(e.run({ type: 'finishImprovementReview', args: [e.state.revision] }).changed).toBe(false);
  expect(e.state.members.every((m) => m.earnedPay === 27)).toBe(true);
});

it('restores a proposal cancelled before funding after a fully paid steady fallback shift', () => {
  const e = exercise();
  e.run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
  e.run({ type: 'stopImprovement', args: ['quality'] });
  e.agree();
  expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
  e.run({ type: 'tick', args: [90, 100, false] });
  expect(e.state.finance.wagesPaid).toBe(108);
  expect(e.state.finance.improvementSpend).toBe(0);
  const restored = restoreWorkplace(saveWorkplace(e.state));
  expect(restored.finance).toEqual(e.state.finance);
  expect(restored.improvement?.stopped).toBe(true);
  expect(restored.improvement?.funded).toBe(false);
  e.state = restored;
  e.run({ type: 'acknowledgeImprovementReview', args: [] });
  expect(e.run({ type: 'voteImprovementReview', args: ['packing', 'adopt'] }).changed).toBe(false);
  expect(e.review('stop').changed).toBe(true);
  expect(e.run({ type: 'continueImprovement', args: [e.state.revision] }).changed).toBe(true);
  expect(e.state.improvement?.history[0].snapshot.finance.wagesPaid).toBe(108);
  expect(restoreWorkplace(saveWorkplace(e.state)).finance).toEqual(e.state.finance);
});
