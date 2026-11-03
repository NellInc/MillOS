import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useUIStore } from '../stores/uiStore';
import { useMobileControlStore } from '../stores/mobileControlStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { workplaceOwnsGuidance } from '../simulation/workplaceImprovement';

/**
 * What holds the production target card's slot: the tour, the guided
 * delivery, a phone sheet, or a working agreement. While one does, the card
 * keeps the saved preference but shows nothing. The card and the T notice
 * both read this one predicate, so the notice cannot claim a card that did
 * not appear. Kept out of the widget module so the shortcut hook does not
 * load the card.
 */
export const isTargetSlotHeld = (holders: {
  onboarding: boolean;
  journeyVisible: boolean;
  mobilePanelVisible: boolean;
  workingAgreement: boolean;
}): boolean =>
  holders.onboarding ||
  holders.journeyVisible ||
  holders.mobilePanelVisible ||
  holders.workingAgreement;

/** The predicate read from the stores now, for event handlers. */
export const targetSlotHeld = (): boolean =>
  isTargetSlotHeld({
    onboarding: useAnnouncementsStore.getState().context.onboarding,
    journeyVisible: useUIStore.getState().journeyVisible,
    mobilePanelVisible: useMobileControlStore.getState().mobilePanelVisible,
    workingAgreement: workplaceOwnsGuidance(useWorkplaceStore.getState().workplace),
  });
