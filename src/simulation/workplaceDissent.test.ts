import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceReadiness,
  workplaceAlternatives,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  campaignAgreementHonoured,
  campaignOutcomes,
  requiredChecks,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import type { WorkplaceProfile } from '../types/workplace';

function episode(
  profile: WorkplaceProfile,
  firstDecision: 'keep-target' | 'renegotiate' = 'keep-target'
) {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const answer = () => {
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
    run({ type: 'understand', args: ['packing'] });
    run({ type: 'simulateResponses', args: [] });
  };
  const finish = () => {
    while (state.phase === 'active') {
      if (state.campaign?.shift === 1 && state.minute >= 25 && !state.campaign.decision)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 30, false] });
    }
  };
  run({ type: 'startCampaign', args: [profile, 17] });
  for (let shift = 0; shift < 2; shift++) {
    if (shift === 0) run({ type: 'campaignDecision', args: [firstDecision, 'coordinator'] });
    answer();
    run({ type: 'vote', args: ['packing', true] });
    expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
    finish();
    expect(run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
  }
  return {
    run,
    answer,
    finish,
    get state() {
      return state;
    },
  };
}

describe('complete Thursday dissent route', () => {
  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    '%s preserves an earlier installment and earned accounts when protecting refusal',
    (profile) => {
      const e = episode(profile, 'renegotiate');
      e.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      expect(e.state.campaign?.history[0].targetKg).toBe(480);
      expect(e.state.targetKg).toBe(600);
      e.answer();
      e.run({ type: 'vote', args: ['packing', true] });
      expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
      e.finish();
      const restored = restoreWorkplace(saveWorkplace(e.state));
      expect(restored.targetKg).toBe(600);
      expect(restored.campaign?.history).toEqual(e.state.campaign?.history);
      expect(restored.finance).toEqual(e.state.finance);
      expect(restored.members.map((m) => m.earnedPay)).toEqual(
        e.state.members.map((m) => m.earnedPay)
      );
    }
  );

  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    '%s revises a rejected cover offer and completes protected work with honest accounts',
    (profile) => {
      const e = episode(profile);
      e.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      e.run({ type: 'selectPlan', args: ['cover'] });
      e.answer();
      e.run({ type: 'vote', args: ['packing', false] });
      e.run({ type: 'consentToCover', args: ['packing', false] });
      const before = e.state;
      expect(
        e.run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] }).changed
      ).toBe(true);
      expect(e.state.targetKg).toBe(480);
      expect(e.state.finance).toEqual(before.finance);
      expect(
        e.state.members.every((m) => !m.understood && m.ballot === null && m.coverConsent === null)
      ).toBe(true);
      expect(e.state.campaign?.adviserAcknowledged).toBe(false);
      expect(e.run({ type: 'activate', args: [before.revision] }).changed).toBe(false);
      e.run({ type: 'selectPlan', args: ['steady'] });
      e.answer();
      // Revised terms allow a genuine new decision. A majority charter also
      // keeps a minority no; it cannot convert that ballot into extra duty.
      e.run({ type: 'vote', args: ['packing', profile === 'team'] });
      e.run({ type: 'consentToCover', args: ['packing', false] });
      expect(workplaceReadiness(e.state).allowed).toBe(true);
      expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
      e.finish();
      expect(
        e.state.members.every(
          (m) =>
            m.extraMinutes === 0 &&
            m.earnedPay === 27 &&
            m.restMinutes === 15 &&
            m.recoveryOwedMinutes === 0
        )
      ).toBe(true);
      expect(e.state.finance.wagesPaid).toBe(108);
      expect(e.state.finance.compensationPaid).toBe(0);
      expect(campaignAgreementHonoured(e.state)).toBe(true);
      expect(campaignOutcomes(e.state).delivery.deliveredKg).toBe(1620);
      expect(campaignOutcomes(e.state).delivery.targetKg).toBe(1680);
      expect(campaignOutcomes(e.state).delivery.status).toBe('shortfall');
      expect(campaignOutcomes(e.state).delivery.deferredKg).toBe(120);
      expect(campaignOutcomes(e.state).delivery.remainingKg).toBe(180);
      const restored = restoreWorkplace(saveWorkplace(e.state));
      expect(restored.campaign?.decision).toBe('renegotiate');
      expect(restored.targetKg).toBe(480);
      expect(restored.finance).toEqual(e.state.finance);
      expect(
        restored.members.every((m) => m.coverConsent === null && m.ballot === null && !m.sharing)
      ).toBe(true);
    }
  );

  it('team veto remains a hold until changed terms receive fresh agreement', () => {
    const e = episode('team');
    e.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
    e.answer();
    e.run({ type: 'vote', args: ['packing', false] });
    expect(workplaceReadiness(e.state).reasons).toContain('Team consent requires every approval.');
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(false);
    expect(e.state.finance.wagesPaid).toBe(0);
  });

  it('correction and installment revision leave a genuine challenge with its raiser', () => {
    const e = episode('cooperative');
    e.run({ type: 'respondToPressure', args: ['repeat-cover', 'accept-demand'] });
    e.run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] });
    expect(e.state.objections[0].status).toBe('open');
    expect(e.run({ type: 'resolveObjection', args: ['o-1', 'packing'] }).changed).toBe(false);
    e.run({ type: 'respondToPressure', args: ['repeat-cover', 'protect-boundary'] });
    expect(e.run({ type: 'resolveObjection', args: ['o-1', 'mind'] }).changed).toBe(false);
    expect(e.run({ type: 'resolveObjection', args: ['o-1', 'packing'] }).changed).toBe(true);
    expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(false);
  });

  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    '%s can use a different qualified volunteer without overriding Packing',
    (profile) => {
      const e = episode(profile);
      e.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      e.run({ type: 'selectPlan', args: ['cover'] });
      e.answer();
      e.run({ type: 'vote', args: ['packing', true] });
      e.run({ type: 'consentToCover', args: ['packing', false] });
      expect(e.run({ type: 'activate', args: [e.state.revision] }).changed).toBe(true);
      expect(e.state.activeCoverMemberId).toBe('maintenance');
      e.finish();
      const packing = e.state.members.find((m) => m.id === 'packing')!;
      const maintenance = e.state.members.find((m) => m.id === 'maintenance')!;
      expect(packing.extraMinutes).toBe(0);
      expect(packing.earnedPay).toBe(27);
      expect(packing.refusalRespected).toBe(true);
      expect(maintenance.extraMinutes).toBe(10);
      expect(maintenance.compensationPaid).toBe(8);
      expect(maintenance.recoveryMinutes).toBe(10);
      expect(maintenance.recoveryOwedMinutes).toBe(0);
    }
  );

  it('shows public costs and current volunteers without reading private willingness', () => {
    const e = episode('toe-dip');
    const before = structuredClone(e.state);
    const alternatives = workplaceAlternatives(e.state);
    expect(alternatives.map((p) => p.id)).toEqual(['steady', 'resequence', 'cover']);
    expect(alternatives.find((p) => p.id === 'steady')!.reserve).toBe(108);
    expect(alternatives.find((p) => p.id === 'resequence')!.available).toBe(false);
    expect(alternatives.find((p) => p.id === 'cover')!.maximumCompensation).toBe(8);
    expect(alternatives.every((p) => p.volunteers.length === 0)).toBe(true);
    expect(JSON.stringify(alternatives)).not.toMatch(/preference|willingToCover|predictable/);
    expect(e.state).toEqual(before);
  });

  it.each(['members', 'reserve', 'community'] as const)(
    'surplus choice %s changes actual cash only after member ballots',
    (destination) => {
      const e = episode('cooperative');
      e.run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] });
      e.answer();
      e.run({ type: 'vote', args: ['packing', false] });
      e.run({ type: 'activate', args: [e.state.revision] });
      e.finish();
      const cash = e.state.finance.cash;
      expect(e.run({ type: 'distributeSurplus', args: [] }).changed).toBe(false);
      for (const actor of ['packing', 'quality', 'maintenance'])
        e.run({ type: 'voteSurplus', args: [actor, destination] });
      expect(e.run({ type: 'distributeSurplus', args: [] }).changed).toBe(true);
      expect(e.state.finance.cash).toBe(cash - (destination === 'reserve' ? 0 : 54));
      expect(
        e.state.members.every((m) => m.earnedPay === (destination === 'members' ? 40.5 : 27))
      ).toBe(true);
      expect(restoreWorkplace(saveWorkplace(e.state)).finance).toEqual(e.state.finance);
    }
  );
});
