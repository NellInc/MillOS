import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { setLocale } from '../i18n';
import { alertText } from '../i18n/alertCopy';

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useUIStore.setState({ alerts: [] });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  vi.useRealTimers();
  setLocale('en');
});

// A load that fails quality marks the season's commitment for good, so no
// later shift can be approved. The automatic season stopped on the joined
// readiness text, filed in English only, and told the player to run it again,
// which stops the same way.
describe('a season whose commitment failed quality stops with a keyed, final notice (pass seventeen)', () => {
  it('names the commitment, follows a language switch and offers no restart', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(400);
    const season = useWorkplaceStore.getState().workplace;
    expect(season.phase).toBe('deliberating');
    const orderId = season.campaign!.mission!.orderId;
    useOperationsCampaignStore.setState((state) => ({
      orders: state.orders.map((order) =>
        order.id === orderId ? { ...order, qualityFailureKg: 120 } : order
      ),
    }));
    // The plant tick observes the failed load on the linked order.
    useWorkplaceStore.getState().tick(0.1, 0, false);
    expect(useWorkplaceStore.getState().workplace.campaign?.mission?.evidence).toBe(
      'quality-failed'
    );
    vi.advanceTimersByTime(60_000);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    const stopped = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.message).not.toMatch(/To run it again/);
    expect(stopped!.message).toMatch(/Leave this season/);
    setLocale('pt-BR');
    const pt = alertText(stopped!).message;
    expect(pt).toMatch(/Sair desta temporada/);
    expect(pt).not.toMatch(/Para rodá-la de novo/);
  });
});
