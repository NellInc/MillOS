import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  requiredChecks,
  thursdayNegotiation,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';
import { setLocale, translate } from '../i18n';

afterEach(() => setLocale('en'));

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

function resumedCoverAtThursday(ticks: number) {
  setLocale('en');
  const s = season();
  s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
  s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[0].id, 'protect-boundary'] });
  s.run({ type: 'selectPlan', args: ['cover'] });
  s.agree();
  s.run({ type: 'consentToCover', args: ['packing', true] });
  expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
  for (let i = 0; i < ticks; i++) s.run({ type: 'tick', args: [5, 0, false] });
  s.reload();
  s.run({ type: 'resumeShift', args: [s.state.revision] });
  s.agree();
  s.state.campaign!.shift = 2;
  s.state.events.push({
    id: 'e-thursday-correction',
    minute: s.state.minute,
    actorId: 'mind',
    kind: 'adviser-correction',
    detail: 'Public authored correction.',
  });
  return thursdayNegotiation(s.state)!;
}

// The Thursday card's next step stopped asking Packing about cover that its
// consent can no longer decide (pass fifteen), but the card's own "Optional
// cover" readout, beside that step, still read "pending" for good: two parts
// of one card disagreed about whether anything was being asked.
// Working if the readout says the consent is not needed whenever the next step
// does not ask for it.
describe('the Thursday card says cover consent is not needed when it cannot decide', () => {
  it('does not read "pending" for cover already worked out', () => {
    const moment = resumedCoverAtThursday(3);
    expect(moment.next).not.toBe(translate(workplaceCampaignMessages, 'nextCoverPending'));
    expect(moment.cover).toBe('not needed');
  });

  it('does not read "pending" for cover another member began', () => {
    const moment = resumedCoverAtThursday(1);
    expect(moment.next).not.toBe(translate(workplaceCampaignMessages, 'nextCoverPending'));
    expect(moment.cover).toBe('not needed');
  });
});
