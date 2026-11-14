import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';

const campaign = () => useOperationsCampaignStore.getState();
const capture = () => captureMillOSAgentState(new Date('2026-11-12T12:00:00.000Z')).domains;

// D11: an agent asking what the plant is aiming at read a daily target of
// 1,200 bags, stock nobody ordered. It reads the running programme's
// committed kilograms, as the HUD does, and nothing when no programme is open.
describe('the agent projection of the goal', () => {
  beforeEach(() => campaign().resetCampaign());
  afterEach(() => campaign().resetCampaign());

  it('carries the open programme on the campaign and no bag target on production', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) =>
        order.id === 'order-001'
          ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
          : order
      ),
    });
    const domains = capture();
    expect(domains.production).not.toHaveProperty('productionTarget');
    expect((domains.campaign as Record<string, unknown>).programme).toEqual({
      key: 'guided',
      committedKg: 18000,
      shippedKg: 6000,
      nextDueAtMinute: 360,
      late: false,
    });
  });

  it('carries no programme when none is open', () => {
    useOperationsCampaignStore.setState({
      orders: campaign().orders.map((order) => ({
        ...order,
        shippedKg: order.requiredKg,
        status: 'fulfilled' as const,
      })),
    });
    expect((capture().campaign as Record<string, unknown>).programme).toBeNull();
  });
});
