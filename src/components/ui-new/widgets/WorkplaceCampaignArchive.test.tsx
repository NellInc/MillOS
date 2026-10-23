import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FollowOnNotice,
  WorkplaceCampaignArchive,
  WorkplaceLeaveSeason,
} from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { setLocale } from '../../../i18n';
import type { WorkplaceMission } from '../../../types/workplace';
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

describe('the season’s earning link after its commitment', () => {
  const link = (orderId: string, customer: string, evidence: WorkplaceMission['evidence']) => ({
    orderId,
    customer,
    materialSessionId: 'session-real',
    startingShippedKg: 0,
    originalTargetKg: 2000,
    targetKg: 2000,
    observedShippedKg: 0,
    creditedKg: 0,
    manifestIds: [],
    evidence,
  });
  const season = (shift: number, followOn?: WorkplaceMission, missionKg = 0) => {
    useWorkplaceStore.getState().startCampaign('cooperative', 17);
    const state = useWorkplaceStore.getState().workplace;
    return {
      ...state,
      campaign: {
        ...state.campaign!,
        shift,
        mission: { ...link('order-old', 'First customer', 'current'), creditedKg: missionKg },
        ...(followOn ? { followOn } : {}),
      },
    };
  };
  beforeEach(() => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
  });
  afterEach(() => setLocale('en'));

  it('says a follow-on with bad evidence has stopped earning, and names its replacement', () => {
    const active = useOperationsCampaignStore.getState().orders[0];
    const state = season(1, link('order-next', 'Second customer', 'quality-failed'));
    render(<FollowOnNotice state={state} />);
    expect(
      screen.getByText(
        `Credit from Second customer has stopped: a load failed its quality threshold. The next shift credits dispatch to ${active.customer} in its place.`
      )
    ).toBeInTheDocument();
    cleanup();
    setLocale('pt-BR');
    render(<FollowOnNotice state={state} />);
    expect(
      screen.getByText(
        `O crédito de Second customer foi interrompido: uma carga não atingiu o limite de qualidade. O próximo turno credita a expedição para ${active.customer} no lugar dele.`
      )
    ).toBeInTheDocument();
  });

  it('says when nothing can replace it yet, and that the last shift replaces nothing', () => {
    const stopped = link('order-next', 'Second customer', 'missing');
    useOperationsCampaignStore.setState({ activeOrderId: null });
    const { unmount } = render(<FollowOnNotice state={season(1, stopped)} />);
    expect(screen.getByText(/No other open order can take its place yet/)).toBeInTheDocument();
    unmount();
    useOperationsCampaignStore.getState().initializeCampaign();
    render(<FollowOnNotice state={season(2, stopped)} />);
    expect(
      screen.getByText(/This is the season’s last shift, so nothing replaces it\./)
    ).toBeInTheDocument();
  });

  it('says nothing while the follow-on still earns', () => {
    const { container } = render(
      <FollowOnNotice state={season(1, link('order-next', 'Second customer', 'current'))} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
