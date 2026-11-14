import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceStep } from './WorkplaceStep';
import { WorkplaceAutoplayStatus } from './WorkplaceParticipation';
import { WorkplaceCampaignArchive } from './WorkplaceCampaignArchive';
import { OperationsPlayCard } from '../onboarding/PlayableShift';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { WORKPLACE_CHECKS, requiredChecks } from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale } from '../../../i18n';
import type { WorkplaceTransitionResult } from '../../../types/workplace';

vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// Review 2 of the cooperative season, widget side. Each test failed on the
// build the defect was found in.

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) =>
  expect(result.changed, result.reason ?? '').toBe(true);

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({ manual: false, resumeProfile: null, message: null });
  endReplayClock();
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useAnnouncementsStore.getState().setContext({ onboarding: false });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
    gameSpeed: 30,
    clockHolds: [],
  });
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  // A test that replaced a store action puts the real one back.
  useWorkplaceStore.setState(useWorkplaceStore.getInitialState());
});

function agree() {
  for (const actor of ['packing', 'mind'])
    for (const id of requiredChecks(actor)) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      if (workplace().campaign?.checks[actor]?.[id] !== q.correct)
        store().answerCheck(actor, id, q.correct);
    }
  if (!workplace().members[0].understood) store().understand('packing');
  if (workplace().members[0].ballot !== true) store().vote('packing', true);
  store().simulateResponses();
}
function finalReview(profile: 'toe-dip' | 'cooperative', kgPerTick = 50) {
  fulfilFirstDelivery();
  must(store().startCampaign(profile, 17));
  for (let shift = 0; shift < 3; shift++) {
    agree();
    must(store().activate(workplace().revision));
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++)
      store().tick(5, kgPerTick, false);
    if (shift < 2) must(store().nextCampaignShift());
  }
}
const holders = () => useGameSimulationStore.getState().clockHolds.map((h) => h.holder);

describe('review 2, finding 4: a season start ends only the player’s own pause', () => {
  it('the Step widget leaves a tour hold in place and ends the player’s pause', () => {
    fulfilFirstDelivery();
    useGameSimulationStore.getState().holdClock('tour');
    useGameSimulationStore.getState().setGameSpeed(0);
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' }));
    expect(workplace().campaign).not.toBeNull();
    expect(holders()).toContain('tour');
    expect(holders()).not.toContain('player');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  it('with only the player’s pause, the season starts the clock at standard pace', () => {
    fulfilFirstDelivery();
    useGameSimulationStore.getState().setGameSpeed(0);
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start 3-shift cooperative season (1x)' }));
    expect(holders()).toEqual([]);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
  });

  it('the Overview card leaves a SCADA hold in place', () => {
    fulfilFirstDelivery();
    useGameSimulationStore.getState().holdClock('scada');
    render(<OperationsPlayCard />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Start 3-shift cooperative season on this order (1x)' })
    );
    expect(workplace().campaign).not.toBeNull();
    expect(holders()).toContain('scada');
  });
});

describe('review 2, finding 6: the chair dropdown sends what it shows', () => {
  it('after a first ballot, a new pick is shown and cast', () => {
    fulfilFirstDelivery();
    must(store().startCampaign('cooperative', 17));
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    const select = screen.getByLabelText('Packing backs') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'maintenance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cast Packing’s ballot' }));
    expect(workplace().chairBallots.packing).toBe('maintenance');
    fireEvent.change(select, { target: { value: 'quality' } });
    expect(select.value).toBe('quality');
    fireEvent.click(screen.getByRole('button', { name: 'Cast Packing’s ballot' }));
    expect(workplace().chairBallots.packing).toBe('quality');
  });
});

describe('review 2, finding 2: a held "Share the surplus" says why', () => {
  it('shows the refusal’s own wording at the button', () => {
    finalReview('toe-dip');
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    const share = screen.getByRole('button', { name: /^Share the (surplus|sobras)$/ });
    fireEvent.click(share);
    const alert = screen.getByRole('alert');
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(share.getAttribute('aria-describedby')).toBe(alert.id);
  });
});

describe('review 2, finding 2: archiving an unshared surplus says why', () => {
  it('the archive button answers with the refusal’s own wording', () => {
    finalReview('cooperative');
    const onFresh = vi.fn();
    render(<WorkplaceCampaignArchive onFreshExercise={onFresh} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    );
    expect(screen.getByRole('status')).toHaveTextContent('Share the season’s surplus first.');
    expect(onFresh).not.toHaveBeenCalled();
    expect(store().completedCampaigns).toHaveLength(0);
  });
});

describe('review 2, finding 8: no number about a member, no helper text', () => {
  it('the role rows carry no reason line and the heading no instruction sentence', () => {
    fulfilFirstDelivery();
    must(store().startCampaign('toe-dip', 17));
    agree();
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    const table = screen.getByRole('table', { name: 'Who has answered' });
    for (const role of ['quality', 'maintenance', 'coordinator', 'mind']) {
      const header = within(table.querySelector(`[data-role="${role}"]`) as HTMLElement).getByRole(
        'rowheader'
      );
      expect(header.querySelector('span.block')).toBeNull();
      // What shows instead: each row's answers, in its cells.
      expect(
        within(table.querySelector(`[data-role="${role}"]`) as HTMLElement).getAllByRole('cell')
      ).toHaveLength(3);
    }
    // The heading is the season's beat; no instruction sentence follows it.
    const heading = document.querySelector('[data-step-focus]')!;
    expect(heading.textContent?.length).toBeGreaterThan(0);
    expect(screen.queryByText('Approve the plan when you choose.')).toBeNull();
    // The step is the control itself.
    expect(screen.getByRole('button', { name: /^Approve / })).toBeInTheDocument();
  });

  it('the debrief shows the pool split by destination, never an amount per role', () => {
    finalReview('cooperative');
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
    render(<WorkplaceAutoplayStatus />);
    const debrief = screen.getByRole('complementary');
    const text = debrief.textContent ?? '';
    for (const member of workplace().members)
      expect(text).not.toMatch(new RegExp(`${member.role} \\d`));
    const sobras = workplace().sobras!;
    expect(text).toContain(sobras.remainder.toFixed(2));
    expect(text).toContain(sobras.reserve.toFixed(2));
    expect(text).toContain(sobras.fates.toFixed(2));
  });
});

describe('review 2, finding 9: refusals show wherever they are given', () => {
  it('a Resolve refused during review says why', () => {
    fulfilFirstDelivery();
    must(store().startCampaign('toe-dip', 17));
    agree();
    must(store().activate(workplace().revision));
    store().tick(5, 0, false);
    must(store().object('packing', 'rest'));
    expect(workplace().phase).toBe('review');
    const refusal: WorkplaceTransitionResult = {
      changed: false,
      reason: 'Restate the terms first.',
    };
    act(() => useWorkplaceStore.setState({ resolveObjection: () => refusal }));
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve the rest objection: Packing' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Restate the terms first.');
  });

  it('a refused understanding-check answer says why', () => {
    fulfilFirstDelivery();
    must(store().startCampaign('toe-dip', 17));
    const refusal: WorkplaceTransitionResult = {
      changed: false,
      reason: 'That answer was refused.',
    };
    act(() => useWorkplaceStore.setState({ answerCheck: () => refusal }));
    render(<WorkplaceStep activate={async () => null} busy={false} />);
    const q = WORKPLACE_CHECKS.find((c) => c.id === requiredChecks('packing')[0])!;
    fireEvent.change(screen.getByLabelText(q.prompt), { target: { value: q.correct } });
    expect(screen.getByRole('alert')).toHaveTextContent('That answer was refused.');
  });
});
