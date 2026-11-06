import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceReadiness,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  requiredChecks,
  shiftResumable,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { setLocale, translate } from '../i18n';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';

function season() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 23] });
  const agree = () => {
    for (const actor of ['packing', 'mind']) {
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
      if (actor !== 'mind') run({ type: 'understand', args: [actor] });
    }
    run({ type: 'vote', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  return {
    run,
    agree,
    get state() {
      return state;
    },
    reload() {
      state = restoreWorkplace(saveWorkplace(state));
    },
  };
}

// A resumed shift was funded when it first activated: activation then reserves
// wages only for the minutes left and buys nothing again. Readiness demanded
// the whole shift's wages and the plan purchase a second time, so a lean
// season could not resume a shift it could pay for.
describe('a shift resumed after a reload is judged on what is left to pay (pass thirteen)', () => {
  it('resumes a re-sequenced shift whose cash covers the remaining wages', () => {
    setLocale('en');
    const s = season();
    // Shift one: re-sequenced (a 40-credit purchase), nothing dispatched.
    s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[0].id, 'protect-boundary'] });
    expect(s.run({ type: 'selectPlan', args: ['resequence'] }).changed).toBe(true);
    s.agree();
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    while (s.state.phase === 'active') s.run({ type: 'tick', args: [5, 0, false] });
    expect(s.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
    // Shift two: the same, reloaded at minute 60.
    s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[1].id, 'protect-boundary'] });
    expect(s.run({ type: 'selectPlan', args: ['resequence'] }).changed).toBe(true);
    s.agree();
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    for (let i = 0; i < 12; i++) s.run({ type: 'tick', args: [5, 0, false] });
    expect(s.state.minute).toBe(60);
    s.reload();
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.agree();
    // 400 - 2 x 40 purchase - 150 minutes of wages: 140 credits, and the 30
    // minutes left cost 36. Nothing is bought again.
    expect(s.state.finance.cash).toBeCloseTo(140, 6);
    const readiness = workplaceReadiness(s.state);
    expect(readiness.reasons).not.toContain(translate(bilateralWorkplaceMessages, 'readyFunds'));
    expect(readiness.allowed).toBe(true);
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    expect(s.state.finance.wageReserve).toBeCloseTo(36, 6);
    expect(s.state.finance.cash).toBeCloseTo(140, 6);
  });

  it('still refuses a resumed shift that cannot pay for the minutes left', () => {
    setLocale('en');
    const s = season();
    s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[0].id, 'protect-boundary'] });
    s.agree();
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    for (let i = 0; i < 6; i++) s.run({ type: 'tick', args: [5, 0, false] });
    s.reload();
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.agree();
    const poor = structuredClone(s.state);
    // Remaining 60 minutes x 4 members x 0.3 = 72 credits.
    poor.finance.cash = 71;
    expect(workplaceReadiness(poor).reasons).toContain(
      translate(bilateralWorkplaceMessages, 'readyFunds')
    );
    poor.finance.cash = 72;
    expect(workplaceReadiness(poor).reasons).not.toContain(
      translate(bilateralWorkplaceMessages, 'readyFunds')
    );
  });
});
