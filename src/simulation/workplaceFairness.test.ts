import type { WorkplaceReplayRun } from '../types/workplaceReplay';
import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  fairnessReceipt,
  participationReceipt,
  demonstrationBeats,
  replayLearningReview,
} from './workplaceFairness';
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

describe('guide evidence follows actual cooperative choices and work', () => {
  function exercise(mode: 'game' | 'workshop' = 'game', plan: 'steady' | 'cover' = 'steady') {
    let state = createWorkplace();
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
      state = result.state;
    };
    run({ type: 'start', args: [mode, 17] });
    if (plan !== 'steady') run({ type: 'selectPlan', args: [plan] });
    return {
      run,
      respond() {
        for (const { id } of state.members) {
          run({ type: 'understand', args: [id] });
          run({ type: 'vote', args: [id, true] });
        }
      },
      activate() {
        run({ type: 'activate', args: [state.revision] });
      },
      get state() {
        return state;
      },
    };
  }

  it('leaves every optional demonstration available in a fresh exercise', () => {
    const c = exercise();
    expect(c.state.members.every((m) => m.coverConsent === null)).toBe(true);
    expect(demonstrationBeats(c.state).every((beat) => !beat.observed)).toBe(true);
  });

  it('does not call activation work before any agreement time has elapsed', () => {
    const c = exercise();
    c.respond();
    c.activate();
    expect(c.state.aiActions).toBe(1);
    expect(c.state.minute).toBe(0);
    expect(demonstrationBeats(c.state)[4].observed).toBe(false);
    c.run({ type: 'tick', args: [1, 0, false] });
    expect(demonstrationBeats(c.state)[4].observed).toBe(true);
    expect(c.state.shippedKg).toBe(0);
  });

  it('recognizes actual workshop work time without inventing adviser actions or goods', () => {
    const c = exercise('workshop');
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [2, 0, false] });
    expect(c.state.aiActions).toBe(0);
    expect(c.state.shippedKg).toBe(0);
    expect(demonstrationBeats(c.state)[4].observed).toBe(true);
  });

  it('does not credit active earnings as a finished money and recovery settlement', () => {
    const c = exercise();
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [1, 0, false] });
    expect(c.state.members.every((m) => m.earnedPay > 0)).toBe(true);
    expect(c.state.finance.wageReserve).toBeGreaterThan(0);
    expect(demonstrationBeats(c.state)[5].observed).toBe(false);
    c.run({ type: 'stop', args: [] });
    expect(demonstrationBeats(c.state)[5].observed).toBe(true);
  });

  it('keeps privacy withdrawal distinct from refusing optional extra duty', () => {
    const c = exercise();
    c.run({ type: 'sharePreference', args: ['packing', true] });
    c.run({ type: 'withdraw', args: ['packing'] });
    expect(c.state.members[0].coverConsent).toBe(false);
    expect(c.state.members[0].refusalRespected).toBe(false);
    expect(demonstrationBeats(c.state)[1].observed).toBe(false);
    expect(demonstrationBeats(c.state)[2].observed).toBe(true);
  });

  it('retains a genuinely respected cover refusal after current grants are cleared', () => {
    const c = exercise('game', 'cover');
    c.respond();
    c.run({ type: 'consentToCover', args: ['packing', false] });
    c.run({ type: 'consentToCover', args: ['maintenance', true] });
    expect(demonstrationBeats(c.state)[1].observed).toBe(false);
    c.activate();
    expect(c.state.members[0].refusalRespected).toBe(true);
    expect(demonstrationBeats(c.state)[1].observed).toBe(true);
    c.run({ type: 'stop', args: [] });
    expect(c.state.members[0].coverConsent).toBeNull();
    expect(demonstrationBeats(c.state)[1].observed).toBe(true);
  });

  it('observes a policy no without requiring optional disclosure or extra duty', () => {
    const c = exercise();
    c.run({ type: 'understand', args: ['packing'] });
    c.run({ type: 'vote', args: ['packing', false] });
    expect(demonstrationBeats(c.state)[1].observed).toBe(true);
    expect(demonstrationBeats(c.state)[2].observed).toBe(false);
    expect(c.state.members[0].earnedPay).toBe(0);
  });

  it('waits for actual review recovery before crediting settlement', () => {
    const c = exercise('game', 'cover');
    c.respond();
    c.run({ type: 'consentToCover', args: ['packing', true] });
    c.activate();
    c.run({ type: 'tick', args: [1, 0, false] });
    c.run({ type: 'stop', args: [] });
    expect(c.state.members[0].compensationPaid).toBeGreaterThan(0);
    expect(c.state.members[0].recoveryOwedMinutes).toBe(10);
    expect(demonstrationBeats(c.state)[5].observed).toBe(false);
    c.run({ type: 'tick', args: [10, 0, false] });
    expect(c.state.members[0].recoveryOwedMinutes).toBe(0);
    expect(demonstrationBeats(c.state)[5].observed).toBe(true);
  });

  it('recognizes actual safe reload from retained review state, not a discarded event', () => {
    const c = exercise();
    c.respond();
    c.activate();
    const before = structuredClone(c.state);
    participationReceipt(c.state, 'solo');
    expect(c.state).toEqual(before);
    expect(demonstrationBeats(c.state)[6].observed).toBe(false);
    const reloaded = restoreWorkplace(saveWorkplace(c.state));
    expect(reloaded.phase).toBe('review');
    expect(reloaded.events.some((event) => event.kind === 'settled')).toBe(false);
    expect(demonstrationBeats(reloaded)[6].observed).toBe(true);
    expect(reloaded.members.every((m) => !m.understood && m.coverConsent === null)).toBe(true);
  });

  it('carries retained public choices and work into handoff without settling the new trial', () => {
    const c = exercise();
    c.run({ type: 'sharePreference', args: ['packing', true] });
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [2, 0, false] });
    c.run({ type: 'stop', args: [] });
    c.run({ type: 'beginImprovement', args: ['cooperative', c.state.revision] });
    expect(c.state.minute).toBe(0);
    const before = structuredClone(c.state);
    const beats = demonstrationBeats(c.state);
    expect(beats[0].observed).toBe(false);
    expect(beats[2].observed).toBe(true);
    expect(beats[4].observed).toBe(true);
    expect(beats[5].observed).toBe(false);
    expect(c.state).toEqual(before);
  });
});

