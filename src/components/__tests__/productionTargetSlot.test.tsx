import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductionTargetWidget } from '../ProductionTargetWidget';
import { targetSlotHeld } from '../productionTargetSlot';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useUIStore } from '../../stores/uiStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';

// The card and the T notice read one predicate. Working if, for every
// combination of the four holders, the notice's reading (targetSlotHeld) says
// "held" exactly when the card renders nothing.
describe('the target card slot predicate', () => {
  afterEach(() => {
    cleanup();
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    useMobileControlStore.setState({ mobilePanelVisible: false });
    useAnnouncementsStore.getState().setContext({ onboarding: false });
    useUIStore.getState().setJourneyVisible(false);
  });

  it('agrees with what the card shows for every holder combination', () => {
    useAIConfigStore.getState().setShowProductionTarget(true);
    for (let mask = 0; mask < 16; mask += 1) {
      useAnnouncementsStore.getState().setContext({ onboarding: !!(mask & 1) });
      useUIStore.getState().setJourneyVisible(!!(mask & 2));
      useMobileControlStore.setState({ mobilePanelVisible: !!(mask & 4) });
      useWorkplaceStore.setState({
        workplace:
          mask & 8 ? { ...createWorkplace(), mode: 'game', phase: 'active' } : createWorkplace(),
      });
      const { container, unmount } = render(<ProductionTargetWidget />);
      expect({ mask, held: targetSlotHeld() }).toEqual({
        mask,
        held: container.firstChild === null,
      });
      expect(targetSlotHeld()).toBe(mask !== 0);
      unmount();
    }
  });
});
