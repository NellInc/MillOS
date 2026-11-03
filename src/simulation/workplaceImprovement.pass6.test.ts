import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
} from './bilateralWorkplace';
import { shiftResumable } from './workplaceCampaign';
import { improvementCost } from './workplaceImprovement';
import type { WorkplaceCommand } from './bilateralWorkplace';
import type { ImprovementVerdict, WorkplaceState } from '../types/workplace';

function exercise() {
  let state = createWorkplace('game', 17);
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
  expect(run({ type: 'beginImprovement', args: ['cooperative', state.revision] }).changed).toBe(
    true
  );
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

/** Cycle one is worked and decided; cycle two is open for deliberation. */
function secondCycle() {
  const e = exercise();
  e.run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
  e.agree();
  expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
  e.run({ type: 'tick', args: [90, 500, false] });
  expect(e.review('amend').changed).toBe(true);
  expect(e.run({ type: 'continueImprovement', args: [e.state.revision] }).changed).toBe(true);
  expect(e.state.phase).toBe('deliberating');
  expect(e.state.improvement?.history).toHaveLength(1);
  return e;
}

describe('a handoff deliberation reloaded before funding (pass six)', () => {
  it('resumes as a deliberation, costs no cycle, and funds exactly once', () => {
    const e = secondCycle();
    const before = e.state;
    expect(before.improvement?.proposalId).toBe('briefing');
    expect(before.improvement?.stopped).toBe(false);
    e.state = restoreWorkplace(saveWorkplace(before));
    expect(e.state.phase).toBe('review');
    expect(shiftResumable(e.state)).toBe(true);
    expect(e.run({ type: 'resumeShift', args: [e.state.revision] }).changed).toBe(true);
    expect(e.state.phase).toBe('deliberating');
    expect(e.state.improvement?.history).toHaveLength(1);
    expect(e.state.improvement?.funded).toBe(false);
    // The arrangement the members were deliberating is still the one on the table.
    expect(e.state.improvement?.stopped).toBe(false);
    expect(e.state.improvement?.proposalId).toBe('briefing');
    // Grants expired with the reload: nothing activates before fresh consent.
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(false);
    const cash = e.state.finance.cash;
    const cost = improvementCost(e.state);
    expect(cost).toBe(8);
    e.agree();
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
    expect(e.state.finance.improvementSpend).toBe(cost);
    expect(e.state.finance.cash).toBe(cash - cost);
    expect(e.state.improvement?.funded).toBe(true);
  });

  it('keeps a proposal the members themselves stopped as stopped', () => {
    const e = secondCycle();
    e.run({ type: 'stopImprovement', args: ['quality'] });
    expect(e.state.improvement?.stopped).toBe(true);
    e.state = restoreWorkplace(saveWorkplace(e.state));
    expect(e.run({ type: 'resumeShift', args: [e.state.revision] }).changed).toBe(true);
    expect(e.state.improvement?.stopped).toBe(true);
  });

  it('cannot be recorded as a reviewed cycle instead of resumed', () => {
    const e = secondCycle();
    e.state = restoreWorkplace(saveWorkplace(e.state));
    expect(e.review('stop').changed).toBe(false);
    expect(e.state.improvement?.verdict).toBeNull();
    expect(e.run({ type: 'continueImprovement', args: [e.state.revision] }).changed).toBe(false);
    expect(e.state.improvement?.history).toHaveLength(1);
  });

  it('a funded or activated shift that a reload settled stays settled', () => {
    const funded = secondCycle();
    funded.agree();
    expect(funded.run({ type: 'activate', args: [funded.state.revision] }).changed).toBe(true);
    funded.state = restoreWorkplace(saveWorkplace(funded.state));
    expect(funded.state.phase).toBe('review');
    expect(shiftResumable(funded.state)).toBe(false);
    // Steady work activated at minute 0 was not funded, but it was activated.
    const steady = secondCycle();
    steady.run({ type: 'stopImprovement', args: ['quality'] });
    steady.agree();
    expect(steady.run({ type: 'activate', args: [steady.state.revision] }).changed).toBe(true);
    expect(steady.state.improvement?.funded).toBe(false);
    steady.state = restoreWorkplace(saveWorkplace(steady.state));
    expect(steady.state.minute).toBe(0);
    expect(shiftResumable(steady.state)).toBe(false);
  });

  it('a manual stop of the deliberation is not resumable', () => {
    const e = secondCycle();
    expect(e.run({ type: 'stop', args: [] }).changed).toBe(true);
    expect(shiftResumable(e.state)).toBe(false);
    expect(e.state.improvement?.stopped).toBe(true);
  });
});
