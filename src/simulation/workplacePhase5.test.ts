import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  authoredResponse,
  createWorkplace,
  displayEventDetail,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceAlternatives,
  workplaceCapacity,
  WORKPLACE_PLANS,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  CAMPAIGN_SHIFTS,
  LEGACY_SEASON_DRAW,
  campaignPressure,
  mondayMinute,
  requiredChecks,
  seasonDraw,
  seasonMinutesWorked,
  seasonReserveCarried,
  seasonSobrasPool,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { improvementCapacity, improvementCost, retainedImprovement } from './workplaceImprovement';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';
import { workplaceLabMessages } from '../components/ui-new/widgets/WorkplaceLab.messages';
import { LOCALES, translate } from '../i18n';
import type { WorkplaceProfile, WorkplaceState } from '../types/workplace';

const FIXTURES = join(__dirname, '__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const wm = bilateralWorkplaceMessages;

function season(profile: WorkplaceProfile = 'cooperative', seed = 17) {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const must = (command: WorkplaceCommand) => {
    const result = run(command);
    expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
    return result;
  };
  // The player is Packing; the adviser's checks stay explicit; the authored
  // roles answer for themselves.
  const agree = (plant?: { inspectionOpen?: boolean }) => {
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
    return run({ type: 'simulateResponses', args: plant ? [plant] : [] });
  };
  const finish = (shippedKg = 0) => {
    while (state.phase === 'active') {
      if (
        state.campaign?.shift === 1 &&
        state.minute >= mondayMinute(state) &&
        state.campaign.decision === null
      )
        must({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      must({ type: 'tick', args: [5, shippedKg / 18, false] });
    }
  };
  must({ type: 'startCampaign', args: [profile, seed] });
  return {
    run,
    must,
    agree,
    finish,
    get state() {
      return state;
    },
    set state(value: WorkplaceState) {
      state = value;
    },
  };
}

/** A whole season with the given kilograms shipped in each shift, steady throughout. */
function playSeason(shipped: [number, number, number], profile: WorkplaceProfile = 'cooperative') {
  const c = season(profile);
  c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
  for (let shift = 0; shift < 3; shift++) {
    if (shift === 2) c.must({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
    c.agree();
    c.must({ type: 'activate', args: [c.state.revision] });
    c.finish(shipped[shift]);
    if (shift < 2) c.must({ type: 'nextCampaignShift', args: [] });
  }
  return c;
}

const seedWith = (test: (seed: number) => boolean) => {
  for (let seed = 1; seed < 500; seed++) if (test(seed)) return seed;
  throw new Error('no seed');
};

describe('5.3 refusals happen to you (D5)', () => {
  it('one plan activates under member vote and is refused under team consent', () => {
    const outcomes: Record<string, boolean> = {};
    for (const profile of ['cooperative', 'team'] as const) {
      const c = season(profile);
      c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
      c.must({ type: 'selectPlan', args: ['resequence'] });
      c.agree();
      c.must({ type: 'activate', args: [c.state.revision] });
      c.finish(0);
      c.must({ type: 'nextCampaignShift', args: [] });
      // Two bought plans and nothing shipped: a second resequence would leave
      // the books under one shift's wages, so the Coordinator says no.
      c.must({ type: 'selectPlan', args: ['resequence'] });
      const heard = c.agree();
      const coordinator = c.state.members.find((m) => m.id === 'coordinator')!;
      expect(coordinator.ballot).toBe(false);
      expect(heard.reason).toBe(translate(wm, 'refuseCoordinatorWages'));
      const refusal = c.state.events.find(
        (e) => e.kind === 'authored-refusal' && e.actorId === 'coordinator'
      )!;
      expect(displayEventDetail(refusal.detail)).toBe(translate(wm, 'refuseCoordinatorWages'));
      outcomes[profile] = c.run({ type: 'activate', args: [c.state.revision] }).changed;
    }
    expect(outcomes).toEqual({ cooperative: true, team: false });
  });

  it('Quality refuses while an inspection is open, and says yes once it closes', () => {
    const c = season('team');
    c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    const heard = c.agree({ inspectionOpen: true });
    expect(c.state.members.find((m) => m.id === 'quality')!.ballot).toBe(false);
    expect(heard.reason).toBe(translate(wm, 'refuseQualityInspection'));
    expect(c.run({ type: 'activate', args: [c.state.revision] }).changed).toBe(false);
    c.must({ type: 'simulateResponses', args: [{ inspectionOpen: false }] });
    expect(c.state.members.find((m) => m.id === 'quality')!.ballot).toBe(true);
    c.must({ type: 'activate', args: [c.state.revision] });
  });

  it('the willing member declines cover after ten season minutes, in its own terms', () => {
    const seed = seedWith((n) => seasonDraw(n).decliner === 'coordinator');
    const c = season('cooperative', seed);
    c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.must({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    const member = (id: string) => c.state.members.find((m) => m.id === id)!;
    expect(member('maintenance').coverConsent).toBe(true);
    expect(member('coordinator').coverConsent).toBe(false);
    c.must({ type: 'activate', args: [c.state.revision] });
    expect(c.state.activeCoverMemberId).toBe('maintenance');
    c.finish(0);
    c.must({ type: 'nextCampaignShift', args: [] });
    c.must({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    expect(member('maintenance').coverConsent).toBe(false);
    const said = c.state.events.filter((e) => e.kind === 'authored-refusal');
    expect(said.map((e) => [e.actorId, e.detail])).toContainEqual([
      'maintenance',
      translate(wm, 'declineCoverDone'),
    ]);
    // No number about a person: each refusal is words.
    for (const e of said) expect(e.detail).not.toMatch(/\d/);
  });

  it('authored answers follow the drawn decliner and the plan, never the player', () => {
    const seed = seedWith((n) => seasonDraw(n).decliner === 'maintenance');
    const c = season('cooperative', seed);
    c.must({ type: 'selectPlan', args: ['cover'] });
    expect(authoredResponse(c.state, 'maintenance').cover).toBe(false);
    expect(authoredResponse(c.state, 'coordinator').cover).toBe(true);
    expect(authoredResponse(c.state, 'quality').cover).toBe(false);
  });

  it('drops "(blocked)" from the four labels in both languages', () => {
    for (const locale of LOCALES) {
      const labels = [
        workplaceCampaignMessages[locale].mondaySkip,
        workplaceCampaignMessages[locale].thursdayPenalize,
        wm[locale].planRushTitle,
        workplaceLabMessages[locale].tryDemand,
      ];
      for (const label of labels) expect(label).not.toMatch(/\((blocked|bloquead[ao])/i);
    }
    expect(CAMPAIGN_SHIFTS[1].choices.map((c) => c.label).join(' ')).not.toMatch(/blocked/);
  });
});

describe('5.4 cooperation is not the slow option', () => {
  function handoff(proposal: 'briefing' | 'buffer', stop = false) {
    let state = createWorkplace('game', 17);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
      state = result.state;
    };
    run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
    run({
      type: 'proposeImprovement',
      args: [proposal, proposal === 'briefing' ? 'packing' : 'maintenance'],
    });
    run({ type: 'acknowledgeImprovement', args: [] });
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
    run({ type: 'activate', args: [state.revision] });
    if (stop) run({ type: 'stopImprovement', args: ['quality'] });
    run({ type: 'tick', args: [10, 0, false] });
    return state;
  }

  it('runs every handoff arrangement, and a stopped one, at the line rate', () => {
    expect(improvementCapacity(handoff('buffer'))).toBe(1);
    expect(improvementCapacity(handoff('briefing'))).toBe(1);
    expect(improvementCapacity(handoff('buffer', true))).toBe(1);
    expect(workplaceCapacity(handoff('briefing', true))).toBe(1);
  });

  it('every plan that costs more than steady says on its button what it buys (5c)', () => {
    const steady = WORKPLACE_PLANS.find((p) => p.id === 'steady')!;
    for (const locale of LOCALES)
      for (const id of ['resequence', 'cover'] as const) {
        expect(WORKPLACE_PLANS.find((p) => p.id === id)!.capacity).toBe(steady.capacity);
        // Its cost, and what the plant then does differently (5.4): resequence
        // moves which order the next truck serves; cover does the work of the
        // role away at the shift's start.
        const explanation = wm[locale][
          id === 'cover' ? 'planCoverExplanation' : 'planResequenceExplanation'
        ] as string;
        expect(explanation, `${locale} ${id}`).toMatch(/^(Costs|Custa) /);
        expect(explanation, `${locale} ${id}`).toMatch(
          id === 'cover' ? /role away|função ausente/ : /next truck|próximo caminhão/
        );
      }
  });

  it('team consent can always agree steady: the Coordinator refuses only spending', () => {
    const c = season('team');
    c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    for (let shift = 0; shift < 3; shift++) {
      if (shift === 2)
        c.must({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      c.agree();
      expect(c.state.members.every((m) => m.ballot === true)).toBe(true);
      c.must({ type: 'activate', args: [c.state.revision] });
      c.finish(0);
      if (shift < 2) c.must({ type: 'nextCampaignShift', args: [] });
    }
    // Nothing shipped: the books are under a shift's wages and steady still ran.
    expect(c.state.finance.cash).toBeLessThan(108);
  });
});

describe('5.5 sobras as sobras (D18)', () => {
  it('refuses to share sobras before the season ends', () => {
    const c = season();
    c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.must({ type: 'activate', args: [c.state.revision] });
    c.finish(600);
    const vote = c.run({ type: 'voteSurplus', args: ['packing', 'members'] });
    expect(vote.changed).toBe(false);
    expect(vote.reasonCopy?.key).toBe('rejSurplusSeasonEnd');
  });

  it('takes the reserve and FATES first and returns the rest in proportion to minutes worked', () => {
    const c = playSeason([600, 600, 600]);
    const pool = seasonSobrasPool(c.state);
    expect(pool).toBeGreaterThan(0);
    for (const voter of ['packing', 'quality', 'maintenance'])
      c.must({ type: 'voteSurplus', args: [voter, 'members'] });
    const cashBefore = c.state.finance.cash;
    c.must({ type: 'distributeSurplus', args: [] });
    const sobras = c.state.sobras!;
    expect(sobras.pool).toBeCloseTo(pool, 6);
    expect(sobras.reserve).toBeCloseTo(pool * 0.1, 6);
    expect(sobras.fates).toBeCloseTo(pool * 0.05, 6);
    expect(sobras.remainder).toBeCloseTo(pool * 0.85, 6);
    const minutes = seasonMinutesWorked(c.state);
    const total = Object.values(minutes).reduce((n, v) => n + v, 0);
    for (const m of c.state.members)
      expect(sobras.shares[m.id]).toBeCloseTo((sobras.remainder * minutes[m.id]) / total, 6);
    // Only the members' return leaves the books; both funds stay with the co-op.
    expect(cashBefore - c.state.finance.cash).toBeCloseTo(sobras.remainder, 6);
    // The settled season reloads as it was.
    const restored = restoreWorkplace(saveWorkplace(c.state));
    expect(restored.campaign?.shift).toBe(2);
    expect(restored.sobras).toEqual(sobras);
  });

  it('a losing shift shrinks the pool', () => {
    const good = seasonSobrasPool(playSeason([600, 600, 600]).state);
    const losing = seasonSobrasPool(playSeason([600, 0, 600]).state);
    expect(losing).toBeLessThan(good);
    expect(good - losing).toBeCloseTo(600 * 0.3, 6);
  });

  it('sends the remainder to the community when the assembly says so', () => {
    const c = playSeason([600, 600, 600]);
    for (const voter of ['packing', 'quality', 'maintenance'])
      c.must({ type: 'voteSurplus', args: [voter, 'community'] });
    c.must({ type: 'distributeSurplus', args: [] });
    expect(c.state.finance.communityAllocation).toBeCloseTo(c.state.sobras!.remainder, 6);
    expect(Object.values(c.state.sobras!.shares).every((v) => v === 0)).toBe(true);
    expect(restoreWorkplace(saveWorkplace(c.state)).sobras).toEqual(c.state.sobras);
  });
});

describe('5.9 dead choices get a reader or go', () => {
  it('the reserve brought forward funds the next purchase, visibly', () => {
    let state = createWorkplace();
    state = transitionWorkplace(state, {
      type: 'startCampaign',
      args: ['cooperative', 17, undefined, 50],
    }).state;
    expect(state.campaign?.reserveBrought).toBe(50);
    expect(state.finance.cash).toBe(450);
    state = transitionWorkplace(state, { type: 'selectPlan', args: ['resequence'] }).state;
    const resequence = workplaceAlternatives(state).find((p) => p.id === 'resequence')!;
    expect(resequence.fromReserve).toBe(40);
    expect(restoreWorkplace(saveWorkplace(state)).finance.cash).toBe(450);
    // Carried on to the next season: the reserve less what it bought, plus its share.
    const c = playSeason([600, 600, 600]);
    for (const voter of ['packing', 'quality', 'maintenance'])
      c.must({ type: 'voteSurplus', args: [voter, 'reserve'] });
    c.must({ type: 'distributeSurplus', args: [] });
    expect(seasonReserveCarried(c.state)).toBeCloseTo(c.state.sobras!.pool * 0.95, 6);
  });

  it('merges the two worker-autonomy settings', () => {
    const c = season();
    c.must({ type: 'configure', args: [{ workerAutonomy: 'directed' }] });
    c.must({ type: 'configure', args: [{ workerAutonomy: 'individual' }] });
    expect(c.state.workerAutonomy).toBe('team');
  });

  it('the elected chair breaks a review tie', () => {
    let state = createWorkplace('game', 17);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
      state = result.state;
    };
    run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
    run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    for (const voter of ['packing', 'quality', 'maintenance'])
      run({ type: 'elect', args: [voter, 'quality'] });
    expect(state.electedChair).toBe('quality');
    run({ type: 'acknowledgeImprovement', args: [] });
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
    run({ type: 'activate', args: [state.revision] });
    while (state.phase === 'active') run({ type: 'tick', args: [10, 0, false] });
    run({ type: 'acknowledgeImprovementReview', args: [] });
    run({ type: 'voteImprovementReview', args: ['packing', 'adopt'] });
    run({ type: 'voteImprovementReview', args: ['quality', 'adopt'] });
    run({ type: 'voteImprovementReview', args: ['maintenance', 'stop'] });
    run({ type: 'voteImprovementReview', args: ['coordinator', 'stop'] });
    run({ type: 'finishImprovementReview', args: [state.revision] });
    expect(state.improvement?.verdict).toBe('adopt');
    expect(restoreWorkplace(saveWorkplace(state)).improvement?.verdict).toBe('adopt');
  });

  it('an adopted arrangement outlives its cycle, and deferring a trial buys nothing', () => {
    let state = createWorkplace('game', 17);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
      state = result.state;
    };
    const cycle = (verdict: 'adopt' | 'amend' | 'stop', episodeDefer = false) => {
      if (episodeDefer) {
        run({ type: 'setImprovementEpisode', args: ['tight-cash'] });
        run({ type: 'respondImprovementEpisode', args: ['coordinator', 'defer'] });
      }
      run({ type: 'acknowledgeImprovement', args: [] });
      for (const m of state.members) {
        run({ type: 'understand', args: [m.id] });
        run({ type: 'vote', args: [m.id, true] });
      }
      run({ type: 'activate', args: [state.revision] });
      while (state.phase === 'active') run({ type: 'tick', args: [10, 0, false] });
      run({ type: 'acknowledgeImprovementReview', args: [] });
      for (const m of state.members) run({ type: 'voteImprovementReview', args: [m.id, verdict] });
      run({ type: 'finishImprovementReview', args: [state.revision] });
    };
    run({ type: 'beginImprovement', args: ['cooperative', state.revision] });
    run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    cycle('adopt');
    run({ type: 'continueImprovement', args: [state.revision] });
    // The next cycle tries the buffer instead, and stops it.
    run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    cycle('stop');
    run({ type: 'continueImprovement', args: [state.revision] });
    // The briefing adopted two cycles ago is still in place: it costs nothing.
    run({ type: 'proposeImprovement', args: ['briefing', 'packing'] });
    expect(retainedImprovement(state)).toBe('briefing');
    expect(improvementCost(state)).toBe(0);
    run({ type: 'proposeImprovement', args: ['buffer', 'maintenance'] });
    expect(improvementCost(state)).toBe(32);
    const cashBefore = state.finance.cash;
    // The tight-cash episode answered "defer": the trial runs without buying.
    cycle('stop', true);
    expect(state.finance.improvementSpend).toBe(0);
    expect(state.improvement?.stopped).toBe(true);
    expect(cashBefore - state.finance.cash).toBeCloseTo(108, 6);
  });
});

describe('5.10 seasons differ and return', () => {
  it('two seasons from two seeds differ', () => {
    const a = season('cooperative', 3).state;
    const b = season(
      'cooperative',
      seedWith((n) => {
        const x = seasonDraw(n);
        const y = seasonDraw(3);
        return x.pressures[0] !== y.pressures[0] && x.mondayMinute !== y.mondayMinute;
      })
    ).state;
    expect(a.campaign?.draw).toBeDefined();
    expect(campaignPressure(a)?.id).not.toBe(campaignPressure(b)?.id);
    expect(a.campaign?.draw?.mondayMinute).not.toBe(b.campaign?.draw?.mondayMinute);
    const decliners = new Set(Array.from({ length: 40 }, (_, n) => seasonDraw(n + 1).decliner));
    expect(decliners).toEqual(new Set(['maintenance', 'coordinator']));
    // "Yesterday's volunteer again?" needs a yesterday: never the first shift.
    const draws = Array.from({ length: 300 }, (_, n) => seasonDraw(n));
    expect(draws.every((d) => d.pressures[0] !== 'repeat-cover')).toBe(true);
    expect(new Set(draws.map((d) => d.pressures.join())).size).toBe(4);
  });

  it('holds Monday at the drawn minute, and keeps the draw across shifts and a reload', () => {
    const seed = seedWith((n) => seasonDraw(n).mondayMinute >= 30);
    const c = season('cooperative', seed);
    const draw = c.state.campaign!.draw!;
    c.must({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.must({ type: 'activate', args: [c.state.revision] });
    c.finish(0);
    c.must({ type: 'nextCampaignShift', args: [] });
    expect(c.state.campaign?.draw).toEqual(draw);
    expect(campaignPressure(c.state)?.id).toBe(draw.pressures[1]);
    c.agree();
    c.must({ type: 'activate', args: [c.state.revision] });
    c.must({ type: 'tick', args: [draw.mondayMinute - 1, 0, false] });
    expect(workplaceCapacity(c.state)).toBe(1);
    c.must({ type: 'tick', args: [1, 0, false] });
    expect(workplaceCapacity(c.state)).toBe(0);
    c.must({ type: 'campaignDecision', args: ['inspect', 'quality'] });
    c.finish(0);
    const restored = restoreWorkplace(saveWorkplace(c.state));
    expect(restored.campaign?.shift).toBe(1);
    expect(restored.campaign?.draw).toEqual(draw);
    // A forged draw is refused.
    const forged = structuredClone(saveWorkplace(c.state)) as WorkplaceState;
    forged.campaign!.draw = { ...draw, mondayMinute: draw.mondayMinute === 20 ? 21 : 20 };
    expect(restoreWorkplace(forged).campaign).toBeNull();
  });

  it('restores seasons saved mid-way by the build before phase 5, and finishes them', () => {
    const shift0 = restoreWorkplace(fixture('2026-11-13-pre-phase5-shift0-review.json'));
    expect(shift0.campaign?.shift).toBe(0);
    expect(shift0.campaign?.draw).toBeUndefined();
    expect(campaignPressure(shift0)?.id).toBe(LEGACY_SEASON_DRAW.pressures[0]);
    let state = restoreWorkplace(fixture('2026-11-13-pre-phase5-thursday-deliberating.json'));
    expect(state.campaign?.shift).toBe(2);
    expect(state.campaign?.history[0].finance.distributed).toBeGreaterThan(0);
    expect(mondayMinute(state)).toBe(25);
    const run = (command: WorkplaceCommand) => {
      const result = transitionWorkplace(state, command);
      expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
      state = result.state;
    };
    run({ type: 'resumeShift', args: [state.revision] });
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
    while (state.phase === 'active') run({ type: 'tick', args: [5, 600 / 18, false] });
    expect(state.minute).toBe(90);
    // Shift 0's share, paid under the old rule, already left the pool.
    const pool = seasonSobrasPool(state);
    for (const voter of ['packing', 'quality', 'maintenance'])
      run({ type: 'voteSurplus', args: [voter, 'members'] });
    run({ type: 'distributeSurplus', args: [] });
    expect(state.sobras?.pool).toBeCloseTo(pool, 6);
    expect(restoreWorkplace(saveWorkplace(state)).sobras).toEqual(state.sobras);
  });
});
