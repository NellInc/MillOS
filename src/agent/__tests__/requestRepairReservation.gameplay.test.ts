import { describe, expect, it } from 'vitest';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';

// Part reservations are binding: startRepair refuses stock held for an older
// diagnosed order. The agent's preview still counted raw stock, so it passed
// 'Required parts are available' and the command was then refused on execute.
// Working if the preview refuses an order whose only free part is reserved.
describe('agent repair request and part reservations', () => {
  it('fails PRE.REPAIR.PARTS when the free part is reserved for an older order', async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'maintenance.request-repair'
    )!;
    const older = {
      id: 'wo-0001',
      breakdownId: 'bd-older',
      phase: 'diagnosed',
      openedAt: 1,
      requiredParts: ['bearings'],
    };
    const newer = {
      id: 'wo-0002',
      breakdownId: 'bd-newer',
      phase: 'awaiting_parts',
      openedAt: 2,
      requiredParts: ['bearings'],
    };
    const inspection = await handler.inspect(
      { targetUri: 'millos://breakdown/bd-newer', parameters: {} } as never,
      {
        domains: {
          maintenance: {
            activeBreakdowns: [{ id: 'bd-older' }, { id: 'bd-newer' }],
            workOrders: [older, newer],
            partsInventory: { bearings: 1, belts: 0, motors: 0, sensors: 0, filters: 0 },
          },
        },
      } as never
    );
    const parts = inspection.preconditions.find((check) => check.id === 'PRE.REPAIR.PARTS');
    expect(parts?.satisfied).toBe(false);
  });
});

// Re-activating the order already in hand is a no-op now, and the tick keeps
// an overdue current order 'late'. The verify counted only 'active' orders, so
// the agent reported a failed command for the order that is in fact current.
// Working if the current order counts as the one active order, late or not.
describe('agent order activation verify', () => {
  it('passes VERIFY.ORDER.SINGLE_ACTIVE for the current order when it is late', async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'operations.activate-order'
    )!;
    const after = {
      domains: {
        campaign: {
          activeOrderId: 'order-001',
          orders: [
            { id: 'order-001', status: 'late', recipe: { id: 'strong-white' } },
            { id: 'order-002', status: 'planned', recipe: { id: 'pasta' } },
          ],
          execution: { orderId: 'order-001', recipeId: 'strong-white' },
        },
      },
    };
    const results = await handler.verify(
      { targetUri: 'millos://order/order-001', parameters: {} } as never,
      after as never,
      after as never,
      { changed: false, activeOrderId: 'order-001' } as never
    );
    const single = results.find((result) => result.id === 'VERIFY.ORDER.SINGLE_ACTIVE');
    expect(single?.passed).toBe(true);
  });
});
