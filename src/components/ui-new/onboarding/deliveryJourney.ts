import type { CustomerOrder, OrderExecutionState } from '../../../stores/operationsCampaignStore';

export function deriveDeliveryJourney(
  order: CustomerOrder | null,
  execution: OrderExecutionState,
  inspected: boolean
) {
  if (!order)
    return {
      title: 'Choose a delivery',
      detail: 'Choose an available customer in Your shift commitment in Overview.',
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  const finishedMaterial = order.recipe.finishedMaterial;
  if (!inspected)
    return {
      title: 'Inspect the line',
      detail:
        'Select a silo, roller mill, plansifter or packer in the scene. Read its status and buffers before changing the line.',
      workspace: null,
      entryId: 'bottlenecks-and-buffers',
    };
  if (order.status === 'fulfilled')
    return {
      title: 'Delivery fulfilled',
      detail: `${order.shippedKg.toFixed(0)} kg dispatched for ${order.customer} in recorded manifests. Your inspection and the delivery are separate receipts.`,
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  if (execution.orderId !== order.id)
    return {
      title: 'Return to your commitment',
      detail:
        'A different order is active. Choose this customer in Your shift commitment in Overview to continue its live route.',
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  if (execution.stage === 'quality_hold')
    return {
      title: `Check the ${finishedMaterial}`,
      detail:
        'Review the QC batch hold in Overview. Test the affected batch and release conforming output before loading.',
      workspace: 'overview' as const,
      entryId: 'batch-quality',
    };
  if (['ready_to_load', 'loading', 'ready_to_dispatch', 'dispatched'].includes(execution.stage))
    return {
      title: 'Follow the truck',
      detail:
        execution.dispatchLoad.blockReason ??
        `Watch the shipping load in operations. Only a departed manifest credits this customer; packed ${finishedMaterial} alone does not.`,
      workspace: 'scada' as const,
      entryId: 'autonomous-logistics',
    };
  return {
    title: 'Follow the grain',
    detail: `Source inventory: ${execution.sourceInventoryKg.toFixed(0)} kg. Released ${finishedMaterial}: ${execution.releasedFinishedKg.toFixed(0)} kg. Open operations to check the line setpoint and any shortage.`,
    workspace: 'scada' as const,
    entryId: 'autonomous-material-flow',
  };
}
