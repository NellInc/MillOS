import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  campaignOutcomes,
  CAMPAIGN_PRESSURES,
  requiredChecks,
  shiftResumable,
  thursdayNegotiation,
  WORKPLACE_CHECKS,
  mondayMinute,
} from './workplaceCampaign';
import { setLocale, translate } from '../i18n';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';

function pausedFinalShift() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    state = transitionWorkplace(state, command).state;
  };
  run({ type: 'startCampaign', args: ['cooperative', 41] });
  for (let shift = 0; shift < 3; shift++) {
    if (shift > 0) run({ type: 'nextCampaignShift', args: [] });
    if (shift !== 1)
      run({
        type: 'campaignDecision',
        args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
      });
    run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[shift].id, 'protect-boundary'] });
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
    run({ type: 'activate', args: [state.revision] });
    const stopAt = shift === 2 ? 40 : 90;
    while (state.phase === 'active' && state.minute < stopAt) {
      if (
        state.campaign?.shift === 1 &&
        state.minute >= mondayMinute(state) &&
        state.campaign.decision === null
      )
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
  }
  // A reload forty minutes into the final shift.
  return restoreWorkplace(saveWorkplace(state));
}

// A reload pauses the final shift; it can resume, and the agreement reads
// "pending". The delivery beside it read "shortfall" and the Thursday card's
// next step said to compare actual work with the agreement, as if it had ended.
describe('a final shift a reload paused is not read as ended (pass seventeen)', () => {
  it('keeps the delivery pending and points the Thursday card at resuming', () => {
    setLocale('en');
    const s = pausedFinalShift();
    expect(s.campaign?.shift).toBe(2);
    expect(s.minute).toBe(40);
    expect(shiftResumable(s)).toBe(true);
    const outcome = campaignOutcomes(s);
    expect(outcome.agreement.status).toBe('pending');
    expect(outcome.delivery.status).toBe('pending');
    const moment = thursdayNegotiation(s)!;
    expect(moment.next).not.toBe(translate(workplaceCampaignMessages, 'nextReview'));
    expect(moment.next).toBe(translate(workplaceCampaignMessages, 'nextResume'));
  });
});
