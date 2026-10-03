import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  exportWorkplace,
  projectWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceCapacity,
  workplaceTickCapacity,
  workplaceReadiness,
  compareManagementApproaches,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  campaignComplete,
  campaignAgreementHonoured,
  campaignTotals,
  requiredChecks,
  WORKPLACE_CHECKS,
  CAMPAIGN_PRESSURES,
  MANAGEMENT_APPROACHES,
  campaignRelationship,
} from './workplaceCampaign';
import type { WorkplaceProfile } from '../types/workplace';

function campaign(profile: WorkplaceProfile = 'cooperative') {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: [profile, 17] });
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
  const activate = () => run({ type: 'activate', args: [state.revision] });
  const finish = () => {
    while (state.phase === 'active') {
      if (state.campaign?.shift === 1 && state.minute >= 25 && state.campaign.decision === null)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
  };
  return {
    run,
    agree,
    activate,
    understand,
    finish,
    get state() {
      return state;
    },
    restore() {
      state = restoreWorkplace(saveWorkplace(state));
    },
  };
}

describe('Living Cooperative, synthetic multi-shift fairness', () => {
  it('a coercive demand creates a real raiser-owned hold, with privacy and pay intact', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    const before = structuredClone(c.state);
    expect(
      c.run({ type: 'respondToPressure', args: ['disclosure', 'accept-demand'] }).reason
    ).toContain('Demand blocked');
    expect(c.state.finance).toEqual(before.finance);
    expect(c.state.members.every((m) => !m.sharing && m.coverConsent === null)).toBe(true);
    expect(c.state.campaign?.adviserAcknowledged).toBe(false);
    expect(c.activate().changed).toBe(false);
    expect(c.run({ type: 'resolveObjection', args: ['o-1', 'quality'] }).reason).toContain(
      'Restate'
    );
    expect(
      c.run({ type: 'respondToPressure', args: ['disclosure', 'accept-demand'] }).changed
    ).toBe(false);
    c.run({ type: 'respondToPressure', args: ['disclosure', 'protect-boundary'] });
    expect(c.state.objections[0].status).toBe('open');
    expect(c.run({ type: 'resolveObjection', args: ['o-1', 'coordinator'] }).changed).toBe(false);
    expect(c.run({ type: 'resolveObjection', args: ['o-1', 'quality'] }).changed).toBe(true);
    expect(c.activate().changed).toBe(false);
    c.agree();
    expect(c.activate().changed).toBe(true);
    expect(c.state.members.every((m) => !m.sharing)).toBe(true);
  });

  it('all three pressures retain public receipts across shifts and safe reloads', () => {
    const c = campaign();
    for (let shift = 0; shift < 3; shift++) {
      const pressure = CAMPAIGN_PRESSURES[shift];
      if (shift !== 1)
        c.run({
          type: 'campaignDecision',
          args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
        });
      expect(
        c.run({ type: 'respondToPressure', args: [pressure.id, 'accept-demand'] }).changed
      ).toBe(true);
      c.run({ type: 'respondToPressure', args: [pressure.id, 'protect-boundary'] });
      expect(c.run({ type: 'resolveObjection', args: ['o-1', pressure.challenger] }).changed).toBe(
        true
      );
      c.agree();
      expect(c.activate().changed).toBe(true);
      c.finish();
      expect(c.state.events.filter((e) => e.kind === 'pressure-challenged')).toHaveLength(1);
      c.restore();
      expect(c.state.campaign?.shift).toBe(shift);
      const record = campaignRelationship(c.state)[shift];
      expect(record.events?.filter((e) => e.kind === 'pressure-challenged')).toHaveLength(1);
      expect(record.events?.filter((e) => e.kind === 'pressure-protected')).toHaveLength(1);
      expect(record.events?.filter((e) => e.kind === 'objection-resolved')).toHaveLength(1);
      expect(JSON.stringify(exportWorkplace(c.state))).not.toContain('predictable packing handoff');
      if (shift < 2) expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
    }
    expect(campaignRelationship(c.state)).toHaveLength(3);
    expect(campaignAgreementHonoured(c.state)).toBe(true);
    expect(campaignComplete(c.state)).toBe(false);
  });

  it('proactive protection never manufactures an objection, sharing or a completed agreement', () => {
    const c = campaign();
    expect(
      c.run({ type: 'respondToPressure', args: ['blind-override', 'protect-boundary'] }).changed
    ).toBe(false);
    expect(
      c.run({ type: 'respondToPressure', args: ['disclosure', 'protect-boundary'] }).changed
    ).toBe(true);
    expect(c.state.objections).toEqual([]);
    expect(c.state.campaign?.agreementProved).toBe(false);
    expect(c.state.members.every((m) => !m.sharing && m.coverConsent === null)).toBe(true);
    expect(
      c.run({ type: 'respondToPressure', args: ['disclosure', 'accept-demand'] }).changed
    ).toBe(false);
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.activate();
    expect(
      c.run({ type: 'respondToPressure', args: ['disclosure', 'protect-boundary'] }).changed
    ).toBe(false);
  });

  it('repairs an unfinished demand after reload without restoring work authority or arbitrary prose', () => {
    const c = campaign();
    c.run({ type: 'respondToPressure', args: ['disclosure', 'accept-demand'] });
    const saved = saveWorkplace(c.state) as typeof c.state;
    saved.events.find((event) => event.kind === 'pressure-challenged')!.detail =
      'disclosure: private imported prose';
    const restored = restoreWorkplace(saved);
    expect(restored.phase).toBe('review');
    expect(JSON.stringify(restored)).not.toContain('private imported prose');
    expect(restored.events[0].detail).toContain(CAMPAIGN_PRESSURES[0].objection);
    const repaired = transitionWorkplace(restored, {
      type: 'respondToPressure',
      args: ['disclosure', 'protect-boundary'],
    });
    expect(repaired.changed).toBe(true);
    expect(repaired.state.phase).toBe('review');
    expect(repaired.state.finance).toEqual(restored.finance);
    expect(
      transitionWorkplace(repaired.state, { type: 'resolveObjection', args: ['o-1', 'quality'] })
        .changed
    ).toBe(true);
    expect(
      transitionWorkplace(repaired.state, { type: 'activate', args: [repaired.state.revision] })
        .changed
    ).toBe(false);
  });

  it('older history stays readable without inventing receipts; malformed receipts fail closed', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    const saved = saveWorkplace(c.state) as typeof c.state;
    delete saved.campaign!.history[0].relationshipEvents;
    const restored = restoreWorkplace(saved);
    expect(restored.campaign?.shift).toBe(1);
    expect(campaignRelationship(restored)[0].events).toBeNull();
    saved.campaign!.history[0].relationshipEvents = [
      {
        id: 'e-1',
        minute: 0,
        actorId: 'real-person',
        kind: 'pressure-protected',
        detail: 'forged',
      },
    ];
    expect(restoreWorkplace(saved)).toEqual(createWorkplace());
  });

  it.each(['steady', 'cover', 'resequence', 'rush'] as const)(
    'management comparison gives no governance bonus to %s',
    (plan) => {
      const arms = compareManagementApproaches(17, plan);
      expect(new Set(arms.map((arm) => arm.forecastKg)).size).toBe(1);
      expect(new Set(arms.map((arm) => arm.netCredits)).size).toBe(1);
      expect(arms.map((arm) => arm.permitted)).toEqual(
        plan === 'rush'
          ? [false, false, false]
          : plan === 'resequence'
            ? [false, true, true]
            : [true, true, true]
      );
    }
  );

  it('switching approaches retains physical terms, cash and history while renewing consent', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    const before = structuredClone(c.state);
    c.run({ type: 'configure', args: [MANAGEMENT_APPROACHES[0].settings] });
    expect(c.state.finance).toEqual(before.finance);
    expect(c.state.planId).toBe(before.planId);
    expect(c.state.seed).toBe(before.seed);
    expect(c.state.campaign?.history).toEqual(before.campaign?.history);
    expect(c.state.campaign?.checks).toEqual({});
    expect(c.state.governance).toBe('consultative');
    expect(c.state.members.every((m) => m.ballot === null && m.coverConsent === null)).toBe(true);
  });
  it.each(['toe-dip', 'team', 'cooperative'] as WorkplaceProfile[])(
    'completes all three shifts under %s, retaining actual obligations and cash',
    (profile) => {
      const c = campaign(profile);
      const volunteers: string[] = [];
      for (let shift = 0; shift < 3; shift++) {
        expect(c.state.campaign?.shift).toBe(shift);
        if (shift !== 1)
          c.run({
            type: 'campaignDecision',
            args: [shift === 0 ? 'renegotiate' : 'protect-refusal', 'coordinator'],
          });
        c.run({ type: 'selectPlan', args: ['cover'] });
        c.agree();
        expect(c.activate().changed).toBe(true);
        volunteers.push(c.state.activeCoverMemberId!);
        c.finish();
        const cash = c.state.finance.cash;
        const totals = campaignTotals(c.state);
        expect(totals.members.reduce((n, m) => n + m.extraMinutes, 0)).toBe((shift + 1) * 10);
        expect(totals.members.reduce((n, m) => n + m.compensationPaid, 0)).toBeCloseTo(
          (shift + 1) * 8
        );
        expect(totals.members.reduce((n, m) => n + m.recoveryMinutes, 0)).toBe((shift + 1) * 10);
        expect(totals.members.every((m) => m.recoveryOwedMinutes === 0)).toBe(true);
        expect(totals.members.find((m) => m.id === 'quality')?.extraMinutes).toBe(0);
        c.restore();
        expect(c.state.finance.cash).toBeCloseTo(cash);
        expect(campaignTotals(c.state)).toEqual(totals);
        expect(
          c.state.members.every(
            (m) => m.ballot === null && m.coverConsent === null && !m.understood && !m.sharing
          )
        ).toBe(true);
        if (shift < 2) {
          expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
          expect(c.state.finance.initialCapital).toBeCloseTo(cash);
          expect(c.state.finance.cash).toBeCloseTo(cash);
          expect(c.state.campaign?.checks).toEqual({});
        }
      }
      expect(volunteers).toEqual(['maintenance', 'packing', 'maintenance']);
      expect(campaignAgreementHonoured(c.state)).toBe(true);
      expect(campaignComplete(c.state)).toBe(false);
      expect(c.state.finance.cash).toBeCloseTo(400 - 3 * 108 - 3 * 8);
      expect(campaignTotals(c.state).repairs).toBe(1);
      expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(false);
      expect(c.run({ type: 'start', args: ['game', 17] }).reason).toContain('history');
    }
  );

  it('cannot use scripted peers, silence, or a confirmation button to bypass demonstrated understanding', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.run({ type: 'simulateResponses', args: [] });
    expect(c.state.members[0].understood).toBe(false);
    expect(c.state.campaign?.adviserAcknowledged).toBe(false);
    expect(c.run({ type: 'understand', args: ['packing'] }).changed).toBe(false);
    const wrong = c.run({ type: 'answerCheck', args: ['packing', 'refusal', 'majority'] });
    expect(wrong.changed).toBe(true);
    expect(wrong.reason).toContain('never volunteers');
    expect(c.activate().changed).toBe(false);
    c.agree();
    expect(workplaceReadiness(c.state).allowed).toBe(true);
    c.run({ type: 'answerCheck', args: ['mind', 'authority', 'unlimited'] });
    expect(c.state.campaign?.adviserAcknowledged).toBe(false);
    expect(c.activate().changed).toBe(false);
    c.understand('mind');
    expect(c.activate().changed).toBe(true);
  });

  it('renews both sides after any agreement revision and never overwrites a refusal', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    c.run({ type: 'consentToCover', args: ['packing', false] });
    c.run({ type: 'vote', args: ['packing', false] });
    c.run({ type: 'simulateResponses', args: [] });
    expect(c.state.members[0].coverConsent).toBe(false);
    expect(c.state.members[0].ballot).toBe(false);
    const oldRevision = c.state.revision;
    c.run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] });
    expect(c.state.targetKg).toBe(480);
    expect(c.state.shippedKg).toBe(0);
    expect(c.state.campaign?.checks).toEqual({});
    expect(c.state.campaign?.adviserAcknowledged).toBe(false);
    expect(
      c.state.members.every((m) => !m.understood && m.ballot === null && m.coverConsent === null)
    ).toBe(true);
    expect(c.run({ type: 'activate', args: [oldRevision] }).reason).toContain('Stale');
  });

  it('withdrawal and reload retain earned money and recovery; reset and next-shift shortcuts fail', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    c.activate();
    c.run({ type: 'tick', args: [3, 0, false] });
    const id = c.state.activeCoverMemberId!;
    c.run({ type: 'withdraw', args: [id] });
    c.restore();
    expect(c.state.campaign).not.toBeNull();
    expect(c.state.finance.compensationPaid).toBeCloseTo(2.4);
    expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(false);
    expect(c.run({ type: 'startCampaign', args: ['team', 17] }).changed).toBe(false);
    c.run({ type: 'tick', args: [10, 999, false] });
    expect(c.state.shippedKg).toBe(0);
    expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
    const carried = campaignTotals(c.state).members.find((m) => m.id === id);
    expect(carried?.compensationPaid).toBeCloseTo(2.4);
    expect(carried).toMatchObject({
      extraMinutes: 3,
      recoveryMinutes: 10,
      recoveryOwedMinutes: 0,
    });
    expect(campaignComplete(c.state)).toBe(false);
  });

  it('a qualified inspection consumes real model time and keeps unsafe shortcuts blocked', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    c.agree();
    c.activate();
    expect(workplaceTickCapacity(c.state, 30)).toBeCloseTo((25 * 0.78) / 30);
    c.run({ type: 'tick', args: [25, 0, false] });
    expect(c.state.minute).toBe(25);
    expect(workplaceCapacity(c.state)).toBe(0);
    expect(
      c.run({ type: 'campaignDecision', args: ['skip-inspection', 'coordinator'] }).changed
    ).toBe(false);
    expect(c.run({ type: 'campaignDecision', args: ['inspect', 'packing'] }).changed).toBe(false);
    c.run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
    c.run({ type: 'tick', args: [4, 0, false] });
    expect(workplaceCapacity(c.state)).toBe(0);
    expect(c.state.campaign?.inspectionComplete).toBe(false);
    c.run({ type: 'tick', args: [1, 0, false] });
    expect(c.state.campaign?.inspectionComplete).toBe(true);
    expect(workplaceCapacity(c.state)).toBe(0.78);
    c.restore();
    expect(c.state.campaign?.inspectionComplete).toBe(true);
    expect(c.state.phase).toBe('review');
  });

  it('an unresolved objection by either side blocks advancement and belongs to its raiser', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.activate();
    c.run({ type: 'object', args: ['mind', 'authority'] });
    expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(false);
    expect(c.run({ type: 'resolveObjection', args: ['o-1', 'packing'] }).changed).toBe(false);
    c.restore();
    expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(false);
    c.run({ type: 'resolveObjection', args: ['o-1', 'mind'] });
    expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
  });

  it('time-weights coarse ticks without extending optional duty, erasing wages or waiving a hold', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    c.activate();
    expect(workplaceTickCapacity(c.state, 15)).toBeCloseTo((10 * 0.98 + 5 * 0.78) / 15);
    c.run({ type: 'tick', args: [15, 0, false] });
    expect(c.state.members.reduce((n, m) => n + m.extraMinutes, 0)).toBe(10);
    expect(c.state.finance.wagesPaid).toBeCloseTo(18);
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    c.agree();
    c.activate();
    expect(workplaceTickCapacity(c.state, 30)).toBeCloseTo((25 * 0.78) / 30);
    c.run({ type: 'tick', args: [30, 0, false] });
    expect(c.state.minute).toBe(30);
    expect(c.state.finance.wagesPaid).toBeCloseTo(36);
    expect(workplaceCapacity(c.state)).toBe(0);
    c.run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
    expect(workplaceTickCapacity(c.state, 10)).toBeCloseTo((5 * 0.78) / 10);
    c.run({ type: 'tick', args: [10, 0, false] });
    expect(c.state.campaign?.inspectionComplete).toBe(true);
    c.run({ type: 'tick', args: [45, 0, false] });
    expect(workplaceTickCapacity(c.state, 10)).toBeCloseTo((5 * 0.78 + 5) / 10);
  });

  it('retaliation, waiver and exhausted-budget attempts cannot buy authority or remove rights', () => {
    const c = campaign('toe-dip');
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['rush'] });
    c.agree();
    expect(c.activate().changed).toBe(false);
    c.run({ type: 'selectPlan', args: ['steady'] });
    c.agree();
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    c.agree();
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    const before = c.state;
    expect(
      c.run({ type: 'campaignDecision', args: ['penalize-refusal', 'coordinator'] }).reason
    ).toContain('cannot reduce pay');
    expect(c.state).toBe(before);
    c.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
    expect(
      c.state.events.some(
        (e) => e.kind === 'adviser-correction' && e.detail.includes('That was wrong')
      )
    ).toBe(true);
    c.agree();
    c.state.finance.cash = 20;
    expect(c.activate().reason).toContain('Funds cannot cover');
    expect(c.state.members.every((m) => m.extraMinutes === 0 && m.earnedPay === 0)).toBe(true);
  });

  it('projection and exports reveal cumulative obligations without private explanations', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.run({ type: 'sharePreference', args: ['packing', true] });
    expect(projectWorkplace(c.state).members[0].preference).not.toBeNull();
    expect(JSON.stringify(exportWorkplace(c.state))).not.toContain(c.state.members[0].preference);
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    expect(projectWorkplace(c.state).members.every((m) => m.preference === null)).toBe(true);
    expect(projectWorkplace(c.state).campaign?.totals.shiftsReviewed).toBe(1);
  });

  it('rejects forged history, cash, identities, coercive decisions and restored authority', () => {
    const c = campaign();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.activate();
    c.finish();
    c.run({ type: 'nextCampaignShift', args: [] });
    const mutations = [
      (s: typeof c.state) => {
        s.campaign!.history[0].finance.cash += 20;
      },
      (s: typeof c.state) => {
        s.finance.initialCapital += 20;
        s.finance.cash += 20;
      },
      (s: typeof c.state) => {
        s.campaign!.history[0].members[0].id = 'external-person';
      },
      (s: typeof c.state) => {
        s.campaign!.history[0].members[0].extraMinutes = 50;
      },
      (s: typeof c.state) => {
        s.campaign!.history[0].members[0].recoveryOwedMinutes = 5;
      },
      (s: typeof c.state) => {
        s.campaign!.adviserAcknowledged = true;
      },
      (s: typeof c.state) => {
        s.campaign!.history[0].decision = 'penalize-refusal';
      },
      (s: typeof c.state) => {
        s.campaign!.history[0].seed++;
      },
    ];
    for (const mutate of mutations) {
      const saved = saveWorkplace(c.state) as typeof c.state;
      mutate(saved);
      expect(restoreWorkplace(saved)).toEqual(createWorkplace());
    }
    const legacy = saveWorkplace(createWorkplace()) as Record<string, unknown>;
    delete legacy.campaign;
    expect(restoreWorkplace(legacy).phase).toBe('idle');
  });
});
