import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceReadiness,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import { requiredChecks, WORKPLACE_CHECKS } from './workplaceCampaign';
import type { WorkplaceProfile } from '../types/workplace';

function exercise(profile: WorkplaceProfile) {
  let state = createWorkplace();
  const run = (type: WorkplaceCommand['type'], args: unknown[]) => {
    const result = transitionWorkplace(state, { type, args } as WorkplaceCommand);
    state = result.state;
    return result;
  };
  run('startCampaign', [profile, 17]);
  run('campaignDecision', ['keep-target', 'coordinator']);
  run('selectPlan', ['cover']);
  for (const actor of ['packing', 'mind'])
    for (const check of requiredChecks(actor))
      run('answerCheck', [
        actor,
        check,
        WORKPLACE_CHECKS.find((item) => item.id === check)!.correct,
      ]);
  return {
    run,
    get state() {
      return state;
    },
    get packing() {
      return state.members.find((member) => member.id === 'packing')!;
    },
  };
}

describe.each(['toe-dip', 'team', 'cooperative'] as const)('%s player-owned consent', (profile) => {
  it.each([false, true])('peer responses preserve Packing after confirmation=%s', (confirmed) => {
    const c = exercise(profile);
    if (confirmed) c.run('understand', ['packing']);
    const before = structuredClone(c.packing);
    c.run('simulateResponses', []);
    c.run('simulateResponses', []);
    expect(c.packing).toEqual(before);
    expect(c.packing.ballot).toBeNull();
    expect(c.packing.coverConsent).toBeNull();
    expect(workplaceReadiness(c.state).allowed).toBe(false);
    expect(c.run('activate', [c.state.revision]).changed).toBe(false);
  });

  it('preserves an explicit policy no and separate cover decline', () => {
    const c = exercise(profile);
    c.run('understand', ['packing']);
    c.run('vote', ['packing', false]);
    c.run('consentToCover', ['packing', false]);
    const before = structuredClone(c.packing);
    c.run('simulateResponses', []);
    expect(c.packing).toEqual(before);
    expect(c.packing.sharing).toBe(false);
  });

  it('requires new decisions after revision and retains earned obligations on reload', () => {
    const c = exercise(profile);
    c.run('understand', ['packing']);
    c.run('vote', ['packing', true]);
    c.run('consentToCover', ['packing', true]);
    c.run('simulateResponses', []);
    c.run('selectPlan', ['steady']);
    c.run('simulateResponses', []);
    expect(c.packing.understood).toBe(false);
    expect(c.packing.ballot).toBeNull();
    expect(c.packing.coverConsent).toBeNull();

    const active = exercise(profile);
    active.run('understand', ['packing']);
    active.run('vote', ['packing', true]);
    active.run('consentToCover', ['packing', true]);
    active.run('simulateResponses', []);
    expect(active.run('activate', [active.state.revision]).changed).toBe(true);
    active.run('tick', [3, 0, false]);
    active.run('stop', []);
    const restored = restoreWorkplace(saveWorkplace(active.state));
    expect(restored.members[0].compensationPaid).toBe(active.packing.compensationPaid);
    expect(restored.members[0].recoveryOwedMinutes).toBe(active.packing.recoveryOwedMinutes);
    expect(restored.members[0].earnedPay).toBe(active.packing.earnedPay);
    expect(restored.members[0].ballot).toBeNull();
    expect(restored.members[0].coverConsent).toBeNull();
    expect(restored.members[0].understood).toBe(false);
  });
});
