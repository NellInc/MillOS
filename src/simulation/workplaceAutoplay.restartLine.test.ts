import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { workplaceStoreMessages } from '../stores/workplaceStore.messages';
import { createWorkplace } from './bilateralWorkplace';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import { shiftResumable } from './workplaceCampaign';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { LOCALES } from '../i18n';
import { fulfilFirstDelivery } from '../test/firstDelivery';

const clearStop = () =>
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  clearStop();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
});
afterEach(clearStop);

const workplace = () => useWorkplaceStore.getState().workplace;

describe('a season paused by a stop resumes when the line restarts, not at CLEAR', () => {
  it('waits while RESTART LINE is pending, then resumes once the line runs', () => {
    for (let i = 0; i < 400 && workplace().phase !== 'active'; i++)
      autoplayWorkplaceStep('toe-dip');
    expect(workplace().phase).toBe('active');
    useWorkplaceStore.getState().tick(30, 0, false);
    // The stop: the tick passes it as an emergency, and the units are idled.
    useGameSimulationStore.setState({
      emergencyActive: true,
      preEmergencyMachineStatuses: new Map([['rm-101', 'running']]),
    });
    useWorkplaceStore.getState().tick(5, 0, true);
    expect(shiftResumable(workplace())).toBe(true);
    // CLEAR: the interlock is released, every unit still idle until RESTART LINE.
    useGameSimulationStore.setState({ emergencyActive: false });
    for (let i = 0; i < 40; i++) autoplayWorkplaceStep('toe-dip');
    expect(workplace().phase).not.toBe('active');
    // A hand approval is refused the same way, and says what to press.
    const refused = useWorkplaceStore.getState().activate(workplace().revision);
    expect(refused.changed).toBe(false);
    expect(refused.reasonCopy?.key).toBe('restartLineFirst');
    for (const locale of LOCALES)
      expect(workplaceStoreMessages[locale].restartLineFirst).toMatch(
        /RESTART LINE|REINICIAR LINHA/
      );
    // RESTART LINE: the line runs again, and the season with it.
    useGameSimulationStore.setState({ preEmergencyMachineStatuses: new Map() });
    for (let i = 0; i < 400 && workplace().phase !== 'active'; i++)
      autoplayWorkplaceStep('toe-dip');
    expect(workplace().phase).toBe('active');
    expect(workplace().minute).toBeGreaterThanOrEqual(30);
  });
});
