import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { safeJSONStorage } from './storage';
import {
  createWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../simulation/bilateralWorkplace';
import { ROLE_COMMANDS, turnChecks, type RoleCommand } from '../simulation/workplaceParticipation';
import { beginReplayClock, endReplayClock } from '../simulation/workplaceReplayRuntime';
import { fairnessReceipt } from '../simulation/workplaceFairness';
import { WORKPLACE_CHECKS, requiredChecks } from '../simulation/workplaceCampaign';

const get = () => useWorkplaceStore.getState();
function turn(actor = 'packing') {
  expect(get().startTurn(actor).changed).toBe(true);
  return get().turn!.token;
}
function checked(actor = 'packing') {
  const token = turn(actor);
  for (const q of turnChecks(get().workplace)) get().answerTurnCheck(token, q.id, q.correct);
  return token;
}
function run(token: string, type: RoleCommand['type'], args: unknown[]) {
  return get().runTurnCommand(token, { type, args } as RoleCommand);
}
beforeEach(() => {
  endReplayClock();
  localStorage.clear();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    completedCampaigns: [],
    participationMode: 'solo',
    turn: null,
  });
});

describe('separate local participant turns', () => {
  it.each(ROLE_COMMANDS)('rejects direct legacy %s without mutating state', (type) => {
    get().setParticipationMode('separate-turns');
    get().start('workshop', 17);
    turn();
    const before = get().workplace;
    const result = Reflect.get(get(), type)('packing', true);
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/current turn|Facilitators/);
    expect(get().workplace).toBe(before);
  });
  it('requires corrected current checks, then allows only that role', () => {
    get().setParticipationMode('separate-turns');
    get().start('workshop', 17);
    const token = turn();
    expect(run(token, 'understand', ['packing']).changed).toBe(false);
    expect(get().answerTurnCheck(token, 'mandate', 'unlimited').reason).toContain('bounded');
    for (const q of turnChecks(get().workplace)) get().answerTurnCheck(token, q.id, q.correct);
    expect(run(token, 'understand', ['packing']).changed).toBe(true);
    expect(run(token, 'vote', ['quality', true]).changed).toBe(false);
    expect(run(token, 'vote', ['packing', false]).changed).toBe(true);
    get().answerTurnCheck(token, 'mandate', 'unlimited');
    expect(get().workplace.members[0].understood).toBe(false);
    expect(get().workplace.members[0].ballot).toBeNull();
    expect(run(token, 'vote', ['packing', true]).changed).toBe(false);
    expect(get().workplace.members[0].earnedPay).toBe(0);
  });
  it('rejects ended, old rendered, changed-term and replay tokens', () => {
    get().setParticipationMode('separate-turns');
    get().start('workshop');
    const token = checked();
    const retained = () => run(token, 'understand', ['packing']);
    get().endTurn();
    checked();
    expect(retained().changed).toBe(false);
    get().endTurn();
    get().selectPlan('resequence');
    expect(retained().changed).toBe(false);
    const current = checked();
    beginReplayClock(1, 0);
    expect(run(current, 'understand', ['packing']).changed).toBe(false);
    endReplayClock();
    // Both replay replacement and rollback are out-of-band state replacement.
    for (let i = 0; i < 2; i++) {
      useWorkplaceStore.setState({ workplace: structuredClone(get().workplace) });
      expect(get().turn).toBeNull();
      turn();
    }
  });
  it('excludes setup/system dispatch and current facilitator impersonation', () => {
    get().setParticipationMode('separate-turns');
    get().start('workshop');
    const token = turn();
    expect(
      get().runTurnCommand(token, {
        type: 'activate',
        args: [get().workplace.revision],
      } as unknown as RoleCommand).changed
    ).toBe(false);
    expect(
      get().runTurnCommand(token, {
        type: 'tick',
        args: [90, 600, false],
      } as unknown as RoleCommand).changed
    ).toBe(false);
    expect(get().configure({ governance: 'member-vote' }).changed).toBe(false);
    expect(get().simulateResponses().changed).toBe(false);
    expect(get().setParticipationMode('solo').changed).toBe(false);
  });
  it('keeps the mode, expires authority and retains obligations on explicit reload and rehydration', async () => {
    get().setParticipationMode('separate-turns');
    get().start('workshop');
    checked();
    expect(get().rehearseReload(get().workplace.revision).changed).toBe(true);
    expect(get().participationMode).toBe('separate-turns');
    expect(get().turn).toBeNull();
    expect(get().workplace.phase).toBe('review');
    // Token remains ephemeral even if rehydrate is explicitly called in-page.
    turn();
    await useWorkplaceStore.persist.rehydrate();
    expect(get().turn).toBeNull();
    expect(get().participationMode).toBe('separate-turns');
  });
  it('defaults missing old mode to solo and malformed new mode to separate turns without resetting money', async () => {
    get().start('workshop', 17);
    for (const m of get().workplace.members) {
      get().understand(m.id);
      get().vote(m.id, true);
    }
    get().activate(get().workplace.revision);
    get().tick(2, 0, false);
    const s = get().workplace;
    const closingCash = s.finance.cash;
    for (const mode of [undefined, 'corrupt']) {
      await safeJSONStorage.setItem('millos-workplace-laboratory', {
        version: 2,
        state: { workplace: saveWorkplace(s), ...(mode ? { participationMode: mode } : {}) },
      });
      await useWorkplaceStore.persist.rehydrate();
      expect(get().workplace.finance.cash).toBe(closingCash);
      expect(get().participationMode).toBe(mode ? 'separate-turns' : 'solo');
    }
  });
  it('uses adviser-only live advice preparation and clears the turn when advice changes', () => {
    get().setParticipationMode('separate-turns');
    get().beginImprovement('team', get().workplace.revision, undefined, 'workshop');
    let token = turn('packing');
    expect(run(token, 'proposeImprovement', ['briefing', 'packing']).changed).toBe(true);
    expect(get().turn).toBeNull();
    token = checked('mind');
    expect(run(token, 'acknowledgeImprovement', []).changed).toBe(true);
    get().endTurn();
    token = checked();
    expect(run(token, 'understand', ['packing']).changed).toBe(true);
    expect(run(token, 'challengeImprovement', ['packing', 'forecast']).changed).toBe(true);
    expect(get().turn).toBeNull();
    expect(get().workplace.members[0].understood).toBe(false);
  });
  it('completes adviser review and continues a handoff with fresh separate turns', () => {
    get().setParticipationMode('separate-turns');
    get().beginImprovement('team', get().workplace.revision, undefined, 'workshop');
    let token = turn('packing');
    run(token, 'proposeImprovement', ['briefing', 'packing']);
    token = checked('mind');
    run(token, 'acknowledgeImprovement', []);
    get().endTurn();
    for (const actor of ['packing', 'quality', 'maintenance', 'coordinator']) {
      token = checked(actor);
      expect(run(token, 'understand', [actor]).changed).toBe(true);
      expect(run(token, 'vote', [actor, true]).changed).toBe(true);
      get().endTurn();
    }
    expect(get().activate(get().workplace.revision).changed).toBe(true);
    get().tick(90, 0, false);
    token = turn('mind');
    expect(run(token, 'acknowledgeImprovementReview', []).changed).toBe(true);
    get().endTurn();
    for (const actor of ['packing', 'quality', 'maintenance', 'coordinator']) {
      token = turn(actor);
      expect(run(token, 'voteImprovementReview', [actor, 'adopt']).changed).toBe(true);
    }
    expect(get().finishImprovementReview(get().workplace.revision).changed).toBe(true);
    expect(get().continueImprovement(get().workplace.revision).changed).toBe(true);
    expect(get().turn).toBeNull();
    expect(get().participationMode).toBe('separate-turns');
    expect(get().workplace.improvement?.history).toHaveLength(1);
  });
  it('never scripts a participant objection in separate turns', () => {
    get().setParticipationMode('separate-turns');
    get().startCampaign('team');
    const token = turn('coordinator');
    expect(run(token, 'respondToPressure', ['disclosure', 'accept-demand']).changed).toBe(false);
    expect(get().workplace.objections).toHaveLength(0);
  });
  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    'completes three %s shifts with fresh roles and retained accounting',
    (profile) => {
      get().setParticipationMode('separate-turns');
      get().startCampaign(profile, 17);
      for (let shift = 0; shift < 3; shift++) {
        if (shift !== 1) {
          const token = turn('coordinator');
          expect(
            run(token, 'campaignDecision', [
              shift === 0 ? 'renegotiate' : 'protect-refusal',
              'coordinator',
            ]).changed
          ).toBe(true);
        }
        for (const actor of ['packing', 'quality', 'maintenance', 'coordinator', 'mind']) {
          const token = checked(actor);
          for (const q of requiredChecks(actor))
            expect(
              run(token, 'answerCheck', [
                actor,
                q,
                WORKPLACE_CHECKS.find((c) => c.id === q)!.correct,
              ]).changed
            ).toBe(true);
          if (actor !== 'mind') {
            expect(run(token, 'understand', [actor]).changed).toBe(true);
            expect(run(token, 'vote', [actor, true]).changed).toBe(true);
          }
          get().endTurn();
        }
        expect(get().activate(get().workplace.revision).changed).toBe(true);
        if (shift === 1) {
          get().tick(25, 0, false);
          const token = turn('quality');
          expect(run(token, 'campaignDecision', ['inspect', 'quality']).changed).toBe(true);
          get().endTurn();
        }
        while (get().workplace.phase === 'active') get().tick(5, 0, false);
        expect(get().turn).toBeNull();
        expect(get().participationMode).toBe('separate-turns');
        if (shift < 2) expect(get().nextCampaignShift().changed).toBe(true);
      }
      expect(get().workplace.campaign?.history).toHaveLength(2);
      expect(fairnessReceipt(get().workplace)[0].earnedPayAndMemberDistributions).toBeCloseTo(81);
      expect(get().archiveCampaign(get().workplace.revision).changed).toBe(true);
      expect(get().participationMode).toBe('separate-turns');
    }
  );
  it('keeps earned compensation and recovery debt through reload', () => {
    let s = createWorkplace('workshop');
    const reduce = (command: WorkplaceCommand) => {
      s = transitionWorkplace(s, command).state;
    };
    reduce({ type: 'start', args: ['workshop', 17] });
    reduce({
      type: 'configure',
      args: [{ practices: ['information', 'rest', 'remedy', 'work-choice', 'budget'] }],
    });
    reduce({ type: 'selectPlan', args: ['cover'] });
    for (const m of s.members) {
      reduce({ type: 'understand', args: [m.id] });
      reduce({ type: 'vote', args: [m.id, true] });
      reduce({ type: 'consentToCover', args: [m.id, m.id === 'packing'] });
    }
    reduce({ type: 'activate', args: [s.revision] });
    reduce({ type: 'tick', args: [2, 0, false] });
    useWorkplaceStore.setState({ workplace: s, participationMode: 'separate-turns' });
    const before = fairnessReceipt(s);
    get().rehearseReload(s.revision);
    expect(fairnessReceipt(get().workplace)).toEqual(
      before.map((r) => ({
        ...r,
        wagesReserved: 0,
        compensationReserved: 0,
        currentCoverConsent: null,
      }))
    );
    expect(fairnessReceipt(get().workplace)[0].recoveryOwed).toBe(10);
  });
});
