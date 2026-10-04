import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceControls, useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { turnChecks } from '../../../simulation/workplaceParticipation';
import {
  WorkplaceParticipation,
  WorkplaceDemonstration,
  WorkplaceFairness,
  WorkplaceAutomaticDemo,
  WorkplaceAutoplayStatus,
} from './WorkplaceParticipation';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({ manual: false, message: null });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
  });
});
it('hands over explicit roles and refuses a retained rendered callback after a new turn', () => {
  const callbacks: (() => unknown)[] = [];
  function Probe() {
    const s = useWorkplaceControls();
    callbacks.push(() => s.vote('packing', true));
    return <WorkplaceParticipation report={() => {}} />;
  }
  const store = useWorkplaceStore.getState();
  store.setParticipationMode('separate-turns');
  store.start('workshop');
  store.startTurn('packing');
  for (const q of turnChecks(store.workplace))
    useWorkplaceStore
      .getState()
      .answerTurnCheck(useWorkplaceStore.getState().turn!.token, q.id, q.correct);
  useWorkplaceStore.getState().runTurnCommand(useWorkplaceStore.getState().turn!.token, {
    type: 'understand',
    args: ['packing'],
  });
  render(<Probe />);
  for (const q of turnChecks(useWorkplaceStore.getState().workplace)) {
    expect(document.getElementById(`turn-answer-${q.id}`)).toHaveTextContent(
      q.options.find((o) => o.value === q.correct)!.label
    );
  }
  const old = callbacks.at(-1)!;
  fireEvent.click(screen.getByRole('button', { name: 'End participant turn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Begin participant turn' }));
  expect(old()).toMatchObject({ changed: false });
  expect(useWorkplaceStore.getState().workplace.members[0].ballot).toBeNull();
  act(() => {
    callbacks.at(-1)!();
  });
  expect(useWorkplaceStore.getState().workplace.members[0].ballot).toBe(true);
});
it('guide navigation cannot manufacture consent, pay or shipping', () => {
  const navigate = vi.fn();
  render(<WorkplaceDemonstration navigate={navigate} report={() => {}} />);
  const before = structuredClone(useWorkplaceStore.getState().workplace);
  fireEvent.click(screen.getByRole('button', { name: 'Open ten-minute guide' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Go to Agreement / Voices' })[0]);
  expect(navigate).toHaveBeenCalledWith('Agreement / Voices');
  expect(useWorkplaceStore.getState().workplace).toEqual(before);
});
it('opens the season from Handoff and navigates to the real campaign decisions', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Handoff', exact: true }));
  fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
  fireEvent.change(screen.getByLabelText('Season adoption route'), {
    target: { value: 'cooperative' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Start season with current customer commitment' })
  );
  expect(useWorkplaceStore.getState().workplace.campaign?.mission).toBeDefined();
  expect(screen.getByRole('button', { name: 'Shift', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices', exact: true }));
  fireEvent.click(screen.getByText('Packing: policy vote pending', { exact: true }));
  fireEvent.change(
    screen.getByLabelText(
      'Packing: Must a role share a private explanation to retain pay or refuse?'
    ),
    { target: { value: 'optional' } }
  );
  expect(document.getElementById('check-answer-packing-privacy')).toHaveTextContent(
    'No, explanation sharing is optional and revocable'
  );
  expect(useWorkplaceStore.getState().workplace.members[0].understood).toBe(false);
});
it('shows outstanding individual debt without optional preference reasons', () => {
  const s = createWorkplace();
  s.members[0].recoveryOwedMinutes = 5;
  s.members[0].preference = 'PRIVATE';
  useWorkplaceStore.setState({ workplace: s });
  render(<WorkplaceFairness />);
  fireEvent.click(screen.getByText('Individual fairness receipts'));
  expect(screen.getByLabelText('Fairness: Packing')).toHaveTextContent('Recovery owed: 5.0 min');
  expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
});

it('reuses the existing workshop recovery control beside individual receipts', () => {
  const s = createWorkplace('workshop');
  s.phase = 'review';
  s.members[0].recoveryOwedMinutes = 5;
  useWorkplaceStore.setState({ workplace: s });
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Review', exact: true }));
  fireEvent.click(screen.getByText('Individual fairness receipts'));
  expect(
    screen.getAllByRole('button', { name: 'Deliver modeled recovery (5 minutes)' })
  ).toHaveLength(1);
});

it('defaults to autonomous play and keeps human takeover across remount', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  vi.useFakeTimers();
  document.documentElement.dataset.millosStartupReady = 'true';
  const view = render(<WorkplaceAutoplayStatus />);
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Take over cooperative season' }));
  view.unmount();
  render(
    <>
      <WorkplaceAutoplayStatus />
      <WorkplaceAutomaticDemo profile="team" />
    </>
  );
  act(() => {
    vi.advanceTimersByTime(46000);
  });
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  delete document.documentElement.dataset.millosStartupReady;
  vi.useRealTimers();
});

it('waits for actual startup readiness before autonomous admission', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  vi.useFakeTimers();
  delete document.documentElement.dataset.millosStartupReady;
  const view = render(<WorkplaceAutoplayStatus />);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  document.documentElement.dataset.millosStartupReady = 'true';
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  act(() => {
    useWorkplaceAutoplay.getState().pause();
  });
  view.unmount();
  delete document.documentElement.dataset.millosStartupReady;
  vi.useRealTimers();
});

it('keeps fixed benchmark runs outside automatic admission', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  const before = window.location.href;
  window.history.replaceState(null, '', '/?benchmark=overview');
  document.documentElement.dataset.millosStartupReady = 'true';
  const view = render(<WorkplaceAutoplayStatus />);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  view.unmount();
  window.history.replaceState(null, '', before);
  delete document.documentElement.dataset.millosStartupReady;
});

it('does not claim automatic decisions are running after human takeover', () => {
  vi.useFakeTimers();
  const view = render(<WorkplaceAutomaticDemo profile="team" />);
  try {
    act(() => {
      useWorkplaceAutoplay.getState().start('team');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause automatic demo', exact: true }));
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(
      screen.queryByText('Fictional solo role decisions are running. Pause whenever you want.')
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
