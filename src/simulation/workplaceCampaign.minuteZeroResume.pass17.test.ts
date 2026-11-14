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
  CAMPAIGN_PRESSURES,
  requiredChecks,
  shiftResumable,
  WORKPLACE_CHECKS,
  mondayMinute,
} from './workplaceCampaign';
import { setLocale } from '../i18n';

function season() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 31] });
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
    if (state.planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  const prepare = (shift: number, plan: 'steady' | 'resequence' = 'steady') => {
    if (shift !== 1)
      run({
        type: 'campaignDecision',
        args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
      });
    run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[shift].id, 'protect-boundary'] });
    if (plan !== state.planId) run({ type: 'selectPlan', args: [plan] });
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
    reload() {
      state = restoreWorkplace(saveWorkplace(state));
    },
  };
}

// A shift approved while the plant is paused stays at minute 0 until play
// resumes; a reload in that window settled it for good, so the season could
// never be honoured (every reviewed shift must reach minute 90). Nothing was
// worked or paid: only the bounded adviser action had been counted.
describe('a shift approved at minute 0 and reloaded before play resumes (pass seventeen)', () => {
  it('resumes with fresh consent, buys nothing twice, and the season can still be honoured', () => {
    setLocale('en');
    const s = season();
    s.prepare(0, 'resequence');
    s.agree();
    expect(s.activate().changed).toBe(true);
    const afterFirst = {
      cash: s.state.finance.cash,
      spend: s.state.finance.improvementSpend,
      ai: s.state.aiActions,
    };
    expect(afterFirst.spend).toBe(40);
    // Reload while paused: the shift never left minute 0.
    s.reload();
    expect(s.state.minute).toBe(0);
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.prepare(0, 'resequence');
    s.agree();
    expect(s.activate().changed).toBe(true);
    expect(s.state.aiActions).toBe(afterFirst.ai);
    expect(s.state.finance.improvementSpend).toBe(afterFirst.spend);
    expect(s.state.finance.cash).toBe(afterFirst.cash);
    s.finish();
    expect(s.state.minute).toBe(90);
    for (const shift of [1, 2]) {
      expect(s.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
      s.prepare(shift);
      s.agree();
      expect(s.activate().changed).toBe(true);
      s.finish();
    }
    expect(campaignAgreementHonoured(s.state)).toBe(true);
    // The honoured season survives its own save (a double-counted adviser
    // action would make restore fall back to a fresh workplace).
    s.reload();
    expect(s.state.campaign?.shift).toBe(2);
    expect(campaignAgreementHonoured(s.state)).toBe(true);
  });

  it('a reload mid-resumed shift still restores (the adviser action is counted once)', () => {
    setLocale('en');
    const s = season();
    s.prepare(0);
    s.agree();
    expect(s.activate().changed).toBe(true);
    s.reload();
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.prepare(0);
    s.agree();
    expect(s.activate().changed).toBe(true);
    for (let i = 0; i < 6; i++) s.run({ type: 'tick', args: [5, 0, false] });
    s.reload();
    expect(s.state.campaign?.shift).toBe(0);
    expect(s.state.minute).toBe(30);
    expect(shiftResumable(s.state)).toBe(true);
  });
});
