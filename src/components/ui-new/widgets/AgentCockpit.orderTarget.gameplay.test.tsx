import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { setLocale } from '../../../i18n';

// The cockpit opens on "activate order", aimed at the first order listed. That
// is the order already in hand on a fresh plant, and after a programme the
// oldest kept order is fulfilled: either way the default command could only be
// refused (or, before the kernel refused it, verified while doing nothing).
// Every other target list offers only what its command can act on.
// Working if the default order target is an open order other than the current one.
describe('agent cockpit order targets', () => {
  const removals: Array<() => void> = [];
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    cleanup();
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
  });

  const offered = () =>
    Array.from((screen.getByLabelText('Order Uri') as HTMLSelectElement).options).map(
      (option) => option.value
    );

  it('does not offer the order already in hand', () => {
    const current = useOperationsCampaignStore.getState().activeOrderId!;
    render(<AgentCockpit />);
    expect((screen.getByLabelText('Order Uri') as HTMLSelectElement).value).not.toBe(
      `millos://order/${current}`
    );
    expect(offered()).not.toContain(`millos://order/${current}`);
  });

  it.each(['fulfilled', 'cancelled'] as const)('does not offer a %s order', (status) => {
    const campaign = useOperationsCampaignStore.getState();
    const [closed, open] = campaign.orders.filter((order) => order.id !== campaign.activeOrderId);
    expect(open).toBeTruthy();
    useOperationsCampaignStore.setState((state) => ({
      orders: state.orders.map((order) => (order.id === closed.id ? { ...order, status } : order)),
    }));
    render(<AgentCockpit />);
    expect(offered()).not.toContain(`millos://order/${closed.id}`);
    expect(offered()).toContain(`millos://order/${open.id}`);
  });
});
