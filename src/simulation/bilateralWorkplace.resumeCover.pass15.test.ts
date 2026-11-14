import { describe, expect, it } from 'vitest';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceAlternatives,
  workplaceReadiness,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  CAMPAIGN_PRESSURES,
  requiredChecks,
  shiftResumable,
  thursdayNegotiation,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { setLocale, translate } from '../i18n';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';

function season() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 23] });
  // The fixed order a season begun before seeded draws keeps (5.10): of the
  // authored roles, Maintenance is the one willing to cover.
  delete state.campaign!.draw;
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

/** Shift one on the cover plan, activated with Packing and Maintenance both willing. */
function coverShift() {
  setLocale('en');
  const s = season();
  s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
  s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[0].id, 'protect-boundary'] });
  expect(s.run({ type: 'selectPlan', args: ['cover'] }).changed).toBe(true);
  s.agree();
  s.run({ type: 'consentToCover', args: ['packing', true] });
  expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
  const coverId = s.state.activeCoverMemberId!;
  expect(coverId).toBeTruthy();
  return { s, coverId };
}

const coverConsentReason = () => translate(bilateralWorkplaceMessages, 'readyCoverConsent');

// One member covers a shift. Activation continues a resumed shift's cover only
// with the member who began it, and only for the minutes left; readiness and
// the public alternatives judged it as if the shift had never started, so a
// worked-out cover still demanded a new volunteer, and a cover its member
// declined still reserved compensation and listed someone else as volunteer.
describe('a resumed cover shift is judged on the cover that can still run (pass fifteen)', () => {
  it('asks no one to consent to cover that is already fully worked', () => {
    const { s } = coverShift();
    for (let i = 0; i < 3; i++) s.run({ type: 'tick', args: [5, 0, false] });
    expect(s.state.minute).toBe(15);
    s.reload();
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.agree();
    // Every willing member answers no: there is no cover left to take.
    for (const id of ['packing', 'maintenance'])
      s.run({ type: 'consentToCover', args: [id, false] });
    const cover = workplaceAlternatives(s.state).find((plan) => plan.id === 'cover')!;
    expect(cover.maximumCompensation).toBe(0);
    const readiness = workplaceReadiness(s.state);
    expect(readiness.reasons).not.toContain(coverConsentReason());
    expect(readiness.allowed).toBe(true);
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    expect(s.state.activeCoverMemberId).toBeNull();
  });

  it('reserves and lists nothing for a cover whose member declines to continue', () => {
    const { s, coverId } = coverShift();
    s.run({ type: 'tick', args: [5, 0, false] });
    expect(s.state.members.find((m) => m.id === coverId)!.extraMinutes).toBe(5);
    s.reload();
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.agree();
    const other = coverId === 'packing' ? 'maintenance' : 'packing';
    s.run({ type: 'consentToCover', args: [other, true] });
    s.run({ type: 'consentToCover', args: [coverId, false] });
    const cover = workplaceAlternatives(s.state).find((plan) => plan.id === 'cover')!;
    expect(workplaceReadiness(s.state).allowed).toBe(true);
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    // What the alternatives promised is what activation reserved.
    expect(s.state.activeCoverMemberId).toBeNull();
    expect(cover.maximumCompensation).toBeCloseTo(s.state.finance.compensationReserve, 6);
    expect(cover.volunteers).toEqual([]);
  });

  it('still continues the cover with the member who began it when they consent again', () => {
    const { s, coverId } = coverShift();
    s.run({ type: 'tick', args: [5, 0, false] });
    s.reload();
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    s.agree();
    s.run({ type: 'consentToCover', args: [coverId, true] });
    const cover = workplaceAlternatives(s.state).find((plan) => plan.id === 'cover')!;
    expect(cover.maximumCompensation).toBeCloseTo(4, 6);
    expect(cover.volunteers.map((v) => v.role)).toEqual([
      s.state.members.find((m) => m.id === coverId)!.role,
    ]);
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    expect(s.state.activeCoverMemberId).toBe(coverId);
    expect(s.state.coverRemainingMinutes).toBeCloseTo(5, 6);
    expect(s.state.finance.compensationReserve).toBeCloseTo(4, 6);
  });

  it('still asks for a volunteer before a fresh cover shift', () => {
    setLocale('en');
    const s = season();
    s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    s.run({ type: 'respondToPressure', args: [CAMPAIGN_PRESSURES[0].id, 'protect-boundary'] });
    s.run({ type: 'selectPlan', args: ['cover'] });
    s.agree();
    for (const id of ['packing', 'maintenance'])
      s.run({ type: 'consentToCover', args: [id, false] });
    expect(workplaceReadiness(s.state).reasons).toContain(coverConsentReason());
  });
});

// The Thursday negotiation keyed its next step on Packing's cover consent on
// any cover plan, so on a resumed shift whose cover was worked out, or begun by
// Maintenance, the card still told the player Packing's consent was pending,
// which readiness no longer asks for.
// Working if the card asks Packing about cover only when Packing's consent can
// still decide it.
describe('the Thursday negotiation on a resumed cover shift (pass fifteen)', () => {
  const atThursday = (s: ReturnType<typeof coverShift>['s']) => {
    // The shift-two card, with Packing's understanding, vote and the adviser's
    // correction already done, so only the cover step is left to decide.
    s.state.campaign!.shift = 2;
    s.state.events.push({
      id: 'e-thursday-correction',
      minute: s.state.minute,
      actorId: 'mind',
      kind: 'adviser-correction',
      detail: 'Public authored correction.',
    });
    return thursdayNegotiation(s.state)!.next;
  };
  const pending = () => translate(workplaceCampaignMessages, 'nextCoverPending');

  it('does not ask Packing about cover already worked out', () => {
    const { s } = coverShift();
    for (let i = 0; i < 3; i++) s.run({ type: 'tick', args: [5, 0, false] });
    s.reload();
    s.run({ type: 'resumeShift', args: [s.state.revision] });
    s.agree();
    expect(s.state.members.find((m) => m.id === 'packing')!.coverConsent).toBeNull();
    expect(atThursday(s)).not.toBe(pending());
  });

  it('does not ask Packing about cover another member began', () => {
    const { s, coverId } = coverShift();
    s.run({ type: 'tick', args: [5, 0, false] });
    s.reload();
    s.run({ type: 'resumeShift', args: [s.state.revision] });
    s.agree();
    expect(coverId).toBe('maintenance');
    expect(atThursday(s)).not.toBe(pending());
  });
});
