import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';

// The store leaves the order in hand alone when it is activated again (a
// loading truck's stage must not drop to planning), but the agent's preview
// allowed it: the command ran, changed nothing, and every verification (active
// id, single active order, recipe) passed on the state it already had, so the
// receipt read verified and spent a command. It is the cockpit's default
// command, aimed by default at the first order, which is the one in hand.
// Working if the preview refuses the current order and still allows another.
describe('agent activation of the order already in hand', () => {
  const removals: Array<() => void> = [];
  const api = () => window.__MILLOS_AGENT__!;
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
  });

  const preview = (orderId: string) => {
    const targetUri = `millos://order/${orderId}`;
    return api().preview(
      api().draft({
        capabilityId: 'operations.activate-order',
        targetUri,
        parameters: { orderUri: targetUri },
        reason: 'Run this order.',
      })
    );
  };

  it('refuses the order that is already active', async () => {
    const campaign = useOperationsCampaignStore.getState();
    const current = campaign.activeOrderId!;
    expect(current).toBeTruthy();
    expect(campaign.execution.orderId).toBe(current);
    const result = await preview(current);
    expect(result.status).toBe('denied');
    expect(result.problems.map((problem) => problem.code)).toContain('PRE.ORDER.NOT_CURRENT');
  });

  it('still allows switching to another open order', async () => {
    const campaign = useOperationsCampaignStore.getState();
    const other = campaign.orders.find(
      (order) =>
        order.id !== campaign.activeOrderId &&
        order.status !== 'fulfilled' &&
        order.status !== 'cancelled'
    )!;
    expect(other).toBeTruthy();
    const result = await preview(other.id);
    expect(result.status).not.toBe('denied');
    const receipt = await api().commit(result);
    expect(receipt.status).toBe('verified');
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(other.id);
  });
});
