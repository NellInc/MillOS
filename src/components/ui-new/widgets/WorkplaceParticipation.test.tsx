import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({ manual: false, message: null });
  // Admission waits for the onboarding tour; these tests start after it.
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useAnnouncementsStore.getState().setContext({ onboarding: false });
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
  fireEvent.click(screen.getByRole('button', { name: 'Handoff' }));
  fireEvent.click(screen.getByText('Play a three-shift cooperative season'));
  fireEvent.change(screen.getByLabelText('Season adoption route'), {
    target: { value: 'cooperative' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Start season with current customer commitment' })
  );
  expect(useWorkplaceStore.getState().workplace.campaign?.mission).toBeDefined();
  expect(screen.getByRole('button', { name: 'Shift' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices' }));
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

it('names qualified and current tasks in Portuguese on the fairness receipts', () => {
  setLocale('pt-BR');
  try {
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    const { container } = render(<WorkplaceFairness />);
    expect(container).toHaveTextContent(
      'Tarefas habilitadas: Ensaque, Conferência de paletes. Tarefa atual: Ensaque.'
    );
    expect(container).not.toHaveTextContent(/Pallet checks|Quality release|Sampling/);
  } finally {
    setLocale('en');
  }
});
it('renames fairness receipts when the language changes after the workplace was created', () => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  setLocale('pt-BR');
  try {
    render(<WorkplaceFairness />);
    fireEvent.click(screen.getByText('Comprovantes individuais de equidade'));
    expect(screen.getByLabelText('Equidade: Ensaque')).toBeInTheDocument();
    expect(useWorkplaceStore.getState().workplace.members.map((m) => m.role)).toEqual([
      'Ensaque',
      'Qualidade',
      'Manutenção',
      'Coordenação',
    ]);
  } finally {
    setLocale('en');
  }
  expect(useWorkplaceStore.getState().workplace.members[0].role).toBe('Packing');
});
it('keeps an open participant turn across a language switch', () => {
  const store = useWorkplaceStore.getState();
  store.setParticipationMode('separate-turns');
  store.start('workshop');
  store.startTurn('packing');
  const token = useWorkplaceStore.getState().turn!.token;
  setLocale('pt-BR');
  try {
    expect(useWorkplaceStore.getState().workplace.members[0].role).toBe('Ensaque');
    expect(useWorkplaceStore.getState().turn?.token).toBe(token);
    expect(useWorkplaceStore.getState().turn?.anchor).toBe(useWorkplaceStore.getState().workplace);
  } finally {
    setLocale('en');
  }
  expect(useWorkplaceStore.getState().turn?.token).toBe(token);
});
it('reuses the existing workshop recovery control beside individual receipts', () => {
  const s = createWorkplace('workshop');
  s.phase = 'review';
  s.members[0].recoveryOwedMinutes = 5;
  useWorkplaceStore.setState({ workplace: s });
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
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

it.each([
  [false, false],
  [true, false],
  [false, true],
])(
  'a reload mid-season resumes the running season unless it was taken over (taken over: %s, orders all fulfilled: %s)',
  async (tookOver, ordersDone) => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    vi.useFakeTimers();
    document.documentElement.dataset.millosStartupReady = 'true';
    const view = render(<WorkplaceAutoplayStatus />);
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(useWorkplaceStore.getState().workplace.phase).not.toBe('idle');
    if (tookOver)
      fireEvent.click(screen.getByRole('button', { name: 'Take over cooperative season' }));
    view.unmount();
    // A reload ends the page's runner without anyone pausing it.
    const { name, storage } = useWorkplaceAutoplay.persist.getOptions();
    const saved = await storage!.getItem(name!);
    act(() => useWorkplaceAutoplay.getState().pause(true));
    await storage!.setItem(name!, saved!);
    delete document.documentElement.dataset.millosStartupReady;
    await act(async () => {
      await useWorkplaceAutoplay.persist.rehydrate();
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    // The season outlives the delivery programme that started it.
    if (ordersDone) useOperationsCampaignStore.setState({ activeOrderId: null });
    render(<WorkplaceAutoplayStatus />);
    document.documentElement.dataset.millosStartupReady = 'true';
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(!tookOver);
    expect(screen.queryByRole('button', { name: 'Take over cooperative season' }) !== null).toBe(
      !tookOver
    );
    act(() => useWorkplaceAutoplay.getState().pause(true));
    delete document.documentElement.dataset.millosStartupReady;
    vi.useRealTimers();
  }
);

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

it('holds autonomous admission while the onboarding tour is pending or showing', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useUIStore.setState({ hasSeenIntro: false, journeyVisible: false });
  vi.useFakeTimers();
  document.documentElement.dataset.millosStartupReady = 'true';
  const view = render(<WorkplaceAutoplayStatus />);
  try {
    // First-load profile: the tour card has not appeared yet.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    act(() => {
      useAnnouncementsStore.getState().setContext({ onboarding: true });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(useWorkplaceAutoplay.getState().manual).toBe(false);
    // Closing the tour with X leaves hasSeenIntro unset; the tour is still over.
    act(() => {
      useAnnouncementsStore.getState().setContext({ onboarding: false });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(true);
  } finally {
    act(() => {
      useWorkplaceAutoplay.getState().pause(true);
    });
    view.unmount();
    delete document.documentElement.dataset.millosStartupReady;
    vi.useRealTimers();
  }
});

it('keeps the desktop takeover control clear of the guide card column', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const resize = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    fireEvent(window, new Event('resize'));
  };
  resize(1440, 900);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useUIStore.setState({ journeyVisible: true });
  document.documentElement.dataset.millosStartupReady = 'true';
  const view = render(<WorkplaceAutoplayStatus />);
  try {
    const status = screen.getByRole('complementary', { name: 'Fictional demo running' });
    const takeover = screen.getByRole('button', { name: 'Take over cooperative season' });
    // The journey card starts 11.5rem up; one 44px control from 8rem stays below it.
    expect(status.className).toContain('bottom-[8rem]');
    expect(status.className).not.toContain('p-3');
    expect(screen.getByText('Autonomous cooperative season').className).toBe('sr-only');
    expect(takeover.textContent).toBe('Cooperative season running: take over');
    act(() => {
      useUIStore.setState({ journeyVisible: false });
    });
    expect(status.className).toContain('p-3');
    expect(takeover.textContent).toBe('Take over cooperative season');
  } finally {
    act(() => {
      useWorkplaceAutoplay.getState().pause(true);
    });
    view.unmount();
    resize(width, height);
    delete document.documentElement.dataset.millosStartupReady;
  }
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
    fireEvent.click(screen.getByRole('button', { name: 'Pause automatic demo' }));
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(
      screen.queryByText('Fictional solo role decisions are running. Pause whenever you want.')
    ).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it('reserves touch movement space in landscape and portrait while retaining takeover', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const resize = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    fireEvent(window, new Event('resize'));
  };
  resize(960, 540);
  document.documentElement.dataset.millosStartupReady = 'true';
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  const view = render(<WorkplaceAutoplayStatus />);
  try {
    const status = screen.getByRole('complementary', { name: 'Fictional demo running' });
    const takeover = screen.getByRole('button', { name: 'Take over cooperative season' });
    expect(status.className).toContain('top-4');
    expect(status.className).not.toContain('bottom-');
    expect(takeover.textContent).toBe('Cooperative season running: take over');
    expect(screen.getByText('Autonomous cooperative season').className).toBe('sr-only');
    resize(375, 812);
    expect(status.className).toContain('top-4');
    resize(1440, 900);
    expect(status.className).toContain('bottom-[8rem]');
    expect(takeover.textContent).toBe('Take over cooperative season');
    fireEvent.click(takeover);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(useWorkplaceAutoplay.getState().manual).toBe(true);
  } finally {
    view.unmount();
    resize(width, height);
    delete document.documentElement.dataset.millosStartupReady;
  }
});

it('explains current mandate checks without granting consent and focuses explicit handovers', async () => {
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().start('workshop', 17);
  get().startTurn('packing');
  render(<WorkplaceParticipation report={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('Mandate checks: 0 of 3');
  fireEvent.change(screen.getByLabelText('Turn check: mandate'), {
    target: { value: 'unlimited' },
  });
  expect(screen.getByRole('status')).toHaveTextContent('Mandate checks: 0 of 3');
  expect(screen.getByLabelText('Turn check: mandate')).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById('turn-answer-mandate')).toHaveTextContent('Needs another look.');
  expect(document.getElementById('turn-answer-mandate')).toHaveTextContent(
    turnChecks(get().workplace)[0].clarification
  );
  for (const q of turnChecks(get().workplace))
    fireEvent.change(screen.getByLabelText(`Turn check: ${q.id}`), {
      target: { value: q.correct },
    });
  expect(screen.getByRole('status')).toHaveTextContent('Mandate checks: 3 of 3');
  for (const q of turnChecks(get().workplace)) {
    expect(screen.getByLabelText(`Turn check: ${q.id}`)).toHaveAttribute('aria-invalid', 'false');
    expect(document.getElementById(`turn-answer-${q.id}`)).toHaveTextContent(
      'Matches the current terms.'
    );
    expect(document.getElementById(`turn-answer-${q.id}`)).toHaveTextContent(q.clarification);
  }
  expect(screen.getByRole('status')).toHaveTextContent(
    'Confirming understanding remains a separate choice'
  );
  expect(
    get().workplace.members.every(
      (member) => !member.understood && member.ballot === null && member.coverConsent === null
    )
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'End participant turn' }));
  await waitFor(() => expect(screen.getByLabelText('Hand over to fictional role')).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Begin participant turn' }));
  await waitFor(() => expect(screen.getByText(/Only Packing may/)).toHaveFocus());
  expect(screen.getByRole('status')).toHaveTextContent('Mandate checks: 0 of 3');
  for (const q of turnChecks(get().workplace)) {
    expect(document.getElementById(`turn-answer-${q.id}`)).toBeNull();
    expect(screen.getByLabelText(`Turn check: ${q.id}`)).not.toHaveAttribute('aria-invalid');
  }
});

it('relearns a changed advice-only mandate without retaining a previous turn or decisions', () => {
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().start('workshop', 17);
  get().startTurn('packing');
  render(<WorkplaceParticipation report={() => {}} />);
  fireEvent.change(screen.getByLabelText('Turn check: mandate'), { target: { value: 'bounded' } });
  expect(document.getElementById('turn-answer-mandate')).toHaveTextContent(
    'Matches the current terms.'
  );
  // Facilitator changes are correctly refused during an owned participant turn.
  act(() => {
    expect(get().configure({ aiAuthority: 'advice' }).changed).toBe(false);
  });
  expect(get().workplace.aiAuthority).toBe('bounded');
  fireEvent.click(screen.getByRole('button', { name: 'End participant turn' }));
  act(() => {
    expect(get().configure({ aiAuthority: 'advice' }).changed).toBe(true);
  });
  expect(get().turn).toBeNull();
  expect(document.getElementById('turn-answer-mandate')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Begin participant turn' }));
  const input = screen.getByLabelText('Turn check: mandate');
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'bounded' } });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById('turn-answer-mandate')).toHaveTextContent(
    'This mandate is advice only. Execution needs a new bounded agreement.'
  );
  fireEvent.change(input, { target: { value: 'advice' } });
  expect(input).toHaveAttribute('aria-invalid', 'false');
  expect(document.getElementById('turn-answer-mandate')).toHaveTextContent(
    'Matches the current terms.'
  );
  expect(get().workplace.phase).toBe('deliberating');
  expect(
    get().workplace.members.every(
      (m) => !m.understood && m.ballot === null && m.coverConsent === null
    )
  ).toBe(true);
});
