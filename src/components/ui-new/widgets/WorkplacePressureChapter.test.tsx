import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplacePressureChapter } from './WorkplacePressureChapter';
import { createWorkplace, workplaceReadiness } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  campaignRecord,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile } from '../../../types/workplace';

const thirdShift = (profile: WorkplaceProfile = 'cooperative') => {
  const store = useWorkplaceStore.getState();
  store.startCampaign(profile, 17);
  const state = useWorkplaceStore.getState().workplace;
  const previous = campaignRecord({
    ...state,
    members: state.members.map((member) => ({
      ...member,
      extraMinutes: member.id === 'packing' ? 12 : 0,
    })),
  });
  useWorkplaceStore.setState({
    workplace: {
      ...state,
      campaign: { ...state.campaign!, shift: 2, history: [previous] },
    },
  });
  return useWorkplaceStore.getState().workplace;
};
const show = () => {
  const navigate = vi.fn();
  render(
    <WorkplacePressureChapter state={useWorkplaceStore.getState().workplace} navigate={navigate} />
  );
  return navigate;
};

beforeEach(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
afterEach(cleanup);

describe('Authored pressure chapter', () => {
  it('takes a ready agreement to its actual approval controls without granting consent', () => {
    const store = useWorkplaceStore.getState();
    store.startCampaign('cooperative', 17);
    store.campaignDecision('keep-target', 'coordinator');
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor))
        store.answerCheck(actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct);
    store.understand('packing');
    store.vote('packing', true);
    store.simulateResponses();
    const state = useWorkplaceStore.getState().workplace;
    expect(workplaceReadiness(state).allowed).toBe(true);
    const navigate = show();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Agreement / Voices controls' }));
    expect(navigate).toHaveBeenCalledWith('Agreement / Voices');
    expect(useWorkplaceStore.getState().workplace).toBe(state);
  });

  it('puts the qualified inspection action ahead of passive review during the second-shift hold', () => {
    const state = thirdShift('team');
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'active',
        minute: 25,
        campaign: {
          ...state.campaign!,
          shift: 1,
          inspectionComplete: false,
          inspectionUntilMinute: null,
        },
      },
    });
    const navigate = show();
    expect(screen.getByText('Quality reviews the line')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Shift controls' }));
    expect(navigate).toHaveBeenCalledWith('Shift');
    expect(useWorkplaceStore.getState().workplace.campaign?.inspectionUntilMinute).toBeNull();
  });
  it('shows retained burden for a direct third shift and navigates without answering or mutating', () => {
    const state = thirdShift();
    const navigate = show();
    expect(screen.getByText('Thursday: a fresh offer')).toBeInTheDocument();
    expect(screen.getByText(/Packing: retained extra duty 12.0 min/)).toBeInTheDocument();
    expect(screen.getByText(/pressure card is optional/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Shift controls' }));
    expect(navigate).toHaveBeenCalledWith('Shift');
    expect(useWorkplaceStore.getState().workplace).toBe(state);
  });

  it('distinguishes voluntary prevention from an author-confirmed remedy', () => {
    thirdShift();
    useWorkplaceStore.getState().respondToPressure('repeat-cover', 'protect-boundary');
    show();
    expect(screen.getByText(/Protected terms recorded without a challenge/)).toBeInTheDocument();
    expect(screen.queryByText(/challenge: resolved/)).not.toBeInTheDocument();
  });

  it('derives the restatement, raiser review and renewed-agreement beats from real transitions', () => {
    thirdShift();
    const store = useWorkplaceStore.getState();
    store.respondToPressure('repeat-cover', 'accept-demand');
    const navigate = vi.fn();
    const { rerender } = render(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={navigate}
      />
    );
    expect(screen.getByText('Restate the terms')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Shift controls' }));
    expect(navigate).toHaveBeenCalledWith('Shift');
    store.respondToPressure('repeat-cover', 'protect-boundary');
    rerender(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={navigate}
      />
    );
    expect(screen.getByText('The raiser reviews the remedy')).toBeInTheDocument();
    expect(screen.getByText(/Packing challenge: open/)).toBeInTheDocument();
    const objection = useWorkplaceStore.getState().workplace.objections[0];
    expect(store.resolveObjection(objection.id, 'quality').changed).toBe(false);
    expect(store.resolveObjection(objection.id, 'packing').changed).toBe(true);
    rerender(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={navigate}
      />
    );
    expect(screen.getByText('Earn a fresh agreement')).toBeInTheDocument();
    expect(screen.getByText(/Packing challenge: resolved/)).toBeInTheDocument();
  });

  it('clears displayed agreement after a real plan revision', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        members: state.members.map((member) => ({ ...member, understood: true, ballot: true })),
        campaign: { ...state.campaign!, adviserAcknowledged: true },
      },
    });
    const navigate = vi.fn();
    const { rerender } = render(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={navigate}
      />
    );
    expect(screen.getByText(/Adviser boundaries: acknowledged/)).toBeInTheDocument();
    useWorkplaceStore.getState().selectPlan('cover');
    rerender(
      <WorkplacePressureChapter
        state={useWorkplaceStore.getState().workplace}
        navigate={navigate}
      />
    );
    expect(screen.getByText(/Adviser boundaries: awaiting current answers/)).toBeInTheDocument();
    expect(screen.getByText(/Role understanding 0\/4; ballots recorded 0\/4/)).toBeInTheDocument();
  });

  it('keeps recovery debt and same-shift review honest after an in-flight objection', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'active',
        members: state.members.map((member) => ({
          ...member,
          recoveryOwedMinutes: member.id === 'packing' ? 10 : 0,
        })),
      },
    });
    show();
    expect(screen.getByText(/Use the plant clock controls/)).toBeInTheDocument();
    cleanup();
    useWorkplaceStore.getState().object('packing', 'burden');
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    show();
    expect(
      screen.getByText(/Resolving the objection cannot restart this same shift/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Packing:.*recovery delivered 0.0 min; recovery owed 10.0 min/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Delivery shortfall:/)).toBeInTheDocument();
  });

  it('reports stale mission evidence and deferral directly from the bound commitment', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({
      workplace: {
        ...state,
        phase: 'review',
        campaign: {
          ...state.campaign!,
          mission: {
            orderId: 'test-order',
            customer: 'Test customer',
            materialSessionId: 'test-session',
            startingShippedKg: 0,
            originalTargetKg: 1000,
            targetKg: 800,
            observedShippedKg: 800,
            creditedKg: 800,
            manifestIds: [],
            evidence: 'stale',
          },
        },
      },
    });
    show();
    expect(screen.getByText(/Delivery blocked: 800.0 \/ 800 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Full customer commitment remaining: 200 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Dispatch evidence: stale/)).toBeInTheDocument();
  });

  it.each([
    ['toe-dip', 'The coordinator hears each role before assigning qualified work.'],
    ['team', 'Every member must approve the shared plan.'],
    ['cooperative', 'A member majority approves the plan; it cannot volunteer an individual.'],
  ] as const)('retains individual consent under the %s charter', (profile, rule) => {
    thirdShift(profile);
    show();
    expect(screen.getByText(new RegExp(rule.replace(/[.;]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(/a no-extra-duty plan remains valid/)).toBeInTheDocument();
  });
});
