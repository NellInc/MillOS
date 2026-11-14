import { useEffect } from 'react';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useUIStore } from '../../../stores/uiStore';
import { onRestoreFinished, restoreFinishedThisPage } from '../../../systems/restoreLatch';
import { showJourneyCompact } from '../onboarding/PlayableShift';

// One restore per page load, so one reorientation: a remount never repeats it.
let reorientedThisPage = false;
/** Test seam: a new page. */
export const resetReorientation = () => {
  reorientedThisPage = false;
};

function reorient(): void {
  if (reorientedThisPage) return;
  reorientedThisPage = true;
  const ui = useUIStore.getState();
  if (ui.journeyVisible || !ui.hasSeenIntro) return;
  const campaign = useOperationsCampaignStore.getState();
  const order = campaign.orders.find((item) => item.id === campaign.activeOrderId);
  if (!order || order.status === 'fulfilled' || order.status === 'cancelled') return;
  useUIStore.setState({ journeyVisible: true, journeyOrderId: order.id });
  showJourneyCompact(order.id);
}

/**
 * A returning player is told what was in progress. Once a saved shift has
 * finished restoring, with an order open and no guide on screen, the guide
 * opens compact on that order, once. The inspection record is kept: the
 * player already had the opening lesson, and wiping it would start one again.
 * Not before a tour still to come (it opens the guide itself), and never in a
 * benchmark run, which restores nothing. The operational UI can mount before
 * or after the restore finishes; either way it runs once.
 * Working if a reload mid-order shows the compact guide naming the order once,
 * and closing it keeps it closed.
 */
export function useReorientAfterRestore(): void {
  useEffect(() => {
    if (reorientedThisPage) return;
    if (restoreFinishedThisPage()) {
      reorient();
      return;
    }
    return onRestoreFinished(reorient);
  }, []);
}
