import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceNegotiation, WorkplacePracticeProposal } from './WorkplaceNegotiation';
import {
  createWorkplace,
  exportPracticeProposal,
  exportWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import {
  requiredChecks,
  thursdayNegotiation,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile } from '../../../types/workplace';
import { deriveWorkplaceGuidance } from './WorkplacePressureChapter';

function thursday(profile: WorkplaceProfile = 'cooperative') {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const agree = (cover = false) => {
    for (const actor of ['packing', 'mind'])
      for (const check of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, check, WORKPLACE_CHECKS.find((item) => item.id === check)!.correct],
        });
    run({ type: 'understand', args: ['packing'] });
    run({ type: 'vote', args: ['packing', true] });
    if (cover) run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  run({ type: 'startCampaign', args: [profile, 17] });
  for (let shift = 0; shift < 2; shift++) {
    if (shift === 0) {
      run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
      run({ type: 'selectPlan', args: ['cover'] });
    }
    agree(shift === 0);
    expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
    while (state.phase === 'active') {
      if (shift === 1 && state.minute >= 25 && !state.campaign?.inspectionUntilMinute)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
    expect(run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
  }
  return {
    run,
    agree,
    get state() {
      return state;
    },
  };
}

const originalCreateURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ['createObjectURL', originalCreateURL],
    ['revokeObjectURL', originalRevokeURL],
  ] as const) {
    if (descriptor) Object.defineProperty(URL, name, descriptor);
    else Reflect.deleteProperty(URL, name);
  }
});

describe('Thursday shop-floor negotiation', () => {
  it('routes a genuine team veto back to revised terms and keeps the adviser accountable', () => {
    const c = thursday('team');
    c.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['cover'] });
    c.agree();
    c.run({ type: 'vote', args: ['packing', false] });
    expect(deriveWorkplaceGuidance(c.state).destination).toBe('Shift');
    render(<WorkplaceNegotiation state={c.state} />);
    expect(screen.getByText(/Your policy no holds/)).toBeInTheDocument();
    expect(screen.getByText(/Dispatch remains uncertain/)).toBeInTheDocument();
    expect(screen.getByText(/You can challenge my authority/)).toBeInTheDocument();
  });

  it('makes the adviser hold an open worker challenge and shows actual costs separately', () => {
    const c = thursday();
    c.run({ type: 'respondToPressure', args: ['repeat-cover', 'accept-demand'] });
    render(<WorkplaceNegotiation state={c.state} />);
    expect(screen.getByText(/holding execution until each raiser/)).toBeInTheDocument();
    expect(screen.getByText(/This shift: wages paid/)).toHaveTextContent('wages paid 0.00 credits');
    expect(c.state.objections[0].status).toBe('open');
  });
  it.each(['toe-dip', 'team', 'cooperative'] as const)(
    'stages real %s challenge, correction and fresh decisions',
    (profile) => {
      const c = thursday(profile);
      const { rerender } = render(<WorkplaceNegotiation state={c.state} />);
      expect(screen.getByText(/Correct the adviser/)).toBeInTheDocument();
      c.run({ type: 'respondToPressure', args: ['repeat-cover', 'accept-demand'] });
      rerender(<WorkplaceNegotiation state={c.state} />);
      expect(screen.getByText(/Restate protected terms/)).toBeInTheDocument();
      c.run({ type: 'respondToPressure', args: ['repeat-cover', 'protect-boundary'] });
      c.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      rerender(<WorkplaceNegotiation state={c.state} />);
      expect(screen.getByText(/Packing reviews the remedy/)).toBeInTheDocument();
      const objection = c.state.objections[0];
      expect(c.run({ type: 'resolveObjection', args: [objection.id, 'mind'] }).changed).toBe(false);
      expect(c.run({ type: 'resolveObjection', args: [objection.id, 'packing'] }).changed).toBe(
        true
      );
      expect(thursdayNegotiation(c.state)?.correction).toBe(true);
      c.run({ type: 'selectPlan', args: ['cover'] });
      c.agree(true);
      const before = c.state;
      rerender(<WorkplaceNegotiation state={c.state} />);
      expect(screen.getByText('Understanding')).toBeInTheDocument();
      expect(screen.getByText('confirmed')).toBeInTheDocument();
      expect(screen.getAllByText('yes')).toHaveLength(2);
      fireEvent.click(screen.getByText('Offer, choices and receipts'));
      expect(c.state).toBe(before);
      expect(screen.getByText(/This receipt grants no new permission/)).toBeInTheDocument();
      expect(screen.getByText(/credits paid; recovery/)).toHaveTextContent('8.00 credits paid');
    }
  );

  it('distinguishes prevention from remedy and never promotes offered terms to delivered receipts', () => {
    const c = thursday();
    c.run({ type: 'respondToPressure', args: ['repeat-cover', 'protect-boundary'] });
    render(<WorkplaceNegotiation state={c.state} />);
    expect(screen.getByText(/no objection was resolved/)).toBeInTheDocument();
    expect(thursdayNegotiation(c.state)?.understanding).toBe('pending');
    expect(thursdayNegotiation(c.state)?.policy).toBe('pending');
    expect(thursdayNegotiation(c.state)?.delivery.status).not.toBe('met');
  });

  it('keeps earned payment and recovery debt visible after a fresh cover withdrawal', () => {
    const c = thursday();
    c.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
    c.run({ type: 'selectPlan', args: ['cover'] });
    c.agree(true);
    c.run({ type: 'activate', args: [c.state.revision] });
    c.run({ type: 'tick', args: [3, 0, false] });
    const actor = c.state.activeCoverMemberId!;
    c.run({ type: 'withdraw', args: [actor] });
    c.run({ type: 'stop', args: [] });
    const moment = thursdayNegotiation(c.state)!;
    expect(moment.paid).toBeCloseTo(10.4);
    expect(moment.owed).toBe(10);
    expect(moment.delivered).toBe(10);
    render(<WorkplaceNegotiation state={c.state} />);
    expect(screen.getByText(/10.40 credits paid/)).toHaveTextContent('10.0 min owed');
  });
});

describe('reversible practice draft', () => {
  it('exports public planning boundaries without private reasons or current authority', () => {
    const state = createWorkplace();
    state.members[0].preference = 'PRIVATE-SYNTHETIC-EXPLANATION';
    state.members[0].ballot = true;
    state.members[0].coverConsent = true;
    const before = structuredClone(state);
    const proposal = exportPracticeProposal(state);
    expect(proposal.liveControl).toBe(false);
    expect(proposal.localApprovals).toContain('Not collected');
    expect(proposal.limits.maximumCoverMinutes).toBe(10);
    expect(proposal.repayment.recoveryMinutes).toBe(10);
    expect(proposal.rollback).toContain('owed recovery');
    expect(JSON.stringify(proposal)).not.toMatch(/PRIVATE-SYNTHETIC|ballot|coverConsent/);
    expect(exportWorkplace(state).practiceProposal).toEqual(proposal);
    expect(state).toEqual(before);
  });

  it('downloads the public draft locally without changing the workplace', async () => {
    const state = createWorkplace();
    const create = vi.fn((_blob: Blob) => 'blob:practice-draft');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<WorkplacePracticeProposal state={state} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Download planning-only practice proposal' })
    );
    const blob = create.mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual(exportPracticeProposal(state));
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:practice-draft');
    expect(state.phase).toBe('idle');
    expect(state.members.every((member) => member.ballot === null)).toBe(true);
  });
});