function replayRun(): WorkplaceReplayRun {
  const workplace = createWorkplace();
  return {
    id: 'run1',
    checkpointId: 'checkpoint1',
    profile: 'team',
    planId: 'steady',
    charter: {
      practices: [...workplace.practices],
      workerAutonomy: workplace.workerAutonomy,
      governance: workplace.governance,
      aiAuthority: workplace.aiAuthority,
    },
    shiftPlans: [{ shift: 0, planId: 'steady' }],
    shiftCount: 1,
    elapsedMinutes: 90,
    agreementMinutes: 90,
    targetKg: 600,
    deferredKg: 0,
    dispatchedKg: 123,
    remainingKg: 477,
    manifestIds: ['manifest1'],
    materialErrorKg: 0,
    genealogyErrorKg: 0,
    financial: {
      plantRevenue: 200,
      plantCosts: 50,
      workplaceWages: 32,
      compensation: 8,
      improvements: 0,
    },
    members: [],
    receipts: [],
    objections: [],
    objectionsRaised: 0,
    objectionsResolved: 0,
    refusalsRespected: 0,
    promisesKept: 0,
  };
}
describe('actual replay learning review', () => {
  it('needs two retained runs before inviting a comparison', () => {
    expect(replayLearningReview([])).toBeNull();
    expect(replayLearningReview([replayRun()])).toBeNull();
  });
  it('retains agreement duration in the horizon even when elapsed time and shifts match', () => {
    const a = replayRun(),
      b = { ...replayRun(), id: 'run2', agreementMinutes: 45 };
    expect(replayLearningReview([a, b])).toMatchObject({
      horizonsDiffer: true,
      question: expect.stringContaining('equally long trials'),
    });
    expect(replayLearningReview([a, { ...b, agreementMinutes: 90 }])?.horizonsDiffer).toBe(false);
  });
  it('compares actual charters, ignores practice ordering and profile labels, and preserves inputs', () => {
    const a = replayRun(),
      b: WorkplaceReplayRun = {
        ...replayRun(),
        id: 'run2',
        profile: 'cooperative',
        charter: { ...a.charter, practices: [...a.charter.practices].reverse() },
      };
    const before = structuredClone([a, b]);
    const review = replayLearningReview([a, b])!;
    expect(review.caveats).toEqual([]);
    expect(review.question).toContain('recorded charter and plan sequence match');
    expect([a, b]).toEqual(before);
    b.charter = { ...b.charter, aiAuthority: 'advice' };
    expect(replayLearningReview([a, b])?.question).toContain('recorded plan sequence matches');
  });
  it('separates changed work plans from changed charter without ranking output', () => {
    const a = replayRun(),
      b: WorkplaceReplayRun = {
        ...replayRun(),
        id: 'run2',
        shiftPlans: [{ shift: 0, planId: 'resequence' }],
      };
    expect(replayLearningReview([a, b])?.question).toContain('recorded charter held fixed');
    b.charter = { ...b.charter, governance: 'consultative' };
    const review = replayLearningReview([a, b])!;
    expect(review.caveats).toContain(
      'Both the recorded charter and shift-plan sequence changed. Their effects cannot be separated by this comparison.'
    );
    expect(review.question).toContain('Keep one charter and compare one plan change');
    expect(Object.keys(review).sort()).toEqual(['caveats', 'horizonsDiffer', 'question']);
  });
  it('keeps a smaller agreed installment separate from the full customer obligation', () => {
    const a = replayRun(),
      b = { ...replayRun(), id: 'run2', targetKg: 480, deferredKg: 120 };
    const review = replayLearningReview([a, b])!;
    expect(review.caveats.join(' ')).toContain('full customer commitment remaining');
    expect(review.question).toContain('what remains owed');
    expect(b.remainingKg).toBe(477);
  });
  it.each([0.02, -0.02, NaN, Infinity])(
    'quarantines uncertain balance evidence (%s) before a comparison lesson',
    (error) => {
      const a = replayRun(),
        b = { ...replayRun(), id: 'run2', genealogyErrorKg: error, agreementMinutes: 45 };
      const review = replayLearningReview([a, b])!;
      expect(review.horizonsDiffer).toBe(true);
      expect(review.caveats.join(' ')).toContain('unavailable or exceeds 0.01 kg');
      expect(review.question).toContain('checkpoint or balance fact');
    }
  );
  it('does not describe different retained checkpoints as matching starting conditions', () => {
    const a = replayRun(),
      b = { ...replayRun(), id: 'run2', checkpointId: 'another-checkpoint' };
    expect(replayLearningReview([a, b])?.caveats[0]).toContain('starting conditions as unmatched');
    expect(replayLearningReview([a, b])?.question).toContain('checkpoint or balance fact');
  });
});
