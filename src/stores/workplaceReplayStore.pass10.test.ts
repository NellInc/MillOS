import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceReplayStore } from './workplaceReplayStore';
import { useWorkplaceStore, workplaceReasonText } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useSafetyStore } from './safetyStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { setLocale } from '../i18n';

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(() => setLocale('en'));

// Before the scene has mounted every part a replay restores, Capture says what
// it is waiting for. Working if it names the parts in words, in the language
// active now, never as internal registration ids.
describe('a capture that waits for the scene (pass ten)', () => {
  it('names the missing parts in words, in either language', () => {
    const result = useWorkplaceReplayStore.getState().capture(17);
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/^Wait for the complete local scene: /);
    expect(result.reason).not.toMatch(/forklift:|forklift-|machine-metrics|app-controls/);
    expect(result.reason).toContain('forklift 1');
    setLocale('pt-BR');
    const portuguese = workplaceReasonText(result)!;
    expect(portuguese).toMatch(/^Aguarde a cena local completa: /);
    expect(portuguese).toContain('empilhadeira 1');
    expect(portuguese).not.toMatch(/forklift/);
  });
});
