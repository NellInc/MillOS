import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceCampaignArchive, WorkplaceLeaveSeason } from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { requiredChecks, WORKPLACE_CHECKS } from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';

function finishCampaign() {
  const store = useWorkplaceStore.getState();
  store.startCampaign('cooperative', 17);
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      store.campaignDecision(shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator');
    for (const actor of ['packing', 'mind']) {
      for (const check of requiredChecks(actor))
        store.answerCheck(
          actor,
          check,
          WORKPLACE_CHECKS.find((item) => item.id === check)!.correct
        );
      if (actor === 'packing') store.understand(actor);
    }
    store.vote('packing', true);
    store.simulateResponses();
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    while (useWorkplaceStore.getState().workplace.phase === 'active') {
      const state = useWorkplaceStore.getState().workplace;
      if (shift === 1 && state.minute >= 25 && !state.campaign?.decision)
        store.campaignDecision('inspect', 'quality');
      store.tick(5, 0, false);
    }
    if (shift < 2) store.nextCampaignShift();
  }
}

beforeEach(() => {
  endReplayClock();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
  useWorkplaceReplayStore.setState({ activeRunId: null });
});
afterEach(cleanup);

describe('completed campaign review interface', () => {
  it('keeps shortfalls in a redacted review and opens a fresh discussion without consent', () => {
    finishCampaign();
    const fresh = vi.fn();
    render(<WorkplaceCampaignArchive onFreshExercise={fresh} />);
    expect(screen.getByText(/400 illustrative credits/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    );
    expect(fresh).toHaveBeenCalledOnce();
    expect(screen.getByText('Retained campaign reviews (1)')).toBeInTheDocument();
    expect(screen.getByText(/delivery shortfall/)).toBeInTheDocument();
    expect(screen.getAllByText(/recovery owed 0.0 min/)).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: 'Download this redacted review', hidden: true })
    ).toBeInTheDocument();
    expect(
      useWorkplaceStore
        .getState()
        .workplace.members.every(
          (member) => member.ballot === null && member.coverConsent === null && !member.understood
        )
    ).toBe(true);
  });

  it('makes the blocker explicit while recovery or a replay is unfinished', () => {
    finishCampaign();
    const settled = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: {
        ...settled,
        members: settled.members.map((member, index) => ({
          ...member,
          recoveryOwedMinutes: index === 0 ? 5 : 0,
        })),
      },
    });
    const fresh = vi.fn();
    render(<WorkplaceCampaignArchive onFreshExercise={fresh} />);
    const archive = screen.getByRole('button', {
      name: 'Archive review and open a fresh exercise',
    });
    expect(archive).toBeDisabled();
    expect(screen.getByText(/Deliver owed recovery/)).toBeInTheDocument();
    act(() => {
      useWorkplaceStore.setState({ workplace: settled });
      useWorkplaceReplayStore.setState({ activeRunId: 'incomplete-replay' });
    });
    expect(archive).toBeDisabled();
    expect(screen.getByText('Finish or forget the matched replay first.')).toBeInTheDocument();
    expect(fresh).not.toHaveBeenCalled();
  });

  it('does not offer a reset during an ordinary active or partial campaign', () => {
    useWorkplaceStore.getState().startCampaign('team', 17);
    render(<WorkplaceCampaignArchive onFreshExercise={vi.fn()} />);
    expect(
      screen.queryByRole('region', { name: 'Completed workplace campaigns' })
    ).not.toBeInTheDocument();
  });
});

describe('leaving a season from the laboratory', () => {
  it('waits for a running shift, then keeps the left season apart from completed reviews', () => {
    const store = useWorkplaceStore.getState();
    store.startCampaign('cooperative', 17);
    store.campaignDecision('keep-target', 'coordinator');
    for (const actor of ['packing', 'mind']) {
      for (const check of requiredChecks(actor))
        store.answerCheck(
          actor,
          check,
          WORKPLACE_CHECKS.find((item) => item.id === check)!.correct
        );
      if (actor === 'packing') store.understand(actor);
    }
    store.vote('packing', true);
    store.simulateResponses();
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    store.tick(30, 0, false);
    const fresh = vi.fn();
    render(
      <>
        <WorkplaceCampaignArchive onFreshExercise={vi.fn()} />
        <WorkplaceLeaveSeason onLeft={fresh} />
      </>
    );
    expect(
      screen.queryByRole('region', { name: 'Completed workplace campaigns' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave this season' })).toBeDisabled();
    expect(
      screen.getByText(/Leaving waits until this shift is stopped or ends/)
    ).toBeInTheDocument();
    act(() => {
      store.stop();
    });
    expect(screen.getByText(/36.00 credits in pay and cover/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave this season' }));
    expect(fresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Season left early at shift 1 of 3');
    expect(screen.getByText('Seasons left early (1)')).toBeInTheDocument();
    expect(screen.getByText('Left early at shift 1 of 3, seed 17')).toBeInTheDocument();
    expect(screen.queryByText(/Retained campaign reviews/)).not.toBeInTheDocument();
    expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  });
});
