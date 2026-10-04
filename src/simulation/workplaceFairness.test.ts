import { describe, expect, it } from 'vitest';
import { createWorkplace, transitionWorkplace, type WorkplaceCommand } from './bilateralWorkplace';
import { fairnessReceipt, participationReceipt, demonstrationBeats } from './workplaceFairness';
import { WORKPLACE_CHECKS } from './workplaceCampaign';

describe('individual public cooperative receipts', () => {
  it('sums historical campaign burden and earned pay without inventing missing qualitative evidence', () => {
    let s = createWorkplace();
    const run = (c: WorkplaceCommand) => {
      s = transitionWorkplace(s, c).state;
    };
    run({ type: 'startCampaign', args: ['cooperative', 17] });
    run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] });
    for (const m of [...s.members.map((m) => m.id), 'mind']) {
      for (const q of WORKPLACE_CHECKS.filter((q) =>
        m === 'mind' ? q.id !== 'repayment' : q.id !== 'authority'
      ))
        run({ type: 'answerCheck', args: [m, q.id, q.correct] });
      if (m !== 'mind') {
        run({ type: 'understand', args: [m] });
        run({ type: 'vote', args: [m, true] });
      }
    }
    run({ type: 'activate', args: [s.revision] });
    run({ type: 'tick', args: [90, 480, false] });
    run({ type: 'nextCampaignShift', args: [] });
    const r = fairnessReceipt(s)[0];
    expect(r.earnedPayAndMemberDistributions).toBe(27);
    expect(r.historicalObjectionDetail).toContain('not recorded');
    expect(r.restMinutes).toBe(15);
    const before = structuredClone(s);
    participationReceipt(s, 'separate-turns');
    demonstrationBeats(s);
    expect(s).toEqual(before);
  });
  it('traverses retained improvement origin and historical snapshots once', () => {
    const s = createWorkplace();
    const origin = createWorkplace();
    origin.members[0].earnedPay = 12;
    origin.members[0].extraMinutes = 5;
    const previous = createWorkplace();
    previous.members[0].earnedPay = 27;
    previous.members[0].compensationPaid = 8;
    previous.members[0].recoveryOwedMinutes = 4;
    s.members[0].earnedPay = 2;
    s.improvement = {
      version: 1,
      origin,
      history: [
        {
          proposalId: 'briefing',
          proposerId: 'packing',
          challenges: [],
          acknowledged: true,
          forecastKg: 0,
          funded: true,
          stopped: false,
          reviewAcknowledged: true,
          ballots: {},
          verdict: 'adopt',
          snapshot: previous,
        },
      ],
      proposalId: null,
      proposerId: null,
      challenges: [],
      acknowledged: false,
      forecastKg: null,
      funded: false,
      stopped: false,
      reviewAcknowledged: false,
      ballots: {},
      verdict: null,
    };
    const r = fairnessReceipt(s)[0];
    expect(r.earnedPayAndMemberDistributions).toBe(41);
    expect(r.compensationPaid).toBe(8);
    expect(r.earlierExtraMinutes).toBe(5);
    expect(r.recoveryOwed).toBe(4);
  });
  it('excludes optional private preference reasons and labels modeled and authored facts', () => {
    const s = createWorkplace();
    s.members[0].sharing = true;
    s.members[0].preference = 'PRIVATE SYNTHETIC REASON';
    s.events.push({
      id: 'e-1',
      minute: 0,
      actorId: 'mind',
      kind: 'adviser-correction',
      detail: 'Public authored correction.',
    });
    const receipt = participationReceipt(s, 'separate-turns');
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE SYNTHETIC REASON');
    expect(receipt.modeled.statements[0].source).toBe('authored-scenario-dialogue');
    expect(receipt.participation.authentication).toBe(false);
    expect(receipt.actual.physicalDispatch).toBeNull();
  });
  it('does not mark an unanswered challenge as a correction', () => {
    const s = createWorkplace();
    s.events.push({
      id: 'e-1',
      minute: 0,
      actorId: 'packing',
      kind: 'improvement-challenged',
      detail: 'forecast',
    });
    expect(demonstrationBeats(s)[3].observed).toBe(false);
  });
});
