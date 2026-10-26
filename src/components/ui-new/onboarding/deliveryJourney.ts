import type {
  CustomerOrder,
  DispatchLoadSnapshot,
  OrderExecutionState,
} from '../../../stores/operationsCampaignStore';
import { CAMPAIGN_MASS_EPSILON_KG } from '../../../simulation/operationsPlay';
import { formatFixed, translate } from '../../../i18n';
import { dispatchBlockText } from '../../../stores/dispatchBlockText';
import { deliveryJourneyMessages as m } from './deliveryJourney.messages';

interface DeliveryJourney {
  title: string;
  detail: string;
  workspace: 'overview' | 'scada' | null;
  entryId: string;
  view?: 'Milling' | 'Packing' | 'Shipping';
  loading?: Pick<DispatchLoadSnapshot, 'loadedKg' | 'capacityKg'>;
  /** Overview should land on this section when the guide opens it. */
  focus?: 'maintenance';
  /** The opening lesson: the card offers a keyboard route to inspect a machine. */
  inspect?: true;
}

/** The oldest open work order, as the guide reads it; read-only. */
export interface MachineFaultView {
  machineName: string;
  workOrderId: string;
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

/** The shipping dock as the guide reads it; read-only. */
export interface ShippingTruckView {
  active: boolean;
  docked: boolean;
  nextArrivalMinutes: number;
}

/** Minimum capacity-sized loads still needed, including any undeparted load.
 * Partial departures cannot establish a trip ordinal from shipped mass alone.
 * Working if remaining-load guidance follows the same tolerance as fulfillment.
 */
function deriveTripStatus(
  order: CustomerOrder,
  load: OrderExecutionState['dispatchLoad'],
  truck: ShippingTruckView | undefined
): string {
  const capacity = load.capacityKg > 0 ? load.capacityKg : 5000;
  const leftKg = Math.max(0, order.requiredKg - order.shippedKg);
  if (leftKg <= CAMPAIGN_MASS_EPSILON_KG) return '';
  const loads = Math.ceil((leftKg - CAMPAIGN_MASS_EPSILON_KG) / capacity);
  const trip = translate(m, 'tripStatus', {
    loads,
    loadsText: formatFixed(loads, 0),
    capacity: formatFixed(capacity, 0),
    left: formatFixed(leftKg, 0),
  });
  if (!truck || truck.docked) return trip;
  return (
    trip +
    (truck.active
      ? translate(m, 'nextTruckOnWay')
      : translate(m, 'nextTruckDue', {
          minutes: formatFixed(Math.max(1, Math.ceil(truck.nextArrivalMinutes)), 0),
        }))
  );
}

export function deriveDeliveryJourney(
  order: CustomerOrder | null,
  execution: OrderExecutionState,
  inspected: boolean,
  truck?: ShippingTruckView,
  fault?: MachineFaultView | null
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
  // A stopped machine stops its part of the line, so the guide turns to the
  // repair before any delivery step. Working if a breakdown during the first
  // delivery reads 'Repair <machine>' and opens Overview at Maintenance.
  if (fault)
    return {
      title: translate(m, 'repairTitle', { machine: fault.machineName }),
      detail: translate(m, 'repairDetail', {
        machine: fault.machineName,
        workOrderId: fault.workOrderId,
      }),
      workspace: 'overview' as const,
      focus: 'maintenance' as const,
      entryId: 'predictive-maintenance',
    };
  // Inspection is the opening lesson, never a gate on the delivery itself: once
  // stock is moving toward a truck the guide narrates that instead. Working if
  // an uninspected shift still reads loading, departure and the second trip.
  const preTruck = execution.stage === 'planning' || execution.stage === 'milling';
  if (!inspected && preTruck && order.shippedKg <= 0)
    return {
      title: translate(m, 'inspectTitle'),
      view: 'Milling',
      detail: translate(m, 'inspectDetail'),
      workspace: null,
      inspect: true,
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
      detail: translate(m, 'qualityHoldDetail', {
        qualityTarget,
        reason: dispatchBlockText(execution.dispatchLoad) ?? translate(m, 'qualityHoldUnknown'),
      }),
      workspace: 'overview' as const,
      entryId: 'batch-quality',
    };
  const load = execution.dispatchLoad;
  const departureRule = translate(m, 'departureRule', { product });
  // The feed budget stops the line once the rest of the order is packed, so the
  // header reads 0 bags/h. Working if that idle line is explained, not a freeze.
  const packedRest =
    execution.remainingKg > 0 && execution.finishedAvailableKg >= execution.remainingKg - 1
      ? execution.lineCustomer
        ? translate(m, 'packedRestNext', { customer: execution.lineCustomer })
        : translate(m, 'packedRest')
      : '';
  const tripStatus = deriveTripStatus(order, load, truck);
  if (execution.stage === 'ready_to_load') {
    const waiting =
      dispatchBlockText(load) ??
      translate(m, 'releasedWaiting', {
        kg: formatFixed(execution.releasedFinishedKg, 0),
        product,
      });
    return {
      title: translate(m, 'readyToLoadTitle'),
      view: 'Shipping',
      detail: `${waiting} ${qualityTarget} ${departureRule}${tripStatus}`,
      workspace: 'scada',
      entryId: 'autonomous-logistics',
    };
  }
  if (execution.stage === 'loading' || execution.stage === 'ready_to_dispatch') {
    const step =
      dispatchBlockText(load) ??
      translate(m, execution.stage === 'loading' ? 'loadingDetail' : 'readyToDepartDetail');
    return {
      title: translate(m, execution.stage === 'loading' ? 'loadingTitle' : 'readyToDepartTitle'),
      view: 'Shipping',
      detail: `${step} ${qualityTarget} ${departureRule}${tripStatus}${packedRest}`,
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
      detail: `${receipt}${tripStatus}${packedRest} ${qualityTarget} ${departureRule}`,
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
