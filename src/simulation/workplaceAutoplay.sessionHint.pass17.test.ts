import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import { setLocale } from '../i18n';
import { alertText } from '../i18n/alertCopy';

let sessionId = '';
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
  sessionId = useMaterialFlowStore.getState().sessionId;
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useMaterialFlowStore.setState({ sessionId });
  vi.useRealTimers();
  setLocale('en');
});

// A plant reset gives the material a new session. The season's commitment is
// bound to the old one for good, so every approval is refused; the stop notice
// said "To run it again, open Autonomy...", which stops the same way again.
describe('a season whose plant session changed does not advise running it again (pass seventeen)', () => {
  it('the material-session stop carries no restart hint, in either language', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(400);
    expect(useWorkplaceStore.getState().workplace.campaign).not.toBeNull();
    useMaterialFlowStore.setState({ sessionId: `${sessionId}-after-reset` });
    vi.advanceTimersByTime(60_000);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    const stopped = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.message).toMatch(/^The physical material session changed/);
    expect(stopped!.message).not.toMatch(/To run it again/);
    setLocale('pt-BR');
    expect(alertText(stopped!).message).not.toMatch(/Para rodá-la de novo|Autonomia/);
  });
});
