import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { WorkplaceAutoplayStatus } from './WorkplaceParticipation';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { campaignOutcomes } from '../../../simulation/workplaceCampaign';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useWorkplaceAutoplay.setState({ manual: false, resumeProfile: null, message: null });
  endReplayClock();
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useAnnouncementsStore.getState().setContext({ onboarding: false });
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
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

const workplace = () => useWorkplaceStore.getState().workplace;

/**
 * The runner steps every 400 ms; the plant's tick advances the season through
 * the store's tick, the path UnifiedGameTick uses (five plant minutes a step).
 */
function play(until: () => boolean, steps = 3000) {
  for (let i = 0; i < steps && !until(); i++)
    act(() => {
      vi.advanceTimersByTime(400);
      const s = workplace();
      if (s.phase === 'active' || s.members.some((m) => m.recoveryOwedMinutes > 0))
        useWorkplaceStore.getState().tick(5, 0, false);
    });
  expect(until()).toBe(true);
}

// 5.10: the default season returns. After the first delivery the first one
// arrives by itself; once it has run to its end and is archived, a second
// arrives by itself, on its own seed. The store's refusal before the first
// delivery still holds.
it('a second default season arrives by itself once the first is archived', () => {
  render(<WorkplaceAutoplayStatus />);
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(workplace().phase).toBe('idle');
  expect(useWorkplaceStore.getState().startMission('toe-dip', 1).reasonCopy?.key).toBe(
    'firstDeliveryFirst'
  );
  act(() => fulfilFirstDelivery());
  play(() => workplace().campaign !== null);
  const first = workplace().seed;
  play(() => !useWorkplaceAutoplay.getState().running && workplace().campaign?.shift === 2);
  expect(campaignOutcomes(workplace()).agreement.status).toBe('honoured');
  act(() => {
    expect(useWorkplaceStore.getState().archiveCampaign(workplace().revision).changed).toBe(true);
  });
  expect(useWorkplaceStore.getState().completedCampaigns).toHaveLength(1);
  play(() => workplace().campaign !== null, 10);
  expect(useWorkplaceAutoplay.getState().running).toBe(true);
  expect(workplace().campaign?.shift).toBe(0);
  expect(workplace().seed).not.toBe(first);
});
