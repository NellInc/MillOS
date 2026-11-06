import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkplaceNegotiation } from './WorkplaceNegotiation';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import { setLocale } from '../../../i18n';

function finalShift(stopAt: number) {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    state = transitionWorkplace(state, command).state;
  };
  run({ type: 'startCampaign', args: ['cooperative', 43] });
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
    const end = shift === 2 ? stopAt : 90;
    while (state.phase === 'active' && state.minute < end) {
      if (state.campaign?.shift === 1 && state.minute >= 25 && state.campaign.decision === null)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
  }
  return restoreWorkplace(saveWorkplace(state));
}

afterEach(() => {
  cleanup();
  setLocale('en');
});

// The Thursday card told a player whose final shift a reload had paused to
// "review the actual shortfall", beside a chapter line saying to resume it.
describe('Thursday card on a final shift a reload paused (pass seventeen)', () => {
  it('points at resuming and does not ask for a shortfall review', () => {
    setLocale('en');
    render(<WorkplaceNegotiation state={finalShift(40)} />);
    expect(screen.getByText(/A reload paused this shift before its end/)).toBeTruthy();
    expect(screen.queryByText(/Review the actual shortfall/)).toBeNull();
    expect(screen.queryByText(/Compare actual work with the agreement/)).toBeNull();
  });

  it('still asks for the review once the final shift has ended', () => {
    setLocale('en');
    render(<WorkplaceNegotiation state={finalShift(90)} />);
    expect(screen.getByText(/Review the actual shortfall/)).toBeTruthy();
    expect(screen.getByText(/Compare actual work with the agreement/)).toBeTruthy();
  });
});
