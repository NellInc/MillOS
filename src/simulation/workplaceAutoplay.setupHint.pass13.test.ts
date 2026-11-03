import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
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
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  vi.useRealTimers();
  setLocale('en');
});

// With a standalone exercise (or a handoff) on the table, the automatic season
// stops at once, and its notice said "To run it again, open Autonomy and
// choose Skip guide and run fictional demo", which stops the same way again.
describe('a season that cannot start does not advise running it again (pass thirteen)', () => {
  it('the needs-a-season stop carries no restart hint, in either language', () => {
    expect(useWorkplaceStore.getState().start('game', 5).changed).toBe(true);
    expect(useWorkplaceStore.getState().stop().changed).toBe(true);
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(500);
    const stopped = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.message).toMatch(/^Automatic season demonstration needs/);
    expect(stopped!.message).not.toMatch(/To run it again/);
    setLocale('pt-BR');
    expect(alertText(stopped!).message).not.toMatch(/Para executá-la de novo|Autonomia/);
  });
});
