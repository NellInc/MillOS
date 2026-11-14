import { FIRST_ORDER_ID, useOperationsCampaignStore } from '../stores/operationsCampaignStore';

/**
 * The tour's first delivery goes out in full and the programme's next order
 * becomes active, as the campaign tick does on fulfilment. A new cooperative
 * season starts only after it (D4), so tests that start one call this first.
 * A book without the first order open (a test's own orders, or one already
 * past it) is left as it is.
 */
export function fulfilFirstDelivery(): void {
  const state = useOperationsCampaignStore.getState();
  const first = state.orders.find((order) => order.id === FIRST_ORDER_ID);
  if (!first || first.status === 'fulfilled' || first.status === 'cancelled') return;
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) =>
      order.id === FIRST_ORDER_ID
        ? { ...order, status: 'fulfilled' as const, shippedKg: order.requiredKg }
        : order.id === 'order-002'
          ? { ...order, status: 'active' as const }
          : order
    ),
    activeOrderId: 'order-002',
  });
}
