import type {
  CustomerOrder,
  DispatchLoadSnapshot,
  OrderExecutionState,
} from '../../../stores/operationsCampaignStore';
import { formatFixed, translate } from '../../../i18n';
import { deliveryJourneyMessages as m } from './deliveryJourney.messages';

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
  if (remaining === 0) return { label: translate(m, 'dueNow'), overdue: false };
  const minutes = Math.ceil(Math.abs(remaining));
  const hours = Math.floor(minutes / 60);
  const duration = hours
    ? translate(m, 'durationHours', {
        hours: formatFixed(hours, 0),
        minutes: formatFixed(minutes % 60, 0),
      })
    : translate(m, 'durationMinutes', { minutes: formatFixed(minutes, 0) });
  return {
    label: translate(m, remaining < 0 ? 'overdueBy' : 'dueIn', { duration }),
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
      title: translate(m, 'chooseTitle'),
      detail: translate(m, 'chooseDetail'),
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  const product = order.recipe.label;
  const qualityTarget = translate(m, 'qualityTarget', {
    minimum: formatFixed(order.recipe.minimumQuality, 0),
  });
  // A real fulfilment is never hidden behind the inspection lesson. Working if
  // a fulfilled order reads 'Delivery fulfilled' with or without an inspection,
  // and an open order still starts at 'Inspect the line'.
  if (order.status === 'fulfilled')
    return {
      title: translate(m, 'fulfilledTitle'),
      detail: translate(m, 'fulfilledDetail', {
        kg: formatFixed(order.shippedKg, 0),
        product,
        customer: order.customer,
      }),
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  if (!inspected)
    return {
      title: translate(m, 'inspectTitle'),
      view: 'Milling',
      detail: translate(m, 'inspectDetail'),
      workspace: null,
      entryId: 'bottlenecks-and-buffers',
    };
  if (execution.orderId !== order.id)
    return {
      title: translate(m, 'returnTitle'),
      detail: translate(m, 'returnDetail'),
      workspace: 'overview' as const,
      entryId: 'community-commitments',
    };
  if (execution.stage === 'quality_hold')
    return {
      title: translate(m, 'checkTitle', { product }),
      view: 'Packing',
      detail: translate(m, 'qualityHoldDetail', { qualityTarget }),
      workspace: 'overview' as const,
      entryId: 'batch-quality',
    };
  const load = execution.dispatchLoad;
  const departureRule = translate(m, 'departureRule', { product });
  // The feed budget stops the line once the rest of the order is packed, so the
  // header reads 0 bags/h. Working if that idle line is explained, not a freeze.
  const packedRest =
    execution.remainingKg > 0 && execution.finishedAvailableKg >= execution.remainingKg - 1
      ? translate(m, 'packedRest')
      : '';
  if (execution.stage === 'ready_to_load') {
    const waiting =
      load.blockReason ??
      translate(m, 'releasedWaiting', {
        kg: formatFixed(execution.releasedFinishedKg, 0),
        product,
      });
    return {
      title: translate(m, 'readyToLoadTitle'),
      view: 'Shipping',
      detail: `${waiting} ${qualityTarget} ${departureRule}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  }
  if (execution.stage === 'loading' || execution.stage === 'ready_to_dispatch') {
    const step =
      load.blockReason ??
      translate(m, execution.stage === 'loading' ? 'loadingDetail' : 'readyToDepartDetail');
    return {
      title: translate(m, execution.stage === 'loading' ? 'loadingTitle' : 'readyToDepartTitle'),
      view: 'Shipping',
      detail: `${step} ${qualityTarget} ${departureRule}${packedRest}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
      // Truck capacity is distinct from the customer's full commitment.
      // This projection never credits cargo, changes the load or dispatches it.
      loading: { loadedKg: load.loadedKg, capacityKg: load.capacityKg },
    };
  }
  if (execution.stage === 'dispatched') {
    const receipt = translate(m, 'departedDetail', {
      lastKg: formatFixed(load.lastDispatchKg, 0),
      shippedKg: formatFixed(order.shippedKg, 0),
      requiredKg: formatFixed(order.requiredKg, 0),
      customer: order.customer,
    });
    return {
      title: translate(m, 'departedTitle'),
      view: 'Shipping',
      detail: `${receipt} ${qualityTarget} ${departureRule}${packedRest}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  }
  // Explain this customer's real preparation and flow; never equate the
  // setpoint with measured output. Working if both recipes show their own grain,
  // target and released stock without advancing production or customer credit.
  const grain = translate(m, 'grain', { material: order.recipe.sourceMaterial });
  // This is the campaign recipe's quality score, never a physical assay or yield.
  // Working if each selected recipe names its own release threshold read-only.
  const quality = translate(m, 'qualityRule', { qualityTarget });
  // Customer switching retains the previous execution snapshot until a tick.
  // Working if paused preparation names the recipe without claiming stale stock.
  if (execution.stage === 'planning')
    return {
      title: translate(m, 'prepareTitle', { product: order.recipe.label }),
      view: 'Milling',
      detail: translate(m, 'planningDetail', { grain, quality }),
      workspace: 'scada' as const,
      entryId: 'autonomous-material-flow',
    };
  return {
    title: translate(m, 'followTitle'),
    view: 'Milling',
    detail: translate(m, 'followDetail', {
      sourceKg: formatFixed(execution.sourceInventoryKg, 0),
      grain,
      setpoint: formatFixed(execution.lineSetpointPercent, 0),
      product,
      releasedKg: formatFixed(execution.releasedFinishedKg, 0),
      quality,
    }),
    workspace: 'scada' as const,
    entryId: 'autonomous-material-flow',
  };
}
