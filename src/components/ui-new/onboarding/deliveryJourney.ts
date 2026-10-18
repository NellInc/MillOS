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
  view?: 'Milling' | 'Packing' | 'Shipping';
  loading?: Pick<DispatchLoadSnapshot, 'loadedKg' | 'capacityKg'>;
}

/** Read-only customer deadline, in the same minutes as the campaign clock.
 * Working if replayed customers retain their own due time and finished orders
 * lose their countdown without changing order, stock or dispatch state.
 */
export function deriveDeliveryDeadline(order: CustomerOrder | null, elapsedMinutes: number) {
  if (
    !order ||
    order.status === 'fulfilled' ||
    order.status === 'cancelled' ||
    !Number.isFinite(order.dueAtMinute) ||
    !Number.isFinite(elapsedMinutes)
  )
    return null;
  const remaining = order.dueAtMinute - elapsedMinutes;
  if (remaining === 0) return { label: 'Due now (simulated)', overdue: false };
  const minutes = Math.ceil(Math.abs(remaining));
  const hours = Math.floor(minutes / 60);
  const duration = hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  return {
    label: `${remaining < 0 ? 'Overdue by' : 'Due in'} ${duration} (simulated)`,
    overdue: remaining < 0,
  };
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
  const product = order.recipe.label;
  const qualityTarget = `Recipe quality target: ${order.recipe.minimumQuality}/100.`;
  // A real fulfilment is never hidden behind the inspection lesson. Working if
  // a fulfilled order reads 'Delivery fulfilled' with or without an inspection,
  // and an open order still starts at 'Inspect the line'.
  if (order.status === 'fulfilled')
    return {
      title: 'Delivery fulfilled',
      detail: `${order.shippedKg.toFixed(0)} kg of ${product} dispatched for ${order.customer} in recorded manifests. Departed manifests credit this customer. Inspection is a separate milestone.`,
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  if (!inspected)
    return {
      title: 'Inspect the line',
      view: 'Milling',
      detail:
        'Select a silo, roller mill, plansifter or packer in the scene. Read its status and buffers before changing the line. Full output buffers can reveal a downstream bottleneck.',
      workspace: null,
      entryId: 'bottlenecks-and-buffers',
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
      title: `Check ${product}`,
      view: 'Packing',
      detail: `${qualityTarget} Review the QC batch hold in Overview. Test the affected batch and release conforming output before loading.`,
      workspace: 'overview' as const,
      entryId: 'batch-quality',
    };
  const load = execution.dispatchLoad;
  const departureRule = `Only a departed manifest credits this customer; packed ${product} alone does not.`;
  // The feed budget stops the line once the rest of the order is packed, so the
  // header reads 0 bags/h. Working if that idle line is explained, not a freeze.
  const packedRest =
    execution.remainingKg > 0 && execution.finishedAvailableKg >= execution.remainingKg - 1
      ? ' The rest of this order is already packed; the line rests until the next truck collects it.'
      : '';
  if (execution.stage === 'ready_to_load')
    return {
      title: 'Ready for the shipping truck',
      view: 'Shipping',
      detail: `${load.blockReason ?? `${execution.releasedFinishedKg.toFixed(0)} kg of released ${product} is waiting at shipping.`} ${qualityTarget} ${departureRule}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  if (execution.stage === 'loading' || execution.stage === 'ready_to_dispatch')
    return {
      title: execution.stage === 'loading' ? 'Loading the shipping truck' : 'Ready to depart',
      view: 'Shipping',
      detail: `${load.blockReason ?? (execution.stage === 'loading' ? 'Follow the pallets from the packing line to the docked truck.' : 'The outbound load is ready. Watch its departure from the shipping bay.')} ${qualityTarget} ${departureRule}${packedRest}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
      // Truck capacity is distinct from the customer's full commitment.
      // This projection never credits cargo, changes the load or dispatches it.
      loading: { loadedKg: load.loadedKg, capacityKg: load.capacityKg },
    };
  if (execution.stage === 'dispatched')
    return {
      title: 'Truck departed',
      view: 'Shipping',
      detail: `${load.lastDispatchKg.toFixed(0)} kg left the shipping bay. Customer receipt: ${order.shippedKg.toFixed(0)} / ${order.requiredKg.toFixed(0)} kg for ${order.customer}. ${qualityTarget} ${departureRule}${packedRest}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  // Explain this customer's real preparation and flow; never equate the
  // setpoint with measured output. Working if both recipes show their own grain,
  // target and released stock without advancing production or customer credit.
  const grain = order.recipe.sourceMaterial.replace('_', ' ');
  // This is the campaign recipe's quality score, never a physical assay or yield.
  // Working if each selected recipe names its own release threshold read-only.
  const quality = `${qualityTarget} Conforming output must pass QC before loading.`;
  // Customer switching retains the previous execution snapshot until a tick.
  // Working if paused preparation names the recipe without claiming stale stock.
  if (execution.stage === 'planning')
    return {
      title: `Prepare ${order.recipe.label}`,
      view: 'Milling',
      detail: `Scheduled grain: ${grain}. ${quality} Resume the shift to refresh this customer's stock and line setpoint.`,
      workspace: 'scada' as const,
      entryId: 'autonomous-material-flow',
    };
  return {
    title: 'Follow the grain',
    view: 'Milling',
    detail: `Source inventory: ${execution.sourceInventoryKg.toFixed(0)} kg of ${grain}. Line setpoint: ${execution.lineSetpointPercent.toFixed(0)}%. Released ${product}: ${execution.releasedFinishedKg.toFixed(0)} kg. ${quality} Open SCADA for live line telemetry, or select a machine to read its buffers.`,
    workspace: 'scada' as const,
    entryId: 'autonomous-material-flow',
  };
}
