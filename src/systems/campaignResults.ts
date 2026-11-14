import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
// Loaded with the tick, before any restore begins, so the returning player's
// guide (hud/reorientAfterRestore) knows of a restore it mounted too late to see.
import './restoreLatch';

/** The ids of the orders still open, read before the campaign ticks. */
export function openOrderIds(): ReadonlySet<string> {
  return new Set(
    useOperationsCampaignStore
      .getState()
      .orders.filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
      .map((order) => order.id)
  );
}

/**
 * Queue the results one campaign tick produced for the HUD to show: each order
 * that was open before it and is fulfilled after it, and a graded shift closed
 * by it. Both are compared within the one tick, as announceClosedShift does, so
 * a restored save, which sets the stores before any tick, raises nothing.
 * On time follows the shift review's rule (describeOrderOutcome): delivered by
 * its due minute; past it, the late minutes round up as the card counts them.
 * Working if fulfilling order-001 queues one result naming its customer, and a
 * reload queues none.
 */
export function celebrateCampaignResults(
  openBefore: ReadonlySet<string>,
  lastReportBefore: string | undefined
): void {
  const campaign = useOperationsCampaignStore.getState();
  const game = useGameSimulationStore.getState();
  for (const order of campaign.orders) {
    if (order.status !== 'fulfilled' || !openBefore.has(order.id)) continue;
    const completed = order.completedAtMinute ?? campaign.elapsedMinutes;
    const late = completed > order.dueAtMinute + 1e-6 ? completed - order.dueAtMinute : 0;
    game.triggerCelebration('order_fulfilled', {
      customer: order.customer,
      value: Math.round(order.shippedKg),
      lateMinutes: late > 0 ? Math.max(1, Math.ceil(late)) : 0,
      // The shift review names this too (describeOrderOutcome); it is no win.
      offSpecKg: order.qualityFailureKg > 0 ? order.qualityFailureKg : 0,
    });
  }
  const report = campaign.reports.at(-1);
  if (report && report.id !== lastReportBefore && report.grade !== null)
    game.triggerCelebration('shift_complete', {
      grade: report.grade,
      shiftKey: report.shiftKey,
    });
}
