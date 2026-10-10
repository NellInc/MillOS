import type {
  CustomerOrder,
  DispatchLoadSnapshot,
  OrderExecutionState,
} from '../../../stores/operationsCampaignStore';

interface DeliveryJourney {
  title: string;
  detail: string;
  workspace: 'overview' | 'scada' | null;
  entryId: string;
  loading?: Pick<DispatchLoadSnapshot, 'loadedKg' | 'capacityKg'>;
}

export function deriveDeliveryJourney(
  order: CustomerOrder | null,
  execution: OrderExecutionState,
  inspected: boolean
): DeliveryJourney {
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
  const load = execution.dispatchLoad;
  const departureRule = `Only a departed manifest credits this customer; packed ${finishedMaterial} alone does not.`;
  if (execution.stage === 'ready_to_load')
    return {
      title: 'Ready for the shipping truck',
      detail: `${load.blockReason ?? `${execution.releasedFinishedKg.toFixed(0)} kg of released ${finishedMaterial} is waiting at shipping.`} ${departureRule}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  if (execution.stage === 'loading' || execution.stage === 'ready_to_dispatch')
    return {
      title: execution.stage === 'loading' ? 'Loading the shipping truck' : 'Ready to depart',
      detail: `${load.blockReason ?? (execution.stage === 'loading' ? 'Follow the pallets from the packing line to the docked truck.' : 'The outbound load is ready. Watch its departure from the shipping bay.')} ${departureRule}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
      // Truck capacity is distinct from the customer's full commitment.
      // This projection never credits cargo, changes the load or dispatches it.
      loading: { loadedKg: load.loadedKg, capacityKg: load.capacityKg },
    };
  if (execution.stage === 'dispatched')
    return {
      title: 'Truck departed',
      detail: `${load.lastDispatchKg.toFixed(0)} kg left the shipping bay. Customer receipt: ${order.shippedKg.toFixed(0)} / ${order.requiredKg.toFixed(0)} kg for ${order.customer}. ${departureRule}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  return {
    title: 'Follow the grain',
    detail: `Source inventory: ${execution.sourceInventoryKg.toFixed(0)} kg. Released ${finishedMaterial}: ${execution.releasedFinishedKg.toFixed(0)} kg. Open operations to check the line setpoint and any shortage.`,
    workspace: 'scada' as const,
    entryId: 'autonomous-material-flow',
  };
}
