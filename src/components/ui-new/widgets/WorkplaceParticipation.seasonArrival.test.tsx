import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace, transitionWorkplace } from '../../../simulation/bilateralWorkplace';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { WorkplaceAutoplayStatus, WorkplaceSeasonEntry } from './WorkplaceParticipation';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import {
  FIRST_ORDER_ID,
  useOperationsCampaignStore,
} from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';
import { mondayHolds } from '../../../simulation/workplaceCampaign';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({
    manual: false,
    resumeProfile: null,
    message: null,
    messageKey: null,
  });
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useAnnouncementsStore.getState().setContext({ onboarding: false });
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  vi.useFakeTimers();
  document.documentElement.dataset.millosStartupReady = 'true';
});
afterEach(() => {
  act(() => useWorkplaceAutoplay.getState().pause());
  delete document.documentElement.dataset.millosStartupReady;
  vi.useRealTimers();
});

/** The first delivery goes out in full, and the programme's next order becomes active. */
function fulfilFirstDelivery() {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) =>
      order.id === FIRST_ORDER_ID
        ? {
            ...order,
            status: 'fulfilled' as const,
            shippedKg: order.requiredKg,
            completedAtMinute: 200,
          }
        : order.id === 'order-002'
          ? { ...order, status: 'active' as const }
          : order
    ),
    activeOrderId: 'order-002',
  });
}

// D4: the season arrives as a layer after the player's own first delivery,
// never at the tour's end. Working if no season starts while order-001 is
// open, and one starts, on the next order, once it is fulfilled.
it('starts no season before the first delivery is fulfilled, and one after it', () => {
  render(<WorkplaceAutoplayStatus />);
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  // Waiting is not a refusal: the default season is still on offer.
  expect(useWorkplaceAutoplay.getState().manual).toBe(false);
  act(() => fulfilFirstDelivery());
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  expect(useWorkplaceStore.getState().workplace.campaign?.mission?.orderId).toBe('order-002');
});

it('starts no season from a player control before the first delivery either', () => {
  render(
    <WorkplaceSeasonEntry
      profile="toe-dip"
      setProfile={() => {}}
      report={() => {}}
      onStart={() => {}}
    />
  );
  expect(screen.queryByText('Play a three-shift cooperative season')).toBeNull();
  act(() => useWorkplaceAutoplay.getState().start('toe-dip'));
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  expect(useWorkplaceAutoplay.getState().messageKey).toBe('firstDeliveryFirst');
  // Refused before the runner is marked manual: the default season still comes.
  expect(useWorkplaceAutoplay.getState().manual).toBe(false);
  expect(useWorkplaceStore.getState().workplace.phase).toBe('idle');
  act(() => fulfilFirstDelivery());
  expect(screen.getByText('Play a three-shift cooperative season')).toBeInTheDocument();
});

it('carries on a season a save began before the first delivery', () => {
  // A save from before D4: the season started at the tour's end on order-001.
  // The store no longer starts one then, so the save is built as that build's
  // engine wrote it.
  const order = useOperationsCampaignStore
    .getState()
    .orders.find((item) => item.id === FIRST_ORDER_ID)!;
  const started = transitionWorkplace(useWorkplaceStore.getState().workplace, {
    type: 'startCampaign',
    args: [
      'toe-dip',
      1,
      {
        orderId: order.id,
        customer: order.customer,
        materialSessionId: useMaterialFlowStore.getState().sessionId,
        startingShippedKg: order.shippedKg,
        originalTargetKg: order.requiredKg - order.shippedKg,
        targetKg: order.requiredKg - order.shippedKg,
        observedShippedKg: order.shippedKg,
        creditedKg: 0,
        manifestIds: [...order.manifestIds],
        evidence: 'current',
      },
    ],
  });
  expect(started.changed).toBe(true);
  useWorkplaceStore.setState({ workplace: started.state });
  useWorkplaceAutoplay.setState({ manual: true, resumeProfile: 'toe-dip' });
  render(<WorkplaceAutoplayStatus />);
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  expect(useWorkplaceStore.getState().workplace.campaign?.mission?.orderId).toBe(FIRST_ORDER_ID);
});

function playSeasonToItsEnd() {
  fulfilFirstDelivery();
  for (let i = 0; i < 600; i++) {
    const result = autoplayWorkplaceStep('toe-dip');
    if (result.reasonKey === 'seasonComplete') return;
    const store = useWorkplaceStore.getState();
    if (
      store.workplace.phase === 'active' &&
      !(
        store.workplace.campaign?.shift === 1 &&
        mondayHolds(store.workplace) &&
        store.workplace.campaign.decision === null
      )
    )
      store.tick(5, 0, false);
  }
  throw new Error('The season did not reach its end');
}

// The season's end is a debrief that stays, not a notice that disappears with
// the runner. Working if it is on screen after the season ends, and again
// after a reload, until the season is archived.
it('keeps a season debrief on screen after the season ends, across a reload', async () => {
  playSeasonToItsEnd();
  const view = render(<WorkplaceAutoplayStatus />);
  const debrief = screen.getByRole('complementary', { name: 'Season debrief' });
  expect(debrief).toHaveTextContent('Community Polenta Kitchen');
  expect(screen.getByRole('button', { name: 'Read the season debrief' })).toBeInTheDocument();
  view.unmount();
  await act(async () => {
    await useWorkplaceAutoplay.persist.rehydrate();
  });
  render(<WorkplaceAutoplayStatus />);
  expect(screen.getByRole('complementary', { name: 'Season debrief' })).toBeInTheDocument();
  const store = useWorkplaceStore.getState();
  act(() => {
    expect(store.archiveCampaign(store.workplace.revision).changed).toBe(true);
  });
  expect(screen.queryByRole('complementary', { name: 'Season debrief' })).toBeNull();
});

it('names the season debrief in Portuguese', () => {
  playSeasonToItsEnd();
  setLocale('pt-BR');
  try {
    render(<WorkplaceAutoplayStatus />);
    expect(screen.getByRole('complementary', { name: 'Balanço da temporada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ler o balanço da temporada' })).toBeInTheDocument();
  } finally {
    setLocale('en');
  }
});
