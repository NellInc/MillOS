import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  campaignAgreementHonoured,
  campaignOutcomes,
  requiredChecks,
  shiftResumable,
  WORKPLACE_CHECKS,
  CAMPAIGN_PRESSURES,
  mondayMinute,
} from './workplaceCampaign';

function campaign() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 17] });
  const understand = (actor: string) => {
    for (const id of requiredChecks(actor))
      run({
        type: 'answerCheck',
        args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
      });
    if (actor !== 'mind') run({ type: 'understand', args: [actor] });
  };
  const agree = () => {
    understand('packing');
    understand('mind');
    run({ type: 'vote', args: ['packing', true] });
    if (state.planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  const prepare = (shift: number) => {
    if (shift !== 1)
      run({
        type: 'campaignDecision',
        args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
      });
    run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[shift].id, 'protect-boundary'] });
  };
  const finish = () => {
    while (state.phase === 'active') {
      if (
        state.campaign?.shift === 1 &&
        state.minute >= mondayMinute(state) &&
        state.campaign.decision === null
      )
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
  };
  return {
    run,
    agree,
    prepare,
    finish,
    activate: () => run({ type: 'activate', args: [state.revision] }),
    get state() {
      return state;
    },
    restore() {
      state = restoreWorkplace(saveWorkplace(state));
    },
  };
}

describe('a reload before a campaign shift is approved', () => {
  it('pauses the deliberation for fresh consent instead of spending the shift', () => {
    const c = campaign();
    for (let shift = 0; shift < 3; shift++) {
      c.prepare(shift);
      // Reload mid-deliberation, before anyone approved the shift.
      c.restore();
      expect(c.state.phase).toBe('review');
      expect(c.state.minute).toBe(0);
      expect(shiftResumable(c.state)).toBe(true);
      expect(c.run({ type: 'resumeShift', args: [c.state.revision] }).changed).toBe(true);
      expect(c.state.phase).toBe('deliberating');
      c.prepare(shift);
      c.agree();
      const cash = c.state.finance.cash;
      expect(c.activate().changed).toBe(true);
      // Funded once: nothing was bought before the reload, so nothing is refunded or doubled.
      expect(c.state.finance.improvementSpend).toBe(cash - c.state.finance.cash);
      expect(c.state.aiActions).toBe(1);
      c.finish();
      expect(c.state.minute).toBe(90);
      if (shift < 2) expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
    }
    expect(campaignAgreementHonoured(c.state)).toBe(true);
    expect(campaignOutcomes(c.state).agreement.status).toBe('honoured');
    // The completed season still survives its own save.
    c.restore();
    expect(c.state.campaign?.shift).toBe(2);
    expect(campaignAgreementHonoured(c.state)).toBe(true);
  });

  // Pass seventeen: an approved shift reloaded before its first minute (the
  // plant was paused) resumes too; re-approval counts the bounded action once.
  it('resumes an approved shift reloaded before its first minute without counting it twice', () => {
    const c = campaign();
    c.prepare(0);
    c.agree();
    expect(c.activate().changed).toBe(true);
    c.restore();
    expect(c.state.minute).toBe(0);
    expect(shiftResumable(c.state)).toBe(true);
    expect(c.run({ type: 'resumeShift', args: [c.state.revision] }).changed).toBe(true);
    c.prepare(0);
    c.agree();
    expect(c.activate().changed).toBe(true);
    expect(c.state.aiActions).toBe(1);
  });
});
